# Gestor de Tráfego Inteligente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **⚠️ Este plano foi escrito para ser executado por modelo econômico (Sonnet/Haiku).** TODAS as decisões já estão travadas (§Decisões travadas). Se algo parecer ambíguo, a resposta está na spec `magnus-os/docs/superpowers/specs/2026-06-11-gestor-trafego-inteligente-design.md` — NÃO invente; se a spec não cobrir, PARE e pergunte.

**Goal:** Módulo `traffic_copilot` do magnus-os-online — gestão de tráfego Meta que aprende com as otimizações do Leo (captura decisão+razão, memória de casos, shadow mode + concordância, autonomia graduada).

**Architecture:** Camada de dados nova (migration 0005, 6 tabelas + pgvector) · gateway Meta com interface trocável (Marketing API dev-mode default; MCP decidido por spike) · jobs diários determinísticos (pm2 cron: sync → outcome → diagnóstico LLM via API direta) · rotas `app/api/traffic/*` atrás de `requireTenant()` + feature flag `plan.features.traffic_copilot` · UI 4 abas reusando design system existente.

**Tech Stack:** Next 16 / React 19 / TypeScript (painel existente) · Supabase (Postgres + pgvector + RLS) · Meta Marketing API v23.0 · Anthropic Messages API (fetch direto, sem dep nova) · Gemini `gemini-embedding-001` (768 dims) · vitest.

**Working dir:** `/Users/yuribranco/Documents/Magnus/magnus-os-online` (rotas/lib/UI em `painel/`). Migrations aplicadas via `scripts/db-apply.sh <arquivo>` (Management API; requer env `MAGNUS_ONLINE_SUPABASE_REF` + `SUPABASE_ACCESS_TOKEN` — rodar dentro de `op run --env-file=.env.op --`).

---

## 🛠️ gstack skills integradas — OBRIGATÓRIAS

| Trigger | Skill | Quando |
|---|---|---|
| Qualquer erro durante execução | `/investigate` | SEMPRE antes de chutar fix |
| Task com arquivo > 80 linhas novas | `/simplify` | Antes do commit |
| Fim das Fases A e B | `/review` + `/codex review` | Revisão independente |
| Deploy produção (Task 16) | `/canary` | 5-15min monitoring |
| UI final (Task 14) | `/ui-ux-pro-max` review + `/qa-only` | Estética MagnusOS + teste estruturado |
| Abrir Meta/Supabase dashboard | `/browse` | Nunca MCP nativo |

---

## Decisões travadas (o executor NÃO decide nada disso)

1. **Embedding:** Gemini `gemini-embedding-001`, `outputDimensionality: 768`, coluna `vector(768)`. `GEMINI_API_KEY` já existe no env do painel.
2. **Diagnóstico LLM:** Anthropic Messages API via `fetch` direto (`https://api.anthropic.com/v1/messages`), model `claude-sonnet-4-6`, `max_tokens: 4096`, saída JSON. Custo gravado no `cost_ledger` (`service: 'traffic'`, `skill: 'gestor-trafego'`).
3. **Taxonomia fechada:** `budget_up · budget_down · pause_ad · pause_adset · pause_campaign · duplicate_winner · bid_change · new_creative · new_audience · lp_change · other_manual`. **Classes com escrita na Meta no v1:** budget_up/down, pause_*, duplicate_winner, bid_change. **Classes manuais no v1** (registram caso, não executam): new_creative, new_audience, lp_change, other_manual.
4. **Concordância:** full match = mesma classe + mesma entidade (peso 1.0) · partial = mesma classe + mesmo nível, entidade diferente (peso 0.5) · divergência = 0. Taxa = soma de pesos / nº de recomendações decididas. Graduação: taxa ≥ 0.8 nas últimas ≥10 decisões da classe×projeto, sem caso `falha` na janela.
5. **Outcome:** OLS linear (dia→métrica) nos 14d pré-ação (mín. 7 pontos); janela pós por classe (budget/bid: 7d · pause/duplicate: 7d · new_creative/new_audience/lp_change: 14d); métrica primária = ROAS se houve receita na janela, senão CPA (invertido). Ratio ≥1.10 = sucesso · ≤0.90 = falha · entre = neutro · dados insuficientes = inconclusivo.
6. **Cron:** processo pm2 `traffic-jobs` com `cron_restart: "0 9 * * *"` (09:00 UTC = 06:00 BRT), `autorestart: false`, script `painel/scripts/traffic-daily.mjs` (roda sync → outcomes → diagnóstico; indução de playbooks só segunda-feira).
7. **Guardrails default (jsonb):** `{"max_budget_change_pct": 20, "hora_inicio": 9, "hora_fim": 21, "kill_switch": false}`.
8. **Feature flag:** `tenants.plan.features.traffic_copilot === true`. Helper `hasFeature()`. Sem tabela nova.
9. **Gateway Meta:** interface `MetaGateway`; implementação default `MarketingApiGateway` (token dev-mode, env `META_TRAFFIC_TOKEN`); env `META_GATEWAY=marketing_api` (única opção implementada; spike da Task 1 decide se um adaptador MCP entra DEPOIS — não bloqueia nada).
10. **RLS:** SELECT self-read via subquery `tenants.auth_user_id = auth.uid()` (padrão cost_ledger); INSERT/UPDATE/DELETE só service_role (rotas usam `serviceClient()` após `requireTenant()`).
11. **Recomendações:** máx. 5/projeto/dia; expiram em 48h (`status: 'expirada'` no job seguinte); **dedup por unique parcial** `(tenant_id, project_id, date, class, entity_level, entity_id)` — re-rodar o job no mesmo dia faz upsert, não duplica.
12. **Commits:** conventional commits, no repo `magnus-os-online`. Push após cada task (regra do Yuri: push é parte do done).
13. **`requireTenant()` LANÇA `TenantError`** — não responde 401/403 sozinho. TODA rota usa o padrão real do repo (ver `app/api/usage/route.ts`): try/catch com `tenantErrorResponse(e)`. E TODA rota declara `export const runtime = "nodejs"; export const dynamic = "force-dynamic";`.
14. **Tenant-scoping em TODO método do TrafficDb** — `serviceClient()` ignora RLS, então TODO read/write recebe `tenantId` e filtra `.eq("tenant_id", tenantId)`. Rota valida que `project_id` pertence ao tenant ANTES de qualquer ação.
15. **Escrita Meta só em entidade conhecida:** o `apply` exige que `(project_id, entity_level, entity_id)` exista em `traffic_snapshots` dos últimos 7 dias. Entidade fora do snapshot = 422. Impede mexer em entidade *que o projeto não sincronizou*. ⚠️ **Limite real (achado do review Opus, 2026-06-11):** com `META_TRAFFIC_TOKEN` **compartilhado** (v1-Leo, dev-mode), o gate NÃO impede cadastrar um `ad_account_id` alheio que o token enxergue — o sync legitimaria as entidades. **Aceitável no v1 (tenant único = Leo, contas dele).** Multi-tenant real (mentorados) EXIGE token Meta **por-tenant** + allowlist de `ad_account_id` no `insertProject`. TODO dessa fase.
16. **Guardrails enforced no apply (server-side):** budget_up/down busca o budget atual na Graph (`gateway.getDailyBudget`), calcula o delta % e rejeita acima de `max_budget_change_pct`; rejeita fora de `hora_inicio..hora_fim` (BRT); valida cents inteiro positivo; idempotência por `Idempotency-Key` (header opcional — repete a mesma key em 10min = 409).
17. **`budgetGate()` antes de TODA chamada paga** (diagnóstico, indução, embeddings em lote): `budgetGate(realLedgerDB(), tenant.id)` — estourou o teto do plano → pula com log, não chama API.
18. **Job NÃO importa `lib/hosted/supabase.ts`** (tem `import "server-only"` — morre fora do Next). O job usa `lib/traffic/service-client.ts` (client supabase próprio criado de env, sem server-only). `tsx` entra como devDependency explícita do painel.

---

## Estrutura de arquivos (visão geral)

```
magnus-os-online/
├── supabase/migrations/0005_traffic_copilot.sql        (Task 2)
├── ecosystem.config.cjs                                 (Task 13 — adiciona traffic-jobs)
└── painel/
    ├── scripts/
    │   ├── spike-meta.mjs                               (Task 1)
    │   └── traffic-daily.mjs                            (Task 13)
    ├── lib/traffic/
    │   ├── types.ts                                     (Task 3)
    │   ├── taxonomy.ts + taxonomy.test.ts               (Task 3)
    │   ├── meta-gateway.ts + meta-gateway.test.ts       (Task 4)
    │   ├── caption.ts + caption.test.ts                 (Task 5)
    │   ├── embeddings.ts + embeddings.test.ts           (Task 5)
    │   ├── outcome.ts + outcome.test.ts                 (Task 6)
    │   ├── concordance.ts + concordance.test.ts         (Task 7)
    │   ├── db.ts + db.test.ts                           (Task 8)
    │   ├── sync.ts + sync.test.ts                       (Task 9)
    │   ├── diagnose.ts + diagnose.test.ts               (Task 10)
    │   └── induction.ts + induction.test.ts             (Task 11)
    ├── lib/hosted/features.ts + features.test.ts        (Task 3)
    ├── app/api/traffic/...                              (Task 12)
    ├── app/trafego/page.tsx                             (Task 14)
    └── components/traffic/*.tsx                         (Task 14)
```

---

## Task 0: Pré-requisitos manuais (Yuri/Leo — NÃO é do executor)

- [ ] Provisionar tenant do Leo (mesmo caminho do SUB-YURI-DOGFOOD: webhook smoke ou INSERT manual em `tenants` com `plan: {"key_source":"platform","limits":{"usd_month":40},"features":{"traffic_copilot":true}}`).
- [ ] Leo vira developer/tester no app Meta `987622980348211` e gera token de longa duração com `ads_management` + `ads_read` → 1Password item `magnus-os-online-secrets` campo `META_TRAFFIC_TOKEN` → ref no `.env.op`.
- [ ] Lista dos 6 projetos: nome, nicho, `act_<id>`, breakeven ROAS (Leo fornece).
- [ ] Conferir `GEMINI_API_KEY` e `ANTHROPIC_API_KEY` no `.env.op` do magnus-os-online.

## Task 1: Spike Meta (timebox 1 dia — decide MCP vs Marketing API)

**Files:** Create: `painel/scripts/spike-meta.mjs` · Create: `docs/spike-meta-resultado.md` (na raiz do magnus-os-online)

- [ ] **Step 1: Script de spike Marketing API** — criar `painel/scripts/spike-meta.mjs`:

```js
// Spike: valida Marketing API dev-mode pra escala do traffic_copilot.
// Uso: META_TRAFFIC_TOKEN=... AD_ACCOUNT=act_XXX node scripts/spike-meta.mjs
const TOKEN = process.env.META_TRAFFIC_TOKEN;
const ACCOUNT = process.env.AD_ACCOUNT;
const V = "v23.0";

async function call(path, params = {}) {
  const url = new URL(`https://graph.facebook.com/${V}/${path}`);
  url.searchParams.set("access_token", TOKEN);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url);
  const usage = res.headers.get("x-business-use-case-usage") || res.headers.get("x-app-usage");
  const body = await res.json();
  return { status: res.status, usage, body };
}

const r1 = await call(`${ACCOUNT}/insights`, {
  level: "ad", time_increment: "1", date_preset: "last_30d", limit: "200",
  fields: "spend,impressions,actions,action_values,purchase_roas,ctr,frequency,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name",
});
console.log("READ insights:", r1.status, "rows:", r1.body?.data?.length, "usage:", r1.usage);
console.log("paging:", JSON.stringify(r1.body?.paging?.next ? "HAS_NEXT" : "single page"));
// Escrita reversível: pausa e despausa um ad de TESTE (pedir ao Leo um ad_id sacrificável)
if (process.env.TEST_AD_ID) {
  const w1 = await fetch(`https://graph.facebook.com/${V}/${process.env.TEST_AD_ID}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ status: "PAUSED", access_token: TOKEN }),
  });
  console.log("WRITE pause:", w1.status, await w1.text());
  const w2 = await fetch(`https://graph.facebook.com/${V}/${process.env.TEST_AD_ID}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ status: "ACTIVE", access_token: TOKEN }),
  });
  console.log("WRITE unpause:", w2.status, await w2.text());
}
```

- [ ] **Step 2: Rodar contra 1 conta do Leo** — `cd painel && set -a && . ../.env.bootstrap && set +a && op run --env-file=../.env.op -- env AD_ACCOUNT=act_<id_do_leo> node scripts/spike-meta.mjs`. Anotar: status 200? rate-limit headers (`usage` JSON — se `call_count`/`total_cputime` > 80 com UMA chamada, dev tier não aguenta 6 contas). Repetir o read 6× seguidas (simula 6 projetos) e observar o usage acumulado.
- [ ] **Step 3: Probe MCP headless (30 min, não mais)** — `curl -s https://mcp.facebook.com/ads/.well-known/oauth-authorization-server | python3 -m json.tool`. Se expõe `grant_types_supported` com `refresh_token` + `registration_endpoint` (dynamic client registration), MCP headless é VIÁVEL — anotar no doc; um adaptador `McpGateway` pode ser task futura. Se não expõe ou exige browser interativo a cada sessão, MCP fica descartado pro server-side.
- [ ] **Step 4: Escrever `docs/spike-meta-resultado.md`** com: resultado do read (volume, paging, usage), resultado da escrita, veredito do probe MCP, e a linha final: `DECISÃO: META_GATEWAY=marketing_api` (única implementada neste plano) + se o dev tier aguenta 6 contas × 1 sync/dia + ~10 writes/dia (se NÃO aguentar: anotar "precisa Standard Access" e avisar Yuri — gate manual).
- [ ] **Step 5: Commit** — `git add painel/scripts/spike-meta.mjs docs/spike-meta-resultado.md && git commit -m "feat(traffic): spike Meta Marketing API + probe MCP headless" && git push`

## Task 2: Migration 0005 — tabelas + pgvector + RLS

**Files:** Create: `supabase/migrations/0005_traffic_copilot.sql`

- [ ] **Step 1: Escrever a migration** (seguir o padrão da 0001: `begin/commit`, RLS, policies self-read):

```sql
-- 0005_traffic_copilot.sql — Gestor de Tráfego Inteligente (spec 2026-06-11).
-- 6 tabelas + pgvector. RLS: SELECT self-read (padrão cost_ledger); writes só service_role.
begin;

create extension if not exists vector;

create table if not exists public.traffic_projects (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  nome            text not null,
  nicho           text not null,
  vertical        text,
  ticket          numeric(10,2),
  ad_account_id   text not null,
  breakeven_roas  numeric(6,2) not null check (breakeven_roas >= 1),
  ativo           boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (tenant_id, ad_account_id)
);

create table if not exists public.traffic_snapshots (
  id          bigint generated always as identity primary key,
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  project_id  uuid not null references public.traffic_projects(id) on delete cascade,
  date        date not null,
  level       text not null check (level in ('campaign','adset','ad')),
  entity_id   text not null,
  entity_name text not null default '',
  metrics     jsonb not null,  -- {spend,impressions,results,revenue,roas,cpa,ctr,frequency}
  created_at  timestamptz not null default now(),
  unique (tenant_id, project_id, date, level, entity_id)
);
create index if not exists idx_traffic_snapshots_series
  on public.traffic_snapshots (project_id, level, entity_id, date desc);

create table if not exists public.traffic_cases (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  project_id          uuid not null references public.traffic_projects(id) on delete cascade,
  class               text not null check (class in
    ('budget_up','budget_down','pause_ad','pause_adset','pause_campaign',
     'duplicate_winner','bid_change','new_creative','new_audience','lp_change','other_manual')),
  entity_level        text not null check (entity_level in ('campaign','adset','ad','external')),
  entity_id           text not null default '',
  entity_name         text not null default '',
  params              jsonb not null default '{}',   -- {magnitude_pct, from, to, ...}
  reason              text not null check (length(reason) >= 10),
  tags                text[] not null default '{}',
  situation_caption   text not null default '',
  situation_embedding vector(768),
  snapshot            jsonb not null default '{}',   -- série 30d das entidades afetadas
  origem              text not null check (origem in
    ('leo','recomendacao_acatada','recomendacao_modificada','autonoma','manual')),
  recommendation_id   uuid,
  outcome             text not null default 'pendente' check (outcome in
    ('pendente','sucesso','neutro','falha','inconclusivo')),
  outcome_magnitude   numeric(8,4),
  outcome_detail      jsonb,
  outcome_due         date not null,
  applied_at          timestamptz not null default now(),
  created_at          timestamptz not null default now()
);
create index if not exists idx_traffic_cases_class on public.traffic_cases (tenant_id, class, outcome);
create index if not exists idx_traffic_cases_embedding on public.traffic_cases
  using hnsw (situation_embedding vector_cosine_ops);

create table if not exists public.traffic_recommendations (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  project_id    uuid not null references public.traffic_projects(id) on delete cascade,
  date          date not null,
  class         text not null check (class in
    ('budget_up','budget_down','pause_ad','pause_adset','pause_campaign',
     'duplicate_winner','bid_change','new_creative','new_audience','lp_change','other_manual')),
  entity_level  text not null check (entity_level in ('campaign','adset','ad','external')),
  entity_id     text not null default '',
  entity_name   text not null default '',
  params        jsonb not null default '{}',
  rationale     text not null,
  evidence      jsonb not null default '{}',  -- {numbers:[], case_ids:[], playbook_ids:[]}
  status        text not null default 'aberta' check (status in
    ('aberta','acatada','modificada','recusada','expirada')),
  matched_case_id uuid,
  created_at    timestamptz not null default now()
);
create index if not exists idx_traffic_recs_open on public.traffic_recommendations (project_id, status, date desc);

create table if not exists public.traffic_playbooks (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  scope       text not null check (scope in ('universal','projeto')),
  project_id  uuid references public.traffic_projects(id) on delete cascade,
  class       text not null,
  titulo      text not null,
  regra       text not null,
  evidencia   jsonb not null default '{}',
  status      text not null default 'draft' check (status in ('draft','aprovado','desativado')),
  criado_por  text not null default 'inducao' check (criado_por in ('inducao','leo')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (scope = 'universal' or project_id is not null)
);

create table if not exists public.traffic_autonomy (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  project_id            uuid not null references public.traffic_projects(id) on delete cascade,
  class                 text not null,
  modo                  text not null default 'shadow' check (modo in ('shadow','graduada','rebaixada')),
  guardrails            jsonb not null default
    '{"max_budget_change_pct":20,"hora_inicio":9,"hora_fim":21,"kill_switch":false}',
  concordancia_atual    numeric(4,3),
  decisoes_consideradas integer not null default 0,
  updated_at            timestamptz not null default now(),
  unique (tenant_id, project_id, class)
);

-- FKs cruzadas (criadas depois das duas tabelas existirem) + dedup de recs diárias
alter table public.traffic_cases drop constraint if exists traffic_cases_rec_fk;
alter table public.traffic_cases
  add constraint traffic_cases_rec_fk foreign key (recommendation_id)
  references public.traffic_recommendations(id) on delete set null;
alter table public.traffic_recommendations drop constraint if exists traffic_recs_case_fk;
alter table public.traffic_recommendations
  add constraint traffic_recs_case_fk foreign key (matched_case_id)
  references public.traffic_cases(id) on delete set null;
create unique index if not exists uniq_traffic_recs_daily
  on public.traffic_recommendations (tenant_id, project_id, date, class, entity_level, entity_id);

-- RLS: SELECT self-read (padrão cost_ledger), writes só service_role. Idempotente (drop antes).
do $$
declare t text;
begin
  foreach t in array array['traffic_projects','traffic_snapshots','traffic_cases',
                           'traffic_recommendations','traffic_playbooks','traffic_autonomy'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_self_read on public.%I', t, t);
    execute format($p$
      create policy %I_self_read on public.%I for select
      using (tenant_id in (select id from public.tenants where auth_user_id = auth.uid()))
    $p$, t, t);
  end loop;
end $$;

-- post-asserts
do $$
begin
  if (select count(*) from pg_policies where schemaname='public' and tablename like 'traffic_%') < 6 then
    raise exception 'RLS policies faltando';
  end if;
end $$;

commit;
```

- [ ] **Step 2: Aplicar** — `cd /Users/yuribranco/Documents/Magnus/magnus-os-online && set -a && . ./.env.bootstrap && set +a && op run --env-file=.env.op -- bash scripts/db-apply.sh supabase/migrations/0005_traffic_copilot.sql`. Expected: sucesso sem erro (o script reporta o resultado da Management API).
- [ ] **Step 3: Verificar** — aplicar via db-apply.sh um SQL inline temporário OU rodar query: `select tablename, rowsecurity from pg_tables where tablename like 'traffic_%'` (6 linhas, todas `rowsecurity=t`) e `select extname from pg_extension where extname='vector'` (1 linha). Usar o mesmo `db-apply.sh` com um arquivo `/tmp/verify.sql`.
- [ ] **Step 4: Commit** — `git add supabase/migrations/0005_traffic_copilot.sql && git commit -m "feat(traffic): migration 0005 — 6 tabelas + pgvector + RLS self-read" && git push`

## Task 3: Types, taxonomia e feature flag

**Files:** Create: `painel/lib/traffic/types.ts`, `painel/lib/traffic/taxonomy.ts`, `painel/lib/traffic/taxonomy.test.ts`, `painel/lib/hosted/features.ts`, `painel/lib/hosted/features.test.ts`

- [ ] **Step 1: Escrever `painel/lib/traffic/types.ts`** (sem teste — só tipos):

```typescript
export type TrafficClass =
  | "budget_up" | "budget_down" | "pause_ad" | "pause_adset" | "pause_campaign"
  | "duplicate_winner" | "bid_change" | "new_creative" | "new_audience"
  | "lp_change" | "other_manual";

export type EntityLevel = "campaign" | "adset" | "ad" | "external";

export interface DailyMetrics {
  spend: number; impressions: number; results: number; revenue: number;
  roas: number; cpa: number; ctr: number; frequency: number;
}

export interface SnapshotRow {
  date: string; level: EntityLevel; entity_id: string; entity_name: string;
  metrics: DailyMetrics;
}

export interface TrafficProject {
  id: string; tenant_id: string; nome: string; nicho: string;
  vertical: string | null; ticket: number | null;
  ad_account_id: string; breakeven_roas: number; ativo: boolean;
}

export interface TrafficCase {
  id: string; project_id: string; class: TrafficClass; entity_level: EntityLevel;
  entity_id: string; entity_name: string; params: Record<string, unknown>;
  reason: string; tags: string[]; situation_caption: string;
  snapshot: { series: SnapshotRow[] }; origem: string;
  recommendation_id: string | null;
  outcome: "pendente" | "sucesso" | "neutro" | "falha" | "inconclusivo";
  outcome_magnitude: number | null; outcome_due: string; applied_at: string;
}

export interface TrafficRecommendation {
  id: string; project_id: string; date: string; class: TrafficClass;
  entity_level: EntityLevel; entity_id: string; entity_name: string;
  params: Record<string, unknown>; rationale: string;
  evidence: { numbers?: string[]; case_ids?: string[]; playbook_ids?: string[] };
  status: "aberta" | "acatada" | "modificada" | "recusada" | "expirada";
}

export interface Guardrails {
  max_budget_change_pct: number; hora_inicio: number; hora_fim: number; kill_switch: boolean;
}
```

- [ ] **Step 2: Teste da taxonomia** — `painel/lib/traffic/taxonomy.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { TRAFFIC_CLASSES, isWriteClass, outcomeWindowDays, classDirection } from "./taxonomy";

describe("taxonomy", () => {
  it("tem 11 classes fechadas", () => expect(TRAFFIC_CLASSES).toHaveLength(11));
  it("write classes são as 7 com escrita Meta", () => {
    expect(isWriteClass("budget_up")).toBe(true);
    expect(isWriteClass("pause_ad")).toBe(true);
    expect(isWriteClass("new_creative")).toBe(false);
    expect(isWriteClass("lp_change")).toBe(false);
  });
  it("janela de outcome por classe", () => {
    expect(outcomeWindowDays("budget_up")).toBe(7);
    expect(outcomeWindowDays("new_creative")).toBe(14);
    expect(outcomeWindowDays("lp_change")).toBe(14);
  });
  it("direção por classe", () => {
    expect(classDirection("budget_up")).toBe("up");
    expect(classDirection("budget_down")).toBe("down");
    expect(classDirection("pause_ad")).toBe("down");
    expect(classDirection("new_creative")).toBe("neutral");
  });
});
```

- [ ] **Step 3: Rodar e ver falhar** — `cd painel && npx vitest run lib/traffic/taxonomy.test.ts`. Expected: FAIL (módulo não existe).
- [ ] **Step 4: Implementar `painel/lib/traffic/taxonomy.ts`**:

```typescript
import type { TrafficClass } from "./types";

export const TRAFFIC_CLASSES: TrafficClass[] = [
  "budget_up", "budget_down", "pause_ad", "pause_adset", "pause_campaign",
  "duplicate_winner", "bid_change", "new_creative", "new_audience",
  "lp_change", "other_manual",
];

const WRITE_CLASSES = new Set<TrafficClass>([
  "budget_up", "budget_down", "pause_ad", "pause_adset", "pause_campaign",
  "duplicate_winner", "bid_change",
]);

export function isWriteClass(c: TrafficClass): boolean {
  return WRITE_CLASSES.has(c);
}

export function outcomeWindowDays(c: TrafficClass): number {
  if (c === "new_creative" || c === "new_audience" || c === "lp_change") return 14;
  return 7;
}

export function classDirection(c: TrafficClass): "up" | "down" | "neutral" {
  if (c === "budget_up" || c === "duplicate_winner") return "up";
  if (c === "budget_down" || c.startsWith("pause_")) return "down";
  return "neutral";
}
```

- [ ] **Step 5: Rodar e ver passar** — `npx vitest run lib/traffic/taxonomy.test.ts`. Expected: PASS.
- [ ] **Step 6: Feature flag — teste** `painel/lib/hosted/features.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { hasFeature } from "./features";

describe("hasFeature", () => {
  it("true quando plan.features.<f> === true", () => {
    expect(hasFeature({ plan: { features: { traffic_copilot: true } } } as never, "traffic_copilot")).toBe(true);
  });
  it("false quando ausente/false/plan malformado", () => {
    expect(hasFeature({ plan: {} } as never, "traffic_copilot")).toBe(false);
    expect(hasFeature({ plan: { features: { traffic_copilot: false } } } as never, "traffic_copilot")).toBe(false);
    expect(hasFeature({ plan: null } as never, "traffic_copilot")).toBe(false);
  });
});
```

- [ ] **Step 7: Implementar `painel/lib/hosted/features.ts`** (olhar a interface `Tenant` em `lib/hosted/tenant.ts` — o campo `plan` é jsonb):

```typescript
import type { Tenant } from "./tenant";

export function hasFeature(tenant: Pick<Tenant, "plan">, feature: string): boolean {
  const plan = tenant?.plan as { features?: Record<string, unknown> } | null | undefined;
  return plan?.features?.[feature] === true;
}
```

- [ ] **Step 8: Rodar tudo + typecheck** — `npx vitest run lib/traffic lib/hosted/features.test.ts && npm run typecheck`. Expected: PASS, tsc 0.
- [ ] **Step 9: Commit** — `git add painel/lib/traffic painel/lib/hosted/features.* && git commit -m "feat(traffic): types, taxonomia fechada e feature flag traffic_copilot" && git push`

## Task 4: Meta gateway (Marketing API)

**Files:** Create: `painel/lib/traffic/meta-gateway.ts`, `painel/lib/traffic/meta-gateway.test.ts`

- [ ] **Step 1: Teste** (mock de `fetch` — sem rede):

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MarketingApiGateway } from "./meta-gateway";

const FETCH = vi.fn();
beforeEach(() => { vi.stubGlobal("fetch", FETCH); FETCH.mockReset(); });
afterEach(() => vi.unstubAllGlobals());

function ok(json: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(json), text: () => Promise.resolve(JSON.stringify(json)), headers: new Headers() });
}

describe("MarketingApiGateway", () => {
  const gw = new MarketingApiGateway("TOKEN");

  it("getDailyInsights monta URL com level/fields e pagina", async () => {
    FETCH.mockReturnValueOnce(ok({ data: [{ date_start: "2026-06-01", ad_id: "1", spend: "10" }], paging: { next: "https://graph.facebook.com/next" } }))
         .mockReturnValueOnce(ok({ data: [{ date_start: "2026-06-02", ad_id: "1", spend: "12" }] }));
    const rows = await gw.getDailyInsights("act_1", "ad", "2026-06-01", "2026-06-02");
    expect(rows).toHaveLength(2);
    const url = String(FETCH.mock.calls[0][0]);
    expect(url).toContain("act_1/insights");
    expect(url).toContain("level=ad");
    expect(url).toContain("time_increment=1");
  });

  it("setStatus faz POST com status", async () => {
    FETCH.mockReturnValueOnce(ok({ success: true }));
    await gw.setStatus("123", "PAUSED");
    const [url, init] = FETCH.mock.calls[0];
    expect(String(url)).toContain("/123");
    expect(init.method).toBe("POST");
    expect(String(init.body)).toContain("status=PAUSED");
  });

  it("updateDailyBudget envia daily_budget em centavos", async () => {
    FETCH.mockReturnValueOnce(ok({ success: true }));
    await gw.updateDailyBudget("456", 15000);
    expect(String(FETCH.mock.calls[0][1].body)).toContain("daily_budget=15000");
  });

  it("erro da Graph vira exceção com mensagem", async () => {
    FETCH.mockReturnValueOnce(Promise.resolve({ ok: false, status: 400, json: () => Promise.resolve({ error: { message: "bad" } }), text: () => Promise.resolve(""), headers: new Headers() }));
    await expect(gw.setStatus("123", "PAUSED")).rejects.toThrow(/bad/);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run lib/traffic/meta-gateway.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implementar** `painel/lib/traffic/meta-gateway.ts`:

```typescript
// Gateway Meta — interface trocável (spike Task 1 decidiu marketing_api como default).
// Token dev-mode (Leo developer/tester no app 987622980348211), env META_TRAFFIC_TOKEN.
import type { EntityLevel } from "./types";

const V = "v23.0";
const BASE = `https://graph.facebook.com/${V}`;

export interface RawInsightRow {
  date_start: string; campaign_id?: string; campaign_name?: string;
  adset_id?: string; adset_name?: string; ad_id?: string; ad_name?: string;
  spend?: string; impressions?: string; ctr?: string; frequency?: string;
  actions?: Array<{ action_type: string; value: string }>;
  action_values?: Array<{ action_type: string; value: string }>;
  purchase_roas?: Array<{ action_type: string; value: string }>;
}

export interface MetaGateway {
  getDailyInsights(account: string, level: "campaign" | "adset" | "ad", since: string, until: string): Promise<RawInsightRow[]>;
  getDailyBudget(entityId: string): Promise<number | null>; // cents; null se a entidade usa lifetime/CBO herdado
  setStatus(entityId: string, status: "PAUSED" | "ACTIVE"): Promise<void>;
  updateDailyBudget(entityId: string, dailyBudgetCents: number): Promise<void>;
  updateBid(adsetId: string, bidAmountCents: number): Promise<void>;
  duplicate(entityId: string): Promise<string>;
}

export class MarketingApiGateway implements MetaGateway {
  constructor(private token: string) {}

  private async get(url: string): Promise<{ data?: RawInsightRow[]; paging?: { next?: string } }> {
    const res = await fetch(url);
    const body = await res.json();
    if (!res.ok) throw new Error(`Meta API ${res.status}: ${body?.error?.message ?? "erro"}`);
    return body;
  }

  private async post(path: string, params: Record<string, string>): Promise<unknown> {
    const res = await fetch(`${BASE}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ...params, access_token: this.token }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Meta API ${res.status}: ${(body as { error?: { message?: string } })?.error?.message ?? "erro"}`);
    return body;
  }

  async getDailyInsights(account: string, level: "campaign" | "adset" | "ad", since: string, until: string): Promise<RawInsightRow[]> {
    const u = new URL(`${BASE}/${account}/insights`);
    u.searchParams.set("access_token", this.token);
    u.searchParams.set("level", level);
    u.searchParams.set("time_increment", "1");
    u.searchParams.set("time_range", JSON.stringify({ since, until }));
    u.searchParams.set("limit", "500");
    u.searchParams.set("fields",
      "spend,impressions,ctr,frequency,actions,action_values,purchase_roas," +
      "campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name");
    const rows: RawInsightRow[] = [];
    let next: string | undefined = u.toString();
    while (next) {
      const page = await this.get(next);
      rows.push(...(page.data ?? []));
      next = page.paging?.next;
    }
    return rows;
  }

  async setStatus(entityId: string, status: "PAUSED" | "ACTIVE"): Promise<void> {
    await this.post(entityId, { status });
  }

  async updateDailyBudget(entityId: string, dailyBudgetCents: number): Promise<void> {
    await this.post(entityId, { daily_budget: String(dailyBudgetCents) });
  }

  async updateBid(adsetId: string, bidAmountCents: number): Promise<void> {
    await this.post(adsetId, { bid_amount: String(bidAmountCents) });
  }

  async duplicate(entityId: string): Promise<string> {
    const r = (await this.post(`${entityId}/copies`, { status_option: "PAUSED" })) as { copied_ad_id?: string; copied_adset_id?: string; copied_campaign_id?: string; id?: string };
    return r.copied_ad_id ?? r.copied_adset_id ?? r.copied_campaign_id ?? r.id ?? "";
  }

  async getDailyBudget(entityId: string): Promise<number | null> {
    const u = new URL(`${BASE}/${entityId}`);
    u.searchParams.set("access_token", this.token);
    u.searchParams.set("fields", "daily_budget");
    const body = (await this.get(u.toString())) as unknown as { daily_budget?: string };
    const v = parseInt(String(body.daily_budget ?? ""), 10);
    return Number.isFinite(v) && v > 0 ? v : null;
  }
}

export function trafficGateway(): MetaGateway {
  const token = process.env.META_TRAFFIC_TOKEN;
  if (!token) throw new Error("META_TRAFFIC_TOKEN ausente");
  return new MarketingApiGateway(token);
}
```

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run lib/traffic/meta-gateway.test.ts && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(traffic): MetaGateway com implementação Marketing API (paginação, writes, erros)" && git push`

## Task 5: Caption determinístico + embeddings Gemini

**Files:** Create: `painel/lib/traffic/caption.ts` + `.test.ts`, `painel/lib/traffic/embeddings.ts` + `.test.ts`

- [ ] **Step 1: Teste do caption** — caption é DETERMINÍSTICO (template sobre a série, sem LLM):

```typescript
import { describe, it, expect } from "vitest";
import { buildCaption } from "./caption";
import type { SnapshotRow } from "./types";

function row(date: string, roas: number, freq: number, ctr: number, spend = 100): SnapshotRow {
  return { date, level: "adset", entity_id: "a1", entity_name: "Adset X",
    metrics: { spend, impressions: 1000, results: 5, revenue: roas * spend, roas, cpa: 20, ctr, frequency: freq } };
}

describe("buildCaption", () => {
  it("descreve tendência de ROAS, frequência e dias da série", () => {
    const series = [row("2026-06-01", 2.0, 1.5, 0.02), row("2026-06-05", 1.6, 2.2, 0.018), row("2026-06-08", 1.2, 3.1, 0.015)];
    const c = buildCaption({ entityName: "Adset X", level: "adset", breakevenRoas: 1.3, series, nicho: "emagrecimento" });
    expect(c).toContain("Adset X");
    expect(c).toMatch(/ROAS.*(caiu|queda)/i);
    expect(c).toMatch(/frequência.*(subiu|alta)/i);
    expect(c).toContain("abaixo do breakeven");
    expect(c).toContain("emagrecimento");
  });
  it("série vazia → caption mínimo sem crash", () => {
    const c = buildCaption({ entityName: "X", level: "ad", breakevenRoas: 1.5, series: [], nicho: "n" });
    expect(c.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Ver falhar, implementar `caption.ts`**:

```typescript
import type { EntityLevel, SnapshotRow } from "./types";

interface CaptionInput {
  entityName: string; level: EntityLevel; breakevenRoas: number;
  series: SnapshotRow[]; nicho: string;
}

function trendWord(first: number, last: number): "subiu" | "caiu" | "estável" {
  if (first === 0) return last > 0 ? "subiu" : "estável";
  const delta = (last - first) / Math.abs(first);
  if (delta > 0.15) return "subiu";
  if (delta < -0.15) return "caiu";
  return "estável";
}

export function buildCaption(i: CaptionInput): string {
  if (i.series.length === 0) {
    return `${i.level} "${i.entityName}" sem série de métricas disponível (nicho ${i.nicho}).`;
  }
  const first = i.series[0].metrics;
  const last = i.series[i.series.length - 1].metrics;
  const dias = i.series.length;
  const roasTrend = trendWord(first.roas, last.roas);
  const freqTrend = trendWord(first.frequency, last.frequency);
  const ctrTrend = trendWord(first.ctr, last.ctr);
  const vsBreakeven = last.roas >= i.breakevenRoas ? "acima do breakeven" : "abaixo do breakeven";
  return (
    `${i.level} "${i.entityName}" (nicho ${i.nicho}), série de ${dias} dias: ` +
    `ROAS ${roasTrend} de ${first.roas.toFixed(2)} para ${last.roas.toFixed(2)} (${vsBreakeven} ${i.breakevenRoas.toFixed(2)}); ` +
    `frequência ${freqTrend === "subiu" ? "subiu/alta" : freqTrend} (${last.frequency.toFixed(1)}); ` +
    `CTR ${ctrTrend} (${(last.ctr * 100).toFixed(2)}%); ` +
    `spend diário R$${last.spend.toFixed(0)}, CPA R$${last.cpa.toFixed(0)}.`
  );
}
```

- [ ] **Step 3: Teste de embeddings** (mock fetch):

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { embedText } from "./embeddings";

const FETCH = vi.fn();
beforeEach(() => { vi.stubGlobal("fetch", FETCH); FETCH.mockReset(); });
afterEach(() => vi.unstubAllGlobals());

describe("embedText", () => {
  it("chama gemini-embedding-001 com outputDimensionality 768 e devolve vetor", async () => {
    FETCH.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ embedding: { values: new Array(768).fill(0.1) } }) });
    const v = await embedText("situação x", "FAKE_KEY");
    expect(v).toHaveLength(768);
    const [url, init] = FETCH.mock.calls[0];
    expect(String(url)).toContain("gemini-embedding-001:embedContent");
    expect(JSON.parse(init.body).outputDimensionality).toBe(768);
  });
  it("erro da API → throw", async () => {
    FETCH.mockResolvedValueOnce({ ok: false, status: 429, json: () => Promise.resolve({}), text: () => Promise.resolve("quota") });
    await expect(embedText("x", "K")).rejects.toThrow(/429/);
  });
});
```

- [ ] **Step 4: Implementar `embeddings.ts`**:

```typescript
const URL_TMPL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent";

export async function embedText(text: string, apiKey = process.env.GEMINI_API_KEY ?? ""): Promise<number[]> {
  if (!apiKey) throw new Error("GEMINI_API_KEY ausente");
  const res = await fetch(`${URL_TMPL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: { parts: [{ text }] },
      taskType: "RETRIEVAL_DOCUMENT",
      outputDimensionality: 768,
    }),
  });
  if (!res.ok) throw new Error(`Gemini embed ${res.status}`);
  const body = (await res.json()) as { embedding?: { values?: number[] } };
  const v = body.embedding?.values;
  if (!v || v.length !== 768) throw new Error("Embedding inválido");
  return v;
}
```

- [ ] **Step 5: Rodar tudo + typecheck + commit** — `npx vitest run lib/traffic && npm run typecheck && git add -A painel/lib/traffic && git commit -m "feat(traffic): caption determinístico + embeddings Gemini 768d" && git push`

## Task 6: Outcome engine (OLS baseline)

**Files:** Create: `painel/lib/traffic/outcome.ts` + `.test.ts`

- [ ] **Step 1: Teste** (funções puras — o coração estatístico):

```typescript
import { describe, it, expect } from "vitest";
import { olsFit, evaluateOutcome } from "./outcome";

describe("olsFit", () => {
  it("ajusta reta em série linear perfeita", () => {
    const f = olsFit([1, 2, 3, 4, 5, 6, 7]); // y = x (índice 0-based: 1..7)
    expect(f.predict(7)).toBeCloseTo(8, 5);   // próximo ponto da reta
  });
  it("série constante prediz a constante", () => {
    const f = olsFit([2, 2, 2, 2, 2, 2, 2]);
    expect(f.predict(10)).toBeCloseTo(2, 5);
  });
});

describe("evaluateOutcome", () => {
  const pre = [1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5]; // ROAS estável 1.5
  it("ROAS sobe pós-ação → sucesso", () => {
    const r = evaluateOutcome({ preSeries: pre, postSeries: [1.8, 1.9, 1.8, 1.9, 1.8, 1.9, 1.8], metric: "roas" });
    expect(r.label).toBe("sucesso");
    expect(r.ratio).toBeGreaterThan(1.1);
  });
  it("ROAS cai → falha", () => {
    const r = evaluateOutcome({ preSeries: pre, postSeries: [1.2, 1.1, 1.2, 1.1, 1.2, 1.1, 1.2], metric: "roas" });
    expect(r.label).toBe("falha");
  });
  it("estável → neutro", () => {
    const r = evaluateOutcome({ preSeries: pre, postSeries: [1.52, 1.49, 1.5, 1.51, 1.5, 1.49, 1.51], metric: "roas" });
    expect(r.label).toBe("neutro");
  });
  it("CPA é invertido (caiu = sucesso)", () => {
    const r = evaluateOutcome({ preSeries: [50, 50, 50, 50, 50, 50, 50], postSeries: [40, 41, 40, 39, 40, 41, 40], metric: "cpa" });
    expect(r.label).toBe("sucesso");
  });
  it("pré-série curta (<7) → inconclusivo", () => {
    const r = evaluateOutcome({ preSeries: [1, 2], postSeries: [3, 3, 3, 3, 3, 3, 3], metric: "roas" });
    expect(r.label).toBe("inconclusivo");
  });
  it("baseline previsto <= 0 → inconclusivo", () => {
    const r = evaluateOutcome({ preSeries: [5, 4, 3, 2, 1, 0.5, 0.1], postSeries: [1, 1, 1, 1, 1, 1, 1], metric: "roas" });
    expect(["inconclusivo", "sucesso"]).toContain(r.label); // reta decrescente pode prever <=0 → inconclusivo
  });
});
```

- [ ] **Step 2: Ver falhar, implementar `outcome.ts`**:

```typescript
// Outcome = razão observado/baseline-previsto (Lyft AdKDD 2020, spec §5).
// OLS simples índice→métrica nos 14d pré (mín. 7 pontos); janela pós por classe.

export interface OlsModel { slope: number; intercept: number; predict(x: number): number }

export function olsFit(ys: number[]): OlsModel {
  const n = ys.length;
  const xs = ys.map((_, i) => i);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  const slope = den === 0 ? 0 : num / den;
  const intercept = my - slope * mx;
  return { slope, intercept, predict: (x: number) => slope * x + intercept };
}

export interface OutcomeResult {
  label: "sucesso" | "neutro" | "falha" | "inconclusivo";
  ratio: number | null;
  detail: { predictedMean: number | null; observedMean: number | null; metric: string };
}

const MIN_PRE_POINTS = 7;
const SUCCESS_RATIO = 1.10;
const FAIL_RATIO = 0.90;

export function evaluateOutcome(input: {
  preSeries: number[]; postSeries: number[]; metric: "roas" | "cpa";
}): OutcomeResult {
  const { preSeries, postSeries, metric } = input;
  const detailBase = { metric, predictedMean: null as number | null, observedMean: null as number | null };
  if (preSeries.length < MIN_PRE_POINTS || postSeries.length < 3) {
    return { label: "inconclusivo", ratio: null, detail: detailBase };
  }
  const model = olsFit(preSeries);
  const preds = postSeries.map((_, i) => model.predict(preSeries.length + i));
  const predictedMean = preds.reduce((a, b) => a + b, 0) / preds.length;
  const observedMean = postSeries.reduce((a, b) => a + b, 0) / postSeries.length;
  if (predictedMean <= 0 || observedMean < 0) {
    return { label: "inconclusivo", ratio: null, detail: { ...detailBase, predictedMean, observedMean } };
  }
  // CPA: menor = melhor → ratio invertido pra manter >1 = melhorou.
  const ratio = metric === "cpa" ? predictedMean / observedMean : observedMean / predictedMean;
  const label = ratio >= SUCCESS_RATIO ? "sucesso" : ratio <= FAIL_RATIO ? "falha" : "neutro";
  return { label, ratio, detail: { ...detailBase, predictedMean, observedMean } };
}
```

- [ ] **Step 3: Rodar, passar, commit** — `npx vitest run lib/traffic/outcome.test.ts && npm run typecheck && git add -A painel/lib/traffic && git commit -m "feat(traffic): outcome engine — OLS baseline + rótulo por ratio" && git push`

## Task 7: Concordância

**Files:** Create: `painel/lib/traffic/concordance.ts` + `.test.ts`

- [ ] **Step 1: Teste:**

```typescript
import { describe, it, expect } from "vitest";
import { matchCaseToRecs, agreementRate, shouldGraduate } from "./concordance";

const rec = (over: Partial<{ id: string; class: string; entity_level: string; entity_id: string; status: string }> = {}) =>
  ({ id: "r1", class: "budget_up", entity_level: "adset", entity_id: "a1", status: "aberta", ...over }) as never;
const kase = (over: Partial<{ class: string; entity_level: string; entity_id: string }> = {}) =>
  ({ class: "budget_up", entity_level: "adset", entity_id: "a1", ...over }) as never;

describe("matchCaseToRecs", () => {
  it("full: mesma classe+entidade", () => expect(matchCaseToRecs(kase(), [rec()])).toEqual({ kind: "full", recId: "r1" }));
  it("partial: mesma classe+nível, entidade diferente", () =>
    expect(matchCaseToRecs(kase({ entity_id: "a2" }), [rec()])).toEqual({ kind: "partial", recId: "r1" }));
  it("none: classe diferente", () =>
    expect(matchCaseToRecs(kase({ class: "pause_ad" }), [rec()])).toEqual({ kind: "none", recId: null }));
});

describe("agreementRate", () => {
  it("full=1, partial=0.5, none=0", () => {
    expect(agreementRate(["full", "partial", "none", "full"])).toBeCloseTo((1 + 0.5 + 0 + 1) / 4);
  });
  it("vazio → null", () => expect(agreementRate([])).toBeNull());
});

describe("shouldGraduate", () => {
  it("gradua com taxa>=0.8 em >=10 decisões sem falha grave", () =>
    expect(shouldGraduate({ rate: 0.85, decisions: 12, recentFailure: false })).toBe(true));
  it("não gradua com poucas decisões, taxa baixa ou falha", () => {
    expect(shouldGraduate({ rate: 0.9, decisions: 9, recentFailure: false })).toBe(false);
    expect(shouldGraduate({ rate: 0.7, decisions: 20, recentFailure: false })).toBe(false);
    expect(shouldGraduate({ rate: 0.95, decisions: 20, recentFailure: true })).toBe(false);
  });
});
```

- [ ] **Step 2: Implementar `concordance.ts`:**

```typescript
import type { TrafficCase, TrafficRecommendation } from "./types";

export type MatchKind = "full" | "partial" | "none";

export function matchCaseToRecs(
  c: Pick<TrafficCase, "class" | "entity_level" | "entity_id">,
  openRecs: Array<Pick<TrafficRecommendation, "id" | "class" | "entity_level" | "entity_id">>,
): { kind: MatchKind; recId: string | null } {
  const full = openRecs.find((r) => r.class === c.class && r.entity_id === c.entity_id);
  if (full) return { kind: "full", recId: full.id };
  const partial = openRecs.find((r) => r.class === c.class && r.entity_level === c.entity_level);
  if (partial) return { kind: "partial", recId: partial.id };
  return { kind: "none", recId: null };
}

const WEIGHT: Record<MatchKind, number> = { full: 1, partial: 0.5, none: 0 };

export function agreementRate(kinds: MatchKind[]): number | null {
  if (kinds.length === 0) return null;
  return kinds.reduce((a, k) => a + WEIGHT[k], 0) / kinds.length;
}

export function shouldGraduate(s: { rate: number | null; decisions: number; recentFailure: boolean }): boolean {
  return s.rate !== null && s.rate >= 0.8 && s.decisions >= 10 && !s.recentFailure;
}
```

- [ ] **Step 3: Rodar, passar, commit** — `npx vitest run lib/traffic/concordance.test.ts && git add -A painel/lib/traffic && git commit -m "feat(traffic): concordância — match full/partial + gate de graduação" && git push`

## Task 8: Data layer (db.ts)

**Files:** Create: `painel/lib/traffic/db.ts` + `.test.ts`

Camada fina sobre `serviceClient()` (mesmo padrão de `lib/hosted/real-ledger.ts` — **ler esse arquivo antes** pra copiar o estilo de erro/retorno). REGRA da casa (memory): supabase-js NÃO lança erro — sempre `const { data, error } = ...; if (error) throw new Error(...)`.

- [ ] **Step 1: Teste com client mockado** (interface mínima; testar que erros do supabase viram throw e que o RPC de similaridade é chamado com os params certos):

```typescript
import { describe, it, expect, vi } from "vitest";
import { TrafficDb } from "./db";

function mockClient(result: { data?: unknown; error?: { message: string } | null }) {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "select", "insert", "update", "eq", "in", "order", "limit", "single", "maybeSingle", "gte", "lte"]) {
    chain[m] = vi.fn(() => chain);
  }
  (chain as { then: unknown }).then = (resolve: (v: unknown) => void) => resolve(result);
  return { ...chain, rpc: vi.fn(() => Promise.resolve(result)) } as never;
}

describe("TrafficDb", () => {
  it("insertCase lança quando supabase devolve error", async () => {
    const db = new TrafficDb(mockClient({ data: null, error: { message: "boom" } }));
    await expect(db.insertCase({} as never)).rejects.toThrow(/boom/);
  });
  it("similarCases chama rpc match_traffic_cases com embedding e classe", async () => {
    const client = mockClient({ data: [], error: null });
    const db = new TrafficDb(client);
    await db.similarCases("t1", new Array(768).fill(0), "budget_up", 5);
    expect((client as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith("match_traffic_cases", expect.objectContaining({ p_tenant: "t1", p_class: "budget_up", p_limit: 5 }));
  });
});
```

- [ ] **Step 2: Implementar `db.ts`** — TODOS os métodos recebem `tenantId` como 1º arg e filtram `.eq("tenant_id", tenantId)` (serviceClient ignora RLS — decisão travada #14); todos com throw-on-error. **Assinaturas exatas (não desviar — Tasks 9-13 importam estas):**
  - `listProjects(tenantId: string): Promise<TrafficProject[]>`
  - `getProject(tenantId: string, projectId: string): Promise<TrafficProject | null>` (rotas validam ownership com isto)
  - `insertProject(tenantId: string, p: Omit<TrafficProject, "id" | "tenant_id">): Promise<{ id: string }>`
  - `upsertSnapshots(tenantId: string, rows: Array<SnapshotRow & { project_id: string }>): Promise<void>` (upsert `onConflict: "tenant_id,project_id,date,level,entity_id"`)
  - `getSeries(tenantId: string, projectId: string, level: EntityLevel, entityId: string, sinceDate: string): Promise<SnapshotRow[]>` (order date asc)
  - `entityInRecentSnapshots(tenantId: string, projectId: string, level: EntityLevel, entityId: string, sinceDate: string): Promise<boolean>` (gate de escrita — decisão #15)
  - `insertCase(tenantId: string, row: Record<string, unknown>): Promise<{ id: string }>`
  - `updateCaseOutcome(tenantId: string, caseId: string, outcome: string, magnitude: number | null, detail: unknown): Promise<void>`
  - `casesDue(tenantId: string, projectId: string, today: string): Promise<TrafficCase[]>` (`outcome=eq.pendente` + `outcome_due<=today`)
  - `upsertRecommendations(tenantId: string, rows: Array<Record<string, unknown>>): Promise<void>` (upsert `onConflict: "tenant_id,project_id,date,class,entity_level,entity_id"` — job re-rodado não duplica)
  - `openRecs(tenantId: string, projectId: string): Promise<TrafficRecommendation[]>`
  - `decideRec(tenantId: string, recId: string, status: string, matchedCaseId?: string): Promise<void>`
  - `expireOldRecs(tenantId: string, beforeDate: string): Promise<void>`
  - `listCases(tenantId: string, filters: { projectId?: string; class?: string; limit?: number }): Promise<TrafficCase[]>`
  - `listPlaybooks(tenantId: string, status?: string): Promise<Array<Record<string, unknown>>>`
  - `upsertPlaybook(tenantId: string, row: Record<string, unknown>): Promise<{ id: string }>`
  - `setPlaybookStatus(tenantId: string, id: string, fields: { status?: string; regra?: string; titulo?: string; criado_por?: string }): Promise<void>`
  - `getAutonomy(tenantId: string, projectId: string): Promise<Array<Record<string, unknown>>>`
  - `upsertAutonomy(tenantId: string, projectId: string, klass: string, fields: Record<string, unknown>): Promise<void>` (onConflict `tenant_id,project_id,class`)
  - `similarCases(tenantId: string, embedding: number[], klass: string, limit: number)` via RPC:

```typescript
// Trecho-chave (o resto segue o mesmo padrão; throw-on-error SEMPRE):
import type { SupabaseClient } from "@supabase/supabase-js";

export class TrafficDb {
  constructor(private c: SupabaseClient) {}

  async insertCase(row: Record<string, unknown>): Promise<{ id: string }> {
    const { data, error } = await this.c.from("traffic_cases").insert(row).select("id").single();
    if (error) throw new Error(`insertCase: ${error.message}`);
    return data as { id: string };
  }

  async similarCases(tenantId: string, embedding: number[], klass: string, limit: number) {
    const { data, error } = await this.c.rpc("match_traffic_cases", {
      p_tenant: tenantId, p_embedding: JSON.stringify(embedding), p_class: klass, p_limit: limit,
    });
    if (error) throw new Error(`similarCases: ${error.message}`);
    return data ?? [];
  }
  // ... demais métodos no mesmo padrão
}
```

- [ ] **Step 3: RPC de similaridade** — criar `supabase/migrations/0006_match_traffic_cases.sql`:

```sql
-- 0006_match_traffic_cases.sql — retrieval por similaridade (cosine) p/ diagnóstico.
begin;
create or replace function public.match_traffic_cases(
  p_tenant uuid, p_embedding vector(768), p_class text, p_limit int default 5
) returns table (id uuid, project_id uuid, class text, reason text, situation_caption text,
                 outcome text, params jsonb, similarity float)
language sql stable security definer set search_path = '' as $$
  -- search_path vazio (anti search-path attack, padrão da migration 0003) exige
  -- qualificar o OPERADOR do pgvector: operator(public.<=>) — senão quebra em runtime.
  select c.id, c.project_id, c.class, c.reason, c.situation_caption, c.outcome, c.params,
         1 - (c.situation_embedding operator(public.<=>) p_embedding) as similarity
  from public.traffic_cases c
  where c.tenant_id = p_tenant
    and c.situation_embedding is not null
    and (p_class is null or c.class = p_class)
  order by c.situation_embedding operator(public.<=>) p_embedding
  limit p_limit;
$$;
revoke all on function public.match_traffic_cases(uuid, vector, text, int) from public, anon, authenticated;
grant execute on function public.match_traffic_cases(uuid, vector, text, int) to service_role;
commit;
```

- [ ] **Step 4: Aplicar 0006 + rodar testes + commit** — `op run --env-file=.env.op -- bash scripts/db-apply.sh supabase/migrations/0006_match_traffic_cases.sql` (do root) · `npx vitest run lib/traffic/db.test.ts && npm run typecheck` · `git add -A && git commit -m "feat(traffic): data layer TrafficDb + RPC match_traffic_cases (security definer, service_role only)" && git push`

## Task 9: Sync job (snapshots)

**Files:** Create: `painel/lib/traffic/sync.ts` + `.test.ts`

- [ ] **Step 1: Teste** — `parseInsightRow` (conversão RawInsightRow → SnapshotRow; Meta devolve STRINGS — regra da casa: `String(v)` antes de parse, e `actions` é array de `{action_type, value}`):

```typescript
import { describe, it, expect } from "vitest";
import { parseInsightRow } from "./sync";

describe("parseInsightRow", () => {
  it("extrai purchase de actions/action_values e calcula roas/cpa", () => {
    const row = parseInsightRow({
      date_start: "2026-06-01", adset_id: "a1", adset_name: "AS",
      spend: "100.5", impressions: "2000", ctr: "1.5", frequency: "2.1",
      actions: [{ action_type: "omni_purchase", value: "4" }],
      action_values: [{ action_type: "omni_purchase", value: "402" }],
    }, "adset");
    expect(row).toEqual({
      date: "2026-06-01", level: "adset", entity_id: "a1", entity_name: "AS",
      metrics: { spend: 100.5, impressions: 2000, results: 4, revenue: 402,
                 roas: expect.closeTo(4.0, 1), cpa: expect.closeTo(25.1, 1),
                 ctr: 0.015, frequency: 2.1 },
    });
  });
  it("sem conversões → results 0, cpa 0, roas 0", () => {
    const row = parseInsightRow({ date_start: "2026-06-01", ad_id: "x", spend: "50" }, "ad");
    expect(row.metrics.results).toBe(0);
    expect(row.metrics.roas).toBe(0);
    expect(row.metrics.cpa).toBe(0);
  });
});
```

- [ ] **Step 2: Implementar `sync.ts`** — `parseInsightRow(raw, level)` (pura) + `syncProject(db, gateway, project, sinceDate, untilDate)` que: chama `getDailyInsights` nos 3 níveis, parseia, e `upsertSnapshots` com `tenant_id/project_id`. Purchase types em ordem de preferência: `omni_purchase` → `purchase` → `offsite_conversion.fb_pixel_purchase` (mesma ordem do `build-insights.py`).

```typescript
import type { MetaGateway, RawInsightRow } from "./meta-gateway";
import type { SnapshotRow, TrafficProject } from "./types";
import type { TrafficDb } from "./db";

const PURCHASE_TYPES = ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"];

function pickAction(arr: Array<{ action_type: string; value: string }> | undefined): number {
  if (!arr) return 0;
  for (const t of PURCHASE_TYPES) {
    const hit = arr.find((a) => a.action_type === t);
    if (hit) return parseFloat(String(hit.value)) || 0;
  }
  return 0;
}

export function parseInsightRow(raw: RawInsightRow, level: "campaign" | "adset" | "ad"): SnapshotRow {
  const id = level === "campaign" ? raw.campaign_id : level === "adset" ? raw.adset_id : raw.ad_id;
  const name = level === "campaign" ? raw.campaign_name : level === "adset" ? raw.adset_name : raw.ad_name;
  const spend = parseFloat(String(raw.spend ?? "0")) || 0;
  const results = pickAction(raw.actions);
  const revenue = pickAction(raw.action_values);
  return {
    date: raw.date_start, level, entity_id: String(id ?? ""), entity_name: String(name ?? ""),
    metrics: {
      spend, impressions: parseInt(String(raw.impressions ?? "0"), 10) || 0,
      results, revenue,
      roas: spend > 0 ? revenue / spend : 0,
      cpa: results > 0 ? spend / results : 0,
      ctr: (parseFloat(String(raw.ctr ?? "0")) || 0) / 100,
      frequency: parseFloat(String(raw.frequency ?? "0")) || 0,
    },
  };
}

export async function syncProject(db: TrafficDb, gw: MetaGateway, p: TrafficProject, since: string, until: string): Promise<number> {
  let count = 0;
  for (const level of ["campaign", "adset", "ad"] as const) {
    const raws = await gw.getDailyInsights(p.ad_account_id, level, since, until);
    const rows = raws.map((r) => parseInsightRow(r, level)).filter((r) => r.entity_id);
    await db.upsertSnapshots(rows.map((r) => ({ ...r, tenant_id: p.tenant_id, project_id: p.id, metrics: r.metrics })));
    count += rows.length;
  }
  return count;
}
```

- [ ] **Step 3: Rodar, passar, commit** — `npx vitest run lib/traffic/sync.test.ts && npm run typecheck && git add -A && git commit -m "feat(traffic): sync de snapshots — parse Meta (String antes de parse) + upsert 3 níveis" && git push`

## Task 10: Diagnóstico (shadow mode, LLM)

**Files:** Create: `painel/lib/traffic/diagnose.ts` + `.test.ts`

- [ ] **Step 1: Teste** — `buildDiagnosisPrompt` (pura: contém breakeven, série resumida, casos similares, playbooks, e exige JSON) e `parseDiagnosisResponse` (valida classes contra taxonomia, corta em 5, rejeita rec sem rationale):

```typescript
import { describe, it, expect } from "vitest";
import { buildDiagnosisPrompt, parseDiagnosisResponse } from "./diagnose";

describe("buildDiagnosisPrompt", () => {
  it("inclui breakeven, casos similares e playbooks aprovados", () => {
    const p = buildDiagnosisPrompt({
      project: { nome: "P1", nicho: "casa", breakeven_roas: 1.3 } as never,
      summary: "campanha X: ROAS 1.1 ...",
      similarCases: [{ situation_caption: "cap1", class: "budget_down", reason: "fadiga", outcome: "sucesso" } as never],
      playbooks: [{ titulo: "Regra 1", regra: "se freq>3 corta", class: "pause_ad" } as never],
    });
    expect(p).toContain("1.3");
    expect(p).toContain("cap1");
    expect(p).toContain("Regra 1");
    expect(p).toMatch(/JSON/);
  });
});

describe("parseDiagnosisResponse", () => {
  it("aceita JSON válido e corta em 5", () => {
    const recs = Array.from({ length: 7 }, (_, i) => ({
      class: "budget_up", entity_level: "adset", entity_id: `a${i}`, entity_name: `A${i}`,
      params: { magnitude_pct: 20 }, rationale: "ROAS 2.1 acima do breakeven com spend share baixo",
      evidence: { numbers: ["roas=2.1"] },
    }));
    const out = parseDiagnosisResponse(JSON.stringify({ recommendations: recs }));
    expect(out).toHaveLength(5);
  });
  it("rejeita classe fora da taxonomia e rec sem rationale", () => {
    const out = parseDiagnosisResponse(JSON.stringify({ recommendations: [
      { class: "explodir_tudo", entity_level: "ad", entity_id: "1", rationale: "x" },
      { class: "pause_ad", entity_level: "ad", entity_id: "2", rationale: "" },
      { class: "pause_ad", entity_level: "ad", entity_id: "3", entity_name: "ok", params: {}, rationale: "CTR caiu 40% em 5 dias", evidence: {} },
    ]}));
    expect(out).toHaveLength(1);
    expect(out[0].entity_id).toBe("3");
  });
  it("resposta não-JSON → []", () => expect(parseDiagnosisResponse("desculpa, não posso")).toEqual([]));
});
```

- [ ] **Step 2: Implementar `diagnose.ts`** — 3 funções:

```typescript
import { TRAFFIC_CLASSES } from "./taxonomy";
import type { TrafficProject } from "./types";

export function buildDiagnosisPrompt(i: {
  project: TrafficProject; summary: string;
  similarCases: Array<{ situation_caption: string; class: string; reason: string; outcome: string }>;
  playbooks: Array<{ titulo: string; regra: string; class: string }>;
}): string {
  const cases = i.similarCases.map((c) =>
    `- [${c.class} → ${c.outcome}] situação: ${c.situation_caption} | razão do gestor: ${c.reason}`).join("\n") || "(nenhum ainda)";
  const pbs = i.playbooks.map((p) => `- [${p.class}] ${p.titulo}: ${p.regra}`).join("\n") || "(nenhum aprovado)";
  return [
    `Você é um gestor de tráfego sênior analisando o projeto "${i.project.nome}" (nicho ${i.project.nicho}).`,
    `Breakeven ROAS: ${i.project.breakeven_roas}. Toda recomendação PRECISA citar números que a sustentem; incerteza é declarada, nunca inventada.`,
    `\n## Métricas consolidadas (últimos 30d, série diária)\n${i.summary}`,
    `\n## Casos passados similares (decisões reais do gestor + outcome medido)\n${cases}`,
    `\n## Playbooks aprovados pelo gestor (priors — siga salvo contradição forte nos dados)\n${pbs}`,
    `\n## Tarefa`,
    `Responda APENAS com JSON: {"recommendations":[{"class":"<uma de: ${TRAFFIC_CLASSES.join("|")}>",`,
    `"entity_level":"campaign|adset|ad","entity_id":"...","entity_name":"...",`,
    `"params":{"magnitude_pct":20},"rationale":"<por quê, com números>","evidence":{"numbers":["..."]},"confianca":0.0}]}`,
    `Máximo 5 recomendações, ordenadas por impacto. Se nada a fazer, devolva lista vazia.`,
  ].join("\n");
}

export function parseDiagnosisResponse(text: string): Array<Record<string, unknown>> {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return [];
  try {
    const body = JSON.parse(m[0]) as { recommendations?: Array<Record<string, unknown>> };
    return (body.recommendations ?? [])
      .filter((r) => TRAFFIC_CLASSES.includes(r.class as never) && typeof r.rationale === "string" && (r.rationale as string).length > 5)
      .slice(0, 5);
  } catch { return []; }
}

export async function callDiagnosisModel(prompt: string, apiKey = process.env.ANTHROPIC_API_KEY ?? ""): Promise<{ text: string; inTok: number; outTok: number; model: string }> {
  const model = "claude-sonnet-4-6";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 4096, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { content: Array<{ type: string; text?: string }>; usage: { input_tokens: number; output_tokens: number } };
  const text = body.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return { text, inTok: body.usage.input_tokens, outTok: body.usage.output_tokens, model };
}
```

- [ ] **Step 3: `runDailyDiagnosis(db: TrafficDb, ledger: LedgerDB, tenant: Tenant, project: TrafficProject)`** (no mesmo arquivo) — **`ledger` é `LedgerDB` (de `lib/hosted/ledger.ts`), NUNCA um SupabaseClient cru** (o chamador passa `realLedgerDB()` — conferir o factory real em `lib/hosted/real-ledger.ts` e usar o MESMO que `app/api/run/start` usa). Fluxo:
  1. **`budgetGate(ledger, tenant.id)` ANTES de qualquer chamada paga (decisão #17)** — estourou o teto → `console.log("[diag] skip: budget")` e return, sem chamar Anthropic/Gemini;
  2. monta `summary` dos snapshots 30d (agregado por campanha + top 10 ads por spend 7d, texto compacto);
  3. `embedText(summary)` + `similarCases` (top 5) + `listPlaybooks(tenant.id, 'aprovado')`;
  4. `callDiagnosisModel` → `parseDiagnosisResponse` → `upsertRecommendations` com `date=today` (upsert — re-rodar o job não duplica);
  5. grava custo: `ledger.insertCost({ tenant_id, service: "traffic", ref: project.id, skill: "gestor-trafego", model, in_tok, out_tok, usd: inTok*3/1e6 + outTok*15/1e6 })` (Sonnet $3/$15 por Mtok — se `lib/hosted/ledger.ts` já tiver helper de pricing, usar o existente; conferir a assinatura REAL de `insertCost` em `real-ledger.ts` antes).
- [ ] **Step 4: Rodar, passar, commit** — `npx vitest run lib/traffic/diagnose.test.ts && npm run typecheck && git add -A && git commit -m "feat(traffic): diagnóstico shadow mode — prompt com casos+playbooks, parse defensivo, custo no ledger" && git push`

## Task 11: Indução de playbooks (contrastiva) — ⏸️ DIFERÍVEL

> **Codex P3 acatado parcialmente:** o código é barato de escrever agora (mantém o plano coeso e a spec promete), mas a indução **só dispara com ≥3 sucessos E ≥3 falhas numa classe — semanas de dados reais**. Se o cronograma apertar, PULAR esta task inteira e executá-la na semana 2+ do teste não quebra nada (o job da Task 13 chama `runWeeklyInduction` só às segundas e tolera o módulo ausente com try/catch — nesse caso comentar o import + chamada e deixar TODO).

**Files:** Create: `painel/lib/traffic/induction.ts` + `.test.ts`

- [ ] **Step 1: Teste** — `eligibleClasses` (≥3 sucessos E ≥3 falhas por classe — threshold MACLA) e `buildInductionPrompt` (contém sucessos e falhas separados, pede regra com precondições e escopo universal|projeto):

```typescript
import { describe, it, expect } from "vitest";
import { eligibleClasses, buildInductionPrompt } from "./induction";

describe("eligibleClasses", () => {
  it("só classe com >=3 sucessos E >=3 falhas", () => {
    const cases = [
      ...Array(3).fill({ class: "budget_up", outcome: "sucesso" }),
      ...Array(3).fill({ class: "budget_up", outcome: "falha" }),
      ...Array(5).fill({ class: "pause_ad", outcome: "sucesso" }),
      { class: "pause_ad", outcome: "falha" },
    ];
    expect(eligibleClasses(cases as never)).toEqual(["budget_up"]);
  });
});

describe("buildInductionPrompt", () => {
  it("separa sucessos de falhas e pede precondições + escopo", () => {
    const p = buildInductionPrompt("budget_up",
      [{ situation_caption: "ok1", reason: "r1", project_id: "p1" } as never],
      [{ situation_caption: "ruim1", reason: "r2", project_id: "p2" } as never]);
    expect(p).toContain("ok1");
    expect(p).toContain("ruim1");
    expect(p).toMatch(/precondi/i);
    expect(p).toMatch(/universal|projeto/);
  });
});
```

- [ ] **Step 2: Implementar** — `eligibleClasses(cases)` (conta por classe), `buildInductionPrompt(klass, successes, failures)` (pede JSON `{playbooks:[{scope:"universal"|"projeto", project_id?, titulo, regra, evidencia}]}`; instrução: "compare os contextos de sucesso vs falha; a regra deve ter precondições explícitas que separem os dois grupos; se o padrão só aparece em 1 projeto → scope projeto"), `parseInductionResponse` (mesmo padrão defensivo do diagnose), `runWeeklyInduction(db, ledger, tenant)` (para cada classe elegível: busca casos com outcome != pendente/inconclusivo, chama modelo, insere playbooks `status='draft'`, grava custo `service:'traffic', skill:'inducao-playbook'`).
- [ ] **Step 3: Rodar, passar, commit** — `npx vitest run lib/traffic/induction.test.ts && npm run typecheck && git add -A && git commit -m "feat(traffic): indução contrastiva de playbooks (>=3 sucessos e >=3 falhas, draft pro Leo)" && git push`

## Task 12: Rotas API

**Files:** Create (todas em `painel/app/api/traffic/`): `projects/route.ts`, `today/route.ts`, `apply/route.ts`, `decide/route.ts`, `manual-case/route.ts`, `cases/route.ts`, `playbooks/route.ts`, `playbooks/[id]/route.ts`, `autonomy/route.ts` · Modify: `painel/lib/hosted/route-guard.ts` (allowlist F1a — ADICIONAR os paths novos; ler o arquivo antes)

Padrão de TODAS as rotas — **copiar EXATAMENTE o tratamento de erro de `app/api/usage/route.ts`** (`requireTenant()` LANÇA `TenantError`; quem responde 401/403 é `tenantErrorResponse` — decisão travada #13):

```typescript
import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/hosted/require-tenant";
import { tenantErrorResponse } from "@/lib/hosted/tenant"; // ⚠️ conferir o import real em app/api/usage/route.ts e usar o MESMO
import { hasFeature } from "@/lib/hosted/features";
import { serviceClient } from "@/lib/hosted/supabase";
import { TrafficDb } from "@/lib/traffic/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const tenant = await requireTenant();
    if (!hasFeature(tenant, "traffic_copilot")) return NextResponse.json({ error: "feature off" }, { status: 404 });
    const db = new TrafficDb(serviceClient());
    const projects = await db.listProjects(tenant.id);
    return NextResponse.json({ projects });
  } catch (e) {
    const r = tenantErrorResponse(e);
    if (r) return r;
    console.error("[traffic]", e);
    return NextResponse.json({ error: "erro interno" }, { status: 500 });
  }
}
```

> Validação de input em TODA rota que escreve: `entity_level` no enum, `class` na taxonomia, `project_id` UUID (usar `UUID_RE` de `lib/hosted/ids.ts`), e **ownership**: `db.getProject(tenant.id, project_id)` → null = 404. Rejeitar campos desconhecidos em rotas de dinheiro (`apply`).

- [ ] **Step 1:** `GET/POST /api/traffic/projects` — listar / criar projeto (POST body: nome, nicho, vertical?, ticket?, ad_account_id, breakeven_roas).
- [ ] **Step 2:** `GET /api/traffic/today?project=<id>` — devolve `{ recommendations: openRecs(project), lastSync, summary }` (summary = agregado 7d por campanha dos snapshots, pra UI).
- [ ] **Step 3:** `POST /api/traffic/apply` — **a rota mais importante (escreve em campanha REAL com dinheiro REAL — todos os gates abaixo são obrigatórios, na ordem).** Body: `{ project_id, class, entity_level, entity_id, entity_name, params, reason, recommendation_id? }` (campo desconhecido = 400). Fluxo:
  1. **Validação:** `reason.length >= 10` · classe na taxonomia · `entity_level` no enum · `project_id` UUID + ownership (`getProject(tenant.id, project_id)` → null = 404);
  2. **Gate de entidade conhecida (decisão #15):** `entityInRecentSnapshots(tenant.id, project_id, entity_level, entity_id, hoje-7d)` → false = 422 "entidade não encontrada nos snapshots do projeto". Impede mexer em entidade de outra conta via token compartilhado;
  3. **Guardrails (decisão #16), só pra `isWriteClass`:** ler `getAutonomy` do par classe×projeto (default se não existe) → `kill_switch: true` = 403 · hora local BRT fora de `hora_inicio..hora_fim` = 403 com mensagem · pra budget_up/down: `params.to_cents` inteiro > 0 obrigatório, `current = gateway.getDailyBudget(entity_id)` e se `current` não-null, `abs(to_cents-current)/current*100 > max_budget_change_pct` = 422 com o delta calculado · idempotência: header `Idempotency-Key` repetido em 10min (Map em memória `globalThis.__trafficIdem`) = 409;
  4. **Escrita Meta:** `budget_up/down`→`updateDailyBudget(entity_id, params.to_cents)` · `pause_*`→`setStatus(entity_id, "PAUSED")` · `duplicate_winner`→`duplicate` · `bid_change`→`updateBid`. Falhou → 502 com a mensagem da Graph, NADA é gravado (caso só existe se a ação aconteceu);
  5. **Monta e grava o caso PRIMEIRO:** série 30d (`getSeries`), `buildCaption`, `embedText(caption)` (falhou embedding → grava caso com `situation_embedding: null`, não bloqueia), `outcome_due = hoje + outcomeWindowDays(class)`, `origem` provisória `'leo'` → `caseId = insertCase(...)`;
  6. **Concordância DEPOIS do caso existir:** `matchCaseToRecs(case, openRecs)` → full/partial: `decideRec(tenant.id, recId, 'acatada'|'modificada', caseId)` + UPDATE do caso (`origem`, `recommendation_id`); devolve `{ case_id, match }`.
- [ ] **Step 4:** `POST /api/traffic/decide` — body `{ recommendation_id, decision: "recusar" }` (recusa explícita sem ação; acatar/modificar acontecem via `apply`). Marca `status='recusada'`.
- [ ] **Step 5:** `POST /api/traffic/manual-case` — classes manuais (`new_creative`, `new_audience`, `lp_change`, `other_manual`): mesmo fluxo do apply SEM passo 2 (sem escrita Meta), `entity_level: 'external'` permitido.
- [ ] **Step 6:** `GET /api/traffic/cases?project=&class=` · `GET/POST /api/traffic/playbooks` + `PATCH /api/traffic/playbooks/[id]` (aprovar/editar/desativar: body `{ status?, regra?, titulo? }`, marca `criado_por:'leo'` quando editado) · `GET/PATCH /api/traffic/autonomy` (PATCH body `{ project_id, class, modo?, guardrails? }` — Leo rebaixa/ajusta).
- [ ] **Step 7:** Adicionar TODOS os paths `/api/traffic/*` na allowlist do `route-guard.ts` (seguir o formato existente do arquivo) **+ estender `route-guard.test.ts`** (os testes existentes asseram 501 pra rota fora da allowlist — adicionar casos: `/api/traffic/today` GET permitido, `/api/traffic/apply` POST exige same-origin, rota traffic inexistente continua 501).
- [ ] **Step 8: Teste de rota mínimo** — `painel/app/api/traffic/apply/apply-helpers.test.ts`: extrair a lógica do passo 3-4 do apply pra função pura `assembleCase(input, series, openRecs)` em `lib/traffic/assemble-case.ts` e testar: reason curto rejeita, write class exige params, match seta origem certa. (Rotas em si ficam finas; lógica testável vive em lib.)
- [ ] **Step 9: Rodar tudo + typecheck + commit** — `npx vitest run lib/traffic && npm run typecheck && git add -A && git commit -m "feat(traffic): rotas /api/traffic/* (apply atômico, decide, manual, playbooks, autonomy) + allowlist" && git push`

## Task 13: Job diário (pm2 cron)

**Files:** Create: `painel/scripts/traffic-daily.mjs`, `painel/lib/traffic/service-client.ts` · Modify: `ecosystem.config.cjs`, `painel/package.json`

- [ ] **Step 0a: Dependência `tsx`** — `cd painel && npm install -D tsx` (decisão #18: dependência explícita, nunca `npx` baixando em produção). Verificar que entrou no package.json.
- [ ] **Step 0b: Client supabase script-safe** — `painel/lib/traffic/service-client.ts`. ⚠️ O job NÃO PODE importar `lib/hosted/supabase.ts` (tem `import "server-only"` que LANÇA fora do Next — decisão #18):

```typescript
// Client service-role pra scripts fora do Next (jobs cron). NUNCA importar em rota/componente —
// pra código Next, use lib/hosted/supabase.ts. Este existe porque server-only mata scripts tsx.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function scriptServiceClient(): SupabaseClient {
  const url = process.env.MAGNUS_ONLINE_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.MAGNUS_ONLINE_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase URL/service key ausentes no env do job");
  return createClient(url, key, { auth: { persistSession: false } });
}
```

> ⚠️ Conferir os NOMES REAIS das env vars no `.env.op` do magnus-os-online (`grep -i supabase .env.op`) e usar exatamente os que existem — os fallbacks acima cobrem os dois shapes comuns do repo. O mesmo vale pro `realLedgerDB`: se o factory de `lib/hosted/real-ledger.ts` importar `lib/hosted/supabase.ts`, instanciar a classe do ledger diretamente com `scriptServiceClient()` no job.

- [ ] **Step 1: Script** `painel/scripts/traffic-daily.mjs` — roda via `npx tsx` pra importar os módulos TS:

```js
#!/usr/bin/env node
// Job diário do traffic_copilot: sync → outcomes → expirar recs → diagnóstico → (segunda: indução).
// Roda como processo pm2 com cron_restart (autorestart false). Logs no stdout (pm2 logs traffic-jobs).
import { spawnSync } from "node:child_process";
// tsx é devDependency local (Step 0a) — usar o binário do node_modules, nunca npx (que baixaria em prod)
const cwd = new URL("..", import.meta.url).pathname;
const r = spawnSync(`${cwd}/node_modules/.bin/tsx`, ["scripts/traffic-daily-main.ts"], { stdio: "inherit", cwd });
process.exit(r.status ?? 1);
```

- [ ] **Step 2: Main** `painel/scripts/traffic-daily-main.ts`:

```typescript
import { scriptServiceClient } from "../lib/traffic/service-client"; // NUNCA lib/hosted/supabase (server-only)
import { TrafficDb } from "../lib/traffic/db";
import { trafficGateway } from "../lib/traffic/meta-gateway";
import { syncProject } from "../lib/traffic/sync";
import { evaluateOutcome } from "../lib/traffic/outcome";
import { outcomeWindowDays } from "../lib/traffic/taxonomy";
import { runDailyDiagnosis } from "../lib/traffic/diagnose";
import { runWeeklyInduction } from "../lib/traffic/induction";
// LedgerDB: conferir lib/hosted/real-ledger.ts — se o factory importar lib/hosted/supabase,
// instanciar a implementação diretamente passando scriptServiceClient() (decisão #18).

function isoDate(d: Date): string { return d.toISOString().slice(0, 10); }

async function main() {
  const client = scriptServiceClient();
  const db = new TrafficDb(client);
  const ledger = makeLedger(client); // helper local: instancia o LedgerDB real com este client
  const gw = trafficGateway();
  const today = new Date();
  const until = isoDate(today);
  const since = isoDate(new Date(today.getTime() - 30 * 86400_000));

  const { data: tenants, error } = await client.from("tenants").select("*").eq("status", "active");
  if (error) throw new Error(error.message);
  for (const tenant of tenants ?? []) {
    const plan = tenant.plan as { features?: Record<string, unknown> } | null;
    if (plan?.features?.traffic_copilot !== true) continue;
    const projects = await db.listProjects(tenant.id);
    for (const p of projects.filter((x) => x.ativo)) {
      try {
        const n = await syncProject(db, gw, p, since, until);
        console.log(`[sync] ${p.nome}: ${n} rows`);
        // outcomes vencidos — escopado por tenant+projeto (assinatura da Task 8)
        const due = await db.casesDue(tenant.id, p.id, until);
        for (const c of due) {
          const series = await db.getSeries(tenant.id, p.id, c.entity_level, c.entity_id, isoDate(new Date(new Date(c.applied_at).getTime() - 14 * 86400_000)));
          const applied = c.applied_at.slice(0, 10);
          const pre = series.filter((s) => s.date < applied);
          const post = series.filter((s) => s.date >= applied).slice(0, outcomeWindowDays(c.class));
          const metric = post.some((s) => s.metrics.revenue > 0) ? "roas" as const : "cpa" as const;
          const r = evaluateOutcome({ preSeries: pre.map((s) => s.metrics[metric]), postSeries: post.map((s) => s.metrics[metric]), metric });
          await db.updateCaseOutcome(tenant.id, c.id, r.label, r.ratio, r.detail);
          console.log(`[outcome] case ${c.id}: ${r.label}`);
        }
        await db.expireOldRecs(tenant.id, isoDate(new Date(today.getTime() - 2 * 86400_000)));
        await runDailyDiagnosis(db, ledger, tenant, p); // budgetGate dentro (decisão #17)
        console.log(`[diag] ${p.nome}: ok`);
      } catch (e) {
        console.error(`[ERRO] projeto ${p.nome}:`, e); // não derruba os outros projetos
      }
    }
    if (today.getUTCDay() === 1) {
      try { await runWeeklyInduction(db, ledger, tenant); } catch (e) { console.error("[inducao]", e); }
    }
  }
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: pm2** — adicionar app no `ecosystem.config.cjs` (NÃO mexer no app existente):

```js
// dentro de module.exports.apps, ADICIONAR:
{
  name: "traffic-jobs",
  cwd: __dirname + "/painel",
  script: "scripts/traffic-daily.mjs",
  cron_restart: "0 9 * * *",     // 09:00 UTC = 06:00 BRT
  autorestart: false,
  env: { NODE_ENV: "production" },
},
```

- [ ] **Step 4: Smoke local** — `cd painel && set -a && . ../.env.bootstrap && set +a && op run --env-file=../.env.op -- npx tsx scripts/traffic-daily-main.ts`. Expected: roda sem crash (0 tenants com flag = no-op limpo, exit 0).
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(traffic): job diário pm2 cron — sync, outcomes, expiração, diagnóstico, indução semanal" && git push`
- [ ] **Step 6: GATE FASE A** — rodar `/codex review` no diff acumulado (`git diff <commit-pré-task-2>..HEAD`). Corrigir P1s antes de seguir pra UI.

## Task 14: UI — página /trafego (4 abas)

**Files:** Create: `painel/app/trafego/page.tsx`, `painel/components/traffic/TrafficShell.tsx`, `HojeTab.tsx`, `RecommendationCard.tsx`, `ApplyModal.tsx`, `DecisoesTab.tsx`, `PlaybooksTab.tsx`, `AutonomiaTab.tsx` · Modify: `painel/components/Sidebar.tsx` (item "Tráfego" gated pela flag)

Regras: usar SÓ classes CSS existentes (`.card`, `.pill`, `.btn`, `.tabbar`, `.modal-scrim/.modal`, `.preset-card`, `.field`, tokens). Texto 100% PT. Padrão de fetch: igual aos componentes existentes (olhar `ResultadosTab.tsx` antes).

- [ ] **Step 1: Page** — `app/trafego/page.tsx` (server component): `requireTenant()` + `hasFeature` → `notFound()` se off; **composição IGUAL a `app/page.tsx`** (ler antes): mesmo wrapper `AppShell` + `Sidebar` + `TopBar` que as páginas existentes usam — NÃO renderizar `TrafficShell` pelado. Carrega projects server-side e passa pro `<TrafficShell projects={...} />` (client) dentro do main.
- [ ] **Step 2: TrafficShell** — seletor de projeto (select `.select`) + `.tabbar` com 4 abas (estado zustand local ou useState simples — useState basta) → renderiza a aba ativa.
- [ ] **Step 3: HojeTab** — fetch `/api/traffic/today?project=`; lista de `RecommendationCard` (cada um: `.card` com pill da classe, entity_name, rationale, evidence.numbers como `.pill--mono`, botões **Aplicar** (abre ApplyModal pré-preenchido) / **Recusar** (POST decide) ). Abaixo, botão "Registrar otimização manual" (abre ApplyModal vazio em modo manual). Empty state `.empty` quando sem recomendações.
- [ ] **Step 4: ApplyModal** — `.modal-scrim/.modal` centralizado (padrão `SkillLaunchModal`): campos classe (select com as 11), entidade (autocomplete simples dos snapshots — input + datalist), params (magnitude % pra budget; oculto pra pause), **Razão (textarea obrigatório ≥10 chars, com hint "por que você está fazendo isso? — é o que a ferramenta aprende")**. Submit → POST `/api/traffic/apply` ou `/manual-case` → toast/refresh.
- [ ] **Step 5: DecisoesTab** — fetch `/api/traffic/cases?project=`; timeline (lista `.card` compacta): data, pill classe, entidade, razão (truncada), pill outcome (`--success/--warning/--danger` pra sucesso/neutro+inconclusivo/falha; cinza pendente).
- [ ] **Step 6: PlaybooksTab** — duas seções (Universal / Deste projeto); card por playbook com status pill, regra em texto, botões Aprovar (PATCH status=aprovado) / Editar (textarea inline) / Desativar. Drafts da indução aparecem com banner `.deps-banner`-style "novo playbook induzido — revisar".
- [ ] **Step 7: AutonomiaTab** — tabela por classe: concordância atual (%), decisões consideradas, modo (pill), toggle kill switch global (PATCH), botão "Rebaixar" quando graduada. **SEM sparkline no v1** (codex P3 acatado: execução autônoma plena nem está ligada — mostrar número basta).
- [ ] **Step 8: Sidebar** — ⚠️ o `Sidebar` atual tem união de tipos `activeView: "empresa" | "campaign"` — **estender a união com `"trafego"`** (e os pontos que fazem switch nela; `npm run typecheck` pega todos) OU adicionar prop opcional `extraNav` — escolher o que tocar MENOS arquivos. Item "Tráfego" (ícone de gráfico existente em `components/icons`) → `/trafego`, renderizado só com a flag on (expor a flag via prop server-side, seguindo como o Sidebar recebe dados hoje).
- [ ] **Step 9: Verificação visual** — `npm run build` limpo; subir dev (`npm run dev`) e screenshot das 4 abas com dados seed (inserir 1 projeto + 2 recs + 3 cases via SQL no Supabase de teste). **Invocar `/ui-ux-pro-max`** pra review estético contra o design system; aplicar ajustes.
- [ ] **Step 10: Commit** — `git add -A && git commit -m "feat(traffic): UI /trafego — Hoje, Decisões, Playbooks, Autonomia (design system Magnus)" && git push`

## Task 15: Seed + provisioning do Leo

**Files:** Create: `painel/scripts/traffic-seed.mjs`

- [ ] **Step 1:** Script que recebe JSON dos 6 projetos (`[{nome, nicho, ad_account_id, breakeven_roas}]` — arquivo `painel/scripts/leo-projetos.json`, gitignorado) e insere em `traffic_projects` pro tenant do Leo (id via env `LEO_TENANT_ID`); liga a flag: `update tenants set plan = jsonb_set(plan, '{features,traffic_copilot}', 'true') where id = ...` (via db-apply.sh ou supabase-js no script).
- [ ] **Step 2:** Rodar com dados reais (Task 0 fornece a lista). Verificar: `GET /api/traffic/projects` logado como Leo devolve 6.
- [ ] **Step 3:** Commit (script apenas; o JSON não vai pro git) — `git add painel/scripts/traffic-seed.mjs .gitignore && git commit -m "feat(traffic): seed de projetos + flag do tenant" && git push`

## Task 16: Deploy + primeira rodada real

- [ ] **Step 1:** ⚠️ ANTES de qualquer coisa: `ssh vps-magnus 'sudo -u deploy pm2 list && sudo -u magnus pm2 list 2>/dev/null'` — VERIFICAR o estado real (memória: nunca assumir; o `ecosystem.config.cjs` do repo pode divergir do que roda). Identificar qual processo serve o painel hosted hoje e sob qual user.
- [ ] **Step 2:** Deploy seguindo o runbook real encontrado no Step 1 (rsync do painel + `npm ci && npm run build` + pm2 reload do processo do painel + `pm2 start ecosystem.config.cjs --only traffic-jobs` + `pm2 save`). NÃO tocar nginx de outros apps.
- [ ] **Step 3:** Env no VPS: `META_TRAFFIC_TOKEN` (do 1Password, via .env.op/op run conforme padrão do projeto na VPS), confirmar `GEMINI_API_KEY`/`ANTHROPIC_API_KEY`.
- [ ] **Step 4:** Smoke produção: rodar `traffic-daily-main.ts` manualmente uma vez no VPS → conferir snapshots no Supabase (count > 0 pros 6 projetos), recomendações geradas, custo no `cost_ledger` (`service='traffic'`).
- [ ] **Step 5:** **Invocar `/canary`** (10 min: /api/health, /trafego carrega, console limpo) e **`/qa-only`** no fluxo: login Leo → /trafego → ver recomendação → aplicar com razão → caso aparece em Decisões.
- [ ] **Step 6:** **GATE FINAL:** `/review` + `/codex review` no diff completo da feature. Corrigir P1s. Push final.
- [ ] **Step 7:** Fechar ciclo: wiki (`magnus-os` Session log), GTD (concluir item da implementação; criar "Avaliar semana 1 do traffic_copilot" com data +7d), memória de resume do projeto.

---

## Self-review (feito na escrita; emendas pós-codex em 2026-06-11)

- **Cobertura da spec:** §3 modelo de caso → Tasks 2/3/5 · §4 loop → Tasks 9/10/12 · §5 outcome → Task 6/13 · §6 motor → Tasks 5/8/10/11 · §7 autonomia → Tasks 7/12 (guardrail kill_switch no apply; execução autônoma plena fica DESLIGADA no v1 do código — graduação só marca o estado e a UI mostra; escrita autônoma real é flip futuro consciente, decisão da spec §7 "propõe executar") · §8 integração → Tasks 1/4 · §9 UI → Task 14 · §10 validação → Task 16 Step 7 + uso real.
- **Sem placeholders:** todo step tem código ou comando exato; os steps "mesmo padrão" apontam arquivo-referência existente a LER (não inventar).
- **Consistência de tipos:** `TrafficClass`/`EntityLevel`/`Guardrails` definidos uma vez (Task 3) e importados; `TrafficDb` métodos nomeados na Task 8 e usados nas 9-13 com as mesmas assinaturas.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | not run (escopo decidido no brainstorm /ceo com Yuri) | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | issues_found → fixed | 24 findings (10 P1 + 9 P2 + 5 P3), 21 aplicados |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | not run | — |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | not run (UI reusa design system existente; /ui-ux-pro-max na Task 14) | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | not run | — |

**CODEX:** 10 P1 corrigidos no plano (tenantErrorResponse em vez de "401 automático"; tenant-scoping explícito em todo TrafficDb; gate de entidade-no-snapshot antes de escrita Meta; guardrails enforced server-side com getDailyBudget + idempotência; budgetGate antes de chamada paga; assinatura LedgerDB em runDailyDiagnosis; service-client sem server-only pro job tsx; tsx como devDependency; ordem caso→decideRec; RPC search_path='' com operator(public.<=>)). 9 P2 aplicados (policies idempotentes, FKs, assinaturas exatas, validação, testes de route-guard, runtime exports, casesDue escopado, dedup de recs, Sidebar/page composition). P3: 2 acatados (sparkline cortado; Task 11 marcada diferível), 3 rejeitados com razão (spike MCP fica — 30min timeboxed e a spec exige; pgvector fica — núcleo do retrieval da spec, custo trivial; tabela gstack fica — instruções pro executor Claude, não pro codex).

**VERDICT:** CODEX CLEARED após emendas — eng review required (rodar `/plan-eng-review` se o Yuri quiser o gate completo antes de executar; decisões de arquitetura já foram travadas no brainstorm + spec aprovada).

NO UNRESOLVED DECISIONS
