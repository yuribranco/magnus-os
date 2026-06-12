# Instagram OAuth + App Verificado da Meta — Pesquisa & Plano de Execução

> **Objetivo:** trocar a conexão por **paste-token** (gambiarra do v1, exige Yuri/admin colar o token na mão)
> por **OAuth real** ("Conectar com Instagram" → o especialista autoriza e o token vem sozinho), com um
> **app Meta verificado e aprovado** pra qualquer usuário conectar. **Escopo v1: só a parte estatística**
> (insights — o que já está construído e no ar). **Futuro (NÃO agora):** mensageria estilo ManyChat
> (responder DMs/comentários) — é outra trilha de permissões + review, fora deste plano.
>
> **Status:** pesquisa concluída (2026-06-11). Próximo: `/plan-eng-review` + writing-plans da Fase técnica,
> e **começar a verificação de negócio HOJE** (é o caminho crítico mais lento).

---

## 1. A boa notícia: 90% já está pronto

O módulo Instagram v1 (F1-F9, no ar) já usa **exatamente a API certa** pra esse caminho — a
**Instagram API with Instagram Login** (`graph.instagram.com`, tokens `IGAA`, sem precisar de Página do
Facebook). Tudo que coleta/processa **continua igual**; só o **"connect" muda de paste→OAuth**:

| Componente atual | Muda? |
|---|---|
| `graph-client.ts` (chamadas, erros tipados, `refreshToken`) | ✅ reusa 100% — já fala `graph.instagram.com` |
| `credential-store.ts` (cripto, máquina de estados, `borrowToken`) | ✅ reusa — só a origem do token muda |
| `field-crypto` (AES-256-GCM) | ✅ reusa |
| collectors, backfill, analytics, dashboard, metas, cron | ✅ reusa 100% |
| **`/api/instagram/connect` (paste token)** | 🔁 **vira o callback do OAuth** |
| token refresh de 60 dias (cron `refresh-tokens`) | ✅ já existe e roda |

**Tradução:** não é reescrever o módulo. É **adicionar o fluxo de autorização** na frente do que já existe.

---

## 2. Decisão de arquitetura: **Business Login for Instagram** (não Facebook Login)

A Meta tem **dois caminhos** pra apps de Instagram:

| Caminho | Como conecta | Precisa de Página do FB? | Pra nós |
|---|---|---|---|
| **Instagram API with Instagram Login** (Business Login) | usuário loga **direto com o Instagram** | ❌ não | ✅ **ESTE** |
| Instagram Graph API via Facebook Login | usuário loga no Facebook, IG tem que estar linkado a uma Página | ✅ sim | ❌ atrito pro especialista |

**Por quê Business Login:** o especialista do MagnusOS conecta a conta **profissional de Instagram dele
sem precisar ter/linkar Página do Facebook** — muito menos atrito, e é o caminho que a Meta desenhou pra
"apps de terceiros conectarem contas que não são suas" (exatamente o nosso caso). Já é a API que usamos.

---

## 3. Pesquisa: o que a Meta exige (verificado nas docs oficiais, jun/2026)

### 3.1 Permissões (scopes) que vamos pedir
- **`instagram_business_basic`** — perfil + mídia básica (obrigatória, base de tudo + do refresh).
- **`instagram_business_manage_insights`** — **insights** (adicionada mar/2025; é o coração da nossa parte
  estatística: reach, views, demographics, etc.).

> Mensageria (futuro) seria `instagram_business_manage_messages` + feature **Human Agent** — **não pedir
> agora** (cada permissão extra = mais escrutínio no review; pedir só o necessário acelera a aprovação).

### 3.2 Níveis de acesso — e por que precisamos de App Review
| Nível | Quem atende | Precisa review? |
|---|---|---|
| **Standard Access** (default) | só a SUA conta / contas que você administra | ❌ não |
| **Advanced Access** | **contas de terceiros** (qualquer especialista/tenant que conecta a conta DELE) | ✅ **SIM** |

O paste-token de hoje funciona em **Standard Access** (token do próprio Yuri). Pra **qualquer cliente
conectar a conta dele**, precisamos de **Advanced Access** nas 2 permissões → **App Review + Business
Verification**. Esse é o ponto inteiro do pedido.

### 3.3 Pré-requisitos da submissão (todos obrigatórios)
1. **Business Verification** (verificação da empresa) — documentação legal da pessoa jurídica / identidade
   do admin. **É o passo mais lento e bloqueia a publicação** → começar primeiro. Sem isso não publica/atualiza app.
2. **Privacy Policy** numa **URL pública, crawlável, não geo-bloqueada**, listada no App Dashboard. Tem que
   explicar: que dados coletamos, como processamos, por quê, e **como o usuário pede exclusão**. (Rejeição
   comum nº 1 é privacy policy — até página lenta reprova.)
3. **Data Deletion Callback URL** no app + caminho self-service de exclusão — a Meta manda um callback quando
   o usuário pede pra apagar os dados, e temos que cumprir (apagar credencial + dados coletados do tenant).
4. **Screencast (vídeo)** demonstrando o fluxo ponta a ponta — **é a referência primária do revisor** (ele
   NÃO explora o app sozinho). Tem que mostrar: login → "Conectar Instagram" → tela de permissão da Meta →
   dashboard populando com os insights. Explicar como se o revisor nunca tivesse visto o app.
5. **Use-case description** clara por permissão (por que precisamos de insights; o que o usuário ganha).
6. **App em modo Live** + OAuth redirect URIs válidos + ícone + categoria.

### 3.4 Operacional
- **Timeline:** aprovação ~2-7 dias úteis; cada rejeição soma 3-5 dias. Business Verification pode levar mais
  (depende dos documentos). → **submeter cedo, caprichar no screencast pra não rodar o ciclo de rejeição.**
- **Rate limit:** 200 chamadas/usuário/hora (já respeitamos — backfill ~130 chamadas cabe; cron espaçado).
- **App Secret:** já temos o `appsecret_proof` lazy implementado no graph-client.

---

## 4. Gap analysis — o que falta construir/fazer

### 4.1 Técnico (no código — pequeno, ~1-2 dias)
- [ ] **Config do app Meta:** criar/usar o app dedicado, adicionar o produto "Instagram", setar OAuth redirect
      URI (`https://magnusos.yuribranco.com.br/api/instagram/oauth/callback`), pôr `INSTAGRAM_APP_ID` +
      `INSTAGRAM_APP_SECRET` no 1Password/`.env.production`.
- [ ] **Rota de início do OAuth** `GET /api/instagram/oauth/start` → gera `state` (CSRF, guardado em
      cookie/DB), monta e redireciona pra `https://www.instagram.com/oauth/authorize?client_id=…&redirect_uri=…&response_type=code&scope=instagram_business_basic,instagram_business_manage_insights&state=…`.
- [ ] **Rota de callback** `GET /api/instagram/oauth/callback` → valida `state` → troca `code`→token curto
      (`POST https://api.instagram.com/oauth/access_token`) → troca curto→**longo 60d**
      (`GET https://graph.instagram.com/access_token?grant_type=ig_exchange_token`) → grava via
      `credentialStore.connect()` (reusa a cripto + máquina de estados!) → dispara backfill → redireciona pro `/instagram`.
- [ ] **UI:** o `ConnectForm` (paste) vira um botão **"Conectar com Instagram"** que leva pro `/oauth/start`.
      (Manter o paste como fallback/admin escondido é opcional.)
- [ ] **Data Deletion:** rota `POST /api/instagram/data-deletion` (callback da Meta, valida `signed_request`
      com o App Secret) que apaga credencial + dados do tenant; + caminho self-service no app (botão "apagar
      meus dados do Instagram").
- [ ] **route-guard:** liberar `/api/instagram/oauth/(start|callback)` e `/api/instagram/data-deletion`
      (callback é externo, sem sessão → gate próprio por `signed_request`, igual ao padrão dos jobs).

> O `refreshToken` (já implementado) e o `appsecret_proof` continuam valendo — o token do OAuth é o mesmo
> tipo de long-lived token de 60 dias que já sabemos renovar.

### 4.2 Operacional (fora do código — caminho crítico, começar HOJE)
- [ ] **Business Verification** — juntar docs da PJ/identidade e submeter no Business Manager (mais lento).
- [ ] **Privacy Policy** dedicada (pode ser uma página no próprio domínio) cobrindo dados do Instagram +
      caminho de exclusão. (Já existem páginas legais no companion — estender.)
- [ ] **Screencast** do fluxo (gravar depois que o OAuth técnico estiver no ar em modo dev/teste).
- [ ] **Use-case descriptions** por permissão.
- [ ] **Submeter App Review** das 2 permissões em Advanced Access.

---

## 5. Plano em 2 trilhas PARALELAS (pra submeter o quanto antes)

A sacada pra aprovar rápido: rodar a **trilha técnica** e a **trilha de aprovação** ao mesmo tempo.

### Trilha A — Técnica (Claude implementa)
- **A1.** Config do app Meta + secrets no 1Password.
- **A2.** Rotas `oauth/start` + `oauth/callback` + troca de tokens (reusa `credentialStore.connect`).
- **A3.** UI: botão "Conectar com Instagram".
- **A4.** Rota `data-deletion` (signed_request) + self-service.
- **A5.** Testar ponta a ponta em **Standard Access** com a conta do Yuri (funciona sem review).
  → nesse ponto o OAuth já funciona pro Yuri; falta só o review pra liberar pra terceiros.

### Trilha B — Aprovação (Yuri + Claude apoiam)
- **B1.** 🔴 **Business Verification — começar JÁ** (caminho crítico, mais lento).
- **B2.** Privacy Policy publicada + Data Deletion URL no app dashboard.
- **B3.** Após A5: gravar o **screencast** + escrever use-cases.
- **B4.** **Submeter App Review** (`instagram_business_basic` + `instagram_business_manage_insights`, Advanced).
- **B5.** Responder eventuais rejeições (caprichar no screencast minimiza isso).

**Marco de liberação:** App Review aprovado → trocar de Standard pra Advanced → qualquer especialista conecta.

---

## 6. Caminho crítico & sequência recomendada
```
HOJE ─┬─ B1 Business Verification (lento, começa já) ───────────────┐
      └─ A1→A2→A3→A4 (Claude, ~1-2 dias) → A5 testar c/ conta Yuri ─┤
                                                                     ├─ B3 screencast → B4 submeter → aprovação (2-7d)
         B2 privacy policy + data deletion (paralelo) ──────────────┘
```
O gargalo é **Business Verification** (B1) — por isso é o primeiro a disparar, em paralelo com tudo.

---

## 7. Checklist de submissão do App Review (pra não rodar ciclo de rejeição)
- [ ] App em **modo Live**, ícone + categoria preenchidos.
- [ ] Produto **Instagram** adicionado, **redirect URI** exata configurada.
- [ ] **Business Verification** concluída.
- [ ] **Privacy Policy URL** pública/crawlável no dashboard, explicando coleta + processamento + exclusão.
- [ ] **Data Deletion Callback URL** configurada e funcionando (testada com `signed_request`).
- [ ] **Screencast** mostrando login → conectar → tela de permissão → dashboard com dados reais.
- [ ] **Use-case** por permissão (insights: "o especialista vê a evolução longitudinal da conta dele").
- [ ] Pedir **só** `instagram_business_basic` + `instagram_business_manage_insights` (nada de messaging agora).

## 8. Riscos & rejeições comuns (e como mitigar)
| Risco | Mitigação |
|---|---|
| Privacy policy reprovada (rejeição nº 1) | página dedicada, rápida, cobrindo dados IG + exclusão explícita |
| Screencast vago → rejeição | roteiro passo-a-passo, mostrar o valor real (dados populando), narrar tudo |
| Business Verification travar nos docs | começar JÁ; ter CNPJ/identidade do admin à mão |
| Pedir permissão demais | escopo mínimo (2 permissões) — messaging fica pra outra rodada |
| Data deletion não-funcional no teste do revisor | implementar + testar o callback antes de submeter |

## 9. Decisões do Yuri — ✅ TODAS TRAVADAS (2026-06-12, /ceo)
1. **App Meta:** ✅ **app dedicado "MagnusOS Instagram"** (não reusar o `987622980348211` de Ads) — isola rate-limit e review.
2. **PJ pra Business Verification:** ✅ **CNPJ da Magnus/mentoria** (Yuri junta os docs).
3. **Privacy Policy:** ✅ **estender as páginas legais do companion** (URL já pública/crawlável; adicionar seção dados-IG + caminho de exclusão).
4. **Paste-token:** ✅ **manter como caminho admin escondido** (fallback) — OAuth vira o normal, paste fica pra debug/admin.

> **Próximo (frente desbloqueada):** (a) Yuri cria o app Meta dedicado "MagnusOS Instagram" no console (A1, manual) + dispara B1 Business Verification (CNPJ Magnus, caminho crítico). (b) Claude: `/plan-eng-review` da Trilha A → writing-plans → codar A2-A4 (rotas oauth/start+callback+data-deletion, reusa `credentialStore.connect`; UI botão "Conectar com Instagram" + paste escondido) → A5 testar em Standard Access c/ conta Yuri. Testável sem o review.

---

*Pesquisa + plano escritos 2026-06-11 (sessão /ceo). Fontes: docs oficiais Meta (Business Login for Instagram,
Overview, App Review, Insights) + guias 2025/2026. Próximo: `/plan-eng-review` da Trilha A + disparar B1.*
