# Addendum — Premissa de custo do `cost_ledger` pós-15/06 (Agent SDK → crédito de assinatura)

> 2026-06-10. Reavaliação disparada pela mudança de billing do Agent SDK / `claude -p`
> (Anthropic, vigência **15/06/2026**, verificado support.claude.com #15036540).
> Complementa: `2026-06-10-magnus-os-online-gestao-design.md` (spec hosted) e
> `plans/2026-06-10-magnus-os-online-f0-foundation.md` (Tasks 2-3, `cost_ledger`).

## O que muda em 15/06

Uso do **Agent SDK** e `claude -p` **deixa de contar no limite da assinatura** e passa a
consumir um **crédito mensal incluído** (Pro $20 · Max5x $100 · Max20x $200). Esgotou:
ou flui pra usage-credits em tarifa de API (se habilitado), ou **para até renovar**.

**Ponto-chave que resolve tudo:** o Agent SDK autentica de **dois modos**:
- **OAuth de assinatura** (sem `ANTHROPIC_API_KEY`) → queima o crédito mensal → **é isto que muda em 15/06**.
- **`ANTHROPIC_API_KEY`** → billing **por token** na API → **NÃO é afetado por 15/06**.

"Agent SDK" não implica "crédito de assinatura". O modo de auth é que decide.

## A tensão no spec hosted

| Linha | Diz | Implica |
|---|---|---|
| 13 | "Magnus paga a **API** Anthropic, embutida no preço" | billing **por token** (API key) |
| 27 (SP-1) | executor = "injeta credenciais → **Agent SDK** → grava usage" | ambíguo: API-key OU OAuth? |

Se o executor hosted rodar via **OAuth de assinatura**, então:
- O custo do Magnus não é por-token — é um pool fixo ($200/mês no Max20x) que **para** ao esgotar.
- O `cost_ledger` em USD (Task 3: `tenant_usage_month`, `tenant_budget_remaining` vs `plan.limits.usd_month`) deixa de proteger margem por-token e vira um problema de **multiplexação de pool** entre tenants.
- A premissa inteira da F0 (teto USD por tenant = proteção de margem) fica **mal-fundada**.

## Resolução (decisão de arquitetura a travar no spec)

**O executor hosted DEVE autenticar via `ANTHROPIC_API_KEY` do Magnus (billing por token), NUNCA via OAuth de assinatura.**

Com isso:
- ✅ Honra a linha 13 ("Magnus paga a API embutida no preço") — literalmente.
- ✅ O `cost_ledger` USD da F0/Task 3 fica **correto como está** — `usd` por run estimado de `tokens × preço-do-modelo` é o custo real da API; `tenant_budget_remaining` protege margem de verdade.
- ✅ **15/06 não afeta o hosted** — a mudança é só sobre uso autenticado por assinatura.
- ✅ Schema já é forward-compatible: `plan.key_source: "platform"` (Magnus paga) vs futuro `"byo"` (tenant conecta a própria assinatura → `limits.usd_month: null` → `tenant_budget_remaining` já retorna null/sem-teto). BYO continua sendo slot modelado pra v2+, sem refactor da F0.

**Addendum de uma linha pro SP-1 do spec hosted:**
> O sandbox efêmero injeta `ANTHROPIC_API_KEY` (chave de plataforma do Magnus) no ambiente do
> Agent SDK. O executor **não** usa OAuth de assinatura — billing é por token (API), o que
> mantém o `cost_ledger` como enforcement de margem e isola o hosted da mudança de 15/06.

## Separação limpa: dois produtos, dois modelos de execução

| | **LOCAL** (produto atual, dogfood, mentorado no Mac dele) | **HOSTED** (F0+, multi-tenant) |
|---|---|---|
| Auth do Agent SDK | **OAuth da assinatura do mentorado** | **`ANTHROPIC_API_KEY` do Magnus** |
| Quem paga inferência | o mentorado (pool da assinatura dele) | Magnus (por token, embutido no preço) |
| Afetado por 15/06? | **SIM** — runs passam a queimar o crédito ($100-200/mês) | **NÃO** — API por token não muda |
| Mecanismo de visibilidade | **Medidor de crédito §7.4** (entra no release 1.2.19) | `cost_ledger` + teto USD (F0 Task 3, já desenhado) |

→ Os dois mecanismos **sobrevivem e são necessários** — não há redesenho. Eles servem a dois
modelos de execução distintos, e nomear isso explicitamente mata a confusão.

## Ações

1. **(spec)** Anexar o addendum de uma linha ao SP-1 do `2026-06-10-magnus-os-online-gestao-design.md`. ✅ trava a premissa antes das Tasks 1-11.
2. **(F0)** Nenhuma mudança nas Tasks 2-3 — `cost_ledger` está correto sob a premissa API-key.
3. **(local)** Construir o medidor de crédito §7.4 no `magnus-painel` → release **1.2.19** (deadline 15/06). É o produto LOCAL que é atingido pela mudança.
4. **(custo, nota pra pricing)** Sob API-key, custo real ~ $135/mês por tenant pesado (estimativa visão §3); o default `usd_month: 20` da F0 é conservador — os tiers de pricing (R$297/697/997) setam tetos maiores. Confirmar na calibração de preço com dado real do `cost_ledger` (F1-F4).
