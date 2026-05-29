# Magnus OS — Fase 1: Backend de Licença (Supabase) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir o backend de licença do Magnus OS: emitir keys quando alguém compra na Hotmart e validar keys (com telemetria de ativação) — tudo em Supabase, testável por curl, sem rodar IA.

**Architecture:** Um projeto Supabase dedicado (`magnus-os-licenca`). Uma tabela `licencas`. Duas Edge Functions (Deno/TypeScript), ambas públicas (`verify_jwt=false`): `hotmart-webhook` (verifica HOTTOK → emite + grava key, idempotente por transação) e `license-validate` (lookup por key → devolve status + registra `last_seen`/`uso_count`). Lógica pura extraída em handlers testáveis com DB injetável; a borda HTTP só faz wiring.

**Tech Stack:** Supabase (Postgres + Edge Functions Deno), Supabase CLI, `deno test`, `@supabase/supabase-js`.

---

## Decisões de design travadas
- **Modelo de licença = thin-gateway** (decidido no brainstorm): a key é um identificador opaco com lookup server-side, NÃO um arquivo assinado offline. Validação = consulta à tabela. Simples e revogável.
- **Formato da key:** `MOS-XXXX-XXXX-XXXX` (Crockford base32, sem caracteres ambíguos I/L/O/U).
- **Segurança:** as functions usam o `SUPABASE_SERVICE_ROLE_KEY` (injetado no ambiente da function) e fazem o controle do que expõem. RLS na tabela bloqueia anon/auth por padrão (sem policies públicas). Não há db function SECURITY DEFINER (desvio simplificador do spec §3.4 — mesma segurança, menos peça).
- **Idempotência:** `licencas.transacao` é UNIQUE; o webhook dedupe retries da Hotmart por transação.

## File Structure
```
~/Documents/Magnus/magnus-os-licenca/         (novo repo git + projeto Supabase)
  supabase/
    config.toml                               # verify_jwt=false nas 2 functions
    migrations/0001_licencas.sql              # tabela + RLS + índices
    functions/
      _shared/keygen.ts                       # gerarKey()
      _shared/keygen.test.ts
      _shared/hotmart.ts                       # parseHotmart() + verifyHottok()
      _shared/hotmart.test.ts
      license-validate/index.ts               # handleValidate() + Deno.serve
      license-validate/handler.test.ts
      hotmart-webhook/index.ts                # handleWebhook() + Deno.serve
      hotmart-webhook/handler.test.ts
  .env.example
  README.md
```

---

### Task 0: Scaffold do projeto Supabase

**Files:**
- Create: `~/Documents/Magnus/magnus-os-licenca/` (repo), `supabase/config.toml`, `.env.example`, `README.md`

- [ ] **Step 1: Inicializar repo + Supabase**

```bash
mkdir -p ~/Documents/Magnus/magnus-os-licenca && cd ~/Documents/Magnus/magnus-os-licenca
git init -q
supabase init    # cria supabase/config.toml e estrutura
printf "node_modules/\n.env\n.branches/\n.temp/\n" > .gitignore
```

- [ ] **Step 2: Tornar as 2 functions públicas (sem JWT)**

Editar `supabase/config.toml`, adicionar ao final:

```toml
[functions.license-validate]
verify_jwt = false

[functions.hotmart-webhook]
verify_jwt = false
```

- [ ] **Step 3: `.env.example`**

```bash
# Secrets das Edge Functions (setar com: supabase secrets set --env-file .env)
HOTMART_HOTTOK=cole-o-hottok-do-painel-hotmart
# SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injetados automaticamente nas functions.
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -q -m "chore: scaffold projeto Supabase magnus-os-licenca"
```

---

### Task 1: Migration da tabela `licencas`

**Files:**
- Create: `supabase/migrations/0001_licencas.sql`

- [ ] **Step 1: Escrever a migration**

```sql
-- supabase/migrations/0001_licencas.sql
create table if not exists public.licencas (
  id          uuid primary key default gen_random_uuid(),
  key         text unique not null,
  email       text not null,
  status      text not null default 'granted' check (status in ('granted','revoked','expired')),
  origem      text not null default 'hotmart' check (origem in ('hotmart','bundle-mentorado','manual')),
  transacao   text unique,                 -- id da transação Hotmart (idempotência)
  plano       text not null default 'tripwire' check (plano in ('tripwire','mentorado')),
  criada_em   timestamptz not null default now(),
  ativada_em  timestamptz,
  last_seen   timestamptz,
  uso_count   integer not null default 0
);

create index if not exists licencas_email_idx on public.licencas (email);

-- RLS liga e nega tudo por padrão. Só o service_role (Edge Functions) acessa.
alter table public.licencas enable row level security;
```

- [ ] **Step 2: Aplicar local e verificar**

```bash
supabase start
supabase migration up
supabase db diff --schema public   # deve mostrar 0 diffs (migration aplicada)
```
Expected: tabela `licencas` criada, sem diffs pendentes.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0001_licencas.sql && git commit -q -m "feat(db): tabela licencas + RLS"
```

---

### Task 2: Gerador de key (`_shared/keygen.ts`)

**Files:**
- Create: `supabase/functions/_shared/keygen.ts`
- Test: `supabase/functions/_shared/keygen.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// supabase/functions/_shared/keygen.test.ts
import { assert, assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { gerarKey } from "./keygen.ts";

Deno.test("gerarKey tem o formato MOS-XXXX-XXXX-XXXX", () => {
  assertMatch(gerarKey(), /^MOS-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
});

Deno.test("gerarKey não usa caracteres ambíguos (I L O U)", () => {
  const k = gerarKey(() => new Uint8Array([8,11,18,20, 8,11,18,20, 8,11,18,20])); // índices de I,L,O,U se existissem
  assert(!/[ILOU]/.test(k), `key não pode conter I/L/O/U: ${k}`);
});

Deno.test("gerarKey é determinística com rand injetado", () => {
  const rand = () => new Uint8Array([0,1,2,3,4,5,6,7,8,9,10,11]);
  assertEquals(gerarKey(rand), gerarKey(rand));
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd ~/Documents/Magnus/magnus-os-licenca && deno test supabase/functions/_shared/keygen.test.ts`
Expected: FAIL — "Module not found ./keygen.ts".

- [ ] **Step 3: Implementar**

```ts
// supabase/functions/_shared/keygen.ts
// Crockford base32 sem ambíguos (sem I, L, O, U)
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function gerarKey(rand: (n: number) => Uint8Array = randomBytes): string {
  const bytes = rand(12);
  let out = "";
  for (let i = 0; i < 12; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return `MOS-${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}`;
}

function randomBytes(n: number): Uint8Array {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return a;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `deno test supabase/functions/_shared/keygen.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/keygen.ts supabase/functions/_shared/keygen.test.ts
git commit -q -m "feat(license): gerador de key MOS-XXXX-XXXX-XXXX"
```

---

### Task 3: Parse + verificação Hotmart (`_shared/hotmart.ts`)

**Files:**
- Create: `supabase/functions/_shared/hotmart.ts`
- Test: `supabase/functions/_shared/hotmart.test.ts`

> Nota: o payload da Hotmart v2 vem como `{ event, data: { purchase: { transaction, status }, buyer: { email } } }` e o HOTTOK no header `X-HOTMART-HOTTOK` (ou no corpo em versões antigas). Confirmar no painel Hotmart na Fase 5; o parser abaixo cobre o formato v2 + fallback de hottok no corpo.

- [ ] **Step 1: Teste que falha**

```ts
// supabase/functions/_shared/hotmart.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseHotmart, verifyHottok } from "./hotmart.ts";

const aprovado = {
  event: "PURCHASE_APPROVED",
  data: { purchase: { transaction: "HP123", status: "APPROVED" }, buyer: { email: "a@b.com" } },
};

Deno.test("parseHotmart extrai email, transacao e status de evento aprovado", () => {
  assertEquals(parseHotmart(aprovado), { status: "APPROVED", email: "a@b.com", transacao: "HP123" });
});

Deno.test("parseHotmart devolve null para payload malformado", () => {
  assertEquals(parseHotmart({ foo: "bar" }), null);
});

Deno.test("verifyHottok aceita header e rejeita errado", () => {
  assertEquals(verifyHottok({ "x-hotmart-hottok": "segredo" }, {}, "segredo"), true);
  assertEquals(verifyHottok({ "x-hotmart-hottok": "errado" }, {}, "segredo"), false);
});

Deno.test("verifyHottok aceita hottok no corpo (fallback)", () => {
  assertEquals(verifyHottok({}, { hottok: "segredo" }, "segredo"), true);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `deno test supabase/functions/_shared/hotmart.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar**

```ts
// supabase/functions/_shared/hotmart.ts
export interface HotmartEvent {
  status: string;
  email: string;
  transacao: string;
}

export function parseHotmart(payload: unknown): HotmartEvent | null {
  const p = payload as Record<string, any>;
  const purchase = p?.data?.purchase;
  const email = p?.data?.buyer?.email;
  const transacao = purchase?.transaction;
  const status = purchase?.status;
  if (typeof email !== "string" || typeof transacao !== "string" || typeof status !== "string") {
    return null;
  }
  return { status, email, transacao };
}

export function verifyHottok(
  headers: Record<string, string>,
  body: Record<string, unknown>,
  expected: string,
): boolean {
  const fromHeader = headers["x-hotmart-hottok"];
  const fromBody = typeof body?.hottok === "string" ? (body.hottok as string) : undefined;
  const got = fromHeader ?? fromBody;
  return !!expected && got === expected;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `deno test supabase/functions/_shared/hotmart.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/hotmart.ts supabase/functions/_shared/hotmart.test.ts
git commit -q -m "feat(license): parse + verifyHottok da Hotmart"
```

---

### Task 4: Function `license-validate`

**Files:**
- Create: `supabase/functions/license-validate/index.ts`
- Test: `supabase/functions/license-validate/handler.test.ts`

- [ ] **Step 1: Teste que falha (handler puro com DB fake)**

```ts
// supabase/functions/license-validate/handler.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleValidate, type DB } from "./index.ts";

function fakeDB(row: { status: string } | null) {
  const calls: string[] = [];
  const db: DB = {
    fetchByKey: (_k) => { calls.push("fetch"); return Promise.resolve(row as any); },
    touch: (_k) => { calls.push("touch"); return Promise.resolve(); },
  };
  return { db, calls };
}

Deno.test("granted devolve status granted e registra uso (touch)", async () => {
  const { db, calls } = fakeDB({ status: "granted" });
  const r = await handleValidate({ key: "MOS-AAAA-AAAA-AAAA" }, db);
  assertEquals(r.http, 200);
  assertEquals(r.json, { status: "granted" });
  assertEquals(calls, ["fetch", "touch"]);
});

Deno.test("revoked devolve revoked e NÃO faz touch", async () => {
  const { db, calls } = fakeDB({ status: "revoked" });
  const r = await handleValidate({ key: "MOS-X" }, db);
  assertEquals(r.json, { status: "revoked" });
  assertEquals(calls, ["fetch"]);
});

Deno.test("key inexistente devolve not_found", async () => {
  const { db } = fakeDB(null);
  const r = await handleValidate({ key: "MOS-NOPE" }, db);
  assertEquals(r.json, { status: "not_found" });
});

Deno.test("sem key devolve 400", async () => {
  const { db } = fakeDB(null);
  const r = await handleValidate({}, db);
  assertEquals(r.http, 400);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `deno test supabase/functions/license-validate/handler.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar (handler puro + wiring Deno.serve)**

```ts
// supabase/functions/license-validate/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface DB {
  fetchByKey(key: string): Promise<{ status: string } | null>;
  touch(key: string): Promise<void>;
}

export async function handleValidate(body: unknown, db: DB): Promise<{ http: number; json: unknown }> {
  const key = (body as Record<string, unknown>)?.key;
  if (typeof key !== "string" || key.length === 0) {
    return { http: 400, json: { error: "key obrigatória" } };
  }
  const row = await db.fetchByKey(key);
  if (!row) return { http: 200, json: { status: "not_found" } };
  if (row.status === "granted") await db.touch(key);
  return { http: 200, json: { status: row.status } };
}

function realDB(): DB {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  return {
    async fetchByKey(key) {
      const { data } = await sb.from("licencas").select("status").eq("key", key).maybeSingle();
      return data;
    },
    async touch(key) {
      await sb.rpc("noop").catch(() => {}); // placeholder removido abaixo
      await sb.from("licencas")
        .update({ last_seen: new Date().toISOString(), uso_count: undefined })
        .eq("key", key);
    },
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return Response.json({ error: "use POST" }, { status: 405 });
  const body = await req.json().catch(() => ({}));
  const { http, json } = await handleValidate(body, realDB());
  return Response.json(json, { status: http });
});
```

> Nota: o incremento de `uso_count` precisa ser atômico — fazer via RPC. Próximo step troca o `touch` por uma RPC SQL.

- [ ] **Step 4: Adicionar RPC atômica de telemetria (migration 0002)**

Create `supabase/migrations/0002_touch_licenca.sql`:

```sql
-- Incremento atômico de uso + last_seen + ativada_em na primeira vez.
create or replace function public.touch_licenca(p_key text)
returns void language sql security definer as $$
  update public.licencas
     set last_seen  = now(),
         uso_count  = uso_count + 1,
         ativada_em = coalesce(ativada_em, now())
   where key = p_key;
$$;
revoke all on function public.touch_licenca(text) from anon, authenticated;
```

Substituir o corpo de `touch` em `index.ts`:

```ts
    async touch(key) {
      await sb.rpc("touch_licenca", { p_key: key });
    },
```
E remover a linha placeholder `await sb.rpc("noop")...`.

- [ ] **Step 5: Rodar testes + aplicar migration**

```bash
deno test supabase/functions/license-validate/handler.test.ts   # PASS (4)
supabase migration up
```

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/license-validate supabase/migrations/0002_touch_licenca.sql
git commit -q -m "feat(license): function license-validate + RPC touch_licenca atômica"
```

---

### Task 5: Function `hotmart-webhook`

**Files:**
- Create: `supabase/functions/hotmart-webhook/index.ts`
- Test: `supabase/functions/hotmart-webhook/handler.test.ts`

- [ ] **Step 1: Teste que falha**

```ts
// supabase/functions/hotmart-webhook/handler.test.ts
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleWebhook, type WebhookDB } from "./index.ts";

const aprovado = {
  event: "PURCHASE_APPROVED",
  data: { purchase: { transaction: "HP1", status: "APPROVED" }, buyer: { email: "a@b.com" } },
};
const fixedKey = () => "MOS-AAAA-BBBB-CCCC";

function fakeDB(existing: { key: string } | null) {
  const inserts: any[] = [];
  const db: WebhookDB = {
    fetchByTransacao: (_t) => Promise.resolve(existing),
    insert: (row) => { inserts.push(row); return Promise.resolve(); },
  };
  return { db, inserts };
}

Deno.test("hottok errado → 401", async () => {
  const { db } = fakeDB(null);
  const r = await handleWebhook({ "x-hotmart-hottok": "x" }, aprovado, "segredo", db, fixedKey);
  assertEquals(r.http, 401);
});

Deno.test("evento não-aprovado → ignorado (200, sem insert)", async () => {
  const { db, inserts } = fakeDB(null);
  const cancel = { data: { purchase: { transaction: "HP2", status: "CANCELED" }, buyer: { email: "a@b.com" } } };
  const r = await handleWebhook({ "x-hotmart-hottok": "segredo" }, cancel, "segredo", db, fixedKey);
  assertEquals(r.http, 200);
  assertEquals((r.json as any).ignored, true);
  assertEquals(inserts.length, 0);
});

Deno.test("aprovado novo → emite key e insere", async () => {
  const { db, inserts } = fakeDB(null);
  const r = await handleWebhook({ "x-hotmart-hottok": "segredo" }, aprovado, "segredo", db, fixedKey);
  assertEquals((r.json as any).key, "MOS-AAAA-BBBB-CCCC");
  assertEquals(inserts.length, 1);
  assertEquals(inserts[0].transacao, "HP1");
  assertEquals(inserts[0].origem, "hotmart");
});

Deno.test("transação duplicada → idempotente, devolve key existente, sem novo insert", async () => {
  const { db, inserts } = fakeDB({ key: "MOS-OLD" });
  const r = await handleWebhook({ "x-hotmart-hottok": "segredo" }, aprovado, "segredo", db, fixedKey);
  assertEquals((r.json as any).key, "MOS-OLD");
  assert((r.json as any).idempotent);
  assertEquals(inserts.length, 0);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `deno test supabase/functions/hotmart-webhook/handler.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar**

```ts
// supabase/functions/hotmart-webhook/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseHotmart, verifyHottok } from "../_shared/hotmart.ts";
import { gerarKey } from "../_shared/keygen.ts";

export interface WebhookDB {
  fetchByTransacao(t: string): Promise<{ key: string } | null>;
  insert(row: { key: string; email: string; transacao: string; origem: string; status: string; plano: string }): Promise<void>;
}

export async function handleWebhook(
  headers: Record<string, string>,
  body: Record<string, unknown>,
  hottok: string,
  db: WebhookDB,
  keygen: () => string = gerarKey,
): Promise<{ http: number; json: unknown }> {
  if (!verifyHottok(headers, body, hottok)) return { http: 401, json: { error: "hottok inválido" } };
  const evt = parseHotmart(body);
  if (!evt || evt.status !== "APPROVED") return { http: 200, json: { ignored: true } };
  const existing = await db.fetchByTransacao(evt.transacao);
  if (existing) return { http: 200, json: { key: existing.key, idempotent: true } };
  const key = keygen();
  await db.insert({ key, email: evt.email, transacao: evt.transacao, origem: "hotmart", status: "granted", plano: "tripwire" });
  return { http: 200, json: { key } };
}

function realDB(): WebhookDB {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  return {
    async fetchByTransacao(t) {
      const { data } = await sb.from("licencas").select("key").eq("transacao", t).maybeSingle();
      return data;
    },
    async insert(row) {
      await sb.from("licencas").insert(row);
    },
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return Response.json({ error: "use POST" }, { status: 405 });
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));
  const body = await req.json().catch(() => ({}));
  const { http, json } = await handleWebhook(headers, body, Deno.env.get("HOTMART_HOTTOK") ?? "", realDB());
  return Response.json(json, { status: http });
});
```

- [ ] **Step 4: Rodar e ver passar**

Run: `deno test supabase/functions/hotmart-webhook/handler.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/hotmart-webhook
git commit -q -m "feat(license): function hotmart-webhook (idempotente por transação)"
```

---

### Task 6: Verificação de integração (local, end-to-end por curl)

**Files:** nenhum (verificação manual)

- [ ] **Step 1: Subir tudo local**

```bash
cd ~/Documents/Magnus/magnus-os-licenca
supabase start
supabase secrets set HOTMART_HOTTOK=segredo-teste     # local
supabase functions serve --no-verify-jwt &
```

- [ ] **Step 2: Simular compra aprovada (emite key)**

```bash
ANON=$(supabase status -o json | python3 -c "import sys,json;print(json.load(sys.stdin)['ANON_KEY'])")
curl -s -X POST "http://localhost:54321/functions/v1/hotmart-webhook" \
  -H "Authorization: Bearer $ANON" -H "x-hotmart-hottok: segredo-teste" -H "content-type: application/json" \
  -d '{"event":"PURCHASE_APPROVED","data":{"purchase":{"transaction":"HP-INT-1","status":"APPROVED"},"buyer":{"email":"teste@magnus.os"}}}'
```
Expected: `{"key":"MOS-XXXX-XXXX-XXXX"}`. Rodar de novo com a mesma transação → `{"key":"MOS-...","idempotent":true}` (mesma key).

- [ ] **Step 3: Validar a key emitida**

```bash
KEY=<cole a key do step 2>
curl -s -X POST "http://localhost:54321/functions/v1/license-validate" \
  -H "Authorization: Bearer $ANON" -H "content-type: application/json" -d "{\"key\":\"$KEY\"}"
```
Expected: `{"status":"granted"}`. Conferir no Studio (`http://localhost:54323`) que `uso_count` incrementou e `last_seen`/`ativada_em` preencheram.

- [ ] **Step 4: Validar key inexistente + revogação**

```bash
curl -s -X POST ".../license-validate" -H "Authorization: Bearer $ANON" -d '{"key":"MOS-NAO-EXISTE"}'   # {"status":"not_found"}
# No Studio, mudar status da key pra 'revoked', revalidar → {"status":"revoked"} (sem incrementar uso_count)
```

- [ ] **Step 5: Documentar no README + commit**

Create `README.md` com: o que é, como rodar local (steps acima), e o contrato das 2 functions (request/response). Depois:

```bash
git add README.md && git commit -q -m "docs: README do backend de licença"
```

---

### Task 7: Deploy no Supabase cloud

**Files:** nenhum (infra)

- [ ] **Step 1: Criar projeto cloud + linkar**

```bash
# Criar o projeto "magnus-os-licenca" no dashboard Supabase (ou: supabase projects create)
supabase link --project-ref <ref-do-projeto>
supabase db push                              # aplica migrations 0001 + 0002
supabase secrets set --env-file .env          # HOTMART_HOTTOK real
supabase functions deploy license-validate
supabase functions deploy hotmart-webhook
```

- [ ] **Step 2: Smoke test em produção**

Repetir os curls do Task 6 contra `https://<ref>.functions.supabase.co/...` (com transação `HP-PROD-SMOKE-1`). Confirmar emissão + validação. Depois marcar essa key de teste como `revoked` no Studio.

- [ ] **Step 3: Registrar URLs**

Anotar no README as URLs de produção das 2 functions (a do webhook vai pro painel Hotmart na Fase 5; a do validate vai pro instalador na Fase 4 e pro hook na Fase 2).

- [ ] **Step 4: Commit final**

```bash
git add README.md && git commit -q -m "docs: URLs de produção das functions de licença"
```

---

## Self-Review

**Spec coverage (§3.2 item 4, §3.4):** ✅ tabela `licencas` (Task 1, todas as colunas do spec + `transacao` pra idempotência) · ✅ `license-validate` auth-free com telemetria (Task 4) · ✅ `hotmart-webhook` com HOTTOK + idempotência (Task 5) · ✅ revogação manual (flip de status, verificado no Task 6.4). Desvio consciente: sem db function SECURITY DEFINER pra validate (a function usa service role) — registrado em "Decisões".

**Placeholder scan:** o `realDB.touch` placeholder (`sb.rpc("noop")`) é REMOVIDO explicitamente no Task 4 Step 4. `<ref-do-projeto>` / `<cole a key>` são valores de runtime (não código), aceitáveis em steps de infra/manual.

**Type consistency:** `DB` (validate) e `WebhookDB` (webhook) são interfaces distintas e consistentes entre teste e implementação. `gerarKey` assina `(rand?) => string` em todos os usos. `handleWebhook` assina `(headers, body, hottok, db, keygen?)` igual no teste e na borda.

**Dependências externas:** confirmar o formato exato do payload + header do HOTTOK no painel Hotmart fica pra Fase 5 (o parser cobre v2 + fallback; está marcado).

---

## Próximas fases (depois desta)
Fase 2 (Plugin Magnus OS — o hook de telemetria chama o `license-validate` desta fase) · Fase 3 (Painel BYO-API-key) · Fase 4 (Instalador — usa o `license-validate`) · Fase 5 (Hotmart → `hotmart-webhook` + página de obrigado). Cada uma terá seu próprio plano.
