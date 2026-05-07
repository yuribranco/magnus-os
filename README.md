# magnus-os — Kit Magnus

Sistema operacional Magnus dentro do Claude Code. Skills, integrações
e playbooks pra transformar você de operador num operador multiplicado.

## Pré-requisitos

- Conta Claude Pro ou Max (Free não funciona)
- Cursor instalado (https://cursor.com/download)
- Node 18+ (https://nodejs.org)
- Git
- Mac ou Windows

## Instalação

> Recomendado durante a Aula 1: você não precisa rodar `git clone` manual.
> Cria uma pasta vazia, abre o Cursor nela, instala o Claude Code e PEDE
> pro Claude clonar este repositório + configurar tudo. Ver Bloco 3 da
> landing pra o prompt exato.

Modo manual (se preferir):

1. Clone o kit:
   ```bash
   git clone https://github.com/yuribranco/magnus-os
   cd magnus-os
   ```

2. Personalize seu DNA:
   - Abre `business-brain.md`
   - Preenche os 4 slots: ICP, ofertas, voice, regra-âncora
   - Salva

3. Abre o Cursor na pasta `magnus-os/`, abre o terminal integrado (Ctrl+`),
   roda `claude` (autentica no browser na primeira vez)

4. Testa:
   ```
   /competitive-scraping https://exemplo.com
   ```

5. Configurar credenciais MCP (Aula 2):
   ```bash
   cp .env.example .env
   # editar .env com credenciais — instruções na Aula 2
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
- Travou? Posta no canal — comunidade Magnus + equipe disponível.

## Landing da Imersão

https://magnus.yuribranco.com.br/magnusos
