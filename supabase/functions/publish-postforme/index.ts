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

    // Auth — supports user JWT (from UI) or service_role (internal calls from scheduler)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const bearerToken = authHeader.slice("Bearer ".length).trim();
    const isInternalCall = bearerToken === serviceRoleKey;

    const svc = createClient(supabaseUrl, serviceRoleKey);

    // Resolve user: user-JWT path uses getUser(); internal path derives from content.user_id
    let userId: string | null = null;

    if (!isInternalCall) {
      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = user.id;
    }

    const pfmApiKey = Deno.env.get("POSTFORME_API_KEY");
    if (!pfmApiKey) {
      return new Response(JSON.stringify({ error: "Post for Me API not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load content (also resolves user_id for internal calls)
    const { data: content, error: contentError } = await svc
      .from("generated_contents")
      .select("title, caption, hashtags, image_urls, slides, platform, content_type, platform_captions, user_id, generation_metadata")
      .eq("id", contentId)
      .single();

    if (contentError || !content) {
      return new Response(JSON.stringify({ error: "Conteúdo não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (isInternalCall) {
      userId = (content as any).user_id;
    } else if (userId !== (content as any).user_id) {
      // Prevent cross-user publishing
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load user's connected accounts (try DB first, fallback to PFM API)
    let connections: any[] = [];
    const { data: dbConnections } = await svc
      .from("social_connections")
      .select("platform, pfm_account_id, status")
      .eq("user_id", userId)
      .eq("status", "connected");

    if (dbConnections?.length) {
      connections = dbConnections;
    } else {
      // DB empty — try PFM API directly
      try {
        const pfmResp = await fetch("https://api.postforme.dev/v1/social-accounts", {
          headers: { "Authorization": `Bearer ${pfmApiKey}` },
        });
        if (pfmResp.ok) {
          const pfmData = await pfmResp.json();
          const pfmAccounts = Array.isArray(pfmData?.data) ? pfmData.data : [];
          // STRICT: exige external_id === userId. Antes aceitava unowned (sem external_id),
          // o que vazava contas do Raul pra publicacoes do Maikon (bug 2026-05-09).
          connections = pfmAccounts
            .filter((a: any) => a.status === "connected")
            .filter((a: any) => a.external_id === userId)
            .map((a: any) => ({
              platform: a.platform,
              pfm_account_id: a.id,
              status: "connected",
            }));
          console.log(`[publish-postforme] Loaded ${connections.length} accounts from PFM API (DB was empty) for user ${userId}`);
        } else {
          console.warn(`[publish-postforme] PFM fallback HTTP ${pfmResp.status}`);
        }
      } catch (e: any) {
        console.warn("[publish-postforme] PFM fallback failed:", e?.message);
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

    // Story carousel: N independent stories instead of one feed carousel.
    // The flag is set by ai-chat in generation_metadata when the user picked the
    // "Carrossel de Stories" template (or asked for sequential stories).
    const isStoryCarousel = (content as any).generation_metadata?.is_story_carousel === true;
    const baseContentType = (content as any).content_type || "post";

    // Helper: publish one PFM social-post and poll for a concrete verdict.
    // Returns { success, postId?, error?, pending?, url? }.
    const publishOne = async (
      target: { platform: string; pfm_account_id: string },
      mediaList: string[],
      forceStory: boolean,
      slideIdxLog: string,
    ): Promise<{ success: boolean; postId?: string; error?: string; pending?: boolean; url?: string }> => {
      const caption = platformCaptions?.[target.platform] || (defaultCaption + hashtagsStr);
      const isStory = forceStory || baseContentType === "story" || baseContentType === "reels";
      const media = mediaList.map((url: string) => ({ url }));

      const postBody: any = {
        caption: caption || content.title || ".",
        social_accounts: [target.pfm_account_id],
        media,
      };
      if (isStory) {
        postBody.platform_configurations = { [target.platform]: { placement: "stories" } };
      }
      if (scheduledAt) {
        postBody.scheduled_at = scheduledAt;
      }

      console.log(`[publish-postforme] ${slideIdxLog}publishing target=${target.platform} type=${baseContentType} isStory=${isStory} media=${media.length}`);

      let pfmResp: Response;
      try {
        pfmResp = await fetch("https://api.postforme.dev/v1/social-posts", {
          method: "POST",
          headers: { "Authorization": `Bearer ${pfmApiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(postBody),
        });
      } catch (netErr: any) {
        console.error(`[publish-postforme] ${slideIdxLog}network error: ${netErr?.message}`);
        return { success: false, error: netErr?.message || "Erro de rede" };
      }

      if (!pfmResp.ok) {
        const errText = await pfmResp.text();
        console.error(`[publish-postforme] ${slideIdxLog}rejected by PFM status=${pfmResp.status} body=${errText}`);
        let friendlyError = `Erro ${pfmResp.status}`;
        try {
          const errJson = JSON.parse(errText);
          const msg = errJson?.message || errJson?.error?.message || errJson?.error || errJson?.errors?.[0]?.message;
          if (msg) friendlyError = `${friendlyError}: ${msg}`;
        } catch {
          if (errText) friendlyError = `${friendlyError}: ${errText.substring(0, 200)}`;
        }
        return { success: false, error: friendlyError };
      }

      const pfmData = await pfmResp.json();
      const postId = pfmData.id || pfmData.post_id || pfmData.data?.id;
      console.log(`[publish-postforme] ${slideIdxLog}PFM accepted postId=${postId}`);

      // Skip polling for scheduled posts — they're handled async
      if (scheduledAt || !postId) {
        return { success: true, postId };
      }

      // Poll social-post-results until success/failed/timeout
      const pollUrl = `https://api.postforme.dev/v1/social-post-results?post_id=${encodeURIComponent(postId)}&social_account_id=${encodeURIComponent(target.pfm_account_id)}`;
      for (let attempt = 0; attempt < 8; attempt++) {
        await new Promise(r => setTimeout(r, attempt === 0 ? 2000 : 3000));
        try {
          const pollController = new AbortController();
          const pollTimer = setTimeout(() => pollController.abort(), 5000);
          const statusResp = await fetch(pollUrl, {
            headers: { "Authorization": `Bearer ${pfmApiKey}` },
            signal: pollController.signal,
          });
          clearTimeout(pollTimer);
          if (!statusResp.ok) {
            console.warn(`[publish-postforme] ${slideIdxLog}poll ${attempt} http=${statusResp.status}`);
            continue;
          }
          const statusData = await statusResp.json();
          const items = Array.isArray(statusData?.data) ? statusData.data
            : Array.isArray(statusData?.results) ? statusData.results
            : Array.isArray(statusData) ? statusData : [];
          const ours = items[0];
          if (!ours) continue;
          if (ours.success === true) {
            const url = ours.platform_data?.url || ours.platform_data?.permalink || undefined;
            console.log(`[publish-postforme] ${slideIdxLog}confirmed published postId=${postId}`);
            return { success: true, postId, url };
          }
          if (ours.success === false) {
            const errMsg = typeof ours.error === "string"
              ? ours.error
              : (ours.error?.message || JSON.stringify(ours.error)?.substring(0, 200) || "Publicação rejeitada pela plataforma");
            console.error(`[publish-postforme] ${slideIdxLog}platform rejected: ${errMsg}`);
            return { success: false, error: errMsg };
          }
        } catch (pollErr: any) {
          console.warn(`[publish-postforme] ${slideIdxLog}poll ${attempt} failed: ${pollErr?.name === "AbortError" ? "timeout" : pollErr?.message}`);
        }
      }

      console.warn(`[publish-postforme] ${slideIdxLog}still pending after polling postId=${postId}`);
      return {
        success: false,
        error: "Publicação em processamento. Verifique sua conta em alguns minutos.",
        pending: true,
        postId,
      };
    };

    // Publish to each target account. Story carousels expand into N independent story publishes.
    for (const target of publishTargets) {
      try {
        if (isStoryCarousel && mediaUrls.length > 1) {
          console.log(`[publish-postforme] Story carousel on ${target.platform}: ${mediaUrls.length} stories sequentially`);
          const sliceResults: Array<{ success: boolean; postId?: string; error?: string; pending?: boolean }> = [];
          for (let i = 0; i < mediaUrls.length; i++) {
            const r = await publishOne(target, [mediaUrls[i]], true, `[story ${i + 1}/${mediaUrls.length}] `);
            sliceResults.push(r);
            // If a story fails outright (not pending), stop publishing the rest — keeps the user's
            // feed from getting half a broken sequence. Pending continues.
            if (!r.success && !r.pending) break;
          }

          const allSuccess = sliceResults.every(r => r.success);
          const anyPending = sliceResults.some(r => r.pending);
          const failed = sliceResults.filter(r => !r.success && !r.pending);

          if (allSuccess) {
            results.push({
              platform: target.platform,
              success: true,
              postId: sliceResults[0].postId,
            });
          } else if (anyPending && failed.length === 0) {
            results.push({
              platform: target.platform,
              success: false,
              pending: true,
              error: `${sliceResults.filter(r => r.pending).length} de ${mediaUrls.length} stories em processamento. Verifique sua conta em alguns minutos.`,
            } as any);
          } else {
            const successes = sliceResults.filter(r => r.success).length;
            results.push({
              platform: target.platform,
              success: false,
              error: successes > 0
                ? `${successes} de ${mediaUrls.length} stories publicados; ${failed.length} falharam: ${failed[0]?.error || ""}`
                : (failed[0]?.error || "Falha ao publicar stories"),
            });
          }
        } else {
          const r = await publishOne(target, mediaUrls, false, "");
          results.push({ platform: target.platform, ...r } as any);
        }
      } catch (pubErr: any) {
        console.error(`[publish-postforme] Error on ${target.platform}:`, pubErr?.message);
        results.push({ platform: target.platform, success: false, error: pubErr?.message });
      }
    }

    // Update content status — only mark "published" when we have at least one confirmed success.
    // If everything is still pending, mark as "processing" so the UI doesn't lie to the user.
    const anySuccess = results.some(r => r.success);
    const anyPending = results.some((r: any) => r.pending === true);
    if (anySuccess) {
      await svc.from("generated_contents").update({
        status: scheduledAt ? "scheduled" : "published",
        published_at: scheduledAt ? null : new Date().toISOString(),
        scheduled_at: scheduledAt || null,
      }).eq("id", contentId);
    } else if (anyPending && !scheduledAt) {
      await svc.from("generated_contents").update({ status: "processing" }).eq("id", contentId);
    }

    const successCount = results.filter(r => r.success).length;
    const pendingCount = results.filter((r: any) => r.pending === true).length;
    const message = successCount === targetPlatforms.length
      ? `✅ Publicado em ${successCount} plataforma(s)!`
      : successCount > 0
        ? `⚠️ Publicado em ${successCount}/${targetPlatforms.length} plataformas.`
        : pendingCount > 0
          ? `⏳ ${pendingCount} publicação(ões) em processamento. Verifique em alguns minutos.`
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
