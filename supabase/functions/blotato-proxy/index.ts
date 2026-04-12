/**
 * blotato-proxy — Proxy for Blotato visual template API
 * Actions: create_visual (with server-side polling), list_templates
 *
 * Blotato API: https://backend.blotato.com/v2
 * Templates de texto (tweet, quote, tutorial) = 0 créditos (ilimitado)
 * Templates com IA (infográficos, vídeo) = 1-1250 créditos
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BLOTATO_BASE = "https://backend.blotato.com/v2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── Template ID registry ────────────────────────────────────────
const TEMPLATES: Record<string, string> = {
  // Free (0 credits) — text/layout templates
  "tweet-minimal": "/base/v2/tweet-card/ba413be6-a840-4e60-8fd6-0066d3b427df/v1",
  "tweet-photo": "/base/v2/tweet-card/9714ae5c-7e6b-4878-be4a-4b1ba5d0cd66/v1",
  "tutorial-monocolor": "/base/v2/tutorial-carousel/e095104b-e6c5-4a81-a89d-b0df3d7c5baf/v1",
  "tutorial-flat": "/base/v2/tutorial-carousel/2491f97b-1b47-4efa-8b96-8c651fa7b3d5/v1",
  "quote-paper": "/base/v2/quote-card/f941e306-76f7-45da-b3d9-7463af630e91/v1",
  "quote-mono": "/base/v2/quote-card/77f65d2b-48cc-4adb-bfbb-5bc86f8c01bd/v1",
  // Credit-based — infographics (AI image generation)
  "infographic-newspaper": "07a5b5c5-387c-49e3-86b1-de822cd2dfc7",
  "infographic-chalkboard": "fcd64907-b103-46f8-9f75-51b9d1a522f5",
  "infographic-whiteboard": "ae868019-820d-434c-8fe1-74c9da99129a",
  "infographic-manga": "49c61370-a706-4b82-98f7-62d557d1c66d",
  "infographic-billboard": "76b3b959-bdbe-440d-8428-984219353f18",
  "infographic-tv-news": "8800be71-52df-4ac7-ac94-df9d8a494d0f",
  "infographic-steampunk": "7b7104f1-d277-4993-ad3a-e5883c4b776d",
  "infographic-graffiti": "3598483b-c148-4276-a800-eede85c1c62f",
  // Credit-based — video
  "video-story": "/base/v2/ai-story-video/5903fe43-514d-40ee-a060-0d6628c5f8fd/v1",
  // Credit-based — slideshow video
  "image-slideshow": "/base/v2/image-slideshow/5903b592-1255-43b4-b9ac-f8ed7cbf6a5f/v1",
  // Free — combine clips (0 credits)
  "combine-clips": "/base/v2/combine-clips/c306ae43-1dcc-4f45-ac2b-88e75430ffd8/v1",
  // Credit-based — product placement
  "product-placement": "f524614b-ba01-448c-967a-ce518c52a700",
  // Credit-based — before/after comparison
  "before-after": "/base/v2/images-with-text/c9892c3b-fa75-4ade-821a-a50ff8456230/v1",
};

const respond = (body: any, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// ── Poll for visual completion ──────────────────────────────────
async function pollVisualStatus(
  apiKey: string,
  creationId: string,
  maxWaitMs = 45000,
  intervalMs = 2500,
): Promise<{ status: string; imageUrls: string[]; mediaUrl: string | null }> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const resp = await fetch(`${BLOTATO_BASE}/videos/creations/${creationId}`, {
      headers: { "blotato-api-key": apiKey },
    });
    if (resp.ok) {
      const data = await resp.json();
      const item = data.item || data;
      if (item.status === "done") {
        return {
          status: "done",
          imageUrls: item.imageUrls || [],
          mediaUrl: item.mediaUrl || null,
        };
      }
      if (item.status === "failed" || item.status === "error") {
        return { status: "failed", imageUrls: [], mediaUrl: null };
      }
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return { status: "timeout", imageUrls: [], mediaUrl: null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, templateKey, templateId: rawTemplateId, prompt, inputs } = body;

    // Auth — accept internal calls (service role) or user JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return respond({ error: "Unauthorized" }, 401);

    const blotatoApiKey = Deno.env.get("BLOTATO_API_KEY");
    if (!blotatoApiKey) return respond({ error: "BLOTATO_API_KEY not configured" }, 500);

    // ── LIST TEMPLATES ──
    if (action === "list_templates") {
      const resp = await fetch(
        `${BLOTATO_BASE}/videos/templates?fields=id,description,inputs`,
        { headers: { "blotato-api-key": blotatoApiKey } },
      );
      if (!resp.ok) {
        const err = await resp.text();
        return respond({ error: `Blotato API error: ${err.substring(0, 200)}` }, 502);
      }
      const data = await resp.json();
      return respond(data);
    }

    // ── CREATE VISUAL ──
    // Resolve template ID: use templateKey (friendly name) or raw templateId
    const templateId = templateKey ? TEMPLATES[templateKey] : rawTemplateId;
    if (!templateId) {
      return respond({
        error: `Unknown template: ${templateKey || rawTemplateId}`,
        available: Object.keys(TEMPLATES),
      }, 400);
    }

    console.log(`[blotato-proxy] Creating visual: template=${templateKey || templateId}, prompt=${(prompt || "").substring(0, 100)}`);

    const createResp = await fetch(`${BLOTATO_BASE}/videos/from-templates`, {
      method: "POST",
      headers: {
        "blotato-api-key": blotatoApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        templateId,
        prompt: prompt || "",
        inputs: inputs || {},
        render: true,
      }),
    });

    if (!createResp.ok) {
      const errText = await createResp.text();
      console.error(`[blotato-proxy] Create failed: ${createResp.status} ${errText.substring(0, 300)}`);
      return respond({ error: `Blotato create failed: ${errText.substring(0, 200)}` }, 502);
    }

    const createData = await createResp.json();
    const creationId = createData.item?.id || createData.id;
    if (!creationId) {
      console.error("[blotato-proxy] No creation ID in response:", JSON.stringify(createData).substring(0, 300));
      return respond({ error: "No creation ID returned from Blotato" }, 502);
    }

    console.log(`[blotato-proxy] Creation started: id=${creationId}, polling...`);

    // Video templates need longer polling (up to 120s vs 45s for images)
    const isVideoTemplate = templateKey?.startsWith("video-") || templateId.includes("ai-story-video") || templateId.includes("ai-selfie-video");
    const pollTimeout = isVideoTemplate ? 120000 : 45000;
    const result = await pollVisualStatus(blotatoApiKey, creationId, pollTimeout);

    console.log(`[blotato-proxy] Result: status=${result.status}, images=${result.imageUrls.length}, mediaUrl=${!!result.mediaUrl}`);

    if (result.status === "done" && (result.imageUrls.length > 0 || result.mediaUrl)) {
      return respond({
        status: "done",
        creationId,
        imageUrls: result.imageUrls,
        mediaUrl: result.mediaUrl,
        templateKey: templateKey || null,
      });
    }

    return respond({
      status: result.status,
      creationId,
      imageUrls: [],
      error: result.status === "timeout"
        ? "Visual generation timed out (45s). Try again."
        : "Visual generation failed.",
    }, result.status === "timeout" ? 504 : 502);
  } catch (err: any) {
    console.error("[blotato-proxy] Error:", err?.message, err?.stack);
    return respond({ error: err?.message || "Internal error" }, 500);
  }
});
