import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchAI } from "../_shared/ai-gateway.ts";

async function aiGatewayFetch(body: Record<string, unknown>): Promise<Response> {
  const result = await fetchAI(body as any);
  return new Response(JSON.stringify({ choices: result.choices }), {
    status: result.ok ? 200 : (result.status || 500),
    headers: { "Content-Type": "application/json" },
  });
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { slide_id, generation_id } = await req.json();

    if (!slide_id) {
      throw new Error("slide_id is required");
    }

    console.log(`[analyze-image-layout] Starting for slide: ${slide_id}, generation: ${generation_id}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch the selected image generation
    let imageUrl: string | null = null;

    if (generation_id) {
      const { data: gen } = await supabase
        .from("image_generations")
        .select("image_url")
        .eq("id", generation_id)
        .single();
      imageUrl = gen?.image_url ?? null;
    }

    if (!imageUrl) {
      const { data: gen } = await supabase
        .from("image_generations")
        .select("image_url")
        .eq("slide_id", slide_id)
        .eq("is_selected", true)
        .single();
      imageUrl = gen?.image_url ?? null;
    }

    if (!imageUrl) {
      console.warn("[analyze-image-layout] No image found, using default layout params");
      const defaultParams = {
        text_safe_zone: { top: 10, left: 10, right: 10, bottom: 10 },
        focal_point: { x: 50, y: 50 },
        brightness: "medium",
        dominant_colors: [],
        suggested_text_position: "bottom",
        suggested_overlay_opacity: 0.4,
        text_zones: [],
      };

      await supabase
        .from("slides")
        .update({ image_layout_params: defaultParams })
        .eq("id", slide_id);

      return new Response(
        JSON.stringify({ success: true, params: defaultParams, fallback: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fetch slide context
    const { data: slide } = await supabase
      .from("slides")
      .select("slide_text, slide_index")
      .eq("id", slide_id)
      .single();

    console.log("[analyze-image-layout] Calling AI for enhanced layout analysis...");

    const systemPrompt = `You are an expert visual layout analyzer for social media image design.
Your task is to analyze a background image and detect PRECISE areas where text can be overlaid.

Analyze the image and return ONLY valid JSON with this structure:
{
  "text_zones": [
    {
      "type": "phone_screen" | "text_card" | "clean_area" | "mockup_area" | "banner",
      "x": number (% from left, 0-100),
      "y": number (% from top, 0-100),
      "width": number (% of image width, 5-100),
      "height": number (% of image height, 5-100),
      "priority": number (1=best for headline, 2=good for body, 3=secondary),
      "suggested_font_scale": number (0.5-1.5, smaller for tight areas)
    }
  ],
  "text_safe_zone": {
    "top": number (% margin safe for text, 0-50),
    "left": number (% margin safe for text, 0-50),
    "right": number (% margin safe for text, 0-50),
    "bottom": number (% margin safe for text, 0-50)
  },
  "focal_point": { "x": number (0-100), "y": number (0-100) },
  "brightness": "light" | "medium" | "dark",
  "dominant_colors": ["hex1", "hex2", "hex3"],
  "suggested_text_position": "top" | "center" | "bottom" | "top-left" | "bottom-left",
  "suggested_overlay_opacity": number (0.0-1.0),
  "has_mockup": boolean,
  "has_text_card": boolean
}

CRITICAL RULES for text_zones detection:
- PHONE/DEVICE MOCKUPS: If you see a phone, tablet, or device screen, detect the SCREEN AREA precisely. Text should go INSIDE the screen, not outside.
- TEXT CARDS/BOXES: If there are colored rectangles, cards, or text placeholder areas, detect their exact bounds.
- CLEAN AREAS: Large areas with minimal visual detail where text would be readable.
- Each zone should have accurate x, y, width, height as PERCENTAGES of the full image.
- priority 1 = best area for the main headline (usually the largest clean zone)
- priority 2 = good for body text or secondary content
- suggested_font_scale: 0.6-0.8 for small areas (like phone screens), 1.0 for normal, 1.2+ for large areas
- Detect AT LEAST 1 zone. Maximum 4 zones.
- x and y represent the TOP-LEFT corner of the zone.`;

    const userPrompt = `Analyze this background image for a social media post.
${slide?.slide_text ? `The text that will be overlaid is: "${slide.slide_text}"` : ""}
${slide?.slide_index !== undefined ? `This is slide ${slide.slide_index + 1}.` : ""}

Detect all areas where text can be placed — especially phone mockup screens, text cards, and clean background areas. Return precise bounding box coordinates.

Image URL: ${imageUrl}`;

    const aiResponse = await aiGatewayFetch({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: userPrompt },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("[analyze-image-layout] AI error:", aiResponse.status, errorText);
      throw new Error(`AI request failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No content from AI");
    }

    console.log("[analyze-image-layout] Parsing enhanced layout analysis...");

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn("[analyze-image-layout] Could not parse AI response, using defaults");
      const defaultParams = {
        text_safe_zone: { top: 10, left: 10, right: 10, bottom: 10 },
        focal_point: { x: 50, y: 50 },
        brightness: "medium",
        dominant_colors: [],
        suggested_text_position: "bottom",
        suggested_overlay_opacity: 0.4,
        text_zones: [],
      };

      await supabase
        .from("slides")
        .update({ image_layout_params: defaultParams })
        .eq("id", slide_id);

      return new Response(
        JSON.stringify({ success: true, params: defaultParams, fallback: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const layoutParams = JSON.parse(jsonMatch[0]);

    // Log detected zones for debugging
    const zones = layoutParams.text_zones || [];
    console.log(`[analyze-image-layout] Detected ${zones.length} text zones:`, JSON.stringify(zones));
    if (layoutParams.has_mockup) console.log("[analyze-image-layout] MOCKUP detected!");
    if (layoutParams.has_text_card) console.log("[analyze-image-layout] TEXT CARD detected!");

    // Store in slides table
    await supabase
      .from("slides")
      .update({
        image_layout_params: layoutParams,
        layout_analysis: layoutParams,
      })
      .eq("id", slide_id);

    console.log(`[analyze-image-layout] Enhanced layout params saved for slide ${slide_id}`);

    return new Response(
      JSON.stringify({ success: true, params: layoutParams }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("[analyze-image-layout] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
