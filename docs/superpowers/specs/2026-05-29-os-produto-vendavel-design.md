---
type: design-spec
project: magnus-os
date: 2026-05-29
status: draft (aguardando review do Yuri)
topic: Produtização do Orquestrador Empresarial — distribuição, licença e funil
---

# Design — OS como produto vendável (tripwire → upsell Magnus)

> Decisão tomada via `/deep-research` (relatório com fontes, 103 agentes) + `/superpowers:brainstorming` (4 decisões-fork) em 2026-05-29. ToS da Anthropic verificado ao vivo no mesmo dia.

## 0. Problema

O "Orquestrador Empresarial" (template + skills + MCP, hoje em `magnus-imersao/painel-aula-4/teste-zerado` e `magnus-painel`) virou um bom produto, mas:
- Distribuir por **ZIP manual** é inviável (sem update, sem escala).
- **GitHub público** entrega de graça pra qualquer um.
- A premissa "**roda na assinatura Claude Code do cliente, custo de inferência zero**" é o que torna o negócio viável — e não pode quebrar.

Objetivo: transformar o sistema num **produto low-ticket self-serve** (tripwire) vendido pela marca **Veritas**, como front-end pra upsell da **mentoria Magnus** (high-ticket). Mentorados recebem bundled.

## 1. Restrição central verificada (ToS Anthropic — live 2026-05-29)

Citações verbatim do doc oficial do Agent SDK (`code.claude.com/docs/en/agent-sdk/overview`):
- **Metering:** *"Starting June 15, 2026, Agent SDK and `claude -p` usage on subscription plans will draw from a new monthly Agent SDK credit, separate from your interactive usage limits."*
- **Login de terceiro:** *"Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK. Please use the API key authentication methods described in this document instead."*
- **Branding:** *"Your product should maintain its own branding and not appear to be Claude Code or any Anthropic product."* (Proibido: "Claude Code", ASCII art / UI que imite o Claude Code.)

**Implicação:** o **uso interativo** do Claude Code (skills que o cliente roda no próprio Claude Code) usa os **limites normais da assinatura** — fora do crédito SDK capado e fora da proibição de "third-party login". Já o **painel via Agent SDK** (`query()`) é exatamente o modo metered + restrito. Logo, a espinha do produto tem que ser **skills-first interativo**, não o painel.

## 2. Decisões (forks travados no brainstorm)

| # | Decisão | Escolha |
|---|---|---|
| 1 | Espinha de execução | **Skills-first, Claude Code interativo** (ToS-limpo, custo zero). Painel GUI sai do v1. |
| 2 | Distribuição + update | **Instalador por license-key** (curl\|bash / npx), não marketplace-git (foge do teto 50 convites/24h + custo de seat). |
| 3 | Pagamento + licença | **Checkout BR (Kiwify/Hotmart)** + **emissor de licença nativo no Supabase** (Edge Function própria). |
| 4 | Gating runtime | **Phone-home leve fail-open** (hook SessionStart ~1x/dia, async) → telemetria de ativação pro upsell + kill-switch. |
| 5 | Skill de copy | **`/cc` → `copy-magnus` (`/cm`)** = rebrand + bundle do copy-chief-black, **com LICENSE/atribuição MIT do Luca Pimenta preservados**. |

## 3. Arquitetura

### 3.1 Componentes
1. **Plugin do produto** (marca própria) — `plugin.json` + `.claude/skills/*` (incl. `copy-magnus`) + `.mcp.json` (Notion/Canva) + template `contexto/` + `operacao/` + hook de telemetria. É o que o cliente usa no Claude Code interativo dele.
2. **Instalador** (`npx <nome>` ou `curl … | bash`) — pede a key → chama o endpoint de validação do Supabase → se válida, baixa/instala o plugin em `~/.claude/plugins/<nome>/` e grava a key local (`~/.claude/<nome>/license.json`). Subcomando `update` re-valida + re-baixa.
3. **Emissor de licença (Supabase)** — Edge Functions:
   - `POST /webhook/<checkout>` — recebe webhook de compra (Kiwify/Hotmart), gera key, grava em tabela `licencas`, retorna/entrega ao comprador (página de obrigado + email).
   - `POST /license/validate` — recebe `{ key, fingerprint? }`, retorna `{ status: granted|revoked|expired, ... }`. **Auth-free / safe pra client** (sem secret embutido no instalador). Registra `last_seen` (telemetria de ativação).
   - (interno) revogação manual = flip de status na tabela.
4. **Hook de telemetria** (`SessionStart`, dentro do plugin) — async, fail-open: lê a key local, chama `/license/validate` no máximo ~1x/dia (cache local com TTL), nunca bloqueia o cliente se offline ou se o emissor cair. Atualiza `last_seen` + contador de uso = sinal de ativação.

### 3.2 Fluxo de compra → uso
```
Cliente compra (Kiwify/Hotmart, Pix/cartão)
  → webhook → Supabase emite key → entrega na página de obrigado + email
  → cliente roda o instalador, cola a key → /license/validate → instala o plugin
  → usa as skills no Claude Code interativo dele (assinatura dele, custo zero)
  → hook SessionStart pinga ~1x/dia → Supabase registra ativação/uso
  → telemetria de ativação alimenta o pitch Veritas → upsell mentoria Magnus
```

### 3.3 Tabela `licencas` (Supabase)
`id, key (unique), email, status (granted|revoked|expired), checkout_origem, criada_em, ativada_em, last_seen, uso_count, plano (tripwire|mentorado)`. RLS: escrita só via service role (Edge Functions); validate roda com chave anon + função SECURITY DEFINER que só expõe status.

## 4. O loop de upsell (o ponto do negócio)
A telemetria de ativação É o ativo estratégico (não a anti-pirataria). Mesma tese do funil **CRM AMC** (`project_crm_amc_funnel_thesis`): quem **compra e usa** o low-ticket é o alvo mais quente da mentoria. Gatilhos: "ativou ≥N vezes na semana", "rodou skill X", "atualizou". Isso vira lista de upsell pro Magnus. O kill-switch (revogação) é secundário — low-ticket, vazamento aceito como custo de marketing.

## 5. Anti-pirataria — postura
Fricção, não muralha (pesquisa: até Denuvo cai no day-one; arquivo assinado offline não é à prova de adulteração; device-binding não impede transferência). Para skills (markdown), não há runtime a proteger. **Aceitar vazamento; o moat é o upsell + os updates contínuos gateados.** O gating real é: quem não tem key válida não recebe **updates** nem entra no funil de upsell.

## 6. Mudanças no que já existe
- `teste-zerado` (template + skills) → vira o **plugin shipado** com **marca própria** + `plugin.json`.
- `magnus-painel` (Agent SDK) → **arquivado como tier premium futuro**; quando voltar, roda em **BYO-API-key** (único caminho ToS-limpo pra GUI). Fora do v1.
- **Novo:** instalador, Edge Functions Supabase (webhook + validate), tabela `licencas`, hook de telemetria fail-open, página de obrigado.
- **`/cc` → `/cm` (copy-magnus):** renomear a skill, atualizar `criar-landing` e qualquer ref; bundlar com LICENSE/atribuição do Luca.
- **Propagar os 6 fixes de hardening de 2026-05-28** (commit `dddbe32` do magnus-painel) pro template canônico `magnus-orquestrador-template` antes de empacotar.
- **Branding:** nome comercial + identidade visual próprios (não "Claude Code"). **Naming = tarefa pré-lançamento obrigatória.**

## 7. Escopo v1 (YAGNI)
**Dentro:** plugin com marca própria + `copy-magnus` + instalador por key + checkout BR + emissor Supabase (webhook+validate) + hook de telemetria fail-open + página de obrigado + propagação dos fixes.
**Fora (depois):** painel GUI premium (BYO-API-key), venda modular/à-la-carte, dashboard de telemetria, auto-update nativo via marketplace, watermark por cliente.

## 8. Riscos & itens abertos
- **ToS (mitigado):** skills-first é o lado seguro, verificado 2026-05-29. Painel só volta com BYO-API-key. Re-checar o doc da Anthropic perto de 15/06 (regras de crédito ainda em movimento).
- **Gap BR (mitigado):** Kiwify/Hotmart provavelmente não têm license-API → o emissor Supabase próprio resolve. Confirmar formato do webhook de cada plataforma na implementação.
- **MIT/atribuição (obrigatório):** preservar LICENSE + copyright do Luca Pimenta dentro do `copy-magnus`; recomendado alinhar com ele.
- **Naming (pré-lançamento):** definir nome comercial + marca.
- **Reliability do instalador:** validar o fluxo de install/update num cliente limpo (a pesquisa apontou bugs do marketplace nativo — por isso fomos de instalador próprio).

## 9. Critério de sucesso (v1)
Um comprador anônimo consegue, sozinho: pagar no checkout BR → receber a key → rodar o instalador → ter o plugin funcionando no Claude Code dele → e o Yuri ver no Supabase quem ativou/usou (pra disparar o upsell). Zero ZIP, zero GitHub público, zero custo de API pro Yuri.
