# Instagram Analytics → MagnusOS — Kickoff de Adaptação

> **Origem:** handoff do CRM Autêntica (FastAPI async + SQLAlchemy 2.0 + Postgres/Neon + React 19/Vite), 42+ testes verdes, validado ao vivo contra Graph API v25.0 com conta real (2026-06-11, commit `eff1530+`). Fonte canônica de comportamento = repo de origem `~/Documents/A Minha Casa/crm-app` (`app/services/instagram/`) + o handoff completo colado na sessão `/ceo` de 2026-06-11.
> **Destino:** MagnusOS Online (Next.js 16 + Supabase + TS, hosted multi-tenant, executor via Agent SDK).
> **Status:** PRÉ-SPEC. Escopo do v1 TRAVADO (§2b, decisões Yuri 2026-06-11). Próximo = escrever a spec. Nada implementado.

## 2b. ✅ ESCOPO DO V1 — TRAVADO (decisões Yuri 2026-06-11)
1. **Entidade-chave = `tenant_id`** (1 conta de Instagram, a do próprio especialista/tenant). Multi-marca (`brand_id`) é v2 — desenhar o core SEM bloquear a evolução (ex: coluna de escopo nullable/abstração de "owner" que vira FK marca depois), mas v1 não constrói a camada de marca.
2. **Conexão = paste token** num form (admin do tenant). OAuth via app Meta verificado = v2.
3. **Dashboard só INTERNO** (o tenant logado vê o próprio IG). SEM superfície pública no v1 (sem slug/JWT público/segregação). **MAS:** a invariante de redação fica no analytics desde já (o agregador não expõe campo secreto/churn; só a rota pública não existe ainda) → ligar o público depois é só adicionar a rota + auth, sem refazer o core.
4. **Crypto = helper AES-256-GCM em TS** (`node:crypto`), porte direto do `ig_crypto` da origem (mesmo blob `[ver][nonce][ct+tag]`, keyring versionado, `self_check` no boot). Master key via 1Password/`op` (`.env.production`), backup-crítica. _(Alternativa Supabase Vault descartada p/ v1 — o porte do keyring é simples e dá controle/rotação igual à origem.)_
5. **Scheduler = cron systemd na VPS** chamando os endpoints `/jobs` com service key (alinha com os timers do operador Jarvis já em uso). Mantém os endpoints `/jobs` testáveis/re-executáveis. Thumbs de story → **Supabase Storage** (bucket privado).
6. **App Meta:** app-per-conta no v1 (1 conta), token long-lived. Re-verificar as pendências do §5 com o app real antes de escalar.


## 0. O que é (resumo)
Dashboard longitudinal de métricas do Instagram como **entregável premium**. O valor é o **histórico que a Graph API não devolve** (snapshot de perfil, demografia, stories só vêm como "agora") — fabricado por coleta diária/horária persistida. Fonte: **Instagram API with Instagram Login** (`graph.instagram.com`, tokens `IGAA…`, v25.0), permissão `instagram_business_manage_insights`, token long-lived ~60d renovável. Modelo **app-per-BM** (rate-limit isolado ~200 calls/h por conta).

## 1. O que transfere quase 1:1 (o ouro — adaptar de Python→TS, lógica intacta)
- **Modelo de dados: 8 tabelas** (credentials, profile_snapshots, account_insights, media + media_insights, demographics, stories, post_goals). DDL completo no handoff. **Pegadinhas de schema que são lei:** sentinela `''` em vez de NULL nos breakdowns (NULL fura o `ON CONFLICT`); URLs em `TEXT` não `VARCHAR(512)` (CDN do IG estoura); dedupe Type-B por `captured_date DATE` no fuso America/Sao_Paulo.
- **Taxonomia de erro da Graph (4 exceções tipadas)** + tabela de códigos (190/102/463→TokenInvalid; 4/17/32/429→RateLimited; 100+"since"+"2 years"→MetricsWindowTooOld; etc). Transfere literal.
- **Pegadinhas verificadas ao vivo na v25** (cada uma foi um bug real): nome da métrica embutido no `id` na field-expansion de `/media`; métricas são por-tipo (REELS≠FEED, pedir errada erra a chamada INTEIRA); só `reach`+`follower_count` vêm como série diária (resto só `total_value` → fabricar série com 1 chamada/dia, `end_time`=meio-dia UTC do dia SP); navegação de story exige `metric=navigation&breakdown=story_navigation_action_type`; story <5 viewers erra insights; URL de story CDN expira ~24h → arquivar thumb.
- **Backfill resumível por cursor JSONB** (estágios init→account_insights→totals→breakdowns→media→demographics→done; rate-limit NÃO avança cursor; morte perde ≤1 janela idempotente).
- **Collectors idempotentes** (`ON CONFLICT DO UPDATE` + dedupe intra-batch antes do upsert).
- **Analytics**: MA7 trailing, comparação de período, reconstrução da curva absoluta de seguidores (delta diário + âncora de snapshot), exit_rate de stories, engagement_rate.
- **Invariante de segurança dura:** superfície PÚBLICA nunca vê falha operacional nem churn; faz SELECT só em tabelas de dados (+2 colunas não-secretas da credencial) e serializa por schema que estruturalmente não tem campo secreto — vazamento vira erro de tipo, não disciplina.
- **Crypto de campo:** AES-256-GCM + HKDF, blob autodescritivo `[ver:1][nonce:12][ct+tag]`, keyring versionado pra rotação, `self_check()` no boot. **Chave é backup-crítica** (perder = recapturar todos os tokens).

## 1b. O que REESCREVE (stack diferente)
| Origem | MagnusOS |
|---|---|
| FastAPI controllers + SQLAlchemy services | Next route handlers (`app/api/...`) + Supabase client (lib/services) |
| `app/core/ig_crypto.py` (Python cryptography) | **Decisão:** Supabase Vault (já usado p/ OAuth tokens) **OU** AES-GCM em TS (`node:crypto`) com o mesmo formato de blob. Ver §2. |
| Scheduler n8n externo + endpoints `/jobs/*` | **Decisão:** MagnusOS hosted é Next na VPS, sem Celery. Opção forte: cron systemd na VPS chamando os endpoints `/jobs` (mantém testável/re-executável) — alinhado ao operador Jarvis (timers systemd já em uso). Ver §2. |
| S3 (Railway) p/ thumbs de story | Supabase Storage (bucket privado, já temos infra de mirror do ws) |
| RBAC interno (admin/coordinator/...) + JWT público por slug | Auth do MagnusOS: tenant logado (Supabase Auth). "Público" = ? Ver §2. |

## 2. DECISÕES DE MAPEAMENTO (gateiam o desenho — pendentes do Yuri)
1. **De quem é a conta de Instagram / entidade-chave?** Na origem tudo chaveia em `person_id` (a marca). No MagnusOS:
   - (a) **conta do PRÓPRIO tenant** (a agência/especialista mede o próprio Instagram) → chave = `tenant_id`. Simples, 1 conta por tenant.
   - (b) **contas dos CLIENTES do tenant** (a agência mede vários clientes) → precisa de uma entidade "marca/cliente" abaixo do tenant (nova tabela) → chave = `brand_id` (FK tenant). Mais perto da origem (multi-marca) e do modelo "entregável de consultoria".
   - O Yuri disse "plugar a conta do **especialista**" → sugere (a) no v1, com caminho pra (b).
2. **Conexão v1:** colar token num form (presencial, como a origem) — confirmado pelo Yuri ("talvez num 2º momento via app verificado com OAuth"). Então: **v1 = paste token; v2 = OAuth com app Meta verificado**.
3. **Superfície pública existe no v1?** A origem tem dashboard público (cliente final vê por slug+JWT). No MagnusOS v1, isso é necessário ou o dashboard é só interno (o tenant vê o próprio)? Pública adiciona auth/slug/segregação. Provável **v1 interno-só, público depois**.
4. **Crypto:** Supabase Vault (menos código, já no stack) vs AES-GCM em TS (controle total, igual à origem).
5. **Scheduler:** cron systemd na VPS (alinhado ao operador) vs outro. Mantendo os endpoints `/jobs` de qualquer forma.

## 3. Caminho proposto
1. `/office-hours` ou design doc: travar as 5 decisões do §2 → escopo do v1 (provável: tenant's own IG, paste token, interno-só, Vault/TS, cron systemd).
2. Spec adaptada (mapeia o handoff pro stack) → `/plan-eng-review` + codex.
3. Plano em fases espelhando as 9 da origem (crypto → auth job → credenciais → coleta core → backfill → media/demo/stories → leitura+frontend → metas → ops). Cada fase testável isolada.
4. Validar com 1 conta-piloto (a do Yuri/especialista) antes de escalar.

## 4. Não-construído na origem (gates herdados)
- Comentários/menções (texto+usernames) — **bloqueado por LGPD** (exige política de retenção + base legal). Mesmo gate no MagnusOS.

## 5. Pendências de validação que a origem deixou (re-verificar no nosso app Meta)
appsecret_proof é exigido pelo `graph.instagram.com`? · limite de métricas-por-chamada no `/insights` · disponibilidade de `views`/breakdowns na v25 por tipo de conta · shape exato do breakdown de navegação de story.

---
*Kickoff salvo na sessão /ceo 2026-06-11. Próximo: travar §2 → spec.*
