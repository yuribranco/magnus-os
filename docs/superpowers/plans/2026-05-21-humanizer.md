# /humanizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a skill `/humanizer` em `.claude/skills/humanizer/SKILL.md` — Editor médio que remove tells de IA preservando intenção, lê `business-brain.md` quando disponível, e aprende com feedback do user via protocolo de confirmação (escreve em si própria).

**Architecture:** Skill single-file (padrão das outras do kit Magnus). SKILL.md contém: frontmatter, 4 Passos operacionais, 12 Regras fixas, seções de aprendidos crescentes (Banidos + Substituições), mecanismo de feedback com 3-step protocol, e instruções de manutenção. Skill modifica APENAS as seções de aprendidos via `Edit` tool — nunca mexe nas Regras fixas sem comando explícito de promoção.

**Tech Stack:** Markdown puro. Tools usadas pela skill: `Read` (input file + business-brain), `Write` (saída em arquivo opcional, não default), `Edit` (auto-update das seções aprendidas).

**Nota sobre TDD:** o artefato é um prompt/skill, não código. Não há test framework. A validação é via **smoke tests interativos**: invocar a skill em sessão fresca, fornecer input/feedback definidos, observar comportamento, ajustar SKILL.md se desviar. As Tasks 7-9 documentam smoke tests explícitos com critério de pass/fail.

**Spec:** `docs/superpowers/specs/2026-05-21-humanizer-design.md`

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `.claude/skills/humanizer/SKILL.md` | Único arquivo da skill. Frontmatter + instruções + regras + memória viva. |
| `CLAUDE.md` (raiz do projeto) | Lista `/humanizer` no `## Skill Index (top-level)`. |
| `docs/superpowers/specs/2026-05-21-humanizer-design.md` | Spec (já existe, referência). |
| `docs/superpowers/plans/2026-05-21-humanizer.md` | Este plano. |

---

## Task 1: Scaffold do esqueleto

**Files:**
- Create: `.claude/skills/humanizer/SKILL.md` (skeleton only)

- [ ] **Step 1: Criar a pasta da skill**

Run:
```bash
mkdir -p .claude/skills/humanizer
```

Expected: pasta criada sem erro.

- [ ] **Step 2: Escrever SKILL.md skeleton (frontmatter + headings)**

Write file `.claude/skills/humanizer/SKILL.md` with this exact content:

````markdown
---
name: humanizer
description: Use quando o usuário cola copy/texto e pede pra "tirar a cara de IA", "humanizar", "deixar mais cru", "remover clichês de IA", ou quando o usuário expressa frustração com texto soando robótico ("isso tá com cara de IA", "muito artificial"). Aceita texto colado direto OU caminho de arquivo. Editor médio: remove tells, reescreve frases enfraquecidas, ajusta ritmo — sem mudar argumento ou estrutura macro. Aprende com feedback do usuário e atualiza o próprio SKILL.md via protocolo de confirmação.
allowed-tools: Read, Edit
---

# /humanizer — versão crua, sem cara de IA

## Passo 0 — Calibrar pelo negócio (se aplicável)

## Passo 1 — Receber input

## Passo 2 — Editar (nível médio)

## Output

## Regras fixas (DNA — não mexer sem promoção explícita)

## Banidos aprendidos

## Substituições preferidas

## Passo 3 — Detectar feedback (depois de devolver a copy)

## Manutenção
````

Expected: arquivo criado, headings batem com a anatomia do spec.

---

## Task 2: Passos operacionais (0, 1, 2) + Output

**Files:**
- Modify: `.claude/skills/humanizer/SKILL.md` (substituir headings vazios pelo conteúdo de Passos 0-2 e Output)

- [ ] **Step 1: Preencher Passo 0 — Calibrar pelo negócio**

Use `Edit` para substituir a linha `## Passo 0 — Calibrar pelo negócio (se aplicável)` pelo bloco:

````markdown
## Passo 0 — Calibrar pelo negócio (se aplicável)

Se existir um arquivo `business-brain.md` na raiz do projeto onde a skill foi invocada, **lê** e extrai:

- **Voice → Nunca**: cada item dessa lista vira **regra fixa adicional pra esta invocação**, com a mesma força das 12 abaixo. Não duplica essas regras no SKILL.md — usa direto da leitura.
- **ICP** (opcional): pode informar substituições de termos (ex: jargão técnico se ICP é leigo).

Se `business-brain.md` não existir, **skipa silenciosamente** e segue. Não é erro.
````

- [ ] **Step 2: Preencher Passo 1 — Receber input**

Use `Edit` para substituir `## Passo 1 — Receber input` pelo bloco:

````markdown
## Passo 1 — Receber input

Aceita duas formas:

1. **Texto colado direto no chat** após o comando `/humanizer`.
2. **Caminho de arquivo**: `/humanizer <caminho/arquivo.md>` — lê o arquivo com `Read`. **Nunca sobrescreve o arquivo de input** sem o user pedir explicitamente.

**Detecção de idioma:** identifica o idioma do input. Default operacional: PT-BR. Se input vier em outra língua (EN, ES, etc), responde no idioma do input.

Se o input estiver vazio ou ambíguo (ex: só "humaniza isso" sem texto e sem caminho), pergunta uma vez: "cola o texto ou me passa o caminho do arquivo".
````

- [ ] **Step 3: Preencher Passo 2 — Editar**

Use `Edit` para substituir `## Passo 2 — Editar (nível médio)` pelo bloco:

````markdown
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
````

- [ ] **Step 4: Preencher Output**

Use `Edit` para substituir `## Output` pelo bloco:

````markdown
## Output

Apenas a copy humanizada.

**Sem preâmbulo** ("aqui está", "humanizei pra você").
**Sem fecho** ("espero que ajude", "conta comigo").
**Sem explicação** do que mudou.
**Sem comentário** sobre o original.

Cola e cala. Se o user quiser saber o que mudou, ele pergunta — aí responde como conversa normal, fora do output formal.
````

- [ ] **Step 5: Verificar visualmente**

Use `Read` em `.claude/skills/humanizer/SKILL.md`. Confirme:
- Passos 0, 1, 2 e Output estão preenchidos com o conteúdo acima.
- Headings das seções abaixo (Regras fixas, Banidos, etc) ainda estão vazios — serão preenchidos nas tasks seguintes.

Expected: visualmente coerente, sem placeholders.

---

## Task 3: Regras fixas (12)

**Files:**
- Modify: `.claude/skills/humanizer/SKILL.md`

- [ ] **Step 1: Preencher Regras fixas com as 12 do spec**

Use `Edit` para substituir `## Regras fixas (DNA — não mexer sem promoção explícita)` pelo bloco:

````markdown
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
````

- [ ] **Step 2: Verificar visualmente**

Use `Read` em `.claude/skills/humanizer/SKILL.md`. Confirme:
- 12 regras numeradas, divididas em Estruturais (1-5), Lexicais (6-10), Meta (11-12).
- Nota de proteção no final.

Expected: lista completa, sem omissão.

---

## Task 4: Seções de aprendidos (vazias com formato exemplo)

**Files:**
- Modify: `.claude/skills/humanizer/SKILL.md`

- [ ] **Step 1: Preencher Banidos aprendidos (vazio com formato)**

Use `Edit` para substituir `## Banidos aprendidos` pelo bloco:

````markdown
## Banidos aprendidos

Lista crescente. Itens entram aqui APENAS via feedback confirmado pelo user (protocolo no Passo 3). Skill nunca adiciona sem confirmação.

**Formato de cada item:**
```
- `"frase ou palavra exata"` — YYYY-MM-DD — 1 linha de contexto (opcional)
- padrão: <descrição curta do padrão estrutural> — YYYY-MM-DD — contexto
```

**Itens:**

<!-- Lista começa vazia. A skill adiciona aqui via Edit após confirmação. -->
````

- [ ] **Step 2: Preencher Substituições preferidas (vazio com formato)**

Use `Edit` para substituir `## Substituições preferidas` pelo bloco:

````markdown
## Substituições preferidas

Pares antes→depois que viraram preferência do user. Mesma regra: só entra via feedback confirmado.

**Formato:**
```
- `"forma antiga"` → `"forma preferida"` — YYYY-MM-DD — contexto opcional
```

**Itens:**

<!-- Lista começa vazia. -->
````

- [ ] **Step 3: Verificar visualmente**

Use `Read` em `.claude/skills/humanizer/SKILL.md`. Confirme:
- Ambas as seções têm exemplo de formato visível e lista vazia (com comentário HTML indicando onde a skill vai inserir).

Expected: formato claro, escalável.

---

## Task 5: Mecanismo de feedback (Passo 3 + protocolo + guardrails)

**Files:**
- Modify: `.claude/skills/humanizer/SKILL.md`

- [ ] **Step 1: Preencher Passo 3 — Detecção de feedback**

Use `Edit` para substituir `## Passo 3 — Detectar feedback (depois de devolver a copy)` pelo bloco:

````markdown
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

### Protocolo de atualização (3 passos — SEMPRE)

**1. Propõe explicitamente:**

```
Detectei feedback. Vou adicionar aos Banidos aprendidos:
- "no fim das contas" — contexto: cara de IA em CTA

Confirma? (sim / não / ajusta)
```

**2. Aguarda confirmação:**
- `sim` → vai pro passo 3
- `não` → descarta, segue conversa
- `ajusta <texto>` → aceita reformulação, volta ao passo 1 com nova proposta

**3. Escreve no SKILL.md com `Edit`:**
- Modifica APENAS `## Banidos aprendidos` OU `## Substituições preferidas`.
- **Nunca** toca em `## Regras fixas` sem comando explícito de promoção (ver Manutenção).
- Formato exato conforme exemplo das próprias seções.

### Guardrails (anti-poluição)

- **Sem duplicata**: antes de propor, lê a seção alvo. Se item já existe, mostra o existente e não propõe.
- **Sem contradição**: se candidato a banido contradiz uma regra fixa, avisa: "isso vai contra a Regra fixa #N. Quer promover pra regra fixa em vez de adicionar como banido?" Aguarda decisão.
- **1 update por confirmação**: se a mensagem de feedback tem 3 itens, propõe 3 updates mas confirma um por vez.
- **Sem update sem confirmação**: elogio puro, feedback ambíguo, reversão pontual → não escreve nada.
````

- [ ] **Step 2: Verificar visualmente**

Use `Read` em `.claude/skills/humanizer/SKILL.md`. Confirme:
- Janela de detecção, tabela de sinais, protocolo de 3 passos, guardrails — todos presentes.

Expected: mecanismo completo e auditável.

---

## Task 6: Seção de manutenção (consolidação + promoção + rollback)

**Files:**
- Modify: `.claude/skills/humanizer/SKILL.md`

- [ ] **Step 1: Preencher Manutenção**

Use `Edit` para substituir `## Manutenção` pelo bloco:

````markdown
## Manutenção

### Sugestões automáticas de consolidação

Durante feedback sessions, se um destes gatilhos disparar, a skill **sugere** (nunca executa sem confirmação):

| Gatilho | Sugestão |
|---|---|
| `## Banidos aprendidos` passa de **30 itens** | "Quer que eu agrupe banidos parecidos? Tenho N itens que são variações de '...'." |
| Mesmo padrão aparece em **3+ banidos** | "Banidos #X, #Y, #Z são todos <padrão>. Quer promover pra Regra fixa?" |
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
````

- [ ] **Step 2: Verificar visualmente**

Use `Read` em `.claude/skills/humanizer/SKILL.md`. Confirme todas as seções preenchidas; nenhum heading vazio restante.

Expected: SKILL.md completo, ~250-300 linhas.

- [ ] **Step 3: Commit do SKILL.md completo**

Run:
```bash
git add .claude/skills/humanizer/SKILL.md
git commit -m "$(cat <<'EOF'
feat(humanizer): cria skill /humanizer (v1)

Editor médio que remove tells de IA preservando intenção do autor.
12 regras fixas (estruturais + lexicais + meta) + seções de aprendidos
que crescem via feedback do user com protocolo de confirmação obrigatória.

Lê business-brain.md quando existir (Voice→Nunca vira regra fixa
adicional). Modifica apenas as seções de aprendidos via Edit — Regras
fixas ficam protegidas (só mudam via promoção explícita).

Spec: docs/superpowers/specs/2026-05-21-humanizer-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: commit criado, 1 file changed.

---

## Task 7: Registrar /humanizer no Skill Index do CLAUDE.md

**Files:**
- Modify: `/Users/yuribranco/Documents/Magnus/magnus-os/CLAUDE.md` (seção `## Skill Index (top-level)`)

- [ ] **Step 1: Ler CLAUDE.md pra confirmar contexto da edição**

Use `Read` em `CLAUDE.md`. Localize a seção `## Skill Index (top-level)`.

Expected: contém os 4 itens — competitive-scraping, ba, schwartz-headline, briefing-avatar.

- [ ] **Step 2: Adicionar /humanizer ao índice**

Use `Edit` para substituir o bloco:

```
## Skill Index (top-level)
- `/competitive-scraping <url>` — análise de concorrente com lente Magnus
- `/ba` — Breakthrough Advertising (Eugene Schwartz): diagnostica + escreve copy de qualquer formato (headline, VSL, página, email, ad) usando 3 perguntas: mass desire + awareness + sophistication
- `/schwartz-headline` — atalho pra gerar variações de headline nos 5 níveis de awareness
- `/briefing-avatar` — briefing de avatar pelo método Magnus
```

por:

```
## Skill Index (top-level)
- `/competitive-scraping <url>` — análise de concorrente com lente Magnus
- `/ba` — Breakthrough Advertising (Eugene Schwartz): diagnostica + escreve copy de qualquer formato (headline, VSL, página, email, ad) usando 3 perguntas: mass desire + awareness + sophistication
- `/schwartz-headline` — atalho pra gerar variações de headline nos 5 níveis de awareness
- `/briefing-avatar` — briefing de avatar pelo método Magnus
- `/humanizer` — remove cara de IA de copy existente (editor médio); aprende com feedback e cresce sozinha
```

- [ ] **Step 3: Commit da atualização do CLAUDE.md**

Run:
```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs(claude-md): adiciona /humanizer ao Skill Index

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: commit criado.

---

## Task 8: Smoke test 1 — Golden path (input → output limpo)

**Objetivo:** validar que a skill é ativada pelos triggers naturais, processa input simples, e devolve só a copy limpa sem preâmbulo.

- [ ] **Step 1: Iniciar sessão fresca e invocar a skill**

Abra uma sessão Claude Code nova no `magnus-os`. Cole:

```
/humanizer

No mundo de hoje, vamos mergulhar fundo no universo da produtividade. Imagine se você pudesse desbloquear todo o seu potencial — não é sobre trabalhar mais, não é sobre trabalhar menos, é sobre trabalhar com inteligência. Esse é o segredo que vamos revelar.
```

- [ ] **Step 2: Critérios de validação**

A resposta da skill deve:

- ✅ **Não conter preâmbulo** ("aqui está", "humanizei", "segue").
- ✅ **Não conter fecho** ("espero que ajude", "conte comigo").
- ✅ **Remover "No mundo de hoje"** (Regra 6).
- ✅ **Remover ou trocar "mergulhar fundo"** (Regra 7).
- ✅ **Quebrar o paralelismo de 3** ("não é sobre A, não é sobre B, é sobre C") — Regra 2.
- ✅ **Não inventar fato ou número que não estava no input**.
- ✅ Texto final mais curto que o original e com argumento preservado.

- [ ] **Step 3: Se algum critério falhar — diagnóstico**

Se a skill devolveu preâmbulo: a seção `## Output` não tá clara o suficiente. Editar SKILL.md, reforçar.
Se não removeu algum dos tells acima: revisar redação das Regras fixas correspondentes (talvez o exemplo precise ficar mais explícito).
Se inventou conteúdo: adicionar uma 13ª regra ou enfatizar mais o "não inventa fato/dado" no Passo 2.

Aplicar fix com `Edit`, commitar com mensagem `fix(humanizer): <descrição>`, repetir Step 1.

- [ ] **Step 4: Marcar pass**

Quando todos os critérios passam, anotar mentalmente "Smoke 1 ✅" e seguir.

---

## Task 9: Smoke test 2 — Feedback path (aprende com protocolo)

**Objetivo:** validar que a skill detecta feedback, propõe atualização explícita, aguarda confirmação, e só então escreve no SKILL.md.

- [ ] **Step 1: Ainda na mesma sessão fresca (continuação do Smoke 1)**

Logo após o output do Smoke 1, mande:

```
gostei. agora tira sempre "no fim do dia" também — é cara de IA quando aparece em CTA
```

- [ ] **Step 2: Critérios de validação — proposta**

A skill deve responder ALGO equivalente a:

```
Detectei feedback. Vou adicionar aos Banidos aprendidos:
- "no fim do dia" — cara de IA em CTA

Confirma? (sim / não / ajusta)
```

- ✅ Reconhece o sinal "tira sempre X".
- ✅ Mostra a proposta exata antes de escrever.
- ✅ Pede confirmação.
- ❌ NÃO escreve no SKILL.md ainda.

- [ ] **Step 3: Verificar que SKILL.md NÃO mudou**

Run:
```bash
git diff .claude/skills/humanizer/SKILL.md
```

Expected: vazio (skill não deve ter alterado o arquivo antes da confirmação).

- [ ] **Step 4: Confirmar e validar escrita**

Responder na sessão:

```
sim
```

A skill deve usar `Edit` para adicionar o item em `## Banidos aprendidos`.

Validar com:
```bash
git diff .claude/skills/humanizer/SKILL.md
```

Expected: diff mostra +1 linha na seção `## Banidos aprendidos`, formato:
```
- `"no fim do dia"` — 2026-05-21 — cara de IA em CTA
```

- ✅ Data correta (hoje).
- ✅ Formato bate com o exemplo da própria seção.
- ✅ Aparece DEPOIS do comentário HTML `<!-- Lista começa vazia. -->` (ou o substitui).

- [ ] **Step 5: Commit do primeiro banido aprendido**

Run:
```bash
git add .claude/skills/humanizer/SKILL.md
git commit -m "chore(humanizer): +1 banido — \"no fim do dia\""
```

- [ ] **Step 6: Se algum critério falhar — diagnóstico**

Se a skill não detectou feedback: redação dos "Sinais que contam" no Passo 3 precisa ser mais ampla.
Se a skill escreveu sem confirmar: protocolo de 3 passos não tá enfático o suficiente — adicionar "**OBRIGATÓRIO**" na frase de aguardar confirmação.
Se o formato saiu errado: o exemplo da seção `## Banidos aprendidos` precisa ficar mais didático.

Fix com `Edit`, commit `fix(humanizer): <descrição>`, e repetir Steps 1-5 em sessão fresca.

---

## Task 10: Smoke test 3 — Guardrails (duplicata + contradição)

**Objetivo:** validar que a skill recusa adicionar duplicata e detecta candidato que contradiz regra fixa.

- [ ] **Step 1: Smoke duplicata — invocar em sessão fresca**

Em sessão fresca, invoque `/humanizer` com qualquer copy curta que contenha "no fim do dia" (o banido aprendido na Task 9):

```
/humanizer

No fim do dia, o que importa é entregar valor real pro cliente. Vamos te mostrar como.
```

A skill deve processar normalmente (e remover "No fim do dia" graças ao banido aprendido).

Em seguida mande:

```
tira sempre "no fim do dia"
```

- [ ] **Step 2: Critério — recusa de duplicata**

A skill deve responder algo como:

```
"no fim do dia" já está nos Banidos aprendidos (adicionado em 2026-05-21).
Não vou duplicar.
```

- ✅ Identifica que já existe.
- ✅ NÃO usa `Edit`.
- ✅ Mostra contexto do item existente.

Validar:
```bash
git diff .claude/skills/humanizer/SKILL.md
```

Expected: vazio.

- [ ] **Step 3: Smoke contradição — propor algo que bate com regra fixa**

Mande:

```
tira sempre o em-dash do texto — sempre detesto
```

(Em-dash retórico já é Regra fixa #1.)

- [ ] **Step 4: Critério — detecção de contradição**

A skill deve responder algo como:

```
"em-dash retórico" já é Regra fixa #1.
Você quer ajustar/reforçar a Regra fixa #1, ou só ignore esse feedback?
```

- ✅ Detecta sobreposição com regra fixa.
- ✅ NÃO adiciona como banido novo.
- ✅ Oferece alternativa explícita (sem auto-promover).

- [ ] **Step 5: Se algum critério falhar — diagnóstico**

Se duplicata passou: o guardrail "Sem duplicata" precisa virar instrução mais imperativa ("**SEMPRE leia a seção antes de propor**").
Se contradição passou: idem pro guardrail "Sem contradição" — precisa instruir leitura prévia das Regras fixas.

Fix, commit, repetir.

- [ ] **Step 6: Marcar pass**

Smoke 3 ✅. Skill validada end-to-end.

---

## Self-Review (rodar depois de escrever o plano todo, antes do user revisar)

**1. Spec coverage** — para cada seção do spec, qual task cobre:

| Seção do spec | Task(s) |
|---|---|
| Identidade e escopo | Task 1 (frontmatter description), Task 2 (Passos 1-2) |
| Anatomia do SKILL.md | Tasks 1-6 cobrem cada seção |
| 12 Regras fixas | Task 3 |
| Mecanismo de aprendizado (janela, sinais, protocolo) | Task 5 |
| Guardrails | Task 5 + smoke Task 10 |
| Manutenção (consolidação, promoção, rollback) | Task 6 |
| Integração business-brain | Task 2 (Passo 0) |
| Output format | Task 2 (seção Output) |
| Critérios de sucesso #1 (golden path) | Smoke Task 8 |
| Critérios de sucesso #3-4 (zero updates sem confirmação) | Smoke Task 9 |
| Critérios de sucesso #6 (sem duplicata, sem contradição) | Smoke Task 10 |
| Fora de escopo v1 | (não implementar — coberto por exclusão) |

Nenhuma seção do spec sem task associada. ✅

**2. Placeholder scan** — busca por TBD/TODO/placeholder no plano:

Nenhuma ocorrência. Todo bloco de conteúdo tem o markdown final pra colar. ✅

**3. Type consistency** — nomes de seção idênticos entre o skeleton (Task 1) e os Edits subsequentes:

- `## Passo 0 — Calibrar pelo negócio (se aplicável)` → bate ✅
- `## Passo 1 — Receber input` → bate ✅
- `## Passo 2 — Editar (nível médio)` → bate ✅
- `## Output` → bate ✅
- `## Regras fixas (DNA — não mexer sem promoção explícita)` → bate ✅
- `## Banidos aprendidos` → bate ✅
- `## Substituições preferidas` → bate ✅
- `## Passo 3 — Detectar feedback (depois de devolver a copy)` → bate ✅
- `## Manutenção` → bate ✅

Nomes consistentes. ✅

---

## Critério de done

- [ ] `.claude/skills/humanizer/SKILL.md` existe, completo, commitado.
- [ ] `CLAUDE.md` lista `/humanizer` no Skill Index, commitado.
- [ ] Smoke 1 (golden path) passou.
- [ ] Smoke 2 (feedback path) passou — banido `"no fim do dia"` adicionado via protocolo confirmado.
- [ ] Smoke 3 (guardrails) passou — duplicata e contradição recusadas.
- [ ] Todos os fixes intermediários (se houver) commitados com `fix(humanizer): ...`.
