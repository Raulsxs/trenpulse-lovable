/**
 * check-usage — Validates if user can generate content based on their plan limits.
 * Called before each generation in generate-content and ai-chat.
 *
 * Returns: { allowed, used, limit, plan, plan_display_name }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { user_id, increment } = await req.json();
    if (!user_id) throw new Error("user_id is required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const now = new Date();
    const periodStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

    // Get user's plan
    const { data: sub } = await supabase
      .from("user_subscriptions")
      .select("status, plan:plan_id(name, display_name, generation_limit)")
      .eq("user_id", user_id)
      .eq("status", "active")
      .single();

    const plan = sub?.plan as any || { name: "free", display_name: "Gratuito", generation_limit: 5 };

    // Get current usage
    const { data: usage } = await supabase
      .from("usage_tracking")
      .select("generations_count")
      .eq("user_id", user_id)
      .eq("period_start", periodStart)
      .single();

    const currentCount = usage?.generations_count || 0;
    const allowed = currentCount < plan.generation_limit;

    // If increment flag is set and allowed, increment the counter
    if (increment && allowed) {
      await supabase.from("usage_tracking").upsert({
        user_id,
        period_start: periodStart,
        generations_count: currentCount + 1,
        updated_at: now.toISOString(),
      }, { onConflict: "user_id, period_start" });
    }

    return new Response(
      JSON.stringify({
        allowed,
        used: increment && allowed ? currentCount + 1 : currentCount,
        limit: plan.generation_limit,
        plan: plan.name,
        plan_display_name: plan.display_name,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("[check-usage] Error:", error.message);
    // On error, allow generation (fail open — don't block paying users due to DB issues)
    return new Response(
      JSON.stringify({ allowed: true, used: 0, limit: 999, plan: "unknown", error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
