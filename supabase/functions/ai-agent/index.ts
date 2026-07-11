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
    if (brands?.length) brandLines = "Marcas do usuário (apenas referência): " + brands.map((b: any) => b.name).join("; ") + ". A marca a aplicar é DEFINIDA PELO SELETOR do usuário (o app aplica automaticamente) — NÃO escolha marca por conta própria nem passe o campo brandId nas ferramentas de geração. Só mencione trocar de marca se o usuário pedir explicitamente pelo nome.";
  } catch { /* contexto é best-effort */ }

  return `Você é o assistente de criação de conteúdo do TrendPulse. Você NÃO é só um chat — você é o OPERADOR de social media do usuário: gera posts/carrosséis/stories/tweet cards no estilo da MARCA dele, agenda no calendário e publica nas redes. Esse é o seu diferencial sobre um chat genérico.

${ctxLine}
${brandLines}

COMO AGIR:
- Mapeie a necessidade e CHAME A FERRAMENTA certa. Não descreva o que faria — faça via tool.
- Para CRIAR conteúdo, passe o TEMA (assunto), nunca a instrução crua, e use a marca quando houver.
- Se o usuário nomear a REDE (LinkedIn, Instagram, TikTok, Facebook, X), passe SEMPRE o campo "plataforma" na ferramenta de geração — senão o conteúdo sai como Instagram e a legenda/formato ficam errados para a rede pedida.
- Se o usuário anexa a PRÓPRIA imagem já pronta (📎 nesta mensagem) e quer postá-la COMO ESTÁ (ex.: um certificado/diploma → post de conquista no LinkedIn, foto de evento, arte pronta), use postar_imagem_com_legenda — NÃO use gerar_post (que redesenha a imagem e distorce o certificado). Só use gerar_post quando ele quer que VOCÊ crie uma imagem nova.
- REAPROVEITAR o que VOCÊ já gerou nesta conversa: quando o usuário diz "transforme esse post em LinkedIn", "faz uma versão da última imagem pro LinkedIn/Instagram/X", "poste o que geramos no LinkedIn" — ele se refere ao conteúdo que VOCÊ acabou de gerar. Use **adaptar_para_rede** com o content_id (ele aparece como "content_id=..." nos resultados das ferramentas anteriores desta conversa — pegue o mais recente) e a plataforma alvo. Se NÃO houver content_id no histórico (ex.: conversa nova, mas ele diz "adapta a última imagem"), chame adaptar_para_rede SÓ com a plataforma — sem contentId — que ela usa a última geração dele automaticamente. Isso reusa a MESMA imagem e escreve nova legenda pra rede. ⚠️ NUNCA peça para o usuário anexar/re-enviar uma imagem que VOCÊ mesmo gerou — ela já existe (postar_imagem_com_legenda é SÓ para imagem que o usuário anexou agora). Se quiser MUDAR a imagem (texto maior, outras cores), aí é editar_conteudo.
- Se o usuário quer EDITAR uma foto mas NÃO anexou nenhuma foto nesta mensagem, NÃO invente: peça que ele anexe a foto (📎). Nunca transforme uma instrução de edição em manchete de post.
- Fotos anexadas (2+) + pedido de carrossel → use gerar_carrossel_editorial (elas viram o fundo).
- Modelo de imagem selecionado agora: **${model}**. Se o usuário perguntar qual modelo, responda exatamente este. Ele pode trocar no seletor do chat. Se ele pedir um modelo específico (reve, ideogram, gpt-image, seedream, nano…), passe no campo "modelo" da ferramenta.
- MUDAR SÓ A LEGENDA/TEXTO (ex.: "muda a legenda", "reescreve o texto", "a legenda deveria falar de X", "muda o ângulo", "legenda mais curta"): use **editar_legenda** — barato, NÃO mexe na imagem. ⚠️ NÃO use editar_conteudo pra isso: editar_conteudo REGENERA A IMAGEM (gasta crédito e pode estragar uma imagem boa). editar_conteudo é só quando ele quer mudar A IMAGEM (texto na arte, fonte, cores, refazer o visual).
- editar_conteudo regenera a peça PRINCIPAL (a IMAGEM) — NÃO edita nem remove slides individuais de um carrossel. Se o usuário quer mexer em UM slide específico, diga que a edição por-slide ainda não está disponível por aqui (em breve) e ofereça refazer.
- SEMPRE aja via ferramenta: toda geração/edição mostra um CARD de preview no chat porque a FERRAMENTA o produz. NUNCA diga "pronto, regenerei/mudei a legenda/imagem" sem ter CHAMADO a ferramenta correspondente no mesmo turno — sem tool não há card e o usuário não vê nada acontecer. Se vai afirmar que algo mudou, chame a tool que muda.
- Se o usuário pede pra VER/receber um conteúdo já feito ("me envia o conteúdo", "cadê o card/post", "mostra o último"), use **mostrar_conteudo** (custo zero) — ela reexibe o card no chat. NÃO regenere nada só pra mostrar.
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

  // Texto limpo do turno novo do usuário — capturado ANTES da injeção de visão (que reescreve o
  // content do último turno). Usado no log de auditoria.
  const incomingUserText = typeof body.message === "string" && body.message
    ? body.message
    : (() => {
        const src = Array.isArray(body.messages) ? body.messages : [];
        for (let i = src.length - 1; i >= 0; i--) {
          if (src[i].role === "user") {
            const c = src[i].content;
            return typeof c === "string" ? c
              : Array.isArray(c) ? c.filter((p: any) => p.type === "text").map((p: any) => p.text).join("\n") : "";
          }
        }
        return "";
      })();

  // VISÃO: as imagens anexadas viram blocos de imagem no turno do usuário para o Claude ENXERGAR
  // o conteúdo delas (Haiku 4.5 é multimodal). Antes o agente era text-only e "não via a imagem"
  // (caso Maikon: mandou infográfico de skills de IA + pediu p/ saúde; sem ver a imagem, a IA leu só
  // "skills para saúde" e gerou soft-skills de médico, perdendo que o tema era skills de IA). Agora ele
  // vê a referência e entende o pedido. As imagens também seguem em ctx.pendingImageUrls p/ as tools
  // usarem como referência de estilo na geração.
  const attachedImgs = (ctx.pendingImageUrls || []).filter((u) => typeof u === "string" && u.startsWith("http"));
  if (attachedImgs.length) {
    const note = `[SISTEMA: as ${attachedImgs.length} imagem(ns) acima foram anexadas pelo usuário. ANALISE o conteúdo delas para entender o pedido (tema, estilo, o que recriar). Elas também ficam disponíveis como referência para as ferramentas de geração/edição — passe um TEMA claro. Se o assunto continuar ambíguo mesmo vendo a imagem, PERGUNTE antes de gerar.]`;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        const orig = messages[i].content;
        const origText = typeof orig === "string"
          ? orig
          : Array.isArray(orig) ? orig.filter((p: any) => p.type === "text").map((p: any) => p.text).join("\n") : "";
        messages[i].content = [
          ...(origText ? [{ type: "text", text: origText }] : []),
          ...attachedImgs.map((url) => ({ type: "image", source: { type: "url", url } })),
          { type: "text", text: note },
        ];
        break;
      }
    }
  }

  // Auditoria: persiste cada turno do agente (o /agent guarda a conversa só no localStorage do
  // navegador; sem isto o dono não consegue auditar o que os clientes em teste fazem). Escrita via
  // service_role (ignora RLS). Fire-and-forget: se falhar, loga e segue — nunca derruba o stream.
  const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const svcLog = svcKey ? createClient(supabaseUrl, svcKey) : null;
  const logTurn = async (role: string, content: string, toolCalls: any = null, imageCount = 0) => {
    if (!svcLog) return;
    try {
      await svcLog.from("agent_message_log").insert({
        user_id: user.id, role, content: (content || "").slice(0, 20000),
        tool_calls: toolCalls, image_count: imageCount,
      });
    } catch (e: any) { console.warn("[ai-agent] log falhou:", e?.message); }
  };

  const anthropic = new Anthropic({ apiKey: anthropicKey });
  const system = await buildSystemPrompt(userClient, selectedModel);
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Auditoria: registra o turno do usuário (menos no resume de confirmação, que não traz msg nova).
        if (!body.confirm?.tool_use_id && incomingUserText) {
          await logTurn("user", incomingUserText, null, attachedImgs.length);
        }
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

          // Auditoria: texto da resposta + ferramentas chamadas neste round.
          {
            const asstText = final.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
            const calls = final.content.filter((b: any) => b.type === "tool_use").map((b: any) => ({ name: b.name, input: b.input }));
            await logTurn("assistant", asstText, calls.length ? calls : null, 0);
          }

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
