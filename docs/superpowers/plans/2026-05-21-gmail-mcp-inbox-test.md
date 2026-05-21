# /inbox-test + Gmail MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ativar o MCP `gmail` (via `@gongrzhe/server-gmail-autoauth-mcp`) no projeto magnus-os e criar a skill `/inbox-test` que lista os 5 últimos emails de `in:inbox` da conta `suporte@appaminhacasa.com.br` no formato Magnus.

**Architecture:** 4 camadas — Google Cloud Project (OAuth Client tipo Desktop, scope `gmail.readonly`) → credenciais em disco (`~/.gmail-mcp/`) → MCP server local declarado em `.mcp.json` → skill markdown `.claude/skills/inbox-test/SKILL.md` que orquestra as chamadas. A skill é read-only, sem parâmetros, e diagnostica problemas de setup em vez de tentar auto-resolver.

**Tech Stack:** Markdown (skill), JSON (config MCP), Node.js/npx (MCP server). Google Cloud Console (browser). OAuth2 fluxo Desktop. Tools usadas pela skill em runtime: `mcp__gmail__search_emails`, `mcp__gmail__read_email`, `Bash` (pra diagnóstico).

**Nota sobre TDD:** o artefato principal é uma skill (prompt) + arquivos de config, não código com test framework. A validação é via **smoke tests** (Tasks 5, 10): comandos com critério de pass/fail explícito. Tasks manuais (que dependem do user agir no browser ou terminal) estão **marcadas com `[MANUAL]`** — agente que executa esse plano deve **parar e pedir confirmação** ao chegar nelas, não tentar simular.

**Spec:** `docs/superpowers/specs/2026-05-21-gmail-mcp-inbox-test-design.md`

---

## File Structure

| Arquivo | Responsabilidade | Estado |
|---|---|---|
| `.mcp.json` | Declara MCP `gmail` ativo no projeto | Modificar |
| `.claude/skills/inbox-test/SKILL.md` | Skill — workflow de leitura e formato Magnus | Criar |
| `CLAUDE.md` | Skill Index inclui `/inbox-test` + nota MCP gmail ativo | Modificar |
| `.env.example` | Comentário documentando paths do Gmail MCP | Modificar |
| `~/.gmail-mcp/gcp-oauth.keys.json` | Credenciais OAuth do GCP (fora do repo) | Criar manual |
| `~/.gmail-mcp/credentials.json` | Token gerado no 1º auth (fora do repo) | Auto-criado |
| `docs/superpowers/specs/2026-05-21-gmail-mcp-inbox-test-design.md` | Spec | Existe |
| `docs/superpowers/plans/2026-05-21-gmail-mcp-inbox-test.md` | Este plano | Existe |

---

## Task 1: Setup Google Cloud Project `[MANUAL]`

**Files:**
- Cria fora do repo: `~/.gmail-mcp/gcp-oauth.keys.json`

> **Quem executa:** o user, no browser logado em `suporte@appaminhacasa.com.br` (ou em conta admin que vá gerenciar esse projeto Google Cloud).
> **Por quê manual:** GCP não tem API pública pra criação de OAuth Client tipo Desktop — tem que ser pelo console.

- [ ] **Step 1: Abrir Google Cloud Console**

URL: https://console.cloud.google.com/
Logar com `suporte@appaminhacasa.com.br` (ou conta admin).

- [ ] **Step 2: Criar novo projeto**

Topo da tela → seletor de projeto → **NEW PROJECT**.

Nome sugerido: `magnus-os-gmail`
Organização: (deixar default)

Click **CREATE**. Aguardar ~10s até aparecer no seletor → selecionar.

- [ ] **Step 3: Ativar Gmail API**

Menu (☰) → **APIs & Services** → **Library** → busca por `Gmail API` → click no card → **ENABLE**.

Expected: tela mudou pra "Gmail API · API enabled".

- [ ] **Step 4: Configurar OAuth consent screen**

Menu (☰) → **APIs & Services** → **OAuth consent screen**.

- User Type: **External** → CREATE
- App name: `magnus-os local`
- User support email: `suporte@appaminhacasa.com.br`
- Developer contact email: `suporte@appaminhacasa.com.br`
- SAVE AND CONTINUE

Na próxima tela (Scopes):
- ADD OR REMOVE SCOPES → filtra por `gmail` → marca `https://www.googleapis.com/auth/gmail.readonly` → UPDATE
- SAVE AND CONTINUE

Na próxima tela (Test users):
- ADD USERS → digita `suporte@appaminhacasa.com.br` → ADD
- SAVE AND CONTINUE

Tela final (Summary) → BACK TO DASHBOARD.

Expected: OAuth consent screen mostra status "Testing" com 1 test user.

- [ ] **Step 5: Criar OAuth Client ID**

Menu (☰) → **APIs & Services** → **Credentials** → **+ CREATE CREDENTIALS** → **OAuth client ID**.

- Application type: **Desktop app**
- Name: `magnus-os-gmail-desktop`
- CREATE

Modal aparece com `Client ID` + `Client secret` + botão **DOWNLOAD JSON**.

Click **DOWNLOAD JSON** → arquivo baixa pra `~/Downloads/client_secret_XXX.json`.

- [ ] **Step 6: Salvar credenciais no path canônico**

Run:
```bash
mkdir -p ~/.gmail-mcp
mv ~/Downloads/client_secret_*.json ~/.gmail-mcp/gcp-oauth.keys.json
ls -la ~/.gmail-mcp/
```

Expected output:
```
-rw-r--r--  1 ...  gcp-oauth.keys.json
```

> **CHECKPOINT:** confirmar com o user que Task 1 está concluída antes de seguir.

---

## Task 2: Atualizar `.mcp.json` pra ativar gmail

**Files:**
- Modify: `.mcp.json`

- [ ] **Step 1: Ler estado atual**

Run:
```bash
cat .mcp.json
```

Expected: ver `_gmail` (com underscore) apontando pra `@anthropic/gmail-mcp`.

- [ ] **Step 2: Substituir entrada `_gmail` por `gmail` real**

Use `Edit` tool:

`old_string`:
```
    "_gmail": {
      "command": "npx",
      "args": ["-y", "@anthropic/gmail-mcp"]
    },
```

`new_string`:
```
    "gmail": {
      "command": "npx",
      "args": ["-y", "@gongrzhe/server-gmail-autoauth-mcp"]
    },
```

- [ ] **Step 3: Verificar JSON válido**

Run:
```bash
cat .mcp.json | python3 -m json.tool > /dev/null && echo "JSON OK"
```

Expected: `JSON OK`

- [ ] **Step 4: Commit**

```bash
git add .mcp.json
git commit -m "feat(mcp): ativa gmail via @gongrzhe/server-gmail-autoauth-mcp

Substitui placeholder @anthropic/gmail-mcp (que não existe no npm) pelo MCP Gmail maduro do @gongrzhe — auto OAuth, scope gmail.readonly via consent flow.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

Expected: `[master <hash>] feat(mcp): ativa gmail ...`

---

## Task 3: Rodar OAuth flow `[MANUAL]`

**Files:**
- Cria fora do repo: `~/.gmail-mcp/credentials.json`

> **Quem executa:** o user, no terminal local + browser. Bloqueia até user fazer login + consent.

- [ ] **Step 1: Rodar o comando de auth**

Run no terminal (qualquer pasta):
```bash
npx @gongrzhe/server-gmail-autoauth-mcp auth
```

Expected: terminal imprime "Loading credentials from ~/.gmail-mcp/gcp-oauth.keys.json" + abre browser automaticamente.

- [ ] **Step 2: Login no browser**

Browser abre tela do Google login.
- Logar com `suporte@appaminhacasa.com.br`.
- Tela "Google hasn't verified this app" → click **Advanced** → click **Go to magnus-os local (unsafe)** (esperado em apps Desktop no modo Testing — não é problema real).
- Tela de consent: ver que pede só `Read your email` → click **Continue**.

Expected: browser mostra "Authentication successful" ou similar.

- [ ] **Step 3: Verificar token salvo**

Run:
```bash
ls -la ~/.gmail-mcp/
```

Expected:
```
-rw-r--r--  1 ...  credentials.json
-rw-r--r--  1 ...  gcp-oauth.keys.json
```

(Ambos os arquivos presentes.)

> **CHECKPOINT:** confirmar com o user que Task 3 está concluída antes de seguir.

---

## Task 4: Reiniciar Claude Code + verificar MCP carregou

**Files:** nenhum (operacional)

- [ ] **Step 1: Fechar Claude Code completamente**

> **MANUAL:** user fecha o Claude Code (Cmd+Q no Mac, ou fecha o terminal/Cursor).

- [ ] **Step 2: Reabrir Claude Code na pasta magnus-os**

Run:
```bash
cd ~/Documents/Magnus/magnus-os
claude
```

> Alternativa: se rodando no Cursor, reabrir o terminal integrado na pasta.

- [ ] **Step 3: Listar MCPs ativos**

Run:
```bash
claude mcp list
```

Expected: output inclui linha mencionando `gmail`. Algo como:
```
gmail: npx -y @gongrzhe/server-gmail-autoauth-mcp - ✓ Connected
```

Se aparecer `✗ Failed to connect` ou `gmail` não estiver na lista, parar e diagnosticar antes de seguir. Causas comuns:
- `.mcp.json` mal formatado → re-rodar `python3 -m json.tool`
- `~/.gmail-mcp/gcp-oauth.keys.json` ausente → voltar pra Task 1.
- `~/.gmail-mcp/credentials.json` ausente → voltar pra Task 3.

> **CHECKPOINT:** confirmar com o user que `gmail` aparece como Connected.

---

## Task 5: Smoke test do MCP (sem skill ainda)

**Files:** nenhum (verificação direta)

- [ ] **Step 1: Invocar `search_emails` direto**

Na sessão Claude, executar (via tool, não como bash):
```
tool: mcp__gmail__search_emails
args: { "query": "in:inbox", "maxResults": 5 }
```

Expected: retorna array com 5 objetos (cada um com `id`, `threadId`, possivelmente `snippet`).

Se retornar `[]` → inbox da conta `suporte@appaminhacasa.com.br` está vazia. Não é erro — mas pular pra Task 6 e voltar pro smoke test final na Task 10 só faz sentido se tiver pelo menos 1 email.

Se retornar erro 401 / `invalid_grant` → voltar pra Task 3 (re-rodar auth).

- [ ] **Step 2: Pegar um ID e testar `read_email`**

Pegar `id` do primeiro objeto retornado no step anterior. Executar:
```
tool: mcp__gmail__read_email
args: { "messageId": "<id-do-step-1>" }
```

Expected: retorna objeto com headers (`From`, `Subject`, `Date`), body, snippet.

> **Nota:** o nome exato do parâmetro (`messageId` vs `id`) pode variar conforme versão do MCP. Se der erro de schema, inspecionar a documentação do tool com `claude mcp inspect gmail` ou apenas testar com `id` em vez de `messageId`. **Documentar o nome correto no SKILL.md da Task 7.**

> **CHECKPOINT:** confirmar que `read_email` retorna dados estruturados antes de seguir.

---

## Task 6: Scaffold da skill `/inbox-test`

**Files:**
- Create: `.claude/skills/inbox-test/SKILL.md`

- [ ] **Step 1: Criar pasta da skill**

Run:
```bash
mkdir -p .claude/skills/inbox-test
ls -la .claude/skills/inbox-test
```

Expected: pasta criada, vazia (`total 0`).

- [ ] **Step 2: Escrever skeleton do SKILL.md**

Write file `.claude/skills/inbox-test/SKILL.md` com este conteúdo:

````markdown
---
name: inbox-test
description: Use quando o usuário pedir pra "ler a inbox", "ver últimos emails", "checar email", "testar gmail", "/inbox-test", ou quando quiser validar que o MCP Gmail está funcionando. Lista os 5 últimos emails de in:inbox da conta autenticada (via MCP gmail) no formato Magnus. Read-only. Sem parâmetros — conta é determinada pelo token OAuth em ~/.gmail-mcp/credentials.json.
allowed-tools: mcp__gmail__search_emails, mcp__gmail__read_email, Bash
---

# /inbox-test — 5 últimos emails

## Passo 0 — Pré-flight

## Passo 1 — Buscar últimos 5 IDs

## Passo 2 — Ler cada email

## Passo 3 — Renderizar output

## Erros conhecidos

## Princípios
````

Expected: arquivo criado, headings batem com a arquitetura do spec.

- [ ] **Step 3: Verificar criação**

Run:
```bash
ls -la .claude/skills/inbox-test/
wc -l .claude/skills/inbox-test/SKILL.md
```

Expected: arquivo presente, ~15 linhas.

---

## Task 7: Preencher o conteúdo da skill

**Files:**
- Modify: `.claude/skills/inbox-test/SKILL.md`

- [ ] **Step 1: Preencher Passo 0 (pré-flight)**

Use `Edit` tool.

`old_string`:
```
## Passo 0 — Pré-flight
```

`new_string`:
```
## Passo 0 — Pré-flight

Antes de tentar ler emails, verifique se a tool `mcp__gmail__search_emails` está disponível no toolset desta sessão.

- Se a tool **não** existe: o MCP `gmail` não subiu. Imprima:
  > ❌ MCP `gmail` não está ativo nesta sessão.
  >
  > **Diagnóstico:**
  > 1. Confirma com `claude mcp list` (deve mostrar `gmail: ✓ Connected`)
  > 2. Se não aparece: fecha e reabre o Claude Code na pasta `magnus-os/` — o `.mcp.json` só carrega no boot.
  > 3. Se aparece mas com `✗ Failed`: roda `npx @gongrzhe/server-gmail-autoauth-mcp auth` no terminal pra refazer o OAuth.
  >
  > Depois reroda `/inbox-test`.

  Pare aqui. Não tente prosseguir.

- Se a tool existe: siga pro Passo 1.
```

- [ ] **Step 2: Preencher Passo 1 (search)**

`old_string`:
```
## Passo 1 — Buscar últimos 5 IDs
```

`new_string`:
```
## Passo 1 — Buscar últimos 5 IDs

Invoque a tool:

```
mcp__gmail__search_emails
args: { "query": "in:inbox", "maxResults": 5 }
```

Comportamentos esperados:

- **Array com 5 itens** → guarde os `id` (ou `threadId`, conforme schema retornado) e siga pro Passo 2.
- **Array com menos de 5 itens** → use todos os que vierem (ex: 3 emails → lista 3).
- **Array vazio** → imprima:
  > 📭 Inbox de `suporte@appaminhacasa.com.br` está vazia ou tudo já foi arquivado.
  >
  > Se quiser ver arquivados, tente: `query: "in:anywhere"` na próxima vez.

  Pare aqui.

- **Erro 401 / `invalid_grant` / `token expired`** → imprima:
  > 🔐 Token OAuth expirado ou revogado.
  >
  > Rode no terminal:
  > ```
  > npx @gongrzhe/server-gmail-autoauth-mcp auth
  > ```
  > Faz login com `suporte@appaminhacasa.com.br`, depois reroda `/inbox-test`.

  Pare aqui.

- **Outro erro (rate limit, network, etc)** → mostre o erro raw + sugira retentar em 1 minuto. Não tente auto-retry.
```

- [ ] **Step 3: Preencher Passo 2 (read)**

`old_string`:
```
## Passo 2 — Ler cada email
```

`new_string`:
```
## Passo 2 — Ler cada email

Pra cada `id` retornado no Passo 1, invoque a tool em sequência (não em paralelo — Gmail API tolera serial, e mantém ordem do output):

```
mcp__gmail__read_email
args: { "messageId": "<id>" }
```

> **Nota de compatibilidade:** o nome do parâmetro pode ser `messageId` ou `id` conforme a versão do `@gongrzhe/server-gmail-autoauth-mcp`. Se a chamada retornar erro de schema, tente o outro nome.

Pra cada response, extraia:

- **From**: header `From` (formato `"Nome Sobrenome" <email@dominio.com>` ou só `email@dominio.com`)
- **Subject**: header `Subject`
- **Date**: header `Date` (RFC 2822, ex: `Tue, 21 May 2026 14:32:08 -0300`)
- **Snippet**: campo `snippet` (preview de até ~200 chars que o Gmail já fornece)

**Se algum header faltar** (raro mas possível em emails malformados): use `(sem assunto)` / `(remetente desconhecido)` / `(sem data)` como fallback.
```

- [ ] **Step 4: Preencher Passo 3 (render)**

`old_string`:
```
## Passo 3 — Renderizar output
```

`new_string`:
```
## Passo 3 — Renderizar output

Formato canônico (não mude sem motivo):

```
📬 Inbox de suporte@appaminhacasa.com.br — 5 últimos emails

[1] DE: João Silva <joao@example.com> · 21/05 14:32
    ASSUNTO: Dúvida sobre integração
    » Oi pessoal, estou testando a API e gostaria de saber se vocês têm…

[2] DE: ...
```

Regras de formatação:

- **Numeração** `[N]` de 1 até o total retornado (1..5).
- **Data** formatada como `DD/MM HH:MM` (24h, sem ano se for ano corrente; se for ano diferente, `DD/MM/YYYY HH:MM`). Use o timezone do user (default São Paulo / UTC-3).
- **De**: nome + email se disponível; senão só email.
- **Preview** do `snippet` até **120 chars**. Se cortar, terminar com `…` (unicode ellipsis, não três pontos).
- **UTF-8** preservado (acentuação portuguesa intacta).
- **Linha em branco** entre cada item.
- **Sem preâmbulo** ("aqui estão os emails"), **sem fecho** ("espero que ajude"). Cabeçalho 📬 + lista. Pronto.
```

- [ ] **Step 5: Preencher Erros conhecidos**

`old_string`:
```
## Erros conhecidos
```

`new_string`:
```
## Erros conhecidos

| Sintoma | Causa provável | Ação |
|---|---|---|
| Tool `mcp__gmail__*` não existe | MCP não subiu (boot do Claude Code antes do `.mcp.json` ativo) | Reabrir Claude Code na pasta magnus-os |
| `credentials not found` | OAuth nunca rodou | `npx @gongrzhe/server-gmail-autoauth-mcp auth` |
| `invalid_grant` / 401 | Token revogado ou expirado | Mesmo comando do anterior |
| `quotaExceeded` / 429 | Hit rate limit (improvável em uso normal) | Esperar 1min, retentar manualmente |
| Array vazio | Inbox sem emails ou tudo arquivado | Sugerir `in:anywhere` |
| Erro de schema (`messageId` vs `id`) | Versão do MCP server diferente | Tentar o outro nome de parâmetro |
```

- [ ] **Step 6: Preencher Princípios**

`old_string`:
```
## Princípios
```

`new_string`:
```
## Princípios

- **Read-only.** Esta skill nunca envia, arquiva, labela ou responde. Se precisar fazer isso, é outra skill.
- **Diagnostica, não conserta.** Erros de setup (OAuth, MCP) viram instrução pro user, nunca tentativa de auto-fix.
- **Uma conta só.** A conta é determinada pelo token em `~/.gmail-mcp/credentials.json`. Pra trocar, user roda `auth` de novo.
- **Sem cache.** Cada `/inbox-test` é fresh hit na API. Comportamento previsível, sem stale data.
```

- [ ] **Step 7: Verificar conteúdo**

Run:
```bash
wc -l .claude/skills/inbox-test/SKILL.md
head -5 .claude/skills/inbox-test/SKILL.md
```

Expected: ~120-140 linhas, frontmatter intacto com `name: inbox-test`.

- [ ] **Step 8: Commit**

```bash
git add .claude/skills/inbox-test/SKILL.md
git commit -m "feat(skills): adiciona /inbox-test — lista 5 últimos emails via MCP gmail

Skill read-only que orquestra search_emails(in:inbox, max=5) + read_email loop, renderiza no formato Magnus. Diagnostica falhas de setup (MCP ausente, token expirado) com instruções acionáveis em vez de tentar auto-resolver.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Atualizar CLAUDE.md (Skill Index)

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Adicionar `/inbox-test` no Skill Index**

Use `Edit` tool.

`old_string`:
```
- `/humanizer` — remove cara de IA de copy existente (editor médio); aprende com feedback e cresce sozinha
```

`new_string`:
```
- `/humanizer` — remove cara de IA de copy existente (editor médio); aprende com feedback e cresce sozinha
- `/inbox-test` — lista os 5 últimos emails de `in:inbox` da conta autenticada (via MCP gmail); smoke test do MCP Gmail
```

- [ ] **Step 2: Verificar update**

Run:
```bash
grep -n "inbox-test" CLAUDE.md
```

Expected: ao menos uma linha apontando pra inserção feita.

---

## Task 9: Atualizar `.env.example`

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Ler estado atual**

Run:
```bash
cat .env.example
```

(Conteúdo atual será mostrado — anote pra preservar.)

- [ ] **Step 2: Adicionar comentário sobre Gmail MCP**

Use `Edit` tool. Adicione no final do arquivo (depois da última linha existente):

`old_string`: a última linha atual do `.env.example` (ex: se for `# MAGNUS_TOKEN=...`, use exatamente essa).

`new_string`: a mesma linha + bloco novo abaixo:
```

# === Gmail MCP (@gongrzhe/server-gmail-autoauth-mcp) ===
# Não usa env vars — credenciais ficam em arquivos no disco do user:
#   ~/.gmail-mcp/gcp-oauth.keys.json   (download do GCP OAuth Client)
#   ~/.gmail-mcp/credentials.json      (token, criado no 1º `auth`)
# Pra reativar: npx @gongrzhe/server-gmail-autoauth-mcp auth
```

> **Nota:** como não pude ler `.env.example` (deny rule `Read(./.env*)` no settings.json), o agente que executa essa task precisa rodar `cat .env.example` pelo Bash pra ver a última linha, e então usar Edit com `old_string` exato dela.

- [ ] **Step 3: Verificar update**

Run:
```bash
tail -8 .env.example
```

Expected: bloco de comentário do Gmail MCP visível.

- [ ] **Step 4: Commit (CLAUDE.md + .env.example juntos)**

```bash
git add CLAUDE.md .env.example
git commit -m "docs(magnus-os): documenta /inbox-test e paths do Gmail MCP

Adiciona /inbox-test no Skill Index do CLAUDE.md e bloco de comentário no .env.example explicando que Gmail MCP usa arquivos em ~/.gmail-mcp/ (sem env vars).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Smoke test end-to-end `[MANUAL]`

**Files:** nenhum (validação)

> **Quem executa:** user (precisa de sessão Claude Code aberta no projeto magnus-os com o MCP gmail ativo).

- [ ] **Step 1: Verificar skill registrada**

Run:
```bash
ls .claude/skills/inbox-test/SKILL.md && echo "Skill arquivo presente"
```

Expected: `Skill arquivo presente`.

- [ ] **Step 2: Invocar `/inbox-test`**

Na sessão Claude, digitar:
```
/inbox-test
```

Critérios de pass (todos devem bater):

1. **Cabeçalho** `📬 Inbox de suporte@appaminhacasa.com.br — N últimos emails` aparece (N = 1..5).
2. **Cada item numerado** `[1]`, `[2]`, ... contém `DE:`, `ASSUNTO:`, data formatada, e preview.
3. **Data formatada** `DD/MM HH:MM` (não RFC 2822 cru).
4. **Preview** corta com `…` se >120 chars.
5. **Sem preâmbulo** (não tem "Aqui estão...") e **sem fecho** (não tem "Espero que ajude...").
6. **UTF-8 intacto** se algum email tiver acento.

Se algum critério falhar: voltar pra Task 7 e ajustar o step correspondente. Re-commit.

- [ ] **Step 3: Smoke test de erro — MCP ausente**

Pra confirmar que o diagnóstico funciona:

1. Renomeie temporariamente o `.mcp.json`:
   ```bash
   mv .mcp.json .mcp.json.bak
   ```
2. Feche e reabra o Claude Code.
3. Rode `/inbox-test`.
4. Expected: skill imprime o bloco de erro do Passo 0 (`❌ MCP gmail não está ativo`), com instrução de re-ativação.
5. Restaure:
   ```bash
   mv .mcp.json.bak .mcp.json
   ```
6. Reabra Claude Code.

Critério de pass: a skill **não tenta** chamar tools que não existem — ela detecta a ausência e instrui.

> **CHECKPOINT FINAL:** confirmar com o user que Task 10 passou em todos os critérios.

---

## Resumo de commits esperados

Ao final, `git log --oneline` (desde o início desse plano) deve mostrar 3 commits novos:

```
<hash> docs(magnus-os): documenta /inbox-test e paths do Gmail MCP
<hash> feat(skills): adiciona /inbox-test — lista 5 últimos emails via MCP gmail
<hash> feat(mcp): ativa gmail via @gongrzhe/server-gmail-autoauth-mcp
```

(Plus o commit da spec, já feito antes do plano.)

---

## Notas pro agente executor

1. **Tasks `[MANUAL]`** (1, 3, parte de 4, 10): **pare e peça confirmação** do user antes de marcar como done. Não simule output do browser.
2. **Não tente rodar `npx ... auth`** pelo Bash — ele precisa de browser interativo. O user roda isso.
3. **A skill `/inbox-test` só pode ser smoke-testada (Task 10) depois do MCP estar Connected** (Task 4). Se ficar travado, é setup, não código.
4. **Wiki update**: o projeto magnus-os ainda não está em `.project-map.json` (regra do CLAUDE.md global). Não vou atualizar wiki nesse plano — é uma decisão separada que precisa de confirmação do user pra registrar.
5. **Não usar `--force` em nenhum git push.** Não delete `.env*`. Não comite `~/.gmail-mcp/*`.
