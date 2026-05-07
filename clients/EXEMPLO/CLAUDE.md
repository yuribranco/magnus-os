# Cliente — [NOME DO CLIENTE/PROJETO]

## Sobre
Pasta dedicada pra trabalho desse cliente/projeto específico.
Quando Claude opera arquivos dentro desta pasta, lê este CLAUDE.md
em adição ao CLAUDE.md raiz do magnus-os (lazy load).

## Contexto
- ICP específico: [se diferente do business-brain.md]
- Oferta atual: [oferta principal sendo trabalhada]
- Estágio: [planejamento / execução / pós-lançamento]
- Playbook: [FOMO / Meteórico / Transition / Low-Ticket]

## Regras específicas (override do CLAUDE.md raiz)
[Se tiver alguma regra diferente do default Magnus pra esse cliente.
Ex: "Cliente é B2B SaaS — ignorar regras de info-product".
Senão, deixe vazio.]

## Arquivos importantes
- `brief.md` — briefing completo do cliente
- `research/` — pesquisas de avatar, concorrente, mercado
- `deliverables/` — output final (copy, planejamento, debriefing)
- `learnings.md` — lições específicas desse cliente

## Como duplicar essa pasta pra um cliente novo
```bash
cp -r clients/EXEMPLO clients/<seu-cliente>
# depois edita CLAUDE.md e brief.md desse cliente
```
