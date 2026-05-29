# Magnus OS — Fase 3: Painel BYO-API-key — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps usam checkbox.

**Goal:** Evoluir o `magnus-painel` (Aula 4, hardened `dddbe32`) pro painel do produto Magnus OS:
auth via **API key do próprio cliente** (ToS-limpo, spec §3.1) e skills lidas do **plugin** (não do projeto).

**Architecture:** Evolução, não redesign (o painel já foi desenhado em `2026-05-28-magnus-painel-design.md`).
Três mudanças cirúrgicas: (1) injetar `ANTHROPIC_API_KEY` do cliente no `env` do `query()` do Agent SDK
(confirmado `env?: Record<string,string>` em `coreTypes.d.ts:36`); (2) `skillsDir()` resolve pro dir de
skills do **plugin instalado** (`MAGNUS_SKILLS_DIR`) com fallback pro projeto (dev); (3) onboarding da key +
estado gracioso sem key + branding "Magnus OS".

**Repo:** `~/Documents/Magnus/magnus-imersao/painel-aula-4/magnus-painel` (git, branch própria).
**SDK:** `@anthropic-ai/claude-agent-sdk` 0.1.77. O `bin/magnus-painel.mjs` já carrega o `.env` do workspace
pro `process.env` do server (parse zero-dep) — a key do cliente vive no `.env` (gitignored).

**Por que BYO-key (não a assinatura):** a partir de 15/06/2026 o Agent SDK na assinatura consome crédito
SDK capado + "third-party login" é proibido. API key do cliente = o caminho abençoado. (spec §1.)

---

### Task 1: `resolveApiKey()` + injetar `env` no query (TDD)

**Files:** Create `lib/api-key.ts`, `lib/api-key.test.ts` · Modify `lib/runs-runtime.ts`

**Contrato:** precedência `MAGNUS_ANTHROPIC_API_KEY` (explícito do painel) > `ANTHROPIC_API_KEY` (do .env já no env) > `null`. Nunca lança. Mascara em logs.

- [ ] **Step 1: teste (RED)** — `lib/api-key.test.ts` (vitest, padrão do repo): `resolveApiKey({})` → null; `resolveApiKey({MAGNUS_ANTHROPIC_API_KEY:'sk-a'})` → 'sk-a'; com só `ANTHROPIC_API_KEY:'sk-b'` → 'sk-b'; precedência explícito > ANTHROPIC_API_KEY; `maskKey('sk-ant-123456')` → `sk-…3456`.
- [ ] **Step 2: rodar (RED)** — `npm run -s test -- api-key` → falha.
- [ ] **Step 3: implementar** `lib/api-key.ts`:
```ts
export function resolveApiKey(env: NodeJS.ProcessEnv = process.env): string | null {
  const k = env.MAGNUS_ANTHROPIC_API_KEY?.trim() || env.ANTHROPIC_API_KEY?.trim();
  return k ? k : null;
}
export function maskKey(k: string): string {
  return k.length <= 8 ? "…" : `${k.slice(0, 6)}…${k.slice(-4)}`;
}
export function hasApiKey(env: NodeJS.ProcessEnv = process.env): boolean {
  return resolveApiKey(env) !== null;
}
```
- [ ] **Step 4: wire no `runs-runtime.ts`** — dentro de `options` do `queryFn({...})`, adicionar:
```ts
// BYO-API-key: roda na API key do PRÓPRIO cliente (ToS-limpo), não na assinatura.
...(resolveApiKey() ? { env: { ...process.env, ANTHROPIC_API_KEY: resolveApiKey()! } } : {}),
```
(import `resolveApiKey` de `./api-key`.) Sem key → não passa `env` (cai no comportamento atual; a UI avisa).
- [ ] **Step 5: rodar (GREEN)** + `npx tsc --noEmit`.
- [ ] **Step 6: commit** `feat(painel): BYO-API-key — injeta ANTHROPIC_API_KEY do cliente no Agent SDK`.

---

### Task 2: `skillsDir()` resolve pro plugin (TDD)

**Files:** Modify `lib/paths.ts` · Create/extend `lib/paths.test.ts`

**Contrato:** `skillsDir()` = `MAGNUS_SKILLS_DIR` (setado pelo instalador → dir de skills do plugin) se existir; senão `templateRoot()/.claude/skills` (dev/fallback). O painel já injeta `skill.body` (não depende do SDK auto-ativar) → só precisa apontar o scanner pro dir certo.

- [ ] **Step 1: teste (RED)** — com `MAGNUS_SKILLS_DIR` setado p/ um tmp existente → `skillsDir()` retorna ele; sem a env → retorna `templateRoot()/.claude/skills`.
- [ ] **Step 2: rodar (RED)**.
- [ ] **Step 3: implementar** em `lib/paths.ts`:
```ts
export function skillsDir(): string {
  const override = process.env.MAGNUS_SKILLS_DIR?.trim();
  if (override && existsSync(override)) return override;
  return path.join(templateRoot(), ".claude", "skills");
}
```
- [ ] **Step 4: GREEN** + `tsc --noEmit`.
- [ ] **Step 5: commit** `feat(painel): skillsDir resolve p/ o plugin (MAGNUS_SKILLS_DIR) com fallback`.

---

### Task 3: Onboarding da API key + estado gracioso sem key

**Files:** Create `app/api/apikey/route.ts` · Modify Boot (`app/boot/*`) + um banner no Workspace · Modify `lib/empresa.ts` (ou onde está o gate do boot) se preciso.

**Contrato:** O painel ABRE sem key (browse de arquivos/contexto funciona); rodar skill exige key. Boot ganha um passo "Conectar sua API key da Anthropic" com link guiado (`https://console.anthropic.com/settings/keys`), input, e validação leve. A key é gravada no `.env` do workspace (`ANTHROPIC_API_KEY=`), já carregado pelo bin no próximo start (avisar que precisa reiniciar o painel, ou setar em runtime via `process.env`).

- [ ] **Step 1:** `app/api/apikey/route.ts` — `GET` → `{ present: hasApiKey() , masked }`; `POST {key}` → valida formato (`^sk-ant-`), grava/atualiza `ANTHROPIC_API_KEY=` no `.env` do `templateRoot()`, seta `process.env.ANTHROPIC_API_KEY` em runtime (vale já nesta sessão do server), retorna `{ok:true, masked}`. Validação real opcional: 1 request mínima (deferível — formato basta no v1).
- [ ] **Step 2:** UI no Boot — card/step "API key da Anthropic" com estado (ausente/ok), input + botão Salvar + link pro console + 1 linha explicando "o Magnus OS roda na sua própria key (você controla o custo, centavos por uso)".
- [ ] **Step 3:** Gate gracioso — antes de iniciar uma run de skill, se `!hasApiKey()` → toast/banner "Conecte sua API key pra rodar skills" (não quebra o resto do painel). Reusar o padrão do `NotionConnectBanner`.
- [ ] **Step 4:** `tsc --noEmit` + commit `feat(painel): onboarding da API key do cliente + estado gracioso sem key`.

---

### Task 4: Branding "Magnus OS" + remover postinstall do copy-chief

**Files:** Modify `package.json` (name/bin), strings de UI "Magnus"→"Magnus OS" onde fizer sentido, `bin/postinstall.mjs`.

- [ ] **Step 1:** `bin/postinstall.mjs` — remover a instalação automática do copy-chief-black (agora o `copy-magnus` é on-demand via o stub do plugin). Deixar o postinstall no-op ou só uma mensagem.
- [ ] **Step 2:** Branding — `package.json name` (ex: `@magnus-os/painel` ou `magnus-os-painel`), título/header do painel "Magnus OS", remover menções a "copy-chief"/"/cc" na UI (DepsCheck banner → apontar pro `copy-magnus` se ainda existir).
- [ ] **Step 3:** `tsc --noEmit` + commit `chore(painel): branding Magnus OS + remove postinstall do copy-chief (copy-magnus é on-demand)`.

---

### Task 5: Validação (typecheck + build + smoke)

- [ ] **Step 1:** `npm run -s test` (todos) + `npx tsc --noEmit` PASS.
- [ ] **Step 2:** `next build` PASS (ou `--dev` smoke se build for pesado).
- [ ] **Step 3:** Smoke manual documentado: subir `magnus-painel --dev` apontando pro `template/` do plugin com `MAGNUS_SKILLS_DIR` = dir de skills do plugin + uma `ANTHROPIC_API_KEY` de teste no `.env` → confirmar que as skills aparecem (lidas do plugin) e que o init event do SDK usa a key. (Pode ser feito pelo Yuri no terminal dele — a task da minha sessão morre quando encerra.)
- [ ] **Step 4:** commit.

---

## Itens abertos (Fase 3)
1. **Armazenamento da key:** plaintext no `.env` gitignored do workspace (consistente com o bin que já o carrega + regra global de `.env.local`). Keychain do OS = melhoria futura.
2. **Validação real da key:** v1 = checagem de formato. Validação por request mínima = melhoria (custa 1 token; deferível).
3. **Reinício do server:** gravar no `.env` só vale no próximo start; mitigado setando `process.env` em runtime no POST. Confirmar no smoke.
4. **Painel carrega o plugin?** Resolvido: o painel NÃO usa o sistema de plugin do Claude Code — ele lê os SKILL.md direto (via `skillsDir()`) e injeta o body. `MAGNUS_SKILLS_DIR` aponta pro dir de skills do plugin instalado. Não depende de o Agent SDK "carregar plugins".
