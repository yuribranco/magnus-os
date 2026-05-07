---
name: briefing-avatar
description: Gera briefing completo de avatar usando método Magnus — dor, desejo, identidade atual, identidade aspiracional, objeções e gatilhos. Use quando o usuário pedir briefing de avatar, pesquisa de público, definição de ICP, ou descrever cenário "preciso entender melhor meu cliente". Sempre cita Schwartz awareness e sophistication do mercado.
allowed-tools: Read, Write, WebFetch
---

# Briefing de Avatar (Método Magnus)

Quando o usuário pede briefing de avatar ou pesquisa de público:

## Passo 0 — Calibrar pelo negócio (OBRIGATÓRIO)

Lê `@business-brain.md` (raiz do projeto). Extrai:
- **ICP** → ponto de partida do avatar. O avatar é uma versão personificada/aprofundada do ICP declarado.
- **Top 3 ofertas** → o avatar é específico pra qual oferta? (avatar de R$ 47 ≠ avatar de R$ 12.000)
- **Voice (sempre/nunca)** → as descrições do avatar (dor, desejo, identidade aspiracional) DEVEM ser escritas no tom de voice da empresa.
- **Regra-âncora** → estrutura do output respeita a regra principal.

Se algum slot do business-brain estiver com placeholder, peça pra preencher antes de gerar avatar — caso contrário, avatar sai genérico e desconectado do negócio real.

## Passo 1 — Coletar contexto adicional

Depois do Passo 0, pergunte (se não dado):

- Qual das 3 ofertas do business-brain este avatar atende?
- Canal primário (Meta Ads, orgânico, indicação, etc)
- 1-2 clientes reais (perfil, dor, transformação alcançada)

Se aluno tem clientes documentados em `clients/<slug>/`, leia primeiro.

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
