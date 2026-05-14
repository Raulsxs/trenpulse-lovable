/**
 * credits-monthly-reset — Restaura créditos do tier Free (self_serve) todo mês.
 *
 * Cron Supabase: 0 0 1 * * (dia 1 de cada mês às 00:00 UTC)
 * Configuração no Supabase Dashboard → Database → Cron Jobs:
 *   SELECT cron.schedule(
 *     'monthly-credits-reset',
 *     '0 0 1 * *',
 *     $$SELECT net.http_post(
 *       url := '<SUPABASE_URL>/functions/v1/credits-monthly-reset',
 *       headers := '{"Authorization":"Bearer <SERVICE_ROLE_KEY>","Content-Type":"application/json"}',
 *       body := '{}'
 *     )$$
 *   );
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  // Aceita apenas chamadas internas com service role key
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";

  if (authHeader !== `Bearer ${serviceKey}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      serviceKey,
    );

    const { data: count, error } = await supabase.rpc("reset_monthly_credits", {
      p_reset_amount: 10,
    });

    if (error) throw error;

    console.log(`[credits-monthly-reset] Resetados ${count} usuários para 10 créditos`);

    return new Response(
      JSON.stringify({ success: true, users_reset: count, reset_amount: 10 }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[credits-monthly-reset] Error:", err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
