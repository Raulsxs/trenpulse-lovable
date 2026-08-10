// Cliente OpenRouter — camada unificada de IA (texto/agente por ora; imagem/vídeo nas fases P1/P2).
// A API de chat do OpenRouter fala formato OpenAI (tool_calls, role:"tool"). O ai-agent fala formato
// ANTHROPIC (content blocks, tool_use/tool_result). Este módulo TRADUZ os dois lados, então o loop do
// agente NÃO muda — só troca quem executa a chamada. Ganhos: tool-calling NATIVO (fim do remendo
// manual via Replicate), fallback entre modelos (Haiku→Gemini→Qwen) e custo USD real no usage.
//
// Ver docs/arquitetura/openrouter-multi-modelo.md (T01).

declare const Deno: { env: { get(k: string): string | undefined } };

const OR_URL = "https://openrouter.ai/api/v1/chat/completions";

// ── Tipos (formato Anthropic, que o ai-agent usa) ──
export type AnthropicBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: any }
  | { type: "tool_result"; tool_use_id: string; content: any; is_error?: boolean }
  | { type: "image"; source: { type: "url"; url: string } | { type: "base64"; media_type: string; data: string } };
export type AnthropicMsg = { role: "user" | "assistant"; content: string | AnthropicBlock[] };
export type AnthropicTool = { name: string; description?: string; input_schema: any };

// ── Tradução: ferramentas Anthropic → formato OpenAI ──
export function toOpenAITools(tools?: AnthropicTool[]): any[] | undefined {
  if (!tools?.length) return undefined;
  return tools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description || "", parameters: t.input_schema || { type: "object", properties: {} } },
  }));
}

// ── Tradução: histórico Anthropic → mensagens OpenAI ──
// Pontos delicados do loop de tools:
//  - assistant com tool_use  → {role:assistant, content, tool_calls:[{id,function:{name,arguments}}]}
//  - user com tool_result(s) → UMA mensagem {role:"tool", tool_call_id, content} POR resultado
//  - imagens                 → content parts {type:"image_url"}
export function toOpenAIMessages(system: string, messages: AnthropicMsg[]): any[] {
  const out: any[] = [];
  if (system) out.push({ role: "system", content: system });
  for (const m of messages) {
    if (typeof m.content === "string") { out.push({ role: m.role, content: m.content }); continue; }
    const blocks = m.content;

    if (m.role === "assistant") {
      const text = blocks.filter((b) => b.type === "text").map((b: any) => b.text).join("");
      const toolCalls = blocks.filter((b) => b.type === "tool_use").map((b: any) => ({
        id: b.id, type: "function", function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
      }));
      const msg: any = { role: "assistant", content: text || null };
      if (toolCalls.length) msg.tool_calls = toolCalls;
      out.push(msg);
      continue;
    }

    // role === user: separa tool_results (viram mensagens role:"tool") do resto (text/image).
    const toolResults = blocks.filter((b) => b.type === "tool_result") as any[];
    const nonTool = blocks.filter((b) => b.type !== "tool_result");
    if (nonTool.length) {
      const parts: any[] = [];
      for (const b of nonTool as any[]) {
        if (b.type === "text") parts.push({ type: "text", text: b.text });
        else if (b.type === "image") {
          const url = b.source?.type === "url" ? b.source.url : `data:${b.source.media_type};base64,${b.source.data}`;
          parts.push({ type: "image_url", image_url: { url } });
        }
      }
      // Se só tem texto, manda como string (mais compatível); senão manda parts.
      const onlyText = parts.every((p) => p.type === "text");
      out.push({ role: "user", content: onlyText ? parts.map((p) => p.text).join("\n") : parts });
    }
    for (const tr of toolResults) {
      const content = typeof tr.content === "string" ? tr.content
        : Array.isArray(tr.content) ? tr.content.map((x: any) => x.text || "").join(" ") : JSON.stringify(tr.content);
      out.push({ role: "tool", tool_call_id: tr.tool_use_id, content });
    }
  }
  return out;
}

// ── Tradução: resposta OpenAI → blocos Anthropic { content, stop_reason } ──
export function fromOpenAIResponse(choice: any): { content: AnthropicBlock[]; stop_reason: string } {
  const msg = choice?.message || {};
  const content: AnthropicBlock[] = [];
  if (msg.content && typeof msg.content === "string" && msg.content.trim()) content.push({ type: "text", text: msg.content });
  for (const tc of (msg.tool_calls || [])) {
    let input: any = {};
    try { input = JSON.parse(tc.function?.arguments || "{}"); } catch { input = {}; }
    content.push({ type: "tool_use", id: tc.id || ("call_" + Math.random().toString(36).slice(2)), name: tc.function?.name, input });
  }
  const stop = choice?.finish_reason === "tool_calls" || content.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn";
  if (!content.length) content.push({ type: "text", text: "" });
  return { content, stop_reason: stop };
}

// fetch com timeout duro (Prefer:wait não se aplica aqui, mas provider lento pode pendurar).
async function tfetch(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try { return await fetch(url, { ...init, signal: ac.signal }); }
  finally { clearTimeout(t); }
}

export interface OrChatResult {
  content: AnthropicBlock[];
  stop_reason: string;
  model: string;        // qual modelo da chain de fato respondeu
  usage: any;           // inclui usage.cost em USD real (insumo da telemetria de margem)
}

/**
 * Um turno de chat via OpenRouter, com tool-calling nativo e FALLBACK entre modelos.
 * Recebe/devolve no formato Anthropic (o loop do ai-agent não muda). Tenta cada modelo da
 * `modelChain` em ordem; em 429/5xx/timeout/erro de provedor, cai pro próximo.
 */
export async function orChat(opts: {
  system: string;
  messages: AnthropicMsg[];
  tools?: AnthropicTool[];
  modelChain: string[];
  maxTokens?: number;
  stream?: boolean;
  onText?: (delta: string) => void;
}): Promise<OrChatResult> {
  const key = Deno.env.get("OPENROUTER_API_KEY");
  if (!key) throw new Error("OPENROUTER_API_KEY ausente");
  const headers = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "https://trendpulse.com.br",
    "X-Title": "TrendPulse",
  };
  const messages = toOpenAIMessages(opts.system, opts.messages);
  const tools = toOpenAITools(opts.tools);
  const baseBody: any = { messages, max_tokens: opts.maxTokens || 2048, usage: { include: true } };
  if (tools) { baseBody.tools = tools; baseBody.tool_choice = "auto"; }

  let lastErr: any = null;
  for (const model of opts.modelChain) {
    try {
      if (opts.stream) {
        const r = await streamOne(model, baseBody, headers, opts.onText);
        return r;
      }
      // Não-streaming: fetch PURO (sem AbortController). No edge do Supabase, ler res.json() de uma
      // Response cujo fetch levou signal de AbortController dispara "stream controller cannot close or
      // enqueue". Lemos o corpo como texto e parseamos. O wall-clock do edge já limita o tempo.
      const res = await fetch(OR_URL, { method: "POST", headers, body: JSON.stringify({ ...baseBody, model }) });
      const raw = await res.text();
      if (!res.ok) {
        lastErr = new Error(`OpenRouter ${model} HTTP ${res.status}: ${raw.slice(0, 200)}`);
        console.warn(`[openrouter] ${model} HTTP ${res.status} — próximo da chain`);
        continue;
      }
      const data = JSON.parse(raw);
      const { content, stop_reason } = fromOpenAIResponse(data.choices?.[0]);
      return { content, stop_reason, model, usage: data.usage || null };
    } catch (e: any) {
      lastErr = e;
      console.warn(`[openrouter] ${model} exceção: ${e?.message} — próximo da chain`);
    }
  }
  throw lastErr || new Error("OpenRouter: toda a modelChain falhou");
}

// Streaming SSE (chat interativo). Acumula tool_calls e emite texto por onText.
async function streamOne(model: string, baseBody: any, headers: any, onText?: (d: string) => void): Promise<OrChatResult> {
  const res = await tfetch(OR_URL, { method: "POST", headers, body: JSON.stringify({ ...baseBody, model, stream: true }) }, 60000);
  if (!res.ok || !res.body) throw new Error(`OpenRouter ${model} stream HTTP ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", text = "";
  const toolAcc: Record<number, { id?: string; name?: string; args: string }> = {};
  let usage: any = null, finish = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") continue;
      let ev: any; try { ev = JSON.parse(payload); } catch { continue; }
      if (ev.usage) usage = ev.usage;
      const ch = ev.choices?.[0]; if (!ch) continue;
      if (ch.finish_reason) finish = ch.finish_reason;
      const d = ch.delta || {};
      if (d.content) { text += d.content; onText?.(d.content); }
      for (const tc of (d.tool_calls || [])) {
        const idx = tc.index ?? 0;
        toolAcc[idx] ||= { args: "" };
        if (tc.id) toolAcc[idx].id = tc.id;
        if (tc.function?.name) toolAcc[idx].name = tc.function.name;
        if (tc.function?.arguments) toolAcc[idx].args += tc.function.arguments;
      }
    }
  }
  const content: AnthropicBlock[] = [];
  if (text.trim()) content.push({ type: "text", text });
  for (const k of Object.keys(toolAcc)) {
    const t = toolAcc[+k];
    let input: any = {}; try { input = JSON.parse(t.args || "{}"); } catch { input = {}; }
    content.push({ type: "tool_use", id: t.id || ("call_" + k), name: t.name!, input });
  }
  if (!content.length) content.push({ type: "text", text: "" });
  const stop_reason = finish === "tool_calls" || content.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn";
  return { content, stop_reason, model, usage };
}

// Chain padrão do cérebro do agente: Haiku nativo (mesma qualidade de hoje) → Gemini Flash → Qwen.
// Ordem = qualidade/custo. Todos com tool-calling nativo (validados no catálogo OpenRouter).
export const AGENT_MODEL_CHAIN = [
  "anthropic/claude-haiku-4.5",
  "google/gemini-2.5-flash",
  "qwen/qwen3.5-flash-02-23",
];

// ── IMAGEM via Unified Image API do OpenRouter (T05) ──
// Endpoint /api/v1/images. Request: { model, prompt, aspect_ratio, input_references[] }.
// Resposta: { data:[{ b64_json, media_type }], usage:{ cost } }. A imagem volta em base64 (o mesmo
// formato data:image/...;base64 que o generate-slide-images já usa). Referências: OBJETOS
// { type:"image_url", image_url:{ url } } — o OpenRouter busca a URL (precisa ser pública direta).
const OR_IMAGES_URL = "https://openrouter.ai/api/v1/images";

// Mapa: modelo do app (seletor Econômico/Padrão/Premium) → slug OpenRouter.
// QUALIDADE pt-BR medida ao vivo (mesmo prompt, 3 modelos, 2026-07-31):
//   - gpt-image-2 (openai): texto pt-BR PERFEITO, 68s, $0.053 → margem ótima. PADRÃO.
//   - Nano Banana Pro (gemini-3-pro-image): pt-BR PERFEITO, 23s (rápido), $0.139 → premium.
//   - gemini-2.5-flash-image: RÁPIDO/barato mas ERRA pt-BR ("Lingulagem", "adotom") → NÃO usar p/ texto.
//   - seedream: econômico (pt-BR ~ok). O usuário aceita menos qualidade no tier barato.
export const OR_IMAGE_MODELS: Record<string, string> = {
  "seedream": "bytedance-seed/seedream-4.5",         // econômico
  "gpt-image-2": "openai/gpt-image-2",               // PADRÃO: texto pt-BR perfeito + melhor margem
  "nano-banana": "google/gemini-3-pro-image",        // premium: Nano Banana Pro, pt-BR perfeito + rápido + 9:16
  "flux": "black-forest-labs/flux.2-klein-4b",       // fotorrealismo barato
};
// Default seguro p/ pt-BR (texto perfeito). Velocidade ~68s é aceitável (Replicate gpt-image-2 era similar).
export const OR_IMAGE_DEFAULT = "openai/gpt-image-2";

export interface OrImageResult { dataUrl: string; usage: any; model: string }

/** Gera uma imagem via OpenRouter. Retorna data URL (base64) + usage.cost. Se a busca de uma
 *  referência falhar (URL não-pública/404), re-tenta SEM referências — melhor imagem sem estilo do
 *  que falhar o slide inteiro (e derrubar o carrossel). */
export async function orImage(opts: {
  model?: string; prompt: string; aspectRatio: string; refImages?: string[]; resolution?: string;
}): Promise<OrImageResult> {
  const key = Deno.env.get("OPENROUTER_API_KEY");
  if (!key) throw new Error("OPENROUTER_API_KEY ausente");
  const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "HTTP-Referer": "https://trendpulse.com.br", "X-Title": "TrendPulse" };
  const ar = ["1:1", "4:5", "9:16", "2:3", "3:2", "3:4", "4:3", "16:9"].includes(opts.aspectRatio) ? opts.aspectRatio : "1:1";
  // Guard de aspect (espelha resolveImageModel do generate-slide-images): o gpt-image-2 só suporta
  // 1:1/3:2/2:3 → em 4:5/9:16 ele degradaria a proporção. Nesses formatos VERTICAIS re-roteia pra
  // Nano Banana Pro (nativo), MESMO se o usuário selecionou gpt — pra não estragar a proporção. Em
  // 1:1 (post/carrossel) o seletor é honrado (gpt fica gpt).
  let appModel = opts.model;
  if (appModel === "gpt-image-2" && (ar === "4:5" || ar === "9:16")) {
    appModel = "nano-banana";
    console.warn(`[openrouter] gpt-image-2 degrada ${ar} — re-roteando pra nano-banana (proporção nativa)`);
  }
  const model = (appModel && OR_IMAGE_MODELS[appModel]) || appModel || OR_IMAGE_DEFAULT;
  const refs = (opts.refImages || []).filter((u) => typeof u === "string" && u.startsWith("http"));

  // Retry de falha TRANSITÓRIA (429 / 5xx / rede). Sem isto, um único slide que topasse com um
  // hiccup do provedor derrubava o slide inteiro — e o carrossel saía incompleto, o que na tela
  // parece "o produto está lento e falhando". Diferente do orChat, aqui NÃO há chain de modelos pra
  // cair: o usuário escolheu um modelo e trocá-lo mudaria o visual da peça. Então re-tentamos o mesmo.
  // 400/401/403 NÃO entram: são erro de requisição, e repetir só gasta tempo.
  const RETRY_DELAYS_MS = [1200, 3500];
  const isTransient = (msg: string) => /HTTP (429|5\d\d)/.test(msg) || /timeout|network|ECONN|socket/i.test(msg);

  const run = async (withRefs: boolean) => {
    const body: any = { model, prompt: opts.prompt, aspect_ratio: ar };
    // T05 — Resolução 2K nos modelos que SUPORTAM `resolution` (Nano Banana Pro / Seedream / FLUX) e
    // são rápidos → mais nitidez sem risco de timeout. Ganho maior em vertical (story em tela cheia).
    // gpt-image-2 NÃO tem `resolution` (só `quality`, e "high" arriscaria o 504 do carrossel) → default.
    // gemini-2.5-flash não expõe nenhum dos dois. Aspect 4:5/9:16 é onde 2K rende mais.
    if (/gemini-3-pro-image|gemini-3\.1-flash-image|seedream|flux/.test(model)) {
      body.resolution = opts.resolution || "2K";
    }
    if (withRefs && refs.length) body.input_references = refs.slice(0, 14).map((url) => ({ type: "image_url", image_url: { url } }));

    let lastErr: any = null;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        const res = await fetch(OR_IMAGES_URL, { method: "POST", headers, body: JSON.stringify(body) });
        const raw = await res.text();
        if (!res.ok) {
          const err: any = new Error(`OpenRouter image ${model} HTTP ${res.status}: ${raw.slice(0, 200)}`);
          // O servidor sabe melhor que nós quando voltar a tentar; se mandar Retry-After, obedecemos.
          const ra = Number(res.headers.get("retry-after"));
          if (Number.isFinite(ra) && ra > 0) err.retryAfterMs = Math.min(ra * 1000, 10000);
          throw err;
        }
        const data = JSON.parse(raw);
        const item = (data.data || [])[0];
        if (!item?.b64_json) throw new Error(`OpenRouter image ${model}: sem b64_json`);
        return { dataUrl: `data:${item.media_type || "image/png"};base64,${item.b64_json}`, usage: data.usage || null, model };
      } catch (e: any) {
        lastErr = e;
        const msg = String(e?.message || "");
        if (attempt === RETRY_DELAYS_MS.length || !isTransient(msg)) throw e;
        const wait = e?.retryAfterMs ?? RETRY_DELAYS_MS[attempt];
        console.warn(`[openrouter] image ${model} falha transitória (${msg.slice(0, 90)}) — re-tentando em ${wait}ms [${attempt + 1}/${RETRY_DELAYS_MS.length}]`);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
    throw lastErr;
  };

  try {
    return await run(true);
  } catch (e: any) {
    if (refs.length && /HTTP 400|fetching URL|Unsupported URL/i.test(String(e?.message))) {
      console.warn(`[openrouter] image ${model} falhou com refs (${String(e?.message).slice(0, 80)}) — re-tentando SEM referências`);
      return await run(false);
    }
    throw e;
  }
}
