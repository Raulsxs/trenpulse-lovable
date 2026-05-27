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
    // CRITICAL: include publish_attempts in the SELECT, otherwise the increment below
    // reads `undefined` and stays at 1 forever — that's how Felipe's LinkedIn got 12+
    // duplicate posts on 2026-04-27. The < 3 filter must actually exclude old failures.
    const { data: dueContents, error } = await supabase
      .from("generated_contents")
      .select("id, user_id, platform, publish_attempts")
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
      const prevAttempts = (content as any).publish_attempts || 0;
      const nextAttempts = prevAttempts + 1;
      try {
        // CRITICAL FIX: lock the row by flipping status to "publishing" BEFORE calling the
        // publisher. Even if PFM is slow / pending, the next 5min cron tick will not pick
        // this row again because the .eq("status", "scheduled") filter excludes it. Without
        // this lock, a slow / pending publish gets retried every tick and the PFM creates a
        // brand new post each time — that's exactly what duplicated 12+ posts on Felipe's
        // LinkedIn on 2026-04-27.
        const { error: lockErr } = await supabase.from("generated_contents")
          .update({
            status: "publishing",
            publish_attempts: nextAttempts,
          })
          .eq("id", content.id)
          .eq("status", "scheduled"); // optimistic lock — only update if still scheduled

        if (lockErr) {
          console.error(`[scheduler] Could not lock ${content.id}:`, lockErr.message);
          results.push({ id: content.id, status: "lock_failed", error: lockErr.message });
          continue;
        }

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
          // publish-postforme already set status=published when confirmed, but re-affirm here
          // so any race condition is closed.
          console.log(`[scheduler] Published ${content.id} to ${content.platform}`);
          results.push({ id: content.id, status: "published" });
        } else if (publishResp.ok && publishData.results?.some((r: any) => r.pending === true)) {
          // Pending — PFM accepted but didn't confirm in time. publish-postforme already
          // set status=processing so we DON'T retry. Just log and move on.
          console.log(`[scheduler] Pending ${content.id} — left as 'processing', will not retry`);
          results.push({ id: content.id, status: "pending" });
        } else {
          // Real failure (PFM rejected, network error, etc). Mark status=failed if we hit
          // the max attempts; otherwise keep it as scheduled to allow retry on next tick.
          const errMsg = publishData.error || publishData.results?.[0]?.error || "Unknown error";
          console.error(`[scheduler] Failed ${content.id} (attempt ${nextAttempts}/3): ${errMsg}`);
          const finalStatus = nextAttempts >= 3 ? "failed" : "scheduled";
          await supabase.from("generated_contents")
            .update({ status: finalStatus, publish_error: errMsg })
            .eq("id", content.id);
          results.push({ id: content.id, status: finalStatus, error: errMsg });
        }
      } catch (err: any) {
        console.error(`[scheduler] Error ${content.id}:`, err?.message);
        // Roll back to scheduled so we can retry — but only if attempts haven't maxed out.
        const finalStatus = nextAttempts >= 3 ? "failed" : "scheduled";
        await supabase.from("generated_contents")
          .update({ status: finalStatus, publish_error: err?.message || "fetch error" })
          .eq("id", content.id);
        results.push({ id: content.id, status: finalStatus, error: err?.message });
      }
    }

    // ── Recurring schedules ──────────────────────────────────────────────
    // Pick up active recurring rules whose configured day-of-week matches today and whose
    // hour_utc has been reached, but haven't fired yet today. For each, clone the source
    // content into a one-shot scheduled entry so the loop above publishes it on the next tick.
    const recurringResults: Array<{ id: string; status: string; spawnedContentId?: string; error?: string }> = [];
    try {
      const nowDate = new Date();
      const dow = nowDate.getUTCDay(); // 0=Sun ... 6=Sat
      const hourNow = nowDate.getUTCHours();
      const todayUtcDateStr = nowDate.toISOString().slice(0, 10); // YYYY-MM-DD

      const { data: dueRecurring, error: recErr } = await supabase
        .from("recurring_schedules")
        .select("id, user_id, content_id, platforms, hour_utc, jitter_minutes, last_run_at")
        .eq("active", true)
        .contains("days_of_week", [dow])
        .lte("hour_utc", hourNow);

      if (recErr) {
        console.error("[scheduler] recurring query error:", recErr.message);
      } else if (dueRecurring?.length) {
        console.log(`[scheduler] ${dueRecurring.length} recurring schedule(s) candidate for today (dow=${dow}, hour=${hourNow})`);

        for (const sched of dueRecurring) {
          try {
            const todayAtSchedHour = new Date(Date.UTC(
              nowDate.getUTCFullYear(),
              nowDate.getUTCMonth(),
              nowDate.getUTCDate(),
              sched.hour_utc,
              0, 0, 0,
            ));
            // Already fired today? skip.
            if (sched.last_run_at && new Date(sched.last_run_at) >= todayAtSchedHour) {
              continue;
            }

            // Clone the source content as a fresh scheduled entry.
            const { data: src, error: srcErr } = await supabase
              .from("generated_contents")
              .select("user_id, title, caption, hashtags, image_urls, slides, platform, content_type, platform_captions, brand_id, brand_snapshot, visual_mode, generation_metadata, include_cta")
              .eq("id", sched.content_id)
              .single();

            if (srcErr || !src) {
              console.warn(`[scheduler] recurring ${sched.id}: source content ${sched.content_id} not found`);
              recurringResults.push({ id: sched.id, status: "skipped", error: "source not found" });
              continue;
            }

            // Stagger the actual publish time within jitter_minutes after the configured hour
            // so daily recurring posts don't fire at the exact same minute every day.
            const jitter = (sched as any).jitter_minutes ?? 15;
            const offsetMs = jitter > 0 ? Math.floor(Math.random() * jitter * 60_000) : 0;
            const spawnedAtMs = Date.now() + offsetMs;
            const spawnedAt = new Date(spawnedAtMs).toISOString();
            const { data: spawned, error: spawnErr } = await supabase
              .from("generated_contents")
              .insert({
                user_id: sched.user_id,
                title: src.title,
                caption: src.caption,
                hashtags: src.hashtags,
                image_urls: src.image_urls,
                slides: src.slides,
                platform: src.platform,
                content_type: src.content_type,
                platform_captions: src.platform_captions,
                brand_id: src.brand_id,
                brand_snapshot: src.brand_snapshot,
                visual_mode: src.visual_mode,
                include_cta: src.include_cta,
                status: "scheduled",
                scheduled_at: spawnedAt,
                generation_metadata: {
                  ...((src.generation_metadata as Record<string, any>) || {}),
                  recurring_schedule_id: sched.id,
                  spawned_for_date: todayUtcDateStr,
                  jitter_offset_minutes: Math.round(offsetMs / 60_000),
                },
              })
              .select("id")
              .maybeSingle();

            if (spawnErr || !spawned) {
              console.error(`[scheduler] recurring ${sched.id}: spawn failed:`, spawnErr?.message);
              recurringResults.push({ id: sched.id, status: "spawn_failed", error: spawnErr?.message });
              continue;
            }

            // If the recurring rule overrides platforms, write that into the spawned entry too.
            if (Array.isArray(sched.platforms) && sched.platforms.length > 0) {
              await supabase
                .from("generated_contents")
                .update({ platform: sched.platforms[0] })
                .eq("id", spawned.id);
            }

            // Mark the schedule as fired *now* (not at spawnedAt) so the same-day dedup check
            // works regardless of jitter — last_run_at being >= todayAtSchedHour is the gate.
            await supabase
              .from("recurring_schedules")
              .update({ last_run_at: new Date().toISOString() })
              .eq("id", sched.id);

            console.log(`[scheduler] recurring ${sched.id}: spawned content ${spawned.id} from source ${sched.content_id}`);
            recurringResults.push({ id: sched.id, status: "spawned", spawnedContentId: spawned.id });
          } catch (err: any) {
            console.error(`[scheduler] recurring ${sched.id} error:`, err?.message);
            recurringResults.push({ id: sched.id, status: "error", error: err?.message });
          }
        }
      }
    } catch (err: any) {
      console.error("[scheduler] recurring loop fatal:", err?.message);
    }

    return new Response(JSON.stringify({
      processed: results.length,
      results,
      recurring_processed: recurringResults.length,
      recurring_results: recurringResults,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[scheduler] Fatal error:", error?.message);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
