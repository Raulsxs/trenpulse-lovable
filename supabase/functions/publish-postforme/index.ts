/**
 * publish-postforme — Publishes content to social media via Post for Me API
 *
 * Supports: instagram, linkedin, tiktok, x, facebook, pinterest, bluesky, threads, youtube
 * Handles: immediate publish, scheduled publish, multi-platform publish
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { contentId, platforms, accountIds, scheduledAt } = await req.json();

    if (!contentId) {
      return new Response(JSON.stringify({ error: "contentId is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    // Load content
    const { data: content, error: contentError } = await svc
      .from("generated_contents")
      .select("title, caption, hashtags, image_urls, slides, platform, content_type, platform_captions")
      .eq("id", contentId)
      .single();

    if (contentError || !content) {
      return new Response(JSON.stringify({ error: "Conteúdo não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load user's connected accounts (try DB first, fallback to PFM API)
    let connections: any[] = [];
    const { data: dbConnections } = await svc
      .from("social_connections")
      .select("platform, pfm_account_id, status")
      .eq("user_id", user.id)
      .eq("status", "connected");

    if (dbConnections?.length) {
      connections = dbConnections;
    } else {
      // DB empty — try PFM API directly
      const pfmApiKey = Deno.env.get("POSTFORME_API_KEY");
      if (pfmApiKey) {
        try {
          const pfmResp = await fetch("https://api.postforme.dev/v1/social-accounts", {
            headers: { "Authorization": `Bearer ${pfmApiKey}` },
          });
          if (pfmResp.ok) {
            const pfmData = await pfmResp.json();
            const pfmAccounts = Array.isArray(pfmData?.data) ? pfmData.data : [];
            connections = pfmAccounts
              .filter((a: any) => a.external_id === user.id && a.status === "connected")
              .map((a: any) => ({
                platform: a.platform,
                pfm_account_id: a.id,
                status: "connected",
              }));
            console.log(`[publish-postforme] Loaded ${connections.length} accounts from PFM API (DB was empty)`);
          }
        } catch (e: any) {
          console.warn("[publish-postforme] PFM fallback failed:", e?.message);
        }
      }
    }

    if (!connections.length) {
      return new Response(JSON.stringify({ error: "Nenhuma rede social conectada. Vá em Perfil para conectar." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine which platforms to publish to
    const targetPlatforms = platforms || [content.platform || "instagram"];
    const results: Array<{ platform: string; success: boolean; postId?: string; error?: string }> = [];

    // Build caption with hashtags
    const platformCaptions = content.platform_captions as Record<string, string> | null;
    const defaultCaption = content.caption || content.title || "";
    const hashtagsStr = Array.isArray(content.hashtags) ? "\n\n" + content.hashtags.join(" ") : "";

    // Get media URLs
    const imageUrls = (content.image_urls as string[]) || [];
    const slideImages = (content.slides as any[])?.map((s: any) => s.image_url || s.background_image_url).filter(Boolean) || [];
    const mediaUrls = imageUrls.length > 0 ? imageUrls : slideImages;

    if (mediaUrls.length === 0) {
      return new Response(JSON.stringify({ error: "Conteúdo sem imagem. Gere a imagem primeiro." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If accountIds provided, publish to those specific accounts; otherwise use platform matching
    const publishTargets: Array<{ platform: string; pfm_account_id: string }> = [];

    if (accountIds?.length) {
      // Specific accounts selected by user
      for (const accId of accountIds) {
        const conn = connections.find((c: any) => c.pfm_account_id === accId);
        if (conn) publishTargets.push({ platform: conn.platform, pfm_account_id: accId });
      }
    } else {
      // Legacy: match by platform name
      for (const tp of targetPlatforms) {
        const conn = connections.find((c: any) => c.platform === tp);
        if (conn?.pfm_account_id) publishTargets.push({ platform: tp, pfm_account_id: conn.pfm_account_id });
      }
    }

    if (publishTargets.length === 0) {
      return new Response(JSON.stringify({ error: "Nenhuma conta selecionada para publicação." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Publish to each target account
    for (const target of publishTargets) {
      const caption = platformCaptions?.[target.platform] || (defaultCaption + hashtagsStr);

      try {
        console.log(`[publish-postforme] Publishing to ${target.platform}: account=${target.pfm_account_id}, media=${mediaUrls.length}`);

        const media = mediaUrls.map((url: string) => ({ url }));

        const postBody: any = {
          caption,
          social_accounts: [target.pfm_account_id],
          media,
        };

        // Scheduled publish
        if (scheduledAt) {
          postBody.scheduled_at = scheduledAt;
        }

        console.log(`[publish-postforme] PFM payload: caption=${caption.substring(0, 50)}..., accounts=${postBody.social_accounts}, media=${media.length}`);

        const pfmResp = await fetch("https://api.postforme.dev/v1/social-posts", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${pfmApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(postBody),
        });

        if (pfmResp.ok) {
          const pfmData = await pfmResp.json();
          const postId = pfmData.id || pfmData.post_id || pfmData.data?.id;
          console.log(`[publish-postforme] Success on ${target.platform}: postId=${postId}`);
          results.push({ platform: target.platform, success: true, postId });
        } else {
          const errText = await pfmResp.text();
          console.error(`[publish-postforme] Failed on ${target.platform}: ${pfmResp.status}`, errText.substring(0, 200));
          results.push({ platform: target.platform, success: false, error: `Erro ${pfmResp.status}` });
        }
      } catch (pubErr: any) {
        console.error(`[publish-postforme] Error on ${target.platform}:`, pubErr?.message);
        results.push({ platform: target.platform, success: false, error: pubErr?.message });
      }
    }

    // Update content status
    const anySuccess = results.some(r => r.success);
    if (anySuccess) {
      await svc.from("generated_contents").update({
        status: scheduledAt ? "scheduled" : "published",
        published_at: scheduledAt ? null : new Date().toISOString(),
        scheduled_at: scheduledAt || null,
      }).eq("id", contentId);
    }

    const successCount = results.filter(r => r.success).length;
    const message = successCount === targetPlatforms.length
      ? `✅ Publicado em ${successCount} plataforma(s)!`
      : successCount > 0
        ? `⚠️ Publicado em ${successCount}/${targetPlatforms.length} plataformas.`
        : "❌ Falha na publicação.";

    return new Response(JSON.stringify({
      success: anySuccess,
      message,
      results,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("[publish-postforme] Error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
