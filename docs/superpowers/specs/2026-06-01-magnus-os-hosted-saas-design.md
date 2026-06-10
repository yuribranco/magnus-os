# Magnus OS — Hosted Multi-Tenant SaaS — Design Spec (blueprint)

**Data:** 2026-06-01
**Status:** ✅ **ATIVADO em 2026-06-10** — o Yuri deu o GO pro hosted ("Vamos fazer o MagnusOS online"). Spec vigente: `2026-06-10-magnus-os-online-gestao-design.md`, que herda SP-0/SP-1/SP-2 deste blueprint com 3 mudanças (platform-key primeiro em vez de BYO; model-picker por skill; camada determinística como jobs de sistema). Este doc segue como referência técnica dos sub-projetos.
~~⚠️ BLUEPRINT — NÃO PARA IMPLEMENTAÇÃO IMEDIATA. Decisão do Yuri (2026-06-01): a direção ativa continua local-first.~~
**Origem:** sessão de brainstorming (`/superpowers:brainstorming`) após análise de FinOps completa. Decisões travadas via Q&A interativo.

---

## 0. Por que este spec existe (e por que não vamos executá-lo agora)

A análise de FinOps desta sessão provou que o **local-first é o motor de margem** do Magnus OS: a inferência roda na assinatura Claude do cliente + Gemini BYO-key → **COGS de IA ≈ $0 pro Yuri**. Mover o painel pra hosted re-onshora a inferência (agentic loop = 120–240k tokens/run), o que quebra um low-ticket de pagamento único — **a menos** que se use **BYO-key** (cliente põe a própria chave Anthropic mesmo no hosted), que devolve o COGS de inferência pra zero.

Conclusão estratégica: **hosted só faz sentido com BYO-key** (ou assinatura recorrente que cubra a inferência). Como a decisão atual é manter local (menos risco, economia comprovada, e a dor de "manter local" é resolvível com auto-update + instalador, que já existem), este documento fica como **blueprint pronto** — não como tarefa ativa.

**Regra de ouro do FinOps preservada:** custo recorrente/tenant só é sustentável num low-ticket de **pagamento único** se ≈ $0. O painel local satisfaz isso. O Radar tem custo recorrente por natureza → vira **upsell/assinatura/entrega-de-mentoria** (ver SP-3).

---

## 1. Decomposição em sub-projetos

O Magnus OS hosted **não é um projeto, é um programa** de 4 subsistemas independentes, cada um com seu próprio ciclo spec → plano → build:

| # | Sub-projeto | Escopo | Depende de | Estado |
|---|---|---|---|---|
| **SP-0** | Foundation (substrato) | Auth multi-tenant + licença Hotmart · Supabase RLS · `cost_ledger` · camada de plano (BYO/plataforma) · deploy substrate | — | desenhado aqui |
| **SP-1** | Painel hosted | Refactor multi-tenant do `magnus-painel` · sandbox efêmero por run · BYO-key · workspace no Storage | SP-0 | desenhado aqui |
| **SP-2** | Broker OAuth Meta | OAuth https license-gated, token cifrado | SP-0 + Meta App | spec pronto: `~/Downloads/handoff-meta-oauth-broker.md` |
| **SP-3** | Radar de Criativos | Scraping Apify + análise | SP-0 | handoff + brief; **variante local-com-login a decidir (§SP-3)** |

**Ordem recomendada (quando/se executar):** SP-0 (mínimo) → SP-1 (painel BYO-key MVP = veículo de teste de monetização) → SP-2 (broker, paralelo) → SP-3 (Radar, por último/paralelo).

**Princípio de reúso:** SP-1 **reusa o `magnus-painel` local como base** (não reescrever — multi-tenantizar o que já roda skills comprovadamente).

---

## 2. SP-0 — Foundation

### 2.1 Identidade / Auth / Licença
- **Supabase Auth (magic-link)** = identidade de sessão.
- A compra no Hotmart dispara o **`hotmart-webhook` (já LIVE** no Supabase Portal Magnus, ref `vbmvzmibupzpjwyrfmjs`) → cria/ativa o `tenant` + provisiona o usuário Auth → tenant loga em `magnusos.yuribranco.com.br`.
- **Licença = fonte de entitlement** (já existe `license-validate`); Supabase Auth = sessão. Assinatura cai → bloqueia entitlement, painel para (sem mexer na máquina de ninguém).
- **Tenancy = um nível:** 1 licença = 1 tenant = 1 empresa/marca (decisão Yuri). Sem camada de agência por ora (migração futura aditiva se precisar).

### 2.2 Data model (Supabase, RLS por `tenant_id` em tudo)
```
tenants        (id, license_id, status, plan jsonb, created_at)
                 plan = { key_source: "byo"|"platform", limits: {...} }
tenant_secrets (tenant_id, anthropic_key_enc, gemini_key_enc)   -- cifrados em repouso
cost_ledger    (id, tenant_id, service, ref, model, in_tok, out_tok, usd, ts)  -- DIA 1
runs           (id, tenant_id, skill, status, started_at, finished_at, usage jsonb)
```
- Workspace dos arquivos: **Supabase Storage**, bucket `tenant-workspaces/<tenant_id>/{contexto,operacao}/...`
- RLS por `tenant_id` em todas as tabelas + Storage policy por prefixo `<tenant_id>/`.

### 2.3 Camada de monetização (plan-layer)
- `plan.key_source` decide qual chave Anthropic injeta no sandbox: **`byo`** (chave do tenant) vs **`platform`** (chave do Yuri).
- `plan.limits` + `cost_ledger` enforçam teto (no-op pra `byo`).
- **Implementar `byo` primeiro** (incremento 1). `platform` (assinatura: chave do Yuri + teto alto + metering; limitado: teto baixo) = **incremento 2** — slot já modelado, sem re-shape.

### 2.4 Deploy substrate
- Domínio `magnusos.yuribranco.com.br` (Cloudflare DNS → VPS; subdomínio de domínio já controlado).
- Nginx + Let's Encrypt; Redis **self-hosted** no VPS (fila de runs — Upstash+BullMQ = trap de ~$170/mês por polling).
- CI/CD espelhando o deploy do Portal Magnus (GH Actions → rsync/pm2).
- **Custo fixo de plataforma ~$45/mês** (Supabase Pro $25 + VPS KVM4 ~$20 + Redis $0 + domínio ~$0).

---

## 3. SP-1 — Painel hosted (núcleo + executor de run)

### 3.1 Decisões de arquitetura (travadas no brainstorm)
- **Execução = sandbox efêmero por run.** Cada execução de skill sobe um sandbox descartável com só o workspace + a chave daquele tenant; morre no fim. Isolamento forte (agentic Bash + chave BYO num box compartilhado seria vazamento entre tenants). BYO-key torna o custo de isolar = só RAM transitória.
- **Workspace durável = Supabase Storage (source of truth).** Hidrata no scratch do sandbox no início do run; sincroniza alterados de volta no fim. Box-independente, backupado. UI lê do Storage/DB (substitui o chokidar local).
- **Inferência = BYO-key** (chave Anthropic do tenant, espelhando o padrão `lib/gemini-key.ts` que já existe), cifrada, injetada no env do sandbox por run → **$0 COGS de IA pro Yuri**.

### 3.2 Fluxo de um run
```
Browser (tenant logado)
 → web tier (Next compartilhado, RLS por tenant da sessão)
 → trigger de skill → enfileira job (Redis/BullMQ) {tenant_id, skill, form}
 → orquestrador puxa job → SANDBOX EFÊMERO:
     • hidrata: workspace do Storage → scratch /ws
     • injeta: chave Anthropic BYO (decifrada) + Gemini key no env
     • roda: Agent SDK query() cwd=/ws, skill reusada do plugin, streaming
     • stream: eventos SSE → web tier → browser (reusa run-stream atual)
     • fim: sync /ws→Storage · grava usage→cost_ledger+runs · destrói sandbox
 → UI re-lê estado do Storage/DB
```

### 3.3 Refactors local→hosted (sobre a base `magnus-painel`)
- `lib/runs-runtime.ts`: enfileira job em vez de spawnar in-process contra `MAGNUS_PAINEL_CWD`; o sandbox roda o SDK.
- **`lib/agent-sdk-map.ts:49-56`: parar de descartar `result.usage`** → grava em `cost_ledger` + `runs`.
- IO de workspace (`lib/paths.ts` + leituras): lê do Storage / scratch do sandbox; web tier renderiza do Storage/DB.
- `lib/gemini-key.ts` → estende pra `anthropic-key` (BYO), ambos cifrados por tenant.
- Auth: sessão Supabase + scoping por `tenant_id` em toda rota (hoje é auto-login sem auth).
- Confinar Bash ao `/ws` do sandbox (mata o `additionalDirectories=$HOME`).

### 3.4 Unidades testáveis (cada uma testável isoladamente)
| U | Unidade | Critério de teste |
|---|---|---|
| **U1** | Auth + provisioning (Hotmart webhook → tenant → login) | compra/simula → loga em magnusos.yuribranco.com.br |
| **U2** | Camada de Storage (CRUD + hidrata/sync) | sobe contexto/, vê renderizar no painel |
| **U3** | **Executor de run** (fila → sandbox → Agent SDK c/ BYO key → stream → sync → cost_ledger) | roda skill, vê output **+ custo logado no ledger** |
| **U4** | Onboarding BYO-key (cola chave Anthropic, cifrada, injetada) | roda c/ chave própria, **$0 pro Yuri**, custo no ledger |

U3+U4 são o **veículo do teste de monetização**: com BYO-key + cost_ledger, mede-se o custo real por tenant → decide BYO vs assinatura vs limitado com dado.

### 3.5 Erros & testes
- **Erros:** run falho → status em `runs` + SSE error event · sandbox crash → retry/dead-letter na fila · chave inválida → surfacea pro tenant · falha de sync → run marcado falho, workspace **não corrompe** (sync atômico).
- **Testes:** libs puras (IO de workspace, cálculo de custo, lógica de plan) em vitest (igual aos `meta-format.test.ts` existentes); executor em teste de integração com tenant-fixture + skill barata; QA-visual do painel hosted.

### 3.6 Aberto pro `/plan-eng-review` (técnico profundo — gate antes de codar)
- **Tecnologia do sandbox:** Docker container vs Firecracker microVM vs nsjail/gVisor — segurança × cold-start latency.
- **Orquestração:** BullMQ + sizing do pool de sandboxes; mitigação de cold-start (warm pool?).
- **Estratégia de sync de workspace:** full-dir vs diff de arquivos alterados; tratamento de conflito.
- **Cifra das chaves BYO:** Supabase Vault vs pgcrypto vs app-layer.

---

## 4. SP-2 — Broker OAuth Meta

Spec completo já existe em `~/Downloads/handoff-meta-oauth-broker.md` (mover pro repo). Resumo: route handlers https no VPS (`api.magnusos...` ou subdomínio), App Secret só no broker, troca OAuth server-side, token long-lived cifrado no Supabase amarrado à licença, refresh job. License-gated via Hotmart. App Review da Meta = gate de tempo (semanas) pra mentorados externos; dev mode cobre o Yuri + testers.

> **Nota de reconciliação (descoberta desta sessão):** o OAuth oficial do MCP `mcp.facebook.com/ads` via `claude mcp add` está quebrado por bug aberto da Anthropic (#29934, http loopback redirect). O **conector do claude.ai funciona no Claude interativo mas NÃO em runs headless** (SDK não herda conectores). Logo, pra dado Meta no painel (local OU hosted) a rota é **token + Graph API direto** (ou o broker, que emite o token via OAuth server-side https). O broker é a versão produtizada disso.

---

## 5. SP-3 — Radar de Criativos

Spec base: `~/Documents/Magnus/magnus-os/docs/handoff-radar-apify.md` + `docs/radar/2026-06-01-radar-kickoff-brief.md`.

### 5.1 Monetização (decisão Yuri 2026-06-01)
- **Radar = upsell do funil low-ticket + entrega da mentoria.** Casa com o FinOps: o Radar tem COGS recorrente por natureza (Apify) → **assinatura/add-on recorrente**, nunca bundle de pagamento único.

### 5.2 ⚠️ Decisão de arquitetura ABERTA — variante "local-com-login-online" (Yuri 2026-06-01)
Duas arquiteturas possíveis pro Radar, a decidir quando chegar nele:

- **(A) Server-hosted multi-tenant** (handoff original): Next14+tRPC+Prisma+Supabase RLS+BullMQ+VPS. Apify na conta do **Yuri** → COGS recorrente do Yuri (~$4.5–16/tenant/mês), exige assinatura/metered. Controle total, escalável.
- **(B) Local-com-login-online** (variante nova do Yuri): o Radar é **outra ferramenta dentro do site** que **roda local** na máquina do cliente, mas **faz login/licença online**. Implicação de FinOps: o **Apify vira BYO** (conta do cliente) → **$0 COGS de Apify pro Yuri**, igual ao BYO-key do painel. Coerente com a filosofia local-first do produto inteiro. Custo: cada cliente configura a própria conta Apify (fricção de onboarding), e a "espionagem profunda" v2 (worker SSRF) é mais difícil de isolar localmente.

> Resolver A vs B no kickoff do SP-3 (brainstorm próprio). A variante B alinha o Radar à economia local-first e pode ser a escolha certa pro estágio low-ticket.

---

## 6. Sequência de execução (quando autorizado)

1. **SP-0 mínimo** — auth/tenant/license + Supabase RLS + cost_ledger + plan-layer (byo) + deploy substrate.
2. **SP-1 (painel hosted BYO-key MVP)** — U1→U4. Veículo de teste de monetização. **Gate `/plan-eng-review` antes de codar a multi-tenancy/sandbox.**
3. **SP-2 broker** — paralelo após SP-0 + criação do Meta App.
4. **SP-3 Radar** — por último/paralelo; decidir arquitetura A vs B no kickoff.

Cada SP: spec → `writing-plans` → `/plan-eng-review` → build subagent-driven → `/codex review` gate → QA → merge.

---

## 7. Estado atual do produto (o que continua valendo enquanto local)

- **Painel local-first intacto** no master do `magnus-painel`. v1 "A Mágica" + auto-update SHIPPED (release 1.0.0). Inc 0 (enxugar) SHIPPED.
- **Inc 1 (dashboard Meta, file-first)** — branch `feature/inc1-meta-dashboard`, codex-clean (P1 + 3×P2 corrigidos). Compatível com local. Pendente: fonte de dado Meta ao vivo (token+Graph API decidido) + merge. **Não bloqueado por este spec.**
- **Backend de licença** Supabase Portal Magnus + Edge Functions (license-validate, hotmart-webhook) — LIVE, reaproveitado pelo SP-0 quando/se hosted.

**Próximo passo do produto = terminar o local** (Inc 1 → fonte Meta → merge; demais incrementos do redesign agência). Este spec espera o "go" pra hosted.
