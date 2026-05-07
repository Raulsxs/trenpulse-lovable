-- Seed mínimo de templates pra Ralph ter substrato ao implementar render-template (Fase 1).
-- Os 10 templates do plano completo (IMPLEMENTATION_PLAN Task 1.1) viram migration separada quando os blotato_template_id e preview_url reais estiverem mapeados.

INSERT INTO public.templates
  (slug, name, description, category, format, aspect_ratios, preview_url, engine, blotato_template_id, input_schema, cost_credits, viral_views, brand_slots)
VALUES
  ('tweet-card',
   'Tweet Card',
   'Quote em formato de tweet com avatar e handle.',
   'card',
   'post',
   ARRAY['1:1','4:5'],
   'https://placeholder.trendpulse.com.br/tweet-card.png',
   'blotato',
   'tweet-card',
   '{"fields":[
     {"name":"author","type":"text","label":"Autor","required":true},
     {"name":"handle","type":"text","label":"@handle","required":true},
     {"name":"quote","type":"textarea","label":"Texto","required":true,"max":280},
     {"name":"avatar_url","type":"image","label":"Avatar","required":false}
   ]}'::jsonb,
   0,
   433000,
   ARRAY['avatar','accent_color']),

  ('quote-card',
   'Quote Card',
   'Citação minimalista com cor de destaque.',
   'card',
   'post',
   ARRAY['1:1'],
   'https://placeholder.trendpulse.com.br/quote-card.png',
   'blotato',
   'quote-card',
   '{"fields":[
     {"name":"quote","type":"textarea","label":"Citação","required":true,"max":300},
     {"name":"author","type":"text","label":"Autor","required":false}
   ]}'::jsonb,
   0,
   104000,
   ARRAY['accent_color','background'])
ON CONFLICT (slug) DO NOTHING;
