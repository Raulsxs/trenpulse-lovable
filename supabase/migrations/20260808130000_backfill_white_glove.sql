-- Backfill: todo perfil existente passa a 'white_glove'.
--
-- Complementa 20260808120000 (que corrigiu só o DEFAULT). As 2 contas que ainda estavam em
-- 'self_serve' vinham do período de teste da UI template-first, que saiu do bundle: uma era do
-- próprio dono e a outra uma conta abandonada (um único acesso em maio, zero conteúdo gerado).
-- Nenhuma era escolha deliberada em uso, então não há o que preservar.
--
-- O trigger trg_sync_account_type propaga para app_metadata do usuário, que é o que o roteamento
-- do front realmente lê. Conferido após rodar: profile e JWT batendo nas 11 contas.
update public.profiles set account_type = 'white_glove' where account_type <> 'white_glove';
