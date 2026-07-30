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
      const res = await tfetch(OR_URL, { method: "POST", headers, body: JSON.stringify({ ...baseBody, model }) }, 60000);
      if (!res.ok) {
        const txt = (await res.text()).slice(0, 200);
        lastErr = new Error(`OpenRouter ${model} HTTP ${res.status}: ${txt}`);
        if (res.status === 429 || res.status >= 500 || res.status === 402) { console.warn(`[openrouter] ${model} ${res.status} — próximo da chain`); continue; }
        // 4xx "de verdade" (400 payload) também tenta o próximo, mas loga distinto.
        console.warn(`[openrouter] ${model} ${res.status} (payload?) — próximo da chain`);
        continue;
      }
      const data = await res.json();
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
