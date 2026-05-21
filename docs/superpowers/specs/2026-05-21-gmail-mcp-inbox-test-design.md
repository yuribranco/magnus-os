# /inbox-test + Gmail MCP — Design Spec

**Data:** 2026-05-21
**Status:** Aprovado pelo user, pronto pra implementação
**Próximo passo:** writing-plans → implementação
**Contexto:** Aula 2 da Imersão magnus-os (ativação de MCPs externos)

---

## Problema

O kit magnus-os já tem skills de copy (`/ba`, `/schwartz-headline`, `/humanizer`, `/competitive-scraping`, `/briefing-avatar`) mas zero integração com fontes externas de dados — `.mcp.json` tem placeholders comentados (`_gmail`, `_drive`, `_hotmart`) e nenhum MCP ativo. Sem MCP, o kit não consegue ler o inbox do operador, agendar, consultar vendas, etc.

A Aula 2 da imersão precisa demonstrar **o ciclo completo "ativar MCP + criar skill que consome ele"** num exemplo curto, didático e reutilizável. Gmail é a escolha natural: todo operador tem, OAuth é o fluxo mais comum em MCPs externos, e ler 5 emails é um teste pequeno que exercita auth + read sem precisar de write scope.

Objetivo: deixar o MCP Gmail ativo no projeto e entregar uma skill `/inbox-test` que, ao ser invocada, devolve os 5 últimos emails de `in:inbox` da conta `suporte@appaminhacasa.com.br` no formato Magnus.

## Não-objetivos

- Não enviar email, não arquivar, não labelar, não responder. Read-only nessa skill.
- Não suportar múltiplas contas Google. Uma conta (`suporte@appaminhacasa.com.br`) só.
- Não fazer triagem automática, classificação ou resumo "inteligente" dos emails. Só listagem crua.
- Não substituir a integração nativa de Gmail do Claude.ai (que o user já tem). Esse aqui é MCP local, dedicado ao projeto.
- Não ativar Drive nem Hotmart nessa rodada — fica pra próxima.

---

## Identidade e escopo da skill

**Nome:** `inbox-test`
**Localização:** `.claude/skills/inbox-test/SKILL.md`
**Padrão de invocação:** `/inbox-test` (sem argumentos no MVP)
**Idioma:** PT-BR (alinhado com default Magnus)
**Saída:** lista renderizada no chat, formato fixo (descrito abaixo)
**Side effects:** zero — apenas leitura.

**Não recebe parâmetros nessa versão.** Conta é hardcoded indireto via OAuth (o token guardado em `~/.gmail-mcp/credentials.json` pertence à `suporte@appaminhacasa.com.br`). Pra trocar a conta, user precisa rodar `auth` de novo. Decisão deliberada: skill simples, configuração externa.

---

## Arquitetura — 4 camadas

```
┌──────────────────────────────────────────────────────────────────┐
│  Camada 4 — Skill Magnus                                          │
│  /inbox-test (.claude/skills/inbox-test/SKILL.md)                 │
│  → orquestra chamadas ao MCP, formata output no padrão Magnus     │
└────────────┬─────────────────────────────────────────────────────┘
             │ invoca tools mcp__gmail__*
┌────────────▼─────────────────────────────────────────────────────┐
│  Camada 3 — MCP server local                                      │
│  @gongrzhe/server-gmail-autoauth-mcp via npx                      │
│  declarado em magnus-os/.mcp.json (key: "gmail")                  │
└────────────┬─────────────────────────────────────────────────────┘
             │ usa
┌────────────▼─────────────────────────────────────────────────────┐
│  Camada 2 — Credenciais OAuth no disco                            │
│  ~/.gmail-mcp/gcp-oauth.keys.json   ← credenciais do cliente      │
│  ~/.gmail-mcp/credentials.json      ← token (criado no 1º login)  │
└────────────┬─────────────────────────────────────────────────────┘
             │ obtidas via
┌────────────▼─────────────────────────────────────────────────────┐
│  Camada 1 — Google Cloud Project                                  │
│  • Gmail API ativada                                              │
│  • OAuth Client ID (tipo: Desktop app)                            │
│  • Test user: suporte@appaminhacasa.com.br                        │
└──────────────────────────────────────────────────────────────────┘
```

**Por que essas 4 camadas:** cada uma tem uma única responsabilidade, é configurável independente, e juntas formam o caminho canônico OAuth → MCP → Skill. Esse caminho se repete pra Drive, Hotmart, e qualquer MCP externo futuro — a aula ensina o **padrão**, não só o caso Gmail.

---

## Componentes

| # | Componente | Onde mora | Responsabilidade | Limites |
|---|---|---|---|---|
| 1 | **OAuth Client** | console.cloud.google.com | Emite `gcp-oauth.keys.json` (client_id + client_secret). Tipo: Desktop app. Scope: `gmail.readonly`. | Não conhece o suporte@. Não guarda token de user. |
| 2 | **Token store** | `~/.gmail-mcp/credentials.json` | Refresh token + access token da conta `suporte@`. Criado no 1º `auth`, refrescado automático. | Fora do git. Nunca commitar. |
| 3 | **MCP server `gmail`** | `npx @gongrzhe/server-gmail-autoauth-mcp` (processo filho do Claude Code) | Expõe tools: `search_emails`, `read_email`, `list_emails`, `send_email`, etc. Fala Gmail API. | Não faz business logic, só repassa pra API. |
| 4 | **Entrada `.mcp.json`** | `magnus-os/.mcp.json` | Declara MCP `gmail` (substitui placeholder `_gmail`). Sem env vars. | Não guarda secrets. |
| 5 | **Skill `/inbox-test`** | `.claude/skills/inbox-test/SKILL.md` | Workflow: `search_emails(query="in:inbox", maxResults=5)` → loop `read_email(id)` → renderiza formato Magnus. | Read-only. Nada de write. |
| 6 | **Skill Index update** | `magnus-os/CLAUDE.md` | Documenta `/inbox-test` no índice + nota "MCP gmail ativo". | — |

**Escopo OAuth — `gmail.readonly`:** decisão deliberada. Pro MVP de listar emails é suficiente, e mantém a demo de aula segura (impossível enviar/apagar por engano). Quando o sistema crescer pra write (responder, arquivar, labelar), trocar pra `gmail.modify` em outra spec.

---

## Fluxo de dados

### Setup (uma vez, antes do MCP funcionar)

```
Google Cloud Console
   │ 1. cria projeto + ativa Gmail API + cria OAuth Client (Desktop)
   ▼
gcp-oauth.keys.json (download manual via browser)
   │ 2. copia pra ~/.gmail-mcp/gcp-oauth.keys.json
   ▼
npx @gongrzhe/server-gmail-autoauth-mcp auth
   │ 3. abre browser → login suporte@appaminhacasa.com.br → consent
   ▼
~/.gmail-mcp/credentials.json (token salvo)
```

### Runtime (toda chamada `/inbox-test`)

```
User digita /inbox-test
   │
   ▼
SKILL.md carregada → Claude lê instruções
   │
   ▼
Tool mcp__gmail__search_emails
   args: { query: "in:inbox", maxResults: 5 }
   │
   ▼
MCP chama Gmail API → retorna 5 IDs
   │
   ▼ (loop por ID)
Tool mcp__gmail__read_email(id)
   → puxa From, Subject, Date, snippet
   │
   ▼
Formata output:
   [1] DE: João Silva <joao@x.com> · 21/05 14:32
       ASSUNTO: Dúvida sobre integração
       » preview de até 120 chars do snippet…
   [2] ...
```

**Observação sobre payload:** o MCP `@gongrzhe` por default retorna email completo. Pra 5 emails é gerenciável (5 chamadas leves, ~ms de overhead). Se virar 50+ no futuro, otimizar pedindo `format=metadata` na API.

---

## Formato de output (canônico)

```
📬 Inbox de suporte@appaminhacasa.com.br — 5 últimos emails

[1] DE: João Silva <joao@example.com> · 21/05 14:32
    ASSUNTO: Dúvida sobre integração
    » Oi pessoal, estou testando a API e gostaria de saber se vocês têm…

[2] DE: Maria Souza <maria@example.com> · 21/05 13:10
    ASSUNTO: Re: Proposta comercial
    » Conforme conversado, segue em anexo o documento atualizado com…

(...)
```

Regras:
- Numeração `[N]` de 1 a 5.
- Data formatada como `DD/MM HH:MM` (sem ano se for ano corrente).
- Preview do snippet até 120 chars (ellipsis se cortar).
- Encoding UTF-8 (acentuação portuguesa intacta).

---

## Error handling

| Falha | Sintoma | Skill faz |
|---|---|---|
| **MCP não subiu** | Tool `mcp__gmail__*` não disponível | Instrui: "Rode `claude mcp list` pra confirmar; se `gmail` não aparece, feche e reabra o Claude Code nesse projeto." |
| **OAuth nunca foi feito** | MCP retorna `credentials not found` | Instrui: "Rode `npx @gongrzhe/server-gmail-autoauth-mcp auth`, autentique com `suporte@appaminhacasa.com.br`, reroda `/inbox-test`." |
| **Token expirado/revogado** | API 401 / `invalid_grant` | Mesma instrução do anterior (refresh token cobre o normal; só quebra se user revogou consent no Google). |
| **Inbox vazia** | `search_emails` retorna `[]` | Mensagem amigável: "Inbox vazia ou tudo arquivado. Tente `query: in:anywhere` se quiser ver arquivados." |
| **Quota/rate limit** | 429 / `quotaExceeded` | Surface o erro raw + nota: "Gmail API tem 1B quota units/dia por projeto — improvável bater em uso normal." |

**Princípio:** skill **diagnostica e instrui**, nunca tenta auto-resolver. Setup OAuth é manual por design — esconder o passo prejudica o aprendizado da aula.

**YAGNI explícito:**
- Sem retry exponencial (Gmail API é estável).
- Sem cache local (cada chamada é fresh).
- Sem suporte multi-conta.

---

## Arquivos tocados

### Modificados

| Arquivo | Mudança |
|---|---|
| `.mcp.json` | Renomeia `_gmail` → `gmail`, substitui `@anthropic/gmail-mcp` (placeholder inexistente) por `@gongrzhe/server-gmail-autoauth-mcp`. Sem env. |
| `CLAUDE.md` | Adiciona `/inbox-test` no **Skill Index** + linha curta na descrição de MCPs ativos. |
| `.env.example` | Comentário documentando que Gmail MCP usa `~/.gmail-mcp/` (sem env, mas pro user saber onde olhar). |

### Criados

| Arquivo | Conteúdo |
|---|---|
| `.claude/skills/inbox-test/SKILL.md` | Frontmatter + instruções: `query="in:inbox"`, `maxResults=5`, loop `read_email`, formato Magnus, instruções de erro. |
| `docs/superpowers/specs/2026-05-21-gmail-mcp-inbox-test-design.md` | Esta spec. |

### Fora do git (criados manualmente pelo user no setup)

| Path | Conteúdo | Vai pro git? |
|---|---|---|
| `~/.gmail-mcp/gcp-oauth.keys.json` | Credenciais OAuth (client_id + secret) baixadas do GCP | **NÃO** |
| `~/.gmail-mcp/credentials.json` | Token gerado no 1º `auth` | **NÃO** |

### `.gitignore`

Sem mudança. Arquivos sensíveis ficam em `~/.gmail-mcp/` (fora do repo). `settings.json` já tem `Read(./.env*)` no deny.

---

## Setup passo a passo (didático — esse é o "passo a passo" da aula)

### Fase 1 — Google Cloud Console (5 min)

1. Acessa https://console.cloud.google.com/ logado com `suporte@appaminhacasa.com.br` (ou conta admin que vá administrar o projeto).
2. **Cria projeto**: `magnus-os-gmail` (ou nome que preferir).
3. Menu → **APIs & Services** → **Library** → busca "Gmail API" → **Enable**.
4. Menu → **APIs & Services** → **OAuth consent screen**:
   - User type: **External**
   - App name: `magnus-os local`
   - User support email: `suporte@appaminhacasa.com.br`
   - Developer email: `suporte@appaminhacasa.com.br`
   - Scopes: adiciona `.../auth/gmail.readonly`
   - Test users: adiciona `suporte@appaminhacasa.com.br`
5. Menu → **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID**:
   - Type: **Desktop app**
   - Name: `magnus-os-gmail-desktop`
6. Download do JSON → salva como `~/.gmail-mcp/gcp-oauth.keys.json` (cria a pasta se não existir).

### Fase 2 — MCP setup (2 min)

7. No `magnus-os/.mcp.json`, troca a entrada `_gmail` por:
   ```json
   "gmail": {
     "command": "npx",
     "args": ["-y", "@gongrzhe/server-gmail-autoauth-mcp"]
   }
   ```
8. Roda no terminal (uma vez):
   ```bash
   npx @gongrzhe/server-gmail-autoauth-mcp auth
   ```
   → browser abre → login com `suporte@appaminhacasa.com.br` → "Continue" no aviso de "app não verificado" (esperado, é desktop app em modo test) → Allow.
9. Confirma que `~/.gmail-mcp/credentials.json` foi criado.

### Fase 3 — Recarrega Claude Code (10 seg)

10. Fecha e reabre o Claude Code na pasta `magnus-os/`.
11. Roda `claude mcp list` → deve aparecer `gmail` na lista.

### Fase 4 — Testa

12. `/inbox-test` → deve listar os 5 últimos emails da inbox.

---

## Plano de validação

A skill está completa quando, na pasta `magnus-os/`:

1. **Setup limpo funciona**: seguir os passos da seção anterior (Fases 1-3) resulta em `claude mcp list` mostrando `gmail` ativo.
2. **`/inbox-test` retorna 5 emails reais** da conta `suporte@appaminhacasa.com.br` no formato canônico (numerados 1-5, com de/assunto/data/preview).
3. **Skill detecta MCP ausente**: se rodar `/inbox-test` em projeto sem MCP gmail, skill imprime instrução de re-ativação (não trava com stack trace).
4. **CLAUDE.md atualizado**: `/inbox-test` aparece no Skill Index.
5. **Spec commitada**: este arquivo está em `git log`.

---

## Decisões deliberadas (registro pra futuro reverter se precisar)

| Decisão | Por quê | Reverteria se… |
|---|---|---|
| MCP `@gongrzhe/...` em vez de placeholder `@anthropic/gmail-mcp` | Placeholder não existe no npm (404). `@gongrzhe` é maduro (1.1.11, 12 versões), auto OAuth. | Anthropic lançar MCP Gmail oficial. |
| Scope `gmail.readonly` | Demo segura de aula, MVP só precisa ler. | Skill evoluir pra responder/arquivar (Aula 3+). |
| Sem env vars no `.mcp.json` | `@gongrzhe` usa arquivo no disco (`~/.gmail-mcp/`), padrão dele. | Mudar de MCP server. |
| Skill sem parâmetros | MVP simples, conta é determinada pelo token em disco. | Quiser suportar mais de uma conta. |
| Não usar a integração Claude.ai existente | Decisão explícita do user: quer mostrar o setup do zero na aula. | Fora de contexto de aula. |
| `maxResults: 5` hardcoded | Pedido explícito do user no escopo do teste. | Se virar produto, parametrizar. |

---

## Conexões com o resto do kit

- **Padrão "skill consome MCP"**: esse é o primeiro exemplo desse padrão no kit. Quando ativar Drive e Hotmart, a mesma estrutura se repete (`.mcp.json` + skill em `.claude/skills/<nome>/`).
- **Não consome `business-brain.md`**: `/inbox-test` é puramente operacional, não gera copy. Não precisa do DNA.
- **Não interage com `/humanizer`, `/ba`, `/schwartz-headline`**: skills de copy ignoram inbox. Separação limpa.
- **Próximo passo natural (fora dessa spec)**: `/inbox-triage` — usa `/inbox-test` como base, classifica emails (lead / suporte / spam / interno) e prioriza.
