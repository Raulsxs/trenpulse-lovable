import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import JSZip from "https://esm.sh/jszip@3.10.1";
import { fetchAI } from "../_shared/ai-gateway.ts";

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
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Slide {
  headline: string;
  body: string;
  imagePrompt?: string;
  illustrationPrompt?: string;
  previewImage?: string;
  templateHint?: string;
  template?: string;
  role?: string;
  bullets?: string[];
  speakerNotes?: string;
}

interface BrandTokens {
  name: string;
  palette: { name: string; hex: string }[] | string[];
  fonts: { headings: string; body: string };
  visual_tone: string;
  logo_url: string | null;
  style_guide?: StyleGuide | null;
}

interface StyleGuide {
  brand_tokens?: {
    palette_roles?: Record<string, string>;
    typography?: { headline_weight?: number; body_weight?: number; uppercase_headlines?: boolean };
    logo?: { preferred_position?: string; watermark_opacity?: number };
  };
  formats?: Record<string, {
    layout_rules?: { wave_height_pct?: number; footer_height_px?: number; safe_margin_px?: number; safe_top_px?: number; safe_bottom_px?: number; safe_side_px?: number };
  }>;
  visual_patterns?: string[];
}

// Normalize palette for SVG rendering
function getPaletteHexes(palette: BrandTokens["palette"]): string[] {
  if (!palette) return [];
  return (palette as any[]).map((item) => {
    if (typeof item === "string") return item;
    return item.hex || "#000000";
  });
}

function getLayoutRules(styleGuide: StyleGuide | null | undefined, contentType: string) {
  const defaults = {
    wave_height_pct: 18,
    safe_margin_px: 60,
    safe_top_px: 40,
    safe_bottom_px: 80,
    footer_height_px: 140,
  };
  const formatRules = styleGuide?.formats?.[contentType]?.layout_rules;
  if (!formatRules) return defaults;
  return { ...defaults, ...formatRules };
}

function getTypography(styleGuide: StyleGuide | null | undefined) {
  return {
    headline_weight: styleGuide?.brand_tokens?.typography?.headline_weight || 800,
    body_weight: styleGuide?.brand_tokens?.typography?.body_weight || 400,
    uppercase_headlines: styleGuide?.brand_tokens?.typography?.uppercase_headlines || false,
  };
}

function getLogoConfig(styleGuide: StyleGuide | null | undefined) {
  return {
    position: styleGuide?.brand_tokens?.logo?.preferred_position || "bottom-center",
    opacity: styleGuide?.brand_tokens?.logo?.watermark_opacity || 0.35,
  };
}

function hasWavePattern(styleGuide: StyleGuide | null | undefined): boolean {
  if (!styleGuide?.visual_patterns) return true; // default: use wave
  return styleGuide.visual_patterns.some(p => p.toLowerCase().includes("wave"));
}

// Build deterministic SVG for a slide
function renderSlideToSVG(
  slide: Slide,
  slideIndex: number,
  totalSlides: number,
  brand: BrandTokens,
  width: number,
  height: number,
  contentType: string,
): string {
  const hexes = getPaletteHexes(brand.palette);
  const bg = hexes[0] || "#a4d3eb";
  const dark = hexes[1] || "#10559a";
  const accent = hexes[2] || "#c52244";
  const cardBg = hexes[3] || "#f5eaee";
  const headingFont = brand.fonts?.headings || "Inter";
  const bodyFont = brand.fonts?.body || "Inter";
  const templateName = slide.templateHint || slide.template || "wave_cover";

  const layout = getLayoutRules(brand.style_guide, contentType);
  const typo = getTypography(brand.style_guide);
  const logoConf = getLogoConfig(brand.style_guide);
  const useWave = hasWavePattern(brand.style_guide);

  const margin = layout.safe_margin_px;

  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  function wrapText(text: string, maxCharsPerLine: number): string[] {
    const words = text.split(" ");
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      if (current.length + word.length + 1 > maxCharsPerLine && current) {
        lines.push(current);
        current = word;
      } else {
        current = current ? current + " " + word : word;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  const headlineText = typo.uppercase_headlines ? slide.headline.toUpperCase() : slide.headline;
  const headlineLines = wrapText(headlineText, 28);
  const bodyLines = wrapText(slide.body, 42);
  const badge = slideIndex === 0 ? "CAPA" : slideIndex === totalSlides - 1 ? "CTA" : `${slideIndex + 1}/${totalSlides}`;

  // Wave path using style_guide wave_height_pct
  const waveStartY = height * (1 - layout.wave_height_pct / 100);
  const wavePath = useWave
    ? `M0,${waveStartY} C${width * 0.17},${waveStartY - height * 0.03} ${width * 0.33},${waveStartY + height * 0.03} ${width * 0.5},${waveStartY} C${width * 0.67},${waveStartY - height * 0.03} ${width * 0.83},${waveStartY + height * 0.03} ${width},${waveStartY} L${width},${height} L0,${height} Z`
    : "";

  const waveSvg = useWave ? `<path d="${wavePath}" fill="white"/>` : "";

  // Badge SVG
  const badgeSvg = `<rect x="${width - 130}" y="${layout.safe_top_px}" width="100" height="36" rx="18" fill="${dark}"/>
  <text x="${width - 80}" y="${layout.safe_top_px + 24}" text-anchor="middle" fill="white" font-family="${esc(headingFont)}, sans-serif" font-size="16" font-weight="600">${badge}</text>`;

  // Logo SVG
  const logoSvg = brand.logo_url ? (() => {
    const pos = logoConf.position;
    const logoY = pos.includes("top") ? layout.safe_top_px + 5 : height - layout.safe_bottom_px;
    const logoX = pos.includes("right") ? width - margin - 40 : pos.includes("left") ? margin : width / 2;
    const anchor = pos.includes("right") ? "end" : pos.includes("left") ? "start" : "middle";
    return `<text x="${logoX}" y="${logoY}" text-anchor="${anchor}" fill="${dark}" font-family="${esc(headingFont)}, sans-serif" font-size="14" font-weight="600" opacity="${logoConf.opacity}">${esc(brand.name)}</text>`;
  })() : "";

  // Accent bar
  const accentBar = (x: number, y: number, w = 60, h = 6) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${accent}"/>`;

  if (templateName === "wave_text_card") {
    const cardY = height * 0.25;
    const cardH = height * 0.45;
    const cardW = width - margin * 2 - 40;
    const cardX = (width - cardW) / 2;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${bg}"/>
  ${waveSvg}
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="24" fill="white" stroke="${cardBg}" stroke-width="3"/>
  ${accentBar(width / 2 - 24, cardY + 48, 48, 4)}
  ${headlineLines.map((line, i) => `<text x="${width / 2}" y="${cardY + 100 + i * 52}" text-anchor="middle" fill="${dark}" font-family="${esc(headingFont)}, sans-serif" font-size="48" font-weight="${typo.headline_weight}">${esc(line)}</text>`).join("\n  ")}
  ${bodyLines.map((line, i) => `<text x="${width / 2}" y="${cardY + 100 + headlineLines.length * 52 + 30 + i * 36}" text-anchor="middle" fill="${dark}" font-family="${esc(bodyFont)}, sans-serif" font-size="28" font-weight="${typo.body_weight}" opacity="0.75">${esc(line)}</text>`).join("\n  ")}
  ${badgeSvg}
  ${logoSvg}
</svg>`;
  }

  if (templateName === "wave_bullets") {
    const bullets = slide.bullets || [];
    const bulletsSvg = bullets.map((b, i) => {
      const y = height * 0.4 + 80 + i * 60;
      return `<circle cx="${margin + 30}" cy="${y}" r="18" fill="${accent}"/>
  <text x="${margin + 30}" y="${y + 6}" text-anchor="middle" fill="white" font-family="${esc(headingFont)}, sans-serif" font-size="16" font-weight="700">${i + 1}</text>
  <text x="${margin + 60}" y="${y + 8}" fill="${dark}" font-family="${esc(bodyFont)}, sans-serif" font-size="26" font-weight="${typo.body_weight}">${esc(b)}</text>`;
    }).join("\n  ");

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${bg}"/>
  ${waveSvg}
  ${accentBar(margin, height * 0.35)}
  ${headlineLines.map((line, i) => `<text x="${margin}" y="${height * 0.35 + 50 + i * 56}" fill="${dark}" font-family="${esc(headingFont)}, sans-serif" font-size="52" font-weight="${typo.headline_weight}">${esc(line)}</text>`).join("\n  ")}
  ${bulletsSvg || bodyLines.map((line, i) => `<text x="${margin}" y="${height * 0.35 + 50 + headlineLines.length * 56 + 30 + i * 40}" fill="${dark}" font-family="${esc(bodyFont)}, sans-serif" font-size="28" font-weight="${typo.body_weight}" opacity="0.8">${esc(line)}</text>`).join("\n  ")}
  ${badgeSvg}
  ${logoSvg}
</svg>`;
  }

  if (templateName === "wave_closing") {
    const textY = height * 0.35;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${dark}"/>
  ${useWave ? `<path d="${`M0,${waveStartY} C${width * 0.17},${waveStartY - height * 0.03} ${width * 0.33},${waveStartY + height * 0.03} ${width * 0.5},${waveStartY} C${width * 0.67},${waveStartY - height * 0.03} ${width * 0.83},${waveStartY + height * 0.03} ${width},${waveStartY} L${width},${height} L0,${height} Z`}" fill="${bg}"/>` : ""}
  ${accentBar(width / 2 - 30, textY)}
  ${headlineLines.map((line, i) => `<text x="${width / 2}" y="${textY + 60 + i * 64}" text-anchor="middle" fill="white" font-family="${esc(headingFont)}, sans-serif" font-size="56" font-weight="${typo.headline_weight}">${esc(line)}</text>`).join("\n  ")}
  ${bodyLines.map((line, i) => `<text x="${width / 2}" y="${textY + 60 + headlineLines.length * 64 + 30 + i * 40}" text-anchor="middle" fill="white" font-family="${esc(bodyFont)}, sans-serif" font-size="30" font-weight="${typo.body_weight}" opacity="0.85">${esc(line)}</text>`).join("\n  ")}
  <rect x="${width - 130}" y="${layout.safe_top_px}" width="100" height="36" rx="18" fill="rgba(255,255,255,0.2)"/>
  <text x="${width - 80}" y="${layout.safe_top_px + 24}" text-anchor="middle" fill="white" font-family="${esc(headingFont)}, sans-serif" font-size="16" font-weight="600">${badge}</text>
  ${logoSvg}
</svg>`;
  }

  if (templateName === "story_cover" || templateName === "story_tip") {
    const safeTop = layout.safe_top_px || 220;
    const safeBottom = layout.safe_bottom_px || 260;
    const safeSide = (layout as any).safe_side_px || margin;
    const textY = safeTop + 100;

    if (templateName === "story_tip") {
      const cardY = height * 0.25;
      const cardH = height * 0.45;
      const cardW = width - safeSide * 2;
      const cardX = safeSide;
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${bg}"/>
  ${waveSvg}
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="32" fill="white" filter="url(#shadow)"/>
  <defs><filter id="shadow"><feDropShadow dx="0" dy="8" stdDeviation="20" flood-opacity="0.1"/></filter></defs>
  ${accentBar(width / 2 - 24, cardY + 56, 48, 5)}
  ${headlineLines.map((line, i) => `<text x="${width / 2}" y="${cardY + 120 + i * 60}" text-anchor="middle" fill="${dark}" font-family="${esc(headingFont)}, sans-serif" font-size="56" font-weight="${typo.headline_weight}">${esc(line)}</text>`).join("\n  ")}
  ${bodyLines.map((line, i) => `<text x="${width / 2}" y="${cardY + 120 + headlineLines.length * 60 + 30 + i * 42}" text-anchor="middle" fill="${dark}" font-family="${esc(bodyFont)}, sans-serif" font-size="32" font-weight="${typo.body_weight}" opacity="0.75">${esc(line)}</text>`).join("\n  ")}
  ${logoSvg}
</svg>`;
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${bg}"/>
  ${waveSvg}
  ${accentBar(safeSide, textY)}
  ${headlineLines.map((line, i) => `<text x="${safeSide}" y="${textY + 60 + i * 76}" fill="${dark}" font-family="${esc(headingFont)}, sans-serif" font-size="72" font-weight="900">${esc(line)}</text>`).join("\n  ")}
  ${bodyLines.map((line, i) => `<text x="${safeSide}" y="${textY + 60 + headlineLines.length * 76 + 40 + i * 44}" fill="${dark}" font-family="${esc(bodyFont)}, sans-serif" font-size="36" font-weight="${typo.body_weight}" opacity="0.8">${esc(line)}</text>`).join("\n  ")}
  ${logoSvg}
</svg>`;
  }

  // Default: wave_cover / generic
  const textY = height * 0.35;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${bg}"/>
  ${waveSvg}
  ${accentBar(margin, textY)}
  ${headlineLines.map((line, i) => `<text x="${margin}" y="${textY + 60 + i * 68}" fill="${dark}" font-family="${esc(headingFont)}, sans-serif" font-size="64" font-weight="${typo.headline_weight}">${esc(line)}</text>`).join("\n  ")}
  ${bodyLines.map((line, i) => `<text x="${margin}" y="${textY + 60 + headlineLines.length * 68 + 30 + i * 40}" fill="${dark}" font-family="${esc(bodyFont)}, sans-serif" font-size="32" font-weight="${typo.body_weight}" opacity="0.8">${esc(line)}</text>`).join("\n  ")}
  ${badgeSvg}
  ${logoSvg}
</svg>`;
}

// Fetch image bytes from URL
async function fetchImageBytes(url: string): Promise<Uint8Array | null> {
  try {
    if (url.startsWith("data:image")) {
      const base64Data = url.split(",")[1];
      return Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    }
    if (url.startsWith("http")) {
      const resp = await fetch(url);
      if (!resp.ok) return null;
      return new Uint8Array(await resp.arrayBuffer());
    }
    return null;
  } catch (e) {
    console.error("[generate-download] Error fetching image:", e);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub;
    const { contentId } = await req.json();
    if (!contentId) {
      return new Response(JSON.stringify({ error: "contentId is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: content, error: contentError } = await supabase
      .from("generated_contents")
      .select("*")
      .eq("id", contentId)
      .eq("user_id", userId)
      .single();

    if (contentError || !content) {
      return new Response(JSON.stringify({ error: "Content not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY") || Deno.env.get("INFERENCE_SH_API_KEY") || Deno.env.get("GOOGLE_AI_API_KEY") || "";

    const slides = content.slides as Slide[];
    const brandSnapshot = content.brand_snapshot as BrandTokens | null;
    const visualMode = (content as any).visual_mode || "free";
    const zip = new JSZip();
    const imageUrls: string[] = [];

    const isFeed = content.content_type !== "story";
    const width = 1080;
    const height = isFeed ? 1350 : 1920;

    const useDeterministic = visualMode === "brand_strict" || (visualMode === "brand_guided" && !!brandSnapshot);
    console.log(`[generate-download] mode=${visualMode}, deterministic=${useDeterministic}, slides=${slides.length}, ${width}x${height}`);

    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      const templateName = slide.templateHint || slide.template || "wave_cover";
      console.log(`[generate-download] Slide ${i + 1}/${slides.length} (template=${templateName}, role=${slide.role || 'unknown'})`);

      if (useDeterministic && brandSnapshot) {
        // Deterministic SVG using style_guide
        const svg = renderSlideToSVG(slide, i, slides.length, brandSnapshot, width, height, content.content_type);
        const svgBytes = new TextEncoder().encode(svg);
        zip.file(`slide_${i + 1}.svg`, svgBytes);
        const svgB64 = btoa(unescape(encodeURIComponent(svg)));
        imageUrls.push(`data:image/svg+xml;base64,${svgB64}`);
      } else if (slide.previewImage) {
        const bytes = await fetchImageBytes(slide.previewImage);
        if (bytes) {
          const ext = slide.previewImage.includes("png") ? "png" : "jpg";
          zip.file(`slide_${i + 1}.${ext}`, bytes);
          imageUrls.push(slide.previewImage);
        }
      } else {
        // Fallback: generate AI image
        const prompt = `${slide.illustrationPrompt || slide.imagePrompt || slide.headline}. Professional social media marketing image, modern, clean, Instagram, high quality, ${width}x${height}. No text.`;
        try {
          const response = await aiGatewayFetch({
            model: "google/gemini-2.5-flash-image",
            messages: [{ role: "user", content: prompt }],
            modalities: ["image", "text"],
          });
          if (response.ok) {
            const data = await response.json();
            const url = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
            if (url) {
              imageUrls.push(url);
              const bytes = await fetchImageBytes(url);
              if (bytes) zip.file(`slide_${i + 1}.png`, bytes);
            }
          }
        } catch (e) {
          console.error(`[generate-download] AI image error slide ${i + 1}:`, e);
        }
      }
    }

    // Captions file
    let captionsText = `# ${content.title}\n\n`;
    if (brandSnapshot) captionsText += `## Marca: ${(brandSnapshot as any).name}\n`;
    captionsText += `## Modo Visual: ${visualMode}\n\n`;
    captionsText += `## Legenda Principal\n${content.caption}\n\n`;
    captionsText += `## Hashtags\n${content.hashtags?.join(" ") || ""}\n\n`;
    if ((content as any).source_summary) captionsText += `## Base do Conteúdo\n${(content as any).source_summary}\n\n`;
    captionsText += `## Slides\n\n`;
    slides.forEach((slide, idx) => {
      captionsText += `### Slide ${idx + 1} (${slide.role || "slide"})\n**${slide.headline}**\n${slide.body}\n`;
      if (slide.bullets && slide.bullets.length > 0) {
        captionsText += slide.bullets.map(b => `  • ${b}`).join("\n") + "\n";
      }
      if (slide.speakerNotes) captionsText += `_Speaker Notes: ${slide.speakerNotes}_\n`;
      captionsText += "\n";
    });
    zip.file("legendas.txt", captionsText);

    const zipContent = await zip.generateAsync({ type: "base64" });

    await supabase
      .from("generated_contents")
      .update({ image_urls: imageUrls, status: "approved", updated_at: new Date().toISOString() })
      .eq("id", contentId);

    console.log(`[generate-download] ZIP generated: ${imageUrls.length} files`);

    return new Response(JSON.stringify({
      success: true,
      zipBase64: zipContent,
      imageUrls,
      filename: `${content.title.substring(0, 30).replace(/[^a-zA-Z0-9]/g, "_")}_content.zip`,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[generate-download] error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Unknown error"
    }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
