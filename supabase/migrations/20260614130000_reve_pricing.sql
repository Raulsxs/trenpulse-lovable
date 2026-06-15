-- Reve (reve/create) na estante: melhor renderização de texto pt-BR (acentos perfeitos),
-- estética minimalista/limpa. 3cr.
-- Custo real medido no dashboard: $0.0233/call (3 calls = $0.07). Na mesma régua dos
-- outros modelos (~130cr por dólar de custo provider): 0.0233 × 130 ≈ 3cr. O mais barato
-- da estante com texto perfeito — diferencial honesto (estilo minimalista, sem gráficos).
insert into public.credit_pricing(action, credits, description) values
  ('img_reve', 3, 'Imagem — Reve (texto pt-BR impecável, minimalista)')
on conflict (action) do nothing;
