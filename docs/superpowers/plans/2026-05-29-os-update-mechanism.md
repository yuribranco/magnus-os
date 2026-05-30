# Magnus OS — Mecanismo de Atualização (plano)

> Spec: `../specs/2026-05-29-os-update-mechanism-design.md` · Executa inline (CEO técnico).
> Regra inviolável em TODA task: o update **nunca toca `$WS`** (dados da empresa).

**Goal:** cliente atualiza o Magnus OS em linguagem natural (1 frase no chat do painel), com
indicador visual de "update disponível", sem perder nenhum dado da empresa.

**Tech:** bash (install/update), Supabase Storage (artefatos + manifest público), Next 16 painel
(zustand + Agent SDK), skill do plugin.

---

## Task 1 — Fundação de versão (release.sh estampa versão + manifest público)
**Files:** `magnus-os-plugin/release.sh`, `magnus-painel/lib/version.ts` (gerado), bucket público.
- [ ] `release.sh` lê `version` do `plugin.json` → escreve `lib/version.ts` (`export const PAINEL_VERSION="x.y.z"`) ANTES do build do painel.
- [ ] `release.sh` gera `manifest.json` `{version, published_at, changelog}` e faz upload pro bucket PÚBLICO (`magnus-os-public`/onde mora o install.sh).
- [ ] `changelog` vem de arg `--changelog "..."` ou `CHANGELOG` env.

## Task 2 — Conserto do empacotamento não-standalone do painel
**Files:** `release.sh`, `install.sh`, `magnus-painel/package.json`.
- [ ] `release.sh`: build do painel (`npm ci && npm run build`), empacota `.next` + `node_modules` + `package.json` + `public` + `bin` em `magnus-os-painel-latest.tgz` (sem `.git`, sem source). Roda via `next start`.
- [ ] `install.sh`: trocar `node "$PAINEL_DIR/server.js"` por `next start` (`node_modules/.bin/next start -p $PORT`), com `MAGNUS_PAINEL_CWD`/`MAGNUS_SKILLS_DIR`/`PORT`/`HOSTNAME`.
- [ ] `install.sh`: persistir `config.json` `{key, ws, skillsDir, painelDir, port}` em `~/.claude/magnus-os/`.

## Task 3 — `bin/update.sh` (executor data-safe)
**Files:** `magnus-os-plugin/plugins/magnus-os/bin/update.sh`, `test/update.test.sh`.
- [ ] Lê `~/.claude/magnus-os/config.json` (key, ws, painelDir, port). Sem config → erro claro.
- [ ] Re-valida licença (best-effort, fail-soft). Baixa `plugin` + `painel` gated (`plugin-download`).
- [ ] Substitui `dist` + `painel` (code). **NUNCA** `cp` do template pro `$WS`. **NUNCA** toca `$WS`.
- [ ] `claude plugin marketplace add $DIST` + reinstall (refresh skills).
- [ ] Mata porta do painel, relança `next start` no **mesmo `$WS`** (de config). Espera subir.
- [ ] Reporta versão antiga→nova + changelog (lê manifest).
- [ ] Se run ativo (`$WS/.magnus-painel/runs/*` recente streaming) → avisa mas segue.
- [ ] `test/update.test.sh`: assert que após "update" o conteúdo de um `$WS` fake permanece byte-idêntico; config lido; fail-soft sem rede.

## Task 4 — Skill `atualizar` + CLAUDE.md do template
**Files:** `plugins/magnus-os/skills/atualizar/SKILL.md`, `template/CLAUDE.md`.
- [ ] `atualizar/SKILL.md`: instrui o agente a rodar `bin/update.sh`, preservar a empresa, reportar versão.
- [ ] `template/CLAUDE.md`: seção `## Atualizar o Magnus OS` com o comando exato (pro chat livre, cwd=$WS, saber o que "atualizar" significa).

## Task 5 — `/api/update` + version.ts (painel detecta)
**Files:** `magnus-painel/lib/version.ts` (default dev), `app/api/update/route.ts`, `lib/version.test.ts`.
- [ ] `lib/version.ts`: `PAINEL_VERSION` (default `0.0.0-dev`, sobrescrito no release) + `compareSemver`.
- [ ] `/api/update`: fetch do `manifest.json` público (timeout curto, fail-soft), compara, retorna `{current, latest, updateAvailable, changelog}`. Nunca quebra o painel se offline.
- [ ] teste vitest do compareSemver.

## Task 6 — Store: update state + chat prefill
**Files:** `magnus-painel/lib/store.ts`.
- [ ] `update: {available, latest, changelog} | null` + `setUpdate`.
- [ ] `chatPrefill: string | null` + `chatAutoSend: boolean` + `prefillChat(text, autoSend)` + `clearChatPrefill()`.
- [ ] `prefillChat` também faz `chatDrawerOpen=true`.

## Task 7 — ChatDrawer consome prefill
**Files:** `magnus-painel/components/ChatDrawer.tsx`.
- [ ] `useEffect` em `chatPrefill`: seta input; se `chatAutoSend`, dispara `send()` (após render); `clearChatPrefill()`.
- [ ] Garantir que não dispara em loop e respeita `pending`.

## Task 8 — UpdateBanner (ui-ux-pro-max) no sidebar
**Files:** `magnus-painel/components/UpdateBanner.tsx`, `components/Sidebar.tsx`, `styles/globals.css`.
- [ ] Componente: badge no rodapé do sidebar; quando `updateAvailable`, vira clicável ("atualização disponível"). Estado normal = versão atual (substitui o `v0.1` hardcoded).
- [ ] Clique → `prefillChat("Atualize o Magnus OS para a última versão, sem perder nada da minha empresa", true)`.
- [ ] Tooltip com changelog. Estilo cobre/Geist, sutil (não alarmante).
- [ ] Poll: chamar `/api/update` no mount do layout + setInterval (ex: 6h).

## Task 9 — Build + re-publish + verificação end-to-end
- [ ] `npm run typecheck` + `npm test` no painel; `bash test/*.sh` no plugin.
- [ ] `/codex review` (gate pré-publish).
- [ ] Rodar `release.sh` (build painel não-standalone, sobe os 3 artefatos + manifest).
- [ ] Subir painel dev limpo, validar: badge aparece com manifest v+1; clicar injeta frase + envia; (mock) update preserva `$WS`.
- [ ] Commits por task. Fechar ciclo: Drive + wiki magnus-os + GTD.
