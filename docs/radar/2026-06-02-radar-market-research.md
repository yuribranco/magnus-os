# Radar — Pesquisa de mercado: plataformas de ad/creative intelligence + apresentação de relatório

Gerado por `/deep-research` (2026-06-02) + síntese manual. Task `wy3ohkxs6`.
24 fontes buscadas, 78 claims extraídos. **Nota de método:** a fase de verificação adversarial do
workflow quebrou (os subagents não chamaram o StructuredOutput → votos "0-0 abstain" → marcados
"refuted" por engano, NÃO por serem falsos). Os dados abaixo vêm direto das fontes fetchadas — a
maioria **primária** (foreplay.co, tryatria.com, motionapp.com, magicbrief.com). Itens fora desse
conjunto estão marcados como **[conhecimento geral, não desta run]** e merecem confirmação antes de
citar pra cliente.

---

## 1. Panorama dos players

### Cited nesta run (fontes primárias/blog fetchadas)

**Foreplay** (foreplay.co — primário) — o líder de "ad workflow" pra criativo.
- **O que faz:** salvar/organizar ads de concorrente + brief de criativo por IA. Módulos: Swipe File,
  Discovery (biblioteca de **27M+ ads**), Briefs, **Spyder** (rastreio de concorrente), Lens (analytics).
- **Fontes de dado:** Meta Ad Library, TikTok, LinkedIn, YouTube Shorts, Google transparency + orgânico.
  Captura via **extensão Chrome** (1 clique). Ads salvos ficam **permanentes** mesmo se o original sai do ar.
- **Métricas:** foca em **criativo/copy/longevidade** — **NÃO** mostra gasto nem engajamento estimado.
  Spyder dá: distribuição de mídia (% vídeo/estático/carrossel), análise de hook, longevidade, screenshot da LP.
- **IA:** transcrição/análise de hook, geração de script, storyboard, automação de brief.
- **Pricing:** ~$49–99/mo solo (annual), até **$389–459/mo Agency**. (variação entre fontes: $59 Basic /
  $175 Workflow / $459 Agency mensal; outra fonte $49 Inspiration / $99 Full-Workflow-com-IA, +$20/seat).
- **Entrega:** boards/swipe files + brief de IA compartilhável. **Não é PDF estático.**

**Atria** (tryatria.com — primário) — o mais "all-in-one + IA" do grupo.
- **O que faz:** plataforma end-to-end: pesquisa de concorrente → inspiração → geração de imagem →
  brief → criação de ad → launch → análise. Se posiciona como substituto de analytics + swipe + launcher + DAM.
- **IA "Raya":** treinada em **$5B+ de ad spend real**. **Nota/grade cada ad e prescreve correções**
  (camada de score de criativo, não só métrica crua), identifica personas/hooks/mensagens vencedoras e
  **gera brief data-driven + copy/variações**.
- **Fontes:** Meta + TikTok.
- **Pricing:** premium all-in-one **[conhecimento geral: faixa ~$200–300+/mo, confirmar]**.

**Motion** (motionapp.com — primário) — **categoria adjacente, NÃO é spy.**
- **O que faz:** creative **analytics do próprio anunciante** ("Ship more winning ads"). Ad leaderboard,
  AI tags, relatório de criativo. **Dado = first-party** (integra Northbeam, Google Analytics), não Ad Library.
- **Pricing:** **por gasto do próprio cliente** — Starter **$250/mo** (até $50k/mo de spend), Pro ($50k+),
  Growth ($250k+). Unlimited seats/contas.
- **Relevância pro Radar:** é o benchmark de **como apresentar "o que está vencendo" num leaderboard** —
  mas mira o dado próprio, não o do concorrente. Radar joga no campo de Foreplay/Atria, não no da Motion.

**MagicBrief** (magicbrief.com — primário, 3 claims) — concorrente direto de Foreplay/Atria (swipe +
creative analytics + brief). **GetHookd** (gethookd.ai) aparece como mais um do mesmo cluster.

### Meta Ad Library (a fonte crua) — **achado crítico pro winner-score**
- Mostra **faixa de gasto + faixa de impressões SÓ pra ads com alvo na UE**; pra ads fora da UE, **zero
  dado de gasto**. Nunca mostra budget exato, gasto diário, CPC, CPM, ROAS nem segmentação.
- **Implicação direta pro Radar BR:** no Brasil **não dá pra usar gasto** como sinal. Confirma a decisão
  já validada: **winner-score = longevidade + variações + velocidade**, não gasto/engajamento.

### Lógica de "winner-score" do mercado (validação externa)
- Os tools definem ad vencedor por **longevidade + sinais de escala** (quanto tempo roda, rajadas de
  spend, rotação de criativo, runtime estendido), **não por volume de engajamento**.
- Heurística citada: **ad rodando 30+ dias ≈ quase certamente lucrativo** (anunciante mata perdedor em
  dias) → **longevidade é proxy usável de performance**. É exatamente a tese do nosso winner-score.

### Mencionados no escopo mas NÃO fetchados nesta run — **[conhecimento geral, confirmar]**
- **AdSpy** (~$149/mo): maior DB de FB/IG ads, busca por texto/advertiser, foco afiliado/ecom.
- **BigSpy** (~$9–99/mo, freemium): multi-plataforma barato, qualidade média.
- **PowerAdSpy** (~$49–299/mo): multi-plataforma, foco afiliado.
- **Minea** (~€49–99/mo): Ad Library + influencer + produtos vencedores, forte em dropshipping.
- **Dropispy** (barato): dropshipping FB ads.
- **PipiAds** (~$77–263/mo): **TikTok** ad spy, nicho dropship/ecom.
- **SocialPeta** (enterprise ~$169+/mo): cobertura global enorme, mira agência/UA mobile.
- **Madgicx**: otimização+automação de Meta ads (gestão da própria conta, tem AI ad library).
- **Sensor Tower / Pathmatics** (enterprise, milhares/mês): inteligência de spend digital pra marca grande.
- **Varos**: benchmark anônimo de métricas entre empresas (CPM/CPA do seu setor).

---

## 2. Tabela comparativa (feature × player) + lacunas do Radar

| Feature | Foreplay | Atria | Motion | AdSpy/BigSpy | **Radar (nosso)** |
|---|---|---|---|---|---|
| Fonte = Meta Ad Library | ✅ | ✅ | ❌ (1st-party) | ✅ | ✅ |
| **Auto-descoberta** de concorrente (você não precisa conhecer) | 🟡 manual/extensão | 🟡 you-driven | ❌ | 🟡 busca | ✅ **seed→descobre** |
| Winner-score determinístico transparente | 🟡 longevidade | ✅ grade IA | ✅ leaderboard 1st-party | ❌ | ✅ long+var+veloc |
| Brief de ângulo por IA | ✅ (EN) | ✅ (EN) | ❌ | ❌ | ✅ **PT-BR Breakthrough Adv.** |
| **Nicho infoproduto/lançamento BR** | ❌ DTC/ecom | ❌ DTC | ❌ DTC | ❌ ecom/afiliado | ✅ **lançamento BR** |
| Loop até criativo produzido | 🟡 storyboard | ✅ cria ad | ❌ | ❌ | ✅ **→ Magnus OS produz** |
| Media-mix / hook analysis | ✅ | ✅ | ✅ | 🟡 | ✅ (a construir) |
| Idioma do produto | EN | EN | EN | EN | **PT-BR** |

**Lacunas que o Radar ocupa (o "azul oceano"):**
1. **Brief de ângulo em PT-BR com lente Breakthrough Advertising** — todos são EN e genéricos (DTC/ecom).
   Ninguém faz ângulo de **lançamento de infoproduto** (estágio de consciência, sofisticação, VSL/quiz).
2. **Auto-descoberta de concorrente** — Foreplay/Atria exigem que VOCÊ saiba/salve o concorrente. Radar
   parte de seed keywords e **traz o concorrente que o mentorado não conhecia** = momento "uau".
3. **Nicho infoproduto BR** — o mercado todo é DTC/Shopify/Northbeam. Lançamento BR está descoberto.
4. **Loop fechado até o criativo** — os concorrentes param no brief; **Radar → Magnus OS produz** o criativo.

---

## 3. Padrões de UX/apresentação que valem copiar

1. **Board ranqueado, não planilha.** Motion "ad leaderboard" + Foreplay Discovery mostram "o que vence"
   como **grade visual ranqueada** de thumbnails. O score fica visível no card.
2. **Badge de longevidade como sinal-herói.** "Rodando há 90+ dias" é o selo de confiança que traduz o
   winner-score pro leigo num relance.
3. **Card de criativo glanceável:** thumbnail + dias no ar + nº de variações + formato + CTA + link da LP.
4. **Media-mix breakdown** (% vídeo/estático/carrossel) — mostra o **formato** que está funcionando no nicho.
5. **Hook analysis** — transcrever os 3 primeiros segundos do vídeo. Foreplay/Atria fazem; é muito acionável.
6. **Screenshot da landing page** junto do ad (Spyder) — mostra o **funil inteiro**, não só o criativo.
7. **O brief é o entregável-herói**, não o dado cru. Brief de IA compartilhável > tabela de métricas.
8. **Swipe file / board organizável e compartilhável** com o time/mentorado.

---

## 4. Como apresentar NOSSOS relatórios melhor (recomendações concretas)

1. **Abrir com o board ranqueado** por winner-score (não um dump de ads). Cada ad = card com **dias no ar
   (badge grande)**, nº de variações, formato, hook transcrito **em PT-BR**, link da LP.
2. **Brief de ângulo PT-BR = o herói da entrega.** Lente Breakthrough Adv.: estágio de consciência,
   nível de sofisticação, promessa, mecanismo, ângulo. **Nenhum concorrente localiza isso** → é o nosso "porquê".
3. **Seção "Concorrentes que você não conhecia"** — destacar o resultado da auto-descoberta. É o momento
   que justifica a assinatura sozinho.
4. **Resumo do nicho no topo:** mini-gráfico de distribuição de longevidade + media-mix ("o que está
   vencendo em [nicho] agora"). Dá contexto antes do detalhe.
5. **Acionável = botão "gerar criativo com este ângulo no Magnus OS"** em cada card. Fecha o loop
   spy→produção que os concorrentes não têm.
6. **Dois formatos de saída:** painel web persistente (produto online) **+ export PDF** pro mentorado/stakeholder.
7. **Evitar prometer gasto/ROAS** (a Meta não dá fora da UE) — vender em cima de longevidade + variações +
   velocidade, que é o que dá pra provar. Honestidade do dado = confiança.

---

## 5. Pricing benchmark (pra ancorar o nosso)

| Faixa | Players | Preço/mo |
|---|---|---|
| Barato/freemium | BigSpy, Dropispy | $9–99 |
| Solo/creator | Foreplay Basic, Minea | $49–99 |
| Pro/workflow | Foreplay Workflow, MagicBrief, PipiAds, AdSpy | $99–263 |
| Analytics 1st-party | Motion (por spend) | $250+ |
| Agency | Foreplay Agency, Atria | $300–500 |
| Enterprise data | SocialPeta, Pathmatics, Sensor Tower | $169 → milhares |

**Ancoragem sugerida pro Radar (BR, infoproduto):** o mercado-alvo (mentorado de lançamento) compara com
o tier **solo/creator → workflow** ($49–263/mo ≈ R$250–1.300/mo). Como o Radar entrega **mais** (auto-
descoberta + brief PT-BR + loop pro Magnus OS) num nicho sem concorrente localizado, dá pra ancorar no
**meio-alto da faixa** sem parecer caro: faixa de teste sugerida **R$197–497/mo** (validar com a
Assignment — perguntar o número real pro mentorado). Acima disso só com prova de ROI repetida. A
assinatura **precisa cobrir o COGS server-side** (Apify + Claude) — modelar a quota dentro dessa margem.

---

## Fontes (desta run)
Primárias: foreplay.co (/swipe-file, /pricing), tryatria.com (+ /features/meta-ads-analytics, blogs),
motionapp.com (+ /pricing), magicbrief.com/creative-analytics. Blogs: winninghunter.com, adligator.com,
1800dtc.com, gethookd.ai, adlibrary.com. (Fetches que falharam: minea.com/adspy, foreplay.co/comparison/atria,
vibemyad, motionapp/creative-reporting — re-rodar se precisar dos números exatos de Atria/Minea.)
