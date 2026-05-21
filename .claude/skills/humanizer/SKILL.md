---
name: humanizer
description: Use quando o usuário cola copy/texto e pede pra "tirar a cara de IA", "humanizar", "deixar mais cru", "remover clichês de IA", ou quando o usuário expressa frustração com texto soando robótico ("isso tá com cara de IA", "muito artificial"). Aceita texto colado direto OU caminho de arquivo. Editor médio: remove tells, reescreve frases enfraquecidas, ajusta ritmo — sem mudar argumento ou estrutura macro. Aprende com feedback do usuário e atualiza o próprio SKILL.md via protocolo de confirmação.
allowed-tools: Read, Edit
---

# /humanizer — versão crua, sem cara de IA

## Passo 0 — Calibrar pelo negócio (se aplicável)

Se existir um arquivo `business-brain.md` na raiz do projeto onde a skill foi invocada, **lê** e extrai:

- **Voice → Nunca**: cada item dessa lista vira **regra fixa adicional pra esta invocação**, com a mesma força das 12 abaixo. Não duplica essas regras no SKILL.md — usa direto da leitura.
- **ICP** (opcional): pode informar substituições de termos (ex: jargão técnico se ICP é leigo).

Se `business-brain.md` não existir, **skipa silenciosamente** e segue. Não é erro.

## Passo 1 — Receber input

Aceita duas formas:

1. **Texto colado direto no chat** após o comando `/humanizer`.
2. **Caminho de arquivo**: `/humanizer <caminho/arquivo.md>` — lê o arquivo com `Read`. **Nunca sobrescreve o arquivo de input** sem o user pedir explicitamente.

**Detecção de idioma:** identifica o idioma do input. Default operacional: PT-BR. Se input vier em outra língua (EN, ES, etc), responde no idioma do input.

Se o input estiver vazio ou ambíguo (ex: só "humaniza isso" sem texto e sem caminho), pergunta uma vez: "cola o texto ou me passa o caminho do arquivo".

## Passo 2 — Editar (nível médio)

Aplica, nesta ordem:

1. **Regras fixas** (12 abaixo) + **Voice → Nunca** do business-brain (se calibrado no Passo 0).
2. **Banidos aprendidos** (lista crescente abaixo).
3. **Substituições preferidas** (pares antes→depois abaixo).

**Comportamento:**
- Remove tells.
- Reescreve frases que ficaram fracas depois da remoção — **não deixa buraco**.
- Ajusta ritmo: quebra metrônomo, corta conectores vazios, varia tamanho de frase.
- **Até ~30% das palavras podem mudar.**
- **Não muda argumento, estrutura macro, ordem das ideias.**
- **Não inventa fato, dado, número, citação que não estava no input.**

**Regra-âncora:** se a remoção enfraquece uma frase, **reescreve a frase**. É o que separa Editor médio de Cirurgião.

## Output

Apenas a copy humanizada.

**Sem preâmbulo** ("aqui está", "humanizei pra você").
**Sem fecho** ("espero que ajude", "conta comigo").
**Sem explicação** do que mudou.
**Sem comentário** sobre o original.

Cola e cala. Se o user quiser saber o que mudou, ele pergunta — aí responde como conversa normal, fora do output formal.

## Regras fixas (DNA — não mexer sem promoção explícita)

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

**Importante:** estas 12 só mudam via **promoção explícita** (user diz "promove X pra regra fixa") ou edição manual do user no arquivo. A skill NUNCA altera esta seção por conta própria.

## Banidos aprendidos

Lista crescente. Itens entram aqui APENAS via feedback confirmado pelo user (protocolo no Passo 3). Skill nunca adiciona sem confirmação.

**Formato de cada item:**
```
- `"frase ou palavra exata"` — YYYY-MM-DD — 1 linha de contexto (opcional)
- padrão: <descrição curta do padrão estrutural> — YYYY-MM-DD — contexto
```

**Itens:**

<!-- Lista começa vazia. A skill adiciona aqui via Edit após confirmação. -->

## Substituições preferidas

Pares antes→depois que viraram preferência do user. Mesma regra: só entra via feedback confirmado.

**Formato:**
```
- `"forma antiga"` → `"forma preferida"` — YYYY-MM-DD — contexto opcional
```

**Itens:**

<!-- Lista começa vazia. -->

## Passo 3 — Detectar feedback (depois de devolver a copy)

### Janela de detecção

A skill SÓ procura feedback em:
1. **Mensagem imediatamente seguinte** ao output da skill.
2. **Mensagem que referencie explicitamente uma copy anterior dela** (ex: "naquela copy que você humanizou…").

Não caça feedback em mensagens aleatórias da sessão. Se o user mudou de assunto entre o output e a próxima fala, descarta a janela.

### Sinais que contam como feedback

| Sinal | Exemplo do user | Destino |
|---|---|---|
| Banir frase/palavra | "tira sempre X", "X é cara de IA", "odeio X", "nunca usa X" | `## Banidos aprendidos` |
| Substituição preferida | "X melhor que Y", "no lugar de Y eu prefiro X" | `## Substituições preferidas` |
| Padrão estrutural | "não gosto quando você quebra com em-dash" | Candidato a `## Regras fixas` SE já existe banido parecido; senão entra como banido primeiro |
| Reversão pontual | "essa frase você não devia ter mexido" | NÃO vira regra. Agradece e segue. |
| Elogio | "ficou bom", "perfeito" | NÃO vira regra. Não escreve nada. |

**Nota de classificação:** "nunca usa X" / "sempre evita X" sobre uma **palavra ou frase concreta** → Banidos aprendidos. Sobre um **padrão estrutural** (em-dash, paralelismo, listas tríplices, etc) → primeiro checa se já é Regra fixa; se sim, ignora silenciosamente (já coberto). Se não, oferece como candidato a Regra fixa direto, sem passar por Banidos.

### Protocolo de atualização (SEMPRE)

**Etapa A — Propõe explicitamente:**

```
Detectei feedback. Vou adicionar aos Banidos aprendidos:
- "no fim das contas" — contexto: cara de IA em CTA

Confirma? (sim / não / ajusta)
```

**Etapa B — Aguarda confirmação:**
- `sim` → vai pra Etapa C
- `não` → descarta, segue conversa
- `ajusta <texto>` → aceita reformulação, volta à Etapa A com nova proposta

**Etapa C — Escreve no SKILL.md com `Edit`:**
- Modifica APENAS `## Banidos aprendidos` OU `## Substituições preferidas`.
- **Nunca** toca em `## Regras fixas` sem comando explícito de promoção (ver Manutenção).
- Formato exato conforme exemplo das próprias seções.
- **Ponto de inserção**: encontra o comentário HTML `<!-- ... -->` da seção alvo e insere o novo item **imediatamente acima** dele. Nunca insere dentro dos blocos de código de exemplo (entre as cercas ```).
- **Idioma**: novos itens (texto do contexto, descrições de padrão) sempre em PT-BR, independente do idioma do input que originou o feedback. Mantém a lista interna consistente.

### Guardrails (anti-poluição)

- **Sem duplicata**: antes de propor, lê a seção alvo. Se item já existe, mostra o existente e não propõe.
- **Sem contradição**: se candidato a banido contradiz uma regra fixa, avisa: "isso vai contra a Regra fixa #N. Quer promover pra regra fixa em vez de adicionar como banido?" Aguarda decisão.
- **1 update por confirmação**: se a mensagem de feedback tem N itens, propõe e confirma um por vez, na ordem em que apareceram. `não` em um item descarta só aquele e segue pro próximo. `não vou confirmar nada` (ou silêncio prolongado) → aborta os restantes sem perguntar de novo.
- **Sem update sem confirmação**: elogio puro, feedback ambíguo, reversão pontual → não escreve nada.

## Manutenção

### Sugestões automáticas de consolidação

Durante feedback sessions, se um destes gatilhos disparar, a skill **sugere** (nunca executa sem confirmação):

| Gatilho | Sugestão |
|---|---|
| `## Banidos aprendidos` passa de **30 itens** | "Quer que eu agrupe banidos parecidos? Tenho N itens que são variações de '...'." |
| Mesmo padrão aparece em **3+ banidos** | "Vejo 3 banidos que são variações de <padrão>: \"...\", \"...\", \"...\". Quer promover pra Regra fixa?" |
| `SKILL.md` passa de **500 linhas** | "SKILL.md tá em N linhas. Quer revisar a lista de aprendidos comigo agora?" |

Rastreamento de uso por banido (decay) está fora de escopo na v1.

### Promoção de banido → regra fixa (manual, com cerimônia)

User diz **"promove X pra regra fixa"** (ou frase equivalente). Skill:

1. Mostra o banido + propõe redação no estilo das 12 regras fixas (mais geral, com instrução de remoção).
2. Pede confirmação explícita.
3. Adiciona em `## Regras fixas` (na subseção apropriada: Estruturais / Lexicais / Meta) com próximo número.
4. **Remove o item correspondente** de `## Banidos aprendidos` (sem duplicar).

A skill **NUNCA** promove sem comando explícito.

### Rollback de aprendizado

User diz **"desaprende X"** ou **"remove o banido X"**:

1. Skill encontra o item, mostra trecho exato.
2. Pede confirmação.
3. Remove com `Edit`.

Sem histórico interno. Git é fonte da verdade — user commita periodicamente.

### Backup

Sem backup automático. Recomendação operacional: commit do SKILL.md após cada feedback session:

```
chore(humanizer): +N banidos
```

### Edição manual

User pode editar `SKILL.md` diretamente fora da skill (corrigir typo, reordenar, remover em lote). Skill respeita e segue lendo a versão atual a cada invocação.
