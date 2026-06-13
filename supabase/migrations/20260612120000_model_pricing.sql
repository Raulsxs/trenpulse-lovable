-- Custo por MODELO (Studio cobra pelo modelo escolhido na estante, não só pelo formato).
-- Espelha o custo real ×2.5-3.5 (ver reference_inference_costs):
--   seedream $0.03 → 4cr · gpt-image-2 $0.0625 → 8cr · nano-banana $0.15 → 20cr.
-- Quando o Studio passa `model`, ai-chat cobra img_<model> × nº de imagens.
-- Sem model (fluxo chat), mantém cobrança por formato (post/story/carousel_slide).
insert into public.credit_pricing(action, credits, description) values
  ('img_seedream', 4,  'Imagem — Seedream 4.0 (rápido)'),
  ('img_gpt',      8,  'Imagem — GPT-Image 2 (texto pt-BR perfeito)'),
  ('img_nano',     20, 'Imagem — Nano Banana Pro (premium 9:16)')
on conflict (action) do nothing;
