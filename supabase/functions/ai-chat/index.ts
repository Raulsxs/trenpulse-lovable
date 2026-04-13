import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchAI } from "../_shared/ai-gateway.ts";

// ══════════════════════════════════════════════════════════════════════════════
// TrendPulse AI Chat — Simplified (~1500 lines)
//
// Intents:
//   GENERATE          — single post/story image
//   GENERATE_CAROUSEL — multi-slide carousel/document
//   EDIT_CONTENT      — edit existing content (text or image)
//   CRIAR_MARCA       — brand creation wizard (preserved)
//   CRIAR_MARCA_ANALYZE — brand analysis (preserved)
//   ATUALIZAR_PERFIL  — update user profile
//   CHAT              — free conversation
// ══════════════════════════════════════════════════════════════════════════════

// Compatibility wrapper — uses centralized AI gateway (inference.sh > Google > Lovable)
// Returns a Response so all existing callers (.ok, .json()) work unchanged
async function aiGatewayFetch(body: Record<string, unknown>): Promise<Response> {
  try {
    const result = await fetchAI(body as any);
    return new Response(JSON.stringify({ choices: result.choices }), {
      status: result.ok ? 200 : (result.status || 500),
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[aiGatewayFetch] Exception:", err?.message || err);
    return new Response(JSON.stringify({ choices: [{ message: { content: "" } }], error: err?.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const INTENTS = [
  "GENERATE_TEMPLATE",
  "GENERATE",
  "GENERATE_CAROUSEL",
  "EDIT_CONTENT",
  "CRIAR_MARCA",
  "CRIAR_MARCA_ANALYZE",
  "ATUALIZAR_PERFIL",
  "LINK_PARA_POST",
  "CHAT",
] as const;

// ── Helper: detect platform from message ──
function detectPlatform(msg: string): string {
  if (/linkedin/i.test(msg)) return "linkedin";
  return "instagram";
}

// ── Helper: detect format from message ──
function detectFormat(msg: string): string {
  if (/story|stories/i.test(msg)) return "story";
  if (/carrossel|carousel|slides|documento|document/i.test(msg)) return "carousel";
  return "post";
}

// ── Helper: detect if message is a quote/phrase request ──
function detectContentStyle(msg: string): string | null {
  if (/\b(frase|citação|citacao|quote|imagem com a frase|imagem com frase|frase inspiracional|frase motivacional)\b/i.test(msg)) return "quote";
  return null;
}

// ── Helper: detect if message should use a Blotato template ──
interface BlotataTemplateMatch {
  templateKey: string;
  templateType: "tweet" | "tutorial" | "quote" | "infographic" | "video" | "product" | "before-after";
}

function detectBlotataTemplate(msg: string): BlotataTemplateMatch | null {
  const m = msg.toLowerCase();
  // Tweet card
  if (/\b(tweet\s*card|card\s*de\s*tweet|tweet\s*visual|visual\s*de\s*tweet|estilo\s*tweet|estilo\s*twitter)\b/.test(m)) {
    const hasPhoto = /\b(com\s+foto|foto\s+de\s+fundo|background|com\s+imagem)\b/.test(m);
    return { templateKey: hasPhoto ? "tweet-photo" : "tweet-minimal", templateType: "tweet" };
  }
  // Tutorial carousel
  if (/\b(carrossel\s+tutorial|tutorial.*passo\s*a\s*passo|passo\s*a\s*passo.*slides|carousel\s+tutorial)\b/.test(m)) {
    return { templateKey: "tutorial-monocolor", templateType: "tutorial" };
  }
  // Quote card
  if (/\b(quote\s*card|card\s*de\s*(frase|cita[çc][aã]o)|cita[çc][aã]o\s*visual)\b/.test(m)) {
    return { templateKey: "quote-paper", templateType: "quote" };
  }
  // Infographic
  if (/\b(infogr[aá]fico|infographic)\b/.test(m)) {
    return { templateKey: "infographic-newspaper", templateType: "infographic" };
  }
  // Video / Reels
  if (/\b(v[ií]deo\s*reels|reels|v[ií]deo\s*IA|v[ií]deo\s*para\s*(instagram|tiktok|reels)|crie\s*um\s*v[ií]deo)\b/.test(m)) {
    return { templateKey: "video-story", templateType: "video" };
  }
  // Product placement
  if (/\b(product\s*placement|produto\s*(em|no|na)\s*(cen[aá]rio|ambiente|contexto)|coloque\s*(meu|o)\s*produto|foto\s*do\s*produto)\b/.test(m)) {
    return { templateKey: "product-placement", templateType: "product" };
  }
  // Before/After comparison
  if (/\b(antes\s*e?\s*depois|before.*after|compara[çc][aã]o|antes\s*vs|antes\s*x\s*depois)\b/.test(m)) {
    return { templateKey: "before-after", templateType: "before-after" };
  }
  return null;
}

// ── Helper: extract phrase text from a "frase" message ──
function extractPhrase(msg: string): string {
  // "Crie uma imagem com a frase: X" → X
  const match = msg.match(/(?:frase[:\s]+|com\s+a\s+frase[:\s]+|imagem\s+com\s+a\s+frase[:\s]+)(.+)/i);
  if (match?.[1]) return match[1].replace(/^["'"']|["'"']$/g, "").trim();
  return msg;
}

// ── Helper: extract visual context from a "frase" message (e.g. "aspectos de X") ──
function extractVisualContext(msg: string): string {
  // "com aspectos de X com a frase" → X
  const match = msg.match(/(?:com\s+)?aspectos?\s+de\s+([^,]+?)(?:\s+com\s+a\s+frase|\s+frase)/i);
  if (match?.[1]) return match[1].trim();
  // "imagem de X com a frase" → X
  const match2 = msg.match(/imagem\s+(?:de|sobre|com)\s+([^,]+?)\s+com\s+a\s+frase/i);
  if (match2?.[1]) return match2[1].trim();
  return "";
}

// ── Helper: get content dimensions ──
function getContentDimensions(platform: string, format: string): { w: number; h: number } {
  if (platform === "linkedin") {
    if (format === "document") return { w: 1080, h: 1350 };
    return { w: 1200, h: 1200 };
  }
  if (format === "story") return { w: 1080, h: 1920 };
  return { w: 1080, h: 1080 };
}

// ══════════════════════════════════════════════════════════════════════════════
// Main handler
// ══════════════════════════════════════════════════════════════════════════════

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      message,
      history,
      intent_hint,
      url,
      generationParams,
      imageUrls,
      brandId: requestBrandId,
      platform: requestPlatform,
      format: requestFormat,
      contentId,
      editInstruction,
    } = await req.json();

    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY") || Deno.env.get("INFERENCE_SH_API_KEY") || Deno.env.get("GOOGLE_AI_API_KEY");
    if (!lovableApiKey) throw new Error("No AI API key configured (INFERENCE_SH_API_KEY, GOOGLE_AI_API_KEY, or LOVABLE_API_KEY)");
    if (!message) throw new Error("message is required");

    // ── Auth ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const internalServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const internalHeaders = {
      Authorization: `Bearer ${internalServiceKey}`,
      "Content-Type": "application/json",
      apikey: supabaseAnonKey,
    };

    // User-scoped client (for RLS)
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Service-role client (for internal operations)
    const svc = createClient(supabaseUrl, internalServiceKey);

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized", message: "Invalid JWT" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = user.id;

    // ── persistGeneratedContent helper ──
    const persistGeneratedContent = async ({
      generatedContent,
      fallbackTitle,
      contentType,
      brandId,
      templateSetId,
      visualMode,
      brandSnapshot,
      platform,
    }: {
      generatedContent: any;
      fallbackTitle: string;
      contentType: "post" | "carousel" | "story" | "document" | "article";
      brandId?: string | null;
      templateSetId?: string | null;
      visualMode?: string | null;
      brandSnapshot?: Record<string, any> | null;
      platform?: string | null;
    }) => {
      const buildPayload = (safeTemplateSetId: string | null) => ({
        user_id: userId,
        title: generatedContent?.title || fallbackTitle,
        content_type: contentType,
        caption: generatedContent?.caption || null,
        hashtags: Array.isArray(generatedContent?.hashtags) ? generatedContent.hashtags : null,
        slides: generatedContent?.slides || [],
        status: "draft",
        platform: platform || generatedContent?.platform || "instagram",
        visual_mode: generatedContent?.visualMode || visualMode || "ai_full_design",
        brand_id: brandId || null,
        brand_snapshot: brandSnapshot || null,
        template_set_id: safeTemplateSetId,
        slide_count: Array.isArray(generatedContent?.slides) ? generatedContent.slides.length : null,
        include_cta: typeof generatedContent?.includeCta === "boolean" ? generatedContent.includeCta : true,
        source_summary: generatedContent?.sourceSummary || null,
        key_insights: Array.isArray(generatedContent?.keyInsights) ? generatedContent.keyInsights : null,
        platform_captions: generatedContent?.platformCaptions || null,
      });

      const requestedTemplateSetId = typeof templateSetId === "string" && templateSetId.trim()
        ? templateSetId
        : null;

      let { data: inserted, error: insertErr } = await supabase
        .from("generated_contents")
        .insert(buildPayload(requestedTemplateSetId))
        .select("id")
        .maybeSingle();

      if (insertErr?.code === "23503" && requestedTemplateSetId) {
        console.warn(
          "[ai-chat] template_set_id inválido ao persistir conteúdo, salvando com template_set_id=null:",
          requestedTemplateSetId,
        );

        const retry = await supabase
          .from("generated_contents")
          .insert(buildPayload(null))
          .select("id")
          .maybeSingle();

        inserted = retry.data;
        insertErr = retry.error;
      }

      if (insertErr) {
        console.error("[ai-chat] Error persisting generated content:", insertErr);
        return null;
      }

      return inserted?.id || null;
    };

    // ── Load user context ──
    const { data: userCtx } = await supabase
      .from("ai_user_context")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    // ── Load bilingual settings ──
    const { data: userProfileForLang } = await svc.from("profiles")
      .select("secondary_languages")
      .eq("user_id", userId)
      .maybeSingle();

    const secondaryLang = userProfileForLang?.secondary_languages?.[0] || null; // "en" or "es" or null
    const bilingualPlatforms: string[] = (userCtx?.extra_context as any)?.bilingual_platforms || [];
    const langNames: Record<string, string> = { en: "inglês", es: "espanhol" };
    const secondaryLangName = secondaryLang ? langNames[secondaryLang] || secondaryLang : null;

    // ── System prompt ──
    let systemPrompt = `Você é a assistente de conteúdo do TrendPulse, uma plataforma de criação de conteúdo para redes sociais para qualquer nicho ou setor de atuação.

Suas capacidades:
- Sugerir ideias de posts e conteúdos personalizados para o nicho do usuário
- Ajudar a escrever legendas e textos
- Analisar tendências relevantes para o setor do usuário
- Dar dicas de engajamento
- Ajudar com estratégia de conteúdo
- Gerar posts, carrosséis e stories a partir de ideias ou links

IMPORTANTE: Nunca assuma ou generalize o nicho do usuário. Se ele disse "tecnologia", é tecnologia em geral, NÃO HealthTech. Sempre baseie suas sugestões exatamente no nicho, tom e temas informados pelo usuário.

Responda sempre em português brasileiro, de forma amigável e profissional.
Seja concisa mas completa nas respostas.`;

    if (userCtx) {
      const ctxParts: string[] = [];
      if (userCtx.business_niche) ctxParts.push(`Nicho do negócio: ${userCtx.business_niche}`);
      if (userCtx.brand_voice) ctxParts.push(`Tom de comunicação: ${userCtx.brand_voice}`);
      if (userCtx.content_topics?.length) ctxParts.push(`Temas: ${userCtx.content_topics.join(", ")}`);
      if (userCtx.instagram_handle) ctxParts.push(`Instagram: ${userCtx.instagram_handle}`);
      if (ctxParts.length) {
        systemPrompt += `\n\nContexto do usuário:\n${ctxParts.join("\n")}\n\nREGRA: O nicho do usuário é "${userCtx.business_niche || "não definido"}". Use como contexto de fundo, mas SEMPRE priorize o TEMA ESPECÍFICO que o usuário pedir. Se ele pedir sobre "marketing digital" e o nicho é "saúde", gere sobre marketing digital (não sobre saúde). O nicho serve para ajustar o tom e público, não para substituir o tema solicitado.`;
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Intent classification
    // ══════════════════════════════════════════════════════════════════════════

    let detectedIntent = "CHAT";
    let actionResult: any = null;

    if (intent_hint && INTENTS.includes(intent_hint)) {
      detectedIntent = intent_hint;
    } else {
      const classifyPrompt = `Classifique a intenção da mensagem em UMA categoria:
- GENERATE_TEMPLATE: quer criar tweet card, card estilo twitter, carrossel tutorial passo a passo, quote card visual, citação visual, infográfico
- GENERATE: quer criar post, story, imagem, conteúdo visual com design artístico
- GENERATE_CAROUSEL: quer criar carrossel, múltiplos slides, série de posts, documento
- EDIT_CONTENT: quer editar, mudar, ajustar conteúdo já existente (ex: "muda a fonte", "texto menor", "nova imagem")
- CRIAR_MARCA: quer criar marca, identidade visual, definir cores/logo/estilo
- ATUALIZAR_PERFIL: quer mudar nicho, tom de voz, temas do perfil
- LINK_PARA_POST: colou um link/URL e quer transformar em conteúdo
- CHAT: conversa geral, pergunta, ajuda, dica

IMPORTANTE: Se a mensagem contém um link (URL), classifique como LINK_PARA_POST.
Se pede "carrossel", "múltiplos slides", "série", "documento", classifique como GENERATE_CAROUSEL.
Se menciona "tweet card", "estilo tweet", "tutorial passo a passo", "quote card", "citação visual", "infográfico", "vídeo reels", "crie um vídeo", "produto em cenário", "product placement", "antes e depois", "before after", classifique como GENERATE_TEMPLATE.

Responda APENAS com o nome da categoria.

Mensagem: "${message}"`;

      const classifyResp = await aiGatewayFetch({
        model: "google/gemini-2.5-flash-lite",
        messages: [{ role: "user", content: classifyPrompt }],
      });

      if (classifyResp.ok) {
        const classifyData = await classifyResp.json();
        const classified = classifyData.choices?.[0]?.message?.content?.trim()?.toUpperCase() || "";
        const match = INTENTS.find((i) => classified.includes(i));
        if (match) detectedIntent = match;
      }

      // URL fallback: if message has a URL and no intent detected, treat as LINK_PARA_POST
      const urlMatch = message.match(/https?:\/\/[^\s]+/);
      if (urlMatch && detectedIntent === "CHAT") {
        detectedIntent = "LINK_PARA_POST";
      }
    }

    // LINK_PARA_POST is treated as GENERATE (with URL extraction)
    if (detectedIntent === "LINK_PARA_POST") {
      detectedIntent = "GENERATE";
    }

    // Template detection AFTER all conversions — if message matches a Blotato template, upgrade
    // This runs last so it takes priority over GENERATE/GENERATE_CAROUSEL
    if ((detectedIntent === "GENERATE" || detectedIntent === "GENERATE_CAROUSEL" || detectedIntent === "CHAT") && detectBlotataTemplate(message)) {
      detectedIntent = "GENERATE_TEMPLATE";
    }

    // ── Process intent-specific actions ──
    let replyOverride: string | null = null;
    let quickReplies: string[] | null = null;
    let brandCreationStepResponse: number | null = null;

    // ── Check for active brand creation flow ──
    const brandCreationState = (userCtx?.extra_context as any)?.brand_creation;
    if (brandCreationState?.step > 0 && brandCreationState?.step <= 5 && detectedIntent !== "CRIAR_MARCA" && detectedIntent !== "CRIAR_MARCA_ANALYZE") {
      console.log("[ai-chat] Brand creation active (step:", brandCreationState.step, "), overriding intent", detectedIntent, "→ CRIAR_MARCA");
      detectedIntent = "CRIAR_MARCA";
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Intent handlers
    // ══════════════════════════════════════════════════════════════════════════

    switch (detectedIntent) {

      // ════════════════════════════════════════════════════════════════════════
      // GENERATE_TEMPLATE — Blotato template-based visual generation
      // ════════════════════════════════════════════════════════════════════════
      case "GENERATE_TEMPLATE": {
        const templateMatch = detectBlotataTemplate(message);
        if (!templateMatch) {
          // This shouldn't happen (post-classification already checked), but just in case
          console.log("[ai-chat] GENERATE_TEMPLATE: no template match, will use GENERATE instead");
          // Cannot fall through in switch — set flag and break, GENERATE will be handled after switch
          replyOverride = null;
          detectedIntent = "GENERATE";
          // NOTE: break exits the switch; GENERATE won't run. The response will be a generic chat reply.
          // This is acceptable since this case should never happen (detection runs before switch).
          break;
        }

        console.log(`[ai-chat] GENERATE_TEMPLATE: template=${templateMatch.templateKey}, type=${templateMatch.templateType}`);

        // 1. Load user profile for author info
        const { data: userProfile } = await svc.from("profiles")
          .select("full_name, instagram_handle, avatar_url")
          .eq("user_id", userId).maybeSingle();

        const authorName = userProfile?.full_name || "Autor";
        const authorHandle = userProfile?.instagram_handle || "";
        const authorImage = userProfile?.avatar_url || "";

        // 2. Load brand context if provided
        let templateBrandContext = "";
        let templateBrandSnapshot: Record<string, any> | null = null;
        let brandColors: string[] = [];

        if (requestBrandId && requestBrandId !== "none") {
          const { data: brand } = await svc.from("brands")
            .select("name, palette, fonts, visual_tone, do_rules, dont_rules, visual_preferences, logo_url, creation_mode")
            .eq("id", requestBrandId).single();
          if (brand) {
            templateBrandSnapshot = brand;
            brandColors = (brand.palette as any[] || []).map((c: any) => typeof c === "string" ? c : c.hex).filter(Boolean);
            const parts: string[] = [];
            parts.push(`Marca: ${brand.name}`);
            if (brandColors.length) parts.push(`Cores: ${brandColors.join(", ")}`);
            if (brand.visual_tone) parts.push(`Tom visual: ${brand.visual_tone}`);
            if (brand.do_rules) parts.push(`FAÇA: ${brand.do_rules}`);
            if (brand.dont_rules) parts.push(`NÃO FAÇA: ${brand.dont_rules}`);
            templateBrandContext = parts.join("\n");
          }
        }

        // 3. Use AI to structure content into template inputs
        let templateInputs: Record<string, any> = {};
        let templatePrompt = message;

        const inputPrompts: Record<string, string> = {
          tweet: `Transforme a mensagem do usuário em conteúdo para um CARROSSEL estilo tweet/Twitter.
Crie 4-6 frases impactantes que formem uma narrativa — como um thread do Twitter.
Cada frase será um slide separado do carrossel.
${templateBrandContext ? `Contexto da marca:\n${templateBrandContext}` : ""}
${userCtx?.business_niche ? `Nicho: ${userCtx.business_niche}` : ""}
${userCtx?.brand_voice ? `Tom de voz: ${userCtx.brand_voice}` : ""}

REGRAS:
- Frase 1: gancho provocativo que prende atenção (pode incluir dado ou pergunta)
- Frases 2-4: desenvolvimento do argumento, uma ideia por frase, use **negrito** em palavras-chave
- Frase 5-6: conclusão forte + CTA ("Salve e compartilhe")
- Cada frase: 1-3 parágrafos curtos, máx 280 chars por frase
- Tom: autoridade, como um especialista compartilhando insight valioso

Responda APENAS em JSON válido:
{
  "quotes": ["frase 1 (gancho)", "frase 2 (argumento)", "frase 3", "frase 4", "frase 5 (conclusão/CTA)"],
  "theme": "light"
}

Mensagem: "${message}"`,

          tutorial: `Transforme a mensagem do usuário em um carrossel tutorial educativo com 5-7 slides.
${templateBrandContext ? `Contexto da marca:\n${templateBrandContext}` : ""}
${userCtx?.business_niche ? `Nicho: ${userCtx.business_niche}` : ""}
${userCtx?.brand_voice ? `Tom de voz: ${userCtx.brand_voice}` : ""}

Responda APENAS em JSON válido:
{
  "title": "Título do carrossel (curto, max 60 chars)",
  "contentSlides": [
    { "title": "Passo 1: ...", "description": "Explicação breve do passo" },
    { "title": "Passo 2: ...", "description": "Explicação breve" }
  ],
  "ctaGreeting": "Gostou? Siga para mais!",
  "ctaDescription": "Salve este post e compartilhe"
}

Mensagem: "${message}"`,

          quote: `Transforme a mensagem do usuário em frases para um quote card visual.
Divida em 4-6 frases/slides impactantes com palavras-chave em destaque.
${templateBrandContext ? `Contexto da marca:\n${templateBrandContext}` : ""}

Responda APENAS em JSON válido:
{
  "title": "Título temático curto (max 40 chars)",
  "quotes": ["frase 1 impactante", "frase 2 com profundidade", "frase 3 provocativa"]
}

Mensagem: "${message}"`,

          infographic: `Transforme a mensagem do usuário em conteúdo para um infográfico visual.
${templateBrandContext ? `Contexto da marca:\n${templateBrandContext}` : ""}
${userCtx?.business_niche ? `Nicho: ${userCtx.business_niche}` : ""}

Responda APENAS em JSON válido:
{
  "description": "Descrição detalhada do infográfico: dados, fatos, estatísticas e informações visuais (max 500 chars)",
  "footerText": "${authorName}"
}

Mensagem: "${message}"`,

          video: `Crie o roteiro de um vídeo curto (30-60 segundos) para Instagram Reels/TikTok.
Divida em 3-5 cenas. Cada cena precisa de uma descrição visual (para gerar imagem IA) e um script de narração.
${templateBrandContext ? `Contexto da marca:\n${templateBrandContext}` : ""}
${userCtx?.business_niche ? `Nicho: ${userCtx.business_niche}` : ""}
${userCtx?.brand_voice ? `Tom de voz: ${userCtx.brand_voice}` : ""}

Responda APENAS em JSON válido:
{
  "scenes": [
    { "aiPrompt": "descrição visual da cena (em inglês, para IA gerar imagem)", "voiceoverScript": "texto que será narrado nesta cena (em português)" },
    { "aiPrompt": "...", "voiceoverScript": "..." }
  ],
  "voiceName": "pt-BR-francisca"
}

Mensagem: "${message}"`,

          product: `O usuário quer colocar um produto em um cenário profissional gerado por IA.
Extraia da mensagem: qual é o produto e que tipo de cenário/ambiente ele quer.
${templateBrandContext ? `Contexto da marca:\n${templateBrandContext}` : ""}

Responda APENAS em JSON válido:
{
  "sceneDescription": "Descrição detalhada do cenário desejado em inglês (para IA gerar, max 200 chars). Ex: 'Modern minimalist kitchen counter with soft morning light, marble surface'"
}

Mensagem: "${message}"`,

          "before-after": `Crie um conteúdo visual de comparação "Antes vs Depois" sobre o tema do usuário.
Pense em um cenário de transformação claro e impactante.
${templateBrandContext ? `Contexto da marca:\n${templateBrandContext}` : ""}
${userCtx?.business_niche ? `Nicho: ${userCtx.business_niche}` : ""}

Responda APENAS em JSON válido:
{
  "firstSlideText": "Texto de abertura chamativo (max 60 chars)",
  "firstSlideImagePrompt": "Descrição visual do cenário ANTES em inglês (para IA gerar imagem)",
  "comparisonTextTop": "ANTES: frase curta descrevendo o problema",
  "comparisonTextBottom": "DEPOIS: frase curta descrevendo a solução",
  "lastSlideText": "CTA final motivacional (max 60 chars)",
  "lastSlideImagePrompt": "Descrição visual do cenário DEPOIS em inglês (para IA gerar imagem)"
}

Mensagem: "${message}"`,
        };

        const structPrompt = inputPrompts[templateMatch.templateType];
        if (structPrompt) {
          try {
            const structResp = await aiGatewayFetch({
              model: "openrouter/minimax-m-25",
              messages: [{ role: "user", content: structPrompt }],
            });
            if (structResp.ok) {
              const structData = await structResp.json();
              const raw = structData.choices?.[0]?.message?.content || "";
              const jsonMatch = raw.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                templateInputs = parsed;
                console.log(`[ai-chat] GENERATE_TEMPLATE: AI structured inputs OK, keys: ${Object.keys(parsed).join(", ")}`);
              } else {
                console.warn("[ai-chat] GENERATE_TEMPLATE: AI response had no JSON, using fallback");
              }
            } else {
              console.warn("[ai-chat] GENERATE_TEMPLATE: AI structuring call failed, status:", structResp.status);
            }
          } catch (parseErr: any) {
            console.warn("[ai-chat] GENERATE_TEMPLATE: AI input structuring failed:", parseErr?.message);
          }
        } else {
          console.log(`[ai-chat] GENERATE_TEMPLATE: no structPrompt for type "${templateMatch.templateType}", using message as-is`);
        }

        // Fallback: if AI didn't produce inputs, create sensible defaults from the user message
        if (templateMatch.templateType === "tweet" && !templateInputs.quotes?.length) {
          // Extract topic from message (remove "Crie um tweet card visual sobre: " prefix)
          const topicText = message.replace(/^.*?(sobre|com a frase|visual)\s*:?\s*/i, "").trim() || message;
          templateInputs.quotes = [topicText];
          console.log("[ai-chat] GENERATE_TEMPLATE: tweet fallback — using message as quote");
        }
        if (templateMatch.templateType === "quote" && !templateInputs.quotes?.length) {
          const topicText = message.replace(/^.*?(sobre|com a frase|visual)\s*:?\s*/i, "").trim() || message;
          templateInputs.quotes = [topicText];
        }
        if (templateMatch.templateType === "tutorial" && !templateInputs.contentSlides?.length && !templateInputs.contentItems?.length) {
          templateInputs.title = message.replace(/^.*?(sobre|passo a passo)\s*:?\s*/i, "").trim().substring(0, 60);
        }

        // 4. Enrich inputs with profile and brand data
        if (templateMatch.templateType === "tweet" || templateMatch.templateType === "tutorial") {
          templateInputs.authorName = authorName;
          templateInputs.handle = authorHandle;
          if (authorImage) templateInputs.profileImage = authorImage;
          templateInputs.verified = false;
        }

        if (templateMatch.templateType === "tweet") {
          templateInputs.aspectRatio = "1:1";
        }

        if (templateMatch.templateType === "tutorial") {
          if (brandColors[0]) templateInputs.accentColor = brandColors[0];
          if (brandColors[1]) templateInputs.introBackgroundColor = brandColors[1];
          if (brandColors[1]) templateInputs.contentBackgroundColor = brandColors[1];
          templateInputs.aspectRatio = "1:1";
        }

        if (templateMatch.templateType === "quote") {
          templateInputs.aspectRatio = "1:1";
        }

        if (templateMatch.templateType === "video") {
          templateInputs.enableVoiceover = true;
          templateInputs.aspectRatio = "9:16";
          templateInputs.captionPosition = "bottom";
          templateInputs.highlightColor = brandColors[0] || "#FFD700";
          templateInputs.transition = "crossfade";
          // Ensure scenes use mediaSource.aiPrompt format
          if (templateInputs.scenes) {
            templateInputs.scenes = templateInputs.scenes.map((s: any) => ({
              mediaSource: { aiPrompt: s.aiPrompt || s.mediaSource?.aiPrompt || "professional background" },
              voiceoverScript: s.voiceoverScript || s.script || "",
            }));
          }
        }

        if (templateMatch.templateType === "before-after") {
          templateInputs.aspectRatio = "1:1";
          templateInputs.slideDuration = 4;
        }

        // 5. Call blotato-proxy
        console.log(`[ai-chat] GENERATE_TEMPLATE: calling blotato-proxy with inputs:`, JSON.stringify(templateInputs).substring(0, 300));

        let blotatoImageUrls: string[] = [];
        let blotatoMediaUrl: string | null = null;
        try {
          const blotatoResp = await fetch(`${supabaseUrl}/functions/v1/blotato-proxy`, {
            method: "POST",
            headers: internalHeaders,
            body: JSON.stringify({
              action: "create_visual",
              templateKey: templateMatch.templateKey,
              prompt: message,
              inputs: templateInputs,
            }),
          });

          if (blotatoResp.ok) {
            const blotatoData = await blotatoResp.json();
            blotatoImageUrls = blotatoData.imageUrls || [];
            blotatoMediaUrl = blotatoData.mediaUrl || null;
            console.log(`[ai-chat] GENERATE_TEMPLATE: Blotato returned ${blotatoImageUrls.length} images, mediaUrl=${!!blotatoMediaUrl}`);
          } else {
            const errText = await blotatoResp.text().catch(() => "");
            console.error(`[ai-chat] GENERATE_TEMPLATE: blotato-proxy failed: ${blotatoResp.status} ${errText.substring(0, 200)}`);
          }
        } catch (blotatoErr: any) {
          console.error("[ai-chat] GENERATE_TEMPLATE: blotato-proxy error:", blotatoErr?.message);
        }

        if (blotatoImageUrls.length === 0 && !blotatoMediaUrl) {
          replyOverride = "Não foi possível gerar o visual. Tente novamente ou use outro formato.";
          break;
        }

        // 6. Generate caption
        let templateCaption = "";
        let templateHashtags: string[] = [];
        let templateTitle = templateInputs.title || message.substring(0, 80);
        let templatePlatformCaptions: Record<string, string> | null = null;

        try {
          const templateBilingual = secondaryLang && bilingualPlatforms.length > 0
            ? `\nIMPORTANTE: A legenda DEVE ser bilíngue — primeiro em português, depois "---" e a versão em ${secondaryLangName}.`
            : "";
          const captionPrompt = `Gere uma legenda para Instagram/LinkedIn sobre este conteúdo.
Tema: ${message}
${userCtx?.business_niche ? `Nicho: ${userCtx.business_niche}` : ""}
${userCtx?.brand_voice ? `Tom: ${userCtx.brand_voice}` : ""}${templateBilingual}

Responda em JSON: { "title": "título curto (max 8 palavras)", "caption": "legenda (max 300 chars)", "hashtags": ["tag1", "tag2", "tag3"] }`;

          const captionResp = await aiGatewayFetch({
            model: "openrouter/minimax-m-25",
            messages: [{ role: "user", content: captionPrompt }],
          });

          if (captionResp.ok) {
            const captionData = await captionResp.json();
            const raw = captionData.choices?.[0]?.message?.content || "";
            const jsonMatch = raw.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              templateTitle = parsed.title || templateTitle;
              templateCaption = parsed.caption || "";
              templateHashtags = parsed.hashtags || [];
            }
          }
        } catch (capErr: any) {
          console.warn("[ai-chat] GENERATE_TEMPLATE: caption generation failed:", capErr?.message);
        }

        // 7. Save to generated_contents
        const isVideo = templateMatch.templateType === "video";
        const isCarousel = blotatoImageUrls.length > 1;

        const templateSlides = isVideo && blotatoMediaUrl
          ? [{ headline: "", body: "", bullets: [], image_url: blotatoMediaUrl, background_image_url: blotatoMediaUrl, render_mode: "ai_full_design", media_type: "video" }]
          : blotatoImageUrls.map((url: string) => ({
              headline: "", body: "", bullets: [],
              image_url: url, background_image_url: url, render_mode: "ai_full_design",
            }));

        const platform = requestPlatform || detectPlatform(message);
        const savedTemplateContentId = await persistGeneratedContent({
          generatedContent: {
            title: templateTitle,
            caption: templateCaption,
            hashtags: templateHashtags,
            platformCaptions: templatePlatformCaptions,
            slides: templateSlides,
          },
          fallbackTitle: templateTitle,
          contentType: isVideo ? "story" : isCarousel ? "carousel" : "post",
          brandId: requestBrandId || null,
          brandSnapshot: templateBrandSnapshot,
          platform,
          visualMode: isVideo ? "blotato_video" : "blotato_template",
        });

        if (savedTemplateContentId) {
          const updatePayload: Record<string, any> = {};
          if (blotatoImageUrls.length > 0) updatePayload.image_urls = blotatoImageUrls;
          if (blotatoMediaUrl) updatePayload.rendered_image_urls = [blotatoMediaUrl];
          if (Object.keys(updatePayload).length > 0) {
            await svc.from("generated_contents")
              .update(updatePayload)
              .eq("id", savedTemplateContentId);
          }
        }

        replyOverride = isVideo
          ? "Vídeo Reels gerado! Confira abaixo."
          : blotatoImageUrls.length > 1
            ? `Carrossel gerado com ${blotatoImageUrls.length} slides! Confira abaixo.`
            : "Visual gerado! Confira abaixo.";

        actionResult = savedTemplateContentId ? {
          content_id: savedTemplateContentId,
          content_type: isVideo ? "story" : isCarousel ? "carousel" : "post",
          platform,
          preview_image_url: blotatoImageUrls[0] || blotatoMediaUrl || undefined,
        } : null;

        break;
      }

      // ════════════════════════════════════════════════════════════════════════
      // GENERATE — Single post/story image generation
      // ════════════════════════════════════════════════════════════════════════
      case "GENERATE": {
        console.log("[ai-chat] GENERATE handler started");

        // 1. Detect platform, format and content style
        const platform = requestPlatform || detectPlatform(message);
        const format = requestFormat || detectFormat(message);
        const contentStyle = detectContentStyle(message);
        // For "frase" requests, extract just the phrase text as the headline
        const slideHeadline = contentStyle === "quote" ? extractPhrase(message) : message.substring(0, 100);
        console.log(`[ai-chat] GENERATE: platform=${platform}, format=${format}, contentStyle=${contentStyle || "news"}, headline="${slideHeadline}"`);

        // 2. Load brand if brandId provided
        let brandContext = "";
        let brandSnapshot: Record<string, any> | null = null;
        let referenceImageUrls: string[] = [];
        let isPhotoBackground = false;
        let photoBackgroundUrls: string[] = [];

        if (requestBrandId && requestBrandId !== "none") {
          const { data: brand } = await svc.from("brands")
            .select("name, palette, fonts, visual_tone, do_rules, dont_rules, visual_preferences, logo_url, creation_mode")
            .eq("id", requestBrandId).single();

          if (brand) {
            brandSnapshot = brand;
            isPhotoBackground = (brand as any).creation_mode === "photo_backgrounds";

            const parts: string[] = [];
            parts.push(`Marca: ${brand.name}`);
            if (brand.palette?.length) {
              const colors = (brand.palette as any[]).map((c: any) => typeof c === "string" ? c : c.hex).filter(Boolean);
              if (colors.length) parts.push(`Cores: ${colors.join(", ")}`);
            }
            if (brand.fonts) {
              const fonts = brand.fonts as any;
              parts.push(`Fontes: títulos=${fonts.headings || "Inter"}, corpo=${fonts.body || "Inter"}`);
            }
            if (brand.visual_tone) parts.push(`Tom visual: ${brand.visual_tone}`);
            if (brand.do_rules) parts.push(`FAÇA: ${brand.do_rules}`);
            if (brand.dont_rules) parts.push(`NÃO FAÇA: ${brand.dont_rules}`);
            const prefs = brand.visual_preferences as any;
            if (prefs?.custom_notes) parts.push(`Nota visual: ${prefs.custom_notes}`);
            brandContext = parts.join("\n");

            if (isPhotoBackground) {
              const { data: bgPhotos } = await svc.from("brand_examples")
                .select("image_url").eq("brand_id", requestBrandId).eq("purpose", "background").limit(6);
              if (bgPhotos?.length) photoBackgroundUrls = bgPhotos.map((r: any) => r.image_url);
              console.log(`[ai-chat] photo_backgrounds mode: ${photoBackgroundUrls.length} photos`);
            } else {
              const { data: refs } = await svc.from("brand_examples")
                .select("image_url").eq("brand_id", requestBrandId).eq("purpose", "reference").limit(6);
              if (refs?.length) referenceImageUrls = refs.map((r: any) => r.image_url);
            }
          }
        }

        // 3. If message contains URL, fetch article content
        let articleContent = "";
        const urlMatch = message.match(/https?:\/\/[^\s]+/);
        if (urlMatch) {
          try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 12000);
            const resp = await fetch(urlMatch[0], {
              headers: { "User-Agent": "TrendPulse/1.0" },
              signal: controller.signal,
            });
            clearTimeout(timer);
            if (resp.ok) {
              const html = await resp.text();
              articleContent = html
                .replace(/<script[\s\S]*?<\/script>/gi, "")
                .replace(/<style[\s\S]*?<\/style>/gi, "")
                .replace(/<[^>]+>/g, " ")
                .replace(/\s+/g, " ")
                .trim()
                .substring(0, 4000);
            }
          } catch (fetchErr: any) {
            console.warn("[ai-chat] GENERATE: URL fetch failed:", fetchErr?.message);
          }
        }

        // 4. Get content dimensions
        const dims = getContentDimensions(platform, format);

        // 5. Build image prompt — include FORMATO OBRIGATÓRIO so inference.sh generates correct aspect ratio
        const userTopic = articleContent
          ? `Baseado neste artigo: ${articleContent.substring(0, 2000)}`
          : message;

        const platformLabel = platform === "linkedin" ? "LinkedIn" : "Instagram";
        const formatLabel = format === "story" ? "story" : format === "carousel" ? "carrossel" : "post";

        const isLinkedInFmt = platform === "linkedin" && format !== "document" && format !== "story";
        const isDocumentFmt = format === "document";
        const isStoryFmt = format === "story";
        const dimLabelGenerate = isLinkedInFmt ? "SQUARE 1:1 (1200x1200px)"
          : isDocumentFmt ? "VERTICAL PORTRAIT 4:5 (1080x1350px)"
          : isStoryFmt ? "VERTICAL PORTRAIT 9:16 (1080x1920px)"
          : "SQUARE 1:1 (1080x1080px)";

        // For quote/frase style: prompt focused ONLY on the phrase — never add niche/brand context
        const visualContext = contentStyle === "quote" ? extractVisualContext(message) : "";

        let imagePrompt: string;

        if (isPhotoBackground && photoBackgroundUrls.length > 0) {
          // ── PHOTO BACKGROUND MODE ──
          // Send the personal photo as reference and ask Gemini to overlay text on it
          referenceImageUrls = [photoBackgroundUrls[Math.floor(Math.random() * photoBackgroundUrls.length)]];
          const textToOverlay = contentStyle === "quote" ? slideHeadline : userTopic;
          imagePrompt = `FORMATO OBRIGATÓRIO: ${dimLabelGenerate}. A imagem DEVE ser gerada neste formato exato.

INSTRUÇÃO PRINCIPAL: A imagem de referência anexada é uma FOTO PESSOAL REAL do criador. Você DEVE preservar esta foto exatamente como ela é — é a foto real da pessoa. NÃO gere uma pessoa diferente. NÃO altere o rosto ou corpo da pessoa na foto.

Use a foto anexada como FUNDO e sobreponha o texto abaixo de forma profissional:

TEXTO PARA SOBREPOR: "${textToOverlay}"

REGRAS OBRIGATÓRIAS:
- A foto da pessoa deve permanecer INTACTA e INALTERADA — é a foto real do criador
- Adicione um gradiente sutil escuro na parte inferior para legibilidade do texto
- O texto deve ficar na parte inferior da imagem, sobre o gradiente
- Tipografia elegante, profissional e legível
- Estilo de post de coaching/liderança — limpo e sofisticado
- NÃO gere outra pessoa. NÃO altere o rosto. A foto é SAGRADA.
- NÃO adicione logos, URLs ou QR codes`;

          console.log(`[ai-chat] GENERATE: photo_background prompt, using photo: ${referenceImageUrls[0]?.substring(0, 80)}`);

        } else if (contentStyle === "quote") {
          imagePrompt = `FORMATO OBRIGATÓRIO: ${dimLabelGenerate}. A imagem DEVE ser gerada neste formato exato.

Crie uma imagem artística de ${formatLabel} para ${platformLabel} com a seguinte frase em destaque visual:

FRASE (único texto permitido na imagem): "${slideHeadline}"
${visualContext ? `TEMA VISUAL DO FUNDO: ${visualContext}` : "TEMA VISUAL: fundo artístico abstrato que complementa a frase"}

${brandContext ? `IDENTIDADE VISUAL (apenas cores/fontes, NÃO adicionar textos da marca):\n${brandContext}\n` : ""}

REGRAS ABSOLUTAS — OBRIGATÓRIAS:
- O ÚNICO texto visível na imagem é a frase "${slideHeadline}". ZERO outros textos.
- NÃO adicione subtítulos, categorias, slogans, rótulos, nome de marca ou qualquer palavra além da frase.
- Tipografia elegante e legível. Frase centralizada e em destaque.
- NÃO inclua URLs, QR codes ou logotipos.`;
        } else {
          imagePrompt = `FORMATO OBRIGATÓRIO: ${dimLabelGenerate}. A imagem DEVE ser gerada neste formato exato.

Crie uma imagem profissional pronta para publicar como ${formatLabel} de ${platformLabel}.

TEMA: ${userTopic}

${brandContext ? `IDENTIDADE VISUAL:\n${brandContext}\n` : ""}${userCtx?.business_niche ? `Nicho do criador: ${userCtx.business_niche}. ` : ""}${userCtx?.brand_voice ? `Tom de voz: ${userCtx.brand_voice}. ` : ""}

REGRAS:
- A imagem deve ter texto integrado visível e legível sobre o tema acima.
- Use tipografia profissional, hierarquia visual clara, cores harmônicas.
- NÃO inclua URLs, QR codes ou logotipos de terceiros.
- Gere APENAS a imagem final, sem bordas ou mockups.`;
        }

        // 6. Call generate-slide-images
        console.log("[ai-chat] GENERATE: calling generate-slide-images");
        let imageUrl: string | null = null;
        try {
          const genController = new AbortController();
          const genTimer = setTimeout(() => genController.abort(), 80000); // 80s: inference.sh can take 60s + fallback needs room
          const genResp = await fetch(`${supabaseUrl}/functions/v1/generate-slide-images`, {
            signal: genController.signal,
            method: "POST",
            headers: internalHeaders,
            body: JSON.stringify({
              slide: { role: "cover", headline: slideHeadline, body: "" },
              slideIndex: 0,
              totalSlides: 1,
              contentFormat: format,
              platform,
              backgroundOnly: false,
              customPrompt: imagePrompt,
              brandId: requestBrandId || null,
              referenceImageUrls: referenceImageUrls.length > 0 ? referenceImageUrls : undefined,
              contentStyle: contentStyle || undefined,
            }),
          });

          clearTimeout(genTimer);
          if (genResp.ok) {
            const genData = await genResp.json();
            imageUrl = genData.imageUrl || genData.bgImageUrl || null;
            console.log("[ai-chat] GENERATE: image generated:", imageUrl ? "yes" : "no");
          } else {
            const errText = await genResp.text().catch(() => "");
            console.error("[ai-chat] GENERATE: generate-slide-images failed:", genResp.status, errText.substring(0, 200));
          }
        } catch (genErr: any) {
          console.error("[ai-chat] GENERATE: generate-slide-images error:", genErr?.name === "AbortError" ? "timeout (60s)" : genErr?.message);
        }

        // 7. Generate caption + title with minimax
        let caption = "";
        let hashtags: string[] = [];
        let aiTitle = "";
        try {
          const topic = articleContent
            ? articleContent.substring(0, 600)
            : message;
          const mainBilingual = secondaryLang && bilingualPlatforms.includes(platform)
            ? `\nIMPORTANTE: A legenda DEVE ser bilíngue — primeiro em português, depois "---" e a versão em ${secondaryLangName}.`
            : "";
          const platformRules = platform === "linkedin"
            ? `REGRAS LINKEDIN:
- Tom profissional e corporativo, como um especialista compartilhando insight valioso
- Comece com um gancho forte (pergunta provocativa, dado surpreendente ou afirmação ousada)
- Use parágrafos curtos (2-3 linhas) com espaçamento entre eles
- Inclua um CTA no final (pergunta aberta para gerar comentários)
- Máx 3000 chars. Sem excesso de emojis (1-2 no máximo). Sem hashtags no meio do texto.
- 3-5 hashtags relevantes apenas no final`
            : `REGRAS INSTAGRAM:
- Tom ${userCtx?.brand_voice || "natural"} e acessível, como se falasse com um seguidor próximo
- Comece com um gancho que pare o scroll (frase curta e impactante na primeira linha)
- Use emojis com moderação para dar ritmo visual
- Inclua CTA claro (salve, compartilhe, comente)
- Máx 2200 chars. 8-12 hashtags no final separados do texto.`;

          const captionPrompt = `Você é um especialista em copywriting para redes sociais. Gere uma legenda de alta qualidade para ${platform === "linkedin" ? "LinkedIn" : "Instagram"}.

${platformRules}

${userCtx?.business_niche ? `NICHO DO AUTOR: ${userCtx.business_niche} — use como contexto de fundo para adaptar a linguagem e exemplos.` : ""}
${userCtx?.brand_voice ? `TOM DE VOZ: ${userCtx.brand_voice}` : ""}

TEMA/CONTEÚDO: "${topic}"${mainBilingual}

Responda em JSON com 3 campos:
- title: título curto e descritivo (máximo 8 palavras, SEM meta-instruções — apenas o TEMA real)
- caption: legenda completa seguindo as regras acima (gancho + desenvolvimento + CTA)
- hashtags: array de 5-8 hashtags relevantes e específicas (não genéricas)

JSON: { "title": "...", "caption": "...", "hashtags": ["#..."] }`;

          const captionResp = await aiGatewayFetch({
            model: "openrouter/minimax-m-25",
            messages: [{ role: "user", content: captionPrompt }],
          });

          if (captionResp.ok) {
            const captionData = await captionResp.json();
            const raw = captionData.choices?.[0]?.message?.content || "";
            const jsonMatch = raw.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              try {
                const parsed = JSON.parse(jsonMatch[0]);
                aiTitle = parsed.title || "";
                caption = parsed.caption || "";
                hashtags = parsed.hashtags || [];
              } catch (parseErr) {
                console.warn("[ai-chat] GENERATE: caption JSON parse failed, extracting with regex");
                const titleRx = raw.match(/"title"\s*:\s*"((?:[^"\\]|\\.)*)"/s);
                const captionRx = raw.match(/"caption"\s*:\s*"((?:[^"\\]|\\.)*)"/s);
                const hashRx = raw.match(/"hashtags"\s*:\s*(\[[^\]]*\])/s);
                if (captionRx) {
                  caption = captionRx[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
                  if (titleRx) aiTitle = titleRx[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
                  if (hashRx) { try { hashtags = JSON.parse(hashRx[1]); } catch { /* ignore */ } }
                } else {
                  caption = raw.replace(/```json\n?|\n?```/g, "").trim();
                }
              }
            } else {
              caption = raw.trim();
            }
          }
        } catch (captionErr: any) {
          console.warn("[ai-chat] GENERATE: caption generation failed:", captionErr?.message);
        }

        // 8. Build title — prefer AI-generated title, fallback to phrase/message cleanup
        const title = contentStyle === "quote"
          ? slideHeadline
          : (aiTitle || (message.replace(/https?:\/\/\S+/g, "").replace(/^(quero|crie|gere|criar|gerar|me\s+d[eê]|fa[çc]a)\s+(um[a]?\s+)?(post|story|carrossel|imagem|conteúdo)\s+(para\s+o\s+)?(instagram|linkedin)?\s*/i, "").trim().substring(0, 80) || message.substring(0, 80)));

        // 8b. Generate multi-platform caption variants (async, non-blocking)
        let platformCaptions: Record<string, string> | null = null;
        try {
          const bilingualNote = secondaryLang && bilingualPlatforms.length > 0
            ? `\n\nIMPORTANTE — LEGENDAS BILÍNGUES: Para as plataformas [${bilingualPlatforms.join(", ")}], a legenda DEVE ser bilíngue: primeiro o texto em português, depois uma linha "---" e o texto traduzido para ${secondaryLangName}. As outras plataformas ficam somente em português.`
            : "";

          const variantPrompt = `Você é um copywriter especialista em cada rede social. Adapte a legenda abaixo mantendo a essência mas otimizando RADICALMENTE para cada plataforma. NÃO é tradução — cada versão deve parecer nativa daquela rede.

LEGENDA ORIGINAL:
${caption}

HASHTAGS: ${hashtags.join(" ")}

REGRAS POR PLATAFORMA:
- instagram: Gancho forte na 1a linha (pare o scroll). Tom ${userCtx?.brand_voice || "casual"}, emojis moderados. CTA (salve/compartilhe). 8-12 hashtags NO FINAL (separados). Máx 2200 chars.
- linkedin: Tom de especialista/thought leader. Comece com dado ou insight surpreendente. Parágrafos curtos. Pergunta no final para gerar debate. 3-5 hashtags discretos. Máx 3000 chars.
- x: Conciso, opinião forte, provocativo. Máx 280 chars. 0-2 hashtags. Sem emojis excessivos.
- tiktok: Super informal, enérgico, com urgência. CTA direto ("salve agora!", "manda pra alguém!"). Emojis ok. Máx 2200 chars.
- facebook: Tom amigável e conversacional. Pergunta aberta no início OU final para comentários. Pode ser mais longo. Máx 2000 chars.
${bilingualNote}

Responda APENAS em JSON:
{ "instagram": "...", "linkedin": "...", "x": "...", "tiktok": "...", "facebook": "..." }`;

          const variantResp = await aiGatewayFetch({
            model: "openrouter/minimax-m-25",
            messages: [{ role: "user", content: variantPrompt }],
          });

          if (variantResp.ok) {
            const variantData = await variantResp.json();
            const raw = variantData.choices?.[0]?.message?.content || "";
            const jsonMatch = raw.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              try {
                platformCaptions = JSON.parse(jsonMatch[0]);
                console.log("[ai-chat] GENERATE: platform variants generated:", Object.keys(platformCaptions || {}).join(", "));
              } catch {
                console.warn("[ai-chat] GENERATE: platform variants JSON parse failed");
              }
            }
          }
        } catch (variantErr: any) {
          console.warn("[ai-chat] GENERATE: platform variants failed:", variantErr?.message);
        }

        // 9. Save to generated_contents
        const savedContentId = await persistGeneratedContent({
          generatedContent: {
            title,
            caption,
            hashtags,
            platformCaptions,
            slides: [{
              headline: slideHeadline,
              body: "",
              bullets: [],
              image_url: imageUrl,
              background_image_url: imageUrl,
              render_mode: "ai_full_design",
            }],
          },
          fallbackTitle: title,
          contentType: format === "story" ? "story" : "post",
          brandId: requestBrandId || null,
          brandSnapshot,
          platform,
          visualMode: "ai_full_design",
        });

        // 10. Update image_urls
        if (savedContentId && imageUrl) {
          await svc.from("generated_contents")
            .update({ image_urls: [imageUrl] })
            .eq("id", savedContentId);
        }

        // 11. Set reply
        replyOverride = imageUrl
          ? "Conteúdo gerado! Confira abaixo."
          : "O conteúdo foi criado mas a imagem não foi gerada. Tente novamente.";

        actionResult = savedContentId ? {
          content_id: savedContentId,
          content_type: format,
          platform,
          preview_image_url: imageUrl,
        } : null;

        console.log("[ai-chat] GENERATE: done, contentId=", savedContentId);
        break;
      }

      // ════════════════════════════════════════════════════════════════════════
      // GENERATE_CAROUSEL — Multi-slide carousel/document generation
      // ════════════════════════════════════════════════════════════════════════
      case "GENERATE_CAROUSEL": {
        console.log("[ai-chat] GENERATE_CAROUSEL handler started");

        // 1. Detect platform and format
        const platform = requestPlatform || detectPlatform(message);
        const format = requestFormat || (platform === "linkedin" ? "document" : "carousel");
        const slideCount = generationParams?.slideCount || 5;
        console.log(`[ai-chat] GENERATE_CAROUSEL: platform=${platform}, format=${format}, slides=${slideCount}`);

        // 2. Load brand if brandId provided
        let brandContext = "";
        let brandSnapshot: Record<string, any> | null = null;
        let referenceImageUrls: string[] = [];
        let isPhotoBackground = false;
        let photoBackgroundUrls: string[] = [];

        if (requestBrandId && requestBrandId !== "none") {
          const { data: brand } = await svc.from("brands")
            .select("name, palette, fonts, visual_tone, do_rules, dont_rules, visual_preferences, logo_url, creation_mode")
            .eq("id", requestBrandId).single();

          if (brand) {
            brandSnapshot = brand;
            isPhotoBackground = (brand as any).creation_mode === "photo_backgrounds";

            const parts: string[] = [];
            parts.push(`Marca: ${brand.name}`);
            if (brand.palette?.length) {
              const colors = (brand.palette as any[]).map((c: any) => typeof c === "string" ? c : c.hex).filter(Boolean);
              if (colors.length) parts.push(`Cores: ${colors.join(", ")}`);
            }
            if (brand.fonts) {
              const fonts = brand.fonts as any;
              parts.push(`Fontes: títulos=${fonts.headings || "Inter"}, corpo=${fonts.body || "Inter"}`);
            }
            if (brand.visual_tone) parts.push(`Tom visual: ${brand.visual_tone}`);
            if (brand.do_rules) parts.push(`FAÇA: ${brand.do_rules}`);
            if (brand.dont_rules) parts.push(`NÃO FAÇA: ${brand.dont_rules}`);
            const prefs = brand.visual_preferences as any;
            if (prefs?.custom_notes) parts.push(`Nota visual: ${prefs.custom_notes}`);
            brandContext = parts.join("\n");

            if (isPhotoBackground) {
              const { data: bgPhotos } = await svc.from("brand_examples")
                .select("image_url").eq("brand_id", requestBrandId).eq("purpose", "background").limit(6);
              if (bgPhotos?.length) photoBackgroundUrls = bgPhotos.map((r: any) => r.image_url);
              console.log(`[ai-chat] photo_backgrounds mode: ${photoBackgroundUrls.length} photos`);
            } else {
              const { data: refs } = await svc.from("brand_examples")
                .select("image_url").eq("brand_id", requestBrandId).eq("purpose", "reference").limit(6);
              if (refs?.length) referenceImageUrls = refs.map((r: any) => r.image_url);
            }
          }
        }

        // 3. If message contains URL, fetch article content
        let articleContent = "";
        const urlMatch = message.match(/https?:\/\/[^\s]+/);
        if (urlMatch) {
          try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 12000);
            const resp = await fetch(urlMatch[0], {
              headers: { "User-Agent": "TrendPulse/1.0" },
              signal: controller.signal,
            });
            clearTimeout(timer);
            if (resp.ok) {
              const html = await resp.text();
              articleContent = html
                .replace(/<script[\s\S]*?<\/script>/gi, "")
                .replace(/<style[\s\S]*?<\/style>/gi, "")
                .replace(/<[^>]+>/g, " ")
                .replace(/\s+/g, " ")
                .trim()
                .substring(0, 4000);
            }
          } catch (fetchErr: any) {
            console.warn("[ai-chat] GENERATE_CAROUSEL: URL fetch failed:", fetchErr?.message);
          }
        }

        // 4. Generate slide structure with minimax
        const userTopic = articleContent
          ? `Baseado neste artigo: ${articleContent.substring(0, 2000)}`
          : message;

        const carouselPlatformGuide = platform === "linkedin"
          ? `FORMATO LINKEDIN DOCUMENT:
- Slide 1 (CAPA): Título provocativo que gere curiosidade profissional (máx 8 palavras). Use dado ou pergunta.
- Slides 2-${slideCount - 1} (CONTEÚDO): Cada slide = 1 ideia clara. Headline forte + body conciso + bullets com dados/exemplos.
- Slide ${slideCount} (CTA): Convide para comentar ("Qual desses pontos mais impacta seu negócio?") + "Siga para mais insights".
- Tom: executivo, baseado em dados, insights acionáveis.`
          : `FORMATO INSTAGRAM CARROSSEL:
- Slide 1 (CAPA): Gancho irresistível que faça deslizar (máx 8 palavras). Pode ser pergunta, afirmação ousada ou promessa.
- Slides 2-${slideCount - 1} (CONTEÚDO): 1 ponto por slide. Headline emocional + body didático + bullets práticos.
- Slide ${slideCount} (CTA): "Salve para consultar depois" + "Compartilhe com quem precisa" + "Siga @handle".
- Tom: ${userCtx?.brand_voice || "educativo e acessível"}, como se ensinasse a um amigo.`;

        const structurePrompt = `Você é um estrategista de conteúdo especialista em carrosseis virais. Crie ${slideCount} slides.

TEMA: ${userTopic}
${userCtx?.business_niche ? `NICHO DO AUTOR: ${userCtx.business_niche}` : ""}

${carouselPlatformGuide}

REGRAS DE COPY:
- Cada headline: máx 60 caracteres, impactante, sem filler words
- Cada body: máx 200 caracteres, direto ao ponto
- Cada bullet: máx 120 caracteres, comece com verbo de ação ou dado
- Evite clichês genéricos ("neste post vou ensinar", "você sabia que")
- Use números específicos quando possível ("3 erros", "aumento de 47%")

Responda em JSON:
{
  "title": "título do carrossel",
  "slides": [
    { "role": "cover", "headline": "...", "body": "", "bullets": [] },
    { "role": "content", "headline": "...", "body": "...", "bullets": ["..."] },
    { "role": "cta", "headline": "...", "body": "...", "bullets": [] }
  ]
}`;

        let carouselTitle = message.length > 80 ? message.substring(0, 80) + "..." : message;
        let slides: any[] = [];

        try {
          const structResp = await aiGatewayFetch({
            model: "openrouter/minimax-m-25",
            messages: [{ role: "user", content: structurePrompt }],
          });

          if (structResp.ok) {
            const structData = await structResp.json();
            const raw = structData.choices?.[0]?.message?.content || "";
            const jsonMatch = raw.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              carouselTitle = parsed.title || carouselTitle;
              slides = parsed.slides || [];
            }
          }
        } catch (structErr: any) {
          console.error("[ai-chat] GENERATE_CAROUSEL: structure generation failed:", structErr?.message);
        }

        // Fallback: if no slides generated, create basic structure
        if (slides.length === 0) {
          slides = [
            { role: "cover", headline: carouselTitle, body: "", bullets: [] },
            ...Array.from({ length: slideCount - 2 }, (_, i) => ({
              role: "content", headline: `Ponto ${i + 1}`, body: "Conteúdo será gerado", bullets: [],
            })),
            { role: "cta", headline: "Gostou? Siga para mais!", body: "", bullets: [] },
          ];
        }

        // 5. Get content dimensions
        const dims = getContentDimensions(platform, format);

        // 6. Generate images for each slide
        const imageUrls_arr: string[] = [];
        const updatedSlides: any[] = [];

        for (let i = 0; i < slides.length; i++) {
          const slide = slides[i];
          console.log(`[ai-chat] GENERATE_CAROUSEL: generating slide ${i + 1}/${slides.length}`);

          const slidePrompt = `Crie a imagem do slide ${i + 1} de ${slides.length} de um carrossel para ${platform === "linkedin" ? "LinkedIn" : "Instagram"} (${dims.w}x${dims.h}px).

CONTEXTO DO CARROSSEL: ${carouselTitle}
SLIDE ${i + 1}/${slides.length} (${slide.role}):
Headline: ${slide.headline}
${slide.body ? `Body: ${slide.body}` : ""}
${slide.bullets?.length ? `Bullets:\n${slide.bullets.map((b: string) => `- ${b}`).join("\n")}` : ""}

${brandContext ? `IDENTIDADE DA MARCA:\n${brandContext}\n` : ""}
REGRAS:
- Imagem COMPLETA com texto integrado, pronta para publicar
- Manter identidade visual consistente entre slides
- Texto legível, fonte profissional
- Safe area: margem mínima de 80px em todas as bordas
- NUNCA inclua URLs, QR codes, @handles inventados
- Formato: ${dims.w}x${dims.h}px
${i === 0 ? "- Este é o COVER: título grande, impactante" : ""}
${slide.role === "cta" ? "- Este é o ÚLTIMO slide: chamada para ação clara" : ""}

Responda APENAS com a imagem gerada.`;

          let slideImageUrl: string | null = null;
          try {
            const genResp = await fetch(`${supabaseUrl}/functions/v1/generate-slide-images`, {
              method: "POST",
              headers: internalHeaders,
              body: JSON.stringify({
                slide,
                slideIndex: i,
                totalSlides: slides.length,
                contentFormat: format,
                platform,
                backgroundOnly: false,
                customPrompt: slidePrompt,
                brandId: requestBrandId || null,
                referenceImageUrls: referenceImageUrls.length > 0 ? referenceImageUrls : undefined,
              }),
            });

            if (genResp.ok) {
              const genData = await genResp.json();
              slideImageUrl = genData.imageUrl || genData.bgImageUrl || null;
            } else {
              console.error(`[ai-chat] GENERATE_CAROUSEL: slide ${i + 1} generation failed:`, genResp.status);
            }
          } catch (slideErr: any) {
            console.error(`[ai-chat] GENERATE_CAROUSEL: slide ${i + 1} error:`, slideErr?.message);
          }

          if (slideImageUrl) imageUrls_arr.push(slideImageUrl);

          updatedSlides.push({
            ...slide,
            image_url: slideImageUrl,
            background_image_url: slideImageUrl,
            render_mode: "ai_full_design",
          });
        }

        // 7. Generate caption
        let caption = "";
        let hashtags: string[] = [];
        try {
          const carouselBilingual = secondaryLang && bilingualPlatforms.includes(platform)
            ? `\nIMPORTANTE: A legenda DEVE ser bilíngue — primeiro em português, depois "---" e a versão em ${secondaryLangName}.`
            : "";
          const captionPrompt = `Gere uma legenda para um carrossel de ${platform === "linkedin" ? "LinkedIn" : "Instagram"} sobre: "${message}"
${userCtx?.business_niche ? `Nicho: ${userCtx.business_niche}` : ""}
${userCtx?.brand_voice ? `Tom: ${userCtx.brand_voice}` : ""}
Legenda curta e engajante. Inclua 5-8 hashtags relevantes no final.${carouselBilingual}
Responda em JSON: { "caption": "...", "hashtags": ["#..."] }`;

          const captionResp = await aiGatewayFetch({
            model: "openrouter/minimax-m-25",
            messages: [{ role: "user", content: captionPrompt }],
          });

          if (captionResp.ok) {
            const captionData = await captionResp.json();
            const raw = captionData.choices?.[0]?.message?.content || "";
            const jsonMatch = raw.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              try {
                const parsed = JSON.parse(jsonMatch[0]);
                caption = parsed.caption || "";
                hashtags = parsed.hashtags || [];
              } catch {
                console.warn("[ai-chat] GENERATE_CAROUSEL: caption JSON parse failed, extracting with regex");
                const captionRx = raw.match(/"caption"\s*:\s*"((?:[^"\\]|\\.)*)"/s);
                const hashRx = raw.match(/"hashtags"\s*:\s*(\[[^\]]*\])/s);
                if (captionRx) {
                  caption = captionRx[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
                  if (hashRx) { try { hashtags = JSON.parse(hashRx[1]); } catch { /* ignore */ } }
                } else {
                  caption = raw.replace(/```json\n?|\n?```/g, "").trim();
                }
              }
            } else {
              caption = raw.trim();
            }
          }
        } catch (captionErr: any) {
          console.warn("[ai-chat] GENERATE_CAROUSEL: caption generation failed:", captionErr?.message);
        }

        // 8. Save to generated_contents
        const savedContentId = await persistGeneratedContent({
          generatedContent: {
            title: carouselTitle,
            caption,
            hashtags,
            slides: updatedSlides,
          },
          fallbackTitle: carouselTitle,
          contentType: format === "document" ? "document" : "carousel",
          brandId: requestBrandId || null,
          brandSnapshot,
          platform,
          visualMode: "ai_full_design",
        });

        // 9. Update image_urls
        if (savedContentId && imageUrls_arr.length > 0) {
          await svc.from("generated_contents")
            .update({ image_urls: imageUrls_arr })
            .eq("id", savedContentId);
        }

        // 10. Set reply
        const generatedCount = imageUrls_arr.length;
        const totalCount = slides.length;
        replyOverride = generatedCount === totalCount
          ? `Carrossel de ${totalCount} slides gerado! Confira abaixo.`
          : generatedCount > 0
            ? `Carrossel gerado com ${generatedCount} de ${totalCount} imagens. Algumas falharam.`
            : "O carrossel foi criado mas as imagens não foram geradas. Tente novamente.";

        actionResult = savedContentId ? {
          content_id: savedContentId,
          content_type: format === "document" ? "document" : "carousel",
          platform,
          preview_image_url: imageUrls_arr[0] || null,
        } : null;

        console.log("[ai-chat] GENERATE_CAROUSEL: done, contentId=", savedContentId, "images=", generatedCount);
        break;
      }

      // ════════════════════════════════════════════════════════════════════════
      // EDIT_CONTENT — Edit existing content (regenerate image with feedback)
      // ════════════════════════════════════════════════════════════════════════
      case "EDIT_CONTENT": {
        console.log("[ai-chat] EDIT_CONTENT handler started");

        const targetId = generationParams?.contentId || contentId;
        if (!targetId) {
          replyOverride = "Qual conteúdo quer editar? Selecione o conteúdo no chat ou informe o ID.";
          break;
        }

        // Load existing content
        const { data: existing } = await svc.from("generated_contents")
          .select("slides, image_urls, brand_id, brand_snapshot, content_type, platform")
          .eq("id", targetId).single();

        if (!existing) {
          replyOverride = "Conteúdo não encontrado.";
          break;
        }

        const instruction = editInstruction || message;
        const currentImage = existing.image_urls?.[0];
        const existingPlatform = existing.platform || "instagram";
        const existingFormat = existing.content_type || "post";

        // Resolve dimension label so inference.sh generates the correct aspect ratio
        const isLinkedInPost = existingPlatform === "linkedin" && existingFormat !== "document" && existingFormat !== "story";
        const isDocument = existingFormat === "document";
        const isStory = existingFormat === "story";
        const dimLabel = isLinkedInPost ? "SQUARE 1:1 (1200x1200px)"
          : isDocument ? "VERTICAL PORTRAIT 4:5 (1080x1350px)"
          : isStory ? "VERTICAL PORTRAIT 9:16 (1080x1920px)"
          : "SQUARE 1:1 (1080x1080px)";
        const platformLabel = existingPlatform === "linkedin" ? "LinkedIn" : "Instagram";

        // Build edit prompt — include dimensions at top so inference.sh respects aspect ratio
        const editPrompt = `FORMATO OBRIGATÓRIO: ${dimLabel}. Gere a imagem EXATAMENTE neste formato.

Você está editando uma imagem de ${platformLabel} (${existingFormat}).
A imagem de referência fornecida é o conteúdo atual — use-a como base visual.

O QUE MUDAR: ${instruction}

REGRAS:
- Aplique APENAS a mudança pedida acima. Mantenha tudo o mais igual possível.
- Se pede mudança de cor: altere a cor mantendo layout e texto.
- Se pede mudança de texto: altere o texto mantendo estilo visual.
- Se pede mudança visual/estilo: altere o visual mantendo os textos.
- Mantenha qualidade profissional, tipografia legível e identidade do conteúdo.
- NÃO inclua URLs, QR codes ou logotipos externos.`;

        // Call generate-slide-images with edit prompt + current image as reference
        let newImageUrl: string | null = null;
        try {
          const editResp = await fetch(`${supabaseUrl}/functions/v1/generate-slide-images`, {
            method: "POST",
            headers: internalHeaders,
            body: JSON.stringify({
              slide: { role: "cover", headline: existing.slides?.[0]?.headline || "", body: "" },
              slideIndex: 0,
              totalSlides: 1,
              contentFormat: existingFormat,
              platform: existingPlatform,
              backgroundOnly: false,
              customPrompt: editPrompt,
              referenceImageUrls: currentImage ? [currentImage] : undefined,
              brandId: existing.brand_id,
              contentId: targetId,
            }),
          });

          if (editResp.ok) {
            const editData = await editResp.json();
            newImageUrl = editData.imageUrl || editData.bgImageUrl || null;
            console.log("[ai-chat] EDIT_CONTENT: new image generated:", newImageUrl ? "yes" : "no");
          } else {
            console.error("[ai-chat] EDIT_CONTENT: generate-slide-images failed:", editResp.status);
          }
        } catch (editErr: any) {
          console.error("[ai-chat] EDIT_CONTENT: error:", editErr?.message);
        }

        if (newImageUrl) {
          // Update the content with new image
          const updatedSlides = Array.isArray(existing.slides) && existing.slides.length > 0
            ? [{ ...existing.slides[0], image_url: newImageUrl, background_image_url: newImageUrl }]
            : [{ headline: "", body: "", bullets: [], image_url: newImageUrl, background_image_url: newImageUrl, render_mode: "ai_full_design" }];

          await svc.from("generated_contents").update({
            image_urls: [newImageUrl],
            slides: updatedSlides,
          }).eq("id", targetId);

          replyOverride = "Imagem atualizada! Confira o resultado.";
        } else {
          replyOverride = "Não consegui editar a imagem. Tente novamente com uma instrução diferente.";
        }

        actionResult = {
          content_id: targetId,
          content_type: existing.content_type,
          platform: existingPlatform,
          edited: true,
          preview_image_url: newImageUrl,
        };

        console.log("[ai-chat] EDIT_CONTENT: done, targetId=", targetId);
        break;
      }

      // ════════════════════════════════════════════════════════════════════════
      // CRIAR_MARCA HANDLER (brand creation wizard) — Preserved from original
      // ════════════════════════════════════════════════════════════════════════
      case "CRIAR_MARCA": {
        try {
          const serviceKeyCriar = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
          const svcCriar = createClient(supabaseUrl, serviceKeyCriar);

          // Always reload fresh state from DB (don't rely on cached userCtx)
          const { data: freshCtx } = await svcCriar
            .from("ai_user_context")
            .select("extra_context")
            .eq("user_id", userId)
            .single();
          const freshExtra = (freshCtx?.extra_context as Record<string, unknown>) || {};
          const bcState = (freshExtra.brand_creation as any) || null;
          const currentStep = bcState?.step || 0;
          const currentBrandId = bcState?.brand_id || null;
          let imagesReceived = bcState?.images_received || 0;

          const updateBcState = async (state: any) => {
            brandCreationStepResponse = state.step;
            // Reload latest extra_context before updating to avoid overwriting other fields
            const { data: latestCtx } = await svcCriar.from("ai_user_context").select("extra_context").eq("user_id", userId).single();
            const latestExtra = (latestCtx?.extra_context as Record<string, unknown>) || {};
            await svcCriar.from("ai_user_context").update({
              extra_context: { ...latestExtra, brand_creation: state },
            }).eq("user_id", userId);
          };

          const clearBcState = async (deleteBrand = false) => {
            // If deleteBrand=true, remove the orphan brand from DB
            if (deleteBrand && brandCreationState?.brand_id) {
              const orphanId = brandCreationState.brand_id;
              await svcCriar.from("brand_examples").delete().eq("brand_id", orphanId);
              await svcCriar.from("brands").delete().eq("id", orphanId).eq("owner_user_id", userId);
              console.log(`[ai-chat] Deleted orphan brand ${orphanId} on cancel`);
            }
            brandCreationStepResponse = 0;
            const extraNow = (await svcCriar
              .from("ai_user_context")
              .select("extra_context")
              .eq("user_id", userId)
              .single()).data?.extra_context as any || {};
            const { brand_creation: _, ...rest } = extraNow;
            await svcCriar.from("ai_user_context")
              .update({ extra_context: { ...rest, brand_creation: null } })
              .eq("user_id", userId);
          };

          const normalizeSpaces = (value: string) => value.replace(/\s+/g, " ").trim();

          const sanitizeBrandName = (raw: string): string | null => {
            const cleaned = normalizeSpaces(raw)
              .replace(/^["""'`´]+|["""'`´]+$/g, "")
              .replace(/[!?.,:;]+$/g, "")
              .trim();

            if (!cleaned || cleaned.length < 2 || cleaned.length > 60) return null;

            const lowered = cleaned.toLowerCase();
            const genericPatterns = [
              /^(marca|uma marca|minha marca|nova marca|marca nova)$/i,
              /^(quero|preciso|vamos|me ajuda).*(criar|fazer).*(marca)( nova)?$/i,
              /^criar( uma)? marca( nova)?$/i,
              /^(nova|novo)$/i,
              /^nome da marca$/i,
              /^sem nome$/i,
              /^(com|para|pra|de|do|da)\b/i,
              /^(quero|preciso|vamos|pode|me ajuda)\b/i,
              /\b(criar|fazer|montar)\b/i,
            ];

            if (genericPatterns.some((pattern) => pattern.test(lowered))) {
              return null;
            }

            return cleaned;
          };

          const extractExplicitBrandName = (input: string): string | null => {
            const text = normalizeSpaces(input);

            const quoted = text.match(/["""'`´]([^"""'`´]{2,60})["""'`´]/);
            if (quoted?.[1]) {
              const quotedName = sanitizeBrandName(quoted[1]);
              if (quotedName) return quotedName;
            }

            const patterns = [
              /(?:nome\s+da\s+marca\s*(?:é|:)\s*)([^\n,.!?]{2,60})/i,
              /(?:marca|empresa)\s+(?:chamad[ao]|com\s+nome\s*(?:de)?|nome\s*(?:é|:)?)\s*([^\n,.!?]{2,60})/i,
              /(?:criar|crie|quero\s+criar|vamos\s+criar)\s+(?:uma\s+)?marca\s+([^\n,.!?]{2,60})/i,
            ];

            for (const pattern of patterns) {
              const match = text.match(pattern);
              if (!match?.[1]) continue;

              const candidate = match[1]
                .replace(/\s+(com|e)\s+(cores?|paleta|estilo|tom|logo|identidade)\b[\s\S]*$/i, "")
                .trim();

              const parsed = sanitizeBrandName(candidate);
              if (parsed) return parsed;
            }

            return null;
          };

          // Cancel check — delete orphan brand from DB
          if (/\b(cancel|cancelar|parar|sair|desistir)\b/i.test(message) && currentStep > 0) {
            await clearBcState(true);
            replyOverride = "Ok, criação da marca cancelada. Como posso ajudar?";
            break;
          }

          // Restart check (when user asks to create a NEW brand while another flow is active)
          if (currentStep > 0 && /\b(nova marca|outra marca|criar outra|reiniciar|recomeçar|começar de novo|do zero)\b/i.test(message)) {
            await clearBcState(true);
            await updateBcState({ step: 1, brand_id: null, images_received: 0 });
            replyOverride = `Perfeito, vamos começar uma nova marca do zero.\n\n**Qual o nome da sua marca?**`;
            break;
          }

          // ── STEP 0: Initial detection ──
          if (currentStep === 0) {
            const explicitName = extractExplicitBrandName(message);

            if (!explicitName) {
              await updateBcState({ step: 1, brand_id: null, images_received: 0 });
              replyOverride = `🎨 Vamos criar sua marca!\n\n**Qual o nome da sua marca?**\nExemplo: *"Nova marca chamada Pulse Care"*\n\nSe tiver uma logo, pode enviar aqui também! (jpg, png) 📎`;
              break;
            }

            // Name is explicit: only extract optional colors/tone from CURRENT message
            const extractResp = await aiGatewayFetch({
                model: "google/gemini-2.5-flash-lite",
                messages: [{
                  role: "user",
                  content: `A marca já tem nome definido: "${explicitName}".\nExtraia SOMENTE da mensagem atual os dados opcionais de identidade visual.\nMensagem atual: "${message}"\nJSON: { "colors": ["#hex"] ou null, "visual_tone": "string ou null" }\nResponda APENAS JSON.`,
                }],
              });

            let extracted: any = {};
            if (extractResp.ok) {
              const d = await extractResp.json();
              const raw = d.choices?.[0]?.message?.content || "";
              const m = raw.match(/\{[\s\S]*\}/);
              if (m) extracted = JSON.parse(m[0]);
            }

            const palette = (extracted.colors || []).map((c: string) => ({ hex: c }));
            const { data: newBrand, error: brandErr } = await svcCriar.from("brands").insert({
              owner_user_id: userId,
              name: explicitName,
              palette: palette.length > 0 ? palette : [],
              visual_tone: extracted.visual_tone || "clean",
              fonts: { headings: "Inter", body: "Inter" },
            }).select("id, name").single();

            if (brandErr || !newBrand) {
              replyOverride = "Erro ao criar a marca. Tente novamente.";
              break;
            }

            if (imageUrls?.length > 0) {
              await svcCriar.from("brands").update({ logo_url: imageUrls[0] }).eq("id", newBrand.id);
            }

            // Always go to choice step (1.5) — let user choose examples vs manual
            await updateBcState({ step: 1.5, brand_id: newBrand.id, images_received: 0, mode: null });
            replyOverride = `✅ Marca **"${newBrand.name}"** criada!${imageUrls?.length ? " Logo recebida! ✨" : ""}\n\nComo prefere configurar a identidade visual?\n\n📸 **Enviar exemplos** — você envia posts/imagens que já usa ou que gosta, e a IA extrai automaticamente suas cores, estilo e padrões visuais _(recomendado)_\n\n✏️ **Preencher manualmente** — você informa as cores e estilo você mesmo`;
            quickReplies = ["📸 Enviar exemplos", "✏️ Preencher manualmente"];
            break;
          }

          // ── STEP 1: Name + Logo ──
          if (currentStep === 1) {
            const name = extractExplicitBrandName(message) || sanitizeBrandName(message);
            if (!name) {
              brandCreationStepResponse = 1;
              replyOverride = "Preciso do **nome real** da marca para continuar. Ex: *Pulse Care*";
              break;
            }

            const { data: newBrand, error: brandErr } = await svcCriar.from("brands").insert({
              owner_user_id: userId,
              name,
              palette: [],
              visual_tone: "clean",
              fonts: { headings: "Inter", body: "Inter" },
            }).select("id, name").single();

            if (brandErr || !newBrand) {
              replyOverride = "Erro ao criar a marca. Tente novamente.";
              break;
            }

            if (imageUrls?.length > 0) {
              await svcCriar.from("brands").update({ logo_url: imageUrls[0] }).eq("id", newBrand.id);
            }

            // Go to choice step (1.5) — brand mode selection
            await updateBcState({ step: 1.5, brand_id: newBrand.id, images_received: 0, mode: null });
            replyOverride = `✅ Marca **"${newBrand.name}"** criada!${imageUrls?.length ? " Logo recebida! ✨" : ""}\n\nEscolha o **modo de criação**:\n\n📸 **Minhas fotos como fundo** — suas fotos serão usadas como background dos posts\n\n🎨 **Copiar meu estilo visual** — envie referências e a IA copia seu estilo _(recomendado)_\n\n✨ **Começar do zero** — escolha entre estilos prontos\n\n🔍 **Me inspirar em outros** — envie referências para gerar algo inspirado`;
            quickReplies = ["📸 Minhas fotos", "🎨 Copiar estilo", "✨ Do zero", "🔍 Me inspirar"];
            break;
          }

          // ── STEP 1.5: Choice — brand mode ──
          if (currentStep === 1.5 && currentBrandId) {
            // Check if user wants to rename the brand
            const renameMatch = message.match(/(?:errei|errado|corrigir|renomear|mudar|trocar|alterar)\s*(?:o\s+)?(?:nome)?[^a-záéíóúãõâêîôûç]*(?:na verdade\s*(?:é|e)\s+|(?:para|pra)\s+)?(.+)/i)
              || message.match(/(?:na verdade|o nome)\s*(?:é|e)\s+(.+)/i);
            if (renameMatch?.[1]) {
              const newName = sanitizeBrandName(renameMatch[1].trim());
              if (newName) {
                await svcCriar.from("brands").update({ name: newName }).eq("id", currentBrandId);
                replyOverride = `✅ Nome atualizado para **"${newName}"**!\n\nEscolha o **modo de criação**:\n\n📸 **Minhas fotos como fundo** — suas fotos serão usadas como background dos posts\n\n🎨 **Copiar meu estilo visual** — envie referências e a IA copia seu estilo _(recomendado)_\n\n✨ **Começar do zero** — escolha entre estilos prontos\n\n🔍 **Me inspirar em outros** — envie referências para gerar algo inspirado`;
                quickReplies = ["📸 Minhas fotos", "🎨 Copiar estilo", "✨ Do zero", "🔍 Me inspirar"];
                break;
              }
            }

            const msg = message.toLowerCase();
            const wantsPhotoBg = /\b(minhas fotos|foto.*fundo|fundo.*foto|fotos como|📸)\b/i.test(message);
            const wantsFromScratch = /\b(zero|do zero|template|começar|sistema|✨)\b/i.test(message);
            const wantsInspired = /\b(inspirar|inspiração|outros|referência.*inspirar|liberdade|🔍)\b/i.test(message);
            const wantsStyleCopy = /\b(copiar|estilo|exemplo|imagem|imagens|ia|automát|recomendar|🎨)\b/i.test(message);

            let chosenMode: string | null = null;
            if (wantsPhotoBg) chosenMode = "photo_backgrounds";
            else if (wantsFromScratch) chosenMode = "from_scratch";
            else if (wantsInspired) chosenMode = "inspired";
            else if (wantsStyleCopy) chosenMode = "style_copy";

            if (chosenMode) {
              // Set creation_mode and default_visual_style together
              const visualStyleMap: Record<string, string | null> = {
                photo_backgrounds: "photo_overlay",
                style_copy: "ai_background",
                inspired: "ai_background",
                from_scratch: null, // user chooses each time
              };
              await svcCriar.from("brands").update({
                creation_mode: chosenMode,
                default_visual_style: visualStyleMap[chosenMode] ?? null,
              }).eq("id", currentBrandId);

              if (chosenMode === "photo_backgrounds") {
                await updateBcState({ step: 3, brand_id: currentBrandId, images_received: 0, mode: "photo_backgrounds" });
                replyOverride = `📸 Ótimo! Envie as **fotos que quer usar como fundo** dos seus posts.\n\nEnvie de **1 a 10 fotos** usando o botão 📎.\nEssas imagens serão usadas diretamente como background!\n\n_Digite **pronto** quando terminar._`;
                break;
              }

              if (chosenMode === "style_copy") {
                await updateBcState({ step: 2.5, brand_id: currentBrandId, images_received: 0, mode: "examples" });
                replyOverride = `Ótima escolha! Antes de enviar os exemplos, uma pergunta rápida (opcional):\n\n🎨 **Tem alguma preferência visual para seus posts?**\nEx: "quero mockups de celular", "texto dentro de cards", "fundo com gradiente"\n\nOu digite **pular** para ir direto aos exemplos.`;
                quickReplies = ["Pular", "Mockups de celular", "Texto em cards", "Fundos com foto", "Elementos abstratos"];
                break;
              }

              if (chosenMode === "from_scratch") {
                await updateBcState({ step: 5, brand_id: currentBrandId, images_received: 0, mode: "from_scratch" });
                replyOverride = `✨ Vamos começar do zero!\n\nEscolha um estilo visual base:\n\n1️⃣ **Minimalista** — limpo, elegante\n2️⃣ **Colorido** — vibrante, chamativo\n3️⃣ **Sofisticado** — tons escuros, premium\n4️⃣ **Moderno** — gradientes, tech\n5️⃣ **Orgânico** — texturas naturais`;
                quickReplies = ["1️⃣ Minimalista", "2️⃣ Colorido", "3️⃣ Sofisticado", "4️⃣ Moderno", "5️⃣ Orgânico"];
                break;
              }

              if (chosenMode === "inspired") {
                await updateBcState({ step: 2.5, brand_id: currentBrandId, images_received: 0, mode: "inspired" });
                replyOverride = `🔍 Legal! Antes de enviar referências, uma pergunta rápida (opcional):\n\n🎨 **Tem alguma preferência visual?**\nEx: "minimalista", "cores vibrantes", "editorial"\n\nOu digite **pular** para ir direto.`;
                quickReplies = ["Pular", "Minimalista", "Cores vibrantes", "Editorial", "Dark mode"];
                break;
              }
            }

            brandCreationStepResponse = 1.5;
            replyOverride = `Escolha uma das opções abaixo para continuar:\n\n📸 **Minhas fotos como fundo**\n🎨 **Copiar meu estilo visual** _(recomendado)_\n✨ **Começar do zero**\n🔍 **Me inspirar em outros**\n\n_Se quiser corrigir o nome da marca, diga: "o nome é ..."_`;
            quickReplies = ["📸 Minhas fotos", "🎨 Copiar estilo", "✨ Do zero", "🔍 Me inspirar"];
            break;
          }

          // ── STEP 2.5: Visual Preferences (optional) ──
          if (currentStep === 2.5 && currentBrandId) {
            const skipPrefs = /\b(pular|skip|próximo|proximo|continuar|não|nao|sem preferência|padrão|padrao)\b/i.test(message);

            if (!skipPrefs) {
              // Parse user preferences via AI
              const prefResp = await aiGatewayFetch({
                  model: "google/gemini-2.5-flash-lite",
                  messages: [{
                    role: "user",
                    content: `O usuário descreveu preferências visuais para sua marca: "${message}"\n\nExtraia em JSON:\n{\n  "phone_mockup": true/false/null,\n  "body_in_card": true/false/null,\n  "inner_frame": true/false/null,\n  "waves": true/false/null,\n  "abstract_elements": true/false/null,\n  "photo_backgrounds": true/false/null,\n  "gradient_backgrounds": true/false/null,\n  "preferred_bg_mode": "gradient"|"photo"|"solid"|"illustration"|null,\n  "custom_notes": "observação livre do usuário ou null"\n}\n\nRegras:\n- phone_mockup = mockups de celular/notebook/dispositivo\n- body_in_card = texto dentro de caixas/cards\n- inner_frame = moldura decorativa ao redor\n- waves = elementos ondulados/curvos\n- abstract_elements = formas abstratas/geométricas\n- photo_backgrounds = fotos como fundo\n- gradient_backgrounds = gradientes como fundo\n- null = usuário não mencionou\n- custom_notes = qualquer preferência que não se encaixe nos campos acima\n\nResponda APENAS JSON.`,
                  }],
                });

              let visualPrefs: Record<string, any> = {};
              if (prefResp.ok) {
                const d = await prefResp.json();
                const raw = d.choices?.[0]?.message?.content || "";
                const m = raw.match(/\{[\s\S]*\}/);
                if (m) {
                  visualPrefs = JSON.parse(m[0]);
                  // Remove null values
                  for (const key of Object.keys(visualPrefs)) {
                    if (visualPrefs[key] === null) delete visualPrefs[key];
                  }
                }
              }

              if (Object.keys(visualPrefs).length > 0) {
                await svcCriar.from("brands").update({ visual_preferences: visualPrefs }).eq("id", currentBrandId);
                console.log(`[ai-chat] CRIAR_MARCA step 2.5: saved visual_preferences:`, JSON.stringify(visualPrefs));
              }
            }

            await updateBcState({ step: 3, brand_id: currentBrandId, images_received: 0 });
            replyOverride = `${skipPrefs ? "Ok, vamos usar as configurações padrão! " : "✅ Preferências visuais salvas! "}📸\n\nAgora envie de **3 a 8 exemplos** de posts, stories ou carrosséis que você já criou ou que gosta.\nQuanto mais exemplos, melhor a IA entende seu estilo visual!\n\n_Use o botão 📎 para enviar imagens ou digite **pronto** quando terminar._`;
            break;
          }

          // ── STEP 2: Colors + Visual Tone ──
          if (currentStep === 2 && currentBrandId) {
            const colorResp = await aiGatewayFetch({
                model: "google/gemini-2.5-flash",
                messages: [{
                  role: "user",
                  content: `O usuário descreveu cores e estilo para sua marca: "${message}"\nExtraia as cores em hex e o tom visual. Se descreveu com palavras (ex: "azul escuro"), converta para hex.\nJSON: { "colors": ["#hex1", "#hex2"], "visual_tone": "clean|editorial|tech|luxury|playful|organic" }\nTons: clean=minimalista, editorial=editorial, tech=futurista/moderno, luxury=sofisticado/elegante, playful=jovem/divertido, organic=natural.\nResponda APENAS JSON.`,
                }],
              });

            let colors: string[] = [];
            let tone = "clean";
            if (colorResp.ok) {
              const d = await colorResp.json();
              const raw = d.choices?.[0]?.message?.content || "";
              const m = raw.match(/\{[\s\S]*\}/);
              if (m) {
                const parsed = JSON.parse(m[0]);
                colors = parsed.colors || [];
                tone = parsed.visual_tone || "clean";
              }
            }

            const palette = colors.map((c) => ({ hex: c }));
            await svcCriar.from("brands").update({
              palette: palette.length > 0 ? palette : [{ hex: "#1a1a2e" }, { hex: "#16213e" }],
              visual_tone: tone,
            }).eq("id", currentBrandId);

            await updateBcState({ step: 2.5, brand_id: currentBrandId, images_received: 0 });
            const colorDisplay = colors.length > 0 ? colors.join(", ") : "paleta padrão";
            replyOverride = `✅ Identidade visual salva!\n🎨 Cores: ${colorDisplay}\n🖌️ Estilo: ${tone}\n\nAntes de enviar exemplos, uma pergunta rápida (opcional):\n\n🎨 **Tem alguma preferência visual para seus posts?**\nEx: "quero mockups de celular", "texto dentro de cards", "fundo com gradiente"\n\nOu digite **pular** para ir direto aos exemplos.`;
            quickReplies = ["Pular", "Mockups de celular", "Texto em cards", "Fundos com foto", "Elementos abstratos"];
            break;
          }

          // ── STEP 3: Reference Images ──
          if (currentStep === 3 && currentBrandId) {
            const isPronto = /\b(pronto|pront[oa]|ponto|finalizar|done|gerar|analisar|continuar)\b/i.test(message);

            const bcMode = brandCreationState?.mode || "examples";
            const imgPurpose = bcMode === "photo_backgrounds" ? "background" : "reference";

            if (imageUrls?.length > 0) {
              for (const iurl of imageUrls) {
                await svcCriar.from("brand_examples").insert({
                  brand_id: currentBrandId,
                  image_url: iurl,
                  type: "post",
                  subtype: imgPurpose,
                  purpose: imgPurpose,
                });
                imagesReceived++;
              }
              await updateBcState({ step: 3, brand_id: currentBrandId, images_received: imagesReceived });
              console.log(`[ai-chat] CRIAR_MARCA step 3: received ${imageUrls.length} images (purpose=${imgPurpose}), total: ${imagesReceived}`);

              const minImages = bcMode === "photo_backgrounds" ? 1 : 3;
              if (imagesReceived < 10 && !isPronto) {
                replyOverride = `✅ ${imagesReceived === 1 ? "1 imagem recebida" : `${imagesReceived} imagens recebidas`}! ${imagesReceived >= minImages ? "Pode enviar mais ou digitar **pronto** para continuar." : `Pode enviar mais (mínimo ${minImages}).`}`;
                break;
              }
            }

            if (isPronto || imagesReceived >= 10) {
              if (imagesReceived < 1) {
                brandCreationStepResponse = 3;
                replyOverride = "Envie pelo menos **1 imagem** para continuar. 📸";
                break;
              }

              // photo_backgrounds: no analysis needed, brand is ready immediately
              if (bcMode === "photo_backgrounds") {
                await clearBcState();
                replyOverride = `✅ Perfeito! ${imagesReceived} ${imagesReceived === 1 ? "foto salva" : "fotos salvas"} como fundo!\n\nSua marca está pronta para criar conteúdo. 🎉\nSuas fotos serão usadas automaticamente como background dos posts.\n\nDigite **criar conteúdo** ou clique abaixo para começar!`;
                quickReplies = ["📱 Criar um post", "📚 Criar carrossel", "📱 Criar story"];
                break;
              }

              // style_copy / inspired: run analysis
              await updateBcState({ step: 4, brand_id: currentBrandId, images_received: imagesReceived });

              // Return immediately — client will fire CRIAR_MARCA_ANALYZE in a separate request
              const imgLabel = bcMode === "photo_backgrounds" ? "fotos" : "referências";
              replyOverride = `🔍 Analisando suas ${imagesReceived} ${imgLabel} e criando sua identidade visual...\n\nIsso leva cerca de 1 minuto. Você receberá uma notificação aqui quando estiver pronto! ✨`;
              brandCreationStepResponse = 4;
              actionResult = { brand_id: currentBrandId, trigger_analyze: true };
              break;
            }

            if (!imageUrls?.length && !isPronto) {
              // Skip duplicate reply if this is an auto-generated image upload message
              if (/^(Enviando|📎)\s+\d+\s+imagem/i.test(message)) {
                break;
              }
              brandCreationStepResponse = 3;
              const minImages = bcMode === "photo_backgrounds" ? 1 : 3;
              replyOverride = imagesReceived > 0
                ? `Você já enviou ${imagesReceived} ${imagesReceived === 1 ? "imagem" : "imagens"}. Envie mais ou digite **pronto** para ${imagesReceived >= minImages ? "continuar" : `completar (mínimo ${minImages})`}. 📸`
                : bcMode === "photo_backgrounds"
                  ? `Envie suas fotos usando o botão 📎 abaixo. Essas imagens serão usadas como fundo dos posts!`
                  : `Envie exemplos de posts, stories ou carrosséis usando o botão 📎 abaixo. Mínimo 3 imagens para melhor resultado!`;
            }
            break;
          }

          // Step 4: Already analyzing
          if (currentStep === 4) {
            replyOverride = "Ainda estou analisando suas referências... ⏳ Aguarde um momento.";
            break;
          }

          // ── STEP 5: From Scratch — style gallery ──
          if (currentStep === 5 && currentBrandId) {
            const styleMap: Record<string, { visual_tone: string; palette: any[] }> = {
              "1": { visual_tone: "clean", palette: [{ hex: "#FFFFFF" }, { hex: "#1A1A2E" }, { hex: "#E2E2E2" }] },
              "minimalista": { visual_tone: "clean", palette: [{ hex: "#FFFFFF" }, { hex: "#1A1A2E" }, { hex: "#E2E2E2" }] },
              "2": { visual_tone: "playful", palette: [{ hex: "#FF6B6B" }, { hex: "#4ECDC4" }, { hex: "#FFE66D" }, { hex: "#2C3E50" }] },
              "colorido": { visual_tone: "playful", palette: [{ hex: "#FF6B6B" }, { hex: "#4ECDC4" }, { hex: "#FFE66D" }, { hex: "#2C3E50" }] },
              "3": { visual_tone: "luxury", palette: [{ hex: "#1A1A2E" }, { hex: "#C9A96E" }, { hex: "#F5F5F0" }] },
              "sofisticado": { visual_tone: "luxury", palette: [{ hex: "#1A1A2E" }, { hex: "#C9A96E" }, { hex: "#F5F5F0" }] },
              "4": { visual_tone: "tech", palette: [{ hex: "#0F0F23" }, { hex: "#00D4FF" }, { hex: "#7B2FFF" }, { hex: "#FFFFFF" }] },
              "moderno": { visual_tone: "tech", palette: [{ hex: "#0F0F23" }, { hex: "#00D4FF" }, { hex: "#7B2FFF" }, { hex: "#FFFFFF" }] },
              "5": { visual_tone: "organic", palette: [{ hex: "#5D4E37" }, { hex: "#8B9D77" }, { hex: "#F5E6D3" }, { hex: "#2D3B2D" }] },
              "orgânico": { visual_tone: "organic", palette: [{ hex: "#5D4E37" }, { hex: "#8B9D77" }, { hex: "#F5E6D3" }, { hex: "#2D3B2D" }] },
              "organico": { visual_tone: "organic", palette: [{ hex: "#5D4E37" }, { hex: "#8B9D77" }, { hex: "#F5E6D3" }, { hex: "#2D3B2D" }] },
            };

            const key = message.replace(/[️⃣\uFE0F\u20E3]/g, "").trim().toLowerCase();
            const match = styleMap[key] || styleMap[key.charAt(0)];

            if (match) {
              await svcCriar.from("brands").update({
                visual_tone: match.visual_tone,
                palette: match.palette,
              }).eq("id", currentBrandId);

              await clearBcState();
              replyOverride = `✅ Estilo **${match.visual_tone}** aplicado!\n\nSua marca está pronta. 🎉\n\nQuer criar um post agora?`;
              quickReplies = ["📱 Criar um post", "📚 Criar carrossel", "📱 Criar story"];
              break;
            }

            brandCreationStepResponse = 5;
            replyOverride = `Não reconheci o estilo. Escolha um número:\n\n1️⃣ Minimalista\n2️⃣ Colorido\n3️⃣ Sofisticado\n4️⃣ Moderno\n5️⃣ Orgânico`;
            quickReplies = ["1️⃣ Minimalista", "2️⃣ Colorido", "3️⃣ Sofisticado", "4️⃣ Moderno", "5️⃣ Orgânico"];
            break;
          }

        } catch (e: any) {
          console.error("[ai-chat] CRIAR_MARCA error:", e?.message);
          replyOverride = "Erro ao processar criação da marca. Tente novamente.";
        }
        break;
      }

      // ════════════════════════════════════════════════════════════════════════
      // CRIAR_MARCA_ANALYZE — Brand analysis (preserved from original)
      // ════════════════════════════════════════════════════════════════════════
      case "CRIAR_MARCA_ANALYZE": {
        // Dedicated intent for brand analysis — runs in its own edge function invocation
        // so the runtime stays alive until completion (no fire-and-forget).
        const analyzeBrandId = generationParams?.brandId;
        if (!analyzeBrandId) {
          replyOverride = "brandId é obrigatório para CRIAR_MARCA_ANALYZE.";
          break;
        }

        const svcAnalyze = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        const analyzeHeaders = internalHeaders;

        let templateCount = 0;
        let analyzeOk = false;

        const fetchWithTimeout = async (url: string, opts: RequestInit, label: string) => {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 60000);
          try {
            const resp = await fetch(url, { ...opts, signal: controller.signal });
            clearTimeout(timer);
            return resp;
          } catch (err: any) {
            clearTimeout(timer);
            if (err.name === "AbortError") {
              console.error(`[CRIAR_MARCA_ANALYZE] timeout em ${label} (60s)`);
            } else {
              console.error(`[CRIAR_MARCA_ANALYZE] ${label} error:`, err.message);
            }
            return null;
          }
        };

        // 1. analyze-brand-examples
        try {
          const analyzeResp = await fetchWithTimeout(
            `${supabaseUrl}/functions/v1/analyze-brand-examples`,
            { method: "POST", headers: analyzeHeaders, body: JSON.stringify({ brandId: analyzeBrandId }) },
            "analyze-brand-examples",
          );
          if (analyzeResp?.ok) {
            const analyzeData = await analyzeResp.json();
            console.log(`[CRIAR_MARCA_ANALYZE] analyze done, preset: ${analyzeData?.styleGuide?.style_preset}`);
            analyzeOk = true;
            const extractedPalette = analyzeData?.styleGuide?.brand_tokens?.palette_roles;
            if (extractedPalette) {
              const paletteArray = Object.values(extractedPalette)
                .filter((c: any) => typeof c === "string" && c.startsWith("#"))
                .map((c: any) => ({ hex: c }));
              if (paletteArray.length > 0) {
                await svcAnalyze.from("brands").update({ palette: paletteArray }).eq("id", analyzeBrandId);
              }
            }
          } else {
            console.error(`[CRIAR_MARCA_ANALYZE] analyze failed: ${analyzeResp?.status || "no response"}`);
          }
        } catch (err: any) {
          console.error("[CRIAR_MARCA_ANALYZE] analyze-brand-examples error:", err?.message);
        }

        // 2. generate-template-sets
        try {
          console.log(`[CRIAR_MARCA_ANALYZE] generating template sets`);
          const genTsResp = await fetchWithTimeout(
            `${supabaseUrl}/functions/v1/generate-template-sets`,
            { method: "POST", headers: analyzeHeaders, body: JSON.stringify({ brandId: analyzeBrandId }) },
            "generate-template-sets",
          );
          if (genTsResp?.ok) {
            const genTsData = await genTsResp.json();
            templateCount = genTsData?.created?.length || genTsData?.templateSets?.length || 1;
            console.log(`[CRIAR_MARCA_ANALYZE] template sets generated: ${templateCount}`);
          } else {
            console.error(`[CRIAR_MARCA_ANALYZE] generate-template-sets failed: ${genTsResp?.status || "no response"}`);
          }
        } catch (err: any) {
          console.error("[CRIAR_MARCA_ANALYZE] generate-template-sets error:", err?.message);
        }

        // 3. ALWAYS clear brand_creation state
        try {
          await svcAnalyze.from("ai_user_context").update({
            extra_context: { brand_creation: null },
          }).eq("user_id", userId);
        } catch (e: any) {
          console.error("[CRIAR_MARCA_ANALYZE] clearBcState error:", e?.message);
        }

        // 4. ALWAYS notify user via chat_messages (Realtime)
        try {
          const { data: finalBrand } = await svcAnalyze.from("brands")
            .select("name, palette, visual_tone, style_guide")
            .eq("id", analyzeBrandId).single();

          const paletteColors = ((finalBrand?.palette as any[]) || [])
            .map((c: any) => typeof c === "string" ? c : c?.hex || "").filter(Boolean);
          const detectedPreset = (finalBrand?.style_guide as any)?.style_preset || "personalizado";
          const statusNote = !analyzeOk ? "\n\n_A análise automática teve problemas, mas sua marca está pronta para uso._" : "";

          await svcAnalyze.from("chat_messages").insert({
            user_id: userId,
            role: "assistant",
            content: `✅ Sua marca **${finalBrand?.name || ""}** está pronta!${statusNote}\n\n🎨 **Paleta:** ${paletteColors.join(", ") || "padrão"}\n🖌️ **Estilo detectado:** ${detectedPreset}\n📐 **Templates criados:** ${templateCount}\n\nQuer criar um post usando essa marca agora? 🚀`,
            intent: "CRIAR_MARCA_DONE",
            metadata: {
              brand_id: analyzeBrandId,
              action_result: { navigate_to: `/brands/${analyzeBrandId}/edit` },
              quick_replies: ["📱 Criar um post", "📚 Criar carrossel", "🎨 Editar marca"],
            },
          });
          console.log(`[CRIAR_MARCA_ANALYZE] done, notified user (analyzeOk=${analyzeOk})`);
        } catch (notifyErr: any) {
          console.error("[CRIAR_MARCA_ANALYZE] failed to notify user:", notifyErr?.message);
          await svcAnalyze.from("chat_messages").insert({
            user_id: userId,
            role: "assistant",
            content: `⚠️ A marca foi criada, mas houve um erro na análise. Você pode editar manualmente.`,
            intent: "CRIAR_MARCA_DONE",
            metadata: { brand_id: analyzeBrandId, action_result: { navigate_to: `/brands/${analyzeBrandId}/edit` } },
          }).then(() => {});
        }

        // Return minimal — notification goes via Realtime
        replyOverride = "Análise em andamento...";
        break;
      }

      // ════════════════════════════════════════════════════════════════════════
      // ATUALIZAR_PERFIL — Update user profile (preserved from original)
      // ════════════════════════════════════════════════════════════════════════
      case "ATUALIZAR_PERFIL": {
        try {
          // Use AI to extract what the user wants to update
          const extractResp = await aiGatewayFetch({
              model: "google/gemini-2.5-flash-lite",
              messages: [{ role: "user", content: `O usuário quer atualizar seu perfil. Extraia EXATAMENTE o que ele quer mudar.

Se ele NÃO especificou o novo valor (ex: "quero mudar meu nicho" sem dizer para qual), retorne:
{"field":"unknown","value":"","action":"ask"}

Se ele especificou (ex: "meu nicho agora é Marketing Digital"), retorne:
{"field":"business_niche","value":"Marketing Digital","action":"set"}

Campos possíveis: business_niche, brand_voice, content_topics, instagram_handle
Ações: set (definir), add (adicionar a lista), remove (remover de lista), ask (precisa perguntar)

NUNCA invente um valor. Se não está claro, use action "ask".

Mensagem: "${message}"` }],
            });
          if (extractResp.ok) {
            const extractData = await extractResp.json();
            const raw = extractData.choices?.[0]?.message?.content || "";
            const jsonMatch = raw.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              const { field, value, action } = parsed;
              const allowedFields = ["business_niche", "brand_voice", "content_topics", "instagram_handle"];
              if (action === "ask" || !value || value === "novo valor") {
                const fieldLabels: Record<string, string> = { business_niche: "nicho", brand_voice: "tom de voz", content_topics: "temas", instagram_handle: "Instagram" };
                replyOverride = `Para qual ${fieldLabels[field] || "valor"} você quer mudar? Me diga especificamente, por exemplo: "meu nicho é Marketing Digital".`;
              } else if (field && allowedFields.includes(field) && value) {
                if (field === "content_topics") {
                  const { data: ctxData } = await supabase.from("ai_user_context").select("content_topics").eq("user_id", userId).maybeSingle();
                  let topics = ctxData?.content_topics || [];
                  if (action === "add") {
                    const newTopics = value.split(/[,;]/).map((t: string) => t.trim()).filter(Boolean);
                    topics = [...new Set([...topics, ...newTopics])];
                  } else if (action === "remove") {
                    topics = topics.filter((t: string) => !t.toLowerCase().includes(value.toLowerCase()));
                  } else {
                    topics = value.split(/[,;]/).map((t: string) => t.trim()).filter(Boolean);
                  }
                  await supabase.from("ai_user_context").update({ content_topics: topics }).eq("user_id", userId);
                  replyOverride = `Pronto! Atualizei seus temas de conteúdo: ${topics.join(", ")}. ✅\nOs próximos conteúdos já vão usar esse contexto.`;
                } else {
                  await supabase.from("ai_user_context").update({ [field]: value }).eq("user_id", userId);
                  const fieldLabels: Record<string, string> = { business_niche: "nicho", brand_voice: "tom de voz", instagram_handle: "Instagram" };
                  replyOverride = `Pronto! Atualizei seu ${fieldLabels[field] || field} para "${value}". ✅\nOs próximos conteúdos já vão usar esse contexto.`;
                }
              } else {
                replyOverride = "Não consegui identificar o que você quer atualizar. Tente algo como: \"meu nicho agora é Marketing Digital\" ou \"adiciona Vendas nos meus temas\".";
              }
            }
          }
          if (!replyOverride) {
            replyOverride = "Não consegui processar a atualização. Tente ser mais específico, por exemplo: \"meu nicho é Tecnologia\".";
          }
        } catch (e: any) {
          console.error("[ai-chat] ATUALIZAR_PERFIL error:", e?.message);
          replyOverride = "Erro ao atualizar perfil. Tente novamente.";
        }
        break;
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Generate AI response for free conversation (CHAT intent)
    // ══════════════════════════════════════════════════════════════════════════
    let reply: string;

    if (replyOverride) {
      reply = replyOverride;
    } else {
      const aiMessages = [
        { role: "system", content: systemPrompt },
        ...(history || []).map((m: any) => ({ role: m.role, content: m.content })),
        { role: "user", content: message },
      ];

      const aiResponse = await aiGatewayFetch({
          model: "openrouter/minimax-m-25",
          messages: aiMessages,
        });

      if (!aiResponse.ok) {
        if (aiResponse.status === 429) {
          return new Response(
            JSON.stringify({ error: "Rate limit excedido. Tente novamente em alguns segundos." }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        if (aiResponse.status === 402) {
          return new Response(
            JSON.stringify({ error: "Créditos insuficientes. Adicione créditos na sua conta." }),
            { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        const errorText = await aiResponse.text();
        console.error("[ai-chat] AI error:", aiResponse.status, errorText);
        throw new Error(`AI request failed: ${aiResponse.status}`);
      }

      const aiData = await aiResponse.json();
      reply = aiData.choices?.[0]?.message?.content || "Desculpe, não consegui processar sua mensagem.";
    }

    // ── Contextual tips for CHAT intent ──
    const TIPS = [
      "\n\n💡 Sabia que você pode colar um link aqui e eu crio um post?",
      "\n\n📅 Quer ver o que está agendado? É só me perguntar!",
      "\n\n🎨 Posso criar posts, carrosséis ou stories — é só pedir!",
      "\n\n🔗 Cole qualquer link de notícia e eu transformo em conteúdo!",
    ];

    if (detectedIntent === "CHAT") {
      const wordCount = message.trim().split(/\s+/).length;
      const historyHasTip = (history || []).some((m: any) => m.role === "assistant" && /💡|🔗 Cole qualquer/.test(m.content));
      if (wordCount < 10 && !historyHasTip) {
        const randomTip = TIPS[Math.floor(Math.random() * TIPS.length)];
        reply += randomTip;
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Save messages to chat_messages
    // ══════════════════════════════════════════════════════════════════════════
    const INTERNAL_INTENTS = ["CRIAR_MARCA_ANALYZE"];
    const isInternalMessage = INTERNAL_INTENTS.includes(message) || INTERNAL_INTENTS.includes(message?.trim());

    try {
      const messagesToInsert: any[] = [];

      // Only save user message if it's real user input (not an internal trigger)
      if (!isInternalMessage) {
        messagesToInsert.push({ user_id: userId, role: "user", content: message });
      }

      // Always save assistant reply (unless it's empty)
      if (reply) {
        messagesToInsert.push({
          user_id: userId,
          role: "assistant",
          content: reply,
          intent: detectedIntent,
          metadata: actionResult ? { action_result: actionResult, quick_replies: quickReplies } : quickReplies ? { quick_replies: quickReplies } : {},
        });
      }

      if (messagesToInsert.length > 0) {
        await supabase.from("chat_messages").insert(messagesToInsert);
      }
    } catch (saveErr) {
      console.error("[ai-chat] Error saving messages:", saveErr);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Return response
    // ══════════════════════════════════════════════════════════════════════════
    return new Response(
      JSON.stringify({
        reply,
        intent: detectedIntent,
        action_result: actionResult,
        quick_replies: quickReplies,
        brand_creation_step: brandCreationStepResponse,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("[ai-chat] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
