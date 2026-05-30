# Magnus OS — Briefing de Arquitetura & Distribuição

> Documento de decisão. Autossuficiente (pode ser lido sem nenhum outro contexto, inclusive no Claude web).
> Objetivo: decidir **como distribuir e atualizar** o produto, e avaliar a **viabilidade de manter app Mac + Windows**.
> Data: 2026-05-29.

---

## 1. O que é o Magnus OS

**Produto:** um "Orquestrador Empresarial" — um sistema que transforma o **Claude Code do próprio
cliente** no "sistema operacional" da empresa dele. O cliente descreve a empresa uma vez
(quem é, time, voz da marca, design) e passa a rodar **campanhas, criativos, landing pages, posts
e lançamentos** via comandos/skills, com uma **interface gráfica (painel)** local.

**Modelo de negócio:** produto **low-ticket de entrada (tripwire)**, self-serve, vendido pela marca
**Veritas** pro público **dev / AI-savvy que já usa Claude Code**, como porta de entrada pra fazer
**upsell da mentoria high-ticket Magnus**. Mentorados recebem bundled. Vendedor brasileiro
(Hotmart como gateway de pagamento + emissão de licença).

**Promessa central:** "sua empresa inteira operando dentro do Claude Code" / "o sistema operacional
do seu negócio com IA" — rodando na **própria assinatura Claude** do cliente (custo de inferência
**zero** pra ele além da assinatura que já paga, e **zero** pra nós).

**Avatar:** empreendedor/operador que já tem Claude Code (ou topa instalar), quer marketing
operado por IA sem montar equipe, e topa um produto de entrada barato. Pode ou não ser técnico —
e é aí que mora a tensão deste documento.

---

## 2. Como funciona hoje (componentes técnicos) + estado atual

São **quatro peças**:

1. **Plugin Claude Code (`magnus-os`)** — o "miolo": skills (`criar-criativo`, `criar-landing`,
   `criar-post`, `lancar-campanha`, `checar-marca`, `preencher-*`, `copy-magnus`), um hook de
   licença (fail-open) e config de MCP (Notion/Canva). Instala no Claude Code via
   marketplace privado. As skills são `.md` (instruções) + alguns scripts shell.

2. **Painel (GUI local)** — um app **Next.js** que roda em `localhost` na máquina do cliente.
   Mostra a empresa, as campanhas, e dispara as skills por botões. **Aqui está o truque central:**
   o painel usa o **`@anthropic-ai/claude-agent-sdk`**, que **sem API key** roda na **assinatura
   Claude local do cliente** (o login que já está em `~/.claude/`). Resultado: a IA roda de graça.

3. **Emissor de licença (Supabase)** — Edge Functions: webhook da Hotmart (cria licença na compra),
   `license-validate` e `plugin-download` (entrega o produto **gated** por licença válida). Tabela
   `licencas` (key, status granted/revoked, plano). Tudo já **LIVE**.

4. **Instalador** — hoje um `install.sh` (`curl … | bash`): valida a licença, baixa o produto
   gated, instala o plugin no Claude Code, materializa o workspace da empresa e **sobe o painel**.

**Única chave que o cliente digita:** a do **Gemini** (só pros criativos em imagem). A IA de texto/
orquestração é a assinatura Claude dele.

**Estado atual:** peças 1–4 construídas e provadas (backend live, plugin validado, painel funcional
rodando skills multi-turno, instalador one-liner funciona). Recém-resolvido um bug que travava a
entrevista (config `output: standalone` do Next). **Em construção agora:** mecanismo de
**atualização** (o motivo deste documento).

---

## 3. A restrição inviolável: a inferência TEM que ser local

Esta é a "lei da física" do projeto, e ela decide tudo:

- A inferência é **grátis** porque roda na **assinatura pessoal e local** do cliente — o login
  OAuth do Claude Code que vive em `~/.claude/`. O Agent SDK, **sem API key**, usa esse login.
- **Não existe** um "Login com Claude" oficial que autorize um **servidor de terceiro** a gastar a
  assinatura Pro/Max de alguém. O caminho sancionado pra um servidor usar o Claude é a **API**, que
  é **paga por token**.
- Pra um servidor nosso usar a assinatura do cliente, teria que **capturar o token pessoal dele e
  fazer proxy** da inferência. Isso é (a) **frágil** (tokens rotacionam, atrelados ao device) e
  (b) **violação do ToS** da Anthropic (assinatura pessoal proxiada por serviço compartilhado) —
  risco real de **ban da conta** e morte do produto.

**Conclusão dura:** **servidor rodando o Claude ⇒ API ⇒ custo.** O sonho do "best of both worlds"
literal (nosso servidor + assinatura do cliente) **não existe**. A inferência **fica local**.
*(Bônus: isso vira argumento de venda — roda na SUA conta, seus dados não saem da sua máquina.)*

> ⚠️ A redação exata do ToS deve ser confirmada antes de qualquer decisão final, mas a mecânica de
> auth (login local pessoal vs API paga) é a forma como o Claude Code funciona hoje.

**Mas:** a sua dor real não é "quero um servidor" — é **"o install/update é complexo demais pra um
leigo"**. E *isso* a gente resolve **sem** mover a inferência. Cursor, VS Code, Slack, Discord são
**apps locais que se auto-atualizam** a partir de um servidor de versão. É exatamente o modelo: o
"servidor" vira só o **host de versão/licença** (que já existe), e a parte local passa a **se
atualizar sozinha**, sem terminal.

---

## 4. As arquiteturas possíveis (A / B / C) e a inviável (D)

| | Onde a IA roda | O que fica local | Updates | Simplicidade p/ leigo |
|---|---|---|---|---|
| **A. Local puro (hoje)** | máquina do cliente | **tudo** (plugin + painel) | manual (frase no chat) | ❌ dev-y (curl, npm, terminal) |
| **B. App local auto-atualizável** | máquina do cliente | **tudo**, num instalador 1-clique que se atualiza ao abrir | **automático** (silencioso) | ✅ como qualquer app |
| **C. UI no servidor + conector local** | máquina do cliente | só um **daemon fino** (roda a assinatura + acessa arquivos) | **automático** (UI/skills = SaaS) | ✅✅ "abre um site" |
| **D. Tudo no servidor** | ❌ servidor | nada | automático | — **INVIÁVEL** (vira API paga / proxy ilegal) |

### A — Local puro (o que está construído)
Tudo na máquina, update via "frase no chat" (o cliente fala "Atualize o Magnus OS" e o agente do
painel roda um script). Funciona, é o mais barato de terminar, mas tem cara de ferramenta de dev
(o install ainda é `curl | bash` + `npm ci`). Ok pro público dev; ruim pro leigo.

### B — App local que se auto-atualiza (o "Cursor model")
Vira um **app de 1 clique** (`.dmg`/`.pkg` no Mac, `.exe`/instalador no Windows). O cliente baixa,
instala, ele **detecta/usa o login do Claude** e, dali pra frente, **se atualiza sozinho ao abrir**,
igual Cursor/VS Code. O "servidor" é só o host de versão+artefatos (que já temos). Inferência 100%
local. **Mata a dor do leigo** e reaproveita ~tudo que foi construído (o painel Next + o emissor de
licença + o manifest de versão).

### C — UI no servidor + conector local fino (o "SaaS com agente local")
O cliente abre um **site** (`app.magnus…`), sempre atualizado, onde mora **a UI e as skills** (como
um SaaS normal, single codebase). Esse site conversa com um **daemon pequeno e estável** instalado na
máquina do cliente, que é quem **roda a assinatura Claude dele e acessa os arquivos da empresa**.
O que muda com frequência (UI, skills, prompts) é servidor → **update automático de verdade**; o
daemon local é mínimo e raramente muda. **Máximo de "mágico" pro leigo.** Custo: bem mais
engenharia — **ponte navegador↔localhost** (CORS/segurança), protocolo e **auth entre o site e o
daemon**, manter o daemon rodando (tray/serviço), e a fragilidade típica desse bridge.

### D — Tudo no servidor — **NÃO** (rodaria via API paga ou proxy que viola o ToS)

---

## 5. A questão Mac + Windows: custo de manter dois apps

Esta é a sua pergunta central. O peso do "dois apps" **muda muito por opção**, por causa de **três
fontes de custo cross-platform**:

### 5.1. As três fontes de custo cross-platform
1. **Scripts shell (bash) são Unix-only.** Todo o install/update de hoje (`install.sh`,
   `update.sh`) e alguns scripts de skill (`gen_image.sh`, `render_html.sh`) são **bash** — **não
   rodam no Windows** sem WSL. Suportar Windows "de verdade" = **reescrever essa lógica** de forma
   cross-platform (em Node/JS, ou embutida no app). Esse é o maior pedaço escondido.
2. **Empacotamento + assinatura por SO.** Cada SO tem seu instalador e sua **assinatura de código**
   (senão o usuário vê aviso assustador):
   - **Mac:** Apple Developer Program **US$ 99/ano** + notarização (processo automatizável).
   - **Windows:** certificado de code signing — OV ~US$ 200–400/ano, ou o novo **Azure Trusted
     Signing ~US$ 10/mês**. Sem isso, o **SmartScreen** assusta o usuário.
3. **Runtime + caminhos + processos.** Bundlar o **Node** (o painel é Next/Node), lidar com paths
   (`~/.claude` vs `%USERPROFILE%\.claude` — o Claude Code já normaliza, mas nosso código precisa),
   manter o processo do painel vivo (tray/serviço) em cada SO, e o **auto-updater** por SO.

### 5.2. Stacks pra um app desktop cross-platform (opção B/C)
| Stack | Tamanho | Auto-update | Esforço | Observação |
|---|---|---|---|---|
| **Electron** | ~85–150 MB | `electron-updater` (maduro, feed em S3/Supabase Storage) | menor (só JS) | bundla Node nativamente — casa com o painel Next |
| **Tauri** | ~3–10 MB | updater nativo (assinado) | maior (Rust) | binário pequeno; roda Node como "sidecar" |
| **Launcher/tray fino** | médio | próprio (baixa do manifest) | médio | um wrapper que gerencia o painel Next + auto-update |

O **auto-update feed** pode morar no **Supabase Storage** que já usamos (electron-updater lê um
`latest.yml`/`latest-mac.yml`; Tauri lê um `latest.json` assinado). Ou seja, **não precisa de
infra nova** — o "servidor de update" é estático e já existe.

### 5.3. Matriz de esforço de manter 2 SOs, por opção
| Opção | Superfície cross-platform | Peso de manter Mac+Win |
|---|---|---|
| **A (local puro)** | **a stack local inteira** + reescrever bash→cross-platform | **Pesado** (e hoje é Mac/Unix-only) |
| **B (app local)** | **a stack local inteira** empacotada 2× + 2 assinaturas + 2 pipelines de build/teste | **Pesado, mas padronizado** (Electron/Tauri abstraem muito; o updater é resolvido) |
| **C (UI server + daemon)** | **só o daemon** (pequeno, estável) precisa ser 2-SO; UI+skills = **1 codebase** web | **Leve na parte que muda** / o 2-SO fica só no daemon mínimo |

**Insight-chave:** em **A e B**, *tudo* que muda com frequência precisa rodar nos 2 SOs → o custo de
"dois apps" é **alto e recorrente**. Em **C**, o que muda toda hora (UI, skills, prompts) é **web,
codebase único**; só um **daemon minúsculo e estável** precisa ser cross-platform → o custo de "dois
apps" é **baixo e raro** — em troca de **mais engenharia inicial** no bridge.

### 5.4. Você PRECISA de Windows no dia 1?
Vale pesar friamente: o público inicial (dev/AI-savvy que já usa Claude Code) é **majoritariamente
Mac/Linux**. O Claude Code no Windows roda via **WSL** (ambiente Unix), então **os scripts bash de
hoje funcionam pra quem usa Claude Code no Windows via WSL**. Caminhos legítimos de de-risk:
- **Mac-first** (e Linux/WSL "de brinde" pelos scripts bash), Windows nativo na fase 2.
- Lançar o **v1 na opção A/B Mac-first**, validar venda, e só então decidir Windows nativo ou pular
  direto pra **C** (que dilui o custo de 2-SO).

---

## 6. Recomendação e perguntas pra decidir

**Recomendação (minha leitura):**
- Se o objetivo é **validar a venda rápido** com o público dev: **A ou B, Mac-first** (Windows via
  WSL já cobre boa parte). B se você quer logo o "cara de app" pro upsell; A se quer ship imediato.
- Se o objetivo é **produto pra leigo em escala** e você aceita mais engenharia: **C** é o que dá a
  sensação de SaaS e **minimiza o custo de manter 2 SOs no longo prazo** (porque a parte que muda é
  web única; só o daemon é 2-SO).
- **Não** existe caminho que ponha a inferência no servidor sem virar custo de API / risco de ToS.

**Perguntas que decidem o rumo:**
1. **Windows nativo é obrigatório no lançamento**, ou Mac-first (+ Windows via WSL) serve pro v1?
2. O público real é **mais dev** (aceita 1 install técnico) ou **mais leigo** (precisa de "abre e usa")?
3. Qual a **pressa**? (A = dias; B = semanas; C = mais, pelo bridge.)
4. Topa o **custo recorrente de assinaturas de signing** (Apple US$99/ano + Windows) pra ter app
   "sem aviso assustador"?
5. A venda depende do produto parecer **SaaS** (site), ou um **app instalável** já cumpre o papel de
   tripwire pro upsell da mentoria?

---

## 7. Anexo — o que já está construído (reaproveitável em A/B/C)
- **Emissor de licença (Supabase)** — webhook Hotmart + validate + download gated. **LIVE.** Serve
  os 3 cenários (a licença gateia o acesso em qualquer um).
- **Manifest público de versão** (`manifest.json`) + estampagem de versão no build — **feito hoje.**
  É o "servidor de update" que A/B/C usam.
- **Painel Next.js funcional** (roda skills na assinatura local, multi-turno). Em A/B é o app; em C
  é a base da UI servidor + parte do daemon.
- **Plugin + skills** — o produto em si. Igual nos 3.
- **`update.sh` data-safe** (preserva 100% os dados da empresa; só troca código) — usado direto em
  A/B; em C a lógica migra pro daemon/servidor.

> **Regra de ouro que vale nos 3 cenários:** o **workspace da empresa** (contexto, campanhas,
> criativos, chave Gemini, histórico) é **sagrado** — **nenhum** update pode tocá-lo. Código e dados
> ficam em pastas separadas, e o updater só mexe no código.
