# Spec — Magnus OS: redesign para Agências de Lançamento de Infoproduto

**Data:** 2026-06-01
**Status:** design aprovado (brainstorming), aguardando review do Yuri → writing-plans por track
**Pesquisa de base:** `docs/research/2026-06-01-meta-dashboard-criativo-research.md`

## 1. Visão / posicionamento

Magnus OS é um **sistema de gestão empresarial para agências de lançamento/venda de infoproduto**, local-first (painel Next.js em localhost na máquina do cliente + agente Claude Code na assinatura do cliente; única chave externa = Gemini, pra geração de imagem). Filosofia: **"a mágica aparecer"** — o resultado real materializa e encanta o usuário não-técnico.

Este redesign **enxuga** o produto pro que move ponteiro numa agência de performance e entra com **inteligência de ads + criativo**: tira módulos genéricos (tarefas/posts orgânicos), entra conexão Meta com dashboard por campanha e inteligência de criativo (scraping de validados + variações on-brand).

## 2. Arquitetura compartilhada (a cola)

**Tudo é arquivo.** Dado da Meta e de criativo é gravado pelo **agente (via MCP/skill)** em arquivos no workspace; o **painel só lê arquivo**. Consequências:
- Zero segredo no painel (alinhado com o ethos local-first + migração 1Password).
- Sem rate-limit no front (o painel lê JSON local, não chama a Graph API).
- Near-live: o dado é tão fresco quanto a última puxada do agente.
- File-first consistente com o resto do produto.

**Caminho Meta = A (decidido):** MCP oficial da Meta (`mcp.facebook.com/ads`, OAuth via Business Manager, **sem Developer App, sem App Review**, tier **read-only**). O agente autentica a sessão; puxa insights e grava arquivo. (Live-de-verdade via Developer App próprio + App Review fica como upgrade futuro, fora de escopo.)

Layout de arquivos novo:
```
operacao/<slug>/meta/
  link.json        # vínculo BM↔campanha: { meta_campaign_ids: [...], account_id, linked_at }
  insights.json    # snapshot de performance da campanha (ver schema §5)
  synced_at        # timestamp da última puxada
contexto/ativos/swipe/<nicho>/
  index.json       # banco de criativos validados do nicho (ver schema §5)
  <ad_id>.jpg|mp4  # criativos baixados
  <ad_id>.json     # metadados + score composto por criativo
```

## 3. Tracks (sub-projetos)

Ordem de build: **Inc 0 → (Inc 1 ∥ Inc 2a) → Inc 2b → Inc 2c**. Cada track tem seu próprio plano (writing-plans) e ciclo de implementação.

### Inc 0 — Enxugar (flag reversível)
**Objetivo:** esconder da UI o que não serve à agência agora, sem deletar código.
- Mecanismo: `config.json` de módulos no workspace (ou flags em `lib/config`), ex: `{ modules: { tarefas: false, criarPost: false, notion: false, canva: false } }`. Default do produto = off pros 4.
- Esconde: aba **Tarefas** (`CampaignWorkspace` tab `tasks` + `NotionEmbedFrame`/`TasksEmptyState`), skill **`criar-post`** (some da skills bar e do parse), **MCP Notion + Canva** (`.mcp.json` + `MCPConnectBanner` notion/canva).
- Reversível: flipar a flag traz de volta. Código permanece versionado.
- **Não** mexe em: `criar-criativo`, `criar-landing`, `lancar-campanha`, `checar-marca`, onboarding de contexto.

### Inc 1 — Conexão Meta + dashboard por campanha
**Objetivo:** cada campanha mostra o resultado real dos ads que estão rodando.
- **Conexão:** trocar Notion/Canva no `.mcp.json` pelo MCP oficial da Meta. Onboarding vira "Conecte a Meta" (OAuth read-only; reusa o padrão do `ApiKeyBanner`/`MCPConnectBanner`).
- **Puxada:** skill **`sincronizar-meta`** → o agente chama as tools de insights do MCP → grava `operacao/<slug>/meta/insights.json` (+ nível de conta). Disparada por: botão "Atualizar" no dashboard, e auto ao abrir a campanha se `synced_at` estiver velho (> N min; default N=30).
- **Associação BM↔campanha:** UI lista campanhas da BM (via MCP) → **match automático por nome** (sugere a campanha BM com nome ~ slug/displayName) → cliente **confirma** → grava `meta/link.json`. 1 campanha do painel → 1+ campanhas da BM.
- **Dashboard:** dentro da aba Visão geral, renderiza do `insights.json` na hierarquia de funil:
  1. **Atenção** — hook rate (3s views ÷ impressões), 3s views.
  2. **Engajamento** — hold rate (15s ÷ 3s), CTR (outbound).
  3. **Conversão** — CPA/custo por lead, ROAS (**com margem** — exibir break-even), faturamento, ticket.
  - KPIs de topo (gasto, leads/vendas, CPA, ROAS+margem) → drill-down conta→campanha→adset→ad→criativo → comparação de período + sparkline → estados de loading/erro/vazio caprichados ("Conecte a Meta pra ver resultados").
  - **Layout finalizado via companion visual** (passo pré-implementação), reusando o design system do painel (`/ui-ux-pro-max` + tokens/componentes existentes).

### Inc 2a — Scraping de validados do nicho (∥ ao Inc 1)
**Objetivo:** banco de criativos vencedores do nicho da empresa, auto-surfaced (estilo Spyglass).
- Skill **`pesquisar-criativos`** → keywords do nicho (do `EMPRESA.md`) → **Apify (Ad Library actor)** → baixa criativos → calcula **score composto (decisão "forte")**: faixa de impressões (novo 2026) + **engajamento do post scrapeado** (likes/comentários/shares) + longevidade (dias no ar) + nº de variações ativas. (EU/DSA reach/demografia = enriquecimento opcional onde houver presença EU.)
- Grava `contexto/ativos/swipe/<nicho>/` (criativos + `index.json` ordenado por score).
- UX: galeria/swipe file ordenada por score; framing "ele rola por você, de manhã os vencedores estão lá".
- **Spyglass = referência, não integração.** Produzimos resultado similar com fonte própria (Ad Library via Apify).

### Inc 2b — Top performers da própria conta
**Objetivo:** ranquear teus criativos vencedores por performance REAL.
- Lê `insights.json` (Inc 1) → rankeia ads ativos por ROAS/CPA/hook rate → view "vencedores" (outlier-vs-baseline real, não proxy).
- Depende do Inc 1.

### Inc 2c — Variações on-brand
**Objetivo:** `criar-criativo` gera variações a partir de uma referência vencedora.
- Estende `criar-criativo` com modo **"variação a partir de referência"**: aceita um criativo do swipe bank (2a) OU um top-performer da conta (2b).
- Pipeline: agente **analisa a estrutura** (hook/layout/ângulo/oferta) — NÃO copia pixel → gera conceito on-brand (paleta/voz/logo via `contexto/DESIGN.md`+`VOZ.md`) → **Gemini (img2img/reference-conditioned)** → `checar-marca` → sai 1:1 + 9:16 → aparece inline (mágica da v1).
- Depende de 2a/2b (precisa de referências).

## 4. Decisões travadas (log)

| # | Decisão | Razão |
|---|---|---|
| D1 | Posicionamento: gestão p/ agência de lançamento de infoproduto | Foco do Yuri; enxugar pro que faz diferença |
| D2 | Inc 0 = flag reversível (não deletar) | "possibilidade de voltar mais pra frente" |
| D3 | Caminho Meta = A (MCP oficial + near-live, file-based) | Menor setup pro leigo; "colar token" exige Developer App (inviável); local-first |
| D4 | Read-only no MVP | MCP oficial faz write/gasta budget; segurança |
| D5 | Validação de criativo de nicho = score composto FORTE | Yuri quer resultado similar ao Spyglass; impressões 2026 + engajamento scrapeado viável |
| D6 | "Variação" = reverse-engineering da estrutura, nunca cópia pixel | Anti-plágio + on-brand |
| D7 | Scraping via Apify (já temos acesso) | Reuso; actors lidam com engajamento + ToS |
| D8 | Spyglass = referência, não integração | Sem API pública; replicamos o resultado |
| D9 | Layout do dashboard via companion + design system existente | Decisão do Yuri |

## 5. Schemas de arquivo (contrato)

**`operacao/<slug>/meta/insights.json`** (snapshot near-live):
```json
{
  "synced_at": "2026-06-01T12:00:00Z",
  "account_id": "act_...",
  "campaign": { "name": "...", "spend": 0, "results": 0, "cpa": 0, "roas": 0, "revenue": 0 },
  "funnel": { "hook_rate": 0.0, "hold_rate": 0.0, "ctr_outbound": 0.0 },
  "margin": 0.9,
  "breakeven_roas": 1.11,
  "ads": [ { "ad_id": "...", "name": "...", "thumb": "...", "spend": 0, "hook_rate": 0.0, "ctr": 0.0, "cpa": 0, "roas": 0 } ],
  "period": { "since": "...", "until": "..." }
}
```

**`operacao/<slug>/meta/link.json`**:
```json
{ "account_id": "act_...", "meta_campaign_ids": ["..."], "linked_at": "...", "match_confidence": "auto|manual" }
```

**`contexto/ativos/swipe/<nicho>/index.json`**:
```json
{
  "nicho": "...",
  "updated_at": "...",
  "source": "apify:ad-library",
  "creatives": [
    { "ad_id": "...", "advertiser": "...", "file": "<ad_id>.jpg", "format": "1:1|9:16|video",
      "score": 0.0,
      "signals": { "impressions_bucket": "...", "engagement": 0, "days_active": 0, "variations": 0 },
      "ad_url": "...", "first_seen": "...", "landing": "..." }
  ]
}
```

## 6. Fora de escopo (YAGNI / depois)
- Write na Meta (criar/pausar campanha) — read-only no MVP.
- Developer App próprio + App Review (dashboard live-de-verdade) — upgrade futuro.
- Outras plataformas (TikTok/Google) — só Meta agora.
- Voltar tarefas/posts/Notion/Canva — flag existe, mas fora deste ciclo.
- EU/DSA reach/demografia — enriquecimento opcional, não bloqueia o MVP do 2a.

## 7. Itens abertos (resolver na implementação)
- Layout do dashboard → **companion visual** (passo pré-Inc 1).
- Cadência de auto-refresh (default 30 min; confirmar na prática).
- Tool exato do MCP oficial pra cada métrica (validar nomes ao conectar de verdade).
- Actor Apify específico + custo por puxada de nicho (validar no Inc 2a).

## 8. Próximos passos
1. Companion visual do layout do dashboard (design system existente).
2. writing-plans por track, na ordem: Inc 0 → Inc 1 ∥ Inc 2a → Inc 2b → Inc 2c.
3. Cada plano → implementação → `/codex review` (gate fixo) → QA visual → release.
