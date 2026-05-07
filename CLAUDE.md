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

## Critical Files (sempre ler antes de gerar conteúdo)
- `@business-brain.md` — DNA do negócio (ICP, ofertas, voice, regra-âncora)
- `@learnings.md` — lições acumuladas (autocompleta via hook na Aula 3)

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
- `/schwartz-headline` — gera headlines nos 5 níveis × 5 sofisticação
- `/magnus-playbook-router` — sugere playbook pro cenário
- `/briefing-avatar` — briefing de avatar pelo método Magnus

## Workflow Pattern (pra qualquer pedido não-trivial)
Research → Plan → Execute → Review → Ship
- Research: bdr-researcher (Aula 3) ou skill específica
- Plan: coordenador-magnus (Aula 3) decompõe e despacha
- Execute: skill apropriada
- Review: qa-reviewer (Aula 3) adversarial
- Ship: deliverable em `clients/<slug>/deliverables/`
