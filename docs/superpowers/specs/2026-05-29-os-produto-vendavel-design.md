---
type: design-spec
project: magnus-os
produto: Magnus OS
date: 2026-05-29
status: aprovado (design + decisões fechadas com Yuri)
topic: Produtização do Magnus OS — distribuição, licença, painel e funil
---

# Design — Magnus OS como produto vendável (tripwire → upsell Magnus)

> Decisão via `/deep-research` (relatório com fontes, 103 agentes) + `/superpowers:brainstorming` (5 forks) em 2026-05-29. ToS da Anthropic verificado ao vivo no mesmo dia. Nome escolhido: **Magnus OS** (via /ba + /cc).

## 0. Problema

O "Orquestrador Empresarial" (template + skills + painel + MCP, hoje em `magnus-imersao/painel-aula-4/`) virou um bom produto, mas:
- **ZIP manual** é inviável (sem update, sem escala).
- **GitHub público** entrega de graça.
- A premissa "**roda na assinatura Claude Code do cliente, custo de inferência zero**" é o que torna o negócio viável — não pode quebrar para as skills.

Objetivo: transformar em **Magnus OS**, um produto **low-ticket self-serve** (tripwire) vendido pela marca **Veritas**, front-end pra upsell da **mentoria Magnus**. Mentorados recebem bundled.

## 1. Restrição central verificada (ToS Anthropic — live 2026-05-29)

Citações verbatim do doc oficial do Agent SDK (`code.claude.com/docs/en/agent-sdk/overview`):
- **Metering:** *"Starting June 15, 2026, Agent SDK and `claude -p` usage on subscription plans will draw from a new monthly Agent SDK credit, separate from your interactive usage limits."*
- **Login de terceiro:** *"Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products... Please use the API key authentication methods described in this document instead."*
- **Branding:** *"Your product should maintain its own branding and not appear to be Claude Code or any Anthropic product."*

**Implicação:** uso **interativo** do Claude Code (skills que o cliente roda no próprio Claude Code) = limites normais da assinatura, fora do crédito SDK capado e fora da proibição de "third-party login". Já o **painel via Agent SDK na assinatura** seria o modo metered + restrito → por isso o painel roda em **BYO-API-key** (o caminho explicitamente abençoado: "use API key authentication"). Marca própria ("Magnus OS") satisfaz a regra de branding.

## 2. Decisões (forks fechados)

| # | Decisão | Escolha |
|---|---|---|
| 1 | Espinha de execução | **Skills-first interativo** (skills free na assinatura do cliente). |
| 2 | Painel no v1 | **SIM — painel GUI no v1, rodando em BYO-API-key** (API key do próprio cliente; ToS-limpo; uso leve = centavos). |
| 3 | Distribuição + update | **Instalador por license-key** (`npx`/`curl\|bash`), não marketplace-git. |
| 4 | Pagamento + licença | **Hotmart** (checkout BR: Pix/cartão, order-bump, upsell→Magnus) + **emissor nativo no Supabase**. |
| 5 | Gating runtime | **Phone-home leve fail-open** (hook SessionStart ~1x/dia, async) → telemetria de ativação + kill-switch. |
| 6 | Skill de copy | **`/cc` → `copy-magnus` (`/cm`)** = rebrand + bundle do copy-chief-black, **LICENSE/atribuição MIT do Luca Pimenta preservados**. |
| 7 | Nome | **Magnus OS**. |

## 3. Arquitetura

### 3.1 Duas superfícies de execução
- **Skills (núcleo):** rodam no **Claude Code interativo do cliente** — assinatura dele, custo zero, ToS-limpo. É o coração do produto.
- **Painel (GUI, v1):** Next.js + Agent SDK rodando em **BYO-API-key** do cliente. A GUI dispara as mesmas skills visualmente. Custo de API recai no cliente (leve). Aproveita 100% o hardening de 2026-05-28 (commit `dddbe32`: `settingSources:['project']`, `mcpServers` do `.mcp.json`, body injection, etc.) — só troca a auth de assinatura → `ANTHROPIC_API_KEY` do cliente.

### 3.2 Componentes
1. **Plugin Magnus OS** (marca própria) — `.claude-plugin/plugin.json` + `skills/*` (na raiz do plugin, namespaced `/magnus-os:*`, incl. `copy-magnus`) + `.mcp.json` (Notion/Canva) + `hooks/hooks.json` (telemetria SessionStart fail-open). Usado no Claude Code interativo. **CORREÇÃO (verificado nos docs oficiais 2026-05-29):** plugins NÃO materializam arquivos de projeto — o template `contexto/`+`operacao/`+`CLAUDE.md` é responsabilidade do **instalador** (Fase 4), não do plugin. O plugin só contribui capacidades globais (skills/hooks/MCP).
2. **Painel Magnus OS** (`magnus-painel` evoluído) — GUI local, BYO-API-key, em v1.
3. **Instalador** (`npx magnus-os` / `curl … | bash`) — pede license-key → valida no Supabase → instala o plugin em `~/.claude/plugins/magnus-os/` → configura o painel (pede a `ANTHROPIC_API_KEY` do cliente, guarda local) → grava `~/.claude/magnus-os/license.json`. Subcomando `update` re-valida + re-baixa.
4. **Emissor de licença (Supabase)** — Edge Functions:
   - `POST /webhook/hotmart` — recebe webhook de compra Hotmart (validar HOTTOK), gera key, grava em `licencas`, dispara entrega (página de obrigado + email).
   - `POST /license/validate` — `{ key, fingerprint? }` → `{ status: granted|revoked|expired, ... }`. Auth-free safe-pra-client (sem secret embutido). Registra `last_seen`/`uso_count` (telemetria).
   - Revogação manual = flip de status.
5. **Hook de telemetria** (`SessionStart`, no plugin) — async, **fail-open**: lê key local, chama `/license/validate` no máx ~1x/dia (cache TTL), **nunca bloqueia** o cliente offline/se o emissor cair. Atualiza ativação/uso.

### 3.3 Fluxo compra → uso
```
Compra na Hotmart (Pix/cartão)
  → webhook → Supabase emite key → entrega (página de obrigado + email)
  → cliente roda o instalador, cola a key → /license/validate
     → instala o plugin (skills) + configura o painel (API key do cliente)
  → usa as skills no Claude Code interativo (free) OU o painel (BYO-API-key)
  → hook SessionStart pinga ~1x/dia → Supabase registra ativação/uso
  → telemetria alimenta o upsell Veritas → mentoria Magnus
```

### 3.4 Tabela `licencas` (Supabase)
`id, key (unique), email, status (granted|revoked|expired), origem (hotmart|bundle-mentorado), criada_em, ativada_em, last_seen, uso_count, plano (tripwire|mentorado)`. RLS: escrita só via service role (Edge Functions); validate via função SECURITY DEFINER que só expõe status.

## 4. O loop de upsell (o ponto do negócio)
A telemetria de ativação é o ativo estratégico (não a anti-pirataria). Mesma tese do funil **CRM AMC** (`project_crm_amc_funnel_thesis`): quem **compra e usa** o low-ticket é o alvo mais quente da mentoria. Gatilhos: "ativou ≥N vezes", "usou skill X", "abriu o painel", "atualizou" → lista de upsell pro Magnus.

## 5. Anti-pirataria — postura
Fricção, não muralha (pesquisa: Denuvo cai no day-one; arquivo assinado offline não é à prova de adulteração; device-binding não impede transferência). Skills são markdown — sem runtime a proteger. **Aceitar vazamento; o moat é o upsell + os updates contínuos gateados** (quem não tem key válida não recebe updates nem entra no funil).

## 6. Mudanças no que já existe
- `teste-zerado` (template + skills) → **separado em dois**: as `skills/` viram o **plugin Magnus OS** (namespaced `/magnus-os:*`); o scaffold `contexto/`+`operacao/`+`CLAUDE.md` vira a fonte `template/` que o **instalador** materializa no cwd do cliente (plugins não criam arquivos de projeto).
- **`/cc` → `copy-magnus`:** stub leve no plugin (Schwartz inline + install on-demand) + **repo GitHub privado `copy-magnus`** (rebrand completo do copy-chief-black, MIT do Luca preservado) clonado por token. (Decisão Yuri 2026-05-29: bundle completo, no GitHub privado, on-demand.)
- `magnus-painel` (Agent SDK) → **evolui pra painel do v1**, auth trocada pra **BYO-API-key** (`ANTHROPIC_API_KEY` do cliente em vez de assinatura).
- **`/cc` → `/cm` (copy-magnus):** renomear skill, atualizar `criar-landing` + refs; bundlar com LICENSE/atribuição do Luca.
- **Propagar os 6 fixes de hardening de 2026-05-28** (commit `dddbe32`) pro template canônico antes de empacotar.
- **Novo:** instalador, Edge Functions Supabase (webhook Hotmart + validate), tabela `licencas`, hook de telemetria fail-open, página de obrigado, identidade visual "Magnus OS".

## 7. Escopo v1 (YAGNI)
**Dentro:** marca Magnus OS · plugin (skills + `copy-magnus` + MCP + template + hook telemetria) · **painel GUI (BYO-API-key)** · instalador por key (plugin + painel + license) · Hotmart + emissor Supabase (webhook+validate) · página de obrigado · propagação dos fixes.
**Fora (depois):** venda modular/à-la-carte, dashboard de telemetria bonito, auto-update nativo via marketplace, watermark por cliente, painel-na-assinatura (se a Anthropic aprovar um dia).

## 8. Riscos & itens abertos
- **ToS (mitigado):** skills = interativo (free, limpo); painel = BYO-API-key (caminho abençoado). Re-checar o doc da Anthropic perto de 15/06.
- **Onboarding do painel:** BYO-API-key exige o cliente criar key + billing no Console — fricção num tripwire. Instalador tem que tornar isso o mais suave possível (guia passo-a-passo, painel funciona sem key mas avisa).
- **Webhook Hotmart:** confirmar formato/assinatura (HOTTOK) na implementação.
- **MIT/atribuição (obrigatório):** preservar LICENSE + copyright do Luca Pimenta dentro do `copy-magnus`; recomendado alinhar com ele.
- **Reliability do instalador:** validar fluxo install/update num cliente limpo.

## 9. Critério de sucesso (v1)
Um comprador anônimo consegue, sozinho: comprar na Hotmart → receber a key → rodar o instalador → ter as skills funcionando no Claude Code dele (free) E o painel rodando com a API key dele → e o Yuri ver no Supabase quem ativou/usou (pra disparar o upsell). Zero ZIP, zero GitHub público, zero custo de API pro Yuri.
