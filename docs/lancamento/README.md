# Lançamento — Máquina de Conteúdo

Funil de aquisição do TrendPulse: um mini-curso pago serve de porta de entrada e entrega, junto, um
cupom de créditos. O comprador chega no produto **já pago, já educado e com saldo para usar**.

**A oferta:** *"Mini-curso + R$50 em créditos no TrendPulse, por R$49,90."*
Os créditos já pagam o preço, então comprar vira decisão fácil e todo comprador vira usuário.

**A economia:** R$42,92 líquido por venda (Kiwify) menos ~R$15 de infra dos 500 créditos =
**~R$28 de lucro + 1 usuário onboardado**. E crédito só custa infra quando é usado: quem compra e não
usa custou R$0. O custo só aparece em quem ativou, que é exatamente quem interessa.

---

## Por que o TikTok Shop ficou de fora

A política oficial do TikTok Shop **proíbe produto digital** ("software a ser baixado", links de
download, assinaturas). Só vende coisa que vai por transportadora. Então:

**TikTok = tráfego. Kiwify = checkout.** É o padrão do mercado brasileiro, não uma gambiarra.

---

## O que tem aqui

| Arquivo | O que é |
|---|---|
| `roteiros-tiktok.md` | 30 roteiros de vídeo curto, faceless, para o topo do funil |
| `kit/biblioteca-de-pautas.md` | 200 pautas (10 nichos x 20) + o método dos 5 tipos de conteúdo |
| `kit/prompts-prontos.md` | 40 prompts + anatomia do pedido + pedidos de ajuste |
| `kit/calendario-30-dias.md` | 30 dias planejados + a rotina de 1 hora por semana |
| `kit/checklist-publicacao.md` | Revisão da peça, dimensões e limites por rede |
| `curso/roteiros-narracao.md` | Narração palavra por palavra das 7 aulas, pronta para TTS |
| `curso/roteiro-gravacao.md` | Roteiro de tela, clique a clique |
| `curso/cenas/cenas.html` | As 9 cenas de abertura, 100% CSS, para gravar em tela cheia |
| `vendas/pagina-de-vendas.md` | Copy completa da página |
| `vendas/emails.md` | Entrega pós-compra + sequência de ativação |
| `vendas/legal.md` | Reembolso (art. 49 CDC), termos, privacidade, identificação do vendedor |

Sistema de cupom (código já no ar): veja `docs/arquitetura/cupons-resgate.md`.

---

## O curso

**85 minutos, 7 aulas.** A duração é decisão de projeto, não limitação: curso longo tem ~13% de
conclusão, micro-learning abaixo de 2h passa de 80%. Como o objetivo é **ativar usuário**, conclusão
importa mais que venda.

| # | Aula | Min | Prática |
|---|---|---|---|
| 0 | Boas-vindas + resgate do cupom | 3 | Resgatar os 500 créditos |
| 1 | Por que sua rede social não cresce | 10 | — |
| 2 | Sua identidade em 10 minutos | 12 | Criar a marca |
| 3 | A máquina de pautas | 15 | Gerar do link/tema |
| 4 | Post, carrossel e story em escala | 20 | Gerar os 3 formatos |
| 5 | Calendário: 30 dias numa sentada | 15 | Agendar a semana |
| 6 | A rotina de 1 hora por semana | 10 | Montar a própria rotina |

**Dois princípios que não podem ser quebrados:**

1. **O cupom é entregue na Aula 0, nunca no fim.** Prender no fim mata o funil: a maioria não chega lá.
2. **O método tem que valer sozinho.** Se o curso for propaganda da ferramenta, gera reembolso. Ele
   ensina o sistema; o TrendPulse é a execução.

---

## Produção (o que falta fazer)

### Só você faz

1. **Confirmar com a Kiwify se ela entrega código único por comprador** (upload de lista de vouchers).
   ⚠️ **Verificar antes de tudo.** Se a entrega for uma página estática igual para todos, o modelo
   "1 código = 1 resgate" quebra na primeira venda e o desenho muda.
2. **Conta Kiwify no CNPJ**, nunca CPF. Conta pessoa física expõe o CPF no checkout (há reclamação
   registrada sobre isso), e a Kiwify não permite trocar o documento depois.
3. **Allow-list no Supabase**: adicionar `https://trendpulse.com.br/**` em Authentication → URL
   Configuration. Sem isso o `?coupon=` some em silêncio na confirmação de email.
4. **Escolher o TTS**: gerar o mesmo roteiro de 60s em ElevenLabs, Azure e Google e ouvir. Não existe
   benchmark público confiável de pt-BR. Teste prosódia em frase longa e pronúncia de termo em inglês
   ("prompt", "workflow", "feed").
5. **Gravar** (OBS ou CapCut), montar na Kiwify, postar no TikTok.
6. **Revisar `vendas/legal.md` com advogado e contador.** São modelos de base, não parecer jurídico.
   A nota fiscal é obrigação sua: a Kiwify emite nota apenas das próprias taxas, não da sua venda.

### Ordem sugerida

Cupom (pronto) → confirmar Kiwify → escolher TTS → gravar → montar oferta → ligar o TikTok.

**Só grave depois do cupom estar funcionando na sua conta**: a Aula 0 mostra o resgate real
acontecendo na tela.

---

## Como gravar as cenas

`curso/cenas/cenas.html` abre em qualquer navegador. Tela cheia (F11), `→` avança, `←` volta,
`R` reinicia a animação da cena (útil se errar o timing), `H` esconde o indicador do canto.
**Esconda o indicador antes do take final.**

O fundo é escuro de propósito: o produto é claro, então o espectador distingue na hora "estamos no
conceito" de "estamos no produto", sem narração explicando a transição.

---

## Expectativa realista

Planeje com **1,5% a 3% de conversão** em tráfego frio. Toda a literatura de tripwire que promete
8-15% vem de empresas que vendem ferramenta de funil, e os números variam de 1,5% a 25% para a mesma
métrica, o que por si só mostra que ninguém mede a mesma coisa.

Sobre cadência no TikTok: um estudo do Buffer com 11,4 milhões de posts mostra que a **mediana de
views não melhora** postando mais (489 → 506 → 487 → 459 por semana). O que melhora é a cauda. Postar
mais é comprar mais bilhetes de loteria, não deixar o vídeo médio melhor. 1 por dia é sustentável e
fica na faixa boa.

**Reembolso de 7 dias é obrigatório por lei** (art. 49 do CDC), sem justificativa, e vale mesmo se a
pessoa já assistiu tudo. Precifique isso.
