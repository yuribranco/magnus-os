# Design Spec — `/schwartz-headline` v2 (grid 5×4)

**Date:** 2026-05-21
**Status:** Approved (brainstorming concluded with user)
**Author:** Claude + Yuri (via `/superpowers:brainstorming`)
**Supersedes:** existing `/schwartz-headline` skill (5-headline shortcut)

---

## Goal

Produce a Claude Code skill that generates **20 headlines** for the user's main product, arranged in a **5 awareness × 4 leads grid**, calibrated by `business-brain.md`, applying Eugene Schwartz's *Breakthrough Advertising*.

The skill replaces the current `/schwartz-headline` (which generates only 5 headlines, one per awareness, with implicit lead).

## Non-goals

- Not a full BA diagnostic (`/ba` already covers that).
- Not a copy editor or rewriter for existing headlines.
- Not a body-copy or VSL generator.
- Not a multi-product batch generator (one offer per invocation).

---

## Scope of decisions captured during brainstorming

| Decision | Value |
|---|---|
| Skill name | `schwartz-headline` (keeps name, replaces content) |
| Grid size | 5 awareness × 4 leads = 20 headlines |
| Awareness levels | Unaware, Problem-aware, Solution-aware, Product-aware, Most-aware |
| Lead types | Promise, Problem-Solution, Big-Secret, Story (4 of Schwartz's 6) |
| Source of product context | `business-brain.md` first; interactive fallback if placeholders |
| Source of lead taxonomy | New file `lead-types.md` inside the skill dir, extracted ONCE from `~/Downloads/breakthrough-advertising.pdf` |
| Output structure | Sections per awareness, 4 leads listed under each |
| Output extras | Mass desire (top), sophistication global (top), final A/B recommendation (bottom) |
| Architecture | Autonomous skill (does NOT invoke `/ba` internally) |
| Migration | Overwrite current `SKILL.md`; add `lead-types.md`; update `CLAUDE.md` skill index line |

---

## Architecture

### File layout

```
.claude/skills/schwartz-headline/
├── SKILL.md             # main entry, self-contained
└── lead-types.md        # Schwartz's leads chapter, extracted ONCE from PDF
```

### Why autonomous (not orchestrator)

- `/ba` already exists as an interactive diagnostic skill. Trying to call it as a sub-routine creates coupling and would conflict with its interactive nature.
- The diagnostic knowledge (mass desire, awareness × sophistication, headline tasks per awareness) is already in the model's active knowledge from `/ba`. The skill calls on that knowledge inline.
- The only NEW piece of reference material this skill needs is the lead taxonomy → `lead-types.md`.
- Heavy modularity (multiple ref files like `/ba` has) is overkill for a single 20-cell grid.

---

## Runtime flow

```
1. Read business-brain.md
   ├── Has placeholders?     → step 2 (interactive fallback)
   └── Filled?               → step 3

2. Interactive fallback (only if business-brain incomplete)
   Ask ONE AT A TIME via AskUserQuestion:
   a. Product/offer (name, ticket, 1-sentence what-it-delivers)
   b. ICP in 1 sentence
   c. Voice: 1 thing ALWAYS, 1 thing NEVER

3. Read lead-types.md

4. Diagnostic (inline, no skill chaining)
   - Name the mass desire (1 sentence)
   - Calibrate sophistication global (1-5 with justification)
   - Note: awareness varies per row; sophistication is global

5. Generate 5 × 4 = 20 headlines
   For each cell, respect:
   - Awareness task (from internal /ba knowledge)
   - Lead structure (from lead-types.md)
   - Voice rules (business-brain SEMPRE / NUNCA)
   - Global sophistication calibration

6. Recommendation
   - Pick 1 cell to start (typically aligned with channel awareness)
   - Suggest 1 A/B pair (informative contrast, not random)

7. Emit output
```

---

## Output template

```markdown
<!-- Schwartz Headline Grid 5×4 | Sophistication global: X/5 -->

## Mass desire
[1 sentence — the pre-existing force ALL 20 headlines channel]

## Sophistication global: X/5
[1-2 sentences justifying: how many competitors make similar claims, how saturated]

## Voice aplicada (do business-brain)
- Sempre: [3 rules]
- Nunca: [3 rules]

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
- [list forced combinations the skill produced anyway, with caveat]

## ▶ Recomendação pra começar
**Use:** [Awareness X + Lead Y] = "[headline]"
**Por que:** [reasoning]

## A/B sugerido
**[Awareness X' + Lead Y']** = "[headline]"
**Por que comparar:** [insight the test will reveal]

---
*Source: Schwartz, Breakthrough Advertising. Leads extracted from `lead-types.md` (Part II of the book). Awareness/sophistication from internal /ba knowledge.*
```

---

## `lead-types.md` content spec

Extracted ONCE from `~/Downloads/breakthrough-advertising.pdf` (Part II, chapters on Headline Approaches / Writing the Lead, approx. chapters 10–12). Extraction is manual setup, NOT a runtime step.

For each of the 4 leads:

```markdown
## N. <Lead name>
- **Verbatim Schwartz:** [literal quote from PDF with chapter cite]
- **Quando usar:** [summary + awareness levels where it works]
- **Estrutura:** [typical form — e.g., "[Benefit] in [time] without [obstacle]"]
- **Exemplo do livro:** [verbatim Schwartz example]
- **O que evitar:** [traps — e.g., promise with no mechanism in sophisticated market]
```

Plus a cheat-sheet table at the bottom:

```markdown
## Cruzamento Lead × Awareness
| Lead | Awareness onde brilha | Awareness onde falha |
|---|---|---|
| Promise          | Solution / Product / Most | Unaware |
| Problem-Solution | Problem-aware             | Most-aware |
| Big-Secret       | Solution / Product (mercado sofisticado) | Unaware |
| Story            | Unaware / Problem-aware   | Most-aware |
```

The cheat-sheet is what the skill uses at runtime to label "cells forçadas" in the output.

### Extraction approach (implementation hint, not part of skill runtime)

To minimize tokens during extraction:
1. Try `pdftotext` or `pdfgrep` via Bash to locate the leads chapter heading.
2. Read only the relevant ~20 pages via `Read` with explicit page range.
3. Manually compose `lead-types.md` from the extracted text.

---

## SKILL.md frontmatter

```yaml
---
name: schwartz-headline
description: Gera 20 headlines em grid 5×4 (5 awareness levels × 4 leads: Promise, Problem-Solution, Big-Secret, Story) aplicando Eugene Schwartz. Lê business-brain.md pra calibrar ICP/voice/oferta; se brain vazio, pergunta o mínimo. Output inclui mass desire, sophistication global, e recomendação A/B. Use quando o usuário pedir headlines, variações de hook, lead, ou copy de topo de página/ad/email.
allowed-tools: Read, Write, AskUserQuestion
---
```

---

## Edge cases

| Situation | Behavior |
|---|---|
| `business-brain.md` missing | Skill warns + asks minimum (offer, ICP, voice always/never) inline |
| `business-brain.md` partially filled | Use what's there, ask only for the missing slots |
| User passes argument (e.g., `/schwartz-headline pro produto X`) | Argument overrides business-brain for that single run |
| `lead-types.md` missing in skill dir | Hard fail with message: "Run setup once to extract lead-types.md from PDF." Extraction is manual setup, not runtime. |
| Mass desire is a Force of Change (not Permanent) | Skill notes this under "Mass desire" — affects headline longevity |
| User asks for only one awareness OR only one lead | Skill skips grid, runs reduced scope (4 headlines or 5 headlines respectively) |
| Voice forbids common headline tropes (e.g., "descubra como...") | Skill respects bans; if a lead × awareness combo can ONLY be expressed via a banned trope, skill substitutes with a voice-compliant variant and notes the constraint |

---

## Migration plan (existing `/schwartz-headline`)

1. Overwrite `.claude/skills/schwartz-headline/SKILL.md` with the new content.
2. Add `.claude/skills/schwartz-headline/lead-types.md` (manually populated from PDF).
3. Update `CLAUDE.md` skill index line:
   - **Before:** `/schwartz-headline` — atalho pra gerar variações de headline nos 5 níveis de awareness
   - **After:** `/schwartz-headline` — gera 20 headlines em grid 5×4 (5 awareness × 4 leads: Promise, Problem-Solution, Big-Secret, Story)
4. No backwards compatibility shim. The new skill is the only one. Users who invoke `/schwartz-headline` get the v2 grid output.

---

## Open implementation questions (resolved during implementation, not now)

- Exact page range in PDF for leads chapter — to be located via `pdftotext`/`pdfgrep` during extraction.
- Wording of the 3 fallback questions when business-brain is empty — to be polished during implementation, draft is in the runtime flow above.
- Whether `lead-types.md` needs additional examples beyond Schwartz's own — defer to implementation; default is verbatim Schwartz only.

---

## Out of scope (explicitly NOT in this spec)

- Multi-product or multi-offer batch headline generation.
- Headline scoring or ranking by predicted CTR.
- Integration with external tools (Meta Ads Library, SimilarWeb, etc.).
- Auto-A/B test deployment (only suggests the pair; user runs the test).
- Body copy, VSL scripts, email sequences — those stay in `/ba`.
- Image/creative generation.

---

## Definition of done (for the eventual implementation)

The skill is "done" when:

1. `.claude/skills/schwartz-headline/SKILL.md` exists with the new content (overwriting v1).
2. `.claude/skills/schwartz-headline/lead-types.md` exists with the 4 leads documented (verbatim Schwartz citations + examples + cheat sheet).
3. `CLAUDE.md` skill index reflects the v2 description.
4. Invoking `/schwartz-headline` end-to-end (with a filled `business-brain.md`) produces the 20-headline grid output matching the template above.
5. Invoking `/schwartz-headline` with an empty `business-brain.md` triggers the interactive fallback (3 questions max) and then produces the grid.

---

## Next step (per `superpowers:brainstorming` flow)

Invoke `superpowers:writing-plans` to produce the implementation plan from this spec.

Do NOT invoke `/skill-creator:skill-creator` directly — the writing-plans skill decides whether and when to call it.
