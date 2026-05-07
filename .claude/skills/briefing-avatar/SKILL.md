---
name: briefing-avatar
description: Gera briefing completo de avatar usando método Magnus — dor, desejo, identidade atual, identidade aspiracional, objeções e gatilhos. Use quando o usuário pedir briefing de avatar, pesquisa de público, definição de ICP, ou descrever cenário "preciso entender melhor meu cliente". Sempre cita Schwartz awareness e sophistication do mercado.
allowed-tools: Read, Write, WebFetch
---

# Briefing de Avatar (Método Magnus)

Quando o usuário pede briefing de avatar ou pesquisa de público:

## Passo 1 — Coletar contexto

Antes de gerar, pergunte (se não dado):

- Produto / oferta principal
- Ticket
- Canal primário (Meta Ads, orgânico, indicação, etc)
- 1-2 clientes reais (perfil, dor, transformação alcançada)

Se aluno tem clientes documentados em `clients/<slug>/`, leia primeiro.
Lê também `business-brain.md` pra calibrar voice + ICP.

## Passo 2 — Gerar avatar pelo método Magnus

Estrutura obrigatória:

### Identidade atual
- Demografia (idade, gênero, geo, classe)
- Psicografia (auto-imagem, status percebido)
- Como ele se descreve hoje em 1 frase

### Dor (camada profunda)
- **Sintoma observável** — o que ele sente no dia a dia
- **Causa percebida** — o que ele acha que causa
- **Causa real** — o que de fato causa, pelo método Magnus
- **Custo da inação** — o que continua doendo se não resolver

### Desejo (camada profunda)
- **Resultado externo** — o que aparece pros outros
- **Resultado interno** — como ele se sente
- **Identidade aspiracional** — quem ele quer ser

### Objeções (top 5, ordem de força)
1. ...
2. ...
3. ...
4. ...
5. ...

### Gatilhos
- **Compra:** o que precisa acontecer pra ele decidir
- **Recusa:** o que faz ele desistir
- **Indicação:** quando ele indica pra alguém

### Schwartz Frame
- Awareness level desse avatar: X/5 — [justificativa]
- Sophistication level do mercado: Y/5 — [justificativa]
- Implicação prática: [como falar com esse avatar agora]

## Output

Salva em `clients/<slug>/research/avatar-YYYY-MM-DD.md` se cliente ativo.

```markdown
# Avatar — [Nome do Avatar]
Produto: [nome]
Data: [YYYY-MM-DD]

[estrutura completa acima]

---
Notas:
- Confiança da inferência: [alta / média / baixa]
- Validação recomendada: [pesquisa, entrevista, etc]
- Próximos passos: [como usar esse avatar pra criar copy/campanha]
```

(Esta skill será expandida na Aula 2 quando magnus-mentor MCP estiver
plugado — vai enriquecer o avatar consultando método Magnus.)
