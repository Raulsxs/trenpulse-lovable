// Worker da FILA de gerações. Processa os jobs 'queued' de um usuário UM POR VEZ (baixo consumo),
// chamando o ai-agent em modo headless. O status vai pra 'processing' no claim (o painel lateral vê
// ao vivo via realtime) e vira 'done'/'failed'/'needs_review' no fim.
//
// Como é disparado:
//   - KICK do front: o app chama isto com o JWT do próprio usuário logo após enfileirar. Processa a
//     fila dele no servidor — mesmo que ele feche a aba depois do kick, o worker segue até o budget.
//   - CRON (rede de segurança): chamado com a service key; varre usuários com jobs 'queued' e minta
//     um JWT por usuário (o ai-agent precisa de JWT de usuário pro getUser + tools).
//
// Se sobrar job na fila ao fim do budget, o worker RE-INVOCA a si mesmo (encadeia) até esvaziar.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// UM job por invocação: a edge tem wall-clock (~150-400s) e 2 gerações em sequência (~4min) estouram
// e MATAM a função no meio do 2º job (deixando-o órfão em 'processing'). Processando 1 por invocação
// (~2min) e RE-ENCADEANDO (chainSelf) até esvaziar, cada invocação fica curta e segura. O reaper na
// claim_next_job recupera jobs órfãos de um worker morto.

const admin = createClient(SUPABASE_URL, SERVICE);

// Minta um JWT de usuário (fluxo admin generate_link → verify), sem enviar e-mail. Necessário só no
// caminho CRON (o kick já traz o JWT do usuário). O ai-agent roda getUser + as tools autenticam como
// o usuário, então o worker precisa agir COMO ele.
async function mintUserJwt(userId: string): Promise<string | null> {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data?.user?.email) return null;
  const link = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", email: data.user.email }),
  }).then((r) => r.json()).catch(() => null);
  const hash = link?.hashed_token;
  if (!hash) return null;
  const verify = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", token_hash: hash }),
  }).then((r) => r.json()).catch(() => null);
  return verify?.access_token || null;
}

// Chama o ai-agent headless COMO o usuário (JWT dele). Devolve { content_id, needs_review, text }.
async function runAgentHeadless(userJwt: string, job: any): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-agent`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${userJwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: job.prompt,
      headless: true,
      brandId: job.brand_id || undefined,
      model: job.model || undefined,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `ai-agent ${res.status}`);
  return data;
}

// Processa UM job do usuário (o próximo da fila). Retorna quantos jobs 'queued' ainda restam depois
// (o handler usa isso pra decidir se re-encadeia). Processar só 1 mantém a invocação curta.
async function processOne(userId: string, userJwt: string): Promise<number> {
  // Pega, recupera órfãos e trava o próximo job (atômico; reaper embutido na RPC).
  const { data: job, error } = await admin.rpc("claim_next_job", { p_user: userId });
  if (error) { console.error(`[jobs] claim erro user=${userId}: ${error.message}`); return 0; }

  if (job) {
    console.log(`[jobs] processando job=${job.id} user=${userId} prompt="${String(job.prompt).slice(0, 60)}"`);
    try {
      const r = await runAgentHeadless(userJwt, job);
      if (r.needs_review) {
        await admin.from("generation_jobs").update({
          status: "needs_review", resume: r.needs_review, finished_at: new Date().toISOString(),
          error: `Requer confirmação: ${r.needs_review.name}`,
        }).eq("id", job.id);
        console.log(`[jobs] job=${job.id} → needs_review (${r.needs_review.name})`);
      } else if (r.content_id) {
        await admin.from("generation_jobs").update({
          status: "done", content_id: r.content_id, finished_at: new Date().toISOString(), error: null,
        }).eq("id", job.id);
        console.log(`[jobs] job=${job.id} → done (content=${r.content_id})`);
      } else {
        // Rodou mas não gerou conteúdo (ex.: o agente só conversou / pediu esclarecimento).
        await admin.from("generation_jobs").update({
          status: "failed", finished_at: new Date().toISOString(),
          error: (r.text || "Não gerou conteúdo — reformule o pedido.").slice(0, 500),
        }).eq("id", job.id);
        console.log(`[jobs] job=${job.id} → failed (sem content_id)`);
      }
    } catch (e: any) {
      await admin.from("generation_jobs").update({
        status: "failed", finished_at: new Date().toISOString(), error: String(e?.message || e).slice(0, 500),
      }).eq("id", job.id);
      console.error(`[jobs] job=${job.id} → failed: ${e?.message}`);
    }
  }
  // Quantos ainda restam 'queued' pra esse usuário?
  const { count } = await admin.from("generation_jobs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId).eq("status", "queued");
  return count || 0;
}

// Re-invoca o worker (fire-and-forget) pra continuar a fila numa nova invocação (encadeia além do budget).
function chainSelf(authHeader: string, userId?: string) {
  fetch(`${SUPABASE_URL}/functions/v1/process-generation-jobs`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: authHeader, "Content-Type": "application/json" },
    body: JSON.stringify(userId ? { userId } : {}),
  }).catch(() => {}); // não espera
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return json({ error: "Unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const isInternal = token === SERVICE;

  try {
    // ── CAMINHO CRON/INTERNO (service key) ──
    if (isInternal) {
      // Alvo: um usuário específico (re-chain) ou TODOS com jobs na fila (varredura do cron).
      let userIds: string[];
      if (body.userId) {
        userIds = [body.userId];
      } else {
        const { data } = await admin.from("generation_jobs").select("user_id").eq("status", "queued");
        userIds = [...new Set((data || []).map((r: any) => r.user_id))];
      }
      let processed = 0;
      for (const uid of userIds) {
        const jwt = await mintUserJwt(uid);
        if (!jwt) { console.warn(`[jobs] não mintou JWT p/ user=${uid}`); continue; }
        const remaining = await processOne(uid, jwt); // 1 job por usuário por invocação
        processed++;
        if (remaining > 0) chainSelf(authHeader, uid); // continua esse usuário noutra invocação
      }
      return json({ ok: true, mode: "internal", users: userIds.length, processed });
    }

    // ── CAMINHO KICK (JWT do usuário, vindo do front) ──
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Invalid JWT" }, 401);

    const remaining = await processOne(user.id, token); // 1 job por invocação
    if (remaining > 0) chainSelf(authHeader); // ainda tem fila → encadeia
    return json({ ok: true, mode: "kick", user: user.id, remaining });
  } catch (e: any) {
    console.error(`[jobs] erro geral: ${e?.message}`);
    return json({ error: e?.message || String(e) }, 500);
  }
});
