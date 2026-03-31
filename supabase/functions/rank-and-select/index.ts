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
    const { slide_id } = await req.json();

    if (!slide_id) {
      throw new Error("slide_id is required");
    }

    console.log(`[rank-and-select] Starting for slide: ${slide_id}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch recent generations for this slide
    const { data: generations, error: genError } = await supabase
      .from("image_generations")
      .select("*")
      .eq("slide_id", slide_id)
      .order("created_at", { ascending: false })
      .limit(10);

    if (genError || !generations || generations.length === 0) {
      console.error("[rank-and-select] No generations found:", genError);
      throw new Error("No image generations found for this slide.");
    }

    console.log(`[rank-and-select] Found ${generations.length} generations to rank`);

    // Fetch visual brief for context
    const { data: brief } = await supabase
      .from("visual_briefs")
      .select(
        `
        *,
        slide:slides!inner (
          slide_text,
          post:posts!inner (
            content_type,
            project:projects!inner (
              brand:brands!inner (
                name,
                palette,
                visual_tone
              )
            )
          )
        )
      `,
      )
      .eq("slide_id", slide_id)
      .single();

    // Build ranking prompt
    const systemPrompt = `Você é um crítico de arte digital especializado em conteúdo para redes sociais.
Sua tarefa é analisar e ranquear imagens geradas com base em critérios de qualidade.

CRITÉRIOS DE AVALIAÇÃO (0-5 cada):
1. ADERÊNCIA: Quão bem a imagem representa a mensagem/tema pretendido
2. LEGIBILIDADE: Espaço adequado para texto, clareza visual, não poluída
3. CONSISTÊNCIA DE MARCA: Cores, estilo e tom alinhados com a marca
4. APARÊNCIA PREMIUM: Qualidade profissional, não parece genérico ou "feito por IA barata"
5. PRONTO PARA PUBLICAR: Pode ser usado diretamente sem edição

${
  brief
    ? `
CONTEXTO DO BRIEF:
- Tema: ${brief.theme}
- Mensagem: ${brief.key_message}
- Emoção: ${brief.emotion}
- Estilo: ${brief.style}
- Texto na imagem: ${brief.text_on_image ? "Sim - precisa de espaço limpo" : "Não"}
- Marca: ${brief.slide.post.project.brand.name}
- Tom: ${brief.slide.post.project.brand.visual_tone}
`
    : ""
}

IMPORTANTE: Baseie sua análise na URL da imagem fornecida. Mesmo sem ver a imagem diretamente,
avalie com base nas informações do prompt que gerou cada imagem.

Responda APENAS com JSON válido:
{
  "rankings": [
    {
      "generation_id": "uuid",
      "score": número de 0-100,
      "adherence": 0-5,
      "legibility": 0-5,
      "brand_consistency": 0-5,
      "premium_look": 0-5,
      "publish_ready": true/false,
      "reason": "explicação curta"
    }
  ],
  "best_id": "uuid da melhor imagem"
}`;

    // Build list of generations for AI
    const generationsList = generations.map((g) => ({
      id: g.id,
      model: g.model_used,
      image_url: g.image_url,
    }));

    const userPrompt = `Ranqueie estas ${generations.length} imagens geradas:

${JSON.stringify(generationsList, null, 2)}

Considere que imagens de modelos "pro" ou "high" tendem a ser de maior qualidade.
Retorne o ranking completo com scores.`;

    console.log("[rank-and-select] Calling AI for ranking...");

    const aiResponse = await aiGatewayFetch({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("[rank-and-select] AI error:", aiResponse.status, errorText);
      throw new Error(`AI request failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No content from AI");
    }

    console.log("[rank-and-select] Parsing ranking results...");

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      // Fallback: select first image if AI parsing fails
      console.warn("[rank-and-select] Could not parse AI response, using fallback");
      const firstGen = generations[0];

      await supabase.from("image_generations").update({ is_selected: false }).eq("slide_id", slide_id);

      await supabase
        .from("image_generations")
        .update({
          is_selected: true,
          ranking_score: 70,
          ranking_reason: "Selected by default (first generated)",
        })
        .eq("id", firstGen.id);

      triggerLayoutAnalysis(slide_id, firstGen.id, req.headers.get("Authorization")!);

      return new Response(
        JSON.stringify({
          success: true,
          best: firstGen,
          fallback: true,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const result = JSON.parse(jsonMatch[0]);

    // Deselect all images for this slide
    await supabase.from("image_generations").update({ is_selected: false }).eq("slide_id", slide_id);

    // Update each generation with ranking
    for (const ranking of result.rankings || []) {
      const isSelected = ranking.generation_id === result.best_id;

      await supabase
        .from("image_generations")
        .update({
          ranking_score: ranking.score,
          ranking_reason: ranking.reason,
          is_selected: isSelected,
        })
        .eq("id", ranking.generation_id);
    }

    // Save quality metrics
    const bestRanking = result.rankings?.find((r: any) => r.generation_id === result.best_id);

    if (bestRanking) {
      await supabase.from("quality_metrics").upsert(
        {
          slide_id: slide_id,
          adherence: bestRanking.adherence,
          legibility: bestRanking.legibility,
          brand_consistency: bestRanking.brand_consistency,
          premium_look: bestRanking.premium_look,
          publish_ready: bestRanking.publish_ready,
        },
        {
          onConflict: "slide_id",
        },
      );
    }

    // Fetch the best generation
    const { data: bestGeneration } = await supabase
      .from("image_generations")
      .select("*")
      .eq("id", result.best_id)
      .single();

    console.log(`[rank-and-select] Selected best image: ${result.best_id}`);

    // Fire-and-forget: trigger layout analysis. We don't await so the user
    // gets their ranking response immediately; analysis runs in the background.
    triggerLayoutAnalysis(slide_id, result.best_id, req.headers.get("Authorization")!);

    return new Response(
      JSON.stringify({
        success: true,
        best: bestGeneration,
        rankings: result.rankings,
        metrics: bestRanking,
        layout_analysis_triggered: true,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error: any) {
    console.error("[rank-and-select] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ─── Helper: fire-and-forget layout analysis ──────────────────────────────────

/**
 * Calls analyze-image-layout without awaiting the result.
 * This keeps rank-and-select fast while the analysis runs asynchronously.
 * The result is stored in slides.image_layout_params and will be picked up
 * by SlideTemplateRenderer on the next render.
 */
function triggerLayoutAnalysis(slideId: string, generationId: string, authHeader: string): void {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const url = `${supabaseUrl}/functions/v1/analyze-image-layout`;

  fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ slide_id: slideId, generation_id: generationId }),
  })
    .then((res) => {
      if (!res.ok) {
        res
          .text()
          .then((t) =>
            console.warn(`[rank-and-select] analyze-image-layout returned ${res.status}: ${t.substring(0, 100)}`),
          );
      } else {
        console.log(`[rank-and-select] analyze-image-layout triggered successfully for slide ${slideId}`);
      }
    })
    .catch((err) => console.warn("[rank-and-select] analyze-image-layout trigger failed:", err.message));
}
