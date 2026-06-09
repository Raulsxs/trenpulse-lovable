# Roadmap TrendPulse — Próximas Sessões

> Documento vivo. Atualizado em 2026-06-09. Backlog priorizado do que atacar nas próximas sessões.
> Companion de `plano-produto-trendpulse-2026.md` (a tese) e `pesquisa-evolucao-produto-2026.md` (o mercado).

---

## ✅ Estado atual (pronto e no ar)

- **Billing por créditos completo:** schema (`user_credits`, `credit_ledger` append-only, `billing_events`, `credit_pricing`), funções atômicas `grant_credits`/`spend_credits`, RLS. Asaas PIX ponta a ponta (`create-credit-charge` + `asaas-webhook` registrado, idempotente). Dedução por geração no `ai-chat`. UI: saldo na sidebar + modal "Comprar créditos" (pack + CPF + QR PIX com polling).
- **Geração livre** (`FREE_IMAGE`): "gere uma imagem de X" → imagem crua sem moldura de post.
- **Crédito de boas-vindas:** 50cr a todo signup novo (trigger).
- **White-glove é o padrão único:** `self_serve`/template-first cortado de prod (flag off, backup em `backup/self-serve`).
- **Migrado pro Vercel:** deploy auto no push da `main`; domínio `trendpulse.com.br`. Edge functions seguem no Supabase (CLI).
- Tweet card, fixes de UI (`/impeccable`), Maikon text (Nano Banana Pro), modelos de imagem híbridos.
- Maikon seedado: 1080cr (~$20).

---

## 🚀 Horizonte 1 — Fechar a Fase 1 (LANÇAR)
*Sem isso o billing pronto fica parado. É o foco.*

### nº3 — Enforcement de créditos
- **O quê:** bloquear geração quando o saldo < custo da ação. Hoje a flag `CREDITS_ENFORCED` existe (default false, só debita best-effort).
- **Onde:** `ai-chat/index.ts` — adicionar pre-check de saldo no início dos cases GENERATE / GENERATE_CAROUSEL / GENERATE_TWEET_CARD / FREE_IMAGE (usar `getCreditBalance` + `creditCost`); se `CREDITS_ENFORCED` e saldo insuficiente → `replyOverride = "Sem créditos, compre um pack"` + break. Setar secret `CREDITS_ENFORCED=true` **no dia do lançamento**.
- **Esforço:** P. **Deixar o código pronto com a flag OFF.**

### nº4 — Onboarding self-serve (o "paradoxo white-glove")
- **O quê:** o produto guiar o usuário novo sozinho (sem o Raul segurar a mão). Empty states que ensinam, 1ª marca guiada, 1ª geração assistida, mostrar o saldo de boas-vindas.
- **Onde:** frontend — `ChatWindow` (empty state + onboarding steps já têm esqueleto), `BrandEdit`/wizard, novos componentes. Vale usar `/impeccable craft`.
- **Esforço:** G. **Sessão dedicada.**

### nº5 — Key Asaas permanente + landing/pricing de créditos
- **O quê:** (a) trocar o secret `ASAAS_PROD_KEY` pela key definitiva (a atual é temporária de 09/06) — 1 comando via Management API. (b) Refazer a landing/página de preços pra falar de **créditos** (hoje fala de planos fixos Free/Pro/Business).
- **Esforço:** P (key) + M (landing). Precisa da key do Raul.

### Limpezas do lançamento
- Trocar o `og:image` do Lovable no `index.html` por um próprio (preview social).
- Desligar o deploy do Lovable + remover o registro TXT `_lovable` no GoDaddy.
- Revisar a tabela `credit_pricing` e o valor de boas-vindas (50cr) antes de abrir.

---

## 🔁 Horizonte 2 — Reter (hábito; o nº1 da pesquisa)

### Calendário / agendamento real
- **O quê:** agendar publicações (data/hora) → publicar automático via Post for Me. Hoje o "Calendário" é mais visualização.
- **Esforço:** G. É a alavanca de retenção nº1.

### Lembretes / notificações
- "Hora de postar", "seu conteúdo foi publicado", saldo baixo. Email + in-app.

### Fila / banco de ideias
- Banco de ideias/conteúdos prontos pra reaproveitar, reduzindo o "tela em branco".

---

## 🧩 Horizonte 3 — Expandir (capacidades + moat; tudo monetizado por créditos)

- **Vídeo** (Reels/Stories) — Kling/Higgsfield. Premium = mais créditos.
- **Avatar / UGC** — HeyGen.
- **Analytics reais** — Apify (Raul já tem conta): métricas reais de Instagram/LinkedIn.
- **Vertical saúde + compliance** — Maikon de âncora; o moat defensável da pesquisa.

---

## 🛠️ Transversal — Qualidade / aquisição

- **Otimizar o carrossel de 122s** (pendência antiga): paralelizar as ~5 gerações de imagem (hoje em série). Impacto direto na percepção de qualidade. **Esforço M, alto valor.**
- **Aba de conversas** (adiada): hoje "novo chat" é destrutivo (`localStorage tp_conversation_since`); a versão leve = conversas reabríveis + título automático (precisa migration `conversation_id`). Decisão: fazer só quando o resto estabilizar.
- **Referral / indicação** (crescimento).
- **Robustez:** estados de erro, observability (Sentry), retries.

---

## 🧭 Sequência recomendada

1. **nº3 enforcement** (rápido, flag-off) — deixa o gatilho de lançamento pronto.
2. **Otimizar carrossel 122s** — rápido, melhora percepção já.
3. **nº4 onboarding** (sessão dedicada) — o que destrava o self-serve.
4. **nº5 landing/pricing** + key Asaas — fecha o lançamento.
5. **→ LANÇAR** (ligar `CREDITS_ENFORCED`, divulgar).
6. **Calendário** (retenção) → **Vídeo** (diferencial) → vertical/compliance.

---

## 🔑 Pendências que precisam do Raul
- Key **Asaas permanente** (a temp expira).
- Decisão de **quando ligar o enforcement** (= abrir a cobrança de verdade).
- Aprovar **landing/pricing** nova quando eu propuser.
- DNS/Lovable: desligar o Lovable depois de confirmar o Vercel estável.
