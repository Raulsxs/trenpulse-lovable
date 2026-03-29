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
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find active connections with tokens expiring in less than 7 days
    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: connections, error: fetchError } = await supabase
      .from("instagram_connections")
      .select("id, access_token, token_expires_at, instagram_username")
      .eq("is_active", true)
      .not("token_expires_at", "is", null)
      .lt("token_expires_at", sevenDaysFromNow);

    if (fetchError) {
      console.error("Error fetching connections:", fetchError);
      return new Response(JSON.stringify({ error: "Failed to fetch connections" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!connections || connections.length === 0) {
      console.log("No tokens need refreshing");
      return new Response(JSON.stringify({ message: "No tokens need refreshing", count: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Found ${connections.length} tokens to refresh`);
    const results: Array<{ id: string; username: string | null; status: string; error?: string }> = [];

    for (const conn of connections) {
      try {
        // Use the Graph API to refresh the long-lived token
        const refreshUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
        refreshUrl.searchParams.set("grant_type", "fb_exchange_token");
        refreshUrl.searchParams.set("client_id", Deno.env.get("META_APP_ID")!);
        refreshUrl.searchParams.set("client_secret", Deno.env.get("META_APP_SECRET")!);
        refreshUrl.searchParams.set("fb_exchange_token", conn.access_token);

        const refreshRes = await fetch(refreshUrl.toString());
        const refreshData = await refreshRes.json();

        if (refreshData.error) {
          console.error(`Failed to refresh token for ${conn.instagram_username}:`, refreshData.error);
          results.push({
            id: conn.id,
            username: conn.instagram_username,
            status: "error",
            error: refreshData.error.message || "Unknown error",
          });
          continue;
        }

        const newToken = refreshData.access_token;
        const expiresIn = refreshData.expires_in || 5184000; // 60 days default
        const newExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

        // Update the connection with the new token
        const { error: updateError } = await supabase
          .from("instagram_connections")
          .update({
            access_token: newToken,
            token_expires_at: newExpiresAt,
          })
          .eq("id", conn.id);

        if (updateError) {
          console.error(`Failed to update token for ${conn.instagram_username}:`, updateError);
          results.push({
            id: conn.id,
            username: conn.instagram_username,
            status: "error",
            error: "Database update failed",
          });
        } else {
          console.log(`Successfully refreshed token for ${conn.instagram_username}, new expiry: ${newExpiresAt}`);
          results.push({
            id: conn.id,
            username: conn.instagram_username,
            status: "refreshed",
          });
        }
      } catch (err) {
        console.error(`Error refreshing token for ${conn.instagram_username}:`, err);
        results.push({
          id: conn.id,
          username: conn.instagram_username,
          status: "error",
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    const refreshed = results.filter(r => r.status === "refreshed").length;
    const errors = results.filter(r => r.status === "error").length;

    return new Response(JSON.stringify({
      message: `Processed ${results.length} tokens: ${refreshed} refreshed, ${errors} errors`,
      results,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Token refresh error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
