# Landing Page — Workshop Wendell Carvalho (visual identity Claude page)

**Cliente:** Wendell Carvalho
**Slug:** `wendell-carvalho`
**Deliverable:** `clients/wendell-carvalho/deliverables/landing-claude-design/`
**Data:** 2026-05-21
**Status:** Spec aprovada — pronta pra plano de implementação

---

## 1. Objetivo

Reconstruir a landing page de vendas do "Workshop Produto Digital com IA" (Wendell Carvalho, R$47 ingresso start, 6 e 7 de junho) usando a **identidade visual da página "Operação Claude Code"** (claude.escoladeautomacao.com.br) — copy 100% literal da página original do Wendell, design 100% inspirado na Claude page. Entregável é um arquivo HTML único rodando local via `python3 -m http.server`, autocontido o suficiente pro cliente subir em qualquer host.

## 2. Fontes

- **Copy (literal):** https://workshop.wendellcarvalho.com.br/wpdia-lp001-longa-aa/?xcod=1779385777607_17793857669963
- **Design (identidade visual):** https://claude.escoladeautomacao.com.br/operacao-claude-code/?xcod=1779385773230_17793852610973

## 3. Decisões tomadas no brainstorming

| Decisão | Escolha | Razão |
|---|---|---|
| Dono do projeto | Cliente Wendell, copy 100% literal | Slug, voice e fidelidade vêm do cliente |
| Stack | HTML único + Tailwind CDN (3.x play) + Alpine.js CDN | Zero build, 1 arquivo, fácil handoff |
| Tratamento de assets | Espelho total — hotlink imagens + embed Panda original + checkout URL original | Visual idêntico desde o load 1, Wendell mantém controle dos assets no servidor dele |
| Direção de design | Fidelidade máxima à Claude page | Pedido literal foi "replicar identidade visual" |
| Pipeline de extração | `/extract-design-system` na Claude page (não `/ui-ux-pro-max` — esse é design intelligence, não extrator de URL) | Tool correto pra capturar tokens + html patterns reais |
| Modais pré-checkout | Replicar o flow original — form nome/tel/email → query params no checkout Hotmart | "Exatamente a mesma copy" implica replicar o flow |

## 4. Arquitetura do output

```
clients/wendell-carvalho/deliverables/landing-claude-design/
├── index.html              # Entregável — 1 arquivo, ~600-800 linhas
├── serve.sh                # python3 -m http.server 8080
├── README.md               # Como rodar + como subir em prod
├── design-system.md        # Tokens extraídos da Claude page (referência)
├── html-patterns.md        # Convenções de markup extraídas (referência)
└── copy-source.md          # Copy literal congelada do Wendell (referência)
```

Os 3 `.md` de referência ficam na pasta pra rastreabilidade (auditoria de copy + handoff visual pro cliente). Não vão pra prod — só o `index.html` precisa subir.

## 5. Stack técnico

- **HTML5 + Tailwind CSS via CDN play** (`https://cdn.tailwindcss.com`)
  - Config inline com paleta da Claude page como custom colors (`claude-purple`, etc — preenchido após extração)
  - Custom fonts via Google Fonts CDN (família a determinar pela extração)
- **Alpine.js via CDN** (`https://unpkg.com/alpinejs@3.x.x/dist/cdn.min.js`)
  - FAQ accordion: `x-data="{ open: null }"`
  - Modais pré-checkout: `x-data="{ modal: null }"` no `<body>`
- **Iframes:**
  - VSL hero: Panda Player embed `https://player-vz-71c67aff-ab9.tv.pandavideo.com.br/embed/?v=350103dc-e582-410c-97c0-9f52064191b7`
  - 3 outros vídeos Panda em seções secundárias (depoimentos/etc, IDs já mapeados)
- **Imagens:** 21 assets hotlinked direto de `workshop.wendellcarvalho.com.br/wp-content/uploads/2026/05/` (Logotipo.svg, 76.webp, Invisivel.webp, Dia-01.webp, Dia-02.webp, 6 fotos de mentorados, 5 ícones SVG de bônus, FAQ.svg, Foto.webp, Rodape-NONE.svg)

## 6. Estrutura de seções (mapeamento copy → componente)

24 seções + 1 modal duplicado (START e VIP).

Banda **ABERTURA**:
1. Top bar utility (32px, ícones + texto cinza)
2. Hero (H1 4xl-7xl + sub + CTA roxo sólido com seta)
3. VSL (Panda embed em aspect-video com sombra)
4. Urgency strip repetido N× ao longo da página (faixa roxa full-width 48px)

Banda **PROBLEMA → MÉTODO**:
5. Problema "Você é referência..." (text block + Invisivel.webp lateral)
6. Section divider "Uma sequência construída..."
7. Método 2 dias (grid 2col cards Dia 1 + Dia 2 com ilustrações + 6 bullets cada)
8. Outcome pull quote (card branco sombra + borda roxa esquerda)
9. CTA mid + barra 76%

Banda **DIFERENCIAÇÃO → SOCIAL PROOF**:
10. Heading "TENTAR SOZINHO NÃO FUNCIONA" + lead
11. Tabela comparativa 2 cards (Sozinho cinza ✗ vs Workshop roxo ✓)
12. Heading social proof "Eles também achavam..."
13. Grid 6 cards mentorados (foto círculo + nome + @handle + chip "R$ XXM")
14. CTA mid #2 (reusa 9)

Banda **FIT → OFERTA → PROVA**:
15. Para quem é — grid 6 personas
16. Você NÃO precisa — 3 colunas com ✗ riscado
17. Stack de bônus — 5 linhas ícone+nome+preço, total R$1.665
18. Pricing 2 tiers — START outline R$47 / VIP sólido roxo R$300 (badge "Mais completo") — CTAs abrem modais respectivos
19. Aside "Por que este preço?" — texto centered max-w-2xl
20. Outcomes pós workshop — grid 2×2

Banda **AUTORIDADE → FAQ → CLOSE**:
21. Mentor bio split (foto lg 2col + texto 3col + números destacados R$500M · 12M · 98 países)
22. FAQ accordion 8 perguntas (Alpine)
23. Close final — section roxo full-bleed + CTA branco
24. Footer minimal "2026 © Wendell Carvalho..."

**Modais (M1 = START, M2 = VIP):**
- Overlay escuro 50% + card centered max-w-md
- Form: nome, telefone, email (`required` HTML5)
- **Submit é puramente frontend** — JS captura os 3 campos e faz `window.location = checkoutURL + '&name=...&email=...&phone=...'` (Hotmart aceita esses query params pra prefill). NÃO replicamos o backend Elementor/WordPress que a página original usa pra captura de leads + UTMs.
- **URLs de checkout:** o HTML original só expõe **uma** URL (`pay.hotmart.com/Y105698965X?off=vqedhper&checkoutMode=10`). O `off` code do VIP provavelmente está configurado no admin do Elementor (não visível no frontend). **Default da implementação:** ambos os tiers apontam pra mesma URL; deixamos um comentário visível no HTML `<!-- TODO Wendell: confirmar se VIP usa outro off code -->` pra cliente substituir antes de subir em prod.
- Direct CTAs (hero, mid, final close) não abrem modal — vão direto pra `pay.hotmart.com/Y105698965X?off=vqedhper&checkoutMode=10` (matches o que está no HTML original linha 1119).

## 7. Interatividade

| Componente | Implementação |
|---|---|
| FAQ accordion | Alpine `x-data="{ open: null }"`, cada item `@click="open = open === N ? null : N"`, conteúdo `x-show="open === N" x-collapse` |
| Modal pré-checkout | Alpine `x-data="{ modal: null }"` no body. Botões START/VIP setam `modal = 'start'\|'vip'`. ESC fecha. Click no overlay fecha. Submit é frontend-only: JS captura name/phone/email + monta query string + `window.location` pro checkout Hotmart com prefill |
| Smooth scroll | `html { scroll-behavior: smooth }` + âncoras `#valor` no CTA hero |
| Lazy load imagens | `<img loading="lazy" onerror="this.style.display='none'">` em todas as `<img>` |
| "VAGAS 76%" | Texto estático "VAGAS JÁ PREENCHIDAS 76%" + barra de progresso `<div style="width:76%">` gradiente roxo (não é countdown JS, é literal igual à página original) |

## 8. Pipeline de execução (alto nível)

1. **Criar pasta** `clients/wendell-carvalho/deliverables/landing-claude-design/`
2. **Extrair design system** — rodar `/extract-design-system` apontando pra Claude page → gera `design-system.md` + `html-patterns.md` na pasta
3. **Consultar `/ui-ux-pro-max`** sobre os tokens extraídos pra validar contraste WCAG, hierarquia tipográfica, combinação de fontes e padrões de componente (atende ao pedido literal do usuário de usar essa skill — ela é uma biblioteca de design intelligence consultiva, não tem "modos")
4. **Congelar copy** — salvar `copy-source.md` com o texto literal da página do Wendell (já extraído pra `/tmp/wendell-lp.txt` durante o brainstorming)
5. **Implementar `index.html`** — uma seção por vez, top-down. Tailwind config inline com tokens extraídos. Alpine wireado nos elementos interativos
6. **Criar `serve.sh`** com `python3 -m http.server 8080`
7. **Escrever `README.md`** de handoff (rodar local, subir em prod, manter assets hotlinked vs baixar)
8. **Testing visual** — `/browse` na URL local, screenshots desktop+mobile, click test (FAQ, modais, CTA primário), console errors check
9. **Visual diff conceitual** — comparar com a Claude page de referência, ajustar inconsistências

## 9. Testing e verificação

**Não tem testes unitários — é uma página estática.** Verificação visual:

- `/browse open http://localhost:8080` → screenshot 1440×900 + 375×800
- Click test: FAQ expand/collapse · botão START abre modal start · submit do modal redireciona pra URL Hotmart com query params · botão VIP idem com modal vip
- Console errors: Panda player (CORS?) · 21 imagens carregam (200 OK) · Tailwind CDN aplicou · Alpine inicializou
- Visual checklist contra Claude page: paleta roxo bate · tipografia bate · espaçamentos batem · button style bate

## 10. Error handling / edge cases

| Cenário | Tratamento |
|---|---|
| Servidor de assets do Wendell cai | Imagens com `onerror` somem, layout não quebra. Tailwind CDN é independente, página segue funcional |
| Panda player bloqueia/cai | Wrapper `aspect-video` mantém o espaço reservado, mostra fallback "Vídeo indisponível" |
| Tailwind CDN cai | Página fica feia mas legível (HTML semântico). Aceitável pra um deliverable de cliente; risco baixo |
| User submete form sem preencher | HTML5 `required` nos 3 inputs bloqueia submit |
| User abre direto em `file://` (sem servidor) | Tailwind CDN funciona, Alpine funciona, imagens funcionam (HTTPS absolutas). Iframe Panda pode reclamar de referrer — README avisa pra usar `serve.sh` |

## 11. Handoff pro cliente (README content)

```markdown
# Landing Page — Workshop Produto Digital com IA

## Rodar local
./serve.sh
# Abre em http://localhost:8080

## Subir em produção
- Sobe `index.html` em qualquer host estático (Netlify, Vercel, Hostinger, WordPress page)
- Os assets (imagens, vídeo, ícones) já apontam pro servidor do Wendell — funcionam direto
- O checkout aponta pra `pay.hotmart.com/Y105698965X?off=vqedhper&checkoutMode=10`

## Editar copy
A copy está literal no `index.html`, dentro de cada `<section>`. Sem framework, sem build — abre, edita, salva, atualiza.

## Substituir imagens
Trocar o `src` das tags `<img>` (todas absolutas pra `workshop.wendellcarvalho.com.br/...`).
```

## 12. Fora de escopo (intencional)

- **Build/minificação** — Tailwind CDN serve o JS bruto; aceitável pra LP de venda (Wendell pode optar por build estático depois)
- **Analytics** — não replico o GTM da página original (sem necessidade pra protótipo; cliente pluga depois)
- **A/B testing** — fora de escopo
- **i18n** — fora de escopo (página é PT-BR only)
- **Cookie banner / LGPD** — fora de escopo (cliente decide se precisa antes de prod)
- **Cache de assets local** — se Wendell quiser tornar autocontido, futura iteração baixa tudo pra `assets/`

## 13. Próximo passo

Invocar `superpowers:writing-plans` pra gerar plano de implementação detalhado com tasks executáveis (cada task = checkbox claro).
