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

    const META_APP_ID = Deno.env.get("META_APP_ID");
    const META_APP_SECRET = Deno.env.get("META_APP_SECRET");

    if (!META_APP_ID || !META_APP_SECRET) {
      console.error("Missing META_APP_ID or META_APP_SECRET");
      return new Response(JSON.stringify({ error: "Server configuration error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 1: Exchange code for short-lived token
    const tokenUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
    tokenUrl.searchParams.set("client_id", META_APP_ID);
    tokenUrl.searchParams.set("client_secret", META_APP_SECRET);
    tokenUrl.searchParams.set("redirect_uri", redirect_uri);
    tokenUrl.searchParams.set("code", code);

    const tokenRes = await fetch(tokenUrl.toString());
    const tokenData = await tokenRes.json();

    console.log("Short token exchange status:", tokenRes.status);
    console.log("Token data keys:", Object.keys(tokenData));

    if (tokenData.error) {
      console.error("Token exchange error:", tokenData.error);
      const errorCode = tokenData.error?.code || tokenData.error?.type || "unknown";
      const errorMessage = tokenData.error?.message || "Unknown error";
      
      let userHint = "";
      if (errorMessage.includes("client secret")) {
        userHint = "O App Secret configurado não corresponde ao App ID. Verifique no Meta for Developers se ambos pertencem ao mesmo aplicativo.";
      } else if (errorMessage.includes("redirect_uri")) {
        userHint = "A URL de redirecionamento não está autorizada no app Meta. Adicione o domínio nas configurações do app.";
      } else if (errorMessage.includes("code has been used") || errorMessage.includes("code was already redeemed")) {
        userHint = "O código de autorização já foi utilizado. Tente conectar novamente.";
      } else if (errorMessage.includes("code has expired")) {
        userHint = "O código de autorização expirou. Tente conectar novamente.";
      } else {
        userHint = `Erro da Meta API (código ${errorCode}): ${errorMessage}`;
      }
      
      return new Response(JSON.stringify({ error: "Failed to exchange code", details: tokenData.error, user_hint: userHint }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const shortLivedToken = tokenData.access_token;

    // Step 2: Exchange for long-lived token (60 days)
    const longLivedUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
    longLivedUrl.searchParams.set("grant_type", "fb_exchange_token");
    longLivedUrl.searchParams.set("client_id", META_APP_ID);
    longLivedUrl.searchParams.set("client_secret", META_APP_SECRET);
    longLivedUrl.searchParams.set("fb_exchange_token", shortLivedToken);

    const longLivedRes = await fetch(longLivedUrl.toString());
    const longLivedData = await longLivedRes.json();

    console.log("Long lived token status:", longLivedRes.status);
    console.log("Long lived data keys:", Object.keys(longLivedData));

    if (longLivedData.error) {
      console.error("Long-lived token error:", longLivedData.error);
      const errorMessage = longLivedData.error?.message || "Unknown error";
      return new Response(JSON.stringify({ error: "Failed to get long-lived token", details: longLivedData.error, user_hint: `Erro ao obter token de longa duração: ${errorMessage}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const longLivedToken = longLivedData.access_token;
    const expiresIn = longLivedData.expires_in || 5184000; // 60 days default
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Check what permissions were actually granted
    const permRes = await fetch(`https://graph.facebook.com/v21.0/me/permissions?access_token=${longLivedToken}`);
    const permData = await permRes.json();
    console.log("Granted permissions:", JSON.stringify(permData));

    // Step 3: Get user's Facebook pages
    const pagesRes = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?access_token=${longLivedToken}`
    );
    const pagesData = await pagesRes.json();

    console.log("Pages API status:", pagesRes.status);
    console.log("Pages data:", JSON.stringify(pagesData));
    console.log("Token used (first 20 chars):", longLivedToken?.substring(0, 20));

    if (!pagesData.data || pagesData.data.length === 0) {
      return new Response(JSON.stringify({ error: "No Facebook pages found.", user_hint: "Nenhuma Página do Facebook encontrada. Você precisa de uma Página do Facebook vinculada à sua conta Instagram Business." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 4: For each page, check if it has an Instagram Business account
    const connections = [];
    for (const page of pagesData.data) {
      const igRes = await fetch(
        `https://graph.facebook.com/v21.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`
      );
      const igData = await igRes.json();

      if (igData.instagram_business_account) {
        // Get Instagram username
        const igUserRes = await fetch(
          `https://graph.facebook.com/v21.0/${igData.instagram_business_account.id}?fields=username,name,profile_picture_url&access_token=${page.access_token}`
        );
        const igUserData = await igUserRes.json();

        connections.push({
          instagram_user_id: igData.instagram_business_account.id,
          instagram_username: igUserData.username || null,
          page_id: page.id,
          page_name: page.name,
          access_token: page.access_token, // Use page token (doesn't expire if long-lived user token is valid)
          token_expires_at: tokenExpiresAt,
          profile_picture_url: igUserData.profile_picture_url || null,
        });
      }
    }

    if (connections.length === 0) {
      return new Response(JSON.stringify({ error: "No Instagram Business accounts found.", user_hint: "Nenhuma conta Instagram Business foi encontrada vinculada às suas Páginas do Facebook. Verifique se sua conta Instagram é Business/Creator e está vinculada a uma Página." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 5: Save connections to database
    const authHeader = req.headers.get("Authorization");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get user from auth header
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader! } } }
    );
    const { data: { user }, error: userError } = await userClient.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Upsert connections
    const savedConnections = [];
    for (const conn of connections) {
      const { data, error } = await supabase
        .from("instagram_connections")
        .upsert({
          user_id: user.id,
          instagram_user_id: conn.instagram_user_id,
          instagram_username: conn.instagram_username,
          page_id: conn.page_id,
          page_name: conn.page_name,
          access_token: conn.access_token,
          token_expires_at: conn.token_expires_at,
          is_active: true,
        }, { onConflict: "user_id,instagram_user_id" })
        .select("id, instagram_username, page_name, instagram_user_id")
        .single();

      if (error) {
        console.error("Upsert error:", error);
      } else {
        savedConnections.push({ ...data, profile_picture_url: conn.profile_picture_url });
      }
    }

    return new Response(JSON.stringify({ connections: savedConnections }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("OAuth callback error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
