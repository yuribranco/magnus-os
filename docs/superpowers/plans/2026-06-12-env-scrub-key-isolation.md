# Plano — Isolar a chave de IA da plataforma do agente do tenant (key isolation hosted)

**Data:** 2026-06-12 · **Projeto:** magnus-os-online (painel hosted multi-tenant) · **Gate:** `/plan-eng-review` ✅ + codex outside-voice ✅ (report no fim)
**Origem:** achado de segurança F1a. **É a F1b (sandbox por run) adiada — agora justificada pela key de plataforma.**
**Status:** DRAFT v3 — direção travada (Yuri: "o mais completo" + incorporar isolamento de OS). Spike (Task 0) antes de deploy.

---

## Problema (em linguagem simples)

O hosted roda agentes de IA pros clientes. A **plataforma (Magnus) paga a API** com UMA chave
Anthropic — o "cartão de crédito da empresa". Pra IA trabalhar, a chave fica no servidor. Mas o
agente tem **Bash** (bypassPermissions): um tenant hostil manda a IA rodar `echo $ANTHROPIC_API_KEY`
(ou ler de outros lugares — ver abaixo) e **rouba a chave**, torrando inferência às custas do Magnus.

**Blast radius HOJE = 0** (tenants = Yuri/Leo). **Gate hard antes do 1º tenant externo** (F5).

## A brecha que o codex achou (e por que proxy+env-scrub sozinhos NÃO bastam)

O agente roda como o **mesmo usuário Unix** (`magnus`) que o painel. Mesmo escondendo a key do
`options.env` do agente, o Bash dele pode pegá-la em vários lugares que continuam vivos:

```
  Bash do agente (user magnus)  ──┬──▶ /proc/<painel-pid>/environ   (key na memória do painel)
                                  ├──▶ .env.production / PM2 dump / systemd env  (key no disco)
                                  ├──▶ ps eww  (env de outros processos)
                                  └──▶ /proc/<proxy-pid>/environ   (se o proxy for do mesmo user)
```

Analogia: o cliente e o porteiro moram na **mesma casa com a mesma chave da porta** — o cliente
entra no quarto do porteiro e vê o cartão. **O boundary que falta é isolamento de OS:** dar uma
**casa separada** pro agente (usuário Unix dedicado, ou container por run), com o cartão num
**cofre que só o porteiro abre**.

## Premissas CORRIGIDAS (investigação 2026-06-12, bundle real `@anthropic-ai/claude-agent-sdk` 0.1.77)

1. `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` **não existe** (fonte da memory era alucinação do guia).
2. `CLAUDE_CODE_DONT_INHERIT_ENV` insuficiente (só snapshot `Ki8`; exec real `qi8` passa
   `process.env` inteiro).
3. Spawn do SDK tem `stdio` fixo `["pipe","pipe",stderrMode]` → rota FD inviável via `query()` puro.
4. ✅ CLI honra `ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN` → viabiliza o proxy.
5. `CLAUDE_CODE_BUBBLEWRAP=1` é flag black-box (Linux, explícito) — **não é spec de segurança**;
   não garante netns/pid/mount namespace nem allowlist de rede por porta (codex). `bwrap` NÃO
   instalado no VPS.
6. **5 call sites do SDK**, não 1: `app/api/chat/route.ts`, `app/api/run/start/route.ts`,
   `lib/agent-sdk.ts`, `lib/runs-runtime.ts`, `lib/hosted/stale-runs.ts`. `/api/chat:28-34` chama
   `query()` com bypass + `extraDirs=process.env.HOME`, **sem `hostedRunEnv`** → herda env cru.
7. `cost_ledger` **não é hard cap atômico** (próprio comentário `ledger.ts:4`): gate ANTES do run,
   grava custo DEPOIS → runs concorrentes / 1 run gigante estouram o teto.

## Solução — defesa em camadas (a Camada 0 é o boundary duro)

```
┌── VPS magnus ───────────────────────────────────────────────────────────┐
│  user: magnus (painel + proxy)            user: magnus-agent (sandbox)    │
│  ┌─────────────┐  key real (cofre 0400,   ┌──────────────────────────┐   │
│  │ PROXY infer │◀─ só legível por magnus)  │ agente do tenant (Bash)  │   │
│  │ 127.0.0.1   │   injeta Authorization    │ NÃO lê /proc/painel,     │   │
│  │ +budget HARD│◀──────IPC estreito────────│ NÃO lê .env, vê só o ws  │   │
│  └──────┬──────┘   ANTHROPIC_BASE_URL=     │ env: BASE_URL + token    │   │
│         │          127.0.0.1 + token scoped└──────────────────────────┘   │
│         ▼  api.anthropic.com                  (hidepid/netns/container)    │
└──────────────────────────────────────────────────────────────────────────┘
```

- **Camada 0 (boundary duro) — Isolamento de OS.** O agente do tenant roda como **usuário Unix
  dedicado** (`magnus-agent`, sem privilégio) OU container por run. Garantias: não lê
  `/proc/<painel|proxy>/environ` (montar `/proc` com `hidepid=2` ou pid-namespace), não lê
  `.env.production`/PM2/systemd (permissões + FS namespaced ao ws), não vê env de outros via
  `ps eww`. A key real fica em **cofre `0400` legível só por `magnus`** (nunca pelo user do agente).
- **Camada 1 — Proxy de inferência (de outro user) com budget HARD por request.** Key real só no
  proxy. Agente recebe `ANTHROPIC_BASE_URL=127.0.0.1:<porta>` + token scoped por-run. O proxy:
  valida o token, injeta `Authorization`, **enforça budget/rate/max_tokens/model/endpoint POR
  REQUEST** (não só loga), faz strip de headers `authorization`/`x-api-key`/`anthropic-*` de
  entrada não-allowlistados, restringe paths aos endpoints Anthropic, não reflete erros upstream
  sensíveis. Idem Gemini (proxiar) OU mover geração de imagem pra server-side fora do agente.
- **Camada 2 — Cobrir TODOS os 5 call sites.** Unificar a montagem de env do SDK numa função só
  (hoje `hostedRunEnv` cobre 1) → todos os caminhos hosted passam por ela. `/api/chat` e
  `/api/run/start` NÃO podem injetar env cru.
- **Camada 3 — Teste de exfiltração abrangente.** Run hosted que tenta TODOS os vetores: `echo
  $ANTHROPIC_API_KEY`/`$GEMINI_API_KEY`, `cat /proc/self/environ`, `cat /proc/<painel-pid>/environ`,
  `printenv`, `env`, `ps eww`, ler `.env.production`/PM2 dump/systemd env, `python -c 'os.environ'`
  → **asserta** key real ausente em todos. Pre-deploy/CI = cadeado permanente.
- **Camada 4 — Bubblewrap configurado de verdade (profundidade).** Se usado, especificar
  mount/pid/proc namespace explícito (não confiar na flag black-box). Complementa a Camada 0, não
  a substitui.
- **Fix do teto (separado, P1):** tornar o `budgetGate` atômico (reserva pré-run ou cap no proxy
  por request) pra "gastou até o teto" virar verdade — fecha o estouro por concorrência.

## Tasks (TDD; spike trava o desenho)

- **Task 0 — SPIKE (bloqueia; zero deploy).** Provar local: (a) agente como user separado roda um
  run real de skill (inferência viva via proxy, grava ledger) E `/proc/<painel>/environ` +
  `.env*` + `ps eww` NÃO revelam a key; (b) micro-proxy próprio (~50-80 linhas, zero dep) vs
  pronto (LiteLLM) — [Layer 1] preferir o menor; (c) modelo de rede que confina o agente ao
  `127.0.0.1:<proxy>`. Saída: desenho final travado.
- **T1 — Camada 0:** provisionar user `magnus-agent` (ou container), `/proc` hidepid/namespace,
  FS scope ao ws, cofre `0400` da key. `scripts/deploy.sh` idempotente. Smoke de isolamento.
- **T2 — Camada 1:** micro-proxy (`painel/lib/inference-proxy/`) de user `magnus` com budget HARD
  por request + strip de headers + path allowlist. TDD: token válido→200; ausente→401; key nunca
  volta pro agente; budget excedido→429; custo atribuído ao tenant.
- **T3 — Camada 2:** unificar env do SDK; os 5 call sites passam pela função hosted; `/api/chat` e
  `/api/run/start` sem env cru. TDD por call site.
- **T4 — Camada 3:** teste de exfiltração abrangente no pre-deploy. Sem ele → deploy bloqueado.
- **T5 — Gemini:** proxiar OU tirar do contexto do agente (decisão no spike). Remover do env do run.
- **T6 — Fix teto atômico:** reserva pré-run no `budgetGate` ou cap por-request no proxy. TDD de
  concorrência (2 runs simultâneos não estouram).
- **T7 — Bubblewrap (Camada 4, opcional):** se o spike mostrar valor além da Camada 0, configurar
  namespaces explícitos.
- **T8 — Deploy + canary:** `scripts/deploy.sh`, restart cirúrgico `magnusos-online` (id3), Portal
  intocado, `/codex review`, canary 5-15min.

## Riscos & decisões
1. **Container por run vs user dedicado:** user dedicado é mais leve (sem overhead de container/run),
   container isola mais. Spike decide (provável: user dedicado + namespaces basta; container = ouro).
2. **Latência:** +1 hop loopback por chamada (ms) — desprezível.
3. **Rede do agente:** confinar ao proxy pode quebrar skills que usam rede via Bash (curl) — mapear
   no spike (tools nativas WebFetch não passam pelo Bash).
4. **Sem deploy até** Task 0 + T4 verdes. Blast radius 0 dá o luxo.

## NOT in scope
- Isolar segredos ENTRE tenants legítimos no resto do sistema (token-per-tenant) — frente separada.
- Rota FD via patch do SDK — descartada (frágil; a Camada 0+proxy supera).
- Migrar Portal (`magnus` id0) — intocado.

## What already exists (reuso)
- `hostedRunEnv` (`runs-runtime.ts:120`) — whitelist mínima; T2/T3 unificam e expandem, não reescrevem.
- `cost_ledger` + budget + `maxTurns`/timeout — base do enforcement; T6 fecha a atomicidade.
- Receita de deploy do VPS magnus (memory) — vira `scripts/deploy.sh`.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | issues_found | 10 findings (1 FATAL call-site, ledger non-atomic, OS-isolation gap) — all absorbed into v3 |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | clean | 1 arch issue (proxy route) → absorbed; scope expanded per codex |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | n/a (backend/infra) |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | n/a |

- **CODEX:** found the load-bearing gap — same-Unix-user lets Bash read the key from `/proc`/env files regardless of proxy; `/api/chat` bypasses the env whitelist; `cost_ledger` isn't an atomic cap. All folded into v3 (Camada 0 OS isolation, 5-call-site coverage, atomic-budget T6).
- **CROSS-MODEL:** Eng review proposed proxy+bubblewrap; codex proved it insufficient without OS isolation. Resolved in favor of codex (Yuri D2 = incorporate). No remaining tension.
- **VERDICT:** ENG CLEARED (plan-stage) — ready to implement starting at Task 0 (spike). No deploy until Task 0 + T4 green.

NO UNRESOLVED DECISIONS
