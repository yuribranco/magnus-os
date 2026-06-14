# Instagram App Review — Kit de Submissão (MagnusOS Instagram)

> Tudo pronto pra submeter o App Review das 2 permissões em **Advanced Access**. App Meta dedicado
> **MagnusOS Instagram** (`INSTAGRAM_APP_ID=997308296550711`). Plano-mãe: `docs/superpowers/specs/2026-06-11-instagram-oauth-app-review-plan.md`.
> Caminho crítico = **Business Verification** (mais lento) — disparar primeiro, em paralelo com o resto.

---

## 0. Estado (o que já está pronto)

| Item | Status |
|---|---|
| App Meta dedicado criado | ✅ `997308296550711` |
| OAuth Business Login (start/callback) | ✅ deployado e **validado e2e ao vivo** (8.441 followers coletados sem erro) |
| Callback de deauthorize | ✅ `POST /api/instagram/deauthorize` (signed_request) |
| Callback de data deletion | ✅ `POST /api/instagram/data-deletion` (signed_request) |
| Página pública de status de exclusão | ✅ `https://magnusos.yuribranco.com.br/instagram/exclusao` |
| **Privacy Policy pública** | ✅ `https://magnusos.yuribranco.com.br/privacidade` (esta entrega) |
| Coleta funcionando (perfil/insights/mídia/demografia) | ✅ provado com dado real |

**Falta (operacional, fora do código):** Business Verification · preencher as 3 URLs no App Dashboard ·
gravar screencast · colar os use-cases (abaixo) · submeter.

---

## 1. ⚠️ Confirmar antes de submeter (2 valores)

Na Privacy Policy (`painel/app/privacidade/page.tsx`, constantes no topo):
1. **`OPERADOR`** — razão social + CNPJ da PJ que vai na Business Verification (a Magnus/mentoria).
2. **`CONTATO`** — um e-mail que você realmente lê (hoje: `contato@magnusos.yuribranco.com.br`). A Meta
   pode escrever pra ele; se não existir essa caixa, troque por um Gmail que você acessa.

Trocar as 2 constantes → rebuild → redeploy (1 arquivo).

---

## 2. URLs pra colar no App Dashboard

App Dashboard → produto **Instagram** / **App Review** → configurações:

| Campo | Valor |
|---|---|
| Privacy Policy URL | `https://magnusos.yuribranco.com.br/privacidade` |
| User Data Deletion → **Data Deletion Request URL (callback)** | `https://magnusos.yuribranco.com.br/api/instagram/data-deletion` |
| (ou) Data Deletion Instructions URL | `https://magnusos.yuribranco.com.br/instagram/exclusao` |
| Deauthorize Callback URL | `https://magnusos.yuribranco.com.br/api/instagram/deauthorize` |
| OAuth Redirect URI | `https://magnusos.yuribranco.com.br/api/instagram/oauth/callback` |
| Categoria do app | Business |

---

## 3. Use-cases das permissões (colar no formulário do App Review)

> A Meta pede, pra CADA permissão: o que faz, por que precisa, e como o usuário se beneficia.
> Texto em inglês (o review é em inglês). Versão PT logo abaixo de cada um pra você revisar o sentido.

### 3.1 `instagram_business_basic`

**EN (colar):**
> MagnusOS is an analytics dashboard for the Instagram Business/Creator account owner. We request
> `instagram_business_basic` to read the connected account's own profile (username, profile picture,
> followers/following/media counts) and its own media (captions, type, timestamp, permalink) so we can
> display a longitudinal performance dashboard to the account owner who authorized the connection.
> We never post, message, or act on the user's behalf. Data is only ever read from the user's own
> account, only after explicit authorization via Instagram Login, and shown back only to that same user.

**PT (referência):** lemos perfil e mídias da própria conta do usuário pra montar o painel histórico
dele. Só leitura, só da conta dele, só após autorização. Nada de postar/mensagear.

### 3.2 `instagram_business_manage_insights`

**EN (colar):**
> We request `instagram_business_manage_insights` to read the connected account's own insights —
> account-level metrics (reach, views, profile views, interactions), per-media metrics, and aggregated
> audience demographics (age range, gender, country, city). These power the core value of MagnusOS:
> a historical, day-by-day view of the owner's own metrics that the Instagram API does not return
> retroactively. Demographics are only ever aggregated, never identifying individual followers. All
> insights belong to the authorizing user's own account and are shown only to that user.

**PT (referência):** lemos os insights da própria conta (alcance/views/interações + métricas por post +
demografia agregada) pra entregar o histórico longitudinal — o valor central do produto. Demografia
sempre agregada. Só da conta do usuário, só pra ele.

---

## 4. Roteiro do screencast (referência primária do revisor)

> Grave a tela (PT ou EN narrado; EN é mais seguro). ~2-3 min. Mostre o **fluxo completo + o valor real**
> (dados populando). Rejeição nº 2 = screencast vago — então **narre cada passo**.

1. **Abrir** `https://magnusos.yuribranco.com.br/login` e entrar (mostre que é um app real, com login).
2. Ir em **Instagram** no menu → tela "Conectar Instagram".
3. Clicar **"Conectar com Instagram"** → mostrar o **redirect oficial do Instagram** (URL `instagram.com/oauth/...`).
4. Mostrar a **tela de permissão da Meta** listando as 2 permissões → autorizar.
5. Voltar pro painel → **"Preparando seus dados…"** (backfill) → depois o **dashboard populado**:
   KPIs (seguidores/alcance/views/interações), **gráfico de Seguidores e Alcance com os números**,
   posts recentes, demografia. ← é aqui que o revisor vê o valor.
6. Demonstrar a **exclusão**: clicar **"Desconectar Instagram"** → confirmar que os dados somem.
7. (bônus) Abrir `https://magnusos.yuribranco.com.br/privacidade` mostrando a política pública.

**Narração-chave:** "This is the account owner connecting their *own* account to see their *own* historical
analytics. We only read; we never post or message. Here is the data populating, and here is how the user
deletes it."

---

## 5. Business Verification — docs a juntar (começar JÁ)

No **Business Manager** → Segurança / Verificação da empresa. Tenha à mão (PJ = Magnus/mentoria):
- CNPJ ativo + razão social batendo com um documento oficial.
- Comprovante (cartão CNPJ / contrato social / conta de serviço no nome da empresa).
- Documento de identidade do admin (Yuri).
- Telefone/e-mail de domínio da empresa pro código de verificação.

> É o gargalo (pode levar mais que o review). Disparar antes de tudo.

---

## 6. Checklist final de submissão (evita ciclo de rejeição)

- [ ] Business Verification **concluída**.
- [ ] Privacy Policy URL pública/crawlável no dashboard (testar **anônimo**, sem cookie de login).
- [ ] Data Deletion + Deauthorize callbacks preenchidos e respondendo.
- [ ] As 2 constantes da privacy (`OPERADOR`, `CONTATO`) confirmadas.
- [ ] Screencast mostrando login → conectar → permissão → **dashboard com dados reais** → exclusão.
- [ ] Use-cases (seção 3) colados nas 2 permissões.
- [ ] App **não** em modo "Em desenvolvimento" pras permissões que dependem de Advanced.
- [ ] Submeter `instagram_business_basic` + `instagram_business_manage_insights` em **Advanced Access**.

**Marco de liberação:** App Review aprovado → trocar Standard → Advanced → **qualquer mentorado conecta**.
Hoje (Standard) só a conta business do Yuri conecta — suficiente pra gravar o screencast e testar.
