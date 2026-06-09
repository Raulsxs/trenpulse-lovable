# Formato "Carrossel Editorial Viral" — Playbook + Arquitetura

> Estudo do formato usado por educadorafm, gui.zanoni, jorgedesa, corripranaosurtar, hugorodriguess, jonathancadore. Como replicar programaticamente no TrendPulse. (2026-06-09)

## O que é
"Mini-revista cinematográfica": **foto dramática full-bleed** + **moldura editorial** (handle, kicker tipo "BREAKING NEWS", indicador "1/10", pill de hashtag) + **headline condensada caixa-alta com palavras-chave coloridas**. O 1º slide é o gancho de curiosidade. Engaja 20-50k+ likes.

## Specs de design (canvas 1080×1350, 4:5)
- **Grid em 3 faixas:** topo (0-15%) = moldura editorial; meio (15-60%) = só foto (respiro cinematográfico); terço inferior (60-100%) = scrim + headline + pill + footer.
- **Safe zone:** 64px de margem.
- **Tipografia:** headline = condensada ultra-bold caixa-alta — **Anton** (grátis, 90% do look) ou **Druk** (pago, premium). Alternativas: Bebas Neue, Saira Condensed, Oswald. Tamanho 88-120px, `line-height: 0.92`. Moldura = sans neutra (Inter/Archivo) 22-28px, `letter-spacing` largo.
- **Destaque de palavra-chave** (o truque que vende): 1-3 palavras em cor sólida, sublinhado grosso, OU highlight box. Paleta por vibe: esporte/notícia = vermelho; saúde mental = verde-água `#19E5C5`/creme; negócios = amarelo-ouro.
- **Scrim** (legibilidade): `linear-gradient(to top, rgba(0,0,0,.85), rgba(0,0,0,.55) 28%, transparent 55%)` no terço inferior. Vinheta opcional.

## Headline frameworks (curiosity gap; **palavra** = destaque)
1. Reframe: "O QUE PARECEU **[X]** FOI, NA VERDADE, **[Y]**."
2. Lado oculto: "O LADO DE **[TEMA]** QUE **NINGUÉM** TE CONTA."
3. Erro confessado: "FIZ **[X]** ERRADO POR **[TEMPO]** — ATÉ DESCOBRIR ISSO."
4. Número+padrão: "ANALISEI **[N] [CASOS]**. O PADRÃO EM **TODOS**:"
5. Paradoxo: "QUANTO MAIS VOCÊ **[X]**, MENOS VOCÊ **[Y]**."
6. Custo escondido: "O QUE **[HÁBITO]** FAZ COM SEU **[X]** — SEM VOCÊ PERCEBER."
7. Pergunta-acusação: "POR QUE VOCÊ **[X]** MESMO SABENDO QUE **[Y]**?"
8. Inversão: "TUDO QUE TE ENSINARAM SOBRE **[TEMA]** ESTÁ **ERRADO**."
(+ urgência editorial, mini-história, promessa ancorada no tempo.)

## ⭐ Como replicar: arquitetura HÍBRIDA (recomendada)
**O texto NUNCA sai do modelo de imagem.** O modelo gera **só a foto** (pixels, sem tipografia); toda a tipografia editorial é **overlay determinístico**.

```
ai-chat (intent novo: GENERATE_EDITORIAL_CAROUSEL)
  ├─ 1. minimax estrutura: headline TOKENIZADA {texto, destaque?}, photo_prompt "SEM TEXTO",
  │     kicker, badge, paleta, handle (do perfil)
  ├─ 2. generate-slide-images → gera SÓ A FOTO (prompt termina "no text, no letters")
  │     OU usa a foto pessoal do brand (Maikon)
  └─ 3. render-slide-image → compõe: foto(bg) + scrim + moldura + headline com palavras
        coloridas + pill + "1/N". Pixel-perfect, texto pt-BR 100% fiel.
```

**Por quê híbrido e não "modelo assa tudo":**
- Modelo-assa-tudo = controle de layout zero (handle/badge/"1/10"/quais palavras colorir = o modelo "adivinha") + garble de pt-BR (o problema do Maikon).
- Híbrido = layout de revista pixel-perfect + acento pt-BR nunca quebra (fonte real) + barato (overlay não custa IA) + troca de marca via CSS.

**⚠️ Tensão com decisão passada:** a memória diz "Satori abandonado, não re-propor" — mas aquilo foi no contexto de Satori brigando com o pipeline / renderizando a imagem toda. AQUI o Satori faz só o que ele é bom: **texto e caixas vetoriais sobre uma foto de fundo** (o caso canônico dele, OG images). Limitações: só flexbox (o layout de 3 faixas é trivial), precisa **embutir o .ttf** (Anton/Bebas com acentos pt-BR). Plano B se não quiser reabrir Satori: `@napi-rs/canvas` (controle total, "na unha") ou HTML-to-image headless (mais fiel, mais pesado). **Decisão do Raul.**

## Adaptação pro Maikon (saúde)
- Foto pessoal dele já existe (brand `photo_backgrounds`) → entra como bg do overlay (não precisa gerar IA).
- Paleta verde-água/creme (não o vermelho de "notícia"). Kicker "SAÚDE"/"DR. MAIKON" (não "BREAKING NEWS").
- Ganchos de reframe/custo-escondido (autoridade médica, sem sensacionalismo). Slide de fonte/contexto antes do CTA (compliance).

## Por que isso importa pro produto
É um **formato diferenciado** que ferramentas tipo Predis NÃO fazem bem (elas usam templates genéricos). O layout editorial com palavras coloridas + moldura de revista é o diferencial. Forte pro nicho saúde do Maikon. Candidato a **feature/template nova** (Horizonte 3 do roadmap).
