# TrendPulse — Plano de Refactor Template-First

> Documento vivo. Atualizar status conforme as fases avançam.
> Última atualização: 2026-05-13

## Visão

Pivotar TrendPulse de produto chat-centric / brand-centric para **template-first**: galeria de templates virais como porta de entrada principal, conteúdo gerado a partir de fontes diversas (link/PDF/texto/tendência), aproveitando 100% do pipeline existente de publicação/agendamento.

**Driver estratégico:** o produto atual foi otimizado para o caso do Maikon (foto pessoal + frase = post). Isso não escala como SaaS auto-serviço. Templates virais com formato distintivo (Newspaper, Top Secret, Tweet Card, etc.) são o gancho que o Blotato já validou no mercado.

## Princípios

1. **Maikon nunca quebra.** Flag `account_type='white_glove'` preserva a UI atual idêntica para ele.
2. **Backend muda pouco.** Refactor é majoritariamente front + schema.
3. **Ship por fase.** Cada fase é deployável e testável de ponta-a-ponta.
4. **Trends como entry é v2.** Não tenta resolver tudo no v1.
5. **Single-main strategy** (Lovable só detecta `main`). Branch de dev existe mas merges acontecem cedo, gated por feature flag.

## Decisões fechadas (2026-05-07)

| Decisão | Valor |
|---|---|
| Domínio | Mesmo (`trendpulse.com.br`), com fork interno via `account_type` |
| Branch strategy | `refactor/template-first` (dev) → merges frequentes pra `main` gated por flag |
| Existentes (Maikon, Raul, demais) | Todos setados como `'white_glove'` na migração — preserva experiência |
| Novos signups | `'white_glove'` até Fase 2 ficar pronta; flip pra `'self_serve'` quando o loop fechar |
| Free tier | 10 créditos/mês (cobre ~10 Tweet Cards 0-credit + 1-2 Gemini posts) |
| Pagamento | Mantém Asaas no v1; migração Stripe é decisão separada |

## Estimativa total

**6–8 semanas** pra v1 público (Fases 0–4) trabalhando solo.

---

## Fase 0 — Foundation (semana 1)

**Goal:** Estabelecer separação Maikon vs novos sem mudar nada visível.

### Entregas

- [ ] Migration: `users.account_type TEXT NOT NULL DEFAULT 'white_glove'`
- [ ] Migration: criar tabela `templates` (estrutura abaixo, vazia)
- [ ] Migration: `generated_contents.template_id UUID NULL FK templates(id)`
- [ ] `App.tsx` com routing fork no root: `account_type === 'white_glove'` → rotas atuais; `'self_serve'` → novo shell com placeholder
- [ ] Smoke test manual: logar como Maikon, validar que UI está intacta
- [ ] Smoke test: cadastro novo cai como `'white_glove'` e vê fluxo atual (via default)
- [ ] Branch `refactor/template-first` criada
- [ ] Atualizar `CLAUDE.md` do projeto: nome correto (Raul Seixas) + `account_type` documentado

### Schema da tabela `templates`

```sql
CREATE TABLE templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,                    -- 'infographic' | 'slideshow' | 'card' | 'photo_quote' | 'video' | 'carousel'
  format TEXT NOT NULL,                      -- 'post' | 'story' | 'linkedin' | 'tweet' | 'video'
  aspect_ratios TEXT[] NOT NULL,             -- ['1:1', '4:5', '9:16']
  preview_url TEXT NOT NULL,
  preview_video_url TEXT,                    -- hover preview tipo Blotato
  engine TEXT NOT NULL,                      -- 'blotato' | 'gemini' | 'satori'
  blotato_template_id TEXT,                  -- se engine='blotato'
  prompt_template TEXT,                      -- se engine='gemini'
  input_schema JSONB NOT NULL,               -- campos do form dinâmico
  brand_slots TEXT[],                        -- quais slots aceitam brand override
  cost_credits INT NOT NULL DEFAULT 1,
  viral_views INT,                           -- social proof (dos prints/Blotato)
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_personal BOOLEAN NOT NULL DEFAULT false,
  owner_user_id UUID REFERENCES users(id),  -- NULL = curado; preenchido = template pessoal
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_templates_format ON templates(format) WHERE is_active;
CREATE INDEX idx_templates_owner ON templates(owner_user_id) WHERE is_personal;
```

### DoD Fase 0

- Maikon UI inalterada
- Novo cadastro também cai em white_glove (sem placeholder ainda)
- Tabela `templates` existe vazia
- Routing fork funcional mas placeholder ainda não atinge ninguém

### Risco principal

Routing condicional quebrar para Maikon. **Mitigação:** sessão manual de teste com a conta dele antes de mergear pra main.

---

## Fase 1 — Template Gallery + Generator MVP (semanas 2–3)

**Goal:** Self_serve consegue navegar templates → gerar conteúdo (sem publicar ainda).

### Entregas

- [ ] Seed de **10 templates iniciais** (mix dos prints):
  - [ ] Tweet Card (Blotato, 0 credit)
  - [ ] Tweet Carousel (Blotato, 0 credit)
  - [ ] Quote Card (Blotato, 0 credit)
  - [ ] Photo Quote (Gemini — herda lógica do photo_backgrounds atual)
  - [ ] Newspaper Infographic (Blotato, 1 credit)
  - [ ] Top Secret Infographic (Blotato, 1 credit)
  - [ ] Chalkboard Infographic (Blotato, 1 credit)
  - [ ] Image Slideshow with Prominent Text (Blotato, 1 credit)
  - [ ] Story 9:16 (Gemini, 1 credit) — herda story carousel atual
  - [ ] Bus Ad / Billboard (Blotato, 1 credit)
- [ ] Página `/discover` (templates only, sem trends ainda)
- [ ] Componente `TemplateGallery` com hover preview estilo Blotato
- [ ] Página `/templates/:slug` com form dinâmico baseado em `input_schema`
- [ ] **Format selector explícito** como filtro hard na gallery
- [ ] Source selector: link / PDF upload / texto livre
- [ ] Edge function nova: `render-template` — roteia conforme `engine`
- [ ] Preview com botão "Ajustar" (reaproveita componente atual)
- [ ] Quando Fase 1 ship: flip default de novos signups pra `'self_serve'` via migration adicional

### DoD Fase 1

Self_serve navega templates → escolhe → preenche → gera → vê preview. Publish/schedule ainda não conectado.

### Risco principal

Qualidade variável entre engines. **Mitigação:** começar com 5 Blotato 0-credit (já testados, view counts milionários) e validar antes de adicionar Gemini-based.

---

## Fase 2 — Last Mile (semana 4)

**Goal:** Plugar publicação/agendamento no fluxo de templates. Esforço baixo — features já existem.

### Entregas

- [ ] Botões "Publicar agora" / "Agendar" no preview (reaproveita `publish-postforme`)
- [ ] Variants multi-plataforma automáticas (pipeline existente)
- [ ] Captions bilíngues (pipeline existente)
- [ ] Página `/library` (gerados + calendário) reaproveitando componentes
- [ ] Calendário com badge visual indicando template usado
- [ ] Brand overlay opcional: templates declaram quais `brand_slots` aceitam override
- [ ] FK `template_id` populada em `generated_contents` ao gerar via template

### DoD Fase 2

Template → preview → publicar/agendar → aparece no calendário, idêntico ao fluxo atual mas via template. **Loop fechado.**

### Risco principal

Aspect ratio template ≠ aspect ratio plataforma. **Mitigação:** format selector é filtro hard na gallery; template declara `aspect_ratios[]` permitidos; runtime valida antes de chamar PFM.

---

## Fase 3 — Billing por créditos (semana 5)

**Goal:** Resolver o redesign de pricing pendente, alinhado com custo real por template.

### Entregas

- [ ] Migration: `users.credits_balance INT DEFAULT 10`
- [ ] Migration: tabela `credit_transactions (id, user_id, delta, reason, template_id, created_at)`
- [ ] Reescrever `check-usage` pra debitar `cost_credits` do template
- [ ] Templates 0-credit sempre disponíveis (mesmo Free tier)
- [ ] UI de saldo no header
- [ ] Paywall quando saldo zera
- [ ] Página de pacotes de créditos (Asaas)
- [ ] Reset mensal automático do Free tier (10 créditos)

### DoD Fase 3

Usuário consome créditos por geração, vê saldo, paywall bloqueia quando zera.

---

## Fase 4 — Templates pessoais simplificados (semana 6)

**Goal:** Power users criam seus próprios templates sem ML — só "save current as template".

### Entregas

- [ ] Botão "Salvar como template" no preview
- [ ] Persiste prompt + reference image + format + brand slots
- [ ] Aba "Meus templates" em `/discover`
- [ ] Aplicar template pessoal: mesmo flow do generator, com inputs preservados

### DoD Fase 4

Usuário gera algo → salva como template → reaplica com novo conteúdo.

### Não escopado

Extração ML de estilo a partir de referências. Essa é a versão arriscada — fica para v3 (avaliação após v1 ter tração real).

---

## Fase 5 — Trends como entry (v2, semanas 7–8 ou depois)

### Entregas

- [ ] Reativar pipeline `scrape-trends` + `Fontes`
- [ ] Página `/discover/trends`
- [ ] "Gerar a partir desta tendência" → vai pra gallery filtrada
- [ ] Sugestões personalizadas baseadas em `ai_user_context.niche`

### DoD Fase 5

Usuário pega tendência → escolhe template → conteúdo gerado.

---

## Fase 6 — Go-to-market (paralelo a 4–5)

### Entregas

- [ ] Try-it sem login (1 template demo, conteúdo pré-preenchido)
- [ ] Landing page atualizada (galeria de templates como hero)
- [ ] Onboarding self_serve (3 passos)
- [ ] GUIA atualizado

---

## Estratégia de testes

| Camada | Como testa |
|---|---|
| Maikon não regride | Sessão manual com conta dele a cada deploy + smoke test em CI |
| Template render | Snapshot tests por template (input fixo → output esperado) |
| Pipeline ponta-a-ponta | Smoke test em staging (template → publish → verificar via PFM API) |
| Billing | Test manual: gerar até zerar créditos, verificar paywall |
| Routing fork | Test: `account_type='white_glove'` vê routes atuais; `'self_serve'` vê novas |

## Estratégia de rollout (Lovable single-main)

Como Lovable só detecta `main`, **cada fase merge pra main gated pelo `account_type` flag**:

1. Fase 0 merge: nenhum usuário afetado (todos white_glove, default da migration)
2. Fase 1 merge: ainda todos white_glove → mas a infra pra self_serve já está em prod, oculta
3. Fase 1 + 2 prontos: convido beta testers (eu, alguns amigos) flipados manualmente pra self_serve
4. Fase 2 estável: migration adicional flipa default pra self_serve em novos cadastros
5. Maikon e existentes ficam white_glove indefinidamente; podem migrar manualmente quando quiserem

## Pós-v1 — Fase 7: Public API for Agents

**Goal:** expor TrendPulse como produto programático que agentes externos (Claude Code, n8n, OpenAI Operator, Manus, fluxos próprios do usuário) possam usar pra **gerar e publicar conteúdo via API**.

**Por que:** o produto ganha uma segunda camada de monetização (API tier) e vira "infraestrutura de conteúdo" pra outros builders, não só interface direta. Caso de uso típico: agente do usuário detecta uma notícia relevante → chama TrendPulse pra renderizar template + publicar nas redes conectadas dele, sem abrir a UI.

### Entregas previstas

| Entrega | Notas |
|---|---|
| Tabela `api_tokens` (user_id, token_hash, name, scopes[], rate_limit, created_at, last_used_at, revoked_at) | Token gerado client-side, exibido 1x, hash armazenado |
| Edge function `api-v1-generate` | POST `/api/v1/generate` — wrapper de `render-template` autenticado por API token |
| Edge function `api-v1-publish` | POST `/api/v1/publish` — wrapper de `publish-postforme` |
| Edge function `api-v1-content` | GET `/api/v1/content/:id` — status + media URLs |
| Edge function `api-v1-templates` | GET `/api/v1/templates` — catálogo público (filtra por scope do token) |
| Página `/settings/api-tokens` | UI pra criar/revogar tokens, ver requests usados, copiar token |
| Rate limiting por token | Plano API tem cota separada (não consome créditos do plano UI) |
| Documentação (OpenAPI spec + exemplos) | Hospedada em `/docs/api` ou Mintlify |
| MCP Server "trendpulse-mcp" | Wrapper MCP que expõe os endpoints como tools pra Claude Code / Claude Desktop usarem direto |

### Modelo de cobrança

- **Plano API** separado (ex: $49/mês, 1000 generates + 1000 publishes), ou
- **Pay-per-use** com pacotes de créditos consumíveis também via API
- Decisão depende do redesign de pricing (Fase 3) ficar maduro

### Casos de uso âncora

1. **Agente do Raul/Maikon** monitora calendário editorial em Notion → gera + agenda automaticamente
2. **n8n workflow** pega novas postagens de blog → cria carrossel + agenda na semana
3. **Claude Code MCP** → "gere um Tweet Card sobre X e publique no LinkedIn da minha marca"
4. **White-label parceiros** que quiserem oferecer geração de conteúdo dentro do produto deles

### Pré-requisitos antes de começar

- v1 pública estável (Fases 0-4 entregues)
- Pricing redesign concluído (Fase 3) pra ter cota separável
- Pelo menos 50 usuários ativos pra justificar investir na API antes do core

**Estimativa:** 3–4 semanas após v1.

---

## Status atual

| Fase | Status | Notas |
|---|---|---|
| 0. Foundation | ✅ Em produção | Migrations aplicadas, RoutedApp ativo, Maikon white_glove |
| 1. Gallery + Generator | ✅ Em produção | Commits 1.1–1.7 todos mergeados; seed massivo de 22 templates Blotato (942c101) |
| 2. Last Mile | ✅ Em produção | 2.1 publish/schedule (c36f972), 2.3 Calendar badge (ebb99f8), 2.4 Library (8d1b525); flip default → self_serve (ca251bc) |
| 3. Billing créditos | Não iniciada | — |
| 4. Templates pessoais | Não iniciada | — |
| 5. Trends entry | v2 | Adiado |
| 6. Go-to-market | 🟡 Em progresso | Onboarding self_serve mergeado (5d32f9f); faltam landing page, try-it sem login e GUIA |
| **7. Public API for Agents** | **Pós-v1** | **Adicionada 2026-05-08 — gera + publica via API + MCP** |

## Histórico de mudanças no plano

| Data | Mudança |
|---|---|
| 2026-05-08 | Fase 7 (Public API + MCP) adicionada |
| 2026-05-11 | Canva integration avaliada e adiada (registro no Vault: Projetos/TrendPulse-Canva-Integration.md) |
| 2026-05-12 | Status update — Fases 0, 1 e 2 confirmadas done |
| 2026-05-13 | Fase 6 atualizada para Em progresso (onboarding self_serve mergeado em 5d32f9f) |

## Open questions / decisões para revisitar

- [ ] Cap de créditos por plano Pro/Business — definir antes da Fase 3
- [ ] Migração futura Asaas → Stripe — decisão pós-v1
- [ ] Quando expor o catálogo de templates ao público (antes ou depois do paywall)?
- [ ] Política de conteúdo gerado: fica salvo indefinidamente ou expira?
- [ ] Como populamos a galeria além dos 10 iniciais? (Raul cura manualmente / tools de import do Blotato / outro)

## Apêndice — Mapeamento features existentes → novo produto

| Feature existente | Papel na nova versão | Mantém? |
|---|---|---|
| Post for Me (publish-postforme) | Last mile | 100% |
| Variants por plataforma | Pós-render do template | 100% |
| Captions bilíngues | Camada em cima do output | 100% |
| Agendamento | Botão "Agendar" no preview | 100% |
| Schedules recorrentes (jitter) | Combina template + recorrência (superpoder) | 100% |
| Story carousel 9:16 | Vira **um** dos templates | Adapta |
| Múltiplas contas por plataforma | Selector no preview | 100% |
| Calendário | Ganha overlay de template usado | Adapta |
| `generated_contents` | + FK `template_id` | Adapta |
| `ai_user_context.niche` | Filtro do gallery | 100% |
| Brand (paleta, voz, fontes) | Modificador opcional via `brand_slots` | Adapta |
| Chat livre (`CHAT` intent) | Sobrevive como entrada terciária | Mantém |
| `scrape-trends` | Alimenta aba Tendência (v5) | Mantém |
| `check-usage` | Migra pra créditos | Reescreve |
| Brand wizard / examples | Apenas para white_glove (Maikon) | Legacy |
| Photo overlay mode | Apenas para white_glove (Maikon) | Legacy |
