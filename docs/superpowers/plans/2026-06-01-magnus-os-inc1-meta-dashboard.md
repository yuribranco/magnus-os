# Inc 1 — Conexão Meta + dashboard por campanha — Implementation Plan

**For agentic workers:** Execute tasks top-to-bottom. Each task is a 2–5 min step with exact file paths, complete code, exact verification commands, and expected output. Pure logic (parsers/formatters) uses strict TDD (write failing vitest → run fail → implement → run pass → commit). UI (tab + dashboard components) has no React test setup in this repo, so verify via `npx tsc --noEmit` + `npm run -s build` + a `/browse` QA-visual step (NOT React Testing Library). The MCP wiring + the `sincronizar-meta` skill verify via JSON validity + a documented manual/agent run. Commit after every green step with conventional messages. Do NOT push; the controller ships. Respect the locked schemas (`insights.json`, `link.json`) from spec §5 **byte-for-byte** — the parser/types must match.

---

## Goal

Each painel campaign shows the **real performance of the ads currently running** for it, file-first (Caminho A):
- The agent (via the official Meta Ads MCP + a new `sincronizar-meta` skill) writes `operacao/<slug>/meta/insights.json` and `link.json`.
- The painel **only reads those files** — never the Graph API. Zero secrets in the painel; no front-end rate limits; near-live (as fresh as the last agent pull).
- A dedicated **"Resultados"** tab (locked layout = variant B, mockup `docs/mockups/dash-b.png`) renders KPI band → funnel strip → ad table ranked by ROAS, with period control + connect/empty/loading/error states, plus a "gerar variação do vencedor" stub that hands off to Inc 2c.

This plan produces **working, testable software on its own**: with a hand-authored `insights.json`, the Resultados tab renders end-to-end without the MCP connected.

## Architecture

```
┌─────────────── client workspace (templateRoot / MAGNUS_PAINEL_CWD) ───────────────┐
│  .mcp.json                       ← Meta MCP server (seeded from plugin template/)  │
│  operacao/<slug>/meta/                                                             │
│    link.json       ← BM↔campanha binding (schema §5)                               │
│    insights.json   ← performance snapshot (schema §5)                              │
│    synced_at       ← ISO timestamp of last pull (also mirrored in insights.json)   │
│    bm-campaigns.json (transient, skill-internal) ← BM list the agent dumps while   │
│       matching in chat; the painel does NOT read it (see M5 deviation note)        │
└────────────────────────────────────────────────────────────────────────────────┘
        ▲ writes (agent only)                          │ reads (painel only)
        │                                              ▼
  sincronizar-meta skill (plugin)              lib/meta.ts (server, pure parse)
   → calls mcp__meta__ads_insights_* tools      → lib/meta-format.ts (pure fmt, TDD)
   → writes the files above                     → app/api/meta/* (read + trigger run)
                                                 → ResultadosTab.tsx (variant B UI)
```

**Two run triggers for the skill** (both = an Agent SDK run via the existing `/api/run/start` path):
1. The "Atualizar" button in the Resultados tab → `startRun("sincronizar-meta", { campanha: slug })`.
2. Auto on opening Resultados if `synced_at` is stale (> `MAGNUS_META_STALE_MIN`, default 30 min) — the tab fires the same run once.

**Connection model** mirrors the existing MCP onboarding: the Meta server is listed in the workspace `.mcp.json` (so `readMcpStatus()` reports it configured + `loadTemplateMcpServers()` hands it to the SDK), and a "Conecte a Meta" banner reuses the `MCPConnectBanner` Terminal+`/mcp` OAuth flow. No token ever touches the painel.

**Module gate:** Inc 1 adds a `meta` module flag (default **on** — it's the headline feature of the redesign), so the Resultados tab + Meta banner can be hidden via env if needed, consistent with the Inc 0 flag mechanism.

> **M5 — intentional deviation from spec §Inc 1 (BM↔campaign association UX):** the spec implies an association affordance in the painel. In the **MVP this is chat-driven, not a painel picker**: the `sincronizar-meta` skill lists the Business Manager campaigns, name-matches, confirms the binding **in chat**, and writes `link.json`. The painel renders **no** BM-campaign picker in Inc 1 — it only *reads* `link.json` (to drive `metaConnected`, see I1) and `insights.json`. Therefore the plan ships **no** `readBmCampaigns()` reader, **no** `BmCampaign` type, and **no** test for them (YAGNI — nothing in the painel consumes the BM list). The transient `bm-campaigns.json` the skill may dump is skill-internal/debug only. A painel-side association picker is **deferred to a later increment**.

## Tech Stack

- Next.js 16 App Router · React 19 · TypeScript (no `any`) · Zustand store · vitest (already configured, `npm test` = `vitest run`).
- Inline styles + existing CSS classes/CSS vars (`.card`, `.tabbar`, `.empty`, `.deps-banner`, `--accent`, `--text-secondary`, etc.) — the painel uses inline styles + a global stylesheet, NO Tailwind, NO CSS modules. Match `CampaignWorkspace.tsx` conventions exactly.
- Icons from `lucide-react` via `components/icons.tsx` `make()` helper.
- Skill = Markdown `SKILL.md` with `panel:` frontmatter (model on `criar-criativo` / `lancar-campanha`).
- MCP = HTTP server entry in `.mcp.json` (Claude Code MCP format).

---

## File Structure (created / modified — each with one responsibility)

### Plugin repo `~/Documents/Magnus/magnus-os-plugin`
| File | Status | Responsibility |
|---|---|---|
| `plugins/magnus-os/.mcp.json` | **modified** | Add the official Meta Ads MCP server (HTTP, OAuth) so the agent/SDK sees Meta tools. |
| `template/.mcp.json` | **created** | Seed the **client workspace** `.mcp.json` with the Meta server on fresh install (workspace = `templateRoot`; the painel reads this file). |
| `plugins/magnus-os/skills/sincronizar-meta/SKILL.md` | **created** | The agent skill: list BM campaigns / pull insights via Meta MCP → write `meta/link.json` + `meta/insights.json` per schema §5. |

### Painel repo `~/Documents/Magnus/magnus-imersao/painel-aula-4/magnus-painel`
| File | Status | Responsibility |
|---|---|---|
| `lib/meta-types.ts` | **created** | TypeScript types matching schema §5 byte-for-byte (`MetaInsights`, `MetaLink`, `MetaAdRow`). (No `BmCampaign` — see M5 note.) |
| `lib/meta-format.ts` | **created** | Pure formatters: BRL currency, percent, ROAS `×`, relative "há N min", winner pick, ROAS sort, break-even color. **TDD.** |
| `lib/meta-format.test.ts` | **created** | Failing-first vitest specs for every formatter. **TDD.** |
| `lib/meta.ts` | **created** | Server-side readers: `readInsights(slug)`, `readMetaLink(slug)`, `readSyncedAt(slug)`, `isStale(syncedAt, min)`. Parses + validates the JSON; returns `null` on missing/bad. (No `readBmCampaigns` — see M5 note: BM↔campaign association is chat-driven in Inc 1; the painel does not consume the BM list.) |
| `lib/meta.test.ts` | **created** | vitest for `readInsights`/`isStale` using a temp workspace (mirror `paths.test.ts` style). **TDD.** |
| `lib/meta-stale.ts` | **created** | `getMetaStaleMinutes()` — reads `MAGNUS_META_STALE_MIN` env, default 30. **TDD-covered in `meta.test.ts`.** |
| `lib/modules.ts` | **modified** | Add `meta: boolean` flag (default **true**), env `MAGNUS_MODULE_META`. |
| `lib/modules.test.ts` | **modified** | Cover the new `meta` flag default + override. |
| `lib/types.ts` | **modified** | Add `meta` to `McpStatus`; add `ResultsTabState` discriminated union. |
| `lib/notion.ts` | **modified** | `readMcpStatus()` also reports `meta` from `.mcp.json` (rename internal type usage; keep notion/canva). |
| `lib/store.ts` | **modified** | `activeTab` value type `"overview" \| "tasks"` → add `"results"`; `setActiveTab` signature widened. |
| `components/icons.tsx` | **modified** | Add `barChart` icon (lucide `BarChart3`) for the Resultados tab + Meta banner. |
| `components/MetaConnectBanner.tsx` | **created** | "Conecte a Meta" banner — thin wrapper over the existing `MCPConnectBanner` flow extended to `server: "meta"`. |
| `components/NotionConnectBanner.tsx` | **modified** | This file defines its OWN local `interface McpStatus` (~L6-9) + `type ServerKey` (~L11) + `SERVER_LABELS` (~L13), **not** imported from `lib/types`. Add `meta` to ALL THREE: the local `McpStatus` interface, `ServerKey`, and `SERVER_LABELS`. `fetchStatus()` (`/api/notion/_status`) already returns all servers — no change there. |
| `components/ResultadosTab.tsx` | **created** | The variant-B dashboard: KPI band, funnel strip, ad table, period control, connect/empty/loading/error states, "Atualizar" + "gerar variação do vencedor" stub. |
| `app/c/[slug]/CampaignWorkspace.tsx` | **modified** | Add "Resultados" tab to `TabBar`, render `ResultadosTab` when active + `modules.meta`. |
| `app/c/[slug]/page.tsx` | **modified** | Pass `insights`/`link`/`syncedAt`/`staleMinutes` (read server-side) into `CampaignWorkspace`; render `MetaConnectBanner` when `modules.meta`. |
| `app/api/meta/route.ts` | **created** | `GET ?slug=` → `{ status, insights, link, syncedAt, stale }` (the tab's read endpoint; pure file read). |
| `app/api/meta/route.test.ts` | _skipped_ | (route handlers aren't unit-tested in this repo; covered by `lib/meta.test.ts` + QA visual.) |

> DRY: the dashboard's number/label logic lives entirely in `lib/meta-format.ts` (pure, tested); `ResultadosTab.tsx` only wires JSX. The file-read logic lives entirely in `lib/meta.ts`; the route + page just call it. YAGNI: no charting lib, no drill-down data fetch beyond what `insights.json` carries (drill-down "conta→adset→ad→criativo" in the mockup is a static affordance line in Inc 1; live drill is deferred).

---

## Phase A — MCP wiring + connection (plugin + painel status)

### Task A1 — Add the Meta MCP to the plugin `.mcp.json`
**File:** `~/Documents/Magnus/magnus-os-plugin/plugins/magnus-os/.mcp.json` (replace the empty `{ "mcpServers": {} }`).

```json
{
  "mcpServers": {
    "meta": {
      "type": "http",
      "url": "https://mcp.facebook.com/ads"
    }
  }
}
```

> **Validate at connect time:** the server name key (`meta`) becomes the tool prefix (`mcp__meta__*`). The URL `https://mcp.facebook.com/ads` and HTTP transport are confirmed (official Meta Ads AI Connector, OAuth via Business Manager, no Developer App). If Claude Code's MCP schema for this server requires `"transport": "http"` instead of `"type": "http"`, adjust to match `claude mcp list` output the first time you connect — both spellings appear in the wild; the painel's `readMcpStatus` only checks for the `meta` **key**, so it's robust either way.

**Verify — 🔴 HARD GATE (the dashboard never gets data if the shape is wrong):**
1. JSON is well-formed: `python3 -m json.tool plugins/magnus-os/.mcp.json` → pretty-prints with no error.
2. The shape actually LOADS in Claude Code / the Agent SDK and exposes Meta tools. From a workspace whose `.mcp.json` contains this server (e.g. `cd` into the seeded template workspace from Task A2, or copy this file in), run **one** of:
   - `claude mcp list` → the `meta` server appears as **connected** (after OAuth) and lists `mcp__meta__*` tools; OR
   - an Agent SDK smoke that starts a run and prints available tool names → confirm at least one `mcp__meta__*` tool is present.
3. **Fallback if it does NOT load:** swap the key `"type"` → `"transport"` (i.e. `{ "transport": "http", "url": "https://mcp.facebook.com/ads" }`) and re-run step 2. Try `type` first, then `transport`. Apply whichever shape loads tools to BOTH `.mcp.json` files (this task + Task A2). Do NOT proceed past Phase A until `mcp__meta__*` tools load — every downstream task assumes they exist.

> Why a hard gate (not graceful): unlike Notion/Canva (whose absence just degrades a skill to text), if the Meta server entry is malformed the agent gets zero `mcp__meta__*` tools, `sincronizar-meta` can never write `insights.json`, and the entire Resultados dashboard is permanently empty. A `readMcpStatus` key-check passing does NOT prove the tools loaded — this step does.

**Commit (plugin repo):** `feat(mcp): add official Meta Ads MCP server (read-only OAuth)`

### Task A2 — Seed the client workspace with the Meta MCP
**File:** `~/Documents/Magnus/magnus-os-plugin/template/.mcp.json` (**new** — there is none today; `install.sh` copies `template/.` into the workspace, and the painel reads `.mcp.json` from `templateRoot`).

```json
{
  "mcpServers": {
    "meta": {
      "type": "http",
      "url": "https://mcp.facebook.com/ads"
    }
  }
}
```

> Rationale (grounded): `install.sh:53` does `cp -R "$DIST/template/." "$WS/"`, and `WS` is passed to the painel as `MAGNUS_PAINEL_CWD` → `templateRoot()`. `lib/notion.ts readMcpStatus()` + `lib/runs-runtime.ts loadTemplateMcpServers()` both read `templateRoot()/.mcp.json`. Without this file, fresh installs would have no `.mcp.json` and the painel would always say "disconnected".

**Verify:** `python3 -m json.tool template/.mcp.json` → OK.

**Commit (plugin repo):** `feat(template): seed workspace .mcp.json with Meta server`

### Task A3 — Painel: teach `readMcpStatus` about `meta`
**File:** `lib/types.ts` — extend `McpStatus`:

```ts
export interface McpStatus {
  notion: "disconnected" | "authenticating" | "authenticated";
  canva: "disconnected" | "authenticating" | "authenticated";
  meta: "disconnected" | "authenticating" | "authenticated";
}
```

**File:** `lib/notion.ts` — in `readMcpStatus()` initialize and detect `meta`:

```ts
const status: McpStatus = { notion: "disconnected", canva: "disconnected", meta: "disconnected" };
// ...inside try, after canva:
if (servers.meta) status.meta = "authenticated";
```

**Verify:** `npx tsc --noEmit` → no errors (the store/component compile errors from the widened `McpStatus` are fixed in later tasks; if tsc flags `store.ts` mcps init, jump to Task A4 first then re-run).

**Commit:** `feat(meta): report Meta MCP status from .mcp.json`

### Task A4 — Painel store: seed `meta` in mcps default + widen `activeTab`
**File:** `lib/store.ts`
- Default `mcps`: `mcps: { notion: "disconnected", canva: "disconnected", meta: "disconnected" },`
- `activeTab` type: `Record<string, "overview" | "tasks" | "results">` (in interface AND in `setActiveTab` signature both places).

```ts
// interface AppState
activeTab: Record<string, "overview" | "tasks" | "results">;
setActiveTab: (slug: string, tab: "overview" | "tasks" | "results") => void;
```

**Verify:** `npx tsc --noEmit` → store no longer errors.

**Commit:** `feat(meta): add results tab + meta mcp to store`

### Task A5 — Extend the connect banner to `meta`
**File:** `components/NotionConnectBanner.tsx`

> ⚠️ This component declares its OWN local types — it does NOT import `McpStatus`/`ServerKey` from `lib/types`. You must edit THREE things in this file (the `lib/types.ts` change from A3 does NOT propagate here):

1. **Local `McpStatus` interface** (~L6-9) — add the `meta` line:
```ts
interface McpStatus {
  notion: "disconnected" | "authenticating" | "authenticated";
  canva: "disconnected" | "authenticating" | "authenticated";
  meta: "disconnected" | "authenticating" | "authenticated";
}
```
2. **`ServerKey`** (~L11):
```ts
type ServerKey = "notion" | "canva" | "meta";
```
3. **`SERVER_LABELS`** (~L13) — add a `meta` entry:
```ts
meta: {
  name: "Meta",
  usedBy: "sincronizar-meta",
  whyMessage:
    "A skill `sincronizar-meta` lê os resultados dos seus anúncios via MCP oficial da Meta (somente leitura, OAuth pelo Business Manager — sem app de desenvolvedor, sem colar token). Conecte uma vez pra ver os números na aba Resultados.",
},
```
- The `fetchStatus()` reads `/api/notion/_status` which returns the full status object (now incl. `meta`) — no change needed there. The `handleConnect()` POSTs `{ server }` to `/api/mcp/connect`, which already opens Terminal with the server name interpolated — works for `"meta"` unchanged.

**File:** `components/MetaConnectBanner.tsx` (**new**) — thin, page-level wrapper so the page reads cleanly:

```tsx
"use client";

import { MCPConnectBanner } from "./NotionConnectBanner";

/** Onboarding "Conecte a Meta" — reusa o fluxo Terminal+/mcp do MCPConnectBanner. */
export function MetaConnectBanner() {
  return <MCPConnectBanner server="meta" />;
}
```

**Verify:** `npx tsc --noEmit` → OK.

**Commit:** `feat(meta): add Conecte a Meta onboarding banner`

---

## Phase B — Types + pure logic (strict TDD)

### Task B1 — Meta types (schema §5, byte-for-byte)
**File:** `lib/meta-types.ts` (**new**). These mirror spec §5 exactly — keys and shapes must match what the skill writes.

```ts
/** Tipos do contrato file-first da Meta (spec §5). NÃO desviar das chaves. */

export interface MetaCampaignSummary {
  name: string;
  spend: number;
  results: number;
  cpa: number;
  roas: number;
  revenue: number;
}

export interface MetaFunnel {
  hook_rate: number;
  hold_rate: number;
  ctr_outbound: number;
}

export interface MetaAdRow {
  ad_id: string;
  name: string;
  thumb: string;
  spend: number;
  hook_rate: number;
  ctr: number;
  cpa: number;
  roas: number;
}

export interface MetaPeriod {
  since: string;
  until: string;
}

/** operacao/<slug>/meta/insights.json */
export interface MetaInsights {
  synced_at: string;
  account_id: string;
  campaign: MetaCampaignSummary;
  funnel: MetaFunnel;
  margin: number;
  breakeven_roas: number;
  ads: MetaAdRow[];
  period: MetaPeriod;
}

/** operacao/<slug>/meta/link.json */
export interface MetaLink {
  account_id: string;
  meta_campaign_ids: string[];
  linked_at: string;
  match_confidence: "auto" | "manual";
}
```

> **M5:** there is intentionally **no** `BmCampaign` type. The BM↔campaign association is chat-driven (the skill writes `link.json`); the painel never reads the BM list, so a type for it would be dead code (YAGNI). See the M5 deviation note in Architecture.

**Verify:** `npx tsc --noEmit` → OK (types-only, no runtime).

**Commit:** `feat(meta): file-first types matching spec schemas`

### Task B2 — TDD formatters: write failing test
**File:** `lib/meta-format.test.ts` (**new**). Write specs BEFORE the implementation.

```ts
import { describe, it, expect } from "vitest";
import {
  brl, pct, roasX, relativeSince, pickWinnerAdId, sortAdsByRoas, isAboveBreakeven,
} from "./meta-format";
import type { MetaAdRow } from "./meta-types";

const ads: MetaAdRow[] = [
  { ad_id: "a", name: "A", thumb: "", spend: 980, hook_rate: 0.28, ctr: 0.014, cpa: 29, roas: 2.4 },
  { ad_id: "b", name: "B", thumb: "", spend: 1940, hook_rate: 0.41, ctr: 0.028, cpa: 18, roas: 5.1 },
  { ad_id: "c", name: "C", thumb: "", spend: 1420, hook_rate: 0.33, ctr: 0.019, cpa: 23, roas: 3.6 },
];

describe("brl", () => {
  it("formata reais sem centavos para inteiros", () => { expect(brl(4820)).toBe("R$ 4.820"); });
  it("mantém centavos quando há fração", () => { expect(brl(22.52)).toBe("R$ 22,52"); });
  it("trata 0 e null", () => { expect(brl(0)).toBe("R$ 0"); expect(brl(null)).toBe("—"); });
});

describe("pct", () => {
  it("0.34 → 34%", () => { expect(pct(0.34)).toBe("34%"); });
  it("0.021 → 2,1%", () => { expect(pct(0.021, 1)).toBe("2,1%"); });
  it("null → —", () => { expect(pct(null)).toBe("—"); });
});

describe("roasX", () => {
  it("3.8 → 3,8×", () => { expect(roasX(3.8)).toBe("3,8×"); });
  it("null → —", () => { expect(roasX(null)).toBe("—"); });
});

describe("relativeSince", () => {
  it("8 min atrás → 'há 8 min'", () => {
    const now = new Date("2026-06-01T12:08:00Z").getTime();
    expect(relativeSince("2026-06-01T12:00:00Z", now)).toBe("há 8 min");
  });
  it("< 1 min → 'agora'", () => {
    const now = new Date("2026-06-01T12:00:30Z").getTime();
    expect(relativeSince("2026-06-01T12:00:00Z", now)).toBe("agora");
  });
  it(">= 60 min → horas", () => {
    const now = new Date("2026-06-01T14:00:00Z").getTime();
    expect(relativeSince("2026-06-01T12:00:00Z", now)).toBe("há 2 h");
  });
  it("input inválido → ''", () => { expect(relativeSince("", Date.now())).toBe(""); });
});

describe("sortAdsByRoas + winner", () => {
  it("ordena desc por roas", () => {
    expect(sortAdsByRoas(ads).map((a) => a.ad_id)).toEqual(["b", "c", "a"]);
  });
  it("vencedor = maior roas", () => { expect(pickWinnerAdId(ads)).toBe("b"); });
  it("lista vazia → winner null", () => { expect(pickWinnerAdId([])).toBeNull(); });
});

describe("isAboveBreakeven", () => {
  it("roas acima do break-even", () => { expect(isAboveBreakeven(3.8, 1.11)).toBe(true); });
  it("abaixo", () => { expect(isAboveBreakeven(0.9, 1.11)).toBe(false); });
});
```

**Run (expect FAIL):** `npm test -- meta-format` → fails to import `./meta-format` (module not found). Expected.

### Task B3 — TDD formatters: implement to green
**File:** `lib/meta-format.ts` (**new**). Pure, client-safe (no `fs`).

```ts
import type { MetaAdRow } from "./meta-types";

const EM_DASH = "—";

/** Reais. Inteiro → sem centavos; fração → 2 casas. null/NaN → travessão. */
export function brl(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return EM_DASH;
  const hasCents = Math.round(v * 100) % 100 !== 0;
  const formatted = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  }).format(v);
  return `R$ ${formatted}`;
}

/** Fração (0..1) → "NN%". `decimals` casas decimais (default 0). null → travessão. */
export function pct(v: number | null | undefined, decimals = 0): string {
  if (v == null || Number.isNaN(v)) return EM_DASH;
  const n = v * 100;
  const s = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
  return `${s}%`;
}

/** ROAS → "N,N×". null → travessão. */
export function roasX(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return EM_DASH;
  const s = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(v);
  return `${s}×`;
}

/** "há N min" / "há N h" / "agora" a partir de um ISO timestamp. Inválido → "". */
export function relativeSince(iso: string, nowMs: number = Date.now()): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const diffMin = Math.floor((nowMs - t) / 60000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `há ${diffMin} min`;
  const h = Math.floor(diffMin / 60);
  return `há ${h} h`;
}

/** Cópia ordenada desc por ROAS (estável p/ empates via ad_id). */
export function sortAdsByRoas(ads: MetaAdRow[]): MetaAdRow[] {
  return [...ads].sort((a, b) => (b.roas - a.roas) || a.ad_id.localeCompare(b.ad_id));
}

/** ad_id do maior ROAS, ou null se vazio. */
export function pickWinnerAdId(ads: MetaAdRow[]): string | null {
  const sorted = sortAdsByRoas(ads);
  return sorted.length > 0 ? sorted[0].ad_id : null;
}

/** ROAS >= break-even → acima (margem positiva). */
export function isAboveBreakeven(roas: number, breakeven: number): boolean {
  return roas >= breakeven;
}
```

**Run (expect PASS):** `npm test -- meta-format` → all green.

**Commit:** `feat(meta): pure formatters for dashboard (TDD)`

### Task B4 — TDD readers: write failing test
**File:** `lib/meta.test.ts` (**new**). Mirror `paths.test.ts` (temp dir + `MAGNUS_PAINEL_CWD`).

```ts
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readInsights, readMetaLink, readSyncedAt, isStale } from "./meta";
import { getMetaStaleMinutes } from "./meta-stale";

const SAVED = { cwd: process.env.MAGNUS_PAINEL_CWD, stale: process.env.MAGNUS_META_STALE_MIN };
let tmp: string;

function writeMeta(slug: string, file: string, body: string) {
  const dir = path.join(tmp, "operacao", slug, "meta");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, file), body);
}

// I3 — fixture self-consistente: breakeven_roas = round(1/margin, 2).
// margin 0.77 → 1/0.77 = 1.2987 → 1.30 (bate com o mockup locked dash-b.png).
const VALID_INSIGHTS = JSON.stringify({
  synced_at: "2026-06-01T12:00:00Z",
  account_id: "act_1182",
  campaign: { name: "VC | Diagnóstico", spend: 4820, results: 214, cpa: 22.52, roas: 3.8, revenue: 18316 },
  funnel: { hook_rate: 0.34, hold_rate: 0.52, ctr_outbound: 0.021 },
  margin: 0.77,
  breakeven_roas: 1.3,
  ads: [{ ad_id: "b", name: "Reels-depoimento-01", thumb: "", spend: 1940, hook_rate: 0.41, ctr: 0.028, cpa: 18, roas: 5.1 }],
  period: { since: "2026-05-25", until: "2026-06-01" },
});

beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), "magnus-meta-")); process.env.MAGNUS_PAINEL_CWD = tmp; });
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
  if (SAVED.cwd === undefined) delete process.env.MAGNUS_PAINEL_CWD; else process.env.MAGNUS_PAINEL_CWD = SAVED.cwd;
  if (SAVED.stale === undefined) delete process.env.MAGNUS_META_STALE_MIN; else process.env.MAGNUS_META_STALE_MIN = SAVED.stale;
});

describe("readInsights", () => {
  it("lê e valida insights.json válido", () => {
    writeMeta("cap", "insights.json", VALID_INSIGHTS);
    const got = readInsights("cap");
    expect(got?.campaign.spend).toBe(4820);
    expect(got?.ads).toHaveLength(1);
  });
  it("ausente → null", () => { expect(readInsights("cap")).toBeNull(); });
  it("JSON inválido → null", () => { writeMeta("cap", "insights.json", "{ nope"); expect(readInsights("cap")).toBeNull(); });
  it("faltando campo obrigatório → null", () => { writeMeta("cap", "insights.json", JSON.stringify({ account_id: "x" })); expect(readInsights("cap")).toBeNull(); });
  it("slug com traversal → null", () => { expect(readInsights("../../etc")).toBeNull(); });
});

describe("readMetaLink", () => {
  it("lê link.json válido", () => {
    writeMeta("cap", "link.json", JSON.stringify({ account_id: "act_1", meta_campaign_ids: ["1"], linked_at: "x", match_confidence: "manual" }));
    expect(readMetaLink("cap")?.meta_campaign_ids).toEqual(["1"]);
  });
  it("ausente → null", () => { expect(readMetaLink("cap")).toBeNull(); });
});

describe("readSyncedAt", () => {
  it("vem do insights.json", () => { writeMeta("cap", "insights.json", VALID_INSIGHTS); expect(readSyncedAt("cap")).toBe("2026-06-01T12:00:00Z"); });
  it("fallback p/ arquivo synced_at", () => { writeMeta("cap", "synced_at", "2026-06-01T10:00:00Z\n"); expect(readSyncedAt("cap")).toBe("2026-06-01T10:00:00Z"); });
  it("nada → null", () => { expect(readSyncedAt("cap")).toBeNull(); });
});

describe("isStale", () => {
  it("> N min → stale", () => { expect(isStale("2026-06-01T12:00:00Z", 30, new Date("2026-06-01T12:31:00Z").getTime())).toBe(true); });
  it("<= N min → fresh", () => { expect(isStale("2026-06-01T12:00:00Z", 30, new Date("2026-06-01T12:20:00Z").getTime())).toBe(false); });
  it("null → stale (precisa puxar)", () => { expect(isStale(null, 30, Date.now())).toBe(true); });
});

describe("getMetaStaleMinutes", () => {
  it("default 30", () => { delete process.env.MAGNUS_META_STALE_MIN; expect(getMetaStaleMinutes()).toBe(30); });
  it("override por env", () => { process.env.MAGNUS_META_STALE_MIN = "15"; expect(getMetaStaleMinutes()).toBe(15); });
  it("valor inválido → 30", () => { process.env.MAGNUS_META_STALE_MIN = "abc"; expect(getMetaStaleMinutes()).toBe(30); });
});

// I4 — números codificados como string (bug recorrente: "Tiny API lies about types").
// Uma MCP/skill pode gravar "4820" em vez de 4820. O reader deve coagir números na leitura
// (Number(...)) OU rejeitar o arquivo — nunca deixar string vazar pros formatters/sort.
describe("readInsights — numéricos string-encoded (I4)", () => {
  it("coage spend/cpa/roas/results + ads numéricos de string p/ number", () => {
    writeMeta("cap", "insights.json", JSON.stringify({
      synced_at: "2026-06-01T12:00:00Z",
      account_id: "act_1182",
      campaign: { name: "VC", spend: "4820", results: "214", cpa: "22.52", roas: "3.8", revenue: "18316" },
      funnel: { hook_rate: "0.34", hold_rate: "0.52", ctr_outbound: "0.021" },
      margin: "0.77",
      breakeven_roas: "1.30",
      ads: [{ ad_id: "b", name: "Reels", thumb: "", spend: "1940", hook_rate: "0.41", ctr: "0.028", cpa: "18", roas: "5.1" }],
      period: { since: "2026-05-25", until: "2026-06-01" },
    }));
    const got = readInsights("cap");
    expect(got).not.toBeNull();
    // tipos coagidos
    expect(typeof got!.campaign.spend).toBe("number");
    expect(got!.campaign.spend).toBe(4820);
    expect(typeof got!.campaign.roas).toBe("number");
    expect(got!.breakeven_roas).toBe(1.3);
    expect(typeof got!.ads[0].roas).toBe("number");
    expect(got!.ads[0].roas).toBe(5.1);
    expect(typeof got!.funnel.hook_rate).toBe("number");
  });
  it("string não-numérica num campo obrigatório → null", () => {
    writeMeta("cap", "insights.json", JSON.stringify({
      synced_at: "2026-06-01T12:00:00Z", account_id: "act_1",
      campaign: { name: "X", spend: "abc", results: 1, cpa: 1, roas: 1, revenue: 1 },
      funnel: { hook_rate: 0, hold_rate: 0, ctr_outbound: 0 },
      margin: 0.9, breakeven_roas: 1.11, ads: [], period: { since: "a", until: "b" },
    }));
    expect(readInsights("cap")).toBeNull();
  });
});
```

> **I4:** the `VALID_INSIGHTS` fixture above already obeys `breakeven_roas = round(1/margin, 2)` — bump it to `margin: 0.77` / `breakeven_roas: 1.3` so it matches the locked mockup and the assertions in the existing `readInsights` specs stay consistent (update `VALID_INSIGHTS` accordingly when you write the file).

**Run (expect FAIL):** `npm test -- meta.test meta-stale` → fails (modules missing).

### Task B5 — Implement `lib/meta-stale.ts` to green
**File:** `lib/meta-stale.ts` (**new**).

```ts
/** Minutos de tolerância antes de considerar insights "velho" (auto-refresh). Default 30. */
export function getMetaStaleMinutes(): number {
  const raw = process.env.MAGNUS_META_STALE_MIN;
  if (raw == null) return 30;
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : 30;
}
```

### Task B6 — Implement `lib/meta.ts` to green
**File:** `lib/meta.ts` (**new**). Server-side; guards path traversal like `run-outputs.ts`. Per **I4**, the reader is the single trust boundary: it coerces every numeric field via `Number(...)` on read (accepting `number` OR numeric string) and rejects the file (→ `null`) if any required numeric is non-coercible. Because the reader always returns `number`s, the downstream `meta-format.ts` formatters and `sortAdsByRoas` are guaranteed to operate on numbers, never strings — no string can reach `b.roas - a.roas`.

```ts
import fs from "node:fs";
import path from "node:path";
import { operacaoDir } from "./paths";
import type { MetaInsights, MetaLink, MetaCampaignSummary, MetaFunnel, MetaAdRow } from "./meta-types";

/** Resolve operacao/<slug>/meta/<file> bloqueando traversal. null se sair de operacao/. */
function metaFilePath(slug: string, file: string): string | null {
  const root = operacaoDir();
  const base = path.resolve(root, slug, "meta");
  if (!slug || (!base.startsWith(root + path.sep) && base !== root)) return null;
  return path.join(base, file);
}

function readJson<T>(fp: string | null): T | null {
  if (!fp || !fs.existsSync(fp)) return null;
  try { return JSON.parse(fs.readFileSync(fp, "utf8")) as T; } catch { return null; }
}

/**
 * I4 — coerção numérica defensiva (bug recorrente "Tiny API lies about types": uma fonte
 * pode gravar "4820" em vez de 4820). Aceita number OU string numérica; qualquer outra coisa
 * (string não-numérica, null, undefined) → NaN, que reprova a validação e zera o arquivo.
 */
function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

function coerceCampaign(o: Record<string, unknown>): MetaCampaignSummary {
  return {
    name: String(o.name ?? ""),
    spend: num(o.spend), results: num(o.results), cpa: num(o.cpa),
    roas: num(o.roas), revenue: num(o.revenue),
  };
}
function coerceFunnel(o: Record<string, unknown>): MetaFunnel {
  return { hook_rate: num(o.hook_rate), hold_rate: num(o.hold_rate), ctr_outbound: num(o.ctr_outbound) };
}
function coerceAd(o: Record<string, unknown>): MetaAdRow {
  return {
    ad_id: String(o.ad_id ?? ""), name: String(o.name ?? ""), thumb: String(o.thumb ?? ""),
    spend: num(o.spend), hook_rate: num(o.hook_rate), ctr: num(o.ctr), cpa: num(o.cpa), roas: num(o.roas),
  };
}

const numbersOk = (...xs: number[]) => xs.every((n) => Number.isFinite(n));

/**
 * Parseia + valida + coage o insights.json p/ MetaInsights tipado. Numéricos vêm sempre como
 * `number` no retorno (I4). Qualquer campo obrigatório ausente ou não-coercível → null.
 * O painel CONFIA em `breakeven_roas` como escrito (a skill é a fonte única; o painel não recalcula).
 */
function parseInsights(x: unknown): MetaInsights | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.synced_at !== "string" || typeof o.account_id !== "string") return null;
  if (typeof o.campaign !== "object" || o.campaign === null) return null;
  if (typeof o.funnel !== "object" || o.funnel === null) return null;
  if (!Array.isArray(o.ads)) return null;
  if (typeof o.period !== "object" || o.period === null) return null;

  const campaign = coerceCampaign(o.campaign as Record<string, unknown>);
  const funnel = coerceFunnel(o.funnel as Record<string, unknown>);
  const margin = num(o.margin);
  const breakeven_roas = num(o.breakeven_roas);
  const ads = (o.ads as unknown[]).map((a) => coerceAd((a ?? {}) as Record<string, unknown>));
  const period = o.period as { since?: unknown; until?: unknown };

  // reprova se qualquer numérico obrigatório virou NaN (ex.: spend: "abc")
  if (!numbersOk(campaign.spend, campaign.results, campaign.cpa, campaign.roas, campaign.revenue)) return null;
  if (!numbersOk(funnel.hook_rate, funnel.hold_rate, funnel.ctr_outbound)) return null;
  if (!numbersOk(margin, breakeven_roas)) return null;
  if (ads.some((a) => !numbersOk(a.spend, a.hook_rate, a.ctr, a.cpa, a.roas))) return null;

  return {
    synced_at: o.synced_at, account_id: o.account_id, campaign, funnel,
    margin, breakeven_roas, ads,
    period: { since: String(period.since ?? ""), until: String(period.until ?? "") },
  };
}

export function readInsights(slug: string): MetaInsights | null {
  return parseInsights(readJson<unknown>(metaFilePath(slug, "insights.json")));
}

export function readMetaLink(slug: string): MetaLink | null {
  const parsed = readJson<MetaLink>(metaFilePath(slug, "link.json"));
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as MetaLink).meta_campaign_ids)) return null;
  return parsed;
}

/** synced_at do insights.json; fallback pro arquivo `synced_at`. null se nenhum. */
export function readSyncedAt(slug: string): string | null {
  const ins = readInsights(slug);
  if (ins?.synced_at) return ins.synced_at;
  const fp = metaFilePath(slug, "synced_at");
  if (fp && fs.existsSync(fp)) {
    const raw = fs.readFileSync(fp, "utf8").trim();
    return raw || null;
  }
  return null;
}

/** true se synced_at é mais velho que `minutes` (ou null). */
export function isStale(syncedAt: string | null, minutes: number, nowMs: number = Date.now()): boolean {
  if (!syncedAt) return true;
  const t = Date.parse(syncedAt);
  if (Number.isNaN(t)) return true;
  return (nowMs - t) / 60000 > minutes;
}
```

**Run (expect PASS):** `npm test -- meta.test meta-stale` → green. Then `npm test` → **all** suites green.

**Commit:** `feat(meta): server readers for insights/link with validation (TDD)`

### Task B7 — Add the `meta` module flag (TDD)
**File:** `lib/modules.test.ts` — extend the default + override specs:
- In "default" expect: add `meta: true` to the expected object.
- Add a spec: `process.env.MAGNUS_MODULE_META = "false"` → `getModules().meta === false`.
- Update the `KEYS` array to include `"MAGNUS_MODULE_META"`.

**Run (expect FAIL):** `npm test -- modules` → fails (no `meta` key yet).

**File:** `lib/modules.ts`:
```ts
export interface ModuleFlags {
  tarefas: boolean;
  criarPost: boolean;
  notion: boolean;
  canva: boolean;
  meta: boolean;
}

const DEFAULTS: ModuleFlags = { tarefas: false, criarPost: false, notion: false, canva: false, meta: true };

// inside getModules() return object:
    meta: envBool("MAGNUS_MODULE_META", DEFAULTS.meta),
```

> Note: `meta` defaults **true** (headline feature) — unlike the Inc 0 four. The `filterSkillsByModules` MODULE_GATE does **not** gate `sincronizar-meta` (it's always visible when meta is on; gating happens at the tab/banner level via `modules.meta` in the page).

**Run (expect PASS):** `npm test -- modules` → green.

**Commit:** `feat(meta): add meta module flag (default on)`

---

## Phase C — Read API + page wiring

### Task C1 — `GET /api/meta` read endpoint
**File:** `app/api/meta/route.ts` (**new**).

```ts
import { NextResponse } from "next/server";
import { readInsights, readMetaLink, readSyncedAt, isStale } from "@/lib/meta";
import { getMetaStaleMinutes } from "@/lib/meta-stale";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "slug obrigatório" }, { status: 400 });

  const insights = readInsights(slug);
  const link = readMetaLink(slug);
  const syncedAt = readSyncedAt(slug);
  const staleMinutes = getMetaStaleMinutes();

  // I1 — "conectado" = vínculo/sync REAL (link.json ou insights.json), NÃO a chave .mcp.json.
  // `readMcpStatus().meta` reportaria "authenticated" assim que a chave existe (semeada no
  // install), o que tornaria o estado "disconnected" inalcançável. Mesma regra do client (D3).
  const connected = link != null || insights != null;

  return NextResponse.json({
    connected,
    insights,
    link,
    syncedAt,
    stale: isStale(syncedAt, staleMinutes),
    staleMinutes,
  });
}
```

> **I1 note:** the `.mcp.json` `meta` key still drives the **`MetaConnectBanner`** onboarding (via `readMcpStatus`, Task A3/A5) — that's correct: the banner is about "is the MCP server configured/authorized so a sync CAN run". But the **Resultados connection state** (`metaConnected`/`connected`) is a different question — "has a real sync/link happened yet" — and must be driven by `link.json`/`insights.json`, not the seeded key. Keep the two concerns separate.

**Verify:** `npx tsc --noEmit` → OK.

**Commit:** `feat(meta): GET /api/meta read endpoint (file-first)`

### Task C2 — Add the `ResultsTabState` type
**File:** `lib/types.ts` — add after `NotionTabState`:

```ts
export type ResultsTabState =
  | { kind: "disconnected" }                         // Meta MCP não configurado
  | { kind: "no-link"; slug: string }                // conectado, sem link.json (precisa associar BM)
  | { kind: "no-data"; slug: string }                // linkado, sem insights ainda (precisa sincronizar)
  | { kind: "ready"; slug: string }                  // tem insights.json → renderiza dashboard
  | { kind: "syncing"; slug: string }                // run de sincronização em andamento
  | { kind: "error"; slug: string; reason: string }; // falha na puxada
```

**Verify:** `npx tsc --noEmit` → OK.

**Commit:** `feat(meta): results tab state union`

### Task C3 — Page passes meta data + renders banner
**File:** `app/c/[slug]/page.tsx`
- Imports: add `import { MetaConnectBanner } from "@/components/MetaConnectBanner";` and `import { readInsights, readMetaLink, readSyncedAt, isStale } from "@/lib/meta";` and `import { getMetaStaleMinutes } from "@/lib/meta-stale";`.
- After `const modules = getModules();` compute:
```tsx
  const metaInsights = readInsights(slug);
  const metaLink = readMetaLink(slug);
  const metaSyncedAt = readSyncedAt(slug);
  const metaStaleMinutes = getMetaStaleMinutes();
  const metaStale = isStale(metaSyncedAt, metaStaleMinutes);
```
- Render the banner alongside the others, gated by the flag:
```tsx
      {modules.meta && <MetaConnectBanner />}
```
- Pass new props to `CampaignWorkspace`:
```tsx
      <CampaignWorkspace
        campaign={campaign}
        initialTabState={tabState}
        skills={skills}
        modules={modules}
        meta={{ insights: metaInsights, link: metaLink, syncedAt: metaSyncedAt, stale: metaStale }}
      />
```

**Verify:** `npx tsc --noEmit` → will error until `CampaignWorkspace` accepts the `meta` prop (next task). Proceed to C4 then re-run.

---

## Phase D — UI: tab + dashboard (variant B, locked layout)

### Task D1 — Add the `barChart` icon
**File:** `components/icons.tsx`
- Add `BarChart3` to the lucide import block (with the other imports).
- Add to the `Icons` object: `barChart: make(BarChart3),`

**Verify:** `npx tsc --noEmit` (icon usage compiles).

**Commit:** `feat(icons): add barChart for Resultados tab`

### Task D2 — `ResultadosTab.tsx` (the dashboard)
**File:** `components/ResultadosTab.tsx` (**new**). Renders strictly from `insights.json`, matching the locked variant-B mockup `dash-b.png`: sub-header (account + BM campaign + "sincronizado há N min" + period control + Atualizar) → 4-card KPI band (Gasto, Leads, Custo/lead, ROAS w/ break-even) → 3 funnel cards (Atenção/Engajamento/Conversão) → ad table ranked by ROAS (thumb+name+spend+hook+CTR+CPA+ROAS, "vencedor" pill, ROAS colored above break-even) → drill-down affordance line with the "gerar variação do vencedor" stub.

```tsx
"use client";

import { useState } from "react";
import { Icons } from "@/components/icons";
import { Pill } from "@/components/Pill";
import type { MetaInsights, MetaLink } from "@/lib/meta-types";
import type { ResultsTabState } from "@/lib/types";
import {
  brl, pct, roasX, relativeSince, sortAdsByRoas, pickWinnerAdId, isAboveBreakeven,
} from "@/lib/meta-format";

interface Props {
  state: ResultsTabState;
  insights: MetaInsights | null;
  link: MetaLink | null;
  syncedAt: string | null;
  onConnect: () => void;
  onSync: () => void;
  /** Stub Inc 2c — recebe o ad_id do vencedor. */
  onGerarVariacao: (winnerAdId: string) => void;
}

const PERIODS = ["últimos 7 dias", "últimos 14 dias", "últimos 30 dias"] as const;

export function ResultadosTab({ state, insights, link, syncedAt, onConnect, onSync, onGerarVariacao }: Props) {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>("últimos 7 dias");

  // ----- estados não-ready -----
  if (state.kind === "disconnected") {
    return (
      <ResultsEmpty
        icon={<Icons.plug />}
        title="Conecte a Meta pra ver resultados"
        sub="Os números dos seus anúncios aparecem aqui depois de conectar (somente leitura, OAuth pelo Business Manager)."
        actionLabel="Conectar Meta"
        onAction={onConnect}
      />
    );
  }
  if (state.kind === "no-link") {
    return (
      <ResultsEmpty
        icon={<Icons.link />}
        title="Associe esta campanha a uma campanha da Meta"
        sub="Rode Atualizar — a IA lista suas campanhas do Business Manager e sugere a correspondência pelo nome. Você confirma e pronto."
        actionLabel="Atualizar"
        onAction={onSync}
      />
    );
  }
  if (state.kind === "no-data") {
    return (
      <ResultsEmpty
        icon={<Icons.barChart />}
        title="Sem dados ainda"
        sub="Clique em Atualizar pra puxar os primeiros resultados da Meta."
        actionLabel="Atualizar"
        onAction={onSync}
      />
    );
  }
  if (state.kind === "syncing") {
    return (
      <div className="empty" style={{ padding: 48 }}>
        <div className="empty__title" style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center" }}>
          <span className="tool-pill__spinner" /> Sincronizando com a Meta…
        </div>
        <div className="empty__sub">A IA está puxando os insights dos anúncios. Isso leva alguns segundos.</div>
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <ResultsEmpty
        icon={<Icons.warn />}
        title="Não consegui puxar os resultados"
        sub={state.reason}
        actionLabel="Tentar de novo"
        onAction={onSync}
      />
    );
  }

  // ----- ready -----
  if (!insights) {
    return (
      <ResultsEmpty icon={<Icons.barChart />} title="Sem dados ainda" sub="Clique em Atualizar." actionLabel="Atualizar" onAction={onSync} />
    );
  }

  const { campaign, funnel, breakeven_roas, account_id, ads } = insights;
  const ranked = sortAdsByRoas(ads);
  const winnerId = pickWinnerAdId(ads);
  const acctShort = account_id.length > 10 ? `${account_id.slice(0, 8)}…` : account_id;
  const sinceLabel = relativeSince(syncedAt ?? insights.synced_at);

  return (
    <div style={{ padding: "20px 32px", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* sub-header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span className="meta-line" style={{ flex: 1, minWidth: 0 }}>
          conta {acctShort}
          {link?.meta_campaign_ids?.length ? <> · campanha BM {`"${campaign.name}"`}</> : null}
          {sinceLabel ? <> · sincronizado {sinceLabel}</> : null}
        </span>
        <label className="meta-line" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <select
            className="input mono"
            style={{ height: 28, padding: "0 8px", fontSize: 12 }}
            value={period}
            onChange={(e) => setPeriod(e.target.value as (typeof PERIODS)[number])}
          >
            {PERIODS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <button className="btn btn--ghost btn--sm" type="button" onClick={onSync}>
          <Icons.refresh size={13} /> Atualizar
        </button>
      </div>

      {/* KPI band */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        <KpiCard label="Gasto" value={brl(campaign.spend)} />
        <KpiCard label="Leads" value={new Intl.NumberFormat("pt-BR").format(campaign.results)} />
        <KpiCard label="Custo / lead" value={brl(campaign.cpa)} />
        <KpiCard
          label="ROAS"
          value={roasX(campaign.roas)}
          foot={`break-even ${roasX(breakeven_roas)}`}
          footPositive={isAboveBreakeven(campaign.roas, breakeven_roas)}
        />
      </div>

      {/* Funnel strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        <FunnelCard eyebrow="Atenção · hook rate" value={pct(funnel.hook_rate)} />
        <FunnelCard eyebrow="Engajamento · hold / CTR" value={`${pct(funnel.hold_rate)} · ${pct(funnel.ctr_outbound, 1)}`} />
        <FunnelCard eyebrow="Conversão · CPA / ROAS" value={`${brl(campaign.cpa)} · ${roasX(campaign.roas)}`} />
      </div>

      {/* Ad table */}
      <div className="card" style={{ overflow: "hidden" }}>
        <div className="card__head">
          <span style={{ color: "var(--accent)" }}><Icons.image /></span>
          <h3 className="card__head__title">Anúncios — ranqueados por ROAS</h3>
          <span className="spacer" />
          <span className="card__head__count tnum">{ranked.length} ativos</span>
        </div>
        <table className="meta-table" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr className="meta-line" style={{ textAlign: "left" }}>
              <th style={{ padding: "8px 0", fontWeight: 500 }}>Criativo</th>
              <Th>Gasto</Th><Th>Hook</Th><Th>CTR</Th><Th>CPA</Th><Th>ROAS</Th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((ad) => {
              const isWinner = ad.ad_id === winnerId;
              const above = isAboveBreakeven(ad.roas, breakeven_roas);
              return (
                <tr key={ad.ad_id} style={{ borderTop: "1px solid var(--border-faint)" }}>
                  <td style={{ padding: "12px 0" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <AdThumb ad={ad} />
                      <span>{ad.name}</span>
                      {isWinner && <Pill variant="accent">vencedor</Pill>}
                    </div>
                  </td>
                  <Td>{brl(ad.spend)}</Td>
                  <Td>{pct(ad.hook_rate)}</Td>
                  <Td>{pct(ad.ctr, 1)}</Td>
                  <Td>{brl(ad.cpa)}</Td>
                  <Td style={{ color: above ? "var(--accent)" : undefined }}>{roasX(ad.roas)}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="meta-line" style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span>clique num anúncio → adset → criativo</span>
          {winnerId && (
            <button className="btn btn--ghost btn--sm" type="button" onClick={() => onGerarVariacao(winnerId)}>
              <Icons.spark size={12} /> gerar variação do vencedor
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---- subcomponentes (puro JSX, sem lógica) ---- */
function KpiCard({ label, value, foot, footPositive }: { label: string; value: string; foot?: string; footPositive?: boolean }) {
  return (
    <div className="card" style={{ padding: 18 }}>
      <div className="meta-line" style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div className="tnum" style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-0.02em", margin: "8px 0 4px" }}>{value}</div>
      {foot && <div className="meta-line" style={{ color: footPositive ? "var(--accent)" : "var(--text-secondary)" }}>{foot}</div>}
    </div>
  );
}
function FunnelCard({ eyebrow, value }: { eyebrow: string; value: string }) {
  return (
    <div className="card" style={{ padding: 18 }}>
      <div className="meta-line" style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}>{eyebrow}</div>
      <div className="tnum" style={{ fontSize: 24, fontWeight: 600, marginTop: 8 }}>{value}</div>
    </div>
  );
}
function AdThumb({ ad }: { ad: { thumb: string; name: string } }) {
  if (ad.thumb) {
    // thumb pode ser um relPath do workspace (servido por /api/files) ou uma URL absoluta.
    const src = /^https?:\/\//.test(ad.thumb) ? ad.thumb : `/api/files?p=${encodeURIComponent(ad.thumb)}`;
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={ad.name} width={32} height={32} style={{ borderRadius: 6, objectFit: "cover", background: "var(--surface-2)" }} />;
  }
  return <span style={{ width: 32, height: 32, borderRadius: 6, background: "var(--surface-2)", display: "inline-block" }} />;
}
function Th({ children }: { children: React.ReactNode }) {
  return <th className="meta-line" style={{ padding: "8px 0", fontWeight: 500, textAlign: "left" }}>{children}</th>;
}
function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <td className="tnum" style={{ padding: "12px 0", ...style }}>{children}</td>;
}
function ResultsEmpty({ icon, title, sub, actionLabel, onAction }: { icon: React.ReactNode; title: string; sub: string; actionLabel: string; onAction: () => void }) {
  return (
    <div className="empty" style={{ padding: 48, textAlign: "center" }}>
      <div style={{ color: "var(--accent)", display: "flex", justifyContent: "center", marginBottom: 10 }}>{icon}</div>
      <div className="empty__title">{title}</div>
      <div className="empty__sub" style={{ maxWidth: 460, margin: "6px auto 16px" }}>{sub}</div>
      <button className="btn btn--primary btn--sm" type="button" onClick={onAction}>{actionLabel}</button>
    </div>
  );
}
```

> CSS note: `.meta-table` and `--surface-2` may not pre-exist. The table works without a `.meta-table` rule (it's just a hook); if `--surface-2` is undefined the thumb falls back to transparent — acceptable. During QA-visual (Task E2) confirm against `dash-b.png`; if spacing differs, add a minimal `.meta-table th, .meta-table td` rule to the global stylesheet (the repo's `app/globals.css` or equivalent — locate via the existing `.card`/`.tabbar` rules) rather than inline. Do NOT introduce Tailwind.

**Verify:** `npx tsc --noEmit` → OK (assuming `Pill` accepts `variant="accent"` — confirmed in `CampaignWorkspace`).

**Commit:** `feat(meta): Resultados dashboard tab (variant B, file-first)`

### Task D3 — Wire the tab into `CampaignWorkspace`
**File:** `app/c/[slug]/CampaignWorkspace.tsx`
- Extend `Props`:
```tsx
import type { MetaInsights, MetaLink } from "@/lib/meta-types";
import type { ResultsTabState } from "@/lib/types";
import { ResultadosTab } from "@/components/ResultadosTab";
import { useStore } from "@/lib/store";

interface Props {
  campaign: Campaign;
  initialTabState: NotionTabState;
  skills: ParsedSkill[];
  modules: ModuleFlags;
  meta: { insights: MetaInsights | null; link: MetaLink | null; syncedAt: string | null; stale: boolean };
}
```
- In the component body, compute the effective tab allowing `"results"` and derive `resultsState`:
```tsx
  const rawTab = useStore((s) => s.activeTab[campaign.slug] ?? "overview");
  const showTasks = modules.tarefas;
  const showResults = modules.meta;
  const effectiveTab =
    rawTab === "results" && !showResults ? "overview"
    : rawTab === "tasks" && !showTasks ? "overview"
    : rawTab;
  const activeRun = useStore((s) => s.activeRun);
  const startRun = useStore((s) => s.startRun);
  const openSettings = useStore((s) => s.openSettings);

  // Resultados state machine (file-first; client computa a partir das props do server).
  //
  // I1 — `metaConnected` é REAL: dirigido pela presença de link.json/insights.json (escritos
  // por um sync de verdade), NÃO pela chave `meta` do .mcp.json. `readMcpStatus` reporta
  // "authenticated" no instante em que a chave existe (semeada no install) → usar mcps.meta
  // deixaria o estado "disconnected" + o MetaConnectBanner como UI morta. Só consideramos
  // conectado quando houve um vínculo/sync real.
  const metaConnected = meta.link != null || meta.insights != null;
  //
  // C3 — ORDENAÇÃO CRÍTICA (evita travar a aba em "Sincronizando…"):
  // Um turn concluído do SkillRunner seta status `awaiting-input` (NÃO `done`; `done` só no
  // fecho do SSE). Portanto `syncingMeta` só pode ser true em `starting`/`running` — incluir
  // `awaiting-input` faria a aba ficar presa no spinner pra sempre. E mais: assim que insights
  // FRESCOS existem (`meta.insights` && !meta.stale), `ready` VENCE qualquer estado de run.
  const syncingMeta =
    activeRun?.skillSlug === "sincronizar-meta" &&
    (activeRun.status === "starting" || activeRun.status === "running");
  const metaError = activeRun?.skillSlug === "sincronizar-meta" && activeRun.status === "error";
  const hasFreshInsights = meta.insights != null && !meta.stale;
  const resultsState: ResultsTabState =
    // insights frescos ganham de tudo (run pode estar tecnicamente "awaiting-input"/vivo)
    hasFreshInsights ? { kind: "ready", slug: campaign.slug }
    : syncingMeta ? { kind: "syncing", slug: campaign.slug }
    : metaError ? { kind: "error", slug: campaign.slug, reason: "A puxada falhou. Veja o chat da skill pra detalhes." }
    : !metaConnected ? { kind: "disconnected" }
    : meta.insights ? { kind: "ready", slug: campaign.slug }   // insights existem mas stale → ainda renderiza (auto-sync dispara em paralelo)
    : meta.link ? { kind: "no-data", slug: campaign.slug }
    : { kind: "no-link", slug: campaign.slug };

  function syncMeta() { startRun("sincronizar-meta", { campanha: campaign.slug }); }
```
- Add the tab spec + render branch. Replace the `TabBar` block:
```tsx
        <TabBar
          tabs={[
            { id: "overview", label: "Visão geral", icon: <Icons.layers size={12} /> },
            ...(showResults ? [{ id: "results", label: "Resultados", icon: <Icons.barChart size={12} /> }] : []),
            ...(showTasks ? [{ id: "tasks", label: "Tarefas", icon: <Icons.chess size={12} /> }] : []),
          ] as TabSpec[]}
          active={effectiveTab}
          onChange={(id) => setTab(campaign.slug, id as "overview" | "tasks" | "results")}
        />
```
- In the content switch, add the results branch (before the tasks branch):
```tsx
          {effectiveTab === "overview" ? (
            <OverviewTab campaign={campaign} modules={modules} />
          ) : effectiveTab === "results" ? (
            <ResultadosTab
              state={resultsState}
              insights={meta.insights}
              link={meta.link}
              syncedAt={meta.syncedAt}
              onConnect={() => openSettings()}
              onSync={syncMeta}
              onGerarVariacao={() => {
                // Inc 2c stub: por ora, dispara um aviso no chat global; a variação real chega no Inc 2c.
                useStore.getState().prefillChat(
                  `Quero gerar uma variação on-brand do anúncio vencedor da campanha ${campaign.slug}. (Recurso completo chega no Inc 2c.)`,
                  false,
                );
              }}
            />
          ) : (
            <TasksTab /* ...unchanged... */ />
          )}
```
- **Auto-refresh on open (stale) — com backoff (I2):** dispara o sync UMA vez quando a aba Resultados abre com dados velhos. Guardas pra não re-disparar em loop:
  - **I2 guard 1:** só auto-sincroniza se `metaConnected` (agora REAL, dirigido por link/insights — I1). Sem vínculo nenhum, nada de auto-sync às cegas.
  - **I2 guard 2:** se a última tentativa de sync FALHOU (`metaError`), NÃO re-dispara automaticamente — o usuário clica "Tentar de novo" (senão alternar a aba re-dispararia um sync que falha de novo, em loop).
  - **C3 ref reset:** zera o `autoSyncedRef` quando insights FRESCOS chegam (sync terminou com sucesso) — assim, da próxima vez que ficarem velhos, o auto-sync pode disparar de novo. Também zera ao sair da aba.

  Add `import { useEffect, useRef } from "react";` and:
```tsx
  const autoSyncedRef = useRef(false);
  useEffect(() => {
    // C3: sync bem-sucedido (insights frescos) libera o próximo auto-sync futuro.
    if (hasFreshInsights) autoSyncedRef.current = false;
    if (effectiveTab !== "results") { autoSyncedRef.current = false; return; }
    if (
      meta.stale &&
      metaConnected &&        // I1: vínculo/sync real, não a chave .mcp.json
      !syncingMeta &&
      !metaError &&           // I2: não re-disparar sobre uma falha — espera ação do usuário
      !autoSyncedRef.current
    ) {
      autoSyncedRef.current = true;
      syncMeta();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveTab, meta.stale, metaConnected, syncingMeta, metaError, hasFreshInsights]);
```

> The `openSettings()` for "Conectar" reuses the existing settings entry; the dedicated `MetaConnectBanner` (rendered by the page above the workspace) is the primary connect affordance. Both are fine — the banner is the prominent one.

**Verify:** `npx tsc --noEmit` → OK; then `npx tsc --noEmit` for `page.tsx` (Task C3) now resolves.

**Commit:** `feat(meta): wire Resultados tab + auto-refresh into workspace`

---

## Phase E — Skill + verification

### Task E1 — `sincronizar-meta` SKILL.md
**File:** `~/Documents/Magnus/magnus-os-plugin/plugins/magnus-os/skills/sincronizar-meta/SKILL.md` (**new**). Modeled on `lancar-campanha`/`criar-criativo` frontmatter (panel block + start_form). Writes `link.json`, `insights.json`, `synced_at`, and the transient `bm-campaigns.json`, per schema §5 byte-for-byte.

```markdown
---
name: sincronizar-meta
description: Puxa os resultados reais dos anúncios da Meta (Facebook/Instagram Ads) via MCP oficial da Meta (somente leitura, OAuth pelo Business Manager) e grava no workspace pra o painel ler. Lista as campanhas do Business Manager, associa por nome à campanha do painel (link.json), puxa insights de funil + por anúncio e grava operacao/<campanha>/meta/insights.json. Use sempre que o usuário pedir "atualizar resultados", "sincronizar Meta", "puxar métricas dos anúncios", "ver performance da campanha" ou quando o painel disparar a sincronização.
allowed-tools: Read, Write, Bash(mkdir -p *), Bash(date:*), mcp__meta__*
panel:
  category: lancar
  icon: barChart
  order: 2
  requires:
    - operacao/{campanha}/BRIEFING.md
  start_form:
    - id: campanha
      type: campanha-picker
      label: Campanha
      required: true
  output:
    type: markdown
    dir: operacao/{campanha}/meta/
---

# Skill: Sincronizar Meta

Puxa o resultado real dos anúncios da Meta e grava no workspace pro painel renderizar a aba **Resultados**. **Somente leitura** — nunca cria, edita ou pausa campanha/anúncio.

## Pré-requisitos

- MCP **meta** conectado: o usuário roda `/mcp` uma vez, escolhe **meta** e autoriza pelo Business Manager (sem app de desenvolvedor, sem colar token). Se as tools `mcp__meta__*` não existirem nesta sessão, **pare** e oriente: "Conecte a Meta primeiro — no painel clique em Conectar Meta, ou rode `/mcp` e autorize o server `meta`."
- A campanha do painel existe em `operacao/<campanha>/`.

> **Nomes de tools — validar ao conectar.** O MCP oficial expõe ~29 tools (Meta Marketing API). As de leitura usadas aqui têm nomes do tipo `mcp__meta__ads_insights_*` / `mcp__meta__*_list_campaigns` / `mcp__meta__*_account*`. **Os nomes EXATOS podem variar por versão** — no início da execução, liste as tools `mcp__meta__*` disponíveis e escolha as de **insights** (gasto, results, ROAS, hook/hold rate, CTR) e de **listagem de campanhas/contas**. Nunca use tools de escrita (create/update/pause/delete).

## Workflow

### Passo 1 — Identificar a campanha e ler o contexto
1. A campanha vem do `start_form` (`{campanha}`). Leia `operacao/{campanha}/BRIEFING.md` pra extrair o nome/ângulo (ajuda no match por nome).
2. `mkdir -p operacao/{campanha}/meta`.

### Passo 2 — Garantir o vínculo (link.json)
1. Se `operacao/{campanha}/meta/link.json` já existe e tem `meta_campaign_ids` não-vazio, **reaproveite** (pule pro Passo 3) — a menos que o usuário peça pra reassociar.
2. Senão: liste as contas e campanhas do Business Manager via as tools de listagem do MCP. A associação BM↔campanha acontece **no chat** (você lista, sugere o match e confirma com o usuário — M5). Opcionalmente grave a lista em `operacao/{campanha}/meta/bm-campaigns.json` apenas como rascunho/depuração da própria skill (o painel NÃO lê esse arquivo — não há picker no painel no Inc 1). Formato:
   ```json
   [ { "id": "...", "name": "...", "account_id": "act_..." } ]
   ```
3. **Match automático por nome:** compare o nome de cada campanha BM com o slug `{campanha}` e o nome/ângulo do BRIEFING (normalize: minúsculas, sem acentos, troca `-`/`|`/espaços). Escolha a de maior similaridade.
4. **Confirme com o usuário** (uma pergunta, texto normal — NÃO use AskUserQuestion): "Achei a campanha BM **\"<nome>\"** (conta `act_...`). É essa que corresponde a `{campanha}`? (sim / escolher outra / são várias)". Aceite 1+ campanhas BM → 1 campanha do painel.
5. Grave `operacao/{campanha}/meta/link.json` **exatamente** com este schema:
   ```json
   {
     "account_id": "act_...",
     "meta_campaign_ids": ["..."],
     "linked_at": "<ISO timestamp>",
     "match_confidence": "auto"
   }
   ```
   Use `"manual"` se o usuário escolheu manualmente em vez de aceitar a sugestão automática.

### Passo 3 — Puxar insights e gravar insights.json
1. Período padrão: **últimos 7 dias** (se o usuário pediu outro, use o dele).
2. Via as tools de insights do MCP, para as `meta_campaign_ids` do link, colete:
   - **Nível campanha:** gasto (`spend`), resultados/leads (`results`), CPA/custo por resultado (`cpa`), ROAS (`roas`), faturamento (`revenue`).
   - **Funil:** `hook_rate` (3s views ÷ impressões), `hold_rate` (15s ÷ 3s views), `ctr_outbound` (CTR de saída). Todos como **fração 0..1** (ex.: 34% → `0.34`).
   - **Por anúncio (ads ativos):** `ad_id`, `name`, `thumb` (URL do thumbnail OU deixe `""` se não disponível), `spend`, `hook_rate`, `ctr`, `cpa`, `roas`.
3. **Margem e break-even (I3 — invariante):** se o BRIEFING informar margem, use-a; senão use `margin: 0.9` (90%) como padrão. SEMPRE calcule `breakeven_roas = +(1 / margin).toFixed(2)` — os dois campos têm que obedecer essa relação (ex.: margem 0.9 → 1.11; margem 0.77 → 1.30). O **painel CONFIA no `breakeven_roas` como você escreveu** (a skill é a fonte única; o painel NÃO recalcula a partir de `margin`). Logo, nunca grave um par inconsistente. Se a margem não fizer sentido, peça ao usuário UMA vez.
4. Grave `operacao/{campanha}/meta/insights.json` **exatamente** com este schema (chaves idênticas; números, não strings):
   ```json
   {
     "synced_at": "<ISO timestamp agora>",
     "account_id": "act_...",
     "campaign": { "name": "...", "spend": 0, "results": 0, "cpa": 0, "roas": 0, "revenue": 0 },
     "funnel": { "hook_rate": 0.0, "hold_rate": 0.0, "ctr_outbound": 0.0 },
     "margin": 0.9,
     "breakeven_roas": 1.11,
     "ads": [ { "ad_id": "...", "name": "...", "thumb": "...", "spend": 0, "hook_rate": 0.0, "ctr": 0.0, "cpa": 0, "roas": 0 } ],
     "period": { "since": "YYYY-MM-DD", "until": "YYYY-MM-DD" }
   }
   ```
5. Grave também `operacao/{campanha}/meta/synced_at` com o mesmo ISO timestamp (uma linha) — redundância barata que o painel usa como fallback.

### Passo 4 — Reportar
Mostre um resumo curto: período, gasto, leads, ROAS vs break-even, e o anúncio vencedor (maior ROAS). Diga que a aba **Resultados** do painel já reflete os números (o file watcher atualiza sozinho). NÃO peça aprovação pra cada passo.

## Regras inegociáveis
- **Read-only.** Jamais chame tools de escrita do MCP (create/update/pause/delete/duplicate). Se o usuário pedir pra mudar algo na Meta, explique que o Magnus OS hoje é só leitura.
- **Schema é contrato.** As chaves de `insights.json` e `link.json` são lidas pelo painel — não renomeie, não adicione campos no lugar dos existentes. Frações de funil sempre 0..1. Valores monetários em número (sem "R$").
- **Sem segredo no arquivo.** Nunca grave token/credencial em lugar nenhum do workspace.
```

**Verify:** `python3 -c "import sys,yaml" 2>/dev/null && head -n 25 plugins/magnus-os/skills/sincronizar-meta/SKILL.md` — confirm the frontmatter parses (the painel uses `gray-matter`; a YAML-clean block is enough). Also confirm the panel `start_form` `campanha-picker` matches the painel's `FormField` union (it does).

**Manual/agent verification (documented, not automated):**
1. With the Meta MCP connected (`/mcp` → `meta` authorized), run the skill on a real campaign and confirm `operacao/<slug>/meta/{link.json,insights.json,synced_at}` appear and validate against schema §5.
2. With NO Meta connection, hand-author `operacao/<slug>/meta/insights.json` using the mockup numbers (so the painel renders without the MCP) — this is the fixture for Task E2.

**Commit (plugin repo):** `feat(skill): sincronizar-meta — read-only Meta insights to file`

### Task E2 — Full verification gate (tsc + tests + build + QA-visual + codex)
Run from the painel repo:

1. **Types:** `npx tsc --noEmit` → exit 0, no output.
2. **Tests:** `npm test` → all suites pass (existing + `meta-format`, `meta`, `meta-stale`, `modules`).
3. **Build:** `npm run -s build` → completes; no type/lint errors.
4. **QA-visual (`/browse`):** prepare a fixture `operacao/<slug>/meta/insights.json` with the mockup numbers (Gasto R$ 4.820 / Leads 214 / Custo/lead R$ 22,52 / ROAS 3,8× / break-even 1,3× / hook 34% / hold 52% · CTR 2,1% / 3 ads: Reels-depoimento-01 5,1× vencedor, Estatico-grafico-02 3,6×, Carrossel-prova-03 2,4×). Make the fixture self-consistent (I3): `margin: 0.77`, `breakeven_roas: 1.3`. Set `synced_at` to **now** (a fresh ISO timestamp) for the primary "ready" diff so `hasFreshInsights` is true and the page renders the dashboard immediately without the auto-sync (I2/C3) kicking off a real run mid-screenshot. To exercise stale auto-sync separately, backdate `synced_at` past `MAGNUS_META_STALE_MIN` in a second pass.

   **C2 — start command (both env vars are required):** the "Atualizar" button → `/api/run/start` → `findSkill("sincronizar-meta")`, which resolves via `MAGNUS_SKILLS_DIR` (override) → else `MAGNUS_PAINEL_CWD/.claude/skills`. The fixture workspace has NO skills, so without `MAGNUS_SKILLS_DIR` the run 404s. Point it at the plugin's skills:
   ```bash
   MAGNUS_PAINEL_CWD="<fixture-workspace>" \
   MAGNUS_SKILLS_DIR="$HOME/Documents/Magnus/magnus-os-plugin/plugins/magnus-os/skills" \
   npm run dev   # port 3737
   ```
   Then open `/c/<slug>`, click **Resultados**, and visually diff against `docs/mockups/dash-b.png`:
   - Tab "Resultados" present between "Visão geral" and (if on) "Tarefas".
   - KPI band, funnel strip, ad table ranked by ROAS, "vencedor" pill on the top ad, ROAS colored when above break-even, "gerar variação do vencedor" present.
   - Toggle states (driven by FILES now, per I1 — not the `.mcp.json` key):
     - `link.json` + `insights.json` both present, fresh → **ready** (dashboard).
     - `link.json` present, `insights.json` absent → **no-data** ("Sem dados ainda · Atualizar").
     - both `link.json` AND `insights.json` absent → **disconnected** ("Conecte a Meta…"). (Note: the `meta` key staying in `.mcp.json` does NOT flip this to connected — that's the whole point of I1. The `MetaConnectBanner` above the workspace still keys off `.mcp.json`, so it may show "configured"; that's expected and separate.)
     - `insights.json` present but `synced_at` older than `MAGNUS_META_STALE_MIN` → still renders the dashboard (stale), and auto-sync fires once in the background.
   Capture before/after screenshots as evidence.
5. **Codex gate (fixed):** `/codex review` on the Inc 1 diff (both repos). Resolve every finding until **GATE PASS**. Per repo memory, codex catches runtime breaks tsc misses — do not skip.

**Commit:** `chore(meta): Inc 1 verification — tsc + tests + build green, codex PASS`

---

## Self-review (spec coverage · placeholder scan · type consistency)

**Spec coverage (Inc 1 §46–58 + §5 + §5b + §7):**
- ✅ Conexão Meta via official MCP (`mcp.facebook.com/ads`, HTTP, OAuth, read-only) — Tasks A1/A2; "Conecte a Meta" banner reusing `MCPConnectBanner` — A5.
- ✅ `sincronizar-meta` skill writes `insights.json` (+ `synced_at`) per §5 — E1; triggered by "Atualizar" button (D2/D3) and auto on open if stale > 30min default (D3 effect + `getMetaStaleMinutes`).
- ✅ BM↔campanha association (M5 — **chat-driven in MVP**, intentional deviation from spec §Inc 1): the agent lists BM campaigns, auto name-matches, and confirms the binding **in chat**, writing `link.json` (§5) — E1. The painel renders **no** BM picker; it only reads `link.json` (drives `metaConnected`, I1) + `insights.json` via `lib/meta.ts` + `/api/meta` (B6/C1). No `readBmCampaigns`/`BmCampaign` (YAGNI). A painel-side picker is deferred to a later increment.
- ✅ Dashboard variant B (locked, `dash-b.png`): KPI band (gasto/leads/custo-lead/ROAS w/ break-even), funnel strip (Atenção hook / Engajamento hold+CTR / Conversão CPA+ROAS), ad table ranked by ROAS (thumb+name+spend+hook+CTR+CPA+ROAS, "vencedor" pill, ROAS color), period control, connect/empty/loading/error states — D2; tab added to TabBar + store + workspace — A4/D1/D3.
- ✅ Painel reads `insights.json`, NOT Graph API (file-first) — `lib/meta.ts` only touches the filesystem.
- ✅ New lib helpers, pure where possible, with vitest — `meta-format.ts`/`meta.ts`/`meta-stale.ts` (TDD).
- ✅ "gerar variação do vencedor" stub tied to Inc 2c (button + intent only) — D3 `onGerarVariacao`.
- ✅ §5b qualidade reflected in the skill: read-only tier (D4), evidence-anchored / named — covered as far as Inc 1 needs (analysis depth is Inc 2a/2c).
- ✅ Decomposed to ship working software alone (hand-authored `insights.json` renders the tab end-to-end).

**Placeholder scan:** no `TODO`/`FIXME`/`...`/`<placeholder>` in code blocks. All file paths absolute or repo-rooted; all commands concrete with expected output. The only deliberately-deferred items are the documented Inc 2c stub and the affordance line for live drill-down (per spec, Inc 1 ships the affordance, not the live drill).

**Type consistency:** `insights.json`/`link.json` types in `lib/meta-types.ts` match spec §5 key-for-key (verified against §5 JSON). Funnel values documented as fractions 0..1 in both the skill and `pct()` formatter. `McpStatus` extended with `meta` in `types.ts` + initialized in `notion.ts` + `store.ts`. **`components/NotionConnectBanner.tsx` carries its OWN local `McpStatus`/`ServerKey`/`SERVER_LABELS`** (NOT imported from `lib/types`) — all three get the `meta` entry (C1, Task A5). `activeTab` widened to include `"results"` in `store.ts` interface AND `setActiveTab` signature AND the `onChange` cast in `CampaignWorkspace`. `ModuleFlags` gains `meta` in interface + DEFAULTS + `getModules()` + test. No `any` anywhere.

**Eng-review fixes applied (C1–C3, I1–I4, M5/M6):**
- **C1** — `NotionConnectBanner.tsx` local types (`McpStatus`+`ServerKey`+`SERVER_LABELS`) all edited for `meta` (Task A5); the `lib/types.ts` change does NOT propagate to this file.
- **C2** — QA-visual start command exports `MAGNUS_SKILLS_DIR=…/magnus-os-plugin/plugins/magnus-os/skills` alongside `MAGNUS_PAINEL_CWD` so `findSkill("sincronizar-meta")` resolves; without it the "Atualizar" run 404s (Task E2).
- **C3** — `syncingMeta` excludes `awaiting-input` (a finished turn sets `awaiting-input`, NOT `done`; `done` only on SSE close) → no permanent spinner hang; fresh insights → `ready` win the state machine; auto-sync ref resets on fresh insights (Task D3).
- **I1** — `metaConnected`/route `connected` driven by real signal (`link.json`/`insights.json` presence), NOT the seeded `.mcp.json` key; "disconnected"/empty state is reachable again (Tasks C1, D3).
- **I2** — auto-sync gated on real `metaConnected` + suppressed on `metaError` (no re-fire loop on tab toggle when sync keeps failing) (Task D3).
- **I3** — fixtures obey `breakeven_roas = round(1/margin, 2)`; `margin 0.77 → 1.30` matches `dash-b.png`; painel trusts `breakeven_roas` as written (no recompute) (Tasks B4, E2, E1 Passo 3).
- **I4** — `lib/meta.ts` coerces numeric fields via `Number(...)` on read (accepts number OR numeric string; rejects non-coercible → null); formatters/`sortAdsByRoas` never see strings; test feeds string-encoded numbers (Tasks B4, B6). Hardens against the recurring "API lies about types" bug.
- **M5** — no `readBmCampaigns`/`BmCampaign` (chat-driven association; YAGNI); documented deviation.
- **M6** — Task A1 verify is a HARD GATE: confirm `mcp__meta__*` tools actually load (`claude mcp list`/SDK smoke), with `type`→`transport` fallback; do not proceed until tools load.

**Assumptions / validate-at-connect-time (flagged):**
- **Exact Meta MCP tool names** (`mcp__meta__ads_insights_*`, list-campaigns, list-accounts) — the official server exposes ~29 tools but exact names vary by version; the skill lists `mcp__meta__*` at runtime and picks the read tools. **Validate at connect time.**
- **`.mcp.json` server entry shape** — `{ "type": "http", "url": "https://mcp.facebook.com/ads" }`, with `"transport"` as fallback. **This is a 🔴 HARD GATE (M6), not a soft assumption:** Task A1 must confirm `mcp__meta__*` tools actually LOAD (`claude mcp list` / SDK smoke), trying `type` then `transport`. `readMcpStatus` checking the `meta` key is NOT sufficient proof — if the shape is wrong the dashboard never gets data. Do not proceed past Phase A until tools load.
- **`thumb`** may be an absolute Meta CDN URL (often short-lived/CORS) OR a workspace relpath; `AdThumb` handles both (`/api/files` for relpaths). If Meta thumbs 403 in `<img>`, a v2 improvement is to have the skill download them into `meta/thumbs/` — out of scope for Inc 1.
- **`results` = leads** for the mockup's lead-gen campaign; for purchase campaigns `results`/`revenue`/`roas` carry through unchanged (labels stay "Leads"/"Custo / lead" per the locked layout; relabeling by objective is a later refinement).
- Default **margin 0.9 → break-even 1.11** when the BRIEFING has no margin; the skill prefers the BRIEFING's margin. Both this default and the mockup's `0.77 → 1.30` obey the `breakeven = round(1/margin, 2)` invariant (I3). The **test/QA fixture standardizes on `0.77 → 1.30`** to match `dash-b.png`. The painel never recomputes — it trusts `breakeven_roas` as written by the skill.

**Spec ambiguity hit:**
- Spec §7 lists "Cadência de auto-refresh (default 30 min; confirmar na prática)" as open — implemented as configurable `MAGNUS_META_STALE_MIN` (default 30), fires once per tab-open.
- Spec §5 `insights.json` has no `hold_rate` in the ad-row (only campaign-level funnel has it); the ad table in the mockup shows Hook/CTR/CPA/ROAS per ad (no hold per ad) — the types + table match the schema exactly (no per-ad hold).
- "drill-down conta→adset→ad→criativo" (§55) — the schema only carries flat ads; Inc 1 renders the affordance line (matching the mockup's footer text) but live drill needs richer data → deferred (noted, not invented).
```
