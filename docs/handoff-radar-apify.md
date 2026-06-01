# Handoff — Radar de Criativos + Espionagem (Apify-first, native-default)

**Projeto:** módulo "Radar" do painel dos mentorados (+ "Espionagem Profunda" no v2)
**Stack:** Next.js 14 (App Router) + TypeScript + tRPC + Prisma + Supabase (Postgres + Storage + RLS) + BullMQ + Tailwind, deploy Hostinger VPS (PM2/Nginx). Engine de IA: Claude via Claude Code/Max.
**Objetivo:** dado a empresa e a campanha do usuário do painel, o sistema descobre os concorrentes sozinho, monitora ads e conteúdo orgânico (Instagram + YouTube), pontua o que está "vencendo" e sugere ângulos de criativo em português. No v2, espionagem profunda de um concorrente confirmado (funil inteiro + infra).

> Execução por fases, cada uma com critério de aceite. Zero erro de TypeScript por fase. Não avançar sem o smoke test da fase anterior passando.

---

## REGRA DE ROTEAMENTO (governa o módulo inteiro)

Toda coleta de dado decide a rota nesta ordem:

1. **Default = nativo.** Usar as funções que já temos no Claude Code e workers no próprio VPS para: fetch básico de página, parsing, conversão pra markdown, e toda a recon (DNS, WHOIS, crt.sh, decode de GTM, Wayback, marketplace, CNPJ, Reclame Aqui). É mais rápido, mais barato e fica sob nosso controle.
2. **Apify só quando for imprescindível**, ou seja, quando não dá pra fazer nativo de forma confiável:
   - **Meta Ad Library** (busca por keyword e ads por página). Replicar o GraphQL da Meta com anti-bot, paginação por cursor e rotação de proxy nativamente é frágil demais. Apify aqui é imprescindível.
   - **Instagram orgânico em escala.** IG bane agressivo e exige proxy residencial e rotação de sessão. Scraper nativo (instaloader) toma ban. Apify (ou outro vendor gerenciado) é imprescindível.
3. **Apify quando traz vantagem grande**, mesmo dando pra tentar nativo:
   - **Renderização de página JS-pesada / com anti-bot / scroll infinito** (VSL com SPA, páginas protegidas por Cloudflare). Aqui a regra é: tenta nativo primeiro, e escala pro Apify só quando a detecção disser que precisa.
4. **Nunca** mandar pro Apify um fetch que o nativo resolve.

YouTube orgânico não entra nessa árvore: é sempre a **API oficial do YouTube Data v3 (grátis)**.

### Implementação da escalada (fetch nativo -> Apify render só quando precisa)

```typescript
// src/lib/radar/fetch/fetch-page.ts
async function fetchPage(url: string): Promise<{ html: string; markdown: string; renderedVia: 'native' | 'apify' }> {
  // 1. tenta nativo (função que já temos: WebFetch / undici no VPS)
  const native = await nativeFetch(url);
  // 2. detecta se precisa de browser
  if (needsRender(native.html)) {
    const rendered = await apifyWebsiteContentCrawler(url); // Playwright mode, 1 URL
    return { html: rendered.html, markdown: rendered.markdown, renderedVia: 'apify' };
  }
  // 3. nativo deu conta: converte local (readability + turndown)
  return { html: native.html, markdown: htmlToMarkdown(native.html), renderedVia: 'native' };
}

function needsRender(html: string): boolean {
  // escala pro Apify quando:
  // - texto útil abaixo de ~500 chars (shell de SPA)
  // - markers de SPA com conteúdo vazio (<div id="root"></div>, __NEXT_DATA__ sem conteúdo)
  // - desafio de bot (Cloudflare "Just a moment", status 403/429)
  // - elementos-chave do funil ausentes (nenhum link de checkout, sem conteúdo principal)
  // caso contrário, retorna false (nativo resolve)
}
```

Sempre gravar `renderedVia` no registro, pra medir quanto está indo pro Apify e calibrar custo.

---

## 0. Antes de escrever código

1. **Smoke test do token Apify.** Disparar um run do actor de Meta Ad Library e buscar o dataset, validando que volta `snapshot.body.text`, `snapshot.linkUrl`, `startDateFormatted`/`endDateFormatted` e `collationCount`.
2. **Bake-off de actor (não escolher por vibe).** Rodar a MESMA query em 2-3 actors de Meta Ad Library (ex.: `automly/facebook-ad-library-scraper` ~$0.65/1k, `leadsbrary/meta-ads-library-scraper` ~$1.50/1k que usa a API oficial da Meta, e o que já testamos) e padronizar no que tiver schema mais completo, maior uso e manutenção mais ativa. Tudo atrás do normalizer.
3. **Camada de provider abstrata é inegociável.** Apify é a implementação, mas actor de comunidade pode mudar preço ou quebrar. A abstração + normalizer deixam trocar de actor (ou cair pra ScrapeCreators/Bright Data) como mudança de config, não reescrita.

---

## 1. Providers e integração assíncrona

A Apify é assíncrona: dispara run, espera, busca dataset. Dois modos:

- **Run-sync (runs curtos):** `POST https://api.apify.com/v2/acts/{actorId}/run-sync-get-dataset-items` devolve os itens numa chamada só (limite de ~300s). Bom pra descoberta com poucas keywords e pra render de 1 URL.
- **Run assíncrono + webhook (runs longos / monitoramento):** dispara `POST /v2/acts/{actorId}/runs`, e a Apify chama nosso webhook quando termina. O webhook enfileira um job de ingestão que busca o dataset. Dá pra deixar a **própria Apify agendar** as runs de monitoramento (scheduled runs nativos) e a gente só recebe webhook, terceirizando o cron.

Encaixe no BullMQ: fila `discover` e `ingest_*` disparam runs; um endpoint de webhook recebe o "run succeeded" e enfileira o `fetch-dataset` que normaliza e persiste.

Endpoints de dado:
- **Meta Ad Library (ads + descoberta):** actor escolhido no bake-off. Aceita keyword e URL de Ad Library; vários aceitam array `searchQueries` (varre várias keywords numa run só, ótimo pra descoberta). Cap de ~1.500 por query no modo keyword (limite de cursor da própria Meta, vale pra qualquer fonte).
- **Instagram orgânico:** `apidojo/instagram-scraper` (~$0.50/1k) ou similar. Campos: caption, hashtags, mídia, likes, comments, views/plays.
- **Render de página (fallback):** `apify/website-content-crawler` (first-party, construído sobre Crawlee). Modo Playwright pra JS/anti-bot, modo Cheerio pra leve. Só chamado quando `needsRender()` der true.
- **YouTube orgânico:** API oficial v3, fora da Apify (ver Fase 4).

> URLs de mídia da Meta são temporárias (CDN). Baixar pro Supabase Storage no momento da ingestão, sempre.

---

## 2. Modelo de dados (Prisma)

Multi-tenant com RLS por `tenant_id`.

```prisma
model Tenant { id String @id @default(cuid()) name String createdAt DateTime @default(now()) }

model PanelCompany {
  id            String   @id @default(cuid())
  tenantId      String
  name          String
  domain        String?
  metaPageId    String?            // resolvido na descoberta
  niche         String?
  positioning   String?            // proposta de valor / oferta
  campaignBrief String?            // descrição da campanha (texto livre)
  seedKeywords  String[]           // gerado pelo Claude (PT + EN)
  createdAt     DateTime @default(now())
}

model Competitor {
  id             String   @id @default(cuid())
  tenantId       String
  panelCompanyId String
  metaPageId     String
  pageName       String
  domain         String?
  status         CompetitorStatus @default(SUGGESTED)
  relevanceScore Float?
  discoveredVia  String?
  ads            CompetitorAd[]
  posts          CompetitorPost[]
}
enum CompetitorStatus { SUGGESTED CONFIRMED REJECTED }

model CompetitorAd {
  id             String   @id @default(cuid())
  competitorId   String
  externalId     String   // adArchiveID
  platform       String   // instagram | facebook | youtube
  source         String   // meta_ad_library
  mediaType      String   // image | video
  mediaUrl       String   // já baixada pro Storage
  thumbUrl       String?
  landingUrl     String?
  copy           String?  // snapshot.body.text
  ctaText        String?
  displayFormat  String?  // IMAGE | VIDEO | DCO
  startDate      DateTime?
  endDate        DateTime?
  daysActive     Int?
  variationCount Int?     // collationCount
  transcript     String?
  winnerScore    Float?
  scoreBreakdown Json?
  rawPayload     Json?
  fetchedAt      DateTime @default(now())
  @@unique([competitorId, externalId])
}

model CompetitorPost {       // orgânico IG/YT
  id            String   @id @default(cuid())
  competitorId  String
  externalId    String
  platform      String
  postType      String
  mediaUrl      String
  caption       String?
  hashtags      String[]
  likes         Int?
  comments      Int?
  views         Int?
  shares        Int?
  publishedAt   DateTime?
  outlierScore  Float?
  rawPayload    Json?
  fetchedAt     DateTime @default(now())
  @@unique([competitorId, externalId])
}

model DiscoveryRun { id String @id @default(cuid()) tenantId String panelCompanyId String seedKeywords String[] candidatesFound Int costUsd Float? status String createdAt DateTime @default(now()) }
model ScrapeJob { id String @id @default(cuid()) tenantId String kind String targetId String? status String renderedVia String? costUsd Float? error String? createdAt DateTime @default(now()) }
```

RLS: toda query do app filtra por `tenant_id`. Jobs de background carimbam `tenant_id` sempre.

---

## 3. Descoberta automática de concorrentes (núcleo do MVP)

Input: `PanelCompany`. Output: lista rankeada de `Competitor` `SUGGESTED` pro usuário confirmar.

1. **Seed keywords (Claude, nativo).** A partir de `{name, niche, positioning, campaignBrief}`, gerar 8-15 keywords cobrindo categoria de produto, proposta de valor, dores do público, em PT e EN. JSON puro, sem markdown.
2. **Resolver a própria página.** Buscar o `metaPageId` da PanelCompany na Ad Library pra excluir ela mesma dos resultados.
3. **Varrer ads por keyword (Apify, imprescindível).** Mandar as seed keywords no array `searchQueries` (uma run varre todas), país BR, status ACTIVE. Coletar anunciantes distintos (`pageId` + `pageName`) e de qual keyword vieram.
4. **Rankear (nativo, determinístico):**
   ```
   relevanceScore =
       0.40 * keywordOverlapNorm   // em quantas seeds distintas a página apareceu
     + 0.25 * activeAdVolumeNorm    // nº de ads ativos (proxy de budget)
     + 0.25 * nicheSemanticMatch    // 0-1: Claude compara posicionamento candidato vs user
     + 0.10 * geoMatch
   ```
   Excluir a própria página e páginas com 0 ads ativos. O `nicheSemanticMatch` corta agência, fornecedor e marca genérica que usou a keyword por acaso.
5. **Persistir top N (~15) como SUGGESTED.**
6. **Human-in-the-loop:** UI lista os sugeridos (logo, nome, nº de ads ativos, "apareceu em: [keywords]", score). Usuário Confirma/Rejeita. Só CONFIRMED entra no monitoramento. Corta marca errada e segura custo.

**Aceite:** num nicho BR real, retorna >=8 candidatos plausíveis, exclui a própria empresa, e o `DiscoveryRun` registra `costUsd`.

---

## 4. Ingestão e pontuação

**Ads (confirmados):** run no actor por `pageId`, normaliza, baixa mídia, calcula `winnerScore`.

**winner-score.ts (determinístico):**
```
longevity(daysActive):  0-7d=10 | 8-29d=30 | 30-59d=55 | 60-89d=75 | 90d+=90
variation(variationCount): +0..15
velocity: +0..15 (ads novos do anunciante nos últimos 7d)
winnerScore = longevity + variation + velocity   // normalizar p/ 0-100
```

**Orgânico IG (Apify):** posts/reels do perfil. **Orgânico YouTube (API oficial):** enumerar uploads via `channels.list -> playlistItems.list -> videos.list` (1 unit cada, batch de 50; evitar `search.list` que custa 100). Uma chave da Data API v3 por mentorado (cada um ganha 10.000 units/dia grátis).

**outlier-score.ts (determinístico):** `engajamento / mediana móvel dos últimos ~20 posts do perfil`. 10x = explodiu.

**Camada Claude (qualitativa):**
- `extract.ts`: nos top-scored, extrair hook, ângulo, oferta, persona, gatilho, formato; clusterizar vencedores em temas.
- `suggest.ts`: virar hipótese/brief, nunca cópia ("testar hook de história-de-fundador em UGC de 15s, estágio de consciência 3, mecanismo X"). Lente de **Breakthrough Advertising** (consciência + sofisticação + nomeação de mecanismo) no prompt, output PT-BR. Pega o mecanismo emprestado, não a execução.

**UI:** rotular sempre como sinal inferido ("Rodando há 87 dias, provável vencedor"), nunca performance garantida. Ninguém vende ROAS de concorrente.

---

## 5. Jobs, cadência e custo

- BullMQ: `discover`, `ingest_ads`, `ingest_organic`, `score`. Cadência: ads 24h, orgânico 24-48h, re-score após ingestão.
- Cache: stats orgânicas 1-6h, metadata 24h. Nunca re-baixar mídia já no Storage.
- Guardrail por tenant: orçamento de custo/mês, faturado a você, metrado por `tenant_id` em `ScrapeJob.costUsd`. Corta job ao estourar o teto.
- Medir `renderedVia` pra garantir que o Apify só está sendo chamado quando a regra de roteamento manda.

---

## 6. v2 — Espionagem Profunda (productização da skill `espionagem`)

Disparada sob demanda a partir de um concorrente CONFIRMED (botão "Espionagem profunda" no painel). O MVP descobre quem observar e ranqueia criativos; o v2 vai fundo num alvo (funil + infra + escada de valor).

### Mapeamento de cada fase (rota nativo vs Apify)

| Fase da skill | Rota | Por quê |
|---|---|---|
| 1. Mapeamento + scrape do site | **Nativo primeiro, Apify render só quando `needsRender()`** | Maioria de página de vendas é HTML server-rendered, fetch nativo resolve. Só VSL/SPA/anti-bot escala pro `website-content-crawler`. |
| 2. Player VTurb/ConverteAI + AB test + checkout + forms | **Nativo** | `curl` no `player.js` e regex. Não precisa de browser. |
| 3. Meta Ads do alvo | **Apify** (mesmo actor do MVP) | Imprescindível. |
| 3. YouTube do alvo | **API oficial** | Grátis. |
| 3. CNPJ / Reclame Aqui / social | **Nativo** | `curl` em base pública. (Ver LGPD abaixo.) |
| 4. Decode do container GTM | **Nativo** | `curl gtm.js` + grep + python. |
| 5. DNS / WHOIS / headers / ipinfo | **Nativo** | `dig`, `whois`, `curl -I`. |
| 6. crt.sh (subdomínios) | **Nativo** | `curl` + python. |
| 7. Marketplace Hotmart/Kiwify + Wayback | **Nativo** | `curl` + CDX API. |

Resultado: no v2, o Apify só toca em Meta Ads e nas poucas páginas que realmente precisam de render. Todo o resto roda em worker nativo no VPS.

### Reescrita de "agentes paralelos" para o painel

A skill usa "background agents" do Claude Code, que não existem no painel. Reimplementar como fan-out de jobs BullMQ (um job por fase), com merge final num relatório por tenant. O relatório vira registro no Supabase + render no painel, não um `.md` local.

### Segurança (requisito travado, não opcional)

As fases 2 e 4-7 disparam `curl`/`whois`/`dig` contra uma URL fornecida pelo usuário, rodando no nosso servidor. Isso é SSRF. Antes de abrir pros mentorados:
- Resolver e validar o domínio alvo; **bloquear faixas de IP privadas e loopback** (10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, IPv6 equivalentes).
- Rodar a recon em **worker isolado** (container/VPS separado, sem acesso à rede interna nem aos secrets do app).
- Timeout em tudo; rate-limit por tenant; allowlist de esquemas (só http/https).
- Negar URL que resolva pra IP interno mesmo após redirect (revalidar a cada hop).

### Cache, gating e LGPD

- **Gating:** recurso premium sob demanda, com botão. Nunca job agendado pra todos.
- **Cache por domínio de concorrente:** dois mentorados espionando o mesmo guru não pagam duas vezes. TTL razoável (ex.: 7-14 dias), com botão de "atualizar".
- **LGPD:** CNPJ traz sócios, que é dado pessoal. Oferecer como serviço a terceiro pesa diferente de uso pessoal. Validar com jurídico junto com o resto do painel. Marcar dado estimado com `[ESTIMADO]`.

---

## 7. Fases de entrega e aceite

| Fase | Entrega | Aceite |
|---|---|---|
| 0 — Setup | Smoke test Apify; bake-off de actor; provider abstrato + normalizer; schema + RLS; `fetchPage` com escalada | Run do actor volta os campos esperados; RLS bloqueia cross-tenant; `fetchPage` decide nativo vs Apify certo |
| 1 — Ingestão de ads + score | Cliente do actor + normalizer; download de mídia; `winnerScore` | Ads de 1 pageId pontuados e ordenáveis; mídia no Storage; 0 erro TS |
| 2 — Descoberta | Pipeline + UI confirmar/rejeitar | >=8 candidatos plausíveis, exclui a própria empresa, `DiscoveryRun.costUsd` registrado |
| 3 — Orgânico | IG (Apify) + YT (API v3) + `outlierScore` | Posts rankeados por outlier vs mediana do perfil |
| 4 — Camada Claude | `extract` + `suggest` (Breakthrough Adv., PT) | Top criativos viram temas + briefs, rotulados como sinal inferido |
| 5 — Jobs + guardrails | BullMQ + webhook Apify + cache + teto por tenant | Refresh automático rodando; tenant cortado ao estourar; `renderedVia` medido |
| v2 — Espionagem | Fan-out das fases + worker nativo + render sob demanda + SSRF + gating | Relatório completo por alvo confirmado, recon isolada, cache por domínio funcionando |

---

## 8. A validar empiricamente

1. Bake-off: qual actor de Meta Ad Library tem schema mais completo e estável pra anunciante BR.
2. Cobertura de reels do IG via Apify (view/share counts; contas com likes ocultos).
3. Profundidade do Google Ad Library pra YouTube ads de anunciante BR (provavelmente fina: só criativo + datas, sem spend).
4. Taxa real de `renderedVia=apify` no crawl do v2 (pra dimensionar custo do fallback de render).

---

## 9. Postura legal

- Só dado público, deslogado. Nunca atrás de login ou perfil privado.
- Não republicar a Ad Library inteira como produto. Criativo é copyright do anunciante: exibir pra análise, não republicar como nosso.
- LGPD onde houver dado pessoal (sócios/CNPJ). Validar com jurídico antes do lançamento.
- Risco de actor de comunidade mudar/quebrar: mitigado pela camada de provider.

---

### Primeiro passo pro Claude Code
Branch `feat/radar-fase-0`: smoke test do token Apify, bake-off de 2-3 actors de Meta Ad Library na mesma query BR, montar a interface de provider + normalizer + o `fetchPage` com a escalada nativo->Apify, e subir o schema com RLS. Quando o run do actor voltar os campos esperados, o `fetchPage` rotear certo num teste, e as migrations aplicarem limpas, me chama pra revisar antes da Fase 1.
