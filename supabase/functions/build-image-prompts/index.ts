import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Presets by content type
const contentTypePresets: Record<string, string> = {
  noticia: "editorial photography style, news magazine aesthetic, professional journalism, clean layout with text overlay area",
  educativo: "modern infographic style, clean educational visuals, structured layout, learning-focused design",
  frase: "typographic design, abstract background, minimal elements, focus on text space, inspirational quote aesthetic",
  curiosidade: "engaging visual storytelling, surprise element, attention-grabbing, vibrant and intriguing",
  tutorial: "step-by-step visual guide, clear instructional design, numbered sequence, easy to follow",
  anuncio: "commercial photography, product-focused, high-end advertising, premium look and feel"
};

// Presets by visual tone
const tonePresets: Record<string, string> = {
  clean: "minimalist, lots of white space, simple geometric shapes, uncluttered",
  editorial: "magazine quality, sophisticated typography, professional photography",
  tech: "futuristic, digital elements, gradient overlays, modern tech aesthetic",
  luxury: "premium materials, gold accents, elegant, high-end fashion",
  playful: "bright colors, fun shapes, energetic, youthful",
  organic: "natural textures, earth tones, botanical elements, sustainable feel"
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { slide_id } = await req.json();
    
    if (!slide_id) {
      throw new Error("slide_id is required");
    }

    console.log(`[build-image-prompts] Starting for slide: ${slide_id}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch visual brief with slide and brand info
    const { data: brief, error: briefError } = await supabase
      .from("visual_briefs")
      .select(`
        *,
        slide:slides!inner (
          id,
          slide_index,
          slide_text,
          post:posts!inner (
            content_type,
            raw_post_text,
            project:projects!inner (
              brand:brands!inner (
                name,
                palette,
                visual_tone,
                do_rules,
                dont_rules
              )
            )
          )
        )
      `)
      .eq("slide_id", slide_id)
      .single();

    if (briefError || !brief) {
      console.error("[build-image-prompts] Brief not found:", briefError);
      throw new Error("Visual brief not found. Run create-visual-brief first.");
    }

    const brand = brief.slide.post.project.brand;
    const contentType = brief.slide.post.content_type;
    const isCoverSlide = brief.slide.slide_index === 0;

    console.log(`[build-image-prompts] Building prompts for ${contentType} slide (cover: ${isCoverSlide})`);

    const contentPreset = contentTypePresets[contentType] || contentTypePresets.educativo;
    const tonePreset = tonePresets[brand.visual_tone] || tonePresets.clean;

    // Build AI prompt for generating image prompts
    const systemPrompt = `Você é um especialista em prompts de geração de imagem para modelos como DALL-E, Midjourney e Stable Diffusion.
Sua tarefa é criar 3 prompts alternativos de alta qualidade baseados no Visual Brief fornecido.

REGRAS IMPORTANTES:
1. Cada prompt deve ser diferente em abordagem visual, mas manter a mesma mensagem
2. Se text_on_image=true, DEVE incluir instruções para reservar espaço limpo para texto
3. Inclua sempre: estilo artístico, iluminação, composição, cores
4. Evite: ${brief.negative_elements || 'nada específico'}
5. Evite: ${brand.dont_rules || 'nada específico'}
6. Inclua: ${brand.do_rules || 'nada específico'}
7. Use paleta de cores: ${JSON.stringify(brief.palette || brand.palette || [])}

Preset do tipo de conteúdo: ${contentPreset}
Preset do tom visual: ${tonePreset}

Responda APENAS com um JSON válido:
{
  "prompts": [
    {
      "prompt": "prompt completo em inglês",
      "negative_prompt": "elementos a evitar",
      "approach": "descrição curta da abordagem (ex: 'minimalista abstrato', 'foto editorial', 'ilustração bold')"
    },
    // mais 2 variantes
  ]
}`;

    const userPrompt = `Crie 3 prompts de imagem para:

VISUAL BRIEF:
- Tema: ${brief.theme}
- Mensagem chave: ${brief.key_message}
- Emoção: ${brief.emotion}
- Metáfora visual: ${brief.visual_metaphor}
- Estilo: ${brief.style}
- Composição: ${brief.composition_notes}
- Texto na imagem: ${brief.text_on_image ? `SIM (máx ${brief.text_limit_words} palavras)` : 'NÃO'}

CONTEXTO:
- Slide ${brief.slide.slide_index + 1} ${isCoverSlide ? '(CAPA - deve ser impactante)' : ''}
- Texto do slide: ${brief.slide.slide_text || 'Sem texto'}
- Marca: ${brand.name}`;

    console.log("[build-image-prompts] Calling Lovable AI...");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("[build-image-prompts] AI error:", aiResponse.status, errorText);
      throw new Error(`AI request failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const raw = aiData.choices?.[0]?.message?.content || '';

    if (!raw) {
      throw new Error("No content from AI");
    }

    console.log("[build-image-prompts] Parsing AI response...");

    // Clean markdown wrappers and extra text
    const cleaned = raw
      .replace(/```json\n?/gi, '')
      .replace(/```\n?/gi, '')
      .replace(/^\s*[\r\n]/gm, '')
      .trim();

    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch (_e) {
      // Try to extract JSON object or array from the text
      const jsonMatch = cleaned.match(/(\{[\s\S]*\})/m);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[1]);
        } catch (_e2) {
          console.error('[build-image-prompts] JSON parse failed after cleanup:', cleaned.substring(0, 300));
          throw new Error('Failed to parse AI response as JSON');
        }
      } else {
        console.error('[build-image-prompts] No JSON found in response:', cleaned.substring(0, 300));
        throw new Error('No JSON found in AI response');
      }
    }

    const prompts = parsed.prompts || (Array.isArray(parsed) ? parsed : null);

    if (!Array.isArray(prompts) || prompts.length === 0) {
      throw new Error("No prompts generated");
    }

    // Delete old prompts for this slide
    await supabase.from("image_prompts").delete().eq("slide_id", slide_id);

    // Insert new prompts
    const promptsToInsert = prompts.slice(0, 3).map((p: any, index: number) => ({
      slide_id: slide_id,
      brief_id: brief.id,
      prompt: p.prompt,
      negative_prompt: p.negative_prompt || brief.negative_elements,
      model_hint: isCoverSlide ? "high" : "cheap",
      variant_index: index + 1,
    }));

    const { data: savedPrompts, error: saveError } = await supabase
      .from("image_prompts")
      .insert(promptsToInsert)
      .select();

    if (saveError) {
      console.error("[build-image-prompts] Save error:", saveError);
      throw new Error("Failed to save prompts");
    }

    console.log(`[build-image-prompts] Saved ${savedPrompts.length} prompts`);

    return new Response(JSON.stringify({ 
      success: true, 
      prompts: savedPrompts.map((p, i) => ({
        ...p,
        approach: prompts[i]?.approach
      }))
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[build-image-prompts] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
