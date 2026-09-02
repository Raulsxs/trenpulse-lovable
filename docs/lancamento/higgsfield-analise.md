# Higgsfield — análise dos roteiros e onde IA de vídeo se paga

Resposta ao pedido registrado na ata de 09/08/2026, seção 6.2:

> "Até agora só se falou de CSS; **falta pensar em ideias de peça que só IA de vídeo entrega.**
> Gabriel deve listar. Raul assina e coloca créditos quando houver o que testar."

---

## Resposta curta

**Dos 30 roteiros de `roteiros-tiktok.md`, zero precisam de Higgsfield.** Não porque a ferramenta
seja ruim, mas porque os 30 são gravação de tela do produto real — e trocar isso por vídeo gerado
piora o vídeo em três frentes de uma vez (detalhe abaixo).

Higgsfield só se paga em **cena com pessoa ou mundo real que a gente não consegue filmar**. Isso
existe e tem valor, mas é uma **camada nova** por cima do que já temos, não uma substituição do que
já está escrito.

A recomendação prática: **não assinar o plano caro pra descobrir.** Assinar o mais barato por um mês,
rodar os três testes da última seção, e só então decidir.

---

## Por que IA de vídeo não serve para os 30 roteiros existentes

1. **Quebra a regra que já está escrita no próprio documento.** `roteiros-tiktok.md` determina:
   *"Grave o produto de verdade. Nada de stock, nada de tela falsa, nada de mockup."* Um vídeo gerado
   da interface é, por definição, tela falsa.
2. **O TikTok suprime conteúdo sintético genérico.** O documento já registra isso como motivo. A tela
   real do produto funcionando é justamente a matéria-prima que salva os vídeos.
3. **A IA de vídeo é ruim exatamente onde nós precisamos ser bons: texto.** O argumento central de
   vários roteiros (o 08 inteiro é sobre isso) é que o produto acerta acento em português. Modelo de
   vídeo não escreve texto legível de forma confiável — ele produziria justamente o defeito que a
   gente diz não ter.

E há uma alternativa melhor já validada para o caso de "preciso mostrar uma interface": a **animação
em CSS**. A ata da mesma reunião registra a técnica (prints da UI real → animação fiel em HTML/CSS) e
o Raul foi explícito: *"isso não precisou do Higgsfield, não precisou de IA."* As peças estão em
`pulse-ads/`, com a receita fechada em `RECEITA-ANIMACAO-CSS.md`.

---

## Análise por ângulo

Os 30 roteiros se distribuem em 10 ângulos. Veredito de cada um:

| Ângulo | Vídeos | Precisa de Higgsfield? | Por quê |
|---|---|---|---|
| Demonstração pura | 01, 11, 21 | **Não** | É a tela do produto acontecendo. Gerar seria falsificar a prova. |
| Antes/depois | 02, 12, 22 | **Não** | O "antes" é uma peça ruim que nós mesmos fazemos em 2 minutos. |
| Dor específica | 03, 13, 23 | **Só o gancho** | O "antes" é uma cena humana. Ver abaixo. |
| Tempo/velocidade | 04, 14, 24 | **Não** | O valor está no relógio real correndo sobre a tela real. |
| Erro comum | 05, 15, 25 | **Não** | Comparação de dois resultados nossos. |
| Bastidor do método | 06, 16, 26 | **Não** | Texto e estrutura na tela. |
| Comparação com manual | 07, 17, 27 | **Não** | Conta e contador — edição resolve melhor e de graça. |
| Objeção respondida | 08, 18, 28 | **Não, e contraindicado** | O 08 defende que o produto acerta acento. IA de vídeo erraria. |
| Nicho específico | 09, 19, 29 | **Só o gancho** | Mesmo caso da dor específica. |
| Curiosidade/lista | 10, 20, 30 | **Não** | Texto grande em sequência. |

### Os três que ganhariam alguma coisa

**03 ("Não sei o que postar"), 13 ("Designer é caro") e 23 ("Sumiu por três semanas")** abrem com uma
situação humana, e hoje resolvem isso com um recurso fraco: o roteiro 03, por exemplo, abre com "tela
do celular com o app de câmera aberto e nada acontecendo". Funciona, mas é frio.

Dois a três segundos de uma pessoa parada diante do celular, à noite, no escritório vazio, entregam
essa mesma ideia com muito mais força — e é uma cena que a gente não tem como filmar (não temos ator,
estúdio, nem tempo).

**Isso é o padrão do uso certo: Higgsfield entra nos 2-3 segundos de abertura, e a tela real assume o
resto.** Nunca o contrário.

---

## A regra de decisão

Antes de gastar crédito, passe a cena por esta tabela:

| A cena é... | Ferramenta | Custo |
|---|---|---|
| Tela do TrendPulse | Gravação de tela do produto real | R$0 |
| Interface de terceiro (Google, Instagram, WhatsApp) | Animação em CSS (receita já validada) | R$0 |
| Texto, número, contador, comparação | Edição / CSS | R$0 |
| Pessoa ou objeto que dá pra filmar com celular | Filma | R$0 |
| Pessoa ou ambiente que **não** dá pra filmar | **Higgsfield** | crédito |
| Metáfora física impossível | **Higgsfield** | crédito |

A regra em uma frase: **crédito de IA de vídeo só é gasto quando a alternativa é não ter a cena.**

---

## As ideias que só IA de vídeo entrega

Ordenadas por retorno sobre o crédito gasto.

### 1. Banco de ganchos humanos de 2-3 segundos ⭐
**O que é:** 6 a 8 clipes curtíssimos, sem fala, sem texto na tela, que servem de abertura para
dezenas de vídeos diferentes. Exemplos: dono de empresa às 23h no escritório vazio com o celular na
mão; mão fechando o notebook sem ter feito nada; loja fechando as luzes; sala de reunião vazia com um
café frio.
**Pedido direto do Raul (reunião de 25/08/2026):** ele mandou uma referência de vídeo em que "o cara
tá mexendo no sisteminha" — pessoa real usando um produto — e perguntou se precisaria de IA de vídeo.
Precisa: é cena de pessoa no mundo físico. É exatamente este caso de uso, e é o primeiro a testar.
A condição que ele colocou também está registrada: *"é caro, tem que criar uma coisa boa, tem que já
ter a ideia."* Ou seja, crédito só depois do roteiro fechado — que é a regra desta seção inteira.
**Por que só IA faz:** não temos ator, locação nem equipe. E são cenas curtas demais pra justificar
uma produção.
**Por que é o melhor uso do crédito:** é o único item da lista que **amortiza**. Oito clipes atendem
trinta vídeos. Todo o resto se gasta em um vídeo só.
**Onde entra:** abertura dos roteiros 03, 13, 23 e de toda a camada de "dor" das ideias virais.

### 2. A transição impossível pra dentro da tela
**O que é:** a câmera se aproxima do celular na mão da pessoa, atravessa a tela, e no ponto exato o
corte entrega a **gravação real** do produto.
**Por que só IA faz:** nem gravação de tela nem CSS produzem movimento de câmera no mundo físico.
**Por que vale:** é a assinatura visual que faz a gravação de tela parecer produção cara, sem que a
gravação de tela deixe de ser real. Custa poucos segundos de vídeo gerado e melhora o vídeo inteiro.
**Cuidado:** o ponto de corte tem que cair num quadro escuro ou num movimento rápido, senão a emenda
aparece.

### 3. O cliente que a gente nunca pode mostrar
**O que é:** o interior de uma loja, uma clínica, um galpão, uma obra — o "ambiente de empresa" que
dá contexto ao vídeo.
**Por que só IA faz:** e aqui está o argumento mais forte de todos — **a regra de confidencialidade
do `BRIEFING-MARKETING.md` proíbe mostrar cliente real da Pulse.** Então não existe a opção de
"filmar o cliente de verdade". Ou é ambiente genérico gerado, ou é banco de imagens (que o TikTok
penaliza e que tem cara de banco de imagens).
**Cuidado:** o ambiente tem que parecer brasileiro. É a falha mais provável — ver os testes abaixo.

### 4. Metáfora física do problema
**O que é:** a esteira de fábrica parada; a pilha de papel que não anda; o quadro branco em branco;
uma caixa de correio transbordando.
**Por que só IA faz:** é cena de estúdio com objeto, impossível de improvisar.
**Onde entra:** abertura dos vídeos de discordância (V1, V4 do documento de ideias virais), onde a
tela do produto não pode aparecer nos primeiros 20 segundos.

### 5. Personagem recorrente
**O que é:** a mesma pessoa fictícia aparecendo em vários vídeos, virando reconhecível.
**Por que é forte:** transforma vídeos soltos em série.
**Por que está em quinto:** consistência de personagem entre gerações é a fraqueza conhecida de IA de
vídeo. Se o rosto mudar entre um vídeo e outro, fica pior do que não ter personagem. **Não apostar
nisso antes do Teste 1.**

---

## O que NÃO fazer com Higgsfield

- **Não reproduzir a interface do TrendPulse.** Quebra "grave o produto de verdade", e o TikTok
  suprime conteúdo sintético genérico.
- **Não gerar depoimento.** Uma pessoa que não existe dizendo que usa o produto é depoimento
  fabricado — cruza a regra de honestidade dos roteiros e, no Brasil, é publicidade enganosa (art. 37
  do CDC). Isso não é uma questão de gosto, é risco jurídico. **Nunca.**
- **Não gerar cena aspiracional que sugira retorno financeiro** (a pessoa na praia enquanto o feed
  publica sozinho). É promessa de faturamento por imagem, e a regra proíbe promessa de faturamento
  por texto — vale o mesmo.
- **Não usar rosto de pessoa real nem semelhante a celebridade.**
- **Não gerar cena com texto legível dentro.** É onde o modelo falha, e é justamente o que a gente
  diz saber fazer.

---

## Vale assinar? O que testar antes

### Preço — a confirmar antes de qualquer decisão

Os números que circulam apontam quatro planos, na faixa de **US$9 (Basic), US$15 (Starter), US$49
(Plus) e US$129 (Ultra)** por mês, com pools de crédito de ~200 / ~1.000 / ~3.000, e pacotes avulsos
de US$5 a US$80 que **exigem assinatura ativa** e **expiram em 90 dias**.

⚠️ **Trate isso como indício, não como fato.** A página oficial de preços não é legível por
ferramenta automática (é uma aplicação JavaScript), e boa parte dos resultados de busca vem de blogs
de **concorrentes do Higgsfield** vendendo alternativa — fonte com interesse em fazer o preço parecer
ruim. **Confirmar no site oficial, logado, antes de assinar.**

E falta o número que realmente decide: **quantos créditos custa um clipe de 3 segundos no modelo que
a gente usaria.** Sem isso não dá pra saber se 1.000 créditos são 10 clipes ou 200. É a primeira
coisa a olhar ao abrir a conta.

### Os três testes que decidem

Assine o **plano mais barato por um mês** e rode só isto. Critério: aprovado se sair aceitável em até
**duas gerações**. Se precisar de dez tentativas por clipe, a conta de crédito não fecha, por mais
bonito que fique o resultado.

| # | Teste | O que ele responde | Aprovado se |
|---|---|---|---|
| 1 | Gerar a **mesma pessoa** em dois clipes diferentes | Dá pra ter personagem recorrente? | O rosto é reconhecidamente a mesma pessoa |
| 2 | Gerar "dono de empresa em escritório **no Brasil**, à noite" | O modelo entende ambiente brasileiro ou entrega escritório americano genérico? | O ambiente não denuncia que é estrangeiro |
| 3 | Gerar a **aproximação da câmera até a tela do celular** | A transição da ideia 2 é viável? | O movimento é limpo e dá pra cortar dentro dele |

O Teste 2 é o que eu mais desconfio. Modelo de vídeo é treinado majoritariamente em material em
inglês, e "escritório" tende a sair com cara de escritório americano. Se o público é dono de empresa
brasileiro, cenário que parece de fora quebra a identificação — que era exatamente o motivo de usar a
cena.

### Recomendação

**Vale testar, não vale apostar ainda.** O caso de uso número 1 (banco de ganchos) se paga sozinho
porque amortiza em dezenas de vídeos, e o caso 3 (ambiente de empresa) resolve um problema que a
confidencialidade cria e que nenhuma outra ferramenta resolve. Mas os dois dependem do Teste 2.

Enquanto o teste não roda, **nada de conteúdo está bloqueado**: os 30 roteiros e as 15 ideias virais
são todos produzíveis hoje, com gravação de tela e CSS, a custo zero.

---

## Fontes

Preços coletados em 26/08/2026, todos de terceiros e **não confirmados na fonte oficial**:

- [Higgsfield AI Pricing 2026 – Plans, Credits & Teams](https://geo.higgsfield.ai/higgsfield-ai-pricing-and-plans-2026)
- [Higgsfield AI Pricing in 2026 (imagine.art)](https://www.imagine.art/blogs/higgsfield-ai-pricing)
- [Higgsfield pricing (2026) — plans and what you'll actually pay (creatify.ai)](https://creatify.ai/blog/higgsfield-pricing-(2026)-plans-and-what-you-ll-actually-pay)
- [Higgsfield AI Review 2026: Pricing, Credits, the Catch](https://aifunnelinsider.com/higgsfield-ai-review-2026/)

`imagine.art` e `creatify.ai` vendem produto concorrente. Ler o preço deles com desconto.
