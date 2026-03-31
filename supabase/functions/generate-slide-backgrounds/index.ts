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
      brandId, templateSetId, categoryId, contentFormat,
      slideIndex, role, overlay, language, contentId,
      styleGalleryId,
    } = await req.json();

    if (!brandId && !styleGalleryId) {
      throw new Error("brandId or styleGalleryId is required");
    }

    const lang = language || "pt-BR";
    const slideRole = role || "content";
    const formatKey = contentFormat === "carousel" ? "carousel" : contentFormat === "story" ? "story" : "post";

    // ══════ COLLECT REFERENCE IMAGES ══════
    let referenceImageUrls: string[] = [];
    let referenceExampleIds: string[] = [];
    let fallbackLevel = "none";
    let styleName = "";

    // Style Gallery mode
    if (styleGalleryId) {
      const { data: galleryStyle } = await supabaseAdmin
        .from("system_template_sets")
        .select("name, reference_images, supported_formats, style_prompt")
        .eq("id", styleGalleryId)
        .single();

      if (!galleryStyle) {
        return new Response(JSON.stringify({
          success: false,
          error: `Estilo da galeria não encontrado (ID: ${styleGalleryId}).`,
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      styleName = galleryStyle.name;
      const refImages = galleryStyle.reference_images as Record<string, Record<string, string[]>> | null;
      const formatRefs = refImages?.[formatKey] || refImages?.["post"];

      if (!formatRefs || Object.values(formatRefs).flat().length === 0) {
        return new Response(JSON.stringify({
          success: false,
          error: `Estilo "${galleryStyle.name}" não possui referências para o formato "${formatKey}". Gere o pack de imagens primeiro na Galeria de Estilos.`,
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const roleRefs = formatRefs[slideRole] || formatRefs["content"] || [];
      const allRefs = Object.values(formatRefs).flat();
      referenceImageUrls = roleRefs.length > 0 ? roleRefs : allRefs;
      fallbackLevel = "style_gallery";
    } else {
      // Brand mode — same 3-level fallback as generate-slide-images
      const contentTypeFilter = formatKey === "carousel" ? "carrossel" : formatKey;
      let resolvedCategoryId = categoryId || null;

      if (templateSetId && !resolvedCategoryId) {
        const { data: tsData } = await supabase
          .from("brand_template_sets")
          .select("category_id, name")
          .eq("id", templateSetId)
          .single();
        if (tsData) {
          resolvedCategoryId = tsData.category_id;
          styleName = tsData.name;
        }
      }

      // Level 0: category + content type
      if (resolvedCategoryId) {
        const { data: catExamples } = await supabase
          .from("brand_examples")
          .select("id, image_url")
          .eq("brand_id", brandId)
          .eq("category_id", resolvedCategoryId)
          .in("type", [contentTypeFilter, "carrossel"])
          .order("created_at", { ascending: false })
          .limit(12);

        if (catExamples && catExamples.length >= 3) {
          referenceImageUrls = catExamples.map((e: any) => e.image_url).filter(Boolean);
          referenceExampleIds = catExamples.map((e: any) => e.id);
          fallbackLevel = "exact_category";
        } else {
          // Level 1: category only
          const { data: catAll } = await supabase
            .from("brand_examples")
            .select("id, image_url")
            .eq("brand_id", brandId)
            .eq("category_id", resolvedCategoryId)
            .order("created_at", { ascending: false })
            .limit(12);

          if (catAll && catAll.length >= 3) {
            referenceImageUrls = catAll.map((e: any) => e.image_url).filter(Boolean);
            referenceExampleIds = catAll.map((e: any) => e.id);
            fallbackLevel = "category_any_type";
          }
        }
      }

      // Level 2: brand wide
      if (referenceImageUrls.length < 3) {
        const { data: brandExamples } = await supabase
          .from("brand_examples")
          .select("id, image_url")
          .eq("brand_id", brandId)
          .order("created_at", { ascending: false })
          .limit(12);

        if (brandExamples && brandExamples.length > 0) {
          referenceImageUrls = brandExamples.map((e: any) => e.image_url).filter(Boolean);
          referenceExampleIds = brandExamples.map((e: any) => e.id);
          fallbackLevel = "brand_wide";
        }
      }

      // No references at all → error
      if (referenceImageUrls.length === 0) {
        return new Response(JSON.stringify({
          success: false,
          error: `Sem exemplos de referência para gerar o background. Cadastre pelo menos 3 exemplos no Brand Kit.`,
          debug: { brandId, templateSetId, categoryId: resolvedCategoryId, fallbackLevel: "none" },
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    console.log(`[generate-slide-backgrounds] Slide ${(slideIndex || 0) + 1}, role=${slideRole}, format=${formatKey}, refs=${referenceImageUrls.length}, fallback=${fallbackLevel}`);

    // ══════ BUILD PROMPT (BACKGROUND ONLY — NO TEXT) ══════
    const safeAreaTop = overlay?.safe_area_top || 80;
    const safeAreaBottom = overlay?.safe_area_bottom || 120;

    const prompt = `Generate a BACKGROUND IMAGE for a social media slide. This is slide ${(slideIndex || 0) + 1}, role: ${slideRole}, format: ${formatKey}.

CRITICAL INSTRUCTION: Do NOT render ANY text, words, letters, numbers, URLs, headings, captions, labels, or typography of any kind. The image must contain ZERO text. No text at all.

The background must:
- Replicate the EXACT visual style, color palette, layout structure, decorative elements, shapes, gradients, and design language from the reference images provided.
- Leave a clear "safe area" for text overlay: ${safeAreaTop}px at the top and ${safeAreaBottom}px at the bottom where the design should be less busy / more uniform to allow readable text placement.
- Use the same aspect ratio as the references (portrait format: 4:5 for post/carousel, 9:16 for story).
- Maintain visual continuity and brand consistency.

SEMANTIC CONTEXT (for visual mood/composition only — do NOT write these words):
${overlay?.headline ? `Theme: ${overlay.headline}` : ""}
${overlay?.body ? `Context: ${overlay.body}` : ""}

ABSOLUTE PROHIBITIONS:
- ZERO text, letters, numbers, words, or typography in the image.
- No URLs, domains, @handles, QR codes.
- No metadata labels like "Estilo/Pilar:", "Template:", "Role:".
- No watermarks or logos unless present in references.

DECORATIVE GRAPHIC ELEMENTS (allowed if present in references):
- Large decorative quotation marks (❝ ❞ or " ") as graphic shapes — replicate position, color, and size from references.
- Lines, frames, dividers, and visual ornaments.
- Icons, arrows, and abstract shapes WITHOUT text.
These are NOT text — they are visual shapes/decorations that should be faithfully replicated.

Respond ONLY with the generated background image. No text output.`;

    // ══════ BUILD MULTIMODAL REQUEST ══════
    const contentParts: any[] = [];
    for (const imgUrl of referenceImageUrls.slice(0, 6)) {
      contentParts.push({ type: "image_url", image_url: { url: imgUrl } });
    }
    contentParts.push({ type: "text", text: prompt });

    // ══════ GENERATE WITH RETRY ══════
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        const delay = attempt * 3000 + Math.random() * 2000;
        console.log(`[generate-slide-backgrounds] Retry ${attempt}/2 after ${Math.round(delay)}ms...`);
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
          console.warn(`[generate-slide-backgrounds] Empty/invalid JSON response on attempt ${attempt + 1}`);
          lastError = new Error("Empty response from AI");
          continue;
        }

        const base64Image = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
        if (!base64Image) {
          return new Response(JSON.stringify({
            success: true, backgroundImageUrl: null,
            debug: { fallbackLevel, referencesUsedCount: referenceImageUrls.length, mode: "ai_bg_overlay" },
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const bgUrl = await uploadBase64ToStorage(supabaseAdmin, base64Image, contentId || "bg-draft", slideIndex || 0);
        console.log(`[generate-slide-backgrounds] ✅ Background uploaded for slide ${(slideIndex || 0) + 1}`);

        return new Response(JSON.stringify({
          success: true,
          backgroundImageUrl: bgUrl,
          debug: {
            styleName, fallbackLevel,
            referencesUsedCount: referenceImageUrls.length,
            referenceExampleIds,
            mode: "ai_bg_overlay",
            image_model: "google/gemini-3-pro-image-preview",
            image_generation_ms: Date.now() - t0,
            generated_at: new Date().toISOString(),
          },
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const status = response.status;
      if (status === 402) throw new Error("Insufficient credits.");
      if (status === 429 || status === 502 || status === 503) {
        lastError = new Error(`AI error: ${status}`);
        continue;
      }
      throw new Error(`AI background error: ${status}`);
    }

    throw lastError || new Error("Max retries exceeded");

  } catch (error) {
    console.error("[generate-slide-backgrounds] error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Unknown error",
    }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

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

  const fileName = `ai-backgrounds/${contentId}/bg-${slideIndex}-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from("generated-images")
    .upload(fileName, bytes.buffer, {
      contentType: mimeType,
      upsert: true,
    });

  if (uploadError) {
    console.error("[generate-slide-backgrounds] Upload error:", uploadError);
    throw new Error("Failed to upload background image");
  }

  const { data: { publicUrl } } = supabaseAdmin.storage
    .from("generated-images")
    .getPublicUrl(fileName);

  return publicUrl;
}
