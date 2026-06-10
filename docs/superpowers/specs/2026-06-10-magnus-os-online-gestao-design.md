# Magnus OS Online — Gestão (visão executiva + 1º especialista) — Design Spec

**Data:** 2026-06-10
**Status:** ✅ Aprovado em brainstorm interativo (seções 1-4 validadas pelo Yuri nesta sessão). Próximo: `writing-plans` por fase, com gates.
**Origem:** `/superpowers:brainstorming` + ingestão do curso "Build Your Own J.A.R.V.I.S." (wiki: [[jarvis-agentic-ai-for-founders]], 5/5 aulas) + VOC de 3 grupos de donos de agência (`docs/research/2026-06-10-voc-donos-de-agencia-roadmap.md`).
**Substitui parcialmente:** `2026-06-01-magnus-os-hosted-saas-design.md` (blueprint) — que sai de "NÃO IMPLEMENTAR" para **ativo**, com as mudanças da §3.

---

## 0. Decisões travadas nesta sessão (Yuri, 2026-06-10)

1. **GO pro hosted:** "Vamos fazer o MagnusOS online." O painel deploiado é o produto; fim da espera do blueprint.
2. **Economia: Magnus paga a API Anthropic, embutida no preço** (assinatura recorrente). Não é BYO-key nem BYO-subscription no MVP. Corolários: medidor + teto por tenant desde o dia 1; otimização agressiva de custo (determinístico-primeiro; modelo por tarefa).
3. **Foco de produto: gestão.** (a) **Visão executiva** — Meta × Hotmart = lucro real; (b) **agentes especializados** com capacidade real de trabalho. Interface conversacional = estética, fica pra depois (eco da aula 4 do curso: "interface is theater").
4. **Escada de execução:** v1 = agente **prepara** (draft-only) → v2 = integra nas plataformas **com aprovação** → v3 = mais autonomia + operações complexas (ex: CRM white-label como pack).
5. **1º especialista: Gestor de Tráfego** (adjacente aos dados da visão executiva).
6. **Produto local atual:** vira ambiente de dev/dogfood (Yuri + Léo). Mentorados novos → online. Migração dos locais quando o online provar (workspace file-first → upload pro Storage). Sunset decidido depois.

## 1. Escopo da v1

**Produto:** `magnusos.yuribranco.com.br` — compra na Hotmart (assinatura) → magic-link → onboarding de marca (contexto/) → workspace de campanhas + **visão Empresa** + skills de produção atuais + **Gestor de Tráfego**. Sem instalação, sem Mac, sem terminal.

**Fora da v1:** chat orquestrador; escrita nas plataformas (v2); CRM white-label (v3); demais cargos do organograma (1 especialista por vez — escada do curso); BYO-key/subscription (slot modelado, não construído).

## 2. Arquitetura (herda o blueprint 2026-06-01 com 3 mudanças)

**Herdado como desenhado:** SP-0 (Supabase Auth magic-link + provisioning via `hotmart-webhook` já LIVE; RLS por `tenant_id`; workspace durável em Storage `tenant-workspaces/<id>/`; Redis self-hosted; domínio+nginx+CI/CD espelhando Portal Magnus; ~$45/mês fixo) e SP-1 (executor = **sandbox efêmero por run**: hidrata Storage → injeta credenciais → Agent SDK → SSE → sync de volta → grava usage → morre; base = refactor do `magnus-painel`, não rewrite).

> ⚠️ **Auth do executor (travado 2026-06-10, addendum pós-15/06):** o sandbox injeta `ANTHROPIC_API_KEY` (chave de plataforma do Magnus) no ambiente do Agent SDK — **NUNCA OAuth de assinatura**. Billing é **por token (API)**, o que (a) honra "Magnus paga a API embutida no preço", (b) mantém o `cost_ledger` como enforcement de margem real, e (c) **isola o hosted da mudança de billing de 15/06** (que só atinge uso autenticado por assinatura — i.e., o produto LOCAL). Detalhe: `2026-06-10-cost-premise-post-15jun-addendum.md`.

**Mudanças vs blueprint:**
1. **`plan.key_source: "platform"` é o incremento 1** (era 2). `cost_ledger` deixa de ser medição e vira **enforcement**: teto por plano, bloqueio com mensagem clara, medidor visível pro tenant.
2. **Model-picker por skill** (`panel.model: haiku|sonnet|opus` no frontmatter). Operacional/diagnóstico → Haiku/Sonnet; copy pesado → Opus. Ledger por skill×modelo alimenta recalibração de preço/teto.
3. **Camada determinística = cidadã de primeira classe:** sync Meta, sync Hotmart, consolidação, alertas e rendering rodam como **jobs de sistema** (cron por tenant, sem sandbox, sem IA, custo ~zero). IA só onde há julgamento.

**Segurança (gate `/plan-eng-review` antes de codar):** Bash confinado ao `/ws`; tokens/keys cifrados por tenant em repouso; isolamento por run; decisões abertas do blueprint (Docker vs microVM, warm pool, estratégia de sync, pgcrypto vs Vault).

## 3. As funcionalidades de gestão

### 3a. Visão Empresa (visão executiva — determinística)
Nível acima das campanhas. Jobs de sistema sincronizam **Meta** (gasto/CTR/CPA por campanha/ad, via broker OAuth — SP-2) e **Hotmart** (vendas/receita/reembolsos, via credencial de API do cliente no onboarding, cifrada). Consolidação por dia e por campanha → cards "hoje/ontem/7d: gastou X, vendeu Y, lucro Z" + tabela por campanha com semáforo vs breakeven ROAS + tendência 7/30d.

**Refinamento do VOC ("ROI real"):** o lucro exibido é **líquido** — desconta taxa da plataforma, custo de antecipação de parcelamento e imposto sobre tráfego (configuráveis por tenant). Citações que mandam: "ROI faturado mesmo, sem contar parcelamento no boleto" (Julio, Fluxo); "produto custa 1.200 e a Hotmart cobra 200 pra antecipar" (Lucas, Viking). É puramente determinístico e nenhum dashboard concorrente entrega.

### 3b. Gestor de Tráfego (1º especialista — workflow spec nos 6 campos)
- **Missão:** transformar os números consolidados em decisão (escalar/pausar/testar).
- **Inputs:** consolidado Empresa **injetado pronto no prompt** (tese "painel resolve+injeta"; a skill não caça arquivo), breakeven ROAS, BRIEFING da campanha, REGRAS.md do dono.
- **Processo:** ler consolidado → comparar vs breakeven e período anterior → outliers (ad estourado, criativo fadigado, campanha sub-escalada) → recomendar com raciocínio e confiança.
- **Output:** `DIAGNOSTICO.md` datado na lane de tráfego — ações priorizadas, cada uma com "por quê" + "o que olhar antes de aplicar".
- **Boundaries (v1):** recomenda, nunca executa (escrita na Meta = v2, gated por aprovação).
- **Quality bar:** recomendação sem número que a sustente = inválida; incerteza declarada, não inventada.
- **Modelo:** Sonnet (custo de centavos por diagnóstico).
- **Cadência:** sob demanda (botão) + opcional 1×/dia dentro do teto.

### 3c. Review loop do mentorado
`REGRAS.md` por lane, editável no painel ("Ensine seu gestor"): correção repetida do dono vira regra persistida que todo diagnóstico subsequente lê. É o review-loop do curso aplicado ao CLIENTE (hoje só as correções do Yuri persistem — viram release; as do mentorado evaporavam). Diferencial de produto e argumento de venda.

## 4. Sequência de execução

| Fase | Entrega | Depende | Gate |
|---|---|---|---|
| **F0 Foundation** | Auth+provisioning · RLS multi-tenant · cost_ledger+plan(platform)+teto · substrato deploy | — | `/plan-eng-review` (cifra, RLS) |
| **F1 Painel hosted MVP** | Refactor multi-tenant · sandbox executor · Storage · medidor UI · skills atuais rodando | F0 | `/plan-eng-review` (sandbox/warm pool/sync) |
| **F2 Conexões** | Broker OAuth Meta (spec SP-2 pronto; **App Review = caminho crítico, iniciar na F0**) · credencial Hotmart cifrada | F0 | `/review` (credenciais) |
| **F3 Visão Empresa** | Jobs sync+consolidação (lucro líquido) · UI executiva | F2 | `/plan-design-review` |
| **F4 Gestor de Tráfego** | Skill diagnóstico (Sonnet) · lane · REGRAS.md | F3 | — (spec §3b) |
| **F5 Go-to-market** | Onboarding fim-a-fim · produto/preço Hotmart · **teste de 7 dias com 1-2 mentorados reais** | F1-F4 | `/qa` |

Cada fase fecha com `/codex review` + testes. Preço se decide com o dado do `cost_ledger` das F1-F4 (cenários A/B/C do doc visão-plataforma como base; VOC §5 confirma faixa R$297-997).

## 5. Backlog pós-v1 (do VOC — detalhe e citações no doc de research)

P1 relatório executivo entregue (WhatsApp/e-mail, inclusive **white-label pro cliente do estrategista**) + alertas de anomalia (determinístico) · P2 cockpit/checklist de lançamento (pre-flight técnico verificável por máquina) · P3 escrita gated na Meta ("Aplicar" com aprovação) · P4 pack CRM/atendimento WhatsApp white-label (base Omni; closer IA) · P5 monitor de saúde + anti-golpe (Radar infra) · P6 pack financeiro (base Finance Copilot) · P7 evolução de criativos (análise de padrão dos vencedores).

## 6. Riscos & mitigação

- **Custo de IA por tenant estoura o preço** → determinístico-primeiro + model-picker + teto enforced; ledger desde F1 informa o preço antes do go-to-market.
- **App Review da Meta atrasa F3** → iniciar na F0; dev-mode cobre dogfood/testers enquanto isso.
- **Custódia de credenciais (Meta/Hotmart/Anthropic)** → cifra por tenant, secrets nunca em prompt/log, gate `/review` dedicado na F2; lição do scrub da `TOKEN_ENCRYPTION_KEY` (auditoria 2026-06-09) aplicada.
- **"Faz-tudo que não faz nada" (objeção do VOC)** → lanes/especialistas com workflow spec explícita, não assistente genérico.
- **Pular a escada do curso** (lançar N agentes) → 1 especialista por vez; cada cargo novo passa pelo próprio teste de 7 dias antes de entrar no catálogo.
