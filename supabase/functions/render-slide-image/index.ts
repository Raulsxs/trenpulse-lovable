import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import React from "https://esm.sh/react@18.2.0";
import { ImageResponse } from "https://deno.land/x/og_edge@0.0.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── Helpers ──────────────────────────────────────────────────────────

// ── Build React element for one slide ───────────────────────────────
// NOTE: satori (og_edge) does NOT support textShadow CSS.
// We simulate depth using a semi-transparent text-stroke effect via
// multiple layered elements offset by 1-2px.

// ── Default positions (percentage-based) matching frontend SlideBgOverlayRenderer ──
function getDefaultPositions(role: string, w?: number, h?: number) {
  const isVertical = (h || 0) > (w || 0); // story or document format

  if (isVertical) {
    // Story/Document (9:16) — more vertical space, use center-bottom layout
    if (role === "cover") {
      return {
        headline: { x: 6, y: 35 },
        body:     { x: 6, y: 60 },
        bullets:  { x: 6, y: 55 },
        footer:   { x: 6, y: 90 },
      };
    }
    return {
      headline: { x: 6, y: 10 },
      body:     { x: 6, y: 40 },
      bullets:  { x: 6, y: 30 },
      footer:   { x: 6, y: 90 },
    };
  }

  // Square (1:1) or Horizontal — original positions
  if (role === "cover") {
    return {
      headline: { x: 5, y: 10 },
      body:     { x: 5, y: 70 },
      bullets:  { x: 5, y: 65 },
      footer:   { x: 5, y: 92 },
    };
  }
  return {
    headline: { x: 5, y: 8 },
    body:     { x: 5, y: 65 },
    bullets:  { x: 5, y: 28 },
    footer:   { x: 5, y: 92 },
  };
}

// ── Text truncation helpers ──
function truncate(text: string, max: number): string {
  if (!text || text.length <= max) return text;
  return text.substring(0, max - 1).trimEnd() + "…";
}

function buildSlideElement(
  slide: Record<string, any>,
  w: number,
  h: number,
  bgSrc?: string,
  brandSnapshot?: Record<string, any> | null,
  isLinkedInDocument?: boolean,
  isPhotoOverlay?: boolean,
) {
  const overlay = slide.overlay || {};
  const overlayStyle = slide.overlay_style || {};
  const overlayPositions = slide.overlay_positions || {};
  // Don't truncate — let text wrap naturally. Truncation causes "..." which looks broken.
  const headline: string = overlay.headline || slide.headline || "";
  const body: string = overlay.body || slide.body || "";
  const bullets: string[] = (overlay.bullets || slide.bullets || []).map((b: string) => truncate(b, 120));
  const footer: string = overlay.footer || "";
  const role: string = slide.role || "content";
  const fontScale: number = overlayStyle.font_scale ?? 1;
  const isFirstSlide = role === "cover";

  // Format-aware font sizing — vertical formats (story/document) need larger fonts
  const isVertical = h > w; // story (1080x1920) or document
  const formatFontMultiplier = isVertical ? 1.35 : 1;

  const defaultHeadlineSize = isPhotoOverlay ? 56 : (isFirstSlide ? 52 : 44);
  const headlineFontSize = (overlayStyle.headline_font_size || defaultHeadlineSize) * fontScale * formatFontMultiplier;

  const baseBodyFontSize = (overlayStyle.body_font_size || 26) * fontScale * formatFontMultiplier;
  // Auto-shrink body font based on text density
  const bodyFontSize = body.length > 250
    ? Math.max(20 * formatFontMultiplier, baseBodyFontSize * 0.9)
    : body.length > 150
      ? Math.max(20 * formatFontMultiplier, baseBodyFontSize * 0.95)
      : baseBodyFontSize;
  const bulletsFontSize = (overlayStyle.bullets_font_size || 24) * fontScale * formatFontMultiplier;

  const rawAccent = brandSnapshot?.palette?.[0];
  const accentColor = typeof rawAccent === "string" ? rawAccent : (rawAccent?.hex || rawAccent?.color || "#667eea");

  // Text colors: dark text for LinkedIn documents (light bg), white for everything else (dark scrim)
  const textColor = isLinkedInDocument ? "#1a1a2e" : "#ffffff";
  const textColorSecondary = isLinkedInDocument ? "rgba(26,26,46,0.85)" : "rgba(255,255,255,0.95)";

  // Max width — match frontend SlideBgOverlayRenderer: use overlayStyle or default 90%
  // Satori wraps text wider than browsers, so we subtract 6% for parity
  const baseMaxWidthPct = overlayStyle.max_width_pct ?? 90;
  const satoriCompensation = 6; // % narrower to compensate Satori text-wrapping differences
  const maxWidthPct = baseMaxWidthPct - satoriCompensation;

  // Per-block max-width support (matching frontend getBlockMaxWidth)
  // Headlines get extra 2% compensation because bold text wraps differently in Satori
  const getBlockMaxWidth = (key: string): number => {
    const perBlock = overlayStyle[`${key}_max_width_pct`];
    const extraComp = key === "headline" ? 2 : 0;
    return (perBlock || baseMaxWidthPct) - satoriCompensation - extraComp;
  };

  // Convert percentage to pixels for Satori
  const textMaxWidth = Math.round(w * maxWidthPct / 100);

  // Merge user positions with defaults
  const defaults = getDefaultPositions(role, w, h);
  const pos = {
    headline: overlayPositions.headline || defaults.headline,
    body:     overlayPositions.body     || defaults.body,
    bullets:  overlayPositions.bullets  || defaults.bullets,
    footer:   overlayPositions.footer   || defaults.footer,
  };

  // photo_overlay: override headline to bottom area (lower third layout)
  if (isPhotoOverlay) {
    const isVertical = h > w;
    pos.headline = { x: 6, y: isVertical ? 72 : 65 };
    pos.footer = { x: 6, y: isVertical ? 92 : 90 };
  }

  // Helper: create absolutely positioned text block with safe padding
  // NOTE: backgroundColor "transparent" is explicit to prevent Satori rendering a white box
  const posBlock = (position: { x: number; y: number }, blockMaxWidth: number, children: any) =>
    React.createElement(
      "div",
      {
        style: {
          display: "flex",
          position: "absolute",
          left: `${Math.max(position.x, 4.5)}%`,
          top: `${position.y}%`,
          maxWidth: blockMaxWidth,
          backgroundColor: "transparent",
        },
      },
      children,
    );

  const children: any[] = [];

  // Background image — objectFit cover ensures no gaps/borders even if aspect ratio differs
  if (bgSrc) {
    children.push(
      React.createElement("img", {
        src: bgSrc,
        width: w,
        height: h,
        style: {
          position: "absolute",
          top: 0,
          left: 0,
          width: w,
          height: h,
          objectFit: "cover" as any,
        },
      }),
    );
  }

  // Scrim gradient — photo_overlay uses "lower third" (clean top, dark bottom),
  // LinkedIn documents use light style, others use full dark scrim
  if (isPhotoOverlay) {
    // "Lower third" layout: photo stays clean on top, gradient only at bottom for text
    children.push(
      React.createElement("div", {
        style: {
          position: "absolute",
          top: 0,
          left: 0,
          width: w,
          height: h,
          backgroundImage:
            "linear-gradient(180deg, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.0) 45%, rgba(0,0,0,0.25) 65%, rgba(0,0,0,0.75) 100%)",
        },
      }),
    );
  } else if (isLinkedInDocument) {
    // Light professional style: subtle white overlay for readability on light backgrounds
    children.push(
      React.createElement("div", {
        style: {
          position: "absolute",
          top: 0,
          left: 0,
          width: w,
          height: h,
          backgroundImage:
            "linear-gradient(180deg, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.70) 50%, rgba(255,255,255,0.85) 100%)",
        },
      }),
    );
  } else {
    // Dark scrim matching frontend SlideBgOverlayRenderer
    children.push(
      React.createElement("div", {
        style: {
          position: "absolute",
          top: 0,
          left: 0,
          width: w,
          height: h,
          backgroundImage:
            "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.15) 30%, rgba(0,0,0,0.25) 60%, rgba(0,0,0,0.65) 100%)",
        },
      }),
    );
  }

  // Headline — fontWeight 800 to match frontend SlideBgOverlayRenderer
  if (headline) {
    children.push(
      posBlock(
        pos.headline,
        Math.round(w * getBlockMaxWidth("headline") / 100),
        React.createElement(
          "div",
          {
            style: {
              color: textColor,
              fontFamily: brandSnapshot?.fonts?.headings || "Inter",
              fontSize: headlineFontSize,
              fontWeight: 800,
              lineHeight: 1.15,
              letterSpacing: "-0.02em",
              display: "flex",
              wordBreak: "break-word" as any,
            },
          },
          headline,
        ),
      ),
    );
  }

  // Body
  if (body) {
    children.push(
      posBlock(
        pos.body,
        Math.round(w * getBlockMaxWidth("body") / 100),
        React.createElement(
          "div",
          {
            style: {
              color: textColorSecondary,
              fontFamily: brandSnapshot?.fonts?.body || "Inter",
              fontSize: bodyFontSize,
              fontWeight: 400,
              lineHeight: 1.55,
              display: "flex",
              wordBreak: "break-word" as any,
            },
          },
          body,
        ),
      ),
    );
  }

  // Bullets
  if (bullets.length > 0) {
    children.push(
      posBlock(
        pos.bullets,
        Math.round(w * getBlockMaxWidth("bullets") / 100),
        React.createElement(
          "div",
          {
            style: {
              display: "flex",
              flexDirection: "column",
              gap: 10,
            },
          },
          ...bullets.slice(0, 5).map((b: string, idx: number) =>
            React.createElement(
              "div",
              {
                key: idx,
                style: {
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: 12,
                },
              },
              React.createElement(
                "div",
                {
                  style: {
                    color: accentColor,
                    fontSize: 28 * fontScale,
                    fontWeight: 700,
                    flexShrink: 0,
                  },
                },
                "•",
              ),
              React.createElement(
                "div",
                {
                  style: {
                    color: textColorSecondary,
                    fontSize: bulletsFontSize,
                    lineHeight: 1.4,
                    flex: 1,
                    wordBreak: "break-word" as any,
                  },
                },
                b,
              ),
            ),
          ),
        ),
      ),
    );
  }

  // Footer
  if (footer) {
    children.push(
      posBlock(
        pos.footer,
        textMaxWidth,
        React.createElement(
          "div",
          {
            style: {
              color: "rgba(255,255,255,0.8)",
              fontSize: 14 * fontScale,
              display: "flex",
            },
          },
          footer,
        ),
      ),
    );
  }

  return React.createElement(
    "div",
    {
      style: {
        display: "flex",
        position: "relative",
        width: w,
        height: h,
        backgroundColor: isLinkedInDocument ? "#f5f5f7" : "#0a0a0a",
      },
    },
    ...children,
  );
}

// ── Font cache ──────────────────────────────────────────────────────
const fontCache: Record<string, ArrayBuffer> = {};

const FONT_CDN_MAP: Record<string, { regular: string; bold: string }> = {
  "Inter": {
    regular: "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.8/files/inter-latin-400-normal.woff",
    bold: "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.8/files/inter-latin-700-normal.woff",
  },
  "Poppins": {
    regular: "https://cdn.jsdelivr.net/npm/@fontsource/poppins@5.0.8/files/poppins-latin-400-normal.woff",
    bold: "https://cdn.jsdelivr.net/npm/@fontsource/poppins@5.0.8/files/poppins-latin-700-normal.woff",
  },
  "Montserrat": {
    regular: "https://cdn.jsdelivr.net/npm/@fontsource/montserrat@5.0.8/files/montserrat-latin-400-normal.woff",
    bold: "https://cdn.jsdelivr.net/npm/@fontsource/montserrat@5.0.8/files/montserrat-latin-700-normal.woff",
  },
  "Playfair Display": {
    regular: "https://cdn.jsdelivr.net/npm/@fontsource/playfair-display@5.0.12/files/playfair-display-latin-400-normal.woff",
    bold: "https://cdn.jsdelivr.net/npm/@fontsource/playfair-display@5.0.12/files/playfair-display-latin-700-normal.woff",
  },
  "Roboto": {
    regular: "https://cdn.jsdelivr.net/npm/@fontsource/roboto@5.0.8/files/roboto-latin-400-normal.woff",
    bold: "https://cdn.jsdelivr.net/npm/@fontsource/roboto@5.0.8/files/roboto-latin-700-normal.woff",
  },
  "Open Sans": {
    regular: "https://cdn.jsdelivr.net/npm/@fontsource/open-sans@5.0.28/files/open-sans-latin-400-normal.woff",
    bold: "https://cdn.jsdelivr.net/npm/@fontsource/open-sans@5.0.28/files/open-sans-latin-700-normal.woff",
  },
};

async function loadFontData(url: string): Promise<ArrayBuffer> {
  if (fontCache[url]) return fontCache[url];
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to load font from ${url}: ${resp.status}`);
  const data = await resp.arrayBuffer();
  fontCache[url] = data;
  return data;
}

async function loadBrandFonts(brandSnapshot?: Record<string, any> | null): Promise<
  { name: string; data: ArrayBuffer; weight: number; style: "normal" }[]
> {
  const headingsFont = brandSnapshot?.fonts?.headings || "Inter";
  const bodyFont = brandSnapshot?.fonts?.body || "Inter";

  const fontsToLoad = new Set([headingsFont, bodyFont]);
  const result: { name: string; data: ArrayBuffer; weight: number; style: "normal" }[] = [];

  for (const fontName of fontsToLoad) {
    const cdnEntry = FONT_CDN_MAP[fontName] || FONT_CDN_MAP["Inter"];
    try {
      const [regularData, boldData] = await Promise.all([
        loadFontData(cdnEntry.regular),
        loadFontData(cdnEntry.bold),
      ]);
      result.push({ name: fontName, data: regularData, weight: 400, style: "normal" as const });
      result.push({ name: fontName, data: boldData, weight: 700, style: "normal" as const });
    } catch (err) {
      console.warn(`[render-slide-image] Font ${fontName} failed, falling back to Inter:`, (err as Error).message);
      const fallback = FONT_CDN_MAP["Inter"];
      const [regularData, boldData] = await Promise.all([
        loadFontData(fallback.regular),
        loadFontData(fallback.bold),
      ]);
      result.push({ name: fontName, data: regularData, weight: 400, style: "normal" as const });
      result.push({ name: fontName, data: boldData, weight: 700, style: "normal" as const });
    }
  }

  return result;
}

// ── Handler ─────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { slides, brand_snapshot, content_id, dimensions, slide_offset, platform, content_type, visual_style } = await req.json();
    const w = Math.min(Math.max(Number(dimensions?.width) || 1080, 720), 1200);
    const h = Math.min(Math.max(Number(dimensions?.height) || 1080, 627), 1920);
    const isLinkedInDocument = platform === "linkedin" && content_type === "document";
    const isPhotoOverlay = visual_style === "photo_overlay";
    const offset = Number(slide_offset) || 0;

    if (!slides || !Array.isArray(slides) || slides.length === 0) {
      return new Response(
        JSON.stringify({ error: "No slides provided" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const fonts = await loadBrandFonts(brand_snapshot);
    const compositeUrls: string[] = [];

    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      const bgSrc =
        slide.background_image_url || slide.image_url || slide.previewImage;

      const element = buildSlideElement(slide, w, h, bgSrc, brand_snapshot, isLinkedInDocument, isPhotoOverlay);
      const imageResponse = new ImageResponse(element, {
        width: w,
        height: h,
        fonts: fonts as any,
      });

      const pngBuffer = new Uint8Array(await imageResponse.arrayBuffer());

      const globalIdx = offset + i;
      const path = `composite/${content_id}/slide_${globalIdx}_${Date.now()}.png`;
      const { error: upErr } = await supabase.storage
        .from("generated-images")
        .upload(path, pngBuffer, {
          contentType: "image/png",
          upsert: true,
        });

      if (upErr) throw new Error(`Upload slide ${globalIdx}: ${upErr.message}`);

      const { data: urlData } = supabase.storage
        .from("generated-images")
        .getPublicUrl(path);

      compositeUrls.push(urlData.publicUrl);
      console.log(`Slide ${globalIdx} composite rendered → ${urlData.publicUrl}`);
    }

    return new Response(
      JSON.stringify({ success: true, composite_urls: compositeUrls }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("render-slide-image error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown render error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
