/**
 * Slide utilities — single source of truth for image_url normalization and draft persistence.
 */

// ══════ IMAGE_URL NORMALIZATION ══════

export interface SlideBase {
  headline: string;
  body: string;
  image_url?: string;
  previewImage?: string;
  imageUrl?: string;
  image?: string;
  [key: string]: any;
}

/**
 * Normalize a slide so that `image_url` is always the single source of truth.
 * Also keeps `previewImage` in sync for backward compat.
 */
export function normalizeSlideImage<T extends SlideBase>(slide: T): T {
  const imgUrl = slide.image_url || slide.previewImage || slide.imageUrl || slide.image || undefined;
  return {
    ...slide,
    image_url: imgUrl,
    previewImage: imgUrl, // backward compat
  };
}

/** Normalize an array of slides */
export function normalizeSlides<T extends SlideBase>(slides: T[]): T[] {
  return (slides || []).map(normalizeSlideImage);
}

/**
 * Merge a slide update preserving image_url (never overwrite with empty).
 */
export function mergeSlideUpdate<T extends SlideBase>(existing: T, updates: Partial<T>): T {
  const merged = { ...existing, ...updates };
  // If update doesn't explicitly set image_url, preserve existing
  if (!updates.image_url && existing.image_url) {
    merged.image_url = existing.image_url;
    merged.previewImage = existing.image_url;
  }
  return merged;
}

/** Get the resolved image URL from a slide */
export function getSlideImageUrl(slide: SlideBase | null | undefined): string | undefined {
  if (!slide) return undefined;
  return slide.image_url || slide.previewImage || slide.imageUrl || slide.image || undefined;
}

// ══════ AI_BG_OVERLAY MODE HELPERS ══════

export interface SlideMediaFields {
  image_url?: string;
  previewImage?: string;
  imageUrl?: string;
  image?: string;
  background_image_url?: string;
  overlay?: { headline?: string; body?: string; bullets?: string[]; footer?: string };
  overlay_style?: { safe_area_top?: number; safe_area_bottom?: number; text_align?: "left" | "center"; max_headline_lines?: number; font_scale?: number };
  render_mode?: "legacy_image" | "ai_bg_overlay";
  [key: string]: any;
}

/**
 * Normalize all image-related fields on a slide.
 * Preserves background_image_url and overlay when present.
 * Never overwrites existing values with null/undefined.
 */
export function normalizeSlideMedia<T extends SlideMediaFields>(slide: T): T {
  const imgUrl = slide.image_url || slide.previewImage || slide.imageUrl || slide.image || undefined;
  return {
    ...slide,
    image_url: imgUrl,
    previewImage: imgUrl,
    // Preserve new fields — never null them out
    background_image_url: slide.background_image_url || undefined,
    overlay: slide.overlay || undefined,
    overlay_style: slide.overlay_style || undefined,
    render_mode: slide.render_mode || undefined,
  };
}

/**
 * Merge a slide update while preserving media fields.
 * Never overwrites background_image_url or image_url with empty values.
 */
export function mergeSlideMediaUpdate<T extends SlideMediaFields>(existing: T, updates: Partial<T>): T {
  const merged = { ...existing, ...updates };
  // Preserve image_url
  if (!updates.image_url && existing.image_url) {
    merged.image_url = existing.image_url;
    merged.previewImage = existing.image_url;
  }
  // Preserve background_image_url
  if (!updates.background_image_url && existing.background_image_url) {
    merged.background_image_url = existing.background_image_url;
  }
  return merged;
}

/**
 * Determine the effective render mode for a slide.
 * Priority: slide-level > content/brand level > legacy fallback
 */
export function getSlideRenderMode(
  slide: SlideMediaFields | null | undefined,
  brandRenderMode?: string,
): "legacy_image" | "ai_bg_overlay" {
  if (!slide) return "legacy_image";
  // Slide-level override
  if (slide.render_mode) return slide.render_mode;
  // If background_image_url exists, it's overlay mode
  if (slide.background_image_url) return "ai_bg_overlay";
  // Brand-level flag
  if (brandRenderMode === "AI_BG_OVERLAY") return "ai_bg_overlay";
  return "legacy_image";
}

// ══════ DRAFT PERSISTENCE ══════

const DRAFT_PREFIX = "draft:";

export interface DraftData {
  slides: any[];
  caption?: string;
  hashtags?: string[];
  title?: string;
  notes?: string;
  config?: Record<string, any>;
  savedAt: number;
}

/** Build a draft key for the studio editor */
export function buildStudioDraftKey(
  userId: string,
  brandId: string,
  templateSetId: string,
  format: string,
): string {
  return `${DRAFT_PREFIX}studio:${userId}:${brandId}:${templateSetId}:${format}`;
}

/** Build a draft key for the content editor */
export function buildContentDraftKey(contentId: string): string {
  return `${DRAFT_PREFIX}content:${contentId}`;
}

/** Save draft to localStorage */
export function saveDraft(key: string, data: DraftData): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.warn("[Draft] Failed to save:", e);
  }
}

/** Load draft from localStorage */
export function loadDraft(key: string): DraftData | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as DraftData;
  } catch {
    return null;
  }
}

/** Remove draft from localStorage */
export function clearDraft(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {}
}

/** Check if a draft is newer than a given timestamp */
export function isDraftNewer(draft: DraftData | null, dbTimestamp?: string | null): boolean {
  if (!draft) return false;
  if (!dbTimestamp) return true;
  return draft.savedAt > new Date(dbTimestamp).getTime();
}
