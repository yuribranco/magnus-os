# Radar — Plano de Engenharia Fase 1 (MVP magro-dogfood)

Gerado por `/plan-eng-review` (2026-06-02). Base: design doc `2026-06-02-radar-mvp-magro-design.md`
(arquitetura A / 100% online) + pesquisa de mercado `2026-06-02-radar-market-research.md`.
Repo novo a criar: `yuribranco/radar` (local `~/Documents/Magnus/radar`).

## Escopo (travado: Magro-dogfood)
**Validação = Yuri dogfoodando** (único usuário na Fase 1). Construir o núcleo de inteligência,
deferir toda a infra de vender pra Fase 2.

> **RE-ESCOPO 2026-06-02 (final): SEM portal próprio.** O Radar é um **coletor** que alimenta o
> **painel Magnus** (`magnus-painel`, já existe). Não tem UI/login standalone. O painel ganha uma
> seção "Radar" que **lê o `radar.*` direto do Supabase** (o painel já fala com esse Supabase) e
> mostra ads/ângulos/linhas que funcionam = **insumo pra criativo novo**. Mata o build de UI
> standalone + auth multi-tenant. Na prática é o **Híbrido H** (coleta central, consumo+geração no
> painel local). Objetivo: insumo pra novos criativos, não dashboard-produto à parte.

### IN SCOPE (Fase 1)
1. Coleta via Apify (actor pinado, token do Yuri).
2. Auto-descoberta: seed keyword → Ad Library search → páginas de anunciante (concorrentes).
3. persistence-score determinístico (longevity + variation + velocity; API-only, sem spend/engajamento).
4. Cache/dataset no Supabase `radar.*` (dedup por anunciante + TTL + lifecycle ativo/inativo).
5. **Seção "Radar" no `magnus-painel`** — lê `radar.*`, board ranqueado de cards (ads/ângulos/linhas
   que funcionam), como insumo de criativo. Reusa a UI/design system do painel. **Sem portal/login novo.**

### NOT in scope (deferido p/ Fase 2)
| Item | Por quê defere |
|---|---|
| Portal/UI/login standalone | MORTO — saída é a seção Radar no painel Magnus |
| API autenticada pro consumo externo | o painel lê `radar.*` direto (mesma Supabase); API autenticada só se vender Radar a quem NÃO tem Magnus OS |
| Gating por licença Hotmart / multi-tenant | reusa a licença do Magnus OS quando relevante; dogfood = single-user |
| Quota de scrape por usuário | guardrail de COGS só com >1 usuário (Fase 1 = cap fixo no código) |
| Geração do brief de ângulo | roda no Magnus OS LOCAL (decisão travada); o Radar só entrega o insumo |
| Monitoramento contínuo / alertas | v2 |
| TikTok / orgânico / deep-spy (SSRF) | v2 |

## Arquitetura — data flow

```
ENTRADA: [concorrentes nomeados]  +  [seed keywords]
                │
                ▼
        ┌──────────────────────────┐
        │  COLETOR Radar           │   ← peça "online" do produto (Apify token do Yuri)
        │  (API route / cron)      │
        └──────────────────────────┘
                │
   seed keyword ├──► cache `radar.searches` (TTL 7d)? ──hit──► páginas do DB
                │         └──miss──► Apify Ad Library search ──► extrai advertiser pages ──► upsert
                │
  advertiser pg ├──► cache `radar.advertisers.last_scraped_at` < 7d? ──hit──► ads do DB
                │         └──miss──► Apify (actor pinado) ──► upsert `radar.ads` (dedup ad_archive_id
                │                     + lifecycle ativo/inativo)
                ▼
        grava em  radar.*  (Supabase do Portal Magnus)
                │
                ▼
        ┌──────────────────────────┐
        │  magnus-painel (LOCAL)   │   ← já existe; lê radar.* direto, sem portal/API novos
        │  nova seção "Radar"      │
        └──────────────────────────┘
                │
        persistence-score (on-read) → board ranqueado
        card = thumb + badge "rodando há Xd" + nº variações reais + media-mix + hook + link LP
                │
                ▼
        insumo p/ criativo novo (brief/ângulo gerado no Magnus OS LOCAL, Claude do cliente)
```

## Stack
- **Coletor** = peça nova online (API route / cron) que roda Apify + score + escreve `radar.*`. Pode
  nascer como rota no próprio `magnus-painel` ou um serviço magro à parte. **Decisão fina no build**
  (pro dogfood, uma rota/script que o Yuri dispara já basta; vira serviço hosted quando escalar).
- **Saída = seção "Radar" no `magnus-painel`** (já existe; lê `radar.*` direto). Reusa UI/design system.
  **Sem app/portal/login novo.**
- **Supabase = reusar o do Portal Magnus** (D1, Yuri). Tabelas em **schema `radar.*`** (não `public`)
  → split/migração futura = `pg_dump -n radar` limpo; problema no Portal não respinga. Service role no coletor.
- **Apify** via adapter (`lib/integrations/apify/adapter.ts`, `Adapter<TInput,TOutput>`) — provider
  abstrato, actor pinado+swappable. Coerce `String(v)` no parser.
- **Deploy:** o painel já tem o caminho dele (local/release). O coletor, se virar serviço: infra-agnóstico
  (alvo Giba `2.25.145.187`, migratable). Pro dogfood pode rodar do Mac/local.

## Schema Supabase (Fase 1) — schema `radar.*` no projeto do Portal Magnus
```
radar.advertisers
  id uuid pk
  page_id text unique            -- FB page do anunciante (chave de dedup)
  page_name text
  niche text[]                   -- tags de nicho/seed que o descobriram
  source text                    -- 'named' | 'discovered'
  first_seen_at timestamptz
  last_scraped_at timestamptz    -- base do TTL (skip Apify se < 7d)

radar.ads
  id uuid pk
  advertiser_id uuid fk → radar.advertisers
  ad_archive_id text unique      -- dedup do ad (upsert)
  body_text text
  cta_text text
  link_url text
  media_type text                -- video|image|carousel|dco
  started_at date                -- início do ad (p/ daysActive)
  creative_fp text               -- fingerprint do criativo (hash de body+media+link) p/ contar variações reais
  collation_count int            -- nº de variações reportado pelo actor (CAVEAT: pode ser ruído)
  -- ciclo de vida (FIX codex S0: ad morto não pode virar winner falso)
  is_active boolean              -- presente no último scrape do anunciante?
  last_verified_active_at timestamptz  -- última vez visto ativo no scrape
  inactive_at timestamptz        -- quando sumiu (null se ativo)
  last_seen_at timestamptz
  raw jsonb                      -- payload Apify cru (auditoria)
  -- calibração do dogfood (FIX codex S2)
  yuri_label text                -- 'util' | 'inutil' | null — Yuri marca; calibra o score vs julgamento

radar.searches                    -- cache de descoberta por keyword
  id uuid pk
  seed_keyword text
  country text                   -- FIX codex: chave de cache inclui país
  lang text                      -- ...e idioma (mesma keyword BR≠US)
  last_run_at timestamptz        -- TTL 7d
  result_page_ids text[]         -- advertiser pages encontrados
  unique (seed_keyword, country, lang)
```
> Score NÃO é coluna: calculado on-read (determinístico) das colunas de `ads`. Evita bug de score
> stale. **`daysActive` conta até `last_verified_active_at`, NÃO `today()`** — senão ad morto cresce
> pra sempre e vira winner falso (FIX codex S0). RLS: trivial na Fase 1 (single-user, service role).

## persistence-score (determinístico, fonte: winner-score.ts do handoff)
> **Renomeado de "winner-score" (FIX codex S1):** sem spend/CTR/conversão (Ad Library não dá), isto
> mede **persistência + proliferação**, não vitória comprovada. Rotular no painel como "Sinal de
> persistência" e não prometer "está vencendo". O dado honesto é: este ad está no ar há muito tempo
> e/ou tem muitas variações ativas — proxy de que provavelmente funciona, não certeza.
```
daysActive       = last_verified_active_at - started_at   -- NÃO today() (ad morto não infla)
recentLaunches14d= nº de ads ATIVOS do anunciante com started_at nos últimos 14d
longevity = min(daysActive / 90, 1)         -- 90d = max (proxy: ad 30d+ ≈ lucrativo)
variation = min(distinct(creative_fp) / 10, 1)  -- variações REAIS por fingerprint, não collation cru
velocity  = min(recentLaunches14d / 5, 1)   -- CAVEAT: advertiser-level, sinaliza teste, não vitória do ad
score = 0.5*longevity + 0.3*variation + 0.2*velocity   -- só ads is_active=true entram no board
```
Pesos: longevidade domina (sinal mais forte por research). **Ressalva (codex S1):** ad novo escalando
forte em 3-7d pontua baixo (longevity cap 90d) → o board tende a evergreen; aceitável no dogfood, mas o
`velocity` e a calibração do Yuri compensam. **Exibição no card** (recs da pesquisa): badge "rodando há
Xd" (herói), nº variações reais, media-mix (% vídeo/img/carrossel), hook = 1ª linha do body_text,
+ toggle "útil/inútil" (calibração).

## Auto-descoberta (mecanismo) — ⚠️ feasibility a PROVAR antes de codar
seed keyword → Apify (actor pinado, ver abaixo) em **modo search** no Ad Library → ads retornados →
extrair `advertiser page_id` distintos → marcar `source='discovered'` → mesmo pipeline de score.
**FIX codex S1:** (1) a memória só provou scrape **por anunciante**; **busca por keyword é capacidade
DIFERENTE** — confirmar no teste de contrato que o actor suporta. (2) keyword search devolve ads que
**contêm o termo** = vai trazer afiliado/mídia/revenda/oferta não-relacionada → precisa de **passo de
relevância** (filtrar por nicho/idioma/país + Yuri confirma quais páginas viram "concorrente"). Sem
isso, "descoberta" é lixo. Resultado-alvo: "Concorrentes que você não conhecia" (momento-uau).

## Apify — actor pinado + teste de contrato (PRÉ-BUILD, FIX codex S1)
Actors Apify são namespaced e variam de schema. **Antes de codar:** rodar teste de contrato ao vivo
com 1-2 actors candidatos (ex: `automly/facebook-ad-library-scraper`, `scraperhive/meta-ads-library-
scraper`, ou o `apify~facebook-ads-scraper` já testado) e **pinar owner+versão**. Verificar: suporta
keyword search? devolve `page_id` canônico? `ad_archive_id` estável? campos de data? pricing/scrape.
Adapter (`lib/integrations/apify/adapter.ts`) isola o actor (swappable). **Coerce de tipo `String(v)`**
no parser (lição: APIs mentem sobre tipo).

## Cache / dedup (o coração de H mesmo em A)
- Anunciante: se `last_scraped_at` < TTL(7d) → serve do DB, **pula Apify** (economiza COGS).
- Descoberta: `searches.last_run_at` < TTL(7d) → reusa `result_page_ids`.
- Ad: upsert por `ad_archive_id` (idempotente — re-scrape não duplica).
- **Lifecycle no re-scrape (FIX codex S0):** ads do anunciante **ausentes** do scrape novo → `is_active=false`,
  `inactive_at=now()`; presentes → `last_verified_active_at=now()`. Só `is_active=true` entra no board.
- TTL=7d: ads não mudam rápido; longevidade se mede em semanas. Ajustável por env. **Ressalva codex:**
  "rodando há Xd" pode estar até 7d desatualizado — aceitável no dogfood, encurtar TTL se enganar.

## Postura legal/ToS (decisão Yuri: seguir com mitigação)
O core (cachear + vender inteligência derivada do Meta Ad Library) tangencia o ToS da Meta (coleta
automatizada + revenda de dado de serviços Meta). **Decisão: seguir, com mitigação** —
(1) posicionar como **inteligência derivada** (score, ângulo, tendência), NÃO revenda de dump cru;
(2) mostrar criativo como **referência** (precedente de indústria: Foreplay/AdSpy/BigSpy/Atria operam
assim em escala); (3) **hardening legal/ToS = item REAL de Fase 2** antes de marketing público/escala
(não ignorar — é risco de categoria conhecido, sobrevivível). Registrado, Yuri ciente.

## Plano de testes (cobertura alvo: todo codepath novo)
| Codepath | Teste | Tipo |
|---|---|---|
| winner-score normalização + pesos | longevity/variation/velocity 0..1; edge daysActive=0, collation=0, vazio | unit ★★★ |
| Apify adapter parse | mock resposta Apify → schema `ads`; **coerce tipos `String(v)`** (lição Tiny mente sobre tipo) | unit ★★★ |
| cache anunciante | <TTL pula Apify; >TTL chama; upsert dedup ad_archive_id | unit ★★★ |
| auto-descoberta | seed → extrai page_ids distintos, dedup | unit ★★ |
| `POST /api/scan` | nomeados + descobertos → board ranqueado | integração ★★ |
| estados vazios | 0 ads, anunciante com 1 ad, keyword sem resultado | unit ★★ |
| Apify falha/timeout | erro tratado → painel mostra erro claro, não silencioso | integração ★★★ |
| **lifecycle ad ativo/inativo** | ad ausente do re-scrape → is_active=false, inactive_at; daysActive até last_verified (não today) | unit ★★★ |
| **teste de contrato Apify** | actor pinado: keyword search ok? page_id canônico? ad_archive_id estável? | integração ★★★ |
| relevância da descoberta | keyword search → filtra afiliado/mídia/não-nicho | unit ★★ |
| calibração | toggle útil/inútil grava yuri_label | unit ★ |

## Fase 2 (registrada, não construir agora)
Login multi-tenant + licença Hotmart (reusa `magnus-os-licenca`) + quota por usuário + API autenticada
pro Magnus OS puxar (contrato JSON de ads ranqueados) + botão "gerar criativo no Magnus OS" + pricing
R$197–497/mo (ancoragem da pesquisa). Revisitar híbrido (brief local) já está contemplado (brief sempre local).

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | escopo reduzido p/ magro-dogfood; 1 decisão arq (Supabase) |
| Codex Review | `/codex` (outside voice) | Independent 2nd opinion | 1 | issues_found→folded | 6 catches incorporados + 1 decisão legal (Yuri: seguir c/ mitigação) |

- **CODEX:** pegou 6 reais — ad morto vira winner falso (lifecycle), actor não-pinado + keyword-search não provado, score = persistência não vitória (renomeado), velocity advertiser-level, chave de cache sem país/idioma, falta calibração. Todos foldados no plano. + risco legal/ToS de fundação → Yuri decidiu seguir com mitigação.
- **CROSS-MODEL:** 1 tensão (legal/ToS = fundação, não v2) → resolvida pelo Yuri (seguir + mitigar + hardening Fase 2).
- **UNRESOLVED:** 0.
- **VERDICT:** ENG CLEARED (escopo magro-dogfood) — pronto pra writing-plans → build. Pré-build obrigatório: teste de contrato do actor Apify pinado (prova keyword-search + page_id canônico) ANTES de codar o pipeline.
