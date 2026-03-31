import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchAI } from "../_shared/ai-gateway.ts";

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
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const t0 = Date.now();
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const apiKey = Deno.env.get("LOVABLE_API_KEY") || Deno.env.get("INFERENCE_SH_API_KEY") || Deno.env.get("GOOGLE_AI_API_KEY") || "";

    const {
      brandId, slide, slideIndex, totalSlides, contentFormat,
      articleUrl, articleContent, contentId,
      templateSetId, categoryId,
      styleGalleryId,
      language: requestLanguage,
      backgroundOnly, // when true, generate background without any text
      illustrationMode, // when true, generate illustrative scene (not text-heavy design)
      platform: requestPlatform,
    } = await req.json();
    const platform = requestPlatform || "instagram";

    if (!slide) throw new Error("slide object is required");

    const language = requestLanguage || "pt-BR";
    // backgroundOnly: true = generate only background (text rendered by frontend overlay)
    // backgroundOnly: false = generate complete image with text (ai_full_design mode)
    const isBgOnly = backgroundOnly !== false;

    console.log(`[generate-slide-images] mode=${isBgOnly ? "BACKGROUND-ONLY" : "FULL-DESIGN"}, slideIndex=${slideIndex}, platform=${platform}, contentFormat=${contentFormat}, backgroundOnly=${backgroundOnly}`);

    // ══════ STYLE GALLERY MODE ══════
    if (styleGalleryId) {
      const { data: galleryStyle } = await supabaseAdmin
        .from("system_template_sets")
        .select("name, reference_images, preview_images, supported_formats, style_prompt")
        .eq("id", styleGalleryId)
        .single();

      if (!galleryStyle) {
        return new Response(JSON.stringify({
          success: false,
          error: `Estilo da galeria não encontrado (ID: ${styleGalleryId}).`,
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const refImages = galleryStyle.reference_images as Record<string, Record<string, string[]>> | null;
      const formatKey = contentFormat === "carousel" ? "carousel" : contentFormat === "story" ? "story" : "post";

      const formatRefs = refImages?.[formatKey];
      if (!formatRefs || Object.values(formatRefs).flat().length === 0) {
        const fallbackRefs = refImages?.["post"];
        if (!fallbackRefs || Object.values(fallbackRefs).flat().length === 0) {
          return new Response(JSON.stringify({
            success: false,
            error: `Estilo "${galleryStyle.name}" não possui referências para o formato "${formatKey}".`,
          }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      const role = slide.role || "content";
      const roleRefs = formatRefs?.[role] || formatRefs?.["content"] || [];
      const allFormatRefs = Object.values(formatRefs || {}).flat();
      const selectedRefs = roleRefs.length > 0 ? roleRefs : allFormatRefs;

      console.log(`[generate-slide-images] STYLE_GALLERY mode: style="${galleryStyle.name}", format=${formatKey}, role=${role}, refs=${selectedRefs.length}`);

      const contentParts: any[] = [];
      for (const imgUrl of selectedRefs.slice(0, 6)) {
        contentParts.push({ type: "image_url", image_url: { url: imgUrl } });
      }

      // Choose prompt based on mode
      const prompt = isBgOnly
        ? buildBackgroundOnlyPrompt(slide, slideIndex || 0, totalSlides || 1, null, contentFormat, platform, null, null, galleryStyle.name, language)
        : buildPrompt(slide, slideIndex || 0, totalSlides || 1, null, undefined, undefined, contentFormat, platform, null, null, galleryStyle.name, language, null);
      contentParts.push({ type: "text", text: prompt });

      const result = await generateImage(contentParts);

      if (!result) {
        return new Response(JSON.stringify({
          success: true, imageUrl: null, bgImageUrl: null,
          debug: { styleGalleryId, styleName: galleryStyle.name, referencesUsedCount: selectedRefs.length, mode: "style_gallery", backgroundOnly: isBgOnly },
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const imageUrl = await uploadBase64ToStorage(supabaseAdmin, result, contentId || "draft", slideIndex || 0);
      return new Response(JSON.stringify({
        success: true,
        imageUrl: imageUrl,
        bgImageUrl: imageUrl,
        debug: {
          styleGalleryId, styleName: galleryStyle.name,
          referencesUsedCount: selectedRefs.length, mode: "background_only",
          image_model: "google/gemini-3-pro-image-preview",
          image_generation_ms: Date.now() - t0,
          backgroundOnly: true,
        },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ══════ LOAD BRAND (optional — "Sem marca" generates without brand refs) ══════
    let brandInfo: any = null;
    if (brandId) {
      const { data } = await supabase
        .from("brands")
        .select("name, palette, fonts, visual_tone, do_rules, dont_rules, logo_url, visual_preferences")
        .eq("id", brandId)
        .single();
      brandInfo = data;
    }
    if (!brandId) {
      console.log("[generate-slide-images] No brand — generating without brand references");
    }

    // ══════ LOAD TEMPLATE SET ══════
    let templateSetData: any = null;
    let resolvedCategoryId: string | null = categoryId || null;
    let templateSetName: string | null = null;

    if (templateSetId) {
      const { data: tsData } = await supabase
        .from("brand_template_sets")
        .select("id, name, category_id, category_name, template_set, visual_signature")
        .eq("id", templateSetId)
        .single();

      if (tsData) {
        templateSetData = tsData;
        templateSetName = tsData.name;
        if (!resolvedCategoryId && tsData.category_id) {
          resolvedCategoryId = tsData.category_id;
        }
      }
    }

    // ══════ LOAD REFERENCE IMAGES ══════
    const contentTypeFilter = contentFormat === "carousel" ? "carrossel"
      : contentFormat === "story" ? "story"
      : "post";

    const strictTemplateCategoryLock = Boolean(templateSetId && resolvedCategoryId);

    let referenceImageUrls: string[] = [];
    let referenceExampleIds: string[] = [];
    let fallbackLevel = 0;

    if (brandId && resolvedCategoryId) {
      const { data: catExactTypeExamples } = await supabase
        .from("brand_examples")
        .select("id, image_url")
        .eq("brand_id", brandId)
        .eq("category_id", resolvedCategoryId)
        .eq("type", contentTypeFilter)
        .order("created_at", { ascending: false })
        .limit(12);

      if (catExactTypeExamples && catExactTypeExamples.length > 0) {
        referenceImageUrls = catExactTypeExamples.map((e: any) => e.image_url).filter(Boolean);
        referenceExampleIds = catExactTypeExamples.map((e: any) => e.id);
        fallbackLevel = 0;
      } else {
        const { data: catAnyTypeExamples } = await supabase
          .from("brand_examples")
          .select("id, image_url")
          .eq("brand_id", brandId)
          .eq("category_id", resolvedCategoryId)
          .order("created_at", { ascending: false })
          .limit(12);

        if (catAnyTypeExamples && catAnyTypeExamples.length > 0) {
          referenceImageUrls = catAnyTypeExamples.map((e: any) => e.image_url).filter(Boolean);
          referenceExampleIds = catAnyTypeExamples.map((e: any) => e.id);
          fallbackLevel = 1;
        }
      }
    }

    // When a specific template set is selected, never mix with brand-wide references.
    if (brandId && referenceImageUrls.length === 0 && !strictTemplateCategoryLock) {
      const { data: brandExactTypeExamples } = await supabase
        .from("brand_examples")
        .select("id, image_url")
        .eq("brand_id", brandId)
        .eq("type", contentTypeFilter)
        .order("created_at", { ascending: false })
        .limit(12);

      if (brandExactTypeExamples && brandExactTypeExamples.length > 0) {
        referenceImageUrls = brandExactTypeExamples.map((e: any) => e.image_url).filter(Boolean);
        referenceExampleIds = brandExactTypeExamples.map((e: any) => e.id);
        fallbackLevel = 2;
      }
    }

    if (brandId && referenceImageUrls.length === 0 && !strictTemplateCategoryLock) {
      const { data: brandAnyTypeExamples } = await supabase
        .from("brand_examples")
        .select("id, image_url")
        .eq("brand_id", brandId)
        .order("created_at", { ascending: false })
        .limit(12);

      if (brandAnyTypeExamples && brandAnyTypeExamples.length > 0) {
        referenceImageUrls = brandAnyTypeExamples.map((e: any) => e.image_url).filter(Boolean);
        referenceExampleIds = brandAnyTypeExamples.map((e: any) => e.id);
        fallbackLevel = 3;
      }
    }

    const fallbackLabels = ["exact_category_type", "category_any_type", "brand_exact_type", "brand_wide_any_type"];
    console.log(`[generate-slide-images] Slide ${(slideIndex || 0) + 1}/${totalSlides || "?"}, refs=${referenceImageUrls.length}, fallback=${fallbackLabels[fallbackLevel]}, templateSet="${templateSetName || 'none'}", bgOnly=${isBgOnly}, strictCategoryLock=${strictTemplateCategoryLock}`);

    if (templateSetId && referenceImageUrls.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: `Sem exemplos de referência no pilar deste estilo para o formato "${contentTypeFilter}". Cadastre ao menos 1 exemplo no mesmo pilar para gerar com fidelidade.`,
        debug: { templateSetId, templateSetName, categoryId: resolvedCategoryId, referencesUsedCount: 0, fallbackLevel: "none", strictCategoryLock: strictTemplateCategoryLock },
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ══════ EXTRACT STYLE GUIDE ══════
    const rules = templateSetData?.template_set?.rules || null;
    const visualSignature = templateSetData?.visual_signature || templateSetData?.template_set?.visual_signature || null;

    // ══════ BUILD MULTIMODAL REQUEST ══════
    const contentParts: any[] = [];

    for (const imgUrl of referenceImageUrls.slice(0, 6)) {
      contentParts.push({
        type: "image_url",
        image_url: { url: imgUrl },
      });
    }

    // Choose prompt based on mode
    let prompt: string;
    if (illustrationMode) {
      const topic = slide.headline || slide.body || "professional content";
      const brandColorHint = brandInfo?.palette?.length
        ? `Incorporate these brand colors subtly: ${brandInfo.palette.slice(0, 3).map((c: any) => typeof c === "string" ? c : c.hex).join(", ")}.`
        : "";
      if (isBgOnly) {
        // Illustration with title: generate PURE illustration, NO TEXT (title added by render-slide-image)
        prompt = `Create a HIGH-QUALITY photorealistic illustration about: "${topic}".
The image should be a VISUAL SCENE — like a professional editorial photograph.
ABSOLUTELY NO TEXT of any kind in the image. No letters, no words, no numbers.
The illustration must communicate the subject "${topic}" purely through visuals.
Leave the bottom 25% slightly darker or with space for text overlay.
Style: professional editorial, cinematic lighting, high quality.
${brandColorHint}
Create a PHOTOGRAPHIC SCENE, not a graphic design.`;
      } else {
        // Illustration without title: pure illustration, may include subtle headline
        prompt = `Create a HIGH-QUALITY photorealistic illustration about: "${topic}".
The image should be a VISUAL SCENE — like a professional editorial photograph.
Focus on the IMAGE, not text. The illustration communicates the subject visually.
You may include a subtle, small headline "${(slide.headline || "").substring(0, 50)}" but the visual DOMINATES.
Style: professional editorial, cinematic lighting, high quality.
${brandColorHint}
Do NOT create a graphic design with large text. Create a PHOTOGRAPHIC SCENE about "${topic}".`;
      }
    } else if (isBgOnly) {
      prompt = buildBackgroundOnlyPrompt(slide, slideIndex || 0, totalSlides || 1, brandInfo, contentFormat, platform, rules, visualSignature, templateSetName, language, brandInfo?.visual_preferences);
    } else {
      prompt = buildPrompt(slide, slideIndex || 0, totalSlides || 1, brandInfo, undefined, undefined, contentFormat, platform, rules, visualSignature, templateSetName, language, brandInfo?.visual_preferences);
    }
    contentParts.push({ type: "text", text: prompt });

    // ══════ GENERATE IMAGE ══════
    // ai_full_design uses inference.sh (Gemini 3.1 Flash) for premium quality
    // ai_background uses Lovable Gateway (cheaper) for background-only
    let base64Image: string | null = null;

    if (!isBgOnly || illustrationMode) {
      // Full design / illustration mode: use inference.sh for premium quality
      const INFERENCE_SH_KEY = Deno.env.get("INFERENCE_SH_API_KEY");
      if (INFERENCE_SH_KEY) {
        const aspectMap: Record<string, string> = {
          "1080x1080": "1:1",
          "1200x1200": "1:1",
          "1080x1350": "4:5",
          "1080x1920": "9:16",
        };
        const isLinkedInPost = platform === "linkedin" && contentFormat === "post";
        const isLinkedInDoc = platform === "linkedin" && contentFormat === "document";
        const isStoryFormat = contentFormat === "story";
        const dimKey = isLinkedInPost ? "1200x1200" : isLinkedInDoc ? "1080x1350" : isStoryFormat ? "1080x1920" : "1080x1080";
        const aspectRatio = aspectMap[dimKey] || "1:1";
        const mode = illustrationMode ? "ILLUSTRATION" : "FULL-DESIGN";
        console.log(`[generate-slide-images] Using inference.sh for ${mode}: platform=${platform}, contentFormat=${contentFormat}, aspect=${aspectRatio}`);

        // Build prompt text
        const dimLabel = isLinkedInPost ? "SQUARE 1:1 (1200x1200px)" : isLinkedInDoc ? "VERTICAL PORTRAIT 4:5 (1080x1350px)" : isStoryFormat ? "VERTICAL PORTRAIT 9:16 (1080x1920px)" : "SQUARE 1:1 (1080x1080px)";

        let promptText: string;
        if (illustrationMode) {
          // Illustration mode: generate a visual scene about the topic, minimal text
          const headline = slide.headline || "";
          const body = slide.body || "";
          const topic = headline || body || "professional content";
          const brandColorHint = brandInfo?.palette?.length
            ? `Use these brand colors as accent tones: ${brandInfo.palette.slice(0, 3).map((c: any) => typeof c === "string" ? c : c.hex).join(", ")}.`
            : "";
          promptText = `FORMATO OBRIGATÓRIO: ${dimLabel}.

Crie uma ILUSTRAÇÃO FOTORREALISTA sobre o seguinte tema: "${topic}"

REGRAS:
- A imagem deve ser uma CENA VISUAL relevante ao tema — como uma foto profissional ou ilustração editorial.
- O foco é a IMAGEM, não o texto. A ilustração deve comunicar o assunto visualmente.
- Pode incluir um título curto "${headline.substring(0, 60)}" de forma sutil e elegante (fonte pequena, canto ou parte inferior) — mas o visual domina.
- Estilo: editorial profissional, alta qualidade, iluminação cinematográfica.
- NÃO faça um design gráfico com texto grande. Faça uma IMAGEM com cena real.
${brandColorHint}
- A imagem deve parecer uma fotografia profissional ou ilustração de alta qualidade sobre "${topic}".`;
        } else {
          // Full design mode: complete image with text baked in
          const basePromptText = contentParts
            .filter((p: any) => p.type === "text")
            .map((p: any) => p.text)
            .join("\n");
          promptText = `FORMATO OBRIGATÓRIO: ${dimLabel}. A imagem DEVE ser gerada neste formato exato.\n\n${basePromptText}`;
        }

        // Collect reference image URLs
        const refImages = contentParts
          .filter((p: any) => p.type === "image_url")
          .map((p: any) => p.image_url?.url)
          .filter(Boolean)
          .slice(0, 6);

        // Try inference.sh with 1 retry (it often returns empty on first try)
        for (let infAttempt = 0; infAttempt < 2 && !base64Image; infAttempt++) {
          try {
            if (infAttempt > 0) {
              console.log(`[generate-slide-images] inference.sh retry ${infAttempt}...`);
              await new Promise(r => setTimeout(r, 2000));
            }
            const infBody = {
              app: "google/gemini-3-1-flash-image-preview@7f5j281b",
              wait: true,
              input: {
                prompt: promptText,
                aspect_ratio: aspectRatio,
                num_images: 1,
                ...(refImages.length > 0 ? { images: refImages } : {}),
              },
            };
            console.log(`[generate-slide-images] inference.sh request: app=${infBody.app}, aspect=${aspectRatio}, refs=${refImages.length}, promptLen=${promptText.length}, bodySize=${JSON.stringify(infBody).length}`);
            const infRes = await fetch("https://api.inference.sh/run", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${INFERENCE_SH_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(infBody),
            });
            console.log(`[generate-slide-images] inference.sh response: status=${infRes.status}, statusText=${infRes.statusText}`);

            if (infRes.ok) {
              const infData = await infRes.json();
              // Log full response structure for debugging
              const responseKeys = Object.keys(infData || {});
              console.log(`[generate-slide-images] inference.sh response keys: ${responseKeys.join(", ")}, output keys: ${Object.keys(infData?.output || {}).join(", ")}`);

              // Try multiple response formats — with wait:true, data is in infData.data.output
              const infOutput = infData.data?.output || infData.output || {};
              const imageUrl = infOutput.images?.[0]
                || infOutput.image
                || infData.images?.[0]
                || infData.image
                || infOutput.url;

              if (imageUrl && typeof imageUrl === "string" && imageUrl.startsWith("http")) {
                console.log(`[generate-slide-images] inference.sh returned image URL: ${imageUrl.substring(0, 100)}`);
                const imgRes = await fetch(imageUrl);
                if (imgRes.ok) {
                  const imgBytes = new Uint8Array(await imgRes.arrayBuffer());
                  let binary = "";
                  for (let i = 0; i < imgBytes.length; i++) {
                    binary += String.fromCharCode(imgBytes[i]);
                  }
                  base64Image = `data:image/png;base64,${btoa(binary)}`;
                  console.log(`[generate-slide-images] inference.sh image downloaded: ${imgBytes.length} bytes`);
                } else {
                  console.warn(`[generate-slide-images] inference.sh image download failed: ${imgRes.status}`);
                }
              } else {
                // Log what was actually returned to diagnose the issue
                const preview = JSON.stringify(infData).substring(0, 500);
                console.warn(`[generate-slide-images] inference.sh returned no image (attempt ${infAttempt + 1}). Response: ${preview}`);
              }
            } else {
              const errText = await infRes.text();
              console.warn(`[generate-slide-images] inference.sh error [${infRes.status}]: ${errText.substring(0, 300)}`);
              // On 422 (RESOURCE_EXHAUSTED/quota) or 429 (rate limit), skip directly to fallback
              if (infRes.status === 422 || infRes.status === 429) {
                console.warn(`[generate-slide-images] inference.sh ${infRes.status} — quota/rate limit, going to fallback`);
                break;
              }
              // On 500 server errors with reference images, retry WITHOUT images
              // (broken/expired image URLs are a common cause of 500)
              if (infRes.status >= 500 && refImages.length > 0 && infAttempt === 0) {
                console.warn("[generate-slide-images] inference.sh 500 with refs — retrying WITHOUT reference images");
                refImages.length = 0; // clear refs for next attempt
                continue;
              }
              // On repeated 500 or 500 without refs, skip to fallback
              if (infRes.status >= 500) {
                console.warn("[generate-slide-images] inference.sh server error — going to fallback");
                break;
              }
            }
          } catch (infErr: any) {
            console.warn(`[generate-slide-images] inference.sh failed (attempt ${infAttempt + 1}): ${infErr.message}`);
          }
        }
        if (!base64Image) {
          console.warn("[generate-slide-images] inference.sh failed after retries, falling back to Lovable Gateway");
        }
      }
    }

    // Fallback to Lovable Gateway (or primary for background-only mode)
    if (!base64Image) {
      base64Image = await generateImage(contentParts);
    }

    if (!base64Image) {
      return new Response(JSON.stringify({
        success: true, imageUrl: null, bgImageUrl: null,
        debug: { templateSetId, templateSetName, categoryId: resolvedCategoryId, referencesUsedCount: referenceImageUrls.length, referenceExampleIds, fallbackLevel: fallbackLabels[fallbackLevel], backgroundOnly: isBgOnly },
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const imageUrl = await uploadBase64ToStorage(supabaseAdmin, base64Image, contentId || "draft", slideIndex || 0);
    console.log(`[generate-slide-images] ✅ Slide ${(slideIndex || 0) + 1} background uploaded`);

    return new Response(JSON.stringify({
      success: true,
      imageUrl: imageUrl,
      bgImageUrl: imageUrl,
      debug: {
        templateSetId, templateSetName, categoryId: resolvedCategoryId,
        referencesUsedCount: referenceImageUrls.length, referenceExampleIds,
        fallbackLevel: fallbackLabels[fallbackLevel],
        image_model: isBgOnly ? "lovable-gateway/gemini-3-pro" : "inference-sh/gemini-3.1-flash",
        image_generation_ms: Date.now() - t0,
        generated_at: new Date().toISOString(),
        backgroundOnly: isBgOnly,
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[generate-slide-images] error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Unknown error",
    }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ══════ GENERATE IMAGE (simple, no self-check for bg-only) ══════

async function generateImage(contentParts: any[]): Promise<string | null> {
  let lastError: Error | null = null;
  for (let retry = 0; retry < 3; retry++) {
    if (retry > 0) {
      const delay = retry * 3000 + Math.random() * 2000;
      console.log(`[generate-slide-images] Retry ${retry}/2 after ${Math.round(delay)}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }

    const response = await aiGatewayFetch({
      model: "google/gemini-3-pro-image-preview",
      messages: [{ role: "user", content: contentParts }],
      modalities: ["image", "text"],
    });

    if (response.ok) {
      const responseText = await response.text();
      let data: any;
      try {
        data = JSON.parse(responseText);
      } catch {
        console.warn(`[generate-slide-images] Empty/invalid JSON response, retrying...`);
        lastError = new Error("Empty response from AI");
        continue;
      }
      return data.choices?.[0]?.message?.images?.[0]?.image_url?.url || null;
    }

    const status = response.status;
    if (status === 402) {
      console.warn("[generate-slide-images] All providers exhausted (402). Returning null.");
      return null;
    }
    if (status === 429 || status === 502 || status === 503) {
      await response.text();
      console.warn(`[generate-slide-images] Retryable error ${status} on retry ${retry + 1}`);
      lastError = new Error(`AI error: ${status}`);
      continue;
    }

    const errText = await response.text();
    console.error(`[generate-slide-images] Non-retryable error ${status}:`, errText.substring(0, 200));
    throw new Error(`AI image error: ${status}`);
  }

  throw lastError || new Error("Max retries exceeded");
}

// ══════ HELPERS ══════

/** Strip URLs, domains, and internal metadata from text */
function sanitizeText(text: string): string {
  if (!text || typeof text !== "string") return "";
  return text
    .replace(/https?:\/\/[^\s)]+/gi, "")
    .replace(/www\.[^\s)]+/gi, "")
    .replace(/utm_[a-z_]+=\S*/gi, "")
    .replace(/\b\S+\.(com|br|org|net|io|dev|app|biz|info)\b/gi, "")
    .replace(/Artigo\s+fonte:\s*[^\n]*/gi, "")
    .replace(/^Fonte:\s*[^\n]*/gim, "")
    .replace(/Estilo\/Pilar:\s*"?[^"\n]+"?/gi, "")
    .replace(/Template(Set)?Id:\s*\S+/gi, "")
    .replace(/Role:\s*\S+/gi, "")
    .replace(/SetId:\s*\S+/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ══════ BACKGROUND-ONLY PROMPT ══════

function buildBackgroundOnlyPrompt(
  slide: any,
  slideIndex: number,
  totalSlides: number,
  brandInfo: any,
  contentFormat?: string,
  platform?: string,
  rules?: any,
  visualSignature?: any,
  templateSetName?: string | null,
  language?: string,
  visualPreferences?: any,
): string {
  const role = slide.role || "content";
  const isStory = contentFormat === "story";
  const isLinkedInDoc = platform === "linkedin" && contentFormat === "document";
  const isLinkedInPost = platform === "linkedin" && contentFormat === "post";

  // Resolve correct dimensions per platform
  let dimensions: string;
  let aspectRatio: string;
  let orientation: string;
  if (isLinkedInPost) {
    dimensions = "1200×1200";
    aspectRatio = "1:1";
    orientation = "square";
  } else if (isLinkedInDoc) {
    dimensions = "1080×1350";
    aspectRatio = "4:5";
    orientation = "portrait";
  } else if (isStory) {
    dimensions = "1080×1920";
    aspectRatio = "9:16";
    orientation = "portrait tall";
  } else {
    dimensions = "1080×1080";
    aspectRatio = "1:1";
    orientation = "square";
  }

  // Build style constraints from rules/visual signature + user visual preferences
  let styleConstraints = "";
  {
    const parts: string[] = [];
    // From template rules
    if (rules?.waves === false) parts.push("NÃO use ondas/curvas.");
    if (rules?.waves === true) parts.push("Inclua curva ondulada decorativa.");
    if (rules?.phone_mockup === true) parts.push("Inclua mockup de celular quando aplicável.");
    if (rules?.phone_mockup === false) parts.push("NÃO use mockup de celular.");
    if (rules?.body_in_card === true) parts.push("Área de card/caixa para texto futuro (overlay).");
    if (rules?.inner_frame === true) parts.push("Use moldura interna decorativa.");
    if (visualSignature?.primary_bg_mode) parts.push(`Fundo: ${visualSignature.primary_bg_mode}.`);
    if (visualSignature?.card_style && visualSignature.card_style !== "none") parts.push(`Estilo de card: ${visualSignature.card_style}.`);
    if (visualSignature?.decorative_shape && visualSignature.decorative_shape !== "none") parts.push(`Forma decorativa: ${visualSignature.decorative_shape}.`);

    // From user visual preferences (override template rules when specified)
    if (visualPreferences) {
      if (visualPreferences.phone_mockup === true && rules?.phone_mockup !== true) parts.push("Inclua mockup de celular quando aplicável (preferência do usuário).");
      if (visualPreferences.phone_mockup === false && rules?.phone_mockup !== false) parts.push("NÃO use mockup de celular (preferência do usuário).");
      if (visualPreferences.body_in_card === true && rules?.body_in_card !== true) parts.push("Use cards/caixas para áreas de texto (preferência do usuário).");
      if (visualPreferences.inner_frame === true && rules?.inner_frame !== true) parts.push("Use moldura interna decorativa (preferência do usuário).");
      if (visualPreferences.waves === true && rules?.waves !== true) parts.push("Inclua elementos ondulados/curvos (preferência do usuário).");
      if (visualPreferences.waves === false && rules?.waves !== false) parts.push("NÃO use ondas/curvas (preferência do usuário).");
      if (visualPreferences.abstract_elements === true) parts.push("Inclua formas abstratas e geométricas como elementos decorativos.");
      if (visualPreferences.photo_backgrounds === true) parts.push("Prefira fotos como fundo quando possível.");
      if (visualPreferences.gradient_backgrounds === true) parts.push("Prefira gradientes como fundo.");
      if (visualPreferences.preferred_bg_mode && !visualSignature?.primary_bg_mode) parts.push(`Fundo preferido: ${visualPreferences.preferred_bg_mode}.`);
      if (visualPreferences.custom_notes) parts.push(`Nota do usuário: ${visualPreferences.custom_notes}`);
    }

    styleConstraints = parts.length > 0 ? `\nREGRAS DE ESTILO:\n${parts.join("\n")}` : "";
  }

  // Describe the role so AI knows what kind of background to generate
  const roleDescriptions: Record<string, string> = {
    cover: "Este é o slide de CAPA — fundo impactante, área limpa na parte inferior para headline grande.",
    context: "Slide de contexto — fundo com elementos visuais sutis, área ampla para texto.",
    insight: "Slide de insight — fundo que comunica destaque/importância.",
    bullets: "Slide de bullets/tópicos — fundo limpo com área para lista de itens.",
    cta: "Slide de CTA (chamada para ação) — fundo que convida à interação, área para botão/texto.",
    content: "Slide de conteúdo — fundo equilibrado com área para texto.",
  };

  const platformLabel = platform === "linkedin" ? "LinkedIn" : "Instagram";
  const formatName = contentFormat === "document" ? "documento" : contentFormat === "carousel" ? "carrossel" : contentFormat === "story" ? "story" : "post";
  const formatLabel = `${formatName} para ${platformLabel}`;

  return `Gere APENAS o BACKGROUND/arte visual do slide ${slideIndex + 1} de ${totalSlides} para um ${formatLabel}.

ATENÇÃO ABSOLUTA: Esta imagem deve conter ZERO TEXTO. Nenhuma letra, nenhuma palavra, nenhum número, nenhum caractere.

${roleDescriptions[role] || roleDescriptions.content}

REQUISITOS:
- FORMATO OBRIGATÓRIO: ${aspectRatio} ${orientation} (${dimensions}px). A imagem DEVE ser gerada EXATAMENTE neste formato.
- Replique EXATAMENTE o estilo visual, cores, gradientes, formas, shapes e elementos decorativos das imagens de referência anexadas.
- Preserve a zona de texto implícita nas referências (posição, largura e alinhamento da área livre para overlay).
- Só aplique gradiente de contraste (ex.: escurecimento inferior) se esse recurso estiver presente nas referências.
- Mantenha consistência visual entre todos os slides da mesma peça.${styleConstraints}

PROIBIÇÕES ABSOLUTAS:
- NENHUM texto de qualquer tipo (nem título, nem subtítulo, nem número, nem bullet, nem palavra).
- NENHUMA letra do alfabeto em nenhum idioma.
- NENHUM URL, domínio, @handle, hashtag.
- NENHUM número de slide (1/8, 2/8 etc).
- NENHUM logo com texto.
- NENHUM QR code.
- Se as referências contêm texto, IGNORE o texto e replique APENAS os elementos visuais/decorativos.

A imagem deve ser PURAMENTE visual: formas, gradientes, ilustrações, ícones sem texto, mockups, padrões, fotos.

ELEMENTOS GRÁFICOS DECORATIVOS PERMITIDOS (se presentes nas referências):
- Linhas, molduras, separadores e ornamentos visuais.
- Ícones, setas e formas abstratas SEM texto.
Estes elementos NÃO são texto — são shapes/decorações visuais que devem ser replicados fielmente.

PROIBIDO: NÃO inclua aspas decorativas grandes (❝ ❞ " ") na imagem. Elas sobrepõem o texto overlay e prejudicam a legibilidade.
PROIBIDO: NÃO crie retângulos, caixas ou áreas coloridas destinadas a conter texto. O texto será adicionado por software em cima da imagem — qualquer caixa de texto no background vai conflitar.
PROIBIDO: NÃO coloque ícones específicos de nicho (estetoscópio, martelo, etc.) a menos que explicitamente descrito nas referências da marca.

Responda APENAS com a imagem gerada.`;
}

// ══════ LEGACY PROMPT (with text) ══════

function buildPrompt(
  slide: any,
  slideIndex: number,
  totalSlides: number,
  brandInfo: any,
  articleUrl?: string,
  articleContent?: string,
  contentFormat?: string,
  platform?: string,
  rules?: any,
  visualSignature?: any,
  templateSetName?: string | null,
  language?: string,
  visualPreferences?: any,
): string {
  const headline = slide.headline || "";
  const body = slide.body || "";
  const bullets = slide.bullets || [];

  const isLinkedIn = platform === "linkedin";
  const isLinkedInPost = isLinkedIn && contentFormat === "post";
  const isStory = contentFormat === "story";

  // Use full headline — NEVER truncate. AI must fit it by reducing font size.
  const imageHeadline = slide.image_headline || headline;

  // Body in image: only short body for Instagram, never for LinkedIn
  const imageBody = isLinkedInPost ? "" : (body.length > 80 ? "" : body);

  const articleSnippet = articleContent ? sanitizeText(articleContent.substring(0, 400)) : "";

  // Build style constraints from rules, visual signature, AND brand visual preferences
  let styleConstraints = "";
  {
    const parts: string[] = [];
    if (rules?.waves === false) parts.push("NÃO use ondas/curvas no design.");
    if (rules?.waves === true) parts.push("Inclua curva ondulada decorativa.");
    if (rules?.phone_mockup === true) parts.push("Inclua mockup de celular quando aplicável.");
    if (rules?.phone_mockup === false) parts.push("NÃO use mockup de celular.");
    if (rules?.body_in_card === true) parts.push("O texto principal deve estar dentro de um card/caixa.");
    if (rules?.body_in_card === false) parts.push("Texto direto sobre o fundo, SEM card.");
    if (rules?.inner_frame === true) parts.push("Use moldura interna decorativa.");
    if (rules?.uppercase_headlines === true) parts.push("Headlines em CAIXA ALTA.");
    if (visualSignature?.primary_bg_mode) parts.push(`Fundo: ${visualSignature.primary_bg_mode}.`);
    if (visualSignature?.card_style && visualSignature.card_style !== "none") parts.push(`Estilo de card: ${visualSignature.card_style}.`);
    if (visualSignature?.decorative_shape && visualSignature.decorative_shape !== "none") parts.push(`Forma decorativa: ${visualSignature.decorative_shape}.`);

    // Visual preferences from brand settings (same as backgroundOnly prompt)
    if (visualPreferences) {
      if (visualPreferences.phone_mockup === true && rules?.phone_mockup !== true) parts.push("Inclua mockup de celular (preferência da marca).");
      if (visualPreferences.phone_mockup === false && rules?.phone_mockup !== false) parts.push("NÃO use mockup de celular (preferência da marca).");
      if (visualPreferences.body_in_card === true && rules?.body_in_card !== true) parts.push("Use cards/caixas para texto (preferência da marca).");
      if (visualPreferences.inner_frame === true && rules?.inner_frame !== true) parts.push("Use moldura interna decorativa (preferência da marca).");
      if (visualPreferences.waves === true && rules?.waves !== true) parts.push("Inclua elementos ondulados/curvos (preferência da marca).");
      if (visualPreferences.waves === false && rules?.waves !== false) parts.push("NÃO use ondas/curvas (preferência da marca).");
      if (visualPreferences.abstract_elements === true) parts.push("Inclua formas abstratas e geométricas como elementos decorativos.");
      if (visualPreferences.preferred_bg_mode && !visualSignature?.primary_bg_mode) parts.push(`Fundo preferido: ${visualPreferences.preferred_bg_mode}.`);
      if (visualPreferences.custom_notes) parts.push(`Nota da marca: ${visualPreferences.custom_notes}`);
    }

    styleConstraints = parts.length > 0 ? `\n\nREGRAS DE ESTILO (obrigatórias):\n${parts.join("\n")}` : "";
  }

  // Brand identity context — helps AI understand the brand even without template sets
  let brandContext = "";
  if (brandInfo) {
    const parts: string[] = [];
    if (brandInfo.name) parts.push(`Marca: ${brandInfo.name}`);
    if (brandInfo.visual_tone) parts.push(`Tom visual: ${brandInfo.visual_tone}`);
    if (brandInfo.palette?.length) {
      const colors = brandInfo.palette.map((c: any) => typeof c === "string" ? c : c?.hex || c?.name).filter(Boolean);
      if (colors.length) parts.push(`Paleta: ${colors.join(", ")}`);
    }
    if (brandInfo.fonts) {
      parts.push(`Fontes: ${brandInfo.fonts.headings || "Inter"} (títulos), ${brandInfo.fonts.body || "Inter"} (corpo)`);
    }
    if (brandInfo.do_rules) parts.push(`Diretrizes: ${brandInfo.do_rules.substring(0, 200)}`);
    if (brandInfo.dont_rules) parts.push(`Evitar: ${brandInfo.dont_rules.substring(0, 200)}`);
    brandContext = parts.length > 0 ? `\nIDENTIDADE DA MARCA:\n${parts.join("\n")}` : "";
  }

  const lang = language || "pt-BR";

  const isStoryFormat = contentFormat === "story";
  const isLinkedInDocFormat = platform === "linkedin" && contentFormat === "document";
  const isLinkedInPostFormat = platform === "linkedin" && contentFormat === "post";
  let orientation: string, aspectRatio: string, dimensions: string;
  if (isLinkedInPostFormat) {
    orientation = "quadrado (square)"; aspectRatio = "1:1"; dimensions = "1200x1200";
  } else if (isLinkedInDocFormat) {
    orientation = "vertical (portrait)"; aspectRatio = "4:5"; dimensions = "1080x1350";
  } else if (isStoryFormat) {
    orientation = "vertical (portrait)"; aspectRatio = "9:16"; dimensions = "1080x1920";
  } else {
    orientation = "quadrado (square)"; aspectRatio = "1:1"; dimensions = "1080x1080";
  }

  const platformLabel = isLinkedIn ? "LinkedIn" : "Instagram";
  const formatLabel = contentFormat === "carousel" ? "carrossel" : contentFormat === "story" ? "story" : contentFormat === "document" ? "documento" : "post";

  const role = slide.role || (slideIndex === 0 ? "cover" : (slideIndex === totalSlides - 1 ? "cta" : "content"));

  // ── FORMAT-SPECIFIC DESIGN INSTRUCTIONS ──
  let formatDesignNote = "";
  let textBlock = "";
  const bulletsText = bullets.length > 0 ? bullets.map((b: string) => `• ${b}`).join("\n") : "";

  if (isLinkedInPost) {
    // LinkedIn Post — horizontal, professional, minimal text
    formatDesignNote = `DESIGN: LinkedIn Post SQUARE (1:1, 1200x1200).
- Estilo corporativo, clean e profissional.
- Headline GRANDE e BOLD centralizado.
- Body curto abaixo do headline (se houver).
- Cores sóbrias. Sem excesso de elementos decorativos.`;
    textBlock = `---HEADLINE---\n${imageHeadline}\n${imageBody ? `---BODY---\n${imageBody}\n` : ""}---FIM DO TEXTO---`;

  } else if (contentFormat === "document") {
    // LinkedIn Document — vertical pages, dense professional content
    const docRoles: Record<string, string> = {
      cover: "CAPA do documento — título grande e impactante, subtítulo profissional. Design de apresentação executiva.",
      content: "PÁGINA DE CONTEÚDO — headline + body denso com dados. Layout de consultoria/relatório.",
      insight: "PÁGINA DE INSIGHT — destaque visual para dado ou conclusão importante. Número grande se houver key_stat.",
      data: "PÁGINA DE DADOS — apresente estatísticas e números de forma visual e impactante.",
      cta: "PÁGINA FINAL — call-to-action profissional. 'Salve para consultar depois' ou similar.",
    };
    formatDesignNote = `DESIGN: LinkedIn Documento VERTICAL (4:5, 1080x1350).
${docRoles[role] || docRoles.content}
- Formato de SLIDE DE APRESENTAÇÃO profissional — proporcional, NÃO esticado como story.
- Estilo de consultoria/relatório corporativo — clean, hierárquico.
- Tipografia forte e hierárquica.
- TODO o texto fornecido DEVE aparecer na imagem — é uma página de documento, não thumbnail.`;
    textBlock = `---HEADLINE---\n${imageHeadline}\n${body ? `---BODY---\n${body}\n` : ""}${bulletsText ? `---BULLETS---\n${bulletsText}\n` : ""}---FIM DO TEXTO---`;

  } else if (contentFormat === "story") {
    // Instagram Story — vertical, immersive, high impact
    formatDesignNote = `DESIGN: Instagram Story VERTICAL (9:16, 1080x1920).
- DESIGN IMERSIVO full-screen — ocupe toda a tela vertical.
- Headline GRANDE e BOLD — deve ser legível em tela de celular.
- O texto deve ocupar a área central/inferior da tela.
- Visual vibrante e chamativo — precisa PARAR O SCROLL em 1 segundo.
- Se houver body, posicione abaixo do headline em fonte menor.
- Elementos visuais podem ocupar a área superior como contexto visual.`;
    textBlock = `---HEADLINE---\n${imageHeadline}\n${imageBody ? `---BODY---\n${imageBody}\n` : ""}---FIM DO TEXTO---`;

  } else if (contentFormat === "carousel") {
    // Instagram Carousel — square, role-aware, consistent series
    const carouselRoles: Record<string, string> = {
      cover: "CAPA DO CARROSSEL — o slide que PARA O SCROLL. Headline impactante com dado específico. Visual marcante. Deve gerar CURIOSIDADE para deslizar.",
      content: "SLIDE DE CONTEÚDO — apresente UM ponto com clareza. Headline curto + body informativo. Layout equilibrado e legível.",
      insight: "SLIDE DE INSIGHT — destaque um dado surpreendente ou conclusão. Visual que comunica importância.",
      bullets: "SLIDE DE TÓPICOS — liste 3-5 pontos acionáveis. Layout organizado com bullets claros.",
      cta: "SLIDE FINAL — chamada para ação. Engajamento: curtir, comentar, compartilhar, salvar.",
    };
    formatDesignNote = `DESIGN: Instagram Carrossel QUADRADO (1:1, 1080x1080).
Slide ${slideIndex + 1} de ${totalSlides}.
${carouselRoles[role] || carouselRoles.content}
- CONSISTÊNCIA VISUAL OBRIGATÓRIA: use EXATAMENTE a mesma composição, cores, tipografia, layout e elementos decorativos em TODOS os slides.
- O carrossel deve parecer uma SÉRIE VISUAL coesa — cada slide diferente no conteúdo mas idêntico no estilo.`;
    textBlock = `---HEADLINE---\n${imageHeadline}\n${body && body.length <= 120 ? `---BODY---\n${body}\n` : ""}${bulletsText && role === "bullets" ? `---BULLETS---\n${bulletsText}\n` : ""}---FIM DO TEXTO---`;

  } else {
    // Instagram Post — square, single impactful image
    formatDesignNote = `DESIGN: Instagram Post QUADRADO (1:1, 1080x1080).
- UMA IMAGEM que PARA O SCROLL no feed.
- Headline GRANDE e ASSERTIVO — deve ser legível em miniatura no feed.
- Body abaixo do headline se houver (fonte menor, complementar).
- O post deve entregar VALOR VISUAL IMEDIATO — quem vê deve entender a mensagem em 2 segundos.
- Design equilibrado entre visual e texto.`;
    textBlock = `---HEADLINE---\n${imageHeadline}\n${imageBody ? `---BODY---\n${imageBody}\n` : ""}---FIM DO TEXTO---`;
  }

  return `Crie ${totalSlides > 1 ? `o slide ${slideIndex + 1} de ${totalSlides} de um ${formatLabel}` : `um ${formatLabel}`} para ${platformLabel}, seguindo EXATAMENTE o mesmo estilo visual das imagens de referência anexadas.

${formatDesignNote}
${brandContext}

TEXTO DA IMAGEM (idioma: ${lang}):
A imagem deve conter APENAS este texto — COMPLETO e SEM CORTES:

${textBlock}

REGRA CRÍTICA DE TEXTO:
- Escreva TODAS as palavras do headline COMPLETAS — do início ao fim, sem cortar.
- NUNCA use "..." ou reticências. Se o texto é longo, REDUZA a fonte.
- NÃO adicione texto que não está acima. NÃO invente subtítulos ou rodapés.
- Cada acento (á, é, í, ó, ú, ã, õ, ç, ê, â) DEVE ser idêntico ao fornecido.

${articleSnippet ? `Contexto (NÃO incluir na imagem):\n${articleSnippet}\n` : ""}${styleConstraints}

FIDELIDADE VISUAL:
- Replique EXATAMENTE o estilo das referências: cores, tipografia, mockups, cards, shapes, decorações.
- Use as MESMAS cores, gradientes, formas e proporções.
${contentFormat === "carousel" ? "- TODOS os slides do carrossel DEVEM ter o mesmo estilo visual — como uma série.\n" : ""}- Safe area: margem mínima de 80px em TODAS as bordas.
- FORMATO: ${orientation} (${aspectRatio}, ${dimensions}px).

PROIBIÇÕES:
- NUNCA inclua URLs, QR codes, @handles inventados, metadados.
- NUNCA altere a ortografia do texto fornecido.
- NUNCA inclua texto em outro idioma que não ${lang}.

Responda APENAS com a imagem gerada.`;
}

// ══════ STORAGE UPLOAD ══════

async function uploadBase64ToStorage(
  supabaseAdmin: any,
  base64Data: string,
  contentId: string,
  slideIndex: number,
): Promise<string> {
  const base64Clean = base64Data.includes(",")
    ? base64Data.split(",")[1]
    : base64Data;

  const mimeMatch = base64Data.match(/data:([^;]+);/);
  const mimeType = mimeMatch ? mimeMatch[1] : "image/png";
  const ext = mimeType.includes("jpeg") || mimeType.includes("jpg") ? "jpg" : "png";

  const binaryString = atob(base64Clean);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const fileName = `ai-slides/${contentId}/slide-${slideIndex}-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from("generated-images")
    .upload(fileName, bytes.buffer, {
      contentType: mimeType,
      upsert: true,
    });

  if (uploadError) {
    console.error("[generate-slide-images] Upload error:", uploadError);
    throw new Error("Failed to upload generated image");
  }

  const { data: { publicUrl } } = supabaseAdmin.storage
    .from("generated-images")
    .getPublicUrl(fileName);

  return publicUrl;
}
