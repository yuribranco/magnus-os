# magnus-os — Kit Magnus de Operação Autônoma

## Missão
Sistema operacional do operador Magnus dentro do Claude Code.
Todo processo repetitivo do negócio vira skill. Todo dado externo vira MCP.
Toda decisão complexa vira coordenador-magnus despachando pros specialists.

## Stack
- Claude Code (Desktop default; Warp/CLI opcional)
- Output style: Magnus (ativado na Aula 3)
- Idioma default: Português Brasil
- MCPs ativos: ver `.mcp.json` (ativados na Aula 2)
- Skills ativas: ver `.claude/skills/`
- Subagentes ativos: ver `.claude/agents/` (criados na Aula 3)

## Critical Files (LEITURA OBRIGATÓRIA antes de gerar qualquer output)

**Toda skill que produz conteúdo (copy, análise, briefing, headline, debriefing) DEVE ler estes arquivos antes de gerar output. Sem isso, a skill produz output genérico, não calibrado pro negócio.**

- `@business-brain.md` — DNA do negócio. Skills consultam pra:
  - **ICP**: pra direcionar copy / análise pro público certo
  - **Ofertas**: pra contextualizar produto + ticket + diferencial
  - **Voice (3 sempre + 3 nunca)**: pra calibrar tom de qualquer texto gerado
  - **Regra-âncora**: pra respeitar o axioma do negócio (ex: "sempre Schwartz", "sempre 1 CTA único")
- `@learnings.md` — lições acumuladas (preenchido via hook na Aula 3)

## Operating Rules
1. **Schwartz First.** Toda copy declara awareness level (1–5) e
   sophistication level (1–5) em comment no topo.
2. **Implementation-ready over memos.** Em dúvida entre estratégia
   e entregável, entregue o entregável.
3. **Cite a fonte.** Ao usar dados externos (Web, MCP), liste URL/fonte
   no rodapé.
4. **Voice:** direto, sem enrolação, sem superlativo vazio.
   Lê como o operador Magnus dono do negócio escrevendo.
5. **Never push --force a main, never delete .env, never commit secrets.**

## Skill Index (top-level)
- `/competitive-scraping <url>` — análise de concorrente com lente Magnus
- `/ba` — Breakthrough Advertising (Eugene Schwartz): diagnostica + escreve copy de qualquer formato (headline, VSL, página, email, ad) usando 3 perguntas: mass desire + awareness + sophistication
- `/schwartz-headline` — atalho pra gerar variações de headline nos 5 níveis de awareness
- `/briefing-avatar` — briefing de avatar pelo método Magnus

## Workflow Pattern (pra qualquer pedido não-trivial)
Research → Plan → Execute → Review → Ship
- Research: bdr-researcher (Aula 3) ou skill específica
- Plan: coordenador-magnus (Aula 3) decompõe e despacha
- Execute: skill apropriada
- Review: qa-reviewer (Aula 3) adversarial
- Ship: deliverable em `clients/<slug>/deliverables/`
