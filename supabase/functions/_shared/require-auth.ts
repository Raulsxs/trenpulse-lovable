import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Autenticação para edge functions com verify_jwt=false que hoje só checavam o prefixo "Bearer "
 * (qualquer string passava). Aceita DOIS chamadores legítimos:
 *   - INTERNO: Authorization == SUPABASE_SERVICE_ROLE_KEY (ai-chat/ai-agent chamando via service key).
 *   - USUÁRIO: um JWT de usuário VÁLIDO (front / agente com a sessão do usuário).
 * Qualquer outra coisa (anon key, "Bearer x") → null = não autorizado.
 *
 * Retorna { userId, internal }. Para funções que recebem userId no body, use SEMPRE o userId
 * retornado quando internal=false (nunca confie no body.userId — é o vetor de roubo de crédito).
 */
export async function requireAuth(req: Request): Promise<{ userId: string | null; internal: boolean } | null> {
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (serviceKey && token === serviceKey) return { userId: null, internal: true };

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const client = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return null;
  return { userId: user.id, internal: false };
}
