# Pesquisa — Fonte de scraping da Meta Ad Library (decisão Inc 2a)

**Data:** 2026-06-01
**Pergunta:** Apify é a melhor/única opção pra obter, por API, os campos que alimentam o score de validação de criativo? (impressões-bucket, engajamento, mídia, landing page, dias no ar, variações)
**Método:** `/deep-research` focado (20 fontes, 82 claims, 5 ângulos). **Caveat forte:** o verificador adversarial rate-limitou — só **1 claim** passou no 3-0 (impressões = buckets). O resto é single-vote / página de vendor → **confiança baixa**, e o cenário muda rápido (expansão Meta jan/2026). Tratar como **direcional**, não definitivo.

## TL;DR
1. **O engajamento do post (likes/comentários/shares) NÃO vem por API de NENHUMA fonte** (convergência de 8 fontes). É o campo que mais pesava no nosso score (25%) — **insustentável via API**. Único caminho: Playwright raspando o post renderizado (pesado/frágil/ToS).
2. **Impressões = só faixas/buckets** (0-999 … 1M+), nunca exato (alta confiança). A API **oficial** só dá isso pra ads políticos/sociais + todos da UE (DSA) — **fina pra ads comerciais fora da UE**.
3. **Apify não é uniquamente melhor.** Pros campos que *existem*, **ScrapeCreators** tem a API REST mais limpa (landing + mídia + datas + reach). Apify (você já tem) serve, mas é browser-automation (mais frágil) e os campos variam por actor.
4. **Nenhuma skill/lib pronta no GitHub** entrega os campos de performance como componente reusável (scrapers só de conteúdo, ou API oficial sem engajamento).

## Tabela: provider × campo (confiança baixa salvo nota)

| Fonte | Impr. bucket | Engajamento | Mídia (download) | Landing page | Dias no ar | Variações | API real? | Custo | ToS/risco |
|---|---|---|---|---|---|---|---|---|---|
| **Meta API oficial** | ✅ mas só **político/social/UE** | ❌ | parcial | ❌ (comercial) | ✅ (regulado) | ❌ | ✅ (gated) | grátis | baixo (oficial) |
| **ScrapeCreators** | ❌ (não itemiza) | ❌ (hint, não confirmado) | ✅ imagem (`original_image_url`) | ✅ `link_url` | ✅ start/end | ❌ | ✅ REST (5 endpoints, ~1.5k cap) | pago (não confirmado) | médio (3rd-party) |
| **Apify `curious_coder`** | ⚠️ só legado UE/político | ❌ | só snapshot | ❌ | ? | ❌ | actor | por-resultado | médio (browser/proxy, frágil) |
| **Apify `aurumworks`** | ✅ via Graph API (regulado) | ❌ | ? | ❌ | ❌ | ❌ | ✅ HTTP+SDK | **$5/1k results** (confirmado) | médio |
| **Apify `apify/facebook-ads-scraper`** | ⚠️ `impressionsText` pode ser null | ❌ | criativo | ? | ✅ datas | ❌ | actor | por-resultado | médio (browser, manutenção) |
| **Foreplay API** | ❌ | ❌ | ✅ vídeo/imagem + transcrição | ❌ | ✅ active status | creative velocity | ✅ | pago | médio |
| **BrightData / Adyntel / GetHookd** | ❓ não avaliado (sem evidência) | ❓ | ❓ | ❓ | ❓ | ❓ | ? | ? | ? |
| **Self-hosted Playwright** | ✅ (raspa a UI) | ✅ **único caminho** (post renderizado) | ✅ | ✅ | ✅ | ✅ | n/a | infra própria | **alto** (anti-bot, ToS-gray, manutenção) |

## Recomendação
**Score API-only no MVP** (sem engajamento): **faixa de impressões + dias no ar + variações + reach_estimate**, via **ScrapeCreators** (API mais limpa pros nossos campos) ou **Apify** (você já tem). Engajamento vira **v2 opcional via Playwright** se o sinal extra justificar a fragilidade. Já é bem mais afiado que "só longevidade".

Por quê: não construir 25% do score num campo que **não existe via API**; entregar um score confiável, all-API, agora; adicionar engajamento depois se valer.

## ⚠️ O que AINDA precisa de teste empírico (a pesquisa não fecha sozinha)
A própria pesquisa diz: páginas de vendor sub-documentam campos. Antes de travar provider + pesos, **1 request real** resolve:
1. **ScrapeCreators devolve engajamento de verdade?** (eles dão "hint", não itemizam) — testar contra 1 ad real.
2. **Quais scrapers já pegam o NOVO bucket universal de impressões** (expansão jan/2026 pra todos os ads) vs só o legado UE/político? (`curious_coder` parece só legado.)
3. **BrightData / Adyntel / GetHookd** não foram avaliados — podem ser caminho mais barato.
4. **Engajamento é obtenível pro CRIATIVO do anúncio** (vs o post orgânico)? A Meta renderiza o snapshot do ad sem os contadores sociais — isso decide se engajamento é dropável ou só via post-URL subjacente.

**Próximo passo concreto:** com teu `APIFY_TOKEN` (e/ou um trial ScrapeCreators), eu rodo 1 query real num nicho seu, vejo quais campos populam de verdade, e aí travo provider + pesos do score com base em dado, não em página de marketing.

## Fontes
[admapix — Ad Library API dev](https://www.admapix.com/blog/ad-intelligence/meta-ads-library-api-developers) · [adlibrary — free API 2026](https://adlibrary.com/posts/meta-ad-library-free-api-2026) · [Meta Transparency — research tools](https://transparency.meta.com/researchtools/ad-library-tools) · [ScrapeCreators API](https://scrapecreators.com/facebookAdLibrary-api) · [Apify curious_coder](https://apify.com/curious_coder/facebook-ads-library-scraper) · [Apify aurumworks](https://apify.com/aurumworks/facebook-ads-library/api) · [Foreplay API](https://www.foreplay.co/api) · [primores — Ad Library API guide](https://primores.org/blog/meta-ad-library-api/) · [tyver — top scrapers 2026](https://tyver.io/blog/top-12-facebook-ads-library-web-scraping-tools-in-2026-ultimate-guide/)

---
*Confiança: baixa salvo "impressões = bucket" (alta, 3-0). Decisão recomendada robusta ao caveat (não depende de engajamento). Veredito final do provider gated em 1 teste empírico com creds.*
