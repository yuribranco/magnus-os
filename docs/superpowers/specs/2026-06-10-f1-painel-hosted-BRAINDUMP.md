# F1 — Painel Hosted MVP — BRAINDUMP / Handoff (pré-spec)

**Data:** 2026-06-10
**Status:** 📋 Handoff pro Fable 5 escrever a spec formal + plano. **NÃO é a spec final** — é o levantamento completo de tudo que a F1 precisa, com decisões travadas, recomendações e pontas abertas marcadas.
**Autor do braindump:** Claude (sessão /ceo, pós-F0 LIVE)
**Próximo:** Fable 5 → spec formal (`writing-plans` por fase) → `/plan-eng-review` (sandbox/sync/cifra) → `/codex review` → execução TDD.

> **Como usar:** ler primeiro o design mestre `2026-06-10-magnus-os-online-gestao-design.md` (§2 arquitetura, §4 sequência) e o blueprint `2026-06-01-magnus-os-hosted-saas-design.md` §3 (SP-1, detalhe do executor). Este doc consolida + atualiza ambos com o que mudou e o estado real pós-F0.

---

## 1. Estado atual — o que a F0 JÁ entregou (ponto de partida da F1)

**F0 está 100% LIVE.** A F1 começa em cima disto, não do zero:

- **Repo:** `github.com/yuribranco/magnus-os-online` (HEAD `04acec0` + commit held `78a3dc4` do CI).
- **Supabase dedicado** `jvxttcmazquypscjuaiz` (conta SEPARADA, região Oregon — dívida de latência, ver §8). Secrets via 1Password item `magnus-os-online-secrets` (refs `op://` no `.env.op`).
- **Schema multi-tenant aplicado** (migrations 0001-0003):
  - `tenants` (id, subscriber_code, email, plan, status, auth_user_id, last_transacao) + RLS
  - `webhook_events` (dedup por `(event, transacao)`)
  - `tenant_secrets` (slot pra credenciais cifradas por tenant — **ainda não usado**)
  - `cost_ledger` + `runs` + fns `tenant_usage_month(uuid)` / `tenant_budget_remaining(uuid)` (security definer, grants endurecidos só pra service_role — migration 0003)
  - `DEFAULT_ONLINE_PLAN = { key_source: "platform", limits: { usd_month: 20 } }` (em `supabase/functions/_shared/tenants.ts`)
- **Webhook Hotmart** `hotmart-webhook` deployado e provando provisioning (smoke 6/6, D9 provado: rebill→1 tenant). Produto Hotmart **MagnusOS id 7910139** (vendas OFF, R$997/ano provisório).
- **Auth** Supabase magic-link configurado (site_url + redirect `magnusos.yuribranco.com.br/**`).
- **Substrato de deploy LIVE:** health server em **https://magnusos.yuribranco.com.br/api/health** → `{"ok":true,"version":"f0"}`, rodando como pm2 `magnusos-online` (porta 3100) no **VPS do Portal** `72.60.241.64`, nginx aditivo + certbot. `/var/www/magnusos-online` = código; `/var/lib/magnusos` = estado de runtime (criar na F1, fora do rsync).

**Acesso SSH ao VPS:** `ssh -i ~/.ssh/id_ed25519 root@72.60.241.64` (pubkey do Mac já autorizada). Break-glass no 1Password.

---

## 2. Decisões TRAVADAS (não reabrir sem motivo)

1. **`key_source: platform`** — Magnus paga a API Anthropic com **UMA chave de plataforma compartilhada** (`ANTHROPIC_API_KEY`), embutida no preço. NÃO é BYO-key nem BYO-subscription no MVP. Billing **por token (API)** → isola o hosted da mudança de billing de 15/06 (que só atinge uso por assinatura = produto LOCAL). Ref: `2026-06-10-cost-premise-post-15jun-addendum.md`.
   - **Corolário crítico que muda o blueprint:** o blueprint 2026-06-01 assumia BYO-key por tenant → justificava sandbox efêmero forte (isolar chaves entre tenants). **Com chave de plataforma única, essa ameaça SOME** — não há chave-por-tenant pra vazar. O que sobra isolar: workspace entre tenants, Bash agêntico escapando do `/ws`, e (na F2) tokens Meta/Hotmart cifrados. Isso reabre a decisão de escopo do executor (§5, decisão #0).
   - `cost_ledger` = **enforcement** (teto por plano, bloqueio com mensagem clara, medidor visível), não só medição.
2. **VPS = reusa o Portal `72.60.241.64`** (decisão Yuri 2026-06-10). Escala o próprio server (upgrade de plano KVM) quando precisar; **depois move o Portal pra outro lugar** e magnusos vira dono da caixa. Não provisionar VPS dedicado novo agora. Caixa atual: 1vCPU/4GB, **3.2GB livres** pós-limpeza (deletamos recasamento + clawdbot-gateway que comia 1.7GB).
3. **Foco da v1 = gestão** (visão executiva Meta×Hotmart + especialistas com trabalho real). Interface conversacional = depois ("interface is theater"). Escada: v1 prepara (draft-only) → v2 integra com aprovação → v3 autonomia.
4. **Produto local atual = dev/dogfood** (Yuri + Léo). Mentorados novos → online.
5. **1º especialista = Gestor de Tráfego** (mas isso é F4, não F1).

---

## 3. Escopo da F1 (o que entra)

Do design mestre §4: **"Refactor multi-tenant · sandbox executor · Storage · medidor UI · skills atuais rodando"**. Depende de F0 (✅). Gate: `/plan-eng-review` (sandbox/warm pool/sync).

**Entregáveis concretos:**
- **U1 — Auth + sessão multi-tenant.** Hoje o painel é auto-login sem auth. Passar pra: sessão Supabase (magic-link, já configurado na F0) + scoping por `tenant_id` em TODA rota/query. RLS já existe no schema.
- **U2 — Camada de Storage.** Workspace durável = Supabase Storage `tenant-workspaces/<tenant_id>/` (source of truth). CRUD + hidrata (Storage→scratch no início do run) + sync (scratch→Storage no fim). Substitui o `chokidar` local. UI lê do Storage/DB.
- **U3 — Executor de run.** Fila → executa skill com Agent SDK (cwd=workspace, chave de plataforma injetada) → stream SSE → sync → grava usage no `cost_ledger`+`runs`. **É o coração da F1.** (Grau de isolamento = decisão #0 aberta, §5.)
- **Medidor UI wired.** O medidor de crédito JÁ foi construído no produto local (release 1.2.19 segurada) — `lib/usage-store.ts`, `CreditBadge.tsx`, `/api/usage`. Na F1 ele lê do `cost_ledger` hosted (por tenant), não do JSONL local. Mostra teto do plano + bloqueio.
- **Skills atuais rodando hosted.** As skills do plugin (criar-criativo, criar-landing, radar, checar-marca etc) rodam no executor hosted. Model-picker por skill (`panel.model: haiku|sonnet|opus`) já existe no frontmatter.

**FORA da F1** (não fazer): chat orquestrador · escrita nas plataformas (v2) · Visão Empresa (F3) · Gestor de Tráfego (F4) · broker Meta (F2) · BYO-key (slot modelado, não construído) · onboarding fim-a-fim (F5).

---

## 4. Arquitetura do executor (fluxo de um run) — atualizado pra chave de plataforma

```
Browser (tenant logado, sessão Supabase)
 → web tier (Next compartilhado, scoping por tenant_id da sessão)
 → trigger de skill → enfileira job {tenant_id, skill, form}
 → orquestrador puxa job → EXECUTOR:
     • hidrata: workspace do Storage tenant-workspaces/<id>/ → scratch /ws
     • injeta: ANTHROPIC_API_KEY de PLATAFORMA (não BYO) + Gemini key no env
     • roda: Agent SDK query() cwd=/ws, skill do plugin, streaming, Bash confinado ao /ws
     • stream: eventos SSE → web tier → browser (reusa run-stream atual)
     • fim: sync /ws→Storage · grava usage→cost_ledger+runs · limpa scratch
 → UI re-lê estado do Storage/DB
```

**Diferença vs blueprint:** a chave injetada é a de PLATAFORMA (uma só), não BYO por tenant. Isso simplifica a injeção (não precisa decifrar chave por tenant pra inferência) e enfraquece a ameaça de isolamento (ver decisão #0).

---

## 5. Decisões ABERTAS pro `/plan-eng-review` (gate antes de codar)

**#0 (NOVA, a mais importante) — Grau de isolamento do executor.** Com a chave de plataforma única, o container efêmero por run ainda se justifica?
- **Recomendação do braindump: FATIA FINA primeiro (F1a).** Executor = **processo isolado por run** no mesmo box (Bash confinado ao `/ws` via `additionalDirectories` restrito, sem `$HOME`; scratch por run apagado no fim; chave de plataforma no env do processo, nunca em log/prompt). Modelo de ameaça pós-chave-de-plataforma: tenants são mentorados semi-confiáveis rodando skills do PRÓPRIO Magnus (não código arbitrário); o risco é bleed de workspace + Bash escapando — mitigável sem container. Sobe o teste de 7 dias muito mais rápido.
  - **F1b (depois, quando concorrência/risco exigir):** container efêmero (Docker) por run, fila BullMQ, warm pool, hidrata/sync Storage↔container. Aí entram as decisões #1-#3 abaixo.
- **Alternativa: SP-1 completo de cara** (container Docker desde o dia 1) — isolamento mais forte, mais engenharia antes do 1º mentorado. **Yuri/Fable decidem.**

**#1 — Tecnologia do sandbox** (só se for pro container, F1b): Docker container vs Firecracker microVM vs nsjail/gVisor — segurança × cold-start. Recomendação provável: **Docker** (simples, bom-o-suficiente pro threat model; microVM é overkill operacional pra 1-2 mentorados).

**#2 — Orquestração** (F1b): BullMQ + sizing do pool; mitigação de cold-start (warm pool?). Redis self-hosted (não tem no VPS ainda — instalar; F0 adiou). Na fatia fina (F1a), fila pode ser mais simples (in-process queue ou tabela `runs` com worker).

**#3 — Estratégia de sync de workspace:** full-dir vs diff de arquivos alterados; tratamento de conflito. Sync **atômico** (run falho não corrompe workspace). Considerar tamanho dos workspaces (contexto/ + artefatos).

**#4 — Cifra de credenciais por tenant:** Supabase Vault vs pgcrypto vs app-layer. **Na F1 a chave de inferência é de plataforma (não precisa cifrar por tenant)** — esta decisão importa mesmo na **F2** (tokens Meta/Hotmart por tenant). Mas o slot `tenant_secrets` + o padrão (estender `lib/gemini-key.ts` pra cifra por tenant) deve ser desenhado aqui. Lição do scrub da `TOKEN_ENCRYPTION_KEY` (auditoria 2026-06-09): secrets nunca em prompt/log.

---

## 6. Refactors concretos local→hosted (sobre a base `magnus-painel`)

A base é **refactor do `magnus-painel`, NÃO rewrite**. Pontos exatos (do blueprint §3.3):

- **`lib/runs-runtime.ts`** — hoje spawna o SDK in-process contra `MAGNUS_PAINEL_CWD`. Mudar pra: enfileira job {tenant_id, skill, form} → executor roda o SDK no scratch do tenant. (Onde o medidor de crédito do 1.2.19 já gravou usage 1× no `finally` — preservar essa lógica, redirecionar pro `cost_ledger` hosted.)
- **`lib/agent-sdk-map.ts`** — já tem `extractUsage()` (do 1.2.19). Garantir que grava em `cost_ledger`+`runs` por tenant (não no JSONL local).
- **IO de workspace (`lib/paths.ts` + leituras)** — ler do Storage/scratch do sandbox; web tier renderiza do Storage/DB (não do filesystem local).
- **`lib/gemini-key.ts`** — padrão de chave por tenant cifrada. Na F1 estender o conceito pro slot `tenant_secrets` (mesmo que a chave Anthropic seja de plataforma; Gemini e futuros tokens são candidatos).
- **Auth** — hoje auto-login sem auth (`feedback_no_login` é do YuriOS LOCAL; o hosted PRECISA de auth real). Sessão Supabase + `tenant_id` scoping em toda rota.
- **Bash** — confinar ao `/ws` (matar `additionalDirectories=$HOME` que existe no local).
- **Medidor** — `lib/usage-store.ts` (JSONL local) → ler do `cost_ledger` hosted por tenant. `CreditBadge.tsx` + `/api/usage` adaptam pra teto do plano do tenant.

---

## 7. Unidades testáveis + erros (do blueprint §3.4-3.5)

| U | Unidade | Critério de teste |
|---|---|---|
| U1 | Auth + sessão multi-tenant | compra/simula Hotmart → magic-link → loga, vê só os dados do próprio tenant (RLS) |
| U2 | Storage (CRUD + hidrata/sync) | sobe contexto/, vê renderizar no painel hosted |
| U3 | Executor de run | roda skill → output + **custo logado no cost_ledger** + teto respeitado |
| Medidor | UI wired ao ledger hosted | badge mostra uso/teto do tenant; bloqueio com mensagem ao estourar |

**Erros:** run falho → status em `runs` + SSE error · executor crash → retry/dead-letter · falha de sync → run marcado falho, workspace **não corrompe** (sync atômico) · teto estourado → bloqueia com mensagem clara.

**Testes:** libs puras (IO workspace, cálculo de custo, lógica de plan) em vitest (igual `meta-format.test.ts`); executor em integração com tenant-fixture + skill barata; QA-visual do painel hosted. Cada fase fecha com `/codex review` + testes.

---

## 8. Prerequisitos / infra a montar na F1

- **Redis** no VPS do Portal (F0 adiou — só se for pro caminho de fila BullMQ/F1b; a fatia fina pode usar a tabela `runs` + worker simples).
- **Storage bucket** `tenant-workspaces` no Supabase `jvxttcmazquypscjuaiz` (criar + RLS por path do tenant).
- **`ANTHROPIC_API_KEY` de plataforma** no 1Password `magnus-os-online-secrets` + injetada no env do executor (NUNCA no frontend, nunca em log).
- **CI/CD** — `gh auth refresh -h github.com -s workflow` (Yuri) pra pushar o `deploy.yml` segurado (`78a3dc4`). Ajustar pra buildar o painel Next (não só o health server).
- **Escalar o VPS do Portal** quando a concorrência crescer (upgrade de plano KVM na Hostinger) — decisão Yuri travada.
- **`/var/lib/magnusos`** pra estado de runtime do executor (fora do rsync `--delete`).
- ⚠️ **Latência Oregon↔SP:** o Supabase está em us-west-2. Mesmo problema do CRM AMC (~180ms/query). Avaliar se a F1 sofre (workspace IO via Storage cross-region pode doer); possível migração de região = decisão grande.

---

## 9. Gates obrigatórios (workflow do projeto)

1. **`writing-plans`** (Fable 5) — spec formal + plano TDD por fase (F1a, depois F1b se aplicável).
2. **`/plan-eng-review`** — resolve as decisões abertas §5 (isolamento, sandbox tech, fila, sync, cifra). **Gate antes de codar.**
3. **`/codex review`** do plano — 2ª opinião independente até GATE PASS.
4. Execução **TDD** (vitest libs puras + integração executor).
5. **`/review`** pré-merge · **`/simplify`** em arquivos >80 linhas novas · **`/ship`**+**`/canary`** no deploy (VPS compartilhado com Portal → canary observando magnus/grupoaion é obrigatório).
6. Fecha com **`/qa`** do painel hosted.

---

## 10. Ponteiros (todos os arquivos relevantes)

- **Design mestre:** `docs/superpowers/specs/2026-06-10-magnus-os-online-gestao-design.md` (§2 arquitetura, §4 sequência F0-F5)
- **Blueprint detalhado:** `docs/superpowers/specs/2026-06-01-magnus-os-hosted-saas-design.md` (§3 SP-1 = executor)
- **Addendum de custo (chave de plataforma):** `docs/superpowers/specs/2026-06-10-cost-premise-post-15jun-addendum.md`
- **Plano F0 (referência do que já foi feito + template VPS dedicado):** `docs/superpowers/plans/2026-06-10-magnus-os-online-f0-foundation.md`
- **VOC (donos de agência, faixa de preço, objeções):** `docs/research/2026-06-10-voc-donos-de-agencia-roadmap.md`
- **Repo hosted:** `~/Documents/Magnus/magnus-os-online/` (schema, webhook, infra)
- **Base do painel a refatorar:** `~/Documents/Magnus/A Minha Casa/magnus-contexto/` (workspace real) + o repo do `magnus-painel` (plugin/painel)
- **Memória viva:** `project_magnus_os_product` (blocos RESUME no topo)
- **Curso que originou a visão:** wiki `[[jarvis-agentic-ai-for-founders]]` (5 aulas: escada de especialistas, "interface is theater", review-loop)

---

## TL;DR pro Fable 5

F0 entregou a fundação multi-tenant LIVE (auth, schema, webhook, cost_ledger, deploy). F1 = transformar o `magnus-painel` (hoje local single-user) em **painel hosted multi-tenant** rodando no VPS do Portal: auth real por tenant + workspace no Storage + executor que roda as skills com a chave de plataforma e grava custo no ledger + medidor wired. **A decisão #0 (fatia fina = processo isolado vs container sandbox completo) é a primeira coisa a travar** — o braindump recomenda fatia fina primeiro (a ameaça que pedia container sumiu com a chave de plataforma única), mas é decisão do Yuri/`/plan-eng-review`. Reusa o VPS do Portal, escala quando precisar.
