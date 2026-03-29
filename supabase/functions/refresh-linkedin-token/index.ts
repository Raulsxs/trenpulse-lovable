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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const LINKEDIN_CLIENT_ID = Deno.env.get("LINKEDIN_CLIENT_ID");
    const LINKEDIN_CLIENT_SECRET = Deno.env.get("LINKEDIN_CLIENT_SECRET");

    if (!LINKEDIN_CLIENT_ID || !LINKEDIN_CLIENT_SECRET) {
      return new Response(JSON.stringify({ error: "Missing LinkedIn credentials" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find connections expiring in less than 7 days
    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: connections, error } = await supabase
      .from("linkedin_connections")
      .select("*")
      .eq("is_active", true)
      .not("token_expires_at", "is", null)
      .lt("token_expires_at", sevenDaysFromNow);

    if (error) {
      console.error("Query error:", error);
      return new Response(JSON.stringify({ error: "Failed to query connections" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!connections || connections.length === 0) {
      return new Response(JSON.stringify({ message: "No tokens need refreshing", count: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results = [];

    for (const conn of connections) {
      try {
        if (!conn.refresh_token) {
          results.push({ id: conn.id, name: conn.linkedin_name, status: "skipped", error: "No refresh token" });
          continue;
        }

        const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: conn.refresh_token,
            client_id: LINKEDIN_CLIENT_ID,
            client_secret: LINKEDIN_CLIENT_SECRET,
          }),
        });

        const tokenData = await tokenRes.json();

        if (tokenData.error) {
          results.push({ id: conn.id, name: conn.linkedin_name, status: "failed", error: tokenData.error_description || tokenData.error });
          continue;
        }

        const newExpiresAt = new Date(Date.now() + (tokenData.expires_in || 5184000) * 1000).toISOString();

        await supabase.from("linkedin_connections").update({
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token || conn.refresh_token,
          token_expires_at: newExpiresAt,
        }).eq("id", conn.id);

        results.push({ id: conn.id, name: conn.linkedin_name, status: "refreshed" });
      } catch (err) {
        results.push({ id: conn.id, name: conn.linkedin_name, status: "error", error: err instanceof Error ? err.message : "Unknown" });
      }
    }

    return new Response(JSON.stringify({ message: `Processed ${results.length} tokens`, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("LinkedIn token refresh error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
