# Wendell Landing Page (visual identity Claude page) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir uma landing page HTML única usando copy 100% literal da página atual do Wendell Carvalho ("Workshop Produto Digital com IA", R$47) com a identidade visual da Claude page (claude.escoladeautomacao.com.br/operacao-claude-code), rodando local via `python3 -m http.server 8080`.

**Architecture:** Pipeline em 5 fases: (1) congelar copy + extrair design system da Claude page, (2) bootstrap do skeleton com Tailwind config dos tokens extraídos, (3) implementar 24 seções top-down num único `index.html`, (4) wiring de interatividade (Alpine.js modais + FAQ), (5) verificação visual via `/browse`. Deliverable autocontido em `clients/wendell-carvalho/deliverables/landing-claude-design/`.

**Tech Stack:** HTML5 · Tailwind CSS via CDN (3.x play) · Alpine.js via CDN · python3 http.server pra serve local · gstack skills `/extract-design-system`, `/ui-ux-pro-max`, `/browse` pra extração e verificação.

**Spec:** `docs/superpowers/specs/2026-05-21-wendell-landing-claude-design-design.md`

---

## File Structure

Tudo dentro de `clients/wendell-carvalho/deliverables/landing-claude-design/`:

| Arquivo | Responsabilidade |
|---|---|
| `index.html` | **Único entregável** — landing completa, ~600-800 linhas, estrutura: head (Tailwind config + Alpine + Google Fonts) → body com 24 sections semânticas + 2 modais Alpine |
| `serve.sh` | Helper executável: `python3 -m http.server 8080` |
| `README.md` | Como rodar local + como subir em prod (handoff pro cliente) |
| `design-system.md` | Tokens extraídos da Claude page (paleta hex, tipografia, spacing scale) — referência, não vai pra prod |
| `html-patterns.md` | Convenções de markup extraídas — referência, não vai pra prod |
| `copy-source.md` | Copy literal congelada da página do Wendell — referência |
| `verification/desktop.png`, `verification/mobile.png` | Screenshots de verificação |

**Single-file rationale:** spec exige HTML único pra facilitar handoff (cliente pega 1 arquivo e sobe em qualquer host). Sections vivem dentro do mesmo arquivo, em ordem top-down. Cada section é semântica (`<section id="hero">`, `<section id="metodo">`, etc).

---

## Phase 1 — Setup & extração (sequencial)

### Task 1: Criar estrutura de pastas + congelar copy

**Files:**
- Create: `clients/wendell-carvalho/deliverables/landing-claude-design/copy-source.md`
- Create: `clients/wendell-carvalho/deliverables/landing-claude-design/.gitkeep` (placeholder pra estrutura)

- [ ] **Step 1: Criar pasta**

```bash
mkdir -p clients/wendell-carvalho/deliverables/landing-claude-design/verification
```

- [ ] **Step 2: Congelar copy literal a partir de /tmp/wendell-lp.txt**

A copy já foi extraída em `/tmp/wendell-lp.txt` durante o brainstorming (~10K chars, 24 seções). Copiar pra `copy-source.md` com header de proveniência:

```bash
cat > clients/wendell-carvalho/deliverables/landing-claude-design/copy-source.md <<'EOF'
# Copy Source — Workshop Produto Digital com IA (Wendell Carvalho)

**Fonte:** https://workshop.wendellcarvalho.com.br/wpdia-lp001-longa-aa/?xcod=1779385777607_17793857669963
**Capturado:** 2026-05-21
**Status:** Literal — não editar sem aprovação do cliente

---

EOF
cat /tmp/wendell-lp.txt >> clients/wendell-carvalho/deliverables/landing-claude-design/copy-source.md
```

- [ ] **Step 3: Verificar conteúdo**

```bash
wc -l clients/wendell-carvalho/deliverables/landing-claude-design/copy-source.md
# Expected: ~370 linhas
head -20 clients/wendell-carvalho/deliverables/landing-claude-design/copy-source.md
# Expected: cabeçalho + título "[VENDAS] LONGA – AA"
```

- [ ] **Step 4: Commit**

```bash
git add clients/wendell-carvalho/deliverables/landing-claude-design/
git commit -m "feat(wendell-lp): scaffold + freeze copy literal"
```

---

### Task 2: Extrair design system da Claude page

**Files:**
- Create: `clients/wendell-carvalho/deliverables/landing-claude-design/design-system.md`
- Create: `clients/wendell-carvalho/deliverables/landing-claude-design/html-patterns.md`

- [ ] **Step 1: Invocar /extract-design-system**

Usar `Skill` tool:

```
skill: extract-design-system
args: URL: https://claude.escoladeautomacao.com.br/operacao-claude-code/?xcod=1779385773230_17793852610973
       Output dir: clients/wendell-carvalho/deliverables/landing-claude-design/
```

A skill produz `design-system.md` (paleta hex, tipografia, spacing scale, component patterns) e `html-patterns.md` (convenções de markup, framework detection).

- [ ] **Step 2: Verificar saída**

```bash
ls -la clients/wendell-carvalho/deliverables/landing-claude-design/{design-system,html-patterns}.md
head -50 clients/wendell-carvalho/deliverables/landing-claude-design/design-system.md
# Expected: seção "Colors" com hex codes, "Typography" com font families, "Spacing"
```

- [ ] **Step 3: Fallback se /extract-design-system falhar**

Se a skill não rodar (URL bloqueada, plugin não disponível), fazer extração manual:
```bash
# Baixa a Claude page com curl + user agent real
curl -sL -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0" \
  -o /tmp/claude-page.html \
  "https://claude.escoladeautomacao.com.br/operacao-claude-code/?xcod=1779385773230_17793852610973"
```
Depois usar `/browse` pra screenshot + extrair cores hex do CSS inline da página, e escrever `design-system.md` manualmente com:
- Primary: roxo Anthropic (próximo de `#8b5cf6` ou `#7c3aed` — confirmar do CSS extraído)
- Neutral: `#ffffff` fundo, `#0f172a` texto, `#64748b` muted
- Typography: famílias do `<link rel="stylesheet">` do Google Fonts ou do CSS inline
- Spacing scale: 8/16/24/32/48/64/96/128px (Tailwind default — confirma se a Claude page usa o mesmo)

- [ ] **Step 4: Consultar /ui-ux-pro-max sobre os tokens**

Usar `Skill` tool:
```
skill: ui-ux-pro-max
args: review the extracted design tokens in clients/wendell-carvalho/deliverables/landing-claude-design/design-system.md
      Validate: WCAG AA contrast for primary purple on white, font pairing if two fonts,
      typography hierarchy ratio, suggested button states (hover/active).
```

Salvar recomendações como comentários no fim do `design-system.md`.

- [ ] **Step 5: Commit**

```bash
git add clients/wendell-carvalho/deliverables/landing-claude-design/design-system.md \
        clients/wendell-carvalho/deliverables/landing-claude-design/html-patterns.md
git commit -m "feat(wendell-lp): extract Claude page design system + validate with ui-ux-pro-max"
```

---

### Task 3: Bootstrap index.html skeleton

**Files:**
- Create: `clients/wendell-carvalho/deliverables/landing-claude-design/index.html`

- [ ] **Step 1: Ler design-system.md pra pegar os hex codes finais**

```bash
cat clients/wendell-carvalho/deliverables/landing-claude-design/design-system.md
```

Anotar os valores que vão pro Tailwind config:
- `claude-purple` (primary, ex: `#7c3aed`)
- `claude-purple-dark` (hover, ex: `#6d28d9`)
- `claude-purple-light` (badges/accents, ex: `#a78bfa`)
- `neutral-50/100/900` (cinzas)
- Font families do Google Fonts

- [ ] **Step 2: Escrever o skeleton completo**

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="Workshop Produto Digital com IA — 2 dias online ao vivo com Wendell Carvalho. Crie seu produto digital do zero.">
  <title>Workshop Produto Digital com IA | Wendell Carvalho</title>

  <!-- Google Fonts — SUBSTITUIR pelas famílias do design-system.md -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">

  <!-- Tailwind CDN -->
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            // SUBSTITUIR pelos hex do design-system.md
            'claude-purple': '#7c3aed',
            'claude-purple-dark': '#6d28d9',
            'claude-purple-light': '#a78bfa',
          },
          fontFamily: {
            sans: ['Inter', 'system-ui', 'sans-serif'],
          },
        }
      }
    }
  </script>

  <!-- Alpine.js -->
  <script defer src="https://unpkg.com/alpinejs@3.x.x/dist/cdn.min.js"></script>

  <style>
    html { scroll-behavior: smooth; }
    body { font-family: 'Inter', system-ui, sans-serif; }
    /* Reusable urgency strip e CTA button serão Tailwind utility composition inline */
  </style>
</head>
<body class="bg-white text-neutral-900 antialiased" x-data="{ modal: null }" @keydown.escape.window="modal = null">

  <!-- ============================================================
       SECTIONS GO HERE — ordem top-down conforme spec section 6
       Cada section é um <section> semântico com id descritivo
       ============================================================ -->

  <!-- Placeholder: confirma que o skeleton renderiza -->
  <main class="min-h-screen flex items-center justify-center">
    <h1 class="text-4xl font-bold text-claude-purple">Skeleton OK — sections vão entrar nas próximas tasks</h1>
  </main>

  <!-- ============================================================
       MODAIS Alpine — START e VIP, serão adicionados em Phase 3
       ============================================================ -->

</body>
</html>
```

- [ ] **Step 3: Smoke test visual**

```bash
cd clients/wendell-carvalho/deliverables/landing-claude-design && python3 -m http.server 8080 &
SERVER_PID=$!
sleep 1
```

Usar `Skill` tool:
```
skill: browse
args: open http://localhost:8080 — screenshot 1440x900
```

Confirmar: página carrega, fonte Inter aplicada, texto em roxo visível, sem console errors.

- [ ] **Step 4: Matar o servidor + commit**

```bash
kill $SERVER_PID 2>/dev/null
git add clients/wendell-carvalho/deliverables/landing-claude-design/index.html
git commit -m "feat(wendell-lp): bootstrap HTML skeleton with Tailwind config + Alpine"
```

---

## Phase 2 — Implementar seções top-down

**Convenção pra TODAS as tasks de Phase 2:** cada section vira um `<section id="..." class="...">` inserido em ordem dentro do `<main>` (remover o placeholder do skeleton ao adicionar a primeira section). Toda copy é **literal** do `copy-source.md` — não parafraseie. Após cada task, commit.

### Task 4: Hero area (top bar + hero + VSL) — sections 1-3

**Files:**
- Modify: `clients/wendell-carvalho/deliverables/landing-claude-design/index.html`

- [ ] **Step 1: Remover placeholder, adicionar top bar + hero + VSL**

Substituir o conteúdo entre `<!-- SECTIONS GO HERE -->` e `<!-- MODAIS -->` por:

```html
  <!-- Section 1: Top bar utility -->
  <section id="utility-bar" class="bg-neutral-50 border-b border-neutral-200">
    <div class="max-w-6xl mx-auto px-4 py-2 flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-xs text-neutral-600">
      <span class="flex items-center gap-1.5">🔒 Pagamento Seguro</span>
      <span class="flex items-center gap-1.5">⚡ Acesso imediato</span>
      <span class="flex items-center gap-1.5">📺 Workshop Online ao Vivo</span>
      <span class="flex items-center gap-1.5">📅 6 e 7 de junho</span>
      <span class="flex items-center gap-1.5">🎟️ Vagas limitadas</span>
    </div>
  </section>

  <!-- Section 2: Hero -->
  <section id="hero" class="bg-white">
    <div class="max-w-5xl mx-auto px-4 py-20 md:py-28 text-center">
      <p class="text-sm font-semibold text-claude-purple uppercase tracking-wider mb-6">
        Workshop online ao vivo · 6 e 7 de Junho
      </p>
      <h1 class="text-4xl md:text-6xl lg:text-7xl font-extrabold leading-tight tracking-tight mb-6">
        Saia da invisibilidade e vire uma referência no digital com o conhecimento que você já tem.
      </h1>
      <p class="text-lg md:text-xl text-neutral-600 max-w-3xl mx-auto mb-10 leading-relaxed">
        Em 2 dias online, ao vivo no Zoom, você aprende a criar seu produto digital do zero, construir um posicionamento que reflete sua autoridade no presencial e conquistar suas primeiras vendas.
      </p>
      <a href="https://pay.hotmart.com/Y105698965X?off=vqedhper&checkoutMode=10"
         target="_blank"
         class="inline-flex items-center gap-3 bg-claude-purple hover:bg-claude-purple-dark text-white font-bold text-lg px-10 py-5 rounded-xl shadow-lg hover:shadow-xl transition-all">
        QUERO GARANTIR MINHA VAGA
        <span aria-hidden="true">→</span>
      </a>
    </div>
  </section>

  <!-- Section 3: VSL block -->
  <section id="vsl" class="bg-neutral-50">
    <div class="max-w-4xl mx-auto px-4 py-16 md:py-20">
      <h2 class="text-2xl md:text-4xl font-bold text-center mb-8">
        Assista ao vídeo e entenda tudo que você vai levar:
      </h2>
      <div class="aspect-video rounded-2xl overflow-hidden shadow-2xl ring-1 ring-claude-purple/20">
        <iframe
          src="https://player-vz-71c67aff-ab9.tv.pandavideo.com.br/embed/?v=350103dc-e582-410c-97c0-9f52064191b7"
          loading="lazy"
          allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
          allowfullscreen
          class="w-full h-full"></iframe>
      </div>
    </div>
  </section>
```

- [ ] **Step 2: Visual check via /browse**

```bash
cd clients/wendell-carvalho/deliverables/landing-claude-design && python3 -m http.server 8080 &
sleep 1
```

```
skill: browse
args: open http://localhost:8080 — screenshot 1440x900 — save to verification/hero-desktop.png
```

Verificar: top bar com ícones renderiza, hero centered com H1 grande + CTA roxo destacado, vídeo Panda carrega em aspect ratio 16:9.

- [ ] **Step 3: Matar server + commit**

```bash
pkill -f "python3 -m http.server 8080"
git add clients/wendell-carvalho/deliverables/landing-claude-design/index.html
git commit -m "feat(wendell-lp): hero area (utility bar + hero + VSL)"
```

---

### Task 5: Urgency strip (reusável) + Problem + Promise divider — sections 4-6

**Files:**
- Modify: `clients/wendell-carvalho/deliverables/landing-claude-design/index.html`

- [ ] **Step 1: Adicionar 3 sections após `#vsl`**

```html
  <!-- Section 4: Urgency strip (reusable component, appears N times) -->
  <section class="bg-claude-purple text-white">
    <div class="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm font-medium">
      <span>Workshop Online ao Vivo</span>
      <span class="opacity-60">·</span>
      <span>6 e 7 de junho</span>
      <span class="opacity-60">·</span>
      <span>Vagas limitadas</span>
      <a href="https://pay.hotmart.com/Y105698965X?off=vqedhper&checkoutMode=10"
         target="_blank"
         class="bg-white text-claude-purple font-bold px-4 py-1.5 rounded-md hover:bg-neutral-100 transition">
        Garanta sua vaga →
      </a>
    </div>
  </section>

  <!-- Section 5: Problem statement -->
  <section id="problema" class="bg-white">
    <div class="max-w-5xl mx-auto px-4 py-20 md:py-24 grid md:grid-cols-2 gap-12 items-center">
      <div>
        <h2 class="text-3xl md:text-5xl font-bold leading-tight mb-6">
          Você é referência para quem te conhece.
          <span class="block text-claude-purple mt-2">Para o resto do mundo, você ainda é invisível</span>
        </h2>
        <div class="space-y-4 text-neutral-700 text-lg leading-relaxed">
          <p>Você passou anos construindo autoridade real. Estudou, se formou, acumulou resultados e se tornou referência na sua cidade ou região.</p>
          <p>Mas existe um lugar onde tudo isso simplesmente não aparece.</p>
          <p>Pessoas com menos conhecimento e menos experiência, estão crescendo mais, faturando mais e sendo mais reconhecidas.</p>
          <p class="font-semibold text-neutral-900">Está na hora de você mudar isso e ocupar o espaço que você merece. Alcançar seu próximo nível financeiro, impactar mais vidas e se posicionar como referência no mercado.</p>
          <p>Chegou a hora de sair da invisibilidade e construir uma nova fonte de renda extremamente lucrativa e escalável.</p>
        </div>
      </div>
      <div class="hidden md:block">
        <img src="https://workshop.wendellcarvalho.com.br/wp-content/uploads/2026/05/Invisivel.webp"
             alt="Profissional invisível no digital"
             loading="lazy"
             onerror="this.style.display='none'"
             class="w-full rounded-2xl">
      </div>
    </div>
  </section>

  <!-- Section 6: Promise divider -->
  <section id="promessa" class="bg-neutral-50">
    <div class="max-w-4xl mx-auto px-4 py-16 md:py-20 text-center">
      <h2 class="text-3xl md:text-5xl font-bold leading-tight">
        Uma sequência construída para você sair com produto pronto e cadastrado,
        <span class="text-claude-purple">não com mais anotações.</span>
      </h2>
    </div>
  </section>
```

- [ ] **Step 2: Visual check + commit**

```bash
cd clients/wendell-carvalho/deliverables/landing-claude-design && python3 -m http.server 8080 &
sleep 1
```

```
skill: browse
args: open http://localhost:8080#problema — screenshot 1440x900 — save to verification/problem.png
```

Verificar: urgency strip roxa full-width, problema com texto grande + imagem lateral, promise divider centered.

```bash
pkill -f "python3 -m http.server 8080"
git add clients/wendell-carvalho/deliverables/landing-claude-design/index.html
git commit -m "feat(wendell-lp): urgency strip + problem + promise divider"
```

---

### Task 6: Método 2 dias — section 7

**Files:**
- Modify: `clients/wendell-carvalho/deliverables/landing-claude-design/index.html`

- [ ] **Step 1: Adicionar grid de 2 cards Dia 1 + Dia 2**

```html
  <!-- Section 7: Método 2 dias -->
  <section id="metodo" class="bg-white">
    <div class="max-w-6xl mx-auto px-4 py-20 md:py-24">
      <div class="grid md:grid-cols-2 gap-8">

        <!-- Card Dia 1 -->
        <article class="bg-neutral-50 rounded-2xl p-8 md:p-10 ring-1 ring-neutral-200">
          <img src="https://workshop.wendellcarvalho.com.br/wp-content/uploads/2026/05/Dia-01.webp"
               alt="Dia 1 — Identifique e Desenvolva"
               loading="lazy"
               onerror="this.style.display='none'"
               class="w-full max-w-xs mb-6">
          <span class="inline-block bg-claude-purple/10 text-claude-purple text-xs font-semibold px-3 py-1 rounded-full mb-3">
            6 de junho · A partir das 9h · Online ao vivo
          </span>
          <h3 class="text-2xl md:text-3xl font-bold mb-6">Identifique e Desenvolva</h3>
          <ul class="space-y-3 text-neutral-700">
            <li class="flex gap-3"><span class="text-claude-purple font-bold mt-0.5">✓</span>Identifique o nicho onde seu conhecimento vale mais</li>
            <li class="flex gap-3"><span class="text-claude-purple font-bold mt-0.5">✓</span>Mapeie seu público-alvo com precisão</li>
            <li class="flex gap-3"><span class="text-claude-purple font-bold mt-0.5">✓</span>Construa uma promessa que te diferencia</li>
            <li class="flex gap-3"><span class="text-claude-purple font-bold mt-0.5">✓</span>Posicione seu perfil para atrair clientes compradores, não apenas curtidas</li>
            <li class="flex gap-3"><span class="text-claude-purple font-bold mt-0.5">✓</span>Desenvolva a estrutura do seu produto digital, formato, módulos, entregáveis</li>
            <li class="flex gap-3"><span class="text-claude-purple font-bold mt-0.5">✓</span>Use a IA para acelerar cada etapa em horas, não semanas</li>
          </ul>
        </article>

        <!-- Card Dia 2 -->
        <article class="bg-neutral-50 rounded-2xl p-8 md:p-10 ring-1 ring-neutral-200">
          <img src="https://workshop.wendellcarvalho.com.br/wp-content/uploads/2026/05/Dia-02.webp"
               alt="Dia 2 — Execute e Venda"
               loading="lazy"
               onerror="this.style.display='none'"
               class="w-full max-w-xs mb-6">
          <span class="inline-block bg-claude-purple/10 text-claude-purple text-xs font-semibold px-3 py-1 rounded-full mb-3">
            7 de junho · A partir das 9h · Online ao vivo
          </span>
          <h3 class="text-2xl md:text-3xl font-bold mb-6">Execute e Venda</h3>
          <ul class="space-y-3 text-neutral-700">
            <li class="flex gap-3"><span class="text-claude-purple font-bold mt-0.5">✓</span>Crie seu produto digital do zero, passo a passo</li>
            <li class="flex gap-3"><span class="text-claude-purple font-bold mt-0.5">✓</span>Cadastre o produto na plataforma ainda durante o evento</li>
            <li class="flex gap-3"><span class="text-claude-purple font-bold mt-0.5">✓</span>Estruture sua oferta com clareza para vender</li>
            <li class="flex gap-3"><span class="text-claude-purple font-bold mt-0.5">✓</span>Monte conteúdo que engaja e gera vendas</li>
            <li class="flex gap-3"><span class="text-claude-purple font-bold mt-0.5">✓</span>Aprenda como fazer suas primeiras vendas</li>
            <li class="flex gap-3"><span class="text-claude-purple font-bold mt-0.5">✓</span>Receba o Plano 100k: o roteiro para seus primeiros R$100 mil no digital</li>
          </ul>
        </article>

      </div>
    </div>
  </section>
```

- [ ] **Step 2: Visual check + commit**

```bash
cd clients/wendell-carvalho/deliverables/landing-claude-design && python3 -m http.server 8080 &
sleep 1
```
```
skill: browse
args: open http://localhost:8080#metodo — screenshot 1440x900 — save to verification/metodo.png
```
Verificar: grid 2 colunas, ilustrações Dia-01/Dia-02 carregam, chips de data com bg roxo claro, bullets com check roxo.

```bash
pkill -f "python3 -m http.server 8080"
git add clients/wendell-carvalho/deliverables/landing-claude-design/index.html
git commit -m "feat(wendell-lp): método 2 dias (Dia 1 Identifique + Dia 2 Execute)"
```

---

### Task 7: Outcome pull quote + CTA mid block — sections 8-9

**Files:**
- Modify: `clients/wendell-carvalho/deliverables/landing-claude-design/index.html`

- [ ] **Step 1: Adicionar outcome quote + CTA mid (será reusado depois)**

```html
  <!-- Section 8: Outcome pull quote -->
  <section id="outcome-quote" class="bg-white">
    <div class="max-w-4xl mx-auto px-4 py-16">
      <blockquote class="border-l-4 border-claude-purple bg-neutral-50 rounded-r-2xl px-8 py-8 md:px-12 md:py-10 shadow-sm">
        <p class="text-xl md:text-2xl font-semibold leading-snug text-neutral-900">
          Você entra no evento sem produto digital. Você sai com produto criado, oferta estruturada e primeiros passos de venda em andamento.
        </p>
      </blockquote>
    </div>
  </section>

  <!-- Section 9: CTA mid + 76% bar -->
  <section id="cta-mid-1" class="bg-neutral-50">
    <div class="max-w-3xl mx-auto px-4 py-16 text-center">
      <a href="https://pay.hotmart.com/Y105698965X?off=vqedhper&checkoutMode=10"
         target="_blank"
         class="inline-flex items-center gap-3 bg-claude-purple hover:bg-claude-purple-dark text-white font-bold text-lg px-10 py-5 rounded-xl shadow-lg hover:shadow-xl transition-all mb-6">
        QUERO GARANTIR MINHA VAGA
        <span aria-hidden="true">→</span>
      </a>
      <div>
        <p class="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">Vagas já preenchidas 76%</p>
        <div class="h-3 max-w-md mx-auto bg-neutral-200 rounded-full overflow-hidden">
          <div class="h-full bg-gradient-to-r from-claude-purple to-claude-purple-dark rounded-full" style="width: 76%"></div>
        </div>
      </div>
    </div>
  </section>
```

- [ ] **Step 2: Visual check + commit**

```bash
cd clients/wendell-carvalho/deliverables/landing-claude-design && python3 -m http.server 8080 &
sleep 1
```
```
skill: browse
args: open http://localhost:8080#cta-mid-1 — screenshot 1440x900 — save to verification/cta-mid.png
```
Verificar: blockquote com borda roxa esquerda, CTA centered com barra 76% gradient roxo.

```bash
pkill -f "python3 -m http.server 8080"
git add clients/wendell-carvalho/deliverables/landing-claude-design/index.html
git commit -m "feat(wendell-lp): outcome quote + CTA mid with 76% bar"
```

---

### Task 8: Comparativo (heading + 2 cards Sozinho vs Workshop) — sections 10-11

**Files:**
- Modify: `clients/wendell-carvalho/deliverables/landing-claude-design/index.html`

- [ ] **Step 1: Adicionar heading + tabela comparativa**

```html
  <!-- Section 10: Comparativo heading -->
  <section id="comparativo-heading" class="bg-white">
    <div class="max-w-3xl mx-auto px-4 py-16 md:py-20 text-center">
      <h2 class="text-3xl md:text-5xl font-bold leading-tight mb-6">
        TENTAR SOZINHO NÃO FUNCIONA
      </h2>
      <p class="text-lg md:text-xl text-neutral-600 leading-relaxed">
        Você precisa de um método direto, do zero à primeira venda, testado com mais de 3.000 profissionais.
      </p>
    </div>
  </section>

  <!-- Section 11: Tabela comparativa 2 cards -->
  <section id="comparativo" class="bg-white pb-20">
    <div class="max-w-6xl mx-auto px-4 grid md:grid-cols-2 gap-6">

      <!-- Card Sozinho (cinza, ✗) -->
      <article class="bg-neutral-100 rounded-2xl p-8 ring-1 ring-neutral-200">
        <h3 class="text-xl font-bold mb-6 text-neutral-700 uppercase tracking-wide">
          Tentativa e erro sozinho
        </h3>
        <ul class="space-y-4 text-neutral-600">
          <li class="flex gap-3"><span class="text-red-500 font-bold mt-0.5">✗</span>Informação superficial que não resolve na prática</li>
          <li class="flex gap-3"><span class="text-red-500 font-bold mt-0.5">✗</span>Conteúdo fragmentado, sem sequência lógica</li>
          <li class="flex gap-3"><span class="text-red-500 font-bold mt-0.5">✗</span>Meses tentando montar o quebra-cabeça sozinho</li>
          <li class="flex gap-3"><span class="text-red-500 font-bold mt-0.5">✗</span>Paralisia por excesso de opções</li>
          <li class="flex gap-3"><span class="text-red-500 font-bold mt-0.5">✗</span>Visibilidade zero enquanto outros crescem</li>
        </ul>
      </article>

      <!-- Card Workshop (roxo destacado, ✓) -->
      <article class="bg-claude-purple text-white rounded-2xl p-8 shadow-2xl">
        <h3 class="text-xl font-bold mb-6 uppercase tracking-wide">
          Workshop Produto Digital com IA
        </h3>
        <ul class="space-y-4">
          <li class="flex gap-3"><span class="text-claude-purple-light font-bold mt-0.5">✓</span>Do zero à primeira venda, passo a passo</li>
          <li class="flex gap-3"><span class="text-claude-purple-light font-bold mt-0.5">✓</span>Método testado com mais de 3.000 profissionais</li>
          <li class="flex gap-3"><span class="text-claude-purple-light font-bold mt-0.5">✓</span>2 dias ao vivo com quem já fez</li>
          <li class="flex gap-3"><span class="text-claude-purple-light font-bold mt-0.5">✓</span>IA para acelerar cada etapa e eliminar a indecisão</li>
          <li class="flex gap-3"><span class="text-claude-purple-light font-bold mt-0.5">✓</span>Você sai com produto criado e oferta no ar</li>
        </ul>
      </article>

    </div>
  </section>
```

- [ ] **Step 2: Visual check + commit**

```bash
cd clients/wendell-carvalho/deliverables/landing-claude-design && python3 -m http.server 8080 &
sleep 1
```
```
skill: browse
args: open http://localhost:8080#comparativo — screenshot 1440x900 — save to verification/comparativo.png
```
Verificar: heading centered, 2 cards lado-a-lado (Sozinho cinza com ✗ vermelhos · Workshop roxo com ✓ claros), contraste forte.

```bash
pkill -f "python3 -m http.server 8080"
git add clients/wendell-carvalho/deliverables/landing-claude-design/index.html
git commit -m "feat(wendell-lp): comparativo sozinho vs workshop"
```

---

### Task 9: Social proof (heading + 6 mentorados grid) — sections 12-13

**Files:**
- Modify: `clients/wendell-carvalho/deliverables/landing-claude-design/index.html`

- [ ] **Step 1: Adicionar heading social proof + grid 6 cards**

```html
  <!-- Section 12: Social proof heading -->
  <section id="social-heading" class="bg-neutral-50">
    <div class="max-w-4xl mx-auto px-4 py-16 md:py-20 text-center">
      <h2 class="text-3xl md:text-5xl font-bold leading-tight mb-6">
        Eles também achavam que não iam conseguir.
      </h2>
      <p class="text-lg text-neutral-600 leading-relaxed">
        Médicos, dentistas, advogados, consultores, fotógrafos, adestramento, agropecuária. Nichos completamente diferentes. Um método. Milhares de profissionais autônomos e empresários que saíram da invisibilidade para o digital, do zero às primeiras vendas, de onde estavam.
      </p>
    </div>
  </section>

  <!-- Section 13: Grid 6 mentorados -->
  <section id="mentorados" class="bg-neutral-50 pb-20">
    <div class="max-w-6xl mx-auto px-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">

      <!-- Fernanda Matos · R$2M -->
      <article class="bg-white rounded-2xl p-6 ring-1 ring-neutral-200 text-center shadow-sm">
        <img src="https://workshop.wendellcarvalho.com.br/wp-content/uploads/2026/05/Fernanda-Matos.webp"
             alt="Fernanda Matos" loading="lazy" onerror="this.style.display='none'"
             class="w-24 h-24 rounded-full mx-auto mb-4 object-cover">
        <h3 class="font-bold text-lg">Fernanda Matos</h3>
        <p class="text-sm text-neutral-500 mb-3">@eusoufernandamatos</p>
        <span class="inline-block bg-claude-purple text-white font-bold px-4 py-1.5 rounded-full text-sm">R$ 2 milhões</span>
      </article>

      <!-- Leandro Fajan · R$20M -->
      <article class="bg-white rounded-2xl p-6 ring-1 ring-neutral-200 text-center shadow-sm">
        <img src="https://workshop.wendellcarvalho.com.br/wp-content/uploads/2026/05/Leandro-Fajan.webp"
             alt="Leandro Fajan" loading="lazy" onerror="this.style.display='none'"
             class="w-24 h-24 rounded-full mx-auto mb-4 object-cover">
        <h3 class="font-bold text-lg">Leandro Fajan</h3>
        <p class="text-sm text-neutral-500 mb-3">@concursopmoficial</p>
        <span class="inline-block bg-claude-purple text-white font-bold px-4 py-1.5 rounded-full text-sm">R$ 20 milhões</span>
      </article>

      <!-- Claudinei Gomes · R$50M -->
      <article class="bg-white rounded-2xl p-6 ring-1 ring-neutral-200 text-center shadow-sm">
        <img src="https://workshop.wendellcarvalho.com.br/wp-content/uploads/2026/05/Claudinei.webp"
             alt="Claudinei Gomes" loading="lazy" onerror="this.style.display='none'"
             class="w-24 h-24 rounded-full mx-auto mb-4 object-cover">
        <h3 class="font-bold text-lg">Claudinei Gomes</h3>
        <p class="text-sm text-neutral-500 mb-3">@claudineigomes</p>
        <span class="inline-block bg-claude-purple text-white font-bold px-4 py-1.5 rounded-full text-sm">R$ 50 milhões</span>
      </article>

      <!-- Quezia Santos · R$5M -->
      <article class="bg-white rounded-2xl p-6 ring-1 ring-neutral-200 text-center shadow-sm">
        <img src="https://workshop.wendellcarvalho.com.br/wp-content/uploads/2026/05/Quezia.webp"
             alt="Quezia Santos" loading="lazy" onerror="this.style.display='none'"
             class="w-24 h-24 rounded-full mx-auto mb-4 object-cover">
        <h3 class="font-bold text-lg">Quezia Santos</h3>
        <p class="text-sm text-neutral-500 mb-3">@quezia_santos_teixeira</p>
        <span class="inline-block bg-claude-purple text-white font-bold px-4 py-1.5 rounded-full text-sm">R$ 5 Milhões</span>
      </article>

      <!-- Michel Toreto · R$4M -->
      <article class="bg-white rounded-2xl p-6 ring-1 ring-neutral-200 text-center shadow-sm">
        <img src="https://workshop.wendellcarvalho.com.br/wp-content/uploads/2026/05/Michel-Toreto.webp"
             alt="Michel Toreto" loading="lazy" onerror="this.style.display='none'"
             class="w-24 h-24 rounded-full mx-auto mb-4 object-cover">
        <h3 class="font-bold text-lg">Michel Toreto</h3>
        <p class="text-sm text-neutral-500 mb-3">@michel.toreto</p>
        <span class="inline-block bg-claude-purple text-white font-bold px-4 py-1.5 rounded-full text-sm">R$ 4 milhões</span>
      </article>

      <!-- Michelle Gouvea · R$18M -->
      <article class="bg-white rounded-2xl p-6 ring-1 ring-neutral-200 text-center shadow-sm">
        <img src="https://workshop.wendellcarvalho.com.br/wp-content/uploads/2026/05/Michelle-Gouveah.webp"
             alt="Michelle Gouvea" loading="lazy" onerror="this.style.display='none'"
             class="w-24 h-24 rounded-full mx-auto mb-4 object-cover">
        <h3 class="font-bold text-lg">Michelle Gouvea</h3>
        <p class="text-sm text-neutral-500 mb-3">@michelle.gouveah</p>
        <span class="inline-block bg-claude-purple text-white font-bold px-4 py-1.5 rounded-full text-sm">R$ 18 milhões</span>
      </article>

    </div>
  </section>
```

- [ ] **Step 2: Visual check + commit**

```bash
cd clients/wendell-carvalho/deliverables/landing-claude-design && python3 -m http.server 8080 &
sleep 1
```
```
skill: browse
args: open http://localhost:8080#mentorados — screenshot 1440x900 — save to verification/social-proof.png
```
Verificar: 6 cards em grid 3 colunas (desktop), 2 col (tablet), 1 col (mobile), avatares circulares, chips roxos com cifras.

```bash
pkill -f "python3 -m http.server 8080"
git add clients/wendell-carvalho/deliverables/landing-claude-design/index.html
git commit -m "feat(wendell-lp): social proof (6 mentorados com cifras)"
```

---

### Task 10: CTA mid #2 (clone do Task 7) — section 14

**Files:**
- Modify: `clients/wendell-carvalho/deliverables/landing-claude-design/index.html`

- [ ] **Step 1: Adicionar duplicata da section CTA mid**

Igual ao Task 7 step 1, mas com `id="cta-mid-2"`:

```html
  <!-- Section 14: CTA mid #2 -->
  <section id="cta-mid-2" class="bg-white">
    <div class="max-w-3xl mx-auto px-4 py-16 text-center">
      <a href="https://pay.hotmart.com/Y105698965X?off=vqedhper&checkoutMode=10"
         target="_blank"
         class="inline-flex items-center gap-3 bg-claude-purple hover:bg-claude-purple-dark text-white font-bold text-lg px-10 py-5 rounded-xl shadow-lg hover:shadow-xl transition-all mb-6">
        QUERO GARANTIR MINHA VAGA
        <span aria-hidden="true">→</span>
      </a>
      <div>
        <p class="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">Vagas já preenchidas 76%</p>
        <div class="h-3 max-w-md mx-auto bg-neutral-200 rounded-full overflow-hidden">
          <div class="h-full bg-gradient-to-r from-claude-purple to-claude-purple-dark rounded-full" style="width: 76%"></div>
        </div>
      </div>
    </div>
  </section>
```

- [ ] **Step 2: Commit (sem screenshot — é repetição do já validado)**

```bash
git add clients/wendell-carvalho/deliverables/landing-claude-design/index.html
git commit -m "feat(wendell-lp): CTA mid #2 (duplicate after social proof)"
```

---

### Task 11: Para quem é + Você NÃO precisa — sections 15-16

**Files:**
- Modify: `clients/wendell-carvalho/deliverables/landing-claude-design/index.html`

- [ ] **Step 1: Adicionar grid personas + bloco "você não precisa"**

```html
  <!-- Section 15: Para quem é -->
  <section id="para-quem" class="bg-neutral-50">
    <div class="max-w-6xl mx-auto px-4 py-20 md:py-24">
      <div class="text-center mb-12">
        <h2 class="text-3xl md:text-5xl font-bold mb-6">Para quem é?</h2>
        <p class="text-lg text-neutral-600 max-w-3xl mx-auto">
          Para você que tem conhecimento e experiência em alguma área, tem resultado com isso e quer criar um produto digital, mas ainda não sabe como fazer isso.
        </p>
      </div>
      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <div class="bg-white rounded-xl p-6 ring-1 ring-neutral-200">
          <div class="w-10 h-10 bg-claude-purple/10 rounded-lg flex items-center justify-center mb-4 text-claude-purple font-bold">✦</div>
          <h3 class="font-semibold leading-snug">Profissionais liberais bem-sucedidos em sua área de atuação</h3>
        </div>
        <div class="bg-white rounded-xl p-6 ring-1 ring-neutral-200">
          <div class="w-10 h-10 bg-claude-purple/10 rounded-lg flex items-center justify-center mb-4 text-claude-purple font-bold">✦</div>
          <h3 class="font-semibold leading-snug">Empresários que querem entrar no digital e ensinar o que sabem</h3>
        </div>
        <div class="bg-white rounded-xl p-6 ring-1 ring-neutral-200">
          <div class="w-10 h-10 bg-claude-purple/10 rounded-lg flex items-center justify-center mb-4 text-claude-purple font-bold">✦</div>
          <h3 class="font-semibold leading-snug">Gestores e consultores com muita experiência que querem compartilhar isso</h3>
        </div>
        <div class="bg-white rounded-xl p-6 ring-1 ring-neutral-200">
          <div class="w-10 h-10 bg-claude-purple/10 rounded-lg flex items-center justify-center mb-4 text-claude-purple font-bold">✦</div>
          <h3 class="font-semibold leading-snug">Médicos, dentistas, advogados, psicólogos, autônomos e empresários de qualquer nicho</h3>
        </div>
        <div class="bg-white rounded-xl p-6 ring-1 ring-neutral-200">
          <div class="w-10 h-10 bg-claude-purple/10 rounded-lg flex items-center justify-center mb-4 text-claude-purple font-bold">✦</div>
          <h3 class="font-semibold leading-snug">Educadores, mentores e autônomos que já têm um histórico comprovado</h3>
        </div>
        <div class="bg-white rounded-xl p-6 ring-1 ring-neutral-200">
          <div class="w-10 h-10 bg-claude-purple/10 rounded-lg flex items-center justify-center mb-4 text-claude-purple font-bold">✦</div>
          <h3 class="font-semibold leading-snug">Qualquer profissional que seja referência no presencial e ainda não exista no digital</h3>
        </div>
      </div>
    </div>
  </section>

  <!-- Section 16: Você NÃO precisa -->
  <section id="nao-precisa" class="bg-white">
    <div class="max-w-6xl mx-auto px-4 py-20">
      <h2 class="text-3xl md:text-4xl font-bold text-center mb-12">Você NÃO precisa:</h2>
      <div class="grid md:grid-cols-3 gap-8">
        <div class="text-center">
          <div class="w-12 h-12 bg-red-50 rounded-full mx-auto mb-4 flex items-center justify-center text-red-500 text-2xl font-bold">✗</div>
          <h3 class="font-semibold mb-2">Ter muitos seguidores</h3>
          <p class="text-neutral-600 text-sm">O método não depende de audiência para funcionar</p>
        </div>
        <div class="text-center">
          <div class="w-12 h-12 bg-red-50 rounded-full mx-auto mb-4 flex items-center justify-center text-red-500 text-2xl font-bold">✗</div>
          <h3 class="font-semibold mb-2">Ter um produto pronto para participar</h3>
          <p class="text-neutral-600 text-sm">Você vai criar do zero durante o evento</p>
        </div>
        <div class="text-center">
          <div class="w-12 h-12 bg-red-50 rounded-full mx-auto mb-4 flex items-center justify-center text-red-500 text-2xl font-bold">✗</div>
          <h3 class="font-semibold mb-2">Saber de tecnologia, anúncios ou copywriting</h3>
          <p class="text-neutral-600 text-sm">A IA e o time cuidam disso com você</p>
        </div>
      </div>
    </div>
  </section>
```

- [ ] **Step 2: Visual check + commit**

```bash
cd clients/wendell-carvalho/deliverables/landing-claude-design && python3 -m http.server 8080 &
sleep 1
```
```
skill: browse
args: open http://localhost:8080#para-quem — screenshot 1440x900 — save to verification/para-quem.png
```

```bash
pkill -f "python3 -m http.server 8080"
git add clients/wendell-carvalho/deliverables/landing-claude-design/index.html
git commit -m "feat(wendell-lp): para quem é + você NÃO precisa"
```

---

### Task 12: Stack de bônus + Pricing 2 tiers — sections 17-18

**Files:**
- Modify: `clients/wendell-carvalho/deliverables/landing-claude-design/index.html`

- [ ] **Step 1: Adicionar bônus stack + 2 pricing cards (CTAs já abrem modais — modais vêm em Task 16-17)**

```html
  <!-- Section 17: Stack de bônus -->
  <section id="bonus" class="bg-neutral-50">
    <div class="max-w-3xl mx-auto px-4 py-20">
      <h2 class="text-3xl md:text-4xl font-bold text-center mb-12">
        Garanta sua vaga agora e leve esses bônus estratégicos.
      </h2>
      <ul class="space-y-3 mb-8">
        <li class="bg-white rounded-xl p-5 flex items-center gap-4 ring-1 ring-neutral-200">
          <img src="https://workshop.wendellcarvalho.com.br/wp-content/uploads/2026/05/GPT.svg" alt="" class="w-12 h-12 flex-shrink-0" onerror="this.style.display='none'">
          <span class="font-semibold flex-1">Agente do ChatGPT, Perfil do Cliente Ideal</span>
          <span class="text-claude-purple font-bold text-lg">R$ 597</span>
        </li>
        <li class="bg-white rounded-xl p-5 flex items-center gap-4 ring-1 ring-neutral-200">
          <img src="https://workshop.wendellcarvalho.com.br/wp-content/uploads/2026/05/Whatsapp.svg" alt="" class="w-12 h-12 flex-shrink-0" onerror="this.style.display='none'">
          <span class="font-semibold flex-1">Script de Vendas para WhatsApp</span>
          <span class="text-claude-purple font-bold text-lg">R$ 247</span>
        </li>
        <li class="bg-white rounded-xl p-5 flex items-center gap-4 ring-1 ring-neutral-200">
          <img src="https://workshop.wendellcarvalho.com.br/wp-content/uploads/2026/05/Instagram.svg" alt="" class="w-12 h-12 flex-shrink-0" onerror="this.style.display='none'">
          <span class="font-semibold flex-1">Fluxo de Automação de Vendas no Instagram</span>
          <span class="text-claude-purple font-bold text-lg">R$ 267</span>
        </li>
        <li class="bg-white rounded-xl p-5 flex items-center gap-4 ring-1 ring-neutral-200">
          <img src="https://workshop.wendellcarvalho.com.br/wp-content/uploads/2026/05/Story.svg" alt="" class="w-12 h-12 flex-shrink-0" onerror="this.style.display='none'">
          <span class="font-semibold flex-1">Sequência de Story 3x</span>
          <span class="text-claude-purple font-bold text-lg">R$ 227</span>
        </li>
        <li class="bg-white rounded-xl p-5 flex items-center gap-4 ring-1 ring-neutral-200">
          <img src="https://workshop.wendellcarvalho.com.br/wp-content/uploads/2026/05/100k.svg" alt="" class="w-12 h-12 flex-shrink-0" onerror="this.style.display='none'">
          <span class="font-semibold flex-1">O Plano 100K no Digital</span>
          <span class="text-claude-purple font-bold text-lg">R$ 327</span>
        </li>
      </ul>
      <div class="text-center bg-claude-purple text-white rounded-2xl p-6">
        <p class="text-sm uppercase tracking-wider mb-2 opacity-90">Quanto vou investir para entrar no workshop?</p>
        <p class="text-xs opacity-80 mb-3">Valor declarado dos bônus e ferramentas:</p>
        <p class="text-4xl md:text-5xl font-extrabold">R$ 1.665</p>
      </div>
    </div>
  </section>

  <!-- Section 18: Pricing 2 tiers -->
  <section id="valor" class="bg-white">
    <div class="max-w-5xl mx-auto px-4 py-20">
      <div class="grid md:grid-cols-2 gap-8">

        <!-- INGRESSO START -->
        <article class="bg-white border-2 border-neutral-200 rounded-2xl p-8 flex flex-col">
          <h3 class="text-xl font-bold uppercase tracking-wider text-neutral-700 mb-2">Ingresso Start</h3>
          <p class="text-sm text-neutral-500 mb-6">Apenas</p>
          <p class="text-5xl font-extrabold text-claude-purple mb-1">R$ 47</p>
          <p class="text-xs text-neutral-500 uppercase tracking-wider mb-6">Vagas já preenchidas 76%</p>
          <ul class="space-y-3 text-neutral-700 mb-8 flex-1">
            <li class="flex gap-2"><span class="text-claude-purple font-bold mt-0.5">✓</span>2 dias de workshop online e ao vivo</li>
            <li class="flex gap-2"><span class="text-claude-purple font-bold mt-0.5">✓</span>Plano de 100k com IA</li>
            <li class="flex gap-2"><span class="text-claude-purple font-bold mt-0.5">✓</span>Bônus da oferta</li>
            <li class="flex gap-2"><span class="text-claude-purple font-bold mt-0.5">✓</span>Método completo de criação de produto digital</li>
          </ul>
          <button @click="modal = 'start'"
                  class="w-full bg-neutral-900 hover:bg-claude-purple text-white font-bold py-4 rounded-xl transition-colors">
            PARTICIPAR COM START
          </button>
        </article>

        <!-- INGRESSO VIP -->
        <article class="bg-claude-purple text-white rounded-2xl p-8 flex flex-col shadow-2xl ring-4 ring-claude-purple-light/30 relative">
          <span class="absolute -top-3 right-6 bg-claude-purple-light text-claude-purple-dark text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
            Mais completo
          </span>
          <h3 class="text-xl font-bold uppercase tracking-wider mb-2 opacity-90">Ingresso VIP</h3>
          <p class="text-sm opacity-80 mb-6">Apenas</p>
          <p class="text-5xl font-extrabold mb-1">R$ 300</p>
          <p class="text-xs opacity-80 uppercase tracking-wider mb-6">Vagas já preenchidas 76%</p>
          <ul class="space-y-3 mb-8 flex-1">
            <li class="flex gap-2"><span class="text-claude-purple-light font-bold mt-0.5">✓</span>2 dias de workshop online e ao vivo</li>
            <li class="flex gap-2"><span class="text-claude-purple-light font-bold mt-0.5">✓</span>Plano de 100k com IA</li>
            <li class="flex gap-2"><span class="text-claude-purple-light font-bold mt-0.5">✓</span>Bônus da oferta</li>
            <li class="flex gap-2"><span class="text-claude-purple-light font-bold mt-0.5">✓</span>Método completo de criação de produto digital</li>
            <li class="flex gap-2"><span class="text-claude-purple-light font-bold mt-0.5">✓</span>Acesso a gravação por 7 dias</li>
            <li class="flex gap-2"><span class="text-claude-purple-light font-bold mt-0.5">✓</span>Sessão de perguntas e respostas com Wendell Carvalho</li>
          </ul>
          <button @click="modal = 'vip'"
                  class="w-full bg-white hover:bg-neutral-100 text-claude-purple-dark font-bold py-4 rounded-xl transition-colors">
            PARTICIPAR COM VIP
          </button>
        </article>

      </div>
    </div>
  </section>
```

- [ ] **Step 2: Visual check + commit**

```bash
cd clients/wendell-carvalho/deliverables/landing-claude-design && python3 -m http.server 8080 &
sleep 1
```
```
skill: browse
args: open http://localhost:8080#valor — screenshot 1440x900 — save to verification/pricing.png
```
Verificar: 5 bônus listados com ícones SVG + valores, total R$ 1.665 destacado em card roxo, 2 pricing cards lado-a-lado (START outline cinza · VIP sólido roxo com badge "Mais completo"). Cliques nos CTAs por enquanto não fazem nada (modais ainda não existem).

```bash
pkill -f "python3 -m http.server 8080"
git add clients/wendell-carvalho/deliverables/landing-claude-design/index.html
git commit -m "feat(wendell-lp): bonus stack + pricing 2 tiers (START + VIP)"
```

---

### Task 13: Por que este preço + Outcomes pós workshop — sections 19-20

**Files:**
- Modify: `clients/wendell-carvalho/deliverables/landing-claude-design/index.html`

- [ ] **Step 1: Adicionar aside + grid 2×2 de outcomes**

```html
  <!-- Section 19: Por que este preço -->
  <section id="por-que-preco" class="bg-neutral-50">
    <div class="max-w-2xl mx-auto px-4 py-16 text-center">
      <p class="text-sm font-semibold uppercase tracking-wider text-claude-purple mb-3">Por que este preço?</p>
      <p class="text-neutral-700 text-lg leading-relaxed">
        O Wendell quer que o maior número de pessoas tenha acesso a esse Workshop e transforme a realidade financeira de sua família. Mas ele cobra justamente pelo compromisso, mesmo que seja de R$47. Quando as vagas do 1º lote esgotarem, o preço sobe e não volta.
      </p>
    </div>
  </section>

  <!-- Section 20: Outcomes pós workshop -->
  <section id="outcomes" class="bg-white">
    <div class="max-w-5xl mx-auto px-4 py-20 md:py-24">
      <div class="text-center mb-14">
        <h2 class="text-3xl md:text-5xl font-bold mb-4">O que acontece com sua vida depois do Workshop?</h2>
        <p class="text-claude-purple font-semibold text-lg italic">Depois que se vê, não dá para desver</p>
      </div>
      <div class="grid md:grid-cols-2 gap-6">
        <div class="bg-neutral-50 rounded-2xl p-8 flex gap-4">
          <div class="w-12 h-12 bg-claude-purple/10 rounded-xl flex items-center justify-center text-claude-purple text-xl flex-shrink-0">📦</div>
          <h3 class="font-bold text-lg leading-snug">Seu produto digital pronto, cadastrado na Hotmart e com link de vendas no ar</h3>
        </div>
        <div class="bg-neutral-50 rounded-2xl p-8 flex gap-4">
          <div class="w-12 h-12 bg-claude-purple/10 rounded-xl flex items-center justify-center text-claude-purple text-xl flex-shrink-0">🪜</div>
          <h3 class="font-bold text-lg leading-snug">Sua esteira de produtos definida: do produto de entrada ao premium</h3>
        </div>
        <div class="bg-neutral-50 rounded-2xl p-8 flex gap-4">
          <div class="w-12 h-12 bg-claude-purple/10 rounded-xl flex items-center justify-center text-claude-purple text-xl flex-shrink-0">✨</div>
          <h3 class="font-bold text-lg leading-snug">Um posicionamento digital que finalmente reflete quem você já é</h3>
        </div>
        <div class="bg-neutral-50 rounded-2xl p-8 flex gap-4">
          <div class="w-12 h-12 bg-claude-purple/10 rounded-xl flex items-center justify-center text-claude-purple text-xl flex-shrink-0">⏳</div>
          <h3 class="font-bold text-lg leading-snug">Mais tempo para quem você ama, porque sua renda vai parar de depender só do seu tempo</h3>
        </div>
      </div>
    </div>
  </section>
```

- [ ] **Step 2: Commit**

```bash
git add clients/wendell-carvalho/deliverables/landing-claude-design/index.html
git commit -m "feat(wendell-lp): por que este preço + outcomes pós workshop"
```

---

### Task 14: Mentor bio split — section 21

**Files:**
- Modify: `clients/wendell-carvalho/deliverables/landing-claude-design/index.html`

- [ ] **Step 1: Adicionar bio do Wendell em grid 5col**

```html
  <!-- Section 21: Mentor bio -->
  <section id="mentor" class="bg-neutral-50">
    <div class="max-w-6xl mx-auto px-4 py-20 md:py-24">
      <h2 class="text-3xl md:text-5xl font-bold text-center mb-12">Quem será o seu mentor?</h2>
      <div class="grid md:grid-cols-5 gap-10 items-center">
        <div class="md:col-span-2">
          <img src="https://workshop.wendellcarvalho.com.br/wp-content/uploads/2026/05/Foto.webp"
               alt="Wendell Carvalho"
               loading="lazy"
               onerror="this.style.display='none'"
               class="w-full rounded-2xl shadow-xl">
        </div>
        <div class="md:col-span-3 space-y-5 text-neutral-700 leading-relaxed">
          <p class="text-lg">
            <strong class="text-claude-purple">Wendell Carvalho</strong> lidera a cultura da VIDA ÉPICA, um modo de vida em que prosperidade, propósito e liberdade caminham juntos. É o criador da metodologia Tríade da Prosperidade, que integra três frentes: emocional, relacional e técnica, um método desenvolvido para destravar a vida e colocar pessoas em movimento.
          </p>
          <p>
            Foi o primeiro produtor a ultrapassar a marca de R$ 250 milhões em vendas na Hotmart, maior plataforma de produtos digitais da América Latina, e hoje acumula mais de R$ 500 milhões comercializados na plataforma. Em 18 anos de atuação, já impactou mais de 1,1 milhão de clientes em 98 países e reúne mais de 12 milhões de seguidores em suas redes sociais.
          </p>
          <p>
            Cofundador do Grupo VIRTUS e cofundador da rede Cortê Visagismo para Homens. Também é sócio do GAIA, ecossistema de inteligência artificial aplicado à educação e performance.
          </p>
          <div class="grid grid-cols-3 gap-4 pt-4">
            <div class="text-center">
              <p class="text-2xl md:text-3xl font-extrabold text-claude-purple">R$ 500M</p>
              <p class="text-xs text-neutral-500 uppercase tracking-wide">Hotmart</p>
            </div>
            <div class="text-center">
              <p class="text-2xl md:text-3xl font-extrabold text-claude-purple">12M+</p>
              <p class="text-xs text-neutral-500 uppercase tracking-wide">Seguidores</p>
            </div>
            <div class="text-center">
              <p class="text-2xl md:text-3xl font-extrabold text-claude-purple">98</p>
              <p class="text-xs text-neutral-500 uppercase tracking-wide">Países</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
```

- [ ] **Step 2: Commit**

```bash
git add clients/wendell-carvalho/deliverables/landing-claude-design/index.html
git commit -m "feat(wendell-lp): mentor bio split (Wendell Carvalho)"
```

---

### Task 15: FAQ accordion (Alpine.js) — section 22

**Files:**
- Modify: `clients/wendell-carvalho/deliverables/landing-claude-design/index.html`

- [ ] **Step 1: Adicionar accordion com Alpine x-data**

```html
  <!-- Section 22: FAQ -->
  <section id="faq" class="bg-white">
    <div class="max-w-3xl mx-auto px-4 py-20 md:py-24" x-data="{ open: null }">
      <h2 class="text-3xl md:text-5xl font-bold text-center mb-12">Restou alguma dúvida?</h2>
      <div class="divide-y divide-neutral-200 border-y border-neutral-200">

        <div class="py-5">
          <button @click="open = open === 0 ? null : 0" class="w-full flex items-center justify-between text-left gap-4 font-semibold text-lg">
            <span>O Workshop será ao vivo?</span>
            <span class="text-claude-purple text-2xl transition-transform" :class="open === 0 ? 'rotate-45' : ''">+</span>
          </button>
          <div x-show="open === 0" x-collapse class="mt-3 text-neutral-600 leading-relaxed">
            Sim. O evento acontece ao vivo nos dias 06 e 07 de junho, sábado e domingo, a partir das 9h da manhã.
          </div>
        </div>

        <div class="py-5">
          <button @click="open = open === 1 ? null : 1" class="w-full flex items-center justify-between text-left gap-4 font-semibold text-lg">
            <span>Terei acesso à gravação?</span>
            <span class="text-claude-purple text-2xl transition-transform" :class="open === 1 ? 'rotate-45' : ''">+</span>
          </button>
          <div x-show="open === 1" x-collapse class="mt-3 text-neutral-600 leading-relaxed">
            Não, mas você pode comprar o ingresso VIP, que dá acesso à gravação por 7 dias após o evento. Mas recomendamos participar ao vivo – o método é denso e você vai querer fazer perguntas.
          </div>
        </div>

        <div class="py-5">
          <button @click="open = open === 2 ? null : 2" class="w-full flex items-center justify-between text-left gap-4 font-semibold text-lg">
            <span>Como funciona o Workshop?</span>
            <span class="text-claude-purple text-2xl transition-transform" :class="open === 2 ? 'rotate-45' : ''">+</span>
          </button>
          <div x-show="open === 2" x-collapse class="mt-3 text-neutral-600 leading-relaxed">
            É um evento 100% online e ao vivo, que acontece durante um final de semana completo (sábado e domingo, 06 e 07 de Junho). Você participa do conforto da sua casa através de uma plataforma simples de usar. São 2 dias de conteúdo mão na massa com Wendell Carvalho.
          </div>
        </div>

        <div class="py-5">
          <button @click="open = open === 3 ? null : 3" class="w-full flex items-center justify-between text-left gap-4 font-semibold text-lg">
            <span>Quais são as formas de pagamento?</span>
            <span class="text-claude-purple text-2xl transition-transform" :class="open === 3 ? 'rotate-45' : ''">+</span>
          </button>
          <div x-show="open === 3" x-collapse class="mt-3 text-neutral-600 leading-relaxed">
            Aceitamos cartão de crédito e PIX. Após a confirmação do pagamento, você recebe todos os detalhes e materiais para a imersão.
          </div>
        </div>

        <div class="py-5">
          <button @click="open = open === 4 ? null : 4" class="w-full flex items-center justify-between text-left gap-4 font-semibold text-lg">
            <span>Por que o 1° lote custa apenas R$47?</span>
            <span class="text-claude-purple text-2xl transition-transform" :class="open === 4 ? 'rotate-45' : ''">+</span>
          </button>
          <div x-show="open === 4" x-collapse class="mt-3 text-neutral-600 leading-relaxed">
            Porque Wendell quer que o maior número possível de pessoas tenha acesso a esse Workshop. Mas ele cobra justamente pelo compromisso, mesmo que seja de R$47. Quando as vagas do 1º lote esgotarem, o preço sobe e não volta.
          </div>
        </div>

        <div class="py-5">
          <button @click="open = open === 5 ? null : 5" class="w-full flex items-center justify-between text-left gap-4 font-semibold text-lg">
            <span>Eu não tenho muitos seguidores. O Workshop é para mim?</span>
            <span class="text-claude-purple text-2xl transition-transform" :class="open === 5 ? 'rotate-45' : ''">+</span>
          </button>
          <div x-show="open === 5" x-collapse class="mt-3 text-neutral-600 leading-relaxed">
            Sim. O método não depende de uma grande audiência para funcionar. Você aprende a criar, estruturar e vender antes mesmo de precisar construir uma base enorme.
          </div>
        </div>

        <div class="py-5">
          <button @click="open = open === 6 ? null : 6" class="w-full flex items-center justify-between text-left gap-4 font-semibold text-lg">
            <span>Tenho muitas ideias de produto. Vocês vão me ajudar a escolher a melhor?</span>
            <span class="text-claude-purple text-2xl transition-transform" :class="open === 6 ? 'rotate-45' : ''">+</span>
          </button>
          <div x-show="open === 6" x-collapse class="mt-3 text-neutral-600 leading-relaxed">
            Sim. Uma das primeiras etapas é identificar qual ideia tem mais potencial de mercado para o seu perfil, com base no que você já sabe e no que o mercado está buscando.
          </div>
        </div>

        <div class="py-5">
          <button @click="open = open === 7 ? null : 7" class="w-full flex items-center justify-between text-left gap-4 font-semibold text-lg">
            <span>Funciona para qualquer nicho?</span>
            <span class="text-claude-purple text-2xl transition-transform" :class="open === 7 ? 'rotate-45' : ''">+</span>
          </button>
          <div x-show="open === 7" x-collapse class="mt-3 text-neutral-600 leading-relaxed">
            Sim. Médicos, dentistas, advogados, instrutores, consultores, maquiagem, agropecuária, contabilidade e muitos outros nichos podem aplicar o método onde existe conhecimento com demanda.
          </div>
        </div>

      </div>
    </div>
  </section>
```

- [ ] **Step 2: Adicionar collapse plugin do Alpine no `<head>` (entre o Tailwind e o Alpine core)**

Editar a linha do Alpine no head:

```html
  <!-- Alpine.js (collapse plugin antes do core) -->
  <script defer src="https://cdn.jsdelivr.net/npm/@alpinejs/collapse@3.x.x/dist/cdn.min.js"></script>
  <script defer src="https://unpkg.com/alpinejs@3.x.x/dist/cdn.min.js"></script>
```

- [ ] **Step 3: Interactive check via /browse**

```bash
cd clients/wendell-carvalho/deliverables/landing-claude-design && python3 -m http.server 8080 &
sleep 1
```
```
skill: browse
args: open http://localhost:8080#faq — click on first FAQ button "O Workshop será ao vivo?" — screenshot — confirm answer expands
```
Verificar: + roda 45° quando clicado, conteúdo expande smooth, clicar de novo colapsa. Outros itens fechados quando um abre.

```bash
pkill -f "python3 -m http.server 8080"
git add clients/wendell-carvalho/deliverables/landing-claude-design/index.html
git commit -m "feat(wendell-lp): FAQ accordion (Alpine.js) com 8 perguntas"
```

---

### Task 16: Close final + Footer — sections 23-24

**Files:**
- Modify: `clients/wendell-carvalho/deliverables/landing-claude-design/index.html`

- [ ] **Step 1: Adicionar close final full-bleed roxo + footer minimal**

```html
  <!-- Section 23: Close final -->
  <section id="close" class="bg-claude-purple text-white">
    <div class="max-w-4xl mx-auto px-4 py-20 md:py-24 text-center">
      <p class="text-sm font-semibold uppercase tracking-wider opacity-80 mb-4">Vagas limitadas.</p>
      <h2 class="text-3xl md:text-5xl font-extrabold leading-tight mb-6">
        A invisibilidade é uma escolha.
      </h2>
      <p class="text-lg md:text-xl opacity-90 leading-relaxed max-w-2xl mx-auto mb-10">
        Você tem o conhecimento. Tem a história. Tem o resultado.
        <br>Falta apenas a sequência certa para transformar tudo isso em produto, presença e receita no digital.
      </p>
      <a href="https://pay.hotmart.com/Y105698965X?off=vqedhper&checkoutMode=10"
         target="_blank"
         class="inline-flex items-center gap-3 bg-white hover:bg-neutral-100 text-claude-purple font-bold text-lg px-10 py-5 rounded-xl shadow-lg transition-all">
        QUERO GARANTIR MINHA VAGA
        <span aria-hidden="true">→</span>
      </a>
    </div>
  </section>

  <!-- Section 24: Footer -->
  <footer class="bg-neutral-900 text-neutral-400">
    <div class="max-w-6xl mx-auto px-4 py-6 text-center text-sm">
      2026 © Wendell Carvalho — Todos os direitos reservados
    </div>
  </footer>
```

- [ ] **Step 2: Visual check + commit**

```bash
cd clients/wendell-carvalho/deliverables/landing-claude-design && python3 -m http.server 8080 &
sleep 1
```
```
skill: browse
args: open http://localhost:8080#close — screenshot 1440x900 — save to verification/close.png
```

```bash
pkill -f "python3 -m http.server 8080"
git add clients/wendell-carvalho/deliverables/landing-claude-design/index.html
git commit -m "feat(wendell-lp): close final full-bleed + footer"
```

---

## Phase 3 — Modais + polish

### Task 17: Modal START (Alpine + form + redirect)

**Files:**
- Modify: `clients/wendell-carvalho/deliverables/landing-claude-design/index.html`

- [ ] **Step 1: Adicionar modal START antes do `</body>`**

Inserir no slot `<!-- MODAIS Alpine -->`:

```html
  <!-- ============================================================
       MODAIS Alpine — disparados pelos botões pricing
       ============================================================ -->

  <!-- Modal START -->
  <div x-show="modal === 'start'"
       x-transition.opacity
       @click.self="modal = null"
       class="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
       style="display: none;">
    <div @click.stop x-transition class="bg-white rounded-2xl max-w-md w-full p-8 shadow-2xl">
      <button @click="modal = null" class="float-right text-neutral-400 hover:text-neutral-900 text-2xl leading-none" aria-label="Fechar">×</button>
      <h3 class="text-2xl font-bold mb-2">Complete seus dados para continuar</h3>
      <p class="text-sm text-neutral-600 mb-6">Seus dados serão usados apenas para facilitar sua compra e o contato relacionado à sua inscrição.</p>

      <form @submit.prevent="
              const params = new URLSearchParams({
                name: $event.target.nome.value,
                phone: $event.target.telefone.value,
                email: $event.target.email.value
              });
              window.location.href = 'https://pay.hotmart.com/Y105698965X?off=vqedhper&checkoutMode=10&' + params.toString();
            "
            class="space-y-3">
        <input name="nome" type="text" required placeholder="Nome Completo"
               class="w-full px-4 py-3 rounded-lg border border-neutral-300 focus:border-claude-purple focus:ring-2 focus:ring-claude-purple/20 outline-none">
        <input name="telefone" type="tel" required placeholder="WhatsApp (DDD+Número)"
               class="w-full px-4 py-3 rounded-lg border border-neutral-300 focus:border-claude-purple focus:ring-2 focus:ring-claude-purple/20 outline-none">
        <input name="email" type="email" required placeholder="Seu melhor e-mail"
               class="w-full px-4 py-3 rounded-lg border border-neutral-300 focus:border-claude-purple focus:ring-2 focus:ring-claude-purple/20 outline-none">
        <button type="submit"
                class="w-full bg-claude-purple hover:bg-claude-purple-dark text-white font-bold py-4 rounded-lg transition">
          IR PARA O CHECKOUT
        </button>
      </form>
    </div>
  </div>
```

- [ ] **Step 2: Interactive check via /browse**

```bash
cd clients/wendell-carvalho/deliverables/landing-claude-design && python3 -m http.server 8080 &
sleep 1
```
```
skill: browse
args: open http://localhost:8080#valor — click on button "PARTICIPAR COM START" — screenshot modal open — fill nome=Teste tel=11999999999 email=teste@example.com — click "IR PARA O CHECKOUT" — confirm redirect URL contains name=Teste&phone=11999999999&email=teste@example.com
```

```bash
pkill -f "python3 -m http.server 8080"
git add clients/wendell-carvalho/deliverables/landing-claude-design/index.html
git commit -m "feat(wendell-lp): START modal (Alpine.js + form + redirect com prefill)"
```

---

### Task 18: Modal VIP + TODO comment + ESC close confirmation

**Files:**
- Modify: `clients/wendell-carvalho/deliverables/landing-claude-design/index.html`

- [ ] **Step 1: Adicionar modal VIP logo abaixo do modal START**

```html
  <!-- Modal VIP -->
  <!-- TODO Wendell: confirmar se ingresso VIP usa outro `off` code no Hotmart.
       Default abaixo aponta pro mesmo checkout do START (`off=vqedhper`).
       Trocar pela URL completa do VIP se diferente. -->
  <div x-show="modal === 'vip'"
       x-transition.opacity
       @click.self="modal = null"
       class="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
       style="display: none;">
    <div @click.stop x-transition class="bg-white rounded-2xl max-w-md w-full p-8 shadow-2xl">
      <button @click="modal = null" class="float-right text-neutral-400 hover:text-neutral-900 text-2xl leading-none" aria-label="Fechar">×</button>
      <span class="inline-block bg-claude-purple-light/30 text-claude-purple-dark text-xs font-bold px-2 py-1 rounded mb-2 uppercase tracking-wider">Ingresso VIP</span>
      <h3 class="text-2xl font-bold mb-2">Complete seus dados para continuar</h3>
      <p class="text-sm text-neutral-600 mb-6">Seus dados serão usados apenas para facilitar sua compra e o contato relacionado à sua inscrição.</p>

      <form @submit.prevent="
              const params = new URLSearchParams({
                name: $event.target.nome.value,
                phone: $event.target.telefone.value,
                email: $event.target.email.value
              });
              window.location.href = 'https://pay.hotmart.com/Y105698965X?off=vqedhper&checkoutMode=10&' + params.toString();
            "
            class="space-y-3">
        <input name="nome" type="text" required placeholder="Nome Completo"
               class="w-full px-4 py-3 rounded-lg border border-neutral-300 focus:border-claude-purple focus:ring-2 focus:ring-claude-purple/20 outline-none">
        <input name="telefone" type="tel" required placeholder="WhatsApp (DDD+Número)"
               class="w-full px-4 py-3 rounded-lg border border-neutral-300 focus:border-claude-purple focus:ring-2 focus:ring-claude-purple/20 outline-none">
        <input name="email" type="email" required placeholder="Seu melhor e-mail"
               class="w-full px-4 py-3 rounded-lg border border-neutral-300 focus:border-claude-purple focus:ring-2 focus:ring-claude-purple/20 outline-none">
        <button type="submit"
                class="w-full bg-claude-purple hover:bg-claude-purple-dark text-white font-bold py-4 rounded-lg transition">
          IR PARA O CHECKOUT
        </button>
      </form>
    </div>
  </div>
```

- [ ] **Step 2: Interactive check + ESC test**

```bash
cd clients/wendell-carvalho/deliverables/landing-claude-design && python3 -m http.server 8080 &
sleep 1
```
```
skill: browse
args: open http://localhost:8080#valor — click "PARTICIPAR COM VIP" — confirm modal VIP open com badge — press ESC — confirm modal closes — click outside modal — confirm closes
```

```bash
pkill -f "python3 -m http.server 8080"
git add clients/wendell-carvalho/deliverables/landing-claude-design/index.html
git commit -m "feat(wendell-lp): VIP modal (clone START com TODO off-code comment)"
```

---

### Task 19: Smooth scroll anchor do hero pra pricing

**Files:**
- Modify: `clients/wendell-carvalho/deliverables/landing-claude-design/index.html`

- [ ] **Step 1: Trocar href do CTA hero pra âncora interna (alternativa ao checkout direto)**

Decisão de design: o CTA hero pode ir direto pro checkout (current) OU rolar pra seção de pricing (mais "qualificado"). Spec menciona âncora `#valor` no scroll-behavior. **Manter como está (link direto pro checkout) pra fidelidade à página original** — o `scroll-behavior: smooth` no `<html>` já está aplicado se houver outras âncoras no futuro.

- [ ] **Step 2: Verificar que pricing section tem id="valor"**

Já tem (`<section id="valor">` no Task 12). Sem mudança de código necessária — só commit da nota.

Nenhum commit necessário (sem alteração). Pular pra Task 20.

---

## Phase 4 — Local serve + handoff

### Task 20: serve.sh executável

**Files:**
- Create: `clients/wendell-carvalho/deliverables/landing-claude-design/serve.sh`

- [ ] **Step 1: Criar script**

```bash
cat > clients/wendell-carvalho/deliverables/landing-claude-design/serve.sh <<'EOF'
#!/usr/bin/env bash
# Roda a landing page local em http://localhost:8080
set -e
cd "$(dirname "$0")"
PORT="${PORT:-8080}"
echo "→ Servindo em http://localhost:${PORT}"
echo "  Ctrl+C pra parar"
python3 -m http.server "$PORT"
EOF
chmod +x clients/wendell-carvalho/deliverables/landing-claude-design/serve.sh
```

- [ ] **Step 2: Smoke test**

```bash
./clients/wendell-carvalho/deliverables/landing-claude-design/serve.sh &
SERVER_PID=$!
sleep 1
curl -sI http://localhost:8080/index.html | head -1
# Expected: HTTP/1.0 200 OK
kill $SERVER_PID
```

- [ ] **Step 3: Commit**

```bash
git add clients/wendell-carvalho/deliverables/landing-claude-design/serve.sh
git commit -m "feat(wendell-lp): serve.sh executável (python3 http.server porta 8080)"
```

---

### Task 21: README.md de handoff

**Files:**
- Create: `clients/wendell-carvalho/deliverables/landing-claude-design/README.md`

- [ ] **Step 1: Escrever README**

```markdown
# Landing Page — Workshop Produto Digital com IA

**Cliente:** Wendell Carvalho
**Produto:** Workshop Produto Digital com IA — 6 e 7 de junho · R$ 47 (Start) / R$ 300 (VIP)
**Design system:** Identidade visual replicada da Claude page (Operação Claude Code)

## Rodar local

```bash
./serve.sh
# Abre em http://localhost:8080
```

Requer apenas `python3` (vem no macOS/Linux). Não tem `npm install`, não tem build.

## Subir em produção

O `index.html` é stand-alone — basta enviar pra qualquer host de arquivos estáticos:

- **Netlify / Vercel:** drag-and-drop do `index.html`
- **Hostinger / cPanel:** upload via FTP em `public_html/`
- **WordPress page:** cole o conteúdo do `<body>` num template HTML custom (importa Tailwind + Alpine via CDN se ainda não estiverem)

Todos os assets externos (imagens, vídeo Panda, logos) já apontam pra `workshop.wendellcarvalho.com.br/...` — funcionam direto, sem precisar baixar nada.

## TODO antes de subir pra prod

- [ ] **Confirmar `off` code do VIP** no Hotmart — atualmente os botões START e VIP apontam pro mesmo checkout (`Y105698965X?off=vqedhper`). Se o VIP usa outro código, trocar a URL no `index.html` (procurar pelo comentário `<!-- TODO Wendell -->`).
- [ ] **Plugar GTM/Pixel** se quiser tracking — adicionar `<script>` no `<head>`. Não está incluído por padrão.
- [ ] **Cookie banner LGPD** se aplicável — não está incluído.

## Editar copy

Toda a copy é texto literal dentro de cada `<section>` no `index.html`. Sem framework, sem build. Abre, edita, salva, atualiza no browser.

A versão literal da copy original também está em `copy-source.md` pra referência.

## Substituir imagens

Trocar o `src` das tags `<img>` (todas absolutas pra `workshop.wendellcarvalho.com.br/wp-content/uploads/2026/05/...`). Pra hospedar imagens próprias, baixe pra uma pasta `assets/` local e ajuste os paths.

## Arquivos

- `index.html` — **a página em si** (~700 linhas)
- `serve.sh` — server local pra dev
- `design-system.md` — tokens (cores, fontes, spacing) extraídos da Claude page
- `html-patterns.md` — convenções de markup extraídas
- `copy-source.md` — copy original literal
- `verification/` — screenshots de QA visual
```

- [ ] **Step 2: Commit**

```bash
git add clients/wendell-carvalho/deliverables/landing-claude-design/README.md
git commit -m "docs(wendell-lp): README handoff (run local + deploy + edit instructions)"
```

---

## Phase 5 — Verificação visual

### Task 22: Screenshots desktop + mobile completos

**Files:**
- Create: `clients/wendell-carvalho/deliverables/landing-claude-design/verification/full-desktop.png`
- Create: `clients/wendell-carvalho/deliverables/landing-claude-design/verification/full-mobile.png`

- [ ] **Step 1: Subir servidor**

```bash
cd clients/wendell-carvalho/deliverables/landing-claude-design && python3 -m http.server 8080 &
sleep 1
```

- [ ] **Step 2: Screenshot full-page desktop**

```
skill: browse
args: open http://localhost:8080 — fullpage screenshot at 1440x900 — save to clients/wendell-carvalho/deliverables/landing-claude-design/verification/full-desktop.png
```

- [ ] **Step 3: Screenshot full-page mobile**

```
skill: browse
args: open http://localhost:8080 — fullpage screenshot at 375x800 viewport — save to clients/wendell-carvalho/deliverables/landing-claude-design/verification/full-mobile.png
```

- [ ] **Step 4: Console errors check**

```
skill: browse
args: open http://localhost:8080 — list all console errors and warnings
```
Esperado: 0 errors. Aceitável: warnings de "Tailwind CDN should not be used in production" (não bloqueia uso).

- [ ] **Step 5: Commit screenshots**

```bash
pkill -f "python3 -m http.server 8080"
git add clients/wendell-carvalho/deliverables/landing-claude-design/verification/
git commit -m "test(wendell-lp): verification screenshots desktop + mobile + console clean"
```

---

### Task 23: Click test — FAQ + Modal + CTAs

**Files:**
- (verification only — no code changes expected; se bugs surgirem, corrigir e re-commitar)

- [ ] **Step 1: Subir servidor**

```bash
cd clients/wendell-carvalho/deliverables/landing-claude-design && python3 -m http.server 8080 &
sleep 1
```

- [ ] **Step 2: Test FAQ accordion**

```
skill: browse
args: open http://localhost:8080#faq —
      click "O Workshop será ao vivo?" → confirm answer expands
      click again → confirm collapses
      click "Terei acesso à gravação?" → confirm expands AND previous closed (mutual exclusion)
```

- [ ] **Step 3: Test START modal**

```
skill: browse
args: open http://localhost:8080#valor —
      click "PARTICIPAR COM START" → confirm modal opens
      try submit empty → confirm HTML5 required blocks
      fill all 3 fields with name=Teste, phone=11999999999, email=teste@example.com
      click "IR PARA O CHECKOUT" → confirm URL becomes pay.hotmart.com/Y105698965X?off=vqedhper&checkoutMode=10&name=Teste&phone=11999999999&email=teste%40example.com
```

- [ ] **Step 4: Test VIP modal**

```
skill: browse
args: open http://localhost:8080#valor —
      click "PARTICIPAR COM VIP" → confirm VIP modal opens (com badge "Ingresso VIP")
      press ESC → confirm closes
      reopen → click outside modal → confirm closes
```

- [ ] **Step 5: Test direct CTAs (hero, mid, close)**

```
skill: browse
args: open http://localhost:8080 — click hero CTA "QUERO GARANTIR MINHA VAGA" → confirm new tab opens to pay.hotmart.com/Y105698965X?off=vqedhper&checkoutMode=10
```

- [ ] **Step 6: Se algum bug surgir, corrigir + recommit**

Pra cada bug encontrado: corrigir no `index.html` → re-testar → commit `fix(wendell-lp): <bug fix description>`. Não pular pra Task 24 sem todos os testes passarem.

- [ ] **Step 7: Matar server**

```bash
pkill -f "python3 -m http.server 8080"
```

---

### Task 24: Visual diff conceitual contra a Claude page de referência

**Files:**
- Create: `clients/wendell-carvalho/deliverables/landing-claude-design/verification/diff-notes.md`

- [ ] **Step 1: Screenshot da Claude page pra comparação**

```bash
cd clients/wendell-carvalho/deliverables/landing-claude-design && python3 -m http.server 8080 &
sleep 1
```

```
skill: browse
args: open https://claude.escoladeautomacao.com.br/operacao-claude-code/?xcod=1779385773230_17793852610973 — fullpage screenshot at 1440x900 — save to clients/wendell-carvalho/deliverables/landing-claude-design/verification/reference-claude.png
```

- [ ] **Step 2: Escrever notes comparativas**

Comparar `full-desktop.png` (Wendell) vs `reference-claude.png` (Claude) — escrever em `verification/diff-notes.md`:

```markdown
# Visual Diff — Wendell LP vs Claude Page (referência)

**Data:** [DATA]
**Comparação:** verification/full-desktop.png vs verification/reference-claude.png

## ✓ Tokens replicados
- Paleta roxo principal: [hex usado] (bate com Claude page)
- Tipografia: [família/peso/hierarquia] — match
- Button style: roxo sólido + seta → + rounded — match
- Espaçamento vertical seções: [padding] — match
- Layout full-width com max-content centered: match

## ⚠ Divergências aceitas (cliente diferente)
- Wendell tem 24 seções vs Claude page tem [N] — sections extras (bonus stack, dual pricing, mentorados grid) usam o mesmo vocabulário visual
- Cores complementares ajustadas: [exemplo]

## 🔴 Issues encontradas (corrigir antes de prod)
- [Lista vazia se tudo OK; caso contrário, anotar]
```

- [ ] **Step 3: Commit + matar server**

```bash
pkill -f "python3 -m http.server 8080"
git add clients/wendell-carvalho/deliverables/landing-claude-design/verification/
git commit -m "test(wendell-lp): visual diff notes vs Claude page reference"
```

---

### Task 25: Final summary + ship handoff

**Files:**
- (no code changes — final report)

- [ ] **Step 1: Conferir estrutura final**

```bash
ls -la clients/wendell-carvalho/deliverables/landing-claude-design/
# Expected:
#   index.html
#   serve.sh (executable)
#   README.md
#   design-system.md
#   html-patterns.md
#   copy-source.md
#   verification/
```

- [ ] **Step 2: Rodar final + screenshot pro Yuri**

```bash
./clients/wendell-carvalho/deliverables/landing-claude-design/serve.sh &
sleep 1
```

```
skill: browse
args: open http://localhost:8080 — take a final screenshot
```

Mandar pro Yuri via SendUserFile com `verification/full-desktop.png` e caption "Landing pronta — http://localhost:8080".

- [ ] **Step 3: Matar server final**

```bash
pkill -f "python3 -m http.server 8080"
```

- [ ] **Step 4: Atualizar wiki do magnus-os com resumo da entrega**

Conforme regra do CLAUDE.md user-global, anexar bloco na wiki em `~/Documents/Pessoal/wiki/wiki/projects/<slug>.md` (se o magnus-os estiver mapeado) com:

```markdown
  - O que foi feito: Landing page do Workshop do Wendell construída usando copy 100% literal + identidade visual replicada da Claude page. HTML único + Tailwind CDN + Alpine. Roda em `python3 -m http.server 8080`.
  - Decisões: HTML único pra facilitar handoff · espelho total de assets (hotlink) · form modal frontend-only com prefill query params · VIP usa mesmo off code do START (TODO comment)
  - Arquivos tocados: clients/wendell-carvalho/deliverables/landing-claude-design/* · docs/superpowers/{specs,plans}/2026-05-21-wendell-landing-*
  - Próximo: Wendell confirma VIP off code · plugar GTM/Pixel · subir em prod
  - Conexões: [[claude-design-language]] [[hotmart-checkout-prefill-params]] [[brainstorming-spec-plan-flow]]
```

---

## Self-Review Notes

**Spec coverage check:**
- ✓ Spec section 4 (Arquitetura) → Tasks 1, 20, 21
- ✓ Spec section 5 (Stack) → Task 3 (skeleton com Tailwind + Alpine + Google Fonts)
- ✓ Spec section 6 (24 seções) → Tasks 4-16
- ✓ Spec section 7 (Interatividade) → Task 15 (FAQ), 17-18 (modais), 19 (smooth scroll)
- ✓ Spec section 8 (Pipeline) → Task 2 (extract + ui-ux-pro-max consult), Tasks 4-18 implementam
- ✓ Spec section 9 (Testing) → Tasks 22-24
- ✓ Spec section 10 (Error handling) → Boundaries cobertas: onerror nas imagens (Tasks 5, 6, 9, 12, 14) · HTML5 required nos forms (Tasks 17-18) · aspect-video wrapper no Panda (Task 4)
- ✓ Spec section 11 (Handoff README) → Task 21
- ✓ Spec section 12 (Fora de escopo) → Não há tasks pra build/minificação/GTM/i18n/LGPD/cache local (correto)

**Placeholder scan:** Nenhuma instância de TBD/TODO no plano (o `<!-- TODO Wendell -->` no HTML é intencional e documentado em Task 18 + README).

**Type consistency:** `modal === 'start'` e `modal === 'vip'` consistentes entre Tasks 12 (botões disparam), 17 (modal START), 18 (modal VIP). Color tokens `claude-purple`, `claude-purple-dark`, `claude-purple-light` consistentes em todas as tasks.

**Granularidade:** 25 tasks · cada uma de 5-15 min · TDD-light adaptado pra HTML estático (verificação visual via `/browse` em vez de unit test).
