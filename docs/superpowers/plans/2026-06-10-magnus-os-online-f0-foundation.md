# Magnus OS Online — F0 Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fundação multi-tenant do Magnus OS Online — compra na Hotmart (assinatura) provisiona tenant + usuário Auth, schema com RLS, `cost_ledger` com teto por plano, e substrato de deploy (domínio + nginx + TLS + Redis + CI/CD) com health check no ar.

**Architecture:** Estende o backend de licença existente (Supabase Portal Magnus, ref `vbmvzmibupzpjwyrfmjs`, repo `magnus-os-licenca`) com tabelas de tenancy e enforcement de orçamento — decisão herdada do blueprint 2026-06-01 (§2.1) e spec 2026-06-10 (§2). O webhook Hotmart existente ganha um ramo: produto "online" → emite licença `plano:'online'` E provisiona tenant + auth user (magic-link). O substrato de deploy vive num repo novo `magnus-os-online` (que na F1 recebe o painel hosted) — na F0 só infra + health server, pra provar o pipeline ponta a ponta.

**Tech Stack:** Supabase (Postgres + RLS + Auth + Edge Functions Deno), deno test (padrão handler+deps com fakes do repo), Management API pra migrations (Mac sem IPv6 — `DEPLOY.md`), Node 22 + pm2 + nginx + certbot + Redis no VPS, GitHub Actions (rsync, espelho do Portal Magnus), secrets via 1Password `op://` (vault YuriOS).

**Convenções deste plano:**
- `LICENCA/` = `/Users/yuribranco/Documents/Magnus/magnus-os-licenca/`
- `ONLINE/` = `/Users/yuribranco/Documents/Magnus/magnus-os-online/` (repo novo, Task 7)
- Testes Deno: `cd LICENCA && deno test --allow-all supabase/functions/` (suite atual passa 100% — rodar antes de começar pra ter baseline).
- SQL em produção: SEMPRE via Management API com transação (padrão da memory `reference_supabase_migration_apply_via_bastion` / DEPLOY.md), com `SUPABASE_ACCESS_TOKEN` vindo do `op run`.

---

## Task 0: Pré-requisitos manuais (⚠️ YURI — podem rodar em paralelo às Tasks 1-6)

**Files:** nenhum (ações externas). Registrar resultados no item `magnus-os-online-secrets` do 1Password (vault YuriOS).

- [ ] **Step 1 (YURI): Criar o produto "Magnus OS Online" na Hotmart** como **assinatura recorrente** (plano mensal; preço provisório R$297 — definitivo sai do cost_ledger na F5). Anotar o **`product id`** (numérico, aparece no payload do webhook em `data.product.id`). O webhook da conta já está configurado como "Todos os produtos" → eventos do produto novo chegam sem config extra.
- [ ] **Step 2 (YURI): Comprar VPS dedicado** (Hostinger KVM2 ou KVM4, Ubuntu 24.04, região BR/US). NÃO reusar o VPS 187 (já tem 6 apps + regra de não-mexer). Anotar IP e senha root no 1Password.
- [ ] **Step 3 (YURI): DNS** — criar registro `A` `magnusos.yuribranco.com.br` → IP do VPS novo (Cloudflare, proxy **OFF** até o certbot emitir; ligar depois se quiser).
- [ ] **Step 4 (YURI): Supabase Auth magic-link** — dashboard do projeto `vbmvzmibupzpjwyrfmjs` → Authentication → URL Configuration: adicionar `https://magnusos.yuribranco.com.br` em **Redirect URLs** (manter as URLs existentes do Portal Magnus — é lista, não substituição). Em Providers → Email: confirmar que "Enable Email provider" está on e "Confirm email" pode ficar default (criamos usuários já confirmados via admin API).
- [ ] **Step 5 (YURI): 1Password** — criar item `magnus-os-online-secrets` no vault YuriOS com: `MAGNUS_ONLINE_PRODUCT_IDS` (o id do Step 1; CSV se houver mais de um), `VPS_HOST` (IP), `VPS_ROOT_PASSWORD`. (O `SUPABASE_ACCESS_TOKEN` e service key já existem no item `magnus-os-licenca-secrets`.)

---

## Task 1: Migration 0004 — licenças online + tenants + tenant_secrets

**Files:**
- Create: `LICENCA/supabase/migrations/0004_tenants.sql`

- [ ] **Step 1: Escrever a migration**

```sql
-- 0004_tenants.sql — F0 Magnus OS Online (spec 2026-06-10).
-- Tenancy: 1 licença plano:'online' = 1 tenant = 1 empresa/marca (blueprint §2.1).
begin;

-- 1) Licenças ganham o plano 'online' (assinatura recorrente) + expiração.
alter table public.licencas drop constraint if exists licencas_plano_check;
alter table public.licencas add constraint licencas_plano_check
  check (plano in ('tripwire','mentorado','online'));
alter table public.licencas add column if not exists expira_em timestamptz;

-- 2) Tenants (RLS: o tenant lê a si próprio; escrita só service_role).
create table if not exists public.tenants (
  id            uuid primary key default gen_random_uuid(),
  license_id    uuid not null unique references public.licencas(id),
  auth_user_id  uuid unique,
  email         text not null,
  status        text not null default 'active'
                  check (status in ('active','suspended','canceled')),
  plan          jsonb not null default '{"key_source":"platform","limits":{"usd_month":20}}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists tenants_email_idx on public.tenants (email);
alter table public.tenants enable row level security;
drop policy if exists tenants_self_read on public.tenants;
create policy tenants_self_read on public.tenants
  for select using (auth.uid() = auth_user_id);

-- 3) Secrets por tenant (cifrados na app-layer, AES-256-GCM via _shared/crypto.ts).
--    RLS on SEM policy = só service_role lê/escreve. NUNCA expor ao authenticated.
create table if not exists public.tenant_secrets (
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  name        text not null,
  value_enc   text not null,
  nonce       text not null,
  key_version integer not null default 1,
  updated_at  timestamptz not null default now(),
  primary key (tenant_id, name)
);
alter table public.tenant_secrets enable row level security;

-- 4) Lookup de auth user por email (provisioning idempotente; admin.createUser
--    não tem get-by-email no supabase-js v2). Só service_role executa.
create or replace function public.auth_user_id_by_email(p_email text)
returns uuid language sql stable security definer set search_path = '' as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;
revoke execute on function public.auth_user_id_by_email(text) from anon, authenticated;

commit;
```

- [ ] **Step 2: Aplicar em produção via Management API** (de dentro do `op run`, igual DEPLOY.md):

```bash
cd /Users/yuribranco/Documents/Magnus/magnus-os-licenca
set -a; . ./.env.bootstrap; set +a
op run --env-file=.env.op -- bash -c '
  curl -sS -X POST "https://api.supabase.com/v1/projects/vbmvzmibupzpjwyrfmjs/database/query" \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
    --data-binary @<(python3 -c "import json;print(json.dumps({\"query\": open(\"supabase/migrations/0004_tenants.sql\").read()}))")'
```
Expected: resposta JSON sem `"error"`.

- [ ] **Step 3: Verificar o schema aplicado** (mesma rota, query de inspeção):

```sql
select table_name from information_schema.tables
 where table_schema='public' and table_name in ('tenants','tenant_secrets');
select count(*) as policies from pg_policies where tablename='tenants';
```
Expected: as 2 tabelas listadas; `policies = 1`.

- [ ] **Step 4: Commit**

```bash
cd /Users/yuribranco/Documents/Magnus/magnus-os-licenca
git add supabase/migrations/0004_tenants.sql
git commit -m "feat(f0): migration 0004 — plano online, tenants, tenant_secrets, auth lookup"
```

---

## Task 2: Migration 0005 — cost_ledger + runs + funções de orçamento

**Files:**
- Create: `LICENCA/supabase/migrations/0005_cost_ledger_runs.sql`

- [ ] **Step 1: Escrever a migration**

```sql
-- 0005_cost_ledger_runs.sql — enforcement de orçamento (spec 2026-06-10 §2.1).
begin;

create table if not exists public.cost_ledger (
  id        bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id),
  service   text not null,                  -- 'agent-sdk' | 'gemini' | ...
  ref       text,                           -- run id / job id
  skill     text,
  model     text,
  in_tok    bigint not null default 0,
  out_tok   bigint not null default 0,
  usd       numeric(10,4) not null default 0,
  ts        timestamptz not null default now()
);
create index if not exists cost_ledger_tenant_ts_idx on public.cost_ledger (tenant_id, ts);
alter table public.cost_ledger enable row level security;
drop policy if exists cost_ledger_self_read on public.cost_ledger;
create policy cost_ledger_self_read on public.cost_ledger for select using (
  tenant_id in (select id from public.tenants where auth_user_id = auth.uid())
);

create table if not exists public.runs (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id),
  skill      text not null,
  status     text not null default 'queued'
               check (status in ('queued','running','done','error','blocked_budget')),
  started_at  timestamptz,
  finished_at timestamptz,
  usage       jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists runs_tenant_idx on public.runs (tenant_id, created_at desc);
alter table public.runs enable row level security;
drop policy if exists runs_self_read on public.runs;
create policy runs_self_read on public.runs for select using (
  tenant_id in (select id from public.tenants where auth_user_id = auth.uid())
);

-- Uso (USD) do mês corrente.
create or replace function public.tenant_usage_month(p_tenant uuid)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce(sum(usd), 0) from public.cost_ledger
   where tenant_id = p_tenant and ts >= date_trunc('month', now());
$$;

-- Orçamento restante: limite do plan − uso do mês; NULL = sem limite configurado.
create or replace function public.tenant_budget_remaining(p_tenant uuid)
returns numeric language sql stable security definer set search_path = '' as $$
  select case
    when (t.plan -> 'limits' ->> 'usd_month') is null then null
    else greatest(((t.plan -> 'limits' ->> 'usd_month')::numeric)
                  - public.tenant_usage_month(p_tenant), 0)
  end
  from public.tenants t where t.id = p_tenant;
$$;
-- authenticated pode LER o próprio orçamento (UI do medidor); insert no ledger é só service_role.

commit;
```

- [ ] **Step 2: Aplicar via Management API** (mesmo comando da Task 1 Step 2, trocando o arquivo para `supabase/migrations/0005_cost_ledger_runs.sql`). Expected: sem `"error"`.

- [ ] **Step 3: Smoke test das funções em produção** (Management API; usa um tenant descartável e LIMPA no final):

```sql
begin;
insert into public.licencas (key, email, plano, transacao)
  values ('MOS-F0TEST-0000-0000','f0-smoke@test.dev','online','F0SMOKE') returning id \gset
-- (na Management API, rodar como bloco único:)
with l as (
  insert into public.licencas (key, email, plano, transacao)
  values ('MOS-F0TEST-0000-0000','f0-smoke@test.dev','online','F0SMOKE') returning id
), t as (
  insert into public.tenants (license_id, email, plan)
  select id, 'f0-smoke@test.dev', '{"key_source":"platform","limits":{"usd_month":10}}'::jsonb from l
  returning id
), c as (
  insert into public.cost_ledger (tenant_id, service, model, usd)
  select id, 'agent-sdk', 'sonnet', 2.5 from t returning tenant_id
)
select public.tenant_usage_month(tenant_id)      as uso,
       public.tenant_budget_remaining(tenant_id) as restante
  from c;
rollback;
```
Expected: `uso = 2.5`, `restante = 7.5` (e o `rollback` garante zero resíduo).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0005_cost_ledger_runs.sql
git commit -m "feat(f0): migration 0005 — cost_ledger, runs, tenant_usage_month, tenant_budget_remaining"
```

---

## Task 3: `_shared/hotmart.ts` — parse ganha event + productId

**Files:**
- Modify: `LICENCA/supabase/functions/_shared/hotmart.ts`
- Test: `LICENCA/supabase/functions/_shared/hotmart.test.ts`

- [ ] **Step 1: Escrever os testes que falham** (append em `hotmart.test.ts`):

```ts
Deno.test("parseHotmart extrai event e productId quando presentes", () => {
  const evt = parseHotmart({
    event: "PURCHASE_APPROVED",
    data: {
      product: { id: 5566778 },
      purchase: { transaction: "HP9", status: "APPROVED" },
      buyer: { email: "a@b.com" },
    },
  });
  assertEquals(evt?.event, "PURCHASE_APPROVED");
  assertEquals(evt?.productId, "5566778");
});

Deno.test("parseHotmart sem product/event → campos undefined, resto intacto", () => {
  const evt = parseHotmart({
    data: { purchase: { transaction: "HP1", status: "APPROVED" }, buyer: { email: "a@b.com" } },
  });
  assertEquals(evt?.transacao, "HP1");
  assertEquals(evt?.event, undefined);
  assertEquals(evt?.productId, undefined);
});
```

- [ ] **Step 2: Rodar pra ver falhar** — `deno test --allow-all supabase/functions/_shared/hotmart.test.ts`. Expected: FAIL (propriedades não existem no tipo).

- [ ] **Step 3: Implementar** — em `hotmart.ts`, estender interface e parse (campos opcionais; `productId` SEMPRE string pra evitar a praga number-vs-string — memory `feedback_tiny_api_type_lies`):

```ts
export interface HotmartEvent {
  status: string;
  email: string;
  transacao: string;
  event?: string;       // ex: PURCHASE_APPROVED, PURCHASE_REFUNDED, SUBSCRIPTION_CANCELLATION
  productId?: string;   // data.product.id, normalizado pra string
}
```
e no `parseHotmart`, antes do `return`:
```ts
  const product = (data.product ?? {}) as Record<string, unknown>;
  const event = typeof p.event === "string" ? p.event : undefined;
  const productId = product.id !== undefined && product.id !== null ? String(product.id) : undefined;
  return { status, email, transacao, event, productId };
```

- [ ] **Step 4: Rodar a suite inteira** — `deno test --allow-all supabase/functions/`. Expected: PASS total (os testes antigos não quebram — campos novos são opcionais).

- [ ] **Step 5: Commit** — `git add supabase/functions/_shared/hotmart.ts supabase/functions/_shared/hotmart.test.ts && git commit -m "feat(f0): parseHotmart expõe event e productId"`

---

## Task 4: `_shared/tenants.ts` — provisioning idempotente (lógica pura + fakes)

**Files:**
- Create: `LICENCA/supabase/functions/_shared/tenants.ts`
- Test: `LICENCA/supabase/functions/_shared/tenants.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { provisionTenant, type TenantDB } from "./tenants.ts";

function fakeTenantDB(opts: { existingAuthId?: string | null; upsertThrows?: boolean } = {}) {
  const calls: Record<string, unknown[]> = { upsertTenant: [], createAuthUser: [], linkAuthUser: [] };
  const db: TenantDB = {
    upsertTenant: (row) => {
      calls.upsertTenant.push(row);
      if (opts.upsertThrows) return Promise.reject(new Error("db down"));
      return Promise.resolve({ tenantId: "t-1", authUserId: opts.existingAuthId ?? null });
    },
    createAuthUser: (email) => {
      calls.createAuthUser.push(email);
      return Promise.resolve("u-new");
    },
    linkAuthUser: (tenantId, authUserId) => {
      calls.linkAuthUser.push([tenantId, authUserId]);
      return Promise.resolve();
    },
  };
  return { db, calls };
}

Deno.test("tenant novo → upsert + cria auth user + linka", async () => {
  const { db, calls } = fakeTenantDB();
  const r = await provisionTenant(db, { licenseId: "L1", email: "a@b.com" });
  assertEquals(r.tenantId, "t-1");
  assertEquals(calls.createAuthUser, ["a@b.com"]);
  assertEquals(calls.linkAuthUser, [["t-1", "u-new"]]);
});

Deno.test("tenant já com auth user → idempotente, não recria nem relinka", async () => {
  const { db, calls } = fakeTenantDB({ existingAuthId: "u-old" });
  const r = await provisionTenant(db, { licenseId: "L1", email: "a@b.com" });
  assertEquals(r.tenantId, "t-1");
  assertEquals(calls.createAuthUser.length, 0);
  assertEquals(calls.linkAuthUser.length, 0);
});

Deno.test("erro do DB propaga (nunca engolir — feedback_supabase_js_silent_errors)", async () => {
  const { db } = fakeTenantDB({ upsertThrows: true });
  await assertRejects(() => provisionTenant(db, { licenseId: "L1", email: "a@b.com" }), Error, "db down");
});
```

- [ ] **Step 2: Rodar pra ver falhar** — `deno test --allow-all supabase/functions/_shared/tenants.test.ts`. Expected: FAIL ("Module not found ./tenants.ts").

- [ ] **Step 3: Implementar `tenants.ts`**

```ts
// Provisioning de tenant do Magnus OS Online (F0).
// Idempotente: upsert por license_id; auth user criado uma vez e linkado.
// plan default: platform key + teto (spec 2026-06-10 §2.1). NUNCA engolir erro de DB.

export const DEFAULT_ONLINE_PLAN = {
  key_source: "platform",
  limits: { usd_month: 20 },
} as const;

export interface TenantDB {
  // Upsert por license_id; retorna o estado atual (authUserId null = ainda não linkado).
  upsertTenant(row: { licenseId: string; email: string; plan: unknown }): Promise<{ tenantId: string; authUserId: string | null }>;
  // Cria (ou recupera por email) o usuário no Supabase Auth; retorna o uuid.
  createAuthUser(email: string): Promise<string>;
  linkAuthUser(tenantId: string, authUserId: string): Promise<void>;
}

export async function provisionTenant(
  db: TenantDB,
  args: { licenseId: string; email: string },
): Promise<{ tenantId: string }> {
  const { tenantId, authUserId } = await db.upsertTenant({
    licenseId: args.licenseId,
    email: args.email,
    plan: DEFAULT_ONLINE_PLAN,
  });
  if (!authUserId) {
    const uid = await db.createAuthUser(args.email);
    await db.linkAuthUser(tenantId, uid);
  }
  return { tenantId };
}
```

- [ ] **Step 4: Rodar e ver passar** — `deno test --allow-all supabase/functions/_shared/tenants.test.ts`. Expected: 3 passed.

- [ ] **Step 5: Commit** — `git add supabase/functions/_shared/tenants.ts supabase/functions/_shared/tenants.test.ts && git commit -m "feat(f0): provisionTenant idempotente (lógica pura)"`

---

## Task 5: hotmart-webhook — ramo "produto online" (provisiona) + suspensão

**Files:**
- Modify: `LICENCA/supabase/functions/hotmart-webhook/index.ts`
- Test: `LICENCA/supabase/functions/hotmart-webhook/handler.test.ts`

**Design:** `handleWebhook` ganha um parâmetro opcional `online?: { productIds: Set<string>; provision(licenseKey: string, email: string): Promise<void>; suspendByTransacao(transacao: string): Promise<void> }`. Compra APPROVED de produto online → `issueKey` com `plano:'online'` + `provision`. Eventos `PURCHASE_REFUNDED`/`PURCHASE_CHARGEBACK` de produto online → `suspendByTransacao`. `SUBSCRIPTION_CANCELLATION` fica explicitamente FORA da F0 (o payload não traz `purchase.transaction`; cancelamento de assinatura mantém acesso até o fim do ciclo pago — tratar na F5 com a coluna `expira_em` + cron). Produtos não-online: comportamento atual intocado.

- [ ] **Step 1: Escrever os testes que falham** (append em `handler.test.ts`):

```ts
const aprovadoOnline = {
  event: "PURCHASE_APPROVED",
  data: {
    product: { id: 5566778 },
    purchase: { transaction: "HON1", status: "APPROVED" },
    buyer: { email: "Tenant@B.com" },
  },
};

function fakeOnline() {
  const provisioned: Array<[string, string]> = [];
  const suspended: string[] = [];
  return {
    online: {
      productIds: new Set(["5566778"]),
      provision: (key: string, email: string) => { provisioned.push([key, email]); return Promise.resolve(); },
      suspendByTransacao: (t: string) => { suspended.push(t); return Promise.resolve(); },
    },
    provisioned, suspended,
  };
}

Deno.test("produto online aprovado → issueKey(plano:'online') + provision(email normalizado)", async () => {
  const { db, calls } = fakeDB({ key: "MOS-AAAA-BBBB-CCCC", idempotent: false });
  const o = fakeOnline();
  const r = await handleWebhook({ "x-hotmart-hottok": "segredo" }, aprovadoOnline, "segredo", db, fixedKey, o.online);
  assertEquals(r.http, 200);
  assertEquals(calls[0].plano, "online");
  assertEquals(o.provisioned, [["MOS-AAAA-BBBB-CCCC", "tenant@b.com"]]);
});

Deno.test("produto NÃO-online aprovado → fluxo atual (tripwire), provision NÃO chamado", async () => {
  const { db, calls } = fakeDB({ key: "MOS-AAAA-BBBB-CCCC", idempotent: false });
  const o = fakeOnline();
  const r = await handleWebhook({ "x-hotmart-hottok": "segredo" }, aprovado, "segredo", db, fixedKey, o.online);
  assertEquals(r.http, 200);
  assertEquals(calls[0].plano, "tripwire");
  assertEquals(o.provisioned.length, 0);
});

Deno.test("refund de produto online → suspendByTransacao, sem issueKey", async () => {
  const { db, calls } = fakeDB({ key: "MOS-X", idempotent: false });
  const o = fakeOnline();
  const refund = {
    event: "PURCHASE_REFUNDED",
    data: { product: { id: 5566778 }, purchase: { transaction: "HON1", status: "REFUNDED" }, buyer: { email: "a@b.com" } },
  };
  const r = await handleWebhook({ "x-hotmart-hottok": "segredo" }, refund, "segredo", db, fixedKey, o.online);
  assertEquals(r.http, 200);
  assertEquals(calls.length, 0);
  assertEquals(o.suspended, ["HON1"]);
});

Deno.test("sem config online (undefined) → comportamento 100% legado", async () => {
  const { db, calls } = fakeDB({ key: "MOS-AAAA-BBBB-CCCC", idempotent: false });
  const r = await handleWebhook({ "x-hotmart-hottok": "segredo" }, aprovadoOnline, "segredo", db, fixedKey);
  assertEquals(r.http, 200);
  assertEquals(calls[0].plano, "tripwire"); // sem productIds configurados, online não existe
});
```

- [ ] **Step 2: Rodar pra ver falhar** — `deno test --allow-all supabase/functions/hotmart-webhook/`. Expected: FAIL (assinatura de `handleWebhook` não aceita 6º arg / plano errado).

- [ ] **Step 3: Implementar no `index.ts`**

```ts
export interface OnlineOps {
  productIds: Set<string>;
  provision(licenseKey: string, email: string): Promise<void>;
  suspendByTransacao(transacao: string): Promise<void>;
}

export async function handleWebhook(
  headers: Record<string, string>,
  body: Record<string, unknown>,
  hottok: string,
  db: WebhookDB,
  keygen: () => string = gerarKey,
  online?: OnlineOps,
): Promise<{ http: number; json: unknown }> {
  if (!verifyHottok(headers, body, hottok)) return { http: 401, json: { error: "hottok inválido" } };
  const evt = parseHotmart(body);
  if (!evt) return { http: 200, json: { ignored: true } };
  const isOnline = !!online && !!evt.productId && online.productIds.has(evt.productId);

  if (isOnline && (evt.event === "PURCHASE_REFUNDED" || evt.event === "PURCHASE_CHARGEBACK")) {
    await online!.suspendByTransacao(evt.transacao);
    return { http: 200, json: { suspended: true } };
  }
  if (evt.status !== "APPROVED") return { http: 200, json: { ignored: true } };

  const email = evt.email.trim().toLowerCase();
  const plano = isOnline ? "online" : "tripwire";
  const { key, idempotent } = await db.issueKey({
    key: keygen(), email, transacao: evt.transacao, origem: "hotmart", status: "granted", plano,
  });
  if (isOnline) await online!.provision(key, email);
  return { http: 200, json: idempotent ? { key, idempotent: true } : { key } };
}
```

- [ ] **Step 4: Rodar a suite inteira** — `deno test --allow-all supabase/functions/`. Expected: PASS total (testes legados verdes — `online` é opcional).

- [ ] **Step 5: Commit** — `git add supabase/functions/hotmart-webhook/ && git commit -m "feat(f0): webhook provisiona tenant pra produto online + suspende em refund/chargeback"`

---

## Task 6: Wiring real (realDB online) + deploy + smoke em produção

**Files:**
- Modify: `LICENCA/supabase/functions/hotmart-webhook/index.ts` (bloco `Deno.serve` + factory real)
- Modify: `LICENCA/.env.op` (nova ref) · 1Password item `magnus-os-licenca-secrets` (campo novo)

- [ ] **Step 1: Implementar a factory real `realOnline()`** no `index.ts` (depois de `realDB()`):

```ts
import { provisionTenant, DEFAULT_ONLINE_PLAN, type TenantDB } from "../_shared/tenants.ts";

function realOnline(): OnlineOps | undefined {
  const ids = (Deno.env.get("MAGNUS_ONLINE_PRODUCT_IDS") ?? "").split(",").map(s => s.trim()).filter(Boolean);
  if (ids.length === 0) return undefined;            // sem config → comportamento legado
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const tdb: TenantDB = {
    async upsertTenant(row) {
      const { data: lic, error: e0 } = await sb.from("licencas").select("id").eq("key", row.licenseKeyOrId ?? "").maybeSingle();
      // (ver Step 2: a chave chega via provision(key, email) → lookup id aqui)
      throw new Error("substituído no Step 2");
    },
    createAuthUser: async () => { throw new Error("substituído no Step 2"); },
    linkAuthUser: async () => { throw new Error("substituído no Step 2"); },
  };
  /* ... */
}
```

**Versão final completa do bloco real** (escrever direto assim; o esqueleto acima é só pra mostrar a ordem):

```ts
function realOnline(): OnlineOps | undefined {
  const ids = (Deno.env.get("MAGNUS_ONLINE_PRODUCT_IDS") ?? "").split(",").map(s => s.trim()).filter(Boolean);
  if (ids.length === 0) return undefined;
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  async function licenseIdByKey(key: string): Promise<string> {
    const { data, error } = await sb.from("licencas").select("id").eq("key", key).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error(`licença não encontrada pra key ${key.slice(0, 8)}…`);
    return data.id;
  }

  const tdb: TenantDB = {
    async upsertTenant(row) {
      const { data, error } = await sb.from("tenants")
        .upsert({ license_id: row.licenseId, email: row.email, plan: row.plan, status: "active" },
                { onConflict: "license_id" })
        .select("id, auth_user_id").single();
      if (error) throw error;
      return { tenantId: data.id, authUserId: data.auth_user_id };
    },
    async createAuthUser(email) {
      const { data: existing, error: e1 } = await sb.rpc("auth_user_id_by_email", { p_email: email });
      if (e1) throw e1;
      if (existing) return existing as string;
      const { data, error } = await sb.auth.admin.createUser({ email, email_confirm: true });
      if (error) throw error;
      return data.user.id;
    },
    async linkAuthUser(tenantId, authUserId) {
      const { error } = await sb.from("tenants")
        .update({ auth_user_id: authUserId, updated_at: new Date().toISOString() })
        .eq("id", tenantId);
      if (error) throw error;
    },
  };

  return {
    productIds: new Set(ids),
    async provision(licenseKey, email) {
      const licenseId = await licenseIdByKey(licenseKey);
      await provisionTenant(tdb, { licenseId, email });
    },
    async suspendByTransacao(transacao) {
      const { data: lic, error: e1 } = await sb.from("licencas")
        .update({ status: "revoked" }).eq("transacao", transacao).select("id").maybeSingle();
      if (e1) throw e1;
      if (!lic) return; // refund de transação desconhecida: no-op
      const { error: e2 } = await sb.from("tenants")
        .update({ status: "suspended", updated_at: new Date().toISOString() })
        .eq("license_id", lic.id);
      if (e2) throw e2;
    },
  };
}
```
E no `Deno.serve`, trocar a chamada final por:
```ts
  const { http, json } = await handleWebhook(headers, body, Deno.env.get("HOTMART_HOTTOK") ?? "", realDB(), gerarKey, realOnline());
```

- [ ] **Step 2: Rodar a suite** — `deno test --allow-all supabase/functions/`. Expected: PASS (factories reais não são exercitadas pelos testes — padrão do repo).

- [ ] **Step 3: Secrets** — adicionar `MAGNUS_ONLINE_PRODUCT_IDS` ao item 1Password `magnus-os-licenca-secrets` (valor da Task 0 Step 1) + linha no `.env.op`: `MAGNUS_ONLINE_PRODUCT_IDS="op://YuriOS/magnus-os-licenca-secrets/MAGNUS_ONLINE_PRODUCT_IDS"`. Setar no Supabase:

```bash
set -a; . ./.env.bootstrap; set +a
op run --env-file=.env.op -- bash -c \
  'supabase secrets set MAGNUS_ONLINE_PRODUCT_IDS="$MAGNUS_ONLINE_PRODUCT_IDS" --project-ref vbmvzmibupzpjwyrfmjs'
```

- [ ] **Step 4: Deploy da function** — `op run --env-file=.env.op -- supabase functions deploy hotmart-webhook --project-ref vbmvzmibupzpjwyrfmjs --use-api`. Expected: deployed.

- [ ] **Step 5: Smoke test em produção** — simular compra do produto online (transação sintética `F0SMOKE2`):

```bash
op run --env-file=.env.op -- bash -c 'curl -sS -X POST \
  "https://vbmvzmibupzpjwyrfmjs.supabase.co/functions/v1/hotmart-webhook?hottok=$HOTMART_HOTTOK" \
  -H "Content-Type: application/json" -d "{
    \"event\": \"PURCHASE_APPROVED\",
    \"data\": { \"product\": { \"id\": <PRODUCT_ID> },
      \"purchase\": { \"transaction\": \"F0SMOKE2\", \"status\": \"APPROVED\" },
      \"buyer\": { \"email\": \"f0-smoke2@test.dev\" } } }"'
```
Verificar (Management API): `select t.status, t.auth_user_id is not null as linked, l.plano from tenants t join licencas l on l.id = t.license_id where l.transacao = 'F0SMOKE2';` Expected: `active | true | online`. Re-POSTar o mesmo payload → `idempotent: true`, e a contagem de tenants não muda. Depois o refund: mesmo curl com `"event": "PURCHASE_REFUNDED"`, `"status": "REFUNDED"` → tenant `suspended`, licença `revoked`.

- [ ] **Step 6: Limpar dados de smoke** (Management API): `delete from tenants where email = 'f0-smoke2@test.dev'; delete from licencas where transacao in ('F0SMOKE2'); ` + deletar o auth user `f0-smoke2@test.dev` no dashboard (Authentication → Users) ou via `sb.auth.admin.deleteUser`.

- [ ] **Step 7: Commit + push** — `git add -A && git commit -m "feat(f0): wiring real do provisioning online no webhook" && git push`.

---

## Task 7: Repo `magnus-os-online` — esqueleto de infra + health server

**Files:**
- Create: `ONLINE/package.json`, `ONLINE/server.mjs`, `ONLINE/ecosystem.config.cjs`, `ONLINE/infra/bootstrap.sh`, `ONLINE/infra/nginx-magnusos.conf`, `ONLINE/.github/workflows/deploy.yml`, `ONLINE/.gitignore`, `ONLINE/README.md`

- [ ] **Step 1: Criar o repo**

```bash
mkdir -p /Users/yuribranco/Documents/Magnus/magnus-os-online/infra
cd /Users/yuribranco/Documents/Magnus/magnus-os-online && git init -b main
printf 'node_modules/\n.env*\n!.env.op\n!.env.example\n' > .gitignore
```

- [ ] **Step 2: Health server** (`server.mjs` — substituído pelo painel hosted na F1; existe pra provar substrato+CI/CD):

```js
import { createServer } from "node:http";
const PORT = process.env.PORT ?? 3100;
const VERSION = process.env.APP_VERSION ?? "f0";
createServer((req, res) => {
  if (req.url === "/api/health") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ ok: true, version: VERSION, ts: new Date().toISOString() }));
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end("<h1>Magnus OS Online</h1><p>em construção — F0</p>");
}).listen(PORT, "127.0.0.1", () => console.log(`health server :${PORT}`));
```

`package.json`:
```json
{ "name": "magnus-os-online", "private": true, "type": "module",
  "scripts": { "start": "node server.mjs" } }
```

`ecosystem.config.cjs`:
```js
module.exports = { apps: [{ name: "magnusos-online", script: "server.mjs", env: { PORT: 3100 } }] };
```

- [ ] **Step 3: `infra/bootstrap.sh`** (idempotente; rodar como root no VPS novo, UMA vez):

```bash
#!/usr/bin/env bash
# Bootstrap do VPS do Magnus OS Online (Ubuntu 24.04). Idempotente.
set -euo pipefail
apt-get update -y
apt-get install -y nginx certbot python3-certbot-nginx redis-server ufw rsync
# Redis só local (fila de runs da F1)
sed -i 's/^# *bind .*/bind 127.0.0.1/; s/^bind .*/bind 127.0.0.1/' /etc/redis/redis.conf
systemctl enable --now redis-server
# Node 22 + pm2
if ! command -v node >/dev/null || [[ "$(node -v)" != v22* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs
fi
npm i -g pm2
# Usuário de deploy (sem sudo)
id -u deploy &>/dev/null || useradd -m -s /bin/bash deploy
mkdir -p /home/deploy/.ssh /var/www/magnusos-online
chown -R deploy:deploy /var/www/magnusos-online /home/deploy/.ssh
# Firewall
ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw --force enable
echo "bootstrap OK — copie a chave pública do deploy pra /home/deploy/.ssh/authorized_keys"
```

- [ ] **Step 4: `infra/nginx-magnusos.conf`**

```nginx
server {
  server_name magnusos.yuribranco.com.br;
  listen 80;
  location / {
    proxy_pass http://127.0.0.1:3100;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    # SSE da F1 (runs): sem buffering
    proxy_buffering off;
    proxy_read_timeout 3600s;
  }
}
```

- [ ] **Step 5: `.github/workflows/deploy.yml`** (espelho do padrão Portal Magnus: rsync + pm2):

```yaml
name: deploy
on: { push: { branches: [main] } }
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: rsync to VPS
        env: { KEY: "${{ secrets.DEPLOY_SSH_KEY }}", HOST: "${{ secrets.VPS_HOST }}" }
        run: |
          install -m 600 /dev/null key && printf '%s\n' "$KEY" > key
          rsync -az --delete -e "ssh -i key -o StrictHostKeyChecking=accept-new" \
            --exclude .git --exclude node_modules ./ deploy@"$HOST":/var/www/magnusos-online/
          ssh -i key -o StrictHostKeyChecking=accept-new deploy@"$HOST" \
            'cd /var/www/magnusos-online && pm2 startOrReload ecosystem.config.cjs && pm2 save'
```

- [ ] **Step 6: README.md** com 5 linhas: o que é (substrato F0, recebe o painel na F1), como deployar (push na main), onde estão os secrets (1Password `magnus-os-online-secrets`), referência à spec.

- [ ] **Step 7: Commit + criar repo GitHub privado + push**

```bash
git add -A && git commit -m "feat(f0): substrato de deploy — health server, bootstrap, nginx, CI/CD"
gh repo create yuribranco/magnus-os-online --private --source=. --push
```

---

## Task 8: Provisionar o VPS + TLS + app no ar

**Pré-requisito:** Task 0 Steps 2-3 (VPS comprado, DNS apontado).

- [ ] **Step 1: Rodar o bootstrap** (senha root do 1Password; primeira e única vez como root):

```bash
scp /Users/yuribranco/Documents/Magnus/magnus-os-online/infra/bootstrap.sh root@<VPS_IP>:/root/
ssh root@<VPS_IP> 'bash /root/bootstrap.sh'
```
Expected: termina com "bootstrap OK".

- [ ] **Step 2: Chave de deploy** — gerar par dedicado e instalar:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/magnusos_deploy -N "" -C "deploy@magnusos"
ssh root@<VPS_IP> 'cat >> /home/deploy/.ssh/authorized_keys && chown deploy:deploy /home/deploy/.ssh/authorized_keys && chmod 600 /home/deploy/.ssh/authorized_keys' < ~/.ssh/magnusos_deploy.pub
```
Guardar a chave privada no 1Password (`magnus-os-online-secrets`, campo `DEPLOY_SSH_KEY`) e nos GitHub secrets do repo: `gh secret set DEPLOY_SSH_KEY < ~/.ssh/magnusos_deploy && gh secret set VPS_HOST -b "<VPS_IP>"`.

- [ ] **Step 3: nginx + TLS**

```bash
scp infra/nginx-magnusos.conf root@<VPS_IP>:/etc/nginx/sites-available/magnusos
ssh root@<VPS_IP> 'ln -sf /etc/nginx/sites-available/magnusos /etc/nginx/sites-enabled/magnusos && nginx -t && systemctl reload nginx && certbot --nginx -d magnusos.yuribranco.com.br --non-interactive --agree-tos -m yuribranco@gmail.com'
```
Expected: certbot emite e configura 443.

- [ ] **Step 4: Primeiro deploy via CI** — `git commit --allow-empty -m "chore: trigger deploy" && git push`, acompanhar `gh run watch`. Expected: workflow verde.

- [ ] **Step 5: Verificar de fora**

```bash
curl -s https://magnusos.yuribranco.com.br/api/health
```
Expected: `{"ok":true,"version":"f0",...}`. E `ssh root@<VPS_IP> 'redis-cli ping'` → `PONG`.

- [ ] **Step 6: pm2 persistente** — `ssh root@<VPS_IP> 'su - deploy -c "pm2 save" && pm2 startup systemd -u deploy --hp /home/deploy'` (rodar o comando que o pm2 imprimir). Expected: `systemctl status pm2-deploy` ativo. ⚠️ NUNCA `pm2 restart all` em VPS compartilhado — este é dedicado, mas manter o hábito.

---

## Task 9: Login magic-link fim-a-fim (smoke de Auth)

**Pré-requisito:** Task 0 Step 4 (redirect URL configurada) + Task 6 (provisioning live).

- [ ] **Step 1: Criar tenant de dogfood real** — repetir o curl da Task 6 Step 5 com `transaction: "F0DOGFOOD"` e o SEU email (`yuribranco@gmail.com`). Expected: tenant `active` + auth user criado. (Este NÃO é limpo — vira o tenant de dev permanente.)
- [ ] **Step 2: Disparar magic link** via API (anon key do projeto):

```bash
op run --env-file=.env.op -- bash -c 'curl -sS -X POST \
  "https://vbmvzmibupzpjwyrfmjs.supabase.co/auth/v1/magiclink" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
  -d "{\"email\": \"yuribranco@gmail.com\", \"options\": {\"email_redirect_to\": \"https://magnusos.yuribranco.com.br\"}}"'
```
(Se `SUPABASE_ANON_KEY` não estiver no `.env.op`, adicionar como literal — anon key é pública.)
- [ ] **Step 3 (YURI): Clicar no link do email** → deve aterrissar em `https://magnusos.yuribranco.com.br` (página "em construção" com o token na URL — o consumo do token é F1; aqui só se prova que o ciclo email→redirect funciona). Expected: sem erro de redirect proibido.

---

## Task 10: Documentação + gates de fechamento

**Files:**
- Modify: `LICENCA/DEPLOY.md`
- Modify: `ONLINE/README.md` (se algo mudou nas tasks 8-9)

- [ ] **Step 1: Atualizar `DEPLOY.md`** — nova seção "## Magnus OS Online (F0)": tabelas novas (tenants/tenant_secrets/cost_ledger/runs + funções), secret `MAGNUS_ONLINE_PRODUCT_IDS`, ramo online do webhook (provision/suspend; cancelamento de assinatura = F5), VPS novo + domínio, e atualizar a nota antiga "se um dia houver assinatura recorrente" → "existe (plano 'online'); `expira_em` criado, cron de expiração = F5".
- [ ] **Step 2: Rodar a suite completa final** — `deno test --allow-all supabase/functions/`. Expected: PASS total.
- [ ] **Step 3: Commit + push os dois repos.**
- [ ] **Step 4: Gate `/codex review`** no diff do `magnus-os-licenca` (é gate de dinheiro/credencial — mesma régua da Fase 1 da licença, que pegou 2 P1). Corrigir o que sair antes de declarar F0 done.
- [ ] **Step 5: Fechar o ciclo** — wiki magnus-os (session log), GTD (marcar F0, criar próxima ação F1), memory (RESUME atualizado).

---

## Self-review (feito na escrita)

- **Cobertura da spec (F0):** auth magic-link (T0.4+T9) · provisioning webhook (T3-T6) · RLS multi-tenant (T1-T2) · cost_ledger+plan platform+teto (T2, enforcement consumido na F1 via `tenant_budget_remaining`) · substrato deploy (T7-T8). Storage bucket `tenant-workspaces` fica pra F1 (junto do executor que o usa — YAGNI aqui).
- **Fora de escopo explícito:** `SUBSCRIPTION_CANCELLATION`/cron de `expira_em` (F5, decisão documentada na Task 5); Meta App Review corre em paralelo via GTD (não é tarefa de código).
- **Consistência de tipos:** `TenantDB`/`OnlineOps`/`provisionTenant` batem entre Tasks 4, 5 e 6; `productId` é string em todo lugar.
- **Riscos conhecidos pro `/plan-eng-review`:** (a) reuso do Supabase do Portal Magnus — config de Auth compartilhada (redirect list) e blast radius; (b) `auth_user_id_by_email` security definer lendo `auth.users`; (c) refund→`revoked` na licença também mata o kill-switch de um eventual plugin local do mesmo email (aceitável: é o mesmo produto?); validar.
