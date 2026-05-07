# magnus-os — Kit Magnus

Sistema operacional Magnus dentro do Claude Code. Skills, integrações
e playbooks pra transformar você de operador num operador multiplicado.

## Pré-requisitos

- Claude Pro ou Max (Free não funciona)
- Claude Desktop instalado (claude.ai/download)
- Node 18+
- Git
- Mac, Linux ou Windows com WSL/Git

## Instalação

1. Clone o kit:
   ```bash
   git clone <url-do-repo> magnus-os
   cd magnus-os
   ```

2. Configure suas credenciais (na Aula 2):
   ```bash
   cp .env.example .env
   # depois edite .env com suas credenciais — instruções na Aula 2
   ```

3. Personalize seu DNA:
   - Abra `business-brain.md`
   - Preencha os 4 slots: ICP, ofertas, voice, regra-âncora
   - Salve

4. Abra Claude Desktop, vai em "Code", aponte pra pasta `magnus-os/`

5. Teste:
   ```
   /competitive-scraping https://exemplo.com
   ```

## Estrutura

```
magnus-os/
├── CLAUDE.md              ← kernel do kit (lido em toda sessão)
├── business-brain.md      ← DNA do seu negócio (você preenche)
├── learnings.md           ← lições acumuladas (auto-preenche)
├── .mcp.json              ← integrações externas (Aula 2)
├── .claude/
│   ├── settings.json      ← permissões + permission mode
│   └── skills/            ← skills disponíveis (4 ativas)
└── clients/               ← pastas por cliente/projeto
    └── EXEMPLO/           ← template — duplique pra cada cliente
```

## Skills incluídas

| Skill | O que faz |
|---|---|
| `competitive-scraping` | Análise de concorrente com lente Magnus |
| `ba` | Breakthrough Advertising completo (Eugene Schwartz) — diagnostica + escreve copy de qualquer formato |
| `schwartz-headline` | Atalho pra gerar variações de headline nos 5 níveis de awareness |
| `briefing-avatar` | Briefing de avatar pelo método Magnus |

## Próximas aulas

- **Aula 2:** ativa MCPs externos (Gmail, Drive, Hotmart) +
  magnus-mentor (cérebro Magnus rodando local) + criar skill autoral
- **Aula 3:** subagentes + hooks + output style + distribuição pra equipe

## Suporte

- Canal Magnus: [link no canal]
- Office hours: 1 sem após cada aula
- Travou? Posta no canal — cohort + equipe disponível.
