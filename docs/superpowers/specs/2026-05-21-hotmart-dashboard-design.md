# Dashboard Hotmart — Design Spec

**Data:** 2026-05-21
**Projeto:** `~/Documents/Magnus/hotmart-dashboard/` (novo, separado de `magnus-os`)
**Origem:** Imersão Magnus, Parte 3, Bloco 11 — Dashboard Hotmart vendas em real-time

## Contexto

Yuri é Producer Hotmart com o produto **A Minha Casa** (mais outros na conta). O painel oficial da Hotmart entrega 30 widgets e exige navegação chata pra ver os números que importam. Esta spec define um dashboard local mínimo que puxa via API REST e renderiza só o essencial.

Pattern reusável (`API → fetch → process → render local`) — vale pra Kiwify, Shopify, Stripe depois.

## Objetivo

Dashboard local de 1 página que mostra **números gerais** da Hotmart pra Yuri, sem decisão específica embutida. Não substitui o painel oficial; é um espelho curado pra evitar caça ao número.

**Fora de escopo (YAGNI):**

- Top afiliados
- Conversão de checkout
- Trends comparativos / históricos persistentes
- Forecast e projeção de mês
- Chargeback / refund stats
- Recorrência / gestão de assinaturas
- Multi-usuário, auth, deploy em nuvem

## Decisões já travadas

| Decisão | Escolha | Motivo |
|---|---|---|
| Escopo de produtos | Todos os produtos com seletor; **A Minha Casa** como default | Yuri tem mais de um produto, mas A Minha Casa é o foco. |
| Frescor dos dados | Puxa fresco a cada abertura — sem DB, sem histórico próprio | Simples; mata 90% da necessidade. Se evoluir, adiciona SQLite depois. |
| Stack | Node + Express minimal + HTML/JS vanilla + Chart.js via CDN | Credenciais server-side, frontend sem framework, ~150 linhas. |
| Tipo de uso | Single-user local em `localhost:3000` | Sem auth, sem deploy. |

## Métricas exibidas

| Bloco | Métrica | Fonte |
|---|---|---|
| KPI 1 | Vendas hoje (R$ + contagem) | API `sales/history` filtrado por data |
| KPI 2 | Vendas 7 dias (R$ + contagem) | API `sales/history` filtrado por data |
| KPI 3 | Vendas 30 dias (R$ + contagem) | API `sales/history` filtrado por data |
| KPI 4 | Ticket médio 30 dias | Calculado: R$ 30d / contagem 30d |
| Chart 1 | Line chart — vendas por dia (30d) | Agregado server-side a partir do `sales/history` |
| Chart 2 | Donut — split por método de pagamento | Agregado server-side |
| Tabela | Últimas 10 vendas: timestamp, comprador, valor, status, método | API `sales/history`, ordenado desc por data |

Header: nome do produto selecionado + dropdown de seletor + timestamp da carga + botão refresh.

### Definições de termos (evitar ambiguidade)

- **"Vendas R$"** = soma da **comissão líquida do Yuri** (campo `commission.value` do `producer` na resposta da Hotmart), não preço bruto. É o que cai pra ele.
- **"Vendas count"** = número de transações com status `APPROVED`. Pendentes (`PRE_ORDER`, `STARTED`) e recusadas (`REFUSED`, `CANCELED`) não entram nos KPIs nem no ticket médio.
- **Tabela "últimas 10"** = todas as transações independente de status, ordenadas por data desc. Coluna "comprador" mostra o nome (não o email, por privacidade visual).
- **Status mapping (códigos Hotmart → rótulo PT)**:
  - `APPROVED` → ✅ aprovada
  - `PRE_ORDER` / `STARTED` → ⏳ análise
  - `REFUNDED` → 💸 reembolso
  - `CHARGEBACK` → ⚠️ chargeback
  - `REFUSED` / `CANCELED` → ❌ recusada
- **Timezone dos filtros** = `America/Sao_Paulo`. "Hoje" significa 00:00 BRT até agora. Conversão pra UTC só no momento de mandar pra API Hotmart.

## Arquitetura

```
~/Documents/Magnus/hotmart-dashboard/
├── .env                # HOTMART_CLIENT_ID + HOTMART_CLIENT_SECRET + HOTMART_BASIC_TOKEN
├── .env.example        # template sem secrets
├── .gitignore          # .env, node_modules/, hotmart-demo.json (se sensível)
├── package.json        # deps: express, dotenv
├── server.js           # auth + endpoint /api/sales
├── public/
│   ├── index.html      # markup do dashboard
│   └── app.js          # fetch /api/sales → render KPIs + charts + tabela
└── hotmart-demo.json   # 30 vendas sintéticas (fallback do canal Magnus)
```

5 arquivos. Sem build step. Sem framework. `npm install && npm start` → `localhost:3000`.

### Limites do `server.js`

- **Auth helper** — função `getAccessToken()` com cache em memória (`{ value, expiresAt }`). Troca o `BASIC_TOKEN` por `access_token` via `POST /security/oauth/token` quando expira (TTL Hotmart ≈ 1h).
- **Endpoint `/api/sales`** — recebe `?product=<id>` opcional. Chama `GET /payments/api/v1/sales/history` cobrindo 30 dias atrás. Processa em 4 KPIs + agregação por dia + agregação por método + lista das últimas 10. Devolve um único JSON ao frontend.
- **Static serve** — `app.use(express.static('public'))`.

### Limites do frontend (`public/`)

- `index.html` — markup estático (4 cards KPI, 2 canvas pra Chart.js, 1 tabela). Carrega Chart.js do CDN.
- `app.js` — `fetch('/api/sales')` → render. Botão refresh re-chama. Dropdown de produto re-chama com query param.

## Data flow

```
[browser]                      [server.js]                    [Hotmart API]
   |                                |                                |
   | GET /                          |                                |
   |─────────────────────────────►  | serve public/index.html        |
   |                                |                                |
   | GET /api/sales?product=...     |                                |
   |─────────────────────────────►  |                                |
   |                                | 1) cache do access_token       |
   |                                | 2) expirado → POST /oauth/token|
   |                                |─────────────────────────────►  |
   |                                |◄─── access_token + ttl ────────|
   |                                | 3) GET /sales/history (30d)    |
   |                                |─────────────────────────────►  |
   |                                |◄─── lista de vendas ───────────|
   |                                | 4) processa: KPIs + agrega     |
   |◄─── JSON consolidado ──────────|                                |
   |                                |                                |
   | render KPIs + charts + tabela  |                                |
```

## Modo demo (fallback sem credenciais)

Se `process.env.HOTMART_BASIC_TOKEN` estiver vazio na inicialização:

- `server.js` lê `hotmart-demo.json` (30 vendas sintéticas vindas do canal Magnus) em vez de chamar a API.
- Log no console: `⚠️  Modo demo — usando hotmart-demo.json`.
- `/api/sales` filtra/agrega o JSON local com a mesma lógica usada na API real.

Utilidade: testar o pattern antes de habilitar Developer Tools, desenvolver layout sem queimar requests, e seguir a aula mesmo sem credencial pronta.

## Error handling

| Erro | Comportamento |
|---|---|
| 401 da Hotmart | Banner vermelho: "Token Hotmart inválido. Confere `.env`." Sem retry. |
| 429 (rate limit) | Banner: "Hotmart pediu pra esperar Xs" + botão retry manual. |
| Network / timeout (>10s) | Banner: "Hotmart fora do ar — tenta de novo." Mantém último estado renderizado se houver. |
| `.env` ausente / token vazio | Modo demo (não é erro). |
| `hotmart-demo.json` ausente em modo demo | Erro fatal no startup: instrução pra baixar do canal. |

## Testing

Sem suite formal. Smoke checks manuais documentados no `README.md` do projeto:

1. `npm start` sem `.env` → modo demo carrega, dashboard renderiza com 30 vendas sintéticas.
2. `npm start` com `.env` válido → fetch real, números reais na tela.
3. `npm start` com `HOTMART_BASIC_TOKEN=lixo` → banner 401 aparece, app não crasha.

## Setup do credentials (referência da aula)

Aluno gera 3 valores no painel Hotmart → Ferramentas do Desenvolvedor → Credenciais → Nova credencial → escopo `Sales: Read`:

- `HOTMART_CLIENT_ID`
- `HOTMART_CLIENT_SECRET`
- `HOTMART_BASIC_TOKEN` (já em base64, formato `Basic <token>`)

Conforme CLAUDE.md global do Yuri, esses 3 valores vão no `.env.local` do projeto local. Não vai em produção (não há prod). Anotar inline no `.env.example` a origem: `# generated 2026-05-21 via Hotmart Developer Tools`.

## Riscos e o que ficou de fora

- **Sem persistência** — se a Hotmart cair, o dashboard fica sem dados. Aceito por simplicidade.
- **Sem trends históricos** — não dá pra ver "vendi mais que mês passado?". Aceito; se virar dor, adiciona SQLite (Approach D da discussão).
- **Token cache em memória** — restart do server descarta. Aceito; 1h é mais que suficiente pra uma sessão de uso.
- **Filtro de produto in-memory** — uma única request da API traz todos os produtos, server filtra. Se a conta tiver volume alto de vendas, pode ficar pesado. Mitigação se acontecer: filtrar via query param na API Hotmart em vez de in-memory.

## Próximo passo

Spec aprovada → invocar `superpowers:writing-plans` pra montar o plano de implementação tarefa-a-tarefa.
