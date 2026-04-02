import { useState, useCallback } from "react";

export type GenerationPhase = "idle" | "config" | "background" | "text" | "composition" | "done";

export type ConfigStep =
  | "platform"
  | "content_type"
  | "brand"
  | "content_style"
  | "source_input"
  | "source_type"
  | "source_link"
  | "source_write"
  | "source_phrase"
  | "suggestions_pending"
  | "illustration_title"
  | "visual_style"
  | "slide_count"
  | "background_mode"
  | "visual_fidelity"
  | "background_template_pick"
  | "upload_image"
  | "photo_source";

export interface SlideData {
  id: string;
  slide_index: number;
  slide_text: string | null;
  backgroundOptions: string[];
  selectedBackground: string | null;
  compositeUrl: string | null;
  headline: string | null;
  body: string | null;
}

export interface GenerationFlowState {
  // Input
  sourceText: string | null;
  sourceUrl: string | null;
  sourceFile: string | null;

  // Config (phase 1)
  platform: "instagram" | "linkedin" | null;
  contentType: "post" | "carousel" | "story" | "document" | "article" | null;
  brandId: string | null;
  brandName: string | null;
  contentStyle: "news" | "quote" | "tip" | "educational" | "curiosity" | null;
  slideCount: number | null;
  visualMode: "brand_strict" | "brand_guided" | "free" | null;
  visualStyle: "template_clean" | "ai_background" | "ai_full_design" | "ai_illustration" | "ai_illustration_titled" | "photo_overlay" | null;
  backgroundMode: "ai_generate" | "saved_template" | "user_upload" | "brand_photos" | null;
  brandCreationMode: string | null;
  brandDefaultVisualStyle: string | null;
  templateId: string | null;
  uploadedImageUrl: string | null;

  // Results per phase
  contentId: string | null;
  postId: string | null;
  slides: SlideData[];
  selectedBackgrounds: Record<string, string>;
  slideTexts: Record<string, { headline: string; body: string }>;
  finalImageUrls: string[];

  // State
  phase: GenerationPhase;
  configStep: ConfigStep;
  isLoading: boolean;
  error: string | null;
  loadingMessage: string | null;
}

const INITIAL_STATE: GenerationFlowState = {
  sourceText: null,
  sourceUrl: null,
  sourceFile: null,
  platform: null,
  contentType: null,
  brandId: null,
  brandName: null,
  contentStyle: null,
  slideCount: null,
  visualMode: null,
  visualStyle: null,
  backgroundMode: null,
  brandCreationMode: null,
  brandDefaultVisualStyle: null,
  templateId: null,
  uploadedImageUrl: null,
  contentId: null,
  postId: null,
  slides: [],
  selectedBackgrounds: {},
  slideTexts: {},
  finalImageUrls: [],
  phase: "idle",
  configStep: "platform",
  isLoading: false,
  error: null,
  loadingMessage: null,
};

export function useGenerationFlow() {
  const [flow, setFlow] = useState<GenerationFlowState>(INITIAL_STATE);

  const startFlow = useCallback((opts?: { sourceUrl?: string; sourceText?: string; sourceFile?: string; platform?: GenerationFlowState["platform"]; contentType?: GenerationFlowState["contentType"]; contentStyle?: GenerationFlowState["contentStyle"]; brandId?: string; brandName?: string }) => {
    // Smart step-skipping: determine first step based on what's already provided
    const hasSource = opts?.sourceText && opts.sourceText.length >= 10;
    let initialStep: ConfigStep = "platform";
    if (opts?.platform && opts?.contentType && hasSource) {
      initialStep = "brand";
    } else if (opts?.platform && opts?.contentType) {
      initialStep = "brand";
    } else if (opts?.platform) {
      initialStep = hasSource ? "brand" : "content_type";
    }

    setFlow({
      ...INITIAL_STATE,
      sourceUrl: opts?.sourceUrl || null,
      sourceText: opts?.sourceText || null,
      sourceFile: opts?.sourceFile || null,
      platform: opts?.platform || null,
      contentType: opts?.contentType || null,
      contentStyle: opts?.contentStyle || null,
      brandId: opts?.brandId || null,
      brandName: opts?.brandName || null,
      phase: "config",
      configStep: initialStep,
    });
  }, []);

  const updateFlow = useCallback((partial: Partial<GenerationFlowState>) => {
    setFlow((prev) => ({ ...prev, ...partial }));
  }, []);

  const setPhase = useCallback((phase: GenerationPhase) => {
    setFlow((prev) => ({ ...prev, phase, isLoading: false, error: null }));
  }, []);

  const setConfigStep = useCallback((step: ConfigStep) => {
    setFlow((prev) => ({ ...prev, configStep: step }));
  }, []);

  const setLoading = useCallback((isLoading: boolean, message?: string) => {
    setFlow((prev) => ({ ...prev, isLoading, loadingMessage: message || null }));
  }, []);

  const setError = useCallback((error: string | null) => {
    setFlow((prev) => ({ ...prev, error, isLoading: false }));
  }, []);

  const updateSlideBackground = useCallback((slideId: string, url: string) => {
    setFlow((prev) => {
      const newBgs = { ...prev.selectedBackgrounds, [slideId]: url };
      const newSlides = prev.slides.map((s) =>
        s.id === slideId ? { ...s, selectedBackground: url } : s
      );
      return { ...prev, selectedBackgrounds: newBgs, slides: newSlides };
    });
  }, []);

  const updateSlideTexts = useCallback((slideId: string, texts: { headline: string; body: string }) => {
    setFlow((prev) => {
      const newTexts = { ...prev.slideTexts, [slideId]: texts };
      const newSlides = prev.slides.map((s) =>
        s.id === slideId ? { ...s, headline: texts.headline, body: texts.body } : s
      );
      return { ...prev, slideTexts: newTexts, slides: newSlides };
    });
  }, []);

  const resetFlow = useCallback(() => {
    setFlow(INITIAL_STATE);
  }, []);

  const isActive = flow.phase !== "idle" && flow.phase !== "done";

  return {
    flow,
    isActive,
    startFlow,
    updateFlow,
    setPhase,
    setConfigStep,
    setLoading,
    setError,
    updateSlideBackground,
    updateSlideTexts,
    resetFlow,
  };
}
