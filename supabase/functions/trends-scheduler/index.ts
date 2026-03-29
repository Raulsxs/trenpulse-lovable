import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Trends Scheduler — runs periodically to keep trends fresh for all users.
 *
 * Triggered by external cron (same as instagram-scheduler).
 * Recommended: 1x per day (e.g., 6:00 AM BRT).
 *
 * For each active user with a business_niche:
 * 1. Check if trends were updated in the last 24h
 * 2. If stale, call scrape-trends to fetch fresh content via Firecrawl
 * 3. Deactivate trends older than 7 days
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Find users with a business_niche configured (they benefit from trends)
    const { data: users, error: usersErr } = await supabase
      .from("ai_user_context")
      .select("user_id, business_niche")
      .not("business_niche", "is", null)
      .neq("business_niche", "")
      .neq("business_niche", "geral");

    if (usersErr) {
      console.error("[trends-scheduler] Error fetching users:", usersErr.message);
      return new Response(JSON.stringify({ error: usersErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!users?.length) {
      console.log("[trends-scheduler] No users with niche configured");
      return new Response(JSON.stringify({ message: "No users to process", count: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[trends-scheduler] Found ${users.length} users with niche`);

    let refreshed = 0;
    let skipped = 0;
    let failed = 0;

    for (const user of users) {
      try {
        // Check if user has recent trends (< 24h old)
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: recentTrends } = await supabase
          .from("trends")
          .select("id")
          .eq("user_id", user.user_id)
          .eq("is_active", true)
          .gte("created_at", oneDayAgo)
          .limit(1);

        if (recentTrends?.length) {
          skipped++;
          continue; // Already fresh
        }

        // Call scrape-trends with service role key + user_id in body
        console.log(`[trends-scheduler] Refreshing trends for user ${user.user_id} (niche: ${user.business_niche})`);

        const scrapeResp = await fetch(`${supabaseUrl}/functions/v1/scrape-trends`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
            apikey: anonKey,
          },
          body: JSON.stringify({ user_id: user.user_id }),
        });

        if (scrapeResp.ok) {
          refreshed++;
          console.log(`[trends-scheduler] User ${user.user_id}: trends refreshed`);
        } else {
          const errText = await scrapeResp.text();
          console.warn(`[trends-scheduler] User ${user.user_id}: scrape failed (${scrapeResp.status}): ${errText.substring(0, 200)}`);
          failed++;
        }

        // Small delay between users to avoid rate limits
        await new Promise(r => setTimeout(r, 2000));
      } catch (err: any) {
        console.error(`[trends-scheduler] User ${user.user_id} error:`, err.message);
        failed++;
      }
    }

    // Deactivate trends older than 7 days
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from("trends")
        .update({ is_active: false })
        .eq("is_active", true)
        .lt("created_at", sevenDaysAgo);
      if (count && count > 0) {
        console.log(`[trends-scheduler] Deactivated ${count} stale trends (>7 days)`);
      }
    } catch { /* ignore cleanup errors */ }

    const result = { refreshed, skipped, failed, total: users.length };
    console.log(`[trends-scheduler] Done:`, JSON.stringify(result));

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[trends-scheduler] Fatal error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
