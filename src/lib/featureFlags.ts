/**
 * Feature flags — centralized toggle for incremental rollouts.
 */

/**
 * When true, new content uses "bg_overlay" pipeline:
 * - AI generates background-only images (no text)
 * - Text is rendered via React overlay (SlideBgOverlayRenderer)
 * - Guarantees 100% text fidelity (no AI spelling errors)
 *
 * When false, legacy "ai_full" pipeline is used (text baked into image).
 * Existing content with render_mode already set is always respected.
 */
export const ENABLE_BG_OVERLAY = true;
