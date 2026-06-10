# Meta App Review — Runbook (Magnus OS Online)

> 2026-06-10. Caminho crítico de calendário da F2/F3 (spec 2026-06-10): sem Advanced Access,
> só contas admin/tester do app conectam (dev mode) — mentorado externo NÃO consegue fazer OAuth.
> App existente: **987622980348211** (criado pro Inc 1 / broker OAuth). Broker: funções `meta-*`
> já no `magnus-os-licenca` (spec `2026-06-01-meta-oauth-broker-plan.md`).
> Verificado contra a doc da Meta em 2026-06-10 (fontes no fim).

## O que precisamos (e o que NÃO precisamos)

- **`ads_read` (Advanced Access)** — ler campanhas/insights das contas dos mentorados. É O pedido central.
- **`business_management`** — SÓ se a enumeração de contas exigir (decisão do plano do broker: menor blast radius; não é read-only). Testar antes com `ads_read` puro; pedir depois se precisar (pedido adicional é incremental, não refaz tudo).
- **`ads_management`** — NÃO pedir agora (escrita na Meta = v2/F-depois; pedir junto só atrasa e aumenta escrutínio).
- **Ads Management Standard Access (AMSA)** — NÃO é pra agora; é o tier de rate-limit alto (exige ≥500 calls de Marketing API em 15 dias a partir de 04/05/2026). Relevante quando houver dezenas de tenants sincronizando.

## Sequência (ordem importa — o que trava primeiro vai primeiro)

### Fase A — Business Verification (COMEÇAR JÁ — é o longo prazo: dias úteis a semanas)
1. **business.facebook.com → Configurações do negócio → Central de segurança → Iniciar verificação** (na BM principal do Yuri/empresa que será dona do app).
2. Documentos: CNPJ ativo, razão social batendo, endereço, telefone OU domínio verificável, e-mail no domínio da empresa. Dica: verificar o **domínio `yuribranco.com.br`** na BM (Brand Safety → Domínios, via DNS TXT) antes — acelera o match.
3. O app precisa estar **vinculado à BM verificada** (developers.facebook.com → App → Configurações → Avançado → Business Manager dono do app).
4. Status acompanhado na Central de segurança. Se reprovar por divergência de nome/endereço, corrigir o cadastro e re-submeter.

### Fase B — Higiene do app (pré-requisitos de submissão; ~1h, Claude prepara os textos/páginas)
No painel do app (developers.facebook.com → app 987622980348211):
1. **Tipo/Login:** confirmar app tipo Business com **Facebook Login for Business** (não o Login de consumidor) — apps Business têm compliance recorrente reduzido.
2. **Configurações → Básico:** ícone 1024×1024 · categoria (Business and pages) · **Privacy Policy URL** · **Data Deletion Instructions URL** · App Domains (`magnusos.yuribranco.com.br`) · e-mail de contato.
   - Páginas a publicar (Claude gera; podem viver no próprio domínio): `https://magnusos.yuribranco.com.br/privacidade` e `/exclusao-de-dados`.
3. **Facebook Login for Business → Settings:** Valid OAuth Redirect URIs = o callback do broker (decidir ANTES do screencast — ex.: `https://<REF>.supabase.co/functions/v1/meta-callback` ou o domínio próprio). Client OAuth ON, Web OAuth ON, Enforce HTTPS ON.
4. **Data Use Checkup:** se pendente, completar (atestar uso permitido de cada permissão).
5. **App Secret:** ⚠️ rotacionar antes de ir a público — o `META_APP_SECRET` antigo passou em chat (pendência da auditoria 2026-06-09; runbook no `magnus-os-licenca/DEPLOY.md`).

### Fase C — Provas de uso (pré-submissão; Claude executa)
1. **≥1 chamada de API bem-sucedida com CADA permissão pedida, nos 30 dias anteriores à submissão** (vale Graph API Explorer): ex. `GET /me/adaccounts?fields=name` e `GET /act_<id>/insights?date_preset=last_7d` com token de `ads_read`.
2. **Fluxo demonstrável fim-a-fim no ambiente real:** botão "Conectar Meta" no painel → OAuth → consentimento → volta → painel mostra os insights. (O broker dev-mode + painel F1/F3 precisam estar apresentáveis — por isso o review na prática se submete durante a F2/F3, mas as Fases A e B andam DESDE JÁ.)

### Fase D — Screencast (a peça que mais reprova; Claude roteiriza, Yuri grava)
Regras da Meta: gravar com software de screencast (nunca filmar a tela), resolução ≤1440 de largura, **anotações/legendas** apontando cada permissão em uso, e capturar o **fluxo de autorização completo**.
Roteiro (1 vídeo, ~90s):
1. Tela do painel Magnus OS Online logado (tenant de teste) → clicar **"Conectar Meta"**.
2. Diálogo de login/consentimento da Meta aparecendo → mostrar a permissão `ads_read` listada → aceitar.
3. Redirect de volta pro painel → abrir a **visão Empresa** mostrando os números de ads carregados (o uso real da permissão).
4. Legenda final: "ads_read is used solely to display the user's own ad performance inside their dashboard."

### Fase E — Submissão
1. App Review → **Permissions and Features** → buscar `ads_read` → **Request Advanced Access**.
2. Preencher por permissão: como o app usa o dado + por que precisa + screencast + **instruções de teste pro revisor** (criar um tenant de teste com magic-link e uma conta Meta de teste com campanha ativa; descrever o caminho de clique exato).
3. Texto de justificativa (colar/adaptar):
   > "Magnus OS Online is a SaaS dashboard for Brazilian marketing agency owners. After the user connects their own Meta account via Facebook Login for Business, we use **ads_read** exclusively to fetch the performance metrics (spend, CTR, CPA, ROAS) of the user's own ad campaigns and display them in their private dashboard, combined with their sales data. Data is never shared with third parties, never used for ads targeting, and each user only ever sees their own ad accounts."
4. Submeter. Prazo típico: dias a ~2 semanas. Se reprovar: o motivo vem por item — corrigir exatamente o apontado (90% dos casos: screencast não mostra o fluxo de autorização ou a permissão em uso) e re-submeter.
5. Aprovado → **App Mode: Live**. Aí qualquer mentorado conecta.

## Divisão de trabalho

| Quem | O quê |
|---|---|
| **YURI (já)** | Fase A inteira (Business Verification — só o dono faz) + vincular app à BM |
| **Claude (já)** | Páginas de privacidade/exclusão de dados, textos de justificativa, roteiro do screencast (este doc) |
| **Claude (F1/F2)** | Broker apontado pro redirect final + painel apresentável + chamadas de prova |
| **YURI (F2/F3)** | Gravar o screencast + clicar em Submeter + rotacionar App Secret |

## Fontes (verificadas 2026-06-10)
- [App Review — Submission Guide (Meta)](https://developers.facebook.com/docs/resp-plat-initiatives/individual-processes/app-review/submission-guide)
- [App Review — Screen Recordings (Meta)](https://developers.facebook.com/docs/app-review/submission-guide/screen-recordings/)
- [Permissions Reference (Meta)](https://developers.facebook.com/docs/permissions/)
- [Facebook Login for Business (Meta)](https://developers.facebook.com/documentation/facebook-login/facebook-login-for-business)
- [Updates to Ads Management Standard Access — efetivo 04/05/2026 (Meta blog)](https://developers.meta.com/blog/updates-to-ads-management-standard-access-feature/)
- Guias de mercado 2026: [AdManage.ai](https://admanage.ai/blog/meta-ads-api), [AdAmigo.ai](https://www.adamigo.ai/blog/meta-ads-api-access-levels-for-agencies)
