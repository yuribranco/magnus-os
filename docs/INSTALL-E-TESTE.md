# Magnus OS — Instalar do zero e testar tudo (guia do cliente)

> Versão atual do produto: **v1.2.0** (Radar com campanhas).
> Você nunca toca no GitHub. Baixa o produto pela sua licença e atualiza com 1 comando.

---

## Pré-requisitos (tenha isto antes)

1. **Claude Code instalado** (o comando `claude` no terminal) + sua **assinatura Claude** (o Magnus OS roda na sua assinatura — sem custo de API).
   - Testar: `claude --version` deve responder.
2. **Node.js 18+ e npm** (pro painel/GUI).
   - Testar: `node -v` e `npm -v` devem responder.
3. **Sua license-key** do Magnus OS (ex: `MOS-XXXX-XXXX-XXXX`).
4. **Chave do Gemini** (grátis, pros criativos) — pegue depois em https://aistudio.google.com/apikey

---

## Passo 1 — Instalar (1 comando)

No terminal, cole:

```bash
curl -fsSL "https://vbmvzmibupzpjwyrfmjs.supabase.co/storage/v1/object/public/magnus-os-public/install.sh" | bash -s -- --key SUA-LICENSE-KEY
```

O instalador faz tudo sozinho:
1. valida sua licença;
2. baixa o Magnus OS (gated pela licença);
3. instala as skills no Claude Code (`/magnus-os:*`);
4. cria o workspace da sua empresa em `~/magnus-os`;
5. sobe o painel (GUI) em `http://localhost:3940` e abre o navegador.

> Vai perguntar onde criar o workspace (Enter aceita `~/magnus-os`).

---

## Passo 2 — Configurar (no painel que abriu)

Na tela `/boot` do painel:

1. **Cole a chave do Gemini** (pros criativos).
2. **Preencha os dados da empresa** — 4 conversas curtas: **empresa, time, voz, design**.
   - Pode fazer pelo painel, ou no Claude Code (ver Passo 3).

### Configurar o Radar (pra espionar concorrentes)
No painel → **Configurações**:
- **Licença do Radar:** sua license-key (a mesma).
- **URL do Radar:** `https://radar-api.yuribranco.com.br`

---

## Passo 3 — Usar e testar tudo

As **ações** rodam no Claude Code dentro do workspace; o **painel** mostra o resultado. Abra outro terminal:

```bash
cd ~/magnus-os
claude
```

Aí dentro, invoque as skills (digite `/magnus-os:` pra ver a lista). Checklist de teste:

| # | Testar | Como | Onde vê o resultado |
|---|--------|------|---------------------|
| 1 | Empresa/time/voz/design | `/magnus-os:preencher-empresa` (e `-time`, `-voz`, `-design`) | painel atualiza |
| 2 | **Criar criativo** (imagem) | `/magnus-os:criar-criativo` → descreva o anúncio | imagem gerada (Gemini) |
| 3 | **Criar post** | `/magnus-os:criar-post` | post pronto |
| 4 | **Criar landing** | `/magnus-os:criar-landing` (usa o copy-chief) | HTML da página |
| 5 | **Checar marca** | `/magnus-os:checar-marca` em cima de um asset | relatório on-brand |
| 6 | **Lançar campanha** | `/magnus-os:lancar-campanha` | campanha estruturada |
| 7 | **Radar (espionar concorrente)** | `/magnus-os:radar` → "espionar Pedro Sobral" → escolha a página | painel → seção **Radar**: campanhas do concorrente, URL de destino de cada, e os melhores anúncios |
| 8 | **Dashboard Meta** | `/magnus-os:sincronizar-meta` → conecte a Meta | painel → aba Resultados (ROAS, funil, ads ranqueados) |

**Teste-chave do Radar (a feature nova v1.2.0):** depois do `radar`, atualize o painel — você verá **quais campanhas o concorrente roda**, a **URL de destino** de cada uma, e os **melhores anúncios** de cada campanha.

---

## Passo 4 — Atualizar (pegar tudo que for novo)

Quando sair versão nova, o painel avisa. Pra atualizar sem perder nada:

```bash
cd ~/magnus-os && claude
# dentro:
/magnus-os:atualizar
```

Ou pelo botão de update no painel. O updater baixa o artefato novo, atualiza o plugin + painel e preserva seu workspace (empresa, campanhas, configs).

---

## Se algo falhar

- **`claude` não encontrado:** instale o Claude Code e rode o Passo 1 de novo.
- **Painel não subiu:** `cd ~/.claude/magnus-os/painel && npm ci --omit=dev` e veja `~/.claude/magnus-os/painel.log`.
- **Licença não autorizada:** confira a key.
- **Radar vazio:** confira Licença + URL nas Configurações.

> Workspace: `~/magnus-os` · Config/logs: `~/.claude/magnus-os/`
