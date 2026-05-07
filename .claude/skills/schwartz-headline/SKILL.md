---
name: schwartz-headline
description: Gera variações de headline aplicando os 5 níveis de awareness × 5 níveis de sophistication de Eugene Schwartz. Use quando o usuário pedir headline, título, hook, lead, ou variações de uma headline existente. Sempre cita awareness e sophistication em comment no topo.
allowed-tools: Read, Write
---

# Schwartz Headline Generator

Quando o usuário pede headline ou variação:

## Passo 0 — Calibrar pelo negócio (OBRIGATÓRIO)

Lê `@business-brain.md` (raiz do projeto). Extrai:
- **ICP** → headlines falam pra esse público específico
- **Top 3 ofertas** → identifica se a headline é pra qual oferta (e ticket informa a sofisticação esperada)
- **Voice (sempre/nunca)** → AS HEADLINES DEVEM RESPEITAR a voice. Se voice diz "nunca usar 'descubra como'", essas variações NÃO podem aparecer.
- **Regra-âncora** → se for "Schwartz First", headlines obrigatoriamente declaram awareness no comment.

Se algum slot do business-brain estiver com placeholder, peça ao usuário pra preencher antes de gerar — caso contrário, headlines saem genéricas.

## Passo 1 — Coletar contexto adicional

Depois do Passo 0, pergunte (se não dado):

- Produto / oferta (qual das 3 do business-brain?)
- Mecanismo único (se existe)
- Canal (page hero, ad, email subject, etc)

## Passo 2 — Gerar 5 headlines

Uma para cada nível de awareness:

1. **Unaware** — headline que abre a dor sem nomear solução
2. **Problem-aware** — headline que nomeia a dor explicitamente
3. **Solution-aware** — headline que apresenta a categoria
4. **Product-aware** — headline que fala diretamente do produto
5. **Most-aware** — headline com gatilho final (oferta, urgência, garantia)

Calibre o sophistication level com base no mercado (1–5).

## Output

```
<!-- Awareness: variando 1-5 | Sophistication: X/5 [calibrado pelo mercado] -->

### Awareness 1 (Unaware)
[headline]

### Awareness 2 (Problem-aware)
[headline]

### Awareness 3 (Solution-aware)
[headline]

### Awareness 4 (Product-aware)
[headline]

### Awareness 5 (Most-aware)
[headline]

---
Notas:
- Sophistication aplicada: X/5 — [razão pela calibração]
- Recomendação: usar awareness Y porque [contexto do canal/audiência]
- A/B sugerido: testar [par específico]
```

(Esta skill será expandida na Aula 2.)
