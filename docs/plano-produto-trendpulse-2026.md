# Plano de Produto — TrendPulse (rumo ao lançamento)

> Documento vivo. Escrito em 2026-06-09. Owner: Raul. Consolida a visão de produto (chat-driven + geração livre + créditos), valida a viabilidade do billing, define o que cortar e o roadmap pra "sair do papel". Companion do `docs/pesquisa-evolucao-produto-2026.md` (pesquisa de mercado/capacidades).

---

## 1. Tese

**TrendPulse é um estúdio de IA que você conversa.** Gere **qualquer coisa livremente** (como chamar o Gemini) ou **conteúdo de marca pronto pra publicar** (post, carrossel, story, tweet card) com sua identidade embutida — num **modelo de créditos** (paga pelo que usa). A experiência "white-glove" (chat + marcas + formatos especiais) vira o **padrão único** pra todos.

---

## 2. Posicionamento e o moat

A pesquisa estabeleceu: "gerar um post" virou commodity. Liberar geração livre estilo Gemini **baixa a barreira** mas **aumenta o risco de virar "wrapper de Gemini"** (o usuário usa o Gemini direto e corta o TrendPulse).

**O antídoto — o moat são os extras**, não a geração crua:
- **Marca** (estilo/identidade consistente injetada na geração)
- **Formatos sociais especiais** (tweet card, quote card, infográfico, photo-overlay)
- **Publicação multi-plataforma** (Post for Me, 9 redes)
- **Um saldo só** pra tudo (créditos) + (depois) **calendário/agendamento**

Pitch de uma linha: *"Gere livre como no Gemini — mas com sua marca, em formatos prontos pra rede, e publique de um lugar só."*

---

## 3. Os 3 pilares

1. **Geração via chat** — livre + marca + formatos especiais. Uma experiência só.
2. **Créditos** — carrega, gasta por ação (custo × margem), recarrega. Transparente.
3. **Os extras que justificam vs Gemini cru** — marca, formatos, publicação, depois calendário/compliance.

---

## 4. O que CORTAR (decisão: white-glove é o padrão)

- **Remover o fork `account_type` (white_glove vs self_serve)** e todo o **refactor template-first** (galeria de templates separada, `REFACTOR_PLAN.md`/`IMPLEMENTATION_PLAN.md`, Fases 0-4, branch `refactor/template-first`). Consolidar numa experiência única.
- Os **templates não somem** — viram **features dentro do chat** (tweet card, quote card, infográfico), não uma UI paralela.
- ⚠️ Tradeoff: perde-se o caminho "guiado pra leigo" do template-first. **Mitigação:** o onboarding do chat (§7) precisa fazer esse papel.

---

## 5. Modelo de billing por créditos (VALIDADO)

### 5.1 A arquitetura certa: pooled + ledger próprio (desacoplado)

A confusão comum: "preciso carregar dinheiro no inference por usuário?". **Não.** O padrão correto (igual a qualquer SaaS que revende IA):

```
Usuário  --paga via Stripe-->  TrendPulse (ledger de créditos no Supabase)
                                      |
                                      | gasta créditos por geração
                                      v
TrendPulse (1 conta inference pooled, auto-recharge ON)  --paga inference do bolso-->  inference.sh
```

- **Duas pontas desacopladas.** O dinheiro do usuário entra no Stripe → vira saldo de créditos no SEU banco. Sua conta inference (UMA, compartilhada) se mantém financiada sozinha via **auto-recharge**. **A margem = créditos vendidos − custo inference.**
- O usuário **nunca toca** o inference. O "valor que ele carrega" é contabilizado **no seu banco**, não no inference.

### 5.2 inference.sh billing (evidência do painel, 2026-06-09)

- Modelo: **créditos prepagos em USD** (saldo atual: 18.84/20.00).
- Compra via cartão (Mastercard no arquivo). Histórico: "credit purchase $21.30 paid" etc.
- ✅ **`auto-recharge`** disponível ("automatically add credits when balance is low") → **sua conta pooled nunca zera sozinha** (foi o que quebrou o Maikon quando o saldo dele zerou — com auto-recharge no pool, não acontece).
- ✅ **Spending controls**: alerta de saldo baixo + **limite de gasto mensal** (proteção contra abuso/runaway).
- Existe "credit line — run without prepaying" (pós-pago via contato) — opção futura se o volume crescer.

**Conclusão:** liga o auto-recharge + limite mensal na conta inference pooled. Funding resolvido, sem trabalho manual.

### 5.3 Stripe / Asaas (a divisão de pagamento)

- **Cartão (nacional + internacional):** Stripe — **Checkout one-time (`mode: payment`)** pra packs de crédito + webhook (`checkout.session.completed`) credita o saldo.
  - ⚠️ **NÃO usar os "credit grants" nativos do Stripe Billing** — eles são **só monetários** e só debitam contra preços medidos via Meters API; isso briga com a sua lógica de markup por modelo. **Stripe = caixa registradora; a carteira vive no SEU banco.**
- **PIX/boleto (Brasil):** o Stripe ganhou PIX cross-border em ago/2025 (via EBANX), mas **PIX doméstico é invite-only** e **boleto exige entidade BR**. O **Asaas** (já integrado) é nativo em PIX/boleto/cartão BR, sem essa fricção, e **PIX recorrente reduz churn involuntário** (~40% do churn é cartão falho).
- **Recomendação (validada):** **Asaas pro PIX/boleto (público BR) + Stripe pro cartão internacional.** Ambos alimentam o **mesmo ledger** (Stripe `checkout.session.completed`; Asaas `PAYMENT_CONFIRMED`). Não reconstruir o que o Asaas já dá de PIX.

### 5.4 Mecânica dos créditos

- **Crédito = unidade de cobrança.** Proposta: **1 crédito = R$0,10** (face).
- Cada ação desconta créditos = `round(custo_real_BRL × markup / 0,10)`, **mostrado pro usuário antes**.
- **Markup ~3x** o custo bruto (alvo ~65-70% de margem). Como os custos reais despencaram (gpt-image-2 a $0,024), dá pra ser **mais barato por geração que os planos fixos de hoje E mais lucrativo**.
- Créditos **destravam recursos caros** (vídeo, Nano Banana Pro, avatar) sem ginástica de planos — premium custa mais créditos.

### 5.5 Exemplo de pricing (concreto)

| Ação | Custo bruto | Cobrado (~3x) | Créditos |
|---|---|---|---|
| Legenda (minimax) | ~R$0,005 | bundled | 0 |
| Tweet card (Satori) | ~R$0 | R$0,20 | 2 |
| Post (gpt-image-2 medium) | ~R$0,13 | R$0,40 | 4 |
| Carrossel 5 slides | ~R$0,65 | R$2,00 | 20 |
| Imagem premium (Nano Banana Pro) | ~R$0,80 | R$2,40 | 24 |
| Vídeo Reel (Kling, futuro) | ~R$2,70 | R$8,00 | 80 |

**Pack R$100 → 1000 créditos** = ~250 posts OU ~50 carrosséis OU ~40 imagens premium. Generoso pro usuário, ~67% de margem.

Comparação: Pro atual = R$1,48/gen fixo. Créditos = R$0,40/post → **mais barato E lucrativo**. (Heavy users pagam mais; light users pagam pouco — alinhado ao uso.)

**Modelo recomendado pro lançamento:** **pay-as-you-go puro (só créditos)** — mais simples, casa com "carrega e gasta". Avaliar depois uma base mensal pequena ("Pro") pra receita recorrente + features premium (calendário, publish ilimitado).

---

## 6. Arquitetura técnica (Fase 1)

### 6.1 Ledger de créditos (Supabase) — append-only, é a fonte de verdade
- **`credit_ledger`** (id, user_id, `amount` int [+grant / −spend], reason ['purchase'|'generation'|'refund'|'reversal'|'promo'], generation_id, payment_event_id, metadata jsonb {model, real_cost_usd, markup}, created_at) — **append-only, nunca dar UPDATE em saldo**.
- **Saldo = `SUM(amount) WHERE user_id=$1`** (cacheável numa linha `wallet_balances` atualizada na mesma transação, mas o ledger é a verdade).
- **Gasto atômico (race-safe):** função Postgres `spend_credits(user, amount, gen_id)` com `SELECT ... FOR UPDATE` — checa saldo, rejeita se insuficiente, insere o débito. **Um único lugar muta o saldo.**
- **Estorno:** nunca deletar linha — inserir linha compensatória `reversal`. Geração falhou → credita de volta.
- Tabela `pricing` (action/model → créditos) — ajustável sem deploy.

### 6.2 Fluxo de pagamento (idempotente — webhooks repetem)
1. Usuário compra pack → Stripe Checkout (`metadata.user_id`) ou Asaas → webhook (Edge Function `credits-webhook`).
2. **Verificar assinatura**, depois `INSERT processed_events(event_id) ON CONFLICT DO NOTHING` — se já existia, pula (credita **exatamente uma vez**).
3. Se novo: `INSERT credit_ledger(+créditos, reason='purchase', payment_event_id)`.

### 6.3 Dedução por geração — por tabela de preço (NÃO pela resposta do /run)
- ⚠️ **Confirmado: a resposta `/run` do inference NÃO tem campo de custo.** Meter por **tabela de preço por modelo** (que já existe no CLAUDE.md): `créditos = ceil(custo_real × markup × créditos_por_USD)`.
- Antes de gerar: checar saldo ≥ preço da ação (o `check-usage` vira `check-credits`). Mostrar o custo em créditos **antes** ("este carrossel = 20 créditos").
- Debitar **após sucesso** (mais simples e justo). Falha → sem débito.
- (Opcional, offline) testar `GET /usage/tasks/:id/cost` do inference (retorna custo em microcents) **só pra reconciliação de margem**, não pra débito ao vivo.

### 6.4 Conta inference pooled
- **Auto-recharge ON + limite mensal** (confirmado disponível no painel inference) → pool nunca zera sozinho (foi o que quebrou o Maikon). API programática de top-up não confirmada, mas **não é necessária** — o toggle do dashboard basta.
- Cron no Supabase: estima gasto do pool por `Σ real_cost` do ledger → alerta se margem/saldo baixo.

### 6.5 Margem auditável
- Como cada débito guarda `real_cost_usd` no metadata: **margem realizada = Σ(créditos vendidos R$) − Σ(custo real R$)** a qualquer momento.

### 6.5 Intent flow (geração livre + marca + formatos)
- `ai-chat` ganha caminho de **geração livre** ("gere uma imagem de X" sem marca/formato → chamada crua ao modelo, retorna imagem). Hoje o `GENERATE` já lida com "sem marca"; é estender pra não forçar moldura de post.
- Mantém: `GENERATE` (marca), `GENERATE_CAROUSEL`, `GENERATE_TWEET_CARD`, `CHAT`.

---

## 7. Onboarding self-serve (o paradoxo white-glove)

White-glove funcionou porque **o Raul segurou a mão do Maikon**. Pra virar padrão self-serve, **o produto** precisa fazer esse hand-holding:
- Onboarding no 1º acesso (criar marca guiado, 1ª geração assistida).
- Empty states que ensinam (o que digitar, exemplos).
- Sugestões/quick-actions contextuais no chat.
- Defaults bons (marca padrão, formato sugerido).
- Saldo de créditos de boas-vindas (ex.: R$5 / 50 créditos) pra ativar (time-to-value nos primeiros minutos).

Sem isso, o usuário novo abre o chat, não sabe o que fazer, e abandona.

---

## 8. Roadmap pra "sair do papel"

### Fase 1 — Lançável/divulgável (bloqueadores reais)
1. **Billing por créditos funcional** ← *bloqueador nº1.* Ledger + Stripe/Asaas webhook + dedução por geração + UX de saldo.
2. **Geração livre** no chat.
3. **Consolidar no white-glove** (remover fork self_serve) + **onboarding self-serve** (§7).
4. **Polish de UI** (iniciado com /impeccable; saldo visível, custo por ação, ActionCard compacto).

### Fase 2 — Retenção/crescimento (pós-lançamento)
5. **Calendário/agendamento** (pesquisa: buraco nº1 de retenção).
6. **Mais capacidades inference** (vídeo Kling, avatar HeyGen) — já monetizadas pelos créditos.
7. **Vertical saúde + compliance** (moat defensável; Maikon de âncora).

---

## 9. Decisões abertas
1. Billing **puro pay-as-you-go (créditos)** vs **base mensal + créditos**? (Recomendo puro pra lançar.)
2. **Asaas (PIX) + Stripe (cartão)** confirmado? Ou um só?
3. Confirmar **corte do self_serve/template-first**.
4. **Markup** (recomendo ~3x) e **crédito de boas-vindas** (recomendo ~50 créditos).

---

## 10. Riscos
- **Wrapper de Gemini** (geração livre sem moat) → mitigar com marca/formatos/publish (§2).
- **White-glove sem hand-holding humano** → mitigar com onboarding de produto (§7).
- **Abuso de geração** (queima seu inference) → mitigar com checagem de saldo pré-geração + limite mensal no inference.
- **Margem corroída por modelo caro** → o custo é mostrado em créditos; premium custa mais; markup protege.
- **Custo do inference subir** → markup % se ajusta sozinho (não é preço fixo).
