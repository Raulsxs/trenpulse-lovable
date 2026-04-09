# Plano de Execução: Integrações TrendPulse

## Status: PLANEJAMENTO
**Data:** 2026-04-09
**Backup:** branch `backup/pre-simplification`

---

## Fase 1: Post for Me — Publicação Multi-plataforma

### Pré-requisitos
- [ ] Raul assina Post for Me ($10/mês)
- [ ] Obtém API key do PFM
- [ ] Configura API key como secret no Supabase: `POSTFORME_API_KEY`

### Implementação

#### 1.1 Nova edge function: `publish-postforme`
```
Recebe: contentId, platforms[], scheduledAt?
Faz:
  1. Carrega conteúdo do DB (image_urls, caption, hashtags)
  2. Para cada platform:
     - Monta payload PFM (media_url, caption, platform_specific_config)
     - POST para PFM API
  3. Salva status no DB (published_at, platform_post_ids)
```

#### 1.2 Conectar contas sociais dos usuários
- Nova tabela ou campo: `social_connections` com PFM account IDs
- Frontend: botão "Conectar Instagram/LinkedIn/TikTok" que abre OAuth flow do PFM
- PFM OAuth callback → salva account_id no DB do usuário

#### 1.3 Atualizar ActionCard
- Botão "Publicar" agora mostra todas as plataformas conectadas
- Multi-select: publicar em IG + LinkedIn + TikTok de uma vez
- Feedback de status por plataforma

#### 1.4 Deprecar publish-instagram e publish-linkedin
- Manter como fallback por 30 dias
- Depois remover

### Arquivos afetados
- CRIAR: `supabase/functions/publish-postforme/index.ts`
- CRIAR: `supabase/functions/postforme-accounts/index.ts` (gestão de contas)
- MODIFICAR: `src/components/chat/ActionCard.tsx` (botão publicar multi-plataforma)
- MODIFICAR: `src/pages/Profile.tsx` (conectar contas via PFM)
- CRIAR: migration para social_connections ou atualizar instagram_connections/linkedin_connections

---

## Fase 2: Variantes Multi-plataforma

### Implementação

#### 2.1 Modificar ai-chat GENERATE
Após gerar a legenda principal, adicionar prompt:
```
"Adapte esta legenda para cada plataforma:
- Instagram: com emojis e 8-12 hashtags, até 2200 chars
- LinkedIn: tom profissional, sem hashtags excessivos, até 3000 chars
- X/Twitter: máx 280 chars, direto ao ponto
- TikTok: casual, com call-to-action, até 2200 chars
Responda em JSON: { instagram: '...', linkedin: '...', twitter: '...', tiktok: '...' }"
```

#### 2.2 Salvar variantes no DB
- Campo `platform_captions` JSONB em generated_contents
- Cada variante acessível no ActionCard

#### 2.3 Frontend
- ActionCard mostra tabs: Instagram | LinkedIn | X | TikTok
- Cada tab mostra a legenda otimizada para aquela plataforma
- Publicar → usa a legenda da plataforma selecionada

### Arquivos afetados
- MODIFICAR: `supabase/functions/ai-chat/index.ts` (GENERATE handler)
- MODIFICAR: `src/components/chat/ActionCard.tsx` (tabs de plataforma)
- Migration: adicionar `platform_captions JSONB` a generated_contents (nullable)

---

## Fase 3: Apify Analytics

### Pré-requisitos
- [x] Raul já tem conta Apify + API key
- [ ] Configurar `APIFY_API_KEY` como secret no Supabase

### Implementação

#### 3.1 Edge function: `fetch-social-analytics`
```
Recebe: userId, platform, handle
Faz:
  1. Chama Apify Actor para Instagram/LinkedIn
  2. Extrai: followers, engagement_rate, top_posts, best_times
  3. Salva em analytics_snapshots
  4. Retorna dados formatados
```

#### 3.2 Dashboard de Analytics melhorado
- Métricas reais: followers, likes, comments, reach
- Gráfico de crescimento de seguidores
- Melhor horário para postar (baseado em dados reais)
- Top 5 posts com mais engajamento

#### 3.3 Agendamento de scrape
- Cron job diário/semanal para atualizar métricas
- Edge function `analytics-scheduler`

### Arquivos afetados
- CRIAR: `supabase/functions/fetch-social-analytics/index.ts`
- MODIFICAR: `src/pages/Analytics.tsx` (dados reais)
- Migration: tabela analytics_snapshots (se não existir)

---

## Fase 4: Gamificação

### Implementação

#### 4.1 Social Score (0-100)
Cálculo:
- Presença: quantas plataformas conectadas (0-20 pts)
- Consistência: posts por semana (0-25 pts)
- Engajamento: engagement rate médio (0-25 pts)
- Crescimento: % crescimento de followers (0-15 pts)
- Diversidade: tipos de conteúdo variados (0-15 pts)

#### 4.2 Badges
- 🏆 Multi-plataforma: conectou 3+ plataformas
- 🔥 Consistente: postou 7 dias seguidos
- 💎 Viral: post com >1000 likes
- 📈 Crescimento: ganhou >100 seguidores na semana
- 🎯 Estrategista: usou agendamento 10+ vezes
- 🎨 Designer: criou 50+ conteúdos
- 📊 Analítico: verificou analytics 7 dias seguidos

#### 4.3 Frontend
- Card de Social Score no Dashboard
- Badge collection na sidebar ou profile
- Notificações de novas conquistas

### Arquivos afetados
- CRIAR: `src/components/gamification/SocialScore.tsx`
- CRIAR: `src/components/gamification/BadgeCollection.tsx`
- MODIFICAR: `src/pages/Dashboard.tsx`
- Migration: tabela user_achievements (badge_id, unlocked_at)

---

## Fase 5: Higgsfield Video (Futuro)

### Implementação (quando decidir)

#### 5.1 Edge function: `generate-video`
- Chama Segmind API (gateway para Higgsfield)
- Modelos: Kling 2.1 Pro ($0.16-0.70/vídeo)
- Job-based: submit → poll status → get result

#### 5.2 Frontend
- Novo tipo de conteúdo: "Vídeo/Reel"
- Preview de vídeo no ActionCard
- Download como MP4

### Nota: Premium feature para plano Business (R$297+)

---

## Custos projetados (stack completo)

| Serviço | Custo/mês | Notas |
|---|---|---|
| inference.sh | ~$20 | Imagens (atual) |
| Post for Me | $10 | 1000 posts |
| Supabase | $25 | DB + Edge Functions |
| Apify | $0 | Já tem conta |
| Higgsfield | $30 (futuro) | Só se ativar vídeo |
| **Total atual** | **~$55** | |
| **Total com vídeo** | **~$85** | |

**Break-even:** 1 usuário Pro (R$147.90) cobre ~80% dos custos.
**Lucrativo:** 2 usuários Pro = R$295.80 vs R$319 custo = já quase empata.
**Confortável:** 3+ usuários Pro = lucro líquido.

---

## Ordem de implementação

1. **Post for Me** (quando Raul tiver API key) — 1-2 dias
2. **Variantes multi-plataforma** (junto com PFM) — 1 dia
3. **Apify analytics** (pós-lançamento) — 2 dias
4. **Gamificação** (pós-lançamento) — 2-3 dias
5. **Higgsfield vídeo** (futuro) — 3-5 dias
