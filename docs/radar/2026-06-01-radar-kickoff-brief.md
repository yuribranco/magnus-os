# Radar de Criativos + Espionagem — Kickoff Brief

**Data:** 2026-06-01
**Status:** PREP / kickoff — alimenta brainstorm + `/plan-eng-review`. **NÃO** é o plano de implementação.
**Owner:** Yuri
**Fonte:** `docs/handoff-radar-apify.md` (spec rica do módulo) + decisões de arquitetura travadas em 2026-06-01.

> Este brief decanta o handoff em decisões de kickoff. O handoff continua sendo a spec canônica de
> implementação; aqui o objetivo é destravar o brainstorm e o `/plan-eng-review` antes de levantar a stack.

---

## 1. O que é o Radar

O **Radar de Criativos + Espionagem** é um produto de inteligência competitiva para quem roda
lançamento/venda de infoproduto: dado a empresa e a campanha de um cliente, o Radar **descobre os
concorrentes sozinho** (seed keywords → Meta Ad Library), **monitora os ads e o conteúdo orgânico**
(Instagram + YouTube), **pontua o que está "vencendo"** com um score determinístico, e usa uma
**camada Claude qualitativa** (lente Breakthrough Advertising) pra transformar os vencedores em
hipóteses/briefs de criativo em PT-BR — nunca cópia. No v2, faz **espionagem profunda** de um
concorrente confirmado (funil inteiro + infra técnica), sob demanda.

**Relação com o Magnus OS (separado, mas dentro):** o Radar vive *conceitualmente* dentro do
ecossistema Magnus OS, mas é um **produto novo e separado, com repo próprio e stack própria**. O
Magnus OS principal é **local-first** (roda na máquina do cliente, assinatura Claude dele, zero custo
de inferência, sem servidor de IA). O Radar é o **oposto deliberado**: é **server-hosted
multi-tenant** porque o Yuri quer controle de ponta a ponta e poder escalar livremente, e porque ele
lida com dado de **concorrente** (não dado próprio do cliente), o que exige coleta/normalização
centralizada. Consequências travadas:
- O antigo **Inc 2a-local** (skill `pesquisar-criativos`) está **SUPERSEDED** — toda a inteligência de
  criativo/concorrente migra pro Radar.
- O **Inc 1** (dashboard de performance da *própria* conta) **continua local-first no Magnus OS** — é
  dado do próprio cliente, não concorrente.
- O **Inc 2b/2c** (top próprios + variações on-brand): próprios = Magnus OS local; competitor = Radar.
  Repensar a fronteira na hora de planejar.
- O Radar **pode usar a Claude API server-side** (produto monetizado, chave do Yuri). A premissa
  "zero custo de inferência" era específica do Magnus OS local-first e **não se aplica** aqui.

---

## 2. Repo + nome proposto

Sugestão de repo (GitHub do Yuri, privado):

- **`yuribranco/radar`** — curto, é como o produto já é chamado internamente. (Preferido.)
- Alternativas: `yuribranco/magnus-radar` (deixa explícita a relação com o ecossistema) ou
  `yuribranco/radar-criativos`.

Local no disco: `~/Documents/Magnus/radar` (irmão de `magnus-os`, não dentro dele — repo e stack
próprios). A **decisão final do nome é do Yuri** (ver Open Questions).

---

## 3. Resumo de arquitetura (destilado do handoff)

**Stack server-hosted multi-tenant:**
- **Next.js 14** (App Router) + **TypeScript** (zero erro de TS por fase) + **tRPC** (API tipada
  ponta a ponta) + **Prisma** + **Supabase** (Postgres + Storage + **RLS por `tenant_id`**) +
  **BullMQ** (filas) + **Tailwind**.
- Deploy **Hostinger VPS** (PM2 + Nginx).
- **Engine de IA: Claude API server-side** (chave do Yuri).

**Data flow (núcleo do MVP):**
```
PanelCompany (empresa + campanha do cliente)
  └─> Claude gera seed keywords (PT + EN, 8-15)                          [nativo]
       └─> varre Meta Ad Library por keyword (searchQueries em batch)     [Apify — imprescindível]
            └─> coleta anunciantes distintos (pageId + pageName)
                 └─> rank determinístico (relevanceScore)                 [nativo]
                      └─> top ~15 viram Competitor SUGGESTED
                           └─> humano confirma/rejeita no painel          [human-in-the-loop]
                                └─> só CONFIRMED entra no monitoramento
                                     └─> ingestão de ads + download de mídia pro Storage
                                          └─> winner-score determinístico
                                               └─> camada Claude qualitativa (extract + suggest)
                                                    └─> painel (briefs PT-BR, rotulados como sinal)
```

**Multi-tenant + RLS:** toda query do app filtra por `tenant_id`; jobs de background **carimbam
`tenant_id` sempre**. RLS no Supabase bloqueia leitura cross-tenant. Modelos Prisma centrais:
`Tenant`, `PanelCompany`, `Competitor` (status SUGGESTED/CONFIRMED/REJECTED), `CompetitorAd`,
`CompetitorPost`, `DiscoveryRun`, `ScrapeJob` (metra custo por tenant).

**Job queue (BullMQ):** filas `discover`, `ingest_ads`, `ingest_organic`, `score`. Apify roda
assíncrono — dispara run, recebe webhook "run succeeded", enfileira `fetch-dataset` que normaliza e
persiste. Pode terceirizar o cron pras **scheduled runs nativas da Apify** e só receber webhook.
Cadência: ads 24h, orgânico 24-48h, re-score após ingestão. **Guardrail de custo por tenant**
(teto/mês, corta job ao estourar; metrado em `ScrapeJob.costUsd`).

**Provider abstraction (native-first, Apify-for-imprescindível):** regra de roteamento governa toda
coleta —
1. **Default = nativo** (fetch/parse/markdown + toda recon: DNS, WHOIS, crt.sh, GTM, Wayback, CNPJ).
2. **Apify só quando imprescindível:** **Meta Ad Library** (anti-bot + cursor + proxy = frágil
   demais nativo) e **Instagram orgânico em escala** (IG bane agressivo).
3. **Apify quando traz vantagem grande:** render de página JS-pesada/anti-bot — mas tenta nativo
   primeiro, escala via `needsRender()`.
4. **YouTube orgânico = sempre API oficial v3** (grátis, 10k units/dia por chave).
A camada de provider + normalizer é **inegociável**: deixa trocar de actor (ou cair pra outro vendor)
como mudança de config, não reescrita. Sempre gravar `renderedVia` pra medir o quanto vai pro Apify.

**v2 — Espionagem Profunda:** sob demanda, a partir de um concorrente CONFIRMED. Fan-out de jobs
BullMQ (um por fase: site, player, ads, GTM, DNS/WHOIS, crt.sh, marketplace/Wayback) → relatório por
tenant. Quase tudo **nativo**; Apify só toca em Meta Ads e nas páginas que precisam de render.
**SSRF guard travado** (bloquear IP privado/loopback, worker isolado sem acesso à rede interna nem
secrets, timeout/rate-limit/allowlist de esquema, revalidar a cada redirect) + **LGPD** (CNPJ traz
sócios = dado pessoal; validar com jurídico; marcar `[ESTIMADO]`) + gating premium + cache por
domínio.

---

## 4. Scoring — winner-score API-only (validado empiricamente)

**Score adotado (determinístico, API-only):**
```
longevity(daysActive):     0-7d=10 | 8-29d=30 | 30-59d=55 | 60-89d=75 | 90d+=90
variation(variationCount): +0..15   (collationCount — nº de variações do mesmo ad)
velocity:                  +0..15   (ads novos do anunciante nos últimos 7d)
winnerScore = longevity + variation + velocity   // normalizar p/ 0-100
```
Esse é exatamente o `winner-score.ts` do handoff (§4). Os três sinais vêm **confiáveis** pela API:
datas de início/fim (→ `daysActive`), `collationCount` (→ variações) e a contagem de ads recentes
do anunciante (→ velocity).

**Por que API-only — reconciliação com o handoff:** um **teste empírico real** foi rodado com
`apify~facebook-ads-scraper` (nicho BR, ad comercial) e foi **decisivo**:
- `impressionsWithIndex`, **reach** e **spend** voltam **NULL** pra ad comercial.
- **Engajamento do post** (likes/comments/shares do criativo) **não existe** via API de fonte nenhuma
  (convergência de 8 fontes na deep-research) — só `pageLikeCount` da página, que é inútil pro score.

O handoff **já está alinhado** com isso no `winner-score.ts` (§4) — ele não pesa engajamento no score
de **ads**. **Onde flagear:** o `outlier-score.ts` para **orgânico** (§4) depende de
`engajamento / mediana móvel` — isso continua **válido pra orgânico IG/YT** (likes/views *vêm* pra
post orgânico, ao contrário do criativo de ad). Mas qualquer tentativa futura de medir **engajamento
de ad** fica **deferida pro v2 via Playwright** (scrape de página renderizada), não API. Resumindo:
- **Ads → winner-score API-only** (longevity + variation + velocity). ✅ bate com o handoff.
- **Orgânico → outlier-score** (engajamento ÷ mediana). ✅ válido, dado vem por API.
- **Engajamento de ad → v2/Playwright.** Não existe via API; não entra no score do MVP.

Isso **derruba** o score antigo do Inc 2a-local (que pesava ~60% em impressões+engajamento — campos
no vazio). O Radar nasce com o score certo.

---

## 5. O TODO do ator Apify custom

O Yuri quer um **ator Apify CUSTOM próprio** (controle total sobre schema, custo e estabilidade) — o
que é uma **divergência consciente do handoff**, que prescreve um **bake-off de actors de comunidade**
(`automly/facebook-ad-library-scraper` ~$0.65/1k, `leadsbrary/meta-ads-library-scraper` ~$1.50/1k via
API oficial Meta, + o já testado `apify~facebook-ads-scraper`) atrás do provider abstrato.

**Estado:** `APIFY_TOKEN` existe (plan **STARTER**) em `magnus-painel/.env.local`. O actor de
comunidade já foi validado funcionando — o gargalo é o **dado da Meta**, não o actor.

**Flag:** falta um **passo-a-passo de criação do ator custom** (é um todo pendente). A camada de
provider abstrato torna isso **ortogonal ao MVP**: dá pra **shippar com actor de comunidade atrás da
abstração** e trocar pelo custom depois como mudança de config. A decisão "custom primeiro vs
comunidade + abstração" é uma Open Question (abaixo) — afeta o caminho crítico do kickoff.

---

## 6. OPEN QUESTIONS para o brainstorm do Yuri

Decisões que precisam ser tomadas antes do `/plan-eng-review` travar a arquitetura:

1. **Nome + repo:** `yuribranco/radar` (preferido), `yuribranco/magnus-radar`, ou
   `yuribranco/radar-criativos`? Local no disco `~/Documents/Magnus/radar`?
2. **VPS alvo:** reusar o **Hostinger principal (187.77.225.192)** — que já tem 6 apps em 3000-3006,
   PM2 startup, swap 2GB — ou subir uma **box nova/dedicada** pro Radar (isolamento de blast radius +
   o worker SSRF do v2 *exige* isolamento de rede)? Nota: a memory já flagra "NUNCA `pm2 restart
   all`" no 187 — multi-tenant + filas pesadas + worker SSRF inclinam pra box separada.
3. **Modelo de auth multi-tenant:** Supabase Auth com um `tenant_id` por mentorado? Como um mentorado
   vira tenant — provisionamento manual, ou auto via compra (Hotmart, igual licença do Magnus OS)? O
   boundary de RLS depende disso.
4. **Fronteira de tenancy + pricing:** cada mentorado é um tenant isolado, ou a agência é o tenant e
   os clientes dela são `PanelCompany` dentro? Quem paga o custo do Apify/Claude — embutido na
   mentoria, add-on, ou metered com teto? (O `ScrapeJob.costUsd` já metra; falta a política.)
5. **Como o Radar volta pro cliente Magnus OS:** o Radar é um **painel web separado** (login próprio),
   ou os briefs/vencedores **sincronizam de volta** pro Magnus OS local-first do cliente (arquivo/skill)?
   Isso define a fronteira de produto entre os dois.
6. **Actor custom primeiro vs comunidade + abstração:** shippar o MVP com actor de comunidade atrás do
   provider abstrato (mais rápido) e trocar pelo custom depois, OU travar o passo-a-passo do ator
   custom **antes** da Fase 1 (mais controle, atrasa o kickoff)?

---

## 7. O que o `/plan-eng-review` precisa travar

- [ ] **Nome + repo + remote** criados (resolve Q1).
- [ ] **VPS alvo** decidido + plano de deploy (PM2/Nginx, isolamento do worker SSRF) (resolve Q2).
- [ ] **Modelo de auth + RLS multi-tenant** (Supabase Auth, shape do `tenant_id`, provisionamento) (Q3).
- [ ] **Fronteira de tenancy + política de custo/pricing** (teto por tenant, quem paga) (Q4).
- [ ] **Contrato de integração Radar ↔ Magnus OS** (painel separado vs sync de volta) (Q5).
- [ ] **Decisão de provider:** custom-first vs comunidade-first + a interface da abstração + normalizer (Q6).
- [ ] **Schema Prisma + migrations com RLS** revisados (modelos do §2 do handoff).
- [ ] **Desenho das filas BullMQ** + webhook Apify + cadência + guardrail de custo.
- [ ] **Score travado:** winner-score (ads, API-only) + outlier-score (orgânico) + engajamento-de-ad
      explicitamente deferido pro v2/Playwright.
- [ ] **Postura legal:** só dado público deslogado; SSRF guard do v2; LGPD (CNPJ/sócios) com jurídico.
- [ ] **Fases de entrega 0→5 + v2** com critério de aceite por fase (já no §7 do handoff) confirmadas.

---

*Próximo passo: brainstorm com o Yuri sobre as Open Questions → `/plan-eng-review` para travar a
arquitetura → `writing-plans` por fase → build (Fase 0 = smoke Apify + provider/normalizer +
`fetchPage` com escalada + schema/RLS).*
