import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchAI } from "../_shared/ai-gateway.ts";
import { buildBrandContext, brandTextLimits } from "../_shared/brand-context.ts";
import { parseLlmJson } from "../_shared/llm-json.ts";
import { clampSlides, normalizeHashtags, enforceTweetLimit, truncateToChars } from "../_shared/content-validators.ts";

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

// ──────────────────────────────────────────────────────────────────────────────
// URL article extraction
// Handles Google redirect wrappers (google.com/url?url=... or ?q=...) and
// uses Firecrawl when available for clean content extraction.
// ──────────────────────────────────────────────────────────────────────────────
function unwrapUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    // Google redirect: /url?url=... or ?q=...
    if (/(^|\.)google\.[^/]+$/i.test(u.hostname) && u.pathname === "/url") {
      const inner = u.searchParams.get("url") || u.searchParams.get("q");
      if (inner && /^https?:\/\//i.test(inner)) return inner;
    }
    return rawUrl;
  } catch {
    return rawUrl;
  }
}

async function extractArticleContent(rawUrl: string, tag: string): Promise<string> {
  const url = unwrapUrl(rawUrl);
  console.log(`[ai-chat] ${tag}: fetching URL ${url}${url !== rawUrl ? " (unwrapped from Google redirect)" : ""}`);
  const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");

  // 1) Try Firecrawl (best quality)
  if (firecrawlKey) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const fcResp = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${firecrawlKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (fcResp.ok) {
        const data = await fcResp.json();
        const md = (data?.data?.markdown || data?.markdown || "").toString().trim();
        if (md.length > 200) {
          console.log(`[ai-chat] ${tag}: Firecrawl extracted ${md.length} chars`);
          return md.substring(0, 4000);
        }
        console.warn(`[ai-chat] ${tag}: Firecrawl returned only ${md.length} chars, falling back`);
      } else {
        console.warn(`[ai-chat] ${tag}: Firecrawl status ${fcResp.status}`);
      }
    } catch (err: any) {
      console.warn(`[ai-chat] ${tag}: Firecrawl failed:`, err?.message);
    }
  }

  // 2) Fallback: direct fetch with redirect follow + browser UA
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) {
      console.warn(`[ai-chat] ${tag}: fetch status ${resp.status}`);
      return "";
    }
    const html = await resp.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    // Página bloqueada/JS-shell costuma devolver pouco texto (menu/login). Trata como FALHA —
    // assim o "" vira sinal confiável de "não li" e o guard anti-invenção pode pedir o texto.
    if (text.length < 300) {
      console.warn(`[ai-chat] ${tag}: HTML fetch só ${text.length} chars (provável página bloqueada/JS) — tratando como falha`);
      return "";
    }
    console.log(`[ai-chat] ${tag}: HTML fetch extracted ${text.length} chars`);
    return text.substring(0, 4000);
  } catch (err: any) {
    console.warn(`[ai-chat] ${tag}: HTML fetch failed:`, err?.message);
    return "";
  }
}

// Strong safe-area rules to prevent text being cropped at edges.
// Linguagem que um modelo de difusão obedece: % relativo (não px — ele não tem régua),
// teto de LARGURA DE LINHA (é o que faz a letra da ponta sangrar) e regra de quebra de linha.
const SAFE_AREA_RULES = `SAFE AREA — REGRA INVIOLÁVEL (texto cortado = FALHA GRAVE):
- Imagine uma moldura invisível a 15% de distância de CADA borda (topo, base, esquerda, direita). TODO texto, número e logo vive 100% DENTRO dessa moldura, com respiro visível até a borda.
- A largura de QUALQUER linha de texto é no MÁXIMO 70% da largura da imagem. Se uma palavra ou frase não couber nesse limite, QUEBRE em mais de uma linha — NUNCA estique a palavra até a borda.
- PROIBIDO: qualquer letra cortada, encostada ou sangrando na borda. A PRIMEIRA e a ÚLTIMA letra de cada linha precisam de espaço claro até a lateral.
- Na dúvida entre "fonte grande/impactante" e "texto que cabe inteiro", SEMPRE escolha a fonte menor. Caber inteiro vence impacto.
- Centralize horizontalmente os blocos de texto para garantir margem igual nos dois lados.`;

// Prevents Gemini from generating UI screenshots instead of the actual design content
const NO_UI_MOCKUP_RULE = `PROIBIDO ABSOLUTO — NUNCA gere screenshots, prints, mockups ou simulações de interface de rede social. Não mostre o app do Instagram, TikTok, Twitter, LinkedIn ou qualquer plataforma. Não inclua elementos de UI da plataforma: feed, header de perfil (foto + nome + seguidores), botão "Turbinar post", curtidas, comentários, barra de stories, notificações, frame de celular.

PROIBIDO ABSOLUTO — NUNCA renderize a arte como um OBJETO FÍSICO 3D ou foto de produto: nada de livro, caderno, diário, agenda, revista, folha de papel, cartão impresso, pôster numa parede, moldura, quadro, embalagem, tablet ou celular. SEM perspectiva 3D, SEM lombada, SEM sombra de objeto, SEM cena de mesa/superfície ao redor.

A imagem gerada É o conteúdo final — uma ARTE GRÁFICA CHAPADA (flat design), 2D, vista totalmente de frente. Ela DEVE preencher 100% do quadro (full-bleed): o fundo/arte sangra até TODAS as bordas, sem nenhuma margem de cor sólida, sem moldura e sem espaço vazio em volta. Não é uma prévia de como ficaria dentro de um app nem a foto de um objeto.`;

// Marcas COM referência de estilo: a ref manda no look; aqui só garantimos que não vire texto puro.
const VISUAL_RICHNESS_RULE = `RECURSO VISUAL (além do texto): inclua ALGUNS elementos ilustrativos relevantes ao tema — ícones, uma ilustração central simples (ex.: órgão, objeto ou símbolo do assunto) ou formas que comuniquem a ideia visualmente. Com MODERAÇÃO: o objetivo é NÃO ser só texto, mas sem poluir nem virar uma cena complexa demais. O texto continua legível e protagonista; a ilustração apoia a mensagem.`;

// SEM âncora de estilo (marca from_scratch — ex.: a "Inovações em Saúde" do Maikon — ou post sem
// marca): não há referência definindo o look, então o padrão era um card seco de texto. Maikon pediu
// posts ILUSTRADOS, com itens/elementos do tema. Aqui empurramos forte pra ilustração de verdade.
const ILLUSTRATION_FORWARD_RULE = `ESTILO ILUSTRADO (PRIORIDADE ALTA): este post deve ser uma peça VISUAL rica, NÃO um card só de texto sobre fundo liso. Componha um elemento-herói claro do tema (ex.: um órgão, alimento, equipamento, pessoa estilizada, cenário ou símbolo do assunto) acompanhado de ALGUNS elementos/itens de apoio (ícones, objetos, formas) que reforçam a mensagem. O herói pode ser uma ilustração (vetorial/editorial/flat com profundidade) OU um render realista/3D do tema — o que comunicar melhor; evite apenas o card seco de texto. A arte comunica o tema; o texto fica integrado à composição, curto e legível, convivendo com a imagem (nunca sozinho num fundo vazio). Mantenha equilíbrio: rico em elementos, mas sem poluir.`;

// A marca tem direção de estilo PRÓPRIA (tom visual, regras do/don't, nota visual ou style_guide)?
// Se sim, o estilo da marca é a autoridade — não impomos a regra genérica "empurra ilustração" por cima
// (ela brigaria com estilos específicos, ex.: o infográfico dark/premium que o Maikon quer na "Inovações").
function brandHasStyleDirective(brand: any): boolean {
  if (!brand) return false;
  const prefs = brand.visual_preferences && typeof brand.visual_preferences === "object" ? brand.visual_preferences : null;
  return !!(brand.do_rules || brand.visual_tone || brand.style_guide || prefs?.custom_notes);
}

const INTENTS = [
  "GENERATE",
  "GENERATE_CAROUSEL",
  "GENERATE_TWEET_CARD",
  "GENERATE_EDITORIAL_CAROUSEL",
  "FREE_IMAGE",
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
  // "carrossel de stories" / "stories sequenciais" / "stories em carrossel" → carousel (story-carousel handled later)
  if (/carrossel\s+(de\s+)?stor(y|ies)|stor(y|ies)\s+sequenciais|stor(y|ies)\s+em\s+carrossel|s[eé]rie\s+de\s+stor(y|ies)|m[uú]ltiplos\s+stor(y|ies)|v[aá]rios\s+stor(y|ies)/i.test(msg)) return "carousel";
  if (/carrossel|carousel|slides|documento|document/i.test(msg)) return "carousel";
  if (/story|stories/i.test(msg)) return "story";
  return "post";
}

// ── Helper: strip quick-action template boilerplate to get the real subject ──
// Os atalhos preenchem instruções como "Crie um carrossel ... sobre: <X>". O TEMA real é <X>;
// sem remover, a instrução vaza pra título/slides/legenda (ex.: um slide que diz literalmente
// "Crie um carrossel de 5 stories..."). Só remove quando o lead-in é claramente um verbo de
// instrução, então temas normais passam intactos.
function stripGenerationBoilerplate(msg: string): string {
  const s = (msg || "").trim();
  const m = s.match(/\bsobre:?\s+([\s\S]+)$/i);
  if (m) {
    const leadIn = s.slice(0, s.length - m[1].length);
    if (/\b(crie|gere|fa[çc]a|monte|elabore|escreva|produza|desenvolva)\b/i.test(leadIn)) {
      return m[1].trim();
    }
  }
  return s;
}

// ── Helper: extrai o primeiro objeto JSON balanceado de um texto ──
// Modelos de reasoning (minimax-m-25) emitem texto/raciocínio antes do JSON (ex.: "do.\n{...}").
// O regex guloso /\{[\s\S]*\}/ pega demais quando há chaves no texto ao redor → JSON.parse quebra.
// Rastrear profundidade de chaves pega EXATAMENTE o primeiro objeto completo, ignorando o ruído.
function extractJsonObject(raw: string): string | null {
  if (!raw) return null;
  const t = raw.replace(/```json\s*|\s*```/gi, "");
  const start = t.indexOf("{");
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return t.slice(start, i + 1); }
  }
  return null;
}

// ── Helper: detect if message is a quote/phrase request ──
function detectContentStyle(msg: string): string | null {
  if (/\b(frase|citação|citacao|quote|imagem com a frase|imagem com frase|frase inspiracional|frase motivacional)\b/i.test(msg)) return "quote";
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

// ── Créditos: dedução por geração ──────────────────────────────────────────────
// Debita os créditos da ação após gerar com sucesso (best-effort: quem não tem saldo não é
// bloqueado por ora). O bloqueio (enforcement) liga com CREDITS_ENFORCED=true no lançamento.
const CREDITS_ENFORCED = Deno.env.get("CREDITS_ENFORCED") === "true";
async function creditCost(svc: any, action: string, count = 1): Promise<number> {
  const { data } = await svc.from("credit_pricing").select("credits").eq("action", action).maybeSingle();
  return Math.max(0, ((data?.credits as number) ?? 0) * count);
}
async function getCreditBalance(svc: any, userId: string): Promise<number> {
  const { data } = await svc.from("user_credits").select("balance").eq("user_id", userId).maybeSingle();
  return (data?.balance as number) ?? 0;
}
async function chargeCredits(svc: any, userId: string, action: string, count: number, generationId: string | null): Promise<void> {
  const cost = await creditCost(svc, action, count);
  if (cost <= 0 || !userId) return;
  const { error } = await svc.rpc("spend_credits", { p_user: userId, p_amount: cost, p_generation_id: generationId, p_metadata: { action, count } });
  if (error) console.warn(`[ai-chat] chargeCredits ${action} x${count} (${cost}cr) skipped: ${error.message}`);
  else console.log(`[ai-chat] charged ${cost}cr (${action} x${count}) from ${userId}`);
}
// Pre-check de saldo ANTES de gastar com o provider. Com CREDITS_ENFORCED=false (default)
// só loga e deixa passar (best-effort atual); ligar a flag no lançamento ativa o bloqueio.
async function insufficientCredits(svc: any, userId: string, action: string, count = 1): Promise<string | null> {
  const cost = await creditCost(svc, action, count);
  if (cost <= 0 || !userId) return null;
  const balance = await getCreditBalance(svc, userId);
  if (balance >= cost) return null;
  if (!CREDITS_ENFORCED) {
    console.log(`[ai-chat] saldo insuficiente (${balance} < ${cost}cr, ${action} x${count}) — enforcement OFF, geração segue`);
    return null;
  }
  console.log(`[ai-chat] BLOQUEADO por saldo: ${balance} < ${cost}cr (${action} x${count})`);
  return `Seus créditos acabaram! 😕 Essa ação custa ${cost} créditos e você tem ${balance}. Clique em **Comprar créditos** na barra lateral pra recarregar e continuar criando.`;
}

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
      model: requestModel, // Studio: modelo escolhido na estante (gpt-image-2|nano-banana|seedream). Define rota + custo.
      creationModeOverride, // Studio: dial de fidelidade ("copy"|"inspire"|"free") sobrescreve o da marca nesta geração
      replicateRef, // Studio "Replicar um post": imageUrls[0] é um post de referência pra recriar (image-to-image)
    } = await req.json();

    // Custo por modelo (Studio cobra pelo modelo escolhido, não só pelo formato).
    // Ausente/desconhecido → null = mantém cobrança por formato (fluxo chat).
    const MODEL_COST_ACTION: Record<string, string> = {
      "seedream": "img_seedream",
      "gpt-image-2": "img_gpt",
      "nano-banana": "img_nano",
      "qwen": "img_qwen",
      "reve": "img_reve",
      "imagen-fast": "img_imagen",
      "ideogram": "img_ideogram",
      "recraft": "img_recraft",
      "flux-pro": "img_flux",
    };
    const modelCostAction: string | null = requestModel && MODEL_COST_ACTION[requestModel] ? MODEL_COST_ACTION[requestModel] : null;

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
    // apikey DEVE ser a MESMA key do Authorization: desde 2026-06-11 o gateway rejeita
    // headers com keys diferentes ("Conflicting API keys" 401) — antes aceitava anon+service.
    const internalHeaders = {
      Authorization: `Bearer ${internalServiceKey}`,
      "Content-Type": "application/json",
      apikey: internalServiceKey,
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
      generationMetadata,
    }: {
      generatedContent: any;
      fallbackTitle: string;
      contentType: "post" | "carousel" | "story" | "document" | "article";
      brandId?: string | null;
      templateSetId?: string | null;
      visualMode?: string | null;
      brandSnapshot?: Record<string, any> | null;
      platform?: string | null;
      generationMetadata?: Record<string, any> | null;
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
        // Salva o prompt do usuário pra rastreabilidade (Studio chama direto, não passa por chat_messages).
        generation_metadata: { ...(generationMetadata || {}), prompt: typeof message === "string" ? message.slice(0, 2000) : null },
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
- GENERATE: quer criar post, story, imagem, conteúdo visual com design artístico (inclui quote card, citação visual, infográfico)
- GENERATE_CAROUSEL: quer criar carrossel, múltiplos slides, série de posts, documento
- FREE_IMAGE: quer só uma imagem/foto avulsa e livre (ex: "gere uma imagem de um gato astronauta", "crie uma foto de um produto", "desenhe um logo", "faça uma ilustração de..."), SEM virar post nem legenda de rede social
- GENERATE_EDITORIAL_CAROUSEL: quer um carrossel "editorial" / "estilo revista ou notícia" / "de gancho viral" / "cinematográfico" — foto dramática com headline de impacto e palavras destacadas
- EDIT_CONTENT: quer editar, mudar, ajustar conteúdo já existente (ex: "muda a fonte", "texto menor", "nova imagem")
- CRIAR_MARCA: quer criar marca, identidade visual, definir cores/logo/estilo
- ATUALIZAR_PERFIL: quer mudar nicho, tom de voz, temas do perfil
- LINK_PARA_POST: colou um link/URL e quer transformar em conteúdo
- CHAT: conversa geral, pergunta, ajuda, dica

IMPORTANTE: Se a mensagem contém um link (URL), classifique como LINK_PARA_POST.
Se pede "carrossel", "múltiplos slides", "série", "documento", "tutorial passo a passo", classifique como GENERATE_CAROUSEL.

Responda APENAS com o nome da categoria.

Mensagem: "${message}"`;

      const classifyResp = await aiGatewayFetch({
        model: "google/gemini-2.5-flash-lite",
        messages: [{ role: "user", content: classifyPrompt }],
      });

      if (classifyResp.ok) {
        const classifyData = await classifyResp.json();
        const classified = classifyData.choices?.[0]?.message?.content?.trim()?.toUpperCase() || "";
        // Match o nome de intenção MAIS ESPECÍFICO (mais longo) primeiro: "GENERATE_CAROUSEL"
        // contém o prefixo "GENERATE", então um find na ordem do array casaria "GENERATE"
        // por engano. Ordenar candidatos por comprimento desc garante o composto vencer.
        const match = [...INTENTS]
          .sort((a, b) => b.length - a.length)
          .find((i) => classified.includes(i));
        if (match) detectedIntent = match;
      }

      // URL fallback: if message has a URL and no intent detected, treat as LINK_PARA_POST
      const urlMatch = message.match(/https?:\/\/[^\s]+/);
      if (urlMatch && detectedIntent === "CHAT") {
        detectedIntent = "LINK_PARA_POST";
      }

      // Guard against CRIAR_MARCA false positives: quick-action templates ("Crie um post/story/carrossel...")
      // are content generation requests, never brand creation. The AI classifier sometimes misfires when
      // the post body mentions words like "marca", "estilo" or quoted terms.
      if (detectedIntent === "CRIAR_MARCA" && /^\s*crie\s+(um|uma)\s+/i.test(message)) {
        console.log("[ai-chat] CRIAR_MARCA false positive on quick-action message, re-routing");
        if (/\b(carrossel|m[úu]ltiplos\s+slides|s[eé]rie|documento)\b/i.test(message)) {
          detectedIntent = "GENERATE_CAROUSEL";
        } else {
          detectedIntent = "GENERATE";
        }
      }
    }

    // LINK_PARA_POST is treated as GENERATE (with URL extraction)
    if (detectedIntent === "LINK_PARA_POST") {
      detectedIntent = "GENERATE";
    }

    // Tweet-card carousel — deterministic override (Satori renderer próprio).
    if (/tweet[\s-]*cards?|carross\S*\s+(de|com|estilo)\s+tweets?|cards?\s+de\s+tweets?|estilo\s+(tweet|twitter|x)\b|thread\s+(de|em|no)\s+(tweets?|x|twitter)/i.test(message)) {
      detectedIntent = "GENERATE_TWEET_CARD";
    }

    // Carrossel editorial cinematográfico — override determinístico (foto + overlay de revista).
    if (/carross\S*\s+(editorial|cinematogr\S*|de\s+gancho|estilo\s+(revista|not[íi]cia|jornal|breaking|editorial)|viral)|estilo\s+(editorial|revista|not[íi]cia)|editorial\s+(viral|cinematogr\S*)/i.test(message)) {
      detectedIntent = "GENERATE_EDITORIAL_CAROUSEL";
    }

    // Fotos enviadas + pedido de carrossel → carrossel editorial COM as fotos do usuário.
    // Insight do Maikon: "estive no congresso X → carrossel pronto com minhas fotos do evento".
    const uploadedPhotoCount = (imageUrls || []).filter((u: string) => typeof u === "string" && u.startsWith("http")).length;
    if (uploadedPhotoCount >= 2 && /\b(carross\S*|carrocel|slides?|stories|recap|resumo|recapitul\S*|p[óo]s[\s-]*evento)\b/i.test(message)) {
      console.log(`[ai-chat] ${uploadedPhotoCount} fotos enviadas + pedido de carrossel → EDITORIAL com fotos do usuário`);
      detectedIntent = "GENERATE_EDITORIAL_CAROUSEL";
    }

    // Geração livre — imagem crua (estilo "chamar o Gemini"). Só quando pede explicitamente
    // imagem/foto/desenho e NÃO menciona post/story/carrossel/conteúdo (esses são GENERATE).
    if (
      (detectedIntent === "GENERATE" || detectedIntent === "CHAT") &&
      /\b(ger[ae]|gera|crie|cria|fa[çc]a|desenh[ae]|ilustre|quero|gostaria\s+de)\b[^.!?]*\b(imagem|foto(grafia)?|ilustra[çc][ãa]o|desenho|arte|logo(tipo)?|figura|render|wallpaper|papel\s+de\s+parede)\b/i.test(message) &&
      !/\b(post|stor(y|ies)|carross\S*|conte[úu]do|publica[çc][ãa]o|legenda|caption|reels?|feed|marca)\b/i.test(message)
    ) {
      detectedIntent = "FREE_IMAGE";
    }

    // Pós-Blotato (cancelado no Sprint 3): "tutorial passo a passo" vira carrossel comum —
    // o classifier às vezes manda pra GENERATE, cujo handler gera 1 slide só.
    if ((detectedIntent === "GENERATE" || detectedIntent === "CHAT") &&
        /\b(carrossel\s+tutorial|tutorial.*passo\s*a\s*passo|passo\s*a\s*passo.*slides)\b/i.test(message)) {
      detectedIntent = "GENERATE_CAROUSEL";
    }

    // Format-aware re-route: if the message/params indicate a multi-slide format (carousel or
    // LinkedIn document), but the classifier sent us to GENERATE, upgrade to GENERATE_CAROUSEL.
    // GENERATE's handler hard-codes totalSlides=1 — so this is the only way a carousel gets
    // generated when the URL detection or LINK_PARA_POST collapsed the intent down.
    if (detectedIntent === "GENERATE") {
      // Message-level override: "carrossel de stories" beats requestFormat="story"
      const msgIsStoryCarousel = /carrossel\s+(de\s+)?stor(y|ies)|stor(y|ies)\s+sequenciais|stor(y|ies)\s+em\s+carrossel|s[eé]rie\s+de\s+stor(y|ies)/i.test(message);
      const effectiveFormat = msgIsStoryCarousel ? "carousel" : (requestFormat || detectFormat(message));
      if (effectiveFormat === "carousel" || effectiveFormat === "document") {
        console.log(`[ai-chat] re-route GENERATE → GENERATE_CAROUSEL (format=${effectiveFormat}, storyCarousel=${msgIsStoryCarousel})`);
        detectedIntent = "GENERATE_CAROUSEL";
      }
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

    // ── A1 guard: usuário descreveu uma EDIÇÃO de imagem específica mas NÃO anexou foto.
    // Sem isso, o fluxo gerava um post de marca carimbando a instrução crua como manchete
    // (caso Haaland). Em vez de adivinhar, guia pro caminho certo (anexar + "Editar a imagem").
    // Determinístico, custo 0. Só dispara em geração-a-partir-de-texto, sem imagem e sem alvo de edição.
    {
      const a1Uploaded = (imageUrls || []).filter((u: string) => typeof u === "string" && u.startsWith("http")).length;
      const a1EditVerb = /\b(edit[ae]|editar|edição|coloc[ae]|colocar|adicion[ae]|adicionar|insir[ae]|inserir|remov[ae]|remover|tir[ae]|tirar|apag[ae]|apagar|troc[ae]|trocar|substitu[ai]|melhor[ae]|melhorar|aument[ae]|deix[ae])\b/i;
      const a1ImageRef = /\b(ess[ae]\s+(foto|imagem|figura)|ness[ae]\s+(foto|imagem)|nel[ae]\b|naquel[ae]\b|(a|na|da|minha|esta)\s+(foto|imagem|figura))\b/i;
      const a1IsGenFromText = ["GENERATE", "GENERATE_CAROUSEL", "FREE_IMAGE", "GENERATE_EDITORIAL_CAROUSEL"].includes(detectedIntent);
      const a1HasContentTarget = !!generationParams?.contentId; // editar conteúdo já existente é legítimo
      if (a1IsGenFromText && a1Uploaded === 0 && !a1HasContentTarget && a1EditVerb.test(message) && a1ImageRef.test(message)) {
        console.log("[ai-chat] A1 guard: linguagem de edição sem imagem anexada → guiando em vez de gerar card");
        return new Response(JSON.stringify({
          reply: "📸 Parece que você quer **editar uma imagem**. Pra isso, anexe a foto aqui (botão de imagem 📎) e escolha **\"Editar a imagem\"** — aí eu mexo na foto de verdade, sem inventar texto por cima.\n\nSe na verdade você quer um **post novo no estilo da sua marca** sobre esse tema, me diz algo como \"cria um post sobre…\" que eu faço. 🎨",
          intent: "EDIT_NO_IMAGE_GUARD",
          action_result: null,
          quick_replies: null,
          brand_creation_step: null,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Intent handlers
    // ══════════════════════════════════════════════════════════════════════════

    switch (detectedIntent) {

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
        let slideHeadline = contentStyle === "quote" ? extractPhrase(message) : message.substring(0, 100);
        console.log(`[ai-chat] GENERATE: platform=${platform}, format=${format}, contentStyle=${contentStyle || "news"}, headline="${slideHeadline}"`);

        {
          const denyMsg = await insufficientCredits(svc, userId, modelCostAction || (format === "story" ? "story" : "post"));
          if (denyMsg) { replyOverride = denyMsg; break; }
        }

        // 2. Load brand if brandId provided
        let brandContext = "";
        let brandSnapshot: Record<string, any> | null = null;
        let brandForLimits: any = null;
        let referenceImageUrls: string[] = [];
        let isPhotoBackground = false;
        let photoBackgroundUrls: string[] = [];

        if (requestBrandId && requestBrandId !== "none") {
          const { data: brand } = await svc.from("brands")
            .select("name, palette, fonts, visual_tone, do_rules, dont_rules, visual_preferences, logo_url, creation_mode, style_guide")
            .eq("id", requestBrandId).single();

          if (brand) {
            brandSnapshot = brand;
            isPhotoBackground = (brand as any).creation_mode === "photo_backgrounds";

            // Serializador único da identidade (inclui style_guide quando houver). Substitui
            // os 3 blocos copy-paste que divergiam; o EDIT agora também ganha custom_notes.
            brandContext = buildBrandContext(brand);
            brandForLimits = brand;

            if (isPhotoBackground) {
              const { data: bgPhotos } = await svc.from("brand_examples")
                .select("image_url").eq("brand_id", requestBrandId).eq("purpose", "background").limit(6);
              if (bgPhotos?.length) photoBackgroundUrls = bgPhotos.map((r: any) => r.image_url);
              console.log(`[ai-chat] photo_backgrounds mode: ${photoBackgroundUrls.length} photos`);
            } else if ((brand as any).creation_mode === "from_scratch") {
              // from_scratch = gerar livre só a partir da identidade textual da marca.
              // NUNCA anexar exemplos enviados como referência visual: o modelo faz OCR e
              // copia o texto embutido neles (ex.: o CRM de um cartão) nas gerações novas.
              console.log(`[ai-chat] from_scratch — pulando imagens de referência`);
            } else {
              const { data: refs } = await svc.from("brand_examples")
                .select("image_url").eq("brand_id", requestBrandId).eq("purpose", "reference").limit(6);
              if (refs?.length) referenceImageUrls = refs.map((r: any) => r.image_url);
            }
          }
        }

        // "Replicar um post" (Studio): a referência anexada pelo usuário vira a PRINCIPAL imagem
        // de referência (image-to-image) — a IA recria a composição/estilo dela. Combina com as
        // refs da marca quando houver. O referencesInstruction + dial "copy" já mandam copiar
        // layout/cores/tipografia fielmente.
        const replicateRefUrls = (replicateRef && Array.isArray(imageUrls))
          ? imageUrls.filter((u: any) => typeof u === "string" && u.startsWith("http"))
          : [];
        if (replicateRefUrls.length > 0 && !isPhotoBackground) {
          referenceImageUrls = [...replicateRefUrls, ...referenceImageUrls].slice(0, 6);
          console.log(`[ai-chat] GENERATE: replicar post — ${replicateRefUrls.length} ref do usuário`);
        }

        // 3. If message contains URL, fetch article content
        let articleContent = "";
        const urlMatch = message.match(/https?:\/\/[^\s]+/);
        if (urlMatch) {
          articleContent = await extractArticleContent(urlMatch[0], "GENERATE");
        }
        // Guard anti-invenção: se o link É o tema mas não conseguimos LER a página, NÃO inventamos
        // um assunto (um artigo de "Bentall" virou "ponte de safena"). Pede o texto em vez de chutar.
        if (urlMatch && !articleContent && message.replace(/https?:\/\/\S+/g, "").trim().length < 15) {
          replyOverride = "Não consegui ler esse link — o site deve exigir login ou bloquear leitura automática (comum em artigos médicos ou com vídeo). Me manda o **texto** ou um **resumo do assunto** e eu crio o conteúdo certo, sem chutar. 🙏";
          break;
        }

        // 4. Get content dimensions
        const dims = getContentDimensions(platform, format);

        // 5. Build image prompt — include FORMATO OBRIGATÓRIO so inference.sh generates correct aspect ratio
        // subject = mensagem sem o boilerplate do atalho ("Crie um post sobre: X" → "X"), senão a
        // instrução vaza pro prompt e o modelo renderiza o texto da instrução na imagem.
        const subject = stripGenerationBoilerplate(message);
        let userTopic = articleContent
          ? `Baseado neste artigo: ${articleContent.substring(0, 2000)}`
          : subject;

        // Link-post: a IMAGEM precisa de um BRIEF conciso (manchete + pontos do ASSUNTO), não do
        // artigo cru. Sem isso o modelo pega o boilerplate da fonte ("conteúdo/análises/curadoria")
        // e faz um ANÚNCIO GENÉRICO de plataforma em vez de um infográfico do tema. Corrigido 2026-06-19.
        if (articleContent) {
          try {
            const briefResp = await aiGatewayFetch({
              model: "openrouter/minimax-m-25",
              messages: [{ role: "user", content: `Resuma o artigo abaixo num BRIEF pra um infográfico de Instagram em português brasileiro. Foque no ASSUNTO do artigo — NUNCA na fonte/jornal nem em "acesse/assine conteúdo". Responda SOMENTE JSON, sem texto antes ou depois: {"headline":"manchete forte, máx 8 palavras, sobre o tema","points":["3 pontos-chave bem curtos, cada um máx 8 palavras"]}\n\nARTIGO:\n${articleContent.substring(0, 2000)}` }],
            });
            if (briefResp.ok) {
              const bd = await briefResp.json();
              const jm = extractJsonObject(bd.choices?.[0]?.message?.content || "");
              if (jm) {
                const b = JSON.parse(jm);
                if (b.headline) {
                  const pts = Array.isArray(b.points) ? b.points.filter(Boolean).slice(0, 3) : [];
                  userTopic = `${b.headline}${pts.length ? `\nPontos principais: ${pts.join(" · ")}` : ""}`;
                  slideHeadline = b.headline;
                  console.log(`[ai-chat] GENERATE: brief da imagem -> "${b.headline}"`);
                }
              }
            }
          } catch (e: any) { console.warn("[ai-chat] GENERATE: brief da imagem falhou, usando resumo cru:", e?.message); }
        }
        // A2 — Brief também SEM artigo: transforma o pedido cru num BRIEF limpo (manchete + pontos)
        // antes de virar TEMA renderizado. Sem isso, uma instrução crua ("faça Haaland segurar um
        // troféu") vazava verbatim como manchete na imagem. minimax reescreve em manchete pronta,
        // sem verbos de instrução, em pt-BR correto.
        else if (contentStyle !== "quote") {
          try {
            const briefResp = await aiGatewayFetch({
              model: "openrouter/minimax-m-25",
              messages: [{ role: "user", content: `Transforme o pedido do usuário num BRIEF pra um post/infográfico de Instagram em português brasileiro. Extraia o ASSUNTO e escreva uma manchete PRONTA pra arte — NUNCA repita o pedido nem inclua verbos de instrução ("faça", "crie", "coloque", "edite", "melhore"). Português impecável, só palavras reais e bem grafadas. Responda SOMENTE JSON: {"headline":"manchete forte, máx 8 palavras","points":["até 3 pontos curtos, máx 8 palavras cada"]}\n\nPEDIDO DO USUÁRIO:\n${subject.substring(0, 600)}` }],
            });
            if (briefResp.ok) {
              const bd = await briefResp.json();
              const jm = extractJsonObject(bd.choices?.[0]?.message?.content || "");
              if (jm) {
                const b = JSON.parse(jm);
                if (b.headline) {
                  const pts = Array.isArray(b.points) ? b.points.filter(Boolean).slice(0, 3) : [];
                  userTopic = `${b.headline}${pts.length ? `\nPontos principais: ${pts.join(" · ")}` : ""}`;
                  slideHeadline = b.headline;
                  console.log(`[ai-chat] GENERATE: brief (sem artigo) -> "${b.headline}"`);
                }
              }
            }
          } catch (e: any) { console.warn("[ai-chat] GENERATE: brief sem-artigo falhou, usando subject cru:", e?.message); }
        }

        // Limite de headline do style_guide (quando definido) — aplicado ANTES de montar o
        // prompt da imagem, pra a manchete renderizada respeitar o teto de caracteres da marca.
        {
          const limits = brandForLimits ? brandTextLimits(brandForLimits, format === "story" ? "story" : "post") : null;
          if (limits?.headline && slideHeadline) slideHeadline = truncateToChars(slideHeadline, limits.headline);
        }

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

        // When the brand has reference images (style_copy/inspired modes), tell Gemini explicitly
        // to copy their style. Without this instruction, the references are attached but ignored.
        // This was lost when ai-chat started sending customPrompt directly (commit 4d6ce3d).
        const hasStyleRefs = referenceImageUrls.length > 0 && !isPhotoBackground;
        const referencesInstruction = hasStyleRefs
          ? `IMAGENS DE REFERÊNCIA ANEXADAS — REGRA DE FIDELIDADE VISUAL:
As imagens em anexo são exemplos REAIS do estilo desta marca. COPIE EXATAMENTE delas:
- Paleta de cores e gradientes
- Tipografia, peso e hierarquia
- Layout, composição e proporções
- Mockups, cards, formas decorativas e estilo geral

NÃO copie textos das referências (categorias, hashtags, datas, rodapés, nomes de programas). O texto da imagem é SOMENTE o do TEMA acima.

`
          : "";

        // Brand palette/fonts as concrete hints for the photo-background mode (which otherwise
        // only sees the personal photo and a generic prompt).
        const brandPalette = (brandSnapshot?.palette as any[] | undefined || [])
          .map((c: any) => (typeof c === "string" ? c : c?.hex || c?.name))
          .filter(Boolean)
          .slice(0, 5);
        const brandHeadingFont = (brandSnapshot?.fonts as any)?.headings || null;

        let imagePrompt: string;

        if (isPhotoBackground && photoBackgroundUrls.length > 0) {
          // ── PHOTO BACKGROUND MODE ──
          // Send the personal photo as reference and ask Gemini to overlay text on it
          referenceImageUrls = [photoBackgroundUrls[Math.floor(Math.random() * photoBackgroundUrls.length)]];
          const textToOverlay = contentStyle === "quote" ? slideHeadline : userTopic;
          imagePrompt = `FORMATO OBRIGATÓRIO: ${dimLabelGenerate}. A imagem DEVE ser gerada neste formato exato.

IDIOMA OBRIGATÓRIO DO TEXTO: português brasileiro (pt-BR). Se o texto abaixo estiver em outro idioma, TRADUZA para pt-BR antes de renderizar.

INSTRUÇÃO PRINCIPAL: A imagem de referência anexada é uma FOTO PESSOAL REAL do criador. Você DEVE preservar esta foto exatamente como ela é — é a foto real da pessoa. NÃO gere uma pessoa diferente. NÃO altere o rosto ou corpo da pessoa na foto.

Use a foto anexada como FUNDO e sobreponha o texto abaixo de forma profissional:

TEXTO PARA SOBREPOR (em pt-BR): "${textToOverlay}"

REGRAS OBRIGATÓRIAS:
- A foto da pessoa deve permanecer INTACTA e INALTERADA — é a foto real do criador
- Adicione um gradiente sutil escuro na parte inferior para legibilidade do texto
- O texto deve ficar na parte inferior da imagem, sobre o gradiente
- Tipografia elegante, profissional e legível${brandHeadingFont && brandHeadingFont !== "Inter" ? ` (preferência por fonte similar a ${brandHeadingFont})` : ""}
${brandPalette.length > 0 ? `- Cores da marca (use no gradiente e no texto sobreposto): ${brandPalette.join(", ")}` : ""}
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
          const storySpecificRules = isStoryFmt ? `
REGRAS CRÍTICAS PARA STORY VERTICAL (9:16 — 1080×1920px):
- TEXTO MÁXIMO: 1 título curto de 3-6 palavras em BOLD + no máximo 1 subtítulo de 8-12 palavras. NENHUM outro texto.
- TAMANHO DE FONTE: nunca use fonte maior que 14% da altura da imagem. Em 1920px de altura isso equivale a ~270px. Prefira fontes menores para textos longos.
- MARGENS MÍNIMAS OBRIGATÓRIAS: 130px em TODAS as bordas (esquerda, direita, topo, base). NENHUMA letra, nem a primeira nem a última, pode ultrapassar essas margens.
- VERIFIQUE: cada linha de texto começa e termina dentro das margens? Se não, REDUZA a fonte ou encurte o texto.
- NÃO tente colocar o artigo inteiro na imagem — escolha 1 ideia principal, escreva curto e impactante.
` : "";

          imagePrompt = `FORMATO OBRIGATÓRIO: ${dimLabelGenerate}. A imagem DEVE ser gerada neste formato exato.

IDIOMA OBRIGATÓRIO DO TEXTO RENDERIZADO NA IMAGEM: português brasileiro (pt-BR). Se o tema/artigo abaixo estiver em outro idioma, TRADUZA todos os termos para pt-BR antes de renderizar. Nenhuma palavra em inglês, espanhol ou outros idiomas pode aparecer na imagem final.

Crie o DESIGN VISUAL (arte gráfica) para usar como ${formatLabel} de ${platformLabel}.

TEMA: ${userTopic}

${referencesInstruction}${brandContext ? `IDENTIDADE VISUAL:\n${brandContext}\n` : ""}${userCtx?.business_niche ? `Nicho do criador: ${userCtx.business_niche}. ` : ""}${userCtx?.brand_voice ? `Tom de voz: ${userCtx.brand_voice}. ` : ""}

REGRAS:
- A imagem é um INFOGRÁFICO sobre o ASSUNTO acima. PROIBIDO fazer um anúncio genérico de plataforma de conteúdo ("acesse o melhor conteúdo", "assine", "informação confiável") ou promover a fonte/jornal de onde veio o tema. O conteúdo visual é sobre o TEMA, não sobre "consumir conteúdo".
- A imagem deve ter texto integrado visível e legível sobre o tema acima, SEMPRE em pt-BR.
- Use tipografia profissional, hierarquia visual clara, cores harmônicas.
${hasStyleRefs ? "- FIDELIDADE: replique cores, tipografia e composição das imagens de referência anexadas (mas TRADUZA qualquer texto delas para pt-BR).\n" : ""}- NÃO inclua URLs, QR codes ou logotipos de terceiros.
- Gere APENAS o design final — sem bordas externas, sem frames.
${storySpecificRules}
${(hasStyleRefs || brandHasStyleDirective(brandSnapshot)) ? VISUAL_RICHNESS_RULE : ILLUSTRATION_FORWARD_RULE}
${NO_UI_MOCKUP_RULE}

${SAFE_AREA_RULES}`;
        }

        // Dial de fidelidade (Studio): ajusta a aderência às referências da marca.
        // photo_backgrounds (Maikon) é INTOCADO — o modo dele já define a relação com a foto.
        if (creationModeOverride && !isPhotoBackground) {
          imagePrompt += creationModeOverride === "free"
            ? "\n\nLIBERDADE CRIATIVA: ignore referências de estilo; use APENAS a paleta e o tom da marca. Crie a arte do zero."
            : creationModeOverride === "inspire"
              ? "\n\nINSPIRAÇÃO: use as referências como inspiração de estilo, com liberdade pra variar composição e elementos."
              : "\n\nFIDELIDADE MÁXIMA: replique fielmente cores, tipografia, layout e composição das referências da marca; mude APENAS o conteúdo do texto.";
        }

        // 6. Call generate-slide-images
        console.log("[ai-chat] GENERATE: calling generate-slide-images");
        let imageUrl: string | null = null;
        try {
          const genController = new AbortController();
          const genTimer = setTimeout(() => genController.abort(), 130000); // 130s: inference.sh gpt-image-2 degradou p/ ~51s/call e faz 2 tentativas (~104s); 80s estourava e quebrava o POST do Maikon. Sob o teto ~150s do edge.
          const genResp = await fetch(`${supabaseUrl}/functions/v1/generate-slide-images`, {
            signal: genController.signal,
            method: "POST",
            headers: internalHeaders,
            body: JSON.stringify({
              userId,
              model: requestModel,
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
          console.error("[ai-chat] GENERATE: generate-slide-images error:", genErr?.name === "AbortError" ? "timeout (80s)" : genErr?.message);
        }

        // 7. Generate caption + title with minimax
        let caption = "";
        let hashtags: string[] = [];
        let aiTitle = "";
        try {
          const topic = articleContent
            ? articleContent.substring(0, 600)
            : subject;
          const mainBilingual = secondaryLang && bilingualPlatforms.includes(platform)
            ? `\nIMPORTANTE: A legenda DEVE ser bilíngue — primeiro em português, depois "---" e a versão em ${secondaryLangName}.`
            : "";
          const sourceUrl = urlMatch?.[0] || null;
          // Story IG/Reels can't have clickable links; feed posts (IG/LinkedIn) can have
          // the source URL appended at the end of the caption.
          const isStoryFormat = format === "story";
          const sourceFooterRule = sourceUrl && !isStoryFormat
            ? `\nFONTE OBRIGATÓRIA: Termine a legenda com uma linha em branco e depois exatamente "🔗 Fonte: ${sourceUrl}" (use a URL completa, sem encurtar).`
            : "";
          const noBioLinkRule = `\nPROIBIDO: NUNCA escreva "link na bio", "link no perfil", "link nas histórias", "link no story", "arrasta pra cima", "swipe up", "veja mais nos stories" ou variações. Stories do Instagram não suportam link clicável e não temos um botão "link na bio" — não promete o que não dá pra entregar.`;

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
${noBioLinkRule}${sourceFooterRule}

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
            const parsed = parseLlmJson<{ title?: string; caption?: string; hashtags?: string[] }>(raw);
            if (parsed) {
              aiTitle = parsed.title || "";
              caption = parsed.caption || "";
              hashtags = parsed.hashtags || [];
            } else {
              // Sem JSON válido: NUNCA publicar o raciocínio cru do modelo como legenda.
              // Deixa vazia — o resto do fluxo (título, imagem) segue normalmente.
              console.warn("[ai-chat] GENERATE: caption sem JSON válido — legenda fica vazia");
              caption = "";
            }
          }
        } catch (captionErr: any) {
          console.warn("[ai-chat] GENERATE: caption generation failed:", captionErr?.message);
        }

        // Enforcement determinístico: hashtags com '#' único e sem duplicatas.
        hashtags = normalizeHashtags(hashtags);

        // 8. Build title — prefer AI-generated title, fallback to phrase/message cleanup
        const title = contentStyle === "quote"
          ? slideHeadline
          : (aiTitle || (subject.replace(/https?:\/\/\S+/g, "").replace(/^(quero|crie|gere|criar|gerar|me\s+d[eê]|fa[çc]a)\s+(um[a]?\s+)?(post|story|carrossel|imagem|conteúdo)\s+(para\s+o\s+)?(instagram|linkedin)?\s*/i, "").trim().substring(0, 80) || "Novo conteúdo"));

        // 8b. Generate multi-platform caption variants (async, non-blocking)
        let platformCaptions: Record<string, string> | null = null;
        try {
          const bilingualNote = secondaryLang && bilingualPlatforms.length > 0
            ? `\n\nIMPORTANTE — LEGENDAS BILÍNGUES: Para as plataformas [${bilingualPlatforms.join(", ")}], a legenda DEVE ser bilíngue: primeiro o texto em português, depois uma linha "---" e o texto traduzido para ${secondaryLangName}. As outras plataformas ficam somente em português.`
            : "";

          const variantSourceRule = urlMatch?.[0] && format !== "story"
            ? `\nFONTE: Para instagram, linkedin, facebook, tiktok — termine a legenda com uma linha em branco e depois exatamente "🔗 Fonte: ${urlMatch[0]}". Para X (Twitter), inclua a URL no final como link nu (sem o prefixo "🔗 Fonte:") já que o limite de 280 chars é apertado.`
            : "";
          const variantNoBioRule = `\nPROIBIDO em TODAS as plataformas: nunca escreva "link na bio", "link no perfil", "arrasta pra cima", "swipe up", "veja mais nos stories" ou variações. Stories não têm link clicável.`;

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
${variantNoBioRule}${variantSourceRule}
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
            const parsedVariants = parseLlmJson<Record<string, string>>(raw);
            if (parsedVariants) {
              platformCaptions = parsedVariants;
              console.log("[ai-chat] GENERATE: platform variants generated:", Object.keys(platformCaptions || {}).join(", "));
            } else {
              console.warn("[ai-chat] GENERATE: platform variants JSON parse failed");
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
          // Débito de créditos (só se gerou imagem)
          await chargeCredits(svc, userId, modelCostAction || (format === "story" ? "story" : "post"), 1, savedContentId);
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
        const tCarouselStart = Date.now();

        // 1. Detect platform and format
        const platform = requestPlatform || detectPlatform(message);
        const format = requestFormat || (platform === "linkedin" ? "document" : "carousel");
        // Detect "carousel of stories": multiple sequential 9:16 stories instead of a feed carousel.
        // Triggered by the "Carrossel de Stories" template or explicit user phrasing.
        const isStoryCarousel = /carrossel\s+(de\s+)?stor(y|ies)|stor(y|ies)\s+sequenciais|stor(y|ies)\s+em\s+carrossel/i.test(message);
        // Slides are rendered in 9:16 when this flag is on. content_type stays "carousel" so the
        // ActionCard navigation works; publish-postforme reads the flag to publish N stories.
        const effectiveSlideFormat = isStoryCarousel ? "story" : format;
        const slideCount = generationParams?.slideCount || 5;
        console.log(`[ai-chat] GENERATE_CAROUSEL: platform=${platform}, format=${format}, effectiveSlideFormat=${effectiveSlideFormat}, isStoryCarousel=${isStoryCarousel}, slides=${slideCount}`);

        {
          const denyMsg = await insufficientCredits(svc, userId, modelCostAction || "carousel_slide", slideCount);
          if (denyMsg) { replyOverride = denyMsg; break; }
        }

        // 2. Load brand if brandId provided
        let brandContext = "";
        let brandSnapshot: Record<string, any> | null = null;
        let brandForLimits: any = null;
        let referenceImageUrls: string[] = [];
        let isPhotoBackground = false;
        let photoBackgroundUrls: string[] = [];

        if (requestBrandId && requestBrandId !== "none") {
          const { data: brand } = await svc.from("brands")
            .select("name, palette, fonts, visual_tone, do_rules, dont_rules, visual_preferences, logo_url, creation_mode, style_guide")
            .eq("id", requestBrandId).single();

          if (brand) {
            brandSnapshot = brand;
            isPhotoBackground = (brand as any).creation_mode === "photo_backgrounds";

            // Serializador único da identidade (inclui style_guide quando houver).
            brandContext = buildBrandContext(brand);
            brandForLimits = brand;

            if (isPhotoBackground) {
              const { data: bgPhotos } = await svc.from("brand_examples")
                .select("image_url").eq("brand_id", requestBrandId).eq("purpose", "background").limit(6);
              if (bgPhotos?.length) photoBackgroundUrls = bgPhotos.map((r: any) => r.image_url);
              console.log(`[ai-chat] photo_backgrounds mode: ${photoBackgroundUrls.length} photos`);
            } else if ((brand as any).creation_mode === "from_scratch") {
              // from_scratch = gerar livre só a partir da identidade textual da marca.
              // NUNCA anexar exemplos enviados como referência visual: o modelo faz OCR e
              // copia o texto embutido neles (ex.: o CRM de um cartão) nas gerações novas.
              console.log(`[ai-chat] from_scratch — pulando imagens de referência`);
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
          articleContent = await extractArticleContent(urlMatch[0], "GENERATE_CAROUSEL");
        }
        // Guard anti-invenção (mesmo motivo do GENERATE): link como tema + página ilegível → pede o texto.
        if (urlMatch && !articleContent && message.replace(/https?:\/\/\S+/g, "").trim().length < 15) {
          replyOverride = "Não consegui ler esse link — o site deve exigir login ou bloquear leitura automática (comum em artigos médicos ou com vídeo). Me manda o **texto** ou um **resumo do assunto** e eu crio o carrossel certo, sem chutar. 🙏";
          break;
        }

        // 4. Generate slide structure with minimax
        // subject = mensagem SEM o boilerplate do atalho ("Crie um carrossel... sobre: X" → "X").
        // Sem isso, a instrução vira o TEMA e vaza pros slides/título/legenda.
        const subject = stripGenerationBoilerplate(message);
        const userTopic = articleContent
          ? `Baseado neste artigo: ${articleContent.substring(0, 2000)}`
          : subject;

        const carouselPlatformGuide = platform === "linkedin"
          ? `FORMATO LINKEDIN DOCUMENT:
- Slide 1 (CAPA): Título provocativo que gere curiosidade profissional (máx 8 palavras). Use dado ou pergunta.
- Slides 2-${slideCount - 1} (CONTEÚDO): Cada slide = 1 ideia clara. Headline forte + body conciso + bullets com dados/exemplos.
- Slide ${slideCount} (CTA): Convide para comentar ("Qual desses pontos mais impacta seu negócio?") + "Siga para mais insights".
- Tom: executivo, baseado em dados, insights acionáveis.`
          : `FORMATO INSTAGRAM CARROSSEL:
- Slide 1 (CAPA): Gancho irresistível que faça deslizar (máx 8 palavras). Pode ser pergunta, afirmação ousada ou promessa.
- Slides 2-${slideCount - 1} (CONTEÚDO): 1 ponto por slide. Headline emocional + body didático + bullets práticos.
- Slide ${slideCount} (CTA): "Salve para consultar depois" + "Compartilhe com quem precisa"${userCtx?.instagram_handle ? ` + "Siga @${String(userCtx.instagram_handle).replace(/^@+/, "")}"` : " + convite para seguir o perfil"}.
- Tom: ${userCtx?.brand_voice || "educativo e acessível"}, como se ensinasse a um amigo.`;

        const structurePrompt = `Você é um estrategista de conteúdo especialista em carrosseis virais. Crie ${slideCount} slides.

TEMA: ${userTopic}
${userCtx?.business_niche ? `NICHO DO AUTOR: ${userCtx.business_niche}` : ""}
${userCtx?.brand_voice ? `TOM DE VOZ DA MARCA: ${userCtx.brand_voice} — escreva o texto dos slides nessa voz.` : ""}
${Array.isArray(userCtx?.content_topics) && userCtx.content_topics.length ? `TEMAS RECORRENTES DO AUTOR: ${userCtx.content_topics.join(", ")} — use como contexto de fundo.` : ""}

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

        // Título base = subject limpo (NUNCA a instrução crua). minimax sobrescreve com parsed.title.
        const cleanSubject = subject.replace(/https?:\/\/[^\s]+/g, "").trim() || "o artigo";
        let carouselTitle = cleanSubject.length > 80 ? cleanSubject.substring(0, 80) + "..." : cleanSubject;
        let slides: any[] = [];

        // Tenta gerar a estrutura. minimax (reasoning) às vezes devolve texto sem JSON, e sob
        // rajada estoura rate-limit (429). Defesa: resposta CURTA (max_tokens baixo → rápido e
        // determinístico) + 3 tentativas com backoff crescente (mata o 429 transitório).
        const runStructure = async (extraInstruction = ""): Promise<void> => {
          const structResp = await aiGatewayFetch({
            model: "openrouter/minimax-m-25",
            messages: [{ role: "user", content: structurePrompt + extraInstruction }],
            max_tokens: 2048,      // JSON de carrossel cabe folgado; evita o minimax "pensar" 64k tokens
            temperature: 0.5,
          });
          if (!structResp.ok) return;
          const structData = await structResp.json();
          const raw = structData.choices?.[0]?.message?.content || "";
          const jsonStr = extractJsonObject(raw);
          if (jsonStr) {
            const parsed = JSON.parse(jsonStr);
            carouselTitle = parsed.title || carouselTitle;
            slides = parsed.slides || [];
          }
        };

        const STRICT_JSON = "\n\nIMPORTANTE: responda SOMENTE com o objeto JSON, sem nenhum texto, raciocínio ou markdown antes ou depois.";
        const backoffMs = [0, 1200, 2500];   // 3 tentativas; espera antes da 2ª/3ª
        for (let attempt = 0; attempt < backoffMs.length && slides.length === 0; attempt++) {
          if (backoffMs[attempt] > 0) {
            console.warn(`[ai-chat] GENERATE_CAROUSEL: structure vazia — retry ${attempt} após ${backoffMs[attempt]}ms`);
            await new Promise((r) => setTimeout(r, backoffMs[attempt]));
          }
          try {
            await runStructure(attempt === 0 ? "" : STRICT_JSON);
          } catch (structErr: any) {
            console.error(`[ai-chat] GENERATE_CAROUSEL: structure attempt ${attempt} failed:`, structErr?.message);
          }
        }

        // Falhou de vez: NÃO ecoa a instrução nem gera lixo nem cobra. Avisa e sai.
        if (slides.length === 0) {
          console.error("[ai-chat] GENERATE_CAROUSEL: structure vazia após retry — abortando sem cobrar");
          replyOverride = "Não consegui estruturar o carrossel agora — o gerador de texto falhou. Tenta de novo daqui a pouco. (Você não foi cobrado.)";
          actionResult = null;
          break;
        }

        // Enforcement: garante EXATAMENTE o número de slides pedido (o modelo às vezes gera a mais).
        slides = clampSlides(slides, slideCount);

        const tStructureDone = Date.now();
        console.log(`[ai-chat] GENERATE_CAROUSEL timing: structure=${tStructureDone - tCarouselStart}ms`);

        // 5. Get content dimensions (9:16 for story carousels, otherwise platform default)
        const dims = getContentDimensions(platform, effectiveSlideFormat);

        // 6. Generate images for ALL slides IN PARALLEL (avoids 150s idle timeout)
        console.log(`[ai-chat] GENERATE_CAROUSEL: generating ${slides.length} slides in parallel`);

        // Fidelidade de marca: a CAPA (slide 1) é gerada PRIMEIRO e vira ÂNCORA de estilo
        // (referência image-to-image) pros slides 2..N → consistência visual entre slides.
        // photo_backgrounds (Maikon) fica INTOCADO: useAnchor=false → caminho paralelo padrão.
        const useAnchor = !isPhotoBackground && slides.length > 1;
        const anchorRef: string[] = [];
        const genSlide = async (slide: any, i: number) => {
            // Escalona a largada: N slides disparando juntos estouravam o rate-limit do Replicate
            // (429) → slide sem imagem. Espalhar ~800ms por índice + o retry do callReplicate resolve.
            if (i > 0) await new Promise((r) => setTimeout(r, i * 800));
            const refs = (anchorRef.length && i > 0) ? [...anchorRef, ...referenceImageUrls].slice(0, 6) : referenceImageUrls;
            const carouselHasStyleRefs = refs.length > 0;
            const slideAnchorBlock = (anchorRef.length && i > 0)
              ? `\nÂNCORA DE ESTILO: a PRIMEIRA imagem anexada é a CAPA já gerada deste carrossel. Replique FIELMENTE o estilo dela (paleta, tipografia, layout, fundo, clima visual) — os slides devem parecer do MESMO conjunto.\n`
              : "";
            const carouselRefsBlock = carouselHasStyleRefs
              ? `\nIMAGENS DE REFERÊNCIA ANEXADAS — REGRA DE FIDELIDADE VISUAL:
As imagens em anexo são exemplos REAIS do estilo desta marca. COPIE EXATAMENTE delas a paleta de cores, tipografia, layout, mockups, cards, formas decorativas e estilo geral. NÃO copie textos das referências (categorias, hashtags, datas, rodapés). O texto da imagem é SOMENTE o do headline/body/bullets acima.\n`
              : "";

            const slidePrompt = `Crie a imagem do ${isStoryCarousel ? `story ${i + 1} de ${slides.length} (sequência narrativa de stories vertical 9:16)` : `slide ${i + 1} de ${slides.length} de um carrossel`} para ${platform === "linkedin" ? "LinkedIn" : "Instagram"} (${dims.w}x${dims.h}px).

IDIOMA OBRIGATÓRIO DO TEXTO: português brasileiro (pt-BR). Se algum termo abaixo estiver em outro idioma, TRADUZA para pt-BR. Nenhuma palavra estrangeira na imagem.

CONTEXTO DO CARROSSEL: ${carouselTitle}
SLIDE ${i + 1}/${slides.length} (${slide.role}):
Headline: ${slide.headline}
${slide.body ? `Body: ${slide.body}` : ""}
${slide.bullets?.length ? `Bullets:\n${slide.bullets.map((b: string) => `- ${b}`).join("\n")}` : ""}
${slideAnchorBlock}${carouselRefsBlock}
${brandContext ? `IDENTIDADE DA MARCA:\n${brandContext}\n` : ""}
REGRAS:
- Imagem COMPLETA com texto integrado, pronta para publicar, TEXTO EM PT-BR
- Manter identidade visual consistente entre slides
- Texto legível, fonte profissional
${carouselHasStyleRefs ? "- FIDELIDADE: replique cores, tipografia e composição das imagens de referência anexadas (mas TRADUZA qualquer texto delas para pt-BR).\n" : ""}- NUNCA inclua URLs, QR codes, @handles inventados
- Formato: ${dims.w}x${dims.h}px
${i === 0 ? "- Este é o COVER: título grande, impactante" : ""}
${slide.role === "cta" ? "- Este é o ÚLTIMO slide: chamada para ação clara" : ""}

${(carouselHasStyleRefs || brandHasStyleDirective(brandSnapshot)) ? VISUAL_RICHNESS_RULE : ILLUSTRATION_FORWARD_RULE}
${NO_UI_MOCKUP_RULE}

${SAFE_AREA_RULES}

Responda APENAS com a imagem gerada.`;

            let slideImageUrl: string | null = null;
            const tSlide = Date.now();
            try {
              const genResp = await fetch(`${supabaseUrl}/functions/v1/generate-slide-images`, {
                method: "POST",
                headers: internalHeaders,
                body: JSON.stringify({
                  userId,
                  model: requestModel,
                  slide,
                  slideIndex: i,
                  totalSlides: slides.length,
                  contentFormat: effectiveSlideFormat,
                  platform,
                  backgroundOnly: false,
                  customPrompt: slidePrompt,
                  brandId: requestBrandId || null,
                  referenceImageUrls: refs.length > 0 ? refs : undefined,
                }),
              });

              if (genResp.ok) {
                const genData = await genResp.json();
                slideImageUrl = genData.imageUrl || genData.bgImageUrl || null;
                console.log(`[ai-chat] GENERATE_CAROUSEL timing: slide ${i + 1}/${slides.length} done in ${Date.now() - tSlide}ms (gen_ms=${genData.debug?.image_generation_ms ?? "?"})`);
              } else {
                console.error(`[ai-chat] GENERATE_CAROUSEL: slide ${i + 1} generation failed after ${Date.now() - tSlide}ms:`, genResp.status);
              }
            } catch (slideErr: any) {
              console.error(`[ai-chat] GENERATE_CAROUSEL: slide ${i + 1} error after ${Date.now() - tSlide}ms:`, slideErr?.message);
            }

            return {
              index: i,
              slideImageUrl,
              updatedSlide: {
                ...slide,
                image_url: slideImageUrl,
                background_image_url: slideImageUrl,
                render_mode: "ai_full_design",
              },
            };
        };

        const slideResultsPromise = (async () => {
          if (useAnchor) {
            const cover = await genSlide(slides[0], 0);              // capa primeiro
            if (cover.slideImageUrl) anchorRef.push(cover.slideImageUrl); // vira âncora
            const rest = await Promise.all(slides.slice(1).map((s: any, idx: number) => genSlide(s, idx + 1)));
            return [cover, ...rest];
          }
          return Promise.all(slides.map((s: any, i: number) => genSlide(s, i)));
        })();

        // 7. Generate caption IN PARALLEL with the slide images — it only depends on
        // message/userCtx/platform, not on the generated images, so it rides for free
        // inside the (much longer) image-generation window.
        const captionPromise = (async (): Promise<{ caption: string; hashtags: string[] }> => {
          let caption = "";
          let hashtags: string[] = [];
          try {
            const carouselBilingual = secondaryLang && bilingualPlatforms.includes(platform)
              ? `\nIMPORTANTE: A legenda DEVE ser bilíngue — primeiro em português, depois "---" e a versão em ${secondaryLangName}.`
              : "";
            // Story carousels (each slide = a separate IG story) can't have clickable links,
            // so we don't append a source footer. Feed carousels and LinkedIn documents do.
            const carouselSourceRule = urlMatch?.[0] && !isStoryCarousel
              ? `\nFONTE OBRIGATÓRIA: Termine a legenda com uma linha em branco e depois exatamente "🔗 Fonte: ${urlMatch[0]}".`
              : "";
            const carouselNoBioRule = `\nPROIBIDO: nunca escreva "link na bio", "link no perfil", "arrasta pra cima", "swipe up", "veja mais nos stories" ou variações.`;

            const captionTopic = articleContent ? `o seguinte artigo: ${articleContent.substring(0, 1200)}` : `"${subject}"`;
            // Caption de carrossel elevada ao mesmo nível do post (copywriter: gancho/
            // desenvolvimento/CTA + regras por plataforma), preservando as regras específicas
            // de carrossel já existentes (anti-"link na bio", fonte, bilíngue).
            const carouselCaptionRules = platform === "linkedin"
              ? `REGRAS LINKEDIN:
- Tom de especialista/thought leader compartilhando insight valioso.
- Comece com um gancho forte (dado surpreendente, pergunta provocativa ou afirmação ousada).
- Parágrafos curtos (2-3 linhas) com espaçamento. CTA no final (pergunta aberta para gerar comentários).
- Máx 3000 chars. Emojis com parcimônia (1-2). 3-5 hashtags relevantes só no final.`
              : `REGRAS INSTAGRAM:
- Tom ${userCtx?.brand_voice || "natural"} e acessível, como se falasse com um seguidor próximo.
- Gancho que pare o scroll na 1ª linha. Desenvolvimento curto que faça abrir o carrossel.
- Emojis com moderação para dar ritmo. CTA claro (salve, compartilhe, comente, arrasta pro lado).
- Máx 2200 chars. 8-12 hashtags no final, separadas do texto.`;

            const captionPrompt = `Você é um especialista em copywriting para redes sociais. Gere uma legenda de alta qualidade para um carrossel de ${platform === "linkedin" ? "LinkedIn" : "Instagram"}.

${carouselCaptionRules}
${carouselNoBioRule}${carouselSourceRule}

${userCtx?.business_niche ? `NICHO DO AUTOR: ${userCtx.business_niche} — use como contexto de fundo.` : ""}
${userCtx?.brand_voice ? `TOM DE VOZ: ${userCtx.brand_voice}` : ""}

TEMA/CONTEÚDO: ${captionTopic}${carouselBilingual}

A legenda deve ter estrutura de copy: gancho + desenvolvimento + CTA. Inclua hashtags relevantes e específicas (não genéricas).
Responda APENAS em JSON: { "caption": "...", "hashtags": ["#..."] }`;

            const captionResp = await aiGatewayFetch({
              model: "openrouter/minimax-m-25",
              messages: [{ role: "user", content: captionPrompt }],
            });

            if (captionResp.ok) {
              const captionData = await captionResp.json();
              const raw = captionData.choices?.[0]?.message?.content || "";
              const parsed = parseLlmJson<{ caption?: string; hashtags?: string[] }>(raw);
              if (parsed) {
                caption = parsed.caption || "";
                hashtags = parsed.hashtags || [];
              } else {
                // Sem JSON válido: legenda fica vazia (nunca o raciocínio cru do modelo).
                console.warn("[ai-chat] GENERATE_CAROUSEL: caption sem JSON válido — legenda fica vazia");
                caption = "";
              }
            }
          } catch (captionErr: any) {
            console.warn("[ai-chat] GENERATE_CAROUSEL: caption generation failed:", captionErr?.message);
          }
          return { caption, hashtags: normalizeHashtags(hashtags) };
        })();

        const [slideResults, { caption, hashtags }] = await Promise.all([
          slideResultsPromise,
          captionPromise,
        ]);
        console.log(`[ai-chat] GENERATE_CAROUSEL timing: images+caption=${Date.now() - tStructureDone}ms`);

        // Preserve order
        slideResults.sort((a, b) => a.index - b.index);
        const imageUrls_arr: string[] = slideResults
          .map((r) => r.slideImageUrl)
          .filter((u): u is string => !!u);
        const updatedSlides: any[] = slideResults.map((r) => r.updatedSlide);

        // 8b. Variantes de legenda por plataforma (igual ao post único). Sem isto o carrossel só
        // tinha 1 legenda: publicar no LinkedIn caía no fallback (legenda da plataforma selecionada),
        // sem a variante LinkedIn otimizada NEM o bilíngue pt+en que o usuário ativou no Perfil.
        let platformCaptions: Record<string, string> | null = null;
        try {
          const bilingualNote = secondaryLang && bilingualPlatforms.length > 0
            ? `\n\nIMPORTANTE — LEGENDAS BILÍNGUES: Para as plataformas [${bilingualPlatforms.join(", ")}], a legenda DEVE ser bilíngue: primeiro o texto em português, depois uma linha "---" e o texto traduzido para ${secondaryLangName}. As outras plataformas ficam somente em português.`
            : "";
          const variantSourceRule = urlMatch?.[0] && !isStoryCarousel
            ? `\nFONTE: Para instagram, linkedin, facebook, tiktok — termine a legenda com uma linha em branco e depois exatamente "🔗 Fonte: ${urlMatch[0]}". Para X (Twitter), inclua a URL no final como link nu (sem o prefixo "🔗 Fonte:") já que o limite de 280 chars é apertado.`
            : "";
          const variantNoBioRule = `\nPROIBIDO em TODAS as plataformas: nunca escreva "link na bio", "link no perfil", "arrasta pra cima", "swipe up", "veja mais nos stories" ou variações.`;

          const variantPrompt = `Você é um copywriter especialista em cada rede social. Adapte a legenda de carrossel abaixo mantendo a essência mas otimizando RADICALMENTE para cada plataforma. NÃO é tradução — cada versão deve parecer nativa daquela rede.

LEGENDA ORIGINAL:
${caption}

HASHTAGS: ${hashtags.join(" ")}

REGRAS POR PLATAFORMA:
- instagram: Gancho forte na 1a linha (pare o scroll). Tom ${userCtx?.brand_voice || "casual"}, emojis moderados. CTA (salve/compartilhe/arrasta pro lado). 8-12 hashtags NO FINAL (separados). Máx 2200 chars.
- linkedin: Tom de especialista/thought leader. Comece com dado ou insight surpreendente. Parágrafos curtos. Pergunta no final para gerar debate. 3-5 hashtags discretos. Máx 3000 chars.
- x: Conciso, opinião forte, provocativo. Máx 280 chars. 0-2 hashtags. Sem emojis excessivos.
- tiktok: Super informal, enérgico, com urgência. CTA direto ("salve agora!", "manda pra alguém!"). Emojis ok. Máx 2200 chars.
- facebook: Tom amigável e conversacional. Pergunta aberta no início OU final para comentários. Pode ser mais longo. Máx 2000 chars.
${variantNoBioRule}${variantSourceRule}
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
            const parsedVariants = parseLlmJson<Record<string, string>>(raw);
            if (parsedVariants) {
              platformCaptions = parsedVariants;
              console.log("[ai-chat] GENERATE_CAROUSEL: platform variants generated:", Object.keys(platformCaptions || {}).join(", "));
            } else {
              console.warn("[ai-chat] GENERATE_CAROUSEL: platform variants JSON parse failed");
            }
          }
        } catch (variantErr: any) {
          console.warn("[ai-chat] GENERATE_CAROUSEL: platform variants failed:", variantErr?.message);
        }

        // 8. Save to generated_contents
        // NOTE: For story carousels we keep content_type="carousel" so the ActionCard's slide
        // navigation works as usual; the story_carousel flag in generation_metadata tells
        // publish-postforme to publish each slide as an independent story.
        const savedContentId = await persistGeneratedContent({
          generatedContent: {
            title: carouselTitle,
            caption,
            hashtags,
            platformCaptions,
            slides: updatedSlides,
          },
          fallbackTitle: carouselTitle,
          contentType: format === "document" ? "document" : "carousel",
          brandId: requestBrandId || null,
          brandSnapshot,
          platform,
          visualMode: "ai_full_design",
          generationMetadata: isStoryCarousel ? { is_story_carousel: true } : null,
        });

        // 9. Update image_urls
        if (savedContentId && imageUrls_arr.length > 0) {
          await svc.from("generated_contents")
            .update({ image_urls: imageUrls_arr })
            .eq("id", savedContentId);
          // Débito: 1 ação por slide gerado
          await chargeCredits(svc, userId, modelCostAction || "carousel_slide", imageUrls_arr.length, savedContentId);
        }

        // 10. Set reply
        const generatedCount = imageUrls_arr.length;
        const totalCount = slides.length;
        const noun = isStoryCarousel ? "stories" : "slides";
        replyOverride = generatedCount === totalCount
          ? `Carrossel de ${totalCount} ${noun} gerado! Confira abaixo.`
          : generatedCount > 0
            ? `Carrossel gerado com ${generatedCount} de ${totalCount} ${noun}. Alguns falharam.`
            : "O carrossel foi criado mas as imagens não foram geradas. Tente novamente.";

        actionResult = savedContentId ? {
          content_id: savedContentId,
          content_type: format === "document" ? "document" : "carousel",
          platform,
          preview_image_url: imageUrls_arr[0] || null,
          is_story_carousel: isStoryCarousel || undefined,
        } : null;

        console.log(`[ai-chat] GENERATE_CAROUSEL: done in ${Date.now() - tCarouselStart}ms, contentId=`, savedContentId, "images=", generatedCount);
        break;
      }

      // ════════════════════════════════════════════════════════════════════════
      // GENERATE_TWEET_CARD — X/Twitter "tweet card" carousel via Satori template.
      // Source (typed text or link) → LLM writes a thread → render-slide-image draws
      // each tweet as a card using the profile's name/@handle/avatar. Replaces Blotato.
      // ════════════════════════════════════════════════════════════════════════
      case "GENERATE_TWEET_CARD": {
        console.log("[ai-chat] GENERATE_TWEET_CARD handler started");
        const platform = requestPlatform || "instagram"; // tweet-card carousels publish as IG carousel

        {
          const denyMsg = await insufficientCredits(svc, userId, "tweet_card");
          if (denyMsg) { replyOverride = denyMsg; break; }
        }

        // 1. Source content — one of: a dropped document (PDF/DOCX/TXT — the frontend
        //    extracts its text client-side and wraps it in """...""" in the message),
        //    a link (news/article via extractArticleContent), or plain typed text.
        const urlMatch = message.match(/https?:\/\/[^\s]+/);
        const docMatch = message.match(/"""\s*([\s\S]*?)\s*"""/);
        let sourceContent = "";
        if (docMatch && docMatch[1].trim().length > 40) {
          sourceContent = docMatch[1].trim(); // PDF/DOCX/TXT briefing
        } else if (urlMatch) {
          const article = await extractArticleContent(urlMatch[0], "GENERATE_TWEET_CARD");
          sourceContent = article || message;
        } else {
          sourceContent = message;
        }
        if (sourceContent.length > 3000) sourceContent = sourceContent.substring(0, 3000);

        // 2. Profile identity for the card (name / @handle / avatar)
        const { data: prof } = await svc.from("profiles")
          .select("full_name, instagram_handle, avatar_url")
          .eq("user_id", userId).maybeSingle();
        const tweetHandle = ((prof?.instagram_handle as string) || "voce").replace(/^@+/, "").trim();
        // Nome do card = a PESSOA: full_name → @handle → fallback. NUNCA o nome da marca (é o tweet
        // do usuário, não da marca) nem "Você".
        let tweetName = ((prof?.full_name as string) || "").trim();
        if (!tweetName) tweetName = tweetHandle && tweetHandle !== "voce" ? tweetHandle : "Seu perfil";
        const tweetProfile = {
          name: tweetName,
          handle: tweetHandle,
          avatar_url: (prof?.avatar_url as string) || null,
          verified: true,
        };

        // 3. LLM writes the thread as a JSON array of tweet strings
        const tweetPrompt = `Você é um ghostwriter de threads virais no X (Twitter), em português brasileiro.
A partir do conteúdo abaixo, escreva uma THREAD de 4 a 7 tweets curtos — cada um vira um card independente de carrossel.

CONTEÚDO: ${sourceContent}
${userCtx?.brand_voice ? `TOM DE VOZ: ${userCtx.brand_voice}` : ""}
${userCtx?.business_niche ? `NICHO DO AUTOR: ${userCtx.business_niche}` : ""}

REGRAS:
- Cada tweet: NO MÁXIMO 280 caracteres, linguagem natural de X (direto, com gancho).
- O 1º tweet é o GANCHO que para o scroll.
- Use listas com "1 -", "2 -" quando fizer sentido (estilo thread).
- No máximo 1 emoji por tweet, com moderação. SEM hashtags.
- Cada tweet se sustenta sozinho como um slide.
- Português do Brasil, acentos corretos. Use APENAS palavras reais e bem grafadas — NÃO invente
  nem deforme palavras (ex.: o certo é "chefões", nunca "chefsões"; "ações", nunca "açõens").
  Revise mentalmente cada palavra antes de responder.

Responda APENAS com um array JSON de strings: ["tweet 1", "tweet 2", ...]`;

        let tweets: string[] = [];
        try {
          const r = await aiGatewayFetch({
            model: "openrouter/minimax-m-25",
            messages: [{ role: "user", content: tweetPrompt }],
          });
          if (r.ok) {
            const d = await r.json();
            const raw = d.choices?.[0]?.message?.content || "";
            const m = raw.match(/\[[\s\S]*\]/);
            if (m) {
              tweets = JSON.parse(m[0])
                .filter((t: any) => typeof t === "string" && t.trim())
                .map((t: string) => enforceTweetLimit(t.trim())); // ≤280 chars por card
            }
          }
        } catch (e: any) {
          console.error("[ai-chat] GENERATE_TWEET_CARD: thread generation failed:", e?.message);
        }
        tweets = tweets.slice(0, 10); // Instagram carousel cap
        if (tweets.length === 0) {
          replyOverride = "Não consegui montar a thread do tweet card. Tenta de novo com um tema ou um link.";
          break;
        }

        // 4. Render each tweet as a card (Satori, visual_style=tweet_card). Retry once:
        //    render-slide-image can fail/time-out on a cold start (WASM init for satori/resvg)
        //    on the first hit after a deploy — a second attempt finds it warm.
        let cardUrls: string[] = [];
        for (let attempt = 0; attempt < 2 && cardUrls.length === 0; attempt++) {
          if (attempt > 0) await new Promise((r) => setTimeout(r, 1500));
          try {
            const draftId = crypto.randomUUID();
            const renderResp = await fetch(`${supabaseUrl}/functions/v1/render-slide-image`, {
              method: "POST",
              headers: internalHeaders,
              body: JSON.stringify({
                slides: tweets.map((t) => ({ text: t })),
                content_id: draftId,
                visual_style: "tweet_card",
                tweet_profile: tweetProfile,
              }),
            });
            if (renderResp.ok) {
              const rd = await renderResp.json();
              cardUrls = rd.composite_urls || [];
            } else {
              const errText = await renderResp.text().catch(() => "");
              console.error(`[ai-chat] GENERATE_TWEET_CARD: render failed (attempt ${attempt + 1}):`, renderResp.status, errText.substring(0, 300));
            }
          } catch (e: any) {
            console.error(`[ai-chat] GENERATE_TWEET_CARD: render error (attempt ${attempt + 1}):`, e?.message);
          }
        }
        if (cardUrls.length === 0) {
          replyOverride = "Montei a thread, mas os cards não renderizaram. Tenta de novo.";
          break;
        }

        // 5. Legenda de Instagram REAL (não despejar a thread): gancho + CTA leve + hashtags do tema.
        let caption = tweets[0]; // fallback: o gancho (não a thread inteira) se a geração falhar
        let tweetHashtags: string[] = [];
        try {
          const capPrompt = `Você é copywriter de Instagram (pt-BR). A partir da thread abaixo, escreva UMA legenda de Instagram — NÃO repita os tweets. 2 a 4 linhas: 1ª linha é um gancho, depois contexto curto + 1 CTA leve (ex.: "arrasta pro lado", "salva pra depois"). Tom natural, português impecável (só palavras reais). Depois 4 a 6 hashtags relevantes do tema (sem inventar).
THREAD: ${tweets.join(" / ")}
Responda APENAS JSON: {"caption":"...","hashtags":["tag1","tag2"]}`;
          const cr = await aiGatewayFetch({ model: "openrouter/minimax-m-25", messages: [{ role: "user", content: capPrompt }] });
          if (cr.ok) {
            const cd = await cr.json();
            const craw = cd.choices?.[0]?.message?.content || "";
            const parsed = parseLlmJson<{ caption?: string; hashtags?: string[] }>(craw);
            if (parsed) {
              // caption mantém o fallback (tweets[0]) se vier vazia — nunca o raciocínio cru.
              if (typeof parsed.caption === "string" && parsed.caption.trim()) caption = parsed.caption.trim();
              if (Array.isArray(parsed.hashtags)) {
                tweetHashtags = parsed.hashtags
                  .filter((h: any) => typeof h === "string" && h.trim())
                  .map((h: string) => h.replace(/^#/, "").trim())
                  .slice(0, 6);
              }
            }
          }
        } catch (e: any) { console.error("[ai-chat] GENERATE_TWEET_CARD: caption gen failed:", e?.message); }
        const tweetTitle = tweets[0].length > 80 ? tweets[0].substring(0, 80) + "…" : tweets[0];
        // render_mode "ai_full_design" (NOT "tweet_card"): the frontend already treats
        // ai_full_design as "image has baked text — show directly, no overlay" everywhere
        // (ActionCard, ContentPreview, SlideEditor). Reusing it kills the double-text overlay
        // without touching N frontend components.
        const updatedTweetSlides = tweets.map((t, i) => ({
          role: i === 0 ? "cover" : "content",
          text: t,
          headline: t,
          image_url: cardUrls[i] || null,
          background_image_url: cardUrls[i] || null,
          render_mode: "ai_full_design",
        }));

        const savedContentId = await persistGeneratedContent({
          generatedContent: { title: tweetTitle, caption, hashtags: tweetHashtags, slides: updatedTweetSlides },
          fallbackTitle: tweetTitle,
          contentType: "carousel",
          brandId: requestBrandId || null,
          brandSnapshot: null,
          platform,
          visualMode: "tweet_card",
          generationMetadata: { tweet_card: true },
        });

        if (savedContentId && cardUrls.length > 0) {
          await svc.from("generated_contents").update({ image_urls: cardUrls }).eq("id", savedContentId);
          await chargeCredits(svc, userId, "tweet_card", 1, savedContentId);
        }

        replyOverride = `Carrossel de tweet card com ${cardUrls.length} cards gerado! Confira abaixo.`;
        actionResult = savedContentId ? {
          content_id: savedContentId,
          content_type: "carousel",
          platform,
          preview_image_url: cardUrls[0] || null,
        } : null;

        console.log("[ai-chat] GENERATE_TWEET_CARD: done, contentId=", savedContentId, "cards=", cardUrls.length);
        break;
      }

      // ════════════════════════════════════════════════════════════════════════
      // GENERATE_EDITORIAL_CAROUSEL — Carrossel editorial cinematográfico (formato viral):
      // minimax estrutura o gancho (headline tokenizada + photo_prompt "sem texto") →
      // gera as fotos em paralelo → render-slide-image compõe a moldura editorial (Satori).
      // ════════════════════════════════════════════════════════════════════════
      case "GENERATE_EDITORIAL_CAROUSEL": {
        console.log("[ai-chat] GENERATE_EDITORIAL_CAROUSEL handler started");
        const platform = requestPlatform || "instagram";

        {
          // Pre-check com o mínimo do formato (4 slides); a cobrança real é por slide gerado.
          // editorial_slide tem preço próprio: o motor é Satori (custo ~zero), não gpt-image.
          const denyMsg = await insufficientCredits(svc, userId, "editorial_slide", 4);
          if (denyMsg) { replyOverride = denyMsg; break; }
        }

        // 1. Fonte (texto digitado / link / documento)
        const urlMatch = message.match(/https?:\/\/[^\s]+/);
        const docMatch = message.match(/"""\s*([\s\S]*?)\s*"""/);
        let sourceContent = "";
        if (docMatch && docMatch[1].trim().length > 40) sourceContent = docMatch[1].trim();
        else if (urlMatch) { const a = await extractArticleContent(urlMatch[0], "GENERATE_EDITORIAL_CAROUSEL"); sourceContent = a || message; }
        else sourceContent = message;
        if (sourceContent.length > 3000) sourceContent = sourceContent.substring(0, 3000);

        // 2. Perfil (handle pra moldura)
        const { data: edProf } = await svc.from("profiles").select("instagram_handle").eq("user_id", userId).maybeSingle();
        const edHandle = ((edProf?.instagram_handle as string) || "voce").replace(/^@+/, "");

        // MODO FOTOS DO USUÁRIO: se enviou fotos (ex.: do congresso), elas viram os fundos dos
        // slides — pulamos a geração por IA. Celeridade: "estive no evento X → carrossel pronto".
        const userPhotos = (imageUrls || []).filter((u: string) => typeof u === "string" && u.startsWith("http"));
        const photoMode = userPhotos.length >= 2;

        // Cor de destaque vem da paleta da marca quando houver (senão o teal padrão).
        let edHighlight = "#19E5C5";
        if (requestBrandId) {
          const { data: edBrand } = await svc.from("brands").select("palette").eq("id", requestBrandId).maybeSingle();
          const pal = (edBrand as any)?.palette;
          const first = Array.isArray(pal) ? pal[0] : null;
          const hex = typeof first === "string" ? first : (first?.hex || first?.color);
          if (hex && /^#?[0-9a-fA-F]{6}$/.test(String(hex))) edHighlight = String(hex).startsWith("#") ? String(hex) : `#${hex}`;
        }

        // 3. minimax estrutura o carrossel editorial (JSON)
        const photoModeRule = photoMode
          ? `\nMODO FOTOS DO EVENTO: o usuário enviou ${userPhotos.length} fotos reais de um evento/lugar. Gere EXATAMENTE ${userPhotos.length} slides (um por foto, na ordem). As headlines devem narrar a experiência/aprendizados do evento descrito — NÃO descreva as fotos. NÃO inclua "photo_prompt" (as fotos já existem). 1º slide = capa que situa o evento; último = CTA.`
          : "";
        const edPrompt = `Você é um diretor de conteúdo viral. A partir do conteúdo abaixo, monte um CARROSSEL EDITORIAL de ${photoMode ? `EXATAMENTE ${userPhotos.length}` : "4 a 6"} slides em português brasileiro, estilo "mini-revista de gancho".
${photoModeRule}
CONTEÚDO: ${sourceContent}
${userCtx?.business_niche ? `NICHO: ${userCtx.business_niche}` : ""}
${userCtx?.brand_voice ? `TOM: ${userCtx.brand_voice}` : ""}

REGRAS:
- 1º slide = CAPA: a headline é o GANCHO de curiosidade (reframe contrário, "o que ninguém te conta", custo escondido). Slides 2..N desenvolvem 1 ideia cada. Último = CTA (salvar/compartilhar).
- Cada headline: CURTA e impactante, NO MÁXIMO 8 palavras (idealmente 5-7). Headline longa quebra o layout — seja conciso.
- "headline_tokens": divida a headline em PALAVRAS, cada uma {"t":"PALAVRA"}. Marque 1-2 palavras-chave por slide com "hl":true (as que merecem cor de destaque).
- "kicker": 1 palavra de seção (ex: SAÚDE, NEGÓCIOS). "badge": hashtag de marca curta.
- "photo_prompt": uma FOTO cinematográfica/dramática fotorrealista que ilustra o slide, SEM TEXTO.

Responda APENAS em JSON:
{"kicker":"SAÚDE","badge":"#SUAMARCA","slides":[{"headline_tokens":[{"t":"O"},{"t":"QUE"},{"t":"PARECEU"},{"t":"PREGUIÇA","hl":true},{"t":"ERA"},{"t":"INFLAMAÇÃO","hl":true}],"photo_prompt":"homem exausto na cama, luz azul dramática, cinematográfico"}]}`;

        let edStruct: any = null;
        try {
          const r = await aiGatewayFetch({ model: "openrouter/minimax-m-25", messages: [{ role: "user", content: edPrompt }] });
          if (r.ok) {
            const d = await r.json();
            const raw = d.choices?.[0]?.message?.content || "";
            edStruct = parseLlmJson<any>(raw);
          }
        } catch (e: any) { console.error("[ai-chat] EDITORIAL: struct failed:", e?.message); }

        let edSlides: any[] = Array.isArray(edStruct?.slides) ? edStruct.slides.slice(0, 8) : [];
        // No modo fotos, alinha 1 slide por foto (não renderiza foto sem headline nem vice-versa).
        if (photoMode) edSlides = edSlides.slice(0, userPhotos.length);
        if (edSlides.length === 0) { replyOverride = "Não consegui montar o carrossel editorial. Tenta de novo com um tema ou link."; break; }
        const edKicker = edStruct?.kicker || (userCtx?.business_niche ? String(userCtx.business_niche).toUpperCase().slice(0, 16) : "DESTAQUE");
        const edBadge = edStruct?.badge || `#${edHandle}`;

        // 4. Fotos de fundo: no modo fotos usa as do usuário; senão gera por IA (sem texto) em PARALELO.
        const edPhotos: (string | null)[] = photoMode
          ? edSlides.map((_: any, i: number) => userPhotos[i] || null)
          : await Promise.all(edSlides.map(async (s: any, i: number) => {
          const headlineText = (s.headline_tokens || []).map((t: any) => t.t).join(" ");
          const pPrompt = `Foto cinematográfica fotorrealista vertical: ${s.photo_prompt || headlineText || "cena dramática"}. Composição nítida, atmosfera dramática, profundidade de campo rasa. SEM TEXTO, SEM LETRAS, SEM TIPOGRAFIA, SEM MARCA D'ÁGUA, SEM LEGENDA.`;
          try {
            const gr = await fetch(`${supabaseUrl}/functions/v1/generate-slide-images`, {
              method: "POST", headers: internalHeaders,
              body: JSON.stringify({ userId, slide: { role: "cover", headline: "" }, slideIndex: i, totalSlides: edSlides.length, contentFormat: "post", platform, backgroundOnly: false, customPrompt: pPrompt, brandId: null }),
            });
            if (gr.ok) { const gd = await gr.json(); return gd.imageUrl || gd.bgImageUrl || null; }
            console.error(`[ai-chat] EDITORIAL: photo ${i + 1} failed: ${gr.status}`);
          } catch (e: any) { console.error(`[ai-chat] EDITORIAL: photo ${i + 1} error:`, e?.message); }
          return null;
        }));

        // 5. Overlay editorial — UMA chamada de render POR SLIDE (memória fresca + paralelo).
        //    Render com N slides juntos estoura WORKER_RESOURCE_LIMIT (cada foto vira base64 grande).
        const edRenderSlides = edSlides.map((s: any, i: number) => ({
          background_image_url: edPhotos[i],
          headline_tokens: s.headline_tokens || [],
          kicker: edKicker, badge: edBadge, highlight: edHighlight,
        }));
        const edContentId = crypto.randomUUID();
        const edCardResults: (string | null)[] = await Promise.all(edRenderSlides.map(async (rs: any, i: number) => {
          for (let attempt = 0; attempt < 2; attempt++) {
            if (attempt > 0) await new Promise((r) => setTimeout(r, 1200));
            try {
              const rr = await fetch(`${supabaseUrl}/functions/v1/render-slide-image`, {
                method: "POST", headers: internalHeaders,
                body: JSON.stringify({ slides: [rs], content_id: edContentId, slide_offset: i, visual_style: "editorial_card", dimensions: { width: 1080, height: 1350 }, tweet_profile: { handle: edHandle } }),
              });
              if (rr.ok) { const rd = await rr.json(); if (rd.composite_urls?.[0]) return rd.composite_urls[0] as string; }
              else console.error(`[ai-chat] EDITORIAL: render slide ${i + 1} failed (attempt ${attempt + 1}): ${rr.status}`);
            } catch (e: any) { console.error(`[ai-chat] EDITORIAL: render slide ${i + 1} error:`, e?.message); }
          }
          return null;
        }));
        const edCardUrls: string[] = edCardResults.filter((u): u is string => !!u);
        if (edCardUrls.length === 0) { replyOverride = "Montei o roteiro, mas os slides editoriais não renderizaram. Tenta de novo."; break; }

        // 6. Legenda
        let edCaption = ""; let edHashtags: string[] = [];
        try {
          const headlinesText = edSlides.map((s: any) => (s.headline_tokens || []).map((t: any) => t.t).join(" ")).join(" | ");
          const cr = await aiGatewayFetch({ model: "openrouter/minimax-m-25", messages: [{ role: "user", content: `Gere uma legenda curta e engajante (pt-BR) para um carrossel sobre: "${message}". Pontos: ${headlinesText}. 5-8 hashtags no fim. JSON: {"caption":"...","hashtags":["#..."]}` }] });
          if (cr.ok) { const cd = await cr.json(); const raw = cd.choices?.[0]?.message?.content || ""; const p = parseLlmJson<{ caption?: string; hashtags?: string[] }>(raw); if (p) { edCaption = p.caption || ""; edHashtags = normalizeHashtags(p.hashtags); } }
        } catch { /* legenda opcional */ }

        // 7. Persist
        const edTitle = ((edSlides[0]?.headline_tokens || []).map((t: any) => t.t).join(" ").slice(0, 80)) || "Carrossel editorial";
        const edUpdatedSlides = edSlides
          .map((s: any, i: number) => ({ s, url: edCardResults[i] }))
          .filter((x: any) => !!x.url)
          .map((x: any, j: number, arr: any[]) => ({
            role: j === 0 ? "cover" : (j === arr.length - 1 ? "cta" : "content"),
            headline: (x.s.headline_tokens || []).map((t: any) => t.t).join(" "),
            image_url: x.url,
            background_image_url: x.url,
            render_mode: "ai_full_design",
          }));
        const savedContentId = await persistGeneratedContent({
          generatedContent: { title: edTitle, caption: edCaption, hashtags: edHashtags, slides: edUpdatedSlides },
          fallbackTitle: edTitle, contentType: "carousel", brandId: requestBrandId || null, brandSnapshot: null,
          platform, visualMode: "editorial_card", generationMetadata: { editorial_card: true },
        });
        if (savedContentId && edCardUrls.length > 0) {
          await svc.from("generated_contents").update({ image_urls: edCardUrls }).eq("id", savedContentId);
          await chargeCredits(svc, userId, "editorial_slide", edCardUrls.length, savedContentId);
        }
        replyOverride = `Carrossel editorial com ${edCardUrls.length} slides gerado! Confira abaixo. 🎬`;
        actionResult = savedContentId ? { content_id: savedContentId, content_type: "carousel", platform, preview_image_url: edCardUrls[0] || null } : null;
        console.log("[ai-chat] GENERATE_EDITORIAL_CAROUSEL: done, slides=", edCardUrls.length);
        break;
      }

      // ════════════════════════════════════════════════════════════════════════
      // FREE_IMAGE — Geração livre (imagem crua, "estilo Gemini"): sem marca, sem
      // moldura de post/legenda. O usuário pede "gere uma imagem de X" e recebe a imagem.
      // ════════════════════════════════════════════════════════════════════════
      case "FREE_IMAGE": {
        console.log("[ai-chat] FREE_IMAGE handler started");
        const platform = requestPlatform || "instagram";

        {
          const denyMsg = await insufficientCredits(svc, userId, modelCostAction || "free_image");
          if (denyMsg) { replyOverride = denyMsg; break; }
        }
        // Tira o comando ("gere uma imagem de...") e deixa só o assunto pro modelo.
        const subject = (message || "")
          .replace(/^\s*(ger[ae]|gera|crie|cria|fa[çc]a|desenh[ae]|ilustre|me\s+d[êe]|quero|gostaria\s+de)\s+(uma?\s+)?(imagem|foto(grafia)?|ilustra[çc][ãa]o|arte|desenho|logo(tipo)?|figura|render)\s*(de|do|da|com|sobre|pra|para|que|:)?\s*/i, "")
          .trim() || message;
        const imagePrompt = `Crie uma imagem de altíssima qualidade: ${subject}. Composição nítida e bem enquadrada, sem marca d'água, sem texto sobreposto a menos que o pedido peça texto.`;

        let imageUrl: string | null = null;
        try {
          const genController = new AbortController();
          const genTimer = setTimeout(() => genController.abort(), 130000); // ver nota no GENERATE: inference.sh lento (~51s ×2)
          const genResp = await fetch(`${supabaseUrl}/functions/v1/generate-slide-images`, {
            signal: genController.signal,
            method: "POST",
            headers: internalHeaders,
            body: JSON.stringify({
              userId,
              model: requestModel,
              slide: { role: "cover", headline: subject.slice(0, 80), body: "" },
              slideIndex: 0,
              totalSlides: 1,
              contentFormat: "post",
              platform,
              backgroundOnly: false,
              customPrompt: imagePrompt,
              brandId: null,
            }),
          });
          clearTimeout(genTimer);
          if (genResp.ok) {
            const genData = await genResp.json();
            imageUrl = genData.imageUrl || genData.bgImageUrl || null;
          } else {
            console.error("[ai-chat] FREE_IMAGE: generate-slide-images failed:", genResp.status);
          }
        } catch (e: any) {
          console.error("[ai-chat] FREE_IMAGE: error:", e?.name === "AbortError" ? "timeout(80s)" : e?.message);
        }

        if (imageUrl) {
          const freeTitle = subject.slice(0, 60) || "Imagem";
          const savedContentId = await persistGeneratedContent({
            generatedContent: {
              title: freeTitle,
              caption: "",
              hashtags: [],
              slides: [{ headline: freeTitle, body: "", bullets: [], image_url: imageUrl, background_image_url: imageUrl, render_mode: "ai_full_design" }],
            },
            fallbackTitle: freeTitle,
            contentType: "post",
            brandId: null,
            brandSnapshot: null,
            platform,
            visualMode: "ai_full_design",
            generationMetadata: { free_image: true },
          });
          if (savedContentId) {
            await svc.from("generated_contents").update({ image_urls: [imageUrl] }).eq("id", savedContentId);
            await chargeCredits(svc, userId, modelCostAction || "free_image", 1, savedContentId);
          }
          replyOverride = "Imagem gerada! Confira abaixo. 🎨";
          actionResult = savedContentId ? { content_id: savedContentId, content_type: "post", platform, preview_image_url: imageUrl } : null;
        } else {
          replyOverride = "Não consegui gerar a imagem agora. Tenta de novo ou reformula o pedido.";
        }
        console.log("[ai-chat] FREE_IMAGE: done, img=", imageUrl ? "yes" : "no");
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
        const existingPlatform = generationParams?.newPlatform || existing.platform || "instagram";
        const existingFormat = generationParams?.newContentType || existing.content_type || "post";
        const isAdapting = !!(generationParams?.newPlatform || generationParams?.newContentType);

        // Edição regenera 1 imagem (custo real de provider) — cobra como post/story.
        const editAction = existingFormat === "story" ? "story" : "post";
        {
          const denyMsg = await insufficientCredits(svc, userId, editAction);
          if (denyMsg) { replyOverride = denyMsg; break; }
        }

        // Load brand context for edit prompt
        let editBrandContext = "";
        if (existing.brand_id) {
          const { data: editBrand } = await svc.from("brands")
            .select("name, palette, fonts, visual_tone, do_rules, dont_rules, visual_preferences, logo_url, creation_mode, style_guide")
            .eq("id", existing.brand_id).single();
          if (editBrand) {
            // Mesmo serializador dos outros handlers: o EDIT agora inclui custom_notes
            // (visual_preferences) e style_guide, que a versão antiga perdia.
            editBrandContext = buildBrandContext(editBrand);
          }
        }

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
        const editPrompt = isAdapting
          ? `FORMATO OBRIGATÓRIO: ${dimLabel}. Gere a imagem EXATAMENTE neste formato.

Você está ADAPTANDO um conteúdo existente para ${platformLabel} (${existingFormat}).
A imagem de referência fornecida é o conteúdo original — recrie o MESMO conceito visual adaptado ao novo formato.

INSTRUÇÃO: Adapte este conteúdo para ${platformLabel} ${existingFormat}. ${instruction}
${editBrandContext ? `\nIDENTIDADE VISUAL DA MARCA:\n${editBrandContext}\n` : ""}
REGRAS:
- Mantenha o mesmo conceito, tema, textos e estilo visual do original.
- Adapte o layout para o formato ${dimLabel}.
- Para story (9:16): redistribua os elementos verticalmente, use texto grande e legível.
- Para post (1:1): use layout equilibrado com boa hierarquia visual.
- Mantenha qualidade profissional, tipografia legível e identidade do conteúdo.
- NÃO inclua URLs, QR codes ou logotipos externos.

${NO_UI_MOCKUP_RULE}

${SAFE_AREA_RULES}`
          : `FORMATO OBRIGATÓRIO: ${dimLabel}. Gere a imagem EXATAMENTE neste formato.

Você está editando uma imagem de ${platformLabel} (${existingFormat}).
A imagem de referência fornecida é o conteúdo atual — use-a como base visual.

O QUE MUDAR: ${instruction}
${editBrandContext ? `\nIDENTIDADE VISUAL DA MARCA (mantenha estas referências na edição):\n${editBrandContext}\n` : ""}
REGRAS:
- Aplique APENAS a mudança pedida acima. Mantenha tudo o mais igual possível.
- Se pede mudança de cor: altere a cor mantendo layout e texto.
- Se pede mudança de texto: altere o texto mantendo estilo visual.
- Se pede mudança visual/estilo: altere o visual mantendo os textos.
- Mantenha qualidade profissional, tipografia legível e identidade do conteúdo.
- NÃO inclua URLs, QR codes ou logotipos externos.

${NO_UI_MOCKUP_RULE}

${SAFE_AREA_RULES}`;

        // Call generate-slide-images with edit prompt + current image as reference
        let newImageUrl: string | null = null;
        try {
          const editResp = await fetch(`${supabaseUrl}/functions/v1/generate-slide-images`, {
            method: "POST",
            headers: internalHeaders,
            body: JSON.stringify({
              userId,
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

          const updatePayload: Record<string, any> = {
            image_urls: [newImageUrl],
            slides: updatedSlides,
          };
          if (isAdapting) {
            updatePayload.platform = existingPlatform;
            updatePayload.content_type = existingFormat;
          }
          await svc.from("generated_contents").update(updatePayload).eq("id", targetId);
          await chargeCredits(svc, userId, editAction, 1, targetId);

          replyOverride = isAdapting
            ? `Conteúdo adaptado para ${platformLabel} ${existingFormat}! Confira o resultado.`
            : "Imagem atualizada! Confira o resultado.";
        } else {
          replyOverride = isAdapting
            ? "Não consegui adaptar o conteúdo. Tente novamente."
            : "Não consegui editar a imagem. Tente novamente com uma instrução diferente.";
        }

        actionResult = {
          content_id: targetId,
          content_type: existingFormat,
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

            // Only accept quoted candidates if the message clearly talks about a brand.
            // Prevents false positives like the word "boost" in a post about energy drinks.
            const hasBrandContext = /\b(marca|empresa|logo|identidade\s+visual)\b/i.test(text);
            if (hasBrandContext) {
              const quoted = text.match(/["""'`´]([^"""'`´]{2,60})["""'`´]/);
              if (quoted?.[1]) {
                const quotedName = sanitizeBrandName(quoted[1]);
                if (quotedName) return quotedName;
              }
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
              extracted = parseLlmJson<any>(raw) || {};
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
                const parsedPrefs = parseLlmJson<Record<string, any>>(raw);
                if (parsedPrefs) {
                  visualPrefs = parsedPrefs;
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
              const parsed = parseLlmJson<{ colors?: string[]; visual_tone?: string }>(raw);
              if (parsed) {
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
            const parsed = parseLlmJson<{ field?: string; value?: string; action?: string }>(raw);
            if (parsed) {
              const { field, value, action } = parsed;
              const allowedFields = ["business_niche", "brand_voice", "content_topics", "instagram_handle"];
              if (action === "ask" || !value || value === "novo valor") {
                const fieldLabels: Record<string, string> = { business_niche: "nicho", brand_voice: "tom de voz", content_topics: "temas", instagram_handle: "Instagram" };
                replyOverride = `Para qual ${fieldLabels[field ?? ""] || "valor"} você quer mudar? Me diga especificamente, por exemplo: "meu nicho é Marketing Digital".`;
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
      // Use explicit timestamps to guarantee user message is ordered BEFORE assistant reply
      // (otherwise both rows can share the same created_at and reload order becomes unstable)
      const nowMs = Date.now();
      const userTs = new Date(nowMs).toISOString();
      const assistantTs = new Date(nowMs + 50).toISOString();

      // Only save user message if it's real user input (not an internal trigger)
      if (!isInternalMessage) {
        messagesToInsert.push({ user_id: userId, role: "user", content: message, created_at: userTs });
      }

      // Always save assistant reply (unless it's empty)
      if (reply) {
        messagesToInsert.push({
          user_id: userId,
          role: "assistant",
          content: reply,
          intent: detectedIntent,
          metadata: actionResult ? { action_result: actionResult, quick_replies: quickReplies } : quickReplies ? { quick_replies: quickReplies } : {},
          created_at: assistantTs,
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
