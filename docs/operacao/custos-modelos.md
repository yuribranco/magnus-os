# Custos & Modelos — Magnus OS Online

**Atualizado:** 2026-06-10 · **Fonte de custo real:** tabela `cost_ledger` do Supabase `jvxttcmazquypscjuaiz` (gravada por run, por skill × modelo).
**Objetivo:** saber o custo de cada agente com precisão e decidir, com DADO, qual modelo colocar em cada skill.

> Regra de ouro (decisão Yuri 2026-06-10): **Magnus paga a API embutida no preço.** Cada centavo de inferência sai da margem. Logo: modelo mais barato que entrega a qualidade necessária, sempre. Determinístico-primeiro (sync/consolidação/rendering = $0, sem IA). IA só onde há julgamento.

---

## 1. O que já medimos (dados reais do ledger)

| Skill | Modelo | in_tok | out_tok | US$/run | Observação |
|---|---|---|---|---|---|
| preencher-empresa | claude-sonnet-4-5 | 3 | 65 | **0.0667** | 1 turno conversacional. Custo dominado por **cache-creation** do skill+contexto (~milhares de tokens lidos), não pelo I/O visível. Teto $20 ≈ 300 turnos. |

> ⚠️ Lição do 1º dado: o `in_tok`/`out_tok` visível ENGANA — o custo real vem do **cache de leitura do SKILL.md + CLAUDE.md + contexto/** a cada run. Skills com contexto grande são caras independente do tamanho da resposta. Implicação: **enxugar o que entra no prompt** baixa custo tanto quanto trocar de modelo.

_(Esta tabela cresce a cada teste. Query pra atualizar na seção 4.)_

---

## 2. Mapa de modelos por skill (alvo deliberado — a validar com teste)

Estado atual: quase tudo roda no **default (Sonnet)** implícito. Alvo abaixo = hipótese a confirmar pelo harness (seção 3). `panel.model` no frontmatter do `SKILL.md` é o controle.

| Categoria | Skills | Modelo ATUAL | Modelo ALVO (hipótese) | Racional |
|---|---|---|---|---|
| **Extração/preenchimento** | preencher-empresa, preencher-voz, preencher-time, preencher-design | default (Sonnet) | **Haiku** | Estrutura input do usuário em campos. Pouco julgamento → Haiku deve bastar a fração do custo. PRIMEIRO a testar. |
| **Operacional/sync** | atualizar, sincronizar-meta | default (Sonnet) | **Haiku** ou **$0 determinístico** | Idealmente vira job de sistema sem IA (F3). Se precisar de IA, Haiku. |
| **Diagnóstico/julgamento** | checar-marca, radar | Sonnet | **Sonnet** (manter) | Compara, avalia, recomenda — precisa de raciocínio. Já é o default certo. |
| **Copy pesado / criação** | copy-magnus, criar-landing, criar-criativo, criar-post, lancar-campanha | default (Sonnet) | **Sonnet vs Opus (A/B)** | Qualidade = receita do cliente. Testar se Opus justifica o custo extra vs Sonnet. O caso onde pagar mais PODE valer. |

**Princípio:** operacional → Haiku · diagnóstico → Sonnet · copy de venda → testar Opus. Nunca subir de modelo sem dado que justifique.

---

## 3. Harness de teste de modelos (como achar o melhor custo×qualidade)

Protocolo pra cada skill candidata a troca:

1. **Inputs fixos:** 3-5 casos representativos (workspaces de teste com contexto real).
2. **Rodar a MESMA skill em cada modelo candidato** (Haiku / Sonnet / Opus) sobre os mesmos inputs — via `panel.model` ou override por run.
3. **Custo:** ler do `cost_ledger` (automático, por run). Comparável direto.
4. **Qualidade:** julgar o output (rubrica por skill — ex: preencheu todos os campos? copy converte? diagnóstico tem número que sustenta?). Pode ser julgamento manual do Yuri OU um juiz-LLM.
5. **Decisão:** menor modelo que passa a barra de qualidade. Registrar na tabela §2 + atualizar o `panel.model`.

**Cross-provider (GPT/Gemini) — frente separada, maior:** o Agent SDK é Claude-only. Testar OpenAI/Gemini precisa de um caminho de execução paralelo (provider abstraction no executor). Decisão pendente: vale o custo de engenharia? Só depois de exaurir os tiers Anthropic. Gemini JÁ é usado pra imagem (criativos) via `GEMINI_API_KEY` — esse é o único cross-provider hoje.

---

## 4. Como puxar custo real do ledger (queries canônicas)

⚠️ PostgREST bloqueia agregação (`sum()`) por default → usar **SQL via Management API** (mesmo endpoint das migrations). Carregar env: `cd ~/Documents/Magnus/magnus-os-online && set -a && . ./.env.bootstrap && set +a`, rodar dentro de `op run --env-file=.env.op -- ...`. Endpoint: `https://api.supabase.com/v1/projects/$MAGNUS_ONLINE_SUPABASE_REF/database/query` com header `Authorization: Bearer $SUPABASE_ACCESS_TOKEN`.

```bash
Q() { op run --env-file=.env.op -- bash -c "curl -s -X POST \"https://api.supabase.com/v1/projects/\$MAGNUS_ONLINE_SUPABASE_REF/database/query\" -H \"Authorization: Bearer \$SUPABASE_ACCESS_TOKEN\" -H \"Content-Type: application/json\" -d '{\"query\":\"$1\"}'"; }

# O NÚMERO QUE DECIDE onde colocar cada agente: custo por skill × modelo
Q "select skill, model, round(sum(usd),4) usd_total, count(distinct ref) runs, round(sum(usd)/nullif(count(distinct ref),0),4) usd_por_run from cost_ledger group by skill, model order by usd_total desc"

# custo por tenant no mês (enforcement do teto)
Q "select tenant_id, round(sum(usd),4) usd from cost_ledger where ts >= date_trunc('month', now()) group by tenant_id"

# runs recentes + status (done/error/blocked_budget)
Q "select skill, status, created_at from runs order by created_at desc limit 20"
```

> Backlog F1b: view `custo_por_skill_modelo` + dashboard no painel (hoje a leitura é via query SQL). O dado JÁ existe por run; falta a UI de análise.

---

## 5. Decisões travadas

- **2026-06-10:** Magnus paga a API (não BYO) → custo é margem → modelo mais barato que serve. `cost_ledger` por skill×modelo é a fonte de verdade. Harness Anthropic-first; cross-provider só depois.
