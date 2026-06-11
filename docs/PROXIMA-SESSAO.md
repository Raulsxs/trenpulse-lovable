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

## 🆕 VISÃO NOVA (2026-06-11): multigeração + publicação
Raul propôs posicionar como plataforma self-serve de IAs (imagem+vídeo, N modelos
inference.sh) com o loop de distribuição como moat. Análise completa, gap analysis,
economia e fases em **`docs/visao-produto-multigeracao-2026-06.md`** — ler antes de
planejar Horizonte 2+. 3 decisões pendentes no fim do doc. NÃO atropela o lançamento.

## SPRINT 3 — Poda pesada ✅ FEITO (2026-06-11, commit e4d2b3c) — decisões: Blotato SAI, Tendências SAI, Analytics ESCONDE
- [x] PRÉ 1: `BrandExamples`/`BrandPhotoBackgrounds` movidos → `components/brand/` (BrandEdit do Maikon intacto).
- [x] PRÉ 2 **caiu**: `generate-template-sets` NÃO era órfão do Studio — o `CRIAR_MARCA_ANALYZE` do chat também chama. Função PRESERVADA; BrandWizard step 4 fica como está.
- [x] Pipeline Studio (6 edge fns + páginas `Studio*` + `ManualStudioEditor` + hooks) removidos.
- [x] Billing assinatura legado removido (`manage-subscription`, `check-usage`, `useSubscription`, `Paywall`, `PricingCards`, `CpfCnpjModal`).
- [x] OAuth IG/LinkedIn direto removido (8 edge fns + cards + callbacks + `/instagram/history`).
- [x] Páginas self_serve restantes + 39 testes removidos (suíte: 67 → 28 reais).
- [x] Criação de marca consolidada: `/brands/new/simple` (BrandNew) aposentado.
- [x] Blotato removido: intent `GENERATE_TEMPLATE` + `detectBlotataTemplate` + botão Animar + templates Vídeo/Produto/Antes-Depois do dropdown. "Tutorial passo a passo" re-roteado pra GENERATE_CAROUSEL. ⚠️ **Raul: cancelar a assinatura Blotato ($29/mês)!**
- [ ] **Smoke test Maikon (PRÉ 3) pendente:** gerar 1 post com a marca `photo_backgrounds` em prod e conferir.
- [ ] **Delete remoto das 16 fns restantes** (classifier exige ordem nomeada do Raul; Blotato+Tendências já deletadas): `check-usage manage-subscription create-visual-brief build-image-prompts generate-image-variations rank-and-select generate-slide-backgrounds analyze-image-layout instagram-config instagram-oauth-callback refresh-instagram-token publish-instagram linkedin-config linkedin-oauth-callback refresh-linkedin-token publish-linkedin`

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
