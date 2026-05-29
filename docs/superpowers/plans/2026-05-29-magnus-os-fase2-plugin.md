# Magnus OS — Fase 2: Plugin Magnus OS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Empacotar as skills + copy + telemetria + MCP do Magnus OS num **plugin Claude Code válido, gated e auto-atualizável** (`/magnus-os:*`), eliminando o ZIP manual e o GitHub público.

**Architecture:** O produto vira **3 peças** (correção do spec §3.2, validada contra os docs oficiais 2026-05-29):
1. **Plugin Magnus OS** (`.claude-plugin/plugin.json` num repo-marketplace privado) — skills (9, namespaced), hook de telemetria/licença fail-open, `.mcp.json` (Notion/Canva), e o stub `copy-magnus`. É o que `/plugin install` entrega e `/plugin update` atualiza.
2. **Template scaffold** (`template/` no repo) — `contexto/`+`operacao/`+`CLAUDE.md`+`.env.example`. **Plugins não materializam arquivos de projeto** → o instalador (Fase 4) copia isso pro cwd do cliente. Esta fase só **prepara a fonte**.
3. **copy-magnus full** (repo GitHub `copy-magnus`) — copy-chief-black rebrandado, instalado **on-demand** pelo stub (decisão do Yuri: "bundle completo, mas no GitHub, sem pesar o plugin"). Atribuição MIT do Luca Pimenta preservada.

**Tech Stack:** Claude Code plugin spec (`.claude-plugin/`, `skills/`, `hooks/hooks.json`, `${CLAUDE_PLUGIN_ROOT}`) · Bash (hook de licença) · JSON (manifests) · Markdown (skills) · git/gh (repos privados).

**Fonte das skills:** `~/Documents/Magnus/magnus-imersao/painel-aula-4/teste-zerado/.claude/skills/` (já tem os 6 fixes de hardening + blocos `panel:`). **NÃO** usar o `magnus-orquestrador-template` antigo (pré-fixes).

**Backend já LIVE (Fase 1):** `license-validate` = `https://vbmvzmibupzpjwyrfmjs.supabase.co/functions/v1/license-validate` (POST `{key}` → `{status}`).

---

## File Structure (alvo do repo `~/Documents/Magnus/magnus-os-plugin`)

```
magnus-os-plugin/                      ← repo git privado = marketplace + plugin
├── .claude-plugin/
│   └── marketplace.json               ← torna o repo um marketplace instalável
├── plugins/
│   └── magnus-os/
│       ├── .claude-plugin/
│       │   └── plugin.json            ← manifesto do plugin (ÚNICO arquivo aqui)
│       ├── skills/                    ← skills na RAIZ do plugin (namespaced /magnus-os:*)
│       │   ├── criar-criativo/{SKILL.md,scripts/,assets/}
│       │   ├── criar-landing/SKILL.md
│       │   ├── criar-post/SKILL.md
│       │   ├── lancar-campanha/{SKILL.md,references/,assets/}
│       │   ├── checar-marca/SKILL.md
│       │   ├── preencher-empresa/SKILL.md
│       │   ├── preencher-voz/SKILL.md
│       │   ├── preencher-time/SKILL.md
│       │   ├── preencher-design/SKILL.md
│       │   └── copy-magnus/SKILL.md   ← stub /cm (instala copy-magnus full on-demand)
│       ├── hooks/
│       │   └── hooks.json             ← SessionStart → bin/validate-license.sh
│       ├── bin/
│       │   └── validate-license.sh    ← telemetria fail-open (a ÚNICA lógica real)
│       ├── .mcp.json                  ← Notion + Canva (auto-conecta)
│       ├── LICENSE                    ← MIT do Magnus OS
│       └── README.md
├── template/                          ← fonte do scaffold (instalador materializa — Fase 4)
│   ├── contexto/{EMPRESA,VOZ,TIME,DESIGN}.md + ativos/.gitkeep
│   ├── operacao/.gitkeep
│   ├── CLAUDE.md
│   └── .env.example
├── test/
│   └── validate-license.test.sh       ← suite bash do hook (TDD)
├── .gitignore
└── README.md
```

---

### Task 0: Scaffold do repo + manifestos (plugin.json + marketplace.json)

**Files:**
- Create: `~/Documents/Magnus/magnus-os-plugin/.gitignore`
- Create: `~/Documents/Magnus/magnus-os-plugin/.claude-plugin/marketplace.json`
- Create: `~/Documents/Magnus/magnus-os-plugin/plugins/magnus-os/.claude-plugin/plugin.json`
- Create: `~/Documents/Magnus/magnus-os-plugin/plugins/magnus-os/LICENSE`
- Create: `~/Documents/Magnus/magnus-os-plugin/README.md`

- [ ] **Step 1: Init repo**

```bash
mkdir -p ~/Documents/Magnus/magnus-os-plugin/{plugins/magnus-os/.claude-plugin,.claude-plugin}
cd ~/Documents/Magnus/magnus-os-plugin && git init
printf 'node_modules/\n.DS_Store\n*.log\ntest/.tmp/\n' > .gitignore
```

- [ ] **Step 2: `plugin.json`** (manifesto do plugin)

`plugins/magnus-os/.claude-plugin/plugin.json`:
```json
{
  "name": "magnus-os",
  "description": "Magnus OS — sua empresa operando dentro do Claude Code: skills de criativo, landing, post, campanha e copy.",
  "version": "1.0.0",
  "author": { "name": "Yuri Branco" },
  "homepage": "https://magnus.yuribranco.com.br",
  "license": "MIT"
}
```

- [ ] **Step 3: `marketplace.json`** (torna o repo instalável via `/plugin marketplace add`)

> O subagente DEVE validar o schema exato do `marketplace.json` contra `https://code.claude.com/docs/en/plugin-marketplaces.md` antes de finalizar (campos podem ter evoluído). Forma esperada:

`.claude-plugin/marketplace.json`:
```json
{
  "name": "magnus-os",
  "owner": { "name": "Yuri Branco" },
  "plugins": [
    {
      "name": "magnus-os",
      "source": "./plugins/magnus-os",
      "description": "Magnus OS — orquestrador empresarial para Claude Code."
    }
  ]
}
```

- [ ] **Step 4: LICENSE (MIT) + README** do plugin e do repo (1 parágrafo de propósito + "produto comercial, distribuição via instalador por licença").

- [ ] **Step 5: Commit**

```bash
cd ~/Documents/Magnus/magnus-os-plugin
git add -A && git commit -m "chore(plugin): scaffold magnus-os marketplace + plugin.json"
```

---

### Task 1: Migrar as 9 skills do `teste-zerado` → `skills/` do plugin (+ corrigir paths de script)

**Files:**
- Create: `plugins/magnus-os/skills/{criar-criativo,criar-landing,criar-post,lancar-campanha,checar-marca,preencher-empresa,preencher-voz,preencher-time,preencher-design}/` (cópia de `teste-zerado/.claude/skills/`)
- Modify: as SKILL.md que referenciam scripts por path relativo

**Contexto:** No plugin, scripts NÃO são `./.claude/skills/...` — são `${CLAUDE_PLUGIN_ROOT}/skills/...`. `contexto/` e `operacao/` continuam relativos ao **cwd** (workspace do cliente), então NÃO mudam.

- [ ] **Step 1: Copiar as skills**

```bash
SRC=~/Documents/Magnus/magnus-imersao/painel-aula-4/teste-zerado/.claude/skills
DST=~/Documents/Magnus/magnus-os-plugin/plugins/magnus-os/skills
mkdir -p "$DST"
cp -R "$SRC"/{criar-criativo,criar-landing,criar-post,lancar-campanha,checar-marca,preencher-empresa,preencher-voz,preencher-time,preencher-design} "$DST"/
```

- [ ] **Step 2: Repointar os scripts pra `${CLAUDE_PLUGIN_ROOT}`**

Substituir, em TODAS as SKILL.md copiadas, as ocorrências de `./.claude/skills/criar-criativo/scripts/` por `${CLAUDE_PLUGIN_ROOT}/skills/criar-criativo/scripts/`. Inclui o `allowed-tools:` (frontmatter) e os blocos de comando. Arquivos afetados confirmados: `criar-criativo/SKILL.md` (linhas com `gen_image.sh`/`render_html.sh`), `criar-landing/SKILL.md` (linha 4 `allowed-tools` + linha 91).

```bash
cd ~/Documents/Magnus/magnus-os-plugin/plugins/magnus-os/skills
grep -rl '\./\.claude/skills/criar-criativo/scripts/' . | while read -r f; do
  sed -i '' 's#\./\.claude/skills/criar-criativo/scripts/#${CLAUDE_PLUGIN_ROOT}/skills/criar-criativo/scripts/#g' "$f"
done
chmod +x criar-criativo/scripts/*.sh
```

- [ ] **Step 3: Verificar zero path relativo de script remanescente**

```bash
grep -rn '\./\.claude/skills' ~/Documents/Magnus/magnus-os-plugin/plugins/magnus-os/skills && echo "FALHA: ainda há path relativo" || echo "OK: nenhum path relativo de script"
```
Expected: `OK: nenhum path relativo de script`

- [ ] **Step 4: Verificar que os scripts existem e têm +x**

```bash
ls -l ~/Documents/Magnus/magnus-os-plugin/plugins/magnus-os/skills/criar-criativo/scripts/*.sh
```
Expected: `gen_image.sh` e `render_html.sh` com bit `x`.

- [ ] **Step 5: Commit**

```bash
cd ~/Documents/Magnus/magnus-os-plugin
git add -A && git commit -m "feat(plugin): migra 9 skills do teste-zerado + repointa scripts p/ CLAUDE_PLUGIN_ROOT"
```

---

### Task 2: Hook de telemetria/licença `validate-license.sh` (TDD — a única lógica real)

**Files:**
- Create: `plugins/magnus-os/bin/validate-license.sh`
- Create: `plugins/magnus-os/hooks/hooks.json`
- Test: `test/validate-license.test.sh`

**Contrato (spec §3.2.5):** SessionStart, **fail-open absoluto** (nunca bloqueia: sem key / offline / 5xx / timeout → exit 0), debounce ~1x/dia via cache TTL, registra ativação/uso no backend. SessionStart já é não-bloqueante no Claude Code — o script reforça por design (sempre `exit 0`).

**Design testável (env overrides p/ mock):**
- `MAGNUS_HOME` (default `$HOME/.claude/magnus-os`) — onde ficam `license.json` e `.last-check`.
- `MAGNUS_VALIDATE_URL` (default a URL da Fase 1).
- `MAGNUS_CURL` (default `curl`) — permite o teste injetar um fake curl.
- `MAGNUS_TTL_SECONDS` (default `86400`).
- Lê a key de `$MAGNUS_HOME/license.json` (campo `key`) OU de `.claude/settings.json` do projeto (`magnus.licenseKey`).

- [ ] **Step 1: Escrever os testes que falham**

`test/validate-license.test.sh`:
```bash
#!/usr/bin/env bash
# Suite do hook de licença. Roda isolado em /tmp; mocka curl. Cada teste afirma fail-open.
set -u
SCRIPT="$(cd "$(dirname "$0")/.." && pwd)/plugins/magnus-os/bin/validate-license.sh"
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); echo "ok - $1"; }
no(){ FAIL=$((FAIL+1)); echo "NOT OK - $1"; }

setup(){ TMP="$(mktemp -d)"; export MAGNUS_HOME="$TMP/home"; mkdir -p "$MAGNUS_HOME"
  CURL_LOG="$TMP/curl.log"; : > "$CURL_LOG"
  cat > "$TMP/fakecurl" <<EOF
#!/usr/bin/env bash
echo "called \$@" >> "$CURL_LOG"
echo '{"status":"granted"}'
EOF
  chmod +x "$TMP/fakecurl"; export MAGNUS_CURL="$TMP/fakecurl"
  export MAGNUS_VALIDATE_URL="http://example.test/validate"; export MAGNUS_TTL_SECONDS=86400; }
teardown(){ rm -rf "$TMP"; }

# 1. Sem key → exit 0, não chama curl
setup; echo '{}' | bash "$SCRIPT" >/dev/null 2>&1
[ $? -eq 0 ] && ok "sem key: exit 0" || no "sem key: exit 0"
[ ! -s "$CURL_LOG" ] && ok "sem key: não chama curl" || no "sem key: não chama curl"; teardown

# 2. Com key + cache stale → chama curl, exit 0
setup; echo '{"key":"MOS-AAAA-BBBB-CCCC"}' > "$MAGNUS_HOME/license.json"
echo '{}' | bash "$SCRIPT" >/dev/null 2>&1
[ $? -eq 0 ] && ok "key+stale: exit 0" || no "key+stale: exit 0"
[ -s "$CURL_LOG" ] && ok "key+stale: chama curl" || no "key+stale: chama curl"; teardown

# 3. Cache fresh (<TTL) → NÃO chama curl
setup; echo '{"key":"MOS-AAAA-BBBB-CCCC"}' > "$MAGNUS_HOME/license.json"
date +%s > "$MAGNUS_HOME/.last-check"
echo '{}' | bash "$SCRIPT" >/dev/null 2>&1
[ ! -s "$CURL_LOG" ] && ok "fresh: não chama curl" || no "fresh: não chama curl"; teardown

# 4. curl falha (exit !=0 / timeout) → fail-open exit 0
setup; echo '{"key":"MOS-AAAA-BBBB-CCCC"}' > "$MAGNUS_HOME/license.json"
cat > "$TMP/fakecurl" <<'EOF'
#!/usr/bin/env bash
exit 28
EOF
chmod +x "$TMP/fakecurl"
echo '{}' | bash "$SCRIPT" >/dev/null 2>&1
[ $? -eq 0 ] && ok "curl falha: fail-open exit 0" || no "curl falha: fail-open exit 0"; teardown

# 5. status revoked → AINDA exit 0 (hook é fail-open; gating duro é da skill)
setup; echo '{"key":"MOS-AAAA-BBBB-CCCC"}' > "$MAGNUS_HOME/license.json"
cat > "$TMP/fakecurl" <<'EOF'
#!/usr/bin/env bash
echo '{"status":"revoked"}'
EOF
chmod +x "$TMP/fakecurl"
echo '{}' | bash "$SCRIPT" >/dev/null 2>&1
[ $? -eq 0 ] && ok "revoked: fail-open exit 0" || no "revoked: fail-open exit 0"; teardown

# 6. Após sucesso, grava .last-check (debounce na próxima)
setup; echo '{"key":"MOS-AAAA-BBBB-CCCC"}' > "$MAGNUS_HOME/license.json"
echo '{}' | bash "$SCRIPT" >/dev/null 2>&1
[ -f "$MAGNUS_HOME/.last-check" ] && ok "grava .last-check" || no "grava .last-check"; teardown

echo "----"; echo "PASS=$PASS FAIL=$FAIL"; [ "$FAIL" -eq 0 ]
```

- [ ] **Step 2: Rodar — deve falhar (script não existe)**

```bash
bash ~/Documents/Magnus/magnus-os-plugin/test/validate-license.test.sh
```
Expected: erros (script ausente) / `FAIL>0`.

- [ ] **Step 3: Implementar o hook**

`plugins/magnus-os/bin/validate-license.sh`:
```bash
#!/usr/bin/env bash
# Magnus OS — telemetria/licença fail-open. SessionStart. NUNCA bloqueia: sai 0 em TODO caminho.
set -u
HOME_DIR="${MAGNUS_HOME:-$HOME/.claude/magnus-os}"
URL="${MAGNUS_VALIDATE_URL:-https://vbmvzmibupzpjwyrfmjs.supabase.co/functions/v1/license-validate}"
CURL="${MAGNUS_CURL:-curl}"
TTL="${MAGNUS_TTL_SECONDS:-86400}"
mkdir -p "$HOME_DIR" 2>/dev/null || exit 0

# stdin = JSON do SessionStart (tem cwd); ignoramos com segurança se não vier.
STDIN_JSON="$(cat 2>/dev/null || true)"

# --- resolve a key: license.json (campo key) OU settings.json do projeto (magnus.licenseKey) ---
read_json_field(){ # $1=arquivo $2=chave simples; extrai "chave":"valor" sem jq
  [ -f "$1" ] || return 1
  grep -o "\"$2\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" "$1" 2>/dev/null | head -1 | sed 's/.*:[[:space:]]*"\([^"]*\)".*/\1/'
}
KEY="$(read_json_field "$HOME_DIR/license.json" key || true)"
if [ -z "${KEY:-}" ]; then
  CWD="$(printf '%s' "$STDIN_JSON" | grep -o '"cwd"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*:[[:space:]]*"\([^"]*\)".*/\1/')"
  [ -n "${CWD:-}" ] && KEY="$(read_json_field "$CWD/.claude/settings.json" licenseKey || true)"
fi
[ -z "${KEY:-}" ] && exit 0   # sem key → silêncio total

# --- debounce: só pinga se passou o TTL ---
NOW="$(date +%s)"
LAST="$(cat "$HOME_DIR/.last-check" 2>/dev/null || echo 0)"
case "$LAST" in ''|*[!0-9]*) LAST=0 ;; esac
if [ $((NOW - LAST)) -lt "$TTL" ]; then exit 0; fi

# --- ping (timeout curto); QUALQUER erro = fail-open ---
RESP="$("$CURL" -s -m 5 -X POST "$URL" -H 'Content-Type: application/json' \
  -d "{\"key\":\"$KEY\"}" 2>/dev/null)" || RESP=""

# grava o carimbo independentemente do resultado (evita martelar o backend offline)
echo "$NOW" > "$HOME_DIR/.last-check" 2>/dev/null || true
[ -n "$RESP" ] && printf '%s' "$RESP" > "$HOME_DIR/.last-status" 2>/dev/null || true

exit 0
```

- [ ] **Step 4: `hooks.json`**

`plugins/magnus-os/hooks/hooks.json`:
```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          { "type": "command", "command": "bash ${CLAUDE_PLUGIN_ROOT}/bin/validate-license.sh", "timeout": 10 }
        ]
      }
    ]
  }
}
```

- [ ] **Step 5: chmod + rodar testes — devem passar**

```bash
chmod +x ~/Documents/Magnus/magnus-os-plugin/plugins/magnus-os/bin/validate-license.sh
bash ~/Documents/Magnus/magnus-os-plugin/test/validate-license.test.sh
```
Expected: `PASS=6 FAIL=0`

- [ ] **Step 6: Commit**

```bash
cd ~/Documents/Magnus/magnus-os-plugin
git add -A && git commit -m "feat(plugin): hook de licença SessionStart fail-open + TTL + 6 testes bash"
```

---

### Task 3: `.mcp.json` do plugin (Notion + Canva auto-conecta)

**Files:**
- Create: `plugins/magnus-os/.mcp.json`

- [ ] **Step 1: Copiar o `.mcp.json` do template** (idêntico — Canva/Notion HTTP):

`plugins/magnus-os/.mcp.json`:
```json
{
  "mcpServers": {
    "canva": { "type": "http", "url": "https://mcp.canva.com/mcp" },
    "notion": { "type": "http", "url": "https://mcp.notion.com/mcp" }
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd ~/Documents/Magnus/magnus-os-plugin && git add -A && git commit -m "feat(plugin): MCP Notion+Canva bundled"
```

---

### Task 4: Stub `copy-magnus` (`/magnus-os:copy-magnus`) + repointar `criar-landing`

**Files:**
- Create: `plugins/magnus-os/skills/copy-magnus/SKILL.md`
- Modify: `plugins/magnus-os/skills/criar-landing/SKILL.md` (trocar `/cc` → `copy-magnus`)

**Decisão Yuri:** bundle completo existe num repo GitHub (`copy-magnus`, Task 6), instalado on-demand. O stub é leve: detecta se o full está instalado; se não, instrui/roda o install; enquanto isso cai no Schwartz (`/ba`) como ponte mínima (não como substituto permanente).

- [ ] **Step 1: Escrever o stub**

`plugins/magnus-os/skills/copy-magnus/SKILL.md`:
```markdown
---
name: copy-magnus
description: Motor de copy de resposta direta do Magnus OS (/cm). Diagnóstico Schwartz (awareness × sophistication → ângulo → copy por seção) e produção de VSL/landing/oferta. Use sempre que pedir copy, headline, VSL, sales letter, página de vendas, e-mail ou ad. Para produção pesada, instala on-demand o copy-magnus full.
allowed-tools: Read, Write, Glob, Bash(npx *), Bash(git clone *), WebFetch
---

# Skill: copy-magnus (/cm) — motor de copy do Magnus OS

> Rebrand do copy-chief-black (Luca Pimenta, MIT — atribuição preservada no copy-magnus full).

## Roteamento
1. **Tem o copy-magnus full instalado?** (`~/.claude/copy-magnus/` ou skill `/cm-full`). Se sim → use o pipeline completo (research → briefing HELIX → produção).
2. **Não tem + a tarefa é pesada** (VSL longa, oferta completa, sales letter): instale on-demand e avise o usuário:
   ```
   git clone https://github.com/yuribranco/copy-magnus ~/.claude/copy-magnus && ~/.claude/copy-magnus/install.sh
   ```
   Depois rode o pipeline full.
3. **Tarefa leve** (headline, copy de seção de landing, post, ad curto): resolva inline com o método Schwartz abaixo — não precisa do full.

## Método Schwartz (sempre disponível, inline)
Antes de escrever, responda:
- **Mass desire** que o mercado já tem (você canaliza, não cria).
- **Awareness** (1–5): Unaware → Problem → Solution → Product → Most Aware.
- **Sophistication** (1–5): quantas promessas iguais o mercado já viu.
Daí: o que a headline LIDERA e o que EVITA (mercado saturado → mecanismo novo; topo saturado → identificação).
Copy por seção: hero → problema → mecanismo único → oferta → prova (`[A PREENCHER]`, nunca inventar) → CTA específico → FAQ.
```

- [ ] **Step 2: Repointar `criar-landing`** — na seção "Camada de COPY", trocar as referências a `/cc` por `copy-magnus` (a skill irmã do plugin) e ajustar a mensagem de erro do banner. Edits exatos:
  - `## Camada de COPY — use SEMPRE o /cc (PADRÃO OBRIGATÓRIO)` → `## Camada de COPY — use a skill copy-magnus (PADRÃO)`
  - O bloco ` ```\n/cc escreva a copy... ``` ` → instrução de invocar a skill `copy-magnus` com oferta/campanha/awareness/ângulo.
  - A linha "Se receber 'comando /cc não encontrado'… painel Magnus… banner 'Instalar agora'" → "Se o copy-magnus full não estiver instalado, a própria skill `copy-magnus` instala on-demand (ou cai no Schwartz inline pra copy de seção)."

- [ ] **Step 3: Verificar zero ref órfã a `/cc`/`copy-chief` nas skills**

```bash
grep -rn '/cc\b\|copy-chief' ~/Documents/Magnus/magnus-os-plugin/plugins/magnus-os/skills && echo "REVISAR refs acima" || echo "OK: nenhuma ref a /cc/copy-chief"
```
Expected: `OK: nenhuma ref a /cc/copy-chief`

- [ ] **Step 4: Commit**

```bash
cd ~/Documents/Magnus/magnus-os-plugin && git add -A && git commit -m "feat(plugin): skill copy-magnus (/cm) + criar-landing aponta p/ copy-magnus"
```

---

### Task 5: Fonte do template scaffold (`template/`) — pro instalador (Fase 4)

**Files:**
- Create: `template/contexto/{EMPRESA,VOZ,TIME,DESIGN}.md` + `template/contexto/ativos/.gitkeep`
- Create: `template/operacao/.gitkeep`
- Create: `template/CLAUDE.md`, `template/.env.example`

**Contexto:** O plugin não cria esses arquivos no projeto do cliente; o instalador (Fase 4) copia `template/` pro cwd. Esta task só prepara a **fonte** (sem as `.claude/skills/` — essas vêm do plugin). O `CLAUDE.md` do template deve instruir o cliente a ter o plugin `magnus-os` instalado (skills viram `/magnus-os:*`).

- [ ] **Step 1: Copiar contexto/operacao do teste-zerado, sem dados de exemplo**

```bash
SRC=~/Documents/Magnus/magnus-imersao/painel-aula-4/teste-zerado
DST=~/Documents/Magnus/magnus-os-plugin/template
mkdir -p "$DST/contexto/ativos" "$DST/operacao"
cp "$SRC"/contexto/{EMPRESA,VOZ,TIME,DESIGN}.md "$DST"/contexto/ 2>/dev/null || true
touch "$DST/contexto/ativos/.gitkeep" "$DST/operacao/.gitkeep"
cp "$SRC/.env.example" "$DST/.env.example" 2>/dev/null || true
```

- [ ] **Step 2: Garantir que os `contexto/*.md` estão ZERADOS** (templates, sem Vigília). Se vierem preenchidos, substituir pelo esqueleto de seções (mesmo formato do teste-zerado original zerado). Verificar:

```bash
grep -ri 'vigil\|maralto\|custodimus' ~/Documents/Magnus/magnus-os-plugin/template/contexto && echo "LIMPAR exemplos" || echo "OK: contexto zerado"
```
Expected: `OK: contexto zerado`

- [ ] **Step 3: `template/CLAUDE.md`** — adaptar o do teste-zerado: explicar contexto/operacao + que as skills vêm do **plugin magnus-os** (`/magnus-os:criar-landing` etc.), não de `.claude/skills/` local.

- [ ] **Step 4: Commit**

```bash
cd ~/Documents/Magnus/magnus-os-plugin && git add -A && git commit -m "feat(template): fonte do scaffold contexto/operacao p/ instalador (Fase 4)"
```

---

### Task 6: Repo `copy-magnus` full (rebrand do copy-chief-black) — repo GitHub on-demand

**Files (novo repo `~/Documents/Magnus/copy-magnus`):** rebrand mecânico de `~/.claude/copy-squad/` + `~/.claude/COPY-*-INDEX.md` + `~/.claude/copy-surface-criteria.yaml` + a skill `/cc` (de `userSettings:cc`) + `~/copywriting-ecosystem/squads/copy-chief/`.

> **Task pesada — pode virar sub-plano próprio.** Escopo aqui: rebrand de marca preservando a licença/atribuição MIT do Luca, + um `install.sh` que o stub (Task 4) chama. NÃO reescrever a lógica — só renomear marca e empacotar.

- [ ] **Step 1: Init + copiar a fonte**

```bash
mkdir -p ~/Documents/Magnus/copy-magnus && cd ~/Documents/Magnus/copy-magnus && git init
cp -R ~/.claude/copy-squad ./copy-squad
cp ~/.claude/COPY-CHIEF-INDEX.md ~/.claude/COPY-DOCS-INDEX.md ~/.claude/copy-surface-criteria.yaml ./
mkdir -p skills/copy-magnus
# a skill /cc (Chief router) vira skills/copy-magnus/SKILL.md (full)
```

- [ ] **Step 2: Preservar LICENSE/atribuição (OBRIGATÓRIO)** — criar `LICENSE` (MIT original do Luca Pimenta) + `NOTICE`:
```
Magnus OS — copy-magnus é um rebrand de copy-chief-black.
copy-chief-black © Luca Pimenta, licenciado sob MIT. Texto original da licença em LICENSE.
Rebrand e empacotamento Magnus OS © Yuri Branco.
```

- [ ] **Step 3: Rebrand de marca (mecânico, preservando nomes técnicos de arquivo onde quebra refs)**
```bash
cd ~/Documents/Magnus/copy-magnus
grep -rl 'Copy Chief\|copy-chief\|Chief BLACK\|copy-chief-black' . | grep -v '.git/' | while read -r f; do
  sed -i '' -e 's/copy-chief-black/copy-magnus/g' -e 's/Copy Chief BLACK/Copy Magnus/g' \
            -e 's/Copy Chief/Copy Magnus/g' -e 's/\bChief\b/Magnus/g' "$f"
done
```
> Revisar manualmente: NÃO renomear a atribuição "Luca Pimenta" nem o nome do arquivo de licença; conferir que refs internas (paths `copy-squad/...`) seguem resolvendo.

- [ ] **Step 4: `install.sh`** — instala em `~/.claude/copy-magnus/` e registra a skill `/cm-full` (ou symlink em `~/.claude/skills/`). Idempotente. Sem hooks globais (lição do copy-chief: hooks substituem o settings — manter off/on-demand).

- [ ] **Step 5: Verificar** que `grep -ri 'copy-chief\|Copy Chief' .` (fora de LICENSE/NOTICE) volta vazio; e que `Luca Pimenta` ainda aparece em LICENSE/NOTICE.

- [ ] **Step 6: Commit + push (repo GitHub)**

```bash
cd ~/Documents/Magnus/copy-magnus
git add -A && git commit -m "feat: copy-magnus full (rebrand do copy-chief-black, MIT do Luca preservado)"
# push: gh repo create yuribranco/copy-magnus --private --source=. --push  (decisão de visibilidade: ver Itens abertos)
```

---

### Task 7: Validação do plugin + correção do spec

**Files:**
- Modify: `~/Documents/Magnus/magnus-os/docs/superpowers/specs/2026-05-29-os-produto-vendavel-design.md` (§3.2 + §6)

- [ ] **Step 1: Validar JSON de todos os manifestos**

```bash
cd ~/Documents/Magnus/magnus-os-plugin
for f in .claude-plugin/marketplace.json plugins/magnus-os/.claude-plugin/plugin.json plugins/magnus-os/.mcp.json plugins/magnus-os/hooks/hooks.json; do
  python3 -c "import json,sys; json.load(open('$f')); print('OK $f')" || echo "JSON INVÁLIDO: $f"
done
```
Expected: 4× `OK`.

- [ ] **Step 2: Validar o plugin com o tooling do Claude Code** (se existir)

```bash
claude plugin validate ~/Documents/Magnus/magnus-os-plugin/plugins/magnus-os 2>/dev/null || echo "(claude plugin validate indisponível — validar instalando o marketplace local)"
```

- [ ] **Step 3: Smoke de instalação local** — adicionar o marketplace do path local e instalar, conferir que as skills aparecem como `/magnus-os:*` e o hook roda sem erro. (Se `claude plugin` CLI não cobrir, registrar manualmente e abrir uma sessão no `template/` materializado.) Documentar o resultado.

- [ ] **Step 4: Corrigir o spec** — em `2026-05-29-os-produto-vendavel-design.md`:
  - §3.2.1: o plugin NÃO contém `contexto/`+`operacao/`. Reescrever: "Plugin = skills + copy-magnus + hook + MCP. O scaffold (contexto/operacao/CLAUDE.md) é materializado pelo **instalador** (plugins não criam arquivos de projeto — verificado nos docs 2026-05-29)."
  - §6: skills namespaced `/magnus-os:*`; copy-magnus full vai pra repo GitHub on-demand (decisão Yuri).

- [ ] **Step 5: Commit**

```bash
cd ~/Documents/Magnus/magnus-os && git add -A && git commit -m "docs(spec): corrige arquitetura plugin vs scaffold (Fase 2 mecânica verificada)"
cd ~/Documents/Magnus/magnus-os-plugin && git add -A && git commit -m "test(plugin): validação de manifestos + smoke de instalação"
```

---

## Itens abertos (decisões fora do escopo de execução — confirmar com Yuri)

1. **Visibilidade do repo `copy-magnus`**: privado (gated, e o stub clona com token) ou público (mais simples, mas dá o framework de graça)? O Yuri disse "estará no github" — confirmar público vs privado.
2. **Hosting do marketplace privado**: repo `magnus-os-plugin` privado no GitHub do Yuri; o instalador (Fase 4) precisa de um token/deploy-key pro cliente. Resolver na Fase 4.
3. **Painel × plugin (Fase 3)**: o painel (Agent SDK, `settingSources:['project']`) lê `.claude/skills/` do projeto, não plugins. Decidir na Fase 3 se o painel carrega o plugin ou se o instalador também materializa as skills no projeto. **Não bloqueia a Fase 2.**
4. **Rate-limit de marketplace**: o spec citou "50 convites/24h"; os docs oficiais (2026-05-29) NÃO documentam esse limite pra marketplace privado. Re-verificar na Fase 4.
