# Gestor de Tráfego Inteligente — Design Spec

> **Data:** 2026-06-11 · **Status:** aprovado pelo Yuri (brainstorm /ceo 2026-06-10→11)
> **Onde vive:** módulo do `magnus-os-online`, feature flag `traffic_copilot`, visível só pro tenant do Leo (decisão: arquitetura B).
> **Relação com a spec mãe:** este é o **F4 da spec `2026-06-10-magnus-os-online-gestao-design.md` antecipado e expandido** — além do diagnóstico Sonnet + REGRAS.md que o F4 previa, ganha loop de aprendizado (captura atômica decisão+razão, memória de casos, playbooks induzidos, escada de autonomia). Validou → tira a flag e vira o especialista oficial do produto, sem migração de código.
> **Research:** deep-research 2026-06-10/11 (111 agentes, 23 fontes, 25 claims verificados adversarialmente: 20 confirmados, 5 refutados). Findings citados inline; caveats em §12.

## 1. Visão

Ferramenta de gestão de tráfego Meta Ads que **aprende com as otimizações do gestor humano**. Toda otimização aplicada registra obrigatoriamente **o porquê** (subir criativo, melhorar LP, cortar adset...). O motor identifica o que é **universal** (diagnósticos que valem em qualquer projeto) e o que é **nuance de cada projeto/nicho**, e progride de copiloto → autônoma, classe de ação por classe de ação, por evidência de concordância.

**Treino:** 6 projetos reais que o Leo (sócio, gestor de tráfego) toca hoje, de nichos diferentes.

**Gap de mercado (direcional, fontes não verificadas adversarialmente):** Revealbot = motor de regras manuais; Madgicx = IA caixa-preta (Trustpilot com reclamações recorrentes); agentes 2026 (Viant Outcomes, MiQ Sigma, PubMatic AgenticOS) automatizam execução mas **nenhum captura o raciocínio do gestor**. O próprio Meta Ads MCP não tem memória, audit trail nem lógica de negócio (adamigo.ai) — é encanamento; esta ferramenta é a camada que falta.

## 2. Decisões travadas no brainstorm

| # | Decisão | Escolha do Yuri |
|---|---|---|
| 1 | Captura das otimizações | **A ferramenta é a interface de aplicação** (escrita na Meta pela ferramenta; caso gravado atomicamente com a razão). Ação fora da Meta (ex: LP) = caso manual de 1 clique. |
| 2 | Motor de aprendizado v1 | **LLM + memória estruturada de casos, log ML-ready** (não ML estatístico clássico — volume inicial pequeno). |
| 3 | Autonomia | **Shadow mode + taxa de concordância por classe de ação**; autonomia conquistada por evidência, com guardrails. |
| 4 | Onde vive | **B — dentro do magnus-os-online, feature flag** (risco aceito: acopla o experimento à maturação do F1a). |
| 5 | Tenant | **Tenant próprio pro Leo** (mesmo caminho de provisioning do SUB-YURI-DOGFOOD). |
| 6 | Cadência | **Diagnóstico diário nos 6 projetos** (~R$400-1.200 de IA no teste de 8 semanas; medido pelo `cost_ledger`). |

## 3. Modelo de dados — o caso (P, S, O, M)

Schema validado pela research (CBR survey arXiv:2504.06943 §3.1 + CBR-LLM arXiv:2506.20531 §3.2, ambos 3-0; convergem inclusive no campo de justificativa humana):

- **P — Situação:** snapshot no momento da decisão — série diária 30d das entidades afetadas (spend, CPA, ROAS, CTR, frequência, resultados, breakeven_roas) + **caption em linguagem natural** da situação ("ROAS caiu 30% em 3d com frequência subindo; criativo líder há 21d") → **embedding** pra retrieval por similaridade.
- **S — Ação:** **taxonomia fechada de classes** + parâmetros (entidade, magnitude): `budget_up` · `budget_down` · `pause_ad` · `pause_adset` · `pause_campaign` · `new_creative` · `new_audience` · `duplicate_winner` · `bid_change` · `lp_change` (manual) · `other_manual`. Classes fechadas são o que permite medir concordância e graduar autonomia por classe.
- **Razão:** texto livre obrigatório (1-3 frases) + tags opcionais. O dado que ninguém captura.
- **O — Outcome:** medido automaticamente depois (§5). `sucesso/neutro/falha` + magnitude.
- **M — Metadata:** projeto, nicho, vertical, ticket, timestamp, origem (`leo` | `recomendacao_acatada` | `recomendacao_modificada` | `autonoma`).

**Tabelas novas (Supabase MagnusOS `jvxttcmazquypscjuaiz`, RLS por tenant — padrão da casa):**
`traffic_projects` (6 projetos: ad account, nicho, breakeven, flags) · `traffic_snapshots` (série diária por entidade, job determinístico) · `traffic_cases` (P,S,O,M + embedding pgvector) · `traffic_recommendations` (shadow mode + concordância) · `traffic_playbooks` (universal | por-projeto, status draft/aprovado, editável) · `traffic_autonomy` (estado por classe×projeto: shadow/graduada/rebaixada + guardrails).

## 4. Loop diário

1. **Sync determinístico** (cron por tenant, sem IA, custo ~zero — mudança 3 da spec mãe): snapshot diário campanha/adset/ad dos 6 projetos. Base: padrão do `build-insights.py` com granularidade maior (por adset + série diária + frequência).
2. **Shadow mode (manhã):** motor roda diagnóstico por projeto e grava recomendações **antes** do Leo abrir. Cada recomendação cita casos/playbooks que a sustentam (quality bar da spec mãe: recomendação sem número é inválida).
3. **Leo trabalha pela ferramenta:** vê diagnóstico, decide (acata / modifica / faz outra coisa), aplica → escrita na Meta + caso gravado atômico com a razão.
4. **Concordância:** acatou = match (classe+entidade+direção) · modificou = match parcial · ignorou e fez outra = divergência (razão dele = dado mais valioso do dia).

## 5. Outcome engine (determinístico)

Método validado em produção (Lyft, AdKDD 2020/KDD 2021, 3-0): **baseline pré-ação por OLS** na série do snapshot → outcome = razão observado/previsto na janela da classe:

| Classe | Janela |
|---|---|
| budget_up/down, bid_change | 3-7d |
| pause_ad/adset/campaign, duplicate_winner | 7d |
| new_creative, new_audience, lp_change | 7-14d |

Com ruído de ads, outcome individual é **indicativo, não veredito** — por isso indução de playbook exige ≥3 sucessos E ≥3 falhas (§6). Janelas acima são hipótese de design a calibrar no teste (research não verificou janelas de atribuição por classe — open question #3).

## 6. Motor de aprendizado — 3 estágios (Storage → Reflection → Experience)

Escada formalizada no survey Luo et al. 2026 (3-0, preprint) e validada pelos sistemas ExpeL/AAAI-24, Memento e MACLA/AAMAS-26 (todos 3-0): LLM congelado + memória externa de casos **supera baselines de fine-tuning** e a memória de casos adiciona +4,7 a +9,6pp em generalização out-of-distribution.

- **v1 — Storage + Retrieval:** diagnóstico recupera casos similares (embedding da situação, filtrado por classe; similaridade > aleatório em todos os LLMs testados, 2-1) dos 6 projetos e injeta no prompt: "da última vez que isso aconteceu no projeto X, Leo fez Y porque Z, deu W".
- **v1.5 — Reflection:** outcomes pesam o retrieval (caso com outcome bom rankeia acima).
- **v2 — Experience:** **indução contrastiva de playbooks** — comparar contextos de sucessos vs falhas da mesma classe (MACLA, 2-1; threshold ≥3 sucessos E ≥3 falhas; ablation −3,6/−4,6 sem o componente). Playbook nasce **universal** (padrão cross-projeto) ou **por-projeto** (nuance de nicho) — critério MACLA: ações reusáveis/semântica consistente → universal; thresholds de nicho → específico. Todo playbook é apresentado pro Leo **aprovar/editar na UI** ("Ensine seu gestor" — o review-loop da spec mãe aplicado ao especialista). Aprovado = prior de todo diagnóstico subsequente.
- **Futuro (fora deste escopo):** bandit paramétrico pra budget (Gigli & Stella 2024, regime de poucos dados) quando o log tiver feedback diário maduro por entidade; Lyft prova a classe de técnica em produção (22±10% CPA) mas em volume 4-5 ordens de magnitude maior. Log já nasce ML-ready pra isso.

## 7. Escada de autonomia (por classe, com guardrails)

- **Graduação:** concordância ≥80% nas últimas N≥10 decisões da classe + sem falha grave na janela.
- **Graduada =** propõe executar sozinha com guardrails: cap de magnitude (budget ±20%/dia), clipping de extremos (prática Lyft, 3-0), janela de horário, notificação + rollback 1 clique, kill switch global.
- Leo rebaixa qualquer classe a qualquer momento. Tudo auditável (caso registra origem `autonoma`).

## 8. Integração Meta

- **Primária: Meta Ads MCP oficial** (`mcp.facebook.com/ads`, 29/04/2026) — OAuth do BM do Leo, tier read/write, **sem App Review** (fontes secundárias convergentes; não verificado adversarialmente).
- **Fallback comprovado: Marketing API dev-mode** — Leo como developer/tester no app `987622980348211`; caminho que o `build-insights.py` já usa headless hoje. Atenção: rate limit do dev tier (citado ~60 pontos, adamigo.ai) pode apertar com 6 projetos.
- **SPIKE obrigatório (Task 1 do plano, ~1 dia):** testar empiricamente (a) MCP em job server-side headless — refresh/expiração de OAuth sem interação; (b) rate limits reais dos dois caminhos na escala 6 projetos × sync diário + escritas. A research não conseguiu verificar o comportamento headless do MCP (open question #1). O design funciona com qualquer um dos dois.
- App Review da Meta continua caminho crítico **só** do produto multi-tenant pra mentorados (F2 da spec mãe, inalterado).

## 9. UI

Herda `tokens.css`/`globals.css` (idênticos nos dois painéis; oklch warm, accent cobre/terra/âmbar, Geist) e componentes existentes (AppShell, TabBar, `.preset-card`, `SkillLaunchModal`, modais centralizados, `.pill`/semáforos). Abas do módulo:

- **Hoje** — diagnóstico do dia por projeto + recomendações (cada uma com porquê + casos-fonte) + aplicar/modificar/recusar.
- **Decisões** — log de casos com outcome (timeline, filtros por classe/projeto).
- **Playbooks** — universal e por-projeto; aprovar/editar/desativar.
- **Autonomia** — concordância por classe (sparkline), classes graduadas, guardrails, kill switch.

`/ui-ux-pro-max` na implementação (pedido do Yuri). Estética 100% MagnusOS.

## 10. Validação (destrava a absorção como F4 oficial)

Teste de **8 semanas** com os 6 projetos do Leo:

1. **Captura:** ≥80% das otimizações dos 6 projetos passando pela ferramenta.
2. **Aprendizado:** concordância com tendência de alta em ≥3 classes de ação.
3. **Autonomia:** ≥1 classe graduada operando sem incidente.
4. **Qualitativo:** veredito do Leo ("confiaria nela num projeto novo?").

**Critério de falha (aposta falsificável):** a hipótese "dezenas de decisões/mês geram ganho mensurável" foi **refutada na verificação da research** (0-3; papers mostram ganho com centenas/milhares de trajetórias). Se a concordância estagnar baixa após 8 semanas → pivô informado: mais projetos/gestores pra acumular casos, ou recuar pro F4 original (diagnóstico sem aprendizado).

## 11. Custos

- IA: diagnóstico diário × 6 projetos × Sonnet ≈ R$1-3/diagnóstico → ordem de R$400-1.200 no teste. Enforcement pelo `cost_ledger` existente (tenant Leo com teto próprio). Lição da F1a: custo é dominado por cache-creation do contexto — enxugar prompt do diagnóstico importa tanto quanto modelo.
- Embeddings: pgvector no Supabase + modelo de embedding barato (decidir no plano; volume é trivial — dezenas de casos/mês).
- Infra: zero nova (VPS Portal + Supabase MagnusOS existentes).

## 12. Riscos & caveats honestos

- **Acoplamento ao F1a (decisão B):** se o painel hosted engasgar, o teste do Leo engasga. Mitigação: o módulo usa o substrato (auth/RLS/ledger) mas seu loop diário é cron determinístico independente do executor de skills.
- **Evidência do motor é analógica:** ExpeL/Memento/MACLA foram validados em benchmarks com sinal binário limpo, não em ads com outcome ruidoso/atrasado, nem com logs de decisão humana. Transferência é extrapolação arquitetural — o shadow mode existe exatamente pra medir se transfere.
- **Volume baixo é a aposta central** (refutada como fato geral; ver §10).
- **Política de retenção da biblioteca de casos:** o critério de utilidade da literatura foi refutado (0-3). v1 retém tudo (volume baixo); poda/curadoria vira decisão com dado real (open question #4).
- **Outcome attribution:** janelas por classe são hipótese; ITS formal/CUPED não verificados. Começar com baseline OLS pragmático e calibrar.
- **Meta MCP headless não verificado** → spike Task 1 (§8).
- **Custódia de credenciais:** OAuth/token do Leo cifrado por tenant em repouso, nunca em prompt/log (regra da spec mãe, lição do scrub TOKEN_ENCRYPTION_KEY).

## 13. Fora de escopo (v1 deste módulo)

Bandits/ML estatístico (log nasce pronto, técnica entra depois) · escrita white-label pra mentorados (App Review, F2) · outras plataformas (Google/TikTok) · relatórios pro cliente final (backlog P1 da spec mãe) · chat conversacional (estética da spec mãe: depois).

## 14. Fontes-chave da research

- CBR para agentes LLM (schema do caso): arXiv:2504.06943 · arXiv:2506.20531
- LLM congelado + memória externa: ExpeL arXiv:2308.10144 (AAAI-24) · Memento arXiv:2508.16153 · MACLA arXiv:2512.18950 (AAMAS-26)
- Escada Storage→Reflection→Experience: Luo et al., preprints.org 202601.0618
- Bandits/outcome em ads: Han et al. AdKDD 2020 (Lyft) · KDD 2021 (3447548.3467124) · Gigli & Stella, IJDSA 2024
- Relatório completo do workflow: 9 findings sintetizados, 5 claims refutados, 4 open questions (transcrito na sessão /ceo de 2026-06-11).
