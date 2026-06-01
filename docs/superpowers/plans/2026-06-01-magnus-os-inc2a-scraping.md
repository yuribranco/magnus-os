# Magnus OS — Inc 2a: Scraping de criativos validados do nicho — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a "swipe file" of validated winning creatives for the company's niche — a `pesquisar-criativos` skill (runs in the client's local Claude Code) scrapes the Meta Ad Library via Apify, pairs each creative with its landing page, computes a composite validation score, names the angle with anchored evidence, and writes `contexto/ativos/swipe/<nicho>/`; the painel renders it as a score-ordered gallery with a stub "gerar variação on-brand" hook into Inc 2c.

**Architecture:** File-first, same as the rest of Magnus OS. The **agent writes** (scrape → pair LP → score → write `index.json` + downloaded media + `lp-<ad_id>.txt`); the **painel only reads** the niche's `index.json` and serves the media via the existing `/api/files?p=` route. The composite-score function lives **painel-side** as a pure, vitest-tested module (`lib/creative-score.ts`) so the gallery can re-sort deterministically and the score is auditable; the skill computes the same score inline from the documented formula and writes it to the JSON (the painel never recomputes against the network — it sorts using the parsed `score`, and `creative-score.ts` is the single source of the formula both sides reference). The skill is a markdown `SKILL.md` modeled on `criar-criativo`/`lancar-campanha`, with a `panel:` block so it appears in the painel skills bar.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript (no `any`) · Tailwind/CSS-vars design system (existing `styles/`) · vitest (existing) · Claude Agent SDK skill (markdown) · Apify actor `curious_coder/facebook-ads-library-scraper` (via Apify CLI/API token, invoked from the skill's `Bash`).

**Decisions locked (from spec §4 + §5b):** D5 composite score FORTE estilo Spyglass · D7 scraping via Apify · D8 Spyglass = referência não integração · D10 landing page pareada no MVP · D11 análise grounded + evidência + ângulos nomeados. Score weights chosen in this plan (Task 2) — open to tuning, see "Assumptions".

---

## Repos & absolute roots

- **Painel:** `/Users/yuribranco/Documents/Magnus/magnus-imersao/painel-aula-4/magnus-painel`
- **Plugin:** `/Users/yuribranco/Documents/Magnus/magnus-os-plugin/plugins/magnus-os`
- **Template (client workspace shape):** `/Users/yuribranco/Documents/Magnus/magnus-os-plugin/template`
- **Spec (authoritative):** `/Users/yuribranco/Documents/Magnus/magnus-os/docs/superpowers/specs/2026-06-01-magnus-os-redesign-agencia-design.md`

Both repos are committed by the controller — **do not run git in this plan's execution unless a step explicitly says to commit**; the controller handles commits per repo.

---

## File Structure

### Plugin (`magnus-os-plugin/plugins/magnus-os/`)
- **Create:** `skills/pesquisar-criativos/SKILL.md` — the scraping/scoring/pairing skill (markdown, frontmatter + `panel:` block + body). Category `auditar` (it's intelligence/research, not production). Runs in the client's Claude Code, uses `Bash` for Apify + LP fetch, `Read`/`Write`/`Glob` for files.
- **Create:** `skills/pesquisar-criativos/scripts/apify_adlibrary.sh` — thin wrapper: takes a JSON input file, runs the Apify actor synchronously, writes the run's dataset items to stdout as JSON. Keeps the actor id + endpoint in one auditable place (mirrors how `criar-criativo/scripts/gen_image.sh` isolates the Gemini call).
- **Create:** `skills/pesquisar-criativos/scripts/fetch_lp.sh` — fetches a landing-page URL and emits readable text (strips tags). Isolates the LP capture so the SKILL body stays declarative.
- **Create:** `skills/pesquisar-criativos/references/angulos.md` — the named-angle taxonomy (Prova Social, Risco Zero, Economia de Tempo, Autoridade, Urgência, …) the skill maps each creative to. Self-contained so the skill never invents an angle.

### Painel (`magnus-painel/`)
- **Create:** `lib/creative-score.ts` — pure functions: `compositeScore(signals)` → 0–1, plus the normalizers it composes (`normImpressions`, `normEngagement`, `normDaysActive`, `normVariations`). No `fs`, no network. Single source of truth for the formula.
- **Create:** `lib/creative-score.test.ts` — vitest for the score + normalizers (boundary, monotonicity, weight-sum, clamping).
- **Create:** `lib/swipe.ts` — `readSwipeBank(nicho)` + `listSwipeNichos()`: reads `contexto/ativos/swipe/<nicho>/index.json`, validates/parses against the schema, returns typed `SwipeBank`, re-sorts `creatives` by parsed `score` desc (defensive: never trusts file order). Server-side (`fs`), mirrors `lib/campaigns.ts`.
- **Create:** `lib/swipe-parse.ts` — pure parser/validator `parseSwipeIndex(raw: unknown): SwipeBank` (no `fs`), so it's vitest-testable independent of disk. `lib/swipe.ts` reads the file and delegates to this.
- **Create:** `lib/swipe-parse.test.ts` — vitest for the parser (valid byte-for-byte schema from spec §5, missing fields, malformed JSON, wrong types).
- **Modify:** `lib/types.ts` — add `SwipeCreative`, `SwipeBank`, `CreativeSignals`, `CreativeAngle` types (exact shape = spec §5 schema).
- **Create:** `app/api/swipe/route.ts` — `GET /api/swipe?nicho=<slug>` returns the parsed bank as JSON (and `GET /api/swipe` with no nicho → `{ nichos: [...] }`). Mirrors `app/api/campaigns/route.ts`.
- **Create:** `components/SwipeGallery.tsx` — client component: renders the bank as a gallery of `SwipeCreativeCard`s ordered by score, with angle pill + score + signals + paired-LP summary + "gerar variação on-brand" stub button. Reuses `CreativeCard` styling conventions (`.asset`, `.card`, `Pill`).
- **Create:** `components/SwipeCreativeCard.tsx` — one creative tile (extends the `CreativeCard` visual language: thumb via `/api/files?p=`, ratio badge, score badge, angle pill, signals row).
- **Create:** `app/swipe/page.tsx` — a top-level "Swipe file do nicho" view (server component: reads niches via `lib/swipe.ts`, renders `SwipeGallery`). Reachable from the Sidebar.
- **Modify:** `components/Sidebar.tsx` — add a "Swipe file" nav item linking to `/swipe` (only the nav entry; gated nowhere — this is a core Inc 2 feature, not behind a module flag).

### Niche keywords source (no schema change needed)
`contexto/EMPRESA.md` already carries **Posicionamento**, **ICP** and **Ofertas** (see template). The skill derives niche keywords from those sections (Setor + Posicionamento + Ofertas + ICP dor) — **no new EMPRESA field is introduced** (YAGNI; the skill proposes derived keywords and asks the user to confirm/edit them, then persists the confirmed list to `contexto/ativos/swipe/<nicho>/keywords.json` for incremental refresh).

---

## Schema contract (byte-for-byte from spec §5 — do not deviate)

`contexto/ativos/swipe/<nicho>/index.json`:
```json
{
  "nicho": "...",
  "updated_at": "...",
  "source": "apify:ad-library",
  "creatives": [
    { "ad_id": "...", "advertiser": "...", "file": "<ad_id>.jpg", "format": "1:1|9:16|video",
      "score": 0.0, "confidence": 0.0,
      "signals": { "impressions_bucket": "...", "engagement": 0, "days_active": 0, "variations": 0 },
      "angle": "prova-social|risco-zero|economia-tempo|autoridade|urgencia|...",
      "source_evidence": "ex: 'no ar há 142d, 3.4k reações, 6 variações ativas'",
      "landing": { "url": "...", "headline": "...", "offer": "...", "proof": "...", "captured": "lp-<ad_id>.txt" },
      "ad_url": "...", "first_seen": "..." }
  ]
}
```
Plus per-niche sidecar files written by the skill: `<ad_id>.jpg|mp4` (downloaded media), `lp-<ad_id>.txt` (captured LP text), `keywords.json` (`{ "keywords": [...], "confirmed_at": "..." }` — for incremental refresh).

---

## Recommended Apify actor + how the skill calls it

**Actor:** `curious_coder/facebook-ads-library-scraper` (confirmed in the research doc §"Fontes de scraping" — keyword/niche query, downloads image/video, Yuri already has Apify access). Spyglass stays a **reference**, not an integration (D8).

**Invocation (in the skill, via `Bash`):** the actor is run synchronously through Apify's run-sync-get-dataset-items REST endpoint, authenticated with `APIFY_TOKEN` from the client's `.env` (same `.env` pattern as `GEMINI_API_KEY`). The wrapper `scripts/apify_adlibrary.sh` takes an input JSON file and prints dataset items:

```bash
# scripts/apify_adlibrary.sh  <input.json>  →  dataset items JSON on stdout
ACTOR="curious_coder~facebook-ads-library-scraper"
curl -s -X POST \
  "https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${APIFY_TOKEN}" \
  -H "Content-Type: application/json" \
  --data @"$1"
```

Actor input (written by the skill to a temp file before calling the wrapper):
```json
{
  "searchTerms": ["<keyword1>", "<keyword2>"],
  "country": "BR",
  "adActiveStatus": "active",
  "adType": "all",
  "count": 40
}
```

> **Field availability is NOT guaranteed** — actor output schemas drift. The skill MUST tolerate missing fields: `impressions_bucket` (the 2026 bucket), per-post `engagement` (likes+comments+shares), `days_active` (from `ad_delivery_start_time`/first_seen), and `variations` (count of ads sharing the same creative/snapshot) may appear under different keys or be absent. The skill maps actor fields → our `signals` defensively and records `confidence` lower when signals are missing. **Validate the exact field names against one real run before trusting them** (see Task 4 dry-run + the "Assumptions" section). The Ad Library exposes the impressions bucket per ad as of 2026; post engagement is scraped from the ad's post.

**Cost / ToS (spec §"Erros a evitar"):** each niche refresh = one actor run (~40 ads) ≈ low-single-digit USD on Apify compute; the skill **caches per niche** (writes `keywords.json` + `index.json`) and refreshes **incrementally** — on re-run it merges new `ad_id`s into the existing bank instead of re-downloading media that already exists on disk. The skill states the estimated cost before running and asks for confirmation.

---

## Composite score formula (specced here — the heart of quality)

Pure function `compositeScore(signals): number` in `lib/creative-score.ts`. Inputs are the four `signals`; output is 0–1. Each signal is normalized to 0–1, then combined with fixed weights that sum to 1.0:

```
score = 0.35 * normImpressions(impressions_bucket)
      + 0.25 * normEngagement(engagement)
      + 0.25 * normDaysActive(days_active)
      + 0.15 * normVariations(variations)
```

**Rationale for weights (Spyglass-style "is this an outlier winner?"):** longevity + spend-reach (impressions) are the strongest survival signals an advertiser keeps paying for → impressions gets the top weight (0.35); engagement and days_active are co-primary proof the market responds and the advertiser keeps it live (0.25 each); number of active variations is a real but secondary signal (an advertiser scaling a winner runs many variants) → 0.15.

**Normalizers (all clamp to [0,1]):**

- `normImpressions(bucket: string)`: maps the Meta 2026 impressions bucket string to a 0–1 ordinal. Buckets are ranges like `"<1k"`, `"1k-5k"`, `"5k-10k"`, `"10k-50k"`, `"50k-100k"`, `"100k-200k"`, `"200k-500k"`, `"500k-1M"`, `">1M"`, plus the `"Low Impression Count"` badge → treated as `"<1k"`. Implemented as an ordered ladder: `index_of_bucket / (number_of_buckets - 1)`. Unknown/empty bucket → `0` (and lowers confidence). The ladder is defined as a `const BUCKET_LADDER: readonly string[]` with a normalization helper that lowercases + strips spaces so `"100k–200k"` (en-dash) and `"100k-200k"` both match.
- `normEngagement(n: number)`: log-scaled, saturating. `clamp01(Math.log10(Math.max(n,0) + 1) / Math.log10(100000 + 1))` — so 0 reactions → 0, ~100k reactions → 1, with diminishing returns (10 → ~0.20, 1k → ~0.60, 10k → ~0.80). Negative/NaN → 0.
- `normDaysActive(d: number)`: linear ramp saturating at 180 days (6 months live = a clear evergreen winner). `clamp01(Math.max(d,0) / 180)`. Negative/NaN → 0.
- `normVariations(v: number)`: linear ramp saturating at 10 active variations. `clamp01(Math.max(v,0) / 10)`. 1 variation → 0.1; 10+ → 1. Negative/NaN → 0.

`clamp01(x) = Math.min(1, Math.max(0, x))`. The final `score` is rounded to 3 decimals (`Math.round(x*1000)/1000`).

**`confidence` (separate from score, also 0–1):** computed by the skill (not by `creative-score.ts`) as the fraction of the four signals that were actually present in the actor output (e.g. impressions + engagement present, days_active + variations missing → `0.5`), floored at `0.25`. Written to the JSON; the gallery surfaces it so a "winner" with low confidence is visibly hedged (D11: no hallucinated winner).

---

## Tasks

### Task 1: Types for the swipe bank (no logic yet)

**Files:**
- Modify: `lib/types.ts` (append after `CreativeAsset`, before `Campaign`)

- [ ] **Step 1: Add the types**

```ts
/** Sinais brutos do criativo scrapeado (entram no score composto). */
export interface CreativeSignals {
  impressions_bucket: string;
  engagement: number;
  days_active: number;
  variations: number;
}

export type CreativeAngle =
  | "prova-social"
  | "risco-zero"
  | "economia-tempo"
  | "autoridade"
  | "urgencia"
  | "curiosidade"
  | "antes-depois"
  | "outro";

export interface SwipeCreative {
  ad_id: string;
  advertiser: string;
  file: string;
  format: "1:1" | "9:16" | "video" | string;
  score: number;
  confidence: number;
  signals: CreativeSignals;
  angle: CreativeAngle;
  source_evidence: string;
  landing: {
    url: string;
    headline: string;
    offer: string;
    proof: string;
    captured: string;
  };
  ad_url: string;
  first_seen: string;
}

export interface SwipeBank {
  nicho: string;
  updated_at: string;
  source: string;
  creatives: SwipeCreative[];
}
```

- [ ] **Step 2: Verify it typechecks**

Run (from painel root): `npm run typecheck`
Expected: exit 0, no errors. (Adding types only — nothing references them yet.)

- [ ] **Step 3: Commit** (controller): `feat(painel): tipos do swipe bank (Inc 2a)`

---

### Task 2: Composite score — pure function (STRICT TDD)

**Files:**
- Create: `lib/creative-score.ts`
- Test: `lib/creative-score.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/creative-score.test.ts
import { describe, it, expect } from "vitest";
import {
  clamp01,
  normImpressions,
  normEngagement,
  normDaysActive,
  normVariations,
  compositeScore,
} from "./creative-score";
import type { CreativeSignals } from "./types";

describe("clamp01", () => {
  it("clamps below 0 and above 1", () => {
    expect(clamp01(-2)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(0.5)).toBe(0.5);
  });
});

describe("normImpressions", () => {
  it("empty/unknown bucket → 0", () => {
    expect(normImpressions("")).toBe(0);
    expect(normImpressions("banana")).toBe(0);
  });
  it("Low Impression Count badge → bottom of ladder (0)", () => {
    expect(normImpressions("Low Impression Count")).toBe(0);
  });
  it("top bucket → 1", () => {
    expect(normImpressions(">1M")).toBe(1);
  });
  it("monotonic: higher bucket → higher value", () => {
    expect(normImpressions("10k-50k")).toBeGreaterThan(normImpressions("1k-5k"));
  });
  it("matches en-dash and spacing variants", () => {
    expect(normImpressions("100k–200k")).toBe(normImpressions("100k-200k"));
  });
});

describe("normEngagement", () => {
  it("0 → 0, negative/NaN → 0", () => {
    expect(normEngagement(0)).toBe(0);
    expect(normEngagement(-5)).toBe(0);
    expect(normEngagement(Number.NaN)).toBe(0);
  });
  it("saturates near 1 at ~100k", () => {
    expect(normEngagement(100000)).toBeCloseTo(1, 1);
  });
  it("monotonic increasing", () => {
    expect(normEngagement(1000)).toBeGreaterThan(normEngagement(10));
    expect(normEngagement(10000)).toBeGreaterThan(normEngagement(1000));
  });
});

describe("normDaysActive", () => {
  it("0/negative/NaN → 0", () => {
    expect(normDaysActive(0)).toBe(0);
    expect(normDaysActive(-1)).toBe(0);
    expect(normDaysActive(Number.NaN)).toBe(0);
  });
  it("180+ days → 1", () => {
    expect(normDaysActive(180)).toBe(1);
    expect(normDaysActive(365)).toBe(1);
  });
  it("90 days → 0.5", () => {
    expect(normDaysActive(90)).toBeCloseTo(0.5, 5);
  });
});

describe("normVariations", () => {
  it("0/negative/NaN → 0, 10+ → 1", () => {
    expect(normVariations(0)).toBe(0);
    expect(normVariations(-3)).toBe(0);
    expect(normVariations(Number.NaN)).toBe(0);
    expect(normVariations(10)).toBe(1);
    expect(normVariations(20)).toBe(1);
  });
  it("1 variation → 0.1", () => {
    expect(normVariations(1)).toBeCloseTo(0.1, 5);
  });
});

describe("compositeScore", () => {
  const winner: CreativeSignals = {
    impressions_bucket: ">1M",
    engagement: 100000,
    days_active: 180,
    variations: 10,
  };
  const dud: CreativeSignals = {
    impressions_bucket: "<1k",
    engagement: 0,
    days_active: 0,
    variations: 0,
  };
  it("perfect winner → 1.0", () => {
    expect(compositeScore(winner)).toBe(1);
  });
  it("total dud → 0.0", () => {
    expect(compositeScore(dud)).toBe(0);
  });
  it("output is within [0,1] and rounded to 3 decimals", () => {
    const s = compositeScore({ impressions_bucket: "10k-50k", engagement: 1500, days_active: 92, variations: 4 });
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(1);
    expect(Number((s * 1000).toFixed(0)) / 1000).toBe(s); // no extra precision
  });
  it("impressions dominate (weight 0.35): bumping bucket alone raises score", () => {
    const base: CreativeSignals = { impressions_bucket: "1k-5k", engagement: 100, days_active: 30, variations: 2 };
    const up: CreativeSignals = { ...base, impressions_bucket: ">1M" };
    expect(compositeScore(up)).toBeGreaterThan(compositeScore(base));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/creative-score.test.ts`
Expected: FAIL — `Cannot find module './creative-score'`.

- [ ] **Step 3: Write the minimal implementation**

```ts
// lib/creative-score.ts
// Pure, client-safe (no fs, no network). Single source of truth for the composite
// validation score (Inc 2a). The skill computes the same formula inline and writes
// `score` to index.json; the painel sorts by the parsed score and can re-derive it.
import type { CreativeSignals } from "./types";

export function clamp01(x: number): number {
  if (Number.isNaN(x)) return 0;
  return Math.min(1, Math.max(0, x));
}

/** Escada ordinal dos buckets de impressão da Ad Library (2026), do menor pro maior. */
const BUCKET_LADDER: readonly string[] = [
  "<1k",
  "1k-5k",
  "5k-10k",
  "10k-50k",
  "50k-100k",
  "100k-200k",
  "200k-500k",
  "500k-1m",
  ">1m",
];

function canon(bucket: string): string {
  return bucket.trim().toLowerCase().replace(/–|—/g, "-").replace(/\s+/g, "");
}

export function normImpressions(bucket: string): number {
  if (!bucket) return 0;
  const c = canon(bucket);
  if (c === "lowimpressioncount") return 0;
  const i = BUCKET_LADDER.indexOf(c);
  if (i < 0) return 0;
  return i / (BUCKET_LADDER.length - 1);
}

export function normEngagement(n: number): number {
  if (Number.isNaN(n) || n <= 0) return 0;
  return clamp01(Math.log10(n + 1) / Math.log10(100000 + 1));
}

export function normDaysActive(d: number): number {
  if (Number.isNaN(d) || d <= 0) return 0;
  return clamp01(d / 180);
}

export function normVariations(v: number): number {
  if (Number.isNaN(v) || v <= 0) return 0;
  return clamp01(v / 10);
}

export function compositeScore(s: CreativeSignals): number {
  const raw =
    0.35 * normImpressions(s.impressions_bucket) +
    0.25 * normEngagement(s.engagement) +
    0.25 * normDaysActive(s.days_active) +
    0.15 * normVariations(s.variations);
  return Math.round(clamp01(raw) * 1000) / 1000;
}
```

- [ ] **Step 4: Run tests, confirm green**

Run: `npx vitest run lib/creative-score.test.ts`
Expected: PASS, all assertions green.

- [ ] **Step 5: Commit** (controller): `feat(painel): score composto de criativo validado + testes (Inc 2a)`

---

### Task 3: Swipe index parser/validator — pure function (STRICT TDD)

**Files:**
- Create: `lib/swipe-parse.ts`
- Test: `lib/swipe-parse.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/swipe-parse.test.ts
import { describe, it, expect } from "vitest";
import { parseSwipeIndex } from "./swipe-parse";

const VALID = {
  nicho: "saude-auditiva",
  updated_at: "2026-06-01T12:00:00Z",
  source: "apify:ad-library",
  creatives: [
    {
      ad_id: "123",
      advertiser: "Acme",
      file: "123.jpg",
      format: "1:1",
      score: 0.82,
      confidence: 0.75,
      signals: { impressions_bucket: "100k-200k", engagement: 3400, days_active: 142, variations: 6 },
      angle: "prova-social",
      source_evidence: "no ar há 142d, 3.4k reações, 6 variações ativas",
      landing: { url: "https://x.com", headline: "H", offer: "O", proof: "P", captured: "lp-123.txt" },
      ad_url: "https://facebook.com/ads/library/?id=123",
      first_seen: "2026-01-10",
    },
  ],
};

describe("parseSwipeIndex", () => {
  it("parses a valid bank and keeps fields byte-for-byte", () => {
    const bank = parseSwipeIndex(VALID);
    expect(bank.nicho).toBe("saude-auditiva");
    expect(bank.creatives).toHaveLength(1);
    const c = bank.creatives[0];
    expect(c.signals.engagement).toBe(3400);
    expect(c.landing.captured).toBe("lp-123.txt");
    expect(c.angle).toBe("prova-social");
  });
  it("sorts creatives by score desc", () => {
    const two = {
      ...VALID,
      creatives: [
        { ...VALID.creatives[0], ad_id: "low", score: 0.2 },
        { ...VALID.creatives[0], ad_id: "high", score: 0.9 },
      ],
    };
    expect(parseSwipeIndex(two).creatives.map((c) => c.ad_id)).toEqual(["high", "low"]);
  });
  it("throws on non-object", () => {
    expect(() => parseSwipeIndex(null)).toThrow();
    expect(() => parseSwipeIndex("nope")).toThrow();
  });
  it("throws when creatives is missing or not an array", () => {
    expect(() => parseSwipeIndex({ nicho: "x", updated_at: "", source: "" })).toThrow();
  });
  it("drops a creative missing required fields rather than crashing the whole bank", () => {
    const bad = { ...VALID, creatives: [VALID.creatives[0], { ad_id: "broken" }] };
    const bank = parseSwipeIndex(bad);
    expect(bank.creatives).toHaveLength(1);
    expect(bank.creatives[0].ad_id).toBe("123");
  });
  it("coerces unknown angle to 'outro'", () => {
    const weird = { ...VALID, creatives: [{ ...VALID.creatives[0], angle: "ufo" }] };
    expect(parseSwipeIndex(weird).creatives[0].angle).toBe("outro");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/swipe-parse.test.ts`
Expected: FAIL — `Cannot find module './swipe-parse'`.

- [ ] **Step 3: Write the minimal implementation**

```ts
// lib/swipe-parse.ts
// Pure parser/validator for contexto/ativos/swipe/<nicho>/index.json (spec §5).
// No fs. lib/swipe.ts reads the file and delegates here.
import type { SwipeBank, SwipeCreative, CreativeAngle } from "./types";

const ANGLES: readonly CreativeAngle[] = [
  "prova-social",
  "risco-zero",
  "economia-tempo",
  "autoridade",
  "urgencia",
  "curiosidade",
  "antes-depois",
  "outro",
];

function str(v: unknown, dflt = ""): string {
  return typeof v === "string" ? v : dflt;
}
function num(v: unknown, dflt = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : dflt;
}

function parseCreative(v: unknown): SwipeCreative | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.ad_id !== "string" || typeof o.file !== "string") return null;
  const sig = (o.signals && typeof o.signals === "object" ? o.signals : {}) as Record<string, unknown>;
  const land = (o.landing && typeof o.landing === "object" ? o.landing : {}) as Record<string, unknown>;
  const angle = ANGLES.includes(o.angle as CreativeAngle) ? (o.angle as CreativeAngle) : "outro";
  return {
    ad_id: o.ad_id,
    advertiser: str(o.advertiser),
    file: o.file,
    format: str(o.format, "1:1"),
    score: num(o.score),
    confidence: num(o.confidence),
    signals: {
      impressions_bucket: str(sig.impressions_bucket),
      engagement: num(sig.engagement),
      days_active: num(sig.days_active),
      variations: num(sig.variations),
    },
    angle,
    source_evidence: str(o.source_evidence),
    landing: {
      url: str(land.url),
      headline: str(land.headline),
      offer: str(land.offer),
      proof: str(land.proof),
      captured: str(land.captured),
    },
    ad_url: str(o.ad_url),
    first_seen: str(o.first_seen),
  };
}

export function parseSwipeIndex(raw: unknown): SwipeBank {
  if (!raw || typeof raw !== "object") throw new Error("swipe index: não é objeto");
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.creatives)) throw new Error("swipe index: 'creatives' ausente ou inválido");
  const creatives = o.creatives
    .map(parseCreative)
    .filter((c): c is SwipeCreative => c !== null)
    .sort((a, b) => b.score - a.score);
  return {
    nicho: str(o.nicho),
    updated_at: str(o.updated_at),
    source: str(o.source, "apify:ad-library"),
    creatives,
  };
}
```

- [ ] **Step 4: Run tests, confirm green**

Run: `npx vitest run lib/swipe-parse.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit** (controller): `feat(painel): parser/validador do swipe index + testes (Inc 2a)`

---

### Task 4: Swipe bank reader (fs) + niche listing

**Files:**
- Create: `lib/swipe.ts`

- [ ] **Step 1: Write the reader**

```ts
// lib/swipe.ts
import fs from "node:fs";
import path from "node:path";
import { ativosDir } from "./paths";
import { parseSwipeIndex } from "./swipe-parse";
import type { SwipeBank } from "./types";

function swipeRoot(): string {
  return path.join(ativosDir(), "swipe");
}

/** Lista os nichos com banco gravado (subpastas de contexto/ativos/swipe/). */
export function listSwipeNichos(): string[] {
  const root = swipeRoot();
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("."))
    .map((d) => d.name)
    .sort();
}

/** Lê + valida o banco de um nicho. null se não existir ou JSON inválido. */
export function readSwipeBank(nicho: string): SwipeBank | null {
  const fp = path.join(swipeRoot(), nicho, "index.json");
  if (!fs.existsSync(fp)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(fp, "utf8")) as unknown;
    return parseSwipeIndex(raw);
  } catch (err) {
    console.error(`[swipe] erro ao ler banco ${fp}:`, err);
    return null;
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

> No vitest for `lib/swipe.ts` itself (it's the thin fs shell; logic lives in the tested `swipe-parse.ts`, matching how `lib/campaigns.ts` is untested but `lib/skill-helpers.ts` is). The parser carries the coverage.

- [ ] **Step 3: Commit** (controller): `feat(painel): leitor do swipe bank por nicho (Inc 2a)`

---

### Task 5: API route `GET /api/swipe`

**Files:**
- Create: `app/api/swipe/route.ts`

- [ ] **Step 1: Write the route** (mirror `app/api/campaigns/route.ts` conventions: `runtime = "nodejs"`, `dynamic = "force-dynamic"`)

```ts
// app/api/swipe/route.ts
import { listSwipeNichos, readSwipeBank } from "@/lib/swipe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const nicho = url.searchParams.get("nicho");
  if (!nicho) {
    return Response.json({ nichos: listSwipeNichos() });
  }
  const bank = readSwipeBank(nicho);
  if (!bank) return new Response("not found", { status: 404 });
  return Response.json(bank);
}
```

- [ ] **Step 2: Typecheck + smoke**

Run: `npm run typecheck`
Expected: exit 0.

Manual smoke (after Task 9 has seeded a fixture, or with a hand-made fixture): `curl -s 'http://localhost:3737/api/swipe' ` → `{"nichos":[...]}`; `curl -s 'http://localhost:3737/api/swipe?nicho=<slug>'` → the bank JSON.

- [ ] **Step 3: Commit** (controller): `feat(painel): /api/swipe lê o banco de validados (Inc 2a)`

---

### Task 6: `SwipeCreativeCard` component

**Files:**
- Create: `components/SwipeCreativeCard.tsx`

- [ ] **Step 1: Write the card** (extends the `CreativeCard` visual language: `.asset`, ratio badge top-left, reuse `Pill` for the angle, score badge top-right; thumb via `/api/files?p=`)

```tsx
"use client";

import { Pill } from "@/components/Pill";
import type { SwipeCreative } from "@/lib/types";

const ANGLE_LABEL: Record<string, string> = {
  "prova-social": "Prova Social",
  "risco-zero": "Risco Zero",
  "economia-tempo": "Economia de Tempo",
  autoridade: "Autoridade",
  urgencia: "Urgência",
  curiosidade: "Curiosidade",
  "antes-depois": "Antes/Depois",
  outro: "Outro",
};

export function SwipeCreativeCard({
  creative,
  nicho,
  onVariar,
}: {
  creative: SwipeCreative;
  nicho: string;
  onVariar: (c: SwipeCreative) => void;
}) {
  const c = creative;
  const portrait = c.format === "9:16";
  const thumbRel = `contexto/ativos/swipe/${nicho}/${c.file}`;
  const isVideo = c.format === "video" || /\.(mp4|webm|mov)$/i.test(c.file);
  const scorePct = Math.round(c.score * 100);
  return (
    <div className="card" style={{ overflow: "hidden", display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        className={`asset__thumb imgph${portrait ? " asset__thumb--portrait" : ""}`}
        style={
          isVideo
            ? undefined
            : {
                backgroundImage: `url("/api/files?p=${encodeURIComponent(thumbRel)}")`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
        }
      >
        {isVideo && (
          <video
            src={`/api/files?p=${encodeURIComponent(thumbRel)}`}
            muted
            playsInline
            preload="metadata"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        )}
        <div
          style={{
            position: "absolute", top: 6, left: 6, fontFamily: "var(--font-mono)", fontSize: 10,
            padding: "2px 6px", borderRadius: 4, background: "oklch(0.10 0.005 60 / 0.55)",
            color: "var(--text-secondary)", backdropFilter: "blur(4px)",
          }}
        >
          {c.format}
        </div>
        <div
          title={`score composto ${c.score} · confiança ${c.confidence}`}
          style={{
            position: "absolute", top: 6, right: 6, fontFamily: "var(--font-mono)", fontSize: 10,
            padding: "2px 6px", borderRadius: 4, background: "var(--accent)", color: "var(--accent-fg)", fontWeight: 600,
          }}
        >
          {scorePct}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Pill variant="accent">{ANGLE_LABEL[c.angle] ?? c.angle}</Pill>
        <span className="mono dim" style={{ fontSize: 11 }}>conf. {Math.round(c.confidence * 100)}%</span>
      </div>

      <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>{c.advertiser || "Anunciante"}</div>
      <div className="dim" style={{ fontSize: 12, lineHeight: 1.45 }}>{c.source_evidence}</div>

      {c.landing.headline && (
        <div className="card" style={{ background: "var(--bg-input)", padding: 10, gap: 4 }}>
          <span className="dim mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>landing pareada</span>
          <div style={{ fontSize: 12, fontWeight: 600 }}>{c.landing.headline}</div>
          {c.landing.offer && <div className="dim" style={{ fontSize: 12 }}>{c.landing.offer}</div>}
          {c.landing.proof && <div className="dim" style={{ fontSize: 11 }}>{c.landing.proof}</div>}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginTop: "auto" }}>
        <button className="btn btn--primary btn--sm" type="button" onClick={() => onVariar(c)}>
          Gerar variação on-brand
        </button>
        {c.ad_url && (
          <a className="btn btn--ghost btn--sm" href={c.ad_url} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
            Ver na Ad Library
          </a>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit** (controller): `feat(painel): SwipeCreativeCard (Inc 2a)`

---

### Task 7: `SwipeGallery` + variation stub (Inc 2c hook)

**Files:**
- Create: `components/SwipeGallery.tsx`

- [ ] **Step 1: Write the gallery** (niche selector if >1 niche; grid of `SwipeCreativeCard`; empty/loading states; the "gerar variação" stub posts nothing yet — it opens a toast/alert documenting the Inc 2c contract: `pesquisar-criativos` → `criar-criativo --variar <ad_id>`)

```tsx
"use client";

import { useMemo, useState } from "react";
import { SwipeCreativeCard } from "@/components/SwipeCreativeCard";
import type { SwipeBank, SwipeCreative } from "@/lib/types";

export function SwipeGallery({ banks }: { banks: SwipeBank[] }) {
  const [activeNicho, setActiveNicho] = useState(banks[0]?.nicho ?? "");
  const bank = useMemo(() => banks.find((b) => b.nicho === activeNicho) ?? banks[0], [banks, activeNicho]);

  // Inc 2c hook (stub): a variação real é gerada pela skill criar-criativo no modo
  // "variação a partir de referência" (depende do Inc 2c). Por ora documentamos o contrato.
  function onVariar(c: SwipeCreative) {
    window.alert(
      `Variação on-brand (Inc 2c, em breve):\n\n` +
        `Referência: ${c.advertiser} · ${c.ad_id}\n` +
        `Ângulo: ${c.angle}\n\n` +
        `Vai rodar: criar-criativo no modo "variação a partir de referência" — ` +
        `analisa a estrutura (hook/ângulo/oferta + sinais da LP pareada), NÃO copia pixel, ` +
        `e gera conceito grounded no contexto/ da empresa.`,
    );
  }

  if (banks.length === 0) {
    return (
      <div className="empty" style={{ margin: 32 }}>
        <div className="empty__title">Nenhum banco de validados ainda</div>
        <div className="empty__sub">
          Rode a skill <strong>Pesquisar criativos</strong> — ela rola a Ad Library do seu nicho por você. De manhã, os vencedores estão aqui.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
      <div style={{ padding: "18px 32px 8px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Swipe file do nicho</h1>
        <span className="dim" style={{ fontSize: 13 }}>ele rola por você — de manhã os vencedores estão lá</span>
        <span className="spacer" style={{ flex: 1 }} />
        {banks.length > 1 && (
          <div style={{ display: "flex", gap: 6 }}>
            {banks.map((b) => (
              <button
                key={b.nicho}
                type="button"
                className={`chip${b.nicho === bank.nicho ? " chip--selected" : ""}`}
                onClick={() => setActiveNicho(b.nicho)}
              >
                {b.nicho}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="meta-line" style={{ padding: "0 32px 4px" }}>
        contexto/ativos/swipe/{bank.nicho}/ · {bank.creatives.length} validados · atualizado {bank.updated_at}
      </div>
      <div
        style={{
          padding: "12px 32px 32px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: 16,
          overflow: "auto",
        }}
      >
        {bank.creatives.map((c) => (
          <SwipeCreativeCard key={c.ad_id} creative={c} nicho={bank.nicho} onVariar={onVariar} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit** (controller): `feat(painel): SwipeGallery ordenada por score + stub de variação (Inc 2a)`

---

### Task 8: `/swipe` page + Sidebar nav entry

**Files:**
- Create: `app/swipe/page.tsx`
- Modify: `components/Sidebar.tsx`

- [ ] **Step 1: Write the page** (server component — reads niches via `lib/swipe.ts`, hydrates `SwipeGallery` inside the SAME shell the other pages use: `AppShell` + `Sidebar` + `TopBar`. Pattern copied from `app/page.tsx`. Reads `readEmpresa()`/`listCampaigns()` only to feed the Sidebar, matching the existing pages.)

```tsx
// app/swipe/page.tsx
import { AppShell } from "@/components/AppShell";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { GlobalSkillRunnerHost } from "@/components/GlobalSkillRunnerHost";
import { FileWatcherSync } from "@/components/FileWatcherSync";
import { SwipeGallery } from "@/components/SwipeGallery";
import { listSwipeNichos, readSwipeBank } from "@/lib/swipe";
import { readEmpresa } from "@/lib/empresa";
import { listCampaigns } from "@/lib/campaigns";
import type { SwipeBank } from "@/lib/types";

export const dynamic = "force-dynamic";

export default function SwipePage() {
  const empresa = readEmpresa();
  const campaigns = listCampaigns();
  const banks = listSwipeNichos()
    .map((n) => readSwipeBank(n))
    .filter((b): b is SwipeBank => b !== null);

  return (
    <AppShell sidebar={<Sidebar activeView="swipe" campaigns={campaigns} empresaNome={empresa.nome} />}>
      <TopBar crumbs={[empresa.nome, "swipe file"]} />
      <SwipeGallery banks={banks} />
      <GlobalSkillRunnerHost />
      <FileWatcherSync scope="all" />
    </AppShell>
  );
}
```

> Confirm `TopBar`'s `crumbs` prop type accepts a `string[]` (it does in `app/page.tsx`). `GlobalSkillRunnerHost` + `FileWatcherSync` are included so launching `pesquisar-criativos` from the skills surface and live file updates work on this page too, matching `app/page.tsx`.

- [ ] **Step 2: Add the Sidebar nav item**

Read `components/Sidebar.tsx` first. It uses `next/link` `<Link>` + `.sidebar__item` / `.sidebar__item__icon` markup, and an `activeView` prop typed `"empresa" | "campaign"`.

Add a new top-level section (after EMPRESA, before/after CAMPANHAS) with a `<Link href="/swipe">` labeled "Swipe file" using `<Icons.search />` (already exported in `components/icons.tsx` — do NOT invent an icon). For active-highlighting:
- Widen the `activeView` prop type to `"empresa" | "campaign" | "swipe"` in the `Props` interface, AND
- Find every caller of `<Sidebar … />` (grep `Sidebar(` / `<Sidebar`) — the `/swipe` page must pass `activeView="swipe"`, others keep their current value. Update `app/swipe/page.tsx` (Task 8 Step 1) to render the same `AppShell`/`Sidebar` layout the other pages use (check `app/page.tsx` and `app/c/[slug]/page.tsx` for the exact shell wiring — match it, do not hand-roll a different layout). If those callers don't take an explicit `activeView` that needs touching, the minimal change is just widening the union; verify with typecheck.

Mark the item active when on `/swipe` (e.g. `activeView === "swipe"`).

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: both exit 0; build emits the `/swipe` route.

- [ ] **Step 4: Commit** (controller): `feat(painel): página /swipe + nav no Sidebar (Inc 2a)`

---

### Task 9: Fixture for QA + manual API/UI verification

**Files:**
- Create (temporary, NOT committed): a niche fixture under the dev template the painel points at via `MAGNUS_PAINEL_CWD`.

The painel reads from `MAGNUS_PAINEL_CWD` (a Magnus template). Use the existing dev template `/Users/yuribranco/Documents/Magnus/magnus-os-plugin/template` (or `teste-zerado`) for QA.

- [ ] **Step 1: Write a realistic fixture** by hand (one `1:1`, one `9:16`, one `video`, varied scores so sort is visible):

Create `template/contexto/ativos/swipe/saude-auditiva/index.json` with 3 creatives matching the spec §5 schema exactly. Compute each `score` with the Task 2 formula (e.g. the `100k-200k / 3400 / 142 / 6` example → run `node -e` against the built formula, or hand-compute). Add placeholder media `123.jpg`, `124.jpg`, `125.mp4` (copy any small sample image/video so the thumb renders) and `lp-123.txt` etc.

- [ ] **Step 2: Run the painel against the template**

Run (from painel root): `MAGNUS_PAINEL_CWD=/Users/yuribranco/Documents/Magnus/magnus-os-plugin/template npm run dev`
Expected: server on `http://localhost:3737`.

- [ ] **Step 3: API smoke**

Run: `curl -s 'http://localhost:3737/api/swipe' && echo && curl -s 'http://localhost:3737/api/swipe?nicho=saude-auditiva'`
Expected: first → `{"nichos":["saude-auditiva"]}`; second → the bank JSON with `creatives` sorted by `score` desc.

- [ ] **Step 4: QA visual (use the `/browse` gstack skill)**

Open `http://localhost:3737/swipe`. Verify: gallery renders, cards ordered by score (highest first), angle pills + score badge + confidence + paired-LP summary visible, thumbs load, "Gerar variação on-brand" shows the Inc 2c stub alert, "Ver na Ad Library" link present. Check the empty state by pointing at a template with no swipe dir. Confirm the design matches `docs/designs/DESIGN.md` conventions (cards/pills/accent — flag any deviation).

- [ ] **Step 5: Remove the fixture** (it was for QA only; the real bank is written by the skill). Do not commit the fixture media.

---

### Task 10: `pesquisar-criativos` skill — the agent side (markdown)

**Files:**
- Create: `skills/pesquisar-criativos/SKILL.md`
- Create: `skills/pesquisar-criativos/scripts/apify_adlibrary.sh`
- Create: `skills/pesquisar-criativos/scripts/fetch_lp.sh`
- Create: `skills/pesquisar-criativos/references/angulos.md`

- [ ] **Step 1: Write the angle taxonomy reference**

`references/angulos.md` — the closed set the skill maps to (matches the `CreativeAngle` type from Task 1), each with a one-line tell so the agent assigns by evidence, not vibe:

```markdown
# Taxonomia de ângulos (Inc 2a)

O ângulo nomeado de cada criativo vem desta lista fechada. Escolha pelo que a
EVIDÊNCIA (hook do criativo + copy da LP pareada) mostra, não por intuição.

| slug | Nome | Tell (sinal observável) |
|---|---|---|
| prova-social | Prova Social | depoimento, "X mil clientes", antes/depois de terceiros, selos |
| risco-zero | Risco Zero | garantia, "teste grátis", devolução, "sem compromisso" |
| economia-tempo | Economia de Tempo | "em 7 dias", "rápido", "atalho", "sem esforço" |
| autoridade | Autoridade | médico/especialista, estudo, prêmio, instituição |
| urgencia | Urgência | "últimas vagas", contagem, "acaba hoje", escassez |
| curiosidade | Curiosidade | pergunta paradoxal, "o segredo que…", loop aberto |
| antes-depois | Antes/Depois | transformação visual do próprio avatar |
| outro | Outro | quando nenhum acima tem evidência clara |

Regra D11: cada ângulo atribuído precisa de `source_evidence` (citação curta do
hook ou da LP) e um `confidence` 0–1. Sem evidência → `outro` + confidence baixo.
```

- [ ] **Step 2: Write `scripts/apify_adlibrary.sh`** (loads `.env` for `APIFY_TOKEN`, runs the actor sync, prints dataset items; mirrors `gen_image.sh`'s `.env` loading)

```bash
#!/usr/bin/env bash
# Roda o actor curious_coder/facebook-ads-library-scraper de forma síncrona e
# imprime os itens do dataset (JSON) no stdout.
# Uso: apify_adlibrary.sh <input.json>
set -euo pipefail

if [ "$#" -ne 1 ]; then echo "Uso: $0 <input.json>" >&2; exit 1; fi
INPUT="$1"

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
if [ -f "${ROOT}/.env" ]; then set -a; . "${ROOT}/.env"; set +a; fi
if [ -z "${APIFY_TOKEN:-}" ]; then
  echo "Erro: APIFY_TOKEN não definida. Configure em ${ROOT}/.env" >&2; exit 1
fi

ACTOR="curious_coder~facebook-ads-library-scraper"
curl -s -X POST \
  "https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${APIFY_TOKEN}" \
  -H "Content-Type: application/json" \
  --data @"${INPUT}"
```

- [ ] **Step 3: Write `scripts/fetch_lp.sh`** (fetches a URL, strips to readable text; no extra deps — uses `curl` + a `sed`/`tr` tag strip; the agent does the semantic extraction of headline/offer/proof from this text)

```bash
#!/usr/bin/env bash
# Baixa uma landing page e imprime texto legível (tags removidas).
# Uso: fetch_lp.sh <url>
set -euo pipefail
if [ "$#" -ne 1 ]; then echo "Uso: $0 <url>" >&2; exit 1; fi
URL="$1"
curl -sL --max-time 25 -A "Mozilla/5.0 (MagnusOS swipe)" "$URL" \
  | sed -e 's/<script[^>]*>.*<\/script>//gI' -e 's/<style[^>]*>.*<\/style>//gI' \
  | sed -e 's/<[^>]*>/ /g' \
  | tr -s ' \t\n' ' ' \
  | head -c 8000
```

- [ ] **Step 4: Write `SKILL.md`** — frontmatter (category `auditar`, `allowed-tools` scoped to the two scripts + Read/Write/Glob + mkdir/date), `panel:` block (start_form: niche keywords textarea prefilled from EMPRESA, country select), and a decomposed body (D11 §5b.7: deliberate steps, not a mega-prompt):

```markdown
---
name: pesquisar-criativos
description: Monta um banco de criativos VALIDADOS do nicho da empresa (estilo swipe file). Lê o nicho do contexto/EMPRESA.md, busca a Meta Ad Library via Apify, baixa os criativos, pareia a landing page de cada um, calcula um score composto (faixa de impressões + engajamento + longevidade + variações), nomeia o ângulo com evidência, e grava contexto/ativos/swipe/<nicho>/. Use sempre que o usuário pedir "pesquisar criativos", "criativos validados", "swipe file", "o que está rodando no nicho", "espiar concorrentes", "criativos vencedores do mercado" ou similar.
allowed-tools: Read, Write, Glob, Bash(${CLAUDE_PLUGIN_ROOT}/skills/pesquisar-criativos/scripts/apify_adlibrary.sh:*), Bash(${CLAUDE_PLUGIN_ROOT}/skills/pesquisar-criativos/scripts/fetch_lp.sh:*), Bash(mkdir -p *), Bash(date:*), Bash(curl:*)
panel:
  category: auditar
  icon: search
  order: 1
  requires:
    - contexto/EMPRESA.md
  start_form:
    - id: nicho
      type: input
      label: Nicho (slug, kebab-case)
      placeholder: "ex: saude-auditiva"
      required: true
    - id: keywords
      type: textarea
      label: Palavras-chave de busca (uma por linha; deixe vazio pra eu sugerir do EMPRESA.md)
      required: false
    - id: pais
      type: select
      label: País
      options: ["BR", "US", "PT", "ES", "DE"]
      required: true
  output:
    type: mixed
    dir: contexto/ativos/swipe/{nicho}/
---

# Skill: Pesquisar Criativos (banco de validados do nicho)

Roda a Ad Library do nicho por você e deixa os vencedores prontos numa galeria.
File-first: grava `contexto/ativos/swipe/<nicho>/` — o painel só lê.

## Pré-requisitos
- `APIFY_TOKEN` em `.env` (raiz do projeto). Sem ele, pare e peça pro usuário configurar.
- `contexto/EMPRESA.md` preenchido (nicho, posicionamento, ofertas, ICP).

## Passo 1 — Derivar/confirmar keywords do nicho
Leia `contexto/EMPRESA.md`. Extraia candidatos de keyword de **Setor + Posicionamento + Ofertas + dor do ICP**.
Se o usuário não passou keywords no formulário, proponha 3–6 e PEÇA confirmação (uma rodada).
Grave o set confirmado em `contexto/ativos/swipe/<nicho>/keywords.json`:
`{ "keywords": ["..."], "country": "BR", "confirmed_at": "<ISO>" }`.

## Passo 2 — Custo + cache (ToS)
Diga ao usuário: "Vou rodar 1 puxada no Apify (~40 anúncios), custo aproximado de poucos dólares."
Se já existe `index.json` pro nicho, é REFRESH INCREMENTAL: leia os `ad_id` já gravados e só baixe mídia de anúncios novos.
Peça OK antes de gastar.

## Passo 3 — Scrape (Apify)
Monte o input e rode o actor:
```bash
SLUG="<nicho>"; DIR="contexto/ativos/swipe/${SLUG}"; mkdir -p "$DIR"
cat > /tmp/apify-in.json <<JSON
{ "searchTerms": ["<kw1>","<kw2>"], "country": "<PAIS>", "adActiveStatus": "active", "adType": "all", "count": 40 }
JSON
${CLAUDE_PLUGIN_ROOT}/skills/pesquisar-criativos/scripts/apify_adlibrary.sh /tmp/apify-in.json > /tmp/apify-out.json
```
Leia `/tmp/apify-out.json`. **Mapeie os campos defensivamente** — os nomes do actor variam:
- `ad_id` ← `adArchiveID` / `ad_archive_id` / `id`
- `advertiser` ← `pageName` / `page_name`
- mídia ← primeira `imageUrl`/`videoUrl`/`snapshot.images[].original_image_url`
- `impressions_bucket` ← `impressionsText` / `impressions` / bucket de impressões (NOVO 2026). Ausente → "".
- `engagement` ← soma de likes+comments+shares do post (ex: `reactionCount`+`commentCount`+`shareCount`). Ausente → 0.
- `days_active` ← hoje − `adDeliveryStartTime`/`startDate`. Ausente → 0.
- `variations` ← `totalActiveTime` count / nº de cards do mesmo snapshot / `collationCount`. Ausente → 1.
> Se um sinal faltar, registre e **abaixe o `confidence`** (fração dos 4 sinais presentes, piso 0.25). NUNCA invente número.

## Passo 4 — Baixar mídia
Pra cada anúncio (top N por sinais brutos, default 12), baixe a mídia pra `${DIR}/<ad_id>.jpg|mp4`:
```bash
curl -sL "<media_url>" -o "${DIR}/<ad_id>.jpg"
```
Detecte `format` pelo aspect/extension (1:1 / 9:16 / video).

## Passo 5 — Parear a landing page (decisão MVP, D10)
Pra cada anúncio com `link_url`/`caption_url`:
```bash
${CLAUDE_PLUGIN_ROOT}/skills/pesquisar-criativos/scripts/fetch_lp.sh "<lp_url>" > "${DIR}/lp-<ad_id>.txt"
```
Leia o `.txt` e extraia (semântico, do texto real): `headline`, `offer`, `proof`. Sem LP → campos vazios + confidence menor.

## Passo 6 — Ângulo nomeado + evidência (D11)
Leia `references/angulos.md`. Pra cada criativo, com base no hook do criativo + copy da LP, atribua UM `angle` da lista fechada e escreva `source_evidence` (citação curta). Sem evidência clara → `outro`.

## Passo 7 — Score composto
Pra cada criativo, calcule o `score` com ESTA fórmula (idêntica a `lib/creative-score.ts` do painel):
```
score = 0.35*impr + 0.25*eng + 0.25*days + 0.15*var
impr = posição do bucket na escada [<1k,1k-5k,5k-10k,10k-50k,50k-100k,100k-200k,200k-500k,500k-1M,>1M] / 8   (desconhecido/Low Impression Count → 0)
eng  = clamp01( log10(engagement+1) / log10(100001) )
days = clamp01( days_active / 180 )
var  = clamp01( variations / 10 )
```
Arredonde a 3 casas. `confidence` = fração dos 4 sinais presentes (piso 0.25).

## Passo 8 — Gravar `index.json` (schema §5, byte-for-byte)
Escreva `${DIR}/index.json` ordenado por `score` desc, no schema EXATO (campos: ad_id, advertiser, file, format, score, confidence, signals{impressions_bucket,engagement,days_active,variations}, angle, source_evidence, landing{url,headline,offer,proof,captured}, ad_url, first_seen). Em refresh, faça merge com os existentes e re-ordene.

## Passo 9 — Avisar
Diga: "Banco do nicho <nicho> atualizado — N validados em contexto/ativos/swipe/<nicho>/. Abra a galeria Swipe file no painel." Mostre o top 3 (advertiser · ângulo · score).
```

- [ ] **Step 5: chmod scripts**

Run: `chmod +x /Users/yuribranco/Documents/Magnus/magnus-os-plugin/plugins/magnus-os/skills/pesquisar-criativos/scripts/*.sh`

- [ ] **Step 6: Validate the plugin**

Run: `claude plugin validate /Users/yuribranco/Documents/Magnus/magnus-os-plugin/plugins/magnus-os`
Expected: PASS (no schema errors in the new SKILL.md frontmatter). If `claude plugin validate` is unavailable in the env, fall back to: parse the frontmatter with `node -e` using `gray-matter` (already a painel dep) and assert `name`, `description`, `allowed-tools`, and `panel.category === "auditar"` are present.

- [ ] **Step 7: Documented dry-run** (no real Apify spend)

Verify the skill surfaces in the painel skills bar under "auditar" by running the painel against a template that has the plugin skills dir wired (`MAGNUS_SKILLS_DIR` pointing at the plugin skills). Confirm: the skill appears, the `start_form` renders (nicho input, keywords textarea, país select). Do NOT trigger a real run in this step (that spends Apify); the live run is validated by the user with a real `APIFY_TOKEN` (see Final Verification + Assumptions).

- [ ] **Step 8: Commit** (controller): `feat(plugin): skill pesquisar-criativos — scrape Apify + LP pareada + score (Inc 2a)`

---

### Task 11: Final verification + gates

- [ ] **Step 1: Full painel test + typecheck + build**

Run (from painel root):
```
npm run typecheck && npm run test && npm run build
```
Expected: typecheck exit 0; vitest all green (existing + new `creative-score.test.ts` + `swipe-parse.test.ts`); build exit 0 with `/swipe` route emitted.

- [ ] **Step 2: QA visual of the gallery** — re-run the Task 9 fixture + `/browse` pass on `http://localhost:3737/swipe`. Confirm score ordering, angle pills, paired-LP summary, score/confidence badges, video tile, empty state, and DESIGN.md adherence. Remove fixture after.

- [ ] **Step 3: `/codex review` gate (fixed gate, AGENTS.md §3 / gstack-gates)** — run `/codex review` on the combined diff (both repos). Required verdict: **PASS**. Fix anything codex flags, re-run until PASS. Pay attention to: defensive Apify field mapping (no crash on missing fields), the `confidence` flooring, score clamping at boundaries, path-traversal safety of the niche slug in `/api/files` (the slug comes from a directory name read by `listSwipeNichos`, so it can't traverse — confirm), and that the painel never recomputes score against the network.

- [ ] **Step 4: Wiki + Drive** (deliverable cycle): document in `~/Documents/Pessoal/wiki/wiki/projects/magnus-os.md` Session log (what shipped, files, the score formula, the recommended actor, the "validate field names against real actor output" caveat). No Drive upload (code lives in git).

---

## ToS / cost notes (consolidated)
- One niche refresh = one Apify actor run (~40 ads). Cache per niche (`index.json` + `keywords.json`); refresh is **incremental** (only download media for new `ad_id`s). State the estimated cost and ask for confirmation before each run. (spec §"Erros a evitar": "Scraping sem cache/limite → custo Apify e ToS").
- Apify actors handle the engagement scraping + ToS gray area (D7) — we don't scrape Facebook directly. Spyglass is a reference only (D8); our source is Ad Library via Apify.
- LP fetch is a plain `curl` of a public URL with a short timeout and an 8KB text cap — no auth, no crawling depth.

## Out of scope (this plan)
- Real variation generation (Inc 2c) — the gallery button is a documented stub.
- EU/DSA reach/demographics enrichment (spec §6 — optional, not blocking).
- A new EMPRESA.md "nicho" field (keywords derived + confirmed at runtime, persisted to `keywords.json`).
- Any write to Meta / own-account top performers (that's Inc 2b, depends on Inc 1).

## Assumptions / ambiguity to flag
1. **Apify actor field names are NOT verified against a live run.** `impressions_bucket`, per-post `engagement`, `days_active`, `variations` are mapped defensively (Task 10 §Passo 3) but the exact keys (`adArchiveID` vs `ad_archive_id`, where the impressions bucket lives, whether engagement is even returned by this actor) **must be validated against one real run with a real `APIFY_TOKEN`** before the score is trusted in production. If the actor doesn't return per-post engagement, that signal degrades to 0 and `confidence` drops — the formula still produces a (hedged) ranking. **This is the #1 thing to verify on first live use.**
2. **Score weights (0.35/0.25/0.25/0.15) are a defensible first cut, not empirically tuned.** They're isolated in `lib/creative-score.ts` so tuning is a one-line change + a test update. Revisit after the first real niche pull.
3. **`variations` default = 1** when absent (an ad is at least one variation); confirm the actor exposes a real variation/collation count or this signal is effectively flat.
4. **Niche keywords** come from `EMPRESA.md` free-text via agent extraction + user confirmation — quality depends on a filled EMPRESA.md. The skill asks rather than guesses silently.
5. **Video thumbs**: `SwipeCreativeCard` renders `.mp4` via a muted `<video>`; if a niche returns mostly video and that's heavy, a future step could capture a poster frame in the skill. Out of scope now.
