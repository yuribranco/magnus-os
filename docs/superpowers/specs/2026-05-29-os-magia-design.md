# Magnus OS v1 — "A Mágica Aparecer" + Auto-update (design)

> Data: 2026-05-29 · Projeto: magnus-os · Prioridade nº1: **Mágica** (encantar quem entra).
> Fundamentado em: análise de código (sessão 2026-05-29) + deep-research (20 achados confirmados,
> `wc6wp96dn`). Decisões travadas via brainstorming com o Yuri.

## Objetivo

Fazer o **resultado do trabalho aparecer e impressionar**. Hoje o produto roda as skills mas o
"momento do wow" está **vazio** — o usuário gera um criativo e não vê nem consegue abrir. Como a
prioridade é encantar quem entra, o v1 conserta isso e completa o auto-update invisível.

## Decisões travadas (brainstorming)

- **Comprador = Mix** (uns têm Claude Code, outros não). O onboarding ramificado fica pra um v2 de
  ativação — **não** entra neste v1 (foco é Mágica, não ativação).
- **Onboarding mantido como está** (os 4 contextos, já melhorados nas correções de 2026-05-29).
  **Sem** pré-preenchimento por URL e **sem** "criativo mágico antes do onboarding" — decisão do
  Yuri: criativo sem contexto = criativo fraco = anti-mágica. (Extração por URL fica como evolução
  futura opcional, não-v1.)
- **Escopo v1 = CORE (a mágica aparecer) + Completar o auto-update.** Segurança (travar agente ao
  workspace) e Cortes ficam fora deste v1 — registrados em "Fora de escopo".

## Princípios da pesquisa que guiam o design

- Revelar o resultado é o momento do wow; traduzir tool-calls em linguagem de negócio (✅ já feito);
  streaming de progresso em tempo real; mostrar o plano antes de agir (UM preview por tarefa, não
  confirmar a cada passo); auto-update invisível e data-safe (checa no launch, aplica no restart,
  aviso não-bloqueante). Fontes: Smashing/Microsoft Design/GitLab (agentic UX), Electron/Tauri docs.

---

## Workstream A — "A mágica aparecer" (CORE)

### A1. Revelar o resultado (consertar o "wow vazio")

**Problema (verificado no código):**
- `lib/agent-sdk-map.ts:54` hardcoda `outputs: []` no evento `done` → o `DoneSummary` nunca lista nada.
- `components/ChatBubble.tsx:127` — links do `DoneSummary` são `href="#"` mortos; o `SkillRunner` não
  passa `onOpenFolder`/`onRerun`.
- O mapper **nunca emite `image_inline`/`file_created`** → a imagem gerada não aparece na run.

**Solução (reaproveita o file-watcher, evita parsing frágil de tool-output):**
1. **Correlação run × arquivos.** A run conhece sua campanha (`activeRun.startForm.campanha`) e
   registra `startedAt` no início. Dois mecanismos, sem parsing frágil de tool-output:
   - **Live (inline):** o cliente já recebe `WatchEvent` via `/api/watch/stream` (`FileWatcherSync`).
     Durante uma run ativa, eventos `file_added`/`file_changed` cujo `relPath` cai em
     `operacao/<slug>/` são tratados como outputs daquela run.
   - **No `done` (resumo determinístico):** scan server-side de `operacao/<slug>/` por arquivos com
     `mtime >= startedAt` → lista canônica de outputs (não depende de timing do watcher).
2. **Reveal inline durante a run.** Quando um output é imagem (`.png/.jpg/.webp/...`), renderizar
   thumbnail inline na Thread do `SkillRunner` (via `/api/files?p=<relPath>`), com legenda
   "criativo gerado". Para outros arquivos (landing/post), um card "arquivo criado: <nome>".
3. **DoneSummary real.** No `done`, popular `outputs` com os relPaths do scan. Cada item:
   - preview/abre via `/api/files?p=<relPath>` (imagens) e
   - **"Abrir pasta"** via `POST /api/files/reveal {rel}` (já existe, abre Finder/Explorer).
4. **Tela de revelação premium.** Bloco de resultado destacado: imagem(ns) grande(s) + ações
   **Baixar** (download via `/api/files?p=`), **Abrir pasta** (`/api/files/reveal`), **Gerar variação**
   (re-run reusando `formValues` — já temos `handleRestart`), **Usar** (copia o caminho/relPath).

**Arquivos:** `lib/agent-sdk-map.ts` (parar de hardcodar outputs; o `done` carrega o que o runtime
acumulou), `lib/runs-runtime.ts` (acumular outputs do watcher por run, ou expor `startedAt`),
`components/SkillRunner.tsx` (Thread renderiza outputs inline; passa `onOpenFolder`/`onRerun` ao
`DoneSummary`), `components/ChatBubble.tsx` (`DoneSummary` com links reais), possível
`components/ResultReveal.tsx` (novo, a tela premium). Reuso: `/api/files`, `/api/files/reveal`,
`lib/watcher.ts`.

### A2. Streaming vivo

- **Deltas (best-effort):** se o Agent SDK expõe streaming parcial de mensagens do assistente
  (`includePartialMessages`/eventos de stream), o mapper emite `claude_delta` e a UI faz append
  incremental (o tipo `claude_delta` já existe). Se a versão do SDK não suportar de forma limpa,
  **manter `claude_message`** + um indicador "digitando…" — não bloquear o v1 nisso.
- **Progresso em ops longas:** o `ToolBatchPill` (já mostra verbo de negócio) ganha **tempo
  decorrido** ("Gerando a imagem… 18s") pra geração de imagem (~30s) não parecer travada.

### A3. Plano antes de agir (1 preview por tarefa)

- **Convenção de prompt (baixo esforço, sem código de UI):** o prompt montado (`lib/prompt.ts`)
  instrui o agente a **começar com UMA frase** dizendo o que vai fazer ("Vou gerar 3 variações 1:1 +
  9:16 com a sua paleta…") antes de executar. A UI já renderiza esse primeiro `claude_message` como
  o plano. **Um preview por tarefa**, nunca confirmar-a-cada-passo (evita "approval fatigue").

---

## Workstream B — Completar o auto-update (invisível + data-safe)

Continua o que ficou pela metade (release/install/update.sh já existem). Itens a construir são as
Tasks 5-8 do plano `plans/2026-05-29-os-update-mechanism.md`, com o refinamento do modelo da pesquisa:

- `lib/version.ts` (versão local; já estampada pelo `release.sh`) + `compareSemver` + teste.
- `app/api/update/route.ts` — busca o `manifest.json` público, compara, retorna
  `{current, latest, updateAvailable, changelog}`. Fail-soft (offline nunca quebra o painel).
- `lib/store.ts` — `update` state + `chatPrefill`/`prefillChat(text, autoSend)`.
- `components/ChatDrawer.tsx` — consome `chatPrefill` (preenche input + envia).
- `components/UpdateBanner.tsx` — badge no sidebar; clique **injeta "Atualize o Magnus OS" no chat
  livre e envia** (o agente roda `bin/update.sh`). O usuário aprende o padrão vendo acontecer.
- **Modelo da pesquisa:** checar no launch (boot + intervalo), aviso **não-bloqueante**; o update
  aplica e **relança o painel** (já é o que o `update.sh` faz). Nunca toca os dados (`$WS`).
- Skill `atualizar` (plugin) + seção no `template/CLAUDE.md` (pro chat livre saber o comando).

---

## Fora de escopo deste v1 (registrado pra não perder)

- 🔓 **Acesso à HOME = decisão deliberada (NÃO travar).** `runs-runtime.ts:151` deixa o agente
  enxergar a HOME (`additionalDirectories = $HOME` + `bypassPermissions`). Decisão do Yuri
  (2026-05-29): **manter** — o agente às vezes precisa de arquivos de outras pastas do usuário.
  Não é furo a corrigir; é escopo de produto intencional.
- ✂️ Cortes: deferir Gemini até o 1º criativo · cortar/deferir Notion/Canva · remover modos de
  permissão · `copy-magnus` via download gated (não `git clone`) · porta 3737/3940.
- 🌐 Pré-preenchimento do onboarding por extração de URL (Jasper-style) — evolução futura.
- 🎣 Ganchos de upsell pra mentoria Magnus — a deep-research **não achou base** (Q5 sem evidência);
  merece uma pesquisa dedicada antes de desenhar.

## Testes

- `lib/agent-sdk-map.test.ts` — `done` carrega outputs reais (não `[]`).
- Reveal: run que gera imagem → thumbnail inline + DoneSummary com link que abre + "Abrir pasta"
  chama `/api/files/reveal`. (teste de integração leve + verificação manual.)
- `lib/version.test.ts` — `compareSemver`. `/api/update` fail-soft offline.
- Build (`next build`) passa; run multi-turn continua funcionando.

## Critério de aceite

Rodar `criar-criativo` numa campanha com contexto → a imagem **aparece na hora** na run, o
"Pronto." **lista os arquivos** com link que **abre**, e a tela de revelação deixa **Baixar/Abrir/
Gerar variação** a um clique. O update aparece como badge, o clique injeta a frase no chat e atualiza
sem perder dados.
