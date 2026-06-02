# Plano — Broker de OAuth Meta + caminho de escrita do Inc 1

**Data:** 2026-06-01
**Design fonte:** `~/Downloads/handoff-meta-oauth-broker.md` (aprovado — "broker primeiro")
**Status:** REVISADO via `/plan-eng-review` + outside voice (codex). Pronto pra implementar.
**Repos:** broker = `~/Documents/Magnus/magnus-os-licenca` (Edge Functions) · painel = `magnus-imersao/painel-aula-4/magnus-painel` · skill = plugin `magnus-os`.

## Decisões travadas (sessão 2026-06-01)

| # | Decisão | Escolha |
|---|---|---|
| Substrato | Onde mora o broker | **Edge Functions no Supabase `magnus-os-licenca`** (ref `vbmvzmibupzpjwyrfmjs`), ao lado de `license-validate`. HTTPS+cert de graça, zero DNS/nginx, colado na tabela `licencas`. Descartado `api.magnusos.com.br` (domínio não existe). |
| Redirect URI | URL fixa registrada na Meta | **constante única** `https://vbmvzmibupzpjwyrfmjs.supabase.co/functions/v1/meta-callback` (a MESMA string no dialog e na troca de code — qualquer mismatch quebra OAuth). |
| OAuth engine | Hand-rolled vs Supabase Auth | **Hand-rolled** (Supabase Auth Facebook provider autentica usuário no app, não casa com painel local que faz poll por licença). |
| Endpoints | authorize separado? | **Dobrado no `start`** — start devolve a authUrl completa do dialog Meta. 4 core: `start`/`callback`/`status`/`connection` + `disconnect`. |
| `state` | anti-CSRF | **inguessável**: `state = HMAC(session_id, session_secret)` ou random; banco guarda só o hash. NUNCA `state=session_id` cru. |
| Cifra do token | repouso | **app-layer AES-GCM (WebCrypto)** nas Edge Functions; chave só em `supabase secrets` (`TOKEN_ENCRYPTION_KEY`). Nonce único por cifra, AAD=`license_id`, versão de chave, plano de rotação. |
| Token no cliente | onde mora | **workspace `.env` (`MAGNUS_META_TOKEN`)**, gitignored, mesmo trust da Gemini key. Permissão de arquivo restrita + redação em UI/log. |
| Token no broker | retenção | **descarta após handoff** (one-time). Guarda só metadata (license_id, ad_accounts, expiração). Local é canônico. |
| Kill-switch | cancelamento/refund | **a skill re-checa a licença a CADA sync** (chama `license-validate`) e para se inativa. Não depende do broker reter token. |
| Escopos | Meta permissions | default **só `ads_read`**. Adicionar `business_management` SÓ se a enumeração de contas realmente exigir (menor blast radius — `business_management` não é read-only). |
| Margem | fonte de `breakeven_roas` | **campo no `link.json`** (perguntado no passo "escolher conta"), nunca parseado do BRIEFING.md livre. `breakeven_roas = 1/margem`. |
| Refresh | U5 | long-lived user token (~60d) **NÃO renova sozinho** — caminho real é **reconnect**. Pra desassistido, oferecer **System User token** (não expira). Scheduler de aviso de expiração = **`pg_cron`** (Edge Function não é cron). |

## Bloqueio manual (Yuri) — paralelo, não bloqueia escrever código

1. Criar app Meta tipo **Business** + produto **Marketing API**. Pegar `App ID` + `App Secret`.
2. **Facebook Login → Settings → Valid OAuth Redirect URIs:** colar a constante exata acima. App Domains alinhados.
3. Adicionar a própria conta como **admin/tester** (dev mode funciona sem App Review).
4. (Diferido) Business Verification + privacy policy + data deletion URL + App Review de `ads_read` — só pra **mentorados externos**. Dev mode com a conta dele basta pro teste com a Vigília.
5. Entregar pro Claude: `META_APP_ID`, `META_APP_SECRET` → vão pra `supabase secrets`, NUNCA no painel.

**Checklist de setup (não deixar pro aceite):** redirect_uri exato, App Domains, escopo, tester adicionado — verificar ANTES, não descobrir no "login não seguro".

## Hardening obrigatório (todas as Edge Functions)
- `verify_jwt=false` só onde o browser/Meta chama (callback). Endpoints públicos → rate limit + CORS restrito + method allowlist + limite de tamanho de body.
- **Autorização explícita na função** (service-role bypassa RLS — RLS NÃO protege esses paths). Toda leitura de `meta_connections` confere `license_key`+`session_secret`.
- `status` e `connection` exigem `session_secret`. `connection` é **one-time** (expira a sessão ao entregar).
- `disconnect` exige `session_secret` (não só license_key).
- Redação de log: nunca logar `code`, `state`, token ou secret.
- `appsecret_proof`: **não dá** pra usar nas chamadas locais (exigiria o App Secret no cliente). Risco aceito e documentado — o token é read-only, escopo mínimo, na conta do próprio cliente.

## Unidades testáveis

### U1 — Schema + autorização no Supabase de licença
- `meta_connect_session` (id, license_key, **session_secret_hash**, status, error, created_at, expires_at ~10min).
- `meta_connections` (license_id UNIQUE, encrypted_token, **nonce**, key_version, token_expires_at, scopes[], ad_accounts jsonb, meta_user_id, connected_at, last_refreshed_at).
- **Uma conexão por license_id** (last-connect-wins documentado — multi-máquina sobrescreve).
- Aceite: migration aplica via Management API (curl); autorização por função provada (cross-tenant bloqueado).

### U2 — Edge Functions do broker (handler puro + `realDB` injetado, padrão `license-validate`)
`meta-connect-start`, `meta-callback`, `meta-connect-status`, `meta-connection`, `meta-disconnect`. Reusa `_shared` (não duplica lookup de licença). Graph API com **versão pinada** + backoff + tratamento de token inválido/permissão/async insights.
- Aceite: testes Deno dos handlers (mock realDB+fetch); `start` abre o dialog real sem erro; conectar com a conta do Yuri em dev mode grava `meta_connections` cifrada; round-trip decrypt do AES-GCM passa.

### U3 — Painel: fluxo "Conectar Meta" + escolher conta/margem
- Gera `session_secret` → `POST start` → abre navegador → poll `status` → `done` → `GET connection` → grava `MAGNUS_META_TOKEN` no workspace `.env`.
- Tela "escolher contas" grava `link.json` (account_id, meta_campaign_ids, **margin**, match_confidence). `act_` IDs normalizados.
- Estados: `status=error` → "conexão falhou, tentar de novo"; margem vazia → bloqueia/avisa. `metaConfigured`/`metaLinked` derivam de token presente + `link.json`.
- Aceite: clica→autoriza→token local→aba "conectado".

### U4 — Skill `sincronizar-meta` (NOVA, plugin) — fecha o caminho de escrita do Inc 1
- Re-checa licença (`license-validate`) → se inativa, para. Lê `MAGNUS_META_TOKEN`+`link.json`+margem.
- Graph API (versão pinada, `ads_read`) → **coerce numérico** (string→number, lição Tiny) → calcula métricas → grava `operacao/<slug>/meta/insights.json` no contrato `MetaInsights` (não desviar das chaves).
- **Tolerante a campo ausente:** conta sem pixel/CAPI → `revenue`/`roas` nulos/0 + flag, nunca crash nem número mentiroso. Rate-limit/erro → NÃO sobrescreve `insights.json` bom.
- READ-ONLY (só GET). Aceite: rodar com token real da Vigília → `insights.json` válido → dashboard renderiza dado vivo.

### U5 — Manutenção
- **Reconnect** é o caminho de renovação (não auto-refresh). Aviso no painel ~7d antes de expirar via **`pg_cron`** checando `token_expires_at`. Opção avançada: colar **System User token** (não expira) por uma rota "colar token manual".
- Aceite: aviso aparece; disconnect (com session_secret) revoga local + limpa metadata no broker.

## Sequência de build
U1 → U2 → (U3 ‖ U4 após U2) → e2e Vigília → `/review`+`/codex` → merge → release. U5 incremento seguinte.

## Test plan (gaps do diagrama de cobertura)
**CRÍTICOS de segurança (IRON RULE, sem negociação):** (1) `callback` com `state` inválido → rejeita (CSRF); (2) `connection` com `session_secret` errado → 401; (3) `connection` é one-time (segunda chamada → expirada); (4) cross-tenant bloqueado. Mais: round-trip AES-GCM, coerce numérico da skill, skill tolerante a campo/token ausente sem corromper `insights.json`.

## NOT in scope (diferido com razão)
- **App Review / Live mode** — dev mode com a conta do Yuri basta pro teste; review é pré-requisito só de mentorado externo (leva semanas).
- **Custom domain na frente das Edge Functions** — branding do bounce OAuth; evolução, não bloqueia.
- **Revoke server-side do token Meta** — broker descarta o token; kill-switch é o re-check de licença local.
- **Multi-conexão por licença** — uma conexão por license_id (last-connect-wins).
- **PKCE** — broker tem o secret server-side; PKCE é hardening opcional futuro.

## What already exists (reusar, não rebuildar)
- **Leitura do Inc 1:** `lib/meta.ts`, dashboard, contrato `MetaInsights`/`MetaLink` — intactos, o broker não toca.
- **`license-validate` + tabela `licencas` + `_shared/realDB`** — o broker herda padrão e reusa a validação (não duplica).
- **BYO-key Gemini (`lib/gemini-key.ts` + workspace `.env`)** — mesmo trust model pro `MAGNUS_META_TOKEN`.

## Caminho até o artefato baixável
- Painel (U3) + skill (U4) → `/review`+`/codex` → merge master → `release.sh` (painel) + pacote do plugin → `-latest.tgz` + bump `manifest`. Branch ≠ produto (ver memory `feedback-magnus-release-to-artifact`).
- Broker (U1/U2/U5) → deploy separado `supabase functions deploy --use-api` (infra central, não vai no `.tgz`).

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | issues_found | 23 findings, todos absorvidos (19 hardening + 4 decisões) |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | clean | 6 issues resolvidos, 0 unresolved, 4 testes críticos de segurança |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience | 0 | — | — |

- **CODEX:** pegou state-fraco, contradição session_secret_hash, RLS-irrelevante-sob-service-role, refresh-não-é-automático, business_management-não-é-readonly, AES-GCM-subespecificado, falta de scheduler real, e double-storage do token. Todos endereçados.
- **CROSS-MODEL:** sem tensão real — os achados do codex foram aditivos ao review, não contraditórios. O único fork (retenção de token no broker) foi decidido pelo Yuri (descartar).
- **UNRESOLVED:** 0.
- **VERDICT:** ENG CLEARED — pronto pra implementar. Bloqueio externo: app Meta (Yuri) antes do teste e2e.
