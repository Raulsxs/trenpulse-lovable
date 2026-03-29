import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { brandId } = await req.json();
    if (!brandId) {
      return new Response(JSON.stringify({ error: "brandId is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[analyze-brand-examples] Starting analysis for brand: ${brandId}`);

    // Fetch brand
    const { data: brand, error: brandError } = await supabase
      .from("brands")
      .select("*")
      .eq("id", brandId)
      .single();

    if (brandError || !brand) {
      return new Response(JSON.stringify({ error: "Brand not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch examples (up to 12 images for multimodal)
    const { data: examples } = await supabase
      .from("brand_examples")
      .select("image_url, description, content_type, type, subtype")
      .eq("brand_id", brandId)
      .limit(12);

    if (!examples || examples.length === 0) {
      return new Response(JSON.stringify({ error: "No brand examples found. Upload at least 1 example image." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const exampleCount = examples.length;
    const confidence = exampleCount >= 8 ? "high" : exampleCount >= 4 ? "medium" : "low";

    console.log(`[analyze-brand-examples] Found ${exampleCount} examples (confidence: ${confidence}), palette: ${JSON.stringify(brand.palette)}`);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Build examples metadata summary
    const examplesSummary = examples.map((ex, i) => 
      `Image ${i + 1}: type=${ex.type || ex.content_type || "post"}, subtype=${ex.subtype || "none"}, description="${ex.description || "none"}"`
    ).join("\n");

    // Build multimodal message with images
    const contentParts: any[] = [
      {
        type: "text",
        text: `You are a senior brand identity analyst specializing in social media visual systems. Analyze the provided brand example images and metadata below. Return ONLY valid JSON (no markdown, no code fences).

BRAND METADATA:
- Name: ${brand.name}
- Current palette: ${JSON.stringify(brand.palette)}
- Visual tone: ${brand.visual_tone || "not set"}
- Fonts: ${JSON.stringify(brand.fonts)}
- Do rules: ${brand.do_rules || "none"}
- Don't rules: ${brand.dont_rules || "none"}
- Logo URL: ${brand.logo_url || "none"}

EXAMPLES METADATA:
${examplesSummary}

ANALYSIS INSTRUCTIONS:
1. Look ONLY at what appears in the actual images. Do NOT invent or hallucinate elements.
2. Identify recurring visual patterns: shapes, wave positions, card styles, color distribution, typography weight/size, logo placement.
3. Group findings by format (post, story, carousel) based on the type metadata.
4. For each format, recommend which templates best match: wave_cover, wave_text_card, wave_bullets, wave_closing, story_cover, story_tip, generic_free.
5. Extract exact colors seen (confirm against provided palette).
6. Note text placement zones, safe margins, and composition patterns.

Return this EXACT JSON structure:
{
  "style_preset": "<short_unique_id like 'medical_wave_minimal', 'navy_editorial', etc.>",
  "confidence": "${confidence}",
  "brand_tokens": {
    "palette_roles": {
      "primary": "#hex",
      "secondary": "#hex",
      "accent": "#hex",
      "background": "#hex",
      "text_primary": "#hex",
      "text_secondary": "#hex"
    },
    "typography": {
      "headline_weight": 700,
      "body_weight": 400,
      "uppercase_headlines": false,
      "headline_alignment": "left|center",
      "body_alignment": "left|center"
    },
    "logo": {
      "preferred_position": "top-right|top-left|bottom-center|bottom-right",
      "watermark_opacity": 0.35,
      "size_hint": "small|medium"
    }
  },
  "formats": {
    "post": {
      "recommended_templates": ["wave_cover", "wave_text_card"],
      "layout_rules": {
        "wave_height_pct": 20,
        "footer_height_px": 140,
        "safe_margin_px": 96,
        "background_style": "solid|gradient|image"
      },
      "text_limits": {
        "headline_chars": [35, 60],
        "body_chars": [140, 260]
      }
    },
    "story": {
      "recommended_templates": ["story_cover", "story_tip"],
      "layout_rules": {
        "safe_top_px": 220,
        "safe_bottom_px": 260,
        "safe_side_px": 90,
        "background_style": "solid|gradient|image"
      },
      "text_limits": {
        "headline_chars": [25, 45],
        "body_chars": [90, 160]
      }
    },
    "carousel": {
      "recommended_templates": ["wave_cover", "wave_text_card", "wave_bullets", "wave_closing"],
      "slide_roles": ["cover", "context", "insight", "insight", "closing"],
      "text_limits": {
        "headline_chars": [35, 60],
        "body_chars": [160, 260],
        "bullets_max": 5
      }
    }
  },
  "visual_patterns": [
    "describe each distinct visual pattern you observe, one per line"
  ],
  "do_summary": ["summarize positive rules based on examples + brand rules"],
  "dont_summary": ["summarize negative rules based on examples + brand rules"]
}`
      }
    ];

    // Add each example image as a URL reference (limit to 6 for API constraints)
    const imagesToSend = examples.slice(0, 6);
    for (const example of imagesToSend) {
      contentParts.push({
        type: "image_url",
        image_url: { url: example.image_url }
      });
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
      const errText = await response.text();
      console.error(`[analyze-brand-examples] AI error: ${response.status}`, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, tente novamente em alguns minutos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes. Adicione créditos ao workspace." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiData = await response.json();
    const rawContent = aiData.choices?.[0]?.message?.content || "";
    console.log(`[analyze-brand-examples] AI response length: ${rawContent.length}`);

    // Parse JSON from response
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[analyze-brand-examples] Could not parse JSON from:", rawContent.substring(0, 500));
      throw new Error("Failed to parse style guide from AI response");
    }

    const styleGuide = JSON.parse(jsonMatch[0]);
    console.log(`[analyze-brand-examples] Style preset: ${styleGuide.style_preset}, confidence: ${styleGuide.confidence}`);

    // Save to brands with version tracking
    const currentVersion = brand.style_guide_version || 0;
    const { error: updateError } = await supabase
      .from("brands")
      .update({
        style_guide: styleGuide,
        style_guide_version: currentVersion + 1,
        style_guide_updated_at: new Date().toISOString(),
      })
      .eq("id", brandId);

    if (updateError) {
      console.error("[analyze-brand-examples] DB update error:", updateError);
      throw new Error("Failed to save style guide");
    }

    console.log(`[analyze-brand-examples] Style guide v${currentVersion + 1} saved for brand ${brand.name}`);

    return new Response(JSON.stringify({
      success: true,
      styleGuide,
      version: currentVersion + 1,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[analyze-brand-examples] error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Unknown error"
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
