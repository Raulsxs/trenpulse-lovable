# Auditoria Completa — TrendPulse (2026-06-09)

> Síntese de 5 auditorias paralelas: Produto/Negócio, Marketing/Posicionamento, Landing, Onboarding, Fluxos/Legado. Frameworks: product-brainstorming, marketing-psychology, product-marketing, landing-page-design. Baseado em leitura do código real (não dos docs, que estão desatualizados).

## ⚡ A virada de diagnóstico (o insight que muda tudo)

**O produto está MAIS construído do que os docs dizem — mas está escondido, mal-precificado, não-vendido e cercado de código morto.** O trabalho NÃO é "construir mais". É **podar, ligar, consertar o onboarding e vender**.

Três fatos que provam isso:
1. **O Calendário/agendamento — o "gap nº1" da pesquisa — JÁ EXISTE e funciona** (cron `instagram-scheduler` → `publish-postforme` publica sozinho). Está como 4º item de sidebar, sem ser vendido.
2. **"Você literalmente não cobra"** — toda a infra de créditos (Asaas/PIX) está pronta e parada (`CREDITS_ENFORCED=false`), e ainda há paths de geração que nem debitam.
3. **~15 das 41 edge functions são órfãs** + a árvore self_serve, o Studio e o billing de assinatura são peso morto. Limpeza corta a superfície quase pela metade.

---

## 🔪 MATAR (podar pra focar)

| Item | Risco de remoção |
|---|---|
| `import-auth-users` (zero refs no repo) | **Zero — remover já** |
| Imports self_serve em `App.tsx:37-42` + `SelfServeLayout` (código inalcançável, flag off, backup em `backup/self-serve`) | **Zero — remover já** |
| Páginas self_serve mortas (`Discover`, `TemplateGenerator`, `Library`, `SelfServePlaceholder`, `SelfServeOnboarding`) | Baixo (confirmar) |
| Billing de assinatura legado: `manage-subscription` (Asaas **sandbox**), `check-usage`, `useSubscription`, `Pricing.tsx`, `PricingCards`, `Paywall` | Baixo (confirmar zero leitura) |
| Pipeline Studio órfão: `create-visual-brief`, `build-image-prompts`, `generate-image-variations`, `rank-and-select`, `generate-slide-backgrounds`, `analyze-image-layout` + páginas `Studio*`/`ManualStudioEditor` | ⚠️ Médio (acoplamento c/ BrandWizard — confirmar) |
| OAuth IG/LinkedIn direto (6 edge fns + `InstagramConnectionCard`/`LinkedInConnectionCard`) — PFM substituiu | Baixo (confirmar) |
| `DemoScenes` da landing (579 linhas, redundante com ChatMockup + ResultGallery, pesa a página) | Zero |

→ **~15 edge functions + uma árvore de páginas mortas.**

## 🔧 CONSERTAR (quebrado/bugado)

1. **Onboarding — o bug dos 2 minutos (PRIORIDADE):** `Onboarding.tsx` Step 2 chama `generate-content` **síncrono, sem timeout, sem streaming** — e um **mockup CSS já mostrou o post instantâneo antes**, então a espera não agrega nada. Fix: matar a geração síncrona, encurtar o wizard pra 1 tela leve (nicho via chips, sem `@` antecipado), jogar o user no **chat com prompt pré-armado** do nicho dele (aha real, editável, dentro do produto). + `AbortController`/timeout.
2. **Billing não enforça:** plugar `chargeCredits` em `GENERATE_TEMPLATE`/`EDIT_CONTENT` (paths que não cobram), adicionar **pre-check de saldo**, **backfill** dos usuários existentes (9 perfis, só 1 com créditos), e ligar `CREDITS_ENFORCED=true` no lançamento.
3. **Landing mente sobre o preço:** `PricingSection.tsx` + `Pricing.tsx` ainda vendem **assinatura mensal** ("X gerações/mês") — o billing virou **créditos**. Reescrever pra créditos antes de qualquer otimização de copy.
4. **3 sistemas de onboarding** (2 mortos): matar `OnboardingProvider` (tour de 13 passos que quase nunca dispara + descreve UI antiga) e `SelfServeOnboarding`; **reativar** o `FeatureGuide` (código pronto, nunca importado).
5. **"9 redes" vs "Instagram & LinkedIn":** inconsistência repetida em 4 lugares da landing — padronizar "9 redes".
6. **Blotato no caminho quente:** `/templates` + `GENERATE_TEMPLATE` + `render-template engine=blotato` + `blotato-proxy` ainda ativos apesar de "cancelado". **Decisão necessária** (re-rotear pros novos tweet card/editorial, ou manter).

## 📈 MELHORAR (já existe, subutilizado)

1. **Calendário → herói.** Já funciona; promover na UX + copy ("agende o mês e esqueça") — é a retenção que segura churn de SMB.
2. **Ensinabilidade just-in-time:** wirar a infra que JÁ existe no `ChatWindow` — `FeatureGuide`, baixar threshold do `SmartNudge` connect-social pra `>=1`, pré-preencher quick actions com **exemplos concretos do nicho** (usar `NICHE_CONTENT_IDEAS`), botão "Agendar" no `ActionCard`. Promover carrossel/tweet card pras quick actions visíveis (hoje escondidos no dropdown).
3. **Analytics:** raso (sem dado real até Apify) — **esconder até ter dado**, hoje subtrai confiança.

## 💰 VENDER (posicionamento — fazer valer dinheiro)

1. **ICP: coach/profissional de saúde (tipo Maikon)** — NÃO o criador genérico. É o único segmento onde seus 3 diferenciais (marca consistente + formatos prontos + publicar de um lugar) batem exatamente com a dor (autoridade = receita; zero tempo/habilidade de design).
2. **Reposicionar como "seu social media de IA"** (substituto da agência de R$2k/mês → **ancora o preço** muito acima de "ferramenta tipo Canva R$30").
3. **Liderar com 1 hero use-case** (ex: foto sua + frase viram post de autoridade), não com 6 formatos (sobrecarga cognitiva).
4. **Case do Dr. Maikon** (vídeo + depoimento) — Authority + Social Proof, a alavanca de conversão nº1 pro nicho saúde cético. Hoje a landing tem **zero prova social**.
5. **Pricing de créditos com psicologia:** traduzir crédito em resultado ("1080 créditos ≈ 1 ano de posts diários"), ancorar no pacote grande, comunicar "não expira" (loss aversion).
6. **Landing restruturada:** hero (outcome + prova social inline + 9 redes), barra de prova real, problema, **3** features (não 6), use cases, ResultGallery com exemplos de **saúde** (não tech), testimonial Maikon, pricing de créditos, FAQ.

## ⚠️ RISCOS — não quebrar o Maikon

- **`photo_overlay` NÃO está morto:** `ai-chat:2579` seta `default_visual_style: "photo_overlay"` pra brands `photo_backgrounds` — **a marca do Maikon**. O *modo de geração* foi abandonado, mas o *brand mode* é ativo. **Rastrear a geração do Maikon ponta a ponta antes de mexer.**
- **`generate-content`** alimenta o Dashboard "Explorar Tendências" (ativo na sidebar) — decisão de produto antes de cortar.
- **BrandWizard** usa `generate-template-sets` + `analyze-brand-examples` + componentes Studio — confirmar antes de cortar o Studio.

---

## 🎯 Plano priorizado (caminho mais curto pra receita)

1. **Podar o entulho** (risco-zero já: self_serve imports + `import-auth-users`; depois confirm-then-cut: Studio, subscription, IG/LinkedIn legados). Reduz superfície ~metade.
2. **Consertar o onboarding** (matar a geração síncrona de 2min). É o gargalo da ativação — sem isso, ligar a cobrança não adianta.
3. **Ligar o billing** (wire todos os paths + pre-check + backfill + flag) + **landing/pricing → créditos**. Abre a torneira de receita com infra já pronta.
4. **Promover o Calendário a herói** + ensinabilidade no chat. Retenção.
5. **Reposicionar** (ICP saúde + case Maikon + landing restruturada). Aquisição.

## Decisões de produto que travam a limpeza (precisam de você)
- **Blotato fica ou sai?** (define `/templates`, `render-template`, `GENERATE_TEMPLATE`, `blotato-proxy`)
- **Dashboard/Trends + `generate-content`** continuam no produto ou viram legado?
- **Analytics** é placeholder até Apify (esconder) ou tem fonte real?

## Tese contrária registrada (anti-convergência)
A "geração livre estilo Gemini" é o vetor que te vira **wrapper de Gemini** e atrai quem nunca paga. Deve ser **isca de onboarding com teto baixo**, nunca o centro. O dinheiro está em **marca + agendamento**, não em geração livre.
