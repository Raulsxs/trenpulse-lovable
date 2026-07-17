# Spike técnico — Camada de texto editável

> Viabilidade de gerar conteúdo com o TEXTO como camada editável (não cozido no pixel).
> Motivação: LocalStudio.dev ("saída = camadas editáveis") + os bugs recorrentes desta semana
> (texto duplicado, acento sumido em CAIXA ALTA, marca/conteúdo errado — cada correção = regenerar).

## TL;DR
**Não é greenfield — é ressuscitar um modo que já existe.** O TrendPulse tinha um caminho
`ai_bg_overlay` (fundo AI + blocos de texto editáveis) com renderer, editor por bloco e drag —
foi desativado no refactor de abril quando "6 modos viraram 1" (`ai_full_design`, Gemini cozinha
tudo). A infra está **dormente, não deletada**. O maior ganho não é nem a editabilidade: é que
**texto renderizado por NÓS acaba com os bugs de acento/duplicação** (que são artefatos do modelo
de imagem, não do nosso código). Recomendo um **protótipo A/B de qualidade** antes de decidir o resto.

## Estado atual (inventário — o que já existe)

| Peça | Arquivo | O que faz |
|---|---|---|
| Renderer overlay | `src/components/content/SlideBgOverlayRenderer.tsx` | Desenha fundo + blocos (headline/body/bullets/footer/cta), **editável e arrastável** |
| Editor por bloco | `src/components/content/TextBlockToolbar.tsx` | Controles do bloco selecionado: tamanho de fonte, largura máx, sombra, alinhamento |
| Editor na tela | `src/pages/ContentPreview.tsx:1410-1458` | Liga tudo: `editable`, `onPositionChange` (drag), `onSelectBlock` + toolbar |
| Modelo de dados | `overlay` {headline,body,bullets,footer}, `overlay_style` (fontes/largura/sombra/align), `overlay_positions` {key:{x,y}} | Texto + estilo + posição por bloco, versionável no `slides` JSONB |
| Geração de fundo limpo | `generate-slide-images` (param `backgroundOnly`) | Gera o FUNDO sem texto |
| Render server-side | `render-slide-image` (Satori) | Compõe texto sobre imagem no servidor (p/ download/publicação) |
| Render mode | `render_mode: "ai_bg_overlay"` (vs `ai_full_design`) | O switch que decide baked vs overlay |

**Conclusão do inventário:** renderer + editor + drag + geração de fundo + render server-side **já
existem e funcionam**. O que mudou foi o **roteamento**: o `ai-chat` hoje gera `ai_full_design`
(Gemini cozinha texto no pixel) por padrão.

## Por que foi REMOVIDO (feedback do Raul — quem viveu)
Não foi só simplificação — o `ai_bg_overlay` era **ruim de verdade** na prática:
- **Perda de qualidade** da imagem (o fundo limpo saía pior);
- **Texto não encaixava** no fundo (colidia, sangrava, safe area furada);
- **Sem variedade** — mesma fonte/cor/estilo em tudo, cara de template genérico;
- No geral, **experiência ruim** pro usuário.

O `ai_full_design` (Gemini cozinha tudo) ganhou porque o texto sai **integrado** ao design —
fontes, cores, hierarquia e ilustração numa peça coesa (ex.: o infográfico "5 erros" de hoje).
**Regra do Raul:** *só voltamos pra camada editável se tiver algo MUITO melhor que a abordagem do
LocalStudio* — reviver o modo antigo como estava está fora.

## A grande sacada (por que revisitar AGORA)
1. **Corrige os bugs de texto na raiz.** Acento sumido em maiúscula, texto duplicado, pt-BR
   embananado, palavra cortada — **tudo isso é o MODELO DE IMAGEM errando o texto**. Se o texto é
   uma **camada renderizada pelo nosso código** (Satori/HTML), esses bugs **desaparecem por
   definição**. Enquanto for imagem chapada, sempre vamos brigar com isso.
2. **Editar sem regenerar = economia de crédito + UX.** Trocar uma legenda/typo/manchete hoje =
   nova geração (queima crédito, pode piorar). Com camada, edita na hora, custo zero.
3. **É a fundação pro "editor avançado"** que a UI já promete (botão "Editor avançado" existe).

## Gap pra reviver (o que falta)
1. **Rotear a geração** pro modo overlay: `ai-chat` chamar `generate-slide-images` com
   `backgroundOnly:true` + produzir o `overlay` estruturado (headline/body/bullets) e um
   `overlay_style` inicial sensato. (O briefing/estrutura de texto já é gerado hoje pelo minimax —
   reaproveitável.)
2. **Qualidade do fundo limpo.** É o risco #1: o fundo sem texto precisa sair bonito e "com espaço"
   pro texto (safe area). Os modelos melhoraram desde abril — precisa medir.
3. **Polir o editor.** Existe, mas pode estar cru (foi congelado em abril). Selecionar bloco,
   arrastar, mudar fonte/cor/tamanho — validar o fluxo ponta a ponta.
4. **Export/publicação usar o overlay.** Garantir que download e publish renderizam a composição
   (via `render-slide-image` Satori) — não o fundo sem texto.

## Riscos
- **Qualidade percebida** cair vs baked (o motivo do abandono). Mitigável: bons fundos + tipografia
  caprichada da marca; e pra formatos como quote/infográfico/autoridade o overlay já é o formato natural.
- **Consistência entre slides** de um carrossel (posições/estilo) — o editor precisa manter coesão.
- **Complexidade de UX** pro usuário leigo (Maikon). Mitigável: overlay editável como **opção**
  ("quero poder editar depois") e/ou edição só quando o usuário PEDE (corrigir), não obrigatória.

## O que descarta e o que sobra
Com o feedback do Raul, o leque muda:
- ❌ **Reviver `ai_bg_overlay` (fundo limpo + texto por cima)** — foi exatamente o que deu ruim. FORA.
- ❌ **Overlay como padrão** — idem.
- ✅ A pergunta certa vira: *dá pra ter EDITABILIDADE **sem** perder a qualidade do baked?* Só vale
  se a resposta for "muito melhor que o LocalStudio".

## Caminhos que PODERIAM clear a barra (e o veredito honesto)

**1. Edição regional / inpainting (o mais promissor).**
Mantém a imagem **baked premium** intacta e, quando o usuário quer corrigir um texto, faz uma
**edição mascarada** só naquela região (nano-banana / gpt-image-2 suportam edit com máscara). Não é
"camada" — é "regenerar só o pedaço". Preserva o design integrado (fontes/cores/ilustração) e
permite ajuste cirúrgico.
- ✅ Não perde qualidade; texto continua integrado.
- ⚠️ O texto ainda é **renderizado pelo modelo** → o bug de acento/pt-BR **pode persistir** na região
  editada; e inpainting de TEXTO é historicamente instável (o modelo erra a grafia).
- **Veredito:** é o único caminho de "editabilidade" que pode superar o overlay. Precisa de um spike
  próprio (testar edit mascarado com nano-banana num texto real).

**2. Não perseguir editabilidade — atacar os PROBLEMAS diretamente (melhor ROI hoje).**
O dano recorrente real não é "não dá pra editar" — é **texto errado** (acento em maiúscula, duplicado,
conteúdo errado). Isso ataca-se sem virar layered:
- **Acento em CAIXA ALTA:** reforço de prompt + validação/retry quando o modelo dropa diacrítico
  (detectável comparando o texto pedido vs OCR/heurística), ou pós-processo.
- **Texto duplicado / UI falsa:** já mapeado (regras NO_UI_MOCKUP + limpeza de referência da marca).
- **"Corrigir sem regenerar do zero":** um botão "corrigir texto" que **regenera SÓ aquele slide**
  com o texto certo (barato), em vez de refazer tudo.
Isso entrega 80% do valor ("meu post saiu com o texto certo") sem o risco do layered.

**3. Layered de verdade (estilo LocalStudio), só que premium.**
Gerar o design como estrutura editável (blocos, fontes, cores variadas) com qualidade de agência.
Isso é essencialmente **construir um motor de design** — alto custo, e é justamente onde o overlay
antigo falhou. **Só vale** com um salto de tecnologia (modelo que devolva layout estruturado bom).
Hoje: **não recomendado**.

## Recomendação honesta
1. **Curto prazo (melhor ROI):** ir pelo **caminho 2** — atacar os bugs de texto (acento/duplicação)
   e um "corrigir texto = regenera só o slide". Resolve a dor real, baixo risco, sem apostar em layered.
2. **Se quiser explorar editabilidade premium:** fazer um **spike focado só de inpainting** (caminho 1)
   — testar edição mascarada de texto com nano-banana numa peça real e ver se (a) preserva qualidade
   e (b) acerta o pt-BR. Se acertar, aí sim temos "algo melhor que o Erick". Se errar o texto, cai no
   caminho 2 mesmo.
3. **Layered do zero (caminho 3):** parar aqui até haver salto de modelo. Documentado como "watch".

## Esforço estimado
- Caminho 2 (atacar bugs de texto + corrigir-só-o-slide): **BAIXO-MÉDIO**, alto valor imediato.
- Caminho 1 (spike de inpainting): **BAIXO** pro spike; **MÉDIO** se virar feature.
- Caminho 3 (layered premium): **ALTO** — não agora.
