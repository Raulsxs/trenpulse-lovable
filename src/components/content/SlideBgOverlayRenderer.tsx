/**
 * SlideBgOverlayRenderer — Renders AI-generated background with editable text overlay.
 * Supports free drag-and-drop positioning when `editable` is true.
 * Used when render_mode === "AI_BG_OVERLAY" and background_image_url exists.
 */

import { useRef } from "react";
import { cn } from "@/lib/utils";
import DraggableTextBlock, { type BlockPosition } from "./DraggableTextBlock";

export interface OverlayData {
  headline?: string;
  body?: string;
  bullets?: string[];
  footer?: string;
}

export interface OverlayStyle {
  safe_area_top?: number;
  safe_area_bottom?: number;
  text_align?: "left" | "center";
  max_headline_lines?: number;
  font_scale?: number;
  headline_font_size?: number;
  body_font_size?: number;
  bullets_font_size?: number;
  max_width_pct?: number; // text block max-width as percentage (30–100)
  headline_max_width_pct?: number;
  body_max_width_pct?: number;
  bullets_max_width_pct?: number;
  text_shadow_level?: number; // 0 = none, 1 = light, 2 = medium (default), 3 = heavy
}

export interface OverlayPositions {
  headline?: BlockPosition;
  body?: BlockPosition;
  bullets?: BlockPosition;
  cta?: BlockPosition;
  footer?: BlockPosition;
  badge?: BlockPosition;
}

interface SlideBgOverlayRendererProps {
  backgroundImageUrl?: string;
  overlay: OverlayData;
  overlayStyle?: OverlayStyle;
  overlayPositions?: OverlayPositions;
  onPositionChange?: (key: string, pos: BlockPosition) => void;
  selectedBlock?: string | null;
  onSelectBlock?: (key: string | null) => void;
  editable?: boolean;
  dimensions?: { width: number; height: number };
  role?: string;
  slideIndex?: number;
  totalSlides?: number;
  brandSnapshot?: {
    palette?: string[];
    fonts?: { headings?: string; body?: string };
  } | null;
  className?: string;
}

// Default positions (percentage-based) for auto-layout fallback
function getDefaultPositions(role?: string): OverlayPositions {
  if (role === "cover") {
    return {
      badge:    { x: 5, y: 8 },
      headline: { x: 5, y: 25 },
      body:     { x: 5, y: 50 },
      bullets:  { x: 5, y: 55 },
      cta:      { x: 5, y: 78 },
      footer:   { x: 5, y: 90 },
    };
  }
  return {
    badge:    { x: 5, y: 4 },
    headline: { x: 5, y: 8 },
    body:     { x: 5, y: 25 },
    bullets:  { x: 5, y: 22 },
    cta:      { x: 5, y: 78 },
    footer:   { x: 5, y: 90 },
  };
}

export default function SlideBgOverlayRenderer({
  backgroundImageUrl,
  overlay,
  overlayStyle,
  overlayPositions,
  onPositionChange,
  selectedBlock,
  onSelectBlock,
  editable = false,
  dimensions = { width: 1080, height: 1350 },
  role,
  slideIndex = 0,
  totalSlides = 1,
  brandSnapshot,
  className,
}: SlideBgOverlayRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const textAlign = overlayStyle?.text_align ?? "left";
  const maxHeadlineLines = overlayStyle?.max_headline_lines ?? 2;
  const fontScale = overlayStyle?.font_scale ?? 1;
  const customHeadlineFontSize = overlayStyle?.headline_font_size;
  const customBodyFontSize = overlayStyle?.body_font_size;
  const customBulletsFontSize = overlayStyle?.bullets_font_size;
  const maxWidthPct = overlayStyle?.max_width_pct ?? 90;
  const shadowLevel = overlayStyle?.text_shadow_level ?? 2;

  // Shadow presets by level — uses filter: drop-shadow for uniform per-glyph rendering
  // (textShadow can skip glyphs in html-to-image / some browsers)
  const shadowFilterMap: Record<number, { headline: string; body: string }> = {
    0: { headline: "none", body: "none" },
    1: { headline: "drop-shadow(0 1px 2px rgba(0,0,0,0.35))", body: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))" },
    2: { headline: "drop-shadow(0 2px 4px rgba(0,0,0,0.6)) drop-shadow(0 1px 2px rgba(0,0,0,0.4))", body: "drop-shadow(0 1px 3px rgba(0,0,0,0.55)) drop-shadow(0 0 2px rgba(0,0,0,0.3))" },
    3: { headline: "drop-shadow(0 3px 6px rgba(0,0,0,0.8)) drop-shadow(0 1px 3px rgba(0,0,0,0.6))", body: "drop-shadow(0 2px 5px rgba(0,0,0,0.7)) drop-shadow(0 1px 3px rgba(0,0,0,0.5))" },
  };
  const headlineFilter = shadowFilterMap[shadowLevel]?.headline ?? shadowFilterMap[2].headline;
  const bodyFilter = shadowFilterMap[shadowLevel]?.body ?? shadowFilterMap[2].body;

  const headingFont = brandSnapshot?.fonts?.headings || "Inter";
  const bodyFont = brandSnapshot?.fonts?.body || "Inter";
  const accentColor = brandSnapshot?.palette?.[0] || "#667eea";

  const isFirstSlide = slideIndex === 0;
  const isCta = role === "cta";

  // No hard truncation — let CSS handle overflow with auto-sizing
  const truncatedHeadline = overlay.headline;
  const truncatedBody = overlay.body;

  // Merge custom positions with defaults
  const defaults = getDefaultPositions(role);
  const pos: OverlayPositions = {
    badge:    overlayPositions?.badge    ?? defaults.badge,
    headline: overlayPositions?.headline ?? defaults.headline,
    body:     overlayPositions?.body     ?? defaults.body,
    bullets:  overlayPositions?.bullets  ?? defaults.bullets,
    cta:      overlayPositions?.cta      ?? defaults.cta,
    footer:   overlayPositions?.footer   ?? defaults.footer,
  };

  // Helper to get per-block max width
  const getBlockMaxWidth = (key: string): number => {
    const perBlock = (overlayStyle as any)?.[`${key}_max_width_pct`];
    return perBlock || maxWidthPct;
  };

  const blockProps = (key: string, position: BlockPosition) => ({
    blockKey: key,
    position,
    onPositionChange,
    onSelect: onSelectBlock ? (k: string) => onSelectBlock(k) : undefined,
    isSelected: selectedBlock === key,
    editable,
    containerRef: containerRef as React.RefObject<HTMLDivElement>,
  });

  // Deselect when clicking the background
  const handleBackgroundClick = () => {
    if (editable && onSelectBlock) {
      onSelectBlock(null);
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn("relative overflow-hidden", className)}
      style={{ width: dimensions.width, height: dimensions.height }}
      onClick={handleBackgroundClick}
    >
      {/* Background image or gradient fallback */}
      {backgroundImageUrl ? (
        <img
          src={backgroundImageUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          style={{ display: "block" }}
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(160deg, ${accentColor} 0%, #1a1a2e 100%)`,
          }}
        />
      )}

      {/* Full-slide scrim for readability over any background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.15) 30%, rgba(0,0,0,0.25) 60%, rgba(0,0,0,0.65) 100%)",
        }}
      />

      {/* === Draggable text blocks === */}

      {/* Headline */}
      {truncatedHeadline && (
        <DraggableTextBlock {...blockProps("headline", pos.headline!)}>
          <h2
            style={{
              fontFamily: headingFont,
              fontSize: (customHeadlineFontSize || (isFirstSlide ? 52 : 44)) * fontScale,
              fontWeight: 800,
              lineHeight: 1.15,
              color: "#ffffff",
              filter: headlineFilter,
              textAlign,
              maxWidth: `${getBlockMaxWidth("headline")}%`,
              letterSpacing: "-0.02em",
              wordBreak: "break-word",
              overflowWrap: "break-word",
            }}
          >
            {truncatedHeadline}
          </h2>
        </DraggableTextBlock>
      )}

      {/* Body */}
      {truncatedBody && (
        <DraggableTextBlock {...blockProps("body", pos.body!)}>
          <p
            style={{
              fontFamily: bodyFont,
              fontSize: (customBodyFontSize || 26) * fontScale,
              fontWeight: 400,
              lineHeight: 1.55,
              color: "rgba(255,255,255,0.95)",
              filter: bodyFilter,
              textAlign,
              maxWidth: `${getBlockMaxWidth("body")}%`,
              wordBreak: "break-word",
              overflowWrap: "break-word",
            }}
          >
            {truncatedBody}
          </p>
        </DraggableTextBlock>
      )}

      {/* Bullets */}
      {overlay.bullets && overlay.bullets.length > 0 && (
        <DraggableTextBlock {...blockProps("bullets", pos.bullets!)}>
          <ul className="space-y-3" style={{ paddingLeft: 8, maxWidth: `${getBlockMaxWidth("bullets")}%` }}>
            {overlay.bullets.slice(0, 5).map((bullet, i) => (
              <li
                key={i}
                className="flex items-start gap-3"
                style={{
                  fontFamily: bodyFont,
                  fontSize: (customBulletsFontSize || 24) * fontScale,
                  lineHeight: 1.4,
                  color: "rgba(255,255,255,0.95)",
                  filter: bodyFilter,
                }}
              >
                <span style={{ color: accentColor, fontWeight: 700, fontSize: 28 * fontScale }}>•</span>
                {bullet}
              </li>
            ))}
          </ul>
        </DraggableTextBlock>
      )}

      {/* CTA */}
      {isCta && (
        <DraggableTextBlock {...blockProps("cta", pos.cta!)}>
          <div
            className="py-3 px-6 rounded-xl text-center font-bold"
            style={{
              backgroundColor: accentColor,
              color: "#fff",
              fontSize: 18 * fontScale,
              boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            }}
          >
            Saiba Mais →
          </div>
        </DraggableTextBlock>
      )}

      {/* Footer */}
      {overlay.footer && (
        <DraggableTextBlock {...blockProps("footer", pos.footer!)}>
          <p
            style={{
              fontFamily: bodyFont,
              fontSize: 14 * fontScale,
              color: "rgba(255,255,255,0.6)",
              filter: bodyFilter,
            }}
          >
            {overlay.footer}
          </p>
        </DraggableTextBlock>
      )}
    </div>
  );
}
