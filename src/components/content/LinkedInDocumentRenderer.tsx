/**
 * Professional LinkedIn Document renderer.
 * Produces clean, consulting-style presentation pages for LinkedIn's native document/carousel format.
 * Fully respects the brand's layout_params (backgrounds, gradients, shapes, decorations, typography)
 * while maintaining a professional document layout structure.
 */
import React from "react";

// ══════ TYPES ══════

interface SlideData {
  headline: string;
  body: string;
  bullets?: string[];
  role?: string;
  slide_title?: string;
  key_stat?: string;
  template?: string;
  templateHint?: string;
  image_url?: string;
  background_image_url?: string;
  overlay?: any;
}

interface BrandSnapshot {
  name: string;
  palette: { name: string; hex: string }[] | string[];
  fonts: { headings: string; body: string };
  visual_tone?: string;
  logo_url?: string | null;
  layout_params?: Record<string, LayoutParams> | null;
  style_guide?: any;
}

interface LayoutParams {
  bg: { type: string; colors?: string[]; palette_index?: number; gradient_angle?: number; overlay_opacity?: number };
  shape: { type: string; position?: string; height_pct?: number; color?: string; flip?: boolean };
  wave?: { enabled: boolean; height_pct: number; palette_index: number };
  card: { enabled: boolean; style?: string; position?: string; bg_color?: string; border_radius?: number; shadow?: string; padding?: number; width_pct?: number; palette_index?: number; border?: string };
  text: { alignment: string; vertical_position: string; headline_size: number; headline_weight: number; headline_uppercase: boolean; headline_letter_spacing?: number; headline_color?: string; body_size: number; body_weight: number; body_italic?: boolean; body_color?: string; text_shadow?: string; max_width_pct?: number; text_color?: string };
  decorations?: {
    accent_bar?: { enabled: boolean; position?: string; width?: number; height?: number; color?: string };
    corner_accents?: { enabled: boolean; color?: string; size?: number };
    border?: { enabled: boolean; color?: string; width?: number; radius?: number; inset?: number };
    inner_frame?: { enabled: boolean; color?: string; width?: number; inset?: number; radius?: number };
    divider_line?: { enabled: boolean; color?: string; width?: string; position?: string };
  };
  bullet_style?: { type: string; accent_color?: string; number_bg_color?: string; number_text_color?: string; size?: number; accent_palette_index?: number; container?: { enabled: boolean; bg_color?: string; border_radius?: number; padding?: number }; container_enabled?: boolean };
  logo?: { position: string; opacity: number; size?: number; bg_circle?: boolean };
  padding?: { x: number; y: number };
}

interface LinkedInDocumentRendererProps {
  slide: SlideData;
  slideIndex: number;
  totalSlides: number;
  brand?: BrandSnapshot;
  dimensions?: { width: number; height: number };
}

// ══════ HELPERS ══════

function getHex(palette: BrandSnapshot["palette"], index: number, fallback: string): string {
  if (!palette || !palette[index]) return fallback;
  const item = palette[index];
  if (typeof item === "string") return item;
  return item.hex || fallback;
}

function hexToRgba(hex: string, alpha: number): string {
  try {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  } catch {
    return `rgba(0, 0, 0, ${alpha})`;
  }
}

function isLightColor(hex: string): boolean {
  try {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 150;
  } catch {
    return false;
  }
}

function getLayoutParams(brand: BrandSnapshot): Record<string, LayoutParams> | null {
  return brand.layout_params
    || (brand.style_guide as any)?.layout_params
    || null;
}

function getParamsForRole(brand: BrandSnapshot, role: string): LayoutParams | null {
  const lp = getLayoutParams(brand);
  if (!lp) return null;
  return lp[role] || lp["content"] || lp["cover"] || null;
}

function resolveBgColors(params: LayoutParams, palette: BrandSnapshot["palette"]): { primary: string; secondary: string } {
  if (params.bg.colors && params.bg.colors.length > 0) {
    return { primary: params.bg.colors[0], secondary: params.bg.colors[1] || params.bg.colors[0] };
  }
  const idx = params.bg.palette_index ?? 0;
  return {
    primary: getHex(palette, idx, "#1a1a2e"),
    secondary: getHex(palette, Math.min(idx + 1, (palette?.length || 3) - 1), "#0066cc"),
  };
}

function resolveAccentColor(params: LayoutParams | null, palette: BrandSnapshot["palette"]): string {
  if (params?.decorations?.accent_bar?.color) return params.decorations.accent_bar.color;
  if (params?.bullet_style?.accent_color) return params.bullet_style.accent_color;
  return getHex(palette, 2, getHex(palette, 1, "#0066cc"));
}

function resolveTextColors(params: LayoutParams | null): { headline: string; body: string } {
  if (!params) return { headline: "#ffffff", body: "rgba(255,255,255,0.85)" };
  return {
    headline: params.text.headline_color || params.text.text_color || "#ffffff",
    body: params.text.body_color || "rgba(255,255,255,0.85)",
  };
}

function buildBackground(params: LayoutParams, palette: BrandSnapshot["palette"]): string {
  const colors = resolveBgColors(params, palette);
  if (params.bg.type === "gradient") {
    return `linear-gradient(${params.bg.gradient_angle || 135}deg, ${colors.primary}, ${colors.secondary})`;
  }
  return colors.primary;
}

// ══════ COMPONENT ══════

export default function LinkedInDocumentRenderer({
  slide,
  slideIndex,
  totalSlides,
  brand,
  dimensions = { width: 1080, height: 1350 },
}: LinkedInDocumentRendererProps) {
  const role = slide.role || "content";
  const headingFont = brand?.fonts?.headings || "Inter";
  const bodyFont = brand?.fonts?.body || "Inter";
  const palette = brand?.palette || [];
  const brandName = brand?.name || "";
  const logoUrl = brand?.logo_url;

  // Extract layout_params for the specific role, with fallbacks
  const coverParams = brand ? getParamsForRole(brand, "cover") : null;
  const contentParams = brand ? getParamsForRole(brand, "content") || getParamsForRole(brand, "cover") : null;

  // Resolve colors from brand layout_params (matching SlideTemplateRenderer behavior)
  const primaryColor = coverParams
    ? resolveBgColors(coverParams, palette).primary
    : getHex(palette, 0, "#1a1a2e");
  const secondaryColor = coverParams
    ? resolveBgColors(coverParams, palette).secondary
    : getHex(palette, 1, "#0066cc");
  const accentColor = resolveAccentColor(contentParams || coverParams, palette);
  const lightAccent = hexToRgba(accentColor, 0.08);

  // Cover text colors from layout_params
  const coverTextColors = resolveTextColors(coverParams);

  // Content page colors: use layout_params for content role if available
  const contentBgColors = contentParams ? resolveBgColors(contentParams, palette) : null;
  const contentTextColors = resolveTextColors(contentParams);
  const contentBg = contentParams ? buildBackground(contentParams, palette) : "#ffffff";
  const contentBgIsLight = contentParams
    ? isLightColor(contentBgColors?.primary || "#ffffff")
    : true;

  // Decoration config from layout_params
  const accentBarHeight = contentParams?.decorations?.accent_bar?.height || coverParams?.decorations?.accent_bar?.height || 6;
  const accentBarColor = contentParams?.decorations?.accent_bar?.color || accentColor;
  const hasAccentBar = contentParams?.decorations?.accent_bar?.enabled !== false;
  const hasBorder = contentParams?.decorations?.border?.enabled;
  const borderColor = contentParams?.decorations?.border?.color || accentColor;
  const borderWidth = contentParams?.decorations?.border?.width || 2;
  const borderRadius = contentParams?.decorations?.border?.radius || 0;
  const borderInset = contentParams?.decorations?.border?.inset || 0;

  // Card config
  const cardEnabled = contentParams?.card?.enabled;
  const cardBg = contentParams?.card?.bg_color || (contentParams?.card?.palette_index != null ? getHex(palette, contentParams.card.palette_index, "#ffffff") : "rgba(255,255,255,0.95)");
  const cardRadius = contentParams?.card?.border_radius ?? 16;
  const cardPadding = contentParams?.card?.padding ?? 40;

  // Bullet style from brand
  const bulletType = contentParams?.bullet_style?.type || "numbered";
  const bulletAccent = contentParams?.bullet_style?.accent_color || accentColor;
  const bulletNumberBg = contentParams?.bullet_style?.number_bg_color || accentColor;
  const bulletNumberText = contentParams?.bullet_style?.number_text_color || "#ffffff";
  const bulletContainerEnabled = contentParams?.bullet_style?.container?.enabled ?? contentParams?.bullet_style?.container_enabled ?? false;
  const bulletContainerBg = contentParams?.bullet_style?.container?.bg_color || lightAccent;
  const bulletContainerRadius = contentParams?.bullet_style?.container?.border_radius || 12;

  // Logo config from brand
  const logoOpacity = coverParams?.logo?.opacity ?? 0.9;
  const logoSize = coverParams?.logo?.size ?? 48;

  // Shape from brand (wave, diagonal, etc.)
  const hasShape = coverParams?.shape?.type && coverParams.shape.type !== "none";
  const shapeType = coverParams?.shape?.type || "none";
  const shapeColor = coverParams?.shape?.color || getHex(palette, 2, "#ffffff");
  const shapeHeight = coverParams?.shape?.height_pct || 18;

  // Padding from brand
  const px = contentParams?.padding?.x || 64;
  const py = contentParams?.padding?.y || 60;

  const base: React.CSSProperties = {
    width: dimensions.width,
    height: dimensions.height,
    position: "relative",
    overflow: "hidden",
    fontFamily: bodyFont,
    boxSizing: "border-box",
  };

  // ── WAVE/DIAGONAL SHAPE SVG ──
  const renderShape = (position: string = "bottom", color: string, heightPct: number, type: string) => {
    const h = (dimensions.height * heightPct) / 100;
    if (type === "wave") {
      const y = position === "bottom" ? dimensions.height - h : 0;
      const path = position === "bottom"
        ? `M0,${h * 0.4} C${dimensions.width * 0.25},0 ${dimensions.width * 0.75},${h * 0.8} ${dimensions.width},${h * 0.3} L${dimensions.width},${h} L0,${h} Z`
        : `M0,0 L${dimensions.width},0 L${dimensions.width},${h * 0.6} C${dimensions.width * 0.75},${h} ${dimensions.width * 0.25},${h * 0.2} 0,${h * 0.7} Z`;
      return (
        <svg style={{ position: "absolute", left: 0, top: y, width: "100%", height: h }} viewBox={`0 0 ${dimensions.width} ${h}`} preserveAspectRatio="none">
          <path d={path} fill={color} />
        </svg>
      );
    }
    if (type === "diagonal") {
      const y = position === "bottom" ? dimensions.height - h : 0;
      const path = position === "bottom"
        ? `M0,${h} L${dimensions.width},0 L${dimensions.width},${h} Z`
        : `M0,0 L${dimensions.width},0 L0,${h} Z`;
      return (
        <svg style={{ position: "absolute", left: 0, top: y, width: "100%", height: h }} viewBox={`0 0 ${dimensions.width} ${h}`} preserveAspectRatio="none">
          <path d={path} fill={color} />
        </svg>
      );
    }
    return null;
  };

  // ── BORDER DECORATION ──
  const renderBorder = () => {
    if (!hasBorder) return null;
    return (
      <div style={{
        position: "absolute",
        top: borderInset,
        left: borderInset,
        right: borderInset,
        bottom: borderInset,
        border: `${borderWidth}px solid ${borderColor}`,
        borderRadius: borderRadius,
        pointerEvents: "none",
        zIndex: 10,
      }} />
    );
  };

  // ── COVER PAGE ──
  if (role === "cover") {
    const coverBg = coverParams ? buildBackground(coverParams, palette) : `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`;

    return (
      <div style={{ ...base, background: coverBg, display: "flex", flexDirection: "column", justifyContent: "center", padding: px + 20, color: coverTextColors.headline }}>
        {/* Shape decoration */}
        {hasShape && renderShape(coverParams?.shape?.position || "bottom", shapeColor, shapeHeight, shapeType)}

        {/* Border decoration */}
        {renderBorder()}

        {/* Subtle geometric decoration */}
        <div style={{ position: "absolute", top: 0, right: 0, width: 400, height: 400, borderRadius: "50%", background: "rgba(255,255,255,0.05)", transform: "translate(100px, -100px)" }} />

        {/* Corner accents */}
        {coverParams?.decorations?.corner_accents?.enabled && (
          <>
            <div style={{ position: "absolute", top: 20, left: 20, width: coverParams.decorations.corner_accents.size || 40, height: coverParams.decorations.corner_accents.size || 40, borderTop: `3px solid ${coverParams.decorations.corner_accents.color || accentColor}`, borderLeft: `3px solid ${coverParams.decorations.corner_accents.color || accentColor}` }} />
            <div style={{ position: "absolute", bottom: 20, right: 20, width: coverParams.decorations.corner_accents.size || 40, height: coverParams.decorations.corner_accents.size || 40, borderBottom: `3px solid ${coverParams.decorations.corner_accents.color || accentColor}`, borderRight: `3px solid ${coverParams.decorations.corner_accents.color || accentColor}` }} />
          </>
        )}

        {/* Logo */}
        {logoUrl && (
          <div style={{ marginBottom: 40, zIndex: 5 }}>
            <img src={logoUrl} alt="" style={{ height: logoSize, objectFit: "contain", opacity: logoOpacity }} crossOrigin="anonymous" />
          </div>
        )}

        {/* Slide title / category */}
        {slide.slide_title && (
          <div style={{
            fontFamily: bodyFont,
            fontSize: 28,
            fontWeight: 500,
            color: hexToRgba(coverTextColors.headline, 0.7),
            letterSpacing: coverParams?.text?.headline_letter_spacing ? `${coverParams.text.headline_letter_spacing}px` : "3px",
            textTransform: "uppercase",
            marginBottom: 24,
            zIndex: 5,
          }}>
            {slide.slide_title}
          </div>
        )}

        {/* Main headline */}
        <h1 style={{
          fontFamily: headingFont,
          fontSize: coverParams?.text?.headline_size || 64,
          fontWeight: coverParams?.text?.headline_weight || 800,
          color: coverTextColors.headline,
          lineHeight: 1.15,
          margin: "0 0 32px 0",
          maxWidth: `${coverParams?.text?.max_width_pct || 90}%`,
          textTransform: coverParams?.text?.headline_uppercase ? "uppercase" : "none",
          letterSpacing: coverParams?.text?.headline_letter_spacing ? `${coverParams.text.headline_letter_spacing}px` : undefined,
          zIndex: 5,
        }}>
          {slide.headline}
        </h1>

        {/* Body / subtitle */}
        {slide.body && (
          <p style={{
            fontSize: coverParams?.text?.body_size || 28,
            fontWeight: coverParams?.text?.body_weight || 400,
            color: coverTextColors.body,
            lineHeight: 1.5,
            margin: 0,
            maxWidth: "80%",
            zIndex: 5,
          }}>
            {slide.body}
          </p>
        )}

        {/* Brand attribution at bottom */}
        <div style={{ position: "absolute", bottom: py, left: px + 20, right: px + 20, display: "flex", alignItems: "center", justifyContent: "space-between", zIndex: 5 }}>
          <span style={{ fontSize: 22, color: hexToRgba(coverTextColors.headline, 0.6), fontWeight: 500 }}>{brandName}</span>
          <span style={{ fontSize: 20, color: hexToRgba(coverTextColors.headline, 0.4) }}>Deslize para ler →</span>
        </div>
      </div>
    );
  }

  // ── CONCLUSION PAGE ──
  if (role === "conclusion") {
    const conclusionBg = coverParams ? buildBackground(coverParams, palette) : `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`;

    return (
      <div style={{ ...base, background: conclusionBg, display: "flex", flexDirection: "column", justifyContent: "center", padding: px + 20, color: coverTextColors.headline }}>
        {hasShape && renderShape(coverParams?.shape?.position || "bottom", shapeColor, shapeHeight, shapeType)}
        {renderBorder()}

        {/* Accent bar */}
        {hasAccentBar && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: accentBarHeight, background: hexToRgba(coverTextColors.headline, 0.2) }} />}

        {slide.key_stat && (
          <div style={{ fontSize: 72, fontWeight: 800, fontFamily: headingFont, color: coverTextColors.headline, marginBottom: 16, zIndex: 5 }}>{slide.key_stat}</div>
        )}

        <h2 style={{
          fontFamily: headingFont,
          fontSize: coverParams?.text?.headline_size ? Math.round(coverParams.text.headline_size * 0.85) : 52,
          fontWeight: coverParams?.text?.headline_weight || 700,
          color: coverTextColors.headline,
          lineHeight: 1.2,
          margin: "0 0 32px 0",
          textTransform: coverParams?.text?.headline_uppercase ? "uppercase" : "none",
          zIndex: 5,
        }}>
          {slide.headline}
        </h2>

        {slide.body && (
          <p style={{ fontSize: 26, color: coverTextColors.body, lineHeight: 1.6, margin: "0 0 40px 0", maxWidth: "85%", zIndex: 5 }}>{slide.body}</p>
        )}

        {slide.bullets && slide.bullets.length > 0 && (
          <div style={{ marginBottom: 40, zIndex: 5 }}>
            {slide.bullets.map((b, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 14 }}>
                <span style={{ fontSize: 22, fontWeight: 700, color: hexToRgba(coverTextColors.headline, 0.6), minWidth: 28 }}>✓</span>
                <span style={{ fontSize: 24, color: hexToRgba(coverTextColors.headline, 0.9), lineHeight: 1.4 }}>{b}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ position: "absolute", bottom: py, left: px + 20, right: px + 20, display: "flex", alignItems: "center", justifyContent: "space-between", zIndex: 5 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {logoUrl && <img src={logoUrl} alt="" style={{ height: logoSize * 0.75, objectFit: "contain", opacity: logoOpacity }} crossOrigin="anonymous" />}
            <span style={{ fontSize: 22, color: hexToRgba(coverTextColors.headline, 0.7), fontWeight: 600 }}>{brandName}</span>
          </div>
          <span style={{ fontSize: 20, color: hexToRgba(coverTextColors.headline, 0.5) }}>{slideIndex + 1}/{totalSlides}</span>
        </div>
      </div>
    );
  }

  // ── CONTENT PAGES (context, data, insight, tips) ──
  const isDataSlide = role === "data";
  const isTipsSlide = role === "tips";

  // Determine text colors for content pages based on background lightness
  const headlineColor = contentBgIsLight
    ? (contentTextColors.headline !== "#ffffff" ? contentTextColors.headline : primaryColor)
    : contentTextColors.headline;
  const bodyColor = contentBgIsLight
    ? (contentTextColors.body !== "rgba(255,255,255,0.85)" ? contentTextColors.body : "#374151")
    : contentTextColors.body;
  const subtleColor = contentBgIsLight ? "#9ca3af" : hexToRgba(contentTextColors.headline, 0.5);
  const dividerColor = contentBgIsLight ? "#e5e7eb" : hexToRgba(contentTextColors.headline, 0.15);

  return (
    <div style={{
      ...base,
      background: contentBg,
      display: "flex",
      flexDirection: "column",
      padding: `${py}px ${px}px`,
      color: headlineColor,
    }}>
      {/* Top accent bar */}
      {hasAccentBar && (
        <div style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: accentBarHeight,
          background: `linear-gradient(90deg, ${primaryColor}, ${accentBarColor})`,
        }} />
      )}

      {/* Border decoration */}
      {renderBorder()}

      {/* Shape decoration */}
      {contentParams?.shape?.type && contentParams.shape.type !== "none" && renderShape(
        contentParams.shape.position || "bottom",
        contentParams.shape.color || shapeColor,
        contentParams.shape.height_pct || 15,
        contentParams.shape.type,
      )}

      {/* Header: slide title + page number */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 32,
        paddingBottom: 20,
        borderBottom: `1px solid ${dividerColor}`,
        zIndex: 5,
      }}>
        <span style={{
          fontFamily: bodyFont,
          fontSize: 20,
          fontWeight: 600,
          color: accentColor,
          letterSpacing: "2px",
          textTransform: "uppercase",
        }}>
          {slide.slide_title || role.toUpperCase()}
        </span>
        <span style={{ fontSize: 18, color: subtleColor, fontWeight: 500 }}>
          {slideIndex + 1} / {totalSlides}
        </span>
      </div>

      {/* Card wrapper for content (if brand uses cards) */}
      {cardEnabled ? (
        <div style={{
          background: cardBg,
          borderRadius: cardRadius,
          padding: cardPadding,
          flex: 1,
          display: "flex",
          flexDirection: "column",
          zIndex: 5,
        }}>
          {renderContentBody(true)}
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", zIndex: 5 }}>
          {renderContentBody(false)}
        </div>
      )}

      {/* Footer */}
      <div style={{
        position: "absolute",
        bottom: py - 10,
        left: px,
        right: px,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderTop: `1px solid ${dividerColor}`,
        paddingTop: 16,
        zIndex: 5,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {logoUrl && <img src={logoUrl} alt="" style={{ height: 24, objectFit: "contain", opacity: 0.5 }} crossOrigin="anonymous" />}
          <span style={{ fontSize: 16, color: subtleColor, fontWeight: 500 }}>{brandName}</span>
        </div>
      </div>
    </div>
  );

  // Inner function to render slide content (used inside or outside a card)
  function renderContentBody(insideCard: boolean) {
    // When inside a card on a dark background, use dark text colors
    const hColor = insideCard && !contentBgIsLight ? primaryColor : headlineColor;
    const bColor = insideCard && !contentBgIsLight ? "#374151" : bodyColor;

    return (
      <>
        {/* Key stat callout (for data slides) */}
        {isDataSlide && slide.key_stat && (
          <div style={{
            background: lightAccent,
            borderLeft: `4px solid ${accentColor}`,
            borderRadius: 8,
            padding: "28px 32px",
            marginBottom: 32,
          }}>
            <div style={{
              fontFamily: headingFont,
              fontSize: contentParams?.text?.headline_size ? Math.round(contentParams.text.headline_size * 1.3) : 64,
              fontWeight: 800,
              color: primaryColor,
              lineHeight: 1,
              marginBottom: 8,
            }}>
              {slide.key_stat}
            </div>
            {slide.headline && (
              <div style={{ fontSize: 22, color: contentBgIsLight || insideCard ? "#6b7280" : hexToRgba(contentTextColors.headline, 0.6), fontWeight: 500 }}>{slide.headline}</div>
            )}
          </div>
        )}

        {/* Headline (non-data slides) */}
        {!isDataSlide && (
          <h2 style={{
            fontFamily: headingFont,
            fontSize: contentParams?.text?.headline_size || 46,
            fontWeight: contentParams?.text?.headline_weight || 700,
            color: hColor,
            lineHeight: 1.2,
            margin: "0 0 28px 0",
            textTransform: contentParams?.text?.headline_uppercase ? "uppercase" : "none",
            letterSpacing: contentParams?.text?.headline_letter_spacing ? `${contentParams.text.headline_letter_spacing}px` : undefined,
          }}>
            {slide.headline}
          </h2>
        )}

        {/* Body text */}
        {slide.body && (
          <p style={{
            fontSize: contentParams?.text?.body_size || 26,
            fontWeight: contentParams?.text?.body_weight || 400,
            fontStyle: contentParams?.text?.body_italic ? "italic" : "normal",
            color: bColor,
            lineHeight: 1.65,
            margin: isDataSlide ? "0 0 28px 0" : "0 0 32px 0",
            maxWidth: `${contentParams?.text?.max_width_pct || 95}%`,
          }}>
            {slide.body}
          </p>
        )}

        {/* Bullets */}
        {slide.bullets && slide.bullets.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: isTipsSlide ? 20 : 16, flex: 1 }}>
            {slide.bullets.map((bullet, i) => (
              <div key={i} style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 16,
                ...(bulletContainerEnabled || isTipsSlide ? {
                  background: bulletContainerBg,
                  borderRadius: bulletContainerRadius,
                  padding: "20px 24px",
                } : {}),
              }}>
                <div style={{
                  minWidth: 36,
                  height: 36,
                  borderRadius: bulletType === "numbered" ? 10 : 18,
                  background: bulletType === "checkmark" ? "transparent" : bulletNumberBg,
                  border: bulletType === "checkmark" ? `2px solid ${bulletAccent}` : "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  marginTop: 2,
                }}>
                  <span style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: bulletType === "checkmark" ? bulletAccent : bulletNumberText,
                  }}>
                    {bulletType === "checkmark" ? "✓" : i + 1}
                  </span>
                </div>
                <span style={{
                  fontSize: contentParams?.text?.body_size ? contentParams.text.body_size - 2 : 24,
                  color: bColor,
                  lineHeight: 1.5,
                  fontWeight: isTipsSlide ? 500 : 400,
                }}>
                  {bullet}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Data slide: headline below stat if not already shown */}
        {isDataSlide && slide.body && !slide.key_stat && (
          <h2 style={{
            fontFamily: headingFont,
            fontSize: contentParams?.text?.headline_size ? contentParams.text.headline_size - 4 : 42,
            fontWeight: contentParams?.text?.headline_weight || 700,
            color: hColor,
            lineHeight: 1.2,
            margin: "0 0 24px 0",
          }}>
            {slide.headline}
          </h2>
        )}
      </>
    );
  }
}
