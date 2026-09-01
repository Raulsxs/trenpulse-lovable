// O import do supabase-js é DINÂMICO de propósito. Este módulo é importado pelo openrouter.ts, que
// por sua vez é coberto por teste unitário rodando em Vitest (Node) — e Node não resolve o
// especificador `npm:` do Deno. Carregando só na primeira escrita, o teste do openrouter continua
// passando e a telemetria segue funcionando no runtime Deno.
type SupabaseLike = { from: (t: string) => { insert: (v: unknown) => Promise<unknown> } };

/**
 * Telemetria de geração — grava o que aconteceu em cada chamada a provedor de IA.
 *
 * REGRA INVIOLÁVEL DESTE MÓDULO: **nunca derrubar nem atrasar uma geração.** Telemetria é
 * observabilidade, não funcionalidade. Por isso tudo aqui é fire-and-forget com try/catch mudo: se o
 * banco estiver fora, a peça do usuário continua saindo normalmente.
 *
 * Existe porque os logs do Supabase têm retenção curta demais para diagnosticar depois do fato — ao
 * investigar uma geração de 85s, os logs daquela execução já não existiam.
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

let client: SupabaseLike | null = null;
async function svc(): Promise<SupabaseLike | null> {
  if (client) return client;
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  // Especificador em variável + @vite-ignore: sem isso o Vite tenta resolver em tempo de build
  // (ele analisa até import dinâmico) e derruba o teste unitário do openrouter, que roda em Node.
  //
  // URL, NÃO `npm:`. Com "npm:@supabase/supabase-js@2" o runtime deployado falhava em TODA escrita:
  //   [telemetry] falhou (ignorado): Could not find constraint '@supabase/supabase-js@2'
  //     in the list of packages.
  // O deploy resolve dependências estaticamente, e um especificador `npm:` que só existe dentro de
  // uma variável não é visto — o pacote não entra no bundle. Import por URL o Deno resolve em
  // runtime, sem depender do bundler. É o mesmo especificador que as outras funções já usam.
  const spec = "https://esm.sh/@supabase/supabase-js@2";
  const { createClient } = await import(/* @vite-ignore */ spec);
  client = createClient(url, key) as unknown as SupabaseLike;
  return client;
}

/**
 * Grava um evento. NÃO dá await nisto no caminho quente — chame e siga.
 * (Em edge function, use `EdgeRuntime.waitUntil(track(...))` se quiser garantir a escrita sem
 * bloquear a resposta.)
 */
export async function track(e: TelemetryEvent): Promise<void> {
  try {
    const c = await svc();
    if (!c) return;
    // cast: a tabela é nova e ainda não está nos tipos gerados do projeto (mesmo padrão de user_credits).
    await (c as any).from("generation_telemetry").insert({
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
    });
  } catch (err) {
    // Silêncio proposital: telemetria quebrada não pode virar erro visível pro usuário.
    console.warn("[telemetry] falhou (ignorado):", (err as Error)?.message);
  }
}

/** Extrai o HTTP status de uma mensagem de erro de provedor ("... HTTP 429: ..."). */
export function statusFromError(msg: string): number | null {
  const m = /HTTP (\d{3})/.exec(msg || "");
  return m ? Number(m[1]) : null;
}
