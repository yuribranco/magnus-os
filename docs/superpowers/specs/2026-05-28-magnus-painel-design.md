# Magnus Painel — Design Brief (v2 · revisado pós handoff Claude Design)

> **v1** (2026-05-28 manhã): brainstorming → brief estratégico + 6 telas previstas.
> **v2** (2026-05-28 tarde): após entrega do Claude Design (`Painel Magnus.zip`) + pedido do
> Yuri pra **Tela 7 — Tarefas (Notion embed) dentro do workspace**.
>
> Handoff completo em `~/Documents/Magnus/magnus-imersao/painel-aula-4/claude-design-v1/`.
> Tokens, telas, componentes e patterns visuais agora são **locked** (cobre, Geist, dark único,
> motion 120/180/260ms). Este doc passa a focar em: estratégia, IA da UI, manifest de skill,
> Tela Tarefas nova, e bridge handoff→implementação.
>
> Stack alvo (re-confirmado): Next.js (App Router) + Claude Agent SDK (TS) embutidos em
> `npx magnus-painel`. Roda 100% local, usa o `claude` binary do aluno como motor.
> Implementação via `/ui-ux-pro-max` reusa `tokens.css` e telas JSX do handoff.

---

## 1. Brief executivo

**O que é.** Painel visual local que abstrai o terminal do Claude Code pro operador da
empresa do aluno da Mentoria Magnus. Mesma estrutura initiative-first do template Magnus
(`contexto/` + `.claude/skills/` + `operacao/<campanha>/`) — só que com UI desktop ao invés
de só chat.

**Pra quem.** Aluno da imersão que sabe operar a empresa mas trava no terminal. O painel é
a "porta gentil"; quem domina CC continua usando direto no terminal sem perda de capacidade.

**Como funciona.** O painel descobre skills lendo `.claude/skills/*/SKILL.md` (frontmatter
expandido com bloco `panel:` opcional), renderiza categorizadas na UI, e quando o aluno
clica numa skill executa via Claude Agent SDK. A entrevista do CC vira chat com chips/buttons
pra opções declaradas no manifest. Resultado vira card no workspace. Tarefas geradas no
Notion (via skill `lancar-campanha`) aparecem embedadas numa aba do workspace.

**Vibe-foundation.** Linear/Raycast/Vercel — não Discord/Slack. Calmo, denso, foco.
Dá pra trabalhar 4 horas sem cansar.

---

## 2. Princípios de design (norte)

1. **Workspace-first.** A campanha é o centro. Tudo orbita ela: assets, ações, briefing,
   tarefas, chat. O aluno nunca pergunta "onde eu tô?" — o workspace responde.
2. **Affordances explícitas.** Ações primárias visíveis. Sem hover-pra-revelar, sem menu
   secreto. Non-tech CLICA no que existe.
3. **Estados desabilitados explicam.** Disabled vem com motivo ("Conecte o Notion pra ver
   tarefas aqui") — nunca cinza mudo.
4. **Imagem cidadã de primeira classe.** Criativos inline em tamanho útil; landing iframe;
   Notion iframe; nada importante atrás de "abra no Finder".
5. **Chat e UI conversam.** Imagem gerada na entrevista aparece tanto na bolha do chat
   quanto como card no workspace (mesmo asset, duas ancoragens).
6. **Densidade calma.** Spacing generoso mas não wasteful (base-4). Cards bem espaçados,
   hierarquia tipográfica forte, sem ornamento.
7. **PT-BR conversacional.** "Conte o ângulo", "Renderizando…", "Faltou GEMINI_API_KEY".
8. **Branding suave Magnus OS.** Logo Mentoria Magnus no header; neutros warm (h=60) que
   dialogam com o marrom da marca; accent cobre. Marca do aluno aparece (nome + logo
   opcional), nunca compete.

---

## 3. Personas

### P1 — Marcos, operador non-tech
35-50, dono ou gestor de marketing de empresa pequena/média. Sabe o negócio de cor; trava
em terminal/git/curl. Já viu CC mas se sente vulnerável em tela preta. Quer "fazer as
coisas" sem código. Aceita 1 conceito novo por aula.

### P2 — Júlia, operadora intermediária
28-40, marketing/produto. Já curtiu CC mas pra equipe dela o terminal não escala. Quer
delegar workflows estruturados pro time sem ensinar terminal. Usa painel pra estrutura
+ terminal pra one-offs.

---

## 4. Information architecture

```
Magnus Painel
├── (1) Boot / Onboarding zero   [/boot]
│       └── checklist EMPRESA · TIME · VOZ · DESIGN
│
├── (2) Empresa view              [/]
│       └── overview contexto: EMPRESA · TIME · VOZ · DESIGN · ativos
│
├── (3) Workspace de campanha    [/c/<slug>]   ← center of gravity
│       ├── CampaignHeader (slug + ângulo + ações)
│       ├── TabBar  (Visão geral · Tarefas)              ← NEW v2
│       ├── Tab "Visão geral"   → assets grid (criativos, landing, posts, cronograma)
│       ├── Tab "Tarefas"       → Notion embed da database da campanha   ← NEW v2
│       └── ActionBar sticky bottom (skills)
│
├── (4) Chat livre   (drawer FAB bottom-right, presente em qualquer tela)
│
└── (5) Settings    (modal, paralelo route Next ou state-driven)
        └── GEMINI_API_KEY · MCPs (Canva, Notion) · Permissões tool · Sobre
```

**Navegação top-level:** Sidebar fixa 240px esq com brand (logo light-on-dark, 26px) +
seção `EMPRESA` (1 item) + seção `CAMPANHAS` (lista) + footer status. Clicar empresa →
tela (2). Clicar campanha → tela (3).

---

## 5. Telas

### 5.1 Boot / Onboarding zero  →  `screens/Boot.jsx` no handoff

**Rota**: `/boot` (middleware redireciona `/` → `/boot` se `contexto/EMPRESA.md` não existe).

**Layout**: tela inteira sem sidebar. TopBar minimal (logo Mentoria Magnus 22px + settings).
Hero centrado: meta mono `~/empresas/<empresa> · primeiro acesso` + H1 `--ts-4xl/600` +
subtítulo `--ts-lg/text-secondary`. Grid 4-col de `CheckCard`s (EMPRESA · TIME · VOZ ·
DESIGN). Footer com pill "1 de 4" + CTA "Criar primeira campanha" disabled até VOZ existir.

**CheckCard estados**: vazio (check circle vazio + CTA "Preencher →") · preenchendo
(spinner + "Conversando com o Claude…") · preenchido (check verde + preview + "ver/editar").

**Interação**: clicar card → abre Skill Runner com `preencher-<contexto>`.

---

### 5.2 Empresa view  →  `screens/Empresa.jsx`

**Rota**: `/` (default pós-onboarding).

**Layout**: AppShell (Sidebar 240 + main). TopBar com breadcrumbs `<empresa> / empresa`,
busca à direita, ícones bell + settings. Conteúdo: padding 28/32, gap 20.

`PageHeader`: avatar 48px quadrado com inicial (gradient `accent-glow → transparent`,
border `--border-subtle`, mono 20/600) + nome empresa + subtítulo. Direita: meta line +
refresh + "Abrir pasta" (external).

Grid 1: `1fr 1fr 1fr` gap 16 — `ContextCard EMPRESA · TIME · VOZ`.
Grid 2: `1fr 1.4fr` gap 16 — `ContextCard DESIGN · Ativos`.

**ContextCard genérico**: ícone accent + title + pill (`success "ok"` ou
`warning "incompleto"`) + meta line `contexto/<file>.md · há N dias` + body específico +
footer com filename mono dim + botão ghost "Editar".

**Empty state por card**: arquivo de contexto não existe → vira CTA "Preencher EMPRESA"
com mesma micro-copy do onboarding.

---

### 5.3 Workspace de campanha  →  `screens/Workspace.jsx` + extensão Tela 7

**Rota**: `/c/[slug]`.

**Estrutura atualizada v2:**

```
TopBar (breadcrumbs · "Checar marca" ghost à direita)
CampaignHeader (pill ativa + meta path + H1 slug + label "ÂNGULO" + ângulo + actions direita)
TabBar (Visão geral · Tarefas)                                            ← NEW v2
↓ tab ativa preenche este espaço (scroll independente) ↓
ActionBar (sticky bottom, skills sempre disponíveis em ambas tabs)
ChatFab (bottom-right, em ambas tabs)
```

**TabBar visual**: linha de 40px de altura, padding `0 32px`, border-bottom `--border-faint`.
Tabs em mono uppercase (`--ts-xs`, letter-spacing 0.08em, `--text-tertiary`). Tab ativa:
`--text-primary` + border-bottom inset 2px `--accent` (mesmo padrão do sidebar item active).
Tabs com ícone à esquerda (14px). Espaço de respiro `gap 24` entre tabs.

#### 5.3.1 Tab "Visão geral" (default) — `Icons.layers`

Conteúdo idêntico ao Workspace atual do handoff:
- Grid `1.7fr 1fr` gap 16, padding `0 32px 20px`, flex 1.
- Coluna esquerda: `CriativosCard` (header + meta + grid 3-col de `CreativeCard` + `CreativeNew`).
- Coluna direita stacked: `LandingCard` + `PostsCard` + `CronogramaCard`.
- Estados de asset highlighted (recém-criados) com halo accent-glow.
- Skill rodando: workspace comprime 100% → 50% e Skill Runner ocupa direita.

#### 5.3.2 Tab "Tarefas" (NEW v2) — `Icons.check` ou `Icons.chess`

**Propósito.** Mostrar a database/page do Notion criada pela skill `lancar-campanha`
embedada no painel — aluno vê as tarefas estruturadas da campanha sem trocar de janela.

**Pre-condição.** O skill `lancar-campanha` ao rodar deve persistir em
`operacao/<campanha>/notion.json`:

```json
{
  "workspace_id": "abc123",
  "database_id": "xyz789",
  "url": "https://www.notion.so/<workspace>/<page-id>",
  "embed_url": "https://www.notion.so/<workspace>/<page-id>?embed=1",
  "synced_at": "2026-05-28T14:21:00Z"
}
```

**Layout** (preenche o espaço entre TabBar e ActionBar):

```
┌─ Tarefas sub-header (40px, padding 12/32) ─────────────────────┐
│ Icons.dot + meta-mono "operacao/<slug>/notion.json"             │
│ pill (status Notion) + spacer                                   │
│ btn ghost "Sincronizar" (Icons.arrow rotate)                    │
│ btn ghost "Abrir no Notion" (Icons.external)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─ NotionEmbedFrame ─────────────────────────────────────────┐ │
│  │ iframe                                                     │ │
│  │   src={notion.embed_url}                                   │ │
│  │   sandbox="allow-same-origin allow-scripts allow-popups    │ │
│  │            allow-forms allow-top-navigation-by-user-       │ │
│  │            activation"                                     │ │
│  │   referrerpolicy="no-referrer"                             │ │
│  │   loading="lazy"                                           │ │
│  │   style="width: 100%; height: 100%; border: 0;             │ │
│  │          border-radius: var(--r-xl); background: --bg-     │ │
│  │          input;"                                           │ │
│  │ {!loaded && <SkeletonShimmer />}                           │ │
│  └────────────────────────────────────────────────────────────┘ │
│  (margin 16/32, flex 1, min-height 0)                           │
└─────────────────────────────────────────────────────────────────┘
```

**Sub-header pill de status Notion** (3 estados):
- `pill--success` "● conectado" — MCP autenticado E `notion.json` existe
- `pill--warning` "● não sincronizado" — MCP autenticado E `notion.json` não existe ainda
- `pill--ghost` "○ desconectado" — MCP não autenticado

**Empty states da tab Tarefas** (substituem o iframe quando aplicável):

**Estado A — Notion não conectado**
```
┌──────────────── EmptyState centralizada ────────────────┐
│                                                          │
│                    [Icons.plug 32px] (color accent)      │
│                                                          │
│             Conecte o Notion pra ver as                  │
│                  tarefas aqui                            │
│                                                          │
│         As tarefas da campanha aparecem direto           │
│       no painel quando você roda Lançar campanha.        │
│                                                          │
│           [Conectar Notion]  (btn primary)               │
│                                                          │
│              precisa do MCP do Notion ativo              │
└──────────────────────────────────────────────────────────┘
```
Click "Conectar Notion" → abre Settings modal e foca seção MCPs > Notion (scroll + focus ring).

**Estado B — Notion conectado, sem lançamento ainda**
```
┌──────────────── EmptyState centralizada ────────────────┐
│                                                          │
│                  [Icons.rocket 32px] (color accent)      │
│                                                          │
│           Estruture o lançamento desta                   │
│          campanha pra criar as tarefas                   │
│                                                          │
│        Lançar campanha faz a entrevista Schwartz,        │
│       gera cronograma e popula uma database no Notion.   │
│                                                          │
│           [Lançar campanha]  (btn primary)               │
│                                                          │
│           cria operacao/<slug>/notion.json               │
└──────────────────────────────────────────────────────────┘
```
Click "Lançar campanha" → dispara Skill Runner com `lancar-campanha` (mesma campanha pré-selecionada).

**Estado C — Conectado + lançamento existe** → renderiza `NotionEmbedFrame` (default).

**Estado D — Erro carregar iframe** (Notion offline, page deletada, etc):
banner `bg-elevated` border `--danger-glow` "Não consegui carregar do Notion. [Tentar de
novo] · [Abrir no Notion]".

**Estado E — Sincronizando** (loading inicial, ou após "Sincronizar"):
skeleton shimmer cobrindo a área do iframe + label discreto "Carregando Notion…".

**Comportamento:**
- TabBar persiste entre navegações da campanha (lembrar última tab por campanha em
  `.magnus-painel/state.json`).
- Tab "Tarefas" badge: se há tarefas novas desde a última visita, mostrar pill accent micro
  "novo" à direita do label (opcional v1).
- "Sincronizar" → re-fetch do iframe (force reload via cache-busting `?t=<timestamp>`).
- ActionBar funciona igual em ambas tabs (criar criativo etc. ainda disponível, mesmo na
  tab Tarefas — não obriga o aluno a voltar).
- Skill `checar-marca` (no header da campanha) funciona em ambas tabs.

---

### 5.4 Chat livre (drawer)

`ChatFab` bottom-right (background `--bg-elevated`, border `--border-default`, shadow md,
padding 10/14, hover vira accent). Click → drawer slide-up 260ms, ocupa 30-40% da altura
por padrão. Toggle "expandir" → 100%.

Conteúdo: stream de mensagens (Claude + aluno) sem template/skill + textarea + send. Header
com "novo chat" / "fixar" / "fechar". Contexto: empresa toda (CLAUDE.md + AGENTS.md +
`contexto/`), NÃO de campanha específica.

Persistência: `.magnus-painel/chats/<uuid>.json` (não commitado).

---

### 5.5 Skill Runner — Interview + Done  →  `screens/SkillRunner{Interview,Done}.jsx`

Side-panel direito 50% da main quando rodando. Estrutura (ver handoff README §4-5):

- **Header** (12/16): ícone accent da skill + title + minimizar/expandir/fechar + status pill.
- **Form pill colapsado**: após submit do start_form, vira barra horizontal com label mono
  "CONTEXTO" + pill mono slug + separator + texto resumido das respostas + edit ícone.
- **Thread**: bolhas `Bubble` (avatar 24px circular: accent-glow + spark pro Claude;
  bg-elevated + inicial "Y" pro user) + `AnswerChips` (chips do manifest, hover border
  accent, selected = accent fill) + `ToolPill` (spinner + label mono 11 + tempo).
- **Composer** sticky bottom: textarea + send.

**Estados**: idle (só start_form) · running (thread ativo) · awaiting permission (bolha
amarela com aprovar/rejeitar) · done (header pill success + `DoneSummary` no rodapé do
thread com path + lista de outputs + "Abrir pasta" + "Rodar de novo") · error (bolha
vermelha + retry + "ver no terminal").

Cada run = arquivo em `.magnus-painel/runs/<timestamp>-<skill>.json` (sessão, prompts,
eventos, resultado).

---

### 5.6 Settings modal  →  `screens/Settings.jsx`

Scrim `--bg-overlay` + backdrop-blur 4px sobre workspace dimmed (blur 2px + opacity 0.5).
Modal 560px width, `--bg-surface` + border subtle + radius 2xl + shadow lg.

Seções (`.modal__section` border-bottom faint):
1. **API keys** — GEMINI_API_KEY (success pill + masked + "Atualizar" + hint accent
   "obter chave →") · ANTHROPIC_API_KEY (ghost pill "via claude binary" + dim
   "o painel usa o login local").
2. **MCPs** — Canva (success pill + email + "Desconectar") · Notion (ghost pill
   "não conectado" + "Autenticar" primary). **Importante v2**: o focus ring deve poder
   ser triggado externamente quando vem da Tab Tarefas estado A — passar query param
   `?focus=notion` ou state que rola scroll + ring accent 3px na linha do Notion.
3. **Permissões de tool** — 3 radio-rows: "Perguntar sempre" · "Confiar nas skills
   declaradas" (selected + pill accent "recomendado") · "Confiar em tudo" (pill warning
   "dev mode").
4. **Sobre** — versão mono · repo link accent · toggle verbose mode.

---

## 6. Component inventory (revisado)

### Layout primitives
| Componente | Função | Notas |
|---|---|---|
| `AppShell` | grid 240px + 1fr, height 100vh | data-accent wrapper aqui |
| `Sidebar` | brand + EMPRESA + CAMPANHAS + footer | active state = bg accent-glow + inset 2px accent |
| `TopBar` | breadcrumbs + right slot + bell + settings | sticky |
| `SidePanel` | header + form-pill + thread + composer | slide 260ms |
| `ChatFab` + `ChatDrawer` | FAB bottom-right + slide-up | persistente em todas telas |
| **`TabBar`** ★ NEW | tabs horizontais mono uppercase | active = border-bottom 2px accent |

### Cards
| Componente | Onde |
|---|---|
| `Card` (variants default, elevated) | base |
| `CheckCard` | Boot |
| `ContextCard` | Empresa view |
| `CreativeCard` / `AssetCard` | Workspace > Visão geral |
| `PostCard` | Workspace > Visão geral |
| `CronogramaItem` | Workspace > Visão geral |
| **`NotionEmbedFrame`** ★ NEW | Workspace > Tarefas — iframe wrapper + skeleton |
| **`TasksEmptyState`** ★ NEW | Workspace > Tarefas — 3 variantes (A/B/C-error) |

### Inputs / Form
| Componente | Notas |
|---|---|
| `Input`, `Textarea`, `Select` | focus = border accent + 3px glow `--shadow-focus` |
| `Chip` | default + selected (accent fill) |
| `Toggle` | pill 32×18, accent on |
| `RadioRow` | block radio com title + sub |
| `CampanhaPicker` | select especial preenchido pelo scan `operacao/*/` |
| `FilePicker` / `Dropzone` | dropzone com `+` icon empty state |

### Status / Feedback
| Componente | Variants |
|---|---|
| `Pill` | default · accent · success · warning · danger · mono · ghost |
| `ToolPill` | mono 11 inline, spinner ou check |
| `PermissionPrompt` | bolha warning com aprovar/rejeitar; aprovado vira opacity 0.7 + check |
| `DoneSummary` | bg success-glow + path mono + lista outputs + ações |
| `Bubble` | claude + user variants |
| `ImageInline` | wrapper imagem com border + radius + lightbox on click |
| `EmptyState` | ícone accent + título + sub + CTA + dim hint |

### Buttons
| Componente | Props |
|---|---|
| `Button` | variant: primary · secondary · ghost · danger · size: sm · default · lg · disabled |
| `IconButton` | 28×28 square, hover bg-hover |

### Modals / overlays
| Componente | Quando |
|---|---|
| `SettingsModal` | clicar ⚙ (suporta focus=<section> via query param/state) |
| `AssetViewer` | clicar asset → lightbox imagem ou iframe HTML landing |
| `ConfirmModal` | ações destrutivas (arquivar campanha, excluir asset) |
| `NewCampaignModal` | clicar "+ Nova campanha" |

---

## 7. Padrões de interação

### 7.1 Skill discovery → render
1. Painel scaneia `.claude/skills/*/SKILL.md` no boot e em file-watch.
2. Parseia frontmatter YAML (`gray-matter` ou similar).
3. Se há bloco `panel:`, lê `category`/`icon`/`requires`/`start_form`/`interview`/`output`.
4. Se não há, fallback: name + description + free-prompt textarea.
5. Agrupa por categoria; ordena por `panel.order` ou alfabético.

### 7.2 Categorias canônicas → onde renderiza
- `configurar` → preencher contexto. Aparece no Boot + Empresa view (ação dos cards).
- `produzir` → criar-criativo, criar-landing, criar-post. ActionBar do workspace.
- `lancar` → lancar-campanha. Ação destacada do workspace + CTA da Tab Tarefas estado B.
- `auditar` → checar-marca. Botão discreto no header da campanha.
- `outro` → menu "+ mais skills".

### 7.3 Golden path "criar primeiro criativo" (referência completa)
Já implementado no handoff em §"Interactions & Behavior > Golden path". 16 steps. Não duplica
aqui — ver `claude-design-v1/README.md`. Highlights:
- Side panel slide-in 260ms; workspace comprime 100% → 50%.
- start_form colapsa em pill após submit.
- Painel detecta `interview.<campo>.options` no manifest → renderiza chips.
- file-watcher detecta arquivo novo → emite SSE → `ImageInline` no chat + `AssetCard`
  com halo highlighted no workspace.

### 7.4 Onboarding flow
Boot → 4 CheckCards → cada clique abre Skill Runner com `preencher-<contexto>` →
ao concluir, file-watcher detecta `contexto/<file>.md` novo → CheckCard vira preenchido
→ quando EMPRESA + VOZ existem, CTA "Criar primeira campanha" libera.

### 7.5 File watching
Watcher (chokidar) em `contexto/**` e `operacao/**`. Mudança → broadcast SSE → browser
atualiza sem reload. Permite editor externo (aluno edita em VS Code, painel reflete <500ms).

### 7.6 ★ NEW — Conectar Notion (a partir da Tab Tarefas estado A)
1. Aluno na Tab Tarefas vê empty state A (Notion não conectado).
2. Clica "Conectar Notion".
3. Painel abre `SettingsModal` com state `focus: "notion"`.
4. Modal scrolla até seção MCPs, e a linha do Notion ganha focus ring `--shadow-focus`
   por 1.2s pra chamar atenção.
5. Aluno clica "Autenticar" → dispara `/mcp` no CC via Agent SDK → CC abre browser pra
   OAuth → callback grava token no MCP local.
6. Painel detecta MCP autenticado (polling 1Hz após click, max 60s) → atualiza state.
7. Modal pode fechar manualmente ou auto após sucesso (toast "Notion conectado").
8. Tab Tarefas re-renderiza: estado A → B (se sem `notion.json`) ou C (se já há).

### 7.7 ★ NEW — `lancar-campanha` grava `notion.json`
A skill `lancar-campanha` (atualizada como parte da implementação v2) deve:
1. Fazer entrevista Schwartz (10 perguntas).
2. Gerar CRONOGRAMA.md + TAREFAS.md em `operacao/<campanha>/`.
3. Chamar Notion API via MCP pra criar/atualizar database de tarefas.
4. **Gravar `operacao/<campanha>/notion.json`** com `{workspace_id, database_id, url,
   embed_url, synced_at}` — esse é o gatilho que faz a Tab Tarefas sair do estado B pro C.
5. Frontmatter atualizado: `panel.output.notion: true` (sinaliza ao painel pra exibir
   pill success "tarefas no Notion" no DoneSummary).

### 7.8 ★ NEW — Tab Tarefas rendering decision tree
```
const tarefasState = computeState({
  mcpNotionConnected: /* state.mcps.notion === "authenticated" */,
  notionFileExists: /* fs.existsSync(operacao/<slug>/notion.json) */,
  iframeError: /* iframe load error flag */,
})

switch (tarefasState) {
  case "disconnected":     return <EmptyStateA />;
  case "no-launch":        return <EmptyStateB />;
  case "ready":            return <NotionEmbedFrame url={notion.embed_url} />;
  case "iframe-error":     return <ErrorBanner /> + retry;
  case "syncing":          return <SkeletonShimmer />;
}
```

### 7.9 Side panel + sidebar active state
Side panel slide: `transform: translateX(100% → 0)` easing `cubic-bezier(.32,.72,.24,1)`,
260ms. Workspace simultaneamente: `grid-template-columns: 1fr 0 → 1fr 1fr` (mesma duração).
Sidebar item active: background `--accent-glow`, color `--text-primary`, inset 2px 0 0
`--accent` na esquerda.

### 7.10 Permission prompt
Slide-up dentro do thread (`opacity 0 → 1`, `translateY(8px → 0)`, 180ms). "Aprovar" primary,
"Rejeitar" ghost. Aprovado → opacity 0.7 + título substitui warn por check success.

### 7.11 Accessibility & motion
- Focus visível: 3px ring `--shadow-focus` (= `0 0 0 2px var(--accent-glow)`).
- Hit targets: icon-btn 28×28, btn sm height 32.
- aria-labels em todos os icon-buttons.
- `prefers-reduced-motion`: respeitar — desligar slide, usar fade instantâneo.
- Keyboard: `⌘K` palette (reservado v2), `⌘,` settings, `⌘N` nova campanha, `Esc` fecha
  modal/sidepanel.

---

## 8. Tom de voz / copy (PT-BR)

Princípios: imperativo amigável ("Conte", "Escolha") · status descreve ação ("Renderizando…",
"Conversando com Claude…") · erros apontam caminho ("Faltou GEMINI_API_KEY. Cole em
Configurações.") · vazio é convite · disabled explica via tooltip.

**Copys-chave** (v2 inclui Tarefas):

| Lugar | Copy |
|---|---|
| Boot welcome | Comece descrevendo sua empresa pro Magnus. |
| Boot sub | São 4 conversas curtas. Você fala, ele escreve. Depois vem a primeira campanha. |
| Workspace empty | Sua campanha está pronta. O que você quer criar primeiro? |
| Sidebar sem campanha | Nenhuma campanha ainda. [+ Criar primeira campanha] |
| Permission prompt | O Claude quer rodar `gen_image.sh`. Pode? |
| Done summary criativo | Pronto. 2 imagens em operacao/<camp>/criativos/<data>/. [Abrir pasta] |
| Done summary lancar | Lançamento estruturado. Tarefas no Notion + cronograma em arquivos. [Ver tarefas] |
| Error generic | Algo travou. [Tentar de novo] · [Ver no terminal] |
| Sidebar headings | EMPRESA · CAMPANHAS (mono caps, --ts-2xs, letter-spacing .08em) |
| **TabBar Visão geral** | Visão geral |
| **TabBar Tarefas** | Tarefas |
| **Tarefas state A título** | Conecte o Notion pra ver as tarefas aqui |
| **Tarefas state A sub** | As tarefas da campanha aparecem direto no painel quando você roda Lançar campanha. |
| **Tarefas state A CTA** | Conectar Notion |
| **Tarefas state A hint** | precisa do MCP do Notion ativo |
| **Tarefas state B título** | Estruture o lançamento desta campanha pra criar as tarefas |
| **Tarefas state B sub** | Lançar campanha faz a entrevista Schwartz, gera cronograma e popula uma database no Notion. |
| **Tarefas state B CTA** | Lançar campanha |
| **Tarefas state B hint** | cria operacao/<slug>/notion.json |
| **Tarefas loading** | Carregando Notion… |
| **Tarefas erro iframe** | Não consegui carregar do Notion. |
| **Tarefas sync btn** | Sincronizar |
| **Tarefas open btn** | Abrir no Notion |

---

## 9. Decisões visuais (LOCKED — handoff Claude Design 2026-05-28)

> Todos os tokens em `tokens.css` do handoff. Copiar 1:1 pro `styles/tokens.css` no Next.js.

| Categoria | Decisão |
|---|---|
| Tema | Dark único v1 (light fica pra v2) |
| Base hue | h=60 warm-leaning (não cinza-azulado) — dialoga com marrom Mentoria Magnus |
| Accent | **Cobre** (default). Terra e Âmbar disponíveis via `data-accent="terra|ambar"` em wrapper |
| Type | Geist + Geist Mono (via `next/font/google`) |
| Type scale | 10–48px (10 níveis: 2xs/xs/sm/base/md/lg/xl/2xl/3xl/4xl/5xl) |
| Line-height | tight 1.15 · snug 1.30 · base 1.50 · loose 1.65 |
| Weights | 400 · 500 · 600 · 700 |
| Spacing | base-4 (4/8/12/16/20/24/32/40/48/64) |
| Radius | xs 4 · sm 6 · md 8 (btns/inputs) · lg 10 · xl 14 (cards) · 2xl 18 (modal) · pill 999 |
| Shadows | xs/sm/md/lg/popover + focus ring `0 0 0 2px var(--accent-glow)` |
| Motion | fast 120ms · base 180ms · slow 260ms · easing `cubic-bezier(.32,.72,.24,1)` |
| Iconografia | Lucide-style, stroke 1.6, viewBox 16, `currentColor` |
| Logo | `assets/logo-magnus-horizontal-light.png` (variante light-on-dark) no Sidebar/header |
| Patterns marcados | sidebar active = inset 2px accent · asset highlighted = halo accent-glow · form pill colapsado pós-submit · side panel 50/50 split |
| Não fazer | gradients neon · emoji excess · borda left-accent decorativa · fontes infladas · animations elaboradas · cores fora do DS |

---

## 10. Referências (mood) — confirmadas

**Evocar:** Linear (densidade, hierarquia, calmo) · Raycast (surfaces, chat-as-tool) ·
Vercel dashboard (neutral, professional, weighty) · Notion (dual surfaces sidebar+main,
SEM o ornamento).

**Evitar:** Discord/Slack (busy, jovem) · ChatGPT.com (chat domina sem workspace) ·
Figma plugins (apertado, sem identidade) · Material You (playful demais) · "AI app" típico
(gradients neon, dark purple, emoji excess).

---

## 11. Fora de escopo (v1 / Aula 3 (incremento))

- ❌ Multi-empresa switcher (cada `npx magnus-painel` é scoped ao cwd; trocar empresa = trocar cwd)
- ❌ Time / colaboração / contas
- ❌ Histórico timeline de runs como view (salva em `.magnus-painel/runs/` mas sem UI)
- ❌ Light mode (fica pra v2; dark único)
- ❌ Editor in-place de `contexto/*.md` (clica → abre no editor padrão do SO ou no chat)
- ❌ Personalizar cores do painel com a paleta do aluno (só logo + nome)
- ❌ Mobile / responsive < 1024px (desktop-only v1)
- ❌ i18n (só PT-BR)
- ❌ ⌘K command palette (reservado, fica pra v2)
- ❌ **Notion render nativo via API + componentes do painel** (v1 = iframe puro; v2 pode
      adicionar toggle "lista nativa" que usa Notion API + `TaskCard` próprio)
- ❌ **Filtros/views customizadas na tab Tarefas** (v1 = database raw do Notion;
      filtros são feitos no Notion mesmo)
- ❌ **Two-way sync Notion ↔ painel** (v1 = read-only; edição acontece no Notion via embed)
- ❌ **Badge "novo" na tab Tarefas** (opcional v1; default sem)

---

## 12. Entregue pelo Claude Design (v1) ✅

`~/Documents/Magnus/magnus-imersao/painel-aula-4/claude-design-v1/design_handoff_magnus_painel/`

| Arquivo | O que tem |
|---|---|
| `README.md` (600+ linhas) | Spec quase-eng: tokens, telas, components, interações, state mgmt, assets, a11y, anti-padrões |
| `tokens.css` | Tokens completos (warm neutrals h=60, 3 accents, semantic, marca, type, spacing, radius, shadows, motion) — copiar 1:1 |
| `app.css` | Specs visuais dos componentes (referência, não copiar) |
| `app.jsx` | Composição design canvas |
| `icons.jsx` | 30+ ícones line-style lucide-compatíveis (size 14 default, currentColor) |
| `shell.jsx` | Sidebar + TopBar + macOS frame wrapper |
| `screens/Boot.jsx` | Onboarding |
| `screens/Empresa.jsx` | Empresa view |
| `screens/Workspace.jsx` | Workspace de campanha (Tab "Visão geral") |
| `screens/SkillRunnerInterview.jsx` | Skill Runner durante entrevista |
| `screens/SkillRunnerDone.jsx` | Skill Runner pós-render |
| `screens/Settings.jsx` | Modal de configurações |
| `screens/DesignSystem.jsx` | Display de tokens (não vai pro produto) |
| `assets/logo-magnus-horizontal.png` | Logo original (dark-on-light) |
| `assets/logo-magnus-horizontal-light.png` | Logo light-on-dark (usar no sidebar/header) |

**Faltando (entregue por esta v2):** Tela 7 — Workspace > Tab Tarefas (Notion embed) — spec em §5.3.2.

---

## 13. Decisões travadas

| # | Decisão | Origem |
|---|---|---|
| 1 | Center of gravity = workspace por campanha | brainstorming |
| 2 | Execução = form curto + entrevista guiada com chips de affordance | brainstorming |
| 3 | Distribuição = `npx magnus-painel` | brainstorming |
| 4 | Onboarding = checklist com skills produtivas desabilitadas até EMPRESA+VOZ | brainstorming |
| 5 | Skill manifest = bloco `panel:` opcional no frontmatter YAML do `SKILL.md` (fallback free-prompt) | brainstorming |
| 6 | Tech execução = Claude Agent SDK (TS) dirigindo o `claude` binary do aluno | brainstorming |
| 7 | Stack UI = Next.js (App Router) embutido no pacote npx | brainstorming |
| 8 | Mobile/responsive < 1024px = fora de escopo v1 | brainstorming |
| 9 | Accent = cobre (default); terra e âmbar disponíveis via `data-accent` | handoff |
| 10 | Type = Geist + Geist Mono via `next/font/google` | handoff |
| 11 | Dark mode único v1 | handoff |
| 12 | Motion = 120/180/260ms cubic-bezier(.32,.72,.24,1); `prefers-reduced-motion` respeitar | handoff |
| 13 | Sidebar active = bg accent-glow + inset 2px accent | handoff |
| 14 | Side panel = slide 260ms + workspace comprime 100%→50% simultâneo | handoff |
| 15 | Asset highlighted = halo accent-glow + accent-dim border (sem mover card) | handoff |
| 16 | Form pill colapsado pós-submit do start_form | handoff |
| 17 | Keyboard = ⌘, settings · ⌘N nova campanha · Esc fecha (⌘K reservado v2) | handoff |
| 18 | Workspace tem `TabBar` (Visão geral · Tarefas) | v2 (este doc) |
| 19 | Tarefas = iframe Notion embed (read-only); render nativo opt-in fica pra v2 | v2 (este doc) |
| 20 | `lancar-campanha` deve gravar `operacao/<slug>/notion.json` como gatilho do estado pronto | v2 (este doc) |

---

## 14. Próximos passos

1. **Yuri** → revisa este spec v2 + checa Tela Tarefas alinha com o que você queria.
2. **Yuri** → opcional: gera mock visual da Tab Tarefas no Claude Design (3 estados A/B/C +
   error + loading) — útil mas não bloqueante; spec aqui já é implementável.
3. **Claude (eu)** → invocar `/ui-ux-pro-max` pra implementar tudo:
   - Setup pacote `magnus-painel` (Next.js + Agent SDK sidecar)
   - Copiar `tokens.css` + Geist via `next/font/google`
   - Implementar componentes do inventory §6 (incluindo `TabBar`, `NotionEmbedFrame`,
     `TasksEmptyState`)
   - Implementar todas as telas (Boot, Empresa, Workspace com tabs, SkillRunner,
     Settings com `focus=notion`)
   - Implementar parser de skills (`lib/skills.ts` lendo frontmatter `panel:`)
   - Implementar `lib/watcher.ts` (chokidar + SSE)
   - Implementar `lib/agent-sdk.ts` (wrapper do Claude Agent SDK)
   - Implementar `lib/notion.ts` (resolver state da Tab Tarefas: MCP status + `notion.json`)
   - Escrever 4 skills novas: `preencher-empresa`, `preencher-time`, `preencher-voz`,
     `preencher-design` (substituem os 4 prompts do cheat-sheet da Aula 3)
   - Atualizar 5 skills atuais: `criar-criativo`, `criar-landing`, `criar-post`,
     `lancar-campanha`, `checar-marca` — adicionar bloco `panel:` no frontmatter
   - **Atualizar `lancar-campanha`**: gravar `operacao/<campanha>/notion.json` após criar
     database no Notion (gatilho da Tab Tarefas estado C)
4. **Yuri** → testa, ajusta vibe (pode trocar pra terra/âmbar via data-accent), grava
   roteiro da Aula 3 (incremento) incluindo a demo da Tab Tarefas.

---

## 15. Mapeamento handoff → implementação Next.js

Estrutura sugerida do pacote `magnus-painel` (do README do handoff §"Stack de implementação alvo"):

```
magnus-painel/
├── package.json                    bin: "magnus-painel"
├── next.config.js
├── app/                            App Router
│   ├── layout.tsx                  AppShell + import tokens.css global + data-accent wrapper
│   ├── boot/page.tsx               Onboarding (redirect-from /)
│   ├── page.tsx                    Empresa view (/)
│   ├── c/[slug]/page.tsx           Workspace com tab system (Visão geral / Tarefas)
│   ├── settings/page.tsx           Modal route paralelo
│   └── api/
│       ├── skills/route.ts         lista skills via parseSkills()
│       ├── run/route.ts            dispara skill via Agent SDK, stream SSE
│       ├── watch/route.ts          file-watcher → SSE
│       ├── chat/route.ts           chat livre
│       └── notion/route.ts ★ NEW   lê notion.json + status MCP, retorna state da Tab Tarefas
├── components/
│   ├── Sidebar.tsx
│   ├── TopBar.tsx
│   ├── TabBar.tsx ★ NEW
│   ├── Card.tsx
│   ├── Button.tsx
│   ├── Chip.tsx
│   ├── Pill.tsx
│   ├── ChatBubble.tsx
│   ├── ToolPill.tsx
│   ├── PermissionPrompt.tsx
│   ├── DoneSummary.tsx
│   ├── CheckCard.tsx
│   ├── AssetCard.tsx
│   ├── SkillRunner.tsx             side-panel direito
│   ├── ChatDrawer.tsx
│   ├── NotionEmbedFrame.tsx ★ NEW
│   └── TasksEmptyState.tsx ★ NEW
├── lib/
│   ├── agent-sdk.ts                wrapper Claude Agent SDK
│   ├── skills.ts                   parser frontmatter `panel:`
│   ├── watcher.ts                  chokidar contexto/ + operacao/
│   ├── notion.ts ★ NEW             resolve state Tarefas (MCP + notion.json)
│   └── store.ts                    Zustand/Jotai
├── styles/
│   ├── tokens.css                  COPIAR 1:1 do handoff
│   └── globals.css                 reset + base + utilities
└── public/
    └── logo-magnus-light.png       light-on-dark do handoff
```

**Estado client (`store.ts`)** — adicionar ao schema do handoff §"State Management":

```ts
type AppState = {
  // ... (campos do handoff)
  activeTab: Record<string /* slug */, "overview" | "tasks">;  // ★ NEW
  notion: {
    mcpStatus: "disconnected" | "authenticating" | "authenticated" | "error";
    perCampaign: Record<string /* slug */, NotionJson | null>;  // lido de operacao/<slug>/notion.json
  };  // ★ NEW
};
```

**Server actions adicionais:**
- `getTabState(slug)` → resolve estado A/B/C/error/syncing pra Tab Tarefas
- `triggerNotionAuth()` → dispara `/mcp` no CC; polling até MCP authenticate
- `refreshNotionEmbed(slug)` → cache-bust + re-render iframe

---

*Brainstorming via `/superpowers:brainstorming ultrathink` em 2026-05-28 (manhã).*
*Revisado pós entrega do Claude Design em 2026-05-28 (tarde) — adicionada Tela 7 (Tarefas).*
