import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { brandId, categoryId } = await req.json();
    if (!brandId) throw new Error("brandId is required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Load brand
    const { data: brand, error: brandError } = await supabase
      .from("brands")
      .select("id, name, palette, fonts, visual_tone, do_rules, dont_rules, logo_url, style_guide, style_guide_version, visual_preferences")
      .eq("id", brandId)
      .single();

    if (brandError || !brand) throw new Error("Brand not found");

    // Load categories
    const { data: categories } = await supabase
      .from("brand_example_categories")
      .select("id, name, description")
      .eq("brand_id", brandId)
      .order("created_at", { ascending: false });

    // Determine which categories to process
    let categoriesToProcess: { id: string; name: string; description: string | null }[] = [];

    if (categoryId) {
      const cat = (categories || []).find((c: any) => c.id === categoryId);
      if (!cat) throw new Error("Category not found");
      categoriesToProcess = [cat];
    } else {
      const manualCats = (categories || []).filter((c: any) => c.name);
      if (manualCats.length > 0) {
        categoriesToProcess = manualCats;
      }
    }

    // Load ALL examples WITH image_url for multimodal
    const { data: allExamples } = await supabase
      .from("brand_examples")
      .select("id, image_url, type, subtype, description, category_id, category_mode")
      .eq("brand_id", brandId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (!allExamples || allExamples.length === 0) {
      throw new Error("No brand examples found. Upload examples first.");
    }

    const paletteStr = Array.isArray(brand.palette)
      ? (brand.palette as string[]).join(", ")
      : "não definida";

    // ══════ PER-CATEGORY MODE ══════
    if (categoriesToProcess.length > 0) {
      const insertedSets: any[] = [];
      const skippedCategories: string[] = [];

      for (const cat of categoriesToProcess) {
        const catExamples = allExamples.filter((ex: any) => ex.category_id === cat.id);
        
        // Smart minimum: if this pillar has carousel/carrossel samples, require at least 3
        const hasCarousel = catExamples.some((ex: any) => {
          const type = normalizeTypeValue(ex?.type);
          const contentType = normalizeTypeValue(ex?.content_type);
          return type === "carousel" || type === "carrossel" || contentType === "carousel" || contentType === "carrossel";
        });
        const minRequired = hasCarousel ? 3 : 1;
        
        if (catExamples.length < minRequired) {
          const reason = hasCarousel
            ? `only ${catExamples.length} examples (min ${minRequired} for carousel)`
            : `no examples found`;
          console.log(`[generate-template-sets] Skipping "${cat.name}" — ${reason}`);
          skippedCategories.push(`${cat.name} (mín. ${minRequired} exemplo${minRequired > 1 ? 's' : ''})`);
          continue;
        }

        const result = await generateTemplateSetMultimodal({
          brand, cat, examples: catExamples,
          paletteStr, LOVABLE_API_KEY,
        });

        if (!result) continue;

        const normalizedFormats = normalizeFormatsFromExamples(result.formats, catExamples);
        const resolvedSourceExampleIds = resolveSourceExampleIds(result.source_example_ids, catExamples);

        // Archive existing active set for this category
        await supabase
          .from("brand_template_sets")
          .update({ status: "archived" })
          .eq("brand_id", brandId)
          .eq("category_id", cat.id)
          .eq("status", "active");

        const { data: inserted, error: insertError } = await supabase
          .from("brand_template_sets")
          .insert({
            brand_id: brandId,
            name: cat.name,
            description: result.description || null,
            status: "active",
            source_example_ids: resolvedSourceExampleIds,
            category_id: cat.id,
            category_name: cat.name,
            visual_signature: result.visual_signature || null,
            template_set: {
              id_hint: result.id_hint,
              pilar_editorial: cat.name,
              templates_by_role: result.templates_by_role || {},
              rules: result.rules || {},
              formats: normalizedFormats,
              notes: result.notes || [],
              visual_signature: result.visual_signature || null,
              layout_params: result.layout_params || null,
              format_support: buildFormatSupport(normalizedFormats),
            },
          })
          .select()
          .single();

        if (insertError) {
          console.error(`[generate-template-sets] Insert error for "${cat.name}":`, insertError);
          continue;
        }
        insertedSets.push(inserted);
        console.log(`[generate-template-sets] Created set "${cat.name}" with templates_by_role: ${JSON.stringify(result.templates_by_role)}`);
      }

      // Update brand metadata
      if (insertedSets.length > 0) {
        const { data: currentBrand } = await supabase
          .from("brands")
          .select("default_template_set_id")
          .eq("id", brandId)
          .single();

        const currentDefault = currentBrand?.default_template_set_id;
        const newIds = new Set(insertedSets.map((s: any) => s.id));
        const updatePayload: Record<string, any> = {
          template_sets_dirty: false,
          template_sets_dirty_count: 0,
          template_sets_status: "ready",
          template_sets_updated_at: new Date().toISOString(),
          template_sets_last_error: null,
        };
        if (!currentDefault || !newIds.has(currentDefault)) {
          updatePayload.default_template_set_id = insertedSets[0].id;
        }
        await supabase.from("brands").update(updatePayload).eq("id", brandId);
      }

      return new Response(JSON.stringify({
        success: true,
        count: insertedSets.length,
        templateSets: insertedSets,
        skippedCategories,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ══════ LEGACY MODE (no manual categories) ══════
    const result = await generateTemplateSetMultimodal({
      brand,
      cat: { id: "legacy", name: brand.name, description: null },
      examples: allExamples,
      paletteStr, LOVABLE_API_KEY,
    });

    if (!result) throw new Error("AI returned no result");

    const normalizedFormats = normalizeFormatsFromExamples(result.formats, allExamples);
    const resolvedSourceExampleIds = resolveSourceExampleIds(result.source_example_ids, allExamples);

    // Archive existing active sets
    await supabase
      .from("brand_template_sets")
      .update({ status: "archived" })
      .eq("brand_id", brandId)
      .eq("status", "active");

    const { data: inserted, error: insertError } = await supabase
      .from("brand_template_sets")
      .insert({
        brand_id: brandId,
        name: result.name || brand.name,
        description: result.description || null,
        status: "active",
        source_example_ids: resolvedSourceExampleIds,
        visual_signature: result.visual_signature || null,
        template_set: {
          id_hint: result.id_hint,
          pilar_editorial: brand.name,
          templates_by_role: result.templates_by_role || {},
          rules: result.rules || {},
          formats: normalizedFormats,
          notes: result.notes || [],
          visual_signature: result.visual_signature || null,
          layout_params: result.layout_params || null,
          format_support: buildFormatSupport(normalizedFormats),
        },
      })
      .select()
      .single();

    if (insertError) throw insertError;

    await supabase.from("brands").update({
      template_sets_dirty: false,
      template_sets_dirty_count: 0,
      template_sets_status: "ready",
      template_sets_updated_at: new Date().toISOString(),
      template_sets_last_error: null,
      default_template_set_id: inserted.id,
    }).eq("id", brandId);

    return new Response(JSON.stringify({
      success: true,
      count: 1,
      templateSets: [inserted],
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[generate-template-sets] error:", error);
    try {
      const authHeader = req.headers.get("Authorization");
      if (authHeader) {
        const sb = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_ANON_KEY")!,
          { global: { headers: { Authorization: authHeader } } }
        );
        const { brandId: bId } = await req.clone().json().catch(() => ({ brandId: null }));
        if (bId) {
          await sb.from("brands").update({
            template_sets_status: "error",
            template_sets_last_error: error instanceof Error ? error.message : "Unknown error",
          }).eq("id", bId);
        }
      }
    } catch (_) { /* best effort */ }
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Unknown error",
    }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ══════ MULTIMODAL GENERATION ══════

interface GenerateParams {
  brand: any;
  cat: { id: string; name: string; description: string | null };
  examples: any[];
  paletteStr: string;
  LOVABLE_API_KEY: string;
}

type ContentFormatKey = "post" | "story" | "carousel";

const DEFAULT_FORMATS: Record<ContentFormatKey, any> = {
  post: { text_limits: { headline_chars: [35, 60], body_chars: [140, 260] } },
  story: { text_limits: { headline_chars: [25, 45], body_chars: [90, 160] } },
  carousel: {
    slide_count_range: [4, 9],
    cta_policy: "optional",
    slide_roles: ["cover", "context", "insight", "bullets", "cta"],
    text_limits: { headline_chars: [35, 60], body_chars: [140, 260], bullets_max: 5 },
  },
};

function normalizeTypeValue(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function inferAvailableFormats(examples: any[]): Set<ContentFormatKey> {
  const available = new Set<ContentFormatKey>();
  const typeCounts = { post: 0, story: 0, carousel: 0 };

  for (const ex of examples || []) {
    const type = normalizeTypeValue(ex?.type);
    const contentType = normalizeTypeValue(ex?.content_type);

    if (type === "story" || contentType === "story") typeCounts.story += 1;
    if (type === "post" || contentType === "post") typeCounts.post += 1;
    if (
      type === "carrossel" ||
      type === "carousel" ||
      contentType === "carrossel" ||
      contentType === "carousel"
    ) {
      typeCounts.carousel += 1;
    }
  }

  if (typeCounts.post > 0) available.add("post");
  if (typeCounts.story > 0) available.add("story");
  if (typeCounts.carousel >= 3) available.add("carousel");

  if (available.size === 0) {
    // fallback safe default for sparse/messy datasets
    available.add("post");
  }

  return available;
}

function normalizeFormatsFromExamples(rawFormats: any, examples: any[]): Record<string, any> {
  const available = inferAvailableFormats(examples);
  const normalized: Record<string, any> = {};

  for (const key of ["post", "story", "carousel"] as ContentFormatKey[]) {
    if (!available.has(key)) continue;
    normalized[key] = rawFormats?.[key] || DEFAULT_FORMATS[key];
  }

  return normalized;
}

function buildFormatSupport(formats: Record<string, any>): Record<ContentFormatKey, boolean> {
  return {
    post: !!formats?.post,
    story: !!formats?.story,
    carousel: !!formats?.carousel,
  };
}

function resolveSourceExampleIds(rawIds: unknown, examples: any[]): string[] {
  if (Array.isArray(rawIds) && rawIds.length > 0) {
    return rawIds.filter((id) => typeof id === "string") as string[];
  }
  return examples
    .map((ex: any) => ex?.id)
    .filter((id: unknown) => typeof id === "string")
    .slice(0, 12) as string[];
}

async function generateTemplateSetMultimodal(params: GenerateParams) {
  const { brand, cat, examples, paletteStr, LOVABLE_API_KEY } = params;

  console.log(`[generate-template-sets] MULTIMODAL analysis for "${cat.name}" with ${examples.length} images...`);

  const contentParts: any[] = [
    {
      type: "text",
      text: buildMultimodalPrompt(brand, cat, examples, paletteStr),
    }
  ];

  // Add up to 8 reference images for multimodal analysis
  const imagesToSend = examples.slice(0, 8);
  for (const ex of imagesToSend) {
    if (ex.image_url) {
      contentParts.push({
        type: "image_url",
        image_url: { url: ex.image_url },
      });
    }
  }

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-pro",
      messages: [{ role: "user", content: contentParts }],
    }),
  });

  if (!response.ok) {
    console.error(`[generate-template-sets] AI error for "${cat.name}": ${response.status}`);
    if (response.status === 429) throw new Error("Rate limit exceeded. Try again later.");
    if (response.status === 402) throw new Error("Insufficient credits.");
    throw new Error(`AI error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) return null;

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error(`[generate-template-sets] No JSON found for "${cat.name}":`, content.substring(0, 500));
    return null;
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    console.log(`[generate-template-sets] Parsed for "${cat.name}": templates_by_role=${JSON.stringify(parsed.templates_by_role)}, rules=${JSON.stringify(parsed.rules)}`);
    return parsed;
  } catch (e) {
    console.error(`[generate-template-sets] Parse error for "${cat.name}":`, e);
    return null;
  }
}

function buildMultimodalPrompt(brand: any, cat: any, examples: any[], paletteStr: string): string {
  // Create a UNIQUE prefix from the category name for template IDs
  const prefix = cat.name
    .toUpperCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

  // Group examples by subtype/role
  const byRole: Record<string, any[]> = {};
  examples.forEach((ex: any) => {
    const role = ex.subtype || ex.type || "unknown";
    if (!byRole[role]) byRole[role] = [];
    byRole[role].push(ex);
  });

  const exampleMeta = examples.map((ex: any, i: number) =>
    `Image ${i + 1}: role="${ex.subtype || 'general'}", type=${ex.type}, description="${ex.description || 'none'}"`
  ).join("\n");

  const rolesSummary = Object.entries(byRole).map(([role, exs]) => `  - ${role}: ${exs.length} image(s)`).join("\n");

  return `You are an expert visual design reverse-engineer. Analyze the PROVIDED IMAGES and extract the EXACT visual layout structure.

BRAND CONTEXT:
- Name: ${brand.name}
- Palette (hex): ${paletteStr}
- Fonts: headings="${(brand.fonts as any)?.headings || 'Inter'}", body="${(brand.fonts as any)?.body || 'Inter'}"
- Visual tone: ${brand.visual_tone || "clean"}
${brand.do_rules ? `- Design rules (DO): ${brand.do_rules}` : ""}
${brand.dont_rules ? `- Design rules (DON'T): ${brand.dont_rules}` : ""}
${(brand as any).visual_preferences ? `- Visual preferences (user-specified): ${JSON.stringify((brand as any).visual_preferences)}` : ""}

CATEGORY (Pilar Editorial): "${cat.name}"
${cat.description ? `Description: ${cat.description}` : ""}
Template ID prefix for this pillar: "${prefix}"

IMAGES BY ROLE:
${rolesSummary}

DETAILED METADATA:
${exampleMeta}

═══════════════════════════════════════
CRITICAL: UNIQUE TEMPLATE IDS PER PILLAR
═══════════════════════════════════════

You MUST generate template IDs that are UNIQUE to this pillar.
Use the prefix "${prefix}" for ALL template IDs.

Example for pillar "Caso Clínico": CASO_CLINICO_COVER_V1, CASO_CLINICO_CONTENT_V1, etc.
Example for pillar "Artigos Editoriais": ARTIGOS_EDITORIAIS_COVER_V1, ARTIGOS_EDITORIAIS_CONTENT_V1, etc.

═══════════════════════════════════════
ANALYSIS INSTRUCTIONS:
═══════════════════════════════════════

For EACH image, analyze:
- Background: solid, gradient, or photo with overlay?
- Cards/boxes containing text? Shape, position, style?
- Wave curves, diagonal cuts, or clean backgrounds?
- Device mockups (phone/tablet)?
- Text positioning, sizing, weight, case
- Decorative elements: accent bars, borders, inner frames
- Logo position
- Color usage from the brand palette

Then create a complete template set for this pillar.

═══════════════════════════════════════
OUTPUT FORMAT - Return ONLY this JSON:
═══════════════════════════════════════

{
  "name": "${cat.name}",
  "description": "one sentence describing this visual style",
  "id_hint": "${prefix.toLowerCase()}_v1",
  "source_example_ids": [],
  "templates_by_role": {
    "cover": "${prefix}_COVER_V1",
    "context": "${prefix}_CONTENT_V1",
    "content": "${prefix}_CONTENT_V1",
    "insight": "${prefix}_BULLETS_V1",
    "bullets": "${prefix}_BULLETS_V1",
    "quote": "${prefix}_QUOTE_V1",
    "question": "${prefix}_QUESTION_V1",
    "closing": "${prefix}_CTA_V1",
    "cta": "${prefix}_CTA_V1"
  },
  "rules": {
    "uppercase_headlines": true/false,
    "body_in_card": true/false,
    "waves": true/false,
    "diagonal_cut": true/false,
    "phone_mockup": true/false,
    "inner_frame": true/false,
    "cta_default_enabled": true
  },
  "format_support": { "carousel": true, "post": true, "story": true },
  "visual_signature": {
    "theme_variant": "DESCRIBE: e.g. dark_navy_gradient, light_clinical_cards",
    "primary_bg_mode": "solid | gradient | photo_overlay",
    "card_style": "none | rounded_floating | sharp_bottom | full_width_strip",
    "decorative_shape": "wave_bottom | wave_top | diagonal_cut | none",
    "accent_usage": "minimal | moderate | strong",
    "text_on_dark_bg": true/false,
    "has_device_mockup": true/false,
    "has_inner_frame": true/false
  },
  "layout_params": {
    "cover": {
      "bg": {
        "type": "solid | gradient | photo_overlay",
        "colors": ["#hex1", "#hex2"],
        "gradient_angle": 180,
        "overlay_opacity": 0.6
      },
      "shape": {
        "type": "wave | diagonal | none",
        "position": "bottom | top",
        "height_pct": 18,
        "color": "#hex",
        "flip": false
      },
      "card": {
        "enabled": false,
        "style": "rounded | sharp | pill",
        "position": "center | bottom | top",
        "bg_color": "#hex",
        "border_radius": 24,
        "shadow": "none | soft | strong",
        "padding": 48,
        "width_pct": 85,
        "border": "none"
      },
      "secondary_card": {
        "enabled": false,
        "position": "top | bottom",
        "bg_color": "#hex",
        "border_radius": 16,
        "padding": 32,
        "width_pct": 85,
        "content_type": "headline | body | label"
      },
      "device_mockup": {
        "enabled": false,
        "type": "phone | tablet",
        "position": "center | right | left",
        "width_pct": 55,
        "offset_y_pct": 10,
        "border_color": "#hex",
        "border_width": 8,
        "border_radius": 32,
        "show_notch": true,
        "content_bg": "#hex",
        "shadow": "none | soft | strong"
      },
      "text": {
        "alignment": "left | center | right",
        "vertical_position": "top | center | bottom",
        "headline_size": 62,
        "headline_weight": 900,
        "headline_uppercase": true,
        "headline_letter_spacing": 0.02,
        "headline_color": "#hex",
        "body_size": 30,
        "body_weight": 400,
        "body_italic": false,
        "body_color": "#hex",
        "text_shadow": "none | subtle | strong",
        "max_width_pct": 90
      },
      "decorations": {
        "accent_bar": { "enabled": true, "position": "above_headline", "width": 60, "height": 6, "color": "#hex" },
        "corner_accents": { "enabled": false, "color": "#hex", "size": 120 },
        "border": { "enabled": false, "color": "#hex", "width": 2, "radius": 0, "inset": 20 },
        "divider_line": { "enabled": false, "color": "#hex", "width": "60%", "position": "between_headline_body" },
        "inner_frame": { "enabled": false, "color": "#hex", "width": 2, "inset": 30, "radius": 0 }
      },
      "logo": { "position": "bottom-center", "opacity": 1, "size": 48, "bg_circle": false },
      "padding": { "x": 70, "y": 80 }
    },
    "content": { "...SAME FULL STRUCTURE as cover but with values matching content slides..." },
    "bullets": {
      "...SAME FULL STRUCTURE as cover plus...",
      "bullet_style": {
        "type": "numbered_circle | checkmark | dash | arrow",
        "accent_color": "#hex",
        "number_bg_color": "#hex",
        "number_text_color": "#ffffff",
        "size": 36,
        "container": { "enabled": false, "bg_color": "#hex", "border_radius": 16, "padding": 36 }
      }
    },
    "cta": {
      "...SAME FULL STRUCTURE as cover plus...",
      "cta_icons": {
        "enabled": true,
        "style": "emoji",
        "items": [
          { "icon": "❤️", "label": "Curta" },
          { "icon": "💬", "label": "Comente" },
          { "icon": "🔄", "label": "Compartilhe" },
          { "icon": "📌", "label": "Salve" }
        ],
        "icon_size": 48,
        "label_color": "#hex"
      }
    }
  },
  "formats": {
    "carousel": {
      "slide_count_range": [4, 9],
      "cta_policy": "optional",
      "slide_roles": ["cover", "context", "insight", "bullets", "cta"],
      "text_limits": { "headline_chars": [35, 60], "body_chars": [140, 260], "bullets_max": 5 }
    },
    "post": { "text_limits": { "headline_chars": [35, 60], "body_chars": [140, 260] } },
    "story": { "text_limits": { "headline_chars": [25, 45], "body_chars": [90, 160] } }
  },
  "notes": ["observation 1", "observation 2"]
}

═══════════════════════════════════════
CRITICAL RULES:
═══════════════════════════════════════

1. LOOK AT THE ACTUAL IMAGES. Every value must come from what you SEE.

2. COLORS: Use EXACT hex colors from the brand palette (${paletteStr}).

3. templates_by_role MUST use the prefix "${prefix}" — IDs must be UNIQUE to this pillar.

4. rules object must accurately reflect what you see:
   - waves=true ONLY if you see wave curves
   - phone_mockup=true ONLY if you see device mockups
   - body_in_card=true ONLY if body text sits inside a card

5. Each layout_params role (cover, content, bullets, cta) MUST have the FULL structure. Do NOT abbreviate.

6. The "name" MUST be exactly "${cat.name}".

7. slide_count_range should reflect the typical number of slides you see in the examples for this pillar.`;
}
