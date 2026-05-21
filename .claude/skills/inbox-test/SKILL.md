---
name: inbox-test
description: Use quando o usuário pedir pra "ler a inbox", "ver últimos emails", "checar email", "testar gmail", "/inbox-test", ou quando quiser validar que o MCP Gmail está funcionando. Lista os 5 últimos emails de in:inbox da conta autenticada (via MCP gmail) no formato Magnus. Read-only. Sem parâmetros — conta é determinada pelo token OAuth em ~/.gmail-mcp/credentials.json.
allowed-tools: mcp__gmail__search_emails, mcp__gmail__read_email
---

# /inbox-test — 5 últimos emails

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
- **Snippet**: campo `snippet` (preview bruto de até ~200 chars que o Gmail retorna — você vai truncar pra 120 no Passo 3)

**Se algum header faltar** (raro mas possível em emails malformados): use `(sem assunto)` / `(remetente desconhecido)` / `(sem data)` como fallback.

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

## Erros conhecidos

| Sintoma | Causa provável | Ação |
|---|---|---|
| Tool `mcp__gmail__*` não existe | MCP não subiu (boot do Claude Code antes do `.mcp.json` ativo) | Reabrir Claude Code na pasta magnus-os |
| `credentials not found` | OAuth nunca rodou | `npx @gongrzhe/server-gmail-autoauth-mcp auth` |
| `invalid_grant` / 401 | Token revogado ou expirado | Mesmo comando do anterior |
| `quotaExceeded` / 429 | Hit rate limit (improvável em uso normal) | Esperar 1min, retentar manualmente |
| Array vazio | Inbox sem emails ou tudo arquivado | Sugerir `in:anywhere` |
| Erro de schema (`messageId` vs `id`) | Versão do MCP server diferente | Tentar o outro nome de parâmetro |

## Princípios

- **Read-only.** Esta skill nunca envia, arquiva, labela ou responde. Se precisar fazer isso, é outra skill.
- **Diagnostica, não conserta.** Erros de setup (OAuth, MCP) viram instrução pro user, nunca tentativa de auto-fix.
- **Uma conta só.** A conta é determinada pelo token em `~/.gmail-mcp/credentials.json`. Pra trocar, user roda `auth` de novo.
- **Sem cache.** Cada `/inbox-test` é fresh hit na API. Comportamento previsível, sem stale data.
