/**
 * connect-social — Manages social media account connections via Post for Me
 * Actions: connect (default), list, disconnect
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

// Platform-specific fields required by Post for Me API
const PLATFORM_DATA: Record<string, Record<string, Record<string, string>>> = {
  instagram: {
    instagram: { connection_type: "instagram" },
  },
  linkedin: {
    linkedin: { connection_type: "organization" },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const respond = (body: any, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    let body: any = {};
    try { body = await req.json(); } catch { /* empty body is ok for some actions */ }
    const { platform, action } = body;

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return respond({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const internalServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
    if (authError || !authUser) return respond({ error: "Unauthorized" }, 401);
    const user = { id: authUser.id };
    console.log(`[connect-social] Auth OK: user=${user.id}, action=${action || "connect"}`);

    const svc = createClient(supabaseUrl, internalServiceKey);

    // ── LIST ──
    if (action === "list") {
      // Query PFM API directly (single source of truth)
      const pfmApiKey = Deno.env.get("POSTFORME_API_KEY");
      if (!pfmApiKey) return respond({ connections: [] });

      try {
        const pfmResp = await fetch("https://api.postforme.dev/v1/social-accounts", {
          headers: { "Authorization": `Bearer ${pfmApiKey}` },
        });

        if (!pfmResp.ok) {
          console.error(`[connect-social] PFM API error: ${pfmResp.status}`);
          return respond({ connections: [] });
        }

        const pfmData = await pfmResp.json();
        const allAccounts = pfmData?.data || [];

        // Map ALL PFM accounts to connection format (filter by external_id for multi-user)
        const connections = allAccounts
          .filter((a: any) => a.status === "connected")
          .filter((a: any) => a.external_id === user.id || !a.external_id)
          .map((a: any) => ({
            user_id: user.id,
            platform: a.platform,
            pfm_account_id: a.id,
            status: "connected",
            account_name: a.username || a.name || null,
          }));

        console.log(`[connect-social] PFM: ${allAccounts.length} total, ${connections.length} for user ${user.id}`);
        return respond({ connections });
      } catch (err: any) {
        console.error("[connect-social] PFM fetch error:", err?.message);
        return respond({ connections: [] });
      }
    }

    // ── DISCONNECT ──
    if (action === "disconnect") {
      if (!platform) return respond({ error: "platform is required" }, 400);
      await svc.from("social_connections")
        .update({ status: "disconnected", updated_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("platform", platform);
      return respond({ success: true });
    }

    // ── CONNECT (default) ──
    if (!platform || !SUPPORTED_PLATFORMS.includes(platform)) {
      return respond({ error: `Plataforma inválida. Suportadas: ${SUPPORTED_PLATFORMS.join(", ")}` }, 400);
    }

    const pfmApiKey = Deno.env.get("POSTFORME_API_KEY");
    if (!pfmApiKey) return respond({ error: "POSTFORME_API_KEY não configurada" }, 500);

    const requestBody: Record<string, any> = {
      platform,
      external_id: user.id,
      permissions: ["posts", "feeds"],
    };

    // PFM expects platform-specific config nested under platform_data
    if (PLATFORM_DATA[platform]) {
      requestBody.platform_data = PLATFORM_DATA[platform];
    }

    console.log(`[connect-social] Calling PFM: platform=${platform}, userId=${user.id}, payload=${JSON.stringify(requestBody)}`);

    const pfmResp = await fetch("https://api.postforme.dev/v1/social-accounts/auth-url", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${pfmApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const pfmText = await pfmResp.text();
    console.log(`[connect-social] PFM response: status=${pfmResp.status}, body=${pfmText.substring(0, 500)}`);

    if (!pfmResp.ok) {
      let detail = pfmText;
      try { detail = JSON.parse(pfmText)?.message || pfmText; } catch {}
      return respond({ error: `Erro ao conectar ${platform}: ${detail}` }, 502);
    }

    let pfmData: any;
    try { pfmData = JSON.parse(pfmText); } catch {
      return respond({ error: "Resposta inválida do Post for Me" }, 502);
    }

    const authUrl = pfmData.url || pfmData.auth_url || pfmData.data?.url;
    if (!authUrl) {
      console.error("[connect-social] No auth URL in PFM response:", pfmText.substring(0, 300));
      return respond({ error: "Post for Me não retornou URL de autorização" }, 502);
    }

    return respond({ auth_url: authUrl, platform });

  } catch (err: any) {
    console.error("[connect-social] Unhandled error:", err?.message, err?.stack);
    return respond({ error: err?.message || "Erro interno" }, 500);
  }
});
