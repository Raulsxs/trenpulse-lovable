-- Qwen Image 2 na estante: fotorrealismo (cenas/pessoas/produtos). 5cr (tier foto).
-- ⚠️ Custo real a confirmar no dashboard inference.sh; ajustar se preciso (regra ×2.5-3.5).
insert into public.credit_pricing(action, credits, description) values
  ('img_qwen', 5, 'Imagem — Qwen (fotorrealismo, sem texto)')
on conflict (action) do nothing;
