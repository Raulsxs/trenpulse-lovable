import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ROLES = ["cover", "content", "cta"] as const;
const FORMATS = ["post", "story", "carousel"] as const;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { styleId, formats: requestedFormats } = await req.json();
    if (!styleId) throw new Error("styleId is required");

    // Load the style template
    const { data: style, error: styleError } = await supabaseAdmin
      .from("system_template_sets")
      .select("*")
      .eq("id", styleId)
      .single();

    if (styleError || !style) throw new Error("Style not found");

    const activeFormats = requestedFormats || style.supported_formats || ["post"];
    const styleName = style.name;
    const styleDescription = style.description || "";
    const stylePromptHint = style.style_prompt || "";
    const previewColors = style.preview_colors || [];
    const category = style.category || "geral";

    console.log(`[generate-style-pack] Starting for "${styleName}", formats: ${activeFormats.join(",")}`);

    const referenceImages: Record<string, Record<string, string[]>> = {};
    const previewImages: Record<string, string[]> = {};
    let totalGenerated = 0;

    for (const format of activeFormats) {
      referenceImages[format] = {};
      previewImages[format] = [];

      const dims = format === "story"
        ? { w: 1080, h: 1920, ratio: "9:16" }
        : { w: 1080, h: 1350, ratio: "4:5" };

      for (const role of ROLES) {
        const prompt = buildStylePrompt(styleName, styleDescription, stylePromptHint, category, format, role, dims, previewColors);

        console.log(`[generate-style-pack] Generating ${format}/${role}...`);

        const imageUrl = await generateAndUpload(
          LOVABLE_API_KEY, supabaseAdmin, prompt, styleId, format, role
        );

        if (imageUrl) {
          referenceImages[format][role] = [imageUrl];
          previewImages[format].push(imageUrl);
          totalGenerated++;
          console.log(`[generate-style-pack] ✅ ${format}/${role} done`);
        } else {
          console.warn(`[generate-style-pack] ⚠️ ${format}/${role} failed, no image`);
        }

        // Small delay between generations to avoid rate limits
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    // Update the system_template_sets row
    const { error: updateError } = await supabaseAdmin
      .from("system_template_sets")
      .update({
        reference_images: referenceImages,
        preview_images: previewImages,
        supported_formats: activeFormats,
      })
      .eq("id", styleId);

    if (updateError) {
      console.error("[generate-style-pack] Update error:", updateError);
      throw new Error("Failed to save generated images");
    }

    console.log(`[generate-style-pack] ✅ Complete: ${totalGenerated} images for "${styleName}"`);

    return new Response(JSON.stringify({
      success: true,
      totalGenerated,
      referenceImages,
      previewImages,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[generate-style-pack] error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Unknown error",
    }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ══════ PROMPT BUILDER ══════

function buildStylePrompt(
  styleName: string,
  description: string,
  stylePromptHint: string,
  category: string,
  format: string,
  role: string,
  dims: { w: number; h: number; ratio: string },
  colors: any[],
): string {
  const colorPalette = Array.isArray(colors) && colors.length > 0
    ? `Paleta de cores: ${colors.map(c => typeof c === 'string' ? c : c?.hex || c).join(", ")}.`
    : "";

  const roleContent: Record<string, { headline: string; body: string }> = {
    cover: { headline: "Tendência Digital 2025", body: "O que muda para sua estratégia" },
    content: { headline: "3 Passos Essenciais", body: "Transforme dados em decisões práticas para o seu negócio" },
    cta: { headline: "Gostou do conteúdo?", body: "Curta ❤️ Comente 💬 Compartilhe 🔄" },
  };

  const content = roleContent[role] || roleContent.content;

  const formatLabel = format === "story" ? "Story vertical (9:16, 1080×1920px)"
    : format === "carousel" ? "Slide de carrossel (4:5, 1080×1350px)"
    : "Post para feed (4:5, 1080×1350px)";

  return `Crie uma arte de Instagram no estilo "${styleName}" (${category}).
${description ? `Descrição do estilo: ${description}` : ""}
${stylePromptHint ? `Instruções de estilo: ${stylePromptHint}` : ""}

Formato: ${formatLabel}
Função do slide: ${role === "cover" ? "CAPA (slide de abertura)" : role === "cta" ? "CTA (slide de fechamento)" : "CONTEÚDO (slide intermediário)"}

Texto na arte:
- Headline: "${content.headline}"
- Body: "${content.body}"

${colorPalette}

REGRAS OBRIGATÓRIAS:
- O texto DEVE estar em português do Brasil com acentos corretos.
- Safe area: margem mínima de 80px em todas as bordas.
- Headline: máximo 2 linhas, fonte grande e legível.
- O design deve ser profissional, moderno e adequado para Instagram.
- A arte deve refletir claramente o estilo "${styleName}" com identidade visual única.
- Formato portrait ${dims.ratio} (${dims.w}×${dims.h}px).

PROIBIÇÕES:
- NUNCA inclua URLs, links, @handles ou QR codes.
- NUNCA inclua metadados ou texto em inglês.
- NUNCA use lorem ipsum.

Responda APENAS com a imagem gerada.`;
}

// ══════ GENERATE AND UPLOAD ══════

async function generateAndUpload(
  apiKey: string,
  supabaseAdmin: any,
  prompt: string,
  styleId: string,
  format: string,
  role: string,
): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, 3000 + Math.random() * 2000));
    }

    try {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-image",
          messages: [{ role: "user", content: prompt }],
          modalities: ["image", "text"],
        }),
      });

      if (!response.ok) {
        if (response.status === 429 || response.status === 502 || response.status === 503) {
          console.warn(`[generate-style-pack] Retryable ${response.status}, attempt ${attempt + 1}`);
          continue;
        }
        if (response.status === 402) throw new Error("Insufficient credits");
        throw new Error(`AI error: ${response.status}`);
      }

      const data = await response.json();
      const base64Image = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      if (!base64Image) {
        console.warn(`[generate-style-pack] No image in response, attempt ${attempt + 1}`);
        continue;
      }

      // Upload to storage
      const base64Clean = base64Image.includes(",") ? base64Image.split(",")[1] : base64Image;
      const mimeMatch = base64Image.match(/data:([^;]+);/);
      const mimeType = mimeMatch ? mimeMatch[1] : "image/png";
      const ext = mimeType.includes("jpeg") || mimeType.includes("jpg") ? "jpg" : "png";

      const binaryString = atob(base64Clean);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const fileName = `style-gallery/${styleId}/${format}-${role}-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabaseAdmin.storage
        .from("generated-images")
        .upload(fileName, bytes.buffer, {
          contentType: mimeType,
          upsert: true,
        });

      if (uploadError) {
        console.error("[generate-style-pack] Upload error:", uploadError);
        continue;
      }

      const { data: { publicUrl } } = supabaseAdmin.storage
        .from("generated-images")
        .getPublicUrl(fileName);

      return publicUrl;
    } catch (e) {
      console.error(`[generate-style-pack] Attempt ${attempt + 1} error:`, e);
      if (attempt === 2) return null;
    }
  }
  return null;
}
