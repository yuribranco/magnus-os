# Magnus OS — Mecanismo de Atualização (design)

> Data: 2026-05-29 · Status: aprovado (decisões travadas via AskUserQuestion) · Projeto: magnus-os

## Problema

O cliente instala o Magnus OS e o produto fica **congelado na versão que ele baixou**. Quando
corrigimos um bug (ex: o `output: standalone` que travava a entrevista), o cliente **não tem como
puxar o fix** — não existe conceito de versão em lugar nenhum:

- `plugin.json` tem `version`, mas nada lê.
- O sidebar do painel mostra `v0.1` hardcoded.
- Os 3 artefatos (`plugin`, `painel`, `copy-magnus`) são `-latest.tgz`: sem número, sem changelog.
- O único "update" possível hoje é re-rodar o `install.sh` inteiro — que **re-copia o template e
  destruiria os dados da empresa**.

Resultado vivido pelo Yuri testando como cliente: bug corrigido no código, mas preso na versão velha.

## Requisitos

1. **Update em linguagem natural.** O cliente atualiza falando com o Claude Code dele
   ("Atualize o Magnus OS") — coerente com a filosofia do produto.
2. **Indicador visual no painel.** Um badge "atualização disponível" que detecta versão nova.
3. **DADOS SAGRADOS (inviolável).** Nenhuma informação do projeto/empresa pode ser perdida no
   update. Workspace nunca é tocado.
4. **Um comando atualiza tudo.** Plugin (skills) + painel de uma vez.
5. **Conserta a distribuição não-standalone** (pendência crítica): o artefato do painel hoje é o
   standalone quebrado; o updater força empacotar o painel que roda de verdade (`next start` +
   node_modules) e re-publicar.

## Regra de ouro — dados vs código

| O que | Onde | No update |
|---|---|---|
| Workspace (`contexto/`, `operacao/<campanha>/`, criativos, landings, posts, `notion.json`) | `$WS` (ex: `~/magnus-os`) | **NUNCA tocado** |
| Chave Gemini + config | `$WS/.env` | **NUNCA tocado** |
| Histórico runs/chats + estado | `$WS/.magnus-painel/` | **NUNCA tocado** |
| Plugin/skills (código) | `~/.claude/magnus-os/dist` | substituído |
| Painel (código) | `~/.claude/magnus-os/painel` | substituído |
| License-key | `~/.claude/magnus-os/license.json` | preservado |
| Config do install (ws, skillsDir) | `~/.claude/magnus-os/config.json` | preservado/atualizado |

**Regra #1 do updater:** jamais re-materializar o template sobre `$WS`. Só refresca `dist` +
`painel` e relança o painel apontando pro **mesmo `$WS`** persistido em `config.json`.

## Decisões travadas

- **Comportamento do botão (Q1):** ao clicar em "atualização disponível", o painel **injeta a frase
  natural no chat livre e dá enter automaticamente**. O próprio agente do painel (Agent SDK na
  assinatura do cliente) executa o update — e o usuário **aprende o padrão** vendo acontecer.
  (Melhor que clipboard: 1 clique + educativo.)
- **Escopo (Q2):** tudo — Peça A (update NL) + Peça B (indicador) + fundação de versão +
  conserto do empacotamento não-standalone + re-publicação dos artefatos.
- **Fonte de verdade de versão:** um `manifest.json` no bucket **público** (mesmo do `install.sh`),
  escrito pelo `release.sh` a cada publish. Zero backend novo, cacheável, não exige licença pra ler
  "qual é a última".

## Arquitetura

### Fundação — versão
- `release.sh` estampa a versão no painel (`lib/version.ts` → `export const PAINEL_VERSION`) e no
  manifest público `manifest.json`:
  ```json
  { "version": "1.1.0", "published_at": "2026-05-29T...", "changelog": "Corrige a entrevista que travava." }
  ```
- Versão vem de `plugins/magnus-os/.claude-plugin/plugin.json` (single source no repo do plugin).

### Peça A — update em linguagem natural
- **`plugins/magnus-os/bin/update.sh`** — executor idempotente, data-safe. Lê `config.json`
  (key + ws), re-valida licença (best-effort), baixa `plugin` + `painel` gated, substitui
  `dist`/`painel`, reinstala o plugin no Claude Code, relança o painel no **mesmo `$WS`**, reporta
  versão nova + changelog. NÃO toca `$WS`. Se houver run ativo, avisa.
- **`plugins/magnus-os/skills/atualizar/SKILL.md`** — skill que o agente segue ("rode o update.sh,
  preserve a empresa, reporte a versão").
- **`template/CLAUDE.md`** — seção "## Atualizar o Magnus OS" com o comando exato, pra qualquer
  agente em `$WS` (incl. o chat livre, cwd=$WS) saber o que "atualizar" significa.

### Peça B — indicador no painel
- **`lib/version.ts`** — versão local (estampada no build).
- **`app/api/update/route.ts`** — server-side: busca `manifest.json` público, compara com a local,
  devolve `{ current, latest, updateAvailable, changelog }`.
- **`lib/store.ts`** — `update` state + `chatPrefill`/`prefillChat(text, autoSend)`.
- **`components/UpdateBanner.tsx`** (ui-ux-pro-max, design cobre/Geist) — badge no rodapé do sidebar
  ("v1.0 · **atualização disponível**"); clicou → painel injeta a frase no chat livre + envia.
- **`ChatDrawer.tsx`** — consome `chatPrefill`: abre o drawer, preenche o input e dispara `send()`.
- Poll: no boot + a cada algumas horas.

### Conserto da distribuição (não-standalone)
- `next.config.ts` já sem `output: standalone` (feito). Artefato do painel = build (`.next`) +
  `node_modules` + `package.json`, rodado via `next start -p $PORT`. `release.sh` empacota isso;
  `install.sh`/`update.sh` rodam `next start` (não mais `node server.js`).
- Persistir `$WS` no `install.sh` → `config.json` (hoje não persiste).

## Fluxo de dados (update via botão)
1. Painel chama `/api/update` → vê `updateAvailable: true` → UpdateBanner aparece.
2. Cliente clica → `prefillChat("Atualize o Magnus OS para a última versão, sem perder nada da minha empresa", autoSend=true)`.
3. ChatDrawer abre, envia pro `/api/chat` → Agent SDK (cwd=$WS) lê o CLAUDE.md/skill → roda
   `bash ~/.claude/magnus-os/dist/plugins/magnus-os/bin/update.sh`.
4. `update.sh`: baixa artefatos, troca `dist`+`painel`, reinstala plugin, relança painel no mesmo
   `$WS`, reporta versão + changelog. Workspace intacto.
5. Cliente recarrega o painel (nova versão) — todos os dados lá.

## Testes
- `bin/update.test.sh` (bash): data-safety (não toca `$WS`), lê config, idempotência, fail-soft.
- `lib/version` + `/api/update` comparam semver corretamente (vitest).
- Build do painel passa (`next build` + `next start` sobe + run multi-turn — já provado).
- End-to-end manual: instala limpo → preenche empresa → publica v+1 → painel mostra badge →
  clica → atualiza → dados preservados.

## Fora de escopo (agora)
- Auto-update silencioso (sempre via Claude Code, nunca o painel sozinho).
- Rollback de versão / canais beta.
- Diferencial (delta) — re-baixa artefato inteiro (low-ticket, install único, aceitável).
