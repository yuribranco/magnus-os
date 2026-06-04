# Radar Hosted (Fase 2 — product-grade) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o coletor Radar (hoje CLI dogfood na máquina do Yuri) num **serviço hosted product-grade**: um cliente do Magnus OS pede o Radar em linguagem natural no painel → o Claude dele chama o serviço do Yuri (autenticado por license-key) → o serviço usa a Apify do Yuri com **cache compartilhado entre clientes** e **guardrails de custo** → devolve o board → o painel mostra.

**Architecture:**
- **Serviço Node/Fastify** que ESTENDE o repo `radar` existente (reusa `score.ts`/`apify.ts`/`db.ts`). Roda como processo **PM2 `radar`** no **VPS Hostinger principal (187)**, atrás do nginx num subdomínio dedicado. A chave Apify vive **só no servidor** (nunca chega ao cliente). Fala com o **Supabase Portal Magnus** (`radar.*` = dataset compartilhado + `licencas` = auth).
- **Painel file-first intacto:** quem chama o serviço é a **skill `radar`** (Claude do cliente, via HTTPS com a license-key). A skill grava o `radar.json` na campanha; a seção Radar (já construída na Fase 1) mostra. O painel nunca fala com Apify/Supabase direto.
- **Cache compartilhado é a feature de custo:** concorrente já varrido por *qualquer* cliente dentro do TTL → servido do banco, **zero Apify**. Guru popular = varrido 1× pra todos.

**Tech Stack:** Node 20, Fastify, `apify-client`, `@supabase/supabase-js` (service-role), vitest, PM2, nginx. Painel: skill em SKILL.md (Claude executa via `curl`/fetch), sem deps novas.

**Decisões travadas (NÃO reabrir — vêm das respostas do Yuri 2026-06-03):**
- Hosted, não local-first. Apify = do Yuri, centralizada. Roda no VPS 187 por enquanto (consolida tudo num servidor quando começar a vender).
- Dataset `radar.*` compartilhado entre clientes (pooling = feature). Single-tenant no Supabase do Yuri por ora (RLS/multi-tenant fica pra quando vender — o gate de licença na API já protege o acesso).
- Guardrails dos dois lados: cliente escolhe **≤3 concorrentes nomeados** (caminho barato/padrão) ou roda **descoberta de nicho capada ao top-N** (rara); servidor impõe **cache TTL + cota mensal por licença + rate-limit na descoberta**.

---

## Pré-requisitos manuais (Yuri — fora do código)
- **DNS:** criar `radar-api.yuribranco.com.br` (ou subdomínio escolhido) → A record pro IP do VPS 187 (`187.77.225.192`). Necessário antes da Task 10 (nginx/deploy).
- **Secrets no VPS:** o `.env` do serviço no VPS carrega `APIFY_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (Portal Magnus) + `RADAR_TTL_DAYS`, `RADAR_QUOTA_SCANS_MONTH`, `RADAR_QUOTA_DISCOVERIES_MONTH`. Seguir a regra de credenciais (1Password + `.env.local` local + VPS).

## File Structure (repo `radar` — `~/Documents/Magnus/radar`)
- `src/cache.ts` — **NOVO.** Decisão de cache-hit (pura) + leitura de ads ativos do DB por anunciante. Reusa `isFresh`/`getAdvertiserFreshness`.
- `src/quota.ts` — **NOVO.** Lógica pura de cota mensal + período corrente. + leitura/incremento no DB.
- `src/auth.ts` — **NOVO.** Valida license-key contra `licencas` (service-role) + telemetria `touch_licenca`.
- `src/scan.ts` — **MODIFICAR.** Adicionar `scanHosted(competitors, opts)` = caminho cache-aware (scrape só no miss) que devolve payload, separado do `scanNamed` dogfood (que sempre scrapeia).
- `src/server.ts` — **NOVO.** App Fastify: rotas `/v1/scan`, `/v1/discover`, health. Auth + quota como hooks.
- `bin/serve.ts` — **NOVO.** Sobe o server (entry do PM2).
- `migrations/002_radar_quota.sql` — **NOVO.** `radar.license_usage` (cota) + índice.
- `tests/cache.test.ts`, `tests/quota.test.ts`, `tests/auth.test.ts` — **NOVOS** (lógica pura).
- `ecosystem.config.cjs` — **NOVO.** Config PM2 do processo `radar`.

## File Structure (plugin — `~/Documents/Magnus/magnus-os-plugin/plugins/magnus-os/skills`)
- `radar/SKILL.md` — **NOVO.** Skill em linguagem natural: lê intenção (nicho ou ≤3 concorrentes + campanha) → chama o serviço com a license-key → grava `operacao/<slug>/radar/radar.json`.

## File Structure (painel — `magnus-painel`)
- `lib/paths.ts` ou `.env` do workspace — onboarding da **license-key** + **URL do serviço Radar**. (A chave do Gemini já tem onboarding; espelhar.)

## Contrato de API (o seam entre painel e serviço)
```jsonc
// POST /v1/scan   (Authorization: Bearer <license-key>)
// req:
{ "slug": "minha-campanha", "niche": "emagrecer",
  "competitors": ["117284664776965", "<pageId2>", "<pageId3>"] }   // ≤3, pageIds
// res 200: payload idêntico ao radar.json da Fase 1 (generated_at, niche, ads[] ranqueado)
//   + meta: { cache_hits: 2, scraped: 1, quota_remaining: 27 }
// res 401 license inválida | 429 cota estourada | 400 >3 competitors

// POST /v1/discover  (Authorization: Bearer <license-key>)
// req: { "niche": "emagrecer" }
// res 200: { advertisers: [{ page_id, page_name, ads_count }], capped_at: 15 }  // top-N maiores
//   o cliente escolhe ≤3 → vira /v1/scan
// res 429 rate-limit (descoberta é rara)
```

---

## Task 1: `cache.ts` — decisão de cache-hit (pura, TDD)

**Files:**
- Create: `~/Documents/Magnus/radar/src/cache.ts`, `tests/cache.test.ts`

- [ ] **Step 1: Teste** — Create `~/Documents/Magnus/radar/tests/cache.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { cachePlan } from "../src/cache.js";

const now = new Date("2026-06-10T00:00:00Z").getTime();
describe("cachePlan (TTL 7d, cross-customer)", () => {
  it("separa hits (frescos) de misses (stale/ausentes)", () => {
    const freshness = { a: "2026-06-08T00:00:00Z", b: "2026-05-01T00:00:00Z", c: null };
    const out = cachePlan(["a", "b", "c"], freshness, now);
    expect(out.hits).toEqual(["a"]);
    expect(out.misses.sort()).toEqual(["b", "c"]);
  });
  it("lista vazia não quebra", () => {
    expect(cachePlan([], {}, now)).toEqual({ hits: [], misses: [] });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `cd ~/Documents/Magnus/radar && npx vitest run tests/cache.test.ts` → FAIL.

- [ ] **Step 3: Implementar** — Create `~/Documents/Magnus/radar/src/cache.ts`:
```ts
import { isFresh } from "./db.js";

/** Divide pageIds em hits (frescos no cache compartilhado) e misses (precisam scrape). */
export function cachePlan(
  pageIds: string[],
  freshnessByPage: Record<string, string | null>,
  nowMs: number = Date.now(),
): { hits: string[]; misses: string[] } {
  const hits: string[] = [], misses: string[] = [];
  for (const id of pageIds) {
    if (isFresh(freshnessByPage[id] ?? null, nowMs)) hits.push(id);
    else misses.push(id);
  }
  return { hits, misses };
}
```

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run tests/cache.test.ts` → PASS (2).

- [ ] **Step 5: Commit**
```bash
cd ~/Documents/Magnus/radar && git add src/cache.ts tests/cache.test.ts && git commit -q -m "feat(cache): cachePlan — hit/miss por freshness (cache compartilhado)"
```

---

## Task 2: `db.ts` — leitura de ads do DB + freshness em lote

**Files:**
- Modify: `~/Documents/Magnus/radar/src/db.ts`
- Test: `~/Documents/Magnus/radar/tests/db.test.ts` (só lógica pura nova; as funções de rede não são testadas, igual Fase 1)

- [ ] **Step 1: Implementar leitura batch** — adicionar ao FINAL de `~/Documents/Magnus/radar/src/db.ts`:
```ts
import type { RawAd } from "./apify.js";

/** Freshness de vários anunciantes de uma vez (pra montar o cachePlan). */
export async function getFreshnessBatch(pageIds: string[]): Promise<Record<string, string | null>> {
  if (!pageIds.length) return {};
  const db = client();
  const { data, error } = await db.from("advertisers").select("page_id,last_scraped_at").in("page_id", pageIds);
  if (error) throw new Error(`getFreshnessBatch: ${error.message}`);
  const out: Record<string, string | null> = {};
  for (const id of pageIds) out[id] = null;
  for (const r of data ?? []) out[r.page_id] = r.last_scraped_at;
  return out;
}

/** Lê ads ATIVOS do DB pros anunciantes dados (caminho cache-hit, sem Apify). */
export async function getActiveAds(pageIds: string[]): Promise<RawAd[]> {
  if (!pageIds.length) return [];
  const db = client();
  const { data: advs, error: e1 } = await db.from("advertisers").select("id,page_id,page_name").in("page_id", pageIds);
  if (e1) throw new Error(`getActiveAds advertisers: ${e1.message}`);
  const advById = new Map((advs ?? []).map((a) => [a.id, a]));
  const { data: ads, error: e2 } = await db.from("ads").select("*").in("advertiser_id", [...advById.keys()]).eq("is_active", true);
  if (e2) throw new Error(`getActiveAds ads: ${e2.message}`);
  return (ads ?? []).map((r) => {
    const adv = advById.get(r.advertiser_id);
    return {
      ad_archive_id: r.ad_archive_id, page_id: adv?.page_id ?? "", page_name: adv?.page_name ?? "",
      started_at: r.started_at ?? "", is_active: true, variations: r.collation_count ?? 1,
      media_type: r.media_type ?? "UNKNOWN", cta_text: r.cta_text ?? "", hook: r.body_text ?? "",
      link_url: r.link_url ?? "", thumb_url: r.thumb_url ?? "", creative_fp: r.creative_fp ?? "",
    } satisfies RawAd;
  });
}
```
> Nota: `RawAd.hook` mapeia de `ads.body_text` (foi onde a Fase 1 gravou o hook — ver `upsertAdvertiserAds`).

- [ ] **Step 2: typecheck** — `cd ~/Documents/Magnus/radar && npm run typecheck` → 0 erros.

- [ ] **Step 3: Commit**
```bash
cd ~/Documents/Magnus/radar && git add src/db.ts && git commit -q -m "feat(db): getFreshnessBatch + getActiveAds (leitura do cache compartilhado)"
```

---

## Task 3: `quota.ts` — cota mensal por licença (pura, TDD)

**Files:**
- Create: `~/Documents/Magnus/radar/src/quota.ts`, `tests/quota.test.ts`

- [ ] **Step 1: Teste** — Create `~/Documents/Magnus/radar/tests/quota.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { currentPeriod, quotaVerdict } from "../src/quota.js";

describe("currentPeriod", () => {
  it("formata YYYY-MM a partir de um ms", () => {
    expect(currentPeriod(new Date("2026-06-03T12:00:00Z").getTime())).toBe("2026-06");
  });
});
describe("quotaVerdict", () => {
  const caps = { scans: 30, discoveries: 5 };
  it("libera scan abaixo do cap", () => {
    expect(quotaVerdict("scan", { scans: 10, discoveries: 0 }, caps).allowed).toBe(true);
  });
  it("bloqueia scan no cap", () => {
    expect(quotaVerdict("scan", { scans: 30, discoveries: 0 }, caps).allowed).toBe(false);
  });
  it("discovery tem cap próprio", () => {
    expect(quotaVerdict("discovery", { scans: 0, discoveries: 5 }, caps).allowed).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run tests/quota.test.ts` → FAIL.

- [ ] **Step 3: Implementar** — Create `~/Documents/Magnus/radar/src/quota.ts`:
```ts
export interface UsageCounts { scans: number; discoveries: number; }
export interface QuotaCaps { scans: number; discoveries: number; }

export function currentPeriod(nowMs: number = Date.now()): string {
  const d = new Date(nowMs);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Decide se a operação (que CUSTA Apify) pode rodar. Cache-hit NÃO chama isto. */
export function quotaVerdict(
  op: "scan" | "discovery",
  used: UsageCounts,
  caps: QuotaCaps,
): { allowed: boolean; remaining: number } {
  const [u, cap] = op === "scan" ? [used.scans, caps.scans] : [used.discoveries, caps.discoveries];
  return { allowed: u < cap, remaining: Math.max(0, cap - u) };
}
```

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run tests/quota.test.ts` → PASS (4).

- [ ] **Step 5: Commit**
```bash
cd ~/Documents/Magnus/radar && git add src/quota.ts tests/quota.test.ts && git commit -q -m "feat(quota): cota mensal pura (scan/discovery) + período"
```

---

## Task 4: migration `radar.license_usage` + DB de cota

**Files:**
- Create: `~/Documents/Magnus/radar/migrations/002_radar_quota.sql`
- Modify: `~/Documents/Magnus/radar/src/quota.ts` (+ funções de DB)

- [ ] **Step 1: Migration** — Create `~/Documents/Magnus/radar/migrations/002_radar_quota.sql`:
```sql
create table if not exists radar.license_usage (
  license_key text not null,
  period text not null,                 -- YYYY-MM
  scans int not null default 0,
  discoveries int not null default 0,
  updated_at timestamptz default now(),
  primary key (license_key, period)
);
grant all on radar.license_usage to service_role;
```

- [ ] **Step 2: Aplicar via Management API** (ref `vbmvzmibupzpjwyrfmjs`, padrão da memory `reference_magnus_os_licenca_backend` — curl, não urllib). Confirmar: `select count(*) from radar.license_usage;` → 0 sem erro.

- [ ] **Step 3: Funções de DB de cota** — adicionar ao FINAL de `~/Documents/Magnus/radar/src/quota.ts`:
```ts
import { createClient } from "@supabase/supabase-js";

function client() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes");
  return createClient(url, key, { db: { schema: "radar" } });
}

export async function getUsage(licenseKey: string, period: string): Promise<UsageCounts> {
  const db = client();
  const { data, error } = await db.from("license_usage").select("scans,discoveries").eq("license_key", licenseKey).eq("period", period).maybeSingle();
  if (error) throw new Error(`getUsage: ${error.message}`);
  return { scans: data?.scans ?? 0, discoveries: data?.discoveries ?? 0 };
}

/** Incrementa o contador da operação que custou Apify (chamar SÓ após scrape real). */
export async function bumpUsage(licenseKey: string, period: string, op: "scan" | "discovery"): Promise<void> {
  const db = client();
  const col = op === "scan" ? "scans" : "discoveries";
  const cur = await getUsage(licenseKey, period);
  const next = { license_key: licenseKey, period, scans: cur.scans, discoveries: cur.discoveries, updated_at: new Date().toISOString() };
  next[col] = (op === "scan" ? cur.scans : cur.discoveries) + 1;
  const { error } = await db.from("license_usage").upsert(next, { onConflict: "license_key,period" });
  if (error) throw new Error(`bumpUsage: ${error.message}`);
}
```
> Nota de corrida (aceitável Fase 2 single-server, baixa concorrência): read-then-upsert pode subcontar sob requests simultâneos da mesma licença. Mitigação suficiente agora: 1 licença = 1 cliente sequencial. Endurecer pra RPC atômico (`increment`) quando consolidar o servidor.

- [ ] **Step 4: typecheck + commit**
```bash
cd ~/Documents/Magnus/radar && npm run typecheck && git add migrations/002_radar_quota.sql src/quota.ts && git commit -q -m "feat(quota): tabela license_usage + getUsage/bumpUsage"
```

---

## Task 5: `auth.ts` — validação de license-key (TDD da parte pura)

**Files:**
- Create: `~/Documents/Magnus/radar/src/auth.ts`, `tests/auth.test.ts`

- [ ] **Step 1: Teste da extração do header (pura)** — Create `~/Documents/Magnus/radar/tests/auth.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { extractLicenseKey } from "../src/auth.js";

describe("extractLicenseKey", () => {
  it("aceita 'Bearer <key>'", () => {
    expect(extractLicenseKey("Bearer ABC-123")).toBe("ABC-123");
  });
  it("aceita a key crua", () => {
    expect(extractLicenseKey("ABC-123")).toBe("ABC-123");
  });
  it("vazio/ausente → null", () => {
    expect(extractLicenseKey(undefined)).toBeNull();
    expect(extractLicenseKey("")).toBeNull();
    expect(extractLicenseKey("Bearer ")).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run tests/auth.test.ts` → FAIL.

- [ ] **Step 3: Implementar** — Create `~/Documents/Magnus/radar/src/auth.ts`:
```ts
import { createClient } from "@supabase/supabase-js";

export function extractLicenseKey(header: string | undefined): string | null {
  if (!header) return null;
  const v = header.startsWith("Bearer ") ? header.slice(7) : header;
  const k = v.trim();
  return k.length ? k : null;
}

function licClient() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes");
  // licencas vive no schema public do Portal Magnus
  return createClient(url, key, { db: { schema: "public" } });
}

/** true se a licença existe e está 'granted'. Registra telemetria (touch_licenca). */
export async function isLicenseValid(licenseKey: string): Promise<boolean> {
  const db = licClient();
  const { data, error } = await db.from("licencas").select("status").eq("key", licenseKey).maybeSingle();
  if (error) throw new Error(`isLicenseValid: ${error.message}`);
  if (data?.status !== "granted") return false;
  await db.rpc("touch_licenca", { p_key: licenseKey }); // telemetria de ativação (best-effort)
  return true;
}
```
> Ref: tabela `public.licencas` (`key`, `status` granted|revoked|expired) + RPC `touch_licenca` — ver memory `reference_magnus_os_licenca_backend`.

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run tests/auth.test.ts` → PASS (3).

- [ ] **Step 5: typecheck + commit**
```bash
cd ~/Documents/Magnus/radar && npm run typecheck && git add src/auth.ts tests/auth.test.ts && git commit -q -m "feat(auth): extractLicenseKey + isLicenseValid (gate de licença)"
```

---

## Task 6: `scanHosted` — caminho cache-aware (scrape só no miss)

**Files:**
- Modify: `~/Documents/Magnus/radar/src/scan.ts`
- Test: `~/Documents/Magnus/radar/tests/scan-hosted.test.ts`

- [ ] **Step 1: Teste da composição (injeta deps, sem rede)** — Create `~/Documents/Magnus/radar/tests/scan-hosted.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { planHostedScan } from "../src/scan.js";

describe("planHostedScan", () => {
  it("≤3 competidores: separa o que scrapeia do que vem do cache", () => {
    const fresh = { a: "2026-06-09T00:00:00Z", b: null };
    const plan = planHostedScan(["a", "b"], fresh, new Date("2026-06-10T00:00:00Z").getTime());
    expect(plan.fromCache).toEqual(["a"]);
    expect(plan.toScrape).toEqual(["b"]);
  });
  it("rejeita >3 competidores", () => {
    expect(() => planHostedScan(["a","b","c","d"], {}, 0)).toThrow(/máximo 3/);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run tests/scan-hosted.test.ts` → FAIL.

- [ ] **Step 3: Implementar** — adicionar ao `~/Documents/Magnus/radar/src/scan.ts`:
```ts
import { cachePlan } from "./cache.js";

export const MAX_COMPETITORS = 3;

/** Decide (puro) quais competidores vêm do cache e quais precisam scrape. Enforce ≤3. */
export function planHostedScan(pageIds: string[], freshnessByPage: Record<string, string | null>, nowMs: number) {
  if (pageIds.length > MAX_COMPETITORS) throw new Error(`máximo ${MAX_COMPETITORS} concorrentes por scan`);
  const { hits, misses } = cachePlan(pageIds, freshnessByPage, nowMs);
  return { fromCache: hits, toScrape: misses };
}
```
> O orquestrador async (que junta scrape dos misses + leitura do cache dos hits + score) vive no `server.ts` (Task 7), pra manter `planHostedScan` puro e testável.

- [ ] **Step 4: Rodar e ver passar + typecheck** — `npx vitest run tests/scan-hosted.test.ts && npm run typecheck` → PASS (2) + 0 TS.

- [ ] **Step 5: Commit**
```bash
cd ~/Documents/Magnus/radar && git add src/scan.ts tests/scan-hosted.test.ts && git commit -q -m "feat(scan): planHostedScan — decisão cache vs scrape, cap 3 (puro)"
```

---

## Task 7: `server.ts` — Fastify + rota `/v1/scan` (auth + cota + cache + score)

**Files:**
- Create: `~/Documents/Magnus/radar/src/server.ts`, `bin/serve.ts`
- Modify: `package.json` (dep `fastify`, script `serve`)

- [ ] **Step 1: Instalar Fastify**
```bash
cd ~/Documents/Magnus/radar && npm install fastify@^5
```

- [ ] **Step 2: Implementar o server** — Create `~/Documents/Magnus/radar/src/server.ts`:
```ts
import Fastify from "fastify";
import { extractLicenseKey, isLicenseValid } from "./auth.js";
import { currentPeriod, getUsage, bumpUsage, quotaVerdict, type QuotaCaps } from "./quota.js";
import { planHostedScan, MAX_COMPETITORS } from "./scan.js";
import { getFreshnessBatch, getActiveAds, upsertAdvertiserAds } from "./db.js";
import { scrapeUrl, advertiserUrl, keywordUrl, parseAd, type RawAd } from "./apify.js";
import { buildRadarJson, type EnrichedAd } from "./emit.js";

const CAPS: QuotaCaps = {
  scans: Number(process.env.RADAR_QUOTA_SCANS_MONTH ?? 30),
  discoveries: Number(process.env.RADAR_QUOTA_DISCOVERIES_MONTH ?? 5),
};
const DISCOVER_CAP = Number(process.env.RADAR_DISCOVER_TOPN ?? 15);
const DAY = 24 * 60 * 60 * 1000;

function enrich(ads: RawAd[], nowMs: number): EnrichedAd[] {
  const recent = ads.filter((a) => nowMs - new Date(a.started_at).getTime() < 14 * DAY).length;
  return ads.map((a) => ({ ...a, source: "named", recentLaunches14d: recent }));
}

export function buildServer() {
  const app = Fastify({ logger: true });

  // Auth hook — toda rota /v1/* exige licença válida.
  app.addHook("preHandler", async (req, reply) => {
    if (!req.url.startsWith("/v1/")) return;
    const key = extractLicenseKey(req.headers.authorization);
    if (!key || !(await isLicenseValid(key))) return reply.code(401).send({ error: "licença inválida" });
    (req as any).licenseKey = key;
  });

  app.get("/health", async () => ({ ok: true }));

  app.post("/v1/scan", async (req, reply) => {
    const { slug, niche, competitors } = (req.body ?? {}) as { slug?: string; niche?: string; competitors?: string[] };
    const key = (req as any).licenseKey as string;
    const pageIds = (competitors ?? []).map(String).filter(Boolean);
    if (!slug || pageIds.length === 0) return reply.code(400).send({ error: "slug e competitors obrigatórios" });
    if (pageIds.length > MAX_COMPETITORS) return reply.code(400).send({ error: `máximo ${MAX_COMPETITORS} concorrentes` });

    const nowMs = Date.now();
    const freshness = await getFreshnessBatch(pageIds);
    const { fromCache, toScrape } = planHostedScan(pageIds, freshness, nowMs);

    // cota: só os que vão scrapear contam (cache-hit é grátis)
    const period = currentPeriod(nowMs);
    if (toScrape.length) {
      const verdict = quotaVerdict("scan", await getUsage(key, period), CAPS);
      if (!verdict.allowed) return reply.code(429).send({ error: "cota de varreduras do mês esgotada", remaining: 0 });
    }

    // scrape dos misses (Apify), upsert no cache compartilhado, bump da cota por scrape real
    for (const pageId of toScrape) {
      const ads = await scrapeUrl(advertiserUrl(pageId), { maxItems: 50 });
      await upsertAdvertiserAds(pageId, ads[0]?.page_name ?? "", "named", ads);
      await bumpUsage(key, period, "scan");
    }
    // monta o board a partir do cache (inclui os recém-scrapeados, agora no DB)
    const dbAds = await getActiveAds(pageIds);
    const payload = buildRadarJson(niche ?? "geral", enrich(dbAds, nowMs), nowMs);
    const remaining = quotaVerdict("scan", await getUsage(key, period), CAPS).remaining;
    return { ...payload, meta: { cache_hits: fromCache.length, scraped: toScrape.length, quota_remaining: remaining } };
  });

  app.post("/v1/discover", async (req, reply) => {
    const { niche } = (req.body ?? {}) as { niche?: string };
    const key = (req as any).licenseKey as string;
    if (!niche) return reply.code(400).send({ error: "niche obrigatório" });
    const period = currentPeriod(Date.now());
    const verdict = quotaVerdict("discovery", await getUsage(key, period), CAPS);
    if (!verdict.allowed) return reply.code(429).send({ error: "cota de descobertas do mês esgotada" });
    const items = await scrapeUrl(keywordUrl(niche), { maxItems: 120 });
    await bumpUsage(key, period, "discovery");
    // top-N maiores por nº de ads
    const byPage = new Map<string, { page_id: string; page_name: string; ads_count: number }>();
    for (const a of items) {
      const e = byPage.get(a.page_id) ?? { page_id: a.page_id, page_name: a.page_name, ads_count: 0 };
      e.ads_count++; byPage.set(a.page_id, e);
    }
    const advertisers = [...byPage.values()].sort((x, y) => y.ads_count - x.ads_count).slice(0, DISCOVER_CAP);
    return { advertisers, capped_at: DISCOVER_CAP };
  });

  return app;
}
```
> Nota: `parseAd` já é aplicado dentro de `scrapeUrl` (devolve `RawAd[]`), então `discover` agrupa por `page_id` direto. `buildRadarJson` e `enrich` são reusados da Fase 1.

- [ ] **Step 3: Entry do PM2** — Create `~/Documents/Magnus/radar/bin/serve.ts`:
```ts
#!/usr/bin/env tsx
import { buildServer } from "../src/server.js";
const port = Number(process.env.PORT ?? 8090);
buildServer().listen({ port, host: "0.0.0.0" })
  .then(() => console.log(`radar service on :${port}`))
  .catch((e) => { console.error(e); process.exit(1); });
```
Adicionar em `package.json` scripts: `"serve": "tsx bin/serve.ts"`.

- [ ] **Step 4: typecheck + smoke local** — `cd ~/Documents/Magnus/radar && npm run typecheck`. Smoke (com `.env.local`): subir `npm run serve` e `curl localhost:8090/health` → `{"ok":true}`; `curl -XPOST localhost:8090/v1/scan` sem auth → 401.

- [ ] **Step 5: `/simplify` no server.ts (>80 linhas) + commit**
```bash
cd ~/Documents/Magnus/radar && git add src/server.ts bin/serve.ts package.json package-lock.json && git commit -q -m "feat(server): Fastify /v1/scan + /v1/discover (auth+cota+cache+score)"
```

---

## Task 8: Smoke autenticado ponta a ponta (local, dado real)

**Files:** nenhum (teste manual roteirizado + registrar no commit msg da Task 7 ou num doc).

- [ ] **Step 1:** Inserir uma licença `granted` de teste em `public.licencas` (Management API) — ex `RADAR-TEST`.
- [ ] **Step 2:** `npm run serve` local; `curl -XPOST localhost:8090/v1/scan -H "Authorization: Bearer RADAR-TEST" -H "Content-Type: application/json" -d '{"slug":"t","niche":"emagrecer","competitors":["117284664776965"]}'`.
- [ ] **Step 3:** Esperado: 1ª chamada `scraped:1, cache_hits:0`; 2ª chamada imediata `scraped:0, cache_hits:1` (prova do cache compartilhado). Cota `scans` sobe só na 1ª.
- [ ] **Step 4:** `competitors` com 4 itens → 400. Header sem licença → 401. Estourar `RADAR_QUOTA_SCANS_MONTH=1` e fazer 2 scrapes de páginas diferentes → 429.
- [ ] **Step 5:** Limpar licença de teste. Done quando todos os caminhos batem.

---

## Task 9: Skill `radar` (linguagem natural) no plugin

**Files:**
- Create: `~/Documents/Magnus/magnus-os-plugin/plugins/magnus-os/skills/radar/SKILL.md`

- [ ] **Step 1: Escrever a SKILL.md** — Create o arquivo com (conteúdo, não placeholder):
  - **Frontmatter:** `name: radar`, `description:` "Use quando o usuário quiser espionar concorrentes / ver os anúncios que mais rodam num nicho / atualizar o Radar de uma campanha."
  - **Passos que o Claude executa:**
    1. Resolver a intenção: nicho (→ `/v1/discover`) ou concorrentes nomeados (→ `/v1/scan`); e a campanha (slug).
    2. Ler `MAGNUS_RADAR_URL` e `MAGNUS_LICENSE_KEY` do `.env` do workspace.
    3. Se nicho: `POST /v1/discover` → mostrar os top-N pro usuário escolher **até 3** → `POST /v1/scan` com os 3 pageIds.
    4. Se nomeados: resolver cada nome via `/v1/discover` (pega o pageId do match) → `/v1/scan` (≤3).
    5. Gravar a resposta JSON em `operacao/<slug>/radar/radar.json` (o painel já lê e mostra).
    6. Tratar 401 ("licença inválida — confira a chave nas Configurações"), 429 ("cota do mês esgotada / aguarde o cache"), 400.
  - Sem segredos no arquivo; a license-key vem do `.env` do workspace.

- [ ] **Step 2: Validar que o painel enxerga a skill** — subir o painel com `MAGNUS_SKILLS_DIR` apontando pro plugin; confirmar que `radar` aparece em `visibleSkills` (a menos que escondida por flag de módulo).

- [ ] **Step 3: Commit**
```bash
cd ~/Documents/Magnus/magnus-os-plugin && git add plugins/magnus-os/skills/radar/SKILL.md && git commit -q -m "feat(skill): radar — espionar concorrentes em linguagem natural (chama o serviço hosted)"
```

---

## Task 10: Deploy no VPS 187 (PM2 + nginx)

**Files:**
- Create: `~/Documents/Magnus/radar/ecosystem.config.cjs`

- [ ] **Step 1: ecosystem PM2** — Create `~/Documents/Magnus/radar/ecosystem.config.cjs`:
```js
module.exports = {
  apps: [{
    name: "radar",
    script: "node_modules/.bin/tsx",
    args: "bin/serve.ts",
    cwd: "/var/www/radar",
    env: { PORT: "8090" }, // segredos vêm do .env do diretório (não commitado)
    max_memory_restart: "400M",
  }],
};
```

- [ ] **Step 2: Provisionar no VPS** (manual, seguindo regras VPS):
  - `rsync` do repo `radar` (sem `node_modules`/`.env.local`) pra `/var/www/radar` no 187.
  - Criar `/var/www/radar/.env` com `APIFY_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RADAR_QUOTA_*`, `PORT=8090`. (+ espelhar a referência no 1Password e no `.env.local` local — regra de credenciais.)
  - `cd /var/www/radar && npm ci && pm2 start ecosystem.config.cjs && pm2 save`.
  - ⚠️ **NUNCA `pm2 restart all`** — só `pm2 restart radar` (regra do VPS 187 compartilhado).

- [ ] **Step 3: nginx** — adicionar server block pra `radar-api.yuribranco.com.br` → `proxy_pass http://127.0.0.1:8090;` (+ HTTPS via certbot). **Não tocar** nos blocks de outros domínios.

- [ ] **Step 4: Verificar em produção** — `curl https://radar-api.yuribranco.com.br/health` → `{"ok":true}`; scan autenticado real → board. `/canary` 5-15min depois.

- [ ] **Step 5: Commit do ecosystem**
```bash
cd ~/Documents/Magnus/radar && git add ecosystem.config.cjs && git commit -q -m "chore(deploy): ecosystem PM2 do serviço radar (VPS 187)"
```

---

## Task 11: Onboarding no painel (license-key + URL do Radar)

**Files:**
- Modify: o fluxo de Configurações do painel que já capta a chave do Gemini (espelhar) — confirmar o arquivo real lendo `components/SettingsModal.tsx` / `ApiKeyBanner`.

- [ ] **Step 1:** Adicionar 2 campos nas Configurações: **License-key** e **URL do Radar** (default `https://radar-api.yuribranco.com.br`), gravados no `.env` do workspace como `MAGNUS_LICENSE_KEY` / `MAGNUS_RADAR_URL` (mesmo mecanismo da chave do Gemini).
- [ ] **Step 2:** A skill `radar` (Task 9) lê essas vars. Sem elas → mensagem clara "configure sua licença nas Configurações".
- [ ] **Step 3:** `npm run typecheck` no painel; `/qa-only` no fluxo de configuração.
- [ ] **Step 4: Commit** (branch `feature/radar-fase1` ou nova `feature/radar-hosted`).

---

## ⚠️ EMENDAS OBRIGATÓRIAS — gate eng-review + codex (2026-06-04)
> O plano acima passou pelo `/plan-eng-review` + `/codex review`. Codex achou ~20 gaps reais ("mais MVP que product-grade"). As correções abaixo **sobrepõem** as tasks originais e são parte do escopo. Aplicar junto.

### Decisões travadas (Yuri, no gate)
- **Input do cliente = `@handle` ou link do Instagram** (≤3), nunca pageId/nome livre. O serviço resolve handle→Página FB→Ad Library e **cacheia a resolução**.
- **Degradação graciosa:** Apify falha num miss → servir o último cache + `meta.degraded=true`, nunca erro 500 pro cliente.
- **Isolamento mínimo:** cache de ads continua compartilhado (é a feature); `license_usage` já é por-licença; **auditoria** = request-id + license-hash nos logs. Sem RLS completa (fica pra consolidação do servidor).
- **Termos:** explicitar no produto que dados públicos de anúncios são cacheados/compartilhados entre clientes (reduz custo/latência).

### Contrato de API revisado (atualizado pós-SPIKE 2026-06-04)
**SPIKE da resolução RODADO:** busca por keyword resolve pra páginas FB com pageId ✅, MAS é **fuzzy** — "marco rebucci" devolveu 2 páginas (Fitness 42 ads / Consultoria 8 ads); pegar a maior auto-erraria. **Conclusão: o resolver NÃO auto-escolhe — devolve candidatas e o cliente confirma.** Isso unifica "resolver concorrente nomeado" e "descobrir nicho" num mecanismo só.

**Dois endpoints (em vez de scan+discover separados):**
- `POST /v1/search` req `{ term }` (um @handle, nome, ou nicho) → res `{ candidates: [{ page_id, page_name, ads_count }], capped_at }`. Keyword search via actor, **persiste no cache** os ads que já scrapeou (não descarta), cota=discovery, top-N. A skill mostra as candidatas; o cliente escolhe ≤3.
- `POST /v1/scan` req `{ slug?, niche?, pageIds: [...] }` — **≤3 pageIds JÁ confirmados** (vindos do /search), deduplicados, validados (`^\d+$`). Resolve via cache (hit) ou scrape (miss, cota=scan). Res = payload do board + `meta: { cache_hits, scraped, quota_remaining, degraded, failed: [] }`.

Fluxo da skill: cliente dá @handle/nome/nicho → `/v1/search` → mostra candidatas → cliente confirma ≤3 → `/v1/scan` (quase tudo cache, porque o /search já aqueceu). Sem auto-resolução fuzzy, sem digitar pageId.

### Correções por task (P1 🔴 / P2 🟡)
**Task 1 (cache):** 🟡 `isFresh` recebe `ttlDays` (default 7) lido de `RADAR_TTL_DAYS` no server — não hardcodar (o secret existia sem uso).

**Task 2 (db):** 🟡 adicionar coluna `radar.advertisers.ig_handle text` (cache da resolução). `getActiveAds` ganha **cap por anunciante** (top 50 por `started_at desc`) pra não devolver board gigante de guru popular. `enrich`/contagem de `recentLaunches14d` passa a ser **por anunciante** (agrupar por `page_id` antes de contar) — hoje é global e distorce o score (bug herdado da Fase 1).

**Task 3 (apify):** 🔴 **`resolveInstagramHandle(input): Promise<{pageId,handle}|null>`** — normaliza (`@x`, `instagram.com/x`, `/x/` → `x`), busca o melhor match via actor, retorna pageId; **SPIKE obrigatório**: confirmar empiricamente que o actor resolve handle→Página FB (a Ad Library é chaveada por Página FB; o @ do IG geralmente mapeia, mas precisa provar — se não mapear direto, achar o caminho IG→FB-page). 🟡 `parseIgInput(raw): string|null` (puro, testado: normaliza/rejeita lixo). 🟡 timeout duro por scrape (AbortController) além do `timeout:180` do actor.

**Task 4 (migration `002`):** 🔴 **RPC atômica de cota** `radar.bump_usage(p_license, p_period, p_op text, p_n int) returns int` (security definer, `insert ... on conflict do update set <col> = license_usage.<col> + p_n returning`) — **substitui** o `bumpUsage` read-then-upsert (elimina a corrida que o codex insistiu ser real, não "depois"). + coluna `ig_handle`. + comando de aplicação **repetível** + bloco de **rollback** (`drop ...`) documentado no arquivo.

**Task 5 (auth):** 🟡 `touch_licenca` em **try/catch** (best-effort de verdade — hoje uma RPC que falha rejeita licença válida com 500). Logar com **license-hash**, nunca a key crua.

**Task 6 (scan/quota multi-miss):** 🔴 **cota conta scrapes REAIS, não requests.** Antes de cada scrape de miss, chamar `bump_usage(...,1)` e comparar o retorno ao cap; se exceder, **parar de scrapear os restantes**, servir o que já tem + `meta.degraded`/`quota_remaining:0`. (O plano original checava 1× e podia varrer 3 e estourar.)

**Task 7 (server) — bloco maior:**
- 🔴 **`/v1/discover` PERSISTE no cache:** ao agrupar, **upsert dos ads scrapeados** (não descartar) → o `/v1/scan` seguinte dos escolhidos cai em cache = não paga Apify 2×. (Era furo direto na tese de custo.)
- 🔴 **Degradação graciosa:** `try/catch` por miss; on fail segue com o cache; `meta.degraded=true, failed:[pageId]`. Circuit-breaker: após N falhas seguidas da Apify, abrir circuito (só cache) por um cooldown.
- 🟡 **Validação de schema Fastify** (request/response) + **dedupe** de `competitors` + rejeitar input malformado (sem isso, string lixo vira URL e gasta Apify).
- 🟡 **Rate-limit por minuto** por license-key (`@fastify/rate-limit`) — além da cota mensal, protege de burst.
- 🟡 **Observabilidade:** request-id por request; log `{request_id, license_hash, cache_hits, scraped, apify_ms, degraded}` — sem isso o custo voa no escuro.
- 🟡 `niche` validado (não silenciar malformado virando `"geral"`). `slug` usado pra auditoria (request log), não acoplamento morto.

**Task 8 (smoke):** 🟡 página de teste estável (Marco Rebucci `117284664776965`) + **cleanup do dataset de teste** (DELETE dos advertisers/ads de teste) pra não poluir a base compartilhada.

**Task 9 (skill):** pede **@handle ou link IG** (≤3). 🟡 **escrita atômica** do `radar.json` (escrever em `.tmp` + `rename`) — Claude pode truncar se falhar no meio. Ordem ok: depende do resolver (Task 3, que vem antes).

**Task 10 (deploy):** 🔴 **build pra JS** (`tsc` → `node dist/bin/serve.js` no PM2) — `tsx` em produção é frágil, não product-grade. 🔴 **PM2 carrega env explícito** (`node -r dotenv/config dist/bin/serve.js` ou wrapper `set -a; . .env`) — PM2 **não** lê `.env` sozinho; sem isso o serviço sobe sem secrets.

### Ordem revisada
1 cache(TTL) → 2 db(ig_handle, cap, velocity-por-anunciante) → 3 apify(resolver+SPIKE) → 4 migration(bump_usage RPC, rollback) → 5 auth(try/catch) → 6 scan(cota por scrape real) → 7 server(discover-persiste + degradação + rate-limit + obs + validação) → 8 smoke(+cleanup) → 9 skill(@handle, escrita atômica) → 10 deploy(build+env) → 11 onboarding.

### Produto (não-código)
- Nota nos termos: dados públicos de anúncios são cacheados/compartilhados entre clientes.

---

## Gate final (antes de qualquer merge/deploy)
- [ ] `/review` no diff do `radar` + do plugin + do painel.
- [ ] `/codex review` até GATE PASS.
- [ ] Smoke autenticado (Task 8) verde + cache-hit provado + 401/429/400 batendo.
- [ ] `/canary` pós-deploy.
- [ ] Custo: confirmar que cache-hit NÃO chama Apify (a alavanca principal) e que a cota corta no cap.

## Guardrails de custo — resumo (a tese de custo do serviço)
1. **Cache compartilhado (TTL):** maior alavanca — concorrente popular varrido 1× pra todos os clientes dentro do TTL.
2. **Cliente escolhe ≤3 concorrentes** (caminho padrão, barato e bounded).
3. **Cota mensal por licença** (scans + discoveries separados) — cache-hit não consome cota.
4. **Descoberta de nicho:** rara, capada ao top-N, cota própria pequena.
5. **A chave Apify nunca sai do servidor.**

## NOT in scope (depois)
- RLS / multi-tenant real no Supabase (hoje o gate de licença na API protege; isolamento por linha vem quando consolidar o servidor / escalar vendas).
- BYO-Apify-key (decisão do Yuri: chave dele, centralizada).
- Resolução fuzzy de nome→pageId sofisticada (Task 9 usa o 1º match do discover).
- Geração do brief de ângulo no server (Magnus OS local já faz).
- RPC atômico de cota (mitigado por uso sequencial single-cliente).

## Self-review (cobertura)
- Serviço hosted (Apify do Yuri, VPS) → Tasks 7,10 ✓ · auth por licença → Task 5 ✓ · cache compartilhado → Tasks 1,2,6,7 ✓ · cota/guardrails → Tasks 3,4,7 ✓ · ≤3 concorrentes → Tasks 6,7 ✓ · descoberta capada → Task 7 ✓ · skill linguagem natural → Task 9 ✓ · onboarding licença → Task 11 ✓ · deploy → Task 10 ✓.
- Reuso da Fase 1: `score.ts`/`apify.ts`/`buildRadarJson`/`upsertAdvertiserAds`/`isFresh` intactos; só somamos as camadas hosted.
- ⚠️ Pra eng-review desafiar: (a) corrida no `bumpUsage` (read-then-upsert); (b) name→pageId via discover custa Apify — pesa contra a UX de "digita o nome do concorrente"; (c) TTL de cache fixo vs por-nicho; (d) Fastify vs reuso de algo já no 187.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | ISSUES_FOUND | ~20 gaps, principais foldados nas Emendas |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 22 issues, 0 critical gaps, escopo cheio mantido |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — (sem UI nova relevante; seção Radar já existe) |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **CODEX:** veredito "mais MVP que product-grade"; P1 (cota multi-miss, discover não-persiste-cache, PM2 .env, TTL não-usado, RPC atômica de cota) + ~15 P2 foldados na seção "EMENDAS OBRIGATÓRIAS".
- **CROSS-MODEL:** sem tensão — codex concordou com e estendeu o review; tudo absorvido nas emendas (zero rejeitado).
- **Decisões do Yuri:** escopo cheio · input=@handle/IG · degradação graciosa · isolamento mínimo (não RLS completa) · cache compartilhado nos termos.
- **VERDICT:** ENG CLEARED (escopo cheio, emendas aplicadas) — pronto pra implementar via subagent-driven-development. Spike da Task 3 (resolução @handle→pageId) é o primeiro risco a derrubar.
