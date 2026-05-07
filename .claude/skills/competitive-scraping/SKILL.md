---
name: competitive-scraping
description: Realiza análise profunda de site concorrente cobrindo positioning, value proposition, pricing tiers, sinais de ICP, ângulos de copy, framework Schwartz e gaps a explorar. Use sempre que o usuário mencionar análise de concorrente, teardown competitivo, inteligência de mercado, comparativo, ou colar URL de concorrente — mesmo que não peça explicitamente análise.
allowed-tools: WebFetch, WebSearch, Read, Write
---

# Competitive Scraping (Lente Magnus)

Quando o usuário fornece URL de concorrente ou pede análise competitiva:

## Passo 1 — Coleta

1. Faça WebFetch da URL fornecida (homepage)
2. **Se WebFetch retornar shell JS vazio ou conteúdo mínimo** (sinal de SPA pesado em JS — comum em sites React/Next/Vue: Stripe, Notion, Linear, Vercel, Duolingo, etc), **caia no fallback:**
   - Use `WebSearch` pra coletar copy real do site via cache + snippets indexados
   - Procure por: `"<nome do produto>" site:wikipedia.org`, `"<produto>" pricing`, `"<produto>" review`, `"<produto>" features`
   - Reconstrua positioning a partir desses fragmentos
   - **Avise no output que usou fallback** (transparência: "⚠️ Site é SPA — análise reconstruída via WebSearch")
3. Se possível, busque também: página de pricing, página "sobre", 1 post de blog recente
4. Extraia: H1, subhead, CTA primário, social proof visível, preços visíveis

**Nota pra Aula 2:** Esta skill será upgradada com Scrapling (engine de scraping JS-aware com anti-bot) que resolve sites SPA nativamente, sem precisar de WebSearch fallback.

## Passo 2 — Análise Schwartz

Aplique o framework de Eugene Schwartz:

- **Awareness level (1–5):** unaware, problem-aware, solution-aware, product-aware, most-aware
- **Sophistication level (1–5):** virgem, 1 competidor, saturado de claims, cético do mecanismo, exausto

Justifique cada classificação em 1 frase com evidência do site.

## Passo 3 — Mapping competitivo

Identifique:

- **Positioning:** 1 frase no formato "[produto] é o [categoria] para [ICP] que [pain]"
- **Mecanismo único:** o "como diferente" que eles afirmam (se existe)
- **Pricing/oferta:** estrutura, ancoragem, garantias, bônus
- **Copy angles em uso:** 3 maiores ângulos identificados
- **CTA primário:** texto + posição na página
- **Posição no funil:** top / mid / bottom
- **Tom emocional dominante:** medo / aspiração / urgência / status
- **3 palavras-chave repetidas no hero:** [extrair as mais frequentes]

## Passo 4 — Gaps Magnus

Identifique 3 gaps que o operador Magnus pode explorar:

1. [Algo que o concorrente NÃO está fazendo bem]
2. [Algo que o concorrente NÃO está dizendo]
3. [Algo que o concorrente está fazendo MAL]

## Output (sempre nesse formato)

```markdown
# Análise Concorrente — [Nome do Concorrente]
URL: [url]
Data: [YYYY-MM-DD]
Método de coleta: [WebFetch direto / WebSearch fallback (SPA detectado)]

## Positioning
- One-liner: ...
- Categoria: ...
- ICP: ...
- Mecanismo único: ...

## Schwartz Frame
- Awareness level: X/5 — [justificativa]
- Sophistication level: Y/5 — [justificativa]

## Pricing & Oferta
- ...

## Copy Angles
1. ...
2. ...
3. ...

## CTA Primário
- Texto: "..."
- Posição: ...

## Posição no Funil
- ... (top / mid / bottom)

## Tom Emocional Dominante
- ... (medo / aspiração / urgência / status / outro)

## 3 Palavras-Chave Repetidas no Hero
- ...
- ...
- ...

## Gaps Magnus pra Explorar
1. ...
2. ...
3. ...
```

Se método foi `WebSearch fallback`, adicione no fim do output:

```markdown
---
⚠️ **Limitação de coleta:** Site é SPA pesado em JS — WebFetch retornou
shell vazio. Análise reconstruída via WebSearch (cache + snippets
indexados). Confiabilidade: média. Pra análise definitiva, considere
revisitar com Scrapling (Aula 2) ou abrir a página manualmente e
colar trecho relevante de copy.
```

Sempre salve o output em `clients/<slug>/research/YYYY-MM-DD-concorrente-<nome>.md`
se o usuário tiver definido um cliente ativo. Se não tiver, salve em
`clients/EXEMPLO/research/`.
