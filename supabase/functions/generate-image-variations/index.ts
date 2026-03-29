import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { slide_id, prompt_id, quality_tier = "cheap", n_variations = 2 } = await req.json();
    
    if (!slide_id) {
      throw new Error("slide_id is required");
    }

    console.log(`[generate-image-variations] Starting for slide: ${slide_id}, tier: ${quality_tier}, variations: ${n_variations}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch prompt(s) for this slide
    let promptQuery = supabase.from("image_prompts").select("*").eq("slide_id", slide_id);
    if (prompt_id) {
      promptQuery = promptQuery.eq("id", prompt_id);
    }
    const { data: prompts, error: promptError } = await promptQuery.order("variant_index");

    if (promptError || !prompts || prompts.length === 0) {
      console.error("[generate-image-variations] No prompts found:", promptError);
      throw new Error("No prompts found. Run build-image-prompts first.");
    }

    // ══════ FETCH BRAND DATA VIA SLIDE CHAIN ══════
    const { data: slideData } = await supabase
      .from("slides")
      .select(`
        id,
        posts!inner (
          content_type,
          projects!inner (
            brands!inner (
              name, palette, visual_tone, do_rules, dont_rules
            )
          )
        )
      `)
      .eq("id", slide_id)
      .single();

    const brand = (slideData as any)?.posts?.projects?.brands;
    let brandBlock = "";

    if (brand) {
      const colorHexes = Array.isArray(brand.palette)
        ? brand.palette.map((c: any) => c.hex || c).filter(Boolean).join(", ")
        : "";
      
      brandBlock = [
        "\n=== BRAND TOKENS (MANDATORY) ===",
        `Brand: ${brand.name}`,
        `Visual style: ${brand.visual_tone || "clean"}`,
        `Color palette (USE THESE): ${colorHexes || "professional defaults"}`,
        brand.do_rules ? `Rules to follow: ${brand.do_rules}` : "",
        "",
        "=== NEGATIVES (FORBIDDEN) ===",
        brand.dont_rules ? `- ${brand.dont_rules}` : "",
        "- No text overlays, no watermarks, no generic stock feel",
        "=== END BRAND ===\n",
      ].filter(Boolean).join("\n");

      console.log(`[generate-image-variations] Brand loaded: ${brand.name}, colors: ${colorHexes}`);
    }

    // When n_variations=1, only use the first prompt (no need to generate 3 images)
    const promptsToProcess = n_variations <= 1 ? prompts.slice(0, 1) : prompts;
    console.log(`[generate-image-variations] Found ${prompts.length} prompts, processing ${promptsToProcess.length}`);

    const model = quality_tier === "high" 
      ? "google/gemini-3-pro-image-preview"
      : "google/gemini-2.5-flash-image";

    console.log(`[generate-image-variations] Using model: ${model}`);

    const allGenerations: any[] = [];

    for (const prompt of promptsToProcess) {
      console.log(`[generate-image-variations] Generating for prompt ${prompt.variant_index}: ${prompt.prompt.substring(0, 50)}...`);

      for (let i = 0; i < n_variations; i++) {
        try {
          const variationSuffix = n_variations > 1 
            ? `. Variation ${i + 1}: slightly different composition and lighting.` 
            : "";
          
          // Inject brand block into every image prompt
          const fullPrompt = `${brandBlock}${prompt.prompt}${variationSuffix}\n\nUltra high resolution, professional quality, 1080x1080 square format for Instagram. NO text on image.`;

          console.log(`[generate-image-variations] Final prompt (v${i + 1}): ${fullPrompt.substring(0, 150)}...`);

          const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${lovableApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model,
              messages: [{ role: "user", content: fullPrompt }],
              modalities: ["image", "text"]
            }),
          });

          if (!aiResponse.ok) {
            const errorText = await aiResponse.text();
            console.error(`[generate-image-variations] AI error for variation ${i + 1}:`, aiResponse.status, errorText);
            if (aiResponse.status === 429) {
              await new Promise(r => setTimeout(r, 2000));
            }
            continue;
          }

          const aiData = await aiResponse.json();
          const imageUrl = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

          if (!imageUrl) {
            console.error(`[generate-image-variations] No image for variation ${i + 1}`);
            continue;
          }

          console.log(`[generate-image-variations] Got image, uploading to storage...`);

          const base64Data = imageUrl.replace(/^data:image\/\w+;base64,/, "");
          const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
          
          const fileName = `${slide_id}/${prompt.id}_v${i + 1}_${Date.now()}.png`;
          
          const { error: uploadError } = await supabase.storage
            .from("generated-images")
            .upload(fileName, imageBytes, {
              contentType: "image/png",
              upsert: true
            });

          if (uploadError) {
            console.error("[generate-image-variations] Upload error:", uploadError);
            continue;
          }

          const { data: urlData } = supabase.storage
            .from("generated-images")
            .getPublicUrl(fileName);

          const { data: generation, error: saveError } = await supabase
            .from("image_generations")
            .insert({
              slide_id,
              prompt_id: prompt.id,
              model_used: model,
              image_url: urlData.publicUrl,
              thumb_url: urlData.publicUrl,
              width: 1080,
              height: 1080,
              seed: `${Date.now()}_${i}`,
              is_selected: false
            })
            .select()
            .single();

          if (saveError) {
            console.error("[generate-image-variations] Save error:", saveError);
            continue;
          }

          console.log(`[generate-image-variations] Saved generation: ${generation.id}`);
          allGenerations.push(generation);

          await new Promise(r => setTimeout(r, 500));
        } catch (genError) {
          console.error(`[generate-image-variations] Error in variation ${i + 1}:`, genError);
        }
      }
    }

    console.log(`[generate-image-variations] Completed. Total: ${allGenerations.length}`);

    return new Response(JSON.stringify({ 
      success: true, 
      generations: allGenerations,
      count: allGenerations.length
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[generate-image-variations] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
