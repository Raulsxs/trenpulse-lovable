# Landing "História" — plano de reconstrução da LP

**Rota de avaliação:** `/landing-nova` · **Status:** em construção · **Backup da atual:** `backup/landing-atual`

---

## 1. Por que refazer

A landing atual e a primeira tentativa de reformulação (direção "Ateliê") sofrem do mesmo defeito:
**o produto aparece fora do habitat dele.**

O TrendPulse produz *post de rede social*. Mostrar as peças como quadrados soltos numa página branca
é mostrar o produto descontextualizado — e é isso que faz a página parecer feita por qualquer IA:
tudo dentro do próprio retângulo, nada encostando em nada.

Um JPG numa página diz *"olha uma imagem"*. O mesmo JPG dentro de um feed, num celular, diz
*"é isto que o seu paciente vai ver"*. **O mockup fornece contexto, e o contexto transforma um
arquivo numa promessa.**

## 2. A história que a página conta

Cada seção responde a UMA pergunta que o visitante faz, na ordem em que ele faz:

| # | Pergunta dele | Seção | O que prova |
|---|---|---|---|
| 1 | Vai ficar bom? | Herói — celular com grade de perfil | Resultado + identidade, num olhar |
| 2 | Vai ter a MINHA cara? | A cópia da marca | O motor de identidade, com texto real do `style_guide` |
| 3 | Dá trabalho? | Do texto ao post | A distância entre digitar e ter |
| 4 | E onde eu publico? | Uma peça, nove redes | Notebook com LinkedIn + celular |
| 5 | E a constância? | O calendário | O "todo dia" materializado num mês |
| 6 | Quanto custa? | Formatos e pacotes | Números reais, de fonte única |

## 3. Decisões de composição (a gramática)

Extraída dos mockups do Templates Pack — os **movimentos**, não a estética (o pack é
consumo/luxo; o ICP aqui é médico e consultor, e vestir a página de campanha de perfume a deixa
bonita e menos confiável).

- **Tipo como camada:** headline gigante parcialmente **ocluído** pelo device.
- **Sangria:** peças escapando da moldura, em vez de tudo contido.
- **Contraste de escala extremo:** display grande de verdade contra rótulos de 12px.
- **Fundo comprometido:** seções que assumem uma cor inteira, não branco + acento.

## 4. Régua de qualidade dos mockups

| Regra | Porquê |
|---|---|
| Devices em **CSS puro**, sem PNG | O bundle caiu 71% (2.892→847 KB); não vamos devolver isso em imagem de notebook. Em CSS fica nítido em qualquer tela e re-veste com a marca |
| Proporção e raio **reais** | Errar o raio do iPhone é o que faz mockup parecer PowerPoint |
| **Zero número de engajamento** | Curtida inventada é prova social fabricada. Por isso o herói usa **grade de perfil**, que não tem contador — e não o feed, que tem |
| Conteúdo real | As peças que a plataforma gerou; o texto que o `style_guide` produziu |

## 5. Preço: a correção que veio antes de tudo

Ao levantar os números para a página, apareceu um problema que não é de design:
**o preço divulgado estava diferente do praticado.**

| | Anunciado | Cobrado |
|---|---|---|
| Post | 8 cr | **10 cr** |
| Carrossel (slide) | 8 cr | **10 cr** |
| Story | 20 cr | **25 cr** |
| Tweet card | 2 cr | **6 cr** |

E os pacotes prometiam ~25% mais peça do que entregam ("≈ 62 posts" por 500 créditos assume 8cr;
a 10cr são 50). Havia **três gerações** de números conflitantes no código — um comentário citava
"post 4cr".

**Correção:** `src/lib/precos.ts` virou fonte única, conferida contra `public.credit_pricing`, e a
tradução crédito→resultado passou a ser **calculada**, não escrita. Mudar o preço no banco e
esquecer de atualizar a página deixou de ser possível.

## 6. Plano de execução

- [x] **P0** — Fonte única de preços; corrigir `/pricing`, `PricingSection` e a landing no ar
- [ ] **P1** — Devices em CSS (`<Celular>`, `<Notebook>`), reutilizáveis
- [ ] **P2** — Herói: grade de perfil que re-veste ao trocar de marca, ocluindo o headline
- [ ] **P3** — Seção "a cópia da marca": referências → o que a IA entendeu → peça
- [ ] **P4** — Seção "do texto ao post": a tela do produto
- [ ] **P5** — Seção "uma peça, nove redes": notebook com LinkedIn
- [ ] **P6** — Seção "o calendário": o mês preenchido
- [ ] **P7** — Formatos + pacotes, de `precos.ts`
- [ ] **P8** — QA: 375px, reduced-motion, 44px, sem overflow, sem mojibake

## 7. Fora de escopo

- **Não** copiar layout do Templates Pack. Só a gramática de composição.
- **Não** usar o Figma MCP para isto. Foi testado e funciona (autenticado), mas exige duplicar
  arquivo por arquivo para os drafts, e o que sairia é layout de e-commerce que precisaria ser
  descaracterizado inteiro.
- **Não** inventar depoimento. Continua pendente uma frase real do Dr. Maikon — é o item de maior
  retorno da página e não depende de design nenhum.
- **Não** trocar a `/` sem aprovação. A atual segue no ar durante a comparação.

## 8. Riscos

1. **As peças reais são quase todas de saúde.** Uma grade de perfil cheia de post de cardiologia
   pode ler como produto médico. Mitigação: as três de estilo novo (editorial, citação, infográfico)
   entram na grade, e o seletor de marca troca o conjunto.
2. **Mockup de device em CSS é frágil em viewport estreito.** Mitigação: abaixo de 560px o device
   vira imagem de peça pura, sem moldura.
3. **Página longa custa LCP.** Mitigação: `loading="lazy"` em tudo abaixo da dobra; o chunk da rota
   é lazy e hoje pesa 14,6 KB.

## 9. Critério de pronto

- Build verde, `npm test` 48/48, zero mojibake
- 375px sem overflow horizontal e sem alvo de toque abaixo de 44px
- `prefers-reduced-motion` sem elemento invisível
- Nenhum número de crédito ou preço escrito à mão fora de `precos.ts`
- Nenhum contador de engajamento inventado em nenhuma seção
