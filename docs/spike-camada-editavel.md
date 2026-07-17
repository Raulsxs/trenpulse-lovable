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

## Por que foi abandonado (o tradeoff real)
Refactor de abril: "6 modos visuais → 1 (Gemini gera tudo)". Motivos: simplicidade + o design
**cozido** costuma sair mais **coeso/premium** (ilustração + texto integrados numa peça só — ex.: o
infográfico "5 erros" que geramos hoje). O `ai_bg_overlay` (fundo limpo + texto por cima) tende a
sair mais **genérico/template**. Foi uma troca de **editabilidade por qualidade percebida**.

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

## Opções
- **A — Modo editável como OPÇÃO (recomendado p/ começar).** Mantém `ai_full_design` como padrão
  premium; oferece "gerar editável" (ou só o botão "corrigir texto" cai no fluxo overlay). Menor
  risco, entrega o ganho de correção sem apostar tudo.
- **B — Overlay como padrão pra formatos-texto** (quote, infográfico, autoridade) onde o overlay já
  é o natural, mantendo baked pros ilustrados. Híbrido por formato.
- **C — Overlay como padrão geral.** Máxima editabilidade + fim dos bugs de texto, mas aposta na
  qualidade do fundo limpo. Só depois de um A/B convincente.

## Recomendação (faseada)
1. **Protótipo A/B (esforço BAIXO, 1 sessão):** gerar 5-6 peças em `ai_bg_overlay` (backgroundOnly +
   overlay) com os modelos/prompts atuais e comparar lado a lado com `ai_full_design`. Isso responde
   a pergunta que decide tudo: *"o fundo limpo + nosso texto está bom o suficiente hoje?"*.
2. **Se sim → Opção A/B:** wire do roteamento no `ai-chat` (reaproveitando o brief de texto que já
   existe), polir o editor, garantir export via Satori. Lançar como modo editável medindo adoção.
3. **Independente do A/B, quick win:** oferecer "**corrigir texto**" nos cards que hoje só têm
   "refazer" — mesmo sobre baked, cair num fluxo de overlay editável pra ajustes de texto simples.

## Esforço estimado
- Protótipo A/B: **BAIXO** (reusa tudo que existe).
- Modo editável opt-in (Opção A): **MÉDIO** (roteamento + polish do editor + export).
- Padrão geral (Opção C): **MÉDIO-ALTO** (qualidade de fundo + UX + consistência de carrossel).

## Próximo passo sugerido
Rodar o **protótipo A/B** (fase 1) — é barato e é o dado que destrava a decisão. Depois disso a
gente escolhe A/B/C com base em qualidade real, não em achismo.
