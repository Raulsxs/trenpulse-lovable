# F0 — Resultados dos testes de modelos (2026-06-11)

> Onda 0 do plano de redesign. Budget autorizado ~$5-10 (gasto real: ~10 gerações de
> imagem + 2 vídeos — confirmar valor exato no dashboard app.inference.sh).
> Vídeos salvos em `%TEMP%\f0_kling.mp4` e `%TEMP%\f0_seedance.mp4` pro Raul assistir.

## Veredito por modelo

| Modelo | Tipo | Latência | Qualidade | Veredito pra estante |
|---|---|---|---|---|
| `openai/gpt-image-2` (atual) | img | ~70-80s | Texto pt-BR perfeito | ✅ "O caprichado" — texto longo/perfeito |
| `google/gemini-3-pro-image` Nano Banana (atual) | img 9:16 | ~80s | Texto pt-BR perfeito, 9:16 nativo | ✅ "O premium" — story (CUSTA $0.15 → 20cr) |
| `bytedance/seedream-4-0` | img | **14-16s** | Texto pt-BR ~90% (acentos escorregam: "hãbitos", "agradęce"); 1:1 ok via prompt | ✅ "O rápido" — posts com pouco texto/visual; 5x mais rápido |
| `klingai/image-v2-1` | img | ~22s | Texto garbled total | ⚠️ Só fundos SEM texto (barato: ~$0.0035-0.028) |
| `klingai/video-v2-5` | vídeo 5s | **79s** | Fotorrealismo excelente, **9:16 respeitado** | ✅ **Candidato nº 1 de vídeo** |
| `bytedance/seedance-2-0-fast` | vídeo 5s 720p | 153s | Boa qualidade MAS **ignorou 9:16 (saiu 16:9)** | ⚠️ Investigar param de aspect; reserva |

Também no catálogo (não testados, candidatos futuros): `google/veo-3-1-fast/lite`, `klingai/video-v2-6/v3`, `bytedance/seedance-2-0` (full), `alibaba/wan-2-7`.

## Decisão executada: margem do story

Seedream REPROVOU como substituto do Nano Banana no story (texto duplicado + cedilhas
erradas + mockup de celular). Correção por preço: **story 6 → 20cr** (custo R$0,82 ×2.5;
margem era NEGATIVA). Migration `20260611190000_story_pricing_fix.sql` + `Pricing.tsx`
commitados. ⚠️ SQL em prod pendente de autorização nomeada do Raul:
`update public.credit_pricing set credits = 20 where action = 'story';`

## Gotchas de integração (valem pra Onda 2)

1. **Vídeo é async obrigatório**: `wait:true` morre em **524 do gateway** (~100-126s).
   Fluxo certo: POST `/run` sem wait → `data.id` → poll `GET /tasks/{id}` até `status=10`
   → `output.video` (URL mp4). Status na task é NUMÉRICO (10 = done); `status_text` só
   existe na resposta do POST.
2. **Kling `duration` é STRING** (`"5"`, não `5`) — 422 se número.
3. **Body precisa de UTF-8 explícito** (acentos em prompt quebram com encoding default
   do PowerShell; no Deno/fetch do backend não é problema).
4. Output de imagem é `output.image` (objeto/string), não `output.images[]` como nos
   apps Gemini antigos — formato varia POR APP; o roteador da Onda 2 precisa de um
   normalizador por modelo.
5. Preço por modelo NÃO é público na API — está no dashboard logado. `usage_events`
   da task tem billing_record_id mas não o valor em $.

## Próximo (Onda 1)

Design system + densidade nas telas existentes (mockup 02 → aprovação → /impeccable).
Pendências Raul: SQL do story · custo real no dashboard inference.sh · ok pra testar
publicação de VÍDEO via PFM (toca a conta real do Instagram — fica pra Onda 4 com
conta de teste, ou autorização explícita).
