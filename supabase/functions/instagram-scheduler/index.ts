/**
 * content-scheduler — Publishes scheduled content via Post for Me
 *
 * Runs on a cron schedule (every 5 min recommended).
 * Finds generated_contents with status="scheduled" and scheduled_at <= now,
 * calls publish-postforme for each.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { alvosDoRecorrente, contaDoPfm, falhaDaPublicacao, type AlvosDoRecorrente } from "../_shared/publicacao.ts";
import { MAX_TENTATIVAS, publicarPecaVencida, type PecaVencida } from "../_shared/agendador.ts";

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
      .select("id, user_id, platform, publish_attempts, scheduled_accounts")
      .eq("status", "scheduled")
      .lte("scheduled_at", now)
      .lt("publish_attempts", MAX_TENTATIVAS)
      .order("scheduled_at", { ascending: true })
      .limit(10);

    if (error) {
      console.error("[scheduler] Query error:", error);
      return new Response(JSON.stringify({ error: "Query failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // SEM `return` quando não há peça vencida. Havia um aqui ("No contents due"), e ele saía ANTES dos
    // recorrentes e da reconciliação lá embaixo: os dois só rodavam no minuto em que, por acaso, outra
    // peça vencia. Medido em 2026-10-06: recorrentes das 10h e das 11h (UTC) disparando juntos às 12:00,
    // e um das 22h parado desde 22/09 — ninguém tinha peça vencendo à noite.
    const vencidas = dueContents || [];
    if (vencidas.length) console.log(`[scheduler] Found ${vencidas.length} contents due for publishing`);
    const results = [];

    // Lock, publicação e gravação do resultado vivem em _shared/agendador.ts (testado). Falha permanente
    // (ex.: sessão da Meta invalidada) vai direto para failed, sem nova tentativa; o resto tenta até 3 vezes.
    const publicar = async (corpo: Record<string, unknown>) => {
      // Chamada interna com service role. apikey = MESMA key do Authorization: o gateway rejeita keys
      // diferentes ("Conflicting API keys" 401) desde 2026-06-11.
      const r = await fetch(`${supabaseUrl}/functions/v1/publish-postforme`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}`, "apikey": serviceKey },
        body: JSON.stringify(corpo),
      });
      return { ok: r.ok, data: await r.json() };
    };
    for (const content of vencidas) {
      results.push(await publicarPecaVencida(supabase, content as PecaVencida, publicar, (m) => console.log(`[scheduler] ${m}`)));
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
        .select("id, user_id, content_id, name, platforms, account_ids, hour_utc, jitter_minutes, last_run_at")
        .eq("active", true)
        .contains("days_of_week", [dow])
        .lte("hour_utc", hourNow);

      if (recErr) {
        console.error("[scheduler] recurring query error:", recErr.message);
      } else if (dueRecurring?.length) {
        console.log(`[scheduler] ${dueRecurring.length} recurring schedule(s) candidate for today (dow=${dow}, hour=${hourNow})`);

        // Contas do Post for Me, lidas UMA vez por execução (a API devolve as de todos os usuários).
        // null = não deu para ler. Nesse caso o recorrente segue como antes, sem conta gravada: um
        // soluço do Post for Me não pode suspender o recorrente de todo mundo.
        let contasPfm: any[] | null = null;
        const pfmKey = Deno.env.get("POSTFORME_API_KEY");
        if (pfmKey) {
          try {
            const r = await fetch("https://api.postforme.dev/v1/social-accounts", { headers: { Authorization: `Bearer ${pfmKey}` } });
            if (r.ok) {
              const d = await r.json();
              contasPfm = Array.isArray(d?.data) ? d.data : null;
            } else {
              console.warn(`[scheduler] recorrentes: Post for Me HTTP ${r.status} — seguindo sem conferir as contas`);
            }
          } catch (e: any) {
            console.warn("[scheduler] recorrentes: Post for Me fora do ar —", e?.message);
          }
        }

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

            // ONDE publicar. Sem isto a cópia nascia sem conta: rede com vários perfis saía num perfil
            // sorteado, e rede sem conta falhava três vezes em silêncio (ver alvosDoRecorrente).
            // Mesmo filtro do publicador: só conta conectada cujo external_id é o dono.
            let alvo: AlvosDoRecorrente | null = null;
            if (contasPfm) {
              const contas = contasPfm
                .filter((a: any) => a.status === "connected" && a.external_id === sched.user_id)
                .map((a: any) => contaDoPfm(a, sched.user_id));
              alvo = alvosDoRecorrente(sched as any, contas);
              if (!alvo.publica) {
                // Não cria a cópia: ela só serviria para falhar. Marca como rodado hoje (para não
                // reavaliar a cada 5 min) e deixa o motivo onde o dono vê.
                await supabase.from("recurring_schedules")
                  .update({ last_run_at: new Date().toISOString(), last_error: alvo.aviso })
                  .eq("id", sched.id);
                console.warn(`[scheduler] recurring ${sched.id}: não publicou — ${alvo.aviso}`);
                recurringResults.push({ id: sched.id, status: "skipped", error: alvo.aviso || "sem conta" });
                continue;
              }
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
                platform: alvo?.platforms[0] || (Array.isArray(sched.platforms) && sched.platforms[0]) || src.platform,
                // Mesmo formato do modal de Agendar: com accountIds o agendador publica EXATAMENTE neles.
                scheduled_accounts: alvo?.accountIds.length ? { platforms: alvo.platforms, accountIds: alvo.accountIds } : null,
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

            // Mark the schedule as fired *now* (not at spawnedAt) so the same-day dedup check
            // works regardless of jitter — last_run_at being >= todayAtSchedHour is the gate.
            await supabase
              .from("recurring_schedules")
              // last_error acompanha o que foi conferido AGORA; sem leitura das contas, fica como estava.
              .update({ last_run_at: new Date().toISOString(), ...(alvo ? { last_error: alvo.aviso } : {}) })
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

    // ── Reconciliação do "processing" travado ────────────────────────────
    // Publicação que o PFM aceitou mas não confirmou na hora vira status="processing" com
    // generation_metadata.pfm_pending = [{post_id, account_id, platform}]. Sem reconciliar, ficava
    // "em processamento" pra sempre. Aqui reconsultamos o PFM e resolvemos published/failed.
    const reconResults: Array<{ id: string; status: string }> = [];
    try {
      const pfmApiKey = Deno.env.get("POSTFORME_API_KEY");
      const { data: stuck } = await supabase
        .from("generated_contents")
        .select("id, generation_metadata, scheduled_at")
        .eq("status", "processing")
        .not("generation_metadata->pfm_pending", "is", null)
        .limit(20);

      for (const c of stuck || []) {
        const pend = ((c as any).generation_metadata?.pfm_pending || []) as Array<{ post_id: string; account_id: string; platform: string }>;
        if (!pfmApiKey || !pend.length) continue;
        let anySuccess = false, anyFail = false, stillPending = false;
        let firstErr = "";
        for (const p of pend) {
          try {
            const url = `https://api.postforme.dev/v1/social-post-results?post_id=${encodeURIComponent(p.post_id)}&social_account_id=${encodeURIComponent(p.account_id)}`;
            const resp = await fetch(url, { headers: { Authorization: `Bearer ${pfmApiKey}` } });
            if (!resp.ok) { stillPending = true; continue; }
            const data = await resp.json();
            const items = Array.isArray(data?.data) ? data.data : Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
            const ours = items[0];
            if (!ours) { stillPending = true; continue; }
            if (ours.success === true) anySuccess = true;
            else if (ours.success === false) {
              anyFail = true;
              // Mesma leitura do publicador: sessão invalidada vira "reconecte em Perfil → Conexões", sem segredo.
              const bruto = typeof ours.error === "string" ? ours.error : (ours.error?.message || "Rejeitado pela plataforma");
              firstErr = falhaDaPublicacao(bruto, { platform: p.platform, pfm_account_id: p.account_id }).erro;
            }
            else stillPending = true;
          } catch { stillPending = true; }
        }
        // Resolve só quando não há mais nada pendente (evita marcar cedo demais).
        if (!stillPending && anySuccess) {
          // Peça agendada saiu na hora agendada: gravar "agora" diria que saiu quando o cron conferiu.
          await supabase.from("generated_contents").update({ status: "published", published_at: (c as any).scheduled_at || new Date().toISOString() }).eq("id", c.id);
          reconResults.push({ id: c.id, status: "published" });
        } else if (!stillPending && anyFail) {
          await supabase.from("generated_contents").update({ status: "failed", publish_error: firstErr || "Publicação rejeitada" }).eq("id", c.id);
          reconResults.push({ id: c.id, status: "failed" });
        }
        // Ainda pendente → deixa como processing pro próximo tick reconsultar.
      }
    } catch (err: any) {
      console.error("[scheduler] reconciliação processing falhou:", err?.message);
    }

    return new Response(JSON.stringify({
      processed: results.length,
      results,
      recurring_processed: recurringResults.length,
      recurring_results: recurringResults,
      reconciled: reconResults.length,
      reconciled_results: reconResults,
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
