/**
 * fetch-social-metrics — Fetches engagement metrics from Instagram/LinkedIn
 * for published content and caches them in content_metrics table.
 *
 * Can be called manually or via cron (once daily).
 * Processes published content from the last 30 days.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const targetUserId = body.user_id; // optional: fetch for specific user

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Get published content with media IDs
    let query = supabase
      .from("generated_contents")
      .select("id, user_id, platform, instagram_media_id, published_at")
      .eq("status", "published")
      .not("instagram_media_id", "is", null)
      .gte("published_at", thirtyDaysAgo.toISOString())
      .order("published_at", { ascending: false })
      .limit(100);

    if (targetUserId) {
      query = query.eq("user_id", targetUserId);
    }

    const { data: contents, error: contentsErr } = await query;

    if (contentsErr || !contents?.length) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: "No published content to fetch metrics for" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Group by user to batch Instagram API calls
    const userContents: Record<string, typeof contents> = {};
    for (const c of contents) {
      if (!userContents[c.user_id]) userContents[c.user_id] = [];
      userContents[c.user_id].push(c);
    }

    let totalProcessed = 0;
    let totalErrors = 0;

    for (const [userId, userContentList] of Object.entries(userContents)) {
      // Get Instagram connection for this user
      const { data: igConn } = await supabase
        .from("instagram_connections")
        .select("access_token, token_expires_at")
        .eq("user_id", userId)
        .eq("is_active", true)
        .single();

      if (!igConn?.access_token) {
        console.warn(`[fetch-social-metrics] No Instagram token for user ${userId}, skipping`);
        continue;
      }

      // Check token expiry
      if (igConn.token_expires_at && new Date(igConn.token_expires_at) < new Date()) {
        console.warn(`[fetch-social-metrics] Instagram token expired for user ${userId}`);
        continue;
      }

      // Fetch metrics for each published content
      for (const content of userContentList) {
        if (content.platform !== "instagram" || !content.instagram_media_id) continue;

        try {
          const mediaId = content.instagram_media_id;
          const fields = "id,like_count,comments_count,timestamp";

          const res = await fetch(
            `https://graph.instagram.com/${mediaId}?fields=${fields}&access_token=${igConn.access_token}`,
          );

          if (!res.ok) {
            const errText = await res.text();
            console.warn(`[fetch-social-metrics] Instagram API error for media ${mediaId}:`, errText);
            totalErrors++;
            continue;
          }

          const data = await res.json();
          const likes = data.like_count || 0;
          const comments = data.comments_count || 0;
          const engagement = likes + comments;

          await supabase.from("content_metrics").upsert({
            content_id: content.id,
            user_id: userId,
            platform: "instagram",
            likes,
            comments,
            shares: 0,
            saves: 0,
            reach: 0,
            impressions: 0,
            engagement_rate: engagement > 0 ? engagement : 0,
            fetched_at: new Date().toISOString(),
          }, { onConflict: "content_id" });

          totalProcessed++;
          console.log(`[fetch-social-metrics] Updated metrics for content ${content.id}: ${likes} likes, ${comments} comments`);
        } catch (err: any) {
          console.error(`[fetch-social-metrics] Error fetching metrics for content ${content.id}:`, err.message);
          totalErrors++;
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, processed: totalProcessed, errors: totalErrors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("[fetch-social-metrics] Fatal error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
