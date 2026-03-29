import { useRef, useCallback } from "react";
import { toPng } from "html-to-image";
import type { StyleGuide } from "@/types/studio";

// ══════ TYPES ══════

interface LayoutParams {
  bg: {
    type: string;
    colors?: string[];
    palette_index?: number;
    gradient_angle?: number;
    overlay_opacity?: number;
  };
  shape: {
    type: string;
    position?: string;
    height_pct?: number;
    color?: string;
    flip?: boolean;
  };
  // Legacy wave support
  wave?: { enabled: boolean; height_pct: number; palette_index: number };
  card: {
    enabled: boolean;
    style?: string;
    position?: string;
    bg_color?: string;
    border_radius?: number;
    shadow?: string;
    padding?: number;
    width_pct?: number;
    border?: string;
    // Legacy fields
    palette_index?: number;
  };
  text: {
    alignment: string;
    vertical_position: string;
    headline_size: number;
    headline_weight: number;
    headline_uppercase: boolean;
    headline_letter_spacing?: number;
    headline_color?: string;
    body_size: number;
    body_weight: number;
    body_italic?: boolean;
    body_color?: string;
    text_shadow?: string;
    max_width_pct?: number;
    // Legacy fields
    text_color?: string;
  };
  decorations?: {
    accent_bar?: { enabled: boolean; position?: string; width?: number; height?: number; color?: string };
    corner_accents?: { enabled: boolean; color?: string; size?: number };
    border?: { enabled: boolean; color?: string; width?: number; radius?: number; inset?: number };
    divider_line?: { enabled: boolean; color?: string; width?: string; position?: string };
    inner_frame?: { enabled: boolean; color?: string; width?: number; inset?: number; radius?: number };
  };
  secondary_card?: {
    enabled: boolean;
    position?: string;
    bg_color?: string;
    border_radius?: number;
    padding?: number;
    width_pct?: number;
    content_type?: string;
  };
  device_mockup?: {
    enabled: boolean;
    type?: string;
    position?: string;
    width_pct?: number;
    offset_y_pct?: number;
    border_color?: string;
    border_width?: number;
    border_radius?: number;
    show_notch?: boolean;
    content_bg?: string;
    shadow?: string;
  };
  logo?: { position: string; opacity: number; size?: number; bg_circle?: boolean };
  padding?: { x: number; y: number };
  bullet_style?: {
    type: string;
    accent_color?: string;
    number_bg_color?: string;
    number_text_color?: string;
    size?: number;
    accent_palette_index?: number;
    container?: { enabled: boolean; bg_color?: string; border_radius?: number; padding?: number };
    // Legacy
    container_enabled?: boolean;
    container_palette_index?: number;
    container_border_radius?: number;
  };
  cta_icons?: {
    enabled: boolean;
    style?: string;
    items?: { icon: string; label: string }[] | string[];
    icon_size?: number;
    label_color?: string;
  };
}

interface SlideData {
  headline: string;
  body: string;
  imagePrompt?: string;
  illustrationPrompt?: string;
  previewImage?: string;
  image_url?: string;
  background_image_url?: string;
  background_url?: string;
  selected_image?: { image_url?: string; id?: string } | null;
  templateHint?: string;
  template?: string;
  role?: string;
  bullets?: string[];
}

interface BrandSnapshot {
  name: string;
  palette: { name: string; hex: string }[] | string[];
  fonts: { headings: string; body: string };
  visual_tone: string;
  logo_url: string | null;
  style_guide?: any | null;
  visual_signature?: any | null;
  layout_params?: Record<string, LayoutParams> | null;
}

interface SlideTemplateRendererProps {
  slide: SlideData;
  slideIndex: number;
  totalSlides: number;
  brand: BrandSnapshot;
  template?: string;
  dimensions?: { width: number; height: number };
}

// ══════ HELPERS ══════

function getHex(palette: BrandSnapshot["palette"], index: number, fallback: string): string {
  if (!palette || !palette[index]) return fallback;
  const item = palette[index];
  if (typeof item === "string") return item;
  return item.hex || fallback;
}

function getLayoutParams(brand: BrandSnapshot): Record<string, LayoutParams> | null {
  return brand.layout_params
    || (brand.style_guide as any)?.layout_params
    || null;
}

function getParamsForRole(brand: BrandSnapshot, role: string): LayoutParams | null {
  const lp = getLayoutParams(brand);
  if (!lp) return null;
  return lp[role] || lp["content"] || null;
}

// Resolve colors from new format (bg.colors) or legacy format (bg.palette_index)
function resolveBgColors(params: LayoutParams, palette: BrandSnapshot["palette"]): { primary: string; secondary: string } {
  if (params.bg.colors && params.bg.colors.length > 0) {
    return {
      primary: params.bg.colors[0],
      secondary: params.bg.colors[1] || params.bg.colors[0],
    };
  }
  // Legacy: palette_index
  const idx = params.bg.palette_index ?? 1;
  return {
    primary: getHex(palette, idx, "#1a1a2e"),
    secondary: getHex(palette, (idx + 1) % (palette?.length || 3), "#a4d3eb"),
  };
}

function resolveTextColors(params: LayoutParams, palette: BrandSnapshot["palette"]): { headline: string; body: string } {
  return {
    headline: params.text.headline_color || params.text.text_color || "#ffffff",
    body: params.text.body_color || "#ffffffcc",
  };
}

function resolveAccentColor(params: LayoutParams, palette: BrandSnapshot["palette"]): string {
  return params.decorations?.accent_bar?.color || getHex(palette, 2, "#c52244");
}

function resolveShapeColor(params: LayoutParams, palette: BrandSnapshot["palette"]): string {
  if (params.shape?.color) return params.shape.color;
  // Legacy wave support
  if (params.wave?.enabled) return getHex(palette, params.wave.palette_index, "#a4d3eb");
  return "#ffffff";
}

function getTextShadow(level?: string): string {
  if (level === "strong") return "0 2px 12px rgba(0,0,0,0.5), 0 1px 4px rgba(0,0,0,0.3)";
  if (level === "subtle") return "0 1px 6px rgba(0,0,0,0.3)";
  return "none";
}

function getCardShadow(level?: string): string {
  if (level === "strong") return "0 12px 48px rgba(0,0,0,0.15)";
  if (level === "soft") return "0 8px 32px rgba(0,0,0,0.08)";
  return "none";
}

function resolveSlidePreviewImage(slide: SlideData): string | undefined {
  return slide.previewImage
    || slide.background_image_url
    || slide.image_url
    || slide.background_url
    || slide.selected_image?.image_url
    || undefined;
}

// ══════ PARAMETERIZED TEMPLATE ══════

const ParameterizedTemplate = ({ slide, brand, dimensions, slideIndex, totalSlides }: SlideTemplateRendererProps) => {
  const role = slide.role || (slideIndex === 0 ? "cover" : slideIndex === totalSlides - 1 ? "cta" : "content");
  const params = getParamsForRole(brand, role);
  if (!params) return null;

  const w = dimensions?.width || 1080;
  const h = dimensions?.height || 1350;
  const px = params.padding?.x || 60;
  const py = params.padding?.y || 80;

  const bgColors = resolveBgColors(params, brand.palette);
  const textColors = resolveTextColors(params, brand.palette);
  const accentColor = resolveAccentColor(params, brand.palette);
  const shapeColor = resolveShapeColor(params, brand.palette);

  // Build background style
  let bgStyle: string;
  if (params.bg.type === "gradient") {
    bgStyle = `linear-gradient(${params.bg.gradient_angle || 180}deg, ${bgColors.primary}, ${bgColors.secondary})`;
  } else {
    bgStyle = bgColors.primary;
  }

  // Text alignment
  const textAlign = (params.text.alignment || "center") as "left" | "center" | "right";
  const justifyContent = params.text.vertical_position === "top" ? "flex-start"
    : params.text.vertical_position === "bottom" ? "flex-end" : "center";

  const isBullets = role === "bullets" || role === "insight";
  const isCta = role === "cta" || role === "closing";
  const bullets = slide.bullets || [];
  const textShadow = getTextShadow(params.text.text_shadow);
  const previewImageUrl = resolveSlidePreviewImage(slide);
  const secondaryTopContent = (params.secondary_card?.content_type === "body" ? slide.body : slide.headline) || "";
  const secondaryBottomContent = (params.secondary_card?.content_type === "headline" ? slide.headline : slide.body) || "";
  const showSecondaryTopCard = Boolean(
    params.secondary_card?.enabled
    && params.secondary_card.position === "top"
    && secondaryTopContent.trim().length > 0,
  );
  const showSecondaryBottomCard = Boolean(
    params.secondary_card?.enabled
    && params.secondary_card.position === "bottom"
    && secondaryBottomContent.trim().length > 0,
  );

  // Determine shape (new format or legacy wave)
  const hasWave = params.shape?.type === "wave" || (params.wave?.enabled);
  const hasDiagonal = params.shape?.type === "diagonal";
  const shapePosition = params.shape?.position || "bottom";
  const shapeHeight = params.shape?.height_pct || params.wave?.height_pct || 18;

  // Card config
  const cardEnabled = params.card?.enabled;
  const cardBg = params.card?.bg_color || (params.card?.palette_index != null ? getHex(brand.palette, params.card.palette_index, "#ffffff") : "#ffffff");
  const cardRadius = params.card?.border_radius ?? 24;
  const cardShadow = getCardShadow(typeof params.card?.shadow === "string" ? params.card.shadow : (params.card?.shadow ? "soft" : "none"));
  const cardPosition = params.card?.position || "center";
  const cardWidthPct = params.card?.width_pct || 85;
  const cardPadding = params.card?.padding ?? 48;

  // CTA items
  const defaultCtaItems = [
    { icon: "❤️", label: "Curta" },
    { icon: "💬", label: "Comente" },
    { icon: "🔄", label: "Compartilhe" },
    { icon: "📌", label: "Salve" },
  ];
  const ctaItems = params.cta_icons?.items?.map((item: any) =>
    typeof item === "string" ? { icon: item === "like" ? "❤️" : item === "send" ? "🔄" : item === "save" ? "📌" : "💬", label: item } : item
  ) || defaultCtaItems;

  // Max text width
  const maxTextWidth = params.text.max_width_pct ? `${params.text.max_width_pct}%` : "100%";

  return (
    <div style={{
      width: w, height: h, background: bgStyle, position: "relative", overflow: "hidden",
      fontFamily: `'${brand.fonts?.headings || "Inter"}', sans-serif`,
      display: "flex", flexDirection: "column",
    }}>
      {/* Photo overlay background */}
      {previewImageUrl && (params.bg.type === "photo_overlay" || params.bg.type === "image_overlay") && (
        <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
          <img src={previewImageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{
            position: "absolute", inset: 0,
            background: params.bg.gradient_angle
              ? `linear-gradient(${params.bg.gradient_angle}deg, ${bgColors.primary}${Math.round((params.bg.overlay_opacity || 0.6) * 255).toString(16).padStart(2, '0')}, ${bgColors.secondary}${Math.round((params.bg.overlay_opacity || 0.6) * 255).toString(16).padStart(2, '0')})`
              : `${bgColors.primary}${Math.round((params.bg.overlay_opacity || 0.6) * 255).toString(16).padStart(2, '0')}`,
          }} />
        </div>
      )}

      {/* Wave shape */}
      {hasWave && (
        <svg
          viewBox="0 0 1080 200" preserveAspectRatio="none"
          style={{
            position: "absolute",
            [shapePosition]: 0, left: 0,
            width: "100%", height: `${shapeHeight}%`, zIndex: 1,
            transform: shapePosition === "top" ? "rotate(180deg)" : undefined,
          }}
        >
          <path d="M0,80 C180,20 360,140 540,80 C720,20 900,140 1080,80 L1080,200 L0,200 Z" fill={shapeColor} />
        </svg>
      )}

      {/* Diagonal cut shape */}
      {hasDiagonal && (
        <svg
          viewBox="0 0 1080 200" preserveAspectRatio="none"
          style={{
            position: "absolute",
            [shapePosition]: 0, left: 0,
            width: "100%", height: `${shapeHeight}%`, zIndex: 1,
          }}
        >
          <polygon points={shapePosition === "top" ? "0,0 1080,0 1080,200" : "0,200 1080,0 1080,200"} fill={shapeColor} />
        </svg>
      )}

      {/* Decorative corner accents */}
      {params.decorations?.corner_accents?.enabled && (
        <>
          <div style={{
            position: "absolute", top: 0, left: 0,
            width: params.decorations.corner_accents.size || 120,
            height: params.decorations.corner_accents.size || 120,
            background: `linear-gradient(135deg, ${params.decorations.corner_accents.color || shapeColor}44 0%, transparent 70%)`,
            zIndex: 1,
          }} />
          <div style={{
            position: "absolute", bottom: 0, right: 0,
            width: (params.decorations.corner_accents.size || 120) * 1.5,
            height: (params.decorations.corner_accents.size || 120) * 1.5,
            background: `linear-gradient(315deg, ${accentColor}22 0%, transparent 70%)`,
            zIndex: 1,
          }} />
        </>
      )}

      {/* Decorative border */}
      {params.decorations?.border?.enabled && (
        <div style={{
          position: "absolute",
          inset: params.decorations.border.inset || 20,
          border: `${params.decorations.border.width || 2}px solid ${params.decorations.border.color || accentColor}`,
          borderRadius: params.decorations.border.radius || 0,
          zIndex: 1,
          pointerEvents: "none",
        }} />
      )}

      {/* Inner frame decoration */}
      {params.decorations?.inner_frame?.enabled && (
        <div style={{
          position: "absolute",
          inset: params.decorations.inner_frame.inset || 30,
          border: `${params.decorations.inner_frame.width || 2}px solid ${params.decorations.inner_frame.color || accentColor}`,
          borderRadius: params.decorations.inner_frame.radius || 0,
          zIndex: 1,
          pointerEvents: "none",
        }} />
      )}

      {/* Device mockup */}
      {params.device_mockup?.enabled && previewImageUrl && (
        <div style={{
          position: "absolute",
          zIndex: 2,
          ...(params.device_mockup.position === "right" ? { right: px, top: `${(params.device_mockup.offset_y_pct || 10)}%` }
            : params.device_mockup.position === "left" ? { left: px, top: `${(params.device_mockup.offset_y_pct || 10)}%` }
            : { left: "50%", transform: "translateX(-50%)", top: `${(params.device_mockup.offset_y_pct || 15)}%` }),
          width: `${params.device_mockup.width_pct || 55}%`,
        }}>
          <div style={{
            backgroundColor: params.device_mockup.border_color || "#333",
            borderRadius: params.device_mockup.border_radius || 32,
            padding: params.device_mockup.border_width || 8,
            boxShadow: params.device_mockup.shadow === "strong" ? "0 20px 60px rgba(0,0,0,0.3)" : params.device_mockup.shadow === "soft" ? "0 12px 40px rgba(0,0,0,0.15)" : "none",
          }}>
            {params.device_mockup.show_notch !== false && (
              <div style={{
                width: "40%", height: 14, borderRadius: 10,
                backgroundColor: params.device_mockup.border_color || "#333",
                margin: "0 auto 6px",
                position: "relative",
                zIndex: 1,
              }}>
                <div style={{
                  width: "100%", height: "100%", borderRadius: 10,
                  backgroundColor: "#1a1a1a",
                }} />
              </div>
            )}
            <div style={{
              backgroundColor: params.device_mockup.content_bg || "#ffffff",
              borderRadius: (params.device_mockup.border_radius || 32) - (params.device_mockup.border_width || 8),
              overflow: "hidden",
              aspectRatio: "9/16",
            }}>
              <img src={previewImageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
          </div>
        </div>
      )}

      {/* Main content area */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        justifyContent: cardPosition === "bottom" ? "flex-end" : justifyContent,
        alignItems: textAlign === "center" ? "center" : textAlign === "right" ? "flex-end" : "flex-start",
        padding: cardEnabled && cardPosition === "bottom" ? `${py}px ${px}px 0` : `${py}px ${px}px`,
        zIndex: 3, textAlign,
      }}>
        {/* Secondary card (e.g., headline at top when main card is at bottom) */}
        {showSecondaryTopCard && (
          <div style={{
            backgroundColor: params.secondary_card?.bg_color || "#ffffff",
            borderRadius: params.secondary_card?.border_radius || 16,
            padding: params.secondary_card?.padding || 32,
            width: `${params.secondary_card?.width_pct || 85}%`,
            marginBottom: 24,
            textAlign,
          }}>
            <h2 style={{
              color: isLightColor(params.secondary_card?.bg_color || "#ffffff") ? "#1a1a2e" : "#ffffff",
              fontSize: params.text.headline_size * 0.8,
              fontWeight: params.text.headline_weight,
              lineHeight: 1.2,
              textTransform: params.text.headline_uppercase ? "uppercase" : undefined,
            }}>{secondaryTopContent}</h2>
          </div>
        )}

        {/* Card wrapper (optional) */}
        {cardEnabled ? (
          <div style={{
            backgroundColor: cardBg,
            borderRadius: cardPosition === "bottom"
              ? `${cardRadius}px ${cardRadius}px 0 0`
              : cardRadius,
            padding: `${cardPadding}px`,
            width: `${cardWidthPct}%`,
            maxWidth: `${cardWidthPct}%`,
            boxShadow: cardShadow,
            textAlign,
            ...(cardPosition === "bottom" ? { marginTop: "auto" } : {}),
            ...(params.card?.border && params.card.border !== "none" ? { border: params.card.border } : {}),
          }}>
            {renderContent(textColors, accentColor, true)}
          </div>
        ) : (
          <div style={{ maxWidth: maxTextWidth }}>
            {renderContent(textColors, accentColor, false)}
          </div>
        )}

        {/* Secondary card at bottom */}
        {showSecondaryBottomCard && (
          <div style={{
            backgroundColor: params.secondary_card?.bg_color || "#ffffff",
            borderRadius: params.secondary_card?.border_radius || 16,
            padding: params.secondary_card?.padding || 32,
            width: `${params.secondary_card?.width_pct || 85}%`,
            marginTop: 24,
            textAlign,
          }}>
            <p style={{
              color: isLightColor(params.secondary_card?.bg_color || "#ffffff") ? "#1a1a2e" : "#ffffff",
              fontSize: params.text.body_size,
              fontWeight: params.text.body_weight,
              lineHeight: 1.5,
            }}>{secondaryBottomContent}</p>
          </div>
        )}
      </div>

      {/* Slide badge */}
      <div style={{
        position: "absolute", top: 40, right: 40,
        backgroundColor: accentColor, color: "#ffffff",
        padding: "8px 20px", borderRadius: 20,
        fontSize: 18, fontWeight: 600, zIndex: 3,
      }}>
        {slideIndex === 0 ? "CAPA" : `${slideIndex + 1}/${totalSlides}`}
      </div>

      {/* Logo */}
      {brand.logo_url && params.logo && (
        <LogoMarkParameterized
          logoUrl={brand.logo_url}
          position={params.logo.position}
          opacity={params.logo.opacity}
          size={params.logo.size || 48}
          bgCircle={params.logo.bg_circle}
        />
      )}
    </div>
  );

  function renderContent(colors: { headline: string; body: string }, accent: string, insideCard: boolean) {
    // When inside a card, determine if text colors should be dark
    const headlineColor = insideCard && isLightColor(cardBg) ? darkenForCard(colors.headline) : colors.headline;
    const bodyColor = insideCard && isLightColor(cardBg) ? darkenForCard(colors.body) : colors.body;

    return (
      <>
        {/* Accent bar above headline */}
        {params!.decorations?.accent_bar?.enabled && params!.decorations.accent_bar.position !== "below_headline" && (
          <div style={{
            width: params!.decorations.accent_bar.width || 60,
            height: params!.decorations.accent_bar.height || 6,
            backgroundColor: params!.decorations.accent_bar.color || accent,
            borderRadius: 3,
            marginBottom: 28,
            ...(textAlign === "center" ? { marginLeft: "auto", marginRight: "auto" } : {}),
          }} />
        )}

        {/* Headline */}
        <h1 style={{
          color: headlineColor,
          fontSize: params!.text.headline_size,
          fontWeight: params!.text.headline_weight,
          lineHeight: 1.15,
          letterSpacing: params!.text.headline_letter_spacing ? `${params!.text.headline_letter_spacing}em` : undefined,
          textTransform: params!.text.headline_uppercase ? "uppercase" : undefined,
          marginBottom: 24,
          textShadow: insideCard ? "none" : textShadow,
        }}>
          {slide.headline}
        </h1>

        {/* Accent bar below headline */}
        {params!.decorations?.accent_bar?.enabled && params!.decorations.accent_bar.position === "below_headline" && (
          <div style={{
            width: params!.decorations.accent_bar.width || 60,
            height: params!.decorations.accent_bar.height || 6,
            backgroundColor: params!.decorations.accent_bar.color || accent,
            borderRadius: 3,
            marginBottom: 24,
            ...(textAlign === "center" ? { marginLeft: "auto", marginRight: "auto" } : {}),
          }} />
        )}

        {/* Divider line */}
        {params!.decorations?.divider_line?.enabled && (
          <div style={{
            width: params!.decorations.divider_line.width || "60%",
            height: 1,
            backgroundColor: params!.decorations.divider_line.color || accent,
            marginBottom: 24,
            ...(textAlign === "center" ? { marginLeft: "auto", marginRight: "auto" } : {}),
          }} />
        )}

        {/* Bullets */}
        {isBullets && bullets.length > 0 ? (
          <div style={{
            display: "flex", flexDirection: "column", gap: 16,
            ...(getBulletContainerEnabled() ? {
              backgroundColor: getBulletContainerBg(),
              borderRadius: getBulletContainerRadius(),
              padding: `${getBulletContainerPadding()}px`,
            } : {}),
          }}>
            {bullets.map((bullet, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                {renderBulletMarker(i, accent)}
                <p style={{
                  color: getBulletContainerEnabled() ? "#1a1a2e" : bodyColor,
                  fontSize: params!.text.body_size,
                  lineHeight: 1.5,
                  fontWeight: params!.text.body_weight,
                  fontFamily: `'${brand.fonts?.body || "Inter"}', sans-serif`,
                  textShadow: insideCard ? "none" : textShadow,
                }}>{bullet}</p>
              </div>
            ))}
          </div>
        ) : isCta && params!.cta_icons?.enabled ? (
          <>
            <p style={{
              color: bodyColor,
              fontSize: params!.text.body_size,
              fontWeight: params!.text.body_weight,
              lineHeight: 1.5,
              marginBottom: 40,
              fontFamily: `'${brand.fonts?.body || "Inter"}', sans-serif`,
              textShadow: insideCard ? "none" : textShadow,
            }}>
              {slide.body}
            </p>
            <div style={{ display: "flex", justifyContent: "center", gap: 40, marginTop: 24 }}>
              {ctaItems.map((item: any, i: number) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                  <div style={{ fontSize: params!.cta_icons?.icon_size || 48, lineHeight: 1 }}>{item.icon}</div>
                  <span style={{
                    color: params!.cta_icons?.label_color || bodyColor, fontSize: 18, fontWeight: 500,
                    fontFamily: `'${brand.fonts?.body || "Inter"}', sans-serif`,
                  }}>{item.label}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p style={{
            color: bodyColor,
            fontSize: params!.text.body_size,
            fontWeight: params!.text.body_weight,
            lineHeight: 1.6,
            fontStyle: params!.text.body_italic ? "italic" : undefined,
            fontFamily: `'${brand.fonts?.body || "Inter"}', sans-serif`,
            textShadow: insideCard ? "none" : textShadow,
          }}>
            {slide.body}
          </p>
        )}
      </>
    );
  }

  function renderBulletMarker(index: number, accent: string) {
    const bs = params!.bullet_style;
    const bulletType = bs?.type || "numbered_circle";
    const markerSize = bs?.size || 36;
    const bgColor = bs?.number_bg_color || bs?.accent_color || accent;
    const textColor = bs?.number_text_color || "#ffffff";

    if (bulletType === "checkmark") {
      return <span style={{ fontSize: markerSize * 0.6, lineHeight: 1, marginTop: 4, color: bgColor }}>✓</span>;
    }
    if (bulletType === "dash") {
      return <span style={{ fontSize: markerSize * 0.6, lineHeight: 1, marginTop: 4, color: bgColor }}>—</span>;
    }
    if (bulletType === "arrow") {
      return <span style={{ fontSize: markerSize * 0.6, lineHeight: 1, marginTop: 4, color: bgColor }}>→</span>;
    }
    // numbered_circle default
    return (
      <div style={{
        width: markerSize, height: markerSize, borderRadius: "50%",
        backgroundColor: bgColor, color: textColor,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: markerSize * 0.5, fontWeight: 700, flexShrink: 0, marginTop: 2,
      }}>
        {index + 1}
      </div>
    );
  }

  function getBulletContainerEnabled(): boolean {
    return params!.bullet_style?.container?.enabled || params!.bullet_style?.container_enabled || false;
  }
  function getBulletContainerBg(): string {
    return params!.bullet_style?.container?.bg_color
      || (params!.bullet_style?.container_palette_index != null ? getHex(brand.palette, params!.bullet_style.container_palette_index, "#e8a8a0") + "dd" : "#e8a8a0dd");
  }
  function getBulletContainerRadius(): number {
    return params!.bullet_style?.container?.border_radius || params!.bullet_style?.container_border_radius || 16;
  }
  function getBulletContainerPadding(): number {
    return params!.bullet_style?.container?.padding || 36;
  }
};

function isLightColor(hex: string): boolean {
  const c = hex.replace("#", "");
  if (c.length < 6) return true;
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 140;
}

function darkenForCard(color: string): string {
  // If color is light/white, return dark text
  if (isLightColor(color)) return "#1a1a2e";
  return color;
}

function LogoMarkParameterized({ logoUrl, position, opacity, size, bgCircle }: { logoUrl: string; position: string; opacity: number; size: number; bgCircle?: boolean }) {
  const posStyle: React.CSSProperties = { position: "absolute", zIndex: 3 };
  if (position.includes("top")) posStyle.top = 40;
  else posStyle.bottom = 40;
  if (position.includes("right")) posStyle.right = 40;
  else if (position.includes("left")) posStyle.left = 40;
  else { posStyle.left = "50%"; posStyle.transform = "translateX(-50%)"; }

  if (bgCircle) {
    return (
      <div style={{
        ...posStyle, width: size + 24, height: size + 24, borderRadius: "50%",
        backgroundColor: "rgba(255,255,255,0.9)", display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <img src={logoUrl} alt="Logo" style={{ height: size, objectFit: "contain", opacity }} />
      </div>
    );
  }
  return <img src={logoUrl} alt="Logo" style={{ ...posStyle, height: size, objectFit: "contain", opacity }} />;
}

// ══════ LEGACY TEMPLATES (fallback when no layout_params) ══════

function getTypo(brand: BrandSnapshot) {
  const typo = (brand.style_guide as any)?.brand_tokens?.typography;
  return {
    headlineWeight: typo?.headline_weight || 800,
    bodyWeight: typo?.body_weight || 400,
    uppercase: typo?.uppercase_headlines || false,
  };
}

function getLogoConfig(brand: BrandSnapshot) {
  const logo = (brand.style_guide as any)?.brand_tokens?.logo;
  return {
    position: logo?.preferred_position || "bottom-center",
    opacity: logo?.watermark_opacity || 0.35,
  };
}

const WaveSVG = ({ color, position, heightPct = 18 }: { color: string; position: "bottom" | "top"; heightPct?: number }) => (
  <svg
    viewBox="0 0 1080 200" preserveAspectRatio="none"
    style={{
      position: "absolute", [position]: 0, left: 0, width: "100%", height: `${heightPct}%`,
      transform: position === "top" ? "rotate(180deg)" : undefined,
    }}
  >
    <path d="M0,80 C180,20 360,140 540,80 C720,20 900,140 1080,80 L1080,200 L0,200 Z" fill={color} />
  </svg>
);

function SlideBadge({ slideIndex, totalSlides, bgColor, textColor }: { slideIndex: number; totalSlides: number; bgColor: string; textColor: string }) {
  return (
    <div style={{
      position: "absolute", top: 40, right: 40,
      backgroundColor: bgColor, color: textColor,
      padding: "8px 20px", borderRadius: 20, fontSize: 18, fontWeight: 600, zIndex: 3,
    }}>
      {slideIndex === 0 ? "CAPA" : `${slideIndex + 1}/${totalSlides}`}
    </div>
  );
}

function LogoMark({ brand, position, opacity }: { brand: BrandSnapshot; position: string; opacity: number }) {
  if (!brand.logo_url) return null;
  const posStyle: React.CSSProperties = { position: "absolute", zIndex: 3, objectFit: "contain" };
  if (position.includes("top")) posStyle.top = 40;
  else posStyle.bottom = 40;
  if (position.includes("right")) posStyle.right = 40;
  else if (position.includes("left")) posStyle.left = 40;
  else { posStyle.left = "50%"; posStyle.transform = "translateX(-50%)"; }
  return <img src={brand.logo_url} alt="Logo" style={{ ...posStyle, height: 48, opacity }} />;
}

function AccentBar({ color, style }: { color: string; style?: React.CSSProperties }) {
  return <div style={{ width: 60, height: 6, backgroundColor: color, borderRadius: 3, ...style }} />;
}

// Legacy template components (kept for backwards compatibility)

const WaveCoverTemplate = ({ slide, brand, dimensions, slideIndex, totalSlides }: SlideTemplateRendererProps) => {
  const c0 = getHex(brand.palette, 0, "#a4d3eb");
  const c1 = getHex(brand.palette, 1, "#10559a");
  const c2 = getHex(brand.palette, 2, "#c52244");
  const typo = getTypo(brand);
  const logoConf = getLogoConfig(brand);
  const w = dimensions?.width || 1080;
  const h = dimensions?.height || 1350;
  const previewImageUrl = resolveSlidePreviewImage(slide);
  return (
    <div style={{ width: w, height: h, background: c0, position: "relative", overflow: "hidden", fontFamily: `'${brand.fonts?.headings || "Inter"}', sans-serif`, display: "flex", flexDirection: "column" }}>
      {previewImageUrl && <div style={{ position: "absolute", inset: 0, zIndex: 0, opacity: 0.15 }}><img src={previewImageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /></div>}
      <WaveSVG color="#ffffff" position="bottom" heightPct={18} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "80px 60px", zIndex: 2 }}>
        <AccentBar color={c2} style={{ marginBottom: 32 }} />
        <h1 style={{ color: c1, fontSize: 64, fontWeight: typo.headlineWeight, lineHeight: 1.15, marginBottom: 24, textTransform: typo.uppercase ? "uppercase" : undefined }}>{slide.headline}</h1>
        <p style={{ color: c1, fontSize: 32, fontWeight: typo.bodyWeight, lineHeight: 1.5, opacity: 0.8, fontFamily: `'${brand.fonts?.body || "Inter"}', sans-serif` }}>{slide.body}</p>
      </div>
      <SlideBadge slideIndex={slideIndex} totalSlides={totalSlides} bgColor={c1} textColor="#ffffff" />
      <LogoMark brand={brand} position={logoConf.position} opacity={logoConf.opacity} />
    </div>
  );
};

const WaveTextCardTemplate = ({ slide, brand, dimensions, slideIndex, totalSlides }: SlideTemplateRendererProps) => {
  const c0 = getHex(brand.palette, 0, "#a4d3eb");
  const c1 = getHex(brand.palette, 1, "#10559a");
  const c2 = getHex(brand.palette, 2, "#c52244");
  const typo = getTypo(brand);
  const logoConf = getLogoConfig(brand);
  const w = dimensions?.width || 1080;
  const h = dimensions?.height || 1350;
  return (
    <div style={{ width: w, height: h, background: c0, position: "relative", overflow: "hidden", fontFamily: `'${brand.fonts?.headings || "Inter"}', sans-serif`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <WaveSVG color="#ffffff" position="bottom" heightPct={18} />
      <div style={{ backgroundColor: "#ffffff", borderRadius: 24, padding: "48px 48px", margin: "0 48px", maxWidth: "85%", boxShadow: "0 8px 32px rgba(0,0,0,0.08)", zIndex: 2, textAlign: "center" }}>
        <AccentBar color={c2} style={{ margin: "0 auto 28px", width: 48, height: 4 }} />
        <h2 style={{ color: c1, fontSize: 48, fontWeight: typo.headlineWeight, lineHeight: 1.25, marginBottom: 20, textTransform: typo.uppercase ? "uppercase" : undefined }}>{slide.headline}</h2>
        <p style={{ color: c1, fontSize: 28, fontWeight: typo.bodyWeight, lineHeight: 1.6, opacity: 0.75, fontFamily: `'${brand.fonts?.body || "Inter"}', sans-serif` }}>{slide.body}</p>
      </div>
      <SlideBadge slideIndex={slideIndex} totalSlides={totalSlides} bgColor={c1} textColor="#ffffff" />
      <LogoMark brand={brand} position={logoConf.position} opacity={logoConf.opacity} />
    </div>
  );
};

const WaveBulletsTemplate = ({ slide, brand, dimensions, slideIndex, totalSlides }: SlideTemplateRendererProps) => {
  const c0 = getHex(brand.palette, 0, "#a4d3eb");
  const c1 = getHex(brand.palette, 1, "#10559a");
  const c2 = getHex(brand.palette, 2, "#c52244");
  const typo = getTypo(brand);
  const logoConf = getLogoConfig(brand);
  const w = dimensions?.width || 1080;
  const h = dimensions?.height || 1350;
  const bullets = slide.bullets || [];
  return (
    <div style={{ width: w, height: h, background: c0, position: "relative", overflow: "hidden", fontFamily: `'${brand.fonts?.headings || "Inter"}', sans-serif`, display: "flex", flexDirection: "column" }}>
      <WaveSVG color="#ffffff" position="bottom" heightPct={15} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "80px 60px", zIndex: 2 }}>
        <AccentBar color={c2} style={{ marginBottom: 24 }} />
        <h2 style={{ color: c1, fontSize: 52, fontWeight: typo.headlineWeight, lineHeight: 1.2, marginBottom: 32, textTransform: typo.uppercase ? "uppercase" : undefined }}>{slide.headline}</h2>
        {bullets.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {bullets.map((bullet, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", backgroundColor: c2, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, flexShrink: 0, marginTop: 2 }}>{i + 1}</div>
                <p style={{ color: c1, fontSize: 28, lineHeight: 1.5, fontWeight: typo.bodyWeight, fontFamily: `'${brand.fonts?.body || "Inter"}', sans-serif` }}>{bullet}</p>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: c1, fontSize: 28, lineHeight: 1.6, opacity: 0.8, fontWeight: typo.bodyWeight, fontFamily: `'${brand.fonts?.body || "Inter"}', sans-serif` }}>{slide.body}</p>
        )}
      </div>
      <SlideBadge slideIndex={slideIndex} totalSlides={totalSlides} bgColor={c1} textColor="#ffffff" />
      <LogoMark brand={brand} position={logoConf.position} opacity={logoConf.opacity} />
    </div>
  );
};

const WaveClosingTemplate = ({ slide, brand, dimensions, slideIndex, totalSlides }: SlideTemplateRendererProps) => {
  const c0 = getHex(brand.palette, 0, "#a4d3eb");
  const c1 = getHex(brand.palette, 1, "#10559a");
  const c2 = getHex(brand.palette, 2, "#c52244");
  const typo = getTypo(brand);
  const logoConf = getLogoConfig(brand);
  const w = dimensions?.width || 1080;
  const h = dimensions?.height || 1350;
  return (
    <div style={{ width: w, height: h, background: c1, position: "relative", overflow: "hidden", fontFamily: `'${brand.fonts?.headings || "Inter"}', sans-serif`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
      <WaveSVG color={c0} position="bottom" heightPct={18} />
      <div style={{ zIndex: 2, padding: "60px", maxWidth: "85%" }}>
        <AccentBar color={c2} style={{ margin: "0 auto 32px", width: 60 }} />
        <h2 style={{ color: "#ffffff", fontSize: 52, fontWeight: typo.headlineWeight, lineHeight: 1.2, marginBottom: 24, textTransform: typo.uppercase ? "uppercase" : undefined }}>{slide.headline}</h2>
        <p style={{ color: "#ffffff", fontSize: 30, fontWeight: typo.bodyWeight, lineHeight: 1.5, opacity: 0.85, fontFamily: `'${brand.fonts?.body || "Inter"}', sans-serif` }}>{slide.body}</p>
      </div>
      <SlideBadge slideIndex={slideIndex} totalSlides={totalSlides} bgColor="#ffffff33" textColor="#fff" />
      <LogoMark brand={brand} position={logoConf.position} opacity={1} />
    </div>
  );
};

const StoryCoverTemplate = ({ slide, brand, dimensions, slideIndex, totalSlides }: SlideTemplateRendererProps) => {
  const c0 = getHex(brand.palette, 0, "#a4d3eb");
  const c1 = getHex(brand.palette, 1, "#10559a");
  const c2 = getHex(brand.palette, 2, "#c52244");
  const typo = getTypo(brand);
  const logoConf = getLogoConfig(brand);
  const w = dimensions?.width || 1080;
  const h = dimensions?.height || 1920;
  const previewImageUrl = resolveSlidePreviewImage(slide);
  return (
    <div style={{ width: w, height: h, background: c0, position: "relative", overflow: "hidden", fontFamily: `'${brand.fonts?.headings || "Inter"}', sans-serif`, display: "flex", flexDirection: "column" }}>
      {previewImageUrl && <div style={{ position: "absolute", inset: 0, zIndex: 0, opacity: 0.2 }}><img src={previewImageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /></div>}
      <WaveSVG color="#ffffff" position="bottom" heightPct={15} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "220px 60px 260px", zIndex: 2 }}>
        <AccentBar color={c2} style={{ marginBottom: 40 }} />
        <h1 style={{ color: c1, fontSize: 72, fontWeight: 900, lineHeight: 1.1, marginBottom: 32, textTransform: typo.uppercase ? "uppercase" : undefined }}>{slide.headline}</h1>
        <p style={{ color: c1, fontSize: 36, fontWeight: typo.bodyWeight, lineHeight: 1.5, opacity: 0.8, fontFamily: `'${brand.fonts?.body || "Inter"}', sans-serif` }}>{slide.body}</p>
      </div>
      <LogoMark brand={brand} position={logoConf.position} opacity={logoConf.opacity} />
    </div>
  );
};

const GenericFreeTemplate = ({ slide, dimensions, slideIndex, totalSlides }: SlideTemplateRendererProps) => {
  const w = dimensions?.width || 1080;
  const h = dimensions?.height || 1350;
  const previewImageUrl = resolveSlidePreviewImage(slide);
  return (
    <div style={{ width: w, height: h, background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", position: "relative", overflow: "hidden", fontFamily: "'Inter', sans-serif", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
      {previewImageUrl && (
        <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
          <img src={previewImageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }} />
        </div>
      )}
      <div style={{ zIndex: 2, padding: "60px", maxWidth: "90%" }}>
        <h1 style={{ color: "#ffffff", fontSize: 56, fontWeight: 800, lineHeight: 1.2, marginBottom: 24, textShadow: "0 2px 10px rgba(0,0,0,0.3)" }}>{slide.headline}</h1>
        <p style={{ color: "#ffffff", fontSize: 28, fontWeight: 400, lineHeight: 1.6, opacity: 0.9, textShadow: "0 1px 5px rgba(0,0,0,0.2)" }}>{slide.body}</p>
      </div>
      {totalSlides > 1 && (
        <div style={{ position: "absolute", top: 40, right: 40, backgroundColor: "rgba(255,255,255,0.2)", color: "#fff", padding: "8px 20px", borderRadius: 20, fontSize: 18, fontWeight: 600 }}>
          {`${slideIndex + 1}/${totalSlides}`}
        </div>
      )}
    </div>
  );
};

// ══════ LEGACY TEMPLATE MAP ══════

const LegacyTemplateMap: Record<string, React.FC<SlideTemplateRendererProps>> = {
  wave_cover: WaveCoverTemplate,
  wave_text_card: WaveTextCardTemplate,
  wave_bullets: WaveBulletsTemplate,
  wave_closing: WaveClosingTemplate,
  wave_closing_cta: WaveClosingTemplate,
  wave_cta: WaveClosingTemplate,
  story_cover: StoryCoverTemplate,
  generic_free: GenericFreeTemplate,
};

// ══════ RESOLVE TEMPLATE ══════

export function resolveTemplateForSlide(
  templateSet: any | null,
  role: string,
): string {
  // 1. Check templates_by_role (new system — unique IDs per pillar)
  const tbr = templateSet?.templates_by_role as Record<string, string> | undefined;
  if (tbr?.[role]) return tbr[role];

  // 2. Check layout_params (parameterized rendering)
  if (templateSet?.layout_params?.[role] || templateSet?.layout_params?.["content"]) {
    return "parameterized";
  }

  // 3. Legacy fallback
  const roleMap: Record<string, string> = {
    cover: "wave_cover", context: "wave_text_card", content: "wave_text_card",
    insight: "wave_bullets", bullets: "wave_bullets", quote: "wave_text_card",
    question: "wave_text_card", closing: "wave_closing", cta: "wave_closing",
  };
  return roleMap[role] || "wave_text_card";
}

export function getTemplateForSlide(slideIndex: number, totalSlides: number, styleGuide?: StyleGuide | null): string {
  if (slideIndex === 0) return "wave_cover";
  if (slideIndex === totalSlides - 1) return "wave_closing";
  return "wave_text_card";
}

// ══════ TEMPLATE MISSING FALLBACK ══════

const TemplateMissing = ({ templateId, role, brand }: { templateId: string; role: string; brand: BrandSnapshot }) => {
  const pilar = (brand as any)?.pilar_editorial || "?";
  const setId = (brand as any)?.template_set_id || "?";
  return (
    <div style={{
      width: "100%", height: "100%", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 16,
      background: "#1a1a2e", color: "#ff6b6b", fontFamily: "monospace", padding: 40,
      textAlign: "center",
    }}>
      <div style={{ fontSize: 48 }}>⚠️</div>
      <div style={{ fontSize: 20, fontWeight: 700 }}>TEMPLATE MISSING</div>
      <div style={{ fontSize: 14, color: "#aaa", lineHeight: 1.8 }}>
        <div>template_id: <span style={{ color: "#ff6b6b" }}>{templateId}</span></div>
        <div>role: <span style={{ color: "#ffd93d" }}>{role}</span></div>
        <div>pilar: <span style={{ color: "#6bcb77" }}>{pilar}</span></div>
        <div>template_set_id: <span style={{ color: "#4d96ff" }}>{typeof setId === "string" ? setId.substring(0, 12) : setId}...</span></div>
      </div>
      <div style={{ fontSize: 12, color: "#666", marginTop: 8 }}>
        Este template não existe no registry. Regenere os Estilos de Conteúdo.
      </div>
    </div>
  );
};

// ══════ MAIN RENDERER ══════

const SlideTemplateRenderer = (props: SlideTemplateRendererProps) => {
  const templateName = props.template || props.slide.templateHint || props.slide.template || "wave_cover";
  const role = props.slide.role || (props.slideIndex === 0 ? "cover" : "content");

  // 1. Try parameterized template (new system with layout_params)
  const hasLayoutParams = getLayoutParams(props.brand) !== null;
  if (hasLayoutParams || templateName === "parameterized") {
    const result = ParameterizedTemplate(props);
    if (result) return result;
  }

  // 2. Try legacy template map
  const Component = LegacyTemplateMap[templateName];
  if (Component) return <Component {...props} />;

  // 3. If template ID is a custom pillar-specific ID (not in legacy map and no layout_params)
  //    → show "Template Missing" instead of silent fallback
  if (templateName !== "wave_cover" && templateName !== "parameterized" && !hasLayoutParams) {
    return <TemplateMissing templateId={templateName} role={role} brand={props.brand} />;
  }

  // 4. Ultimate fallback
  return <WaveCoverTemplate {...props} />;
};

// ══════ EXPORT TO PNG ══════

export function useExportSlide() {
  const ref = useRef<HTMLDivElement>(null);
  const exportToPng = useCallback(async (
    node: HTMLElement,
    opts?: { width?: number; height?: number }
  ): Promise<string> => {
    const dataUrl = await toPng(node, {
      width: opts?.width || 1080, height: opts?.height || 1350,
      pixelRatio: 1, quality: 0.95, cacheBust: true,
    });
    return dataUrl;
  }, []);
  return { ref, exportToPng };
}

export default SlideTemplateRenderer;
