---
name: magnus-playbook-router
description: Recebe contexto de produto, ticket, lista, prazo e recomenda qual playbook Magnus encaixa melhor (FOMO, Meteórico, Transition, Low-Ticket). Use quando o usuário perguntar "qual estratégia usar", "qual playbook", ou descrever um cenário de lançamento sem saber qual abordagem aplicar.
allowed-tools: Read
---

# Magnus Playbook Router

Quando usuário descreve cenário de lançamento ou pergunta qual playbook:

## Passo 1 — Coletar contexto

Pergunte (se não dado):

- Produto + descrição em 1 frase
- Ticket
- Tamanho da lista
- Nível de relacionamento da lista (fria / morna / quente)
- Prazo até o lançamento
- Oferta principal

## Passo 2 — Aplicar o decisor Magnus

| Playbook | Encaixa quando |
|---|---|
| **FOMO** | Ticket médio/alto, lista quente, prazo curto, urgência real |
| **Meteórico** | Produto novo, lista média, sem prazo apertado, foco em escala progressiva |
| **Transition** | Migração de produto, lista existente, mudança de oferta/preço/posicionamento |
| **Low-Ticket** | Ticket baixo, lista grande, conversão por volume, funil otimizado |

## Output

```markdown
## Recomendação de Playbook

**Playbook:** [nome]
**Razão:** [1-2 frases]

### Por que NÃO os outros
- **[outro playbook]:** por que não encaixa
- **[outro playbook]:** por que não encaixa
- **[outro playbook]:** por que não encaixa

### Próximos passos sugeridos
1. ...
2. ...
3. ...

### Sinais de alerta pra rever a escolha
- [Se X mudar, considere [outro playbook]]
- ...
```

(Esta skill será expandida na Aula 2 quando magnus-mentor MCP estiver
plugado — ela vai consultar o método Magnus diretamente.)
