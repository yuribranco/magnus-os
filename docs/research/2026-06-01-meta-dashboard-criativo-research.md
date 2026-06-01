# Pesquisa — Magnus OS: Conexão Meta + Dashboard de Ads + Inteligência de Criativo

**Data:** 2026-06-01
**Contexto:** Magnus OS = sistema de gestão local-first para agências de lançamento/venda de infoproduto. Painel Next.js rodando em localhost na máquina do cliente + agente Claude Code local (assinatura do cliente). Objetivo: implementar 3 capacidades novas (conexão Meta + dashboard por campanha; scraping de criativos validados; variações de criativo) de forma pristina, simples pro leigo, eficiente.

## Nota de método (importante)

Rodei o harness `/deep-research` (fan-out de 5 ângulos → 24 fontes → 81 claims → verificação adversarial). **A fase de verificação estourou em rate-limit** ("Server is temporarily limiting requests"): os 105 agentes saturaram e os 25 claims do top foram marcados `0-0 (3 abstain) ✗` — abstenção virou "refutado" por default. Logo, **nenhum claim foi de fato refutado**; eles só não passaram pelo crivo automático. Sintetizei a partir dos claims fontados + julgamento próprio + fetch direto do Spyglass + buscas anteriores. **Confiança marcada por claim:** 🟢 fonte primária (docs Meta) · 🟡 múltiplas fontes secundárias concordam · 🟠 fonte única/blog.

---

## ÁREA 1 — Conexão Meta (auth mais simples pro cliente não-técnico)

### O terreno: 3 caminhos

| Caminho | Quem autentica | Precisa Developer App? | App Review? | Dashboard live? | Fricção pro cliente leigo |
|---|---|---|---|---|---|
| **A. MCP oficial da Meta** | o agente (OAuth via BM) | **Não** | **Não** | near-live (via arquivo) | **Mínima** |
| **B. Developer App próprio + OAuth** | o painel (Facebook Login) | Sim (do Magnus) | Sim (1x, do Magnus) | **Sim, live** | Baixa (1 clique) |
| **C. System User token colado** | o cliente | **Sim (do cliente)** | depende | Sim, live | **Alta (inviável)** |

### Fatos-chave

- 🟢 **System User token e long-lived token EXIGEM um Facebook Developer App** com acesso (standard+) à Ads Management API; o exchange short→long-lived usa App ID + App Secret server-side. → **Caminho C morre pro cliente leigo** (ele não vai criar um Developer App). [Meta docs — system users](https://developers.facebook.com/docs/business-management-apis/system-users/install-apps-and-generate-tokens/), [long-lived tokens](https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived/)
- 🟢 **System User token pode ser never-expiring OU 60-day**; Meta recomenda os expiring por segurança. Long-lived user token ~60 dias; Page token não expira. [Meta docs](https://developers.facebook.com/docs/business-management-apis/system-users/install-apps-and-generate-tokens/)
- 🟢 **OAuth Facebook Login exige `redirect_uri` batendo exatamente com uma URI whitelistada** no app dashboard → é o obstáculo central pra app em localhost sem domínio público. **Workaround oficial:** apps desktop/webview podem usar a **página de sucesso hospedada do Facebook** como redirect_uri, em vez de domínio próprio. [Meta docs — manual flow](https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow/)
- 🟡 **`ads_read` é o escopo mínimo** pra puxar relatórios; `ads_management`/`business_management` só pra criar/editar ads e gerir BM → dashboard read-only pede o escopo mínimo. [adamigo](https://www.adamigo.ai/blog/meta-ads-api-key-setup-guide)
- 🟡 **MCP oficial da Meta autentica via Meta Business OAuth, SEM Developer App e SEM App Review** — mesma primitiva que Shopify/Mailchimp. Consent oferece **3 tiers: read-only, read/write, read/write/financial** → dá pra ficar read-only. [mcp.directory](https://mcp.directory/blog/meta-ads-cli-mcp), [GoMarble](https://www.gomarble.ai/ai-tools/meta-ads-ai-connectors/)
- 🟡 **MCP oficial = `mcp.facebook.com/ads`, 29 tools em 5 grupos, sendo 7 de insights/benchmarks** (`ads_insights_advertiser_context`, `ads_insights_industry_benchmark`, `ads_get_opportunity_score`…). Faz *write* (gasta dinheiro) → começar read-only. [29 tools](https://pasqualepillitteri.it/en/news/1707/official-meta-ads-mcp-claude-29-tools-2026)

### Recomendação principal: **Caminho A — MCP oficial + dashboard near-live**

O cliente conecta a Meta **uma vez** via OAuth do MCP oficial (zero Developer App, zero App Review, tier read-only). O agente puxa insights via MCP e **grava `operacao/<slug>/meta/insights.json`**; o painel renderiza desse arquivo. Refresh = botão "Atualizar" (dispara uma puxada rápida do agente) ou auto ao abrir a campanha / a cada N min.

**Por quê:** é o menor setup possível pro leigo (o motivo da pesquisa), 100% local-first, **zero segredo no painel** (alinhado com a migração 1Password e o ethos do produto). O MCP oficial é *desenhado* exatamente pra esse caso. Casa com "a mágica aparecer": conecta → abre a campanha → os números aparecem.

**Trade-off aceito:** dashboard é *near-live* (fresco até a última puxada), não tempo-real-milissegundo. Pra um painel de gestão (não um console de bidding), é aceitável.

### Alternativa: **Caminho B** (se algum cliente exigir live de verdade)
Magnus publica seu app Meta + passa App Review pra `ads_read` (1x), cliente clica "Conectar Meta" (OAuth com o truque da página de sucesso hospedada), painel guarda token local → dashboard live server-side. **Custo:** semanas de App Review + manter o app + refresh de token a cada 60 dias + mais "server-y". Deixar como upgrade futuro.

### Armadilhas
- ❌ Achar que "colar um token" é simples — não é (Caminho C exige Developer App do cliente).
- ❌ OAuth em localhost sem o truque da redirect-page hospedada → trava.
- ❌ Pedir escopo além de `ads_read` no MVP → consent assustador + risco.
- ⚠️ O MCP oficial pode fazer write (gasta budget) → travar em read-only no início.

---

## ÁREA 2 — Dashboard de ads por campanha (métricas + UX)

### Hierarquia de métrica (a espinha do dashboard) 🟡
Organizar criativo/ad em **3 estágios de funil** — vira a estrutura visual do painel:
1. **Atenção** — *Hook rate / thumb-stop* = views de 3s ÷ impressões × 100. Saudável **30-40%**; <25% = refazer; **40%+ = sinal de escalar**.
2. **Engajamento** — *Hold rate* = plays de 15s ÷ plays de 3s × 100 (média 40-50%, >60% forte); **CTR**.
3. **Conversão** — **CPA / custo por lead, ROAS, taxa de conversão**.

[Motion](https://motionapp.com/blog/key-creative-performance-metrics), [benly](https://benly.ai/learn/meta-ads/dashboard-kpis-guide), [ConversionEngine](https://www.conversionengine.com/post/how-to-read-your-meta-ad-performance), [hawky](https://hawky.ai/blog/hook-rate)

### Benchmarks 🟡
- **ROAS** médio 2026 ~2.79–3.61x, **mas é inútil sem margem**: break-even ROAS = 1 ÷ margem de lucro. (Pra infoproduto, margem altíssima → break-even ROAS baixo; exibir margem junto.)
- **Outbound CTR** (não cliques all-platform): 1-2% sólido, >2% forte, >3% excelente, <0.5% fraco. Medir **outbound**, não link clicks genéricos.

### Específico pra infoproduto (lead-gen + vendas) 🟡
Preset de coluna lead-gen: **Campanha, Valor gasto, Leads, Custo por lead, Landing page views, Form completion rate**. Pra venda direta: somar **faturamento, ROAS, ticket, CPA de compra**. Presets salvos por tipo de campanha.

### Data fetching (Graph API) 🟠
- Server-side + cache; **insights pesados via async jobs** (a Graph API tem timeout em queries grandes/complexas); respeitar rate limits.
- No Caminho A isso é abstraído pelo MCP (o agente puxa e grava arquivo) → o painel só lê JSON local (rápido, sem rate-limit no front).

### UX de associação BM ↔ campanha do painel 🟠
Padrão de "linking de entidade externa": (1) listar campanhas da BM (via MCP/insights), (2) **match automático por nome** (sugerir a campanha da BM com nome parecido com o slug/displayName), (3) **confirmação humana** (cliente confirma o vínculo), (4) guardar o `meta_campaign_id` em `operacao/<slug>/meta/link.json`. Permitir 1 campanha do painel → 1+ campanhas da BM.

### Recomendação
Dashboard dentro da campanha com a hierarquia atenção→engajamento→conversão; cards grandes pros KPIs de topo (gasto, leads/vendas, CPA, ROAS c/ margem), drill-down até criativo, sparkline de tendência + comparação de período, e estados de loading/erro/vazio caprichados ("conecte a Meta pra ver resultados"). Tom "a mágica aparecer": ao abrir, os números materializam.

### Armadilhas
- ❌ ROAS sem margem (engana).
- ❌ Vanity metrics (impressões/cliques crus) no topo em vez de CPA/ROAS/hook rate.
- ❌ Puxar tudo síncrono → timeout/rate-limit. Usar arquivo intermediário (Caminho A) resolve.

---

## ÁREA 3 — Inteligência de criativo (scraping + variações)

### Fontes de scraping (Meta Ad Library) 🟡
- **Ad Library API oficial** (pública, todos os anúncios ativos em FB/IG/Threads/WhatsApp) — base de tudo, grátis, mas crua.
- **Apify actors** (`curious_coder/facebook-ads-library-scraper`, scraperhive, harvestlab) — query por keyword/nicho, baixa imagem/vídeo. **Yuri já tem acesso Apify.**
- **ScrapeCreators API** (1 call → ads do competidor), **GetHookd** (65M+ ads por nicho/formato/performance), **Adyntel** (domínio → JSON).
- **Spyglass** ($40-80/mo) — **sem API pública nem geração**, então é **referência de UX e de sinal**, não integração.
[8 ferramentas 2026](https://adlibrary.com/posts/meta-ad-library-scraping-tools), [Apify](https://apify.com/curious_coder/facebook-ads-library-scraper)

### Como identificar "validado"/vencedor (o insight afiado) 🟡
- **Sinal fraco (o óbvio):** longevidade do anúncio (tempo no ar) + nº de variações ativas + volume. Quase todo mundo usa.
- **Sinal forte (do Spyglass, vale roubar):** **outlier score contra a baseline da própria marca** — o que está performando *acima do normal daquele anunciante*, não só "o que está no ar há mais tempo". Bem mais preciso pra dizer "isso é vencedor".
- **Top da própria conta:** ranking dos teus ads ativos por métrica (ROAS/CPA/hook rate) via insights do Caminho A.

### Geração de variações on-brand SEM plágio 🟠
- **"Variação" ≠ copiar pixel.** Significa **reverse-engineering da ESTRUTURA** (hook, layout, ângulo, oferta, mecânica visual) → **recriar pra marca do cliente** (paleta/voz/logo via `contexto/DESIGN.md`+`VOZ.md`+`checar-marca`).
- Pipeline: (1) agente *analisa* o criativo de referência (vencedor próprio OU scraped) e extrai a estrutura; (2) gera o conceito adaptado à marca; (3) **Gemini (Nano Banana / img2img / reference-conditioned)** produz a imagem on-brand; (4) `checar-marca` valida; (5) sai em 1:1 **e** 9:16 (regra fixa do Yuri).
- Isso *estende* o `criar-criativo` atual: agora ele aceita **referência** (do banco de scraping ou do top-performer da conta) além do brief do zero.

### Ferramentas a espelhar (UX) 🟡
- **Foreplay / Motion / Atria** — swipe files, scoring de criativo, briefing assistido.
- **Spyglass** — "ele rola de madrugada, de manhã os vencedores estão lá" + landing page pareada + mix de formato ao longo do tempo. Casa 1:1 com "a mágica aparecer".
[Atria — best AI ad tools](https://www.tryatria.com/blog/best-ai-ad-tools-for-creative-analysis)

### Recomendação
Track de criativo = **(2a)** scraping de nicho via **Apify** (já temos) + Ad Library, gravando num "banco de validados" por empresa/nicho com **outlier score** (não só longevidade); **(2b)** ranking dos top-performers da própria conta (depende do Caminho A); **(2c)** `criar-criativo` ganha modo "variação a partir de referência" (estrutura, não cópia). UX: galeria de criativos validados (estilo swipe file) → "Gerar variação on-brand" em 1 clique → a imagem aparece inline (a mágica que já construímos na v1).

### Armadilhas
- ❌ Copiar criativo do concorrente pixel-a-pixel → plágio + off-brand. Sempre reconstruir a estrutura na marca.
- ❌ Rankear só por longevidade → pega anúncio "zumbi". Usar outlier vs baseline.
- ❌ Scraping sem cache/limite → custo Apify e ToS. Cachear o banco por nicho, atualizar incremental.

---

## Síntese cross-area (implicações de design)

1. **Uma conexão Meta resolve 3 coisas:** dashboard (Área 2) + top-performers próprios (2b) — ambos via Caminho A (MCP oficial → arquivo). O scraping de nicho (2a) é fonte *separada* (Ad Library/Apify), roda em paralelo.
2. **O arquivo é a cola local-first:** insights e banco de criativos viram arquivos em `operacao/<slug>/meta/` e no nível da empresa → o painel só lê arquivos (rápido, sem segredo, sem rate-limit no front). Consistente com o file-first do produto.
3. **A "mágica aparecer" se repete:** conectar Meta → números materializam; abrir galeria → vencedores do nicho já estão lá; 1 clique → variação on-brand inline. Mesmo padrão da v1.

## Fontes (qualidade)
**Primárias (Meta):** [system users](https://developers.facebook.com/docs/business-management-apis/system-users/install-apps-and-generate-tokens/) · [long-lived tokens](https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived/) · [manual OAuth flow](https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow/) · [insights best-practices](https://developers.facebook.com/docs/marketing-api/insights/best-practices/)
**MCP oficial:** [mcp.directory](https://mcp.directory/blog/meta-ads-cli-mcp) · [29 tools](https://pasqualepillitteri.it/en/news/1707/official-meta-ads-mcp-claude-29-tools-2026) · [GoMarble](https://www.gomarble.ai/ai-tools/meta-ads-ai-connectors/)
**Métricas/dashboard:** [Motion](https://motionapp.com/blog/key-creative-performance-metrics) · [benly](https://benly.ai/learn/meta-ads/dashboard-kpis-guide) · [ConversionEngine](https://www.conversionengine.com/post/how-to-read-your-meta-ad-performance) · [hawky](https://hawky.ai/blog/hook-rate) · [segwise](https://segwise.ai/blog/tiktok-dashboard-best-practices-kpis-creative-metrics)
**Criativo:** [8 ferramentas Ad Library](https://adlibrary.com/posts/meta-ad-library-scraping-tools) · [Apify actor](https://apify.com/curious_coder/facebook-ads-library-scraper) · [Atria](https://www.tryatria.com/blog/best-ai-ad-tools-for-creative-analysis) · [Spyglass](https://spyglass.so/) (fetch direto)

---
*Gerado via `/deep-research` (verificador rate-limited; síntese por julgamento sobre claims fontados) + fetch Spyglass + buscas. Confiança marcada 🟢🟡🟠. Próximo: decisão do Caminho Meta → spec por track.*
