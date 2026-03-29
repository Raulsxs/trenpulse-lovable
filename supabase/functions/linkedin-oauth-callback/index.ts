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
    const { code, redirect_uri } = await req.json();

    if (!code) {
      return new Response(JSON.stringify({ error: "Missing authorization code" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LINKEDIN_CLIENT_ID = Deno.env.get("LINKEDIN_CLIENT_ID");
    const LINKEDIN_CLIENT_SECRET = Deno.env.get("LINKEDIN_CLIENT_SECRET");

    if (!LINKEDIN_CLIENT_ID || !LINKEDIN_CLIENT_SECRET) {
      console.error("Missing LINKEDIN_CLIENT_ID or LINKEDIN_CLIENT_SECRET");
      return new Response(JSON.stringify({ error: "Server configuration error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 1: Exchange code for access token
    const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri,
        client_id: LINKEDIN_CLIENT_ID,
        client_secret: LINKEDIN_CLIENT_SECRET,
      }),
    });

    const tokenData = await tokenRes.json();
    console.log("LinkedIn token exchange status:", tokenRes.status);

    if (tokenData.error) {
      console.error("LinkedIn token error:", tokenData);
      let userHint = `Erro na autenticação LinkedIn: ${tokenData.error_description || tokenData.error}`;
      return new Response(JSON.stringify({ error: "Failed to exchange code", user_hint: userHint }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token || null;
    const expiresIn = tokenData.expires_in || 5184000; // 60 days default
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Step 2: Get user info via OpenID userinfo endpoint
    const userInfoRes = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const userInfo = await userInfoRes.json();
    console.log("LinkedIn userinfo keys:", Object.keys(userInfo));

    if (!userInfo.sub) {
      return new Response(JSON.stringify({ error: "Failed to get LinkedIn user info", user_hint: "Não foi possível obter informações do perfil LinkedIn." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 3: Get auth user
    const authHeader = req.headers.get("Authorization");
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
      { global: { headers: { Authorization: authHeader! } } }
    );
    const { data: { user }, error: userError } = await userClient.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 4: Save connection
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Deactivate old connections for this user
    await supabase
      .from("linkedin_connections")
      .update({ is_active: false })
      .eq("user_id", user.id)
      .eq("is_active", true);

    const { data: conn, error: insertError } = await supabase
      .from("linkedin_connections")
      .insert({
        user_id: user.id,
        linkedin_user_id: userInfo.sub,
        linkedin_name: userInfo.name || null,
        linkedin_email: userInfo.email || null,
        linkedin_profile_url: `https://www.linkedin.com/in/me`,
        access_token: accessToken,
        refresh_token: refreshToken,
        token_expires_at: tokenExpiresAt,
        is_active: true,
        scopes: ["openid", "profile", "email", "w_member_social"],
      })
      .select("id, linkedin_name, linkedin_email, linkedin_user_id")
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(JSON.stringify({ error: "Failed to save connection", user_hint: "Erro ao salvar conexão no banco." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ connection: conn }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("LinkedIn OAuth callback error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
