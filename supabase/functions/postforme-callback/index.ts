/**
 * postforme-callback — Handles OAuth callback from Post for Me
 * When a user connects their social media account via PFM OAuth,
 * PFM redirects here with account details. We save the connection
 * and redirect the user back to the app.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const params = url.searchParams;

    // PFM sends these params back after OAuth
    const accountId = params.get("account_id") || params.get("accountId");
    const platform = params.get("platform");
    const externalId = params.get("external_id") || params.get("externalId");
    const status = params.get("status") || "connected";
    const error = params.get("error");

    console.log(`[postforme-callback] Received: platform=${platform}, accountId=${accountId}, externalId=${externalId}, status=${status}, error=${error}`);

    // If there was an error, redirect back with error message
    if (error) {
      const appUrl = Deno.env.get("APP_URL") || "https://trendpulse.com.br";
      return Response.redirect(`${appUrl}/profile?pfm_error=${encodeURIComponent(error)}`, 302);
    }

    // Save the connection to the database
    if (accountId && externalId) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );

      // externalId is the userId we passed when creating the auth URL
      const userId = externalId;

      // Upsert the social connection
      const { error: dbError } = await supabase
        .from("social_connections")
        .upsert({
          user_id: userId,
          platform: platform || "unknown",
          pfm_account_id: accountId,
          status: "connected",
          connected_at: new Date().toISOString(),
        }, {
          onConflict: "user_id,platform",
        });

      if (dbError) {
        console.error("[postforme-callback] DB error:", dbError);
        // Try insert without upsert in case the table doesn't have the constraint
        await supabase.from("social_connections").insert({
          user_id: userId,
          platform: platform || "unknown",
          pfm_account_id: accountId,
          status: "connected",
          connected_at: new Date().toISOString(),
        });
      }

      console.log(`[postforme-callback] Saved connection: user=${userId}, platform=${platform}, pfm_account=${accountId}`);
    }

    // Redirect back to the app
    const appUrl = Deno.env.get("APP_URL") || "https://trendpulse.com.br";
    return Response.redirect(`${appUrl}/profile?pfm_connected=${platform || "success"}`, 302);

  } catch (err: any) {
    console.error("[postforme-callback] Error:", err);
    const appUrl = Deno.env.get("APP_URL") || "https://trendpulse.com.br";
    return Response.redirect(`${appUrl}/profile?pfm_error=${encodeURIComponent(err.message || "unknown")}`, 302);
  }
});
