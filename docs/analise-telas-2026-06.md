# Análise tela a tela — TrendPulse (2026-06-09)

> Complemento da `auditoria-completa-2026-06.md`. Cada rota white_glove: o que a tela
> PROMETE (spec/expectativa do cliente), o que ela FAZ de verdade (código), e o veredito.
> Fonte: leitura de todas as 22 rotas + sidebar (2 agentes de exploração) + verificação manual.

## Legenda de veredito
- ✅ **MANTER** — cumpre a spec, deixar quieta
- ⭐ **PROMOVER** — melhor do que parece, subvendida
- 🔧 **CONSERTAR** — viva mas mente/quebra a expectativa
- 🤝 **CONSOLIDAR** — duplica outra tela, fundir
- 🪦 **MATAR** — órfã ou sem propósito no produto atual
- ⛔ **DECISÃO** — depende das 3 decisões de produto

---

## Núcleo do produto (o loop gerar → editar → agendar → publicar)

### `/chat` (ChatPage) — ✅ MANTER (é a home)
**Expectativa:** "digito o que quero, sai um post pronto". **Realidade:** cumpre; wrapper leve do ChatWindow + mini-calendário em sheet. **Nota:** é a única porta de geração que importa — toda tela que duplica geração fora do chat é candidata a poda.

### `/calendar` — ⭐ PROMOVER A HERÓI
**Expectativa:** "agendo o mês e esqueço". **Realidade:** MELHOR que o esperado — drag-drop semana/mês, backlog lateral de aprovados, reagendamento, render de composites client-side antes de publicar, publish via PFM. Backend (`instagram-scheduler`) battle-tested: optimistic lock, retry cap 3, bug de duplicação corrigido em prod (05/14).
**Gap real:** invisível na proposta de valor (4º item da sidebar, zero menção na landing). O Sprint 4 (botão Agendar no ActionCard + copy) é só acabamento — a tela em si está pronta.

### `/contents` — ✅ MANTER (1 conserto)
**Expectativa:** "meus posts num lugar só". **Realidade:** galeria com filtro de status, busca, delete. **Conserto:** empty state manda pro `/dashboard` (Tendências) — deveria mandar pro `/chat`.

### `/content/:id` (ContentPreview) — 🔧 CONSERTAR (médio prazo)
**Expectativa:** "ajusto e aprovo o post". **Realidade:** editor mais maduro do app (1.850 linhas: draft autosave, polling de geração, 4 modos de render, agendar, publicar, salvar template de fundo). **Problema:** é um SEGUNDO editor — o ActionCard do chat já edita (Ajustar/Refazer/publicar). Dois caminhos de edição = dupla manutenção e UX inconsistente. Não mexer agora; convergir depois do Sprint 3.

### `/download/:id` — ✅ MANTER
**Expectativa:** "baixo o post pra usar onde quiser". **Realidade:** ZIP + PDF client-side, progress, casos LinkedIn document. Maduro.

---

## Aquisição/conta

### `/` (Index, landing) — 🔧 CONSERTAR (Sprint 2+5)
**Expectativa do visitante:** entender o produto e o preço REAL. **Realidade:** vende **assinatura morta** ("5 gerações por mês" — billing é créditos), zero prova social, "Instagram & LinkedIn" em 4 lugares (são 9 redes). DemoScenes já podada (Sprint 0 ✂️).

### `/auth` — ✅ MANTER
Multi-account switcher com tokens salvos, Google OAuth, reset. Sólida, não tocar.

### `/onboarding` — 🔧 CONSERTAR (Sprint 1, prioridade)
**Expectativa:** "em 1 minuto vejo a mágica". **Realidade:** step 2 chama `generate-content` **síncrono, bloqueante, sem timeout** (Onboarding.tsx:296→322) depois que um mockup CSS já entregou o aha de graça. Plano do Sprint 1 está certo: matar geração síncrona, 1 tela leve, cair no chat com prompt pré-armado.

### `/profile` — ✅ MANTER (1 limpeza)
Centraliza contexto IA + conexões sociais (PFM). **Limpeza:** import morto de `useSubscription` (Profile.tsx:10).

### `/pricing` — 🔧 REESCREVER (Sprint 2)
**Expectativa:** "compro créditos". **Realidade:** vende assinatura via `manage-subscription` (Asaas **sandbox**!). Cliente que tentar pagar aqui cai num fluxo fantasma. Reescrever pra créditos (modal de compra já existe na sidebar) ou redirecionar pro modal.

### `/admin` (AdminAnalytics) — ✅ MANTER
Gated por email, já fala créditos/margem. OK.

### `/privacy`, `/reset-password` — ✅ MANTER (utilitárias)

---

## Marcas (3 fluxos pra mesma coisa — consolidar)

### `/brands` — ✅ MANTER (limpeza Sprint 3)
CRUD + duplicar + analisar estilo. **Nota:** duplicação copia `template_sets` (acoplamento Studio — limpar junto do Sprint 3).

### `/brands/new` (BrandWizard, o DEFAULT) — 🔧 CONSERTAR
**Expectativa:** "configuro minha marca uma vez, bem". **Realidade:** 5 steps; o step 4 chama `generate-template-sets` (pipeline Studio que vai morrer). **É o acoplamento que trava o Sprint 3** — decidir: simplificar o wizard (matar step 4, terminar no analyze-brand-examples) e aí o pipeline Studio fica 100% órfão.

### `/brands/new/simple` (BrandNew) — 🤝 CONSOLIDAR
Form linear que faz subconjunto do wizard. **3 fluxos de criação de marca** (wizard + simple + chat CRIAR_MARCA) = manutenção tripla. Recomendação: manter wizard (simplificado) + chat; aposentar o `/simple`.

### `/brands/:id/edit` (BrandEdit) — ✅ MANTER (intocável)
**É a tela do white-glove/Maikon**: modos de criação (photo_backgrounds etc.), regras do/don't, preferências visuais 3-state, fotos de fundo. Componentes `BrandExamples`/`BrandPhotoBackgrounds` moram em `components/studio/` — **mover de pasta ANTES de apagar o Studio** (senão a poda quebra a tela mais crítica).

---

## Candidatas a poda

### `/studio`, `/studio/project/:id`, `/studio/post/:id` — 🪦 MATAR (Sprint 3)
**Zero entrada**: fora da sidebar, nenhum navigate() aponta pra cá. Pipeline próprio de 6 edge functions (brief → prompts → generate → rank → select). Era a v1 da geração; o chat substituiu. Pré-requisito: desacoplar BrandWizard (acima) + mover BrandExamples/BrandPhotoBackgrounds.

### `/instagram/history` — 🪦 MATAR (Sprint 3)
Órfã (zero links de entrada), filtra por `instagram_media_id` — artefato do OAuth Instagram direto que o PFM substituiu.

### `/auth/instagram/callback` + `/auth/linkedin/callback` — 🪦 PROVÁVEL MATAR (verificar)
Invocam `instagram-oauth-callback`/`linkedin-oauth-callback` (OAuth direto legado). Conexão hoje é via PFM (`pfm_connected` no Profile). **Verificar** se SocialConnections ainda referencia o fluxo antigo antes de cortar os 2 callbacks + 6 edge fns.

### `/dashboard` ("Explorar Tendências") — ⛔ DECISÃO RAUL
**Expectativa:** "descubro o que tá em alta e gero em cima". **Realidade:** funciona (trends + scrape + gerar via `generate-content` com visual_mode legado), MAS: não conecta ao loop gerar→agendar→publicar, paga custo de scraping, e é o último usuário relevante do `generate-content` junto com o Onboarding (que vai parar de usar no Sprint 1). Cortar Dashboard+Onboarding-step2 = `generate-content` inteiro vira órfão. Recomendação da auditoria: cortar. **Tua decisão.**

### `/templates` — ⛔ DECISÃO BLOTATO
Galeria acoplada ao Blotato ($29/mês). Se Blotato sai (recomendado): re-rotear os cards pra tweet card/editorial (Satori, custo zero) ou matar a tela e promover esses formatos nas quick actions do chat.

### `/analytics` — 🔧 ESCONDER (até Apify)
Conta posts e lê `content_metrics` sem fonte real populando. Subtrai confiança. Tirar da sidebar até a integração Apify existir.

---

## Resumo executivo

| Veredito | Telas |
|---|---|
| ✅ Manter | chat, contents, download, auth, profile, brands, brand-edit, admin, privacy, reset |
| ⭐ Promover | **calendar** (herói) |
| 🔧 Consertar | landing, onboarding, pricing, content-preview (depois), brand-wizard, analytics (esconder) |
| 🤝 Consolidar | brand-new/simple (3 fluxos de marca → 2) |
| 🪦 Matar | studio ×3, instagram/history, callbacks OAuth ×2 (verificar) |
| ⛔ Decisão | dashboard/trends, templates (Blotato) |

**Padrão que emerge:** o produto tem UM loop bom (chat → ActionCard → calendar → PFM) cercado de 3 gerações anteriores de si mesmo (Studio, OAuth direto, Dashboard/generate-content, assinatura). Cada sprint da poda remove uma camada geológica.
