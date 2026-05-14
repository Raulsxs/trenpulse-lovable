/**
 * check-usage — Sistema de créditos para self_serve (Fase 3).
 * White_glove bypassa toda checagem (legacy / Maikon).
 *
 * Input:  { template_id? }  — user_id vem do JWT, nunca do body
 * Output: { allowed, mode, balance?, cost?, reason? }
 *
 * Se template_id for fornecido e mode=self_serve: debita atomicamente via RPC.
 * Fail-open: erros de DB não bloqueiam a geração.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey     = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Valida o JWT via anon client (CLAUDE.md: usar getUser, nunca getClaims)
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();

    if (authError || !user) {
      return json({ allowed: false, reason: "unauthenticated" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const { template_id } = body as { template_id?: string };

    const supabase = createClient(supabaseUrl, serviceKey);

    // Busca account_type e saldo do perfil
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("account_type, credits_balance")
      .eq("user_id", user.id)
      .single();

    if (profileError || !profile) {
      console.error("[check-usage] profile error:", profileError?.message);
      // Fail-open: não bloqueia em erro de DB
      return json({ allowed: true, mode: "unknown" });
    }

    // White_glove bypassa completamente
    if ((profile as any).account_type === "white_glove") {
      return json({ allowed: true, mode: "white_glove" });
    }

    const balance: number = (profile as any).credits_balance ?? 0;

    // Sem template_id — retorna apenas o saldo atual (usado pelo CreditsBadge)
    if (!template_id) {
      return json({ allowed: balance > 0, mode: "self_serve", balance, cost: 0 });
    }

    // Busca custo do template
    const { data: template, error: templateError } = await supabase
      .from("templates")
      .select("cost_credits, name")
      .eq("id", template_id)
      .single();

    if (templateError || !template) {
      console.warn("[check-usage] template not found:", template_id);
      // Fail-open para template desconhecido
      return json({ allowed: true, mode: "self_serve", balance, cost: 0 });
    }

    const cost: number = (template as any).cost_credits ?? 1;

    // Verificação rápida antes do lock para resposta mais rápida quando claramente insuficiente
    if (balance < cost) {
      return json({ allowed: false, mode: "self_serve", balance, cost, reason: "insufficient_credits" });
    }

    // Débito atômico via RPC (FOR UPDATE no profiles, evita race condition)
    const { data: result, error: debitError } = await supabase.rpc("debit_credits", {
      p_user_id: user.id,
      p_amount: cost,
      p_template_id: template_id,
    });

    if (debitError) {
      console.error("[check-usage] debit error:", debitError.message);
      // Fail-open em erro de DB
      return json({ allowed: true, mode: "self_serve", balance, cost });
    }

    const r = result as { ok: boolean; reason?: string; balance?: number; cost?: number };

    if (!r.ok) {
      return json({
        allowed: false,
        mode: "self_serve",
        balance: r.balance ?? balance,
        cost,
        reason: r.reason ?? "insufficient_credits",
      });
    }

    return json({
      allowed: true,
      mode: "self_serve",
      balance: r.balance ?? balance - cost,
      cost,
    });

  } catch (err: any) {
    console.error("[check-usage] unhandled error:", err.message);
    return json({ allowed: true, mode: "unknown", error: err.message });
  }
});

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
