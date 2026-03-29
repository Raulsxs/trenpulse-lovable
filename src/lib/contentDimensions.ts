/**
 * Centralized dimension utility for content rendering across platforms.
 * All dimension consumers should import from here instead of hardcoding.
 *
 * Correct dimensions per platform:
 * - Instagram post:      1080x1080 (1:1)
 * - Instagram story:     1080x1920 (9:16)
 * - Instagram carousel:  1080x1080 (1:1)
 * - LinkedIn post:       1200x627  (landscape 1.91:1)
 * - LinkedIn carousel:   1080x1080 (1:1)
 * - LinkedIn document:   1080x1350 (4:5) — presentation slide format
 * - LinkedIn story:      1080x1920 (9:16)
 */

export type Platform = "instagram" | "linkedin";
export type ContentFormat = "post" | "story" | "carousel" | "document" | "article";

export interface Dimensions {
  width: number;
  height: number;
}

export function getContentDimensions(platform: string, contentType: string): Dimensions {
  if (platform === "linkedin") {
    if (contentType === "post") return { width: 1200, height: 627 };
    if (contentType === "document") return { width: 1080, height: 1350 }; // 4:5 presentation
    if (contentType === "story") return { width: 1080, height: 1920 };
    return { width: 1080, height: 1080 }; // carousel
  }
  // Instagram
  if (contentType === "story") return { width: 1080, height: 1920 };
  return { width: 1080, height: 1080 }; // post and carousel
}

/** Check if a content type supports multiple slides */
export function isMultiSlide(contentType: string): boolean {
  return contentType === "carousel" || contentType === "document";
}

/** Get the aspect ratio CSS string */
export function getAspectRatio(platform: string, contentType: string): string {
  if (platform === "linkedin" && (contentType === "post" || contentType === "article")) {
    return "1200/627";
  }
  if (platform === "linkedin" && contentType === "document") return "1080/1350";
  if (contentType === "story") return "9/16";
  return "1/1";
}
