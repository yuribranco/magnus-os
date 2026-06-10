# Plano: Migração do scraping do Radar — Apify → browser stealth local ($0)

> ## ⛔ PARKED (2026-06-08) — decisão pós eng-review + codex outside voice
> **Mantém o Apify por enquanto.** O `/plan-eng-review` + o challenge do codex mostraram que o A2
> (hospedado) é o "pior meio-termo" — não entrega "mentorado sem limite" (1 IP do VPS ainda precisa
> de cota) e assume a manutenção do parser SEM a infra anti-block do Apify. E o A1 (local, o único
> que dá "sem limite" estrutural) é build grande que não se justifica agora.
> **O objetivo real ("mentorado sem limite") será resolvido por CLAREZA DE LIMITE + pricing/tier**,
> não por possuir o scraping. Próximo trabalho: tornar a cota VISÍVEL (UX do mentorado + visão do Yuri).
> Revisitar A1/híbrido só se o modelo de pricing provar insuficiente. POC do Scrapling fica registrado
> (viável, $0 em IP residencial) pro dia que A1 fizer sentido.

> Status: DRAFT (PARKED) — passou por `/plan-eng-review`. Autor: CEO Orchestrator. Data: 2026-06-08.
> Projeto: **magnus** (Radar — serviço de espionagem de concorrentes do Magnus OS).
> Repos tocados: `radar` (`github.com/yuribranco/radar`), `magnus-os-plugin` (skill), painel (`magnus-painel`).

## 🛠️ gstack skills integradas — OBRIGATÓRIAS

| Trigger | Skill | Quando |
|---|---|---|
| Este plano (mudança arquitetural) | `/plan-eng-review` + `/codex review` | Antes de codar — é o gate deste doc |
| Qualquer erro durante execução | `/investigate` | SEMPRE antes de chutar fix |
| Task com arquivo > 80 linhas novas | `/simplify` | Antes do commit |
| Antes de deploy/merge | `/review` + `/codex review` | 2ª opinião independente |
| Pós-deploy no VPS / no cliente | `/canary` | 5-15min monitoring |
| Scrape parseando DOM/JSON externo | `/browse` | Inspecionar o Ad Library quando o parser quebrar |

## 1. Contexto e objetivo

O Radar hoje scrapeia a Biblioteca de Anúncios da Meta via **Apify** (actor `apify/facebook-ads-scraper`), que **cobra por scrape** (~$0,20-0,75/run). Esse custo por scrape é a razão das **cotas** (`RADAR_QUOTA_SCANS_MONTH=30`, `DISCOVERIES=5`) — e cota é o que **limita os mentorados** do Yuri. O Apify é a **única peça de custo marginal** do Magnus OS, contradizendo a tese local-first ("$0 marginal = margem").

**Objetivo:** eliminar o custo por scrape → remover/relaxar as cotas → mentorado sem limite. Sem regressão de qualidade (mesma cobertura de ads que o Apify) nem de confiabilidade (sem block).

## 2. Evidência (POC já rodado — 2026-06-08)

POC com Scrapling (`DynamicFetcher`, browser stealth local, chromium do Playwright) no Ad Library da Priscila Zillo (page_id `103565844468029`), **sem proxy**:
- ✅ **Sem block** (login-wall real = 0; o "captcha" detectado era flag `arkose_captcha` no JS da Meta, falso positivo).
- ✅ **$0** (browser local, IP residencial), **~17s** (mais rápido que o actor Apify ~30-60s).
- ✅ **30 ads** extraídos do **JSON inline server-rendered** do documento, **100% limpo** (URL por page_id = zero ruído de keyword).
- ⚠️ **Gap conhecido:** Apify acha 65; POC pegou 30 na 1ª carga. Os outros ~35 vêm via lazy-load (scroll/graphql) — **paginação ainda não resolvida** (risco a de-riscar na Fase 1).

POC em `/tmp/scrapling-poc2.py`. Toolkit: `~/Documents/Pessoal/Produtividade/scrapling-toolkit` (venv, scrapling 0.4.7).

## 3. As DUAS decisões centrais (o que o eng-review precisa estressar)

### Decisão A — Onde roda o scrape?

| | **A1. Local-first (cada cliente scrapeia)** ⭐ recomendado | **A2. Hospedado (VPS, Scrapling no lugar do Apify)** |
|---|---|---|
| IP | Cada mentorado usa o PRÓPRIO IP residencial → distribuído, sem rate-limit ao escalar | 1 IP do VPS → rate-limit/block sobe com nº de clientes; eventualmente precisa proxy (volta o custo) |
| Custo marginal | **$0** real | $0 de scrape, mas risco de precisar proxy pago no volume |
| Cota | Pode **remover** | Ainda precisa de alguma cota (proteger o IP único) |
| Tese Magnus OS | Alinha 100% (local-first, $0) | Mantém o gargalo central (1 ponto metered/limitado) |
| Cache compartilhado cross-cliente | **Perde** (cada um scrapeia o seu) | Mantém (guru popular varrido 1× pra todos) |
| Peso de install no cliente | Alto (browser headless + ~150MB chromium no 1º uso) | Zero (cliente só chama HTTP) |
| Esforço de migração | Maior (orquestrar scrape local no painel/skill) | Menor (trocar só o `scrapeUrl` no VPS) |

**Recomendação:** **A1 local-first** — é a única que cumpre "mentorado sem limite" de verdade e alinha à tese. O cache compartilhado some, mas o ganho (>$0, distribuído, sem cota) compensa. A licença continua validada de forma hospedada (barato); só o **scrape** vai pro cliente.

### Decisão B — Com que stack roda o scrape local?

| | **B1. Playwright-Node (nativo do painel)** ⭐ recomendado p/ A1 | **B2. Scrapling (Python)** |
|---|---|---|
| Dependência no cliente | Node já é o painel; só baixa chromium do Playwright | Python + venv + scrapling + camoufox/chromium — install pesado |
| Stealth | `playwright-extra` + plugin stealth (ou patchright) | camoufox (mais forte out-of-the-box) |
| Manutenção | No mesmo runtime do painel (1 stack) | 2ª stack (Python) no produto Node |
| O que o POC provou | O mecanismo (browser stealth + JSON inline) é o mesmo — Scrapling foi a PROVA, Node-Playwright é a IMPLEMENTAÇÃO mais limpa pra um painel Node | — |

**Recomendação:** **B1 Playwright-Node** se A1 (local). O Scrapling provou o conceito; mas embarcar Python em todo cliente Node é peso desnecessário — o painel já é Node e roda Playwright nativo. (Se A2 hospedado vencer, B2 Scrapling no VPS é ok, sem o problema de install.)

## 4. Arquitetura alvo (assumindo A1 + B1)

```
painel (cliente, Node)
  └─ skill `radar` → módulo local de scrape (Playwright-Node stealth)
        ├─ resolve page_id (busca por @handle OU link Ad Library colado)
        ├─ carrega advertiserUrl(page_id) no chromium stealth
        ├─ extrai ads do JSON inline + pagina (scroll/cursor) até esgotar
        ├─ parseAd() reusa a lógica atual (DCO, variations, hook, campanha)
        └─ grava operacao/<slug>/radar/radar.json (igual hoje)
  └─ licença: valida 1× contra serviço hospedado (mantém o gate; barato)
```
- O serviço hospedado (VPS) **encolhe** pra só **validar licença** (ou some, se a licença for checada via Edge Function existente).
- `lib/db.ts` (Supabase radar.*) vira **opcional** (cache local por workspace, ou nada na v1).
- `emit.ts`/`scan.ts`/`parseAd` são **reaproveitados** (a transformação ad→board não muda; muda só a FONTE dos ads).

## 4.5 Decisões do `/plan-eng-review` (2026-06-08) — TRAVADAS

- **Decisão A → A2 (hospedado).** Mantém o serviço no VPS; troca só o `scrapeUrl`. Escopo mínimo, ~80% do código reaproveitado.
- **Decisão B → decidir na Fase 0.** Testa o engine MAIS FORTE primeiro (camoufox/Scrapling) DO VPS; se sobreviver, avalia se Playwright-Node também passa (integração mais limpa, sem Python) e escolhe pelo dado.
- **Risco nº1 (P1): IP datacenter.** O POC foi em IP RESIDENCIAL ("sem block"); o VPS é DATACENTER, que a Meta bloqueia mais forte. Hoje o VPS não scrapeia direto (o Apify faz). **A viabilidade do A2 depende do VPS aguentar.** → Fase 0 valida DO VPS, em VOLUME SUSTENTADO, antes de codar.
- **Tradeoff aceito do A2:** SPOF de IP (ban do VPS = Radar cai pra todos) e a **manutenção do parser passa a ser sua** (Meta muda o JSON inline → quebra; o Apify hoje absorve isso). Se a Fase 0 falhar → reavaliar A1 (local, $0 estrutural) ou manter Apify.

## 5. Fases (de-risk primeiro)

**Fase 0 — De-risk DO VPS (BLOQUEANTE, 1 sessão). Gate duplo:**
1. **Block de datacenter:** rodar o browser stealth (camoufox primeiro) **de dentro do VPS 187**, **10-20 scrapes seguidos** contra o Ad Library, e medir: tomou block? em que volume? (block raramente bate no 1º request — kicka depois de N). Se o camoufox tomar block sustentado do VPS → **A2 inviável $0** → reavaliar (A1 local / proxy / manter Apify). Se passar, testar se Playwright-Node também passa (escolhe o engine pelo dado).
2. **Paginação:** provar que pega **os 65 ads** da Priscila (não 30) — scroll-até-esgotar OU replay do cursor graphql. Gate: ≥95% de paridade com o Apify em 3 anunciantes (Priscila, Ícaro, Pedro Sobral).
3. **Ops:** medir RAM/CPU do chromium no VPS (já roda 6 apps + swap 2GB; teve incidente). Definir cap de concorrência (provável 1-2 scrapes simultâneos) + limite de memória pra não dar OOM.

Só passa pra Fase 1 se os 3 gates verdes. Senão → aborta a migração, fica no Apify+retry (que já está no ar).

**Fase 1 — Módulo de scrape local (Node).** `radar-scrape/` no painel: `resolvePageId`, `scrapeAdvertiser(pageId)`, stealth, paginação, parseAd reusado. Testes com fixtures (HTML salvo). `/simplify` + `/codex review`.

**Fase 2 — Wire na skill + onboarding chromium.** Skill `radar` chama o módulo local; 1º uso baixa o chromium (com aviso de progresso). Fallback: se o browser falhar, cai no Apify hospedado (transição segura).

**Fase 3 — Remover cota + encolher o serviço hospedado.** Cota vira ilimitada (ou removida) pro fluxo local. VPS fica só com license-validate. Apify mantido como fallback flagueado por env.

**Fase 4 — Release + canary.** `release.sh` (golden rule), `/canary`, dogfood nos 3 anunciantes.

## 6. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Paginação não fecha os 65 | Fase 0 bloqueante — aborta antes de investir |
| Meta muda o anti-bot/DOM | Parser do JSON inline + seletores adaptativos; `/browse` pra reinspecionar; Apify fallback flagueado |
| Install do chromium pesa no cliente | Lazy-download no 1º uso, com aviso; ~150MB 1×; documentar pré-requisito |
| Block no IP do cliente (uso pesado) | IP residencial distribuído reduz muito; throttle local suave; sem proxy na v1 |
| Perda do cache compartilhado | Aceito na v1 (cada cliente scrapeia o seu); reavaliar cache local por workspace |
| Compliance/ToS da Meta | Mesmo risco do Apify hoje (já scrapeia); Ad Library é público, sem login |

## 7. Rollback

Apify + retry continua no código atrás de um flag (`RADAR_ENGINE=apify|local`). Default vira `local` só após Fase 0+1 provadas; reverter = flip do flag. Zero downtime, zero perda.

## 8. Fora de escopo (v1)

- Proxy/rotação (não precisa no local-first).
- Cache compartilhado cross-cliente (some na v1).
- Cota por-licença (irrelevante se ilimitado no local).

## Testes (do eng-review)

- **Fase 0** é empírica (block + paginação + ops do VPS) — não é teste unitário, é gate de viabilidade rodado à mão, com números registrados no próprio plano.
- **Fase 1** (módulo de scrape): unit tests obrigatórios —
  - `parseInlineAds(html)`: fixtures de HTML salvo (1 anunciante real) → assert nº de ads + campos (ad_archive_id, page_name, started_at, DCO/variations). Reusa os asserts do `parseAd` atual.
  - paginação: dado um HTML com cursor, segue até esgotar (mock do fetch de páginas).
  - `scrapeUrl` com `RADAR_ENGINE=local`: smoke contra fixture; erro de browser → cai no fallback Apify (testar o branch de fallback).
- **Regressão (CRÍTICO):** o board (`emit.ts`/`buildCampaigns`/`parseAd`) NÃO muda — adicionar 1 teste que prova que o radar.json gerado pelo engine `local` é estruturalmente idêntico ao do `apify` pro mesmo anunciante (paridade de board).

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | (não rodado; decisão de produto já feita na conversa) |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | ISSUES_RESOLVED | 3 decisões travadas (A2, engine-na-Fase0, de-risk VPS), 2 P1 + 1 P2 incorporados |
| Outside Voice | `/codex` | Independent 2nd opinion | 0 | PENDENTE | a oferecer |

- **DECISÕES:** A→A2 hospedado · B→decidir na Fase 0 (camoufox primeiro) · de-risk = Fase 0 valida DO VPS em volume sustentado.
- **P1 incorporados:** (1) POC residencial ≠ VPS datacenter → Fase 0 testa do VPS; (2) testar volume sustentado, não 1 fetch.
- **P2 incorporado:** SPOF de IP + chromium-memory no VPS compartilhado → cap de concorrência na Fase 0.
- **VERDICT:** ENG CLEARED *condicional à Fase 0* — só implementa Fase 1+ se os 3 gates da Fase 0 passarem. Senão fica no Apify+retry (já no ar).
