# Inc 0 — Enxugar (flag reversível) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Esconder da UI do painel os módulos que não servem à agência de lançamento (aba Tarefas, skill criar-post, card de Posts, MCP Notion+Canva), via flags reversíveis — sem deletar código.

**Architecture:** Um módulo puro `lib/modules.ts` lê flags (default off, override por env). Filtro puro e testável de skills. As UIs (page.tsx server + CampaignWorkspace client) condicionam render às flags. O `.mcp.json` do plugin perde Notion/Canva (reversível via git). Trazer de volta = setar `MAGNUS_MODULE_*=true` / restaurar o `.mcp.json`.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, vitest. Repo painel: `~/Documents/Magnus/magnus-imersao/painel-aula-4/magnus-painel`. Repo plugin: `~/Documents/Magnus/magnus-os-plugin`.

**Decisões da spec aplicadas:** D2 (flag reversível, não deletar). Ver `docs/superpowers/specs/2026-06-01-magnus-os-redesign-agencia-design.md` §Inc 0.

---

## File Structure

- **Create** `lib/modules.ts` — flags de módulo (default off + override env). Responsável: única fonte de verdade do que está ligado.
- **Create** `lib/modules.test.ts` — testa defaults + override.
- **Modify** `lib/skill-helpers.ts` — adicionar `filterSkillsByModules` (puro, client-safe).
- **Modify** `lib/skill-helpers.test.ts` (criar se não existir) — testa o filtro.
- **Modify** `lib/skills.ts` — `visibleSkills()` = parseSkills + filtro por módulos.
- **Modify** `app/api/skills/route.ts` — usar `visibleSkills()`.
- **Modify** `app/c/[slug]/page.tsx` — usar `visibleSkills()`; banners Notion/Canva condicionais; passar `modules` ao workspace.
- **Modify** `app/c/[slug]/CampaignWorkspace.tsx` — prop `modules`; aba Tarefas e card Posts condicionais.
- **Modify** (plugin) `plugins/magnus-os/.mcp.json` — remover canva + notion.

> Nota: `app/api/notion/_status/route.ts`, `app/api/mcp/connect`, o componente `MCPConnectBanner` e a skill `criar-post` **permanecem no código** (dormentes). Reversibilidade = flag/git.

---

### Task 1: `lib/modules.ts` — flags de módulo

**Files:**
- Create: `lib/modules.ts`
- Test: `lib/modules.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// lib/modules.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { getModules } from "./modules";

const KEYS = ["MAGNUS_MODULE_TAREFAS", "MAGNUS_MODULE_CRIAR_POST", "MAGNUS_MODULE_NOTION", "MAGNUS_MODULE_CANVA"];

describe("getModules", () => {
  afterEach(() => { for (const k of KEYS) delete process.env[k]; });

  it("default: todos os 4 módulos desligados", () => {
    expect(getModules()).toEqual({ tarefas: false, criarPost: false, notion: false, canva: false });
  });

  it("override por env liga o módulo (true/1)", () => {
    process.env.MAGNUS_MODULE_TAREFAS = "true";
    process.env.MAGNUS_MODULE_CANVA = "1";
    const m = getModules();
    expect(m.tarefas).toBe(true);
    expect(m.canva).toBe(true);
    expect(m.notion).toBe(false);
  });

  it("valor não-truthy mantém desligado", () => {
    process.env.MAGNUS_MODULE_NOTION = "false";
    expect(getModules().notion).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run -s test -- lib/modules.test.ts`
Expected: FAIL ("Cannot find module './modules'").

- [ ] **Step 3: Implementar**

```ts
// lib/modules.ts
export interface ModuleFlags {
  tarefas: boolean;
  criarPost: boolean;
  notion: boolean;
  canva: boolean;
}

const DEFAULTS: ModuleFlags = { tarefas: false, criarPost: false, notion: false, canva: false };

function envBool(name: string, dflt: boolean): boolean {
  const v = process.env[name];
  if (v == null) return dflt;
  const s = v.trim().toLowerCase();
  return s === "1" || s === "true";
}

/** Flags de módulo do Magnus OS. Default = enxuto (off). Ligar = MAGNUS_MODULE_<X>=true. */
export function getModules(): ModuleFlags {
  return {
    tarefas: envBool("MAGNUS_MODULE_TAREFAS", DEFAULTS.tarefas),
    criarPost: envBool("MAGNUS_MODULE_CRIAR_POST", DEFAULTS.criarPost),
    notion: envBool("MAGNUS_MODULE_NOTION", DEFAULTS.notion),
    canva: envBool("MAGNUS_MODULE_CANVA", DEFAULTS.canva),
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run -s test -- lib/modules.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/modules.ts lib/modules.test.ts
git commit -m "feat(inc0): lib/modules — flags de módulo reversíveis (default enxuto)"
```

---

### Task 2: filtro puro de skills por módulo

**Files:**
- Modify: `lib/skill-helpers.ts`
- Test: `lib/skill-helpers.test.ts` (criar)

- [ ] **Step 1: Escrever o teste que falha**

```ts
// lib/skill-helpers.test.ts
import { describe, it, expect } from "vitest";
import { filterSkillsByModules } from "./skill-helpers";
import type { ParsedSkill } from "./types";

function mk(slug: string): ParsedSkill {
  return { slug, name: slug, description: "", panel: { category: "produzir" } as ParsedSkill["panel"], body: "", filePath: "", fallback: false };
}

describe("filterSkillsByModules", () => {
  const skills = [mk("criar-criativo"), mk("criar-post"), mk("criar-landing")];

  it("esconde criar-post quando criarPost off", () => {
    const out = filterSkillsByModules(skills, { tarefas: false, criarPost: false, notion: false, canva: false });
    expect(out.map((s) => s.slug)).toEqual(["criar-criativo", "criar-landing"]);
  });

  it("mantém criar-post quando criarPost on", () => {
    const out = filterSkillsByModules(skills, { tarefas: false, criarPost: true, notion: false, canva: false });
    expect(out.map((s) => s.slug)).toContain("criar-post");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run -s test -- lib/skill-helpers.test.ts`
Expected: FAIL ("filterSkillsByModules is not a function").

- [ ] **Step 3: Implementar — adicionar ao fim de `lib/skill-helpers.ts`**

```ts
import type { ModuleFlags } from "./modules";

/** Remove skills de módulos desligados (client-safe, puro). Hoje só `criar-post`. */
export function filterSkillsByModules(skills: ParsedSkill[], modules: ModuleFlags): ParsedSkill[] {
  return skills.filter((s) => (s.slug === "criar-post" ? modules.criarPost : true));
}
```

(O import de `ParsedSkill` já existe no topo do arquivo; adicionar só o de `ModuleFlags`.)

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run -s test -- lib/skill-helpers.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/skill-helpers.ts lib/skill-helpers.test.ts
git commit -m "feat(inc0): filterSkillsByModules — esconde criar-post quando módulo off"
```

---

### Task 3: `visibleSkills()` + usar nos call sites server

**Files:**
- Modify: `lib/skills.ts` (adicionar export `visibleSkills`)
- Modify: `app/api/skills/route.ts`
- Modify: `app/c/[slug]/page.tsx` (troca `parseSkills()` por `visibleSkills()`)

- [ ] **Step 1: Adicionar `visibleSkills` ao fim de `lib/skills.ts`**

```ts
import { getModules } from "./modules";
import { filterSkillsByModules } from "./skill-helpers";

/** parseSkills + filtro por módulos ligados. Usar nas superfícies que mostram skills ao cliente. */
export function visibleSkills(): ParsedSkill[] {
  return filterSkillsByModules(parseSkills(), getModules());
}
```

(`ParsedSkill` já está importado no topo de `skills.ts`.)

- [ ] **Step 2: Trocar em `app/api/skills/route.ts`**

Trocar a chamada `parseSkills()` por `visibleSkills()` e ajustar o import:
```ts
// antes:  import { parseSkills } from "@/lib/skills";  ... parseSkills()
// depois:
import { visibleSkills } from "@/lib/skills";
// ... usar visibleSkills() onde antes era parseSkills()
```

- [ ] **Step 3: Trocar em `app/c/[slug]/page.tsx`**

```ts
// no topo, junto dos imports de lib:
import { visibleSkills } from "@/lib/skills";
import { getModules } from "@/lib/modules";
// dentro do componente, trocar:
//   const skills = parseSkills();
// por:
const skills = visibleSkills();
const modules = getModules();
```
(Remover o import agora não usado `parseSkills` se ele ficar órfão.)

- [ ] **Step 4: Verificar build/types**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add lib/skills.ts app/api/skills/route.ts app/c/[slug]/page.tsx
git commit -m "feat(inc0): visibleSkills() nos call sites — criar-post some da skills bar"
```

---

### Task 4: CampaignWorkspace — esconder aba Tarefas + card Posts

**Files:**
- Modify: `app/c/[slug]/CampaignWorkspace.tsx`

- [ ] **Step 1: Estender Props e receber `modules`**

Em `interface Props` adicionar:
```ts
import type { Campaign, NotionTabState, ParsedSkill } from "@/lib/types";
import type { ModuleFlags } from "@/lib/modules";

interface Props {
  campaign: Campaign;
  initialTabState: NotionTabState;
  skills: ParsedSkill[];
  modules: ModuleFlags;
}

export function CampaignWorkspace({ campaign, initialTabState, skills, modules }: Props) {
```

- [ ] **Step 2: Tab efetiva + tabs condicionais**

Logo após `const activeTab = useStore(...)`, adicionar:
```ts
const showTasks = modules.tarefas;
const effectiveTab = showTasks ? activeTab : "overview";
```
Trocar o `<TabBar tabs={[...]}>` por:
```tsx
<TabBar
  tabs={[
    { id: "overview", label: "Visão geral", icon: <Icons.layers size={12} /> },
    ...(showTasks ? [{ id: "tasks", label: "Tarefas", icon: <Icons.chess size={12} /> }] : []),
  ]}
  active={effectiveTab}
  onChange={(id) => setTab(campaign.slug, id as "overview" | "tasks")}
/>
```
Trocar a condição de render do corpo de `activeTab === "overview"` para `effectiveTab === "overview"`:
```tsx
{effectiveTab === "overview" ? (
  <OverviewTab campaign={campaign} modules={modules} />
) : (
  <TasksTab ... />   {/* inalterado */}
)}
```

- [ ] **Step 3: Card Posts condicional na OverviewTab**

Trocar a assinatura:
```tsx
function OverviewTab({ campaign, modules }: { campaign: Campaign; modules: ModuleFlags }) {
```
Envolver o `<div className="card">` do card **Posts** (o que tem `<Icons.post />` e título "Posts") em:
```tsx
{modules.criarPost && (
  <div className="card">
    {/* ...card Posts inalterado... */}
  </div>
)}
```

- [ ] **Step 4: Verificar build/types**

Run: `npx tsc --noEmit`
Expected: sem erros. (Se TS reclamar do tipo do array da TabBar, tipar o literal com `as const` ou `: TabSpec[]` importando `TabSpec` de `@/components/TabBar`.)

- [ ] **Step 5: Commit**

```bash
git add "app/c/[slug]/CampaignWorkspace.tsx"
git commit -m "feat(inc0): esconde aba Tarefas + card Posts quando módulo off"
```

---

### Task 5: page.tsx — banners Notion/Canva condicionais + passar modules

**Files:**
- Modify: `app/c/[slug]/page.tsx`

- [ ] **Step 1: Banners condicionais + prop modules**

Trocar:
```tsx
<MCPConnectBanner server="notion" />
<MCPConnectBanner server="canva" />
```
por:
```tsx
{modules.notion && <MCPConnectBanner server="notion" />}
{modules.canva && <MCPConnectBanner server="canva" />}
```
E na chamada do workspace:
```tsx
<CampaignWorkspace campaign={campaign} initialTabState={tabState} skills={skills} modules={modules} />
```
(`modules` já foi criado na Task 3 Step 3.)

- [ ] **Step 2: Verificar build/types**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add "app/c/[slug]/page.tsx"
git commit -m "feat(inc0): banners Notion/Canva só quando módulo ligado"
```

---

### Task 6: Plugin — remover Notion/Canva do `.mcp.json`

**Files:**
- Modify (repo plugin): `~/Documents/Magnus/magnus-os-plugin/plugins/magnus-os/.mcp.json`

- [ ] **Step 1: Esvaziar mcpServers (reversível via git)**

Conteúdo novo:
```json
{
  "mcpServers": {}
}
```
> Reverter = `git revert`/restaurar as entradas `canva`/`notion`. (No Inc 1, este arquivo ganha o MCP oficial da Meta.)

- [ ] **Step 2: Validar o plugin**

Run: `cd ~/Documents/Magnus/magnus-os-plugin && claude plugin validate 2>&1 | tail -5`
Expected: PASS (sem erro de schema).

- [ ] **Step 3: Commit (repo plugin)**

```bash
cd ~/Documents/Magnus/magnus-os-plugin
git add plugins/magnus-os/.mcp.json
git commit -m "chore(inc0): remove Notion/Canva do .mcp.json (enxugar; reversível)"
```

---

### Task 7: Verificação integrada (build + QA visual)

**Files:** nenhum (verificação)

- [ ] **Step 1: tsc + testes + build no painel**

Run:
```bash
cd ~/Documents/Magnus/magnus-imersao/painel-aula-4/magnus-painel
npx tsc --noEmit && npm run -s test && npm run -s build
```
Expected: tsc limpo · todos os testes verdes (incl. modules + skill-helpers) · build OK.

- [ ] **Step 2: QA visual (gate gstack `/qa-only` ou browse)**

Subir o painel e conferir com o olho:
```bash
MAGNUS_PAINEL_CWD=/tmp/magnus-os-ws \
MAGNUS_SKILLS_DIR=~/Documents/Magnus/magnus-os-plugin/plugins/magnus-os/skills \
node_modules/.bin/next start -p 3940
```
Abrir `http://localhost:3940/c/captacao-do-diagnostico` e confirmar:
- Aba "Tarefas" **sumiu** (só "Visão geral").
- Skills bar **sem** "criar-post" (só criar-criativo, criar-landing, lancar-campanha).
- Card "Posts" **sumiu** da Visão geral.
- Banners "Conecte o Notion" e "Conecte o Canva" **não aparecem**.
- Resto intacto (criativos, landing, cronograma, chat).
- Sanity reversível: subir com `MAGNUS_MODULE_TAREFAS=true MAGNUS_MODULE_NOTION=true ...` e ver os módulos **voltarem**.

- [ ] **Step 3: `/codex review` (gate fixo do Yuri)**

Rodar `/codex review` no diff do branch; iterar até zero findings P1/P2.

- [ ] **Step 4: Commit final / fechar**

Já commitado por task. Fechar o ciclo: wiki (slug magnus-os) + memory + atualizar a spec (Inc 0 = done).

---

## Self-Review (feito)
- **Cobertura da spec Inc 0:** aba Tarefas (Task 4) ✔ · criar-post (Tasks 2-4) ✔ · card Posts (Task 4) ✔ · MCP Notion+Canva (Tasks 5+6) ✔ · reversível por flag/git (Task 1) ✔.
- **Placeholders:** nenhum — todo passo tem código/comando real.
- **Consistência de tipos:** `ModuleFlags` (Task 1) usada em filterSkillsByModules (Task 2), visibleSkills (Task 3), CampaignWorkspace (Task 4), page.tsx (Task 5). `getModules`/`visibleSkills`/`filterSkillsByModules` nomes batem em todos os call sites.
