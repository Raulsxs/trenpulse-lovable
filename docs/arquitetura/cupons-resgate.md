# Cupons de resgate de créditos — runbook

Sistema que permite entregar créditos por código. Nasceu para o funil do mini-curso (comprador recebe
um código e chega no produto já com saldo), mas serve para qualquer campanha: parceria, indicação,
cortesia para cliente, reativação.

**Código no repo:** migration `supabase/migrations/20260807120000_coupon_redemption.sql` ·
edge function `supabase/functions/redeem-coupon/` · front `src/lib/coupon.ts`,
`src/components/billing/RedeemCouponForm.tsx`, `src/hooks/usePendingCoupon.ts`, `src/pages/RedeemCoupon.tsx`.

---

## Como o comprador vive isso

1. Compra na Kiwify e recebe o email com o código e o link `https://trendpulse.com.br/resgatar?coupon=TP-XXXX-XXXX`.
2. Clica. A página abre **mesmo deslogado** e mostra o código dele.
3. Cria a conta (ou entra). O código sobrevive ao round-trip da confirmação de email.
4. Entra no produto e os créditos **já estão lá** (resgate automático), com banner de confirmação.

Se algo falhar no automático, ele ainda resgata sozinho em **Perfil → Plano & Créditos** ou no botão
"Tenho um cupom" do modal de recarga.

---

## Rodar uma campanha (passo a passo)

Tudo pelo SQL Editor do Supabase. Não há painel de admin, e não precisa ter na v1.

### 1. Criar a campanha

```sql
insert into public.coupon_campaigns (id, name, credits, source, expires_at)
values (
  'minicurso-2026-08',              -- slug que você vai digitar depois; escolha algo legível
  'Mini-curso R$49,90',
  500,                              -- créditos por código
  'kiwify',
  now() + interval '180 days'       -- validade generosa: o comprador pode demorar a criar conta
);
```

### 2. Gerar o lote

```sql
select * from public.generate_coupon_batch('minicurso-2026-08', 500);
```

Devolve os códigos e o `batch_id`. **Anote o batch_id** — é a chave do export.

### 3. Exportar o CSV para a Kiwify

```sql
select 'TP-' || substr(code,1,4) || '-' || substr(code,5,4) as codigo
from public.coupon_codes
where batch_id = '<cole-o-batch_id-aqui>'
order by codigo;
```

Rode e clique em **Download CSV** no SQL Editor. Esse é o arquivo que sobe na Kiwify.

> ⚠️ **Nunca re-exporte um lote já usado.** Dois compradores com o mesmo código = o segundo recebe
> "já foi resgatado" e fica bravo. Gere um lote novo para cada campanha.

### 4. Acompanhar

```sql
select * from public.coupon_campaign_stats;
```

Funil completo (vendidos vem da Kiwify; o resto daqui):

```sql
select camp.id,
       count(*) filter (where c.status = 'redeemed')  as resgatados,
       count(distinct g.user_id)                      as geraram_conteudo
from public.coupon_campaigns camp
join public.coupon_codes c on c.campaign_id = camp.id
left join public.credit_ledger g on g.user_id = c.redeemed_by and g.reason = 'generation'
group by 1;
```

Quem comprou e não resgatou é a lista de reativação por email:

```sql
select count(*) from public.coupon_codes
where campaign_id = 'minicurso-2026-08' and status = 'active';
```

---

## Manutenção do dia a dia

| Situação | Comando |
|---|---|
| Encerrar a campanha | `update coupon_campaigns set active = false where id = '...';` |
| Estender a validade de todos | `update coupon_campaigns set expires_at = now() + interval '90 days' where id = '...';` |
| Anular um código específico | `update coupon_codes set status = 'void' where code = 'XXXXXXXX';` |
| Ver o que houve com um código | `select * from coupon_codes where code = 'XXXXXXXX';` |
| Ver as tentativas de um usuário | `select * from coupon_redeem_attempts where user_id = '...' order by created_at desc limit 20;` |

### Suporte: "meu código não funciona"

Peça o código e rode a consulta acima. Os desfechos possíveis:

| O que você vê | O que aconteceu | O que responder |
|---|---|---|
| Nenhuma linha | Código não existe (digitou errado, ou não é de um lote seu) | Peça print do email |
| `status = 'redeemed'`, `redeemed_by` é ele | Já resgatou; os créditos estão na conta | Confirme o saldo dele |
| `status = 'redeemed'`, outro dono | Código vazou ou foi compartilhado | Investigue antes de dar outro |
| `status = 'void'` | Você anulou | Depende do motivo |
| `expires_at` no passado | Expirou | Estenda a campanha ou gere um código novo |
| Ele diz que travou depois de tentar várias vezes | Rate limit (5 falhas/hora) | Espera 1h, ou você resgata por ele via RPC |

Resgatar manualmente por um usuário (service_role, pelo SQL Editor):

```sql
select public.redeem_coupon('<user_id>', 'XXXXXXXX', null);
```

### Reembolso depois do resgate

Não há reversão automática (a Kiwify não avisa o produto). Manual:

```sql
select public.grant_credits('<user_id>', -500, 'reversal', 'refund:<CODE>', '{"motivo":"reembolso Kiwify"}'::jsonb);
update public.coupon_codes set status = 'void' where code = '<CODE>';
```

`grant_credits` **não impede saldo negativo**. Se a pessoa já gastou, o saldo fica negativo: nada
corrompe (o `spend_credits` bloqueia gasto futuro), mas a UI mostra número negativo. No volume
esperado, tratar caso a caso.

---

## Decisões de projeto (por que está assim)

**Por que o resgate exige edge function e não é RPC direta do cliente.**
`grant_credits` está revogada de `authenticated` desde a Fase 0 de segurança
(`20260716000000_fase0_seguranca_creditos.sql:19`). Manter assim é o ponto: o único caminho de
concessão passa por `redeem_coupon`, que é `SECURITY DEFINER` e só executável por `service_role`. A
edge function resolve o usuário pelo **JWT**, nunca pelo body — `body.userId` é o vetor clássico de
roubo de crédito.

**Por que `redeem-coupon` não está no `config.toml`.**
Ausência ali significa `verify_jwt = true` (o default). O gateway do Supabase rejeita chamada sem JWT
válido antes de chegar no nosso código. É uma camada de defesa de graça.

**Por que o índice parcial `(campaign_id, redeemed_by)`.**
É a única coisa que pega o mesmo usuário resgatando **dois códigos diferentes da mesma campanha em
paralelo**: são linhas distintas, então o `FOR UPDATE` não serializa, e o `SELECT` de checagem das duas
transações passa porque nenhuma commitou ainda. O check no corpo da função cobre o caso sequencial
(mensagem bonita); o índice cobre a corrida.
**Custo assumido:** enquanto ele existir, o limite é fixo em 1 resgate por campanha por usuário.

**Por que idempotência TAMBÉM no ledger.**
`coupon_codes.status` é estado mutável (alguém pode resetar num UPDATE de suporte). O `credit_ledger`
é append-only e é a fonte de verdade, então a garantia mora lá também, via
`credit_ledger_coupon_uniq` com `payment_ref = 'coupon:<CODE>'`.

**Por que a função retorna JSON em vez de levantar exceção.**
Se levantasse, o rollback levaria junto o `INSERT` em `coupon_redeem_attempts` e o rate limiter nunca
veria uma única falha. Toda falha esperada precisa commitar o registro da tentativa.

**Por que o código tem prefixo TP no visual mas não no banco.**
Exibimos `TP-XXXX-XXXX` (parece código de cupom, é fácil de ditar por telefone) e armazenamos os 8
caracteres puros. A normalização remove o prefixo nos dois lados (servidor e cliente).
**Isto foi um bug pego em teste:** sem esse tratamento, o comprador que copia o código do email
exatamente como está recebe "código não encontrado" — ou seja, **todo resgate legítimo falharia**.

**Por que `?coupon=` e nunca `?code=`.**
`code` é o parâmetro do PKCE do Supabase Auth. Usar o mesmo nome faz os dois colidirem no retorno da
confirmação de email.

**Por que três camadas de persistência do código.**
Cada uma falha sozinha num cenário real: localStorage morre se a pessoa confirma o email em outro
dispositivo; a query do `emailRedirectTo` morre se a allow-list de Redirect URLs não bater (e falha em
**silêncio**, sem erro); `user_metadata` é a rede de segurança. Resolve nessa ordem: URL → metadata →
localStorage.

---

## ⚠️ Configuração obrigatória fora do código

No dashboard do Supabase, **Authentication → URL Configuration → Redirect URLs**, adicione:

```
https://trendpulse.com.br/**
```

Sem o wildcard, a URL de confirmação **com query string** (`/onboarding?coupon=...`) é rejeitada e o
Supabase cai silenciosamente no Site URL. O parâmetro evapora sem erro nenhum, e você vai debugar
código que está certo. As camadas 1 e 3 existem justamente para o cupom sobreviver a isso, mas o
caminho ideal depende dessa configuração.

**Secret já configurado:** `COUPON_IP_PEPPER` (usado no hash do IP das tentativas; nunca guardamos IP cru).

---

## O que foi verificado

Backend e edge function testados ao vivo em produção, com os artefatos revertidos depois:
resgate válido · idempotência (2º clique não credita de novo) · outro usuário no mesmo código ·
2º código da mesma campanha · expirado · campanha inativa · rate limit · normalização do formato do
email · e o ataque de mandar `userId` de terceiro no body (ignorado, usou o do JWT).

Fluxo completo no browser: `/resgatar` deslogado → signup preservando o código → logado resgata →
saldo sobe → navega para o produto.
