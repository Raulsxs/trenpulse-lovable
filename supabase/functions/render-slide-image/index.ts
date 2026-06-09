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
  // photo_overlay: use accent color for headline if brand has one, otherwise white
  const photoOverlayHeadlineColor = isPhotoOverlay && accentColor && accentColor !== "#667eea" ? "#ffffff" : textColor;

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
    pos.headline = { x: 6, y: isVertical ? 70 : 62 };
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
            "linear-gradient(180deg, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.0) 50%, rgba(0,0,0,0.2) 70%, rgba(0,0,0,0.65) 100%)",
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
    if (isPhotoOverlay) {
      // photo_overlay: professional "lower third" headline with accent bar
      children.push(
        posBlock(
          pos.headline,
          Math.round(w * getBlockMaxWidth("headline") / 100),
          React.createElement(
            "div",
            {
              style: {
                display: "flex",
                flexDirection: "column",
                gap: 12,
              },
            },
            // Accent bar (brand color)
            React.createElement("div", {
              style: {
                width: 48,
                height: 4,
                backgroundColor: accentColor,
                borderRadius: 2,
              },
            }),
            // Headline text
            React.createElement(
              "div",
              {
                style: {
                  color: "#ffffff",
                  fontFamily: brandSnapshot?.fonts?.headings || "Inter",
                  fontSize: headlineFontSize,
                  fontWeight: 700,
                  lineHeight: 1.2,
                  letterSpacing: "-0.01em",
                  display: "flex",
                  wordBreak: "break-word" as any,
                },
              },
              headline,
            ),
          ),
        ),
      );
    } else {
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

// ══════════════════════════════════════════════════════════════════
// TWEET-CARD RENDERER (X/Twitter style cards — replaces Blotato tweet-card)
// Deterministic template render: text is always crisp (no image-model garble),
// layout identical slide-to-slide. Profile supplies name/@handle/avatar.
// ══════════════════════════════════════════════════════════════════

// Official X verified badge — rendered as a data-URI <img> (Satori does NOT
// render inline <svg> element trees reliably, but DOES render <img src=svg>).
const VERIFIED_BADGE_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="34" height="34">` +
  `<path fill="#1d9bf0" d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34zm-11.71 4.2L6.8 12.46l1.41-1.42 2.26 2.26 4.8-5.23 1.47 1.36-6.2 6.77z"/></svg>`;
const VERIFIED_BADGE_SRC = `data:image/svg+xml;base64,${btoa(VERIFIED_BADGE_SVG)}`;

// Pre-fetch a remote image into a data URI. Satori's internal fetch of remote
// <img> URLs fails silently in edge runtimes (CORS/redirects/slow host) → blank.
async function toDataUri(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`image fetch failed: ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  const mime = res.headers.get("content-type") || "image/jpeg";
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return `data:${mime};base64,${btoa(bin)}`;
}

// ── Twemoji support (Satori renders zero emoji without loadAdditionalAsset) ──
const U200D = String.fromCharCode(0x200d); // zero-width joiner
const UFE0Fg = new RegExp(String.fromCharCode(0xfe0f), "g"); // variation selector-16
function toCodePoint(unicodeSurrogates: string, sep = "-"): string {
  const r: string[] = [];
  let c = 0, p = 0, i = 0;
  while (i < unicodeSurrogates.length) {
    c = unicodeSurrogates.charCodeAt(i++);
    if (p) {
      r.push((0x10000 + ((p - 0xd800) << 10) + (c - 0xdc00)).toString(16));
      p = 0;
    } else if (0xd800 <= c && c <= 0xdbff) {
      p = c;
    } else {
      r.push(c.toString(16));
    }
  }
  return r.join(sep);
}
function getIconCode(emoji: string): string {
  return toCodePoint(emoji.indexOf(U200D) < 0 ? emoji.replace(UFE0Fg, "") : emoji);
}
const TWEMOJI_BASE = "https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg/";
const emojiCache = new Map<string, string>();
async function loadEmojiSVG(emoji: string): Promise<string> {
  const code = getIconCode(emoji);
  if (emojiCache.has(code)) return emojiCache.get(code)!;
  let dataUri = "";
  try {
    const svg = await fetch(`${TWEMOJI_BASE}${code}.svg`).then((r) => (r.ok ? r.text() : ""));
    if (svg) dataUri = `data:image/svg+xml;base64,${btoa(svg)}`;
  } catch { /* skip — Satori renders nothing for empty string */ }
  emojiCache.set(code, dataUri);
  return dataUri;
}
// Passed to ImageResponse so emoji graphemes resolve to Twemoji SVGs.
const tweetEmojiLoader = async (code: string, segment: string): Promise<string> => {
  if (code === "emoji") return await loadEmojiSVG(segment);
  return segment;
};

async function loadTweetFonts(): Promise<
  { name: string; data: ArrayBuffer; weight: number; style: "normal" }[]
> {
  // Inter is the de-facto legal substitute for X's proprietary Chirp font.
  const [reg, bold] = await Promise.all([
    loadFontData(FONT_CDN_MAP["Inter"].regular),
    loadFontData(FONT_CDN_MAP["Inter"].bold),
  ]);
  // Separate family names per weight: Satori 0.0.40 does NOT reliably match
  // fontWeight 400 vs 700 under one family name (renders everything bold).
  // Selecting the weight via fontFamily sidesteps that — "Inter"=regular, "InterBold"=bold.
  return [
    { name: "Inter", data: reg, weight: 400, style: "normal" },
    { name: "InterBold", data: bold, weight: 700, style: "normal" },
  ];
}

// Char-count heuristic (Satori has no render-time text measurement) — short
// tweets get the big "single tweet" type; long ones shrink to fit.
function tweetFontSize(text: string): number {
  const n = (text || "").length;
  if (n <= 70) return 64;
  if (n <= 140) return 54;
  if (n <= 220) return 48;
  if (n <= 280) return 42;
  return 38;
}

// Fallback sanitizer for Satori font-shaping errors ("substFormat: 3 is not yet supported"):
// strips emoji/symbols/arrows/ZWJ/variation-selectors and NFC-normalizes, keeping Latin+accents.
function sanitizeForFont(text: string): string {
  return (text || "")
    .normalize("NFC")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

type TweetProfile = { name?: string; handle?: string; avatar_url?: string; verified?: boolean };

function buildTweetCardElement(
  text: string,
  profile: TweetProfile,
  idx: number,
  total: number,
  avatarDataUri: string | null,
  w: number,
  h: number,
) {
  const name = (profile.name || "Seu Nome").trim();
  const handle = (profile.handle || "voce").replace(/^@+/, "").trim();
  const verified = profile.verified !== false; // default true (matches Blotato)
  const fontSize = tweetFontSize(text);

  const avatarEl = avatarDataUri
    ? React.createElement("img", {
        src: avatarDataUri, width: 112, height: 112,
        style: { width: 112, height: 112, borderRadius: 56, objectFit: "cover" as any, flexShrink: 0 },
      })
    : React.createElement("div", {
        style: {
          width: 112, height: 112, borderRadius: 56, flexShrink: 0, backgroundColor: "#1d4e89",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", fontSize: 44, fontWeight: 700, fontFamily: "InterBold",
        },
      }, (name[0] || "?").toUpperCase());

  const nameRow = React.createElement(
    "div",
    { style: { display: "flex", flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "nowrap" } },
    React.createElement("div", { style: { fontSize: 42, fontWeight: 700, fontFamily: "InterBold", color: "#0f1419", display: "flex" } }, name),
    verified ? React.createElement("img", { src: VERIFIED_BADGE_SRC, width: 34, height: 34, style: { flexShrink: 0 } }) : null,
  );
  const handleEl = React.createElement("div", { style: { fontSize: 34, fontWeight: 400, color: "#536471", display: "flex", marginTop: 2 } }, `@${handle}`);
  const whoCol = React.createElement("div", { style: { display: "flex", flexDirection: "column" } }, nameRow, handleEl);
  const header = React.createElement("div", { style: { display: "flex", flexDirection: "row", alignItems: "center", gap: 24, flexWrap: "nowrap" } }, avatarEl, whoCol);

  const body = React.createElement("div", {
    style: {
      display: "flex", marginTop: 40, fontSize, fontWeight: 400, color: "#0f1419",
      lineHeight: 1.42, whiteSpace: "pre-wrap" as any, wordBreak: "normal" as any, flexGrow: 1,
    },
  }, text);

  const children: any[] = [header, body];
  if (total > 1) {
    children.push(
      React.createElement("div", { style: { display: "flex", flexDirection: "row", marginTop: 24, fontSize: 30, color: "#536471" } }, `${idx + 1}/${total}`),
    );
  }

  return React.createElement(
    "div",
    { style: { display: "flex", flexDirection: "column", width: w, height: h, backgroundColor: "#ffffff", padding: 72, fontFamily: "Inter" } },
    ...children,
  );
}

// ── Handler ─────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { slides, brand_snapshot, content_id, dimensions, slide_offset, platform, content_type, visual_style, tweet_profile } = await req.json();
    const isTweetCard = visual_style === "tweet_card";
    const maxW = visual_style === "photo_overlay" ? 1440 : 1200;
    const maxH = visual_style === "photo_overlay" ? 2160 : 1920;
    // Tweet cards are fixed 1080×1080 (square) — the app treats carousels as square, so a
    // 4:5 card gets cropped (object-cover) in the ActionCard/preview/editor. Square fits cleanly.
    const w = isTweetCard ? 1080 : Math.min(Math.max(Number(dimensions?.width) || 1080, 720), maxW);
    const h = isTweetCard ? 1080 : Math.min(Math.max(Number(dimensions?.height) || 1080, 627), maxH);
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

    const fonts = isTweetCard ? await loadTweetFonts() : await loadBrandFonts(brand_snapshot);

    // Tweet cards: pre-fetch the avatar ONCE (reused on every slide; remote <img>
    // in Satori is flaky). Falls back to an initials circle if the fetch fails.
    let avatarDataUri: string | null = null;
    if (isTweetCard && tweet_profile?.avatar_url) {
      try {
        avatarDataUri = await toDataUri(tweet_profile.avatar_url);
      } catch (e) {
        console.warn(`[render-slide-image] avatar fetch failed, using initials: ${(e as Error).message}`);
      }
    }
    const totalSlides = slides.length;

    const compositeUrls: string[] = [];

    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];

      let element;
      if (isTweetCard) {
        const tweetText = slide.text || slide.body || slide.headline || "";
        element = buildTweetCardElement(tweetText, tweet_profile || {}, offset + i, totalSlides, avatarDataUri, w, h);
      } else {
        const bgSrc = slide.background_image_url || slide.image_url || slide.previewImage;
        element = buildSlideElement(slide, w, h, bgSrc, brand_snapshot, isLinkedInDocument, isPhotoOverlay);
      }

      let pngBuffer: Uint8Array;
      try {
        const imageResponse = new ImageResponse(element, {
          width: w,
          height: h,
          fonts: fonts as any,
          // Twemoji resolver so emoji in tweets render (Satori shows none by default).
          ...(isTweetCard ? { loadAdditionalAsset: tweetEmojiLoader } : {}),
        });
        pngBuffer = new Uint8Array(await imageResponse.arrayBuffer());
      } catch (renderErr) {
        // Satori chokes on some glyph-substitution / emoji combos ("substFormat: 3 is not yet
        // supported"). Retry the slide with sanitized text and no emoji loader so one bad
        // character never fails the whole carousel.
        console.warn(`[render-slide-image] slide ${offset + i} render failed (${(renderErr as Error).message}); retrying sanitized`);
        let el2 = element;
        if (isTweetCard) {
          const cleanText = sanitizeForFont(slide.text || slide.body || slide.headline || "");
          el2 = buildTweetCardElement(cleanText, tweet_profile || {}, offset + i, totalSlides, avatarDataUri, w, h);
        }
        const imageResponse2 = new ImageResponse(el2, { width: w, height: h, fonts: fonts as any });
        pngBuffer = new Uint8Array(await imageResponse2.arrayBuffer());
      }

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
