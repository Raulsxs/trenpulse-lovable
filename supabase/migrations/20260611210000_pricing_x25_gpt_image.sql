-- Pricing ×2.5 nas ações que usam gpt-image-2 (custo real medido: $0.0625/img,
-- não $0.024 — margem estava ~11%). Autorizado pelo Raul em 2026-06-11.
-- Editorial ganha action própria: motor Satori (custo ~zero), não pode herdar
-- o preço por slide do gpt-image.
update public.credit_pricing set credits = 8, description = 'Post com imagem (gpt-image-2 medium)' where action = 'post';
update public.credit_pricing set credits = 8, description = 'Por slide de carrossel (gpt-image-2)' where action = 'carousel_slide';
update public.credit_pricing set credits = 8, description = 'Imagem livre (geração crua, gpt-image-2)' where action = 'free_image';
insert into public.credit_pricing(action, credits, description) values
  ('editorial_slide', 4, 'Por slide de carrossel editorial (Satori + foto)')
on conflict (action) do nothing;
