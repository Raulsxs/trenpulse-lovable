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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find scheduled contents that are due for publishing (Instagram + LinkedIn)
    const now = new Date().toISOString();
    const { data: dueContents, error } = await supabase
      .from("generated_contents")
      .select("id, user_id, platform")
      .eq("status", "scheduled")
      .in("platform", ["instagram", "linkedin"])
      .lte("scheduled_at", now)
      .lt("publish_attempts", 3)
      .order("scheduled_at", { ascending: true })
      .limit(10);

    if (error) {
      console.error("Query error:", error);
      return new Response(JSON.stringify({ error: "Failed to query scheduled contents" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!dueContents || dueContents.length === 0) {
      return new Response(JSON.stringify({ message: "No contents due for publishing", count: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results = [];

    for (const content of dueContents) {
      try {
        const isLinkedIn = content.platform === "linkedin";
        const connectionTable = isLinkedIn ? "linkedin_connections" : "instagram_connections";
        const publishFunction = isLinkedIn ? "publish-linkedin" : "publish-instagram";

        // Check if user has an active connection
        const { data: connection } = await supabase
          .from(connectionTable)
          .select("id")
          .eq("user_id", content.user_id)
          .eq("is_active", true)
          .limit(1)
          .single();

        if (!connection) {
          await supabase.from("generated_contents").update({
            publish_error: `No active ${isLinkedIn ? "LinkedIn" : "Instagram"} connection`,
            publish_attempts: 3,
          }).eq("id", content.id);

          results.push({ id: content.id, status: "skipped", reason: "no_connection" });
          continue;
        }

        // Call publish function
        const publishUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/${publishFunction}`;
        const publishRes = await fetch(publishUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({ content_id: content.id }),
        });

        const publishData = await publishRes.json();

        if (publishRes.ok) {
          results.push({ id: content.id, status: "published", media_id: publishData.media_id });
        } else {
          results.push({ id: content.id, status: "failed", error: publishData.error });
        }
      } catch (err) {
        console.error(`Error publishing ${content.id}:`, err);
        results.push({ id: content.id, status: "error", error: err instanceof Error ? err.message : "Unknown" });
      }
    }

    return new Response(JSON.stringify({ processed: results.length, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Scheduler error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
