-- F0 (Onda 0): story 9:16 tinha MARGEM NEGATIVA — cobrava 6cr (R$0,57) e custa
-- $0.15 ≈ R$0,82 no Nano Banana Pro (único modelo 9:16 com texto pt-BR aprovado;
-- Seedream 4.0 reprovou no teste de 2026-06-11: texto duplicado + cedilhas erradas).
-- Regra de pricing do plano: custo provider × 2.5-3.5 → 20cr (margem ~57%).
update public.credit_pricing set credits = 20, description = 'Story 9:16 (Nano Banana Pro — modelo premium)' where action = 'story';
