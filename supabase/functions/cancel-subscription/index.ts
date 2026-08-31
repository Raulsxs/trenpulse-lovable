/**
 * cancel-subscription — cancela a assinatura mensal de créditos no Asaas.
 *
 * POR QUE EXISTE: vender recorrência sem um caminho de saída no próprio produto não é opção —
 * é exigência do CDC (art. 49 e o direito de rescindir pelo mesmo meio em que contratou), além
 * de ser o que faz alguém aceitar assinar.
 *
 * O QUE NÃO FAZ: não estorna e não tira crédito já depositado. Os créditos do ciclo pago são da
 * pessoa; o cancelamento só impede os ciclos FUTUROS. Isso é deliberado — grant_credits negativo
 * aqui viraria cobrança retroativa disfarçada.
 *
 * verify_jwt fica no padrão (true): quem cancela é o dono, com o próprio JWT, e o user.id vem
 * SEMPRE do token — nunca do body.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const ASAAS_BASE = "https://api.asaas.com/v3";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // A assinatura é buscada PELO user do token. Não aceitamos id vindo do cliente: senão
    // qualquer pessoa logada cancelaria a assinatura de outra passando o id dela.
    const { data: subs } = await svc.from("credit_subscriptions")
      .select("id, asaas_subscription_id")
      .eq("user_id", user.id).eq("status", "active").limit(1);
    if (!subs || subs.length === 0) return json({ error: "Nenhuma assinatura ativa." }, 404);
    const sub = subs[0];

    const key = Deno.env.get("ASAAS_PROD_KEY");
    if (!key) throw new Error("ASAAS_PROD_KEY não configurada");
    const res = await fetch(`${ASAAS_BASE}/subscriptions/${sub.asaas_subscription_id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", access_token: key },
    });
    const data = await res.json();

    // 404 no Asaas = já não existe lá. Não é erro para o usuário: o efeito desejado (não ser
    // cobrado de novo) está garantido, e o banco precisa parar de dizer "ativa".
    if (!res.ok && res.status !== 404) {
      throw new Error(data?.errors?.[0]?.description || `Asaas ${res.status}`);
    }

    const { error: upErr } = await svc.from("credit_subscriptions")
      .update({ status: "canceled", canceled_at: new Date().toISOString() })
      .eq("id", sub.id);
    if (upErr) throw upErr;

    console.log(`[cancel-subscription] ${sub.asaas_subscription_id} cancelada (user ${user.id})`);
    return json({ ok: true, canceled: sub.asaas_subscription_id });
  } catch (e: any) {
    console.error("[cancel-subscription] error:", e?.message);
    return json({ error: e?.message || "internal" }, 500);
  }
});
