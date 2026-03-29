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
    const { slide_id } = await req.json();
    
    if (!slide_id) {
      throw new Error("slide_id is required");
    }

    console.log(`[create-visual-brief] Starting for slide: ${slide_id}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch slide with post and brand info
    const { data: slide, error: slideError } = await supabase
      .from("slides")
      .select(`
        id,
        slide_index,
        slide_text,
        layout_preset,
        posts!inner (
          id,
          raw_post_text,
          content_type,
          projects!inner (
            id,
            name,
            brands!inner (
              id,
              name,
              palette,
              fonts,
              visual_tone,
              do_rules,
              dont_rules
            )
          )
        )
      `)
      .eq("id", slide_id)
      .single();

    if (slideError || !slide) {
      console.error("[create-visual-brief] Slide not found:", slideError);
      throw new Error("Slide not found");
    }

    const post = (slide as any).posts;
    const project = post.projects;
    const brand = project.brands;

    // Fetch brand examples for reference
    const { data: brandExamples } = await supabase
      .from("brand_examples")
      .select("image_url, description, content_type")
      .eq("brand_id", brand.id)
      .limit(5);

    console.log(`[create-visual-brief] Found slide ${slide.slide_index} for post type: ${post.content_type}`);
    console.log(`[create-visual-brief] Found ${brandExamples?.length || 0} brand examples`);
    const isCoverSlide = slide.slide_index === 0;

    // Build examples context if available
    let examplesContext = "";
    if (brandExamples && brandExamples.length > 0) {
      examplesContext = `\n\nEXEMPLOS DE REFERÊNCIA DA MARCA (use como inspiração visual):
${brandExamples.map((ex, i) => `${i + 1}. ${ex.description || 'Exemplo de conteúdo'} (tipo: ${ex.content_type})`).join('\n')}

Analise esses exemplos para manter consistência com o estilo visual já estabelecido pela marca.`;
    }

    // Build AI prompt for visual brief generation
    const systemPrompt = `Você é um Diretor de Arte especializado em conteúdo visual para redes sociais.
Sua tarefa é criar um Visual Brief estruturado para guiar a geração de imagens de alta qualidade.

Regras da marca:
- Tom visual: ${brand.visual_tone || 'clean'}
- Paleta de cores: ${JSON.stringify(brand.palette || [])}
- Fontes: ${JSON.stringify(brand.fonts || {})}
- Fazer: ${brand.do_rules || 'Nenhuma regra específica'}
- Evitar: ${brand.dont_rules || 'Nenhuma restrição específica'}

Tipo de conteúdo: ${post.content_type}
${isCoverSlide ? '⚠️ Este é o slide de CAPA - deve ser impactante e chamar atenção.' : ''}

Responda APENAS com um JSON válido no seguinte formato:
{
  "theme": "tema visual principal",
  "key_message": "mensagem central a transmitir",
  "emotion": "emoção principal (ex: inspiração, urgência, curiosidade, confiança)",
  "visual_metaphor": "metáfora visual sugerida",
  "style": "estilo visual (ex: minimalista, editorial, bold, tech, organic)",
  "palette": ["#cor1", "#cor2", "#cor3"],
  "negative_elements": "elementos a evitar na imagem",
  "text_on_image": true/false,
  "text_limit_words": número máximo de palavras se houver texto,
  "composition_notes": "notas sobre composição (rule of thirds, espaço negativo, etc)"
}`;

    const userPrompt = `Crie um Visual Brief para o seguinte conteúdo:

CONTEXTO DO POST:
${post.raw_post_text}

TEXTO DESTE SLIDE:
${slide.slide_text || 'Sem texto específico'}

SLIDE: ${slide.slide_index + 1} ${isCoverSlide ? '(CAPA)' : ''}${examplesContext}`;

    console.log("[create-visual-brief] Calling Lovable AI for brief generation...");

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
      console.error("[create-visual-brief] AI error:", aiResponse.status, errorText);
      throw new Error(`AI request failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No content from AI");
    }

    console.log("[create-visual-brief] AI response received, parsing...");

    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Could not parse JSON from AI response");
    }

    const brief = JSON.parse(jsonMatch[0]);

    // Upsert visual brief
    const { data: savedBrief, error: saveError } = await supabase
      .from("visual_briefs")
      .upsert({
        slide_id: slide_id,
        theme: brief.theme,
        key_message: brief.key_message,
        emotion: brief.emotion,
        visual_metaphor: brief.visual_metaphor,
        style: brief.style,
        palette: brief.palette || brand.palette || [],
        negative_elements: brief.negative_elements,
        text_on_image: brief.text_on_image ?? true,
        text_limit_words: brief.text_limit_words ?? 10,
        composition_notes: brief.composition_notes,
      }, {
        onConflict: "slide_id"
      })
      .select()
      .single();

    if (saveError) {
      console.error("[create-visual-brief] Save error:", saveError);
      throw new Error("Failed to save visual brief");
    }

    console.log(`[create-visual-brief] Brief saved successfully: ${savedBrief.id}`);

    return new Response(JSON.stringify({ success: true, brief: savedBrief }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[create-visual-brief] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
