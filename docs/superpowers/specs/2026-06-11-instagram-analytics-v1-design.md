# Instagram Analytics (MagnusOS Online) — Spec de Design v1

> **Origem do conhecimento:** handoff do CRM Autêntica (FastAPI+SQLAlchemy+Postgres+React, 42+ testes, validado ao vivo contra Graph API v25.0). Kickoff + mapeamento: `docs/handoffs/2026-06-11-instagram-analytics-ADAPTACAO.md`. Fonte canônica de comportamento: repo `~/Documents/A Minha Casa/crm-app` (`app/services/instagram/`).
> **Stack destino:** MagnusOS Online — Next.js 16 (App Router, route handlers `runtime=nodejs`) + Supabase (Postgres) + TypeScript estrito, hosted multi-tenant na VPS Portal, secrets via 1Password/`op`.
> **Escopo:** v1 (decisões Yuri 2026-06-11). Próximo após esta spec: `/plan-eng-review` + `/codex` → plano em fases → implementação (Opus).
> **Princípio de design herdado (preservar):** módulos profundos — route handlers finos (traduzem erro→HTTP), toda a lógica nos services (`lib/instagram/*`). O `graph-client` esconde httpx/paginação/erros da Meta atrás de 4 erros tipados. O `credential-store` esconde cripto + máquina de estados atrás de `borrowToken()` que nunca deixa o token plaintext escapar do escopo.

---

## 1. Escopo v1 (TRAVADO)

| # | Decisão | v1 | v2+ |
|---|---|---|---|
| 1 | Entidade-chave | **`tenant_id`** — 1 conta de Instagram, a do próprio especialista/tenant | multi-marca (`brand_id` FK tenant) |
| 2 | Conexão | **paste token** num form (admin do tenant) | OAuth com app Meta verificado |
| 3 | Superfície | **só interna** (tenant logado vê o próprio IG) | dashboard público por link |
| 4 | Crypto | **AES-256-GCM em TS** (`node:crypto`), porte do `ig_crypto`, master key no 1Password | rotação multi-key (já suportada pelo keyring) |
| 5 | Scheduler | **cron systemd na VPS** → endpoints `/api/jobs/instagram/*` (service key) | — |
| 6 | Metas | por **`tenant_id`** (v1 não tem entidade contrato/deal) | por campanha/contrato |
| 7 | Storage thumbs | **Supabase Storage** (bucket privado) | — |

**Invariante de segurança mantida desde já** (mesmo sem rota pública no v1): a camada `analytics` produz um `InternalDashboard` e um agregador `buildDashboard()` **secret-free por construção** (nunca seleciona colunas de token; tipos não têm campo secreto). Ligar o público depois = adicionar rota + auth, sem tocar o core. Churn (unfollows brutos) fica num campo separado `adminOnly`.

**Não-construído (gate LGPD, herdado):** ingestão de comentários/menções (texto+usernames) exige política de retenção + base legal. Fora do v1.

---

## 2. Arquitetura

```
 Tenant (Supabase Auth) ─► app/api/instagram/*        (interno: connect/status/overview/posts/goals)
 cron systemd (svc key) ─► app/api/jobs/instagram/*   (jobs: snapshot/insights/media/stories/backfill/refresh)
                                   │
                          lib/instagram/
                            graph-client.ts   ← transporte Graph (4 erros tipados, retries, parsing)
                            credential-store.ts ← cripto + máquina de estados + borrowToken()
                            collectors.ts      ← ingestão idempotente (upsert ON CONFLICT) das 6 famílias
                            backfill.ts        ← caminhada resumível (cursor JSONB)
                            analytics.ts       ← leitura/agregação (secret-free)
                            goals.ts           ← metas por tenant
                          lib/crypto/field-crypto.ts ← AES-256-GCM + keyring (genérico)
                          lib/instagram/storage.ts   ← thumbs de story → Supabase Storage
                                   │
                          Supabase Postgres (8 tabelas, RLS por tenant)
```

- **Service client** (service role, ignora RLS) p/ collectors/jobs: já existe padrão (`lib/hosted/real-*`). Criar `lib/instagram/service-db.ts` (NÃO usar `lib/hosted/supabase.ts` que tem `server-only` e mataria um runner CLI, se houver — mesma lição da spec do gestor de tráfego).
- **Tenant resolvido** nas rotas internas via `requireTenant()` (existente). `tenant.id` = chave de tudo.
- **Erro→HTTP** só nos route handlers; services lançam erros de domínio tipados.

---

## 3. Modelo de dados (migration Supabase `00XX_instagram.sql`)

Convenções MagnusOS: PK `uuid default gen_random_uuid()`; timestamps `timestamptz`; FK `on delete cascade`; **status como `text` simples, não enum PG** (evita `ALTER TYPE` não-transacional); **RLS** em toda tabela (tenant lê só o seu; service role escreve). `tenant_id uuid not null references tenants(id)`.

> **[v2] hook multi-marca:** adicionar `owner_scope text not null default 'tenant'` em cada tabela seria o caminho; v1 mantém só `tenant_id` (1 conta) — quando vier marca, migra pra `brand_id`. Não construir abstração especulativa agora (YAGNI).

### 3.1 `instagram_credentials` (1 por tenant)
```sql
create table instagram_credentials (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references tenants(id) on delete cascade,
  ig_user_id             varchar(32) not null,
  ig_username            varchar(100),
  app_id                 varchar(32),
  app_secret_encrypted   bytea,                 -- cifrado (field-crypto), opcional
  access_token_encrypted bytea not null,        -- cifrado (field-crypto)
  access_token_last4     varchar(8),            -- plaintext, só UI
  token_issued_at        timestamptz not null default now(),
  token_expires_at       timestamptz not null,
  last_refresh_at        timestamptz,
  last_refresh_error     text,
  last_collected_at      timestamptz,
  status                 text not null default 'active',     -- active|expiring|dead|needs_reconnect|revoked
  backfill_status        text not null default 'pending',    -- pending|running|done|failed
  backfill_cursor        jsonb,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);
create unique index uq_ig_cred_tenant on instagram_credentials (tenant_id);   -- 1 conta/tenant no v1
create index idx_ig_cred_expiry on instagram_credentials (token_expires_at) where status = 'active';
create index idx_ig_cred_status on instagram_credentials (status);
```

### 3.2–3.7 — restante das tabelas
Idênticas ao DDL do handoff (§3), **trocando `person_id`→`tenant_id` e `deal_id`→`tenant_id`** e removendo nada mais:
- `instagram_profile_snapshots` — Type-B, uniq `(tenant_id, captured_date)`. `profile_picture_url TEXT` (CDN > 512).
- `instagram_account_insights` — Type-A, uniq `(tenant_id, metric, breakdown, breakdown_value, period, end_time)`. ⚠️ `breakdown`/`breakdown_value` **NOT NULL default ''** (sentinela — NULL fura o `ON CONFLICT`).
- `instagram_media` + `instagram_media_insights` — uniq `(tenant_id, ig_media_id)` e `(media_id, captured_date)`. `reels_skip_rate numeric` (float!).
- `instagram_demographics` — uniq `(tenant_id, captured_date, metric, dimension, label)`.
- `instagram_stories` — uniq `(tenant_id, ig_story_id)`; `archived_media_key` (thumb permanente no Storage); urls CDN expiram ~24h.
- `instagram_post_goals` — **v1 keyed por `tenant_id`** (não deal). `goal_type text default 'posts'`, checks `target>=1`, `end_date>=start_date`.

> **URLs sempre `TEXT`**, nunca `varchar(512)` — URLs assinadas do CDN do IG estouram (bug real na origem).

### 3.8 RLS
- Tabelas de dados + goals: `policy select using (tenant_id = auth_tenant())` (helper que resolve o tenant do JWT Supabase). Service role bypassa (collectors/jobs).
- `instagram_credentials`: **sem policy de select pro tenant nas colunas secretas** — o tenant só lê via rota (`/status`) que projeta colunas não-secretas (`status, backfill_status, ig_username, token_expires_at, last_collected_at, access_token_last4`). O `access_token_encrypted`/`app_secret_encrypted` nunca saem por SELECT de cliente. (Modelar: policy que permite select mas a ROTA projeta; ou negar select e ler tudo via service role na rota. Preferir **negar select do cliente + rota lê via service role e projeta** — fail-closed.)

---

## 4. Crypto de campo (`lib/crypto/field-crypto.ts`)

Porte direto do `ig_crypto` (genérico, zero conhecimento de domínio). Interface: `encrypt(plaintext: string): Buffer` / `decrypt(blob: Buffer): string`.

**Blob autodescritivo:** `[ version: 1 byte ][ nonce: 12 bytes ][ ciphertext + GCM tag: 16 bytes ]`.

**Derivação:** HKDF-SHA256, len=32, `salt = ENCRYPTION_KEY_DERIVATION_SALT`, `info = "magnus-os:field-encryption"` (FIXAR pra sempre), material = `ENCRYPTION_PRIMARY_KEY`. Em TS: `crypto.hkdfSync('sha256', material, salt, info, 32)`.

**AES-GCM:** `crypto.createCipheriv('aes-256-gcm', key, nonce)` → `update`+`final`+`getAuthTag()`; concat `version || nonce || ct || tag`. Decrypt: lê version → escolhe key do keyring → `createDecipheriv` + `setAuthTag`.

**Keyring versionado:** versão dentro do blob → decrypt acha a key certa, rotação transparente. `ENCRYPTION_OLD_KEYS` (JSON `{"1":"material"}`), `ENCRYPTION_KEY_VERSION` (0–255). Keyring montado a CADA chamada (rotação/testes sem restart).

**Erros/boot:** `decrypt` SEMPRE lança `FieldDecryptError` próprio (nunca erro cru de crypto). `selfCheck()` (round-trip de um probe) chamado no boot do servidor (um módulo `lib/instagram/boot.ts` importado num route warmup ou no primeiro job) — config quebrada falha cedo, não na 1ª coleta. **Master key backup-crítica** (perder = recapturar todos os tokens).

**Envs** (1Password → `.env.production`): `ENCRYPTION_PRIMARY_KEY`, `ENCRYPTION_KEY_DERIVATION_SALT`, `ENCRYPTION_KEY_VERSION=1`, `ENCRYPTION_OLD_KEYS=` (só na rotação).

**Testes:** round-trip, blob curto/corrompido, versão desconhecida, rotação via OLD_KEYS, selfCheck.

---

## 5. Graph API client (`lib/instagram/graph-client.ts`)

Const: `GRAPH_BASE="https://graph.instagram.com"`, `API_VERSION="v25.0"`, timeout 20s (`AbortSignal.timeout`), `MAX_RETRIES=3`. Transporte com `fetch`.

### 5.1 Erros tipados (a superfície que os callers tratam)
4 classes + base, mapeadas do `error.code` do JSON da Graph:

| Erro | Códigos | Retry? | Significado / efeito |
|---|---|---|---|
| `TokenInvalid` | 190,102,463,467,458,460; qualquer `type=OAuthException` desconhecido | NÃO | token morto → credencial vira `dead` |
| `PermissionDenied` | 10,200,803,3 | 1x, com `appsecret_proof` | escopo faltando |
| `RateLimited` | 4,17,32,613,80004; HTTP 429 | sim (respeita `Retry-After`) | throttle |
| `MetricsWindowTooOld` | code 100 **E** msg contém "since" **E** "2 years" | NÃO | fim de dados (não é erro) |
| `TransientGraphError` | 1,2,341,368; HTTP≥500; erro de rede | sim | transitório |
| `GraphError` (base) | resto | NÃO | desconhecido |

### 5.2 Loop de request (`request()`)
GET com `access_token` em query. Backoff: `retry_after` do erro, senão `min(2**attempt, 30)`s. `appsecret_proof` (`HMAC-SHA256(app_secret, token)` hex) só adicionado **depois** de uma tentativa falhar com `PermissionDenied` E houver app_secret — retry 1x com proof (lazy). `versioned=false` p/ `/me` e `/refresh_access_token` (sem prefixo `v25.0/`).

### 5.3 Inventário de chamadas (idêntico ao handoff §5.3 — porte literal)
`getMe`, `smokeTest` (= `getMe` + `/{ig_user_id}/insights?metric=reach&period=day`, usado no connect), `getProfile`, `getAccountInsights`, `getAccountTotals` (`metric_type=total_value`), `getAccountBreakdowns` (`breakdown={dim}&metric_type=total_value`), `getMediaPage` (`/media?fields=<_MEDIA_FIELDS>&limit=25&after=`), `getMediaInsights`, `getDemographics` (`period=lifetime&timeframe=last_30_days&breakdown={dim}&metric_type=total_value`, 1 chamada/dimensão), `getStories`, `getStoryNavigation`, `refreshToken` (`/refresh_access_token?grant_type=ig_refresh_token`).

`_MEDIA_FIELDS = "id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count,insights.metric(reach,views,saved,shares,total_interactions){values}"`. Datas: `new Date(raw.replace("+0000","+00:00"))` ou parse manual ISO.

### 5.4–5.8 ⚠️ PEGADINHAS v25 (o ouro — porte VERBATIM, cada uma foi bug real)
1. **Nome da métrica embutido no `id`** na field-expansion de `/media`: itens de insight OMITEM `name`; extrair de `id` = `{media}/insights/{metric}/{period}`. `_metricName(ins)`: `ins.name ?? id.split("/insights/")[1]?.split("/")[0]`. Valor em `values[0].value` OU `total_value.value` — checar ambos, manter floats (`reels_skip_rate`), descartar bools.
2. **Métricas por-tipo** (pedir errada erra a chamada INTEIRA, code 100):
   - Base (todos): `reach,views,likes,comments,saved,shares,total_interactions`
   - FEED extra: `profile_visits,profile_activity,follows`
   - REELS extra: `ig_reels_avg_watch_time,ig_reels_video_view_total_time,reels_skip_rate` (REELS **não** suporta follows/profile_visits/profile_activity)
   - `impressions`/`plays` **não existem na v25** → usar `views`.
   - `mediaMetricsFor(productType)`: REELS → BASE+REELS_EXTRA; senão BASE+FEED_EXTRA.
3. **Série diária vs total_value:** só `reach` e `follower_count` vêm como série (`period=day`→`values[]`). Resto (views, total_interactions, profile_views, website_clicks, accounts_engaged, likes, comments, shares, saves, profile_links_taps, reposts, replies) só como `total_value` agregado → **fabricar série diária: 1 chamada/dia** (`since`=início do dia SP, `until`=início do dia seguinte), `end_time` carimbado em **meio-dia UTC do dia** (12:00 UTC cai sempre na mesma data SP → conversão estável). Shape breakdown `total_value`: `{total_value:{value,breakdowns:[{dimension_keys,results:[{dimension_values,value}]}]}}`. Grupos de breakdown de conta (1 chamada batched cada; code 100 → fallback por-métrica): `media_product_type`(reach,views,likes,comments,saves,shares,total_interactions), `follow_type`(reach,follows_and_unfollows), `follower_type`(views), `contact_button_type`(profile_links_taps).
4. **Navegação de story:** OBRIGATÓRIO `metric=navigation&breakdown=story_navigation_action_type` (só `total_value` devolve total sem split → colunas NULL, bug real). Valores **lowercase** (`tap_forward`,`tap_back`,`tap_exit`,`swipe_forward`) → upper antes de mapear `nav_*`. Chamada **separada** da base da story (falha de nav nunca derruba a linha-base).
5. **Outras (verificadas ao vivo):** story <5 viewers ERRA insights → capturar story sem métricas (linha fica, NULL); `/stories` não retorna Close Friends nem alguns reshares (UI declara); story IMAGE só tem `media_url` (sem thumbnail); URLs CDN de story expiram ~24h → arquivar; insights de conta têm piso ~2 anos (`MetricsWindowTooOld`); rate ~200 calls/h por conta (backfill completo ≈130 chamadas, cabe em 1h).

---

## 6. Credential store (`lib/instagram/credential-store.ts`)

### Máquina de estados
`connect`→`active`; refresh ok→`active`; Graph rejeita token (190) em refresh/coleta→`dead`; decrypt falha→`needs_reconnect`; admin desconecta→`revoked` (reconectar recria). `expiring` existe como const (badge UI) mas a transição prática é active→refresh→active.

### Regras
- **TTL token: 60 dias** no connect; refresh usa `expires_in` real.
- **Lock por tenant:** escritas (connect/refresh/revoke) sob `select pg_advisory_xact_lock(hashtext($tenant_id))` via RPC `security definer` (igual padrão das specs anteriores) — serializa escritas concorrentes, liberado no fim da tx.
- **`connect`:** valida ANTES de escrever (`smokeTest` = `/me` + insights de reach) — token ruim nunca toca o banco. Idempotente por tenant: reconectar sobrescreve token, zera erro, `status=active`, `backfill_status=pending`, `backfill_cursor=null` (re-arma backfill). Guarda `access_token_last4`.
- **`borrowToken(tenantId, fn)` (contrato central):** async scope que (1) recusa se status∈{dead,needs_reconnect,revoked}; (2) decripta DENTRO do escopo; (3) passa um `BorrowedCredential {token, igUserId, appSecret}` frozen pro `fn`; (4) se `fn` lançar `TokenInvalid`→marca `dead`; decrypt falha→`needs_reconnect`; (5) o plaintext NUNCA retorna pela pilha (caller não consegue logar/serializar). Em TS: closure que descarta as vars no `finally`; o `fn` recebe só o necessário.
- **`refreshToken`:** lock → decrypt (falha→needs_reconnect+raise) → `graph.refreshToken` (TokenInvalid→dead+grava `last_refresh_error`+raise) → re-encrypt, atualiza last4/issued/expires/last_refresh_at, limpa erro, `active`. Falha é VISÍVEL (vermelho).
- **`refreshDue(withinDays=10)`:** varre ativos com `token_expires_at <= now+within`, refresca 1 a 1 com isolamento de falha por tenant; retorna `{due,refreshed,failed,errors}`.
- **Schema de entrada do connect:** token como secret (não logar); nunca incluir material secreto em logs/`toString`.

---

## 7. Backfill (`lib/instagram/backfill.ts`)

Cursor JSONB em `instagram_credentials.backfill_cursor`, commitado ANTES de retornar cada passo (morte perde ≤1 janela, replays idempotente). Const: série 90d/passo, cap 730d; totals 90d (1 chamada/dia); breakdowns 30d.

Estágios: `init → account_insights → account_totals → account_breakdowns → media → demographics → done` (tabela completa no handoff §7). Erro no passo: `RateLimited`→**não avança cursor**, retorna `{nextInvocationNeeded:true, retryAfter}`; `TokenInvalid`/erro→`backfill_status=failed`, para; estágio desconhecido→`done` defensivo. Retorno: `{done, nextInvocationNeeded, detail, retryAfter}`. Orquestrador (cron) faz loop chamando `backfill-step` enquanto `nextInvocationNeeded`; se `retryAfter`, espera (não pula).

Disparo: `/connect` valida sincronamente e marca `backfill_status=pending`; o cron de backfill (ou um disparo imediato via fetch best-effort pós-connect) chama `backfill-step` em loop.

---

## 8. Collectors (`lib/instagram/collectors.ts`)

Regra de ouro: **re-executar = no-op** (uniq keys + `upsert onConflict`). Todos usam `borrowToken`, terminam com `last_collected_at=now()`. "Hoje" = sempre `America/Sao_Paulo` (usar `Intl`/`date-fns-tz` — fixar TZ). ⚠️ **dedupe intra-batch** (Map `{conflictKey: row}` last-wins) ANTES do upsert — um `onConflict` não pode tocar a mesma chave 2x.

Funções (porte §8): `collectProfileSnapshot` (Type-B), `collectAccountInsights(since,until,['reach','follower_count'])` (Type-A), `collectAccountTotalsForDay(day)` (12 métricas em 1 chamada, `end_time`=meio-dia UTC), `collectAccountBreakdownsForDay(day)` (4 grupos, fallback por-métrica em code 100), `collectMedia(after,enrich)` (`'all'`=backfill, `'fresh'`=≤14d diário, `'none'`; falha de 1 post não aborta a página; insights por-tipo; 1 linha/dia na janela de frescor = velocity), `collectStories` (**hora em hora** — stories somem em 24h; nav separado; arquiva thumb 1x), `collectDemographics` (cada métrica isolada em try/catch; 4 dimensões). `collectDaily` compõe a varredura diária.

**Arquivamento de thumb de story** (`lib/instagram/storage.ts`): baixa `media_url||thumbnail_url` do CDN, redimensiona (sharp, 640px, JPEG q80 ~30KB), sobe pro Supabase Storage key `instagram/stories/{tenant_id}/{ig_story_id}.jpg`, grava `archived_media_key`. **Best-effort** (falha nunca derruba a coleta). Posts/reels NÃO arquivados (persistem no IG).

---

## 9. Analytics (`lib/instagram/analytics.ts`) — leitura secret-free

Janela default: últimos 30d (SP). Derivadas (callers nunca recomputam): série flat de conta + **MA7 trailing**, comparação de período (`pct_change`, métricas reach/views/total_interactions/profile_views/website_clicks), **reconstrução da curva absoluta de seguidores** (âncora = snapshot mais recente, caminha pra trás subtraindo delta diário; snapshots reais têm precedência), fatias de breakdown (bound `[since 00:00 UTC, (until+1d) 00:00 UTC)` por causa do carimbo meio-dia UTC), post cards (`DISTINCT ON (media_id) … ORDER BY captured_date DESC`, `engagement_rate=total_interactions/reach`), `listPosts` (filtros kind/data, sort whitelist, limit [1,60], paginação), stories (`exit_rate=(tap_exit+swipe_forward)/reach`), demografia (só o `captured_date` mais recente), **frescor** (`dataUpTo = max(snapshot dates, SP date de max(account_insight.end_time))` — derivado DOS DADOS, não do "última vez que o job rodou", pra cron morto aparecer).

`buildDashboard(tenantId, since?, until?) → InternalDashboard`: header de perfil + séries (followers, reach, views, total_interactions com ma7) + comparison + top_posts[12] + stories[≤30] + demographics + engaged_demographics + breakdowns (reach_by_follow_type, reach_by_format, interactions_by_format, link_taps_by_type). **+ `health`** (status, backfill_status, token_expires_at, last_collected_at, dataUpTo, access_token_last4) e **`followsUnfollows`** (churn) num campo `adminOnly` — no v1 tudo é interno, mas o tipo já separa o que viraria público. `isPreparing = backfill_status not in ('done',null) && dataUpTo==null`.

---

## 10. Metas (`lib/instagram/goals.ts`) — por tenant (v1)

`target>=1`; `end_date>=start_date`; **não-sobreposição** por tenant → `GoalOverlapError`→409 PT "Já existe uma meta cobrindo parte desse período.". **Progresso computado, nunca armazenado:** `completed = count(instagram_media where tenant_id=$ and media_product_type in ('FEED','REELS') and date(posted_at at time zone 'America/Sao_Paulo') between start and end)`. `percent = completed*100/target` (pode passar 100; UI capa a barra). `active = start<=hoje_SP<=end`. Registry `_GOAL_COUNTERS={posts: countPosts}` (stories depois sem migração). Erros→HTTP: NotFound→404, Overlap→409, Validation→400.

---

## 11. Superfície HTTP (v1 — SEM rotas públicas)

### Internas `app/api/instagram/*` (auth: `requireTenant()`; tenant = dono da conta)
| Rota | Método | Corpo/params | Retorno/erros |
|---|---|---|---|
| `/connect` | POST | `{access_token, app_id?, app_secret?}` | valida→`credentialStore.connect`; TokenInvalid→400 "Token inválido ou expirado. Gere um novo."; PermissionDenied→400 "Permissão de insights ausente (`instagram_business_manage_insights`)."; GraphError→502; dispara backfill (best-effort). Retorna status. |
| `/status` | GET | — | `{ig_user_id, ig_username, status, backfill_status, token_expires_at, last_collected_at, access_token_last4}` ou 404 |
| `/overview` | GET | `?since&until` | `InternalDashboard` (inclui `adminOnly`) ou 404 |
| `/posts` | GET | `?sort&kind&since&until&offset&limit=12` | `{items,total}` |
| `/refresh` | POST | — | refresh manual; TokenInvalid→409 "Token rejeitado — necessária nova captura."; 404 |
| `/connect` | DELETE | — | 204; `status=revoked` |
| `/goals` | GET/POST | POST `{goal_type?,target,start_date,end_date}` | 201 / 409 overlap / 400 |
| `/goals/{id}` | PUT/DELETE | PUT `{target,start_date,end_date}` | 200 / 204 |

Connect/refresh/disconnect = **tenant** (no v1 o tenant é o dono/admin do próprio IG). [v2: separar role admin se multi-usuário por tenant.]

### Jobs `app/api/jobs/instagram/*` (auth: service key — header `Authorization: Bearer $MAGNUS_JOBS_KEY`, compare timing-safe)
Erro comum: TokenInvalid→409; RateLimited→429+`Retry-After`; GraphError→502; sem conexão→404.
`/active` (GET, `[{tenant_id, ig_username}]` dos ativos), `/snapshot/{tenant}`, `/account-insights/{tenant}?since&until`, `/account-breakdowns/{tenant}?day`, `/media/{tenant}?after`, `/demographics/{tenant}`, `/stories/{tenant}`, `/collect-daily/{tenant}`, `/backfill-step/{tenant}`, `/refresh-tokens?within_days=10`.

> `route-guard` hosted: as rotas `/api/instagram/*` entram na allowlist (tenant-authed, same-origin). As `/api/jobs/*` ficam FORA da allowlist do guard de sessão e usam o gate de service key próprio (chamadas do cron não têm cookie de sessão; o guard de same-origin/sessão não se aplica — gate dedicado por bearer key).

---

## 12. Scheduler (cron systemd na VPS)

Units `magnus-ig-*.timer/.service` (mesmo padrão dos timers do operador Jarvis). Cada service = `curl -fsS -H "Authorization: Bearer $MAGNUS_JOBS_KEY" https://magnusos.yuribranco.com.br/api/jobs/instagram/...` (key via `EnvironmentFile` do 1Password). 4 fluxos:
1. **Backfill** (disparado no connect / loop): `backfill-step` enquanto `nextInvocationNeeded`, respeitando `retryAfter`.
2. **Coleta diária** (cron fora de pico): `/active` → `collect-daily/{tenant}` (lotes espaçados — protege a NOSSA infra; rate Graph é por-conta). 1x/semana também `demographics`.
3. **Stories de hora em hora:** `/active` → `stories/{tenant}`. **Gap = dado perdido pra sempre** (stories somem em 24h).
4. **Refresh diário de tokens (CRÍTICO):** `/refresh-tokens`. Sem isso, todo dashboard morre numa janela rolante de 60d.

**2 alertas obrigatórios:** (a) `refresh-tokens` com `failed>0` → avisar (recaptura presencial); (b) **heartbeat** externo (monitor que não seja o próprio cron) — cron morto = dashboards morrendo silenciosamente. `dataUpTo` do overview é o cross-check.

---

## 13. Frontend (Next/React — só interno no v1)

Reusar o design system do painel (tokens.css, Recharts — já? senão `recharts`+`react-is`). Componentes:
- `app/(app)/instagram/page.tsx` (ou aba no painel): se sem conexão → `ConnectForm` (token password obrigatório, app_id/app_secret opcionais, copy "Validamos o token e descobrimos a conta automaticamente…"). Conectado → `HealthBadge` (active=verde, expiring=âmbar, dead/needs_reconnect=vermelho, revoked=cinza) + `@username` + Desconectar + `GoalsSection` + `InstagramDashboard`.
- `InstagramDashboard` (renderer; no v1 só recebe os fetchers internos — props já no shape `{data, fetchDashboard, fetchPosts}` pra o público plugar depois sem refatorar): seletor de período (7/14/30/Tudo/custom dirige tudo via React Query), `isPreparing`→spinner "Preparando seus dados…", "Dados até DD/MM" sempre visível, 6 KPI cards com `▲/▼ x% vs período anterior`, gráfico de seguidores (LineChart connectNulls), reach×views (merge por data + ma7 tracejado), seção Descoberta/formatos (DiscoveryCard %não-seguidores + SliceBarCards), `PostsExplorer` (filtros tipo/ordenação, paginação 12), `PostCardView` (métricas condicionais reel vs feed), Stories (cards 9:16 + exit_rate + nota "nem todos os stories aparecem"), Audiência (BarCharts por dimensão, "instantâneo mais recente").
- `GoalsSection`/`GoalFormDialog` (RHF+Zod) / `GoalProgressBar` ("X de Y posts", % real, barra capada). ⚠️ parse `YYYY-MM-DD` como data LOCAL (`new Date(y,m-1,d)`).

---

## 14. Config / deps / envs

**Envs novos** (1Password → `.env.production`): `ENCRYPTION_PRIMARY_KEY`, `ENCRYPTION_KEY_DERIVATION_SALT`, `ENCRYPTION_KEY_VERSION=1`, `ENCRYPTION_OLD_KEYS=`, `MAGNUS_JOBS_KEY` (service key do cron), `INSTAGRAM_BACKFILL_WEBHOOK_URL?` (opcional). Supabase Storage bucket privado `instagram-thumbs` (migration).
**Deps backend:** `sharp` (thumbs — já? senão add), `date-fns-tz` (TZ SP). Crypto/fetch nativos (`node:crypto`, `fetch`).
**Deps frontend:** `recharts`+`react-is`, `@tanstack/react-query`, `react-hook-form`+`zod`, `date-fns`(ptBR).
**Boot:** `fieldCrypto.selfCheck()` num warmup (primeiro job ou route de health estendida) — config quebrada falha cedo.

---

## 15. Testes (espelhar a origem)
`field-crypto.test` (round-trip/corrompido/versão/rotação/selfCheck) · `connect.test` (feliz/token inválido não persiste/permissão/reconnect re-arma backfill/last4/authz) · `refresh.test` (re-encripta+estende/TokenInvalid→dead/decrypt→needs_reconnect/refreshDue isola/revoked recusa) · `collectors.test` (idempotência 2x/dedupe SP-date/enrich fresh-all-none/falha por post não aborta) · `account-insights.test` (Type-A janela sobreposta/dedupe intra-batch) · `breakdowns.test` (batched/fallback code 100/não polui série flat) · `media-demo-stories.test` (2 tabelas/demo isolada/story nav+<5 viewers+arquivamento) · `backfill.test` (estágios/cursor resume/janela vazia avança/rate-limit não avança/TokenInvalid→failed) · `analytics.test` (ma7/comparison/reconstrução seguidores/dashboard secret-free/isPreparing/exit_rate/sorts) · `goals.test` (CRUD/overlap 409/contagem SP FEED+REELS/percent>100). **Costura de mock:** os testes de collector/backfill mockam as funções do `graph-client`, batem no Supabase de teste.

---

## 16. Plano em fases (espelha as 9 da origem — cada fase testável isolada)

1. **Crypto:** `field-crypto.ts` + envs + selfCheck no boot. Testes.
2. **Auth de job:** gate de service key (`MAGNUS_JOBS_KEY`, timing-safe) p/ `/api/jobs/*`.
3. **Credenciais:** migration tabela 1 + `graph-client` (só `getMe`/`smokeTest`/`refreshToken`) + `credential-store` + rotas connect/status/refresh/disconnect.
4. **Coleta core:** migrations tabelas 2–3 + collectors snapshot/account_insights + jobs.
5. **Backfill:** cursor + `backfill-step` + estágios + disparo no connect.
6. **Media/demografia/stories:** migrations 4–6 + collectors restantes + Storage thumbs + `collect-daily`.
7. **Leitura + frontend:** `analytics` + rotas overview/posts + `InstagramDashboard` + aba interna.
8. **Metas:** migration 7 + `goals` + rotas + componentes.
9. **Ops:** units systemd + 2 alertas + envs de prod + migração aplicada + **validar com a conta-piloto do especialista** antes de escalar.

**Gate de validação (re-verificar com o app Meta real, pendências da origem):** appsecret_proof é exigido pelo `graph.instagram.com`? · limite de métricas-por-chamada no `/insights` · disponibilidade de `views`/breakdowns na v25 por tipo de conta · shape exato do breakdown de navegação de story.

---

## 17. Riscos & decisões abertas pro `/plan-eng-review`
- **RLS vs service role nas credenciais:** confirmar o padrão fail-closed (negar select do cliente, rota projeta via service role). 
- **Advisory lock no Supabase:** via RPC `security definer` (como nas specs anteriores) — validar que o pooler não quebra o `xact_lock`.
- **`sharp` na VPS:** confirmar binário disponível (mesma checagem do bwrap na F1b) — senão thumb vira best-effort no-op.
- **App-per-conta no v1 (1 conta):** o app Meta do Yuri serve; multi-conta/multi-BM (rate-limit isolado) é problema do v2.
- **TZ fixa America/Sao_Paulo** em todos os dedupes/contagens (clientes BR). Parametrizar só se precisar.
- **post_goals por tenant** no v1 — quando vier campanha/contrato, migra a FK.

*Spec v1 escrita 2026-06-11 (sessão /ceo). Próximo: `/plan-eng-review` + `/codex consult` contra o codebase real do painel → plano de implementação por fase → Opus implementa.*
