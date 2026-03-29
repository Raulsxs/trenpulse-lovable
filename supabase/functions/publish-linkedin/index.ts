import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LINKEDIN_API_VERSION = "202603";

// ── Upload image to LinkedIn ──
async function uploadImageToLinkedIn(
  authorUrn: string,
  imageUrl: string,
  accessToken: string,
): Promise<string | null> {
  try {
    console.log(`[publish-linkedin] Uploading image: ${imageUrl.substring(0, 100)}...`);
    console.log(`[publish-linkedin] Author URN: ${authorUrn}, API version: ${LINKEDIN_API_VERSION}`);

    // Step 1: Initialize upload
    const initRes = await fetch("https://api.linkedin.com/rest/images?action=initializeUpload", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "LinkedIn-Version": LINKEDIN_API_VERSION,
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        initializeUploadRequest: {
          owner: authorUrn,
        },
      }),
    });

    const initText = await initRes.text();
    console.log(`[publish-linkedin] Init upload response [${initRes.status}]: ${initText.substring(0, 500)}`);

    if (!initRes.ok) {
      console.error(`[publish-linkedin] Init upload failed [${initRes.status}]:`, initText);
      return null;
    }

    let initData: any;
    try { initData = JSON.parse(initText); } catch { console.error("[publish-linkedin] Failed to parse init response"); return null; }

    if (!initData.value?.uploadUrl || !initData.value?.image) {
      console.error("[publish-linkedin] Init response missing uploadUrl or image:", JSON.stringify(initData));
      return null;
    }

    const uploadUrl = initData.value.uploadUrl;
    const imageUrn = initData.value.image;
    console.log(`[publish-linkedin] Got upload URL, image URN: ${imageUrn}`);

    // Step 2: Download image bytes
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) {
      console.error(`[publish-linkedin] Failed to download image [${imgRes.status}]: ${imageUrl.substring(0, 100)}`);
      return null;
    }
    const imgBuffer = await imgRes.arrayBuffer();
    console.log(`[publish-linkedin] Downloaded image: ${imgBuffer.byteLength} bytes`);

    // Step 3: Upload to LinkedIn
    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/octet-stream",
      },
      body: imgBuffer,
    });

    if (!putRes.ok) {
      const putText = await putRes.text();
      console.error(`[publish-linkedin] Image PUT failed [${putRes.status}]:`, putText);
      return null;
    }

    console.log(`[publish-linkedin] Image uploaded successfully: ${imageUrn}`);
    return imageUrn;
  } catch (err) {
    console.error("[publish-linkedin] Image upload error:", err);
    return null;
  }
}

// ── Upload document (PDF) to LinkedIn for carousel ──
async function uploadDocumentToLinkedIn(
  authorUrn: string,
  pdfBuffer: ArrayBuffer,
  title: string,
  accessToken: string,
): Promise<string | null> {
  try {
    // Step 1: Initialize document upload
    const initRes = await fetch("https://api.linkedin.com/rest/documents?action=initializeUpload", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "LinkedIn-Version": LINKEDIN_API_VERSION,
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        initializeUploadRequest: {
          owner: authorUrn,
        },
      }),
    });

    const initData = await initRes.json();
    if (!initData.value?.uploadUrl || !initData.value?.document) {
      console.error("Document init upload failed:", initData);
      return null;
    }

    const uploadUrl = initData.value.uploadUrl;
    const documentUrn = initData.value.document;

    // Step 2: Upload PDF
    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/pdf",
      },
      body: pdfBuffer,
    });

    if (!putRes.ok) {
      console.error("Document upload PUT failed:", putRes.status, await putRes.text());
      return null;
    }

    return documentUrn;
  } catch (err) {
    console.error("Document upload error:", err);
    return null;
  }
}

// ── Render composite images and generate PDF for carousel ──
async function renderCompositesAndBuildPdf(
  slides: any[],
  brandSnapshot: any,
  contentId: string,
  contentType: string,
): Promise<{ imageUrls: string[]; pdfBuffer: ArrayBuffer | null }> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const hasTextContent = slides.some(
    (s: any) => s.overlay?.headline || s.overlay?.body || s.headline || s.body || s.overlay?.bullets?.length,
  );

  // Get raw image URLs
  const rawImageUrls: string[] = [];
  for (const slide of slides) {
    const url = slide.bg_image_url || slide.background_image_url || slide.image_url || slide.imageUrl;
    if (url) rawImageUrls.push(url);
  }

  let imageUrls = rawImageUrls;

  // If text content exists, render composites
  if (hasTextContent && slides.length > 0) {
    const dims = { width: 1080, height: contentType === "story" ? 1920 : contentType === "post" || contentType === "article" ? 627 : 1350 };
    // LinkedIn post/article: 1200x627, document/carousel: 1080x1350
    if (contentType === "post" || contentType === "article") {
      dims.width = 1200;
    }
    const allUrls: string[] = [];
    const BATCH_SIZE = 2;

    for (let offset = 0; offset < slides.length; offset += BATCH_SIZE) {
      const batch = slides.slice(offset, offset + BATCH_SIZE);
      try {
        const renderRes = await fetch(`${supabaseUrl}/functions/v1/render-slide-image`, {
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
        });

        const renderData = await renderRes.json();
        if (renderData.success && renderData.composite_urls?.length > 0) {
          allUrls.push(...renderData.composite_urls.filter(Boolean));
        }
      } catch (err) {
        console.warn(`Render batch at offset ${offset} failed:`, err);
      }
    }

    if (allUrls.length > 0) {
      imageUrls = allUrls;
    }
  }

  return { imageUrls, pdfBuffer: null };
}

// ── Main handler ──
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

    // Get content
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

    if (content.platform !== "linkedin") {
      return new Response(JSON.stringify({ error: "Content is not for LinkedIn" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get LinkedIn connection
    const { data: connection, error: connError } = await supabase
      .from("linkedin_connections")
      .select("*")
      .eq("user_id", content.user_id)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (connError || !connection) {
      await supabase.from("generated_contents").update({
        publish_error: "No active LinkedIn connection found",
        publish_attempts: (content.publish_attempts || 0) + 1,
      }).eq("id", content_id);

      return new Response(JSON.stringify({ error: "No LinkedIn connection" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Token expiry check
    if (connection.token_expires_at && new Date(connection.token_expires_at) < new Date()) {
      await supabase.from("generated_contents").update({
        publish_error: "LinkedIn token expired. Please reconnect.",
        publish_attempts: (content.publish_attempts || 0) + 1,
      }).eq("id", content_id);

      return new Response(JSON.stringify({ error: "Token expired" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = connection.access_token;
    const authorUrn = `urn:li:person:${connection.linkedin_user_id}`;

    // Build caption — LinkedIn max is 3000 chars for commentary
    const LINKEDIN_MAX_CHARS = 3000;
    let caption = content.caption || content.title || "";
    if (content.hashtags && content.hashtags.length > 0) {
      const hashtagStr = "\n\n" + content.hashtags
        .slice(0, 5)
        .map((h: string) => (h.startsWith("#") ? h : `#${h}`))
        .join(" ");
      // Only add hashtags if they fit within the limit
      if (caption.length + hashtagStr.length <= LINKEDIN_MAX_CHARS) {
        caption += hashtagStr;
      }
    }
    // Truncate if still over limit (shouldn't happen normally)
    if (caption.length > LINKEDIN_MAX_CHARS) {
      caption = caption.substring(0, LINKEDIN_MAX_CHARS - 3) + "...";
    }
    console.log(`[publish-linkedin] Caption length: ${caption.length} chars`);

    // Collect image URLs
    const slides = (content.slides as any[]) || [];
    const rawImageUrls: string[] = [];
    for (const slide of slides) {
      const url = slide.bg_image_url || slide.background_image_url || slide.image_url || slide.imageUrl;
      if (url) rawImageUrls.push(url);
    }
    if (rawImageUrls.length === 0 && content.image_urls) {
      rawImageUrls.push(...content.image_urls);
    }

    if (rawImageUrls.length === 0) {
      await supabase.from("generated_contents").update({
        publish_error: "No images found to publish",
        publish_attempts: (content.publish_attempts || 0) + 1,
      }).eq("id", content_id);

      return new Response(JSON.stringify({ error: "No images to publish" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine final image URLs
    let imageUrls: string[];
    const hasTextContent = slides.some(
      (s: any) => s.overlay?.headline || s.overlay?.body || s.headline || s.body || s.overlay?.bullets?.length,
    );

    if (frontendCompositeUrls?.length > 0) {
      imageUrls = frontendCompositeUrls.filter(Boolean);
      console.log(`Using ${imageUrls.length} frontend composites for LinkedIn`);
    } else if (content.image_urls?.length > 0 && content.image_urls.length >= slides.length) {
      imageUrls = content.image_urls.filter(Boolean);
      console.log(`Using ${imageUrls.length} pre-rendered composites from DB`);
    } else if (hasTextContent) {
      const result = await renderCompositesAndBuildPdf(slides, content.brand_snapshot, content_id, content.content_type);
      if (result.imageUrls.length === 0) {
        await supabase.from("generated_contents").update({
          publish_error: "Composite rendering failed for LinkedIn",
          publish_attempts: (content.publish_attempts || 0) + 1,
        }).eq("id", content_id);
        return new Response(JSON.stringify({ error: "Composite rendering failed" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      imageUrls = result.imageUrls;
    } else {
      imageUrls = rawImageUrls;
    }

    console.log(`Publishing ${imageUrls.length} images to LinkedIn (type=${content.content_type})`);

    // ── Publish to LinkedIn ──
    let postUrn: string;
    const isDocument = content.content_type === "document";
    const isMultiImage = !isDocument && imageUrls.length > 1;

    if (isDocument) {
      // LinkedIn Document (native carousel via PDF upload)
      // Step 1: Generate PDF from composite images
      let pdfBuffer: ArrayBuffer | null = null;

      // Try pre-generated PDF URL first (from frontend)
      const pdfUrl = (content as any).pdf_url;
      if (pdfUrl) {
        console.log("Using pre-generated PDF from frontend");
        try {
          const pdfRes = await fetch(pdfUrl);
          if (pdfRes.ok) {
            pdfBuffer = await pdfRes.arrayBuffer();
          }
        } catch (err) {
          console.warn("Failed to fetch pre-generated PDF:", err);
        }
      }

      // Fallback: generate PDF server-side from composite images
      if (!pdfBuffer) {
        console.log("Generating PDF server-side from composite images...");
        const { PDFDocument } = await import("https://esm.sh/pdf-lib@1.17.1");
        const pdfDoc = await PDFDocument.create();

        for (const url of imageUrls) {
          try {
            const imgRes = await fetch(url);
            const imgBytes = new Uint8Array(await imgRes.arrayBuffer());
            const pngImage = await pdfDoc.embedPng(imgBytes);
            const page = pdfDoc.addPage([pngImage.width, pngImage.height]);
            page.drawImage(pngImage, {
              x: 0,
              y: 0,
              width: pngImage.width,
              height: pngImage.height,
            });
          } catch (err) {
            console.warn(`Failed to embed image in PDF: ${url}`, err);
          }
        }

        const pdfBytes = await pdfDoc.save();
        pdfBuffer = pdfBytes.buffer as ArrayBuffer;
      }

      if (!pdfBuffer || pdfBuffer.byteLength === 0) {
        throw new Error("Failed to generate PDF for LinkedIn document");
      }

      console.log(`PDF generated: ${(pdfBuffer.byteLength / 1024).toFixed(0)}KB`);

      // Step 2: Upload PDF as document to LinkedIn
      const documentUrn = await uploadDocumentToLinkedIn(authorUrn, pdfBuffer, content.title || "Document", accessToken);
      if (!documentUrn) {
        throw new Error("Failed to upload document to LinkedIn");
      }

      // Step 3: Create post with document
      const postBody: any = {
        author: authorUrn,
        commentary: caption,
        visibility: "PUBLIC",
        distribution: {
          feedDistribution: "MAIN_FEED",
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        content: {
          media: {
            id: documentUrn,
            title: content.title || "",
          },
        },
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
      };

      const postRes = await fetch("https://api.linkedin.com/rest/posts", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "LinkedIn-Version": LINKEDIN_API_VERSION,
          "X-Restli-Protocol-Version": "2.0.0",
        },
        body: JSON.stringify(postBody),
      });

      if (!postRes.ok) {
        const errBody = await postRes.text();
        throw new Error(`LinkedIn document post failed [${postRes.status}]: ${errBody}`);
      }

      postUrn = postRes.headers.get("x-restli-id") || "unknown";
    } else if (isMultiImage) {
      // Multi-image post (fallback for non-document multi-image)
      const imageUrns: string[] = [];
      for (const url of imageUrls) {
        const urn = await uploadImageToLinkedIn(authorUrn, url, accessToken);
        if (urn) imageUrns.push(urn);
      }

      if (imageUrns.length === 0) {
        throw new Error("Failed to upload any images to LinkedIn");
      }

      const postBody: any = {
        author: authorUrn,
        commentary: caption,
        visibility: "PUBLIC",
        distribution: {
          feedDistribution: "MAIN_FEED",
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        content: {
          multiImage: {
            images: imageUrns.map((urn) => ({
              id: urn,
              altText: content.title || "",
            })),
          },
        },
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
      };

      const postRes = await fetch("https://api.linkedin.com/rest/posts", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "LinkedIn-Version": LINKEDIN_API_VERSION,
          "X-Restli-Protocol-Version": "2.0.0",
        },
        body: JSON.stringify(postBody),
      });

      if (!postRes.ok) {
        const errBody = await postRes.text();
        throw new Error(`LinkedIn multi-image post failed [${postRes.status}]: ${errBody}`);
      }

      postUrn = postRes.headers.get("x-restli-id") || "unknown";
    } else {
      // Single image post
      const imageUrn = await uploadImageToLinkedIn(authorUrn, imageUrls[0], accessToken);
      if (!imageUrn) {
        throw new Error("Failed to upload image to LinkedIn");
      }

      const postBody: any = {
        author: authorUrn,
        commentary: caption,
        visibility: "PUBLIC",
        distribution: {
          feedDistribution: "MAIN_FEED",
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        content: {
          media: {
            id: imageUrn,
            title: content.title || "",
          },
        },
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
      };

      const postRes = await fetch("https://api.linkedin.com/rest/posts", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "LinkedIn-Version": LINKEDIN_API_VERSION,
          "X-Restli-Protocol-Version": "2.0.0",
        },
        body: JSON.stringify(postBody),
      });

      if (!postRes.ok) {
        const errBody = await postRes.text();
        throw new Error(`LinkedIn post failed [${postRes.status}]: ${errBody}`);
      }

      postUrn = postRes.headers.get("x-restli-id") || "unknown";
    }

    // Update content status
    await supabase.from("generated_contents").update({
      status: "published",
      published_at: new Date().toISOString(),
      instagram_media_id: postUrn, // Reusing this column for LinkedIn post URN
      publish_error: null,
      publish_attempts: (content.publish_attempts || 0) + 1,
    }).eq("id", content_id);

    return new Response(JSON.stringify({ success: true, post_urn: postUrn }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    console.error("[publish-linkedin] Fatal error:", errMsg);

    // Save error to content so it doesn't stay stuck as "scheduled"
    try {
      const body = await req.clone().json().catch(() => ({}));
      const cid = body.content_id;
      if (cid) {
        const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        await svc.from("generated_contents").update({
          publish_error: errMsg,
          publish_attempts: 1,
        }).eq("id", cid);
        console.log(`[publish-linkedin] Error saved to content ${cid}`);
      }
    } catch (_) { /* ignore */ }

    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Internal error",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
