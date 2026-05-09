-- Seed completo da Fase 1: 11 templates curados (somam aos 2 ja seedados em 20260508000005).
-- Total apos esta migration: 13 templates ativos no DB pra galeria do Discover.
--
-- Categorias cobertas:
--   - 6 infograficos (newspaper, chalkboard, billboard, whiteboard, manga, tv-news) - inputs simples (description + footerText)
--   - 1 tweet-photo carousel (engine blotato, 0 credits)
--   - 1 tutorial carousel
--   - 1 image slideshow with text overlays
--   - 2 templates engine=gemini (photo-quote pra Maikon-likes, story-9-16 vertical)
--
-- viral_views sao estimativas baseadas nos prints do Blotato (Top Secret 1.3M, Newspaper 1.1M, Image Slideshow 3.2M).
-- preview_url usa placeholder por enquanto - Raul substitui por screenshots reais depois.

INSERT INTO public.templates
  (slug, name, description, category, format, aspect_ratios, preview_url, engine, blotato_template_id, prompt_template, input_schema, cost_credits, viral_views, brand_slots)
VALUES
  ('newspaper-infographic',
   'Newspaper Infographic',
   'Layout de jornal antigo com headline e secoes em colunas. Otimo pra guias passo-a-passo e dicas educativas.',
   'infographic',
   'post',
   ARRAY['4:5','1:1'],
   'https://placeholder.trendpulse.com.br/newspaper.png',
   'blotato',
   '07a5b5c5-387c-49e3-86b1-de822cd2dfc7',
   NULL,
   '{"fields":[
     {"name":"description","type":"textarea","label":"Tema do post","required":true,"max":1000},
     {"name":"footerText","type":"text","label":"Rodape (opcional)","required":false,"max":120}
   ]}'::jsonb,
   1,
   1100000,
   NULL),

  ('chalkboard-infographic',
   'Chalkboard Infographic',
   'Quadro-negro com guia visual passo-a-passo. Estetica educacional viral.',
   'infographic',
   'post',
   ARRAY['4:5','1:1'],
   'https://placeholder.trendpulse.com.br/chalkboard.png',
   'blotato',
   'fcd64907-b103-46f8-9f75-51b9d1a522f5',
   NULL,
   '{"fields":[
     {"name":"description","type":"textarea","label":"Tema do post","required":true,"max":1000},
     {"name":"footerText","type":"text","label":"Rodape (opcional)","required":false,"max":120}
   ]}'::jsonb,
   1,
   1100000,
   NULL),

  ('billboard-infographic',
   'Billboard',
   'Sua mensagem em outdoor real - efeito de surpresa em contexto fisico inesperado.',
   'infographic',
   'post',
   ARRAY['1:1','4:5'],
   'https://placeholder.trendpulse.com.br/billboard.png',
   'blotato',
   '76b3b959-bdbe-440d-8428-984219353f18',
   NULL,
   '{"fields":[
     {"name":"description","type":"textarea","label":"Mensagem principal","required":true,"max":300},
     {"name":"footerText","type":"text","label":"Rodape (opcional)","required":false,"max":120}
   ]}'::jsonb,
   1,
   1500000,
   NULL),

  ('whiteboard-infographic',
   'Whiteboard',
   'Quadro branco com sketches a mao livre. Funciona pra explicar conceitos complexos.',
   'infographic',
   'post',
   ARRAY['4:5'],
   'https://placeholder.trendpulse.com.br/whiteboard.png',
   'blotato',
   'ae868019-820d-434c-8fe1-74c9da99129a',
   NULL,
   '{"fields":[
     {"name":"description","type":"textarea","label":"Tema do post","required":true,"max":1000},
     {"name":"footerText","type":"text","label":"Rodape (opcional)","required":false,"max":120}
   ]}'::jsonb,
   1,
   800000,
   NULL),

  ('manga-infographic',
   'Manga Panel',
   'Painel de manga com bloco de texto educativo. Estetica nicho que viraliza.',
   'infographic',
   'post',
   ARRAY['4:5'],
   'https://placeholder.trendpulse.com.br/manga.png',
   'blotato',
   '49c61370-a706-4b82-98f7-62d557d1c66d',
   NULL,
   '{"fields":[
     {"name":"description","type":"textarea","label":"Tema do post","required":true,"max":1000},
     {"name":"footerText","type":"text","label":"Rodape (opcional)","required":false,"max":120}
   ]}'::jsonb,
   1,
   1500000,
   NULL),

  ('tv-news-infographic',
   'Breaking News',
   'Layout de TV news com chyron e headline. Ideal pra anuncios e novidades.',
   'infographic',
   'post',
   ARRAY['1:1','4:5'],
   'https://placeholder.trendpulse.com.br/tv-news.png',
   'blotato',
   '8800be71-52df-4ac7-ac94-df9d8a494d0f',
   NULL,
   '{"fields":[
     {"name":"description","type":"textarea","label":"A noticia (resumo)","required":true,"max":600},
     {"name":"footerText","type":"text","label":"Ticker/rodape (opcional)","required":false,"max":120}
   ]}'::jsonb,
   1,
   900000,
   NULL),

  ('tweet-photo-carousel',
   'Tweet Carousel com Foto',
   'Carrossel de tweets sequenciais com foto de fundo. Free.',
   'carousel',
   'carousel',
   ARRAY['1:1','4:5'],
   'https://placeholder.trendpulse.com.br/tweet-photo-carousel.png',
   'blotato',
   '/base/v2/tweet-card/9714ae5c-7e6b-4878-be4a-4b1ba5d0cd66/v1',
   NULL,
   '{"fields":[
     {"name":"backgroundMedia","type":"image","label":"Imagem de fundo (URL)","required":true},
     {"name":"quotes","type":"array","item_type":"textarea","label":"Tweets (1 por slide)","required":true},
     {"name":"authorName","type":"text","label":"Nome do autor","required":true},
     {"name":"handle","type":"text","label":"@handle","required":true},
     {"name":"profileImage","type":"image","label":"Foto de perfil (URL, opcional)","required":false}
   ]}'::jsonb,
   0,
   433000,
   ARRAY['profileImage','accentColor']),

  ('tutorial-carousel',
   'Tutorial Carousel',
   'Carrossel de tutorial passo-a-passo com slides estruturados. Free.',
   'carousel',
   'carousel',
   ARRAY['1:1','4:5'],
   'https://placeholder.trendpulse.com.br/tutorial-carousel.png',
   'blotato',
   '/base/v2/tutorial-carousel/e095104b-e6c5-4a81-a89d-b0df3d7c5baf/v1',
   NULL,
   '{"fields":[
     {"name":"title","type":"text","label":"Titulo do tutorial","required":true,"max":80},
     {"name":"contentSlides","type":"array","item_type":"textarea","label":"Passos (1 por slide)","required":true},
     {"name":"authorName","type":"text","label":"Seu nome","required":true},
     {"name":"profileImage","type":"image","label":"Foto de perfil (URL, opcional)","required":false}
   ]}'::jsonb,
   0,
   1100000,
   ARRAY['profileImage','accentColor']),

  ('image-slideshow-bold',
   'Image Slideshow Bold Text',
   'Slideshow de imagens com texto em destaque. 3.2M views no Blotato.',
   'slideshow',
   'post',
   ARRAY['1:1','4:5'],
   'https://placeholder.trendpulse.com.br/image-slideshow.png',
   'blotato',
   '/base/v2/image-slideshow/5903b592-1255-43b4-b9ac-f8ed7cbf6a5f/v1',
   NULL,
   '{"fields":[
     {"name":"slides","type":"array","item_type":"textarea","label":"Texto por slide (1 por linha)","required":true}
   ]}'::jsonb,
   2,
   3200000,
   ARRAY['accentColor']),

  ('photo-quote',
   'Quote com Foto Pessoal',
   'Sua foto pessoal + frase em destaque. Ideal pra coaches, profissionais de saude, mentores.',
   'photo_quote',
   'post',
   ARRAY['1:1','4:5','9:16'],
   'https://placeholder.trendpulse.com.br/photo-quote.png',
   'gemini',
   NULL,
   'Crie uma imagem profissional com a foto de fundo {{photo_url}} e a frase {{phrase}} em destaque sobre a foto. Autor opcional: {{author_name}}. Estilo motivacional, fonte legivel e impactante, cores harmoniosas com a foto. Foto deve ser preservada como background, texto sobreposto com contraste.',
   '{"fields":[
     {"name":"photo_url","type":"image","label":"URL da sua foto","required":true},
     {"name":"phrase","type":"textarea","label":"Frase","required":true,"max":200},
     {"name":"author_name","type":"text","label":"Seu nome (opcional)","required":false}
   ]}'::jsonb,
   1,
   NULL,
   ARRAY['accentColor']),

  ('story-9-16',
   'Story 9:16',
   'Story vertical pra Instagram/Facebook/TikTok. Headline + body + imagem de fundo opcional.',
   'card',
   'story',
   ARRAY['9:16'],
   'https://placeholder.trendpulse.com.br/story.png',
   'gemini',
   NULL,
   'Crie um Story 9:16 vertical com headline em destaque: {{headline}}. Body opcional: {{body}}. Imagem de fundo opcional: {{background_image}}. Design clean, fonte grande e legivel, contraste alto, suitable for mobile.',
   '{"fields":[
     {"name":"headline","type":"text","label":"Headline","required":true,"max":80},
     {"name":"body","type":"textarea","label":"Texto secundario (opcional)","required":false,"max":200},
     {"name":"background_image","type":"image","label":"URL da imagem de fundo (opcional)","required":false}
   ]}'::jsonb,
   1,
   NULL,
   ARRAY['accentColor','background'])
ON CONFLICT (slug) DO NOTHING;
