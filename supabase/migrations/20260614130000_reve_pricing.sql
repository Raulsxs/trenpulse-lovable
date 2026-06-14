-- Reve (reve/create) na estante: melhor renderização de texto pt-BR (acentos perfeitos),
-- estética minimalista/limpa. 6cr (tier texto-premium).
-- ⚠️ Custo real a confirmar no dashboard inference.sh; ajustar se preciso (regra ×2.5-3.5).
insert into public.credit_pricing(action, credits, description) values
  ('img_reve', 6, 'Imagem — Reve (texto pt-BR impecável, minimalista)')
on conflict (action) do nothing;
