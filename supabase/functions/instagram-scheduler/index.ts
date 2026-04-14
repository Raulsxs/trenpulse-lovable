/**
 * content-scheduler — Publishes scheduled content via Post for Me
 *
 * Runs on a cron schedule (every 5 min recommended).
 * Finds generated_contents with status="scheduled" and scheduled_at <= now,
 * calls publish-postforme for each.
 */
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Find scheduled contents that are due
    const now = new Date().toISOString();
    const { data: dueContents, error } = await supabase
      .from("generated_contents")
      .select("id, user_id, platform")
      .eq("status", "scheduled")
      .lte("scheduled_at", now)
      .lt("publish_attempts", 3)
      .order("scheduled_at", { ascending: true })
      .limit(10);

    if (error) {
      console.error("[scheduler] Query error:", error);
      return new Response(JSON.stringify({ error: "Query failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!dueContents?.length) {
      return new Response(JSON.stringify({ message: "No contents due", count: 0 }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[scheduler] Found ${dueContents.length} contents due for publishing`);
    const results = [];

    for (const content of dueContents) {
      try {
        // Increment publish_attempts
        await supabase.from("generated_contents")
          .update({ publish_attempts: (content as any).publish_attempts ? (content as any).publish_attempts + 1 : 1 })
          .eq("id", content.id);

        // Call publish-postforme with service role key (internal call)
        const publishResp = await fetch(`${supabaseUrl}/functions/v1/publish-postforme`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceKey}`,
            "apikey": Deno.env.get("SUPABASE_ANON_KEY")!,
          },
          body: JSON.stringify({
            contentId: content.id,
            platforms: [content.platform || "instagram"],
          }),
        });

        const publishData = await publishResp.json();

        if (publishResp.ok && publishData.results?.some((r: any) => r.success)) {
          console.log(`[scheduler] Published ${content.id} to ${content.platform}`);
          results.push({ id: content.id, status: "published" });
        } else {
          const errMsg = publishData.error || publishData.results?.[0]?.error || "Unknown error";
          console.error(`[scheduler] Failed ${content.id}: ${errMsg}`);
          await supabase.from("generated_contents")
            .update({ publish_error: errMsg })
            .eq("id", content.id);
          results.push({ id: content.id, status: "failed", error: errMsg });
        }
      } catch (err: any) {
        console.error(`[scheduler] Error ${content.id}:`, err?.message);
        results.push({ id: content.id, status: "error", error: err?.message });
      }
    }

    return new Response(JSON.stringify({ processed: results.length, results }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[scheduler] Fatal error:", error?.message);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
