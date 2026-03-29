/**
 * Off-screen renderer used by useSlideCapture to capture slides as PNG.
 * Must be included in the JSX of any page that uses useSlideCapture.
 */
import React from "react";
import SlideTemplateRenderer from "@/components/content/SlideTemplateRenderer";
import SlideBgOverlayRenderer from "@/components/content/SlideBgOverlayRenderer";
import LinkedInDocumentRenderer from "@/components/content/LinkedInDocumentRenderer";
import { getContentDimensions } from "@/lib/contentDimensions";

interface OffScreenSlideRendererProps {
  captureIndex: number | null;
  captureRef: React.RefObject<HTMLDivElement>;
  slides: any[];
  brandSnapshot: any;
  contentType: string;
  platform?: string;
}

export default function OffScreenSlideRenderer({
  captureIndex,
  captureRef,
  slides,
  brandSnapshot,
  contentType,
  platform = "instagram",
}: OffScreenSlideRendererProps) {
  if (captureIndex === null || !slides[captureIndex]) return null;

  const slide = slides[captureIndex];
  const dims = getContentDimensions(platform, contentType);

  const isLinkedInDocument = platform === "linkedin" && contentType === "document";

  const brand = brandSnapshot
    ? {
        name: brandSnapshot.name || "",
        palette: brandSnapshot.palette || [],
        fonts: brandSnapshot.fonts || { headings: "Inter", body: "Inter" },
        visual_tone: brandSnapshot.visual_tone || "clean",
        logo_url: brandSnapshot.logo_url || null,
        layout_params: brandSnapshot.layout_params,
      }
    : undefined;

  return (
    <div
      style={{
        position: "fixed",
        left: "-9999px",
        top: 0,
        width: dims.width,
        height: dims.height,
        overflow: "hidden",
        zIndex: -1,
      }}
    >
      <div ref={captureRef} style={{ width: dims.width, height: dims.height }}>
        {slide.render_mode === "ai_full_design" && slide.background_image_url ? (
          // AI Full Design: image already has text — render as plain image
          <img
            src={slide.background_image_url}
            style={{ width: dims.width, height: dims.height, objectFit: "cover" }}
            crossOrigin="anonymous"
          />
        ) : isLinkedInDocument ? (
          <LinkedInDocumentRenderer
            slide={slide}
            slideIndex={captureIndex}
            totalSlides={slides.length}
            brand={brand}
            dimensions={dims}
          />
        ) : slide.background_image_url ? (
          <SlideBgOverlayRenderer
            backgroundImageUrl={slide.background_image_url}
            overlay={
              slide.overlay || {
                headline: slide.headline,
                body: slide.body,
                bullets: slide.bullets,
              }
            }
            overlayStyle={slide.overlay_style}
            overlayPositions={slide.overlay_positions}
            dimensions={dims}
            role={slide.role}
            slideIndex={captureIndex}
            totalSlides={slides.length}
            brandSnapshot={
              brandSnapshot
                ? { palette: brandSnapshot.palette, fonts: brandSnapshot.fonts }
                : null
            }
          />
        ) : (
          <SlideTemplateRenderer
            slide={slide}
            slideIndex={captureIndex}
            totalSlides={slides.length}
            brand={brand}
            template={slide.templateHint || slide.template || "parameterized"}
            dimensions={dims}
          />
        )}
      </div>
    </div>
  );
}
