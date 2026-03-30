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
    const { users } = await req.json();

    if (!Array.isArray(users) || users.length === 0) {
      return new Response(JSON.stringify({ error: "users array is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const results: { success: any[]; failed: any[] } = { success: [], failed: [] };

    for (const user of users) {
      if (!user.id || !user.email) {
        results.failed.push({ ...user, error: "missing id or email" });
        continue;
      }

      const { data, error } = await supabase.auth.admin.createUser({
        id: user.id,
        email: user.email,
        password: "TrendPulse2026!",
        email_confirm: true,
      });

      if (error) {
        results.failed.push({ id: user.id, email: user.email, error: error.message });
      } else {
        results.success.push({ id: data.user.id, email: data.user.email });
      }
    }

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
