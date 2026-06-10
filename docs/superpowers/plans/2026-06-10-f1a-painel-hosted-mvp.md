# F1a — Painel Hosted MVP (fatia fina) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o `magnus-painel` (local, single-user) em painel hosted multi-tenant em `magnusos.yuribranco.com.br`: login magic-link → workspace por tenant → skills rodando com a chave de plataforma → custo no `cost_ledger` com teto enforced → medidor visível.

**Architecture (decisão #0 = FATIA FINA, a validar no `/plan-eng-review`):** executor = **processo por run no mesmo box** (não container) — Bash confinado ao workspace do tenant (`additionalDirectories: []`, cwd = ws), chave Anthropic ÚNICA de plataforma (não há chave-por-tenant pra vazar — ver braindump §5 #0), fila FIFO in-process (`MAGNUS_MAX_CONCURRENT_RUNS=2` no box 1vCPU). Multi-tenancy por **AsyncLocalStorage**: `templateRoot()` resolve do contexto da request → todas as libs existentes (campaigns/empresa/files/watcher) ficam multi-tenant sem mudar assinatura. Workspace primário em disco (`/var/lib/magnusos/ws/<tenant_id>/`), espelhado pro Supabase Storage após cada run (durabilidade); hydrate quando o disco não tem. Rotas fora da allowlist F1a respondem 501. Container sandbox/BullMQ/reserva atômica = F1b.

**Tech Stack:** Next.js 16 (painel forkado pra `magnus-os-online/painel/`) · Supabase (Auth magic-link PKCE, Postgres com RLS já aplicado na F0, Storage) · `@supabase/ssr` + `@supabase/supabase-js` · `@anthropic-ai/claude-agent-sdk` (com `ANTHROPIC_API_KEY` de plataforma) · vitest · VPS Portal `72.60.241.64` (pm2 root, porta 3100, nginx+TLS já no ar da F0).

**Fontes:** braindump `magnus-os/docs/superpowers/specs/2026-06-10-f1-painel-hosted-BRAINDUMP.md` · design mestre `2026-06-10-magnus-os-online-gestao-design.md` · blueprint SP-1 `2026-06-01-magnus-os-hosted-saas-design.md` §3.

**Base do fork:** `~/Documents/Magnus/magnus-imersao/painel-aula-4/magnus-painel` @ `b5fc883` (medidor de crédito já dentro). Schema alvo: migrations 0001-0003 do `magnus-os-online` (LIVE).

## 🛠️ gstack skills integradas — OBRIGATÓRIAS

| Trigger | Skill | Quando |
|---|---|---|
| Este plano, antes de codar | `/plan-eng-review` + `/codex review` | Valida decisão #0 + plano (Task 0) |
| Qualquer erro durante execução | `/investigate` | SEMPRE antes de chutar fix |
| Task com arquivo > 80 linhas novas | `/simplify` | Antes do commit |
| Pré-merge/deploy | `/review` + `/codex review` | Task 15 |
| Pós-deploy produção | `/canary` | Task 14 (VPS compartilhado c/ Portal!) |
| UI final | `/qa-only` | Task 16 |

## Env vars novas (referência única)

| Var | Onde | Valor |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | painel (build+runtime) | `https://jvxttcmazquypscjuaiz.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | painel | anon key (1Password `magnus-os-online-secrets`) |
| `SUPABASE_SERVICE_ROLE_KEY` | painel (server only) | service role (1Password) |
| `ANTHROPIC_API_KEY` | painel (server only) | **chave de PLATAFORMA — Yuri cria no console Anthropic (MANUAL)** |
| `MAGNUS_MODE` | painel | `hosted` (ativa auth/allowlist; ausente = local/dev) |
| `MAGNUS_WS_ROOT` | painel | `/var/lib/magnusos/ws` (dev local: tmpdir) |
| `MAGNUS_TEMPLATE_DIR` | painel | `/var/lib/magnusos/template` (skeleton contexto/operacao) |
| `MAGNUS_SKILLS_DIR` | painel | `/var/lib/magnusos/plugin-skills` (já suportado por `paths.ts`) |
| `MAGNUS_SITE_URL` | painel | `https://magnusos.yuribranco.com.br` |
| `MAGNUS_MAX_CONCURRENT_RUNS` | painel | `2` |

**Passos MANUAIS do Yuri (podem rodar em paralelo às Tasks 1-13):** (a) criar `ANTHROPIC_API_KEY` de plataforma no console Anthropic → guardar no 1Password `magnus-os-online-secrets` campo `ANTHROPIC_API_KEY`; (b) opcional p/ CI: `gh auth refresh -h github.com -s workflow`.

---

## File Structure (decomposição travada)

```
magnus-os-online/
  painel/                              ← Task 1: fork do magnus-painel b5fc883
    lib/hosted/                        ← TUDO que é específico do hosted vive aqui
      tenant-context.ts (+test)        ← Task 2: AsyncLocalStorage {tenantId, wsRoot}
      supabase.ts                      ← Task 3: sessionClient (cookies) + serviceClient
      tenant.ts (+test)                ← Task 3: resolveTenant/requireTenant (sessão→tenant row)
      route-guard.ts (+test)           ← Task 5: allowlist + auth + same-origin (lógica pura)
      ws.ts (+test)                    ← Task 6: tenantWs/ensureWorkspace (seed do template)
      ledger.ts (+test)                ← Task 7: budgetGate/recordRunUsage/runs rows (DB injetável)
      run-queue.ts (+test)             ← Task 8: fila FIFO de slots de run
      ws-storage.ts (+test)            ← Task 10: hydrate/syncOut Supabase Storage (ops injetável)
    lib/paths.ts                       ← Task 2: templateRoot() consulta o ALS primeiro
    lib/runs-runtime.ts                ← Task 8: tenantId/wsRoot, API key, confinamento, ledger
    lib/watcher.ts                     ← Task 12: Map<root, FSWatcher> (por tenant)
    middleware.ts                      ← Task 5: hosted = auth+allowlist (substitui loopback)
    app/login/page.tsx                 ← Task 4: form de magic link
    app/api/auth/login/route.ts        ← Task 4: signInWithOtp
    app/auth/callback/route.ts         ← Task 4: verifyOtp/exchangeCode → sessão
    app/api/health/route.ts            ← Task 13: substitui o server.mjs da F0
    app/api/usage/route.ts             ← Task 11: lê cost_ledger do tenant (não JSONL)
    app/api/run/start/route.ts         ← Task 9: tenant + budget gate + createRun(ctx)
    app/api/run/[id]/{stream,answer,abort}/route.ts ← Task 9: ownership por tenant
    app/api/{campaigns*,files,watch}/  ← Task 12: wrapper runWithTenant (diff uniforme)
    app/{page,boot/page,c/[slug]/page}.tsx ← Task 12: dados lidos dentro do runWithTenant
  supabase/migrations/0004_storage_bucket.sql ← Task 10
  infra/ + ecosystem.config.cjs        ← Task 14: pm2 aponta pro painel (sai o health server)
```

**O que NÃO muda:** `lib/skills.ts`/`lib/prompt.ts` (skills vêm de `MAGNUS_SKILLS_DIR`, global), `lib/agent-sdk-map.ts` (extractUsage fica), components da UI (CreditBadge consome o mesmo shape), `lib/usage-store.ts` (fica no fork mas sem chamadas — removê-lo é ruído de diff; YAGNI).

**Rotas 501 na F1a (allowlist na Task 5):** `/api/chat`, `/api/empresa`, `/api/meta/*`, `/api/notion/*`, `/api/radar-config`, `/api/radar-usage`, `/api/update`, `/api/apikey`, `/api/mcp/*`, `/api/deps/*`, `/api/files/reveal`.

---

### Task 0: Gates do plano (ANTES de codar)

- [ ] **Step 1:** Rodar `/plan-eng-review` neste plano. Foco: decisão #0 (processo vs container — threat model com chave de plataforma única), ALS como mecanismo de tenancy, disco-primário+Storage-espelho, fila in-process, enforcement não-atômico (corrida de teto aceita na F1a? documentar).
- [ ] **Step 2:** Rodar `/codex review` no plano. Foldar achados.
- [ ] **Step 3:** Commit do plano revisado em `magnus-os/docs/superpowers/plans/`.

### Task 1: Fork do painel pro repo magnus-os-online

**Files:** Create: `magnus-os-online/painel/` (cópia integral)

- [ ] **Step 1: Copiar o painel (sem node_modules/.next/.git)**

```bash
cd ~/Documents/Magnus/magnus-os-online
rsync -a --exclude node_modules --exclude .next --exclude .git \
  ~/Documents/Magnus/magnus-imersao/painel-aula-4/magnus-painel/ painel/
```

- [ ] **Step 2: Instalar deps + as novas do hosted**

```bash
cd painel && npm install && npm install @supabase/ssr @supabase/supabase-js
```

- [ ] **Step 3: Baseline verde** — Run: `npx vitest run` → Expected: todos os testes existentes PASS (em `b5fc883` eram 141). Run: `npx tsc --noEmit` → Expected: 0 erros.

- [ ] **Step 4: Commit**

```bash
cd ~/Documents/Magnus/magnus-os-online
git add painel && git commit -m "feat(f1a): fork do magnus-painel b5fc883 como base do painel hosted"
```

### Task 2: Contexto de tenant (AsyncLocalStorage) + paths multi-tenant

**Files:**
- Create: `painel/lib/hosted/tenant-context.ts`, `painel/lib/hosted/tenant-context.test.ts`
- Modify: `painel/lib/paths.ts:5-7`

- [ ] **Step 1: Teste falhando**

```ts
// painel/lib/hosted/tenant-context.test.ts
import { describe, it, expect } from "vitest";
import { runWithTenant, currentTenant } from "./tenant-context";
import { templateRoot } from "../paths";

describe("tenant-context", () => {
  it("fora do contexto → undefined e templateRoot cai no fallback local", () => {
    expect(currentTenant()).toBeUndefined();
    expect(templateRoot()).toBe(process.env.MAGNUS_PAINEL_CWD || process.cwd());
  });

  it("dentro do contexto, templateRoot = wsRoot do tenant (inclusive através de await)", async () => {
    const out = await runWithTenant({ tenantId: "t-1", wsRoot: "/tmp/ws/t-1" }, async () => {
      await Promise.resolve();
      return { ctx: currentTenant(), root: templateRoot() };
    });
    expect(out.ctx?.tenantId).toBe("t-1");
    expect(out.root).toBe("/tmp/ws/t-1");
  });

  it("contextos concorrentes não vazam um no outro", async () => {
    const [a, b] = await Promise.all([
      runWithTenant({ tenantId: "a", wsRoot: "/ws/a" }, async () => { await new Promise((r) => setTimeout(r, 10)); return templateRoot(); }),
      runWithTenant({ tenantId: "b", wsRoot: "/ws/b" }, async () => templateRoot()),
    ]);
    expect(a).toBe("/ws/a");
    expect(b).toBe("/ws/b");
  });
});
```

- [ ] **Step 2:** Run `npx vitest run lib/hosted/tenant-context.test.ts` → FAIL ("Cannot find module ./tenant-context").

- [ ] **Step 3: Implementar**

```ts
// painel/lib/hosted/tenant-context.ts
/**
 * Contexto de tenant por request (AsyncLocalStorage). É o coração da multi-tenancy
 * da fatia fina: rotas/páginas autenticam → runWithTenant(ctx, handler) → templateRoot()
 * resolve pro workspace do tenant → TODAS as libs existentes (campaigns/empresa/files/
 * watcher) ficam multi-tenant sem mudar assinatura. O contexto flui através de await.
 */
import { AsyncLocalStorage } from "node:async_hooks";

export interface TenantCtx {
  tenantId: string;
  wsRoot: string;
}

// No globalThis pela MESMA razão do __magnusRuns (runs-runtime.ts:54): hot-reload do
// next dev / bundles duplicados criariam instâncias divergentes e templateRoot() cairia
// no fallback SILENCIOSAMENTE (= workspace errado). [eng-review D2]
const g = globalThis as unknown as { __magnusTenantAls?: AsyncLocalStorage<TenantCtx> };
const als: AsyncLocalStorage<TenantCtx> = g.__magnusTenantAls ?? (g.__magnusTenantAls = new AsyncLocalStorage<TenantCtx>());

export function runWithTenant<T>(ctx: TenantCtx, fn: () => T): T {
  return als.run(ctx, fn);
}

export function currentTenant(): TenantCtx | undefined {
  return als.getStore();
}
```

E em `painel/lib/paths.ts`, substituir a função `templateRoot` (linhas 5-7):

```ts
import { currentTenant } from "./hosted/tenant-context";

/** Raiz do workspace: tenant da request (hosted) ou MAGNUS_PAINEL_CWD (local/dev). */
export function templateRoot(): string {
  const t = currentTenant();
  if (t) return t.wsRoot;
  return process.env.MAGNUS_PAINEL_CWD || process.cwd();
}
```

- [ ] **Step 4:** Run `npx vitest run` → Expected: novos PASS + todos os antigos PASS (fallback preservado).

- [ ] **Step 5: Commit** — `git add painel/lib && git commit -m "feat(f1a): contexto de tenant via AsyncLocalStorage — templateRoot multi-tenant"`

### Task 3: Clients Supabase + resolução de tenant da sessão

**Files:**
- Create: `painel/lib/hosted/supabase.ts`, `painel/lib/hosted/tenant.ts`, `painel/lib/hosted/tenant.test.ts`

- [ ] **Step 1: Teste falhando**

```ts
// painel/lib/hosted/tenant.test.ts
import { describe, it, expect } from "vitest";
import { resolveTenant, TenantError, type TenantDeps } from "./tenant";

function deps(over: Partial<TenantDeps>): TenantDeps {
  return {
    getUser: async () => ({ id: "u-1" }),
    getTenantByAuthId: async () => ({ id: "t-1", email: "a@b.c", status: "active", plan: { key_source: "platform", limits: { usd_month: 20 } } }),
    ...over,
  };
}

describe("resolveTenant", () => {
  it("sessão válida + tenant ativo → tenant", async () => {
    const t = await resolveTenant(deps({}));
    expect(t.id).toBe("t-1");
    expect(t.plan.limits?.usd_month).toBe(20);
  });
  it("sem sessão → 401", async () => {
    await expect(resolveTenant(deps({ getUser: async () => null }))).rejects.toMatchObject({ status: 401 });
  });
  it("user sem tenant → 403", async () => {
    await expect(resolveTenant(deps({ getTenantByAuthId: async () => null }))).rejects.toMatchObject({ status: 403 });
  });
  it("tenant suspenso → 403 com mensagem clara", async () => {
    const p = resolveTenant(deps({ getTenantByAuthId: async () => ({ id: "t-1", email: "a@b.c", status: "suspended", plan: { key_source: "platform" } }) }));
    await expect(p).rejects.toMatchObject({ status: 403 });
    await expect(p).rejects.toThrow(/suspended/);
  });
  it("erros são TenantError (distinguíveis de bug)", async () => {
    await expect(resolveTenant(deps({ getUser: async () => null }))).rejects.toBeInstanceOf(TenantError);
  });
});
```

- [ ] **Step 2:** Run → FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

```ts
// painel/lib/hosted/supabase.ts
/**
 * Dois clients: sessionClient (anon key + cookies da request — identidade do usuário)
 * e serviceClient (service role — leituras/escritas do backend: tenants, ledger, storage).
 * Service role NUNCA chega ao browser; este módulo é server-only.
 */
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export async function sessionClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => {
          try {
            for (const { name, value, options } of list) cookieStore.set(name, value, options);
          } catch {
            // Server Component sem permissão de escrever cookie — middleware cobre o refresh.
          }
        },
      },
    },
  );
}

let service: SupabaseClient | undefined;
export function serviceClient(): SupabaseClient {
  if (!service) {
    service = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return service;
}
```

```ts
// painel/lib/hosted/tenant.ts
import { sessionClient, serviceClient } from "./supabase";

export interface Tenant {
  id: string;
  email: string;
  status: string;
  plan: { key_source: string; limits?: { usd_month?: number } };
}

export class TenantError extends Error {
  constructor(public status: number, msg: string) {
    super(msg);
    this.name = "TenantError";
  }
}

/** Dependências injetáveis — testes usam fakes; requireTenant() liga o real. */
export interface TenantDeps {
  getUser(): Promise<{ id: string } | null>;
  getTenantByAuthId(authId: string): Promise<Tenant | null>;
}

export async function resolveTenant(deps: TenantDeps): Promise<Tenant> {
  const user = await deps.getUser();
  if (!user) throw new TenantError(401, "não autenticado");
  const tenant = await deps.getTenantByAuthId(user.id);
  if (!tenant) throw new TenantError(403, "nenhuma assinatura vinculada a este usuário");
  if (tenant.status !== "active") throw new TenantError(403, `assinatura ${tenant.status} — fale com o suporte`);
  return tenant;
}

/** Resolve o tenant da sessão atual (rotas e páginas server-side). */
export async function requireTenant(): Promise<Tenant> {
  return resolveTenant({
    getUser: async () => {
      const sb = await sessionClient();
      const { data, error } = await sb.auth.getUser();
      if (error || !data.user) return null;
      return { id: data.user.id };
    },
    getTenantByAuthId: async (authId) => {
      const { data, error } = await serviceClient()
        .from("tenants")
        .select("id, email, status, plan")
        .eq("auth_user_id", authId)
        .maybeSingle();
      if (error) throw error; // erro de DB ≠ TenantError: deve virar 500, não 403
      return (data as Tenant | null) ?? null;
    },
  });
}

/** Converte TenantError em Response; outros erros propagam (500). */
export function tenantErrorResponse(e: unknown): Response | null {
  if (e instanceof TenantError) {
    return Response.json({ error: e.message }, { status: e.status });
  }
  return null;
}
```

- [ ] **Step 4:** Run `npx vitest run lib/hosted/tenant.test.ts` → PASS. `npx tsc --noEmit` → 0 erros.

- [ ] **Step 5: Commit** — `git add painel/lib/hosted && git commit -m "feat(f1a): clients supabase + resolução sessão→tenant com gates de status"`

### Task 4: Login magic-link (página + rotas de auth)

**Files:**
- Create: `painel/app/login/page.tsx`, `painel/app/login/LoginForm.tsx`, `painel/app/api/auth/login/route.ts`, `painel/app/auth/callback/route.ts`, `painel/app/api/auth/logout/route.ts`

- [ ] **Step 1: Rota de login (envia magic link)**

```ts
// painel/app/api/auth/login/route.ts
import { NextResponse } from "next/server";
import { sessionClient } from "@/lib/hosted/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { email?: string };
  const email = body.email?.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "email inválido" }, { status: 400 });
  }
  const sb = await sessionClient();
  const site = process.env.MAGNUS_SITE_URL || "https://magnusos.yuribranco.com.br";
  // shouldCreateUser:false — só entra quem o webhook da Hotmart provisionou (compra real).
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${site}/auth/callback`, shouldCreateUser: false },
  });
  if (error) {
    // não vazar se o email existe ou não — mensagem única
    return NextResponse.json({ ok: true, note: "se houver assinatura, o link chegou" });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Callback (token_hash OU code PKCE — cobre os dois formatos do Supabase)**

```ts
// painel/app/auth/callback/route.ts
import { NextResponse } from "next/server";
import { sessionClient } from "@/lib/hosted/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const code = url.searchParams.get("code");
  const sb = await sessionClient();
  if (tokenHash && type === "email") {
    const { error } = await sb.auth.verifyOtp({ type: "email", token_hash: tokenHash });
    if (error) return NextResponse.redirect(new URL(`/login?erro=${encodeURIComponent(error.message)}`, url.origin));
  } else if (code) {
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(new URL(`/login?erro=${encodeURIComponent(error.message)}`, url.origin));
  } else {
    return NextResponse.redirect(new URL("/login?erro=link%20inv%C3%A1lido", url.origin));
  }
  return NextResponse.redirect(new URL("/", url.origin));
}
```

```ts
// painel/app/api/auth/logout/route.ts
import { NextResponse } from "next/server";
import { sessionClient } from "@/lib/hosted/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const sb = await sessionClient();
  await sb.auth.signOut();
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Página de login** (estética do design system do painel — classes existentes)

```tsx
// painel/app/login/page.tsx
import Image from "next/image";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <div className="app-shell app-shell--no-sidebar">
      <main className="main" style={{ alignItems: "center", justifyContent: "center", display: "flex" }}>
        <div style={{ maxWidth: 420, width: "100%", display: "flex", flexDirection: "column", gap: 24, padding: 24 }}>
          <Image src="/logo-magnus-light.png" alt="Magnus OS" width={140} height={26} style={{ height: 26, width: "auto" }} />
          <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em", margin: 0 }}>Entrar no Magnus OS</h1>
          <p style={{ color: "var(--text-secondary)", margin: 0, lineHeight: 1.6 }}>
            Use o email da sua compra na Hotmart. Você recebe um link de acesso — sem senha.
          </p>
          <LoginForm />
        </div>
      </main>
    </div>
  );
}
```

```tsx
// painel/app/login/LoginForm.tsx
"use client";
import { useState } from "react";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setState(res.ok ? "sent" : "error");
  }

  if (state === "sent") {
    return <p style={{ color: "var(--text-secondary)" }}>📬 Link enviado. Confira seu email (e o spam) — vale por 1 hora.</p>;
  }
  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <input
        type="email"
        required
        placeholder="seu@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
        style={{ padding: "12px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)", fontSize: 15 }}
      />
      <button className="btn btn--primary" type="submit" disabled={state === "sending"} style={{ padding: "12px 14px" }}>
        {state === "sending" ? "Enviando…" : "Receber link de acesso"}
      </button>
      {state === "error" && <p style={{ color: "var(--danger, #d33)", margin: 0 }}>Não deu — confere o email e tenta de novo.</p>}
    </form>
  );
}
```

- [ ] **Step 4:** `npx tsc --noEmit` → 0 erros. (Teste e2e do fluxo = Task 15; aqui é estrutural.)

- [ ] **Step 5: Commit** — `git add painel/app && git commit -m "feat(f1a): login magic-link (página + otp + callback token_hash/PKCE + logout)"`

### Task 5: Middleware hosted — auth + allowlist + same-origin

**Files:**
- Create: `painel/lib/hosted/route-guard.ts`, `painel/lib/hosted/route-guard.test.ts`
- Modify: `painel/middleware.ts` (substitui o loopback guard — que bloquearia TUDO no hosted, host ≠ localhost)

- [ ] **Step 1: Teste falhando**

```ts
// painel/lib/hosted/route-guard.test.ts
import { describe, it, expect } from "vitest";
import { guardHosted } from "./route-guard";

const SITE = "https://magnusos.yuribranco.com.br";

describe("guardHosted", () => {
  it("health é público", () => {
    expect(guardHosted({ pathname: "/api/health", method: "GET", hasSession: false, origin: null, site: SITE }).ok).toBe(true);
  });
  it("auth/login passa sem sessão mas exige same-origin no POST", () => {
    expect(guardHosted({ pathname: "/api/auth/login", method: "POST", hasSession: false, origin: SITE, site: SITE }).ok).toBe(true);
    const cross = guardHosted({ pathname: "/api/auth/login", method: "POST", hasSession: false, origin: "https://evil.com", site: SITE });
    expect(cross).toMatchObject({ ok: false, status: 403 });
  });
  it("rota fora da allowlist → 501 mesmo logado", () => {
    expect(guardHosted({ pathname: "/api/meta/sync", method: "POST", hasSession: true, origin: SITE, site: SITE })).toMatchObject({ ok: false, status: 501 });
    expect(guardHosted({ pathname: "/api/update", method: "POST", hasSession: true, origin: SITE, site: SITE })).toMatchObject({ ok: false, status: 501 });
  });
  it("rota da allowlist sem sessão → 401", () => {
    expect(guardHosted({ pathname: "/api/run/start", method: "POST", hasSession: false, origin: SITE, site: SITE })).toMatchObject({ ok: false, status: 401 });
  });
  it("mutação cross-origin → 403 mesmo logado (CSRF)", () => {
    expect(guardHosted({ pathname: "/api/run/start", method: "POST", hasSession: true, origin: "https://evil.com", site: SITE })).toMatchObject({ ok: false, status: 403 });
  });
  it("GET logado na allowlist passa (origin null ok em GET)", () => {
    expect(guardHosted({ pathname: "/api/campaigns", method: "GET", hasSession: true, origin: null, site: SITE }).ok).toBe(true);
    expect(guardHosted({ pathname: "/api/run/abc123/stream", method: "GET", hasSession: true, origin: null, site: SITE }).ok).toBe(true);
  });
  it("página sem sessão → redirect /login; /login e /auth/* passam", () => {
    expect(guardHosted({ pathname: "/boot", method: "GET", hasSession: false, origin: null, site: SITE })).toMatchObject({ ok: false, redirect: "/login" });
    expect(guardHosted({ pathname: "/login", method: "GET", hasSession: false, origin: null, site: SITE }).ok).toBe(true);
    expect(guardHosted({ pathname: "/auth/callback", method: "GET", hasSession: false, origin: null, site: SITE }).ok).toBe(true);
  });
});
```

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3: Implementar**

```ts
// painel/lib/hosted/route-guard.ts
/**
 * Decisões de acesso do hosted (puras, testáveis). O middleware fino só liga isto
 * aos cookies/headers reais. Allowlist F1a: o que não está portado responde 501
 * (e não 404 — sinaliza "existe, mas não nesta fase").
 */
export interface GuardInput {
  pathname: string;
  method: string;
  hasSession: boolean;
  origin: string | null;
  site: string; // MAGNUS_SITE_URL
}

export type GuardVerdict =
  | { ok: true }
  | { ok: false; status: number; reason: string }
  | { ok: false; redirect: string };

const API_ALLOW: RegExp[] = [
  /^\/api\/health$/,
  /^\/api\/auth\/(login|logout)$/,
  /^\/api\/skills$/,
  /^\/api\/run\/[^/]+\/(stream|answer|abort)$/,
  /^\/api\/run\/start$/,
  /^\/api\/campaigns(\/(create|briefing))?$/,
  /^\/api\/files$/,
  /^\/api\/watch\/stream$/,
  /^\/api\/usage$/,
];

const PUBLIC_PAGES = [/^\/login$/, /^\/auth\//];

function sameOrigin(origin: string | null, site: string): boolean {
  // Mutação SEM Origin é rejeitada (codex C1: browsers modernos SEMPRE mandam Origin
  // em POST; ausência = cliente não-browser ou muito antigo — não confiar).
  if (!origin) return false;
  try {
    return new URL(origin).host === new URL(site).host;
  } catch {
    return false;
  }
}

export function guardHosted(i: GuardInput): GuardVerdict {
  const mutating = i.method !== "GET" && i.method !== "HEAD" && i.method !== "OPTIONS";

  if (i.pathname.startsWith("/api/")) {
    if (i.pathname === "/api/health") return { ok: true };
    if (!API_ALLOW.some((r) => r.test(i.pathname))) {
      return { ok: false, status: 501, reason: "rota indisponível no Magnus OS Online (F1a)" };
    }
    if (mutating && !sameOrigin(i.origin, i.site)) {
      return { ok: false, status: 403, reason: "origin inválida" };
    }
    if (i.pathname.startsWith("/api/auth/")) return { ok: true };
    if (!i.hasSession) return { ok: false, status: 401, reason: "não autenticado" };
    return { ok: true };
  }

  // páginas
  if (PUBLIC_PAGES.some((r) => r.test(i.pathname))) return { ok: true };
  if (!i.hasSession) return { ok: false, redirect: "/login" };
  return { ok: true };
}
```

E o `painel/middleware.ts` (conteúdo INTEIRO substituído):

```ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { guardHosted } from "@/lib/hosted/route-guard";
import { guardLocalRequest } from "@/lib/loopback";

/**
 * MAGNUS_MODE=hosted → auth de sessão Supabase + allowlist F1a + same-origin (CSRF).
 * Sem MAGNUS_MODE → comportamento local original (loopback guard) — o fork continua
 * rodável em dev na máquina (npm run dev) sem Supabase.
 */
export async function middleware(req: NextRequest) {
  if (process.env.MAGNUS_MODE !== "hosted") {
    if (!req.nextUrl.pathname.startsWith("/api/")) return NextResponse.next();
    const v = guardLocalRequest(req.headers.get("host"), req.method, req.headers.get("origin"));
    if (!v.ok) return new NextResponse(`forbidden: ${v.reason}`, { status: v.status });
    return NextResponse.next();
  }

  // refresh de sessão + leitura do user (padrão @supabase/ssr p/ middleware)
  let res = NextResponse.next({ request: req });
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list) => {
          for (const { name, value } of list) req.cookies.set(name, value);
          res = NextResponse.next({ request: req });
          for (const { name, value, options } of list) res.cookies.set(name, value, options);
        },
      },
    },
  );
  // getClaims = verificação de assinatura JWT LOCAL (JWKS cacheado) — sem roundtrip
  // ao Supabase (Oregon ~180ms) por request. Trade-off aceito [eng-review D3]: claims
  // valem até expirar (~1h) — revogação instantânea não é necessária na F1a; o
  // requireTenant() das rotas que AGEM ainda valida o user na fonte.
  const { data: claims } = await sb.auth.getClaims();

  const verdict = guardHosted({
    pathname: req.nextUrl.pathname,
    method: req.method,
    hasSession: Boolean(claims?.claims?.sub),
    origin: req.headers.get("origin"),
    site: process.env.MAGNUS_SITE_URL || "https://magnusos.yuribranco.com.br",
  });

  if (verdict.ok) return res;
  if ("redirect" in verdict) return NextResponse.redirect(new URL(verdict.redirect, req.url));
  return NextResponse.json({ error: verdict.reason }, { status: verdict.status });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo-).*)"],
};
```

- [ ] **Step 4:** Run `npx vitest run lib/hosted/route-guard.test.ts` → PASS. `npx tsc --noEmit` → 0. `npx vitest run` → suite inteira PASS (loopback.test.ts continua valendo pro modo local).

- [ ] **Step 5: Commit** — `git add painel && git commit -m "feat(f1a): middleware hosted — sessão supabase + allowlist 501 + same-origin"`

### Task 6: Workspace por tenant em disco (seed do template)

**Files:**
- Create: `painel/lib/hosted/ws.ts`, `painel/lib/hosted/ws.test.ts`

- [ ] **Step 1: Teste falhando**

```ts
// painel/lib/hosted/ws.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { tenantWs, ensureWorkspace } from "./ws";

const T1 = "11111111-2222-3333-4444-555555555555";
let base: string;
let tpl: string;

beforeEach(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), "ws-"));
  tpl = fs.mkdtempSync(path.join(os.tmpdir(), "tpl-"));
  fs.mkdirSync(path.join(tpl, "contexto"), { recursive: true });
  fs.mkdirSync(path.join(tpl, "operacao"), { recursive: true });
  fs.writeFileSync(path.join(tpl, "contexto", "EMPRESA.md"), "# template");
  process.env.MAGNUS_WS_ROOT = base;
  process.env.MAGNUS_TEMPLATE_DIR = tpl;
});
afterEach(() => {
  fs.rmSync(base, { recursive: true, force: true });
  fs.rmSync(tpl, { recursive: true, force: true });
  delete process.env.MAGNUS_WS_ROOT;
  delete process.env.MAGNUS_TEMPLATE_DIR;
});

describe("ws", () => {
  it("tenantWs valida o id (path traversal não passa)", () => {
    expect(() => tenantWs("../../etc")).toThrow();
    expect(tenantWs(T1)).toBe(path.join(base, T1));
  });
  it("ensureWorkspace semeia do template na 1ª vez e é idempotente", () => {
    const dir = ensureWorkspace(T1);
    expect(fs.readFileSync(path.join(dir, "contexto", "EMPRESA.md"), "utf8")).toContain("template");
    expect(fs.existsSync(path.join(dir, ".magnus-painel", "runs"))).toBe(true);
    fs.writeFileSync(path.join(dir, "contexto", "EMPRESA.md"), "editado pelo tenant");
    ensureWorkspace(T1); // 2ª chamada NÃO pode sobrescrever
    expect(fs.readFileSync(path.join(dir, "contexto", "EMPRESA.md"), "utf8")).toBe("editado pelo tenant");
  });
});
```

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3: Implementar**

```ts
// painel/lib/hosted/ws.ts
/**
 * Workspace por tenant em DISCO (primário na fatia fina — single box).
 * Storage (Supabase) é o espelho durável: syncOut após cada run, hydrate quando o
 * disco não tem o workspace (ws-storage.ts). Seed: MAGNUS_TEMPLATE_DIR (skeleton
 * contexto/ + operacao/ do plugin).
 */
import fs from "node:fs";
import path from "node:path";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function wsBase(): string {
  return process.env.MAGNUS_WS_ROOT || "/var/lib/magnusos/ws";
}

export function tenantWs(tenantId: string): string {
  if (!UUID_RE.test(tenantId)) throw new Error(`tenantId inválido: ${tenantId}`);
  return path.join(wsBase(), tenantId);
}

/** Cria (se preciso) o workspace do tenant, semeando do template. Idempotente. */
export function ensureWorkspace(tenantId: string): string {
  const dir = tenantWs(tenantId);
  if (!fs.existsSync(path.join(dir, "contexto"))) {
    fs.mkdirSync(dir, { recursive: true });
    const tpl = process.env.MAGNUS_TEMPLATE_DIR?.trim();
    if (tpl && fs.existsSync(tpl)) {
      fs.cpSync(tpl, dir, { recursive: true });
    } else {
      fs.mkdirSync(path.join(dir, "contexto"), { recursive: true });
      fs.mkdirSync(path.join(dir, "operacao"), { recursive: true });
    }
  }
  fs.mkdirSync(path.join(dir, ".magnus-painel", "runs"), { recursive: true });
  return dir;
}
```

- [ ] **Step 4:** Run `npx vitest run lib/hosted/ws.test.ts` → PASS.

- [ ] **Step 5: Commit** — `git add painel/lib/hosted && git commit -m "feat(f1a): workspace por tenant em disco com seed do template (idempotente)"`

### Task 7: Ledger — budget gate + gravação de custo/runs (DB injetável)

**Files:**
- Create: `painel/lib/hosted/ledger.ts`, `painel/lib/hosted/ledger.test.ts`

- [ ] **Step 1: Teste falhando**

```ts
// painel/lib/hosted/ledger.test.ts
import { describe, it, expect } from "vitest";
import { budgetGate, recordRunUsage, type LedgerDB } from "./ledger";
import type { RunUsage } from "../types";

function fakeDB(remaining: number | null) {
  const costRows: unknown[] = [];
  const db: LedgerDB = {
    budgetRemaining: async () => remaining,
    insertCost: async (rows) => { costRows.push(...rows); },
    insertRun: async () => {},
    finishRun: async () => {},
  };
  return { db, costRows };
}

const usage: RunUsage[] = [
  { model: "claude-sonnet-4-6", inputTokens: 1000, outputTokens: 500, costUSD: 0.0123 },
  { model: "claude-haiku-4-5", inputTokens: 200, outputTokens: 50, costUSD: 0.0007 },
];

describe("budgetGate", () => {
  it("teto null (sem limite) → passa", async () => {
    expect(await budgetGate(fakeDB(null).db, "t-1")).toEqual({ ok: true, remaining: null });
  });
  it("restante > 0 → passa; == 0 → bloqueia", async () => {
    expect((await budgetGate(fakeDB(5.5).db, "t-1")).ok).toBe(true);
    expect((await budgetGate(fakeDB(0).db, "t-1")).ok).toBe(false);
  });
});

describe("recordRunUsage", () => {
  it("grava uma linha de cost_ledger por modelo com ref=runId", async () => {
    const { db, costRows } = fakeDB(null);
    await recordRunUsage(db, "t-1", "run-1", "checar-marca", usage);
    expect(costRows).toHaveLength(2);
    expect(costRows[0]).toMatchObject({ tenant_id: "t-1", service: "anthropic", ref: "run-1", skill: "checar-marca", model: "claude-sonnet-4-6", in_tok: 1000, out_tok: 500, usd: 0.0123 });
  });
  it("usage vazio → no-op; costUSD inválido é filtrado", async () => {
    const { db, costRows } = fakeDB(null);
    await recordRunUsage(db, "t-1", "run-1", "s", []);
    await recordRunUsage(db, "t-1", "run-2", "s", [{ model: "m", inputTokens: 1, outputTokens: 1, costUSD: NaN }]);
    expect(costRows).toHaveLength(0);
  });
});
```

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3: Implementar**

```ts
// painel/lib/hosted/ledger.ts
/**
 * Enforcement de orçamento + gravação de consumo no Supabase (cost_ledger + runs).
 * Interface LedgerDB injetável: testes usam fakes; realLedgerDB() liga o serviceClient.
 * NOTA F1a: o gate é checado ANTES do run (não-atômico — corrida de teto entre runs
 * concorrentes do mesmo tenant é aceita nesta fase; reserva atômica = F1b/eng-review).
 */
import { serviceClient } from "./supabase";
import type { RunUsage } from "../types";

export interface CostRow {
  tenant_id: string;
  service: string;
  ref: string;
  skill: string;
  model: string;
  in_tok: number;
  out_tok: number;
  usd: number;
}

export interface LedgerDB {
  budgetRemaining(tenantId: string): Promise<number | null>;
  insertCost(rows: CostRow[]): Promise<void>;
  insertRun(row: { id: string; tenant_id: string; skill: string; status: string; started_at: string }): Promise<void>;
  finishRun(id: string, status: "done" | "error", usage: RunUsage[] | undefined): Promise<void>;
}

export async function budgetGate(db: LedgerDB, tenantId: string): Promise<{ ok: boolean; remaining: number | null }> {
  const remaining = await db.budgetRemaining(tenantId);
  if (remaining === null) return { ok: true, remaining: null };
  return { ok: remaining > 0, remaining };
}

export async function recordRunUsage(db: LedgerDB, tenantId: string, runId: string, skill: string, usage: RunUsage[]): Promise<void> {
  const rows = usage
    .filter((u) => typeof u.costUSD === "number" && Number.isFinite(u.costUSD))
    .map((u) => ({
      tenant_id: tenantId,
      service: "anthropic",
      ref: runId,
      skill,
      model: u.model,
      in_tok: Math.max(0, Math.round(u.inputTokens || 0)),
      out_tok: Math.max(0, Math.round(u.outputTokens || 0)),
      usd: Math.round(u.costUSD * 10000) / 10000,
    }));
  if (rows.length === 0) return;
  await db.insertCost(rows);
}

export function realLedgerDB(): LedgerDB {
  const sb = serviceClient();
  return {
    async budgetRemaining(tenantId) {
      const { data, error } = await sb.rpc("tenant_budget_remaining", { p_tenant: tenantId });
      if (error) throw error;
      return data === null ? null : Number(data);
    },
    async insertCost(rows) {
      const { error } = await sb.from("cost_ledger").insert(rows);
      if (error) throw error;
    },
    async insertRun(row) {
      const { error } = await sb.from("runs").insert(row);
      if (error) throw error;
    },
    async finishRun(id, status, usage) {
      const { error } = await sb.from("runs").update({
        status,
        finished_at: new Date().toISOString(),
        ...(usage && usage.length > 0 ? { usage } : {}),
      }).eq("id", id);
      if (error) throw error;
    },
  };
}
```

- [ ] **Step 4:** Run `npx vitest run lib/hosted/ledger.test.ts` → PASS.

- [ ] **Step 5: Commit** — `git add painel/lib/hosted && git commit -m "feat(f1a): ledger — budget gate + cost_ledger/runs com DB injetável"`

### Task 8: Executor multi-tenant (runs-runtime) + fila de slots

**Files:**
- Create: `painel/lib/hosted/run-queue.ts`, `painel/lib/hosted/run-queue.test.ts`
- Modify: `painel/lib/runs-runtime.ts` (pontos exatos abaixo)
- Test: `painel/lib/runs-runtime.test.ts` (estender padrão existente)

- [ ] **Step 1: Teste da fila (falhando)**

```ts
// painel/lib/hosted/run-queue.test.ts
import { describe, it, expect } from "vitest";
import { RunQueue } from "./run-queue";

const tick = () => new Promise<void>((r) => setTimeout(r, 5));

describe("RunQueue", () => {
  it("respeita o máximo e libera em FIFO", async () => {
    const q = new RunQueue(2);
    const r1 = await q.acquire();
    const r2 = await q.acquire();
    let third = false;
    const p3 = q.acquire().then((rel) => { third = true; return rel; });
    await tick();
    expect(third).toBe(false); // 2 ocupados, 3º espera
    r1();
    const r3 = await p3;
    expect(third).toBe(true);
    r2(); r3();
    expect(q.active).toBe(0);
  });
  it("release duplo não corrompe a contagem", async () => {
    const q = new RunQueue(1);
    const r = await q.acquire();
    r(); r();
    expect(q.active).toBe(0);
    const r2 = await q.acquire(); // ainda funciona
    r2();
  });
});
```

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3: Implementar a fila**

```ts
// painel/lib/hosted/run-queue.ts
/**
 * Fila FIFO de slots de run (in-process). Box 1vCPU → MAGNUS_MAX_CONCURRENT_RUNS=2.
 * Singleton no globalThis (mesma razão do runs map: sobreviver hot-reload).
 */
export class RunQueue {
  active = 0;
  private waiting: Array<() => void> = [];
  constructor(private max: number) {}

  async acquire(): Promise<() => void> {
    if (this.active >= this.max) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    this.active++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active--;
      const next = this.waiting.shift();
      if (next) next();
    };
  }
}

const g = globalThis as unknown as { __magnusRunQueue?: RunQueue };
export function globalRunQueue(): RunQueue {
  return (g.__magnusRunQueue ??= new RunQueue(Number(process.env.MAGNUS_MAX_CONCURRENT_RUNS ?? "2")));
}
```

- [ ] **Step 4:** Run fila → PASS.

- [ ] **Step 5: Refactor do `runs-runtime.ts`** — diffs exatos:

(a) **Opts e handle ganham o contexto do tenant.** Na assinatura de `createRun` (linha 100), adicionar campos:

```ts
export async function createRun(opts: {
  id: string; skillSlug: string; prompt: string;
  permissionMode?: "default" | "acceptEdits" | "bypassPermissions";
  campaignSlug?: string; env?: Record<string, string>; model?: string;
  // hosted (F1a): presentes quando MAGNUS_MODE=hosted
  tenantId?: string; wsRoot?: string;
}) {
```

Em `RunHandle` (linha 43), adicionar `tenantId?: string;` e em sua criação (linha 101) `tenantId: opts.tenantId,`.

(b) **Raiz do run = wsRoot do tenant.** Criar no topo do corpo de `createRun`:

```ts
const root = opts.wsRoot ?? templateRoot();
```

E substituir TODAS as ocorrências de `templateRoot()` dentro de `createRun` por `root` (linhas 124 `data: { cwd: ... }`, 179 `cwd:`, 213 `listOutputsSince(...)`). `loadTemplateMcpServers` (linha 30) passa a receber a raiz: `function loadTemplateMcpServers(root: string)` com `path.join(root, ".mcp.json")`, chamada como `loadTemplateMcpServers(root)` (linha 201).

(c) **Hosted = chave de plataforma + Bash confinado.** Substituir o bloco de `additionalDirectories`/env (linhas 167-195) por:

```ts
const hosted = process.env.MAGNUS_MODE === "hosted";
// Local: HOME (dev). Hosted: NENHUM diretório extra — Bash confinado ao cwd (ws do tenant).
const extraDirs = hosted
  ? []
  : (process.env.MAGNUS_PAINEL_DIRS || process.env.HOME || "").split(":").map((s) => s.trim()).filter(Boolean);
// ⚠️ HOSTED = ENV WHITELIST, nunca passthrough [eng-review D1 + codex]: o child do SDK
// herda process.env se `env` não for passado — e o env do painel tem
// SUPABASE_SERVICE_ROLE_KEY. Um tenant com Bash daria `echo $SUPABASE_SERVICE_ROLE_KEY`.
// Whitelist mínima: PATH (binários), HOME=ws (configs do claude ficam NO ws, não em /root),
// chave de PLATAFORMA (billing por token — addendum 15/06), Gemini (criativos), TMPDIR.
// Local: comportamento original preservado (assinatura do cliente, sem API key).
function hostedRunEnv(wsRoot: string, skillEnv?: Record<string, string>): Record<string, string> {
  const allow: Record<string, string> = {
    PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
    HOME: wsRoot,
    TMPDIR: "/tmp",
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "",
    ...(process.env.GEMINI_API_KEY ? { GEMINI_API_KEY: process.env.GEMINI_API_KEY } : {}),
  };
  return { ...allow, ...(skillEnv ?? {}) };
}
const runEnv: Record<string, string> | undefined = hosted
  ? hostedRunEnv(root, opts.env)
  : opts.env ? { ...stringEnv(), ...opts.env } : undefined;
```

E no options do `queryFn`, trocar `...(opts.env ? { env: { ...stringEnv(), ...opts.env } } : {})` por `...(runEnv ? { env: runEnv } : {})`. **Cap de runaway [codex C1]:** no mesmo options, adicionar `maxTurns: Number(process.env.MAGNUS_MAX_TURNS ?? "30")` quando hosted; e logo após criar o handle, `if (hosted) setTimeout(() => { if (!handle.done) handle.abort.abort(); }, Number(process.env.MAGNUS_RUN_TIMEOUT_MS ?? String(15 * 60_000)))` — o teto mensal não segura um run único descontrolado. O teste do Step 6 ganha asserts: `captured.options?.env?.SUPABASE_SERVICE_ROLE_KEY` é `undefined`, `env.HOME` é o wsRoot, e `maxTurns` é 30.

(d) **Slot da fila + ledger no ciclo de vida.** Envolver o corpo do `void (async () => { ... })()` assim — logo no início do async:

```ts
const { globalRunQueue } = await import("./hosted/run-queue");
const releaseSlot = process.env.MAGNUS_MODE === "hosted" ? await globalRunQueue().acquire() : () => {};
```

No `finally` (linhas 237-248), substituir o bloco do `recordUsage` local por:

```ts
} finally {
  releaseSlot();
  if (process.env.MAGNUS_MODE === "hosted" && opts.tenantId) {
    // Hosted: custo → cost_ledger + runs (Supabase) + espelho do ws → Storage. Best-effort.
    try {
      const { realLedgerDB, recordRunUsage } = await import("./hosted/ledger");
      const db = realLedgerDB();
      if (lastUsage) await recordRunUsage(db, opts.tenantId, opts.id, opts.skillSlug, lastUsage);
      await db.finishRun(opts.id, handle.errored ? "error" : "done", lastUsage);
    } catch (err) {
      console.error(`[ledger:${opts.skillSlug}]`, err instanceof Error ? err.message : String(err));
    }
    try {
      const { realStorageOps, syncOut } = await import("./hosted/ws-storage");
      await syncOut(realStorageOps(), opts.tenantId, root, startedAt);
    } catch (err) {
      console.error(`[ws-sync:${opts.skillSlug}]`, err instanceof Error ? err.message : String(err));
    }
  } else if (lastUsage) {
    // Local: medidor JSONL original
    try { recordUsage(opts.skillSlug, lastUsage, new Date(), opts.id); } catch (err) {
      console.error(`[usage:${opts.skillSlug}]`, err instanceof Error ? err.message : String(err));
    }
  }
  handle.emitters.clear();
}
```

(Os imports dinâmicos de `./hosted/*` evitam custo no modo local e mantêm os testes existentes herméticos. `ws-storage` só existe após a Task 10 — até lá este import falha no catch best-effort; rodar a Task 10 antes do deploy.)

- [ ] **Step 6: Teste do executor hosted** (estende o padrão de `runs-runtime-usage.test.ts` — mocka o SDK):

```ts
// adicionar em painel/lib/runs-runtime.test.ts (describe novo)
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("createRun hosted", () => {
  beforeEach(() => { process.env.MAGNUS_MODE = "hosted"; process.env.ANTHROPIC_API_KEY = "sk-plat-test"; });
  afterEach(() => { delete process.env.MAGNUS_MODE; delete process.env.ANTHROPIC_API_KEY; vi.resetModules(); vi.doUnmock("@anthropic-ai/claude-agent-sdk"); });

  it("injeta ANTHROPIC_API_KEY e confina additionalDirectories=[] com cwd=wsRoot", async () => {
    let captured: { options?: { env?: Record<string, string>; additionalDirectories?: string[]; cwd?: string } } = {};
    vi.doMock("@anthropic-ai/claude-agent-sdk", () => ({
      query: (p: typeof captured) => { captured = p; return (async function* () { yield { type: "result", subtype: "success", total_cost_usd: 0.01, usage: { input_tokens: 1, output_tokens: 1 } }; })(); },
    }));
    const { createRun } = await import("./runs-runtime");
    await createRun({ id: "11111111-2222-3333-4444-555555555555", skillSlug: "s", prompt: "p", tenantId: "11111111-2222-3333-4444-555555555555", wsRoot: "/tmp/ws-test" });
    await new Promise((r) => setTimeout(r, 50));
    expect(captured.options?.cwd).toBe("/tmp/ws-test");
    expect(captured.options?.additionalDirectories).toEqual([]);
    expect(captured.options?.env?.ANTHROPIC_API_KEY).toBe("sk-plat-test");
  });
});
```

- [ ] **Step 7:** Run `npx vitest run` → suite INTEIRA PASS (modo local intocado) + novo PASS. `npx tsc --noEmit` → 0.

- [ ] **Step 8: Commit** — `git add painel/lib && git commit -m "feat(f1a): executor multi-tenant — wsRoot/tenantId, chave de plataforma, Bash confinado, fila de slots, ledger no finally"`

### Task 9: Rotas de run — tenant + budget gate + ownership

**Files:**
- Modify: `painel/app/api/run/start/route.ts`, `painel/app/api/run/[id]/stream/route.ts`, `painel/app/api/run/[id]/answer/route.ts`, `painel/app/api/run/[id]/abort/route.ts`

- [ ] **Step 1: `run/start` — substituir o handler `POST` inteiro:**

```ts
import { NextResponse } from "next/server";
import { findSkill } from "@/lib/skills";
import { buildSkillPrompt } from "@/lib/prompt";
import { createRun } from "@/lib/runs-runtime";
import { readLicenseKey } from "@/lib/license";
import { resolveRadarUrl } from "@/lib/radar-config";
import { requireTenant, tenantErrorResponse } from "@/lib/hosted/tenant";
import { ensureWorkspace } from "@/lib/hosted/ws";
import { runWithTenant } from "@/lib/hosted/tenant-context";
import { budgetGate, realLedgerDB } from "@/lib/hosted/ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function envForSkill(slug: string): Record<string, string> | undefined {
  if (slug !== "radar") return undefined;
  const env: Record<string, string> = { MAGNUS_RADAR_URL: resolveRadarUrl() };
  const lic = readLicenseKey();
  if (lic) env.MAGNUS_LICENSE_KEY = lic;
  return env;
}

export async function POST(req: Request) {
  const body = (await req.json()) as { runId?: string; skillSlug?: string; startForm?: Record<string, unknown> };
  if (!body.runId || !body.skillSlug) {
    return NextResponse.json({ error: "runId e skillSlug são obrigatórios" }, { status: 400 });
  }
  const hosted = process.env.MAGNUS_MODE === "hosted";
  if (hosted && !UUID_RE.test(body.runId)) {
    return NextResponse.json({ error: "runId precisa ser uuid" }, { status: 400 });
  }
  const skill = findSkill(body.skillSlug);
  if (!skill) return NextResponse.json({ error: `skill "${body.skillSlug}" não encontrada` }, { status: 404 });

  if (!hosted) {
    // caminho local original
    const prompt = buildSkillPrompt(skill, body.startForm ?? {});
    await createRun({ id: body.runId, skillSlug: skill.slug, prompt, campaignSlug: body.startForm?.campanha as string | undefined, env: envForSkill(skill.slug), model: skill.panel.model });
    return NextResponse.json({ runId: body.runId, skillSlug: skill.slug });
  }

  try {
    const tenant = await requireTenant();
    const ws = ensureWorkspace(tenant.id);
    const db = realLedgerDB();

    const gate = await budgetGate(db, tenant.id);
    if (!gate.ok) {
      await db.insertRun({ id: body.runId, tenant_id: tenant.id, skill: skill.slug, status: "blocked_budget", started_at: new Date().toISOString() });
      return NextResponse.json(
        { error: `Crédito do mês esgotado (restante US$ ${gate.remaining?.toFixed(2) ?? "0.00"}). Renova no início do próximo ciclo.` },
        { status: 402 },
      );
    }

    await db.insertRun({ id: body.runId, tenant_id: tenant.id, skill: skill.slug, status: "running", started_at: new Date().toISOString() });

    return await runWithTenant({ tenantId: tenant.id, wsRoot: ws }, async () => {
      const prompt = buildSkillPrompt(skill, body.startForm ?? {});
      await createRun({
        id: body.runId!, skillSlug: skill.slug, prompt,
        campaignSlug: body.startForm?.campanha as string | undefined,
        env: envForSkill(skill.slug), model: skill.panel.model,
        tenantId: tenant.id, wsRoot: ws,
      });
      return NextResponse.json({ runId: body.runId, skillSlug: skill.slug });
    });
  } catch (e) {
    const r = tenantErrorResponse(e);
    if (r) return r;
    throw e;
  }
}
```

- [ ] **Step 2: Ownership nas rotas por id.** Em `stream/route.ts`, logo após `const { id } = await ctx.params;` (e antes de criar o stream):

```ts
import { requireTenant, tenantErrorResponse } from "@/lib/hosted/tenant";
// ...
if (process.env.MAGNUS_MODE === "hosted") {
  try {
    const tenant = await requireTenant();
    const h = getRun(id);
    if (h && h.tenantId !== tenant.id) return new Response("not found", { status: 404 });
  } catch (e) {
    const r = tenantErrorResponse(e);
    if (r) return r;
    throw e;
  }
}
```

Mesmo bloco (adaptado) em `answer/route.ts` e `abort/route.ts` — após resolver `id`, antes de agir; `answer` também exige que `getRun(id)` exista (já exige). `getRun` precisa expor `tenantId` no tipo de retorno — já coberto pela Task 8 (campo no RunHandle).

- [ ] **Step 3:** `npx tsc --noEmit` → 0. `npx vitest run` → PASS.

- [ ] **Step 4: Commit** — `git add painel/app/api/run && git commit -m "feat(f1a): rotas de run — budget gate 402, runs row, ownership por tenant"`

### Task 10: Storage — bucket + hydrate/syncOut

**Files:**
- Create: `magnus-os-online/supabase/migrations/0004_storage_bucket.sql`, `painel/lib/hosted/ws-storage.ts`, `painel/lib/hosted/ws-storage.test.ts`

- [ ] **Step 1: Migration do bucket**

```sql
-- 0004_storage_bucket.sql — bucket privado do espelho de workspaces (F1a).
-- Acesso SÓ via service role (o painel intermedia); sem policies de storage.objects
-- para anon/authenticated = ninguém além do service acessa.
insert into storage.buckets (id, name, public)
values ('tenant-workspaces', 'tenant-workspaces', false)
on conflict (id) do nothing;
```

Aplicar: `cd ~/Documents/Magnus/magnus-os-online && set -a && . ./.env.bootstrap && set +a && op run --env-file=.env.op -- bash scripts/db-apply.sh supabase/migrations/0004_storage_bucket.sql` → Expected: sem erro; `select id from storage.buckets` contém `tenant-workspaces`.

- [ ] **Step 2: Teste falhando do sync**

```ts
// painel/lib/hosted/ws-storage.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { syncOut, hydrate, type StorageOps } from "./ws-storage";

function memOps() {
  const files = new Map<string, Uint8Array>();
  const ops: StorageOps = {
    list: async (prefix) => [...files.keys()].filter((k) => k.startsWith(prefix)),
    download: async (k) => { const v = files.get(k); if (!v) throw new Error("404"); return v; },
    upload: async (k, data) => { files.set(k, data); },
  };
  return { ops, files };
}

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "wss-")); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe("syncOut", () => {
  it("sobe só arquivos modificados desde sinceMs, ignorando .magnus-painel", async () => {
    const { ops, files } = memOps();
    fs.mkdirSync(path.join(dir, "operacao/camp1"), { recursive: true });
    fs.mkdirSync(path.join(dir, ".magnus-painel"), { recursive: true });
    fs.writeFileSync(path.join(dir, "operacao/camp1/BRIEFING.md"), "novo");
    fs.writeFileSync(path.join(dir, ".magnus-painel/state.json"), "{}");
    const old = path.join(dir, "antigo.md");
    fs.writeFileSync(old, "velho");
    fs.utimesSync(old, new Date(0), new Date(0));
    await syncOut(ops, "t-1", dir, Date.now() - 60_000);
    expect([...files.keys()]).toEqual(["t-1/operacao/camp1/BRIEFING.md"]);
  });
});

describe("hydrate", () => {
  it("baixa tudo do prefixo quando o disco não tem workspace; no-op se já tem", async () => {
    const { ops, files } = memOps();
    files.set("t-1/contexto/EMPRESA.md", new TextEncoder().encode("# da nuvem"));
    const target = path.join(dir, "t-1");
    await hydrate(ops, "t-1", target);
    expect(fs.readFileSync(path.join(target, "contexto/EMPRESA.md"), "utf8")).toBe("# da nuvem");
    fs.writeFileSync(path.join(target, "contexto/EMPRESA.md"), "editado");
    await hydrate(ops, "t-1", target); // já tem contexto/ → não sobrescreve
    expect(fs.readFileSync(path.join(target, "contexto/EMPRESA.md"), "utf8")).toBe("editado");
  });
});
```

- [ ] **Step 3:** Run → FAIL.

- [ ] **Step 4: Implementar**

```ts
// painel/lib/hosted/ws-storage.ts
/**
 * Espelho durável do workspace no Supabase Storage (bucket tenant-workspaces, privado).
 * Disco é o primário (single box, F1a); aqui é durabilidade + futura migração de box.
 * syncOut: após cada run, sobe arquivos com mtime >= sinceMs. hydrate: popula o disco
 * a partir do Storage quando o ws não existe (ex.: box trocado).
 * StorageOps injetável: testes em memória; realStorageOps() liga o serviceClient.
 */
import fs from "node:fs";
import path from "node:path";
import { serviceClient } from "./supabase";

export interface StorageOps {
  list(prefix: string): Promise<string[]>;
  download(remote: string): Promise<Uint8Array>;
  upload(remote: string, data: Uint8Array): Promise<void>;
}

// ⚠️ .claude OBRIGATÓRIO na denylist [quality review G5 — CRITICAL]: com HOME=wsRoot o SDK
// escreve .claude/ no ws do tenant; espelhar = vazar credencial/estado pro Storage.
const SKIP_DIRS = new Set([".claude", ".magnus-painel", "node_modules", ".git", ".next"]);

function* walk(dir: string, base: string): Generator<{ abs: string; rel: string }> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(abs, base);
    else if (entry.isFile()) yield { abs, rel: path.relative(base, abs).split(path.sep).join("/") };
  }
}

export async function syncOut(ops: StorageOps, tenantId: string, dir: string, sinceMs: number): Promise<number> {
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  for (const f of walk(dir, dir)) {
    if (fs.statSync(f.abs).mtimeMs < sinceMs) continue;
    await ops.upload(`${tenantId}/${f.rel}`, fs.readFileSync(f.abs));
    n++;
  }
  return n;
}

export async function hydrate(ops: StorageOps, tenantId: string, dir: string): Promise<number> {
  if (fs.existsSync(path.join(dir, "contexto"))) return 0; // disco já tem — primário vence
  const keys = await ops.list(`${tenantId}/`);
  let n = 0;
  for (const key of keys) {
    const rel = key.slice(tenantId.length + 1);
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, await ops.download(key));
    n++;
  }
  return n;
}

export function realStorageOps(): StorageOps {
  const bucket = () => serviceClient().storage.from("tenant-workspaces");
  // list do Supabase é por "pasta" — recursão manual
  async function listRec(prefix: string): Promise<string[]> {
    const out: string[] = [];
    const { data, error } = await bucket().list(prefix.replace(/\/$/, ""), { limit: 1000 });
    if (error) throw error;
    for (const item of data ?? []) {
      const full = `${prefix.replace(/\/$/, "")}/${item.name}`;
      if (item.id === null) out.push(...(await listRec(full))); // pasta
      else out.push(full);
    }
    return out;
  }
  return {
    list: (prefix) => listRec(prefix),
    async download(remote) {
      const { data, error } = await bucket().download(remote);
      if (error) throw error;
      return new Uint8Array(await data.arrayBuffer());
    },
    async upload(remote, data) {
      const { error } = await bucket().upload(remote, data, { upsert: true });
      if (error) throw error;
    },
  };
}
```

- [ ] **Step 5:** Run `npx vitest run lib/hosted/ws-storage.test.ts` → PASS. Integrar o hydrate no `ensureWorkspace` é desnecessário na F1a (disco nunca some no box único) — fica documentado como runbook de migração de box.

- [ ] **Step 6: Commit** — `git add painel/lib/hosted ../supabase/migrations/0004_storage_bucket.sql && git commit -m "feat(f1a): espelho de workspace no Storage — bucket + syncOut/hydrate"`

### Task 11: Medidor hosted — /api/usage lê do cost_ledger do tenant

**Files:**
- Modify: `painel/app/api/usage/route.ts` (substituir conteúdo inteiro)

- [ ] **Step 1: Implementar (shape de resposta = idêntico ao local → CreditBadge não muda)**

```ts
import { NextResponse } from "next/server";
import { currentMonthUsage, planCeilingUSD, currentPlan } from "@/lib/usage-store";
import { requireTenant, tenantErrorResponse } from "@/lib/hosted/tenant";
import { serviceClient } from "@/lib/hosted/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function GET() {
  if (process.env.MAGNUS_MODE !== "hosted") {
    const usage = currentMonthUsage();
    const ceilingUSD = planCeilingUSD();
    const plan = currentPlan();
    const pct = ceilingUSD > 0 ? Math.min(usage.totalUSD / ceilingUSD, 1) : 0;
    return NextResponse.json({ ...usage, plan, ceilingUSD, pct });
  }
  try {
    const tenant = await requireTenant();
    const sb = serviceClient();
    const monthStart = new Date();
    monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
    const { data, error } = await sb
      .from("cost_ledger")
      .select("skill, model, in_tok, out_tok, usd, ref")
      .eq("tenant_id", tenant.id)
      .gte("ts", monthStart.toISOString());
    if (error) throw error;

    const byModel: Record<string, { costUSD: number; inputTokens: number; outputTokens: number }> = {};
    const bySkill: Record<string, { costUSD: number; runs: number }> = {};
    const seenRun = new Set<string>();
    let totalUSD = 0;
    for (const r of data ?? []) {
      const usd = Number(r.usd) || 0;
      totalUSD += usd;
      const bm = (byModel[r.model] ??= { costUSD: 0, inputTokens: 0, outputTokens: 0 });
      bm.costUSD += usd; bm.inputTokens += Number(r.in_tok) || 0; bm.outputTokens += Number(r.out_tok) || 0;
      const bs = (bySkill[r.skill] ??= { costUSD: 0, runs: 0 });
      bs.costUSD += usd;
      const key = `${r.skill} ${r.ref ?? ""}`;
      if (!seenRun.has(key)) { seenRun.add(key); bs.runs++; }
    }
    const round = (n: number) => Math.round(n * 10000) / 10000;
    totalUSD = round(totalUSD);
    for (const k of Object.keys(byModel)) byModel[k].costUSD = round(byModel[k].costUSD);
    for (const k of Object.keys(bySkill)) bySkill[k].costUSD = round(bySkill[k].costUSD);

    const ceilingUSD = tenant.plan?.limits?.usd_month ?? 0;
    const pct = ceilingUSD > 0 ? Math.min(totalUSD / ceilingUSD, 1) : 0;
    return NextResponse.json({
      month: monthKey(new Date()), totalUSD, byModel, bySkill,
      entries: (data ?? []).length, plan: "online", ceilingUSD, pct,
    });
  } catch (e) {
    const r = tenantErrorResponse(e);
    if (r) return r;
    throw e;
  }
}
```

- [ ] **Step 2:** `npx tsc --noEmit` → 0. `npx vitest run` → PASS (usage-store.test.ts intocado cobre o modo local).

- [ ] **Step 3: Commit** — `git add painel/app/api/usage && git commit -m "feat(f1a): medidor hosted — usage do cost_ledger por tenant, shape compatível com o CreditBadge"`

### Task 12: Rotas/páginas restantes da allowlist — wrapper runWithTenant + watcher por root

**Files:**
- Modify: `painel/app/api/campaigns/route.ts`, `painel/app/api/campaigns/create/route.ts`, `painel/app/api/campaigns/briefing/route.ts`, `painel/app/api/files/route.ts`, `painel/app/api/watch/stream/route.ts`, `painel/app/api/skills/route.ts`, `painel/app/page.tsx`, `painel/app/boot/page.tsx`, `painel/app/c/[slug]/page.tsx`
- Modify: `painel/lib/watcher.ts`

- [ ] **Step 1: Padrão uniforme das rotas API.** Para CADA rota listada (exceto skills e watch — abaixo), envolver o corpo do handler:

```ts
import { requireTenant, tenantErrorResponse } from "@/lib/hosted/tenant";
import { ensureWorkspace } from "@/lib/hosted/ws";
import { runWithTenant } from "@/lib/hosted/tenant-context";

async function withTenantCtx<T>(fn: () => Promise<T>): Promise<T | Response> {
  if (process.env.MAGNUS_MODE !== "hosted") return fn();
  try {
    const tenant = await requireTenant();
    const ws = ensureWorkspace(tenant.id);
    return await runWithTenant({ tenantId: tenant.id, wsRoot: ws }, fn);
  } catch (e) {
    const r = tenantErrorResponse(e);
    if (r) return r;
    throw e;
  }
}
```

Este helper vai em `painel/lib/hosted/with-tenant.ts` (Create) e cada rota vira:

```ts
// exemplo: app/api/campaigns/route.ts
import { NextResponse } from "next/server";
import { listCampaigns } from "@/lib/campaigns";
import { withTenantCtx } from "@/lib/hosted/with-tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return withTenantCtx(async () => NextResponse.json({ campaigns: listCampaigns() }));
}
```

Aplicar o MESMO formato em `campaigns/create`, `campaigns/briefing`, `files` (o `templateRoot()` interno já resolve via ALS). `skills/route.ts` NÃO precisa (skills são globais do plugin), mas ganha o guard de sessão de graça via middleware.

- [ ] **Step 2: Watcher por root.** Em `painel/lib/watcher.ts`, trocar o singleton por mapa keyed por root — substituir o conteúdo do módulo:

```ts
import chokidar, { FSWatcher } from "chokidar";
import path from "node:path";
import { templateRoot } from "./paths";
import type { WatchEvent } from "./types";

type Listener = (e: WatchEvent) => void;
interface Entry { watcher: FSWatcher; listeners: Set<Listener>; }

// keyed por root — cada tenant (hosted) ou o template único (local)
const entries = new Map<string, Entry>();

function ensureStarted(root: string): Entry {
  let entry = entries.get(root);
  if (entry) return entry;
  const listeners = new Set<Listener>();
  const relPath = (p: string) => path.relative(root, p).split(path.sep).join("/");
  const emit = (e: WatchEvent) => { for (const l of listeners) { try { l(e); } catch { /* listener ruim */ } } };
  const watcher = chokidar.watch([path.join(root, "contexto"), path.join(root, "operacao")], {
    ignored: (p) => p.includes("node_modules") || p.includes(".magnus-painel"),
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
    depth: 8,
  });
  watcher.on("add", (p) => emit({ type: "file_added", path: p, relPath: relPath(p) }));
  watcher.on("change", (p) => emit({ type: "file_changed", path: p, relPath: relPath(p) }));
  watcher.on("unlink", (p) => emit({ type: "file_removed", path: p, relPath: relPath(p) }));
  entry = { watcher, listeners };
  entries.set(root, entry);
  return entry;
}

/** Assina eventos do workspace ATUAL (templateRoot resolve o tenant via ALS). */
export function subscribeWatch(listener: Listener): () => void {
  const entry = ensureStarted(templateRoot());
  entry.listeners.add(listener);
  return () => entry.listeners.delete(listener);
}
```

(Conferir o nome exportado atual — se for outro, ex. `subscribe`, manter o MESMO nome pra não quebrar `watch/stream/route.ts`; ajustar import lá se preciso.) Na rota `watch/stream/route.ts`, envolver com `withTenantCtx` igual ao Step 1 — o `subscribeWatch` interno resolve o root certo. ⚠️ Custo: 1 FSWatcher por tenant ativo — ok pra 1-2 mentorados (F1a); inotify limits = nota pro eng-review.

- [ ] **Step 3: Páginas server.** Padrão: dados lidos DENTRO do `runWithTenant` (síncrono), JSX fora. Exemplo exato pro `boot/page.tsx` (mesmo padrão em `app/page.tsx` e `c/[slug]/page.tsx`):

```tsx
// topo do componente (substituir as 3 linhas de leitura):
import { requireTenant } from "@/lib/hosted/tenant";
import { ensureWorkspace } from "@/lib/hosted/ws";
import { runWithTenant } from "@/lib/hosted/tenant-context";
import { redirect } from "next/navigation";

export default async function BootPage() {
  let data: { empresa: ReturnType<typeof readEmpresa>; ready: ReturnType<typeof isContextoReady>; empresaDir: string };
  if (process.env.MAGNUS_MODE === "hosted") {
    let tenant;
    try { tenant = await requireTenant(); } catch { redirect("/login"); }
    const ws = ensureWorkspace(tenant.id);
    data = runWithTenant({ tenantId: tenant.id, wsRoot: ws }, () => {
      const empresa = readEmpresa();
      return { empresa, ready: isContextoReady(empresa), empresaDir: templateRoot().split("/").pop() ?? "empresa" };
    });
  } else {
    const empresa = readEmpresa();
    data = { empresa, ready: isContextoReady(empresa), empresaDir: templateRoot().split("/").pop() ?? "empresa" };
  }
  const { empresa, ready, empresaDir } = data;
  // ...resto do JSX original sem mudança
}
```

- [ ] **Step 4:** `npx tsc --noEmit` → 0. `npx vitest run` → PASS.

- [ ] **Step 5: Commit** — `git add painel && git commit -m "feat(f1a): rotas/páginas da allowlist com contexto de tenant + watcher por root"`

### Task 13: /api/health no painel + verificação total

**Files:**
- Create: `painel/app/api/health/route.ts`

- [ ] **Step 1:**

```ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, version: process.env.APP_VERSION ?? "f1a", ts: new Date().toISOString() });
}
```

- [ ] **Step 2: Verificação total** — Run: `npx vitest run && npx tsc --noEmit && npm run build` → Expected: suite PASS, 0 erros de tipo, build Next OK.
- [ ] **Step 3:** `/simplify` nos arquivos >80 linhas novas (runs-runtime diff, route-guard, ws-storage).
- [ ] **Step 4: Commit** — `git add painel && git commit -m "feat(f1a): health no painel + build verde"`

### Task 14: Deploy no VPS Portal (manual; CI quando o scope chegar)

**Pré-requisito MANUAL (Yuri):** `ANTHROPIC_API_KEY` de plataforma criada e no 1Password.

- [ ] **Step 1: Preparar diretórios + template + skills no VPS**

```bash
ssh -i ~/.ssh/id_ed25519 root@72.60.241.64 'mkdir -p /var/lib/magnusos/{ws,template,plugin-skills}'
rsync -az -e "ssh -i ~/.ssh/id_ed25519" ~/Documents/Magnus/magnus-os-plugin/template/ root@72.60.241.64:/var/lib/magnusos/template/
rsync -az -e "ssh -i ~/.ssh/id_ed25519" ~/Documents/Magnus/magnus-os-plugin/plugins/magnus-os/skills/ root@72.60.241.64:/var/lib/magnusos/plugin-skills/
```

- [ ] **Step 2: Subir o código (sem node_modules) + build NO VPS** (sharp/SDK têm binários nativos — não buildar no Mac ARM)

```bash
rsync -az --delete --exclude node_modules --exclude .next -e "ssh -i ~/.ssh/id_ed25519" \
  ~/Documents/Magnus/magnus-os-online/painel/ root@72.60.241.64:/var/www/magnusos-online/painel/
ssh -i ~/.ssh/id_ed25519 root@72.60.241.64 'cd /var/www/magnusos-online/painel && npm ci && npm run build'
```

Expected: build OK (~3-6min no 1vCPU; RAM tem 3.2G livres).

- [ ] **Step 3: `.env.production` no VPS** (chmod 600; valores do 1Password `magnus-os-online-secrets` — dívida conhecida: produção ainda plaintext até a migração #4 do 1Password chegar nos VPS)

```bash
ssh -i ~/.ssh/id_ed25519 root@72.60.241.64 'cat > /var/www/magnusos-online/painel/.env.production && chmod 600 /var/www/magnusos-online/painel/.env.production' <<'EOF'
MAGNUS_MODE=hosted
NEXT_PUBLIC_SUPABASE_URL=https://jvxttcmazquypscjuaiz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon do 1Password>
SUPABASE_SERVICE_ROLE_KEY=<service do 1Password>
ANTHROPIC_API_KEY=<chave de plataforma do 1Password>
MAGNUS_WS_ROOT=/var/lib/magnusos/ws
MAGNUS_TEMPLATE_DIR=/var/lib/magnusos/template
MAGNUS_SKILLS_DIR=/var/lib/magnusos/plugin-skills
MAGNUS_SITE_URL=https://magnusos.yuribranco.com.br
MAGNUS_MAX_CONCURRENT_RUNS=2
APP_VERSION=f1a
EOF
```

(⚠️ NUNCA ecoar os valores no chat/log — preencher direto no VPS via heredoc local com `op read`.)

- [ ] **Step 4: pm2 — painel substitui o health server** (mesma porta 3100; nginx não muda)

```bash
ssh -i ~/.ssh/id_ed25519 root@72.60.241.64 'cat > /var/www/magnusos-online/ecosystem.config.cjs' <<'EOF'
// Painel hosted (F1a) — substitui o health server da F0 na MESMA porta 3100.
module.exports = {
  apps: [{
    name: "magnusos-online",
    cwd: "/var/www/magnusos-online/painel",
    script: "node_modules/next/dist/bin/next",
    args: "start -p 3100",
    env: { NODE_ENV: "production" },
  }],
};
EOF
ssh -i ~/.ssh/id_ed25519 root@72.60.241.64 'cd /var/www/magnusos-online && pm2 startOrReload ecosystem.config.cjs && pm2 save'
```

- [ ] **Step 5: Verificar + `/canary`** (VPS compartilhado!)

```bash
curl -s https://magnusos.yuribranco.com.br/api/health        # {"ok":true,"version":"f1a",...}
curl -s -o /dev/null -w "%{http_code}\n" https://magnusos.yuribranco.com.br/api/meta/sync -X POST  # 501 (allowlist OK — antes de login dá 501 mesmo, allowlist roda antes do auth)
curl -s -o /dev/null -w "%{http_code}\n" https://magnusos.yuribranco.com.br/   # 307→/login (sem sessão)
curl -s -o /dev/null -w "%{http_code}\n" https://magnus.yuribranco.com.br/     # 307 (Portal intacto)
```

Invocar `/canary` 5-15min observando magnus + magnusos.

- [ ] **Step 6: Commit + push** — `git add -A && git commit -m "feat(f1a): deploy substrato — pm2 painel na 3100" && git push`

### Task 15: Smoke E2E com tenant de dogfood

- [ ] **Step 1: Tenant real de dogfood** (vira o tenant de dev — NÃO limpar):

```bash
cd ~/Documents/Magnus/magnus-os-online && set -a && . ./.env.bootstrap && set +a
op run --env-file=.env.op -- bash -c 'curl -sS -X POST "$SUPABASE_URL/functions/v1/hotmart-webhook?hottok=$HOTMART_HOTTOK_ONLINE" \
  -H "Content-Type: application/json" \
  -d "{\"event\":\"PURCHASE_APPROVED\",\"data\":{\"product\":{\"id\":7910139},\"purchase\":{\"transaction\":\"F0DOGFOOD\",\"status\":\"APPROVED\"},\"subscription\":{\"subscriber\":{\"code\":\"SUB-YURI-DOGFOOD\"}},\"buyer\":{\"email\":\"yuribranco@gmail.com\"}}}"'
```

Expected: `{"provisioned":true}` (ou `duplicate` se re-rodado).

- [ ] **Step 2: Login** — abrir `https://magnusos.yuribranco.com.br` → redireciona `/login` → email `yuribranco@gmail.com` → link chega → clica → entra no painel. (Browser via `/browse`.)
- [ ] **Step 3: Run de skill barata** — rodar `checar-marca` (Sonnet) → stream SSE aparece → output gerado no workspace.
- [ ] **Step 4: Verificar o dinheiro** — no Supabase: `select skill, model, usd from cost_ledger order by ts desc limit 5` → linhas do run; `select status, usage from runs order by created_at desc limit 3` → `done` com usage. Badge do painel mostra o consumo. Storage tem os arquivos novos do tenant (`tenant-workspaces/<id>/...`).
- [ ] **Step 5: Teto** — `update tenants set plan = jsonb_set(plan, '{limits,usd_month}', '0.0001') where subscriber_code='SUB-YURI-DOGFOOD'` → tentar rodar skill → 402 com mensagem clara → reverter pra 20.

### Task 16: Fechamento

- [ ] **Step 1:** `/review` + `/codex review` do diff total (pré-"merge" — push final).
- [ ] **Step 2:** `/qa-only` do painel hosted (login, boot, rodar skill, badge).
- [ ] **Step 3:** Ciclo de deliverable: wiki `magnus-os` (entry F1a) + GTD (fechar item F1, abrir F1b/pendências) + memória (`project_magnus_os_product` RESUME).
- [ ] **Step 4:** Anotar dívidas pro F1b no braindump: reserva atômica de orçamento, container sandbox, BullMQ/Redis, inotify scale, CI (workflow scope), latência Oregon, migração 1Password produção.

---

## Emendas aprovadas no /plan-eng-review + /codex (2026-06-10) — PARTE DO PLANO

> Decisões D1-D6 do gate, todas aprovadas pelo Yuri. Os 3 blocos de código críticos (ALS globalThis, getClaims no middleware, env whitelist + runaway cap no executor) já foram editados in-place nas Tasks 2/5/8. O restante abaixo são deltas obrigatórios por task.

**E1 (D1 — design do não-root + spike sandbox) → vira Task 13b (antes do deploy):**
- O pm2 do `magnusos-online` passa a rodar **como user `magnus` (não-root)**: `useradd -r -m magnus`, `chown -R magnus:magnus /var/lib/magnusos /var/www/magnusos-online`, ecosystem ganha `user: "magnus"` (pm2 root spawna child com setuid) — protege root/outros apps; cross-tenant dentro do app fica pro sandbox.
- **Spike (timebox 1h):** sandbox nativo do Claude Code (bubblewrap) no Ubuntu 22.04 — `apt-get install -y bubblewrap` + rodar a skill de teste com sandbox habilitado no SDK confinando ao `/ws`. Funcionou → liga por default no executor hosted (`sandbox: true` nas options ou settings do ws). Não funcionou → documentar o resultado no plano e aceitar (não-root + env whitelist + dirs=[] seguram a F1a); container vira F1b.
- ws por tenant: `chmod 700` no `ensureWorkspace` (`fs.mkdirSync(dir, { recursive: true, mode: 0o700 })`).

**E2 (C1 — runId gerado no servidor) → Task 9:** `run/start` hosted IGNORA `body.runId` e gera `const runId = crypto.randomUUID()` (import `node:crypto`), responde `{ runId }`; o front (`GlobalSkillRunnerHost` ou quem POSTa) passa a abrir o stream com o runId DA RESPOSTA. Mata colisão/hijack de handle cross-tenant (cliente malicioso registrava o id de outro run). Modo local mantém o contrato atual.

**E3 (D4 — DRY) → nova lib:** `lib/hosted/ids.ts` exporta `export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;` (Tasks 6 e 9 importam). `lib/usage-aggregate.ts` exporta `aggregateUsageRows(rows: Array<{skill:string; model:string; in_tok:number|string; out_tok:number|string; usd:number|string; ref:string|null}>): { totalUSD; byModel; bySkill; entries }` — a função pura extraída do corpo da Task 11 (mesma lógica seenRun/round); a rota usa ela. Teste `lib/usage-aggregate.test.ts`: 2 linhas mesmo ref → 1 run; NaN/string usd → coerção `Number()||0`; rounding 4 casas.

**E4 (D5 — test gaps) →** `lib/hosted/run-owner.ts`: `export function assertRunOwner(handle: { tenantId?: string } | undefined, tenantId: string): boolean { return Boolean(handle && handle.tenantId === tenantId); }` + teste (match/mismatch/handle undefined). Rotas stream/answer/abort usam o helper. Teste do finally do executor: mock do SDK (1 result com usage) + `vi.doMock("./hosted/ledger", ...)` com fake — assert `insertCost` chamado 1× e `finishRun("done")`.

**E5 (C2 — produto hosted) → Task 12:** (a) componentes local-only escondidos quando `process.env.NEXT_PUBLIC_MAGNUS_MODE === "hosted"` (setar no `.env.production` junto com MAGNUS_MODE): `ChatFab`/`ChatDrawer`, `ApiKeyBanner`, botão/页 Settings, `DepsCheck`, banners MCP, botão de update — grep por uso nos 3 page.tsx + layout e condicionar render. (b) `/api/skills` hosted: mapear a resposta removendo `body` (UI só precisa de slug/nome/descrição/form/panel) — o prompt interno é IP do produto.

**E6 (C3 — robustez/ops):**
- **Boot assert (Task 13):** no `app/api/health/route.ts` (ou módulo de boot), se `MAGNUS_MODE==="hosted"` e (`!process.env.MAGNUS_SKILLS_DIR || !fs.existsSync(process.env.MAGNUS_SKILLS_DIR)`) → `console.error` + health responde `{ ok:false, error:"MAGNUS_SKILLS_DIR ausente" }` com 500 (deploy detecta na hora; lista de skills vazia silenciosa é o pior modo de falha).
- **Sweep de runs presos (Task 8):** função `sweepStaleRuns()` chamada 1× no primeiro acesso ao runtime hosted: `update runs set status='error', finished_at=now() where status='running' and started_at < now() - interval '30 minutes'` (via service client; pm2 restart no meio de run deixava linha eterna em `running`).
- **Size cap no syncOut (Task 10):** pular arquivo > 25MB com `console.warn` (`if (fs.statSync(f.abs).size > 25*1024*1024) continue;` + log) — mirror não é para vídeo bruto.
- **Semântica de delete (Task 10, doc):** o mirror F1a é additive-only — delete local NÃO propaga pro Storage (aceito; hydrate pós-migração pode ressuscitar deletados — documentado no README do repo).
- **postinstall guard (Task 14):** antes do `npm ci` no VPS, conferir `grep -A2 '"postinstall"' package.json`; se tocar `claude`/locais globais, exportar `MAGNUS_PAINEL_SKIP_CC=1 CI=true` no comando (verificar nome real do guard no package.json do fork).
- **`import "server-only"` (Task 3):** adicionar `npm i server-only` e `import "server-only";` no topo de `lib/hosted/supabase.ts` — serviceClient importado em client component vira erro de build, não vazamento.
- **Wording (Task 7):** a nota da Task 7 ganha a frase: "a migration 0002 diz 'reserva atômica é requisito da F1' — formalmente ela entra na F1b; o aceite do gap na F1a foi decisão explícita do eng-review D1/2026-06-10."
- **Teste novo do route-guard (Task 5):** `mutação sem Origin → 403` (`guardHosted({ pathname:"/api/run/start", method:"POST", hasSession:true, origin:null, site:SITE })` → `{ok:false,status:403}`).

## NOT in scope (considerado e explicitamente deferido)

- **Container sandbox por run (Docker/microVM)** → F1b; com chave de plataforma única + não-root + env whitelist + spike bubblewrap, o threat model F1a (1-2 mentorados) fecha sem ele.
- **Reserva atômica de orçamento** → F1b; perda máxima = custo de `MAGNUS_MAX_CONCURRENT_RUNS` runs simultâneos do mesmo tenant.
- **BullMQ/Redis** → F1b; fila in-process basta pra 2 slots.
- **Propagação de delete no mirror Storage** → F1b (mirror é additive-only).
- **Revogação instantânea de sessão** → claims locais valem até expirar (~1h); aceitável.
- **CI/CD via GH Actions** → bloqueado no escopo `workflow` do token gh; deploy manual documentado na Task 14.
- **Migração de região do Supabase (Oregon→sa-east-1)** → reavaliar com dados de latência reais do teste de 7 dias.
- **Rotas locais não-core (chat, meta, notion, radar-config, update, apikey, mcp, deps)** → 501 via allowlist; portar sob demanda nas fases F2-F4.

## What already exists (reusado vs reconstruído)

| Existente | Decisão |
|---|---|
| `magnus-painel` b5fc883 inteiro (UI, skills, runs, SSE, medidor) | **Reusado** (fork; ALS evita re-assinar 18 arquivos) |
| Schema F0 (tenants/RLS/cost_ledger/runs/fns) | **Reusado** como está |
| Webhook + provisioning Hotmart | **Reusado** (Task 15 só dispara) |
| `MAGNUS_SKILLS_DIR` override em `paths.ts:19-21` | **Reusado** (+ boot assert E6) |
| `extractUsage` do agent-sdk-map | **Reusado** (ledger consome o mesmo `RunUsage`) |
| `lib/loopback.ts` guard | **Mantido** pro modo local; hosted usa route-guard novo |
| `usage-store.ts` JSONL | **Mantido** só pro modo local; hosted lê ledger |
| Substrato F0 (nginx/TLS/pm2/dns) | **Reusado** (painel entra na mesma porta 3100) |

## Failure modes (por codepath novo)

| Codepath | Falha realista | Teste? | Handling? | User vê? |
|---|---|---|---|---|
| budgetGate | RPC falha (rede Oregon) | ✗ | throw → 500 da rota | erro genérico (aceito) |
| createRun finally ledger | insert falha | ✓ (E4) | catch + console.error | run ok, custo NÃO contado (sub-cobrança best-effort — aceito F1a, log) |
| syncOut | Storage fora | ✓ (fake) | catch best-effort | invisível; mirror atrasado (aceito) |
| run loop | pm2 restart no meio | ✗ | sweepStaleRuns (E6) | run vira 'error' em ≤30min |
| magic link | token expirado | e2e edge | redirect /login?erro= | mensagem clara ✓ |
| ensureWorkspace | disco cheio | ✗ | throw → 500 | erro genérico; **monitorar disco no /canary** |
| fila de slots | 3º run espera indefinido se release vazar | ✓ (release duplo) | timeout de run (E1) solta o slot | espera ≤15min pior caso |

**Critical gap residual: nenhum** — os silenciosos (ledger/sync) são best-effort documentados com log, decisão consciente F1a.

## Paralelização (worktrees)

| Lane | Tasks | Módulos | Depende |
|---|---|---|---|
| A | 2→3→4→5 (ctx, supabase, auth, guard) | lib/hosted, middleware, app/login | Task 1 |
| B | 6→7→10 (ws, ledger, storage) | lib/hosted, supabase/migrations | Task 1 |
| C | 8→9 (executor, rotas run) | lib/runs-runtime, app/api/run | A+B |
| D | 11→12→13 (usage, rotas, páginas) | app/api, app/*, lib/watcher | A (e C pro usage) |
| E | 13b→14→15→16 (hardening VPS, deploy, smoke) | infra, VPS | tudo |

Execução: **A ∥ B** em paralelo → C → D → E. Conflito potencial: A e B tocam `lib/hosted/` (arquivos distintos — ok com coordenação).

## Implementation Tasks (síntese do review)

- [ ] **T1 (P1)** — executor — env whitelist + maxTurns + timeout (editado in-place Task 8) — Verify: teste Step 6 com asserts novos
- [ ] **T2 (P1)** — infra — Task 13b não-root `magnus` + chmod 700 + spike bubblewrap — Verify: `ps -o user= -p <pid do run>` ≠ root
- [ ] **T3 (P1)** — rotas run — runId server-side (E2) — Verify: POST com runId forjado é ignorado
- [ ] **T4 (P1)** — boot — assert MAGNUS_SKILLS_DIR (E6) — Verify: health 500 sem a var
- [ ] **T5 (P2)** — middleware — getClaims local (editado in-place Task 5) — Verify: zero chamadas auth/v1/user em GET de página (network tab)
- [ ] **T6 (P2)** — DRY — ids.ts + usage-aggregate.ts + testes (E3) — Verify: vitest novos PASS
- [ ] **T7 (P2)** — testes — run-owner + ledger-finally (E4) — Verify: vitest PASS
- [ ] **T8 (P2)** — UI hosted — esconder local-only + skills sem body (E5) — Verify: /qa-only sem botão morto
- [ ] **T9 (P2)** — ops — sweep stale runs + size cap + postinstall guard + server-only (E6) — Verify: testes + deploy
- [ ] **T10 (P3)** — CSRF estrito (editado in-place Task 5) — Verify: teste novo route-guard

## Self-review (feito na escrita)

- **Cobertura vs braindump §3:** U1 auth (Tasks 3-5) ✓ · U2 Storage (6, 10) ✓ · U3 executor+ledger (7-9) ✓ · medidor wired (11) ✓ · skills rodando hosted (8, 14 — `MAGNUS_SKILLS_DIR` já suportado) ✓ · fora-de-escopo respeitado (allowlist 501) ✓.
- **Tipos consistentes:** `TenantCtx{tenantId,wsRoot}` (T2) = consumido em T9/T12; `LedgerDB` (T7) = consumido em T8/T9; `RunUsage` é o existente de `lib/types.ts`; `guardHosted` shape único (T5).
- **Riscos explicitados:** gate não-atômico (T7 nota), import dinâmico ws-storage antes da T10 (T8 nota), inotify por tenant (T12 nota), build no VPS não no Mac (T14), env plaintext no VPS = dívida (T14).

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | (design aprovado em brainstorm 2026-06-10 com o Yuri) |
| Codex Review | `/codex review` (outside voice) | Independent 2nd opinion | 1 | ABSORBED | 19 pontos: 11 reais foldados (C1/C2/C3), 1 parcial (boot assert), 1 falso (testes existem — codex não via o repo do painel), 6 já decididos no gate |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 6 issues (2 P1 segurança, 3 P2, 1 P3 documentado), 3 test gaps fechados, 0 critical gaps residuais |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | UI reusa o design system do painel; E5 esconde controles local-only |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | n/a (produto, não devtool) |

- **CODEX:** outside voice rodou (gpt-5.5, high reasoning, 77.6k tokens); achados de segurança (runId server-side, runaway cap, Origin estrito, env inheritance) e produto (UI morta, skill body) todos foldados nas emendas E1-E6 com aprovação explícita do Yuri (D6: C1+C2+C3).
- **CROSS-MODEL:** sem tensão — codex REFORÇOU o hardening do eng-review e adicionou furos novos; nenhuma contradição entre os dois reviewers. Consenso forte na decisão #0 (fatia fina com hardening ok pro threat model F1a; container = F1b).
- **VERDICT:** ENG CLEARED (com codex absorvido) — pronto pra implementar. Decisões D1-D6 todas resolvidas pelo Yuri em 2026-06-10.

NO UNRESOLVED DECISIONS
