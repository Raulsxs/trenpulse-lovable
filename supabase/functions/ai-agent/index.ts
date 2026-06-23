// ai-agent — orquestrador agêntico (Claude Haiku 4.5, tool-calling + streaming SSE).
// Substitui o "adivinhar intenção" do ai-chat: o LLM PROPÕE tool calls, este harness VALIDA,
// faz GATING (confirmação antes de publicar/agendar) e EXECUTA via as edge functions atuais.
// Loop MANUAL (não tool_runner) porque precisamos de human-in-the-loop nos tools gated.
//
// Stream SSE de eventos: text | tool_start | tool_done | action_result | confirm_request | done | error
// Resume pós-confirmação: o cliente re-chama com { messages, confirm: {tool_use_id,name,input,approved} }.
import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";
import { AGENT_TOOLS, GATED_TOOLS, CONFIRM_CREDIT_THRESHOLD, estimateToolCost, dispatchTool, type ToolCtx } from "../_shared/agent-tools.ts";

const MODEL = "claude-haiku-4-5";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function buildSystemPrompt(userClient: any, model: string): Promise<string> {
  let ctxLine = "", brandLines = "";
  try {
    const { data: ctx } = await userClient.from("ai_user_context").select("business_niche, brand_voice, content_topics, instagram_handle").maybeSingle();
    if (ctx) ctxLine = `Perfil do usuário — nicho: ${ctx.business_niche || "?"}; tom: ${ctx.brand_voice || "?"}; @: ${ctx.instagram_handle || "?"}; temas: ${(ctx.content_topics || []).join(", ") || "?"}.`;
    const { data: brands } = await userClient.from("brands").select("id, name, creation_mode").limit(10);
    if (brands?.length) brandLines = "Marcas do usuário (use o id em brandId): " + brands.map((b: any) => `${b.name}=${b.id}`).join("; ") + ".";
  } catch { /* contexto é best-effort */ }

  return `Você é o assistente de criação de conteúdo do TrendPulse. Você NÃO é só um chat — você é o OPERADOR de social media do usuário: gera posts/carrosséis/stories/tweet cards no estilo da MARCA dele, agenda no calendário e publica nas redes. Esse é o seu diferencial sobre um chat genérico.

${ctxLine}
${brandLines}

COMO AGIR:
- Mapeie a necessidade e CHAME A FERRAMENTA certa. Não descreva o que faria — faça via tool.
- Para CRIAR conteúdo, passe o TEMA (assunto), nunca a instrução crua, e use a marca quando houver.
- Se o usuário quer EDITAR uma foto mas NÃO anexou nenhuma foto nesta mensagem, NÃO invente: peça que ele anexe a foto (📎). Nunca transforme uma instrução de edição em manchete de post.
- Fotos anexadas (2+) + pedido de carrossel → use gerar_carrossel_editorial (elas viram o fundo).
- Modelo de imagem selecionado agora: **${model}**. Se o usuário perguntar qual modelo, responda exatamente este. Ele pode trocar no seletor do chat. Se ele pedir um modelo específico (reve, ideogram, gpt-image, seedream, nano…), passe no campo "modelo" da ferramenta.
- editar_conteudo regenera a peça PRINCIPAL — NÃO edita nem remove slides individuais de um carrossel. Se o usuário quer mexer em UM slide específico, diga que a edição por-slide ainda não está disponível por aqui (em breve) e ofereça refazer.
- Depois de gerar, confirme em 1 frase e ofereça publicar ou agendar. NÃO repita todo o conteúdo no texto (o preview já aparece).
- PUBLICAR e AGENDAR são confirmados pelo usuário automaticamente pelo app — apenas chame a ferramenta com o content_id; o app cuida da confirmação.
- Antes de publicar, se o usuário não tiver nenhuma rede social conectada (cheque com listar_conexoes), oriente-o a conectar em Perfil → Conexões antes de tentar publicar.
- Português do Brasil, direto e gentil. Só palavras reais e bem grafadas.

EXPECTATIVA REALISTA: a IA é ótima em design, texto curto, fundo, carrossel; é arriscada em montagem fotorrealista complexa (objeto novo na mão de alguém) e em melhorar foto muito ruim — nesses casos, avise o usuário.`;
}

function sse(controller: ReadableStreamDefaultController, enc: TextEncoder, event: Record<string, unknown>) {
  controller.enqueue(enc.encode(`data: ${JSON.stringify(event)}\n\n`));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicKey) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY não configurada" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Invalid JWT" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const body = await req.json().catch(() => ({}));
  // messages: array no formato Anthropic (o cliente mantém a conversa entre turns).
  // Aceita também {message, history} no 1º turn por conveniência.
  let messages: any[] = Array.isArray(body.messages) ? body.messages : [];
  if (!messages.length && body.message) {
    messages = [{ role: "user", content: body.message }];
  }
  const selectedModel = typeof body.model === "string" && body.model ? body.model : "gpt-image-2";
  const ctx: ToolCtx = {
    supabaseUrl, anonKey, userAuthHeader: authHeader, userClient,
    anthropicKey,
    userId: user.id,
    defaultBrandId: body.brandId ?? null,
    defaultModel: selectedModel,
    pendingImageUrls: Array.isArray(body.imageUrls) ? body.imageUrls : [],
  };

  const anthropic = new Anthropic({ apiKey: anthropicKey });
  const system = await buildSystemPrompt(userClient, selectedModel);
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Resume pós-confirmação: executa (ou cancela) o tool gated e segue o loop.
        if (body.confirm?.tool_use_id) {
          const c = body.confirm;
          let resultText: string, ar: any = undefined;
          if (c.approved) {
            sse(controller, enc, { type: "tool_start", name: c.name });
            const r = await dispatchTool(ctx, c.name, c.input);
            resultText = r.content; ar = r.action_result;
            sse(controller, enc, { type: "tool_done", name: c.name, ok: r.ok });
          } else {
            resultText = "O usuário CANCELOU esta ação. Não tente de novo; pergunte se ele quer outra coisa.";
            sse(controller, enc, { type: "tool_done", name: c.name, ok: false, cancelled: true });
          }
          if (ar) sse(controller, enc, { type: "action_result", action_result: ar });
          messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: c.tool_use_id, content: resultText }] });
        }

        // Loop manual de tool-use (cap de 8 rodadas).
        for (let round = 0; round < 8; round++) {
          const msgStream = anthropic.messages.stream({
            model: MODEL, max_tokens: 2048, system, tools: AGENT_TOOLS as any, messages,
          });
          msgStream.on("text", (delta: string) => sse(controller, enc, { type: "text", delta }));
          const final = await msgStream.finalMessage();
          messages.push({ role: "assistant", content: final.content });

          const toolUses = final.content.filter((b: any) => b.type === "tool_use");
          if (final.stop_reason !== "tool_use" || toolUses.length === 0) {
            sse(controller, enc, { type: "done", messages });
            controller.close();
            return;
          }

          const toolResults: any[] = [];
          for (const tu of toolUses as any[]) {
            const cost = estimateToolCost(tu.name, tu.input);
            if (GATED_TOOLS.has(tu.name) || cost > CONFIRM_CREDIT_THRESHOLD) {
              // Pausa: pede confirmação (ação irreversível OU custo alto). O cliente reenvia messages + confirm.
              sse(controller, enc, {
                type: "confirm_request",
                tool_use_id: tu.id, name: tu.name, input: tu.input, cost,
                assistant_content: final.content,
                messages,
              });
              sse(controller, enc, { type: "paused" });
              controller.close();
              return;
            }
            sse(controller, enc, { type: "tool_start", name: tu.name });
            let r;
            try { r = await dispatchTool(ctx, tu.name, tu.input); }
            catch (e: any) { r = { ok: false, content: `Erro na ferramenta: ${e?.message || e}` }; }
            if (r.action_result) sse(controller, enc, { type: "action_result", action_result: r.action_result });
            sse(controller, enc, { type: "tool_done", name: tu.name, ok: r.ok });
            toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: r.content, is_error: !r.ok });
          }
          messages.push({ role: "user", content: toolResults });
        }
        sse(controller, enc, { type: "done", note: "limite de rodadas", messages });
        controller.close();
      } catch (e: any) {
        sse(controller, enc, { type: "error", error: e?.message || String(e) });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
});
