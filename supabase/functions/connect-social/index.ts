/**
 * connect-social — Generates OAuth URL for connecting social media accounts via Post for Me
 *
 * Supported platforms: instagram, linkedin, tiktok, x, facebook, pinterest, bluesky, threads, youtube
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPPORTED_PLATFORMS = [
  "instagram", "linkedin", "tiktok", "x", "facebook",
  "pinterest", "bluesky", "threads", "youtube",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { platform, action } = await req.json();

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pfmApiKey = Deno.env.get("POSTFORME_API_KEY");
    if (!pfmApiKey) {
      return new Response(JSON.stringify({ error: "Post for Me API not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const svc = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ── ACTION: list — Return user's connected accounts ──
    if (action === "list") {
      const { data: connections } = await svc
        .from("social_connections")
        .select("*")
        .eq("user_id", user.id)
        .order("connected_at", { ascending: false });

      return new Response(JSON.stringify({ connections: connections || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── ACTION: disconnect — Remove a connection ──
    if (action === "disconnect") {
      if (!platform) {
        return new Response(JSON.stringify({ error: "platform is required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await svc.from("social_connections")
        .update({ status: "disconnected", updated_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("platform", platform);

      return new Response(JSON.stringify({ success: true, message: `${platform} desconectado` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── ACTION: connect (default) — Generate OAuth URL ──
    if (!platform || !SUPPORTED_PLATFORMS.includes(platform)) {
      return new Response(JSON.stringify({
        error: `Platform inválida. Suportadas: ${SUPPORTED_PLATFORMS.join(", ")}`,
      }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callbackUrl = `${supabaseUrl}/functions/v1/postforme-callback`;

    console.log(`[connect-social] Generating OAuth URL: platform=${platform}, userId=${user.id}`);

    // Call Post for Me API to generate OAuth URL
    const pfmResp = await fetch("https://api.postforme.dev/v1/social-accounts/auth-url", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${pfmApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        platform,
        external_id: user.id, // Our user ID — returned in callback
        redirect_url_override: callbackUrl,
        permissions: ["posts"],
      }),
    });

    if (!pfmResp.ok) {
      const errText = await pfmResp.text();
      console.error(`[connect-social] PFM error: ${pfmResp.status}`, errText.substring(0, 300));
      return new Response(JSON.stringify({
        error: `Erro ao conectar ${platform}. Tente novamente.`,
        detail: pfmResp.status,
      }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pfmData = await pfmResp.json();
    const authUrl = pfmData.url || pfmData.auth_url || pfmData.data?.url;

    if (!authUrl) {
      console.error("[connect-social] PFM returned no URL:", JSON.stringify(pfmData).substring(0, 300));
      return new Response(JSON.stringify({ error: "Não foi possível gerar link de conexão" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[connect-social] OAuth URL generated for ${platform}`);

    return new Response(JSON.stringify({
      auth_url: authUrl,
      platform,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("[connect-social] Error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
