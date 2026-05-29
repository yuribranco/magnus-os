# Magnus OS — Fase 4: Instalador + distribuição gated por licença — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Um comprador com license-key instala o Magnus OS sozinho (`curl … | bash` / `npx`), sem token do GitHub vazável, com o **backend servindo o artefato gated pela licença**.

**Decisão de arquitetura (travada com Yuri 2026-05-29): backend serve o artefato.**
O instalador manda a license-key → Edge Function valida → devolve **URL assinada curta** pro tarball
do plugin (e do copy-magnus full) num **bucket privado da Supabase**. O cliente **nunca toca no
GitHub**; os repos privados (`magnus-os-plugin`, `copy-magnus`) são só a FONTE. Key revogada → sem
download. Zero token embutido.

**Architecture (fluxo):**
```
cliente roda install.sh, cola a license-key
  → POST /functions/v1/license-validate {key}  → granted?
  → POST /functions/v1/plugin-download {key, artifact:"plugin"}  → { url: <signed, TTL 5min> }
  → curl baixa o tarball → extrai p/ ~/.claude/plugins/magnus-os/
  → registra em ~/.claude/settings.json (enabledPlugins) — ou via `claude plugin`
  → materializa template/ no workspace escolhido + grava MAGNUS_SKILLS_DIR
  → grava ~/.claude/magnus-os/license.json {key}
  → guia a ANTHROPIC_API_KEY do painel
release (Yuri/CI): release.sh empacota o plugin + copy-magnus → sobe pro bucket privado
```

**Repos:** backend em `~/Documents/Magnus/magnus-os-licenca` (Supabase Portal Magnus `vbmvzmibupzpjwyrfmjs`); plugin em `~/Documents/Magnus/magnus-os-plugin`; copy full em `~/Documents/Magnus/copy-magnus`.

**Pré-requisito de pesquisa (Task 0):** confirmar como instalar um plugin a partir de um tarball
local de forma programática (sem UI `/plugin`): drop-in em `~/.claude/plugins/<name>/` + entry em
`~/.claude/settings.json enabledPlugins`, OU `claude plugin install <path>`. Validar contra docs +
o `claude plugin` CLI real (tem `install <plugin>` e `--plugin-dir`).

---

### Task 0: Confirmar mecânica de install programático (research, sem código)
- [ ] Via `claude plugin --help` + docs: o `install` aceita um path/tarball local? Há `--plugin-dir` persistente? Qual a entry exata em `settings.json` (`enabledPlugins: ["magnus-os@..."]`)? Onde os plugins instalados moram no disco? Documentar no plano antes de codar o instalador.

### Task 1: Bucket privado + release pipeline (`release.sh`)
**Files:** `magnus-os-plugin/release.sh`
- [ ] Criar bucket privado `magnus-os-artifacts` na Supabase (via Management/Storage API; `public:false`).
- [ ] `release.sh`: lê a `version` do `plugin.json`, faz `tar czf magnus-os-<version>.tgz` do dir `plugins/magnus-os`, idem `copy-magnus-<version>.tgz` do repo copy-magnus, e sobe ambos pro bucket (`storage/v1/object/magnus-os-artifacts/...`) com o service key. Idempotente (sobrescreve a versão). Também sobe um `latest.json` `{plugin_version, copy_version}`.
- [ ] Rodar 1× pra publicar a v1.0.0. Verificar que o objeto existe no bucket (privado).

### Task 2: Edge Function `plugin-download` (TDD deno)
**Files:** `magnus-os-licenca/supabase/functions/plugin-download/index.ts` + `_test`
- [ ] `handleDownload({key, artifact}, db)`: valida `artifact ∈ {plugin, copy-magnus}`; checa status da key (reusa a lógica do `license-validate`/`touch_licenca`); se `granted` → gera **signed URL** (TTL 300s) do objeto no bucket via `storage.from(...).createSignedUrl`; senão → 403. Testes: granted→url, revoked→403, not_found→403, artifact inválido→400. Fail-closed (sem url se não granted).
- [ ] Deploy `--use-api --no-verify-jwt` no projeto `vbmvzmibupzpjwyrfmjs`. Smoke: key de teste granted → recebe url → `curl` baixa o tgz.

### Task 3: Instalador `install.sh`
**Files:** `magnus-os-plugin/install.sh` (+ `bin/cli.mjs` se for via `npx`)
- [ ] Fluxo (POSIX bash, idempotente, mensagens claras):
  1. Lê a license-key (arg `--key` ou prompt; ou `MAGNUS_LICENSE_KEY`).
  2. `curl` no `license-validate` → se não `granted`, aborta com mensagem (compra/suporte).
  3. `curl` no `plugin-download` {key, artifact:plugin} → pega a signed URL → baixa+extrai pra `~/.claude/plugins/magnus-os/`.
  4. Registra o plugin (conforme Task 0 — drop-in + `enabledPlugins` no `~/.claude/settings.json` via `jq`, ou `claude plugin install`).
  5. Pergunta o diretório do workspace (default `~/magnus-os/<empresa>`), materializa o `template/` lá (contexto/operacao/CLAUDE.md/.env.example).
  6. Grava `MAGNUS_SKILLS_DIR=~/.claude/plugins/magnus-os/skills` (pro painel) — no `.env` do workspace ou num config do painel.
  7. Grava `~/.claude/magnus-os/license.json {key}` (pro hook de telemetria + futuro download do copy-magnus full).
  8. Pergunta a `ANTHROPIC_API_KEY` (opcional agora; o painel também coleta) e grava no `.env` do workspace.
  9. Mensagem final: como abrir o Claude Code no workspace (skills `/magnus-os:*`) e como subir o painel.
- [ ] Atualizar o stub `copy-magnus` (no plugin) pra baixar o full via `plugin-download {artifact:copy-magnus}` (signed URL) em vez do `git clone git@github` — fecha o gating (sem SSH/token no cliente).

### Task 4: `update` + verificação
**Files:** `install.sh` (subcomando `update`)
- [ ] `install.sh update`: re-valida a key, compara versão local vs `latest.json`, re-baixa+extrai se mudou. (Alternativa: `/plugin update` se o registro via marketplace for usado — decidir na Task 0.)
- [ ] Smoke end-to-end num HOME limpo (container/tmp HOME): key de teste → install → confirmar plugin em `~/.claude/plugins`, skills `/magnus-os:*` visíveis (`claude plugin details`), template materializado, license.json gravado. Documentar.

### Task 5: Docs + fechar
- [ ] `magnus-os-plugin/INSTALL.md` (cliente) + atualizar `DEPLOY.md` do backend com a function nova + bucket.
- [ ] Atualizar spec §3.2.3/§3.3 com o fluxo "backend serve artefato".

---

## Itens abertos
1. **Storage vs function-stream:** signed URL do Storage (recomendado, escala) vs a função devolver o tgz inline (simples, mas pesa a função). Plano assume Storage.
2. **`npx` vs `curl|bash`:** v1 = `curl … | bash` (mais simples, sem publicar no npm). `npx` como conveniência depois.
3. **Registro do plugin:** depende da Task 0 (drop-in+settings vs `claude plugin install`). Não codar o passo 4 do instalador antes de resolver.
4. **Stub copy-magnus:** trocar `git clone` → download gated (Task 3) — alinhar com o esquema de signed URL.
