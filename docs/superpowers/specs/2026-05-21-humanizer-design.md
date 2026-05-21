# /humanizer — Design Spec

**Data:** 2026-05-21
**Status:** Aprovado pelo user, pronto pra implementação
**Próximo passo:** writing-plans → implementação

---

## Problema

Copy gerada por IA carrega tells reconhecíveis (em-dash retórico, paralelismo de 3, "no mundo de hoje", verbos como "mergulhar/desbloquear/elevar", conectores formais demais). Esses tells fazem qualquer texto soar robótico independente do conteúdo. Hoje não existe ferramenta no kit Magnus pra remover esses tells preservando intenção do autor — `/ba` reescreve em voice Schwartz (overlap excessivo), `/schwartz-headline` gera, não edita.

Objetivo: skill dedicada que recebe copy de qualquer origem (rascunho de IA, transcrição, primeira versão do operador) e devolve a versão sem cara de IA, calibrada pra continuar evoluindo com base no feedback do user — sem que ele precise editar o SKILL.md manualmente.

## Não-objetivos

- Não diagnosticar Schwartz (awareness/sophistication). É trabalho do `/ba`.
- Não gerar copy nova do zero. Skill exige input.
- Não validar voice de marca (não rejeita copy fora de voice; só remove cara de IA).
- Não fazer "rewrite agressivo" estilo copy editor. Preserva argumento e estrutura macro.

---

## Identidade e escopo

**Nome:** `humanizer`
**Localização:** `.claude/skills/humanizer/SKILL.md`
**Padrão de invocação:**
- `/humanizer` + cola o texto direto no chat → output no chat
- `/humanizer <caminho/arquivo.md>` → output no chat (NÃO sobrescreve arquivo sem pedir explícito)

**Idioma:** detecta automaticamente pelo input; default PT-BR.

**Nível de intervenção:** **Editor médio.**
- Remove tells de IA
- Reescreve frases que ficaram fracas depois da remoção (não deixa buraco)
- Ajusta ritmo (frases curtas, corta conectores vazios)
- Até ~30% das palavras podem mudar
- Sem mudar argumento, estrutura macro ou ordem das ideias

**Regra-âncora:** se a remoção enfraquece uma frase, reescreve a frase. É o que separa "Editor médio" de "Cirurgião".

---

## Anatomia do SKILL.md

```
---
name: humanizer
description: <triggers naturais — quando invocar automaticamente>
allowed-tools: Read, Write, Edit
---

# /humanizer — versão crua, sem cara de IA

## Passo 0 — Calibrar pelo negócio (se aplicável)
[Lê business-brain.md se existir. Extrai Voice→Nunca como banidos
adicionais. Skipa silenciosamente se não existir.]

## Passo 1 — Receber input
[Cola direto OU caminho de arquivo. Detecta idioma do input.]

## Passo 2 — Editar (nível médio)
[Aplica Regras fixas + Banidos aprendidos + Substituições preferidas
+ (se calibrado) Voice→Nunca do business-brain.]

## Regras fixas (DNA — não mexer sem promoção explícita)
[12 regras estáveis. Lista completa abaixo.]

## Banidos aprendidos
[Lista crescente. Vazio no início. Cresce via feedback confirmado.]

## Substituições preferidas
[Pares antes→depois. Vazio no início.]

## Passo 3 — Detectar feedback (depois de devolver a copy)
[Detecção por intenção na mensagem seguinte ao output. Propõe
atualização explícita, aguarda confirmação, escreve com Edit.]

## Output
[Só a copy limpa. Sem preâmbulo, sem "aqui está", sem fecho.]
```

**Por que separar `Regras fixas` de `Banidos aprendidos`:**
- Regras fixas = núcleo estável; raramente muda; define o que a skill É.
- Banidos aprendidos = memória viva; cresce com uso; pode chegar a centenas de itens.
- Misturar quebra a auditoria 6 meses depois.

---

## Regras fixas de partida (12)

### Estruturais (forma)

1. **Em-dash retórico** — "isso não é só X — é Y". Trocar por ponto, vírgula ou frase nova.
2. **Paralelismo de 3** — "não é sobre A, não é sobre B, é sobre C" / "rápido, fácil, gratuito". Cortar pra 2 ou quebrar o ritmo.
3. **Listas tríplices em prosa** — três adjetivos simétricos seguidos ("claro, direto e objetivo"). Pegar 1, descartar 2.
4. **Ritmo metronômico** — várias frases do mesmo tamanho seguidas. Variar: curta-curta-longa, ou cortar uma.
5. **Conectores formais demais em PT-BR** — "ademais", "outrossim", "por conseguinte", "vale ressaltar", "é importante notar que". Tirar ou trocar por nada.

### Lexicais (palavras/frases)

6. **Abertura turística** — "No mundo de hoje", "Em um cenário onde", "Vivemos uma era em que", "Hoje em dia". Cortar a frase inteira; começa pela próxima.
7. **Verbos AI-coded** — "mergulhar", "desvendar", "desbloquear", "elevar", "navegar", "potencializar", "alavancar" (em contexto não-marítimo/literal). Trocar pelo verbo concreto.
8. **Adjetivos vazios** — "incrível", "poderoso", "revolucionário", "transformador", "robusto" sem evidência ao lado. Cortar ou substituir por dado.
9. **Hedge desnecessário** — "pode ser que", "talvez seja interessante", "vale considerar que". Cortar; afirmar.
10. **CTA-IA** — "comece sua jornada", "dê o próximo passo", "embarque nessa". Trocar por verbo direto do que o leitor faz.

### Meta (postura)

11. **Preâmbulo de auto-narração** — "Vou te mostrar como…", "Neste texto, você vai aprender…". Cortar; entrar direto.
12. **Fecho de cordialidade** — "Espero que isso ajude", "Conte comigo", "Qualquer dúvida, estou à disposição" em copy (não em email pessoal). Cortar.

**Calibração com business-brain.md:** os itens de `Voice → Nunca` viram regras fixas adicionais com a mesma força das 12 acima. Aplicadas no mesmo passo, mas armazenadas no business-brain (não duplicadas no SKILL.md).

---

## Mecanismo de aprendizado

### Janela de detecção

A skill SÓ procura feedback em:
1. Mensagem imediatamente seguinte ao output da skill, OU
2. Mensagem que referencie explicitamente uma copy anterior dela ("naquela copy que você humanizou…")

Não fica caçando feedback em mensagens aleatórias da sessão.

### Sinais que contam como feedback

| Sinal | Exemplo do user | Destino |
|---|---|---|
| Banir frase/palavra | "tira sempre X", "X é cara de IA", "odeio X", "nunca usa X" | `## Banidos aprendidos` |
| Substituição preferida | "X melhor que Y", "no lugar de Y eu prefiro X" | `## Substituições preferidas` |
| Padrão estrutural | "não gosto quando você quebra a frase com em-dash" | Candidato a `## Regra fixa` SE já existe item parecido nos banidos; senão entra como banido primeiro |
| Reversão | "essa frase você não devia ter mexido", "isso aí tava bom" | Não vira regra (caso isolado). Skill agradece e segue. |
| Elogio | "ficou bom", "perfeito" | Não vira regra. Skill não escreve nada. |

### Protocolo de atualização (3 passos sempre)

1. **Propõe explicitamente:**
   ```
   Detectei feedback. Vou adicionar aos Banidos aprendidos:
   - "no fim das contas" — contexto: cara de IA em CTA

   Confirma? (sim / não / ajusta)
   ```

2. **Aguarda confirmação.**
   - `sim` → escreve
   - `não` → descarta e segue
   - `ajusta <texto reformulado>` → aceita e volta ao passo 1 com nova proposta

3. **Escreve no SKILL.md** com `Edit` tool, modificando APENAS as seções `## Banidos aprendidos` ou `## Substituições preferidas`. Nunca toca em `## Regras fixas` sem comando explícito de promoção.

### Formato dos itens aprendidos

```markdown
## Banidos aprendidos

- `"no fim das contas"` — 2026-05-21 — cara de IA em CTA
- `"vamos descomplicar"` — 2026-05-21 — preâmbulo turístico
- padrão: abrir parágrafo com gerúndio ("Pensando em…") — 2026-05-22
```

Data + 1 linha de contexto opcional. Curto. Auditável em 6 meses.

### Guardrails (anti-poluição)

- **Sem duplicata:** se user tenta banir algo já banido, skill mostra o item existente e não escreve.
- **Sem contradição:** se candidato a banido contradiz uma regra fixa, skill avisa ("isso vai contra a regra X, quer promover pra regra fixa em vez disso?").
- **1 update por confirmação:** se a mensagem de feedback tem 3 itens, skill propõe 3 updates mas confirma um por vez.
- **Sem update sem confirmação:** elogio puro, feedback ambíguo, reversão pontual → não escreve nada.

---

## Manutenção e ciclo de vida

### Sugestões automáticas de consolidação

Disparadas durante feedback sessions (nunca executam sem confirmação):

| Gatilho | Sugestão da skill |
|---|---|
| `## Banidos aprendidos` passa de **30 itens** | "Quer que eu agrupe banidos parecidos? Tenho 4 itens variando 'descubra como'." |
| Mesmo padrão aparece em **3+ banidos** | "Banidos #5, #12, #18 são todos paralelismo de 3. Quer promover pra Regra fixa?" |
| `SKILL.md` passa de **500 linhas** | "SKILL.md tá em 520 linhas. Quer revisar a lista de aprendidos comigo agora?" |

Rastreamento de uso por banido (decay) está fora de escopo na v1 — manutenção é manual/ocasional.

### Promoção de banido → regra fixa (manual, com cerimônia)

User diz "promove X pra regra fixa". Skill:
1. Mostra o banido + propõe redação no estilo das regras fixas (mais geral, com instrução de remoção).
2. Pede confirmação.
3. Move pra `## Regras fixas`. **Remove dos banidos aprendidos** (sem duplicar).

A skill **nunca** promove sem comando explícito. Regras fixas não acumulam por acidente.

### Rollback de aprendizado

User diz "desaprende X" ou "remove o banido X":
1. Skill acha o item, mostra.
2. Pede confirmação.
3. Remove com `Edit`.

Sem histórico interno — git é fonte da verdade.

### Atualização das `## Regras fixas`

Apenas via:
- Promoção explícita de banido (descrita acima)
- User editando manualmente o SKILL.md fora da skill

A skill **nunca** modifica `## Regras fixas` por conta própria, mesmo com confirmação. Barreira proposital — protege o DNA.

### Backup

Sem backup automático. Confia no git. Recomendação operacional: user commita o SKILL.md após cada feedback session (`chore(humanizer): +N banidos`). Pequeno e auditável.

---

## Integração com outras skills do kit

| Skill | Relação |
|---|---|
| `/ba` | Sem overlap. `/ba` decide angle Schwartz e gera copy nova. `/humanizer` edita copy já existente removendo cara de IA. Fluxo natural: `/ba` gera → operador refina → `/humanizer` passa o pano de cara de IA. |
| `/schwartz-headline` | Sem overlap. Pode rodar `/humanizer` no output da `/schwartz-headline` se headlines saírem com cara de IA. |
| `/competitive-scraping` | Sem interação. |
| `business-brain.md` | Leitura no Passo 0 (se existir). `Voice → Nunca` vira regra fixa adicional na sessão. |
| `learnings.md` (raiz do projeto) | Sem interação. `learnings.md` é geral do operador; banidos da `/humanizer` ficam no SKILL.md dela. |

---

## Output format

```
<copy humanizada — sem preâmbulo, sem fecho, sem comentário>
```

Pronto. Sem "aqui está sua copy", sem "espero que ajude", sem explicação do que mudou. A skill cola e cala. Se o user quiser saber o que mudou, ele pergunta; aí entra como conversa normal.

---

## Critérios de sucesso

A skill está funcionando quando:

1. User cola copy com cara de IA, recebe versão crua na próxima resposta, sem cerimônia.
2. Após 5+ sessões de uso real, `## Banidos aprendidos` tem itens que refletem implicâncias específicas do user que não estavam nas 12 regras fixas.
3. Zero updates ao SKILL.md sem confirmação prévia.
4. Zero updates às `## Regras fixas` por iniciativa da skill.
5. SKILL.md ainda é legível e auditável após 50+ itens aprendidos (graças à separação fixas/aprendidos + formato curto dos itens).
6. Skill nunca duplica banido, nunca cria contradição com regra fixa.

---

## Fora de escopo (v1)

- Rastreamento de uso por banido (qual banido foi gatilhado quantas vezes)
- Histórico interno de remoções (git supre)
- Backup automático
- Múltiplos níveis de intervenção (--leve / --forte) — v1 é só "Editor médio"
- Batch (humanizar múltiplas copies de uma vez)
- Sobrescrita do arquivo de input sem pedir
- Export/import de banidos pra outro projeto
- Score "AI-ness 0-10" no output

Esses itens podem entrar em v2 se houver demanda real depois de uso.
