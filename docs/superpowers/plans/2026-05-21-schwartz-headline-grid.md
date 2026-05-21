# /schwartz-headline v2 (grid 5×4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current 5-headline `/schwartz-headline` skill with a v2 that generates a 20-headline grid (5 awareness × 4 leads: Promise, Problem-Solution, Big-Secret, Story), calibrated by `business-brain.md`.

**Architecture:** Autonomous skill (does NOT invoke `/ba` or any other skill). Two files: rewritten `SKILL.md` + new `lead-types.md` extracted ONCE from `~/Downloads/breakthrough-advertising.pdf`. The lead taxonomy is the only new reference material; awareness × sophistication knowledge is already in the model via `/ba`.

**Tech Stack:** Markdown skill files (`.claude/skills/schwartz-headline/`). PDF extraction via `pdftotext` (already installed at `/opt/homebrew/bin/pdftotext`). No code dependencies, no test framework — verification is via manual smoke-test invocation.

**Spec:** `docs/superpowers/specs/2026-05-21-schwartz-headline-grid-design.md` (commit `313ce68`)

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `.claude/skills/schwartz-headline/SKILL.md` | **Overwrite** | Main skill entry: frontmatter + runtime flow + output template |
| `.claude/skills/schwartz-headline/lead-types.md` | **Create** | Schwartz's 4 leads (Promise / Problem-Solution / Big-Secret / Story) with verbatim quotes, structure, examples, traps, plus Lead×Awareness cheat sheet |
| `CLAUDE.md` (project root) | **Modify** | Update the skill index line for `/schwartz-headline` to reflect v2 |
| `/tmp/ba-extract.txt` | **Create (temp)** | Raw `pdftotext` output of relevant PDF pages, used only during Task 2-3, deleted at end |

**Note:** TDD doesn't cleanly apply — these are prompt/config files, not executable code. Verification is via Task 7 smoke test (manual invocation of the skill and structural check of output).

---

## Task 1: Extract raw text from the PDF

**Files:**
- Read: `~/Downloads/breakthrough-advertising.pdf` (~400 pages, 2.5MB)
- Create (temp): `/tmp/ba-toc.txt`, `/tmp/ba-extract.txt`

**Why first:** Everything downstream depends on having the leads chapter text available. Doing this once and writing to a temp file avoids re-extracting and keeps token cost down.

- [ ] **Step 1: Convert the full PDF to text**

```bash
pdftotext -layout ~/Downloads/breakthrough-advertising.pdf /tmp/ba-full.txt
wc -l /tmp/ba-full.txt
```

Expected: produces `/tmp/ba-full.txt`, line count likely between 8000–15000.

- [ ] **Step 2: Locate the leads chapter heading(s)**

Schwartz's terminology varies — search for likely terms:

```bash
grep -in -E "lead|opening|how to write the lead|construct.*lead|begin.*ad|approach" /tmp/ba-full.txt | head -30
```

Look for chapter-heading lines (often ALL CAPS or with chapter numbers). Schwartz's leads material is typically in Part II, around chapters titled "How to Construct the Lead of Your Ad" / "Six Basic Leads" / similar. Note the line numbers of:
- Chapter heading where leads section starts
- Chapter heading where it ends (i.e., the next chapter after leads)

- [ ] **Step 3: Slice the leads section into a focused extract**

Using the line numbers from Step 2 (call them `START` and `END`):

```bash
sed -n "${START},${END}p" /tmp/ba-full.txt > /tmp/ba-extract.txt
wc -l /tmp/ba-extract.txt
```

Expected: ~500–2000 lines of focused content covering the leads taxonomy.

If the extract looks wrong (too short / too long / wrong topic), repeat Step 2 with different search terms and adjust the line range.

- [ ] **Step 4: Spot-check the extract**

```bash
head -50 /tmp/ba-extract.txt
echo "---"
grep -in -E "promise|problem|secret|story|proclamation|offer" /tmp/ba-extract.txt | head -20
```

Expected: head shows the chapter heading. Grep shows lines that mention the 6 lead types (we need at least 4: Promise, Problem-Solution, Big-Secret, Story).

If any of the 4 target leads is missing from the extract, expand the line range and re-slice.

---

## Task 2: Read the focused extract via the Read tool

**Files:**
- Read: `/tmp/ba-extract.txt` (the slice from Task 1)

**Why separate from Task 1:** Task 1 prepares the slice via Bash. This task brings the slice into the model's context for processing. Separating them lets us iterate on the slice without re-reading every time.

- [ ] **Step 1: Read the extract**

Use the `Read` tool on `/tmp/ba-extract.txt`. If the file is > 2000 lines, read in chunks. Identify, for each of the 4 target leads (Promise, Problem-Solution, Big-Secret, Story):

1. The verbatim definition Schwartz gives
2. At least one verbatim example headline/lead Schwartz cites
3. Guidance on when each lead works best (awareness level alignment)
4. Common traps Schwartz calls out

If any of the 4 leads has incomplete material in the extract, expand the slice in Task 1 (re-run sed with a wider range) and re-read.

- [ ] **Step 2: Decide page citations**

For each verbatim quote you'll include in `lead-types.md`, identify the chapter number Schwartz assigns. Use grep against `/tmp/ba-full.txt` if needed:

```bash
grep -in -B2 "<short distinctive quote>" /tmp/ba-full.txt | head -10
```

Note the chapter for each lead's defining quote. These citations go into `lead-types.md` for traceability.

---

## Task 3: Write `lead-types.md`

**Files:**
- Create: `.claude/skills/schwartz-headline/lead-types.md`

- [ ] **Step 1: Create the file with this exact structure**

Write the file with the following content. Replace `[…]` placeholders with the verbatim material gathered in Task 2. Every quote must be marked with chapter cite. Do NOT paraphrase — if Schwartz didn't say it, don't put it in quotes.

```markdown
# Lead Types — Eugene Schwartz, *Breakthrough Advertising*

The 4 lead types this skill covers, in the order they appear in the grid output.

Source: `~/Downloads/breakthrough-advertising.pdf` — chapters cited inline below.

---

## 1. Promise Lead

- **Verbatim Schwartz (Ch. <N>):** "[verbatim quote defining the Promise/Benefit Lead]"
- **Quando usar:** Mercados Solution-aware, Product-aware e Most-aware, onde o leitor já reconhece a categoria de solução e responde a uma promessa clara e mensurável.
- **Estrutura:** `[Benefício específico]` em `[tempo / condição]` `[sem obstáculo conhecido]`.
- **Exemplo do livro (Ch. <N>):** "[exemplo verbatim de Schwartz]"
- **O que evitar:**
  - Promise vazia sem mecanismo em mercado Stage 3–5 (saturado). Schwartz: o claim sozinho perde força conforme a sofisticação sobe.
  - Promise em Unaware (não sabem o que prometer pra eles).

---

## 2. Problem-Solution Lead

- **Verbatim Schwartz (Ch. <N>):** "[verbatim quote defining the Problem-Solution Lead]"
- **Quando usar:** Mercados Problem-aware (lead clássico): dramatize o problema → cristalize → prometa a solução. Também funciona em Unaware se a dor for amplamente sentida mas não-nomeada.
- **Estrutura:** Abre nomeando ou dramatizando o problema → intensifica a dor → vira pra solução (sem ainda nomear produto).
- **Exemplo do livro (Ch. <N>):** "[exemplo verbatim]"
- **O que evitar:**
  - Pular pro produto antes de dramatizar o problema.
  - Usar em Most-aware (já decidiram comprar — drama do problema os atrasa).

---

## 3. Big-Secret Lead

- **Verbatim Schwartz (Ch. <N>):** "[verbatim quote defining the Big-Secret / Curiosity Lead]"
- **Quando usar:** Mercados Solution-aware e Product-aware sofisticados (Stage 3–5), onde claims diretos já não furam — o segredo/mecanismo novo restaura a credibilidade.
- **Estrutura:** Provoca curiosidade nomeando algo desconhecido (segredo, descoberta, mecanismo escondido) → conecta esse algo ao benefício esperado pelo prospect.
- **Exemplo do livro (Ch. <N>):** "[exemplo verbatim]"
- **O que evitar:**
  - Segredo sem mecanismo concreto e testável — vira clickbait e Schwartz é explícito que clickbait sem entrega aniquila trust.
  - Usar em Unaware (não dá pra prometer segredo de algo que o leitor não sabe que existe).

---

## 4. Story Lead

- **Verbatim Schwartz (Ch. <N>):** "[verbatim quote defining the Story Lead]"
- **Quando usar:** Unaware e Problem-aware. A história funciona como camouflage (uma das 7 técnicas de body copy): o leitor consome a narrativa antes de perceber que é venda.
- **Estrutura:** Personagem específico → situação concreta → virada / descoberta → ponte pro leitor.
- **Exemplo do livro (Ch. <N>):** "[exemplo verbatim]"
- **O que evitar:**
  - History sem virada — vira diário, não vende.
  - Usar em Most-aware (eles querem oferta agora, não warm-up).

---

## Cruzamento Lead × Awareness (cheat sheet usado pela skill em runtime)

| Lead | Awareness onde brilha | Awareness onde falha |
|---|---|---|
| Promise          | Solution / Product / Most         | Unaware |
| Problem-Solution | Problem-aware                     | Most-aware |
| Big-Secret       | Solution / Product (sofisticado)  | Unaware |
| Story            | Unaware / Problem-aware           | Most-aware |

A skill usa essa tabela em runtime pra marcar "cells forçadas" — combinações `awareness × lead` que estão na coluna "falha". Essas cells ainda são geradas (pra completar o grid 5×4), mas a skill sinaliza no rodapé que aquela combinação é não-natural e deve ser usada com cautela.
```

- [ ] **Step 2: Verify the file is well-formed**

```bash
wc -l .claude/skills/schwartz-headline/lead-types.md
grep -c "^## " .claude/skills/schwartz-headline/lead-types.md
```

Expected: between 60–150 lines. The `grep` should return at least 5 (4 lead sections + cheat sheet section).

- [ ] **Step 3: Verify no `[…]` placeholders remain**

```bash
grep -n '\[…\]\|\[verbatim\|\[exemplo verbatim\]\|<N>' .claude/skills/schwartz-headline/lead-types.md
```

Expected: NO matches. Every `[verbatim quote]`, `[exemplo verbatim]`, and `<N>` chapter placeholder must have been replaced with actual Schwartz text. If grep returns matches, go back to Task 2 to gather the missing material.

---

## Task 4: Write the new `SKILL.md` (overwrite v1)

**Files:**
- Overwrite: `.claude/skills/schwartz-headline/SKILL.md`

- [ ] **Step 1: Save the current SKILL.md to /tmp as backup**

```bash
cp .claude/skills/schwartz-headline/SKILL.md /tmp/schwartz-headline-v1-backup.md
```

(Defensive — lets us diff against v1 if anything goes wrong.)

- [ ] **Step 2: Write the new SKILL.md with this exact content**

```markdown
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
```

- [ ] **Step 3: Verify no placeholders remain in the new SKILL.md**

```bash
grep -n 'TBD\|TODO\|FIXME\|\[…\]\|<N>' .claude/skills/schwartz-headline/SKILL.md
```

Expected: NO matches. (Note: the `[headline]` etc. inside the Output block are intentional — they're the template the skill fills at runtime, not spec placeholders.)

- [ ] **Step 4: Diff against the backup to confirm meaningful change**

```bash
diff /tmp/schwartz-headline-v1-backup.md .claude/skills/schwartz-headline/SKILL.md | wc -l
```

Expected: large diff (>100 lines changed), confirming overwrite worked.

---

## Task 5: Update `CLAUDE.md` skill index

**Files:**
- Modify: `CLAUDE.md` (project root, line ~46)

- [ ] **Step 1: Locate the current line**

```bash
grep -n "schwartz-headline" CLAUDE.md
```

Expected: returns one line, around line 46, currently reading:

```
- `/schwartz-headline` — atalho pra gerar variações de headline nos 5 níveis de awareness
```

- [ ] **Step 2: Replace via Edit tool**

Use the `Edit` tool to replace:

```
- `/schwartz-headline` — atalho pra gerar variações de headline nos 5 níveis de awareness
```

with:

```
- `/schwartz-headline` — gera 20 headlines em grid 5×4 (5 awareness × 4 leads: Promise, Problem-Solution, Big-Secret, Story); calibrado por business-brain.md
```

- [ ] **Step 3: Verify the change**

```bash
grep -n "schwartz-headline" CLAUDE.md
```

Expected: returns one line with the new description containing "grid 5×4" and "4 leads".

---

## Task 6: Clean up temp files

**Files:**
- Delete: `/tmp/ba-full.txt`, `/tmp/ba-extract.txt`, `/tmp/schwartz-headline-v1-backup.md`

- [ ] **Step 1: Remove the temp files**

```bash
rm -f /tmp/ba-full.txt /tmp/ba-extract.txt /tmp/schwartz-headline-v1-backup.md
ls /tmp/ba-*.txt /tmp/schwartz-headline-v1-backup.md 2>&1 | head -5
```

Expected: `ls` returns "No such file or directory" for all three.

---

## Task 7: Smoke test (manual invocation)

**Files:**
- None modified. Invocation only.

**Why manual:** This skill is a prompt, not code. There's no automated test runner. The verification is: invoke the skill in a fresh conversation and check that the output matches the expected structure.

- [ ] **Step 1: Document the smoke-test recipe (for the user to run manually)**

In a new Claude Code conversation, the user invokes:

```
/schwartz-headline
```

with `business-brain.md` either filled or with placeholders (test both paths).

- [ ] **Step 2: Verify output structure (checklist for human reviewer)**

The output must contain:

- [ ] HTML comment at top with `Sophistication global: N/5`
- [ ] `## Mass desire` section with 1 sentence
- [ ] `## Sophistication global: X/5` section
- [ ] `## Voice aplicada` section with Sempre/Nunca bullets
- [ ] 5 awareness sections (`## Awareness 1` through `## Awareness 5`) — each with a "Tarefa:" line
- [ ] Each awareness section has exactly 4 bulleted leads (Promise, Problem-Solution, Big-Secret, Story)
- [ ] `## ⚠️ Cells forçadas` section listing the non-natural combinations
- [ ] `## ▶ Recomendação pra começar` with 1 specific headline + reasoning
- [ ] `## A/B sugerido` with 1 contrast headline + reasoning
- [ ] Source line at bottom citing Schwartz + lead-types.md

Total headline count: **exactly 20** (5 awareness × 4 leads).

- [ ] **Step 3: If output is malformed, iterate**

If any structural item is missing or there are more/fewer than 20 headlines:
1. Identify which Passo of the skill produced the bad section.
2. Tighten the wording of that Passo in `SKILL.md`.
3. Re-test.

(This step is reactive — only execute if Step 2 fails.)

---

## Task 8: Commit everything

**Files:**
- Stage: `.claude/skills/schwartz-headline/SKILL.md`, `.claude/skills/schwartz-headline/lead-types.md`, `CLAUDE.md`

- [ ] **Step 1: Check git status**

```bash
git status
```

Expected: shows 2 modified (SKILL.md, CLAUDE.md) and 1 untracked (lead-types.md) within `.claude/skills/schwartz-headline/`. No other unintended changes.

- [ ] **Step 2: Stage the three files explicitly**

```bash
git add .claude/skills/schwartz-headline/SKILL.md .claude/skills/schwartz-headline/lead-types.md CLAUDE.md
git status
```

Expected: 3 files staged, none untracked from this change.

(Do NOT use `git add .` or `git add -A` — the `superpowers-marketplace/` clone in the project root is untracked and unrelated; we don't want to commit it accidentally.)

- [ ] **Step 3: Commit with conventional message**

```bash
git commit -m "$(cat <<'EOF'
feat(skills): /schwartz-headline v2 — grid 5×4 (5 awareness × 4 leads)

Substitui a skill anterior de 5 headlines pelo grid completo de 20 (5
awareness levels × 4 leads do Schwartz: Promise, Problem-Solution, Big-Secret,
Story). Skill é autônoma — não invoca /ba. Lê business-brain ou pergunta
fallback de 3 itens. Adiciona lead-types.md com citações verbatim do livro.

Spec: docs/superpowers/specs/2026-05-21-schwartz-headline-grid-design.md
Plan: docs/superpowers/plans/2026-05-21-schwartz-headline-grid.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Verify commit landed**

```bash
git log -1 --stat
```

Expected: latest commit shows the 3 files changed, message matches the heredoc above.

---

## Self-review checklist (run after writing all tasks, before handoff)

- [ ] Every section of the spec maps to at least one task:
  - Architecture (autonomous, 2 files) → Tasks 3, 4
  - Runtime flow (Passos 0–4) → Task 4 (content of SKILL.md)
  - Output template → Task 4
  - `lead-types.md` content → Tasks 1, 2, 3
  - Edge cases → Task 4 (Edge cases section in SKILL.md)
  - Migration plan → Tasks 4, 5
  - Definition of done → Task 7 smoke test

- [ ] No "TBD" / "TODO" / "implement later" anywhere in this plan
- [ ] Every file path is exact and absolute-or-relative-to-repo-root
- [ ] Every command has expected output documented
- [ ] Frontmatter / file content is shown verbatim where the engineer writes it
- [ ] No references to skills, types, or methods undefined here
- [ ] Tasks are ordered so each one's prerequisites are completed by the prior task

If gaps surface during execution, add them to the plan rather than improvising.
