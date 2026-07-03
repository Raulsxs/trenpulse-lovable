-- Agendamento multi-plataforma: guarda as contas escolhidas no modal de "Agendar".
-- Antes, agendar só gravava scheduled_at e o scheduler publicava na plataforma de criação.
-- Agora o usuário escolhe as contas (mesmo seletor do Publicar) e o scheduler publica nelas.
-- Formato: { "platforms": ["instagram","linkedin"], "accountIds": ["spc_...","spc_..."] }
-- Null = agendamento legado (fallback = só content.platform).
ALTER TABLE public.generated_contents
  ADD COLUMN IF NOT EXISTS scheduled_accounts jsonb;

COMMENT ON COLUMN public.generated_contents.scheduled_accounts IS
  'Contas escolhidas no modal de Agendar: { platforms: text[], accountIds: text[] }. Null = agendamento legado (só a plataforma de criação).';
