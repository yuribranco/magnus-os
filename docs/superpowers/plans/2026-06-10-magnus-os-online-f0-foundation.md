# Magnus OS Online — F0 Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Modo de execução DECIDIDO (Yuri, 2026-06-10): subagent-driven.** Bloqueado pela Task 0 (manual). Quando ela estiver feita, dispatch de subagent fresco por task com review em duas etapas.

**Goal:** Fundação multi-tenant do Magnus OS Online — assinatura na Hotmart provisiona tenant + usuário Auth num **projeto Supabase dedicado**, com identidade por **assinante** (não por transação), ledger de eventos de webhook, RLS, `cost_ledger` com teto por plano, e substrato de deploy (domínio + nginx + TLS + Redis + CI/CD) com health check no ar.

**Architecture:** Projeto Supabase **dedicado** (decisão 1A: o Portal Magnus usa o Auth dele com gate "está logado" — compartilhar daria o curso aos tenants do SaaS). Webhook Hotmart **próprio** do produto online (2º webhook da conta, só este produto), com o parser provado do `magnus-os-licenca` portado — **o repo/projeto da licença local NÃO é tocado**. Identidade do tenant = `subscriber_code` da assinatura Hotmart (decisão D9: rebill mensal traz transação NOVA — idempotência por transação duplicaria tenants); cada evento bruto é gravado em `webhook_events` com dedup por `(event, transacao)` — re-entregas não reprocessam, retries de evento NÃO-processado sim (auto-cura). Substrato de deploy no repo `magnus-os-online` (recebe o painel na F1); na F0 health server prova o pipeline.

**Tech Stack:** Supabase dedicado (Postgres + RLS + Auth magic-link + Edge Functions Deno), deno test (handler+deps com fakes), Management API pra migrations via `scripts/db-apply.sh` com guard de ref, Node 22 + pm2 + nginx + certbot + Redis no VPS, GitHub Actions (rsync), secrets via 1Password `op://`.

**Decisões do `/plan-eng-review` + outside voice (codex) aplicadas:** 1A Supabase dedicado + webhook próprio · 2A `DEFAULT_ONLINE_PLAN` (TS) fonte única do teto, coluna `plan` not null sem default · 3A reconciliação no runbook · 4A/5A higiene · 6A cobertura completa · **D9** identidade por subscriber + `webhook_events` + transição de estado · **D10** mantém 1 user = 1 tenant (blueprint; members é migração aditiva futura) · **D11** revoke nas fns de orçamento, Redirect URLs, cleanup via API, rsync excludes, pm2 startup no bootstrap, db-apply.sh com guard.

**Riscos aceitos na F0 (decisão D11 — escolha, não esquecimento):**
- Teto de orçamento por **mês-calendário** (proteção interna de margem, não promessa contratual por ciclo de cobrança).
- **Email do comprador Hotmart = email de login.** Troca de email do cliente = fluxo de suporte manual até existir UI de conta.
- **`?hottok=` estático em query** pode aparecer em logs de função — mesmo padrão aceito do produto local; rotação documentada.
- **Sem rate-limit no webhook** na F0 (dedup por evento + hottok mitigam; hardening na F1/F2).
- **Enforcement atômico de orçamento (reserva transacional) é REQUISITO DA F1** — o executor de runs deve usar RPC transacional sobre `cost_ledger`, não checagem read-then-write. As funções da F0 são leitura/agregação.
- `SUBSCRIPTION_CANCELLATION` → F5 (sem `purchase.transaction` no payload; acesso até o fim do ciclo pago; F5 = expiração + cron). O `subscription_id` JÁ é persistido desde a F0 pra isso.

**Convenções:**
- `ONLINE/` = `/Users/yuribranco/Documents/Magnus/magnus-os-online/` (repo novo, Task 1)
- `<REF>` = ref do projeto Supabase novo · `<VPS_IP>` = IP do VPS novo (Task 0)
- Testes: `cd ONLINE && deno test --allow-all supabase/functions/`
- SQL em produção: `scripts/db-apply.sh <arquivo.sql>` (Task 1) dentro do `op run`.

---

## Task 0: Pré-requisitos manuais (⚠️ YURI)

**Files:** nenhum. Registrar tudo no item `magnus-os-online-secrets` do 1Password (vault YuriOS).

- [ ] **Step 1 (YURI): Produto "Magnus OS Online" na Hotmart** — assinatura recorrente mensal (R$297 provisório). Anotar o **product id** (payload `data.product.id`). ⚠️ O webhook é registrado SÓ na Task 7.
- [ ] **Step 2 (YURI): Projeto Supabase novo** `magnus-os-online` (free tier serve na F0). Anotar **ref**, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` → 1Password.
- [ ] **Step 3 (YURI): VPS dedicado** — Hostinger KVM2/KVM4, Ubuntu 24.04. NÃO reusar o VPS 187. IP + senha root → 1Password.
- [ ] **Step 4 (YURI): DNS** — `A` `magnusos.yuribranco.com.br` → IP do VPS (Cloudflare, proxy OFF até o certbot emitir).
- [ ] **Step 5 (YURI): Auth do projeto novo** — dashboard `<REF>` → Authentication → URL Configuration: **Site URL** `https://magnusos.yuribranco.com.br` **E Redirect URLs** `https://magnusos.yuribranco.com.br/**` (decisão D11 — só Site URL não basta pro magic link). Email provider on.
- [ ] **Step 6 (YURI): 1Password** — item `magnus-os-online-secrets`: `MAGNUS_ONLINE_PRODUCT_IDS`, `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_ANON_KEY`, `HOTMART_HOTTOK_ONLINE` (`openssl rand -hex 20` — NÃO reusar o do produto local), `VPS_HOST`, `VPS_ROOT_PASSWORD`.

---

## Task 1: Repo `magnus-os-online` — bootstrap + script de migrations

**Files:**
- Create: `ONLINE/.gitignore`, `ONLINE/README.md`, `ONLINE/.env.op`, `ONLINE/.env.bootstrap` (gitignored), `ONLINE/.envrc`, `ONLINE/scripts/db-apply.sh`, `ONLINE/supabase/config.toml` (via CLI)

- [ ] **Step 1: Criar o repo + scaffold**

```bash
mkdir -p /Users/yuribranco/Documents/Magnus/magnus-os-online/scripts
cd /Users/yuribranco/Documents/Magnus/magnus-os-online && git init -b main
printf 'node_modules/\n.env*\n!.env.op\n.envrc\n*.pre-op.bak\nsupabase/.temp/\n' > .gitignore
supabase init
```

- [ ] **Step 2: Padrão op:// (zero-plaintext)**

```bash
cat > .env.op <<'EOF'
MAGNUS_ONLINE_SUPABASE_REF=<REF>
SUPABASE_URL="op://YuriOS/magnus-os-online-secrets/SUPABASE_URL"
SUPABASE_SERVICE_ROLE_KEY="op://YuriOS/magnus-os-online-secrets/SUPABASE_SERVICE_ROLE_KEY"
SUPABASE_ANON_KEY="op://YuriOS/magnus-os-online-secrets/SUPABASE_ANON_KEY"
SUPABASE_ACCESS_TOKEN="op://YuriOS/magnus-os-licenca-secrets/SUPABASE_ACCESS_TOKEN"
HOTMART_HOTTOK_ONLINE="op://YuriOS/magnus-os-online-secrets/HOTMART_HOTTOK_ONLINE"
MAGNUS_ONLINE_PRODUCT_IDS="op://YuriOS/magnus-os-online-secrets/MAGNUS_ONLINE_PRODUCT_IDS"
EOF
```
(`MAGNUS_ONLINE_SUPABASE_REF` é literal — ref não é secret.) Copiar `.env.bootstrap`/`.envrc` do padrão `magnus-os-licenca` (`chmod 600 .env.bootstrap`). Verificar: `set -a; . ./.env.bootstrap; set +a; op run --env-file=.env.op -- printenv SUPABASE_URL` resolve.

- [ ] **Step 3: `scripts/db-apply.sh`** (decisão D11 — guard contra aplicar no projeto errado):

```bash
#!/usr/bin/env bash
# Aplica um arquivo SQL no projeto Supabase do Magnus OS Online via Management API.
# Guard: MAGNUS_ONLINE_SUPABASE_REF é obrigatório e ecoado antes de aplicar.
# Uso (dentro do op run): scripts/db-apply.sh supabase/migrations/0001_tenants.sql
set -euo pipefail
REF="${MAGNUS_ONLINE_SUPABASE_REF:?defina MAGNUS_ONLINE_SUPABASE_REF (.env.op)}"
TOKEN="${SUPABASE_ACCESS_TOKEN:?rode dentro de op run --env-file=.env.op}"
FILE="${1:?uso: db-apply.sh <arquivo.sql>}"
[ -f "$FILE" ] || { echo "arquivo não existe: $FILE" >&2; exit 1; }
echo "→ aplicando $FILE no projeto $REF (Magnus OS Online)"
python3 - "$FILE" <<'PY' > /tmp/db-apply-body.json
import json, sys
print(json.dumps({"query": open(sys.argv[1]).read()}))
PY
curl -sS -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  --data-binary @/tmp/db-apply-body.json
rm -f /tmp/db-apply-body.json
echo
```
`chmod +x scripts/db-apply.sh`.

- [ ] **Step 4: README.md** — o que é (Supabase dedicado + substrato; painel hosted na F1), por que dedicado (decisão 1A), como deployar (push na main), como aplicar SQL (`db-apply.sh`), secrets (1Password), spec de referência.

- [ ] **Step 5: Commit + repo GitHub privado**

```bash
git add -A && git commit -m "feat(f0): bootstrap — scaffold supabase, op://, db-apply.sh com guard de ref"
gh repo create yuribranco/magnus-os-online --private --source=. --push
```

---

## Task 2: Migration 0001 — tenants (por assinante) + webhook_events + tenant_secrets

**Files:**
- Create: `ONLINE/supabase/migrations/0001_tenants.sql`

- [ ] **Step 1: Escrever a migration**

```sql
-- 0001_tenants.sql — F0 Magnus OS Online (projeto DEDICADO).
-- Identidade = assinante Hotmart (subscriber_code): rebill mensal traz transação NOVA,
-- então idempotência de tenant NÃO pode ser por transação (decisão D9 do eng-review).
-- Decisão 2A: plan NOT NULL SEM default — o provisioning (TS) é a fonte única.
begin;

create table if not exists public.tenants (
  id              uuid primary key default gen_random_uuid(),
  subscriber_code text not null unique,   -- assinante Hotmart; fallback 'email:<email>'
  email           text not null,
  auth_user_id    uuid unique,
  status          text not null default 'active'
                    check (status in ('active','suspended','canceled')),
  plan            jsonb not null,          -- SEM default (2A): TS escreve sempre
  subscription_id text,                    -- F5 usa pra expiração de assinatura
  last_transacao  text,                    -- última cobrança vista (histórico)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists tenants_email_idx on public.tenants (email);
create index if not exists tenants_last_transacao_idx on public.tenants (last_transacao);
alter table public.tenants enable row level security;
drop policy if exists tenants_self_read on public.tenants;
create policy tenants_self_read on public.tenants
  for select using (auth.uid() = auth_user_id);

-- Ledger de eventos do webhook (decisão D9/codex#2): todo evento bruto é gravado.
-- Dedup por (event, transacao): re-entrega de evento JÁ PROCESSADO não reprocessa;
-- retry de evento NÃO-processado (processed_at null) reprocessa (auto-cura).
-- RLS on SEM policy = só service_role.
create table if not exists public.webhook_events (
  id              bigint generated always as identity primary key,
  event           text not null,
  transacao       text not null,
  product_id      text,
  subscriber_code text,
  payload         jsonb not null,
  received_at     timestamptz not null default now(),
  processed_at    timestamptz,
  result          text,
  unique (event, transacao)
);
alter table public.webhook_events enable row level security;

-- Secrets por tenant (cifrados na app-layer; consumidos a partir da F2).
-- RLS on SEM policy = só service_role. NUNCA expor ao authenticated.
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

-- Lookup de auth user por email (createUser não é idempotente). Só service_role.
create or replace function public.auth_user_id_by_email(p_email text)
returns uuid language sql stable security definer set search_path = '' as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;
revoke execute on function public.auth_user_id_by_email(text) from anon, authenticated;

commit;
```

- [ ] **Step 2: Aplicar** — `set -a; . ./.env.bootstrap; set +a; op run --env-file=.env.op -- scripts/db-apply.sh supabase/migrations/0001_tenants.sql`. Expected: JSON sem `"error"`.

- [ ] **Step 3: Verificar** (via `db-apply.sh` com um arquivo temporário ou inline):

```sql
select table_name from information_schema.tables
 where table_schema='public' and table_name in ('tenants','webhook_events','tenant_secrets');
select count(*) as policies from pg_policies where tablename='tenants';
```
Expected: 3 tabelas; `policies = 1`.

- [ ] **Step 4: Commit** — `git add supabase/migrations/0001_tenants.sql && git commit -m "feat(f0): migration 0001 — tenants por assinante, webhook_events, tenant_secrets"`

---

## Task 3: Migration 0002 — cost_ledger + runs + funções de orçamento (service-only)

**Files:**
- Create: `ONLINE/supabase/migrations/0002_cost_ledger_runs.sql`

- [ ] **Step 1: Escrever a migration**

```sql
-- 0002_cost_ledger_runs.sql — enforcement de orçamento (spec 2026-06-10 §2.1).
-- Decisão D11/codex#11: funções de agregação são SERVICE-ROLE ONLY (revoke de
-- anon/authenticated) — aceitam tenant_id arbitrário, então não podem ser públicas.
-- O medidor da UI (F1) lê via backend. Enforcement ATÔMICO (reserva) é requisito da F1.
begin;

create table if not exists public.cost_ledger (
  id        bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id),
  service   text not null,
  ref       text,
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

create or replace function public.tenant_usage_month(p_tenant uuid)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce(sum(usd), 0) from public.cost_ledger
   where tenant_id = p_tenant and ts >= date_trunc('month', now());
$$;
revoke execute on function public.tenant_usage_month(uuid) from anon, authenticated;

create or replace function public.tenant_budget_remaining(p_tenant uuid)
returns numeric language sql stable security definer set search_path = '' as $$
  select case
    when (t.plan -> 'limits' ->> 'usd_month') is null then null
    else greatest(((t.plan -> 'limits' ->> 'usd_month')::numeric)
                  - public.tenant_usage_month(p_tenant), 0)
  end
  from public.tenants t where t.id = p_tenant;
$$;
revoke execute on function public.tenant_budget_remaining(uuid) from anon, authenticated;

commit;
```

- [ ] **Step 2: Aplicar** — `op run --env-file=.env.op -- scripts/db-apply.sh supabase/migrations/0002_cost_ledger_runs.sql`. Expected: sem `"error"`.

- [ ] **Step 3: Smoke das funções** (bloco único com rollback — zero resíduo):

```sql
begin;
with t as (
  insert into public.tenants (subscriber_code, email, plan)
  values ('SUB-F0SMOKE', 'f0-smoke@test.dev', '{"key_source":"platform","limits":{"usd_month":10}}'::jsonb)
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
Expected: `uso = 2.5`, `restante = 7.5`.

- [ ] **Step 4: Commit** — `git add supabase/migrations/0002_cost_ledger_runs.sql && git commit -m "feat(f0): migration 0002 — cost_ledger, runs, fns de orçamento service-only"`

---

## Task 4: `_shared/hotmart.ts` — parser portado + event/productId/subscriberCode

**Files:**
- Create: `ONLINE/supabase/functions/_shared/hotmart.ts`
- Test: `ONLINE/supabase/functions/_shared/hotmart.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

```ts
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseHotmart, verifyHottok } from "./hotmart.ts";

Deno.test("parseHotmart extrai status/email/transacao/event/productId/subscriberCode", () => {
  const evt = parseHotmart({
    event: "PURCHASE_APPROVED",
    data: {
      product: { id: 5566778 },
      purchase: { transaction: "HP9", status: "APPROVED" },
      buyer: { email: "a@b.com" },
      subscription: { subscriber: { code: "SUB123" }, plan: { name: "mensal" } },
    },
  });
  assertEquals(evt?.status, "APPROVED");
  assertEquals(evt?.email, "a@b.com");
  assertEquals(evt?.transacao, "HP9");
  assertEquals(evt?.event, "PURCHASE_APPROVED");
  assertEquals(evt?.productId, "5566778");
  assertEquals(evt?.subscriberCode, "SUB123");
});

Deno.test("parseHotmart sem product/event/subscription → opcionais undefined, resto intacto", () => {
  const evt = parseHotmart({
    data: { purchase: { transaction: "HP1", status: "APPROVED" }, buyer: { email: "a@b.com" } },
  });
  assertEquals(evt?.transacao, "HP1");
  assertEquals(evt?.event, undefined);
  assertEquals(evt?.productId, undefined);
  assertEquals(evt?.subscriberCode, undefined);
});

Deno.test("parseHotmart payload inválido → null", () => {
  assertEquals(parseHotmart({}), null);
  assertEquals(parseHotmart(null), null);
});

Deno.test("verifyHottok: correto passa, errado falha, expected vazio falha", () => {
  assert(verifyHottok({ "x-hotmart-hottok": "s" }, {}, "s"));
  assert(!verifyHottok({ "x-hotmart-hottok": "x" }, {}, "s"));
  assert(!verifyHottok({ "x-hotmart-hottok": "s" }, {}, ""));
});
```

- [ ] **Step 2: Rodar pra ver falhar** — `deno test --allow-all supabase/functions/_shared/hotmart.test.ts`. Expected: FAIL ("Module not found").

- [ ] **Step 3: Implementar `hotmart.ts`** (port do parser provado + extensões; `productId` e `subscriberCode` SEMPRE string):

```ts
export interface HotmartEvent {
  status: string;
  email: string;
  transacao: string;
  event?: string;           // PURCHASE_APPROVED, PURCHASE_REFUNDED, ...
  productId?: string;       // data.product.id normalizado pra string
  subscriberCode?: string;  // data.subscription.subscriber.code (identidade do assinante)
}

export function parseHotmart(payload: unknown): HotmartEvent | null {
  const p = (payload ?? {}) as Record<string, unknown>;
  const data = (p.data ?? {}) as Record<string, unknown>;
  const purchase = (data.purchase ?? {}) as Record<string, unknown>;
  const buyer = (data.buyer ?? {}) as Record<string, unknown>;
  const product = (data.product ?? {}) as Record<string, unknown>;
  const subscription = (data.subscription ?? {}) as Record<string, unknown>;
  const subscriber = (subscription.subscriber ?? {}) as Record<string, unknown>;
  const email = buyer.email;
  const transacao = purchase.transaction;
  const status = purchase.status;
  if (typeof email !== "string" || typeof transacao !== "string" || typeof status !== "string") {
    return null;
  }
  const event = typeof p.event === "string" ? p.event : undefined;
  const productId = product.id !== undefined && product.id !== null ? String(product.id) : undefined;
  const subscriberCode = typeof subscriber.code === "string" ? subscriber.code : undefined;
  return { status, email, transacao, event, productId, subscriberCode };
}

function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

export function verifyHottok(
  headers: Record<string, string>,
  body: Record<string, unknown>,
  expected: string,
): boolean {
  const fromHeader = headers["x-hotmart-hottok"];
  const fromBody = typeof body?.hottok === "string" ? (body.hottok as string) : undefined;
  const got = fromHeader ?? fromBody;
  return !!expected && got !== undefined && safeEqual(got, expected);
}
```

- [ ] **Step 4: Rodar e ver passar** — Expected: 4 passed.
- [ ] **Step 5: Commit** — `git add supabase/functions/_shared/hotmart.* && git commit -m "feat(f0): parser Hotmart + event/productId/subscriberCode"`

---

## Task 5: `_shared/tenants.ts` — provisioning idempotente por assinante

**Files:**
- Create: `ONLINE/supabase/functions/_shared/tenants.ts`
- Test: `ONLINE/supabase/functions/_shared/tenants.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { provisionTenant, DEFAULT_ONLINE_PLAN, type TenantDB } from "./tenants.ts";

function fakeTenantDB(opts: { existingAuthId?: string | null; upsertThrows?: boolean } = {}) {
  const calls = {
    upsertTenant: [] as Array<{ subscriberCode: string; transacao: string; email: string; plan: unknown }>,
    createAuthUser: [] as string[],
    linkAuthUser: [] as Array<[string, string]>,
  };
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

Deno.test("tenant novo → upsert com DEFAULT_ONLINE_PLAN + cria auth user + linka", async () => {
  const { db, calls } = fakeTenantDB();
  const r = await provisionTenant(db, { subscriberCode: "SUB123", transacao: "HON1", email: "a@b.com" });
  assertEquals(r.tenantId, "t-1");
  assertEquals(calls.upsertTenant[0].subscriberCode, "SUB123");
  assertEquals(calls.upsertTenant[0].plan, DEFAULT_ONLINE_PLAN);
  assertEquals(calls.createAuthUser, ["a@b.com"]);
  assertEquals(calls.linkAuthUser, [["t-1", "u-new"]]);
});

Deno.test("rebill (mesmo subscriber, transação nova) → upsert atualiza, não recria auth", async () => {
  const { db, calls } = fakeTenantDB({ existingAuthId: "u-old" });
  const r = await provisionTenant(db, { subscriberCode: "SUB123", transacao: "HON2", email: "a@b.com" });
  assertEquals(r.tenantId, "t-1");
  assertEquals(calls.upsertTenant[0].transacao, "HON2");
  assertEquals(calls.createAuthUser.length, 0);
  assertEquals(calls.linkAuthUser.length, 0);
});

Deno.test("erro do DB propaga (nunca engolir)", async () => {
  const { db } = fakeTenantDB({ upsertThrows: true });
  await assertRejects(() => provisionTenant(db, { subscriberCode: "SUB123", transacao: "HON1", email: "a@b.com" }), Error, "db down");
});
```

- [ ] **Step 2: Rodar pra ver falhar** — Expected: FAIL ("Module not found").

- [ ] **Step 3: Implementar `tenants.ts`**

```ts
// Provisioning de tenant do Magnus OS Online (F0).
// Identidade = subscriber_code (decisão D9: rebill traz transação nova).
// DEFAULT_ONLINE_PLAN é a FONTE ÚNICA do plano/teto (decisão 2A — a coluna
// tenants.plan é not null SEM default; esquecer de gravar = erro ruidoso).
// NUNCA engolir erro de DB.

export const DEFAULT_ONLINE_PLAN = {
  key_source: "platform",
  limits: { usd_month: 20 },
} as const;

export interface TenantDB {
  // Upsert por subscriber_code; atualiza email/last_transacao e REATIVA (status active —
  // seguro: o dedup de webhook_events garante que só cobrança NOVA chega aqui).
  upsertTenant(row: { subscriberCode: string; transacao: string; email: string; plan: unknown }): Promise<{ tenantId: string; authUserId: string | null }>;
  createAuthUser(email: string): Promise<string>;
  linkAuthUser(tenantId: string, authUserId: string): Promise<void>;
}

export async function provisionTenant(
  db: TenantDB,
  args: { subscriberCode: string; transacao: string; email: string },
): Promise<{ tenantId: string }> {
  const { tenantId, authUserId } = await db.upsertTenant({
    subscriberCode: args.subscriberCode,
    transacao: args.transacao,
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

- [ ] **Step 4: Rodar e ver passar** — Expected: 3 passed.
- [ ] **Step 5: Commit** — `git add supabase/functions/_shared/tenants.* && git commit -m "feat(f0): provisionTenant por assinante (fonte única do plano no TS)"`

---

## Task 6: `hotmart-webhook` — handler com ledger de eventos (TDD, 11 testes)

**Files:**
- Create: `ONLINE/supabase/functions/hotmart-webhook/index.ts`
- Test: `ONLINE/supabase/functions/hotmart-webhook/handler.test.ts`

**Design (decisões 1A + D9):** webhook dedicado. Fluxo: hottok → parse → gate de produto (fora da lista = ignored, SEM gravar evento) → `recordEvent` (dedup por `(event, transacao)`: evento já PROCESSADO = duplicate; não-processado = fresh, reprocessa) → ação (provision/suspend/ignored) → `markProcessed`. Identidade: `subscriberCode ?? "email:"+email` (fallback documentado). Erros de ação PROPAGAM ANTES do markProcessed → resposta não-2xx → Hotmart re-tenta → evento segue não-processado → retry passa no dedup (auto-cura); evento órfão aparece na reconciliação. `SUBSCRIPTION_CANCELLATION` → F5.

- [ ] **Step 1: Escrever os testes que falham**

```ts
import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleWebhook, type TenantOps } from "./index.ts";

const PRODUCTS = new Set(["5566778"]);
const H = { "x-hotmart-hottok": "segredo" };

function payload(over: Partial<{ event: string; productId: number; status: string; transacao: string; email: string; subscriberCode: string | null }> = {}) {
  const sub = over.subscriberCode === null ? {} : { subscription: { subscriber: { code: over.subscriberCode ?? "SUB123" } } };
  return {
    event: over.event ?? "PURCHASE_APPROVED",
    data: {
      product: { id: over.productId ?? 5566778 },
      purchase: { transaction: over.transacao ?? "HON1", status: over.status ?? "APPROVED" },
      buyer: { email: over.email ?? "Tenant@B.com" },
      ...sub,
    },
  };
}

function fakeOps(opts: { fresh?: boolean; provisionThrows?: boolean } = {}) {
  const recorded: string[] = [];
  const processed: Array<[string, string]> = [];
  const provisioned: Array<[string, string, string]> = [];
  const suspended: string[] = [];
  const ops: TenantOps = {
    recordEvent: (e) => { recorded.push(`${e.event}:${e.transacao}`); return Promise.resolve({ fresh: opts.fresh ?? true }); },
    markProcessed: (event, transacao, result) => { processed.push([`${event}:${transacao}`, result]); return Promise.resolve(); },
    provision: (subscriberCode, transacao, email) => {
      if (opts.provisionThrows) return Promise.reject(new Error("auth down"));
      provisioned.push([subscriberCode, transacao, email]);
      return Promise.resolve();
    },
    suspend: (subscriberCode, transacao) => { suspended.push(`${subscriberCode}:${transacao}`); return Promise.resolve(); },
  };
  return { ops, recorded, processed, provisioned, suspended };
}

Deno.test("hottok errado → 401, nada gravado", async () => {
  const { ops, recorded } = fakeOps();
  const r = await handleWebhook({ "x-hotmart-hottok": "x" }, payload(), "segredo", PRODUCTS, ops);
  assertEquals(r.http, 401);
  assertEquals(recorded.length, 0);
});

Deno.test("produto fora da lista → ignored SEM gravar evento", async () => {
  const { ops, recorded } = fakeOps();
  const r = await handleWebhook(H, payload({ productId: 999 }), "segredo", PRODUCTS, ops);
  assertEquals((r.json as any).ignored, true);
  assertEquals(recorded.length, 0);
});

Deno.test("compra aprovada → recordEvent + provision(SUB123, HON1, email normalizado) + markProcessed", async () => {
  const { ops, recorded, provisioned, processed } = fakeOps();
  const r = await handleWebhook(H, payload(), "segredo", PRODUCTS, ops);
  assertEquals(r.http, 200);
  assertEquals((r.json as any).provisioned, true);
  assertEquals(recorded, ["PURCHASE_APPROVED:HON1"]);
  assertEquals(provisioned, [["SUB123", "HON1", "tenant@b.com"]]);
  assertEquals(processed, [["PURCHASE_APPROVED:HON1", "provisioned"]]);
});

Deno.test("rebill (transação nova, mesmo subscriber) → provision de novo", async () => {
  const { ops, provisioned } = fakeOps();
  await handleWebhook(H, payload({ transacao: "HON2" }), "segredo", PRODUCTS, ops);
  assertEquals(provisioned, [["SUB123", "HON2", "tenant@b.com"]]);
});

Deno.test("evento já processado (fresh=false) → duplicate, sem provision", async () => {
  const { ops, provisioned } = fakeOps({ fresh: false });
  const r = await handleWebhook(H, payload(), "segredo", PRODUCTS, ops);
  assertEquals((r.json as any).duplicate, true);
  assertEquals(provisioned.length, 0);
});

Deno.test("sem subscriberCode → identidade fallback email:<email>", async () => {
  const { ops, provisioned } = fakeOps();
  await handleWebhook(H, payload({ subscriberCode: null }), "segredo", PRODUCTS, ops);
  assertEquals(provisioned, [["email:tenant@b.com", "HON1", "tenant@b.com"]]);
});

Deno.test("refund → suspend + markProcessed('suspended'), sem provision", async () => {
  const { ops, provisioned, suspended, processed } = fakeOps();
  const r = await handleWebhook(H, payload({ event: "PURCHASE_REFUNDED", status: "REFUNDED" }), "segredo", PRODUCTS, ops);
  assertEquals(r.http, 200);
  assertEquals(suspended, ["SUB123:HON1"]);
  assertEquals(provisioned.length, 0);
  assertEquals(processed, [["PURCHASE_REFUNDED:HON1", "suspended"]]);
});

Deno.test("chargeback → suspend", async () => {
  const { ops, suspended } = fakeOps();
  await handleWebhook(H, payload({ event: "PURCHASE_CHARGEBACK", status: "CHARGEBACK" }), "segredo", PRODUCTS, ops);
  assertEquals(suspended, ["SUB123:HON1"]);
});

Deno.test("refund de produto fora da lista → ignored, NÃO suspende", async () => {
  const { ops, suspended } = fakeOps();
  const r = await handleWebhook(H, payload({ event: "PURCHASE_REFUNDED", status: "REFUNDED", productId: 999 }), "segredo", PRODUCTS, ops);
  assertEquals((r.json as any).ignored, true);
  assertEquals(suspended.length, 0);
});

Deno.test("evento online não-APPROVED e não-refund → markProcessed('ignored')", async () => {
  const { ops, provisioned, suspended, processed } = fakeOps();
  const r = await handleWebhook(H, payload({ event: "PURCHASE_BILLET_PRINTED", status: "WAITING_PAYMENT" }), "segredo", PRODUCTS, ops);
  assertEquals((r.json as any).ignored, true);
  assertEquals(provisioned.length + suspended.length, 0);
  assertEquals(processed, [["PURCHASE_BILLET_PRINTED:HON1", "ignored"]]);
});

Deno.test("provision rejeita → erro PROPAGA e markProcessed NÃO é chamado (retry da Hotmart reprocessa)", async () => {
  const { ops, processed } = fakeOps({ provisionThrows: true });
  await assertRejects(() => handleWebhook(H, payload(), "segredo", PRODUCTS, ops), Error, "auth down");
  assertEquals(processed.length, 0);
});
```

- [ ] **Step 2: Rodar pra ver falhar** — `deno test --allow-all supabase/functions/hotmart-webhook/`. Expected: FAIL ("Module not found ./index.ts").

- [ ] **Step 3: Implementar `index.ts`**

```ts
// Webhook Hotmart DEDICADO do Magnus OS Online (decisões 1A + D9 do eng-review 2026-06-10).
// Fluxo: hottok → parse → gate de produto → ledger de eventos (dedup) → ação → markProcessed.
// Identidade do tenant = subscriber_code (rebill traz transação nova); fallback email:<email>.
// Erros de ação PROPAGAM antes do markProcessed → Hotmart re-tenta → dedup deixa passar
// evento não-processado (auto-cura). SUBSCRIPTION_CANCELLATION: F5.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseHotmart, verifyHottok } from "../_shared/hotmart.ts";
import { provisionTenant, type TenantDB } from "../_shared/tenants.ts";

export interface TenantOps {
  // Grava o evento bruto; fresh=false só se JÁ existe E foi processado.
  recordEvent(e: { event: string; transacao: string; productId: string; subscriberCode: string; payload: unknown }): Promise<{ fresh: boolean }>;
  markProcessed(event: string, transacao: string, result: string): Promise<void>;
  provision(subscriberCode: string, transacao: string, email: string): Promise<void>;
  suspend(subscriberCode: string, transacao: string): Promise<void>;
}

export async function handleWebhook(
  headers: Record<string, string>,
  body: Record<string, unknown>,
  hottok: string,
  productIds: Set<string>,
  ops: TenantOps,
): Promise<{ http: number; json: unknown }> {
  if (!verifyHottok(headers, body, hottok)) return { http: 401, json: { error: "hottok inválido" } };
  const evt = parseHotmart(body);
  if (!evt || !evt.productId || !productIds.has(evt.productId)) {
    return { http: 200, json: { ignored: true } };
  }
  const eventName = evt.event ?? "UNKNOWN";
  const email = evt.email.trim().toLowerCase();
  const subscriberCode = evt.subscriberCode ?? `email:${email}`;

  const { fresh } = await ops.recordEvent({
    event: eventName, transacao: evt.transacao, productId: evt.productId, subscriberCode, payload: body,
  });
  if (!fresh) return { http: 200, json: { duplicate: true } };

  if (eventName === "PURCHASE_REFUNDED" || eventName === "PURCHASE_CHARGEBACK") {
    await ops.suspend(subscriberCode, evt.transacao);
    await ops.markProcessed(eventName, evt.transacao, "suspended");
    return { http: 200, json: { suspended: true } };
  }
  if (evt.status !== "APPROVED") {
    await ops.markProcessed(eventName, evt.transacao, "ignored");
    return { http: 200, json: { ignored: true } };
  }
  await ops.provision(subscriberCode, evt.transacao, email);
  await ops.markProcessed(eventName, evt.transacao, "provisioned");
  return { http: 200, json: { provisioned: true } };
}

function realOps(): TenantOps {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const tdb: TenantDB = {
    async upsertTenant(row) {
      const { data, error } = await sb.from("tenants")
        .upsert({
          subscriber_code: row.subscriberCode, email: row.email, plan: row.plan,
          last_transacao: row.transacao, status: "active", updated_at: new Date().toISOString(),
        }, { onConflict: "subscriber_code" })
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
    async recordEvent(e) {
      const { error } = await sb.from("webhook_events")
        .upsert({ event: e.event, transacao: e.transacao, product_id: e.productId, subscriber_code: e.subscriberCode, payload: e.payload },
                { onConflict: "event,transacao", ignoreDuplicates: true });
      if (error) throw error;
      // fresh = não existe linha processada pra (event, transacao)
      const { data, error: e2 } = await sb.from("webhook_events")
        .select("processed_at").eq("event", e.event).eq("transacao", e.transacao).single();
      if (e2) throw e2;
      return { fresh: data.processed_at === null };
    },
    async markProcessed(event, transacao, result) {
      const { error } = await sb.from("webhook_events")
        .update({ processed_at: new Date().toISOString(), result })
        .eq("event", event).eq("transacao", transacao);
      if (error) throw error;
    },
    async provision(subscriberCode, transacao, email) {
      await provisionTenant(tdb, { subscriberCode, transacao, email });
    },
    async suspend(subscriberCode, transacao) {
      // por assinante; fallback por última transação (refund sem subscription no payload)
      const { data, error } = await sb.from("tenants")
        .update({ status: "suspended", updated_at: new Date().toISOString() })
        .eq("subscriber_code", subscriberCode).select("id");
      if (error) throw error;
      if (data && data.length > 0) return;
      const { error: e2 } = await sb.from("tenants")
        .update({ status: "suspended", updated_at: new Date().toISOString() })
        .eq("last_transacao", transacao);
      if (e2) throw e2;
    },
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return Response.json({ error: "use POST" }, { status: 405 });
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));
  // ?hottok= de query tem PRECEDÊNCIA sobre o header (a Hotmart manda o hottok DELA no
  // header — verificado empiricamente no produto local, 2026-05-29).
  const sp = new URL(req.url).searchParams;
  const q = sp.get("hottok") ?? sp.get("token");
  if (q) headers["x-hotmart-hottok"] = q;
  const body = await req.json().catch(() => ({}));
  const ids = (Deno.env.get("MAGNUS_ONLINE_PRODUCT_IDS") ?? "").split(",").map(s => s.trim()).filter(Boolean);
  const { http, json } = await handleWebhook(headers, body, Deno.env.get("HOTMART_HOTTOK_ONLINE") ?? "", new Set(ids), realOps());
  return Response.json(json, { status: http });
});
```

- [ ] **Step 4: Rodar a suite inteira** — `deno test --allow-all supabase/functions/`. Expected: **18 passed** (4 hotmart + 3 tenants + 11 webhook).

- [ ] **Step 5: Commit** — `git add supabase/functions/hotmart-webhook/ && git commit -m "feat(f0): webhook dedicado — identidade por assinante + ledger de eventos (11 testes)"`

---

## Task 7: Deploy das functions + webhook na Hotmart + smoke em produção

**Files:**
- Modify: `ONLINE/README.md` (seção "Operação")

- [ ] **Step 1: Secrets no projeto novo**

```bash
cd /Users/yuribranco/Documents/Magnus/magnus-os-online
set -a; . ./.env.bootstrap; set +a
op run --env-file=.env.op -- bash -c \
  'supabase secrets set HOTMART_HOTTOK_ONLINE="$HOTMART_HOTTOK_ONLINE" MAGNUS_ONLINE_PRODUCT_IDS="$MAGNUS_ONLINE_PRODUCT_IDS" --project-ref <REF>'
```

- [ ] **Step 2: Deploy** — `op run --env-file=.env.op -- supabase functions deploy hotmart-webhook --project-ref <REF> --use-api`. Expected: deployed.

- [ ] **Step 3 (YURI): Registrar o webhook na Hotmart** — novo webhook, **só o produto Magnus OS Online**, eventos "Compra aprovada" + "Reembolso" + "Chargeback", versão 2.0.0, URL:
`https://<REF>.supabase.co/functions/v1/hotmart-webhook?hottok=<HOTMART_HOTTOK_ONLINE>`

- [ ] **Step 4: Smoke em produção** (compra sintética):

```bash
op run --env-file=.env.op -- bash -c 'curl -sS -X POST \
  "https://<REF>.supabase.co/functions/v1/hotmart-webhook?hottok=$HOTMART_HOTTOK_ONLINE" \
  -H "Content-Type: application/json" -d "{
    \"event\": \"PURCHASE_APPROVED\",
    \"data\": { \"product\": { \"id\": <PRODUCT_ID> },
      \"purchase\": { \"transaction\": \"F0SMOKE2\", \"status\": \"APPROVED\" },
      \"buyer\": { \"email\": \"f0-smoke2@test.dev\" },
      \"subscription\": { \"subscriber\": { \"code\": \"SUB-F0SMOKE2\" } } } }"'
```
Verificações (via `db-apply.sh` com SQL inline em arquivo temp):
1. `select status, auth_user_id is not null as linked, last_transacao from public.tenants where subscriber_code='SUB-F0SMOKE2';` → `active | true | F0SMOKE2`.
2. **Re-POST do mesmo payload** → `{"duplicate":true}` e 1 tenant só.
3. **Rebill simulado** (mesmo payload com `"transaction":"F0SMOKE3"`) → `{"provisioned":true}`, **continua 1 tenant** com `last_transacao=F0SMOKE3` (o bug de duplicação do D9 está morto).
4. **Refund** (`"event":"PURCHASE_REFUNDED"`, `"status":"REFUNDED"`, transaction F0SMOKE3) → tenant `suspended`.
5. Hottok errado → 401.
6. `select event, transacao, result, processed_at is not null as ok from public.webhook_events where subscriber_code='SUB-F0SMOKE2' order by id;` → 3 linhas todas processadas.

- [ ] **Step 5: Reconciliação (decisão 3A + D9) — documentar no README "Operação":**

```sql
-- (a) Tenants ativos sem login (provisioning incompleto = cliente pagou e não loga):
select subscriber_code, email, created_at from public.tenants
 where auth_user_id is null and status = 'active';
-- (b) Eventos recebidos e nunca processados há >1h (falha persistente de ação):
select event, transacao, received_at from public.webhook_events
 where processed_at is null and received_at < now() - interval '1 hour';
```
Expected: 0 linhas em ambas. Nota no README: compra visível no painel da Hotmart sem linha em `webhook_events` = falha total de entrega → reenviar o evento pela Hotmart e checar logs da function. Rodar semanalmente até a F5 automatizar como alerta.

- [ ] **Step 6: Limpar o smoke via API (decisão D11 — sem dashboard manual):**

```bash
op run --env-file=.env.op -- bash -c '
  UID=$(curl -sS -X POST "$SUPABASE_URL/rest/v1/rpc/auth_user_id_by_email" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" -d "{\"p_email\": \"f0-smoke2@test.dev\"}" | tr -d "\"")
  [ -n "$UID" ] && [ "$UID" != "null" ] && curl -sS -X DELETE "$SUPABASE_URL/auth/v1/admin/users/$UID" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
  curl -sS -X DELETE "$SUPABASE_URL/rest/v1/tenants?subscriber_code=eq.SUB-F0SMOKE2" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
  curl -sS -X DELETE "$SUPABASE_URL/rest/v1/webhook_events?subscriber_code=eq.SUB-F0SMOKE2" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"'
```
(Ordem: auth user → tenants → events. O DELETE de tenants exige o user deletado antes por causa do unique; events por último pra auditoria do próprio cleanup.)

- [ ] **Step 7: Commit + push** — `git add -A && git commit -m "feat(f0): deploy webhook + runbook de reconciliação e cleanup" && git push`

---

## Task 8: Substrato de deploy — health server + infra files

> **STATUS 2026-06-10 — ✅ ARQUIVOS FEITOS (`magnus-os-online` `04acec0`).** Adaptado pro **VPS COMPARTILHADO do Portal** (`72.60.241.64`), NÃO dedicado como o plano assumia. `bootstrap.sh` reescrito: aditivo/idempotente, **sem `ufw enable`**, sem reconfigurar nginx/redis/pm2-startup do Portal (só cria user `deploy` c/ unit pm2 próprio + paths). Health server smoke-testado local (`/api/health` ok). `deploy.yml` commitado **separado e segurado** — token `gh` sem escopo `workflow` (pendente: `gh auth refresh -h github.com -s workflow`). **Task 9 (provisionar ao vivo) BLOQUEADA**: minha chave (`id_ed25519`) não autorizada como root no VPS do Portal.

**Files:**
- Create: `ONLINE/package.json`, `ONLINE/server.mjs`, `ONLINE/ecosystem.config.cjs`, `ONLINE/infra/bootstrap.sh`, `ONLINE/infra/nginx-magnusos.conf`, `ONLINE/.github/workflows/deploy.yml`

- [ ] **Step 1: Health server** (`server.mjs`):

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

- [ ] **Step 2: `infra/bootstrap.sh`** (idempotente; root, uma vez; pm2 startup INCLUSO — decisão D11/codex#18):

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
mkdir -p /home/deploy/.ssh /var/www/magnusos-online /var/lib/magnusos
chown -R deploy:deploy /var/www/magnusos-online /var/lib/magnusos /home/deploy/.ssh
# pm2 reboot-safe DESDE O PRIMEIRO DEPLOY (não depois)
env PATH=$PATH:/usr/bin pm2 startup systemd -u deploy --hp /home/deploy
# Firewall
ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw --force enable
echo "bootstrap OK — copie a chave pública do deploy pra /home/deploy/.ssh/authorized_keys"
```
Nota de arquitetura: `/var/www/magnusos-online` é SÓ código (rsync --delete pode tudo ali); **estado de runtime da F1 vive em `/var/lib/magnusos`** (decisão D11/codex#17 — nunca sob o caminho do rsync).

- [ ] **Step 3: `infra/nginx-magnusos.conf`**

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

- [ ] **Step 4: `.github/workflows/deploy.yml`**

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
            --exclude .git --exclude node_modules --exclude supabase --exclude infra --exclude scripts \
            ./ deploy@"$HOST":/var/www/magnusos-online/
          ssh -i key -o StrictHostKeyChecking=accept-new deploy@"$HOST" \
            'cd /var/www/magnusos-online && pm2 startOrReload ecosystem.config.cjs && pm2 save'
```
(F1 adiciona `npm ci --omit=dev` antes do pm2 quando houver dependências — anotado.)

- [ ] **Step 5: Commit + push** — `git add -A && git commit -m "feat(f0): substrato — health server, bootstrap (pm2 reboot-safe), nginx, CI/CD" && git push`

---

## Task 9: Provisionar o VPS + TLS + app no ar

**Pré-requisito:** Task 0 Steps 3-4 + Task 8 pushed.

- [ ] **Step 1: Bootstrap** — `scp infra/bootstrap.sh root@<VPS_IP>:/root/ && ssh root@<VPS_IP> 'bash /root/bootstrap.sh'`. Expected: "bootstrap OK".
- [ ] **Step 2: Chave de deploy**

```bash
ssh-keygen -t ed25519 -f ~/.ssh/magnusos_deploy -N "" -C "deploy@magnusos"
ssh root@<VPS_IP> 'cat >> /home/deploy/.ssh/authorized_keys && chown deploy:deploy /home/deploy/.ssh/authorized_keys && chmod 600 /home/deploy/.ssh/authorized_keys' < ~/.ssh/magnusos_deploy.pub
gh secret set DEPLOY_SSH_KEY -R yuribranco/magnus-os-online < ~/.ssh/magnusos_deploy
gh secret set VPS_HOST -R yuribranco/magnus-os-online -b "<VPS_IP>"
```
Chave privada também no 1Password (`magnus-os-online-secrets`, campo `DEPLOY_SSH_KEY` — dono da rotação: Yuri; runbook no README).
- [ ] **Step 3: nginx + TLS**

```bash
scp infra/nginx-magnusos.conf root@<VPS_IP>:/etc/nginx/sites-available/magnusos
ssh root@<VPS_IP> 'ln -sf /etc/nginx/sites-available/magnusos /etc/nginx/sites-enabled/magnusos && nginx -t && systemctl reload nginx && certbot --nginx -d magnusos.yuribranco.com.br --non-interactive --agree-tos -m yuribranco@gmail.com'
```
- [ ] **Step 4: Primeiro deploy via CI** — `git commit --allow-empty -m "chore: trigger deploy" && git push` + `gh run watch`. Expected: verde.
- [ ] **Step 5: Verificar de fora** — `curl -s https://magnusos.yuribranco.com.br/api/health` → `{"ok":true,...}`; `ssh root@<VPS_IP> 'redis-cli ping'` → `PONG`; `ssh root@<VPS_IP> 'systemctl is-enabled pm2-deploy'` → `enabled` (reboot-safe já pelo bootstrap).

---

## Task 10: Login magic-link fim-a-fim

**Pré-requisito:** Task 0 Step 5 + Task 7.

- [ ] **Step 1: Tenant de dogfood real** — curl da Task 7 Step 4 com `transaction: "F0DOGFOOD"`, `subscriber code: "SUB-YURI-DOGFOOD"` e email `yuribranco@gmail.com`. NÃO é limpo — vira o tenant de dev.
- [ ] **Step 2: Magic link via API**

```bash
op run --env-file=.env.op -- bash -c 'curl -sS -X POST "$SUPABASE_URL/auth/v1/magiclink" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
  -d "{\"email\": \"yuribranco@gmail.com\", \"options\": {\"email_redirect_to\": \"https://magnusos.yuribranco.com.br\"}}"'
```
- [ ] **Step 3 (YURI): Clicar no link** → aterrissa em `https://magnusos.yuribranco.com.br` sem erro de redirect (consumo do token = F1).

---

## Task 11: Documentação + gates de fechamento

**Files:**
- Modify: `ONLINE/README.md` · `LICENCA/DEPLOY.md` (1 nota)

- [ ] **Step 1: README do ONLINE** — arquitetura (diagrama), tabelas+funções, secrets + **donos de rotação** (DEPLOY_SSH_KEY/hottok/service key: Yuri, runbook 1Password), runbook de reconciliação, riscos aceitos (lista do header), o que vem na F1 (painel multi-tenant, npm ci no CI, enforcement atômico de orçamento, rate-limit).

```
Hotmart (produto online, webhook dedicado, ?hottok= próprio)
   │ APPROVED / REFUNDED / CHARGEBACK
   ▼
Edge Function hotmart-webhook ───────── Supabase DEDICADO <REF>
   │ 1. webhook_events (dedup/auditoria)   ├── tenants (id=subscriber, RLS self-read)
   │ 2. provision/suspend                  ├── webhook_events (service-only)
   ▼                                       ├── tenant_secrets (service-only)
tenants + auth.users (magic-link)          ├── cost_ledger + runs (RLS self-read)
   │                                       └── fns orçamento (service-only)
   ▼
magnusos.yuribranco.com.br (VPS novo: nginx+TLS → pm2 :3100 → F1 painel)
código: /var/www/magnusos-online (rsync)  ·  estado F1: /var/lib/magnusos (fora do rsync)
```

- [ ] **Step 2: Nota no `LICENCA/DEPLOY.md`** — "Produto **Magnus OS Online** vive em projeto Supabase DEDICADO (repo `magnus-os-online`) com webhook próprio — este repo/projeto NÃO é tocado pelo online (decisão 1A do eng-review 2026-06-10)."
- [ ] **Step 3: Suite final** — `deno test --allow-all supabase/functions/`. Expected: 18 passed.
- [ ] **Step 4: Commit + push os dois repos.**
- [ ] **Step 5: Gate `/codex review`** no diff do `magnus-os-online` (gate de dinheiro/credencial).
- [ ] **Step 6: Fechar o ciclo** — wiki (session log), GTD (concluir F0, próxima ação F1), memory (RESUME).

---

## NOT in scope (decidido, não esquecido)

- **`SUBSCRIPTION_CANCELLATION` + expiração** — F5 (`subscription_id` já persistido desde a F0 pra isso).
- **Enforcement atômico de orçamento (reserva transacional)** — requisito declarado da F1 (executor de runs).
- **Storage bucket `tenant-workspaces`** — F1, junto do executor.
- **Rate-limit no webhook** — F1/F2 hardening (dedup + hottok mitigam na F0).
- **Crypto helpers de `tenant_secrets`** — F2 (pgcrypto vs Vault aberto no blueprint §3.6).
- **`tenant_members` (equipe/multi-marca)** — decisão D10: blueprint 1:1 mantido; migração aditiva quando houver demanda real.
- **`npm ci` no CI** — F1 (F0 não tem dependências).
- **Validação local de migrations (supabase local/Docker)** — aceito aplicar direto com guard de ref (`db-apply.sh`); revisitar se o time crescer.
- **Meta App Review** — paralelo via GTD; não é código da F0.

## What already exists (reusado, não reconstruído)

- Parser/verificação Hotmart + padrão handler+fakes + precedência `?hottok=` — portados do `magnus-os-licenca` (provados com 58 eventos reais).
- Padrão Management API pra migrations (Mac sem IPv6) — agora com script+guard.
- Padrão CI rsync+pm2 — Portal Magnus.
- Padrão op:// 1Password — regra global.
- Webhook/licença do produto LOCAL — intocado (isolamento por produto).

## Failure modes (pós-D9/D11)

| Codepath | Falha realista | Teste? | Tratamento? | Visível? |
|---|---|---|---|---|
| provision | Auth API fora nos retries | ✅ (propagação, markProcessed não roda) | retry Hotmart passa no dedup; reconciliação (b) pega resíduo | ✅ runbook |
| rebill | transação nova do mesmo assinante | ✅ (teste 4 + smoke 3) | upsert por subscriber — sem duplicata | ✅ |
| re-entrega | evento já processado re-enviado | ✅ (teste 5 + smoke 2) | dedup → duplicate | ✅ |
| reativação indevida | APPROVED atrasado pós-refund (mesma transação) | ✅ (dedup cobre) | evento processado não reprocessa | ✅ |
| suspend | refund sem subscriber no payload | ✅ (fallback last_transacao) | 2-step lookup; 0-rows = refund pré-sistema (no-op aceito, evento fica no ledger) | ✅ ledger |
| createAuthUser | email já existe | ✅ (lookup rpc) | reusa | ✅ |
| budget fns | authenticated consulta tenant alheio | — | revoke (D11) — só service_role | ✅ |
| magic link | redirect não permitido | manual T10 | Redirect URLs configuradas (T0.5) | ✅ |
| CI deploy | rsync/pm2 falha · reboot pré-startup | — | workflow vermelho · pm2 startup no bootstrap | ✅ |
| migrations | aplicar no projeto errado | — | guard de `<REF>` no db-apply.sh | ✅ |

Nenhum failure mode sem teste E sem tratamento E silencioso → **0 critical gaps** (tabela revisada pós-codex).

## Worktree parallelization

| Step | Módulos | Depende de |
|---|---|---|
| T1 | repo root | T0.1-0.2 |
| T2-T7 (Supabase) | ONLINE/supabase/, scripts/ | T1 |
| T8-T9 (substrato) | ONLINE/{infra,server,workflows} | T1 (+T0.3-0.4) |
| T10 (auth smoke) | — | T7 + T9 + T0.5 |

`Lane A: T2→T7 (sequencial, supabase/)` ∥ `Lane B: T8→T9 (sequencial, infra/)` após T1. T10 espera as duas. Conflito: nenhum (diretórios disjuntos).

## Implementation Tasks (síntese do review — todas JÁ APLICADAS nesta versão do plano)

- [ ] **T1 (P1)** — arquitetura — Supabase dedicado + webhook próprio (1A) → Tasks 0-7
- [ ] **T2 (P1)** — modelo — Identidade por subscriber + webhook_events + transição (D9/codex#1-3) → Tasks 2/4/5/6
- [ ] **T3 (P2)** — schema — plan not null sem default, TS fonte única (2A) → Tasks 2/5
- [ ] **T4 (P2)** — segurança — revoke nas fns de orçamento (D11/codex#11) → Task 3
- [ ] **T5 (P2)** — operação — reconciliação dupla + cleanup via API (3A+D11) → Task 7
- [ ] **T6 (P2)** — infra — pm2 startup no bootstrap, rsync excludes+/var/lib, db-apply guard, Redirect URLs (D11) → Tasks 0/1/8
- [ ] **T7 (P2)** — testes — 18 testes incl. rebill/dedup/retry (6A+D9) → Tasks 4/5/6

_No new tasks from Performance review._

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — (escopo travado na spec aprovada 2026-06-10) |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | ISSUES_ABSORBED | 25 pontos → 1 P1 real (rebill/identidade) + lote consensual + 5 riscos documentados; 7 rejeitados com razão |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 9 issues, 0 critical gaps — todos resolvidos e aplicados (1A, 2A, 3A, 4A, 5A, 6A, D9, D10, D11) |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — (F0 não tem UI; F3 terá gate próprio) |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**CODEX:** outside voice pegou o P1 que o review interno não viu (idempotência por transação quebraria no 1º rebill de assinatura) — absorvido como D9 (subscriber_code + webhook_events + dedup). Lote consensual D11 aplicado; #4/#5 (tenant_members) rejeitado por decisão de blueprint (D10); 5 pontos viram riscos aceitos documentados no header do plano.

**CROSS-MODEL:** tensão única substantiva (tenant_members agora vs depois) decidida pelo Yuri a favor do blueprint (migração aditiva). Demais pontos: concordância.

**VERDICT:** ENG CLEARED — ready to implement (CEO/Design não aplicáveis a esta fase).

NO UNRESOLVED DECISIONS
