/**
 * Telemetria de geração — grava o que aconteceu em cada chamada a provedor de IA.
 *
 * REGRA INVIOLÁVEL DESTE MÓDULO: **nunca derrubar nem atrasar uma geração.** Telemetria é
 * observabilidade, não funcionalidade. Por isso tudo aqui é fire-and-forget com try/catch mudo: se o
 * banco estiver fora, a peça do usuário continua saindo normalmente.
 *
 * Existe porque os logs do Supabase têm retenção curta demais para diagnosticar depois do fato — ao
 * investigar uma geração de 85s, os logs daquela execução já não existiam.
 *
 * ── POR QUE `fetch` PURO E NÃO O SDK ──────────────────────────────────────────────────────────
 * Este módulo já ficou mudo DUAS VEZES por causa do import do supabase-js, sempre em silêncio (o
 * catch mudo, que é a regra certa, escondia a falha):
 *
 *   1ª: `npm:@supabase/supabase-js@2` num especificador em VARIÁVEL. O deploy resolve dependências
 *       estaticamente e não enxerga o que só existe dentro de uma variável, então o pacote não
 *       entrava no bundle → "Could not find constraint '@supabase/supabase-js@2'".
 *   2ª: trocado por `https://esm.sh/@supabase/supabase-js@2`, mesma coisa por outro caminho →
 *       "Module not found: https://esm.sh/@supabase/supabase-js@2".
 *
 * A lição não é "achar o especificador certo" — é que **um INSERT não precisa de SDK**. O PostgREST
 * aceita um POST com o JSON da linha, e `fetch` é global no Deno: nada para resolver, nada para
 * empacotar, nada que possa sumir num deploy. Não reintroduza o cliente aqui.
 */

export interface TelemetryEvent {
  userId?: string | null;
  contentId?: string | null;
  jobId?: string | null;
  kind: "image" | "text";
  action?: string | null;      // post | carousel_slide | story | caption | structure…
  provider?: string | null;    // openrouter | replicate | inference
  model?: string | null;
  durationMs?: number | null;
  costUsd?: number | null;     // usage.cost do OpenRouter, quando vier
  status: "ok" | "error";
  statusCode?: number | null;  // HTTP do provedor: é aqui que um 429 aparece
  error?: string | null;
  attempt?: number;            // >1 = precisou de retry (mede instabilidade do provedor)
  metadata?: Record<string, unknown> | null;
}

/**
 * Grava um evento. NÃO dá await nisto no caminho quente — chame e siga.
 * NÃO precisa de `EdgeRuntime.waitUntil` no ponto de chamada — o `track` faz isso sozinho (veja
 * abaixo o porquê de a garantia morar aqui e não lá).
 */
async function escrever(e: TelemetryEvent): Promise<void> {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return;

    const linha = {
      user_id: e.userId ?? null,
      content_id: e.contentId ?? null,
      job_id: e.jobId ?? null,
      kind: e.kind,
      action: e.action ?? null,
      provider: e.provider ?? null,
      model: e.model ?? null,
      duration_ms: e.durationMs ?? null,
      cost_usd: e.costUsd ?? null,
      status: e.status,
      status_code: e.statusCode ?? null,
      // Erro truncado: mensagem de provedor às vezes vem com o corpo inteiro da resposta.
      error: e.error ? String(e.error).slice(0, 500) : null,
      attempt: e.attempt ?? 1,
      metadata: e.metadata ?? null,
    };

    // Timeout curto: telemetria não pode segurar o fim de uma edge function.
    const ac = new AbortController();
    const tm = setTimeout(() => ac.abort(), 5000);
    try {
      const res = await fetch(`${url}/rest/v1/generation_telemetry`, {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          // Sem representação de volta: economiza corpo de resposta que ninguém lê.
          Prefer: "return=minimal",
        },
        body: JSON.stringify(linha),
        signal: ac.signal,
      });
      // Ruidoso DE PROPÓSITO quando o insert é recusado. As duas vezes em que este módulo ficou mudo,
      // ficou mudo em silêncio por semanas — um aviso com o status teria custado uma tarde.
      if (!res.ok) {
        console.warn(`[telemetry] insert recusado HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      }
    } finally {
      clearTimeout(tm);
    }
  } catch (err) {
    // Silêncio proposital quanto a DERRUBAR: telemetria quebrada não pode virar erro pro usuário.
    console.warn("[telemetry] falhou (ignorado):", (err as Error)?.message);
  }
}

/**
 * Grava um evento sem bloquear o caminho quente.
 *
 * A GARANTIA MORA AQUI, E NÃO NO PONTO DE CHAMADA, de propósito. Fire-and-forget puro perde a escrita:
 * a edge function devolve a resposta, o isolate é derrubado, e o insert pendente morre junto. Era
 * exatamente o que acontecia — o caminho de SSE do ai-agent fecha o stream e o isolate encerra antes
 * de o insert chegar ao banco, então os turnos do agente não apareciam em lugar nenhum. O caminho
 * não-streaming escapava por acaso, porque a função ainda tinha trabalho depois.
 *
 * O comentário deste arquivo já dizia "use EdgeRuntime.waitUntil(track(...))" — e nenhum dos pontos
 * de chamada usava. Instrução que depende de alguém lembrar é instrução que vai ser esquecida; por
 * isso o waitUntil passou para dentro, onde vale para todo mundo de graça.
 *
 * `waitUntil` só existe no runtime do Supabase; em teste (Node/Vitest) ele não existe e a promessa
 * simplesmente roda solta, que ali é o comportamento certo.
 */
export function track(e: TelemetryEvent): void {
  const p = escrever(e);
  try {
    (globalThis as any).EdgeRuntime?.waitUntil?.(p);
  } catch {
    // Runtime sem waitUntil: a escrita segue solta. Nunca deixar isto derrubar uma geração.
  }
}

/** Extrai o HTTP status de uma mensagem de erro de provedor ("... HTTP 429: ..."). */
export function statusFromError(msg: string): number | null {
  const m = /HTTP (\d{3})/.exec(msg || "");
  return m ? Number(m[1]) : null;
}
