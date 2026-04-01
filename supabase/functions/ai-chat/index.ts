import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchAI } from "../_shared/ai-gateway.ts";

// Compatibility wrapper — uses centralized AI gateway (inference.sh > Google > Lovable)
// Returns a Response so all existing callers (.ok, .json()) work unchanged
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
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const INTENTS = [
  "GERAR_POST",
  "GERAR_CARROSSEL",
  "GERAR_STORY",
  "GERAR_CONTEUDO",
  "INICIAR_GERACAO",
  "GERAR_BACKGROUNDS",
  "GERAR_TEXTOS",
  "COMPOR_SLIDES",
  "PIPELINE_BACKGROUND",
  "EDITAR_TEXTO",
  "EDITAR_VISUAL",
  "ADAPTAR_PLATAFORMA",
  "SUGERIR_CONTEUDO",
  "CRIAR_SERIE",
  "REGENERAR_TEXTO",
  "REGENERAR_IMAGEM",
  "CRIAR_MARCA",
  "CRIAR_MARCA_ANALYZE",
  "LINK_PARA_POST",
  "AGENDAR",
  "VER_CALENDARIO",
  "CONFIGURAR_CRON",
  "ATUALIZAR_PERFIL",
  "CONVERSA_LIVRE",
] as const;

// ── Quality briefing helper ──
function buildQualityBriefing(opts: {
  niche: string;
  voice: string;
  topics: string[];
  referenceSources?: string[];
  sourceUrl?: string;
  handle?: string;
}) {
  const { niche, voice, topics, referenceSources, sourceUrl, handle } = opts;
  const parts = [
    `IMPORTANTE: Use APENAS informações do link/texto fornecido.`,
    `NÃO invente empresas, produtos ou tecnologias não mencionadas na fonte.`,
    `NÃO use exemplos genéricos a menos que estejam na fonte original.`,
    `O título deve ter no máximo 8 palavras e no máximo 60 caracteres, impactante e direto.`,
    `O corpo de cada slide deve ter no máximo 200 caracteres.`,
    `Cada bullet point deve ter no máximo 120 caracteres.`,
    `O corpo deve ter no máximo 3 bullet points curtos.`,
    `Tom: ${voice}`,
    `Nicho: ${niche}`,
    topics.length ? `Temas: ${topics.join(", ")}` : "",
    handle ? `Instagram: ${handle}` : "",
    referenceSources?.length ? `Fontes de referência: ${referenceSources.join(", ")}` : "",
    sourceUrl ? `Fonte original: ${sourceUrl}` : "",
  ].filter(Boolean);
  return parts.join("\n");
}

// ── Vision quality validation ──
async function validateCompositeWithVision(opts: {
  imageUrl: string;
  niche: string;
  lovableApiKey: string;
  logPrefix: string;
}): Promise<{ score: number; sugestao: string } | null> {
  const { imageUrl, niche, lovableApiKey, logPrefix } = opts;
  try {
    const visionPrompt = `Analise esta imagem de post para Instagram:
1. O texto está legível? (sim/não + motivo)
2. Há sobreposição visual problemática? (sim/não)
3. O conteúdo é relevante para o nicho "${niche}"? (sim/não)
4. Score de qualidade: 1-10
5. Uma sugestão de melhoria no texto (máx 10 palavras)

Responda em JSON: { "legivel": bool, "sobreposicao": bool, "relevante": bool, "score": number, "sugestao": string }`;

    const resp = await aiGatewayFetch({
        model: "google/gemini-2.5-flash",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: visionPrompt },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        }],
      });

    if (!resp.ok) {
      console.error(`${logPrefix} Vision validation failed (${resp.status})`);
      return null;
    }

    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content || "";
    // Extract JSON from response
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn(`${logPrefix} Vision returned non-JSON:`, raw.substring(0, 200));
      return null;
    }
    const parsed = JSON.parse(jsonMatch[0]);
    console.log(`${logPrefix} Vision score: ${parsed.score}, sugestao: ${parsed.sugestao}`);
    return { score: parsed.score || 5, sugestao: parsed.sugestao || "" };
  } catch (err: any) {
    console.error(`${logPrefix} Vision validation error:`, err?.message);
    return null;
  }
}

function resolveContentDimensions(contentType: string, platform: string = "instagram") {
  if (platform === "linkedin") {
    if (contentType === "post") return { width: 1200, height: 1200 };
    if (contentType === "document") return { width: 1080, height: 1350 }; // 4:5 presentation
    if (contentType === "story") return { width: 1080, height: 1920 };
    return { width: 1080, height: 1080 }; // carousel
  }
  // Instagram
  if (contentType === "story") return { width: 1080, height: 1920 };
  return { width: 1080, height: 1080 }; // post and carousel
}

async function renderCompositeAndUpdateContent(opts: {
  svc: any;
  supabaseUrl: string;
  authHeader: string;
  supabaseAnonKey: string;
  contentId: string;
  slides: any[];
  brandSnapshot: any;
  contentType: string;
  platform?: string;
  logPrefix: string;
  niche?: string;
  lovableApiKey?: string;
  visualStyle?: string;
}) {
  const { svc, supabaseUrl, authHeader, supabaseAnonKey, contentId, slides, brandSnapshot, contentType, platform, logPrefix, niche, lovableApiKey: apiKey, visualStyle } = opts;

  try {
    // Enrich slides with image_layout_params from DB (set by analyze-image-layout)
    let enrichedSlides = slides;
    try {
      // Get the post_id for this content to properly scope the slides query
      const { data: gcContent } = await svc.from("generated_contents").select("slides, generation_metadata").eq("id", contentId).single();
      const postId = (gcContent?.generation_metadata as any)?.post_id;
      const dbSlides = (gcContent?.slides as any[]) || [];
      const slideIndices = dbSlides.map((_: any, i: number) => i);

      let dbSlideRows: any[] | null = null;
      if (postId) {
        // Scoped query: only slides belonging to this content's post
        const { data } = await svc
          .from("slides")
          .select("slide_index, image_layout_params")
          .eq("post_id", postId)
          .in("slide_index", slideIndices)
          .not("image_layout_params", "is", null);
        dbSlideRows = data;
      } else {
        // Fallback: unscoped (legacy)
        const { data } = await svc
          .from("slides")
          .select("slide_index, image_layout_params")
          .in("slide_index", slideIndices)
          .not("image_layout_params", "is", null);
        dbSlideRows = data;
        console.warn(`${logPrefix} no post_id found for content ${contentId}, layout query unscoped`);
      }

      if (dbSlideRows?.length) {
        const layoutMap: Record<number, any> = {};
        for (const row of dbSlideRows) {
          layoutMap[row.slide_index] = row.image_layout_params;
        }
        enrichedSlides = slides.map((s: any, i: number) => {
          const layoutParams = layoutMap[i];
          if (layoutParams) {
            const positions: any = {};
            const style: any = {};
            const zones = layoutParams.text_zones || [];

            // ENHANCED: Use precise bounding boxes from text_zones
            if (zones.length > 0) {
              // Sort by priority — priority 1 = headline, priority 2 = body
              const sorted = [...zones].sort((a: any, b: any) => (a.priority || 3) - (b.priority || 3));
              const headlineZone = sorted[0];
              const bodyZone = sorted.length > 1 ? sorted[1] : null;

              if (headlineZone) {
                positions.headline = { x: headlineZone.x, y: headlineZone.y };
                if (headlineZone.width) style.headline_max_width_pct = headlineZone.width;
                if (headlineZone.suggested_font_scale) style.font_scale = headlineZone.suggested_font_scale;
              }

              if (bodyZone) {
                positions.body = { x: bodyZone.x, y: bodyZone.y };
                if (bodyZone.width) style.body_max_width_pct = bodyZone.width;
              } else if (headlineZone) {
                // Put body below headline within the same zone
                const bodyY = Math.min(headlineZone.y + Math.round(headlineZone.height * 0.4), 85);
                positions.body = { x: headlineZone.x, y: bodyY };
                if (headlineZone.width) style.body_max_width_pct = headlineZone.width;
              }

              console.log(`${logPrefix} PRECISE positioning from ${zones.length} zones: headline=${JSON.stringify(positions.headline)}, body=${JSON.stringify(positions.body)}, mockup=${layoutParams.has_mockup}`);
            } else {
              // FALLBACK: Use coarse text position (top/center/bottom)
              const textPos = layoutParams.suggested_text_position || "bottom";
              if (textPos === "top" || textPos === "top-left" || textPos === "top-right") {
                positions.headline = { x: 5, y: 8 };
                positions.body = { x: 5, y: 28 };
              } else if (textPos === "center") {
                positions.headline = { x: 5, y: 35 };
                positions.body = { x: 5, y: 55 };
              } else {
                positions.headline = { x: 5, y: 10 };
                positions.body = { x: 5, y: 70 };
              }
            }

            return {
              ...s,
              overlay_positions: { ...positions, ...s.overlay_positions },
              ...(Object.keys(style).length > 0 ? { overlay_style: { ...s.overlay_style, ...style } } : {}),
            };
          }
          return s;
        });
        console.log(`${logPrefix} enriched ${dbSlideRows.length} slides with layout params`);
      }
    } catch (enrichErr: any) {
      console.warn(`${logPrefix} layout enrichment skipped:`, enrichErr.message);
    }

    // ai_illustration_titled: only render headline on top of illustration (no body/bullets/footer)
    if (visualStyle === "ai_illustration_titled") {
      console.log(`${logPrefix} ai_illustration_titled: stripping body/bullets — title only`);
      enrichedSlides = enrichedSlides.map((s: any) => ({
        ...s,
        body: "",
        bullets: [],
        overlay: { ...(s.overlay || {}), body: "", bullets: [], footer: "" },
      }));
    }

    // photo_overlay: only headline (impact phrase), no body/bullets — clean photo with text at bottom
    if (visualStyle === "photo_overlay") {
      console.log(`${logPrefix} photo_overlay: stripping body/bullets — headline only for clean photo layout`);
      enrichedSlides = enrichedSlides.map((s: any) => ({
        ...s,
        body: "",
        bullets: [],
        overlay: { ...(s.overlay || {}), body: "", bullets: [], footer: "" },
      }));
    }

    // Pre-call diagnostic
    console.log(`${logPrefix} sending to render-slide-image:`, JSON.stringify({
      slidesCount: enrichedSlides.length,
      contentId,
      hasBrandSnapshot: !!brandSnapshot,
      slide0bgUrl: enrichedSlides[0]?.background_image_url || enrichedSlides[0]?.image_url || "NONE",
      dimensions: resolveContentDimensions(contentType, platform),
      platform: platform || "instagram",
      visualStyle: visualStyle || "unknown",
    }));

    // 60s timeout for render-slide-image
    const renderCtrl = new AbortController();
    const renderTimer = setTimeout(() => renderCtrl.abort(), 60000);

    const renderResp = await fetch(`${supabaseUrl}/functions/v1/render-slide-image`, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        apikey: supabaseAnonKey,
      },
      signal: renderCtrl.signal,
      body: JSON.stringify({
        slides: enrichedSlides,
        brand_snapshot: brandSnapshot,
        content_id: contentId,
        dimensions: resolveContentDimensions(contentType, platform),
        platform: platform || "instagram",
        content_type: contentType || "post",
        visual_style: visualStyle || null,
      }),
    });
    clearTimeout(renderTimer);

    const renderText = await renderResp.text();
    console.log(`${logPrefix} render-slide-image status: ${renderResp.status}`);
    console.log(`${logPrefix} render-slide-image response: ${renderText.substring(0, 500)}`);

    let renderData: any = {};
    try {
      renderData = renderText ? JSON.parse(renderText) : {};
    } catch {
      renderData = { raw: renderText };
    }

    if (!renderResp.ok) {
      console.error(`${logPrefix} render-slide-image FAILED (${renderResp.status}):`, renderText.substring(0, 300));
      return null;
    }

    const compositeUrls = Array.isArray(renderData?.composite_urls)
      ? renderData.composite_urls.filter(Boolean)
      : [];

    if (!compositeUrls.length) {
      console.warn(`${logPrefix} render-slide-image returned no composite_urls for content ${contentId}`);
      return null;
    }

    console.log("[ai-chat] updating image_urls with:", compositeUrls[0]);

    // Vision quality validation (non-blocking)
    let visionResult: { score: number; sugestao: string } | null = null;
    if (apiKey && compositeUrls[0]) {
      visionResult = await validateCompositeWithVision({
        imageUrl: compositeUrls[0],
        niche: niche || "geral",
        lovableApiKey: apiKey,
        logPrefix,
      });

      // Store vision metadata + flag low quality
      if (visionResult) {
        const isLowQuality = visionResult.score <= 4;
        if (isLowQuality) {
          console.warn(`${logPrefix} LOW VISION SCORE (${visionResult.score}/10) for content ${contentId}: ${visionResult.sugestao}`);
        }
        const metaUpdate: any = {};
        const { data: gcMeta } = await svc.from("generated_contents")
          .select("generation_metadata")
          .eq("id", contentId)
          .single();
        const existing = (gcMeta?.generation_metadata as any) || {};
        metaUpdate.generation_metadata = {
          ...existing,
          vision_score: visionResult.score,
          vision_sugestao: visionResult.sugestao,
          vision_low_quality: isLowQuality,
          ...(visualStyle ? { visual_style: visualStyle } : {}),
        };
        await svc.from("generated_contents").update(metaUpdate).eq("id", contentId);
      }
    }

    // Merge with existing image_urls (each PIPELINE_BACKGROUND call handles 1 slide)
    const { data: existingForMerge } = await svc.from("generated_contents").select("image_urls").eq("id", contentId).single();
    const existingMergeUrls = (existingForMerge?.image_urls as string[]) || [];
    const mergedCompositeUrls = [...existingMergeUrls, ...compositeUrls.filter((u: string) => !existingMergeUrls.includes(u))];

    await svc
      .from("generated_contents")
      .update({ image_urls: mergedCompositeUrls })
      .eq("id", contentId);

    console.log(`${logPrefix} Updated content ${contentId} with ${compositeUrls.length} new composites (total: ${mergedCompositeUrls.length})`);
    return compositeUrls;
  } catch (renderErr: any) {
    console.error(`${logPrefix} render-slide-image error:`, renderErr?.message || renderErr);
    return null;
  }
}

// ══════ STUDIO IMAGE PIPELINE ══════
async function runStudioImagePipeline(opts: {
  supabaseUrl: string;
  authHeader: string;
  supabaseAnonKey: string;
  contentId: string;
  slides: any[];
  brandId: string;
  contentType: string;
}) {
  const { supabaseUrl, authHeader, supabaseAnonKey, contentId, slides, brandId, contentType } = opts;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const svc = createClient(supabaseUrl, serviceKey);

  console.log(`[ai-chat:pipeline] Starting for content ${contentId}, ${slides.length} slides, brand ${brandId}`);

  try {
    // 1. Create project
    const { data: project, error: projErr } = await svc.from("projects").insert({
      brand_id: brandId,
      name: `Chat – ${contentId.substring(0, 8)}`,
    }).select("id").single();

    if (projErr || !project) {
      console.error("[ai-chat:pipeline] Failed to create project:", projErr);
      return;
    }

    // 2. Create post
    const rawText = slides.map((s: any) => s.headline || s.body || s.title || "").filter(Boolean).join("\n");
    const ctMap: Record<string, string> = { post: "educativo", carousel: "educativo", story: "curiosidade" };
    const { data: post, error: postErr } = await svc.from("posts").insert({
      project_id: project.id,
      raw_post_text: rawText || "Conteúdo gerado via chat",
      content_type: ctMap[contentType] || "educativo",
    }).select("id").single();

    if (postErr || !post) {
      console.error("[ai-chat:pipeline] Failed to create post:", postErr);
      return;
    }

    // 3. Create slides
    const slideInserts = slides.map((s: any, i: number) => ({
      post_id: post.id,
      slide_index: i,
      slide_text: s.headline || s.body || s.title || s.slide_text || "",
      layout_preset: "default",
    }));

    console.log(`[ai-chat:pipeline] Slide texts to insert:`, JSON.stringify(slideInserts.map(s => ({ idx: s.slide_index, text: s.slide_text?.substring(0, 60) }))));

    const { data: dbSlides, error: slidesErr } = await svc
      .from("slides")
      .insert(slideInserts)
      .select("id, slide_index, slide_text")
      .order("slide_index");

    if (slidesErr || !dbSlides?.length) {
      console.error("[ai-chat:pipeline] Failed to create slides:", slidesErr);
      return;
    }

    console.log(`[ai-chat:pipeline] Slides in DB after insert:`, JSON.stringify(dbSlides.map(s => ({ id: s.id, idx: s.slide_index, text: (s as any).slide_text?.substring(0, 60) }))));

    // Store post_id in generated_contents so ActionCard can poll image_generations
    await svc.from("generated_contents")
      .update({ generation_metadata: { post_id: post.id, project_id: project.id } })
      .eq("id", contentId);

    console.log(`[ai-chat:pipeline] Created ${dbSlides.length} slides in DB, stored post_id=${post.id}. Running pipeline...`);

    // 4. Run pipeline for all slides in parallel
    const headers = {
      Authorization: authHeader,
      "Content-Type": "application/json",
      apikey: supabaseAnonKey,
    };

    const callFn = async (fnName: string, body: any) => {
      const resp = await fetch(`${supabaseUrl}/functions/v1/${fnName}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const text = await resp.text();
      if (!resp.ok) {
        console.error(`[ai-chat:pipeline] ${fnName} failed (${resp.status}):`, text.substring(0, 200));
      } else {
        console.log(`[ai-chat:pipeline] ${fnName} OK`);
      }
      return { ok: resp.ok, text };
    };

    // Load slide content from generated_contents for slide objects
    const { data: gcSlidesData } = await svc.from("generated_contents").select("slides").eq("id", contentId).single();
    const gcSlidesArr = (gcSlidesData?.slides as any[]) || [];

    // Load default template set for brand
    const { data: brandForTs } = await svc.from("brands").select("default_template_set_id").eq("id", brandId).single();
    const defaultTsId = brandForTs?.default_template_set_id || null;

    await Promise.all(dbSlides.map(async (slide) => {
      try {
        console.log(`[ai-chat:pipeline] Processing slide ${slide.slide_index} (${slide.id})`);

        const slideContent = gcSlidesArr[slide.slide_index] || {};
        const slideRole = slide.slide_index === 0 ? "cover" : (slide.slide_index === dbSlides.length - 1 ? "cta" : "content");

        // Use generate-slide-images (Studio-quality — template rules, visual_signature, role descriptions)
        // Resolve platform from generated_contents for correct background dimensions
        const { data: gcPlatformData } = await svc.from("generated_contents").select("platform, content_type").eq("id", contentId).single();
        const slidePlatform = gcPlatformData?.platform || "instagram";
        const slideContentFormat = gcPlatformData?.content_type || (dbSlides.length > 1 ? "carousel" : "post");

        const bgResult = await callFn("generate-slide-images", {
          brandId,
          slide: {
            role: slideRole,
            headline: slideContent.headline || (slide as any).slide_text || "",
            body: slideContent.body || "",
            bullets: slideContent.bullets || [],
          },
          slideIndex: slide.slide_index,
          totalSlides: dbSlides.length,
          contentFormat: slideContentFormat,
          contentId,
          templateSetId: defaultTsId,
          backgroundOnly: true,
          platform: slidePlatform,
          allSlides: gcSlidesArr.map((s: any, i: number) => ({
            role: i === 0 ? "cover" : (i === dbSlides.length - 1 ? "cta" : "content"),
            headline: s.headline || "",
            image_headline: s.image_headline || "",
            body: s.body || "",
          })),
        });

        if (bgResult.ok) {
          try {
            const bgData = JSON.parse(bgResult.text);
            const bgUrl = bgData.imageUrl || bgData.bgImageUrl;
            if (bgUrl) {
              await svc.from("image_generations").insert({
                slide_id: slide.id,
                image_url: bgUrl,
                is_selected: true,
                model_used: "generate-slide-images",
                width: 1080,
                height: 1080,
              });
            }
          } catch (parseErr) {
            console.error(`[ai-chat:pipeline] Failed to parse bg result for slide ${slide.id}`);
          }
        }

        console.log(`[ai-chat:pipeline] Slide ${slide.slide_index} complete`);
      } catch (e: any) {
        console.error(`[ai-chat:pipeline] Slide ${slide.id} error:`, e?.message || e);
      }
    }));

    // 5. Fetch selected images and update generated_contents
    const { data: selectedImages } = await svc
      .from("image_generations")
      .select("id, slide_id, image_url")
      .in("slide_id", dbSlides.map(s => s.id))
      .eq("is_selected", true);

    if (selectedImages?.length) {
      const { data: content } = await svc
        .from("generated_contents")
        .select("slides, brand_snapshot, content_type, platform")
        .eq("id", contentId)
        .single();

      if (content?.slides && Array.isArray(content.slides)) {
        const updatedSlides = [...(content.slides as any[])];
        for (const img of selectedImages) {
          const dbSlide = dbSlides.find(s => s.id === img.slide_id);
          if (dbSlide != null && updatedSlides[dbSlide.slide_index]) {
            updatedSlides[dbSlide.slide_index].image_url = img.image_url;
            updatedSlides[dbSlide.slide_index].background_image_url = img.image_url;
            updatedSlides[dbSlide.slide_index].previewImage = img.image_url;
            updatedSlides[dbSlide.slide_index].image_stale = false;
          }
        }

        // Only update slides here — image_urls will be set by renderCompositeAndUpdateContent
        // with the final composite (text overlay on background). Writing backgrounds to
        // image_urls causes a flash in the ActionCard (shows raw bg before composite).
        await svc
          .from("generated_contents")
          .update({ slides: updatedSlides })
          .eq("id", contentId);

        console.log(`[ai-chat:pipeline] Updated content ${contentId} slides with ${selectedImages.length} background images`);

        // 5.5. Analyze image layout for optimal text positioning (vision AI)
        for (const slide of dbSlides) {
          const selImg = selectedImages.find(img => img.slide_id === slide.id);
          if (selImg) {
            try {
              const layoutResult = await callFn("analyze-image-layout", { slide_id: slide.id, generation_id: selImg.id });
              console.log(`[ai-chat:pipeline] layout analysis slide ${slide.id}: ok=${layoutResult.ok}`);
            } catch (layoutErr: any) {
              console.warn(`[ai-chat:pipeline] layout analysis failed for ${slide.id}:`, layoutErr.message);
            }
          }
        }
        // Small delay to ensure layout params are persisted
        await new Promise(r => setTimeout(r, 1500));

        // Render composite images (text + background) server-side for chat preview + scheduled publish
        const lovableApiKey = Deno.env.get("LOVABLE_API_KEY") || "";
        await renderCompositeAndUpdateContent({
          svc,
          supabaseUrl,
          authHeader,
          supabaseAnonKey,
          contentId,
          slides: updatedSlides,
          brandSnapshot: content.brand_snapshot,
          contentType: content.content_type || contentType,
          platform: content.platform || "instagram",
          logPrefix: "[ai-chat:pipeline]",
          lovableApiKey,
        });
      }
    } else {
      console.warn("[ai-chat:pipeline] No selected images found after pipeline");
    }
  } catch (err: any) {
    console.error("[ai-chat:pipeline] Fatal error:", err?.message || err);
  }
}

async function runStudioImagePipelineWithSoftTimeout(
  opts: {
    supabaseUrl: string;
    authHeader: string;
    supabaseAnonKey: string;
    contentId: string;
    slides: any[];
    brandId: string;
    contentType: string;
  },
  timeoutMs = 90000,
) {
  const pipelinePromise = runStudioImagePipeline(opts).then(() => "done" as const);
  const timeoutPromise = new Promise<"timeout">((resolve) =>
    setTimeout(() => resolve("timeout"), timeoutMs),
  );

  const result = await Promise.race([pipelinePromise, timeoutPromise]);
  if (result === "timeout") {
    console.warn(`[ai-chat] Pipeline timeout after ${timeoutMs}ms for content ${opts.contentId}; returning response and keeping polling active.`);
  } else {
    console.log(`[ai-chat] Pipeline finished before response for content ${opts.contentId}`);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { message, history, intent_hint, url, generationParams, imageUrls } = await req.json();
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY") || Deno.env.get("INFERENCE_SH_API_KEY") || Deno.env.get("GOOGLE_AI_API_KEY");

    if (!lovableApiKey) throw new Error("No AI API key configured (INFERENCE_SH_API_KEY, GOOGLE_AI_API_KEY, or LOVABLE_API_KEY)");
    if (!message) throw new Error("message is required");

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = user.id;

    const persistGeneratedContent = async ({
      generatedContent,
      fallbackTitle,
      contentType,
      brandId,
      templateSetId,
      visualMode,
      brandSnapshot,
      platform,
    }: {
      generatedContent: any;
      fallbackTitle: string;
      contentType: "post" | "carousel" | "story" | "document" | "article";
      brandId?: string | null;
      templateSetId?: string | null;
      visualMode?: string | null;
      brandSnapshot?: Record<string, any> | null;
      platform?: string | null;
    }) => {
      const buildPayload = (safeTemplateSetId: string | null) => ({
        user_id: userId,
        title: generatedContent?.title || fallbackTitle,
        content_type: contentType,
        caption: generatedContent?.caption || null,
        hashtags: Array.isArray(generatedContent?.hashtags) ? generatedContent.hashtags : null,
        slides: generatedContent?.slides || [],
        status: "draft",
        platform: platform || generatedContent?.platform || "instagram",
        visual_mode: generatedContent?.visualMode || visualMode || "brand_guided",
        brand_id: brandId || null,
        brand_snapshot: brandSnapshot || null,
        template_set_id: safeTemplateSetId,
        slide_count: Array.isArray(generatedContent?.slides) ? generatedContent.slides.length : null,
        include_cta: typeof generatedContent?.includeCta === "boolean" ? generatedContent.includeCta : true,
        source_summary: generatedContent?.sourceSummary || null,
        key_insights: Array.isArray(generatedContent?.keyInsights) ? generatedContent.keyInsights : null,
      });

      const requestedTemplateSetId = typeof templateSetId === "string" && templateSetId.trim()
        ? templateSetId
        : null;

      let { data: inserted, error: insertErr } = await supabase
        .from("generated_contents")
        .insert(buildPayload(requestedTemplateSetId))
        .select("id")
        .maybeSingle();

      if (insertErr?.code === "23503" && requestedTemplateSetId) {
        console.warn(
          "[ai-chat] template_set_id inválido ao persistir conteúdo, salvando com template_set_id=null:",
          requestedTemplateSetId,
        );

        const retry = await supabase
          .from("generated_contents")
          .insert(buildPayload(null))
          .select("id")
          .maybeSingle();

        inserted = retry.data;
        insertErr = retry.error;
      }

      if (insertErr) {
        console.error("[ai-chat] Error persisting generated content:", insertErr);
        return null;
      }

      return inserted?.id || null;
    };

    // Load user context
    const { data: userCtx } = await supabase
      .from("ai_user_context")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    // Build system prompt
    let systemPrompt = `Você é a assistente de conteúdo do TrendPulse, uma plataforma de criação de conteúdo para redes sociais para qualquer nicho ou setor de atuação.

Suas capacidades:
- Sugerir ideias de posts e conteúdos personalizados para o nicho do usuário
- Ajudar a escrever legendas e textos
- Analisar tendências relevantes para o setor do usuário
- Dar dicas de engajamento
- Ajudar com estratégia de conteúdo
- Gerar posts, carrosséis e stories a partir de ideias ou links

IMPORTANTE: Nunca assuma ou generalize o nicho do usuário. Se ele disse "tecnologia", é tecnologia em geral, NÃO HealthTech. Sempre baseie suas sugestões exatamente no nicho, tom e temas informados pelo usuário.

Responda sempre em português brasileiro, de forma amigável e profissional.
Seja concisa mas completa nas respostas.`;

    if (userCtx) {
      const ctxParts: string[] = [];
      if (userCtx.business_niche) ctxParts.push(`Nicho do negócio: ${userCtx.business_niche}`);
      if (userCtx.brand_voice) ctxParts.push(`Tom de comunicação: ${userCtx.brand_voice}`);
      if (userCtx.content_topics?.length) ctxParts.push(`Temas: ${userCtx.content_topics.join(", ")}`);
      if (userCtx.instagram_handle) ctxParts.push(`Instagram: ${userCtx.instagram_handle}`);
      if (ctxParts.length) {
        systemPrompt += `\n\nContexto do usuário:\n${ctxParts.join("\n")}\n\nREGRA: O nicho do usuário é "${userCtx.business_niche || "não definido"}". Use como contexto de fundo, mas SEMPRE priorize o TEMA ESPECÍFICO que o usuário pedir. Se ele pedir sobre "marketing digital" e o nicho é "saúde", gere sobre marketing digital (não sobre saúde). O nicho serve para ajustar o tom e público, não para substituir o tema solicitado.`;
      }
    }

    // ── Intent classification ──
    let detectedIntent = "CONVERSA_LIVRE";
    let actionResult: any = null;

    if (intent_hint && INTENTS.includes(intent_hint)) {
      detectedIntent = intent_hint;
    } else {
      // Use AI to classify intent
      const classifyPrompt = `Analise a mensagem do usuário e classifique a intenção em EXATAMENTE uma dessas categorias:
- GERAR_POST: quer criar um post único para Instagram
- GERAR_CARROSSEL: quer criar um carrossel (múltiplos slides)
- GERAR_STORY: quer criar um story
- EDITAR_TEXTO: quer editar/mudar/ajustar o texto de um conteúdo já gerado (ex: "muda o título", "mais curto", "mais informal", "substitui X por Y")
- EDITAR_VISUAL: quer ajustar posição, tamanho ou estilo visual do conteúdo (ex: "move o título para cima", "aumenta a fonte", "texto mais à esquerda", "diminui o body")
- ADAPTAR_PLATAFORMA: quer adaptar um conteúdo existente para outra plataforma ou formato (ex: "adapta para LinkedIn", "faz versão story", "converte para carrossel", "cria versão Instagram")
- SUGERIR_CONTEUDO: quer sugestões do que postar (ex: "o que devo postar?", "me sugere conteúdo", "ideias para hoje", "o que está em alta?", "plano de conteúdo")
- CRIAR_SERIE: quer criar múltiplos conteúdos de uma vez (ex: "criar série", "gera 5 posts", "conteúdo para a semana", "criar série completa")
- CRIAR_MARCA: quer criar uma nova marca/identidade visual, ou definir cores/logo/estilo da marca (ex: "criar marca", "nova marca", "definir identidade visual", "minhas cores são...")
- LINK_PARA_POST: colou um link/URL e quer transformar em conteúdo
- AGENDAR: quer agendar um conteúdo já existente
- VER_CALENDARIO: quer ver o calendário de publicações
- CONFIGURAR_CRON: quer configurar frequência de publicação automática
- ATUALIZAR_PERFIL: quer mudar nicho, tom de voz, temas ou dados do perfil (ex: "meu nicho agora é X", "muda meu tom para Y", "adiciona X nos meus temas")
- CONVERSA_LIVRE: pergunta geral, dica, ajuda, não se encaixa nas anteriores

Responda APENAS com o nome da categoria, sem explicação.

Mensagem do usuário: "${message}"`;

      const classifyResp = await aiGatewayFetch({
          model: "google/gemini-2.5-flash-lite",
          messages: [{ role: "user", content: classifyPrompt }],
        });

      if (classifyResp.ok) {
        const classifyData = await classifyResp.json();
        const classified = classifyData.choices?.[0]?.message?.content?.trim()?.toUpperCase() || "";
        const match = INTENTS.find((i) => classified.includes(i));
        if (match) detectedIntent = match;
      }

      const urlMatch = message.match(/https?:\/\/[^\s]+/);
      if (urlMatch && detectedIntent === "CONVERSA_LIVRE") {
        detectedIntent = "LINK_PARA_POST";
      }
    }

    // ── Process intent-specific actions ──
    let replyOverride: string | null = null;
    let quickReplies: string[] | null = null;
    let brandCreationStepResponse: number | null = null;

    // Check for active brand creation flow — force CRIAR_MARCA intent for ALL detected intents
    const brandCreationState = (userCtx?.extra_context as any)?.brand_creation;
    if (brandCreationState?.step > 0 && brandCreationState?.step <= 5 && detectedIntent !== "CRIAR_MARCA" && detectedIntent !== "CRIAR_MARCA_ANALYZE") {
      console.log("[ai-chat] Brand creation active (step:", brandCreationState.step, "), overriding intent", detectedIntent, "→ CRIAR_MARCA");
      detectedIntent = "CRIAR_MARCA";
    }

    switch (detectedIntent) {
      // ── NEW: Structured generation from flow ──
      case "GERAR_CONTEUDO": {
        if (!generationParams) {
          replyOverride = "Parâmetros de geração não encontrados. Tente novamente.";
          break;
        }

        const { contentType, contentStyle, slideCount, backgroundMode, templateId, sourceUrl, sourceText, uploadedImageUrl, platform: gcPlatform, visualStyle: gcVisualStyle } = generationParams;

        // Resolve brand: use provided brandId, or fallback to user's preferred recent brand
        let resolvedBrandId = generationParams.brandId || null;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const svcForBrand = createClient(supabaseUrl, serviceKey);

        const normalize = (v?: string | null) => (v || "").toLowerCase().trim();
        const healthTerms = ["health", "saúde", "saude", "heart", "hospital", "clínica", "clinica", "cardio", "med"];
        const looksHealth = (v?: string | null) => {
          const t = normalize(v);
          return healthTerms.some((k) => t.includes(k));
        };

        const { data: brands } = await svcForBrand
          .from("brands")
          .select("id, name, visual_tone, created_at")
          .eq("owner_user_id", userId)
          .order("created_at", { ascending: false });

        console.log("[ai-chat] todas as marcas do usuário:", JSON.stringify(brands));

        if (!resolvedBrandId && brands?.length) {
          const niche = normalize((userCtx as any)?.business_niche);
          const handle = normalize(((userCtx as any)?.instagram_handle || "").replace(/^@/, ""));
          const voice = normalize((userCtx as any)?.brand_voice);
          const shouldFilterHealth = niche.length > 0 && !looksHealth(niche);

          const filteredBrands = shouldFilterHealth
            ? brands.filter((b: any) => !looksHealth(b.name) && !looksHealth(b.visual_tone))
            : brands;
          const candidates = filteredBrands.length ? filteredBrands : brands;

          const preferredByHandle = handle
            ? candidates.find((b: any) => {
              const brandName = normalize((b.name || "").replace(/^@/, ""));
              return brandName === handle || brandName.includes(handle) || handle.includes(brandName);
            })
            : null;

          const preferredByVoice = voice
            ? candidates.find((b: any) => {
              const tone = normalize(b.visual_tone || "");
              return tone && (tone.includes(voice) || voice.includes(tone));
            })
            : null;

          const preferredBrand = preferredByHandle || preferredByVoice || candidates[0];
          resolvedBrandId = preferredBrand?.id || null;
          console.log("marca escolhida:", preferredBrand?.name, preferredBrand?.id);
        }

        // Log brand details
        if (resolvedBrandId) {
          const brandData = brands?.find((b: any) => b.id === resolvedBrandId);
          console.log("[ai-chat] brand usado:", resolvedBrandId, JSON.stringify(brandData));
        } else {
          console.log("[ai-chat] brand usado: null (sem marca)");
        }

        const ctx = userCtx || {} as any;
        const niche = ctx.business_niche || "geral";
        const voice = ctx.brand_voice || "natural e próximo";
        const topics = ctx.content_topics || [];
        const referenceSources = (ctx.extra_context as any)?.reference_sources || [];

        const ctMap: Record<string, string> = { post: "post", carousel: "carousel", story: "story", document: "document", article: "article" };
        const mappedContentType = ctMap[contentType] || "post";

        // Map Portuguese style values from GenerationFlowStep to English values expected by generate-content
        const styleMap: Record<string, string> = {
          noticia: "news", news: "news",
          frase: "quote", quote: "quote",
          dica: "tip", tip: "tip",
          educativo: "educational", educational: "educational",
          curiosidade: "curiosity", curiosity: "curiosity",
        };
        let mappedContentStyle: string | null = styleMap[(contentStyle || "").toLowerCase()] || contentStyle || null;
        console.log("[ai-chat] contentStyle:", mappedContentStyle, "from generationParams:", contentStyle);

        // ── Fetch article content from URL (BUG-002 fix) ──
        let articleContent = "";
        if (sourceUrl && sourceUrl.length > 10) {
          let resolvedUrl = sourceUrl;
          try {
            const urlObj = new URL(sourceUrl);
            if (urlObj.hostname.includes("google.com") && urlObj.pathname === "/url" && urlObj.searchParams.get("q")) {
              resolvedUrl = urlObj.searchParams.get("q")!;
            }
          } catch { }

          try {
            const articleResp = await fetch(resolvedUrl, {
              headers: { "User-Agent": "TrendPulse/1.0 (content-generator)" },
              redirect: "follow",
            });
            if (articleResp.ok) {
              const html = await articleResp.text();
              const textContent = html
                .replace(/<script[\s\S]*?<\/script>/gi, "")
                .replace(/<style[\s\S]*?<\/style>/gi, "")
                .replace(/<nav[\s\S]*?<\/nav>/gi, "")
                .replace(/<footer[\s\S]*?<\/footer>/gi, "")
                .replace(/<header[\s\S]*?<\/header>/gi, "")
                .replace(/<[^>]+>/g, " ")
                .replace(/&nbsp;/g, " ")
                .replace(/&amp;/g, "&")
                .replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">")
                .replace(/&quot;/g, '"')
                .replace(/\s+/g, " ")
                .trim();
              articleContent = textContent.substring(0, 4000);
              console.log("[ai-chat] GERAR_CONTEUDO fetched article, length:", articleContent.length);
            }
          } catch (e: any) {
            console.error("[ai-chat] GERAR_CONTEUDO article fetch error:", e?.message);
          }
        }

        // ── AI-based extraction of user message ──
        let extractedContent = sourceText || "";
        let extractedAuthor: string | null = null;
        let isQuote = mappedContentStyle === "quote";

        if (sourceText && sourceText.length > 5) {
          try {
            const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
            if (LOVABLE_API_KEY) {
              const extractionResp = await aiGatewayFetch({
                  model: "google/gemini-2.5-flash-lite",
                  messages: [
                    {
                      role: "user",
                      content: `O usuário enviou esta mensagem para criar um conteúdo para Instagram:\n"${sourceText}"\n\nExtraia as informações relevantes e responda APENAS em JSON válido (sem markdown):\n{\n  "content": "o texto/frase/tema principal a ser usado no conteúdo (sem prefixos como 'crie um post sobre')",\n  "is_quote": true ou false (é uma frase/citação literal que deve ser exibida como está?),\n  "author": "autor da frase se mencionado, ou null",\n  "topic": "tema geral resumido em 2-5 palavras"\n}`,
                    },
                  ],
                });
              if (extractionResp.ok) {
                const extractionData = await extractionResp.json();
                const raw = extractionData.choices?.[0]?.message?.content || "";
                const jsonMatch = raw.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                  const parsed = JSON.parse(jsonMatch[0]);
                  console.log("[ai-chat] AI extraction result:", JSON.stringify(parsed));
                  extractedContent = parsed.content || sourceText;
                  extractedAuthor = parsed.author || null;
                  if (parsed.is_quote && !mappedContentStyle) {
                    mappedContentStyle = "quote";
                    isQuote = true;
                    console.log("[ai-chat] Auto-detected quote style from AI extraction");
                  } else if (parsed.is_quote) {
                    isQuote = true;
                  }
                }
              }
            }
          } catch (e) {
            console.error("[ai-chat] AI extraction failed, using raw sourceText:", e);
          }
        }

        // Build briefing notes with quality instructions
        let briefingNotes = buildQualityBriefing({
          niche,
          voice,
          topics,
          referenceSources,
          sourceUrl: sourceUrl || undefined,
          handle: ctx.instagram_handle || undefined,
        });

        // For "quote" style, pass user text as the literal headline
        if (isQuote && (extractedContent || sourceUrl)) {
          briefingNotes += `\nESTILO FRASE: O texto fornecido deve ser usado como headline literal do slide. O body fica vazio ou tem apenas atribuição/autor.`;
          if (extractedAuthor) {
            briefingNotes += ` Autor: ${extractedAuthor}`;
          }
        }

        // photo_overlay: instruct Gemini to generate only a strong, short headline
        if (gcVisualStyle === "photo_overlay") {
          briefingNotes += `\nMODO FOTO PESSOAL: A imagem de fundo será uma foto pessoal/profissional do usuário. Gere APENAS um headline forte e curto (máx 80 caracteres) — uma frase de impacto que ficará sobreposta na parte inferior da foto. NÃO gere body, bullets ou footer. O headline deve ser a única frase visível na imagem.`;
        }

        // Determine visual mode — prefer explicit from client, then infer
        let visualMode = generationParams.visualMode || "brand_guided";
        if (backgroundMode === "saved_template") {
          visualMode = generationParams.visualMode || "text_only";
        } else if (backgroundMode === "user_upload") {
          visualMode = "free";
          if (uploadedImageUrl) {
            briefingNotes += `. Imagem já fornecida pelo usuário: ${uploadedImageUrl}. Gerar apenas legenda e texto, sem gerar imagem de fundo.`;
          }
        }
        if (!resolvedBrandId) visualMode = "free";

        // Build trend title using AI-extracted content
        const trendTitle = isQuote && extractedContent
          ? extractedContent
          : sourceUrl
            ? "Conteúdo baseado em link"
            : extractedContent || "Conteúdo solicitado pelo usuário";

        console.log("[ai-chat] trendTitle:", trendTitle?.substring(0, 100), "| isQuote:", isQuote);

        const genBody: any = {
          trend: {
            title: trendTitle,
            description: extractedContent || sourceUrl || "",
            source_url: sourceUrl || null,
            theme: niche,
            keywords: topics,
            fullContent: articleContent || extractedContent || null,
          },
          contentType: mappedContentType,
          contentStyle: mappedContentStyle,
          brandId: resolvedBrandId,
          templateSetId: templateId || null,
          slideCount: slideCount || null,
          visualMode,
          tone: voice,
          targetAudience: niche,
          platform: "instagram",
          includeCta: true,
          manualBriefing: { notes: briefingNotes },
        };

        if (sourceUrl) genBody.sourceUrl = sourceUrl;

        console.log("[ai-chat] GERAR_CONTEUDO calling generate-content:", JSON.stringify({ contentType: mappedContentType, brandId: resolvedBrandId, contentStyle: mappedContentStyle, slideCount, backgroundMode, visualMode }));

        try {
          const genResp = await fetch(`${supabaseUrl}/functions/v1/generate-content`, {
            method: "POST",
            headers: {
              Authorization: authHeader,
              "Content-Type": "application/json",
              apikey: supabaseAnonKey,
            },
            body: JSON.stringify(genBody),
          });

          const genRespText = await genResp.text();
          console.log("[ai-chat] generate-content status:", genResp.status, "body:", genRespText.substring(0, 300));

          if (genResp.ok) {
            const genData = JSON.parse(genRespText);
            if (genData.success && genData.content) {
              let contentId = genData.content?.id || genData.id || null;
              if (!contentId) {
                contentId = await persistGeneratedContent({
                  generatedContent: genData.content,
                  fallbackTitle: sourceUrl ? "Conteúdo baseado em link" : "Conteúdo solicitado pelo usuário",
                  contentType: mappedContentType as "post" | "carousel" | "story" | "document" | "article",
                  brandId: resolvedBrandId,
                  templateSetId: templateId || null,
                  visualMode,
                  platform: gcPlatform || "instagram",
                });
              }

              if (!contentId) {
                replyOverride = "Tive um problema ao salvar o conteúdo gerado. Tente novamente.";
                break;
              }

              console.log("[ai-chat] generate-content result:", JSON.stringify({
                id: contentId,
                slidesCount: (genData.content?.slides || []).length,
                title: genData.content?.title,
              }));

              // Decide whether to run full image pipeline or insert pre-existing images
              const genSlides = genData.content?.slides || [];
              const skipPipeline = backgroundMode === "saved_template" || backgroundMode === "user_upload";

              if (skipPipeline && genSlides.length > 0 && resolvedBrandId) {
                // Insert pre-existing images directly (no AI generation needed)
                console.log("[ai-chat] Skipping image pipeline — using pre-existing background. Mode:", backgroundMode);
                
                let preExistingImageUrl: string | null = null;

                if (backgroundMode === "saved_template" && templateId) {
                  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
                  const svcTemplate = createClient(supabaseUrl, serviceKey);
                  const { data: template } = await svcTemplate
                    .from("brand_background_templates")
                    .select("background_images, id")
                    .eq("id", templateId)
                    .single();
                  
                  if (template?.background_images) {
                    const bgImgs = template.background_images as any;
                    if (Array.isArray(bgImgs) && bgImgs.length > 0) {
                      preExistingImageUrl = bgImgs[0]?.url || bgImgs[0];
                    } else if (typeof bgImgs === "object") {
                      preExistingImageUrl = bgImgs.cover || Object.values(bgImgs)[0] as string;
                    }
                  }
                  console.log("[ai-chat] Saved template image:", preExistingImageUrl?.substring(0, 80));
                } else if (backgroundMode === "user_upload" && uploadedImageUrl) {
                  preExistingImageUrl = uploadedImageUrl;
                  console.log("[ai-chat] User upload image:", preExistingImageUrl?.substring(0, 80));
                }

                if (preExistingImageUrl) {
                  // Create project/post/slides in DB then insert image_generations directly
                  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
                  const svc = createClient(supabaseUrl, serviceKey);

                  const { data: project } = await svc.from("projects").insert({
                    brand_id: resolvedBrandId,
                    name: `Chat – ${contentId.substring(0, 8)}`,
                  }).select("id").single();

                  if (project) {
                    const rawText = genSlides.map((s: any) => s.headline || s.body || s.title || "").filter(Boolean).join("\n");
                    const ctMapDb: Record<string, string> = { post: "educativo", carousel: "educativo", story: "curiosidade" };
                    const { data: post } = await svc.from("posts").insert({
                      project_id: project.id,
                      raw_post_text: rawText || "Conteúdo gerado via chat",
                      content_type: ctMapDb[mappedContentType] || "educativo",
                    }).select("id").single();

                    if (post) {
                      const slideInserts = genSlides.map((s: any, i: number) => ({
                        post_id: post.id,
                        slide_index: i,
                        slide_text: s.headline || s.body || s.title || s.slide_text || "",
                        layout_preset: "default",
                      }));

                      console.log(`[ai-chat] saved_template slide texts:`, JSON.stringify(slideInserts.map((s: any) => ({ idx: s.slide_index, text: s.slide_text?.substring(0, 60) }))));

                      const { data: dbSlides } = await svc
                        .from("slides")
                        .insert(slideInserts)
                        .select("id, slide_index")
                        .order("slide_index");

                      if (dbSlides?.length) {
                        // Store post_id in generation_metadata
                        await svc.from("generated_contents")
                          .update({ generation_metadata: { post_id: post.id, project_id: project.id } })
                          .eq("id", contentId);

                        // Insert image_generations with is_selected=true for each slide
                        const imageInserts = dbSlides.map((slide) => ({
                          slide_id: slide.id,
                          image_url: preExistingImageUrl,
                          thumb_url: preExistingImageUrl,
                          is_selected: true,
                          prompt_id: null,
                          model_used: backgroundMode === "saved_template" ? "saved_template" : "user_upload",
                          seed: `${backgroundMode}_${Date.now()}`,
                          width: 1080,
                          height: 1080,
                        }));

                        await svc.from("image_generations").insert(imageInserts);

                        // Update generated_contents with image URLs
                        const updatedSlides = genSlides.map((s: any) => ({
                          ...s,
                          image_url: preExistingImageUrl,
                          background_image_url: preExistingImageUrl,
                          previewImage: preExistingImageUrl,
                          image_stale: false,
                        }));
                        await svc.from("generated_contents").update({
                          slides: updatedSlides,
                          image_urls: [preExistingImageUrl],
                        }).eq("id", contentId);

                        console.log(`[ai-chat] Inserted ${dbSlides.length} pre-existing images for content ${contentId}`);

                        // Render composite images (text + background) and overwrite image_urls
                        const { data: gcForRender } = await svc.from("generated_contents")
                          .select("brand_snapshot, content_type")
                          .eq("id", contentId)
                          .single();

                        await renderCompositeAndUpdateContent({
                          svc,
                          supabaseUrl,
                          authHeader: authHeader!,
                          supabaseAnonKey,
                          contentId,
                          slides: updatedSlides,
                          brandSnapshot: gcForRender?.brand_snapshot,
                          contentType: gcForRender?.content_type || mappedContentType,
                          platform: gcPlatform || "instagram",
                          logPrefix: "[ai-chat]",
                          lovableApiKey,
                        });
                      }
                    }
                  }
                }

                replyOverride = "✅ Conteúdo gerado com o fundo selecionado! Confira abaixo 👇";
              } else if (!skipPipeline && resolvedBrandId && genSlides.length > 0) {
                await runStudioImagePipelineWithSoftTimeout({
                  supabaseUrl,
                  authHeader: authHeader!,
                  supabaseAnonKey,
                  contentId,
                  slides: genSlides,
                  brandId: resolvedBrandId,
                  contentType: mappedContentType,
                });

                replyOverride = "✅ Conteúdo gerado! Confira abaixo 👇";
              } else {
                replyOverride = "✅ Conteúdo gerado! Confira abaixo 👇";
              }

              actionResult = {
                content_id: contentId,
                content_type: mappedContentType,
                platform: gcPlatform || "instagram",
              };
            } else {
              console.error("[ai-chat] generate-content non-success:", genRespText.substring(0, 500));
              replyOverride = `Tive um problema ao gerar o conteúdo. Erro: ${genData.error || genData.message || "resposta inesperada"}`;
            }
          } else {
            let errorMsg = "desconhecido";
            try {
              const errData = JSON.parse(genRespText);
              errorMsg = errData.error || errData.message || genRespText.substring(0, 200);
            } catch { errorMsg = genRespText.substring(0, 200); }
            console.error("[ai-chat] generate-content failed:", genResp.status, genRespText.substring(0, 500));
            replyOverride = `Tive um problema ao gerar o conteúdo (${genResp.status}). Erro: ${errorMsg}`;
          }
        } catch (genErr: any) {
          console.error("[ai-chat] GERAR_CONTEUDO error:", genErr?.message || genErr);
          replyOverride = `Erro ao chamar geração: ${genErr?.message || "erro desconhecido"}`;
        }

        break;
      }

      case "LINK_PARA_POST": {
        const detectedUrl = url || message.match(/https?:\/\/[^\s]+/)?.[0];
        replyOverride = detectedUrl
          ? `Li o link! 🔗 O que você quer criar com ele?\n\nEscolha uma opção:`
          : `Não encontrei um link na sua mensagem. Cole um link para eu analisar.`;
        if (detectedUrl) {
          quickReplies = ["📱 Post", "📚 Carrossel", "📸 Story"];
          actionResult = { detected_url: detectedUrl, awaiting_choice: true };
        }
        break;
      }

      case "GERAR_POST":
      case "GERAR_CARROSSEL":
      case "GERAR_STORY": {
        const contentTypeMap: Record<string, string> = {
          GERAR_POST: "post",
          GERAR_CARROSSEL: "carousel",
          GERAR_STORY: "story",
        };
        const contentType = contentTypeMap[detectedIntent];

        try {
          // Only use URL from current message — do NOT extract from history
          // History URLs cause topic contamination (M3 bug: generates about previous topic)
          let sourceUrl = url || message.match(/https?:\/\/[^\s]+/)?.[0];

          const normalize = (v?: string | null) => (v || "").toLowerCase().trim();
          const healthTerms = ["health", "saúde", "saude", "heart", "hospital", "clínica", "clinica", "cardio", "med"];
          const looksHealth = (v?: string | null) => healthTerms.some((k) => normalize(v).includes(k));

          const { data: brands } = await supabase
            .from("brands")
            .select("id, name, visual_tone, created_at")
            .eq("owner_user_id", userId)
            .order("created_at", { ascending: false });
          console.log("[ai-chat] GERAR_POST/CARROSSEL/STORY brands:", JSON.stringify(brands));

          const nicheNorm = normalize(userCtx?.business_niche || "");
          const handleNorm = normalize((userCtx?.instagram_handle || "").replace(/^@/, ""));
          const shouldFilterHealth = nicheNorm.length > 0 && !looksHealth(nicheNorm);
          const candidates = shouldFilterHealth
            ? (brands || []).filter((b: any) => !looksHealth(b.name) && !looksHealth(b.visual_tone))
            : (brands || []);
          const orderedCandidates = candidates.length ? candidates : (brands || []);
          const preferredBrand = handleNorm
            ? orderedCandidates.find((b: any) => normalize((b.name || "").replace(/^@/, "")) === handleNorm)
            : null;

          const brandId = preferredBrand?.id || orderedCandidates?.[0]?.id;
          console.log("marca escolhida:", preferredBrand?.name || orderedCandidates?.[0]?.name, brandId);

          const niche = userCtx?.business_niche || "geral";
          const voice = userCtx?.brand_voice || "natural e próximo";
          const topics = userCtx?.content_topics || [];
          const handle = userCtx?.instagram_handle || "";
          const referenceSources = (userCtx?.extra_context as any)?.reference_sources || [];

          const briefingNotes = buildQualityBriefing({
            niche,
            voice,
            topics,
            referenceSources,
            sourceUrl: sourceUrl || undefined,
            handle,
          });

          // ── Fetch article content from URL (BUG-004 fix) ──
          let articleContent = "";
          if (sourceUrl && sourceUrl.length > 10) {
            let resolvedUrl = sourceUrl;
            try {
              const urlObj = new URL(sourceUrl);
              if (urlObj.hostname.includes("google.com") && urlObj.pathname === "/url" && urlObj.searchParams.get("q")) {
                resolvedUrl = urlObj.searchParams.get("q")!;
              }
            } catch { }

            try {
              const articleResp = await fetch(resolvedUrl, {
                headers: { "User-Agent": "TrendPulse/1.0 (content-generator)" },
                redirect: "follow",
              });
              if (articleResp.ok) {
                const html = await articleResp.text();
                const textContent = html
                  .replace(/<script[\s\S]*?<\/script>/gi, "")
                  .replace(/<style[\s\S]*?<\/style>/gi, "")
                  .replace(/<nav[\s\S]*?<\/nav>/gi, "")
                  .replace(/<footer[\s\S]*?<\/footer>/gi, "")
                  .replace(/<header[\s\S]*?<\/header>/gi, "")
                  .replace(/<[^>]+>/g, " ")
                  .replace(/&nbsp;/g, " ")
                  .replace(/&amp;/g, "&")
                  .replace(/&lt;/g, "<")
                  .replace(/&gt;/g, ">")
                  .replace(/&quot;/g, '"')
                  .replace(/\s+/g, " ")
                  .trim();
                articleContent = textContent.substring(0, 4000);
                console.log("[ai-chat] GERAR_POST/CARROSSEL/STORY fetched article, length:", articleContent.length);
              }
            } catch (e: any) {
              console.error("[ai-chat] GERAR_POST/CARROSSEL/STORY article fetch error:", e?.message);
            }
          }

          const sourceText = sourceUrl
            ? `Crie conteúdo baseado neste link: ${sourceUrl}\n\nContexto do usuário: nicho ${niche}. Tom: ${voice}. Temas preferidos: ${topics.join(", ")}`
            : `${message}\n\nContexto do usuário: nicho ${niche}. Tom: ${voice}. Temas preferidos: ${topics.join(", ")}`;

          const genBody: any = {
            trend: {
              title: sourceUrl ? "Conteúdo baseado em link" : message.substring(0, 100),
              description: articleContent || sourceText,
              source_url: sourceUrl || null,
              theme: niche,
              keywords: topics,
              fullContent: articleContent || (sourceUrl ? null : sourceText),
            },
            contentType,
            visualMode: brandId ? "brand_guided" : "template_only",
            tone: voice,
            targetAudience: `Seguidores do nicho ${niche} no Instagram`,
            platform: "instagram",
            manualBriefing: { notes: briefingNotes },
          };
          if (brandId) genBody.brandId = brandId;
          if (sourceUrl) genBody.sourceUrl = sourceUrl;

          console.log("[ai-chat] Calling generate-content with:", JSON.stringify({ contentType, sourceUrl, brandId }));

          const genResp = await fetch(`${supabaseUrl}/functions/v1/generate-content`, {
            method: "POST",
            headers: {
              Authorization: authHeader,
              "Content-Type": "application/json",
              apikey: supabaseAnonKey,
            },
            body: JSON.stringify(genBody),
          });

          const genRespText = await genResp.text();
          console.log("[ai-chat] generate-content status:", genResp.status);

          if (genResp.ok) {
            const genData = JSON.parse(genRespText);
            if (genData.success && genData.content) {
              let contentId = genData.content?.id || genData.id || null;
              const title = genData.content.title || "Conteúdo gerado";
              const previewUrl = genData.content.slides?.[0]?.background_url || null;

              if (!contentId) {
                contentId = await persistGeneratedContent({
                  generatedContent: genData.content,
                  fallbackTitle: title,
                  contentType: contentType as "post" | "carousel" | "story",
                  brandId,
                  templateSetId: null,
                  visualMode: brandId ? "brand_guided" : "template_only",
                  platform: generationParams?.platform || "instagram",
                });
              }

              if (!contentId) {
                replyOverride = "Tive um problema ao salvar o conteúdo gerado. Tente novamente.";
                break;
              }

              const genSlides2 = genData.content?.slides || [];
              if (brandId && genSlides2.length > 0) {
                await runStudioImagePipelineWithSoftTimeout({
                  supabaseUrl,
                  authHeader: authHeader!,
                  supabaseAnonKey,
                  contentId,
                  slides: genSlides2,
                  brandId,
                  contentType,
                });
              }

              replyOverride = `✅ Conteúdo gerado com sucesso!\n\n**${title}**\n\nVeja o preview abaixo:`;
              actionResult = {
                content_id: contentId,
                content_type: contentType,
                preview_image_url: previewUrl,
                headline: title,
              };
            } else {
              console.error("[ai-chat] generate-content returned non-success:", genRespText.substring(0, 500));
              replyOverride = `Tive um problema ao gerar o conteúdo. Erro: ${JSON.parse(genRespText).error || "resposta inesperada"}`;
            }
          } else {
            let errorMsg = "desconhecido";
            try {
              const errData = JSON.parse(genRespText);
              errorMsg = errData.error || errData.message || genRespText.substring(0, 200);
            } catch { errorMsg = genRespText.substring(0, 200); }
            console.error("[ai-chat] generate-content failed:", genResp.status, genRespText.substring(0, 500));
            replyOverride = `Tive um problema ao gerar o conteúdo (${genResp.status}). Erro: ${errorMsg}`;
          }
        } catch (genErr: any) {
          console.error("[ai-chat] GERAR_* error:", genErr?.message || genErr);
          replyOverride = `Erro ao gerar conteúdo: ${genErr?.message || "erro desconhecido"}`;
        }

        if (!replyOverride) {
          replyOverride = `Estou com dificuldade para gerar o conteúdo agora. Pode tentar novamente em alguns segundos? 🙏`;
        }
        break;
      }

      case "AGENDAR": {
        replyOverride = `Para agendar um conteúdo, primeiro gere ou selecione o conteúdo que deseja agendar. Você pode dizer:\n\n• "Crie um post sobre [tema]"\n• "Crie um carrossel sobre [tema]"\n\nDepois de gerado, você poderá agendar diretamente no card de preview.`;
        break;
      }

      case "VER_CALENDARIO": {
        replyOverride = `📅 Para ver seu calendário de publicações, acesse a seção **Calendário** no menu lateral.\n\nLá você pode ver todos os conteúdos agendados e publicados.`;
        actionResult = { navigate_to: "/calendar" };
        break;
      }

      case "CONFIGURAR_CRON": {
        replyOverride = `⚙️ Para configurar a frequência de sugestões automáticas, me diga:\n\n• Quantos posts por semana? (ex: 3)\n• Em qual horário? (ex: 9h)\n• Quais dias? (ex: segunda, quarta e sexta)\n\nPosso ajustar a qualquer momento!`;
        break;
      }

      // ── EDITAR_TEXTO: edit text of the last active content based on user instruction ──
      case "EDITAR_TEXTO": {
        // Find the last content_id from history metadata
        let editContentId: string | null = generationParams?.contentId || null;

        if (!editContentId && history?.length) {
          // Search backwards through history for the most recent action_result with content_id
          for (let i = history.length - 1; i >= 0; i--) {
            const meta = history[i]?.metadata as any;
            const ar = meta?.action_result;
            if (ar?.content_id && ar.content_type !== "cron_config") {
              editContentId = ar.content_id;
              break;
            }
          }
        }

        // Also try to find from recent chat_messages in DB
        if (!editContentId) {
          const { data: recentMsgs } = await supabase
            .from("chat_messages")
            .select("metadata")
            .eq("user_id", userId)
            .eq("role", "assistant")
            .order("created_at", { ascending: false })
            .limit(10);

          for (const msg of recentMsgs || []) {
            const ar = (msg.metadata as any)?.action_result;
            if (ar?.content_id && ar.content_type !== "cron_config") {
              editContentId = ar.content_id;
              break;
            }
          }
        }

        if (!editContentId) {
          replyOverride = "Não encontrei um conteúdo recente para editar. Gere um conteúdo primeiro!";
          break;
        }

        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const svc = createClient(supabaseUrl, serviceKey);

        try {
          const { data: gc } = await svc
            .from("generated_contents")
            .select("generation_metadata, slides, brand_id, brand_snapshot, content_type, platform")
            .eq("id", editContentId)
            .single();

          if (!gc) {
            replyOverride = "Conteúdo não encontrado.";
            break;
          }

          const gcSlides = gc.slides as any[] || [];
          const oldHeadline = gcSlides[0]?.headline || "";
          const oldBody = gcSlides[0]?.body || "";
          const oldText = oldHeadline || oldBody || "";

          // Call AI to edit text based on user instruction
          const editPrompt = `Você é um editor de texto para Instagram. O usuário quer editar o texto abaixo.

TEXTO ATUAL:
Título: ${oldHeadline}
Corpo: ${oldBody}

INSTRUÇÃO DO USUÁRIO: "${message}"

Retorne APENAS o resultado em JSON: { "headline": "novo título", "body": "novo corpo" }
Mantenha o texto curto e impactante para Instagram. Se o usuário não especificar qual parte editar, aplique a edição no elemento mais relevante.`;

          const aiResp = await aiGatewayFetch({
              model: "google/gemini-2.5-flash",
              messages: [{ role: "user", content: editPrompt }],
            });

          if (!aiResp.ok) throw new Error(`AI edit failed: ${aiResp.status}`);
          const aiData = await aiResp.json();
          const rawResponse = aiData.choices?.[0]?.message?.content?.trim() || "";

          // Parse JSON from response
          const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
          let newHeadline = oldHeadline;
          let newBody = oldBody;

          if (jsonMatch) {
            try {
              const parsed = JSON.parse(jsonMatch[0]);
              newHeadline = parsed.headline || oldHeadline;
              newBody = parsed.body || oldBody;
            } catch {
              // If JSON parsing fails, use raw response as headline
              newHeadline = rawResponse;
            }
          }

          // Update slides jsonb
          const updatedSlides = [...gcSlides];
          if (updatedSlides[0]) {
            updatedSlides[0] = { ...updatedSlides[0], headline: newHeadline, body: newBody };
          }
          await svc.from("generated_contents").update({ slides: updatedSlides }).eq("id", editContentId);

          // Update slides table if post_id exists
          const postId = (gc.generation_metadata as any)?.post_id;
          if (postId) {
            const { data: slideRow } = await svc.from("slides")
              .select("id")
              .eq("post_id", postId)
              .eq("slide_index", 0)
              .single();
            if (slideRow) {
              await svc.from("slides").update({ slide_text: newHeadline }).eq("id", slideRow.id);
            }
          }

          // Re-render composite with new text
          const compositeResult = await renderCompositeAndUpdateContent({
            svc,
            supabaseUrl,
            authHeader: authHeader!,
            supabaseAnonKey,
            contentId: editContentId,
            slides: updatedSlides,
            brandSnapshot: gc.brand_snapshot,
            contentType: gc.content_type || "post",
            platform: (gc as any).platform || "instagram",
            logPrefix: "[ai-chat:edit]",
            lovableApiKey,
          });

          replyOverride = `✏️ Texto editado!\n\n**${newHeadline}**\n\nConfira abaixo 👇`;
          actionResult = {
            content_id: editContentId,
            content_type: gc.content_type,
            edited: true,
          };
          console.log("[ai-chat] EDITAR_TEXTO done for", editContentId);
        } catch (err: any) {
          console.error("[ai-chat] EDITAR_TEXTO error:", err?.message || err);
          replyOverride = "Erro ao editar o texto. Tente novamente.";
        }
        break;
      }

      // ── EDITAR_VISUAL: adjust overlay positions, font sizes, visual styling ──
      case "EDITAR_VISUAL": {
        let editVisualContentId: string | null = generationParams?.contentId || null;

        // Find the last content from history if not provided
        if (!editVisualContentId && history?.length) {
          for (let i = history.length - 1; i >= 0; i--) {
            const ar = (history[i]?.metadata as any)?.action_result;
            if (ar?.content_id && ar.content_type !== "cron_config") {
              editVisualContentId = ar.content_id;
              break;
            }
          }
        }

        if (!editVisualContentId) {
          replyOverride = "Não encontrei um conteúdo recente para ajustar. Gere um conteúdo primeiro!";
          break;
        }

        const svcVisual = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        try {
          const { data: gcVisual } = await svcVisual.from("generated_contents")
            .select("slides")
            .eq("id", editVisualContentId)
            .single();

          if (!gcVisual?.slides?.[0]) {
            replyOverride = "Conteúdo não encontrado.";
            break;
          }

          const currentSlide = (gcVisual.slides as any[])[0];
          const currentPositions = currentSlide.overlay_positions || {};
          const currentStyle = currentSlide.overlay_style || {};

          // Ask AI to interpret the visual edit command
          const visualEditPrompt = `O usuário quer ajustar o visual de um post. Analise o pedido e retorne APENAS JSON.

POSIÇÕES ATUAIS (x e y são porcentagem 0-100):
headline: ${JSON.stringify(currentPositions.headline || { x: 5, y: 25 })}
body: ${JSON.stringify(currentPositions.body || { x: 5, y: 50 })}

ESTILO ATUAL:
font_scale: ${currentStyle.font_scale ?? 1}
headline_font_size: ${currentStyle.headline_font_size || 52}
body_font_size: ${currentStyle.body_font_size || 26}
text_shadow_level: ${currentStyle.text_shadow_level ?? 2}

INSTRUÇÃO DO USUÁRIO: "${message}"

Retorne JSON com APENAS os campos que devem mudar:
{
  "overlay_positions": { "headline": { "x": num, "y": num }, "body": { "x": num, "y": num } },
  "overlay_style": { "font_scale": num, "headline_font_size": num, "body_font_size": num, "text_shadow_level": num }
}

Regras:
- "para cima" = diminui y, "para baixo" = aumenta y
- "para esquerda" = diminui x, "para direita" = aumenta x
- "aumenta fonte" = aumenta font_size ou font_scale
- "diminui fonte" = diminui font_size ou font_scale
- Mantenha x entre 3-50 e y entre 3-95
- Só inclua campos que precisam mudar`;

          const aiVisualResp = await aiGatewayFetch({ model: "google/gemini-2.5-flash", messages: [{ role: "user", content: visualEditPrompt }] });

          if (!aiVisualResp.ok) throw new Error("AI visual edit failed");
          const aiVisualData = await aiVisualResp.json();
          const rawVisual = aiVisualData.choices?.[0]?.message?.content?.trim() || "";
          const jsonVisual = rawVisual.match(/\{[\s\S]*\}/);

          if (jsonVisual) {
            const changes = JSON.parse(jsonVisual[0]);
            const updatedSlides = [...(gcVisual.slides as any[])];

            // Merge position changes
            if (changes.overlay_positions) {
              updatedSlides[0] = {
                ...updatedSlides[0],
                overlay_positions: { ...currentPositions, ...changes.overlay_positions },
              };
            }

            // Merge style changes
            if (changes.overlay_style) {
              updatedSlides[0] = {
                ...updatedSlides[0],
                overlay_style: { ...currentStyle, ...changes.overlay_style },
              };
            }

            await svcVisual.from("generated_contents").update({ slides: updatedSlides }).eq("id", editVisualContentId);
            replyOverride = "✨ Visual ajustado! Confira o resultado acima.";
            actionResult = { content_id: editVisualContentId, content_type: "post", edited: true };
          } else {
            replyOverride = "Não entendi o ajuste visual. Tente algo como: \"move o título para cima\", \"aumenta a fonte\" ou \"texto mais à esquerda\".";
          }
        } catch (err: any) {
          console.error("[ai-chat] EDITAR_VISUAL error:", err?.message || err);
          replyOverride = "Erro ao ajustar o visual. Tente novamente.";
        }
        break;
      }

      // ── ADAPTAR_PLATAFORMA: clone content for a different platform/format ──
      case "ADAPTAR_PLATAFORMA": {
        let adaptContentId: string | null = generationParams?.contentId || null;

        if (!adaptContentId && history?.length) {
          for (let i = history.length - 1; i >= 0; i--) {
            const ar = (history[i]?.metadata as any)?.action_result;
            if (ar?.content_id && ar.content_type !== "cron_config") {
              adaptContentId = ar.content_id;
              break;
            }
          }
        }

        if (!adaptContentId) {
          replyOverride = "Não encontrei um conteúdo para adaptar. Gere um conteúdo primeiro!";
          break;
        }

        const svcAdapt = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        try {
          const { data: original } = await svcAdapt.from("generated_contents")
            .select("*")
            .eq("id", adaptContentId)
            .single();

          if (!original) { replyOverride = "Conteúdo original não encontrado."; break; }

          // Detect target platform/format from user message
          const msgLower = message.toLowerCase();
          let targetPlatform = original.platform || "instagram";
          let targetType = original.content_type || "post";

          if (msgLower.includes("linkedin")) targetPlatform = "linkedin";
          else if (msgLower.includes("instagram")) targetPlatform = "instagram";

          if (msgLower.includes("story") || msgLower.includes("stories")) targetType = "story";
          else if (msgLower.includes("carrossel") || msgLower.includes("carousel")) targetType = "carousel";
          else if (msgLower.includes("post")) targetType = "post";
          else if (msgLower.includes("document") || msgLower.includes("documento")) targetType = "document";

          // Call generate-content with the original source but new platform/format
          const adaptResp = await fetch(`${supabaseUrl}/functions/v1/generate-content`, {
            method: "POST",
            headers: { Authorization: authHeader!, "Content-Type": "application/json", apikey: supabaseAnonKey },
            body: JSON.stringify({
              trend: {
                title: original.title,
                description: original.caption?.substring(0, 500) || "",
                theme: (original.brand_snapshot as any)?.visual_tone || "geral",
                keywords: original.hashtags || [],
                fullContent: original.caption || "",
              },
              contentType: targetType,
              contentStyle: "news",
              brandId: original.brand_id,
              platform: targetPlatform,
              slideCount: targetType === "carousel" || targetType === "document" ? 5 : 1,
              includeCta: false,
            }),
          });

          if (adaptResp.ok) {
            const adaptData = await adaptResp.json();
            if (adaptData.success && adaptData.content) {
              // Save as new content
              const { data: session } = await svcAdapt.auth.getUser(authHeader!.replace("Bearer ", ""));
              const newUserId = session?.user?.id || original.user_id;

              const { data: saved } = await svcAdapt.from("generated_contents").insert({
                user_id: newUserId,
                content_type: targetType,
                platform: targetPlatform,
                title: adaptData.content.title,
                caption: adaptData.content.caption,
                hashtags: adaptData.content.hashtags,
                slides: adaptData.content.slides,
                status: "draft",
                brand_id: original.brand_id,
                brand_snapshot: adaptData.content.brandSnapshot || original.brand_snapshot,
                visual_mode: original.visual_mode,
                source_summary: original.source_summary,
                key_insights: original.key_insights,
              }).select("id").single();

              if (saved) {
                const platformLabel = targetPlatform === "linkedin" ? "LinkedIn" : "Instagram";
                const typeLabel = targetType === "carousel" ? "Carrossel" : targetType === "story" ? "Story" : targetType === "document" ? "Documento" : "Post";
                replyOverride = `✅ Conteúdo adaptado para ${platformLabel} (${typeLabel})! Confira abaixo:`;
                actionResult = { content_id: saved.id, content_type: targetType, platform: targetPlatform };
              }
            }
          }

          if (!replyOverride) {
            replyOverride = "Não consegui adaptar o conteúdo. Tente especificar a plataforma: \"adapta para LinkedIn\" ou \"faz versão story\".";
          }
        } catch (err: any) {
          console.error("[ai-chat] ADAPTAR_PLATAFORMA error:", err?.message || err);
          replyOverride = "Erro ao adaptar o conteúdo. Tente novamente.";
        }
        break;
      }

      // ── SUGERIR_CONTEUDO: suggest content ideas based on niche + trends ──
      case "SUGERIR_CONTEUDO": {
        try {
          const niche = (userCtx as any)?.business_niche || "geral";
          const topics = (userCtx as any)?.content_topics || [];
          const voice = (userCtx as any)?.brand_voice || "profissional";
          const svcSuggest = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

          // Fetch recent trends — if none exist, trigger scrape-trends first
          let trendContext = "";
          try {
            let { data: trends } = await svcSuggest
              .from("trends")
              .select("title, description, relevance_score, theme, source_url")
              .eq("user_id", userId)
              .eq("is_active", true)
              .order("relevance_score", { ascending: false })
              .limit(10);

            // No trends? Try to fetch fresh ones via scrape-trends
            if (!trends?.length) {
              console.log("[SUGERIR_CONTEUDO] No trends found, calling scrape-trends...");
              try {
                await fetch(`${supabaseUrl}/functions/v1/scrape-trends`, {
                  method: "POST",
                  headers: { Authorization: authHeader!, "Content-Type": "application/json", apikey: supabaseAnonKey },
                  body: JSON.stringify({}),
                });
                // Re-fetch after scraping
                const { data: freshTrends } = await svcSuggest
                  .from("trends")
                  .select("title, description, relevance_score, theme, source_url")
                  .eq("user_id", userId)
                  .eq("is_active", true)
                  .order("relevance_score", { ascending: false })
                  .limit(10);
                trends = freshTrends;
              } catch (scrapeErr: any) {
                console.warn("[SUGERIR_CONTEUDO] scrape-trends failed:", scrapeErr?.message);
              }
            }

            if (trends?.length) {
              trendContext = `\n\nTENDÊNCIAS REAIS DO NICHO (use como base OBRIGATÓRIA):\n${trends.map((t: any, i: number) => `${i + 1}. "${t.title}" (relevância: ${t.relevance_score}/100) — ${t.description?.substring(0, 100)}${t.source_url ? ` [${t.source_url}]` : ""}`).join("\n")}`;
            }
          } catch { /* trends table may not have data */ }

          // Fetch best performing content for time analysis
          let bestTimeContext = "";
          try {
            const { data: published } = await svcSuggest
              .from("generated_contents")
              .select("published_at, content_type, platform")
              .eq("user_id", userId)
              .eq("status", "published")
              .not("published_at", "is", null)
              .order("published_at", { ascending: false })
              .limit(20);

            if (published?.length && published.length >= 3) {
              const hourCounts: Record<number, number> = {};
              const dayCounts: Record<number, number> = {};
              for (const p of published) {
                const d = new Date(p.published_at);
                const hour = d.getHours();
                const day = d.getDay();
                hourCounts[hour] = (hourCounts[hour] || 0) + 1;
                dayCounts[day] = (dayCounts[day] || 0) + 1;
              }
              const topHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];
              const topDay = Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0];
              const dayNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
              if (topHour && topDay) {
                bestTimeContext = `\n\nMELHOR HORÁRIO (baseado em ${published.length} publicações): ${dayNames[Number(topDay[0])]} às ${topHour[0]}h`;
              }
            }
          } catch { /* metrics may not exist */ }

          // Fetch recent generated content titles to avoid duplication
          let recentContentContext = "";
          try {
            const { data: recentContents } = await svcSuggest
              .from("generated_contents")
              .select("title")
              .eq("user_id", userId)
              .order("created_at", { ascending: false })
              .limit(20);
            if (recentContents?.length) {
              const recentTitles = recentContents.map((c: any) => c.title);
              recentContentContext = `\n\nCONTEÚDOS JÁ CRIADOS (NÃO repita esses temas, NÃO sugira variações deles):\n${recentTitles.map((t: string, i: number) => `${i + 1}. ${t}`).join("\n")}`;
            }
          } catch { /* ignore */ }

          // Build prompt — works with or without niche (uses "conteúdo profissional" as fallback)
          const nicheLabel = niche && niche !== "geral" ? niche : "conteúdo profissional para redes sociais";
          const suggestPrompt = `Você é um estrategista de conteúdo. O usuário publica sobre "${nicheLabel}".

Tom: ${voice}
${topics.length > 0 ? `Temas: ${topics.join(", ")}` : ""}
${trendContext}${bestTimeContext}${recentContentContext}

Sugira 5 ideias de conteúdo relevantes e atuais. Para cada uma:
- title: título assertivo e específico (máx 80 chars, NÃO genérico)
- description: por que funciona (1 frase)
- format: post ou carousel
- platform: instagram ou linkedin

REGRAS CRÍTICAS:
1. ${trendContext ? "Pelo menos 2 ideias devem ser baseadas nas TENDÊNCIAS listadas." : "Baseie nas tendências atuais do nicho."}
2. NUNCA sugira conteúdo sobre temas já listados em "CONTEÚDOS JÁ CRIADOS". Cada sugestão deve ser sobre um assunto COMPLETAMENTE DIFERENTE.
3. Evite variações do mesmo tema (ex: se já existe "Sonhar Grande", não sugira "A Importância de Sonhar Grande").

Responda APENAS em JSON:
{"suggestions":[{"title":"...","description":"...","format":"post","platform":"instagram"},...]}`;

          const suggestResp = await aiGatewayFetch({ model: "google/gemini-2.5-flash", messages: [{ role: "user", content: suggestPrompt }] });

          if (suggestResp.ok) {
            const suggestData = await suggestResp.json();
            const raw = suggestData.choices?.[0]?.message?.content?.trim() || "";
            const jsonMatch = raw.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              try {
                const parsed = JSON.parse(jsonMatch[0]);
                const suggestions = parsed.suggestions || [];
                if (suggestions.length > 0) {
                  // Return both structured data (for wizard) and formatted text (for chat)
                  const formatted = suggestions.map((s: any, i: number) =>
                    `${i + 1}. **${s.title}**\n   _${s.format} para ${s.platform} — ${s.description}_`
                  ).join("\n\n");
                  replyOverride = `📋 **Sugestões de conteúdo:**\n\n${formatted}\n\n_Clique em uma para criar, ou peça "criar série" para gerar todas!_`;
                  actionResult = { suggestions };
                  quickReplies = suggestions.map((s: any) => ({ label: `📝 ${s.title}`, value: s.title }));
                }
              } catch { /* JSON parse failed — fall back to text */ }
            }
            // Fallback: return raw text if JSON parse failed
            if (!replyOverride && raw) {
              replyOverride = `📋 **Sugestões de conteúdo:**\n\n${raw}`;
            }
          }

          if (!replyOverride) {
            replyOverride = "Não consegui gerar sugestões agora. Tente novamente em alguns instantes.";
          }
        } catch (err: any) {
          console.error("[ai-chat] SUGERIR_CONTEUDO error:", err?.message || err);
          replyOverride = "Erro ao gerar sugestões. Tente novamente.";
        }
        break;
      }

      // ── CRIAR_SERIE: generate multiple contents for the week ──
      case "CRIAR_SERIE": {
        try {
          const niche = (userCtx as any)?.business_niche || "geral";
          const topics = (userCtx as any)?.content_topics || [];
          const voice = (userCtx as any)?.brand_voice || "profissional";
          const svcSerie = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

          // Resolve brand
          const { data: userBrands } = await svcSerie.from("brands").select("id, name").eq("owner_user_id", userId).order("created_at", { ascending: false }).limit(1);
          const brandId = userBrands?.[0]?.id || null;

          // Generate 5 content ideas via AI
          const seriesPrompt = `Gere EXATAMENTE 5 temas de conteúdo para o nicho "${niche}" para publicar na próxima semana.
Tom: ${voice}. Temas: ${topics.join(", ") || "geral"}.

Para cada, retorne JSON: { "items": [{ "title": "tema curto", "style": "news|tip|educational", "day": "segunda|terca|quarta|quinta|sexta" }] }

Varie os estilos. Retorne APENAS o JSON.`;

          const aiResp = await aiGatewayFetch({ model: "google/gemini-2.5-flash", messages: [{ role: "user", content: seriesPrompt }] });

          if (!aiResp.ok) throw new Error("AI failed");
          const aiData = await aiResp.json();
          const rawContent = aiData.choices?.[0]?.message?.content?.trim() || "";
          const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
          if (!jsonMatch) throw new Error("No JSON in response");

          const parsed = JSON.parse(jsonMatch[0]);
          const items = parsed.items || [];
          if (items.length === 0) throw new Error("No items generated");

          // Generate each content
          const dayMap: Record<string, number> = { segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5 };
          const created: string[] = [];
          let errors = 0;

          for (const item of items.slice(0, 5)) {
            try {
              const genResp = await fetch(`${supabaseUrl}/functions/v1/generate-content`, {
                method: "POST",
                headers: { Authorization: authHeader!, "Content-Type": "application/json", apikey: supabaseAnonKey },
                body: JSON.stringify({
                  trend: { title: item.title, description: item.title, theme: niche, keywords: topics },
                  contentType: "post",
                  contentStyle: item.style || "news",
                  brandId,
                  platform: "instagram",
                  visualMode: brandId ? "brand_guided" : "free",
                  includeCta: false,
                }),
              });

              if (genResp.ok) {
                const genData = await genResp.json();
                if (genData.success && genData.content) {
                  // Calculate schedule date (next weekday)
                  const now = new Date();
                  const targetDay = dayMap[item.day] || (created.length + 1);
                  const currentDay = now.getDay();
                  let daysAhead = targetDay - currentDay;
                  if (daysAhead <= 0) daysAhead += 7;
                  const scheduleDate = new Date(now);
                  scheduleDate.setDate(now.getDate() + daysAhead);
                  scheduleDate.setHours(9, 0, 0, 0); // 9am default

                  const { data: saved } = await svcSerie.from("generated_contents").insert({
                    user_id: userId,
                    content_type: "post",
                    platform: "instagram",
                    title: genData.content.title,
                    caption: genData.content.caption,
                    hashtags: genData.content.hashtags,
                    slides: genData.content.slides,
                    status: "draft",
                    brand_id: brandId,
                    brand_snapshot: genData.content.brandSnapshot,
                    visual_mode: genData.content.visualMode,
                    scheduled_at: scheduleDate.toISOString(),
                  }).select("id").single();

                  if (saved) created.push(genData.content.title);
                }
              }
            } catch {
              errors++;
            }
          }

          if (created.length > 0) {
            replyOverride = `🎉 **Série criada! ${created.length} conteúdos gerados:**\n\n${created.map((t, i) => `${i + 1}. ${t}`).join("\n")}\n\n${errors > 0 ? `(${errors} falharam)\n` : ""}Os conteúdos estão como rascunho com agendamento sugerido. Vá ao **Calendário** para revisar e aprovar!`;
            quickReplies = ["📅 Ver calendário", "✨ Gerar imagens para todos"];
          } else {
            replyOverride = "Não consegui gerar a série. Tente novamente.";
          }
        } catch (err: any) {
          console.error("[ai-chat] CRIAR_SERIE error:", err?.message || err);
          replyOverride = "Erro ao criar série. Tente novamente.";
        }
        break;
      }

      case "REGENERAR_TEXTO": {
        if (!generationParams?.contentId) {
          replyOverride = "Não encontrei o conteúdo para regenerar o texto.";
          break;
        }
        const targetContentId = generationParams.contentId;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const svc = createClient(supabaseUrl, serviceKey);

        try {
          // Fetch existing content
          const { data: gc } = await svc
            .from("generated_contents")
            .select("generation_metadata, slides, brand_id, content_type")
            .eq("id", targetContentId)
            .single();

          if (!gc) {
            replyOverride = "Conteúdo não encontrado.";
            break;
          }

          const postId = (gc.generation_metadata as any)?.post_id;
          const gcSlides = gc.slides as any[] || [];
          const oldText = gcSlides[0]?.headline || gcSlides[0]?.body || "";

          // Load user context for tone
          const { data: ctx } = await svc
            .from("ai_user_context")
            .select("business_niche, brand_voice, content_topics")
            .eq("user_id", userId)
            .maybeSingle();

          const niche = ctx?.business_niche || "geral";
          const voice = ctx?.brand_voice || "natural e próximo";

          // Call AI to generate new text
          const textPrompt = `Reescreva o texto abaixo para uma postagem de Instagram no nicho "${niche}", tom "${voice}". Mantenha a mesma ideia central mas use palavras e estrutura diferentes. Retorne APENAS o novo texto, sem explicações.\n\nTexto atual:\n${oldText}`;

          const aiResp = await aiGatewayFetch({
              model: "google/gemini-2.5-flash",
              messages: [{ role: "user", content: textPrompt }],
            });

          if (!aiResp.ok) throw new Error(`AI failed: ${aiResp.status}`);
          const aiData = await aiResp.json();
          const newText = aiData.choices?.[0]?.message?.content?.trim() || oldText;

          // Update slide_text in slides table
          if (postId) {
            const { data: slideRow } = await svc
              .from("slides")
              .select("id")
              .eq("post_id", postId)
              .eq("slide_index", 0)
              .single();
            if (slideRow) {
              await svc.from("slides").update({ slide_text: newText }).eq("id", slideRow.id);
            }
          }

          // Update slides jsonb in generated_contents
          const updatedSlides = [...gcSlides];
          if (updatedSlides[0]) {
            updatedSlides[0] = { ...updatedSlides[0], headline: newText, body: newText };
          }
          await svc.from("generated_contents").update({ slides: updatedSlides }).eq("id", targetContentId);

          replyOverride = "✏️ Texto atualizado! Confira abaixo 👇";
          actionResult = { content_id: targetContentId, content_type: gc.content_type as any, new_slide_text: newText } as any;
          console.log("[ai-chat] REGENERAR_TEXTO done for", targetContentId, "new text:", newText.substring(0, 60));
        } catch (err: any) {
          console.error("[ai-chat] REGENERAR_TEXTO error:", err?.message || err);
          replyOverride = "Erro ao regenerar o texto. Tente novamente.";
        }
        break;
      }

      // ── REGENERAR_IMAGEM: regenerate only the image for an existing content ──
      // ══════ NEW 3-PHASE INTENTS ══════

      case "INICIAR_GERACAO": {
        const t0Init = Date.now();
        console.log('[INICIAR_GERACAO] start');
        if (!generationParams) {
          replyOverride = "Parâmetros de geração não encontrados.";
          break;
        }
        const { contentType, contentStyle, slideCount, backgroundMode, templateId, sourceUrl, sourceText, uploadedImageUrl, platform, visualStyle } = generationParams;
        const effectiveVisualStyle = visualStyle || "ai_background";

        // Log user input for debugging — helps validate if generated content matches what was requested
        console.log(`[INICIAR_GERACAO] USER INPUT: sourceUrl=${sourceUrl || "(none)"}, sourceText="${(sourceText || "").substring(0, 200)}", contentType=${contentType}, platform=${platform}, brandId=${generationParams.brandId || "(auto)"}`);

        // Validate source content — frontend now sends extracted topic (clean)
        const hasSourceUrl = sourceUrl && sourceUrl.length > 10;
        const hasSourceText = sourceText && sourceText.trim().length >= 5;
        if (!hasSourceUrl && !hasSourceText) {
          replyOverride = "Preciso de um tema, link ou texto para gerar o conteúdo. Sobre o que você quer criar?";
          break;
        }

        // Resolve brand (same logic as GERAR_CONTEUDO — match by handle, filter health terms)
        const serviceKeyInit = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const svcInit = createClient(supabaseUrl, serviceKeyInit);

        // Resolve brand with priority: 1) explicit from wizard, 2) match instagram_handle (filtered), 3) most recent (filtered)
        const { data: allBrandsInit } = await svcInit.from("brands").select("id, name, visual_tone, created_at").eq("owner_user_id", userId).order("created_at", { ascending: false });

        // "none" = user explicitly chose "Sem marca"
        const noBrandRequested = generationParams.brandId === "none";
        const explicitBrandInit = (generationParams.brandId && !noBrandRequested)
          ? allBrandsInit?.find((b: any) => b.id === generationParams.brandId)
          : null;

        // Filter out health brands when user's niche is not health (same logic as GERAR_CONTEUDO)
        const normalizeInit = (v?: string | null) => (v || "").toLowerCase().trim();
        const healthTermsInit = ["health", "saúde", "saude", "heart", "hospital", "clínica", "clinica", "cardio", "med"];
        const looksHealthInit = (v?: string | null) => healthTermsInit.some((k) => normalizeInit(v).includes(k));
        const nicheInit = normalizeInit((userCtx as any)?.business_niche);
        const shouldFilterHealthInit = nicheInit.length > 0 && !looksHealthInit(nicheInit);
        const filteredBrandsInit = shouldFilterHealthInit
          ? (allBrandsInit || []).filter((b: any) => !looksHealthInit(b.name) && !looksHealthInit(b.visual_tone))
          : (allBrandsInit || []);
        const candidateBrandsInit = filteredBrandsInit.length ? filteredBrandsInit : (allBrandsInit || []);

        const handleRaw = (userCtx?.instagram_handle || "").replace(/^@/, "").toLowerCase().trim();
        const handleBrandInit = handleRaw
          ? candidateBrandsInit.find((b: any) => {
              const bn = (b.name || "").toLowerCase().trim();
              return bn === handleRaw || bn.includes(handleRaw) || handleRaw.includes(bn);
            })
          : null;

        let resolvedBrandIdInit = noBrandRequested
          ? null  // User explicitly chose "Sem marca"
          : (explicitBrandInit?.id || handleBrandInit?.id || candidateBrandsInit[0]?.id || null);
        console.log('[INICIAR_GERACAO] marcas:', JSON.stringify(allBrandsInit?.map((b: any) => ({ id: b.id?.substring(0,8), name: b.name, tone: b.visual_tone, created: b.created_at?.substring(0,10) }))));
        console.log('[INICIAR_GERACAO] filtradas:', JSON.stringify(candidateBrandsInit.map((b: any) => ({ id: b.id?.substring(0,8), name: b.name }))), 'usando:', resolvedBrandIdInit?.substring(0,8), candidateBrandsInit.find((b: any) => b.id === resolvedBrandIdInit)?.name);

        // Load full brand data for snapshot
        let brandSnapshotInit: Record<string, any> | null = null;
        let defaultTemplateSetIdInit: string | null = null;
        if (resolvedBrandIdInit) {
          const { data: brandFull } = await svcInit.from("brands").select("name, palette, fonts, visual_tone, do_rules, dont_rules, logo_url, default_template_set_id, render_mode, style_guide, creation_mode").eq("id", resolvedBrandIdInit).single();
          if (brandFull) {
            brandSnapshotInit = {
              brand_id: resolvedBrandIdInit,
              name: brandFull.name,
              palette: brandFull.palette,
              fonts: brandFull.fonts,
              visual_tone: brandFull.visual_tone,
              do_rules: brandFull.do_rules,
              dont_rules: brandFull.dont_rules,
              logo_url: brandFull.logo_url,
              render_mode: brandFull.render_mode,
              style_guide: brandFull.style_guide,
              creation_mode: brandFull.creation_mode || "style_copy",
            };
            defaultTemplateSetIdInit = brandFull.default_template_set_id || null;
            console.log('[INICIAR_GERACAO] brand snapshot loaded, palette:', JSON.stringify(brandFull.palette), 'template_set:', defaultTemplateSetIdInit);
          }
        }

        // Map content style
        const styleMapInit: Record<string, string> = {
          noticia: "news", news: "news", frase: "quote", quote: "quote",
          dica: "tip", tip: "tip", educativo: "educational", educational: "educational",
          curiosidade: "curiosity", curiosity: "curiosity",
        };
        const mappedStyleInit = styleMapInit[(contentStyle || "").toLowerCase()] || contentStyle || null;

        // ── FETCH ARTICLE CONTENT (if URL provided) ──
        let articleContent = "";
        // Resolve Google redirect URLs (google.com/url?q=REAL_URL)
        let resolvedSourceUrl = sourceUrl;
        if (hasSourceUrl) {
          try {
            const urlObj = new URL(sourceUrl);
            if (urlObj.hostname.includes("google.com") && urlObj.pathname === "/url" && urlObj.searchParams.get("q")) {
              resolvedSourceUrl = urlObj.searchParams.get("q")!;
              console.log(`[INICIAR_GERACAO] resolved Google redirect: ${resolvedSourceUrl}`);
            }
          } catch { /* not a valid URL, continue as-is */ }
        }
        if (hasSourceUrl) {
          try {
            console.log('[INICIAR_GERACAO] fetching article from URL:', resolvedSourceUrl);
            const articleResp = await fetch(resolvedSourceUrl, {
              headers: { "User-Agent": "TrendPulse/1.0 (content-generator)" },
              redirect: "follow",
            });
            if (articleResp.ok) {
              const html = await articleResp.text();
              // Extract text from HTML — strip tags, scripts, styles
              const textContent = html
                .replace(/<script[\s\S]*?<\/script>/gi, "")
                .replace(/<style[\s\S]*?<\/style>/gi, "")
                .replace(/<nav[\s\S]*?<\/nav>/gi, "")
                .replace(/<footer[\s\S]*?<\/footer>/gi, "")
                .replace(/<header[\s\S]*?<\/header>/gi, "")
                .replace(/<[^>]+>/g, " ")
                .replace(/&nbsp;/g, " ")
                .replace(/&amp;/g, "&")
                .replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">")
                .replace(/&quot;/g, '"')
                .replace(/\s+/g, " ")
                .trim();
              articleContent = textContent.substring(0, 4000);
              console.log(`[INICIAR_GERACAO] article fetched: ${articleContent.length} chars`);
            }
          } catch (e: any) {
            console.error("[INICIAR_GERACAO] article fetch error:", e?.message);
          }
        }

        // AI extraction — use article content if available, otherwise sourceText
        let extractedContentInit = sourceText || "";
        let isQuoteInit = mappedStyleInit === "quote";
        const contentForExtraction = articleContent || sourceText || "";
        // Only run AI extraction if we have substantial content (article or long text).
        // Short topics (<100 chars without URL) should be used directly — extracting
        // "key insights" from a topic title causes the AI to invent unrelated content.
        const shouldExtract = articleContent.length > 100 || contentForExtraction.length > 200;
        if (shouldExtract && contentForExtraction.length > 5) {
          try {
            const extractResp = await aiGatewayFetch({
                model: "google/gemini-2.5-flash-lite",
                messages: [{ role: "user", content: `Extraia os pontos-chave deste conteúdo para criar um post de redes sociais.

CONTEÚDO:
${contentForExtraction.substring(0, 3000)}

Responda em JSON:
{
  "title": "título assertivo com dado específico (NÃO use pergunta genérica)",
  "key_insights": ["insight 1 com dado", "insight 2 com dado", "insight 3"],
  "data_points": ["número ou estatística relevante 1", "número 2"],
  "main_argument": "argumento principal do artigo em 1-2 frases",
  "topic": "tema em 2-5 palavras",
  "is_quote": false,
  "author": null
}

REGRAS:
- O título deve ser uma AFIRMAÇÃO com dados, NÃO uma pergunta genérica
- Extraia NÚMEROS, NOMES, DATAS específicos do conteúdo
- Os insights devem ser concretos e acionáveis
- Responda APENAS JSON` }],
              });
            if (extractResp.ok) {
              const extractData = await extractResp.json();
              const raw = extractData.choices?.[0]?.message?.content || "";
              const jsonMatch = raw.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                // Detect if input is a quote — preserve original text
                const inputLooksLikeQuote = parsed.is_quote || /^(seguinte\s+)?frase\b/i.test(sourceText || "");
                if (inputLooksLikeQuote) {
                  // For quotes, use the original sourceText (cleaned), NOT the AI's title
                  const cleanQuote = (sourceText || "")
                    .replace(/^(seguinte\s+)?frase\s*:?\s*/i, "")
                    .replace(/^["'"'«]+|["'"'»]+$/g, "")
                    .trim();
                  extractedContentInit = cleanQuote || sourceText || "";
                  isQuoteInit = true;
                  console.log('[INICIAR_GERACAO] Detected quote, using original text:', extractedContentInit);
                } else {
                  extractedContentInit = parsed.title || parsed.content || sourceText;
                  if (parsed.is_quote && !mappedStyleInit) isQuoteInit = true;
                }
              }
            }
          } catch (e) { console.error("[ai-chat:INICIAR] extraction error:", e); }
        }
        console.log('[INICIAR_GERACAO] AI extraction done', Date.now()-t0Init, 'ms, articleContent:', articleContent.length, 'chars');

        const ctxInit = userCtx || {} as any;
        const nicheInitVal = ctxInit.business_niche || "geral";
        const voiceInit = ctxInit.brand_voice || "natural";
        const topicsInit = ctxInit.content_topics || [];
        let briefingInit = buildQualityBriefing({ niche: nicheInitVal, voice: voiceInit, topics: topicsInit, sourceUrl: sourceUrl || undefined });

        // photo_overlay: instruct Gemini to generate only a strong, short headline
        if (effectiveVisualStyle === "photo_overlay") {
          briefingInit += `\nMODO FOTO PESSOAL: A imagem de fundo será uma foto pessoal/profissional do usuário. Gere APENAS um headline forte e curto (máx 80 caracteres) — uma frase de impacto que ficará sobreposta na parte inferior da foto. NÃO gere body, bullets ou footer. O headline deve ser a única frase visível na imagem.`;
        }

        // Fetch user's secondary languages for bilingual captions
        let userSecondaryLanguages: string[] = [];
        try {
          const { data: profileData } = await svcInit.from("profiles").select("secondary_languages").eq("user_id", userId).single();
          userSecondaryLanguages = profileData?.secondary_languages || [];
        } catch { /* ignore */ }

        // Fetch recent content titles to prevent duplicate generation
        let recentTitlesInit: string[] = [];
        try {
          const { data: recentInit } = await svcInit
            .from("generated_contents")
            .select("title")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(15);
          if (recentInit?.length) {
            recentTitlesInit = recentInit.map((c: any) => c.title);
          }
        } catch { /* ignore */ }

        // If detected as quote, force contentStyle to "quote"
        const effectiveStyleInit = isQuoteInit ? "quote" : (mappedStyleInit || "news");

        const ctMapInit: Record<string, string> = { post: "post", carousel: "carousel", story: "story", document: "document", article: "article" };
        const mappedCTInit = ctMapInit[contentType] || "post";

        // Call generate-content with extended timeout for inference.sh
        console.log(`[INICIAR_GERACAO] calling generate-content: title="${(extractedContentInit || "").substring(0, 100)}", theme="${nicheInitVal}", articleContent=${articleContent.length}chars, brand=${resolvedBrandIdInit?.substring(0,8)}, style=${effectiveStyleInit}, recentTitles=${recentTitlesInit.length}`, Date.now()-t0Init, 'ms');
        try {
          const abortCtrl = new AbortController();
          // inference.sh (minimax-m-25) takes ~30-70s for text generation
          // Documents/carousels need even more (multiple slides)
          const isHeavyContent = mappedCTInit === "document" || mappedCTInit === "carousel";
          const genTimeout = isHeavyContent ? 180000 : 90000;
          const abortTimer = setTimeout(() => abortCtrl.abort(), genTimeout);
          let genResp: Response;
          try {
            genResp = await fetch(`${supabaseUrl}/functions/v1/generate-content`, {
              method: "POST",
              headers: { Authorization: authHeader!, "Content-Type": "application/json", apikey: supabaseAnonKey },
              body: JSON.stringify({
                trend: {
                  title: isQuoteInit ? extractedContentInit : extractedContentInit || "Conteúdo",
                  description: extractedContentInit || "",
                  fullContent: articleContent || "",
                  source_url: sourceUrl || null,
                  theme: nicheInitVal,
                  keywords: topicsInit,
                },
                contentType: mappedCTInit, contentStyle: effectiveStyleInit, brandId: resolvedBrandIdInit,
                slideCount: (mappedCTInit === "carousel" || mappedCTInit === "document") ? (slideCount || 5) : 1, visualMode: generationParams.visualMode || "brand_guided",
                tone: voiceInit, platform: platform || "instagram", includeCta: false,
                secondaryLanguages: userSecondaryLanguages,
                manualBriefing: { notes: briefingInit },
                ...(sourceUrl ? { sourceUrl } : {}),
                ...(recentTitlesInit.length > 0 ? { recentTitles: recentTitlesInit } : {}),
              }),
              signal: abortCtrl.signal,
            });
          } catch (fetchErr: any) {
            clearTimeout(abortTimer);
            if (fetchErr.name === "AbortError") {
              replyOverride = "A geração demorou demais (timeout). Tente novamente com um texto mais curto.";
              break;
            }
            throw fetchErr;
          }
          clearTimeout(abortTimer);
          console.log('[INICIAR_GERACAO] generate-content responded', Date.now()-t0Init, 'ms', 'status:', genResp.status);
          const genText = await genResp.text();
          console.log('[INICIAR_GERACAO] response body read', Date.now()-t0Init, 'ms');
          if (genResp.ok) {
            const genData = JSON.parse(genText);
            if (genData.success && genData.content) {
              let contentIdInit = genData.content?.id || genData.id || null;
              if (!contentIdInit) {
                contentIdInit = await persistGeneratedContent({
                  generatedContent: genData.content, fallbackTitle: extractedContentInit || "Conteúdo",
                  contentType: mappedCTInit as any, brandId: resolvedBrandIdInit, visualMode: generationParams.visualMode || "brand_guided",
                  brandSnapshot: brandSnapshotInit, templateSetId: defaultTemplateSetIdInit,
                  platform: platform || "instagram",
                });
              } else {
                // Content already exists (created by generate-content), update with brand_snapshot
                if (brandSnapshotInit) {
                  await svcInit.from("generated_contents").update({
                    brand_snapshot: brandSnapshotInit,
                    template_set_id: defaultTemplateSetIdInit,
                    visual_mode: generationParams.visualMode || "brand_guided",
                    platform: platform || "instagram",
                  }).eq("id", contentIdInit);
                  console.log('[INICIAR_GERACAO] brand_snapshot updated on existing content:', contentIdInit);
                }
              }
              // Create project/post/slides
              const genSlides = genData.content?.slides || [];

              // 1. Ensure valid brand_id (projects.brand_id is NOT NULL)
              let finalBrandIdInit = resolvedBrandIdInit || genData.content?.brand_id || null;
              if (!finalBrandIdInit) {
                const { data: userBrandsInit } = await svcInit.from("brands").select("id").eq("owner_user_id", userId).order("created_at", { ascending: false }).limit(1);
                finalBrandIdInit = userBrandsInit?.[0]?.id || null;
              }
              if (!finalBrandIdInit) {
                // Auto-create a default brand
                const { data: newBrand } = await svcInit.from("brands").insert({ owner_user_id: userId, name: "Minha Marca" }).select("id").single();
                finalBrandIdInit = newBrand?.id || null;
              }

              if (!finalBrandIdInit) {
                console.error('[INICIAR_GERACAO] Could not resolve or create brand_id');
                replyOverride = "Erro: não foi possível criar a marca. Tente novamente.";
                break;
              }

               // 2. Create project — using finalBrandIdInit to ensure brand chain integrity
              console.log('[INICIAR_GERACAO] creating project with brand_id:', finalBrandIdInit, '(resolved:', resolvedBrandIdInit, ')');
              const { data: projInit, error: projErr } = await svcInit.from("projects").insert({ brand_id: finalBrandIdInit, name: `Chat – ${new Date().toLocaleDateString('pt-BR')}` }).select("id").single();
              console.log('[INICIAR_GERACAO] projeto criado com brand_id:', finalBrandIdInit, 'projeto:', projInit?.id, 'err:', projErr?.message);
              // Chain: slides.post_id → posts.project_id → projects.brand_id → brands
              // generate-image-variations will resolve brand via this chain
              if (projErr || !projInit) {
                replyOverride = `Erro ao criar projeto: ${projErr?.message || 'unknown'}`;
                break;
              }

              // 3. Map content_type to valid DB values (posts.content_type default is 'educativo')
              const styleToContentType: Record<string, string> = {
                news: "noticia", noticia: "noticia",
                quote: "frase", frase: "frase",
                tip: "educativo", educational: "educativo", educativo: "educativo",
                curiosity: "curiosidade", curiosidade: "curiosidade",
                tutorial: "tutorial", anuncio: "anuncio",
              };
              const dbContentType = styleToContentType[(mappedStyleInit || "").toLowerCase()] || "educativo";

              // 4. Create post
              const rawText = genSlides.map((s: any) => s.headline || s.body || "").filter(Boolean).join("\n");
              const { data: postInit, error: postErr } = await svcInit.from("posts").insert({
                project_id: projInit.id,
                raw_post_text: rawText || "Conteúdo via chat",
                content_type: dbContentType,
              }).select("id").single();
              console.log('[INICIAR_GERACAO] post:', postInit?.id, 'err:', postErr?.message);
              if (postErr || !postInit) {
                replyOverride = `Erro ao criar post: ${postErr?.message || 'unknown'}`;
                break;
              }
              const postIdInit = postInit.id;

              // 5. Create slides
              const slideInserts = genSlides.map((s: any, i: number) => ({
                post_id: postIdInit,
                slide_index: i,
                slide_text: s.headline || s.body || s.title || "",
                layout_preset: "default",
              }));
              const { data: dbSlides, error: slidesErr } = await svcInit.from("slides").insert(slideInserts).select("id, slide_index, slide_text").order("slide_index");
              console.log('[INICIAR_GERACAO] slides created', Date.now()-t0Init, 'ms', dbSlides?.length, 'err:', slidesErr?.message);
              if (slidesErr || !dbSlides?.length) {
                replyOverride = `Erro ao criar slides: ${slidesErr?.message || 'nenhum slide'}`;
                break;
              }

              // 6. Link back to generated_contents
              await svcInit.from("generated_contents").update({ generation_metadata: { post_id: postIdInit, project_id: projInit.id, visual_style: effectiveVisualStyle } }).eq("id", contentIdInit);

              console.log('[INICIAR_GERACAO] TOTAL', Date.now()-t0Init, 'ms — returning:', JSON.stringify({ contentId: contentIdInit, postId: postIdInit, slidesCount: dbSlides.length }));
              replyOverride = "Configuração concluída! Gerando opções visuais...";
              actionResult = {
                content_id: contentIdInit,
                content_type: mappedCTInit,
                platform: platform || "instagram",
                headline: genSlides[0]?.headline || "",
                generation_result: {
                  contentId: contentIdInit, postId: postIdInit,
                  slides: dbSlides.map((s: any, i: number) => ({ id: s.id, slide_index: s.slide_index, headline: genSlides[i]?.headline || "", body: genSlides[i]?.body || "", slide_text: s.slide_text })),
                },
              };
            } else {
              console.error('[INICIAR_GERACAO] generate-content failed: success=false', genText.substring(0, 500));
              replyOverride = `Erro na geração: ${genText.substring(0, 200)}`;
            }
          } else {
            console.error('[INICIAR_GERACAO] generate-content failed:', genResp.status, genText.substring(0, 500));
            replyOverride = `Erro na geração (${genResp.status})`;
          }
        } catch (e: any) {
          replyOverride = `Erro: ${e?.message}`;
        }
        break;
      }

      case "GERAR_BACKGROUNDS": {
        if (!generationParams?.slideId) {
          replyOverride = "slideId é obrigatório.";
          break;
        }
        const { slideId, contentId: bgContentId, visualMode: bgVisualMode, backgroundMode: bgMode, templateId: bgTemplateId, uploadedImageUrl: bgUploadUrl } = generationParams;
        const serviceKeyBg = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const svcBg = createClient(supabaseUrl, serviceKeyBg);
        const headers = { Authorization: authHeader!, "Content-Type": "application/json", apikey: supabaseAnonKey };
        const callFn = async (fn: string, body: any) => {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 120000);
          try {
            const r = await fetch(`${supabaseUrl}/functions/v1/${fn}`, { method: "POST", headers, body: JSON.stringify(body), signal: controller.signal });
            clearTimeout(timer);
            const t = await r.text();
            if (!r.ok) console.error(`[GERAR_BACKGROUNDS] ${fn} failed:`, r.status);
            return { ok: r.ok, data: r.ok ? JSON.parse(t) : null };
          } catch (err: any) {
            clearTimeout(timer);
            if (err.name === "AbortError") {
              console.error(`[GERAR_BACKGROUNDS] ${fn} timeout after 120s`);
              return { ok: false, data: null };
            }
            throw err;
          }
        };

        let backgroundUrls: string[] = [];

        if (bgMode === "saved_template" && bgTemplateId) {
          const { data: tpl } = await svcBg.from("brand_background_templates").select("background_images").eq("id", bgTemplateId).single();
          const imgs = tpl?.background_images as any[];
          backgroundUrls = Array.isArray(imgs) ? imgs.map((i: any) => i.url || i).filter(Boolean).slice(0, 1) : [];
        } else if (bgMode === "user_upload" && bgUploadUrl) {
          backgroundUrls = [bgUploadUrl];
        } else {
          // AI generate: brief → prompts → variations (sequential, each depends on previous)
          const briefResp = await callFn("create-visual-brief", { slide_id: slideId });
          console.log(`[GERAR_BACKGROUNDS] brief: ok=${briefResp.ok}`);
          if (!briefResp.ok) {
            console.error("[GERAR_BACKGROUNDS] create-visual-brief failed, aborting pipeline");
            backgroundUrls = [];
          } else {
            const promptsResp = await callFn("build-image-prompts", { slide_id: slideId });
            console.log(`[GERAR_BACKGROUNDS] prompts: ok=${promptsResp.ok}`);
            if (!promptsResp.ok) {
              console.error("[GERAR_BACKGROUNDS] build-image-prompts failed, aborting pipeline");
              backgroundUrls = [];
            } else {
              const genResult = await callFn("generate-image-variations", { slide_id: slideId, quality_tier: "cheap", n_variations: 1 });
              console.log(`[GERAR_BACKGROUNDS] variations: ok=${genResult.ok}`);
              if (genResult.ok && genResult.data?.generations) {
                backgroundUrls = genResult.data.generations.map((g: any) => g.image_url).filter(Boolean);
              } else {
                console.warn("[GERAR_BACKGROUNDS] generate-image-variations failed or empty, returning empty");
                backgroundUrls = [];
              }
            }
          }
        }

        actionResult = { background_urls: backgroundUrls };
        replyOverride = backgroundUrls.length > 0
          ? `${backgroundUrls.length} opções de fundo geradas.`
          : "Não foi possível gerar imagens de fundo. Tente regenerar.";
        break;
      }

      case "GERAR_TEXTOS": {
        if (!generationParams?.contentId) {
          replyOverride = "contentId é obrigatório.";
          break;
        }
        const { contentId: txtContentId, slides: txtSlides, sourceText: txtSource, contentStyle: txtStyle, platform: txtPlatform } = generationParams;
        const serviceKeyTxt = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const svcTxt = createClient(supabaseUrl, serviceKeyTxt);
        const ctxTxt = userCtx || {} as any;

        const slideTextsResult: Record<string, { headline: string; body: string }> = {};

        for (const slide of (txtSlides || [])) {
          try {
            const textPrompt = `Gere texto para slide ${slide.slide_index + 1} de ${(txtSlides || []).length} para ${txtPlatform || "instagram"}.
Nicho: ${ctxTxt.business_niche || "geral"}. Tom: ${ctxTxt.brand_voice || "natural"}.
Estilo: ${txtStyle || "educativo"}.
Conteúdo original: ${(txtSource || "").substring(0, 500)}
Slide role: ${slide.slide_index === 0 ? "cover" : "content"}

Responda APENAS em JSON: {"headline":"título impactante (máx 60 chars)","body":"texto complementar (máx 180 chars)"}`;

            const aiResp = await aiGatewayFetch({ model: "google/gemini-2.5-flash", messages: [{ role: "user", content: textPrompt }] });
            if (aiResp.ok) {
              const aiData = await aiResp.json();
              const raw = aiData.choices?.[0]?.message?.content || "";
              const jsonMatch = raw.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                slideTextsResult[slide.id] = { headline: parsed.headline || "", body: parsed.body || "" };
                // Update slides table
                await svcTxt.from("slides").update({ slide_text: parsed.headline || "" }).eq("id", slide.id);
              }
            }
          } catch (e) { console.error(`[GERAR_TEXTOS] slide ${slide.id} error:`, e); }
        }

        actionResult = { slide_texts: slideTextsResult };
        replyOverride = "Textos gerados!";
        break;
      }

      case "COMPOR_SLIDES": {
        if (!generationParams?.contentId) {
          replyOverride = "contentId é obrigatório.";
          break;
        }
        const { contentId: compContentId, slides: compSlides } = generationParams;
        const serviceKeyComp = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const svcComp = createClient(supabaseUrl, serviceKeyComp);

        // Update generated_contents slides with approved backgrounds and texts
        const { data: gcComp } = await svcComp.from("generated_contents").select("slides, brand_snapshot, content_type, platform").eq("id", compContentId).single();
        const existingSlides = (gcComp?.slides as any[]) || [];

        const updatedSlides = existingSlides.map((s: any, i: number) => {
          const approved = (compSlides || []).find((cs: any) => cs.slide_index === i);
          if (approved) {
            return { ...s, headline: approved.headline || s.headline, body: approved.body || s.body, background_image_url: approved.background_url || s.background_image_url, image_url: approved.background_url || s.image_url };
          }
          return s;
        });

        await svcComp.from("generated_contents").update({ slides: updatedSlides }).eq("id", compContentId);

        // Render composite
        const compositeResult = await renderCompositeAndUpdateContent({
          svc: svcComp, supabaseUrl, authHeader: authHeader!, supabaseAnonKey,
          contentId: compContentId, slides: updatedSlides, brandSnapshot: gcComp?.brand_snapshot,
          contentType: gcComp?.content_type || "post", platform: gcComp?.platform || "instagram", logPrefix: "[COMPOR_SLIDES]", lovableApiKey,
        });

        actionResult = { composite_urls: compositeResult || [] };
        replyOverride = "Composição finalizada!";
        break;
      }


      case "PIPELINE_BACKGROUND": {
        if (!generationParams?.contentId) {
          replyOverride = "contentId é obrigatório para PIPELINE_BACKGROUND.";
          break;
        }
        const { contentId: pipeContentId, slides: pipeSlideIds, backgroundMode: pipeBgMode, templateId: pipeTemplateId, uploadedImageUrl: pipeUploadUrl, visualMode: pipeVisualMode, contentStyle: pipeContentStyle, platform: pipePlatform, visualStyle: pipeVisualStyle } = generationParams;
        const pipeBackgroundOnly = pipeVisualStyle !== "ai_full_design" && pipeVisualStyle !== "ai_illustration"; // false = include text/illustration in image
        console.log(`[PIPELINE_BACKGROUND] visualStyle=${pipeVisualStyle}, backgroundOnly=${pipeBackgroundOnly}, platform=${pipePlatform}, contentStyle=${pipeContentStyle}`);
        const serviceKeyPipe = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const svcPipe = createClient(supabaseUrl, serviceKeyPipe);
        const headersPipe = { Authorization: authHeader!, "Content-Type": "application/json", apikey: supabaseAnonKey };

        const callFnPipe = async (fn: string, body: any, timeoutMs = 90000) => {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), timeoutMs);
          try {
            const r = await fetch(`${supabaseUrl}/functions/v1/${fn}`, { method: "POST", headers: headersPipe, body: JSON.stringify(body), signal: controller.signal });
            clearTimeout(timer);
            const t = await r.text();
            return { ok: r.ok, data: r.ok ? JSON.parse(t) : null };
          } catch (err: any) {
            clearTimeout(timer);
            console.error(`[PIPELINE_BACKGROUND] ${fn} error:`, err.message);
            return { ok: false, data: null };
          }
        };

        // Fire-and-forget the pipeline — respond immediately
        (async () => {
          try {
            const slideIds = pipeSlideIds || [];
            console.log('[PIPELINE_BACKGROUND] starting for', slideIds.length, 'slides');
            console.log('[PIPELINE_BACKGROUND] backgroundMode:', pipeBgMode);
            console.log('[PIPELINE_BACKGROUND] templateId:', pipeTemplateId);
            console.log('[PIPELINE_BACKGROUND] uploadedImageUrl:', pipeUploadUrl);
            const effectiveVisualMode = pipeVisualMode || "brand_guided";
            console.log('[PIPELINE_BACKGROUND] visualMode:', effectiveVisualMode);

            // Phase 1: Skip text gen — generate-content already created all slide text.
            // Only generate text if a slide is genuinely empty (safety net).
            const { data: gcCheck } = await svcPipe.from("generated_contents").select("slides").eq("id", pipeContentId).single();
            const existingSlides = (gcCheck?.slides as any[]) || [];
            const needsTextGen = slideIds.some((id: string, i: number) => {
              const slide = existingSlides[i];
              return !slide?.headline || slide.headline.length < 3;
            });

            if (needsTextGen) {
              console.log('[PIPELINE_BACKGROUND] slide missing text — generating');
              const ctxPipe = userCtx || {} as any;
              for (const slideId of slideIds) {
                try {
                  const { data: slideInfo } = await svcPipe.from("slides").select("slide_index, slide_text").eq("id", slideId).single();
                  if (slideInfo?.slide_text && slideInfo.slide_text.length >= 5) continue; // already has text
                  const slideIndex = slideInfo?.slide_index || 0;
                  const textPrompt = `Gere texto para slide ${slideIndex + 1} para ${pipePlatform || "instagram"}. Nicho: ${ctxPipe.business_niche || "geral"}. Tom: ${ctxPipe.brand_voice || "natural"}. Estilo: ${pipeContentStyle || "educativo"}. Responda em JSON: {"headline":"título (máx 60 chars)","body":"texto (máx 180 chars)"}`;
                  const aiResp = await aiGatewayFetch({ model: "google/gemini-2.5-flash", messages: [{ role: "user", content: textPrompt }] });
                  if (aiResp.ok) {
                    const aiData = await aiResp.json();
                    const jsonMatch = (aiData.choices?.[0]?.message?.content || "").match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                      const parsed = JSON.parse(jsonMatch[0]);
                      await svcPipe.from("slides").update({ slide_text: parsed.headline || "" }).eq("id", slideId);
                    }
                  }
                } catch (e: any) {
                  console.error(`[PIPELINE_BACKGROUND] text gen error:`, e.message);
                }
              }
            } else {
              console.log('[PIPELINE_BACKGROUND] text already exists — skipping Phase 1');
            }

            // Pre-fetch content metadata for use in Phase 2
            const { data: gcMeta } = await svcPipe.from("generated_contents").select("content_type, platform").eq("id", pipeContentId).single();
            const resolvedContentFormat = gcMeta?.content_type || (pipeContentStyle === "quote" ? "post" : (slideIds.length > 1 ? "carousel" : "post"));
            const resolvedPlatform = gcMeta?.platform || pipePlatform || "instagram";

            // Phase 2: Generate backgrounds for all slides IN PARALLEL
            // Sequential generation of 5+ slides easily exceeds 60s wall time.
            // Parallelizing keeps wall time ~= single slowest slide (~20-30s).
            // CPU time is minimal (mostly I/O waits on fetch).

            // Pre-fetch data from generated_contents (one lightweight query instead of deep join)
            const { data: gcPre } = await svcPipe.from("generated_contents")
              .select("slides, brand_id, brand_snapshot, generation_metadata")
              .eq("id", pipeContentId).single();
            const allSlideContent = (gcPre?.slides as any[]) || [];
            const slideBrandId = gcPre?.brand_id as string || null;
            const brandSnapshot = gcPre?.brand_snapshot as any;
            const defaultTsId = (gcPre?.generation_metadata as any)?.template_set_id || null;
            // Get brand creation_mode from brands table (lightweight single-column query)
            let brandCreationMode: string | null = null;
            if (slideBrandId) {
              const { data: brandRow } = await svcPipe.from("brands").select("creation_mode, default_template_set_id").eq("id", slideBrandId).single();
              brandCreationMode = brandRow?.creation_mode || null;
              if (!defaultTsId && brandRow?.default_template_set_id) {
                // fallback template set from brand
              }
            }
            console.log(`[PIPELINE_BACKGROUND] brand=${slideBrandId?.substring(0,8)}, slides=${allSlideContent.length}`);

            // Pre-fetch brand photos if needed
            let bgPhotos: any[] | null = null;
            const isPhotoMode = (pipeVisualStyle === "photo_overlay" || (brandCreationMode === "photo_backgrounds" && pipeBackgroundOnly)) && pipeBgMode !== "user_upload";
            if (isPhotoMode && slideBrandId) {
              const { data } = await svcPipe.from("brand_examples").select("image_url").eq("brand_id", slideBrandId).eq("purpose", "background").order("created_at", { ascending: true });
              bgPhotos = data;
            }

            // Pre-fetch template if needed
            let templateBgUrl: string | null = null;
            if (pipeBgMode === "saved_template" && pipeTemplateId) {
              const { data: tpl } = await svcPipe.from("brand_background_templates").select("background_images").eq("id", pipeTemplateId).single();
              const imgs = tpl?.background_images as any;
              if (Array.isArray(imgs)) {
                templateBgUrl = typeof imgs[0] === 'string' ? imgs[0] : imgs[0]?.url || imgs[0]?.image_url || null;
              } else if (typeof imgs === 'object' && imgs !== null) {
                templateBgUrl = Object.values(imgs)[0] as string;
              }
            }

            // Generate slide backgrounds in batches of 2 to avoid rate limits
            // Full parallel (5 at once) causes inference.sh/Lovable Gateway to drop most requests
            const BATCH_SIZE = 2;
            // Resolve the actual slide_index for each slideId (when frontend sends 1 slide per call)
            const { data: slideIndexMap } = await svcPipe.from("slides").select("id, slide_index").in("id", slideIds);
            const totalSlidesInContent = allSlideContent.length || slideIds.length;

            const generateSlideBackground = async (slideId: string) => {
              // Get real slide index from DB (not array position)
              const realIndex = slideIndexMap?.find((s: any) => s.id === slideId)?.slide_index ?? 0;
              const slideRole = realIndex === 0 ? "cover" : (realIndex === totalSlidesInContent - 1 ? "cta" : "content");
              console.log(`[PIPELINE_BACKGROUND] processing slide index=${realIndex} (${slideRole}): ${slideId}`);

              if (isPhotoMode && bgPhotos?.length) {
                const photoUrl = bgPhotos[realIndex % bgPhotos.length].image_url;
                await svcPipe.from("image_generations").insert({ slide_id: slideId, image_url: photoUrl, is_selected: true, model_used: "photo_background", width: 1080, height: 1080 });
                return true;
              }
              if (pipeBgMode === "saved_template" && templateBgUrl) {
                await svcPipe.from("image_generations").insert({ slide_id: slideId, image_url: templateBgUrl, is_selected: true, model_used: "saved_template", width: 1080, height: 1080 });
                return true;
              }
              if (pipeBgMode === "user_upload" && pipeUploadUrl) {
                await svcPipe.from("image_generations").insert({ slide_id: slideId, image_url: pipeUploadUrl, is_selected: true, model_used: "user_upload", width: 1080, height: 1080 });
                return true;
              }

              // AI generation — use real slide index to get correct content
              const slideContent = allSlideContent[realIndex] || {};
              const bgResult = await callFnPipe("generate-slide-images", {
                brandId: slideBrandId,
                slide: { role: slideRole, headline: slideContent.headline || "", body: slideContent.body || "", bullets: slideContent.bullets || [] },
                slideIndex: realIndex,
                totalSlides: totalSlidesInContent,
                contentFormat: resolvedContentFormat,
                contentId: pipeContentId,
                templateSetId: defaultTsId,
                backgroundOnly: pipeBackgroundOnly,
                illustrationMode: pipeVisualStyle === "ai_illustration" || pipeVisualStyle === "ai_illustration_titled",
                platform: resolvedPlatform,
                allSlides: allSlideContent.map((s: any, i: number) => ({
                  role: i === 0 ? "cover" : (i === totalSlidesInContent - 1 ? "cta" : "content"),
                  headline: s.headline || "",
                  image_headline: s.image_headline || "",
                  body: s.body || "",
                })),
              }, 90000); // 90s — inference.sh retries + Gateway fallback need time

              const bgUrl = bgResult.data?.imageUrl || bgResult.data?.bgImageUrl;
              if (bgResult.ok && bgUrl) {
                await svcPipe.from("image_generations").insert({ slide_id: slideId, image_url: bgUrl, is_selected: true, model_used: "generate-slide-images", width: 1080, height: 1080 });
                console.log(`[PIPELINE_BACKGROUND] slide ${slideId} bg saved`);
                return true;
              }
              console.error(`[PIPELINE_BACKGROUND] slide ${slideId} generation failed`);
              return false;
            };

            let totalOk = 0;
            let totalFailed = 0;
            for (let batchStart = 0; batchStart < slideIds.length; batchStart += BATCH_SIZE) {
              const batch = slideIds.slice(batchStart, batchStart + BATCH_SIZE);
              console.log(`[PIPELINE_BACKGROUND] batch ${Math.floor(batchStart / BATCH_SIZE) + 1}: slides ${batchStart + 1}-${batchStart + batch.length}`);

              const results = await Promise.allSettled(
                batch.map((slideId: string) =>
                  generateSlideBackground(slideId).catch((err: any) => {
                    console.error(`[PIPELINE_BACKGROUND] slide ${slideId} error:`, err.message);
                    return false;
                  })
                )
              );

              for (const r of results) {
                if (r.status === "fulfilled" && r.value) totalOk++;
                else totalFailed++;
              }

              // Small delay between batches to let rate limits recover
              if (batchStart + BATCH_SIZE < slideIds.length) {
                await new Promise(r => setTimeout(r, 1000));
              }
            }
            console.log(`[PIPELINE_BACKGROUND] backgrounds done: ${totalOk} ok, ${totalFailed} failed of ${slideIds.length}`);

            // Phase 3: Update generated_contents.slides with background URLs before rendering
            const { data: selectedImages, error: selImgErr } = await svcPipe.from("image_generations").select("id, slide_id, image_url").in("slide_id", slideIds).eq("is_selected", true);
            console.log(`[PIPELINE_BACKGROUND] Phase 3: found ${selectedImages?.length || 0} selected images, error: ${selImgErr?.message || 'none'}`);
            const { data: gcForRender } = await svcPipe.from("generated_contents").select("slides, brand_snapshot, content_type, platform").eq("id", pipeContentId).single();

            if (gcForRender?.slides && Array.isArray(gcForRender.slides) && selectedImages?.length) {
              // Map slideId -> image_url
              const slideImageMap: Record<string, string> = {};
              for (const img of selectedImages) {
                slideImageMap[img.slide_id] = img.image_url;
              }

              // Get slide index mapping
              const { data: dbSlideRows } = await svcPipe.from("slides").select("id, slide_index").in("id", slideIds).order("slide_index");
              const updatedSlides = [...(gcForRender.slides as any[])];
              for (const row of (dbSlideRows || [])) {
                const imgUrl = slideImageMap[row.id];
                if (updatedSlides[row.slide_index]) {
                  if (imgUrl) {
                    updatedSlides[row.slide_index] = {
                      ...updatedSlides[row.slide_index],
                      image_url: imgUrl,
                      background_image_url: imgUrl,
                      previewImage: imgUrl,
                      image_stale: false,
                      ...(pipeBackgroundOnly ? {} : { render_mode: "ai_full_design" }),
                    };
                  } else if (!pipeBackgroundOnly) {
                    // Slide image failed but we're in ai_full_design mode —
                    // still mark as ai_full_design to prevent HTML overlay on some slides
                    // The slide will show without image but won't have mixed rendering
                    updatedSlides[row.slide_index] = {
                      ...updatedSlides[row.slide_index],
                      render_mode: "ai_full_design",
                      image_stale: true,
                    };
                    console.warn(`[PIPELINE_BACKGROUND] slide ${row.id} has no image — marked as ai_full_design with image_stale`);
                  }
                }
              }

              // Save slides with background URLs
              await svcPipe.from("generated_contents").update({ slides: updatedSlides }).eq("id", pipeContentId);
              console.log('[PIPELINE_BACKGROUND] slides updated with', Object.keys(slideImageMap).length, 'background URLs');

              // Phase 3.5: Analyze image layout for optimal text positioning
              // Skip for ai_full_design — image already has text baked in
              if (pipeBackgroundOnly) for (const row of (dbSlideRows || [])) {
                const imgUrl = slideImageMap[row.id];
                if (imgUrl) {
                  try {
                    const selImg = selectedImages?.find((i: any) => i.slide_id === row.id);
                    const layoutResult = await callFnPipe("analyze-image-layout", { slide_id: row.id, generation_id: selImg?.id });
                    console.log(`[PIPELINE_BACKGROUND] layout analysis slide ${row.id}: ok=${layoutResult.ok}`);
                  } catch (layoutErr: any) {
                    console.warn(`[PIPELINE_BACKGROUND] layout analysis failed for ${row.id}:`, layoutErr.message);
                  }
                }
              }
              if (pipeBackgroundOnly) {
                // Background-only: render composite (add text overlay on background)
                await new Promise(r => setTimeout(r, 1500));
                await renderCompositeAndUpdateContent({
                  svc: svcPipe, supabaseUrl, authHeader: authHeader!, supabaseAnonKey,
                  contentId: pipeContentId, slides: updatedSlides,
                  brandSnapshot: gcForRender.brand_snapshot, contentType: gcForRender.content_type || "post",
                  platform: gcForRender.platform || "instagram", logPrefix: "[PIPELINE_BACKGROUND]", lovableApiKey,
                  visualStyle: pipeVisualStyle,
                });
              } else {
                // Full design: image already has text — append to image_urls (don't overwrite)
                // Each PIPELINE_BACKGROUND call handles 1 slide, so we merge with existing URLs
                const bgUrls = Object.values(slideImageMap).filter(Boolean) as string[];
                if (bgUrls.length > 0) {
                  const { data: existingGc } = await svcPipe.from("generated_contents").select("image_urls").eq("id", pipeContentId).single();
                  const existingUrls = (existingGc?.image_urls as string[]) || [];
                  const mergedUrls = [...existingUrls, ...bgUrls.filter(u => !existingUrls.includes(u))];
                  await svcPipe.from("generated_contents").update({ image_urls: mergedUrls }).eq("id", pipeContentId);
                  console.log(`[PIPELINE_BACKGROUND] ai_full_design: saved ${bgUrls.length} new images (total: ${mergedUrls.length}) to image_urls`);
                }
              }
            } else if (gcForRender) {
              // No selected images — still try to render with whatever we have
              await renderCompositeAndUpdateContent({
                svc: svcPipe, supabaseUrl, authHeader: authHeader!, supabaseAnonKey,
                contentId: pipeContentId, slides: gcForRender.slides as any[] || [],
                brandSnapshot: gcForRender.brand_snapshot, contentType: gcForRender.content_type || "post",
                platform: gcForRender.platform || "instagram", logPrefix: "[PIPELINE_BACKGROUND]", lovableApiKey,
                visualStyle: pipeVisualStyle,
              });
            }

            // Notify user via Realtime that pipeline is done
            // Wait a moment to ensure DB writes are fully committed
            await new Promise(r => setTimeout(r, 1000));

            const { data: finalGc } = await svcPipe.from("generated_contents")
              .select("image_urls, slides, content_type, platform")
              .eq("id", pipeContentId)
              .single();

            console.log(`[PIPELINE_DONE] image_urls: ${JSON.stringify(finalGc?.image_urls)?.substring(0, 200)}, content_type: ${finalGc?.content_type}, platform: ${finalGc?.platform}`);

            // Get first slide's background_image_url as fallback preview
            const firstSlide = (finalGc?.slides as any[])?.[0];
            const previewUrl = finalGc?.image_urls?.[0] || firstSlide?.background_image_url || null;

            // Don't include content_id in action_result to avoid duplicate ActionCard
            // The original ActionCard already exists and will update via Realtime/polling
            await svcPipe.from("chat_messages").insert({
              user_id: userId,
              role: "assistant",
              content: "✅ Imagem gerada! Confira o resultado acima.",
              intent: "PIPELINE_DONE",
              metadata: {
                pipeline_content_id: pipeContentId, // for reference only, not for ActionCard
              },
            });
            console.log('[PIPELINE_BACKGROUND] DONE');
          } catch (e: any) {
            console.error('[PIPELINE_BACKGROUND] fatal error:', e.message);
            // Notify user of failure via chat
            await svcPipe.from("chat_messages").insert({
              user_id: userId,
              role: "assistant",
              content: "⚠️ Houve um erro ao gerar a imagem de fundo. Você pode tentar novamente.",
              intent: "PIPELINE_ERROR",
              metadata: { action_result: { content_id: pipeContentId } },
            }).then(() => {});
          }
        })().catch(console.error);

        // Return immediately — do NOT include content_id in actionResult
        // to avoid creating a duplicate ActionCard in the chat history.
        // The original ActionCard was already created by INICIAR_GERACAO.
        replyOverride = "";
        actionResult = { pipeline_started: true };
        break;
      }

      case "REGENERAR_IMAGEM": {
        if (!generationParams?.contentId) {
          replyOverride = "Não encontrei o conteúdo para regenerar a imagem.";
          break;
        }
        const targetContentId = generationParams.contentId;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const svc = createClient(supabaseUrl, serviceKey);

        try {
          const { data: gc } = await svc
            .from("generated_contents")
            .select("generation_metadata, brand_id, content_type")
            .eq("id", targetContentId)
            .single();

          if (!gc) {
            replyOverride = "Conteúdo não encontrado.";
            break;
          }

          const postId = (gc.generation_metadata as any)?.post_id;
          if (!postId) {
            replyOverride = "Este conteúdo não tem dados de slide para regenerar a imagem. Tente refazer tudo.";
            break;
          }

          const { data: slideRow } = await svc
            .from("slides")
            .select("id")
            .eq("post_id", postId)
            .eq("slide_index", 0)
            .single();

          if (!slideRow) {
            replyOverride = "Slide não encontrado.";
            break;
          }

          // Deselect current images
          await svc.from("image_generations")
            .update({ is_selected: false })
            .eq("slide_id", slideRow.id);

          // Run pipeline for this slide (fire-and-forget)
          const headers = {
            Authorization: authHeader!,
            "Content-Type": "application/json",
            apikey: supabaseAnonKey,
          };

          const callFn = async (fnName: string, body: any) => {
            const resp = await fetch(`${supabaseUrl}/functions/v1/${fnName}`, {
              method: "POST", headers, body: JSON.stringify(body),
            });
            if (!resp.ok) console.error(`[ai-chat:regen-img] ${fnName} failed:`, resp.status);
            else console.log(`[ai-chat:regen-img] ${fnName} OK`);
          };

          // Fire-and-forget pipeline
          (async () => {
            try {
              await callFn("create-visual-brief", { slide_id: slideRow.id });
              await callFn("build-image-prompts", { slide_id: slideRow.id });
              await callFn("generate-image-variations", { slide_id: slideRow.id, quality_tier: "cheap", n_variations: 2 });
              await callFn("rank-and-select", { slide_id: slideRow.id });

              // Update generated_contents with new image
              const { data: newImg } = await svc
                .from("image_generations")
                .select("image_url")
                .eq("slide_id", slideRow.id)
                .eq("is_selected", true)
                .limit(1);
              if (newImg?.[0]?.image_url) {
                const { data: content } = await svc.from("generated_contents").select("slides").eq("id", targetContentId).single();
                if (content?.slides && Array.isArray(content.slides)) {
                  const updSlides = [...(content.slides as any[])];
                  if (updSlides[0]) {
                    updSlides[0].image_url = newImg[0].image_url;
                    updSlides[0].background_image_url = newImg[0].image_url;
                    updSlides[0].previewImage = newImg[0].image_url;
                  }
                  await svc.from("generated_contents").update({ slides: updSlides, image_urls: [newImg[0].image_url] }).eq("id", targetContentId);
                }
              }
              // Render composite (text overlay on new background)
              const { data: gcForComposite } = await svc
                .from("generated_contents")
                .select("slides, brand_snapshot, content_type, platform")
                .eq("id", targetContentId)
                .single();
              if (gcForComposite?.slides) {
                await renderCompositeAndUpdateContent({
                  svc, supabaseUrl, authHeader: authHeader!, supabaseAnonKey,
                  contentId: targetContentId,
                  slides: gcForComposite.slides as any[],
                  brandSnapshot: gcForComposite.brand_snapshot,
                  contentType: gcForComposite.content_type || "post",
                  platform: gcForComposite.platform || "instagram",
                  logPrefix: "[REGENERAR_IMAGEM]",
                });
              }

              // Notify user via Realtime
              const { data: finalGc } = await svc.from("generated_contents").select("image_urls").eq("id", targetContentId).single();
              await svc.from("chat_messages").insert({
                user_id: userId,
                role: "assistant",
                content: "✅ Imagem regenerada com sucesso!",
                intent: "REGENERAR_IMAGEM_DONE",
                metadata: {
                  action_result: {
                    content_id: targetContentId,
                    content_type: gc.content_type,
                    preview_image_url: finalGc?.image_urls?.[0] || null,
                  },
                },
              });
              console.log("[ai-chat:regen-img] Pipeline complete for", targetContentId);
            } catch (e: any) {
              console.error("[ai-chat:regen-img] Pipeline error:", e?.message);
              // Notify user of failure via chat
              await svc.from("chat_messages").insert({
                user_id: userId,
                role: "assistant",
                content: "⚠️ Houve um erro ao regenerar a imagem. Tente novamente.",
                intent: "PIPELINE_ERROR",
                metadata: { action_result: { content_id: targetContentId } },
              }).then(() => {});
            }
          })().catch(console.error);

          replyOverride = "🖼️ Nova imagem sendo gerada... Acompanhe abaixo 👇";
          actionResult = { content_id: targetContentId, content_type: gc.content_type as any };
          console.log("[ai-chat] REGENERAR_IMAGEM started for", targetContentId);
        } catch (err: any) {
          console.error("[ai-chat] REGENERAR_IMAGEM error:", err?.message || err);
          replyOverride = "Erro ao regenerar a imagem. Tente novamente.";
        }
        break;
      }

      case "CRIAR_MARCA": {
        try {
          const serviceKeyCriar = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
          const svcCriar = createClient(supabaseUrl, serviceKeyCriar);

          // Always reload fresh state from DB (don't rely on cached userCtx)
          const { data: freshCtx } = await svcCriar
            .from("ai_user_context")
            .select("extra_context")
            .eq("user_id", userId)
            .single();
          const freshExtra = (freshCtx?.extra_context as Record<string, unknown>) || {};
          const bcState = (freshExtra.brand_creation as any) || null;
          const currentStep = bcState?.step || 0;
          const currentBrandId = bcState?.brand_id || null;
          let imagesReceived = bcState?.images_received || 0;

          const updateBcState = async (state: any) => {
            brandCreationStepResponse = state.step;
            // Reload latest extra_context before updating to avoid overwriting other fields
            const { data: latestCtx } = await svcCriar.from("ai_user_context").select("extra_context").eq("user_id", userId).single();
            const latestExtra = (latestCtx?.extra_context as Record<string, unknown>) || {};
            await svcCriar.from("ai_user_context").update({
              extra_context: { ...latestExtra, brand_creation: state },
            }).eq("user_id", userId);
          };

          const clearBcState = async (deleteBrand = false) => {
            // If deleteBrand=true, remove the orphan brand from DB
            if (deleteBrand && brandCreationState?.brand_id) {
              const orphanId = brandCreationState.brand_id;
              await svcCriar.from("brand_examples").delete().eq("brand_id", orphanId);
              await svcCriar.from("brands").delete().eq("id", orphanId).eq("owner_user_id", userId);
              console.log(`[ai-chat] Deleted orphan brand ${orphanId} on cancel`);
            }
            brandCreationStepResponse = 0;
            const extraNow = (await svcCriar
              .from("ai_user_context")
              .select("extra_context")
              .eq("user_id", userId)
              .single()).data?.extra_context as any || {};
            const { brand_creation: _, ...rest } = extraNow;
            await svcCriar.from("ai_user_context")
              .update({ extra_context: { ...rest, brand_creation: null } })
              .eq("user_id", userId);
          };

          const normalizeSpaces = (value: string) => value.replace(/\s+/g, " ").trim();

          const sanitizeBrandName = (raw: string): string | null => {
            const cleaned = normalizeSpaces(raw)
              .replace(/^["“”'`´]+|["“”'`´]+$/g, "")
              .replace(/[!?.,:;]+$/g, "")
              .trim();

            if (!cleaned || cleaned.length < 2 || cleaned.length > 60) return null;

            const lowered = cleaned.toLowerCase();
            const genericPatterns = [
              /^(marca|uma marca|minha marca|nova marca|marca nova)$/i,
              /^(quero|preciso|vamos|me ajuda).*(criar|fazer).*(marca)( nova)?$/i,
              /^criar( uma)? marca( nova)?$/i,
              /^(nova|novo)$/i,
              /^nome da marca$/i,
              /^sem nome$/i,
              /^(com|para|pra|de|do|da)\b/i,
              /^(quero|preciso|vamos|pode|me ajuda)\b/i,
              /\b(criar|fazer|montar)\b/i,
            ];

            if (genericPatterns.some((pattern) => pattern.test(lowered))) {
              return null;
            }

            return cleaned;
          };

          const extractExplicitBrandName = (input: string): string | null => {
            const text = normalizeSpaces(input);

            const quoted = text.match(/["“”'`´]([^"“”'`´]{2,60})["“”'`´]/);
            if (quoted?.[1]) {
              const quotedName = sanitizeBrandName(quoted[1]);
              if (quotedName) return quotedName;
            }

            const patterns = [
              /(?:nome\s+da\s+marca\s*(?:é|:)\s*)([^\n,.!?]{2,60})/i,
              /(?:marca|empresa)\s+(?:chamad[ao]|com\s+nome\s*(?:de)?|nome\s*(?:é|:)?)\s*([^\n,.!?]{2,60})/i,
              /(?:criar|crie|quero\s+criar|vamos\s+criar)\s+(?:uma\s+)?marca\s+([^\n,.!?]{2,60})/i,
            ];

            for (const pattern of patterns) {
              const match = text.match(pattern);
              if (!match?.[1]) continue;

              const candidate = match[1]
                .replace(/\s+(com|e)\s+(cores?|paleta|estilo|tom|logo|identidade)\b[\s\S]*$/i, "")
                .trim();

              const parsed = sanitizeBrandName(candidate);
              if (parsed) return parsed;
            }

            return null;
          };

          // Cancel check — delete orphan brand from DB
          if (/\b(cancel|cancelar|parar|sair|desistir)\b/i.test(message) && currentStep > 0) {
            await clearBcState(true);
            replyOverride = "Ok, criação da marca cancelada. Como posso ajudar?";
            break;
          }

          // Restart check (when user asks to create a NEW brand while another flow is active)
          if (currentStep > 0 && /\b(nova marca|outra marca|criar outra|reiniciar|recomeçar|começar de novo|do zero)\b/i.test(message)) {
            await clearBcState(true);
            await updateBcState({ step: 1, brand_id: null, images_received: 0 });
            replyOverride = `Perfeito, vamos começar uma nova marca do zero.\n\n**Qual o nome da sua marca?**`;
            break;
          }

          // ── STEP 0: Initial detection ──
          if (currentStep === 0) {
            const explicitName = extractExplicitBrandName(message);

            if (!explicitName) {
              await updateBcState({ step: 1, brand_id: null, images_received: 0 });
              replyOverride = `🎨 Vamos criar sua marca!\n\n**Qual o nome da sua marca?**\nExemplo: *"Nova marca chamada Pulse Care"*\n\nSe tiver uma logo, pode enviar aqui também! (jpg, png) 📎`;
              break;
            }

            // Name is explicit: only extract optional colors/tone from CURRENT message
            const extractResp = await aiGatewayFetch({
                model: "google/gemini-2.5-flash-lite",
                messages: [{
                  role: "user",
                  content: `A marca já tem nome definido: "${explicitName}".\nExtraia SOMENTE da mensagem atual os dados opcionais de identidade visual.\nMensagem atual: "${message}"\nJSON: { "colors": ["#hex"] ou null, "visual_tone": "string ou null" }\nResponda APENAS JSON.`,
                }],
              });

            let extracted: any = {};
            if (extractResp.ok) {
              const d = await extractResp.json();
              const raw = d.choices?.[0]?.message?.content || "";
              const m = raw.match(/\{[\s\S]*\}/);
              if (m) extracted = JSON.parse(m[0]);
            }

            const palette = (extracted.colors || []).map((c: string) => ({ hex: c }));
            const { data: newBrand, error: brandErr } = await svcCriar.from("brands").insert({
              owner_user_id: userId,
              name: explicitName,
              palette: palette.length > 0 ? palette : [],
              visual_tone: extracted.visual_tone || "clean",
              fonts: { headings: "Inter", body: "Inter" },
            }).select("id, name").single();

            if (brandErr || !newBrand) {
              replyOverride = "Erro ao criar a marca. Tente novamente.";
              break;
            }

            if (imageUrls?.length > 0) {
              await svcCriar.from("brands").update({ logo_url: imageUrls[0] }).eq("id", newBrand.id);
            }

            // Always go to choice step (1.5) — let user choose examples vs manual
            await updateBcState({ step: 1.5, brand_id: newBrand.id, images_received: 0, mode: null });
            replyOverride = `✅ Marca **"${newBrand.name}"** criada!${imageUrls?.length ? " Logo recebida! ✨" : ""}\n\nComo prefere configurar a identidade visual?\n\n📸 **Enviar exemplos** — você envia posts/imagens que já usa ou que gosta, e a IA extrai automaticamente suas cores, estilo e padrões visuais _(recomendado)_\n\n✏️ **Preencher manualmente** — você informa as cores e estilo você mesmo`;
            quickReplies = ["📸 Enviar exemplos", "✏️ Preencher manualmente"];
            break;
          }

          // ── STEP 1: Name + Logo ──
          if (currentStep === 1) {
            const name = extractExplicitBrandName(message) || sanitizeBrandName(message);
            if (!name) {
              brandCreationStepResponse = 1;
              replyOverride = "Preciso do **nome real** da marca para continuar. Ex: *Pulse Care*";
              break;
            }

            const { data: newBrand, error: brandErr } = await svcCriar.from("brands").insert({
              owner_user_id: userId,
              name,
              palette: [],
              visual_tone: "clean",
              fonts: { headings: "Inter", body: "Inter" },
            }).select("id, name").single();

            if (brandErr || !newBrand) {
              replyOverride = "Erro ao criar a marca. Tente novamente.";
              break;
            }

            if (imageUrls?.length > 0) {
              await svcCriar.from("brands").update({ logo_url: imageUrls[0] }).eq("id", newBrand.id);
            }

            // Go to choice step (1.5) — brand mode selection
            await updateBcState({ step: 1.5, brand_id: newBrand.id, images_received: 0, mode: null });
            replyOverride = `✅ Marca **"${newBrand.name}"** criada!${imageUrls?.length ? " Logo recebida! ✨" : ""}\n\nEscolha o **modo de criação**:\n\n📸 **Minhas fotos como fundo** — suas fotos serão usadas como background dos posts\n\n🎨 **Copiar meu estilo visual** — envie referências e a IA copia seu estilo _(recomendado)_\n\n✨ **Começar do zero** — escolha entre estilos prontos\n\n🔍 **Me inspirar em outros** — envie referências para gerar algo inspirado`;
            quickReplies = ["📸 Minhas fotos", "🎨 Copiar estilo", "✨ Do zero", "🔍 Me inspirar"];
            break;
          }

          // ── STEP 1.5: Choice — brand mode ──
          if (currentStep === 1.5 && currentBrandId) {
            // Check if user wants to rename the brand
            const renameMatch = message.match(/(?:errei|errado|corrigir|renomear|mudar|trocar|alterar)\s*(?:o\s+)?(?:nome)?[^a-záéíóúãõâêîôûç]*(?:na verdade\s*(?:é|e)\s+|(?:para|pra)\s+)?(.+)/i)
              || message.match(/(?:na verdade|o nome)\s*(?:é|e)\s+(.+)/i);
            if (renameMatch?.[1]) {
              const newName = sanitizeBrandName(renameMatch[1].trim());
              if (newName) {
                await svcCriar.from("brands").update({ name: newName }).eq("id", currentBrandId);
                replyOverride = `✅ Nome atualizado para **"${newName}"**!\n\nEscolha o **modo de criação**:\n\n📸 **Minhas fotos como fundo** — suas fotos serão usadas como background dos posts\n\n🎨 **Copiar meu estilo visual** — envie referências e a IA copia seu estilo _(recomendado)_\n\n✨ **Começar do zero** — escolha entre estilos prontos\n\n🔍 **Me inspirar em outros** — envie referências para gerar algo inspirado`;
                quickReplies = ["📸 Minhas fotos", "🎨 Copiar estilo", "✨ Do zero", "🔍 Me inspirar"];
                break;
              }
            }

            const msg = message.toLowerCase();
            const wantsPhotoBg = /\b(minhas fotos|foto.*fundo|fundo.*foto|fotos como|📸)\b/i.test(message);
            const wantsFromScratch = /\b(zero|do zero|template|começar|sistema|✨)\b/i.test(message);
            const wantsInspired = /\b(inspirar|inspiração|outros|referência.*inspirar|liberdade|🔍)\b/i.test(message);
            const wantsStyleCopy = /\b(copiar|estilo|exemplo|imagem|imagens|ia|automát|recomendar|🎨)\b/i.test(message);

            let chosenMode: string | null = null;
            if (wantsPhotoBg) chosenMode = "photo_backgrounds";
            else if (wantsFromScratch) chosenMode = "from_scratch";
            else if (wantsInspired) chosenMode = "inspired";
            else if (wantsStyleCopy) chosenMode = "style_copy";

            if (chosenMode) {
              // Set creation_mode and default_visual_style together
              const visualStyleMap: Record<string, string | null> = {
                photo_backgrounds: "photo_overlay",
                style_copy: "ai_background",
                inspired: "ai_background",
                from_scratch: null, // user chooses each time
              };
              await svcCriar.from("brands").update({
                creation_mode: chosenMode,
                default_visual_style: visualStyleMap[chosenMode] ?? null,
              }).eq("id", currentBrandId);

              if (chosenMode === "photo_backgrounds") {
                await updateBcState({ step: 3, brand_id: currentBrandId, images_received: 0, mode: "photo_backgrounds" });
                replyOverride = `📸 Ótimo! Envie as **fotos que quer usar como fundo** dos seus posts.\n\nEnvie de **1 a 10 fotos** usando o botão 📎.\nEssas imagens serão usadas diretamente como background!\n\n_Digite **pronto** quando terminar._`;
                break;
              }

              if (chosenMode === "style_copy") {
                await updateBcState({ step: 2.5, brand_id: currentBrandId, images_received: 0, mode: "examples" });
                replyOverride = `Ótima escolha! Antes de enviar os exemplos, uma pergunta rápida (opcional):\n\n🎨 **Tem alguma preferência visual para seus posts?**\nEx: "quero mockups de celular", "texto dentro de cards", "fundo com gradiente"\n\nOu digite **pular** para ir direto aos exemplos.`;
                quickReplies = ["Pular", "Mockups de celular", "Texto em cards", "Fundos com foto", "Elementos abstratos"];
                break;
              }

              if (chosenMode === "from_scratch") {
                await updateBcState({ step: 5, brand_id: currentBrandId, images_received: 0, mode: "from_scratch" });
                replyOverride = `✨ Vamos começar do zero!\n\nEscolha um estilo visual base:\n\n1️⃣ **Minimalista** — limpo, elegante\n2️⃣ **Colorido** — vibrante, chamativo\n3️⃣ **Sofisticado** — tons escuros, premium\n4️⃣ **Moderno** — gradientes, tech\n5️⃣ **Orgânico** — texturas naturais`;
                quickReplies = ["1️⃣ Minimalista", "2️⃣ Colorido", "3️⃣ Sofisticado", "4️⃣ Moderno", "5️⃣ Orgânico"];
                break;
              }

              if (chosenMode === "inspired") {
                await updateBcState({ step: 2.5, brand_id: currentBrandId, images_received: 0, mode: "inspired" });
                replyOverride = `🔍 Legal! Antes de enviar referências, uma pergunta rápida (opcional):\n\n🎨 **Tem alguma preferência visual?**\nEx: "minimalista", "cores vibrantes", "editorial"\n\nOu digite **pular** para ir direto.`;
                quickReplies = ["Pular", "Minimalista", "Cores vibrantes", "Editorial", "Dark mode"];
                break;
              }
            }

            brandCreationStepResponse = 1.5;
            replyOverride = `Escolha uma das opções abaixo para continuar:\n\n📸 **Minhas fotos como fundo**\n🎨 **Copiar meu estilo visual** _(recomendado)_\n✨ **Começar do zero**\n🔍 **Me inspirar em outros**\n\n_Se quiser corrigir o nome da marca, diga: "o nome é ..."_`;
            quickReplies = ["📸 Minhas fotos", "🎨 Copiar estilo", "✨ Do zero", "🔍 Me inspirar"];
            break;
          }

          // ── STEP 2.5: Visual Preferences (optional) ──
          if (currentStep === 2.5 && currentBrandId) {
            const skipPrefs = /\b(pular|skip|próximo|proximo|continuar|não|nao|sem preferência|padrão|padrao)\b/i.test(message);

            if (!skipPrefs) {
              // Parse user preferences via AI
              const prefResp = await aiGatewayFetch({
                  model: "google/gemini-2.5-flash-lite",
                  messages: [{
                    role: "user",
                    content: `O usuário descreveu preferências visuais para sua marca: "${message}"\n\nExtraia em JSON:\n{\n  "phone_mockup": true/false/null,\n  "body_in_card": true/false/null,\n  "inner_frame": true/false/null,\n  "waves": true/false/null,\n  "abstract_elements": true/false/null,\n  "photo_backgrounds": true/false/null,\n  "gradient_backgrounds": true/false/null,\n  "preferred_bg_mode": "gradient"|"photo"|"solid"|"illustration"|null,\n  "custom_notes": "observação livre do usuário ou null"\n}\n\nRegras:\n- phone_mockup = mockups de celular/notebook/dispositivo\n- body_in_card = texto dentro de caixas/cards\n- inner_frame = moldura decorativa ao redor\n- waves = elementos ondulados/curvos\n- abstract_elements = formas abstratas/geométricas\n- photo_backgrounds = fotos como fundo\n- gradient_backgrounds = gradientes como fundo\n- null = usuário não mencionou\n- custom_notes = qualquer preferência que não se encaixe nos campos acima\n\nResponda APENAS JSON.`,
                  }],
                });

              let visualPrefs: Record<string, any> = {};
              if (prefResp.ok) {
                const d = await prefResp.json();
                const raw = d.choices?.[0]?.message?.content || "";
                const m = raw.match(/\{[\s\S]*\}/);
                if (m) {
                  visualPrefs = JSON.parse(m[0]);
                  // Remove null values
                  for (const key of Object.keys(visualPrefs)) {
                    if (visualPrefs[key] === null) delete visualPrefs[key];
                  }
                }
              }

              if (Object.keys(visualPrefs).length > 0) {
                await svcCriar.from("brands").update({ visual_preferences: visualPrefs }).eq("id", currentBrandId);
                console.log(`[ai-chat] CRIAR_MARCA step 2.5: saved visual_preferences:`, JSON.stringify(visualPrefs));
              }
            }

            await updateBcState({ step: 3, brand_id: currentBrandId, images_received: 0 });
            replyOverride = `${skipPrefs ? "Ok, vamos usar as configurações padrão! " : "✅ Preferências visuais salvas! "}📸\n\nAgora envie de **3 a 8 exemplos** de posts, stories ou carrosséis que você já criou ou que gosta.\nQuanto mais exemplos, melhor a IA entende seu estilo visual!\n\n_Use o botão 📎 para enviar imagens ou digite **pronto** quando terminar._`;
            break;
          }

          // ── STEP 2: Colors + Visual Tone ──
          if (currentStep === 2 && currentBrandId) {
            const colorResp = await aiGatewayFetch({
                model: "google/gemini-2.5-flash",
                messages: [{
                  role: "user",
                  content: `O usuário descreveu cores e estilo para sua marca: "${message}"\nExtraia as cores em hex e o tom visual. Se descreveu com palavras (ex: "azul escuro"), converta para hex.\nJSON: { "colors": ["#hex1", "#hex2"], "visual_tone": "clean|editorial|tech|luxury|playful|organic" }\nTons: clean=minimalista, editorial=editorial, tech=futurista/moderno, luxury=sofisticado/elegante, playful=jovem/divertido, organic=natural.\nResponda APENAS JSON.`,
                }],
              });

            let colors: string[] = [];
            let tone = "clean";
            if (colorResp.ok) {
              const d = await colorResp.json();
              const raw = d.choices?.[0]?.message?.content || "";
              const m = raw.match(/\{[\s\S]*\}/);
              if (m) {
                const parsed = JSON.parse(m[0]);
                colors = parsed.colors || [];
                tone = parsed.visual_tone || "clean";
              }
            }

            const palette = colors.map((c) => ({ hex: c }));
            await svcCriar.from("brands").update({
              palette: palette.length > 0 ? palette : [{ hex: "#1a1a2e" }, { hex: "#16213e" }],
              visual_tone: tone,
            }).eq("id", currentBrandId);

            await updateBcState({ step: 2.5, brand_id: currentBrandId, images_received: 0 });
            const colorDisplay = colors.length > 0 ? colors.join(", ") : "paleta padrão";
            replyOverride = `✅ Identidade visual salva!\n🎨 Cores: ${colorDisplay}\n🖌️ Estilo: ${tone}\n\nAntes de enviar exemplos, uma pergunta rápida (opcional):\n\n🎨 **Tem alguma preferência visual para seus posts?**\nEx: "quero mockups de celular", "texto dentro de cards", "fundo com gradiente"\n\nOu digite **pular** para ir direto aos exemplos.`;
            quickReplies = ["Pular", "Mockups de celular", "Texto em cards", "Fundos com foto", "Elementos abstratos"];
            break;
          }

          // ── STEP 3: Reference Images ──
          if (currentStep === 3 && currentBrandId) {
            const isPronto = /\b(pronto|pront[oa]|ponto|finalizar|done|gerar|analisar|continuar)\b/i.test(message);

            const bcMode = brandCreationState?.mode || "examples";
            const imgPurpose = bcMode === "photo_backgrounds" ? "background" : "reference";

            if (imageUrls?.length > 0) {
              for (const iurl of imageUrls) {
                await svcCriar.from("brand_examples").insert({
                  brand_id: currentBrandId,
                  image_url: iurl,
                  type: "post",
                  subtype: imgPurpose,
                  purpose: imgPurpose,
                });
                imagesReceived++;
              }
              await updateBcState({ step: 3, brand_id: currentBrandId, images_received: imagesReceived });
              console.log(`[ai-chat] CRIAR_MARCA step 3: received ${imageUrls.length} images (purpose=${imgPurpose}), total: ${imagesReceived}`);

              const minImages = bcMode === "photo_backgrounds" ? 1 : 3;
              if (imagesReceived < 10 && !isPronto) {
                replyOverride = `✅ ${imagesReceived === 1 ? "1 imagem recebida" : `${imagesReceived} imagens recebidas`}! ${imagesReceived >= minImages ? "Pode enviar mais ou digitar **pronto** para continuar." : `Pode enviar mais (mínimo ${minImages}).`}`;
                break;
              }
            }

            if (isPronto || imagesReceived >= 10) {
              if (imagesReceived < 1) {
                brandCreationStepResponse = 3;
                replyOverride = "Envie pelo menos **1 imagem** para continuar. 📸";
                break;
              }

              // photo_backgrounds: no analysis needed, brand is ready immediately
              if (bcMode === "photo_backgrounds") {
                await clearBcState();
                replyOverride = `✅ Perfeito! ${imagesReceived} ${imagesReceived === 1 ? "foto salva" : "fotos salvas"} como fundo!\n\nSua marca está pronta para criar conteúdo. 🎉\nSuas fotos serão usadas automaticamente como background dos posts.\n\nDigite **criar conteúdo** ou clique abaixo para começar!`;
                quickReplies = ["📱 Criar um post", "📚 Criar carrossel", "📱 Criar story"];
                break;
              }

              // style_copy / inspired: run analysis
              await updateBcState({ step: 4, brand_id: currentBrandId, images_received: imagesReceived });

              // Return immediately — client will fire CRIAR_MARCA_ANALYZE in a separate request
              const imgLabel = bcMode === "photo_backgrounds" ? "fotos" : "referências";
              replyOverride = `🔍 Analisando suas ${imagesReceived} ${imgLabel} e criando sua identidade visual...\n\nIsso leva cerca de 1 minuto. Você receberá uma notificação aqui quando estiver pronto! ✨`;
              brandCreationStepResponse = 4;
              actionResult = { brand_id: currentBrandId, trigger_analyze: true };
              break;
            }

            if (!imageUrls?.length && !isPronto) {
              // Skip duplicate reply if this is an auto-generated image upload message
              if (/^(Enviando|📎)\s+\d+\s+imagem/i.test(message)) {
                break;
              }
              brandCreationStepResponse = 3;
              const minImages = bcMode === "photo_backgrounds" ? 1 : 3;
              replyOverride = imagesReceived > 0
                ? `Você já enviou ${imagesReceived} ${imagesReceived === 1 ? "imagem" : "imagens"}. Envie mais ou digite **pronto** para ${imagesReceived >= minImages ? "continuar" : `completar (mínimo ${minImages})`}. 📸`
                : bcMode === "photo_backgrounds"
                  ? `Envie suas fotos usando o botão 📎 abaixo. Essas imagens serão usadas como fundo dos posts!`
                  : `Envie exemplos de posts, stories ou carrosséis usando o botão 📎 abaixo. Mínimo 3 imagens para melhor resultado!`;
            }
            break;
          }

          // Step 4: Already analyzing
          if (currentStep === 4) {
            replyOverride = "Ainda estou analisando suas referências... ⏳ Aguarde um momento.";
            break;
          }

          // ── STEP 5: From Scratch — style gallery ──
          if (currentStep === 5 && currentBrandId) {
            const styleMap: Record<string, { visual_tone: string; palette: any[] }> = {
              "1": { visual_tone: "clean", palette: [{ hex: "#FFFFFF" }, { hex: "#1A1A2E" }, { hex: "#E2E2E2" }] },
              "minimalista": { visual_tone: "clean", palette: [{ hex: "#FFFFFF" }, { hex: "#1A1A2E" }, { hex: "#E2E2E2" }] },
              "2": { visual_tone: "playful", palette: [{ hex: "#FF6B6B" }, { hex: "#4ECDC4" }, { hex: "#FFE66D" }, { hex: "#2C3E50" }] },
              "colorido": { visual_tone: "playful", palette: [{ hex: "#FF6B6B" }, { hex: "#4ECDC4" }, { hex: "#FFE66D" }, { hex: "#2C3E50" }] },
              "3": { visual_tone: "luxury", palette: [{ hex: "#1A1A2E" }, { hex: "#C9A96E" }, { hex: "#F5F5F0" }] },
              "sofisticado": { visual_tone: "luxury", palette: [{ hex: "#1A1A2E" }, { hex: "#C9A96E" }, { hex: "#F5F5F0" }] },
              "4": { visual_tone: "tech", palette: [{ hex: "#0F0F23" }, { hex: "#00D4FF" }, { hex: "#7B2FFF" }, { hex: "#FFFFFF" }] },
              "moderno": { visual_tone: "tech", palette: [{ hex: "#0F0F23" }, { hex: "#00D4FF" }, { hex: "#7B2FFF" }, { hex: "#FFFFFF" }] },
              "5": { visual_tone: "organic", palette: [{ hex: "#5D4E37" }, { hex: "#8B9D77" }, { hex: "#F5E6D3" }, { hex: "#2D3B2D" }] },
              "orgânico": { visual_tone: "organic", palette: [{ hex: "#5D4E37" }, { hex: "#8B9D77" }, { hex: "#F5E6D3" }, { hex: "#2D3B2D" }] },
              "organico": { visual_tone: "organic", palette: [{ hex: "#5D4E37" }, { hex: "#8B9D77" }, { hex: "#F5E6D3" }, { hex: "#2D3B2D" }] },
            };

            const key = message.replace(/[️⃣\uFE0F\u20E3]/g, "").trim().toLowerCase();
            const match = styleMap[key] || styleMap[key.charAt(0)];

            if (match) {
              await svcCriar.from("brands").update({
                visual_tone: match.visual_tone,
                palette: match.palette,
              }).eq("id", currentBrandId);

              await clearBcState();
              replyOverride = `✅ Estilo **${match.visual_tone}** aplicado!\n\nSua marca está pronta. 🎉\n\nQuer criar um post agora?`;
              quickReplies = ["📱 Criar um post", "📚 Criar carrossel", "📱 Criar story"];
              break;
            }

            brandCreationStepResponse = 5;
            replyOverride = `Não reconheci o estilo. Escolha um número:\n\n1️⃣ Minimalista\n2️⃣ Colorido\n3️⃣ Sofisticado\n4️⃣ Moderno\n5️⃣ Orgânico`;
            quickReplies = ["1️⃣ Minimalista", "2️⃣ Colorido", "3️⃣ Sofisticado", "4️⃣ Moderno", "5️⃣ Orgânico"];
            break;
          }

        } catch (e: any) {
          console.error("[ai-chat] CRIAR_MARCA error:", e?.message);
          replyOverride = "Erro ao processar criação da marca. Tente novamente.";
        }
        break;
      }

      case "CRIAR_MARCA_ANALYZE": {
        // Dedicated intent for brand analysis — runs in its own edge function invocation
        // so the runtime stays alive until completion (no fire-and-forget).
        const analyzeBrandId = generationParams?.brandId;
        if (!analyzeBrandId) {
          replyOverride = "brandId é obrigatório para CRIAR_MARCA_ANALYZE.";
          break;
        }

        const svcAnalyze = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        const analyzeHeaders = { Authorization: authHeader!, "Content-Type": "application/json", apikey: supabaseAnonKey };

        let templateCount = 0;
        let analyzeOk = false;

        const fetchWithTimeout = async (url: string, opts: RequestInit, label: string) => {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 60000);
          try {
            const resp = await fetch(url, { ...opts, signal: controller.signal });
            clearTimeout(timer);
            return resp;
          } catch (err: any) {
            clearTimeout(timer);
            if (err.name === "AbortError") {
              console.error(`[CRIAR_MARCA_ANALYZE] timeout em ${label} (60s)`);
            } else {
              console.error(`[CRIAR_MARCA_ANALYZE] ${label} error:`, err.message);
            }
            return null;
          }
        };

        // 1. analyze-brand-examples
        try {
          const analyzeResp = await fetchWithTimeout(
            `${supabaseUrl}/functions/v1/analyze-brand-examples`,
            { method: "POST", headers: analyzeHeaders, body: JSON.stringify({ brandId: analyzeBrandId }) },
            "analyze-brand-examples",
          );
          if (analyzeResp?.ok) {
            const analyzeData = await analyzeResp.json();
            console.log(`[CRIAR_MARCA_ANALYZE] analyze done, preset: ${analyzeData?.styleGuide?.style_preset}`);
            analyzeOk = true;
            const extractedPalette = analyzeData?.styleGuide?.brand_tokens?.palette_roles;
            if (extractedPalette) {
              const paletteArray = Object.values(extractedPalette)
                .filter((c: any) => typeof c === "string" && c.startsWith("#"))
                .map((c: any) => ({ hex: c }));
              if (paletteArray.length > 0) {
                await svcAnalyze.from("brands").update({ palette: paletteArray }).eq("id", analyzeBrandId);
              }
            }
          } else {
            console.error(`[CRIAR_MARCA_ANALYZE] analyze failed: ${analyzeResp?.status || "no response"}`);
          }
        } catch (err: any) {
          console.error("[CRIAR_MARCA_ANALYZE] analyze-brand-examples error:", err?.message);
        }

        // 2. generate-template-sets
        try {
          console.log(`[CRIAR_MARCA_ANALYZE] generating template sets`);
          const genTsResp = await fetchWithTimeout(
            `${supabaseUrl}/functions/v1/generate-template-sets`,
            { method: "POST", headers: analyzeHeaders, body: JSON.stringify({ brandId: analyzeBrandId }) },
            "generate-template-sets",
          );
          if (genTsResp?.ok) {
            const genTsData = await genTsResp.json();
            templateCount = genTsData?.created?.length || genTsData?.templateSets?.length || 1;
            console.log(`[CRIAR_MARCA_ANALYZE] template sets generated: ${templateCount}`);
          } else {
            console.error(`[CRIAR_MARCA_ANALYZE] generate-template-sets failed: ${genTsResp?.status || "no response"}`);
          }
        } catch (err: any) {
          console.error("[CRIAR_MARCA_ANALYZE] generate-template-sets error:", err?.message);
        }

        // 3. ALWAYS clear brand_creation state
        try {
          await svcAnalyze.from("ai_user_context").update({
            extra_context: { brand_creation: null },
          }).eq("user_id", userId);
        } catch (e: any) {
          console.error("[CRIAR_MARCA_ANALYZE] clearBcState error:", e?.message);
        }

        // 4. ALWAYS notify user via chat_messages (Realtime)
        try {
          const { data: finalBrand } = await svcAnalyze.from("brands")
            .select("name, palette, visual_tone, style_guide")
            .eq("id", analyzeBrandId).single();

          const paletteColors = ((finalBrand?.palette as any[]) || [])
            .map((c: any) => typeof c === "string" ? c : c?.hex || "").filter(Boolean);
          const detectedPreset = (finalBrand?.style_guide as any)?.style_preset || "personalizado";
          const statusNote = !analyzeOk ? "\n\n_A análise automática teve problemas, mas sua marca está pronta para uso._" : "";

          await svcAnalyze.from("chat_messages").insert({
            user_id: userId,
            role: "assistant",
            content: `✅ Sua marca **${finalBrand?.name || ""}** está pronta!${statusNote}\n\n🎨 **Paleta:** ${paletteColors.join(", ") || "padrão"}\n🖌️ **Estilo detectado:** ${detectedPreset}\n📐 **Templates criados:** ${templateCount}\n\nQuer criar um post usando essa marca agora? 🚀`,
            intent: "CRIAR_MARCA_DONE",
            metadata: {
              brand_id: analyzeBrandId,
              action_result: { navigate_to: `/brands/${analyzeBrandId}/edit` },
              quick_replies: ["📱 Criar um post", "📚 Criar carrossel", "🎨 Editar marca"],
            },
          });
          console.log(`[CRIAR_MARCA_ANALYZE] done, notified user (analyzeOk=${analyzeOk})`);
        } catch (notifyErr: any) {
          console.error("[CRIAR_MARCA_ANALYZE] failed to notify user:", notifyErr?.message);
          await svcAnalyze.from("chat_messages").insert({
            user_id: userId,
            role: "assistant",
            content: `⚠️ A marca foi criada, mas houve um erro na análise. Você pode editar manualmente.`,
            intent: "CRIAR_MARCA_DONE",
            metadata: { brand_id: analyzeBrandId, action_result: { navigate_to: `/brands/${analyzeBrandId}/edit` } },
          }).then(() => {});
        }

        // Return minimal — notification goes via Realtime
        replyOverride = "Análise em andamento...";
        break;
      }

      case "ATUALIZAR_PERFIL": {
        try {
          // Use AI to extract what the user wants to update
          const extractResp = await aiGatewayFetch({
              model: "google/gemini-2.5-flash-lite",
              messages: [{ role: "user", content: `O usuário quer atualizar seu perfil. Extraia EXATAMENTE o que ele quer mudar.

Se ele NÃO especificou o novo valor (ex: "quero mudar meu nicho" sem dizer para qual), retorne:
{"field":"unknown","value":"","action":"ask"}

Se ele especificou (ex: "meu nicho agora é Marketing Digital"), retorne:
{"field":"business_niche","value":"Marketing Digital","action":"set"}

Campos possíveis: business_niche, brand_voice, content_topics, instagram_handle
Ações: set (definir), add (adicionar a lista), remove (remover de lista), ask (precisa perguntar)

NUNCA invente um valor. Se não está claro, use action "ask".

Mensagem: "${message}"` }],
            });
          if (extractResp.ok) {
            const extractData = await extractResp.json();
            const raw = extractData.choices?.[0]?.message?.content || "";
            const jsonMatch = raw.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              const { field, value, action } = parsed;
              const allowedFields = ["business_niche", "brand_voice", "content_topics", "instagram_handle"];
              if (action === "ask" || !value || value === "novo valor") {
                const fieldLabels: Record<string, string> = { business_niche: "nicho", brand_voice: "tom de voz", content_topics: "temas", instagram_handle: "Instagram" };
                replyOverride = `Para qual ${fieldLabels[field] || "valor"} você quer mudar? Me diga especificamente, por exemplo: "meu nicho é Marketing Digital".`;
              } else if (field && allowedFields.includes(field) && value) {
                if (field === "content_topics") {
                  const { data: ctxData } = await supabase.from("ai_user_context").select("content_topics").eq("user_id", userId).maybeSingle();
                  let topics = ctxData?.content_topics || [];
                  if (action === "add") {
                    const newTopics = value.split(/[,;]/).map((t: string) => t.trim()).filter(Boolean);
                    topics = [...new Set([...topics, ...newTopics])];
                  } else if (action === "remove") {
                    topics = topics.filter((t: string) => !t.toLowerCase().includes(value.toLowerCase()));
                  } else {
                    topics = value.split(/[,;]/).map((t: string) => t.trim()).filter(Boolean);
                  }
                  await supabase.from("ai_user_context").update({ content_topics: topics }).eq("user_id", userId);
                  replyOverride = `Pronto! Atualizei seus temas de conteúdo: ${topics.join(", ")}. ✅\nOs próximos conteúdos já vão usar esse contexto.`;
                } else {
                  await supabase.from("ai_user_context").update({ [field]: value }).eq("user_id", userId);
                  const fieldLabels: Record<string, string> = { business_niche: "nicho", brand_voice: "tom de voz", instagram_handle: "Instagram" };
                  replyOverride = `Pronto! Atualizei seu ${fieldLabels[field] || field} para "${value}". ✅\nOs próximos conteúdos já vão usar esse contexto.`;
                }
              } else {
                replyOverride = "Não consegui identificar o que você quer atualizar. Tente algo como: \"meu nicho agora é Marketing Digital\" ou \"adiciona Vendas nos meus temas\".";
              }
            }
          }
          if (!replyOverride) {
            replyOverride = "Não consegui processar a atualização. Tente ser mais específico, por exemplo: \"meu nicho é Tecnologia\".";
          }
        } catch (e: any) {
          console.error("[ai-chat] ATUALIZAR_PERFIL error:", e?.message);
          replyOverride = "Erro ao atualizar perfil. Tente novamente.";
        }
        break;
      }
    }

    // ── Generate AI response for free conversation ──
    let reply: string;

    if (replyOverride) {
      reply = replyOverride;
    } else {
      const aiMessages = [
        { role: "system", content: systemPrompt },
        ...(history || []).map((m: any) => ({ role: m.role, content: m.content })),
        { role: "user", content: message },
      ];

      const aiResponse = await aiGatewayFetch({
          model: "google/gemini-3-flash-preview",
          messages: aiMessages,
        });

      if (!aiResponse.ok) {
        if (aiResponse.status === 429) {
          return new Response(
            JSON.stringify({ error: "Rate limit excedido. Tente novamente em alguns segundos." }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        if (aiResponse.status === 402) {
          return new Response(
            JSON.stringify({ error: "Créditos insuficientes. Adicione créditos na sua conta." }),
            { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        const errorText = await aiResponse.text();
        console.error("[ai-chat] AI error:", aiResponse.status, errorText);
        throw new Error(`AI request failed: ${aiResponse.status}`);
      }

      const aiData = await aiResponse.json();
      reply = aiData.choices?.[0]?.message?.content || "Desculpe, não consegui processar sua mensagem.";
    }

    // ── Contextual tips ──
    const TIPS = [
      "\n\n💡 Sabia que você pode colar um link aqui e eu crio um post?",
      "\n\n📅 Quer ver o que está agendado? É só me perguntar!",
      "\n\n🎨 Posso criar posts, carrosséis ou stories — é só pedir!",
      "\n\n🔗 Cole qualquer link de notícia e eu transformo em conteúdo!",
    ];

    if (detectedIntent === "CONVERSA_LIVRE") {
      const wordCount = message.trim().split(/\s+/).length;
      const historyHasTip = (history || []).some((m: any) => m.role === "assistant" && /💡|🔗 Cole qualquer/.test(m.content));
      if (wordCount < 10 && !historyHasTip) {
        const randomTip = TIPS[Math.floor(Math.random() * TIPS.length)];
        reply += randomTip;
      }
    }

    // ── Save messages ──
    // Don't save internal intent names as user messages — they're system triggers, not real user input
    const INTERNAL_INTENTS = ["PIPELINE_BACKGROUND", "INICIAR_GERACAO", "GERAR_CONTEUDO", "CRIAR_MARCA_ANALYZE", "PIPELINE_DONE"];
    const isInternalMessage = INTERNAL_INTENTS.includes(message) || INTERNAL_INTENTS.includes(message?.trim());

    try {
      const messagesToInsert: any[] = [];

      // Only save user message if it's real user input (not an internal trigger)
      if (!isInternalMessage) {
        messagesToInsert.push({ user_id: userId, role: "user", content: message });
      }

      // Always save assistant reply (unless it's empty or just echoing the intent)
      if (reply && !INTERNAL_INTENTS.includes(reply.trim())) {
        messagesToInsert.push({
          user_id: userId,
          role: "assistant",
          content: reply,
          intent: detectedIntent,
          metadata: actionResult ? { action_result: actionResult, quick_replies: quickReplies } : quickReplies ? { quick_replies: quickReplies } : {},
        });
      }

      if (messagesToInsert.length > 0) {
        await supabase.from("chat_messages").insert(messagesToInsert);
      }
    } catch (saveErr) {
      console.error("[ai-chat] Error saving messages:", saveErr);
    }

    return new Response(
      JSON.stringify({
        reply,
        intent: detectedIntent,
        action_result: actionResult,
        quick_replies: quickReplies,
        brand_creation_step: brandCreationStepResponse,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("[ai-chat] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
