-- Sprint 2 (billing): GENERATE_TEMPLATE (Blotato) passa a debitar créditos.
-- 4cr = mesma classe de custo de um post (a maioria dos templates usados é 0-credit no Blotato,
-- mas consome caption/estruturação; infográficos pagos do Blotato têm custo próprio lá).
insert into public.credit_pricing(action, credits, description) values
  ('template', 4, 'Template visual (Blotato)')
on conflict (action) do nothing;
