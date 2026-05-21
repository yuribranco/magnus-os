# Hotmart Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir um dashboard local de 1 página que mostra os números essenciais de vendas da conta Hotmart do Yuri (foco em A Minha Casa), substituindo a navegação chata do painel oficial.

**Architecture:** Node + Express minimal como backend (1 endpoint `/api/sales` que autentica na Hotmart, busca transações dos últimos 30 dias, agrega em KPIs/charts/tabela) + HTML/JS vanilla no frontend com Chart.js via CDN. Modo demo lê `hotmart-demo.json` se não houver credenciais.

**Tech Stack:** Node ≥18 (fetch nativo), Express, dotenv, Chart.js (CDN). Sem build step, sem framework no frontend, sem DB.

**Spec:** `docs/superpowers/specs/2026-05-21-hotmart-dashboard-design.md`

**Project location:** Os arquivos do dashboard ficam num projeto separado em `~/Documents/Magnus/hotmart-dashboard/`. Todos os caminhos abaixo são relativos a essa raiz.

**Testing approach:** Por decisão da spec (smoke-first, sem suite formal), apenas **Task 5 (processamento puro)** usa TDD com `node:test`. As outras tasks usam smoke checks manuais descritos em comandos exatos.

---

### Task 1: Bootstrap do projeto

**Files:**
- Create: `~/Documents/Magnus/hotmart-dashboard/package.json`
- Create: `~/Documents/Magnus/hotmart-dashboard/.gitignore`
- Create: `~/Documents/Magnus/hotmart-dashboard/.env.example`
- Create: `~/Documents/Magnus/hotmart-dashboard/.env`
- Create: `~/Documents/Magnus/hotmart-dashboard/README.md`
- Create: `~/Documents/Magnus/hotmart-dashboard/public/` (diretório vazio)
- Create: `~/Documents/Magnus/hotmart-dashboard/lib/` (diretório vazio)

- [ ] **Step 1: Criar diretório raiz e entrar nele**

```bash
mkdir -p ~/Documents/Magnus/hotmart-dashboard/public ~/Documents/Magnus/hotmart-dashboard/lib
cd ~/Documents/Magnus/hotmart-dashboard
git init
```

- [ ] **Step 2: Criar `package.json`**

Arquivo `package.json`:

```json
{
  "name": "hotmart-dashboard",
  "version": "0.1.0",
  "description": "Dashboard local de vendas Hotmart — pattern API → fetch → process → render",
  "type": "module",
  "scripts": {
    "start": "node server.js",
    "test": "node --test lib/process.test.js"
  },
  "dependencies": {
    "express": "^4.19.2",
    "dotenv": "^16.4.5"
  }
}
```

- [ ] **Step 3: Criar `.gitignore`**

Arquivo `.gitignore`:

```
node_modules/
.env
.env.local
.DS_Store
*.log
```

- [ ] **Step 4: Criar `.env.example`**

Arquivo `.env.example`:

```
# Hotmart Developer Tools — generated YYYY-MM-DD via Hotmart Developer Tools (escopo Sales: Read)
HOTMART_CLIENT_ID=seu_client_id
HOTMART_CLIENT_SECRET=seu_client_secret
HOTMART_BASIC_TOKEN=Basic seu_token_base64

# Porta do server local (opcional, default 3000)
PORT=3000
```

- [ ] **Step 5: Criar `.env` vazio (pra modo demo logo de cara)**

Arquivo `.env`:

```
# Sem credenciais ainda — modo demo ativo. Preencha quando habilitar Developer Tools no Hotmart.
PORT=3000
```

- [ ] **Step 6: Criar `README.md` skeleton (será preenchido na Task 8)**

Arquivo `README.md`:

```markdown
# Hotmart Dashboard

Dashboard local de vendas Hotmart. Pattern: API → fetch → process → render.

## Setup
\`\`\`bash
npm install
cp .env.example .env  # preencha as 3 credenciais Hotmart
npm start
\`\`\`

Abre em http://localhost:3000

Smoke checks documentados na Task 8 do plano.
```

- [ ] **Step 7: Instalar deps**

```bash
npm install
```

Expected: `node_modules/` criado, sem erro.

- [ ] **Step 8: Smoke check + commit**

```bash
test -f package.json && test -d node_modules && test -f .gitignore && test -f .env && echo "bootstrap OK"
git add package.json .gitignore .env.example README.md
git commit -m "chore: bootstrap hotmart-dashboard project"
```

Expected output: `bootstrap OK` + commit criado.

---

### Task 2: Demo data + data source

**Files:**
- Create: `~/Documents/Magnus/hotmart-dashboard/hotmart-demo.json`
- Create: `~/Documents/Magnus/hotmart-dashboard/lib/demo-source.js`

A spec menciona que `hotmart-demo.json` vem do canal Magnus com 30 vendas sintéticas. Se o Yuri ainda não baixou, esta task gera um stub realista in-line — depois ele substitui pelo arquivo oficial sem mexer no resto do código (mesma estrutura).

- [ ] **Step 1: Criar `hotmart-demo.json` stub com 5 vendas sintéticas**

Arquivo `hotmart-demo.json` (estrutura espelha resposta real do endpoint `sales/history` da Hotmart):

```json
{
  "items": [
    {
      "transaction": "HP1234567890",
      "approved_date": 1779302400000,
      "status": "APPROVED",
      "product": { "id": 1001, "name": "A Minha Casa" },
      "buyer": { "name": "João Silva", "email": "joao@example.com" },
      "payment": { "method": "CREDIT_CARD", "type": "INSTALLMENT", "installments_number": 12 },
      "price": { "value": 297.00, "currency_code": "BRL" },
      "producer": { "name": "Yuri Branco" },
      "commissions": [ { "user": { "name": "Yuri Branco" }, "value": 267.30, "currency_code": "BRL" } ]
    },
    {
      "transaction": "HP1234567891",
      "approved_date": 1779216000000,
      "status": "APPROVED",
      "product": { "id": 1001, "name": "A Minha Casa" },
      "buyer": { "name": "Maria Santos", "email": "maria@example.com" },
      "payment": { "method": "PIX" },
      "price": { "value": 297.00, "currency_code": "BRL" },
      "producer": { "name": "Yuri Branco" },
      "commissions": [ { "user": { "name": "Yuri Branco" }, "value": 267.30, "currency_code": "BRL" } ]
    },
    {
      "transaction": "HP1234567892",
      "approved_date": 1779129600000,
      "status": "REFUSED",
      "product": { "id": 1001, "name": "A Minha Casa" },
      "buyer": { "name": "Pedro Lima", "email": "pedro@example.com" },
      "payment": { "method": "CREDIT_CARD" },
      "price": { "value": 297.00, "currency_code": "BRL" },
      "producer": { "name": "Yuri Branco" },
      "commissions": []
    },
    {
      "transaction": "HP1234567893",
      "approved_date": 1778697600000,
      "status": "APPROVED",
      "product": { "id": 1002, "name": "Outro Produto" },
      "buyer": { "name": "Ana Costa", "email": "ana@example.com" },
      "payment": { "method": "BILLET" },
      "price": { "value": 197.00, "currency_code": "BRL" },
      "producer": { "name": "Yuri Branco" },
      "commissions": [ { "user": { "name": "Yuri Branco" }, "value": 177.30, "currency_code": "BRL" } ]
    },
    {
      "transaction": "HP1234567894",
      "approved_date": 1778611200000,
      "status": "REFUNDED",
      "product": { "id": 1001, "name": "A Minha Casa" },
      "buyer": { "name": "Carlos Souza", "email": "carlos@example.com" },
      "payment": { "method": "CREDIT_CARD" },
      "price": { "value": 297.00, "currency_code": "BRL" },
      "producer": { "name": "Yuri Branco" },
      "commissions": [ { "user": { "name": "Yuri Branco" }, "value": -267.30, "currency_code": "BRL" } ]
    }
  ]
}
```

> Nota: substituir por `hotmart-demo.json` oficial do canal quando o Yuri receber. Estrutura é a mesma.

- [ ] **Step 2: Criar `lib/demo-source.js` que carrega o JSON**

Arquivo `lib/demo-source.js`:

```javascript
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEMO_PATH = path.resolve(__dirname, '..', 'hotmart-demo.json');

export function loadDemoTransactions() {
  if (!fs.existsSync(DEMO_PATH)) {
    throw new Error(`hotmart-demo.json não encontrado em ${DEMO_PATH}. Baixe do canal Magnus.`);
  }
  const raw = fs.readFileSync(DEMO_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  return parsed.items || [];
}
```

- [ ] **Step 3: Smoke check via Node REPL**

```bash
node --input-type=module -e "import('./lib/demo-source.js').then(m => console.log('loaded', m.loadDemoTransactions().length, 'items'))"
```

Expected output: `loaded 5 items`

- [ ] **Step 4: Commit**

```bash
git add hotmart-demo.json lib/demo-source.js
git commit -m "feat: demo data source with 5 synthetic sales"
```

---

### Task 3: Hotmart auth helper

**Files:**
- Create: `~/Documents/Magnus/hotmart-dashboard/lib/hotmart-auth.js`

Helper que troca `BASIC_TOKEN` por `access_token` via `POST /security/oauth/token`. Cache em memória usando TTL retornado pela própria Hotmart.

- [ ] **Step 1: Criar `lib/hotmart-auth.js`**

Arquivo `lib/hotmart-auth.js`:

```javascript
const TOKEN_URL = 'https://api-sec-vlc.hotmart.com/security/oauth/token?grant_type=client_credentials';

let cache = { value: null, expiresAt: 0 };

export async function getAccessToken({ basicToken }) {
  const now = Date.now();
  if (cache.value && cache.expiresAt > now + 60_000) {
    return cache.value;
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: basicToken }
  });

  if (!res.ok) {
    throw new Error(`Hotmart auth falhou: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  cache = {
    value: data.access_token,
    expiresAt: now + (data.expires_in * 1000)
  };
  return cache.value;
}

export function _resetCache() {
  cache = { value: null, expiresAt: 0 };
}
```

- [ ] **Step 2: Smoke check** (só roda se Yuri já tem `.env` válido — se não, pula)

```bash
# Se .env tem HOTMART_BASIC_TOKEN preenchido:
node --input-type=module -e "
import 'dotenv/config';
import { getAccessToken } from './lib/hotmart-auth.js';
getAccessToken({ basicToken: process.env.HOTMART_BASIC_TOKEN })
  .then(t => console.log('token:', t.slice(0, 20) + '...'))
  .catch(e => console.error('FAIL:', e.message));
"
```

Expected (se credenciais válidas): `token: eyJhbGciOi...` (20 chars do JWT)
Expected (se sem credenciais ainda): pular este step, segue commit do código.

- [ ] **Step 3: Commit**

```bash
git add lib/hotmart-auth.js
git commit -m "feat: hotmart oauth token helper with in-memory cache"
```

---

### Task 4: Hotmart sales fetch

**Files:**
- Create: `~/Documents/Magnus/hotmart-dashboard/lib/hotmart-sales.js`

Função que chama `GET /payments/api/v1/sales/history` cobrindo os últimos 30 dias.

- [ ] **Step 1: Criar `lib/hotmart-sales.js`**

Arquivo `lib/hotmart-sales.js`:

```javascript
const API_BASE = 'https://developers.hotmart.com/payments/api/v1';

export async function fetchSalesHistory({ accessToken, daysBack = 30, maxResults = 200 }) {
  const endDate = Date.now();
  const startDate = endDate - (daysBack * 24 * 60 * 60 * 1000);

  const url = new URL(`${API_BASE}/sales/history`);
  url.searchParams.set('start_date', String(startDate));
  url.searchParams.set('end_date', String(endDate));
  url.searchParams.set('max_results', String(maxResults));

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    throw new Error(`Hotmart sales falhou: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return data.items || [];
}
```

- [ ] **Step 2: Smoke check** (só roda se Yuri já tem `.env` válido)

```bash
node --input-type=module -e "
import 'dotenv/config';
import { getAccessToken } from './lib/hotmart-auth.js';
import { fetchSalesHistory } from './lib/hotmart-sales.js';
const t = await getAccessToken({ basicToken: process.env.HOTMART_BASIC_TOKEN });
const items = await fetchSalesHistory({ accessToken: t });
console.log('vendas últimos 30d:', items.length);
console.log('primeira:', JSON.stringify(items[0], null, 2).slice(0, 300));
"
```

Expected: `vendas últimos 30d: N` (qualquer número ≥ 0) + JSON da primeira venda.

- [ ] **Step 3: Commit**

```bash
git add lib/hotmart-sales.js
git commit -m "feat: hotmart sales history fetcher (30-day window)"
```

---

### Task 5: Processing layer (TDD)

**Files:**
- Create: `~/Documents/Magnus/hotmart-dashboard/lib/process.js`
- Test: `~/Documents/Magnus/hotmart-dashboard/lib/process.test.js`

Funções puras que transformam o array bruto de transações da Hotmart em KPIs / agregados / lista. **Aqui usamos TDD com `node:test`** porque é onde bugs se escondem (lógica de datas, filtros de status, soma de comissão).

Funções a implementar:

1. `mapStatus(code)` → string PT-BR padronizada
2. `filterApproved(items)` → só transações `APPROVED`
3. `sumCommission(items)` → soma das comissões do producer
4. `aggregateKPIs(items, now)` → `{ today, last7, last30, ticketAvg }`
5. `aggregateByDay(items, daysBack, now)` → array de `{ date, total, count }`
6. `aggregateByMethod(items)` → array de `{ method, count }`
7. `lastTransactions(items, n)` → array com `{ date, buyerName, value, statusLabel, method }`
8. `filterByProduct(items, productId)` → filtra por `product.id` (se productId null, retorna tudo)

- [ ] **Step 1: Escrever os testes que falham**

Arquivo `lib/process.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mapStatus,
  filterApproved,
  sumCommission,
  aggregateKPIs,
  aggregateByDay,
  aggregateByMethod,
  lastTransactions,
  filterByProduct
} from './process.js';

// Fixture: 4 transações com timestamps relativos a NOW
const NOW = new Date('2026-05-21T15:00:00-03:00').getTime();
const HOURS = 60 * 60 * 1000;
const DAYS = 24 * HOURS;

const fixture = [
  // hoje, aprovada, A Minha Casa, cartão, comissão 267.30
  { transaction: 'A', approved_date: NOW - 2 * HOURS, status: 'APPROVED',
    product: { id: 1001, name: 'A Minha Casa' },
    buyer: { name: 'João Silva' },
    payment: { method: 'CREDIT_CARD' },
    price: { value: 297, currency_code: 'BRL' },
    commissions: [{ user: { name: 'Yuri Branco' }, value: 267.30 }] },
  // 3 dias atrás, aprovada, A Minha Casa, pix, comissão 267.30
  { transaction: 'B', approved_date: NOW - 3 * DAYS, status: 'APPROVED',
    product: { id: 1001, name: 'A Minha Casa' },
    buyer: { name: 'Maria Santos' },
    payment: { method: 'PIX' },
    price: { value: 297, currency_code: 'BRL' },
    commissions: [{ user: { name: 'Yuri Branco' }, value: 267.30 }] },
  // 10 dias atrás, recusada, A Minha Casa, cartão, sem comissão
  { transaction: 'C', approved_date: NOW - 10 * DAYS, status: 'REFUSED',
    product: { id: 1001, name: 'A Minha Casa' },
    buyer: { name: 'Pedro Lima' },
    payment: { method: 'CREDIT_CARD' },
    price: { value: 297, currency_code: 'BRL' },
    commissions: [] },
  // 20 dias atrás, aprovada, OUTRO produto, boleto, comissão 177.30
  { transaction: 'D', approved_date: NOW - 20 * DAYS, status: 'APPROVED',
    product: { id: 1002, name: 'Outro' },
    buyer: { name: 'Ana Costa' },
    payment: { method: 'BILLET' },
    price: { value: 197, currency_code: 'BRL' },
    commissions: [{ user: { name: 'Yuri Branco' }, value: 177.30 }] },
];

test('mapStatus: APPROVED → "✅ aprovada"', () => {
  assert.equal(mapStatus('APPROVED'), '✅ aprovada');
});

test('mapStatus: PRE_ORDER → "⏳ análise"', () => {
  assert.equal(mapStatus('PRE_ORDER'), '⏳ análise');
});

test('mapStatus: STARTED → "⏳ análise"', () => {
  assert.equal(mapStatus('STARTED'), '⏳ análise');
});

test('mapStatus: REFUNDED → "💸 reembolso"', () => {
  assert.equal(mapStatus('REFUNDED'), '💸 reembolso');
});

test('mapStatus: CHARGEBACK → "⚠️ chargeback"', () => {
  assert.equal(mapStatus('CHARGEBACK'), '⚠️ chargeback');
});

test('mapStatus: REFUSED → "❌ recusada"', () => {
  assert.equal(mapStatus('REFUSED'), '❌ recusada');
});

test('mapStatus: CANCELED → "❌ recusada"', () => {
  assert.equal(mapStatus('CANCELED'), '❌ recusada');
});

test('mapStatus: código desconhecido → o próprio código', () => {
  assert.equal(mapStatus('FOO'), 'FOO');
});

test('filterApproved: retorna só APPROVED', () => {
  const out = filterApproved(fixture);
  assert.equal(out.length, 3);
  assert.deepEqual(out.map(i => i.transaction), ['A', 'B', 'D']);
});

test('sumCommission: soma comissões do array', () => {
  const out = sumCommission([fixture[0], fixture[1], fixture[3]]);
  assert.equal(out, 267.30 + 267.30 + 177.30);
});

test('sumCommission: array vazio → 0', () => {
  assert.equal(sumCommission([]), 0);
});

test('aggregateKPIs: hoje conta só hoje (BRT)', () => {
  const out = aggregateKPIs(fixture, NOW);
  assert.equal(out.today.count, 1);
  assert.equal(out.today.total, 267.30);
});

test('aggregateKPIs: 7d conta hoje + 3d atrás (descarta recusadas)', () => {
  const out = aggregateKPIs(fixture, NOW);
  assert.equal(out.last7.count, 2);
  assert.equal(out.last7.total, 267.30 + 267.30);
});

test('aggregateKPIs: 30d conta as 3 aprovadas', () => {
  const out = aggregateKPIs(fixture, NOW);
  assert.equal(out.last30.count, 3);
  assert.equal(out.last30.total, 267.30 + 267.30 + 177.30);
});

test('aggregateKPIs: ticket médio 30d = total / count', () => {
  const out = aggregateKPIs(fixture, NOW);
  assert.equal(out.ticketAvg, (267.30 + 267.30 + 177.30) / 3);
});

test('aggregateKPIs: ticket médio = 0 quando count = 0', () => {
  const out = aggregateKPIs([], NOW);
  assert.equal(out.ticketAvg, 0);
});

test('aggregateByDay: retorna 30 dias, cada um com date/total/count', () => {
  const out = aggregateByDay(fixture, 30, NOW);
  assert.equal(out.length, 30);
  assert.ok(out.every(d => 'date' in d && 'total' in d && 'count' in d));
});

test('aggregateByDay: dia "hoje" tem count=1, total=267.30', () => {
  const out = aggregateByDay(fixture, 30, NOW);
  const today = out[out.length - 1];
  assert.equal(today.count, 1);
  assert.equal(today.total, 267.30);
});

test('aggregateByMethod: agrupa por método', () => {
  const out = aggregateByMethod(filterApproved(fixture));
  const map = Object.fromEntries(out.map(x => [x.method, x.count]));
  assert.equal(map.CREDIT_CARD, 1);
  assert.equal(map.PIX, 1);
  assert.equal(map.BILLET, 1);
});

test('lastTransactions: retorna N mais recentes, descendente', () => {
  const out = lastTransactions(fixture, 3);
  assert.equal(out.length, 3);
  assert.deepEqual(out.map(t => t.buyerName), ['João Silva', 'Maria Santos', 'Pedro Lima']);
});

test('lastTransactions: shape de cada linha', () => {
  const out = lastTransactions(fixture, 1);
  const row = out[0];
  assert.ok('date' in row && 'buyerName' in row && 'value' in row && 'statusLabel' in row && 'method' in row);
  assert.equal(row.statusLabel, '✅ aprovada');
});

test('filterByProduct: filtra por id', () => {
  const out = filterByProduct(fixture, 1001);
  assert.equal(out.length, 3);
});

test('filterByProduct: id null/undefined → retorna tudo', () => {
  assert.equal(filterByProduct(fixture, null).length, fixture.length);
  assert.equal(filterByProduct(fixture, undefined).length, fixture.length);
});
```

- [ ] **Step 2: Rodar testes — devem falhar**

```bash
npm test
```

Expected: erro `Cannot find module './process.js'` ou todos os testes falham.

- [ ] **Step 3: Implementar `lib/process.js`**

Arquivo `lib/process.js`:

```javascript
const STATUS_MAP = {
  APPROVED: '✅ aprovada',
  PRE_ORDER: '⏳ análise',
  STARTED: '⏳ análise',
  REFUNDED: '💸 reembolso',
  CHARGEBACK: '⚠️ chargeback',
  REFUSED: '❌ recusada',
  CANCELED: '❌ recusada'
};

export function mapStatus(code) {
  return STATUS_MAP[code] || code;
}

export function filterApproved(items) {
  return items.filter(i => i.status === 'APPROVED');
}

export function sumCommission(items) {
  return items.reduce((acc, i) => {
    const c = (i.commissions || []).reduce((s, x) => s + (x.value || 0), 0);
    return acc + c;
  }, 0);
}

const DAY_MS = 24 * 60 * 60 * 1000;

function isWithinDays(item, daysBack, now) {
  return item.approved_date >= now - daysBack * DAY_MS && item.approved_date <= now;
}

function isSameDayBRT(ts, now) {
  // BRT (UTC-3) — compara YYYY-MM-DD no fuso de São Paulo
  const tsBRT = new Date(ts).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const nowBRT = new Date(now).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  return tsBRT === nowBRT;
}

export function aggregateKPIs(items, now) {
  const approved = filterApproved(items);
  const todayItems = approved.filter(i => isSameDayBRT(i.approved_date, now));
  const last7 = approved.filter(i => isWithinDays(i, 7, now));
  const last30 = approved.filter(i => isWithinDays(i, 30, now));
  const total30 = sumCommission(last30);
  return {
    today: { count: todayItems.length, total: sumCommission(todayItems) },
    last7: { count: last7.length, total: sumCommission(last7) },
    last30: { count: last30.length, total: total30 },
    ticketAvg: last30.length > 0 ? total30 / last30.length : 0
  };
}

export function aggregateByDay(items, daysBack, now) {
  const approved = filterApproved(items);
  const buckets = new Map();
  for (let i = daysBack - 1; i >= 0; i--) {
    const ts = now - i * DAY_MS;
    const key = new Date(ts).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    buckets.set(key, { date: key, total: 0, count: 0 });
  }
  for (const item of approved) {
    const key = new Date(item.approved_date).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.total += (item.commissions || []).reduce((s, x) => s + (x.value || 0), 0);
      bucket.count += 1;
    }
  }
  return Array.from(buckets.values());
}

export function aggregateByMethod(items) {
  const counts = new Map();
  for (const item of items) {
    const method = item.payment?.method || 'UNKNOWN';
    counts.set(method, (counts.get(method) || 0) + 1);
  }
  return Array.from(counts.entries()).map(([method, count]) => ({ method, count }));
}

export function lastTransactions(items, n) {
  return [...items]
    .sort((a, b) => b.approved_date - a.approved_date)
    .slice(0, n)
    .map(i => ({
      date: i.approved_date,
      buyerName: i.buyer?.name || '—',
      value: i.price?.value || 0,
      statusLabel: mapStatus(i.status),
      method: i.payment?.method || '—'
    }));
}

export function filterByProduct(items, productId) {
  if (productId == null) return items;
  return items.filter(i => i.product?.id === productId);
}
```

- [ ] **Step 4: Rodar testes — devem passar**

```bash
npm test
```

Expected: `✔ tests N pass, 0 fail`

- [ ] **Step 5: Commit**

```bash
git add lib/process.js lib/process.test.js
git commit -m "feat: processing layer with TDD (kpis, charts, table aggregates)"
```

---

### Task 6: Express server + `/api/sales` endpoint

**Files:**
- Create: `~/Documents/Magnus/hotmart-dashboard/server.js`

Server amarra tudo: decide entre demo e API real, processa, devolve JSON consolidado, serve `public/`.

- [ ] **Step 1: Criar `server.js`**

Arquivo `server.js`:

```javascript
import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDemoTransactions } from './lib/demo-source.js';
import { getAccessToken } from './lib/hotmart-auth.js';
import { fetchSalesHistory } from './lib/hotmart-sales.js';
import {
  aggregateKPIs,
  aggregateByDay,
  aggregateByMethod,
  lastTransactions,
  filterByProduct
} from './lib/process.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const DEMO_MODE = !process.env.HOTMART_BASIC_TOKEN;

if (DEMO_MODE) {
  console.log('⚠️  Modo demo — usando hotmart-demo.json (sem HOTMART_BASIC_TOKEN no .env)');
} else {
  console.log('🔌 Modo Hotmart real — usando credenciais do .env');
}

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/sales', async (req, res) => {
  try {
    const productId = req.query.product ? Number(req.query.product) : null;

    let items;
    if (DEMO_MODE) {
      items = loadDemoTransactions();
    } else {
      const token = await getAccessToken({ basicToken: process.env.HOTMART_BASIC_TOKEN });
      items = await fetchSalesHistory({ accessToken: token, daysBack: 30 });
    }

    const filtered = filterByProduct(items, productId);
    const now = Date.now();

    const products = Array.from(
      new Map(items.map(i => [i.product?.id, i.product?.name])).entries()
    ).filter(([id]) => id != null).map(([id, name]) => ({ id, name }));

    res.json({
      mode: DEMO_MODE ? 'demo' : 'live',
      generatedAt: now,
      products,
      kpis: aggregateKPIs(filtered, now),
      byDay: aggregateByDay(filtered, 30, now),
      byMethod: aggregateByMethod(filtered.filter(i => i.status === 'APPROVED')),
      latest: lastTransactions(filtered, 10)
    });
  } catch (err) {
    console.error('[/api/sales]', err);
    const status = err.message.includes(' 401 ') ? 401
                  : err.message.includes(' 429 ') ? 429
                  : 500;
    res.status(status).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`📊 Dashboard rodando em http://localhost:${PORT}`);
});
```

- [ ] **Step 2: Smoke check — modo demo**

Garanta que `.env` NÃO tem `HOTMART_BASIC_TOKEN`. Em um terminal:

```bash
npm start
```

Em outro terminal:

```bash
curl -s http://localhost:3000/api/sales | head -c 500
```

Expected: JSON começando com `{"mode":"demo","generatedAt":...,"products":[{"id":1001,"name":"A Minha Casa"},...`. Console do server mostra `⚠️  Modo demo`.

Mate o server (Ctrl+C).

- [ ] **Step 3: Smoke check — filtro por produto**

```bash
npm start &
sleep 1
curl -s 'http://localhost:3000/api/sales?product=1001' | python3 -c "import sys,json; d=json.load(sys.stdin); print('mode:',d['mode'],'latest count:',len(d['latest']))"
kill %1
```

Expected: `mode: demo latest count: 4` (Outro produto fora).

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "feat: express server with /api/sales endpoint (demo + live)"
```

---

### Task 7: Frontend (HTML + JS + Chart.js)

**Files:**
- Create: `~/Documents/Magnus/hotmart-dashboard/public/index.html`
- Create: `~/Documents/Magnus/hotmart-dashboard/public/app.js`
- Create: `~/Documents/Magnus/hotmart-dashboard/public/styles.css`

- [ ] **Step 1: Criar `public/index.html`**

Arquivo `public/index.html`:

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hotmart Dashboard</title>
  <link rel="stylesheet" href="/styles.css">
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
</head>
<body>
  <header>
    <h1>Hotmart Dashboard</h1>
    <div class="controls">
      <select id="product-selector"></select>
      <span id="updated-at" class="muted">carregando…</span>
      <button id="refresh-btn">↻ atualizar</button>
    </div>
    <div id="mode-badge"></div>
  </header>

  <div id="error-banner" class="hidden"></div>

  <section class="kpis">
    <div class="kpi"><div class="label">Hoje</div><div class="value" id="kpi-today">—</div><div class="sub" id="kpi-today-count">—</div></div>
    <div class="kpi"><div class="label">7 dias</div><div class="value" id="kpi-7d">—</div><div class="sub" id="kpi-7d-count">—</div></div>
    <div class="kpi"><div class="label">30 dias</div><div class="value" id="kpi-30d">—</div><div class="sub" id="kpi-30d-count">—</div></div>
    <div class="kpi"><div class="label">Ticket médio 30d</div><div class="value" id="kpi-ticket">—</div><div class="sub">—</div></div>
  </section>

  <section class="charts">
    <div class="chart-box"><div class="label">Vendas por dia — 30d</div><canvas id="chart-by-day"></canvas></div>
    <div class="chart-box"><div class="label">Método de pagamento</div><canvas id="chart-by-method"></canvas></div>
  </section>

  <section class="table-wrap">
    <div class="label">Últimas 10 vendas</div>
    <table id="latest-table">
      <thead><tr><th>Data</th><th>Comprador</th><th>Valor</th><th>Status</th><th>Método</th></tr></thead>
      <tbody></tbody>
    </table>
  </section>

  <script src="/app.js" type="module"></script>
</body>
</html>
```

- [ ] **Step 2: Criar `public/styles.css`**

Arquivo `public/styles.css`:

```css
* { box-sizing: border-box; }
body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
       background: #0f0f10; color: #e6e6e6; padding: 24px; }
header { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; margin-bottom: 24px; }
header h1 { margin: 0; font-size: 22px; font-weight: 600; }
.controls { display: flex; gap: 12px; align-items: center; margin-left: auto; }
select, button { background: #1a1a1c; color: #e6e6e6; border: 1px solid #2a2a2c;
                 padding: 6px 12px; border-radius: 6px; font-size: 14px; cursor: pointer; }
.muted { color: #888; font-size: 13px; }
#mode-badge { font-size: 12px; padding: 4px 8px; border-radius: 4px; background: #2a2a2c; }
#mode-badge.demo { background: #4a3a00; color: #ffd966; }
#mode-badge.live { background: #003a1a; color: #66d99a; }
#error-banner { background: #4a1a1a; color: #ff9999; padding: 12px 16px; border-radius: 6px; margin-bottom: 16px; }
.hidden { display: none; }
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
.kpi { background: #1a1a1c; padding: 16px; border-radius: 8px; }
.label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #888; margin-bottom: 6px; }
.kpi .value { font-size: 26px; font-weight: 600; }
.kpi .sub { font-size: 13px; color: #888; margin-top: 4px; }
.charts { display: grid; grid-template-columns: 2fr 1fr; gap: 12px; margin-bottom: 20px; }
.chart-box { background: #1a1a1c; padding: 16px; border-radius: 8px; min-height: 240px; }
.chart-box canvas { width: 100% !important; max-height: 220px; }
.table-wrap { background: #1a1a1c; padding: 16px; border-radius: 8px; }
table { width: 100%; border-collapse: collapse; margin-top: 8px; }
th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #2a2a2c; font-size: 13px; }
th { color: #888; font-weight: 500; text-transform: uppercase; font-size: 11px; }
```

- [ ] **Step 3: Criar `public/app.js`**

Arquivo `public/app.js`:

```javascript
const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dateFmt = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  timeZone: 'America/Sao_Paulo'
});

const METHOD_LABEL = {
  CREDIT_CARD: 'Cartão',
  PIX: 'Pix',
  BILLET: 'Boleto',
  HYBRID: 'Híbrido',
  PAYPAL: 'PayPal',
  UNKNOWN: 'Outro'
};

let chartByDay = null;
let chartByMethod = null;
let currentProductId = null;

async function loadData() {
  const url = currentProductId ? `/api/sales?product=${currentProductId}` : '/api/sales';
  showError(null);
  try {
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      if (res.status === 401) showError('Token Hotmart inválido. Confere o .env.');
      else if (res.status === 429) showError('Hotmart pediu pra esperar — tenta de novo em alguns segundos.');
      else showError(`Erro ${res.status}: ${body.error || 'desconhecido'}`);
      return;
    }
    const data = await res.json();
    render(data);
  } catch (err) {
    showError(`Hotmart fora do ar — ${err.message}`);
  }
}

function showError(msg) {
  const el = document.getElementById('error-banner');
  if (!msg) { el.classList.add('hidden'); return; }
  el.textContent = msg;
  el.classList.remove('hidden');
}

function render(data) {
  // mode badge
  const badge = document.getElementById('mode-badge');
  badge.textContent = data.mode === 'demo' ? 'MODO DEMO' : 'LIVE';
  badge.className = data.mode;

  // updated at
  document.getElementById('updated-at').textContent =
    'atualizado ' + dateFmt.format(new Date(data.generatedAt));

  // product selector
  populateProducts(data.products);

  // KPIs
  document.getElementById('kpi-today').textContent = fmt.format(data.kpis.today.total);
  document.getElementById('kpi-today-count').textContent = `${data.kpis.today.count} vendas`;
  document.getElementById('kpi-7d').textContent = fmt.format(data.kpis.last7.total);
  document.getElementById('kpi-7d-count').textContent = `${data.kpis.last7.count} vendas`;
  document.getElementById('kpi-30d').textContent = fmt.format(data.kpis.last30.total);
  document.getElementById('kpi-30d-count').textContent = `${data.kpis.last30.count} vendas`;
  document.getElementById('kpi-ticket').textContent = fmt.format(data.kpis.ticketAvg);

  // charts
  renderByDay(data.byDay);
  renderByMethod(data.byMethod);

  // table
  renderTable(data.latest);
}

function populateProducts(products) {
  const sel = document.getElementById('product-selector');
  if (sel.options.length === products.length + 1) return; // já populado
  sel.innerHTML = '<option value="">Todos os produtos</option>';
  // A Minha Casa primeiro (default)
  const sorted = [...products].sort((a, b) => {
    if (a.name === 'A Minha Casa') return -1;
    if (b.name === 'A Minha Casa') return 1;
    return a.name.localeCompare(b.name);
  });
  for (const p of sorted) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    sel.appendChild(opt);
  }
  // selecionar A Minha Casa por default se existir
  const minhaCasaIdx = sorted.findIndex(p => p.name === 'A Minha Casa');
  if (minhaCasaIdx >= 0 && currentProductId === null) {
    currentProductId = sorted[minhaCasaIdx].id;
    sel.value = currentProductId;
    loadData(); // recarrega filtrado
  }
}

function renderByDay(byDay) {
  const ctx = document.getElementById('chart-by-day').getContext('2d');
  const cfg = {
    type: 'line',
    data: {
      labels: byDay.map(d => d.date.slice(5)),
      datasets: [{
        data: byDay.map(d => d.total),
        borderColor: '#66d99a', tension: 0.3, fill: false, pointRadius: 2
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { ticks: { color: '#888' } }, y: { ticks: { color: '#888' }, beginAtZero: true } }
    }
  };
  if (chartByDay) chartByDay.destroy();
  chartByDay = new Chart(ctx, cfg);
}

function renderByMethod(byMethod) {
  const ctx = document.getElementById('chart-by-method').getContext('2d');
  const cfg = {
    type: 'doughnut',
    data: {
      labels: byMethod.map(m => METHOD_LABEL[m.method] || m.method),
      datasets: [{
        data: byMethod.map(m => m.count),
        backgroundColor: ['#66d99a', '#6699ff', '#ffd966', '#ff9966', '#cc66ff']
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { color: '#e6e6e6' } } }
    }
  };
  if (chartByMethod) chartByMethod.destroy();
  chartByMethod = new Chart(ctx, cfg);
}

function renderTable(latest) {
  const tbody = document.querySelector('#latest-table tbody');
  tbody.innerHTML = '';
  for (const row of latest) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${dateFmt.format(new Date(row.date))}</td>
      <td>${row.buyerName}</td>
      <td>${fmt.format(row.value)}</td>
      <td>${row.statusLabel}</td>
      <td>${METHOD_LABEL[row.method] || row.method}</td>
    `;
    tbody.appendChild(tr);
  }
}

// wiring
document.getElementById('refresh-btn').addEventListener('click', loadData);
document.getElementById('product-selector').addEventListener('change', (e) => {
  currentProductId = e.target.value ? Number(e.target.value) : null;
  loadData();
});

loadData();
```

- [ ] **Step 4: Smoke check no browser**

```bash
npm start
```

Abre http://localhost:3000 no browser. Espera ver:
- Badge "MODO DEMO" amarelo
- 4 KPIs preenchidos
- Line chart com 30 dias
- Donut com 3 fatias (Cartão / Pix / Boleto)
- Tabela com até 10 vendas
- Dropdown com "Todos os produtos" + "A Minha Casa" + "Outro"
- Botão "↻ atualizar" funciona
- Trocar produto no dropdown filtra a tabela

Mate o server (Ctrl+C).

- [ ] **Step 5: Commit**

```bash
git add public/
git commit -m "feat: frontend dashboard (html + chart.js + product filter)"
```

---

### Task 8: README polish + smoke checks finais

**Files:**
- Modify: `~/Documents/Magnus/hotmart-dashboard/README.md`

- [ ] **Step 1: Sobrescrever `README.md` com versão completa**

Arquivo `README.md`:

````markdown
# Hotmart Dashboard

Dashboard local de vendas Hotmart. Pattern reusável: **API → fetch → process → render local**.

Substitui a navegação chata do painel oficial. 1 página, 4 KPIs, 2 charts, lista das últimas 10 vendas. Sem DB, sem build, sem framework no frontend.

## Setup

```bash
npm install
cp .env.example .env
# preencha as 3 credenciais Hotmart no .env
npm start
```

Abre em http://localhost:3000.

## Credenciais Hotmart

Painel Hotmart → Ferramentas do Desenvolvedor → Credenciais → Nova → escopo **Sales: Read**.
Cola os 3 valores no `.env`:

```
HOTMART_CLIENT_ID=...
HOTMART_CLIENT_SECRET=...
HOTMART_BASIC_TOKEN=Basic <token-base64>
```

## Modo demo (sem credenciais)

Se `.env` não tem `HOTMART_BASIC_TOKEN`, o server lê `hotmart-demo.json` em vez da API. Console mostra:

```
⚠️  Modo demo — usando hotmart-demo.json
```

Útil pra testar o pattern antes de habilitar Developer Tools.

## Smoke checks (validação manual)

### 1. Modo demo sem credenciais

```bash
# garante .env sem HOTMART_BASIC_TOKEN
npm start
# em outro terminal
curl -s http://localhost:3000/api/sales | head -c 200
```

Esperado: JSON com `"mode":"demo"`. Browser em localhost:3000 mostra badge amarela "MODO DEMO".

### 2. Modo live com credenciais válidas

Preenche `.env` com as 3 chaves. `npm start`. Browser mostra badge verde "LIVE", números reais da Hotmart.

### 3. Modo live com token inválido

Coloca `HOTMART_BASIC_TOKEN=lixo` no `.env`. `npm start`. Browser mostra banner vermelho: "Token Hotmart inválido. Confere o .env."

## Testes

```bash
npm test
```

Roda os testes unitários da camada de processamento (`lib/process.js`). 22 testes cobrindo KPIs, agregação por dia, agregação por método, mapping de status, etc.

## Arquivos

```
.
├── server.js              # express + endpoint /api/sales
├── lib/
│   ├── demo-source.js     # carrega hotmart-demo.json
│   ├── hotmart-auth.js    # oauth token + cache
│   ├── hotmart-sales.js   # GET /sales/history
│   ├── process.js         # KPIs + agregados (puro)
│   └── process.test.js    # testes unitários
├── public/
│   ├── index.html
│   ├── styles.css
│   └── app.js             # fetch + render + charts
└── hotmart-demo.json      # 5 vendas sintéticas (substituir pelo arquivo do canal)
```

## Roadmap (não-feito por YAGNI — adicionar se virar dor)

- Histórico em SQLite (trends mês-a-mês)
- Top afiliados
- Filtros de período custom (date range picker)
- Polling automático
````

- [ ] **Step 2: Rodar os 3 smoke checks descritos no README**

Smoke 1 (demo):
```bash
cd ~/Documents/Magnus/hotmart-dashboard
npm start &
sleep 1
curl -s http://localhost:3000/api/sales | python3 -c "import sys,json; print('mode:', json.load(sys.stdin)['mode'])"
kill %1
```
Expected: `mode: demo`.

Smoke 2 (live): só executar se Yuri tem credenciais válidas. Senão, anotar como pendente.

Smoke 3 (token inválido):
```bash
HOTMART_BASIC_TOKEN=lixo npm start &
sleep 1
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/sales
kill %1
```
Expected: `401` (server retorna 401 quando auth falha).

- [ ] **Step 3: Commit final + tag**

```bash
git add README.md
git commit -m "docs: README com setup + smoke checks + roadmap"
git tag v0.1.0
```

---

## Self-review (executado pelo author do plano)

**Spec coverage check:**
- ✅ Escopo "todos produtos + A Minha Casa default" → Task 6 popula `products[]`, Task 7 sorta A Minha Casa primeiro e seleciona por default.
- ✅ Frescor "puxa fresco a cada abertura" → Task 6 não cacheia resposta, só o access_token.
- ✅ Stack Node+Express+vanilla → Tasks 1, 6, 7.
- ✅ 4 KPIs + line chart + donut + tabela 10 → Task 5 (lógica) + Task 7 (render).
- ✅ Definições: vendas = comissão líquida, count só APPROVED, mapping de status, BRT → Task 5 todas as funções respeitam.
- ✅ 5 arquivos do server-side + 3 do frontend → Tasks 1-7 cobrem.
- ✅ Modo demo via `hotmart-demo.json` + log de aviso → Task 6 implementa.
- ✅ Error handling 401/429/timeout + banner → Tasks 6 (status code) + 7 (banner).
- ✅ Smoke checks documentados → Task 8.
- ✅ `.env.local` pattern do CLAUDE.md global → Task 1 cria `.env` na raiz do projeto, comentado com origem.

**Placeholder scan:** sem TBD, TODO, "implement later", nem "add error handling" abstrato. Cada step tem código exato. ✅

**Type consistency:**
- `aggregateKPIs` retorna `{ today, last7, last30, ticketAvg }` (Task 5) — Task 7 lê `data.kpis.today.total`, `kpis.today.count`, etc. ✅
- `aggregateByDay` retorna `[{ date, total, count }]` — Task 7 lê `d.date` e `d.total`. ✅
- `aggregateByMethod` retorna `[{ method, count }]` — Task 7 lê `m.method` e `m.count`. ✅
- `lastTransactions` retorna `[{ date, buyerName, value, statusLabel, method }]` — Task 7 lê todos. ✅
- `filterByProduct(items, productId)` — Task 6 chama com `productId` numérico. ✅
- `getAccessToken({ basicToken })` — Task 6 passa `{ basicToken: process.env.HOTMART_BASIC_TOKEN }`. ✅
- `fetchSalesHistory({ accessToken, daysBack })` — Task 6 chama com `{ accessToken: token, daysBack: 30 }`. ✅

Plano consistente. Pronto pra execução.
