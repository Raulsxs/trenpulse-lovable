# Emails: Máquina de Conteúdo

> **Como usar este arquivo:** são 5 emails. O primeiro dispara na compra confirmada.
> Os três seguintes formam a sequência de ativação para quem comprou e ainda não resgatou
> o cupom. O último é para quem resgatou mas ainda não gerou nada.
>
> **Placeholders da Kiwify:** os campos entre chaves duplas seguem o padrão de variável da
> plataforma. **Confirme os nomes exatos das variáveis no painel da Kiwify antes de
> publicar**, porque variável errada aparece literalmente no email do comprador.
> Campos entre colchetes `[ASSIM]` são preenchidos por você, não pela plataforma.
>
> | Placeholder | O que é |
> |---|---|
> | `{{nome}}` | primeiro nome do comprador |
> | `{{codigo_cupom}}` | código no formato `TP-XXXX-XXXX`, gerado no lote da campanha |
> | `{{link_curso}}` | link de acesso à área de membros da Kiwify |
> | `[EMAIL DE ATENDIMENTO]` | email de suporte, o mesmo dos textos legais |
> | `[DATA LIMITE DE RESGATE]` | prazo de resgate do cupom, definido na campanha |
>
> **Sobre o link do cupom:** o formato correto é
> `https://trendpulse.com.br/resgatar?coupon=CODIGO`, com o parâmetro `coupon`.
> Não use `code`: esse parâmetro é consumido pela autenticação e o resgate quebra.
> O código pode ir com ou sem o prefixo `TP-`, os dois funcionam.
>
> **Segmentação da sequência de ativação:** os emails 2, 3 e 4 só devem ir para quem
> ainda **não** resgatou. Quem resgata sai da sequência na hora. Enviar email de "resgate
> seus créditos" para quem já resgatou é o jeito mais rápido de perder a confiança
> conquistada na compra.

---

## Email 1. Entrega, imediatamente após a compra

**Assunto, opção A (recomendada):** Seu acesso e seus 500 créditos estão aqui
**Assunto, opção B:** Máquina de Conteúdo: acesso liberado, código dos créditos dentro

---

Oi, {{nome}}.

Compra confirmada. Está tudo liberado.

**1. Seu acesso ao curso**

{{link_curso}}

Lá dentro estão as 7 aulas e o Kit de Recursos completo: as 200 pautas por nicho,
os 40 prompts prontos, o calendário de 30 dias e o checklist de publicação.
O acesso é vitalício, você assiste no seu ritmo.

**2. Seus 500 créditos no TrendPulse**

Seu código:

**{{codigo_cupom}}**

Resgate por aqui:
https://trendpulse.com.br/resgatar?coupon={{codigo_cupom}}

Clicando no link, é só criar sua conta (ou entrar, se já tiver uma) e os 500 créditos
caem sozinhos. Não precisa digitar nada.

**Faça isso agora, mesmo que só vá assistir o curso amanhã.** Leva menos de dois minutos
e evita que o código se perca no meio dos seus emails.

**Por onde começar**

Assista a aula 1 e a aula 2, que juntas dão pouco mais de 20 minutos. Elas resolvem a
parte que trava quase todo mundo: decidir sobre o que falar. Da aula 4 em diante você já
está produzindo dentro da plataforma, usando os créditos.

**Se travar em qualquer coisa**

Responda este email ou escreva para [EMAIL DE ATENDIMENTO]. Respondemos em até 5 dias
úteis, quase sempre bem antes.

E se depois de assistir você concluir que não era o que esperava, você tem 7 dias para
pedir reembolso, sem precisar justificar nada, mesmo já tendo assistido. Está na Política
de Reembolso e vale.

Bom trabalho.

[SEU NOME]
TrendPulse

---

## Email 2. Ativação, dia 1

**Enviar:** 24 horas após a compra, apenas para quem não resgatou o cupom.
**Ângulo:** lembrete prático. O código está parado, e resgatar leva dois minutos.

**Assunto, opção A (recomendada):** Seus 500 créditos ainda não foram resgatados
**Assunto, opção B:** Dois minutos para ativar o que você já pagou

---

Oi, {{nome}}.

Passando rápido: seu código ainda não foi usado.

**{{codigo_cupom}}**

https://trendpulse.com.br/resgatar?coupon={{codigo_cupom}}

Não é upsell e não é oferta nova. São os 500 créditos que já vieram na sua compra,
esperando para entrar na conta. Enquanto o código não é resgatado, ele não vira saldo.

Dois motivos para fazer isso hoje, mesmo que você ainda não vá assistir nada:

1. O resgate é o que cria sua conta no TrendPulse. Com a conta criada, quando você
   chegar na aula 4 já vai estar tudo pronto.
2. O código tem prazo para ser resgatado, até [DATA LIMITE DE RESGATE]. Depois de
   resgatado, o saldo não expira mais.

Se o link não funcionar, entre em trendpulse.com.br, vá em Perfil, na área de créditos,
e digite o código na mão. Funciona igual.

Qualquer problema, responde aqui.

[SEU NOME]

---

## Email 3. Ativação, dia 3

**Enviar:** 3 dias após a compra, apenas para quem não resgatou.
**Ângulo:** remover o atrito real. Quem não resgatou geralmente não está sem interesse,
está sem tempo ou achando que vai dar trabalho. Mostrar que a primeira peça sai em
minutos e não exige curso assistido.

**Assunto, opção A (recomendada):** Você não precisa assistir o curso para gerar o primeiro post
**Assunto, opção B:** A parte que leva 4 minutos

---

Oi, {{nome}}.

Uma coisa que costuma travar: a pessoa acha que precisa assistir os 85 minutos de curso
antes de encostar na ferramenta. Não precisa.

A ordem que funciona melhor é a inversa. Gere uma peça primeiro, veja o que sai, e aí o
curso passa a fazer muito mais sentido, porque você já sabe o que está tentando melhorar.

O caminho curto:

1. Resgate os créditos: https://trendpulse.com.br/resgatar?coupon={{codigo_cupom}}
2. Abra o chat e escreva, em português normal, uma dúvida que seus clientes te fazem
   toda semana. Alguma coisa como: "faz um post explicando por que [aquela dúvida
   recorrente do seu dia a dia]".
3. Veja o que volta.

É isso. Sem configurar nada antes, sem montar marca, sem escolher template.

Se o resultado não sair com a sua cara, é exatamente disso que trata a aula 5, que é
onde você cadastra suas cores, sua fonte e seu tom de voz e passa a receber tudo já
alinhado. Mas para a primeira peça, nada disso é necessário.

Seu código continua sendo **{{codigo_cupom}}**.

[SEU NOME]

---

## Email 4. Ativação, dia 7

**Enviar:** 7 dias após a compra, apenas para quem não resgatou.
**Ângulo:** último da sequência, tom adulto. Reconhece que a semana pode ter atropelado,
informa o prazo do código sem dramatizar e lembra do direito de reembolso, que ainda está
aberto. Depois deste, não insistir mais.

**Assunto, opção A (recomendada):** Último aviso sobre o seu código (e sobre o seu prazo de reembolso)
**Assunto, opção B:** Uma semana depois: seu código e uma pergunta honesta

---

Oi, {{nome}}.

Uma semana desde a sua compra. Este é o último email que mando sobre o assunto, então
vou ser direto.

**Seu código ainda está lá:** {{codigo_cupom}}
https://trendpulse.com.br/resgatar?coupon={{codigo_cupom}}

São 500 créditos, o equivalente a 50 posts com imagem ou 10 carrosséis de 5 slides.
O prazo para resgatar vai até [DATA LIMITE DE RESGATE]. Depois disso o código não vale
mais, e não tem como reemitir.

E uma coisa que a maioria das empresas não escreve para o cliente:

**Se você olhou o material e concluiu que não era para você, seu prazo de arrependimento
é de 7 dias e ainda pode estar valendo.** Basta escrever para [EMAIL DE ATENDIMENTO]
pedindo o reembolso, sem justificar nada, mesmo tendo acessado o conteúdo. Devolvemos
integral e sem discussão. É o artigo 49 do Código de Defesa do Consumidor, e para nós é
melhor devolver seu dinheiro do que ficar com ele de alguém insatisfeito.

Prefiro que você faça uma coisa ou outra. O que não quero é o seu dinheiro parado em
algo que você nunca abriu.

Se travou em alguma coisa específica, responde aqui contando o quê. Eu leio.

[SEU NOME]

---

## Email 5. Resgatou, mas ainda não gerou nada

**Enviar:** 3 dias após o resgate, apenas para quem tem saldo e nenhuma geração.
**Ângulo:** a barreira aqui não é acesso, é a tela em branco. Dar o primeiro pedido
pronto para copiar e colar.

**Assunto, opção A (recomendada):** Copie esta frase e cole no chat
**Assunto, opção B:** Seus 500 créditos estão na conta. Falta o primeiro pedido.

---

Oi, {{nome}}.

Seus créditos entraram, então essa parte já está resolvida. Só que a conta continua com
o saldo inteiro, o que costuma significar uma coisa só: você abriu o chat, olhou o campo
vazio e não soube o que escrever.

Normal. É exatamente a mesma trava do feed em branco, só que em outro lugar.

Então vou tirar essa decisão de você. Abra o chat e cole isto, trocando só a parte entre
colchetes:

> Faz um post para Instagram explicando, para uma pessoa leiga, [a pergunta que seus
> clientes mais te fazem]. Tom próximo e sem termo técnico.

Só isso. O agente devolve a peça pronta, com imagem e legenda.

Se não souber qual pergunta usar, abra o arquivo de **200 pautas** do Kit, ache a seção
do seu nicho e pegue a primeira que te der vontade de responder. É para isso que ele
existe: para você escolher em vez de inventar.

Três coisas que costumam ajudar depois da primeira peça:

- Não gostou do visual? Peça o ajuste no próprio chat, com suas palavras. Ele refaz.
- Quer que tudo saia com a sua cara desde o começo? É a aula 5, cadastrando sua marca.
- Não sabe se faz post ou carrossel? É a aula 6, que é curta e resolve.

Seu saldo dá para 50 posts com imagem ou 10 carrosséis de 5 slides, e ele não expira.
Dá para errar bastante antes de acertar, e é assim que costuma funcionar mesmo.

Qualquer coisa, responde aqui.

[SEU NOME]
