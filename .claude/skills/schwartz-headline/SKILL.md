---
name: schwartz-headline
description: Gera 20 headlines em grid 5×4 (5 awareness levels × 4 leads: Promise, Problem-Solution, Big-Secret, Story) aplicando Eugene Schwartz. Lê business-brain.md pra calibrar ICP/voice/oferta; se brain vazio, pergunta o mínimo. Output inclui mass desire, sophistication global, e recomendação A/B. Use quando o usuário pedir headlines, variações de hook, lead, ou copy de topo de página/ad/email.
allowed-tools: Read, Write, AskUserQuestion
---

# Schwartz Headline Grid 5×4

Gera 20 headlines pro produto principal: 5 awareness levels × 4 leads do Schwartz.

## Passo 0 — Calibrar pelo negócio (OBRIGATÓRIO)

Lê `@business-brain.md` (raiz do projeto).

Se o brain está **preenchido** (sem placeholders tipo `[SEU NEGÓCIO AQUI]` ou `[Nome da oferta]`), extrai:
- **ICP** → headlines falam pra esse público
- **Top 3 ofertas** → identifica qual oferta esse grid serve (perguntar ao user se não óbvio)
- **Voice (3 sempre / 3 nunca)** → TODAS as 20 headlines devem respeitar
- **Regra-âncora** → ex: "declarar Schwartz no comment" → grid já faz isso

Se o brain tem **placeholders** ou não existe, pula pro Passo 0b.

## Passo 0b — Fallback interativo (só se brain incompleto)

Pergunta UMA por vez via AskUserQuestion:

1. **Oferta:** "Qual produto/oferta essas headlines vão servir? (nome + ticket + 1 frase do que entrega)"
2. **ICP:** "Quem é o público em 1 frase específica? (idade/gênero/contexto/dor)"
3. **Voice:** "Uma coisa que voice do negócio SEMPRE faz e uma que NUNCA faz?"

Não pergunta nada além disso. O resto sai do julgamento Schwartz.

## Passo 1 — Ler `lead-types.md`

Lê `@.claude/skills/schwartz-headline/lead-types.md`. Esse arquivo tem os 4 leads (Promise, Problem-Solution, Big-Secret, Story) com citações verbatim do Schwartz e o cheat sheet de Lead × Awareness.

## Passo 2 — Diagnóstico (inline, NÃO invoca /ba)

Baseado no contexto da oferta + ICP + mercado, decide:

1. **Mass desire (1 frase):** qual hope/fear/craving pré-existente o mercado já carrega? Schwartz: "advertising channels pre-existing mass desire, it doesn't create it."
2. **Sophistication global (1–5):** quantos competidores fazem claim parecido?
   - Stage 1: primeiro da categoria → claim direto basta
   - Stage 2: 2º/3º entrante → enlarge o claim
   - Stage 3: claims já familiares → mechanism novo
   - Stage 4: mecanismo virou commodity → enlarge mechanism / claim
   - Stage 5: exaustão completa → identification / story
3. (Awareness varia por linha do grid — não calibra global.)

## Passo 3 — Gerar o grid 5 × 4 = 20 headlines

Pra cada cell (awareness × lead), respeita 4 restrições simultâneas:

1. **Tarefa daquele awareness** (resumo abaixo)
2. **Estrutura do lead** (de `lead-types.md`)
3. **Voice do business-brain** (3 sempre / 3 nunca — qualquer headline que viole = REJEITAR e refazer)
4. **Sophistication global calibrada** no Passo 2

Tarefas por awareness (vem do conhecimento Schwartz interno):

| Awareness | Tarefa da headline |
|---|---|
| 1. Unaware | Identificação. NÃO menciona produto/preço/promessa direta. Eco de uma emoção ou atitude. |
| 2. Problem-aware | Nomeia a dor, cristaliza, depois promete a solução. |
| 3. Solution-aware | Apresenta a categoria de solução; NÃO nomeia o produto. |
| 4. Product-aware | Produto + superioridade (Stage 1–2) ou produto + mecanismo novo (Stage 3–4) ou identificação (Stage 5). |
| 5. Most-aware | Produto + oferta direta. Preço, bônus, urgência, garantia. |

Cells "forçadas" (lead-types.md cheat sheet diz que aquele lead falha naquele awareness) ainda são geradas — mas serão sinalizadas no rodapé do output.

## Passo 4 — Recomendação final

- **1 headline pra começar:** escolhe a cell que melhor casa com o canal mais comum do user (ex: page hero geralmente quer Solution-aware ou Product-aware; ad cold quer Problem-aware ou Unaware).
- **1 par A/B:** sugere contraste informativo. Exemplo: se recomendou Solution-aware + Promise, sugere testar contra Solution-aware + Big-Secret (revela se mercado é mais sofisticado do que assumido).

## Output (formato exato)

```
<!-- Schwartz Headline Grid 5×4 | Sophistication global: X/5 -->

## Mass desire
[1 frase — a força pré-existente que TODAS as 20 headlines canalizam]

## Sophistication global: X/5
[1-2 frases justificando: quantos competidores, quão saturada a categoria]

## Voice aplicada (do business-brain)
- Sempre: [3 regras]
- Nunca: [3 regras]

---

## Awareness 1 — Unaware
Tarefa: identificação (NÃO mencionar produto/preço/promessa direta)
- **Promise:** [headline]
- **Problem-Solution:** [headline]
- **Big-Secret:** [headline]
- **Story:** [headline]

## Awareness 2 — Problem-aware
Tarefa: nomear a dor + cristalizar + prometer solução
- **Promise:** [headline]
- **Problem-Solution:** [headline]
- **Big-Secret:** [headline]
- **Story:** [headline]

## Awareness 3 — Solution-aware
Tarefa: apresentar a categoria de solução (não o produto)
- **Promise:** [headline]
- **Problem-Solution:** [headline]
- **Big-Secret:** [headline]
- **Story:** [headline]

## Awareness 4 — Product-aware
Tarefa: produto + superioridade (ou mecanismo novo se mercado saturado)
- **Promise:** [headline]
- **Problem-Solution:** [headline]
- **Big-Secret:** [headline]
- **Story:** [headline]

## Awareness 5 — Most-aware
Tarefa: produto + oferta direta (preço, bônus, urgência)
- **Promise:** [headline]
- **Problem-Solution:** [headline]
- **Big-Secret:** [headline]
- **Story:** [headline]

---

## ⚠️ Cells forçadas (lead não-natural pra esse awareness)
[Lista apenas as cells onde lead-types.md cheat sheet marcou "falha". Ex:
- Awareness 1 × Promise: forçada (Unaware não sabe o que prometer)
- Awareness 5 × Story: forçada (Most-aware quer oferta, não warm-up)]

## ▶ Recomendação pra começar
**Use:** [Awareness X + Lead Y] = "[headline literal]"
**Por que:** [1-2 frases — geralmente: awareness mais comum do canal × lead que melhor respeita voice]

## A/B sugerido
**[Awareness X' + Lead Y']** = "[headline literal]"
**Por que comparar:** [1 frase — insight que esse teste vai revelar]

---
*Source: Schwartz, Breakthrough Advertising — leads do lead-types.md, awareness/sophistication interno.*
```

## Edge cases

- **business-brain.md ausente:** Passo 0b roda full (3 perguntas).
- **business-brain.md parcial:** Usa o que tem preenchido, Passo 0b roda só pros slots faltando.
- **User passa argumento (ex: `/schwartz-headline pra produto X`):** Argumento sobrescreve a oferta do brain pra esta run.
- **lead-types.md ausente na pasta da skill:** Falha hard com mensagem: "lead-types.md missing — rode a extração do PDF manualmente (vide plano em docs/superpowers/plans/2026-05-21-schwartz-headline-grid.md, Tasks 1-3)."
- **Mass desire é Force of Change (não Permanent):** Nota isso na seção "Mass desire" do output — afeta longevidade das headlines.
- **User pede só 1 awareness ou só 1 lead:** Ignora o grid, gera escopo reduzido (4 ou 5 headlines).
- **Voice proíbe trope necessário pra um lead × awareness:** Substitui por variante compatível com voice e nota a restrição.

## Source

Eugene M. Schwartz, *Breakthrough Advertising* (1966, Boardroom 2004). Leads extraídos do PDF em `~/Downloads/breakthrough-advertising.pdf` → `lead-types.md`. Awareness × sophistication frameworks também derivam do livro (já internalizados via `/ba`).
