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
- [x] Remover `import-auth-users` (edge fn, zero refs no repo) — repo E remoto (deletada do Supabase em 2026-06-09).
- [x] Remover imports/rotas self_serve mortos em `App.tsx`. Código preservado em `backup/self-serve`.
- [x] Remover `DemoScenes` da landing (579 linhas).

**Novo insumo:** `docs/analise-telas-2026-06.md` — veredito tela a tela (spec × expectativa × realidade) das 22 rotas. Achados além da auditoria: Calendar está PRONTO (não só backend — drag-drop/reagendar/publicar funcionam); ContentPreview duplica o editor do ActionCard (convergir pós-Sprint 3); 3 fluxos de criação de marca (consolidar); BrandExamples/BrandPhotoBackgrounds moram em components/studio/ mas servem o BrandEdit do Maikon — MOVER antes de apagar Studio; /pricing aponta pra Asaas SANDBOX (cliente real cai em fluxo fantasma).

## SPRINT 1 — Consertar o onboarding ✅ FEITO (2026-06-09)
- [x] Geração síncrona morta — `Onboarding.tsx` reescrito: 1 tela, 6 chips de nicho (ICP saúde/coach) + "Outro", mockup CSS instantâneo, **zero chamadas de geração**.
- [x] Prompt pré-armado: `navigate("/chat", { state: { prefill } })` → `ChatPage` lê o router state → `ChatWindow` aceita `initialPrefill` e preenche o input (editável; usuário dispara o envio).
- [x] Onboardings mortos removidos: `OnboardingProvider`/`Overlay`/`Trigger` (já eram órfãos — nunca montados) + `SelfServeOnboarding` + `SelfServeLayout`. ⚠️ `HelpCenterModal`/`HelpTutorials` (mesma pasta) estão VIVOS (Sidebar) — preservados.
- [ ] QA manual pendente: criar conta nova → ver chips → cair no chat com prompt preenchido.

## SPRINT 2 — Ligar o billing ✅ CÓDIGO PRONTO (2026-06-09, commit 10e670d, ai-chat deployado)
- [x] `chargeCredits` plugado: `GENERATE_TEMPLATE` (ação nova `template`, 4cr) + `EDIT_CONTENT` (post/story por formato).
- [x] **Pre-check de saldo** (`insufficientCredits`) em TODOS os cases de geração — gated por `CREDITS_ENFORCED` (off = só loga).
- [x] **Pricing → créditos**: `Pricing.tsx` reescrito (logado abre `BuyCreditsModal` PIX; o fluxo sandbox `manage-subscription` morreu) + `PricingSection` da landing com packs/tradução em resultado.
- [x] "9 redes" padronizado (3 lugares) + empty state `/contents` → chat. (`useSubscription` no Profile já não existia.)
- [x] **SQL em prod aplicado** (2026-06-11, autorização explícita): linha `template` 4cr na credit_pricing + backfill 50cr em 8 perfis (guard pulou Maikon, 864cr). Todos os 9 perfis têm créditos.
- [ ] Trocar `ASAAS_PROD_KEY` pela key permanente do Raul.
- [ ] Ligar `CREDITS_ENFORCED=true` **só no lançamento** (decisão do Raul).

## SPRINT 3 — Poda pesada (confirm-then-cut, depende das 3 decisões)
*Ordem importa — pré-requisitos primeiro (achados da análise de telas, `analise-telas-2026-06.md`):*
- [ ] **PRÉ 1:** mover `BrandExamples` + `BrandPhotoBackgrounds` de `components/studio/` → `components/brand/` (servem o **BrandEdit do Maikon** — sem isso a poda do Studio quebra a tela mais crítica).
- [ ] **PRÉ 2:** desacoplar `BrandWizard` do pipeline Studio: step 4 chama `generate-template-sets` — simplificar (terminar no `analyze-brand-examples`). É o único fio segurando o pipeline vivo.
- [ ] **PRÉ 3 (smoke test Maikon):** após cada corte, gerar 1 post com a marca `photo_backgrounds` antes de pushar.
- [ ] Pipeline Studio órfão (6 edge fns: create-visual-brief, build-image-prompts, generate-image-variations, rank-and-select, generate-slide-backgrounds, analyze-image-layout) + páginas `Studio*`/`ManualStudioEditor` + rotas `/studio/*` (fora da sidebar, zero links de entrada).
- [ ] Billing assinatura legado: `manage-subscription` (sandbox), `check-usage`, `useSubscription`, `Pricing.tsx`, `Paywall`.
- [ ] OAuth IG/LinkedIn direto (6 edge fns + `Instagram/LinkedInConnectionCard` + rotas `/auth/*/callback` + `/instagram/history` — órfã, zero links de entrada).
- [ ] Páginas self_serve restantes (`Discover`, `TemplateGenerator`, `Library`, `SelfServePlaceholder`) **+ os testes delas**: ⚠️ 39 dos 67 testes da suíte cobrem essas páginas mortas (discover/library/template-*.test) — vão junto, e a suíte real encolhe pra ~28.
- [ ] Consolidar criação de marca: 3 fluxos hoje (BrandWizard `/brands/new` = default, BrandNew `/brands/new/simple`, chat CRIAR_MARCA) → manter wizard simplificado + chat; aposentar `/simple`.
- [ ] Blotato (se decisão = sair): re-rotear `GENERATE_TEMPLATE`, remover `blotato-proxy`/`render-template` engine=blotato, **cancelar assinatura $29/mês**.

## SPRINT 4 — Melhorar (já existe, subutilizado)
- [ ] **Calendário vira herói:** a análise de telas confirmou que a TELA está pronta (drag-drop semana/mês, backlog, reagendar, publicar via PFM) — falta só exposição: subir na sidebar, botão "Agendar" no `ActionCard`, copy "agende o mês e esqueça", nudge "você tem 3 posts prontos — agenda a semana?".
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
- [ ] Convergir os 2 editores (ActionCard do chat × ContentPreview `/content/:id`) — pós-Sprint 3, refactor maior.
- [ ] QA manual do onboarding novo (conta nova → chips → chat com prompt preenchido).

## Estado atual (o que JÁ está pronto e no ar — não refazer)
Billing por créditos completo (schema + Asaas PIX + dedução + UI), geração livre (`FREE_IMAGE`), crédito de boas-vindas, **carrossel editorial cinematográfico** (`GENERATE_EDITORIAL_CAROUSEL`, Satori), tweet card, fixes de chat (/impeccable), migração pra Vercel, white-glove consolidado.
