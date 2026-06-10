# VOC — Donos de agência/estrategistas → Roadmap de implementações do Magnus OS

> 2026-06-10. Fonte: exports completos de WhatsApp de 3 grupos — **Mentoria Magnus** (set/2024→jun/2026, ~40k msgs úteis), **Mastermind Viking** (out/2024→jun/2026, ~27k), **Master Fluxo** (2024→jun/2026, ~18k). ~85k linhas processadas por 18 agentes de extração em paralelo (1 por fatia de ~400KB), sínteses em `/tmp/voc-magnus/out/` (efêmero) — este doc é o consolidado permanente.
> Critério de priorização: **frequência × intensidade × fit com o Magnus OS online** (decisões de 2026-06-10: hosted, API da plataforma embutida no preço, determinístico-primeiro).

---

## 1. O retrato do avatar (o que os 3 grupos confirmam)

O dono de agência/estrategista BR vive **disperso entre 5-10 ferramentas caras** que não se falam, **não sabe o lucro real** das operações (parcelamento, taxas e impostos distorcem o ROI), opera **no manual** nos momentos críticos (lançamento = ansiedade, insônia, checklist na cabeça), **não acha gente boa** (e quando acha, não consegue pagar/reter), e apanha diariamente da **volatilidade Meta/WhatsApp** (contas banidas, API instável, utility rejeitada, golpista no grupo).

As três frases que resumem o mercado:

> "O dinheiro que você não tem, tá no dado que você não olha." — Marcelo (Viking)

> "Negócio é ter algo que já resolva isso tudo no mesmo sistema. Facilita a vida." — Breno (Viking) · contraponto no mesmo grupo: "ferramenta que tenta fazer tudo não é boa em nada" — Marcelo

> "Quando vc perceber está gastando uma fortuna com ferramentas e não está usando nem metade." — Rodrigo (Magnus)

**Implicação de posicionamento:** o Magnus não vende "mais uma ferramenta" — vende a **consolidação** (números + agentes que trabalham) com a metodologia embutida. O medo do "faz-tudo que não faz nada" se responde com lanes: cada agente é especialista, o painel é o escritório.

---

## 2. Temas por recorrência × intensidade (cross-grupo)

| # | Tema | Freq. | Int. | Grupos | Fit Magnus |
|---|---|---|---|---|---|
| 1 | Tráfego Meta: CPL/CAC alto, performance inexplicável, Advantage+ ruim, campanha que não gasta | ★★★★★ | 4-5 | todos | ✅ v1 (Gestor de Tráfego) |
| 2 | WhatsApp: bans de API/chips, utility rejeitada, grupos invadidos por golpistas, custo subindo | ★★★★★ | 5 | todos | v3 (pack CRM/atendimento) |
| 3 | Dados dispersos / sem visão consolidada / ROI real desconhecido | ★★★★ | 4 | todos | ✅ v1 (visão Empresa) |
| 4 | Sobrecarga operacional do estrategista ("cada atividade gera mais 10") + ansiedade de lançamento | ★★★★ | 4-5 | Magnus | v2 (gestão de lançamento) |
| 5 | Equipe: achar/pagar/reter bons profissionais (gestor, editor, social, closer, CS) | ★★★★ | 3-4 | todos | tese central (organograma de agentes) |
| 6 | Relatórios manuais (pro próprio dono E pro cliente do estrategista) | ★★★ | 3-4 | todos | v1.x (relatórios + push) |
| 7 | Criativos: fadiga, volume, "anúncio com cara de anúncio", minerar vencedores | ★★★ | 3-4 | todos | ✅ já existe (criar-criativo + Radar) — evoluir |
| 8 | Automações frágeis (Make/N8N/ManyChat quebrando, caras) | ★★★ | 4 | todos | tese determinístico-primeiro |
| 9 | Bloqueio de BM/conta Meta sem explicação | ★★★ | 5 | todos | v1.x (alertas/saúde da conta) |
| 10 | Financeiro: taxas, parcelamento, impostos, fechamento manual | ★★ | 3 | Viking/Fluxo | pack futuro (Finance) |
| 11 | Compliance (Meta policies, OAB, nichos restritos, LGPD) | ★★ | 3-4 | Magnus/Fluxo | pack futuro / feature do Gestor |
| 12 | Golpes/pirataria em lançamentos (grupos falsos, páginas piratas) | ★★ | 5 | Fluxo | oportunidade nova (monitor) |

---

## 3. O que o VOC VALIDA na v1 já decidida (spec 2026-06-10)

### 3.1 Visão Empresa (Meta × Hotmart = lucro real) — validação forte
- Pedido verbatim do dashboard consolidado: *"Stract coleta e centraliza os dados, looker fica visual e traz comparativo, gemini lê os dados do período, gera o resumo, traduz em insights e traz pro whats via make"* — Mariana (Magnus, 02/03). **Uma mentorada montou com 4 ferramentas exatamente o que a visão Empresa entrega nativa.**
- Soluções caseiras pagas que provam disposição a pagar: **DashFacil R$197/mês**, VK Metrics, dashboards Looker Studio artesanais (Alessandra, Magnus 06/08).
- **⚠️ Refinamento obrigatório do VOC — "ROI real":** *"ROI faturado mesmo, sem contar parcelamento no boleto"* (Julio, Fluxo 22/05) · *"o produto custa 1.200 e a Hotmart cobra 200 pra antecipar o recebível"* (Lucas, Viking 06/04) · 12% de imposto sobre tráfego Meta em 2026 (Magnus 08/09). → A visão Empresa deve calcular **lucro líquido de taxas/antecipação/imposto**, não receita bruta − gasto. É o diferencial vs todo dashboard do mercado, e é puramente determinístico.

### 3.2 Gestor de Tráfego (diagnóstico) — validação forte
- A dor #1 em volume nos 3 grupos é exatamente "os números estão ruins e eu não sei por quê": *"nada está performando bem. Não estou conseguindo entender pq!"* (Thais, Magnus) · *"Criativos com CPL nas alturas, já troquei 3 vezes. Nada de leads chegando"* (Priscila, Magnus) · *"Advantage está péssimo dessa vez! Nem está entregando e gastando nosso dinheiro de tão ruim"* (Thais, Magnus) · *"Não estou conseguindo ver o que poderia ser melhorado nesse caso"* (Luiza, Magnus).
- O grupo funciona como "gestor de tráfego coletivo" — eles postam prints do gerenciador e pedem diagnóstico uns aos outros. **O Gestor de Tráfego do Magnus é esse colega experiente, on-demand, com os dados já carregados.**
- Benchmark de mercado: a VK lançou *"nossa IA pra analisar seus criativos e padrões que estão dando bom"* (Pedro Arduini, Viking 16/03) — concorrência validando a categoria; o moat do Magnus é diagnóstico com a metodologia + contexto da marca + lucro real (não só métrica de ad).

---

## 4. Backlog priorizado de PRÓXIMAS implementações (pós-v1)

### P1 — Relatório executivo entregue + alertas de anomalia (v1.x, ~semanas pós-v1)
**Dor:** relatório manual toma horas; o dono quer o número no bolso; o estrategista precisa entregar relatório pro CLIENTE dele.
- Pedido verbatim: *"estrutura de gerar relatórios automatizados, com comparativo entre dias, e com disparo automático para o whatsapp do cliente"* — Rodrigo Canadá (Magnus, 02/03). É literalmente uma feature request do Magnus OS.
- *"Um relatório simples com número de vendas do dia anterior de cada produto"* — Vitor (Fluxo) já faz isso na mão todo dia.
- **Implementação:** (a) relatório diário/semanal da visão Empresa gerado determinístico + resumo em linguagem natural (IA barata, Haiku) entregue por WhatsApp/e-mail; (b) **modo "relatório pro cliente"** — o estrategista gera um link/PDF white-label por cliente (vira ferramenta de retenção do cliente DELE); (c) **alertas**: campanha parou de gastar, CPA estourou o teto, ROAS abaixo do breakeven N dias, conta com restrição — regras determinísticas, zero IA.
- Por que P1: aproveita 100% a infra da v1 (dados já consolidados), dor universal, e o push diário cria o **hábito** que segura churn da assinatura.

### P2 — Checklist/cockpit de lançamento (v2)
**Dor:** lançamento = caos manual e ansiedade (int. 5 no grupo Magnus): *"cada atividade gera mais 10 atividades... Sobe a LP, aí tem o Typeform, aí tem a integração, aí tem o questionário, aí tem o público, aí tem o criativo hahahaha socorro!"* (Raquel) · página fora do ar no pico, pixel não configurado, expert na sala errada, link quebrado no story.
- **Implementação:** template de cronograma de lançamento (a metodologia Magnus já define as fases) + checklist técnico **verificável por máquina**: o painel testa a página (200/velocidade), o link de grupo/WhatsApp, o pixel disparando, a UTM presente — determinístico, estilo "pre-flight check" de avião. IA só pro replanejamento ("atrasou X, o que reordenar?").
- Vira a lane do **Estrategista** (pack-âncora da metodologia) na prática.

### P3 — Escrita gated na Meta (v2 — "aplicar recomendação")
**Dor:** o diagnóstico sem botão deixa trabalho na mesa; mas o medo de automação errada é real.
- **Implementação:** cada recomendação do Gestor de Tráfego ganha botão "Aplicar" → broker executa via Graph API (pausar ad, ajustar budget dentro de teto) **só com aprovação explícita** (draft-first do curso Jarvis). Auditoria completa no histórico.

### P4 — Pack CRM/Atendimento WhatsApp white-label (v3 — protótipo Omni CRM já existe)
**Dor:** int. 5, volume altíssimo — API instável, atendimento disperso, custo de equipe comercial, IA comercial é o assunto mais quente: *"8 vendas oficiais da Sofia, 21 participações... Tá quase o triplo nos low tickets... 24h por dia, respostas imediatas e sem comissão"* (Vitor, Fluxo 08/11) · *"Nossa IA comercial está conseguindo converter 8%"* (Vini, Fluxo) · pedidos diretos de "IA de vendas pra plugar no direct" (Guilherme, Fluxo).
- **Implementação:** o CRM white-label que o Yuri já construiu (Omni/crm-amc) vira pack do Magnus: inbox unificada, disparos com cadência segura (score do número), closer IA com a metodologia de vendas Magnus (módulo 4), comissionamento bot-vs-humano (dor real do Fluxo).
- Riscos a respeitar do VOC: *"instruções de agentes não são — e nunca serão — seguras"* (Renato, Fluxo) → não pôr segredo de negócio no prompt; bans → cadência conservadora por padrão.

### P5 — Monitor de saúde & contingência (v2-v3, determinístico)
**Dor:** int. 5 — *"não tem nada que viole a política da Meta... CNPJ em dia.. BM verificada.. bizarro"* (André, Magnus 19/01, conta bloqueada) · golpistas: *"um golpista mandou whatsapp individual muito bem feito pra várias pessoas da nossa lista... e algumas pessoas caíram"* (Luciana, Fluxo 20/05).
- **Implementação:** (a) monitor de status — conta de anúncios restrita/instável, pixel sem eventos, página fora do ar → alerta imediato; (b) **monitor anti-golpe** (diferencial inédito): varredura por páginas/perfis clonando a marca do cliente (o Radar já tem a infra de scraping) + playbook de resposta. Ninguém no mercado entrega isso pra esse público.

### P6 — Pack Financeiro (futuro — protótipo Finance Copilot existe)
**Dor:** fechamento manual, taxas invisíveis, imposto: *"estou automatizando meu fechamento mensal pelo Claude"* (Renato, Viking 07/04 — early adopter fazendo na mão o que o pack entregaria).
- **Implementação:** conciliação Hotmart/gateways → DRE simples da operação, custo de ferramenta por lançamento, projeção de caixa com sazonalidade. Depois da visão Empresa estar madura.

### P7 — Evoluções de criativos (contínuo, sobre o que já existe)
**Dor:** *"Entra copy sai copy aqui e os roteiros são sempre a mesma ladaia (anúncio com cara de anúncio)"* (Vinicius, Fluxo) · *"existe alguma IA que faz criativos estáticos?"* (Telma, Fluxo) · *"Pra gerar variação de criativos vai ficar sinistro"* (Matheus, Viking).
- **Implementação:** o trio criar-criativo/Radar/insights já cobre o núcleo; evoluir com análise de padrão dos vencedores (por que o ad X ganha — ângulo, formato, hook) alimentando os presets. Benchmark: VK Metrics IA fez isso de fora pra dentro; o Magnus tem o contexto da marca.

### Fora do radar por ora (decisão consciente)
- **Ferramenta de chips/grupos WhatsApp "crua"** (aquecimento, rotação): dor enorme mas terra de ninguém (ToS, bans) — entrar só via API oficial no pack CRM.
- **Recrutamento/RH**: dor real, fit baixo com o produto (a resposta do Magnus à dor de equipe é o agente, não um ATS).
- **Área de membros/checkout**: mercado saturado (Hotmart etc.), sem moat.

---

## 5. Implicações de pricing (dados do VOC)

- O mercado já paga: DashFacil **R$197/mês** (só dashboard), GHL **$97-497/mês**, VK Metrics, FrontCRM, SendFlow, ManyChat, ActiveCampaign — um dono típico empilha **R$500-2.000+/mês** em ferramentas e reclama disso.
- Âncora de equipe: gestor de tráfego R$1.500-3.500 + editor R$2-4k + social R$2.5k... — *"Acabei de dispensar o meu gestor pois o valor está acima do que estamos podendo arcar"* (Leticia, Magnus).
- → O cenário C de pricing (R$297 base / R$697 completo / R$997 hosted premium, doc visão-plataforma 2026-06-09) está **dentro** do que esse público já gasta em UMA ferramenta de dashboard + fração de UM júnior. O pitch de consolidação ("cancele 3 assinaturas") paga o Magnus sozinho.

---

## 6. Frases pra copy (guardar pro funil)

- *"O dinheiro que você não tem, tá no dado que você não olha."*
- *"Cada atividade gera mais 10 atividades... socorro!"*
- *"Na hora da entrevista todo mundo é bom, na hora de trabalhar mesmo, nenhum sentou a bunda na cadeira."* (dor de contratação → agente não falta segunda-feira)
- *"Mesma estratégia, mesmo investimento e metade das vendas que fiz ano passado."* (volatilidade → precisa de diagnóstico contínuo)
- *"24h por dia, respostas imediatas, abordagens cronometradas e sem comissão."* (a venda do agente, dita por um cliente)

---

*Metodologia: 18 extrações paralelas (voc-processor) sobre os exports limpos (mídia/sistema removidos), 4 eixos por fatia (temas+intensidade, citações verbatim, pedidos explícitos, soluções caseiras), síntese manual cross-grupo. Nomes citados = primeiro nome + grupo + data, uso interno de produto. Vieses conhecidos: grupos de mentoria enviesam pra quem está em lançamento; Viking/Fluxo têm operações maiores que o ICP inicial do Magnus.*
