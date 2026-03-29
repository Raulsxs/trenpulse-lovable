import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function waitForMediaContainer(
  igUserId: string,
  containerId: string,
  accessToken: string,
  maxAttempts = 30,
): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${containerId}?fields=status_code&access_token=${accessToken}`,
    );
    const data = await res.json();

    if (data.status_code === "FINISHED") return true;
    if (data.status_code === "ERROR") {
      console.error("Container error:", data);
      return false;
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return false;
}

// ── Render composite images (background + text overlay) with batching ──
async function renderCompositeImages(
  slides: any[],
  brandSnapshot: any,
  contentId: string,
  contentType: string,
): Promise<string[] | null> {
  try {
    const hasTextContent = slides.some(
      (s: any) =>
        s.overlay?.headline ||
        s.overlay?.body ||
        s.headline ||
        s.body ||
        s.overlay?.bullets?.length,
    );

    if (!hasTextContent) {
      console.log("No text overlay content found, skipping composite render");
      return null;
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const dims = {
      width: 1080,
      height: contentType === "story" ? 1920 : 1350,
    };

    console.log(`Calling render-slide-image in batches of 2 for ${slides.length} slides…`);

    const allUrls: string[] = [];
    const BATCH_SIZE = 2;

    for (let offset = 0; offset < slides.length; offset += BATCH_SIZE) {
      const batch = slides.slice(offset, offset + BATCH_SIZE);
      const renderRes = await fetch(
        `${supabaseUrl}/functions/v1/render-slide-image`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            slides: batch,
            brand_snapshot: brandSnapshot,
            content_id: contentId,
            dimensions: dims,
            slide_offset: offset,
          }),
        },
      );

      const renderData = await renderRes.json();

      if (renderData.success && renderData.composite_urls?.length > 0) {
        allUrls.push(...renderData.composite_urls.filter(Boolean));
      } else {
        console.warn(`Batch at offset ${offset} failed:`, renderData.error);
      }
    }

    if (allUrls.length > 0) {
      console.log(`Composite render OK – ${allUrls.length} images`);
      return allUrls;
    }

    console.warn("Composite render returned no URLs across all batches");
    return null;
  } catch (err) {
    console.warn("Composite render failed:", err);
    return null;
  }
}

// ── Main handler ────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { content_id, composite_urls: frontendCompositeUrls } = await req.json();

    if (!content_id) {
      return new Response(JSON.stringify({ error: "Missing content_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── Get content ──
    const { data: content, error: contentError } = await supabase
      .from("generated_contents")
      .select("*")
      .eq("id", content_id)
      .single();

    if (contentError || !content) {
      return new Response(JSON.stringify({ error: "Content not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (content.platform !== "instagram") {
      return new Response(
        JSON.stringify({ error: "Content is not for Instagram" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ── Get Instagram connection ──
    const { data: connection, error: connError } = await supabase
      .from("instagram_connections")
      .select("*")
      .eq("user_id", content.user_id)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (connError || !connection) {
      await supabase
        .from("generated_contents")
        .update({
          publish_error: "No active Instagram connection found",
          publish_attempts: (content.publish_attempts || 0) + 1,
        })
        .eq("id", content_id);

      return new Response(
        JSON.stringify({ error: "No Instagram connection" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Token expiry check
    if (
      connection.token_expires_at &&
      new Date(connection.token_expires_at) < new Date()
    ) {
      await supabase
        .from("generated_contents")
        .update({
          publish_error: "Instagram token expired. Please reconnect.",
          publish_attempts: (content.publish_attempts || 0) + 1,
        })
        .eq("id", content_id);

      return new Response(JSON.stringify({ error: "Token expired" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const igUserId = connection.instagram_user_id;
    const accessToken = connection.access_token;

    // ── Build caption ──
    let caption = content.caption || content.title;
    if (content.hashtags && content.hashtags.length > 0) {
      caption +=
        "\n\n" +
        content.hashtags
          .map((h: string) => (h.startsWith("#") ? h : `#${h}`))
          .join(" ");
    }

    // ── Collect raw image URLs from slides ──
    const slides = (content.slides as any[]) || [];
    const rawImageUrls: string[] = [];

    for (const slide of slides) {
      const url =
        slide.bg_image_url ||
        slide.background_image_url ||
        slide.image_url ||
        slide.imageUrl;
      if (url) rawImageUrls.push(url);
    }

    // Fallback to image_urls column
    if (rawImageUrls.length === 0 && content.image_urls) {
      rawImageUrls.push(...content.image_urls);
    }

    if (rawImageUrls.length === 0) {
      await supabase
        .from("generated_contents")
        .update({
          publish_error: "No images found to publish",
          publish_attempts: (content.publish_attempts || 0) + 1,
        })
        .eq("id", content_id);

      return new Response(
        JSON.stringify({ error: "No images to publish" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ── Determine final image URLs ──
    // Priority: frontend composites > pre-rendered image_urls from DB > server-side render > raw backgrounds
    let imageUrls: string[];

    // Check if slides have text content that needs compositing
    const hasTextContent = slides.some(
      (s: any) =>
        s.overlay?.headline ||
        s.overlay?.body ||
        s.headline ||
        s.body ||
        s.overlay?.bullets?.length,
    );

    if (frontendCompositeUrls && Array.isArray(frontendCompositeUrls) && frontendCompositeUrls.length > 0) {
      // Frontend already rendered pixel-perfect composites
      imageUrls = frontendCompositeUrls.filter(Boolean);
      console.log(`Using ${imageUrls.length} frontend-rendered composite images`);
    } else if (content.image_urls && content.image_urls.length > 0 && content.image_urls.length >= slides.length) {
      // Pre-rendered composites already saved in DB (from scheduling flow)
      imageUrls = content.image_urls.filter(Boolean);
      console.log(`Using ${imageUrls.length} pre-rendered composite images from DB`);
    } else if (hasTextContent) {
      // MUST render composites server-side — do NOT fall back to raw images
      const compositeUrls = await renderCompositeImages(
        slides,
        content.brand_snapshot,
        content_id,
        content.content_type,
      );

      if (!compositeUrls || compositeUrls.length === 0) {
        // Composite rendering failed — do NOT publish without text
        await supabase
          .from("generated_contents")
          .update({
            publish_error: "Composite rendering failed — text overlay could not be applied. Try publishing manually.",
            publish_attempts: (content.publish_attempts || 0) + 1,
          })
          .eq("id", content_id);

        return new Response(
          JSON.stringify({ error: "Composite rendering failed" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      imageUrls = compositeUrls;
    } else {
      // No text content — raw images are fine
      imageUrls = rawImageUrls;
    }

    console.log(
      `Publishing ${imageUrls.length} images (frontend=${!!frontendCompositeUrls})`,
    );

    // ── Publish to Instagram ──
    let mediaId: string;
    const isStory = content.content_type === "story";

    if (isStory) {
      // Story – single image, no caption, media_type STORIES
      const createRes = await fetch(
        `https://graph.facebook.com/v21.0/${igUserId}/media`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image_url: imageUrls[0],
            media_type: "STORIES",
            access_token: accessToken,
          }),
        },
      );
      const createData = await createRes.json();

      if (createData.error) {
        throw new Error(`Create story failed: ${JSON.stringify(createData.error)}`);
      }

      const ready = await waitForMediaContainer(igUserId, createData.id, accessToken);
      if (!ready) throw new Error("Story container not ready after timeout");

      const publishRes = await fetch(
        `https://graph.facebook.com/v21.0/${igUserId}/media_publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            creation_id: createData.id,
            access_token: accessToken,
          }),
        },
      );
      const publishData = await publishRes.json();

      if (publishData.error) {
        throw new Error(`Publish story failed: ${JSON.stringify(publishData.error)}`);
      }

      mediaId = publishData.id;
    } else if (imageUrls.length === 1) {
      // Single image post
      const createRes = await fetch(
        `https://graph.facebook.com/v21.0/${igUserId}/media`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image_url: imageUrls[0],
            caption,
            access_token: accessToken,
          }),
        },
      );
      const createData = await createRes.json();

      if (createData.error) {
        throw new Error(`Create media failed: ${JSON.stringify(createData.error)}`);
      }

      const ready = await waitForMediaContainer(igUserId, createData.id, accessToken);
      if (!ready) throw new Error("Media container not ready after timeout");

      const publishRes = await fetch(
        `https://graph.facebook.com/v21.0/${igUserId}/media_publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            creation_id: createData.id,
            access_token: accessToken,
          }),
        },
      );
      const publishData = await publishRes.json();

      if (publishData.error) {
        throw new Error(`Publish failed: ${JSON.stringify(publishData.error)}`);
      }

      mediaId = publishData.id;
    } else {
      // Carousel post
      const childIds: string[] = [];

      for (const url of imageUrls) {
        const childRes = await fetch(
          `https://graph.facebook.com/v21.0/${igUserId}/media`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              image_url: url,
              is_carousel_item: true,
              access_token: accessToken,
            }),
          },
        );
        const childData = await childRes.json();

        if (childData.error) {
          throw new Error(`Create carousel child failed: ${JSON.stringify(childData.error)}`);
        }

        const ready = await waitForMediaContainer(igUserId, childData.id, accessToken);
        if (!ready) throw new Error(`Carousel child ${childData.id} not ready`);

        childIds.push(childData.id);
      }

      const carouselRes = await fetch(
        `https://graph.facebook.com/v21.0/${igUserId}/media`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            media_type: "CAROUSEL",
            children: childIds.join(","),
            caption,
            access_token: accessToken,
          }),
        },
      );
      const carouselData = await carouselRes.json();

      if (carouselData.error) {
        throw new Error(`Create carousel failed: ${JSON.stringify(carouselData.error)}`);
      }

      const ready = await waitForMediaContainer(igUserId, carouselData.id, accessToken);
      if (!ready) throw new Error("Carousel container not ready");

      const publishRes = await fetch(
        `https://graph.facebook.com/v21.0/${igUserId}/media_publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            creation_id: carouselData.id,
            access_token: accessToken,
          }),
        },
      );
      const publishData = await publishRes.json();

      if (publishData.error) {
        throw new Error(`Publish carousel failed: ${JSON.stringify(publishData.error)}`);
      }

      mediaId = publishData.id;
    }

    // ── Update content status ──
    await supabase
      .from("generated_contents")
      .update({
        status: "published",
        published_at: new Date().toISOString(),
        instagram_media_id: mediaId,
        publish_error: null,
        publish_attempts: (content.publish_attempts || 0) + 1,
      })
      .eq("id", content_id);

    return new Response(
      JSON.stringify({ success: true, media_id: mediaId }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Publish error:", error);

    try {
      const { content_id } = await req.clone().json();
      if (content_id) {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );
        await supabase
          .from("generated_contents")
          .update({
            publish_error:
              error instanceof Error ? error.message : "Unknown error",
          })
          .eq("id", content_id);
      }
    } catch (_) {
      /* ignore */
    }

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
