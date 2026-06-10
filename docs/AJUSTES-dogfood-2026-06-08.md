# Magnus OS — Ajustes encontrados em dogfood (2026-06-08)

> Brief de correção levantado durante teste real (instalação + uso do Radar) com a key
> `MAGNUS-DOGFOOD-YURI`. Cada item tem **sintoma → root cause (arquivo:linha) → fix sugerido →
> como verificar**. Nada foi corrigido — este doc é a orientação pra implementar.
>
> **Repos envolvidos:** `magnus-os-plugin` (install.sh + skills) · repo `radar` (coletor/API) ·
> o repo do **painel** (no Mac local a fonte está em `magnus-imersao/painel-aula-4/magnus-painel`
> — confirmar o repo canônico do painel antes de editar).

---

## 🔴 P0 — BLOQUEADOR: Radar dá "licença inválida" em instalação nova (licença NÃO é wired)

**Sintoma:** logo após instalar, `/magnus-os:radar` responde *"Pra usar o Radar, verifique sua
licença do Magnus OS nas Configurações do painel. O campo `MAGNUS_LICENSE_KEY` precisa conter uma
chave válida."* — mesmo com a licença válida (a instalação validou `granted` e gravou o
`license.json`). O Radar fica inutilizável sem um passo manual não-óbvio.

**Root cause — a licença é gravada num lugar e lida de outro:**
- O instalador grava a key **apenas** em `~/.claude/magnus-os/license.json`
  (`install.sh`, ~linha 45: `printf '{"key":"%s"}' ... > "$CFG/license.json"`), e no `.env` do
  workspace escreve **só** `MAGNUS_SKILLS_DIR` (~linha 56) — **nunca** `MAGNUS_LICENSE_KEY`.
- Mas os consumidores do Radar leem a licença **só do env var `MAGNUS_LICENSE_KEY`**, sem fallback:
  - `plugins/magnus-os/skills/radar/SKILL.md` **Passo 2**: "Leia as variáveis de ambiente do
    workspace: `MAGNUS_LICENSE_KEY` … Obrigatória. Se ausente/vazia, responda [erro] e pare."
  - painel `lib/radar-config.ts` → `resolveLicenseKey()` / `hasLicenseKey()` leem **só**
    `env.MAGNUS_LICENSE_KEY` (sem ler o `license.json`). Usado por `app/api/radar-config/route.ts`
    e `app/api/radar-usage/route.ts`.
- Inconsistência reveladora: `lib/license.ts` → `readLicenseKey()` **já faz o certo** (env →
  fallback `~/.claude/magnus-os/license.json`). Só o caminho do Radar não tem esse fallback.

**Fix sugerido (escolher 1; o A resolve tudo de uma vez):**
- **A (recomendado) — o instalador escreve `MAGNUS_LICENSE_KEY` no `.env` do workspace.**
  Em `install.sh`, ao montar o `.env`, adicionar (idempotente, como já faz com `MAGNUS_SKILLS_DIR`):
  ```sh
  grep -q '^MAGNUS_LICENSE_KEY=' "$WS/.env" 2>/dev/null || echo "MAGNUS_LICENSE_KEY=$KEY" >> "$WS/.env"
  ```
  Assim a skill (que lê o env do workspace) e o painel (se carrega o `.env` do workspace) passam a
  enxergar a key. ⚠️ Garantir que `.env` esteja no `.gitignore` do template do workspace (não vazar
  a key). **E re-publicar o `install.sh` no storage** (ver P1 — hoje o `install.sh` servido pelo
  Supabase está defasado da fonte).
- **B (defesa em profundidade) — dar fallback de arquivo ao Radar do painel.** Como
  `lib/radar-config.ts` é "pura (sem node:fs, importável por client component)", manter
  `resolveLicenseKey(env)` pura e, **no lado servidor** (rotas `app/api/radar*`), resolver a key
  como `resolveLicenseKey(process.env) ?? readLicenseKey()` (reusando o fallback de `lib/license.ts`).
- **C (skill) — Passo 2 do `radar/SKILL.md` com fallback:** se `MAGNUS_LICENSE_KEY` vazio, ler
  `~/.claude/magnus-os/license.json` antes de abortar. (Menos elegante; preferir A.)

**Como verificar:** instalação limpa (sem setar env manual) → `/magnus-os:radar` deve buscar sem
pedir licença. Conferir `grep MAGNUS_LICENSE_KEY ~/magnus-os/.env`.

---

## 🟠 P1 — Instalador `curl | bash` aborta em contexto não-interativo (`/dev/tty`)

**Sintoma:** o one-liner documentado (`curl -fsSL …/install.sh | bash -s -- --key …`) falha com
`bash: line 50: /dev/tty: Device not configured` e sai com erro **depois** de já ter instalado as
skills e gravado a license — deixando um estado meio-instalado e confuso. Acontece em qualquer
contexto sem terminal controlador (agente/automação/CI), que é justamente o modo do one-liner.

**Root cause:** `magnus-os-plugin/install.sh`, linhas ~16 e ~50:
```sh
if [ -z "$KEY" ] && [ -r /dev/tty ]; then read -rp "..." KEY </dev/tty; fi          # ~16
if [ -z "$WS" ]  && [ -r /dev/tty ]; then read -rp "..." WS  </dev/tty; fi          # ~50
```
`[ -r /dev/tty ]` retorna verdadeiro mesmo quando **não há terminal controlador** (o nó `/dev/tty`
existe mas não pode ser aberto) → o `read </dev/tty` quebra com "Device not configured" → `set -e`
derruba o script.

**Fix sugerido:** trocar o guard por um teste de TTY de verdade e tolerar a falha de leitura:
```sh
if [ -z "$KEY" ] && [ -t 0 ] && [ -r /dev/tty ]; then
  read -rp "Cole sua license-key do Magnus OS: " KEY </dev/tty || KEY=""
fi
# idem para WS, caindo no DEFAULT_WS:
if [ -z "$WS" ] && [ -t 0 ] && [ -r /dev/tty ]; then
  read -rp "Onde criar o workspace? [$DEFAULT_WS] " WS </dev/tty || WS=""
fi
WS="${WS:-$DEFAULT_WS}"
```
Mantém o prompt interativo no terminal real e, sem TTY, cai no default (key via `--key`/env, WS no
`~/magnus-os`) em vez de abortar. **Lembrar de re-publicar o `install.sh` corrigido no Supabase
storage** (`magnus-os-public/install.sh`) — hoje a cópia servida está byte-idêntica à versão antiga.

**Como verificar:** `MAGNUS_LICENSE_KEY=… bash install.sh </dev/null` (sem TTY) deve completar e
criar `~/magnus-os` sem erro.

---

## 🟠 P1 — Template do `contexto/` renderiza "corrompido" antes de preenchido

**Sintoma:** num workspace recém-criado (template não preenchido), abrir `contexto/VOZ.md` (e os
demais) no painel mostra a tela quebrada / "parece corrompido / não abre".

**Root cause:** os arquivos-template usam **placeholders em colchetes angulares** —
`# Voz — <NOME_EMPRESA>`, `<3-5 adjetivos...>`, `<palavra/expressão>`, `<texto que NÃO representa...>`.
Em markdown, `<...>` é interpretado como **tag HTML**: tags desconhecidas/não-fechadas
(`<NOME_EMPRESA>`, `<palavra/expressão>`) são engolidas pelo renderer e comem o conteúdo ao redor →
o arquivo parece vazio/corrompido. O arquivo em si é UTF-8 válido — é só o render que quebra.
(Arquivos do `template/` do produto, ex.: `template/contexto/VOZ.md`, `EMPRESA.md`, `TIME.md`, etc.)

**Fix sugerido (escolher 1):**
- Trocar os placeholders de `<...>` para uma sintaxe que não seja HTML: `[NOME_EMPRESA]`,
  `__placeholder__`, ou `_[descrição]_` (itálico). Resolve o render em qualquer viewer markdown.
- Ou, se quiser manter literais com `<>`, escapar (`&lt;…&gt;`) ou colocar em `código inline`
  (`` `<NOME_EMPRESA>` ``) — mas trocar pra `[...]` é mais limpo e legível.
- Bônus: o renderer do painel poderia sanitizar/escapar HTML inline ao exibir markdown de
  `contexto/` (defesa em profundidade — evita que qualquer `<...>` no conteúdo do cliente quebre a tela).

**Como verificar:** workspace novo (template puro) → abrir VOZ/EMPRESA/TIME no painel → renderiza
legível, sem sumir conteúdo.

---

## 🟡 P2 — Melhorias do board do Radar (pedido original do dogfood)

Com base no board real (anunciante `priscila_zillo`, 65 anúncios): hoje o board vira uma bagunça de
variações e a copy não aparece. Quatro ajustes:

**2.1 — Triagem "5 melhores por campanha" (hoje é 3).**
`radar/src/emit.ts` → `buildCampaigns()` faz `top_ads: byScore.slice(0, 3)`. Subir pra `slice(0, 5)`.
(E `radar-types.ts` / `RadarCampaign.top_ad_ids` já suportam N.)

**2.2 — O board está caindo no fallback flat (sem agrupar por campanha).**
No screenshot o header mostra só "sinal de persistência" (sem "N campanhas ·") → `data.campaigns`
veio vazio e `RadarSection.tsx` renderizou os 65 ads flat (branch `else`). `buildRadarJson()` sempre
popula `campaigns`, então investigar: (a) o `radar.json` da campanha foi gerado por um coletor antigo
(pré-campanhas) e precisa de re-scan, ou (b) o build do painel publicado está defasado da fonte.
Confirmar e, se for o caso, garantir que o board sempre agrupe.

**2.3 — Dedup de criativos quase-idênticos (a "bagunça de variações").**
Aparecem 3 cards visualmente iguais ("uma aula gratuita…", 7 var · DCO cada) = `ad_archive_id`
diferentes, criativo idêntico. Hoje o único dedup é por URL de destino (`campaignKey`), não por
criativo. Sugestão: em `emit.ts`, colapsar por assinatura visual (mesma `thumb_url` + `hook`
normalizado) num card representativo, com badge "×N anúncios · M variações". Decisão de produto do
Yuri (nível de agressividade) — ele pode confirmar, mas o default proposto é colapsar por
`thumb + hook`.

**2.4 — Trocar o texto morto "copy não exposta pela Meta" por links úteis.**
`radar/src/emit.ts` ~linha 107 seta `hook: "Criativo dinâmico (DCO) — copy não exposta pela Meta"`
quando o DCO não expõe copy. O Yuri quer, no lugar (ou além) disso, **dois links no card**:
(1) **ver o anúncio na Meta** — Ad Library permalink montado do `ad_archive_id`:
`https://www.facebook.com/ads/library/?id=<ad_archive_id>` ; (2) **a LP** (já existe `ad.link_url`
como botão "LP" no `RadarCard.tsx`). Implementar: adicionar o link "Ver anúncio" no `RadarCard.tsx`
(não precisa de campo novo — dá pra montar a URL do `ad_archive_id` que já está no tipo `RadarAd`),
e quando o `hook` for o placeholder de DCO, suprimir a frase morta e mostrar só os links.

**Arquivos do P2:** coletor `radar/src/emit.ts` (+ `radar/tests/emit.test.ts`) · painel
`RadarCard.tsx`, `RadarSection.tsx`, `lib/radar-types.ts`.

---

## Ordem sugerida
1. **P0** (license wiring) — sem isso o Radar não roda em instalação nova.
2. **P1** (`/dev/tty`) — destrava instalação automatizada/headless + re-publicar `install.sh`.
3. **P2** (board UX) — triagem 5, dedup, links Meta/LP, e confirmar o agrupamento por campanha.

> Validado por dogfood com `MAGNUS-DOGFOOD-YURI` em 2026-06-08. Instalação atual no Mac:
> painel `localhost:3940`, workspace `~/magnus-os` com a empresa "A Minha Casa" carregada.
