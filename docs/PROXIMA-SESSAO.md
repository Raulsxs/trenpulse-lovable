# 🚀 Próxima sessão — ponto de entrada único

> Abra este doc primeiro. Ele ordena TUDO (auditoria + roadmap) em sprints prontos pra executar.
> Detalhe completo: `auditoria-completa-2026-06.md`. Tese/produto: `plano-produto-trendpulse-2026.md`. Roadmap original: `roadmap-proximas-sessoes.md`.

## Como começar a sessão nova
1. Leia este doc + `docs/auditoria-completa-2026-06.md` + a memória do projeto (`project_billing_credits`, etc.).
2. **Insight-chave:** o produto está mais construído do que parece — o trabalho é **podar, ligar, consertar onboarding e vender**, não construir mais.
3. **Cuidado nº1:** NÃO quebrar o Maikon. `photo_overlay` ainda é usado pela marca dele (`photo_backgrounds`); rastrear a geração dele ponta a ponta antes de mexer em geração/legado.

## ⛔ 3 decisões de produto que destravam a limpeza (perguntar ao Raul ANTES de cortar)
- [ ] **Blotato fica ou sai?** → define `/templates`, `GENERATE_TEMPLATE`, `render-template engine=blotato`, `blotato-proxy`. (Recomendação da auditoria: re-rotear pros novos `GENERATE_TWEET_CARD`/`GENERATE_EDITORIAL_CAROUSEL` e aposentar Blotato.)
- [ ] **Dashboard "Explorar Tendências" + `generate-content` continuam?** (Recomendação: cortar — distração, custo de scraping, não conecta ao loop gerar→agendar→publicar.)
- [ ] **Analytics** tem dado real ou é placeholder até Apify? (Recomendação: esconder até ter dado.)

---

## SPRINT 0 — Poda risco-zero ✅ FEITO (2026-06-09, commits a348880 + d8ba969)
- [x] Remover `import-auth-users` (edge fn, zero refs no repo). ⚠️ Falta o delete REMOTO (classifier bloqueia agente): `npx supabase functions delete import-auth-users --project-ref qdmhqxpazffmaxleyzxs`
- [x] Remover imports/rotas self_serve mortos em `App.tsx`. Código preservado em `backup/self-serve`.
- [x] Remover `DemoScenes` da landing (579 linhas).

**Novo insumo:** `docs/analise-telas-2026-06.md` — veredito tela a tela (spec × expectativa × realidade) das 22 rotas. Achados além da auditoria: Calendar está PRONTO (não só backend — drag-drop/reagendar/publicar funcionam); ContentPreview duplica o editor do ActionCard (convergir pós-Sprint 3); 3 fluxos de criação de marca (consolidar); BrandExamples/BrandPhotoBackgrounds moram em components/studio/ mas servem o BrandEdit do Maikon — MOVER antes de apagar Studio; /pricing aponta pra Asaas SANDBOX (cliente real cai em fluxo fantasma).

## SPRINT 1 — Consertar o onboarding ✅ FEITO (2026-06-09)
- [x] Geração síncrona morta — `Onboarding.tsx` reescrito: 1 tela, 6 chips de nicho (ICP saúde/coach) + "Outro", mockup CSS instantâneo, **zero chamadas de geração**.
- [x] Prompt pré-armado: `navigate("/chat", { state: { prefill } })` → `ChatPage` lê o router state → `ChatWindow` aceita `initialPrefill` e preenche o input (editável; usuário dispara o envio).
- [x] Onboardings mortos removidos: `OnboardingProvider`/`Overlay`/`Trigger` (já eram órfãos — nunca montados) + `SelfServeOnboarding` + `SelfServeLayout`. ⚠️ `HelpCenterModal`/`HelpTutorials` (mesma pasta) estão VIVOS (Sidebar) — preservados.
- [ ] QA manual pendente: criar conta nova → ver chips → cair no chat com prompt preenchido.

## SPRINT 2 — Ligar o billing (a torneira de receita)
- [ ] Plugar `chargeCredits` nos paths que não cobram: `GENERATE_TEMPLATE` + `EDIT_CONTENT` no `ai-chat`.
- [ ] Adicionar **pre-check de saldo** nos cases de geração (gated por `CREDITS_ENFORCED`, default off).
- [ ] **Backfill** de créditos pros usuários existentes (9 perfis, só 1 com créditos hoje).
- [ ] Reescrever **landing/pricing pra créditos**: `PricingSection.tsx` (landing) + `Pricing.tsx`/`PricingCards.tsx` (app) ainda vendem assinatura mensal — billing é crédito. **Pré-requisito de qualquer copy.**
- [ ] Padronizar "**9 redes**" na landing (hoje diz "Instagram & LinkedIn" em 4 lugares).
- [ ] Trocar `ASAAS_PROD_KEY` pela key permanente do Raul.
- [ ] Ligar `CREDITS_ENFORCED=true` **só no lançamento** (decisão do Raul).

## SPRINT 3 — Poda pesada (confirm-then-cut, depende das 3 decisões)
- [ ] Billing assinatura legado: `manage-subscription` (sandbox), `check-usage`, `useSubscription`, `Pricing.tsx`, `Paywall`.
- [ ] Pipeline Studio órfão + páginas `Studio*`/`ManualStudioEditor` (⚠️ confirmar acoplamento com `BrandWizard`/`generate-template-sets` antes).
- [ ] OAuth IG/LinkedIn direto (6 edge fns + `Instagram/LinkedInConnectionCard`) — PFM substituiu.
- [ ] Páginas self_serve restantes (`Discover`, `TemplateGenerator`, `Library`, `SelfServePlaceholder`).
- [ ] Blotato (se decisão = sair): re-rotear `GENERATE_TEMPLATE`, remover `blotato-proxy`/`render-template`.

## SPRINT 4 — Melhorar (já existe, subutilizado)
- [ ] **Calendário vira herói:** UX + copy "agende o mês e esqueça". Botão "Agendar" no `ActionCard`. Nudge "você tem 3 posts prontos — agenda a semana?".
- [ ] **Ensinabilidade:** reativar `FeatureGuide` (código pronto, nunca importado); baixar threshold do `SmartNudge` connect-social pra `>=1`; promover carrossel/tweet card pras quick actions visíveis; quick actions com exemplo concreto do nicho.
- [ ] **Renderização progressiva do carrossel** (mostra slide a slide — pendente do roadmap; melhora o 122s percebido).

## SPRINT 5 — Vender (posicionamento/aquisição)
- [ ] **Reposicionar pro ICP saúde/coach (Maikon):** "seu social media de IA" (ancora preço na agência R$2k). Reescrever home com o statement da auditoria + JTBD "parecer autoridade constante sem virar designer".
- [ ] **Case do Dr. Maikon** (vídeo + depoimento) — alavanca de conversão nº1 (landing tem zero prova social hoje).
- [ ] Landing restruturada: hero outcome + prova social inline + 1 hero use-case (não 6 formatos); ResultGallery com exemplos de saúde (não tech); FAQ; pricing de créditos com âncora.

---

## Pendências de polish (encaixar quando der)
- [ ] Editorial: temas/paleta da marca no overlay (hoje highlight fixo `#19E5C5`); avatar do perfil na moldura.
- [ ] Esconder Analytics até ter dado real (Apify).
- [ ] Trocar og:image do Lovable no `index.html`; desligar Lovable + remover TXT `_lovable` no GoDaddy.

## Estado atual (o que JÁ está pronto e no ar — não refazer)
Billing por créditos completo (schema + Asaas PIX + dedução + UI), geração livre (`FREE_IMAGE`), crédito de boas-vindas, **carrossel editorial cinematográfico** (`GENERATE_EDITORIAL_CAROUSEL`, Satori), tweet card, fixes de chat (/impeccable), migração pra Vercel, white-glove consolidado.
