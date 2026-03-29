import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import SlideTemplateRenderer, { resolveTemplateForSlide } from "@/components/content/SlideTemplateRenderer";
import SlideBgOverlayRenderer from "@/components/content/SlideBgOverlayRenderer";
import { getSlideRenderMode } from "@/lib/slideUtils";
import {
  Sparkles, Palette, Layers, Square, Smartphone, Save,
  ChevronLeft, ChevronRight, Plus, Trash2, Loader2,
  Newspaper, Quote, Lightbulb, GraduationCap, HelpCircle,
  Wand2, Copy, Hash, Image as ImageIcon, Type, FileImage, Upload,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

type GenerationMode = "full" | "caption_only" | "images_only";
import { Slider } from "@/components/ui/slider";
import { normalizeSlideImage, buildStudioDraftKey } from "@/lib/slideUtils";
import { ENABLE_BG_OVERLAY } from "@/lib/featureFlags";
import { useBackgroundGeneration } from "@/contexts/BackgroundGenerationContext";
import { useDraft } from "@/hooks/useDraft";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import DraftRestoreModal from "@/components/content/DraftRestoreModal";
import BriefingImageUpload from "@/components/studio/BriefingImageUpload";
import ImageUpload from "@/components/content/ImageUpload";

// ── Types ──

interface BrandOption {
  id: string;
  name: string;
  palette: string[];
  fonts: { headings: string; body: string } | null;
  visual_tone: string | null;
  logo_url: string | null;
  style_guide: any;
  default_template_set_id: string | null;
  render_mode?: string;
}

interface TemplateSetOption {
  id: string;
  name: string;
  description: string | null;
  template_set: any;
  category_name: string | null;
  category_id: string | null;
}

interface SlideData {
  headline: string;
  body: string;
  bullets?: string[];
  template?: string;
  role?: string;
  templateHint?: string;
  image_url?: string;
  previewImage?: string; // legacy compat
  background_image_url?: string; // AI_BG_OVERLAY mode
  overlay?: { headline?: string; body?: string; bullets?: string[]; footer?: string };
  overlay_style?: { safe_area_top?: number; safe_area_bottom?: number; text_align?: "left" | "center"; max_headline_lines?: number; font_scale?: number; headline_font_size?: number; body_font_size?: number };
  render_mode?: "legacy_image" | "ai_bg_overlay";
  speakerNotes?: string;
  illustrationPrompt?: string;
  imagePrompt?: string;
  image_stale?: boolean;
  overlay_positions?: Record<string, { x: number; y: number }>;
}

// ── Constants ──

type Platform = "instagram" | "linkedin";

const PLATFORMS = [
  { id: "instagram" as Platform, name: "Instagram", icon: Square },
  { id: "linkedin" as Platform, name: "LinkedIn", icon: Newspaper },
];

const FORMATS_BY_PLATFORM: Record<Platform, { id: string; name: string; icon: any; dims: { width: number; height: number } }[]> = {
  instagram: [
    { id: "post", name: "Post", icon: Square, dims: { width: 1080, height: 1350 } },
    { id: "story", name: "Story", icon: Smartphone, dims: { width: 1080, height: 1920 } },
    { id: "carousel", name: "Carrossel", icon: Layers, dims: { width: 1080, height: 1350 } },
  ],
  linkedin: [
    { id: "post", name: "Post com Imagem", icon: Square, dims: { width: 1200, height: 627 } },
    { id: "document", name: "Documento", icon: Layers, dims: { width: 1080, height: 1350 } },
    { id: "article", name: "Artigo", icon: Newspaper, dims: { width: 1200, height: 627 } },
  ],
};

const STYLES = [
  { id: "news", name: "Notícia", icon: Newspaper },
  { id: "quote", name: "Frase", icon: Quote },
  { id: "tip", name: "Dica", icon: Lightbulb },
  { id: "educational", name: "Educativo", icon: GraduationCap },
  { id: "curiosity", name: "Curiosidade", icon: HelpCircle },
];

// Build initial slide array dynamically based on count + CTA toggle + template set
function buildSlideArray(
  format: string,
  count: number,
  includeCta: boolean,
  templateSet?: any,
): SlideData[] {
  if (format !== "carousel") {
    const tpl = format === "story" ? "story_cover" : resolveTemplateForSlide(templateSet, "cover");
    return [{ headline: "", body: "", template: tpl, templateHint: tpl, role: "cover" }];
  }

  const tbr = templateSet?.templates_by_role as Record<string, string> | undefined;

  // Build role sequence dynamically
  const roles: string[] = ["cover"];
  const contentSlots = includeCta ? count - 2 : count - 1;
  for (let i = 0; i < Math.max(0, contentSlots); i++) {
    if (i === 0) roles.push("context");
    else if (i === contentSlots - 1) roles.push("bullets");
    else roles.push("insight");
  }
  if (includeCta) roles.push("cta");

  return roles.map((role) => {
    // Use templates_by_role if available, otherwise resolve from layout_params
    const tpl = tbr?.[role] || resolveTemplateForSlide(templateSet, role);
    return {
      headline: role === "cta" ? "Gostou do conteúdo?" : "",
      body: role === "cta" ? "Curta ❤️ Comente 💬 Compartilhe 🔄 Salve 📌" : "",
      bullets: (role === "insight" || role === "bullets") ? [""] : undefined,
      role,
      template: tpl,
      templateHint: tpl,
    };
  });
}

// ── Component ──

export default function ManualStudioEditor() {
  const navigate = useNavigate();
  const { startImageGeneration } = useBackgroundGeneration();

  // Config state
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>("instagram");
  const [selectedBrand, setSelectedBrand] = useState<string>("free");
  const [selectedTemplateSet, setSelectedTemplateSet] = useState<string>("auto");
  const [selectedFormat, setSelectedFormat] = useState("carousel");
  const [selectedStyle, setSelectedStyle] = useState("news");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");

  // Carousel controls
  const [slideCountMode, setSlideCountMode] = useState<"auto" | "fixed">("auto");
  const [slideCountVal, setSlideCountVal] = useState(6);
  const [includeCta, setIncludeCta] = useState(true);

  // Data
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [templateSets, setTemplateSets] = useState<TemplateSetOption[]>([]);
  const [slides, setSlides] = useState<SlideData[]>([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Background templates
  const [backgroundTemplates, setBackgroundTemplates] = useState<{ id: string; name: string; description: string | null; content_format: string; slide_count: number; background_images: { index: number; url: string | null; role?: string }[] }[]>([]);
  const [selectedBgTemplate, setSelectedBgTemplate] = useState<string | null>(null);

  // AI generation
  const [generating, setGenerating] = useState(false);
  const [generatingImages, setGeneratingImages] = useState(false);
  const [imageGenProgress, setImageGenProgress] = useState("");
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [sourceSummary, setSourceSummary] = useState("");
  const [keyInsights, setKeyInsights] = useState<string[]>([]);
  const [briefingImages, setBriefingImages] = useState<string[]>([]);
  const [generationMode, setGenerationMode] = useState<GenerationMode>("full");
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);

  // ── Get user ID ──
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setUserId(data.user.id);
    });
  }, []);

  // ── Load brands ──
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("brands")
        .select("id, name, palette, fonts, visual_tone, logo_url, style_guide, default_template_set_id, render_mode")
        .order("name");
      if (data) setBrands(data as unknown as BrandOption[]);
    };
    load();
  }, []);

  // ── Load template sets when brand changes ──
  useEffect(() => {
    if (selectedBrand && selectedBrand !== "free") {
      const load = async () => {
        const [tsRes, bgRes] = await Promise.all([
          supabase
            .from("brand_template_sets")
            .select("id, name, description, template_set, category_name, category_id")
            .eq("brand_id", selectedBrand)
            .eq("status", "active")
            .order("created_at"),
          supabase
            .from("brand_background_templates")
            .select("id, name, description, content_format, slide_count, background_images")
            .eq("brand_id", selectedBrand)
            .order("created_at", { ascending: false }),
        ]);
        setTemplateSets((tsRes.data || []) as unknown as TemplateSetOption[]);
        setBackgroundTemplates((bgRes.data || []) as unknown as typeof backgroundTemplates);
      };
      load();
    } else {
      setTemplateSets([]);
      setBackgroundTemplates([]);
    }
    setSelectedTemplateSet("auto");
    setSelectedBgTemplate(null);
  }, [selectedBrand]);

  // ── Resolve brand snapshot for preview ──
  const currentBrand = brands.find(b => b.id === selectedBrand);
  const defaultTsId = currentBrand?.default_template_set_id || null;
  const defaultTsName = templateSets.find(ts => ts.id === defaultTsId)?.name || null;
  const resolvedTsId = selectedTemplateSet === "auto" ? defaultTsId : selectedTemplateSet;
  const resolvedTs = templateSets.find(ts => ts.id === resolvedTsId);

  // Resolved template set data for slide building
  const activeTemplateSetData = resolvedTs?.template_set || null;
  const pilarEditorial = resolvedTs?.category_name || resolvedTs?.name || null;

  // Effective slide count for "auto" mode
  const autoSlideCount = useMemo(() => {
    const range = activeTemplateSetData?.formats?.carousel?.slide_count_range as [number, number] | undefined;
    const min = range?.[0] || 4;
    const max = range?.[1] || 8;
    return Math.round((min + max) / 2);
  }, [activeTemplateSetData]);

  const effectiveSlideCount = slideCountMode === "fixed" ? slideCountVal : autoSlideCount;

  // ── Draft persistence ──
  const draftKey = useMemo(() => {
    if (!userId) return null;
    return buildStudioDraftKey(userId, selectedBrand, selectedTemplateSet, selectedFormat);
  }, [userId, selectedBrand, selectedTemplateSet, selectedFormat]);

  const { pendingDraft, restoreDraft, discardDraft, saveToDraft, hasUnsavedChanges, clear: clearDraftStorage } = useDraft({
    draftKey,
    enabled: !!userId,
  });

  useUnsavedChangesGuard(hasUnsavedChanges);

  // Auto-save draft when content changes
  const saveDraftDebounced = useCallback(() => {
    if (!title.trim() && slides.every(s => !s.headline && !s.body)) return;
    saveToDraft({
      slides,
      caption,
      hashtags,
      title,
      notes,
      config: { selectedStyle, slideCountMode, slideCountVal, includeCta },
    });
  }, [slides, caption, hashtags, title, notes, selectedStyle, slideCountMode, slideCountVal, includeCta, saveToDraft]);

  useEffect(() => {
    saveDraftDebounced();
  }, [saveDraftDebounced]);

  // Track if user has already interacted (typed something) before draft loads
  const userHasInteracted = useRef(false);
  const draftRestoredOnce = useRef(false);

  // Mark interaction when user types title or notes
  useEffect(() => {
    if (title.trim() || notes.trim()) {
      userHasInteracted.current = true;
    }
  }, [title, notes]);

  // Silent auto-restore: only on first load, and only if user hasn't started editing
  useEffect(() => {
    if (!pendingDraft || draftRestoredOnce.current) return;
    if (userHasInteracted.current) {
      // User already typed — don't overwrite their work, just discard the draft
      discardDraft();
      return;
    }
    draftRestoredOnce.current = true;
    const draft = restoreDraft();
    if (!draft) return;
    if (draft.slides) setSlides(draft.slides);
    if (draft.caption) setCaption(draft.caption);
    if (draft.hashtags) setHashtags(draft.hashtags);
    if (draft.title) setTitle(draft.title);
    if (draft.notes) setNotes(draft.notes ?? "");
    if (draft.config) {
      if (draft.config.selectedStyle) setSelectedStyle(draft.config.selectedStyle);
      if (draft.config.slideCountMode) setSlideCountMode(draft.config.slideCountMode);
      if (draft.config.slideCountVal) setSlideCountVal(draft.config.slideCountVal);
      if (draft.config.includeCta !== undefined) setIncludeCta(draft.config.includeCta);
    }
    toast.success("Rascunho restaurado automaticamente");
  }, [pendingDraft]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reset format when platform changes ──
  useEffect(() => {
    const platformFormats = FORMATS_BY_PLATFORM[selectedPlatform];
    const currentFormatExists = platformFormats.some(f => f.id === selectedFormat);
    if (!currentFormatExists) {
      setSelectedFormat(platformFormats[0].id);
    }
  }, [selectedPlatform]);

  // ── Rebuild slides when format/count/CTA/template set changes ──
  useEffect(() => {
    setSlides(buildSlideArray(selectedFormat, effectiveSlideCount, includeCta, activeTemplateSetData));
    setCurrentSlide(0);
  }, [selectedFormat, effectiveSlideCount, includeCta, resolvedTsId]);

  const brandSnapshot = currentBrand ? {
    name: currentBrand.name,
    palette: currentBrand.palette || [],
    fonts: currentBrand.fonts || { headings: "Inter", body: "Inter" },
    visual_tone: currentBrand.visual_tone || "clean",
    logo_url: currentBrand.logo_url,
    style_guide: activeTemplateSetData || currentBrand.style_guide || null,
    visual_signature: activeTemplateSetData?.visual_signature || null,
    layout_params: activeTemplateSetData?.layout_params || null,
    templates_by_role: activeTemplateSetData?.templates_by_role || null,
    pilar_editorial: pilarEditorial,
    template_set_id: resolvedTsId,
  } : {
    name: "Modo Livre",
    palette: ["#667eea", "#764ba2", "#f093fb"],
    fonts: { headings: "Inter", body: "Inter" },
    visual_tone: "clean",
    logo_url: null,
    style_guide: null,
    visual_signature: null,
    layout_params: null,
    templates_by_role: null,
    pilar_editorial: null,
    template_set_id: null,
  };

  // ── Slide editing ──
  const updateSlide = (index: number, field: keyof SlideData, value: any) => {
    setSlides(prev => {
      const next = [...prev];
      const existing = next[index];
      const isTextField = field === "headline" || field === "body";
      const hasImage = !!(existing.image_url || existing.previewImage || existing.background_image_url);
      const textChanged = isTextField && existing[field] !== value;

      next[index] = {
        ...existing,
        [field]: value,
        // Mark image as stale when text changes and image exists
        ...(textChanged && hasImage ? { image_stale: true } : {}),
      };
      return next;
    });
  };

  const updateBullet = (slideIdx: number, bulletIdx: number, value: string) => {
    setSlides(prev => {
      const next = [...prev];
      const existing = next[slideIdx];
      const bullets = [...(existing.bullets || [])];
      const hasImage = !!(existing.image_url || existing.previewImage || existing.background_image_url);
      const changed = bullets[bulletIdx] !== value;
      bullets[bulletIdx] = value;
      next[slideIdx] = {
        ...existing,
        bullets,
        ...(changed && hasImage ? { image_stale: true } : {}),
      };
      return next;
    });
  };

  const addBullet = (slideIdx: number) => {
    setSlides(prev => {
      const next = [...prev];
      next[slideIdx] = { ...next[slideIdx], bullets: [...(next[slideIdx].bullets || []), ""] };
      return next;
    });
  };

  const removeBullet = (slideIdx: number, bulletIdx: number) => {
    setSlides(prev => {
      const next = [...prev];
      const bullets = [...(next[slideIdx].bullets || [])];
      bullets.splice(bulletIdx, 1);
      next[slideIdx] = { ...next[slideIdx], bullets };
      return next;
    });
  };

  // ── AI Generation ──
  const handleGenerateWithAI = async () => {
    if (!title.trim()) {
      toast.error("Defina um título antes de gerar com IA");
      return;
    }

    // images_only mode: skip AI text generation, use briefing as caption
    if (generationMode === "images_only") {
      setCaption(notes || title.trim());
      setHashtags([]);
      toast.success("Briefing usado como legenda. Salve para gerar as imagens.");
      return;
    }

    setGenerating(true);
    try {
      const brandId = selectedBrand === "free" ? null : selectedBrand;
      const effectiveMode = selectedBrand === "free" ? "free" : "brand_strict";

      // Build manual briefing from current slide content
      const currentSlideData = slides[currentSlide];
      const manualBriefing = {
        headline: currentSlideData?.headline || undefined,
        body: currentSlideData?.body || undefined,
        bullets: currentSlideData?.bullets?.filter(Boolean) || undefined,
        notes: notes || undefined,
        briefingImages: briefingImages.length > 0 ? briefingImages : undefined,
      };

      // For "quote" style, the title IS the phrase the user wants
      const isQuoteStyle = selectedStyle === "quote";

      const { data, error } = await supabase.functions.invoke("generate-content", {
        body: {
          trend: {
            title: title.trim(),
            description: isQuoteStyle ? `FRASE OBRIGATÓRIA: "${title.trim()}"` : (notes || title.trim()),
            theme: selectedStyle === "news" ? "Saúde" : "Geral",
            keywords: [],
            fullContent: "",
          },
          contentType: selectedFormat,
          contentStyle: selectedStyle,
          brandId,
          visualMode: effectiveMode,
          templateSetId: resolvedTsId,
          slideCount: selectedFormat === "carousel" ? (slideCountMode === "auto" ? null : slideCountVal) : null,
          includeCta: selectedFormat === "carousel" ? includeCta : true,
          manualBriefing,
          platform: selectedPlatform,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.success) throw new Error("Erro ao gerar conteúdo");

      const content = data.content;

      // Fill slides from AI response, enforcing template set templates
      let newSlides: SlideData[] = [];
      if (content.slides && content.slides.length > 0) {
        const tbr = activeTemplateSetData?.templates_by_role as Record<string, string> | undefined;
        newSlides = content.slides.map((s: any) => {
          const role = s.role || "cover";
          // HARD LOCK: Use templates_by_role from template set first
          const tpl = tbr?.[role] || resolveTemplateForSlide(activeTemplateSetData, role);
          return normalizeSlideImage({
            headline: s.headline || "",
            body: s.body || "",
            bullets: s.bullets || undefined,
            template: tpl,
            templateHint: tpl,
            role,
            image_url: s.image_url || s.previewImage || undefined,
            previewImage: s.image_url || s.previewImage || undefined,
            speakerNotes: s.speakerNotes || "",
            illustrationPrompt: s.illustrationPrompt || "",
            imagePrompt: s.imagePrompt || "",
          });
        });

        // Enforce CTA slide
        if (selectedFormat === "carousel" && includeCta) {
          const lastSlide = newSlides[newSlides.length - 1];
          if (lastSlide?.role !== "cta") {
            const ctaTpl = tbr?.cta || resolveTemplateForSlide(activeTemplateSetData, "cta");
            newSlides.push({
              role: "cta",
              template: ctaTpl,
              templateHint: ctaTpl,
              headline: "Gostou do conteúdo?",
              body: "Curta ❤️ Comente 💬 Compartilhe 🔄 Salve 📌",
            });
          }
        }

        // Remove CTA if toggle is OFF
        if (selectedFormat === "carousel" && !includeCta) {
          newSlides = newSlides.filter(s => s.role !== "cta");
        }

        setSlides(newSlides);
        setCurrentSlide(0);
      }

      // Fill metadata
      if (content.caption) setCaption(content.caption);
      if (content.hashtags) setHashtags(content.hashtags);
      if (content.sourceSummary) setSourceSummary(content.sourceSummary);
      if (content.keyInsights) setKeyInsights(content.keyInsights);
      if (content.title) setTitle(content.title);

      setGenerating(false);

      // Auto-save and trigger background image generation
      const saveBrandId = selectedBrand === "free" ? null : selectedBrand;
      if (saveBrandId && newSlides.length > 0) {
        try {
          const { data: session } = await supabase.auth.getSession();
          if (session.session) {
            const { data: savedContent, error: saveError } = await supabase
              .from("generated_contents")
              .insert({
                user_id: session.session.user.id,
                content_type: selectedFormat,
                platform: selectedPlatform,
                title: content.title || title.trim(),
                caption: content.caption || caption || "",
                hashtags: content.hashtags || (hashtags.length > 0 ? hashtags : []),
                slides: newSlides as any,
                status: "draft",
                brand_id: saveBrandId,
                brand_snapshot: brandSnapshot as any,
                visual_mode: "brand_strict",
                source_summary: content.sourceSummary || null,
                key_insights: content.keyInsights?.length > 0 ? content.keyInsights : null,
                template_set_id: resolvedTsId || null,
                slide_count: selectedFormat === "carousel" ? newSlides.length : null,
                include_cta: selectedFormat === "carousel" ? includeCta : true,
              })
              .select()
              .single();

            if (!saveError && savedContent) {
              clearDraftStorage();

              // caption_only mode: skip image generation entirely
              if (generationMode === "caption_only") {
                toast.success("Conteúdo salvo! Adicione suas imagens no editor.");
                navigate(`/content/${savedContent.id}`);
                return;
              }

              // Check if using a saved background template
              if (selectedBgTemplate) {
                const bgTemplate = backgroundTemplates.find(bt => bt.id === selectedBgTemplate);
                if (bgTemplate) {
                  const bgImages = bgTemplate.background_images;
                  const updatedSlides = newSlides.map((s: any, i: number) => {
                    const bgIdx = i % bgImages.length;
                    const bgUrl = bgImages[bgIdx]?.url;
                    if (!bgUrl) return s;
                    return { ...s, background_image_url: bgUrl, image_url: bgUrl, previewImage: bgUrl, render_mode: "ai_bg_overlay", image_stale: false };
                  });
                  await supabase.from("generated_contents").update({ slides: JSON.parse(JSON.stringify(updatedSlides)) }).eq("id", savedContent.id);
                  toast.success("Conteúdo salvo com background reutilizado!");
                  navigate(`/content/${savedContent.id}`);
                  return;
                }
              }

              startImageGeneration({
                contentDbId: savedContent.id,
                title: content.title || title.trim(),
                slides: newSlides,
                brandId: saveBrandId,
                format: selectedFormat,
                templateSetId: resolvedTsId || null,
                categoryId: resolvedTs?.category_id || null,
                briefingImages: briefingImages.length > 0 ? briefingImages : undefined,
                renderMode: (ENABLE_BG_OVERLAY || currentBrand?.render_mode === "AI_BG_OVERLAY") ? "AI_BG_OVERLAY" : undefined,
              });
              toast.success("Conteúdo salvo! Imagens sendo geradas em segundo plano.");
              navigate(`/content/${savedContent.id}`);
              return;
            }
          }
        } catch (autoSaveErr) {
          console.warn("Auto-save after generation failed:", autoSaveErr);
        }
      }
      toast.success("Texto gerado pela IA!");
    } catch (err: any) {
      console.error("AI generation error:", err);
      toast.error("Erro ao gerar: " + (err.message || "Tente novamente"));
      setGenerating(false);
    }
  };

  // ── Regenerate single slide image ──
  const handleRegenerateSlideImage = async (index: number) => {
    const brandId = selectedBrand === "free" ? null : selectedBrand;
    if (!brandId) {
      toast.error("Selecione uma marca para gerar imagens");
      return;
    }
    const isOverlayMode = ENABLE_BG_OVERLAY || currentBrand?.render_mode === "AI_BG_OVERLAY";
    setGeneratingImages(true);
    setImageGenProgress(`Regenerando ${isOverlayMode ? "background" : "imagem"} do slide ${index + 1}...`);
    try {
      const { data, error } = await supabase.functions.invoke("generate-slide-images", {
        body: {
          brandId,
          slide: slides[index],
          slideIndex: index,
          totalSlides: slides.length,
          contentFormat: selectedFormat,
          articleUrl: notes || undefined,
          contentId: `studio-regen-${Date.now()}`,
          templateSetId: resolvedTsId || undefined,
          language: "pt-BR",
          backgroundOnly: isOverlayMode,
        },
      });
      if (error) throw error;
      if (isOverlayMode && (data?.bgImageUrl || data?.imageUrl)) {
        const bgUrl = data.bgImageUrl || data.imageUrl;
        setSlides(prev => prev.map((s, i) => i === index ? {
          ...s,
          image_url: bgUrl,
          previewImage: bgUrl,
          background_image_url: bgUrl,
          render_mode: "ai_bg_overlay" as const,
          image_stale: false,
        } : s));
        toast.success("Background regenerado!");
      } else if (!isOverlayMode && data?.imageUrl) {
        setSlides(prev => prev.map((s, i) => ({
          ...s,
          image_url: i === index ? data.imageUrl : s.image_url,
          previewImage: i === index ? data.imageUrl : s.previewImage,
          image_stale: i === index ? false : s.image_stale,
        })));
        toast.success("Imagem regenerada!");
      }
    } catch (err: any) {
      toast.error("Erro: " + (err.message || "Tente novamente"));
    } finally {
      setGeneratingImages(false);
      setImageGenProgress("");
    }
  };

  // ── Save draft ──
  const handleSaveDraft = async () => {
    if (!title.trim()) {
      toast.error("Defina um título para o conteúdo");
      return;
    }
    setSaving(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) throw new Error("Não autenticado");

      const brandId = selectedBrand === "free" ? null : selectedBrand;
      const { data, error } = await supabase
        .from("generated_contents")
        .insert({
          user_id: session.session.user.id,
          content_type: selectedFormat,
          platform: selectedPlatform,
          title: title.trim(),
          caption: caption || "",
          hashtags: hashtags.length > 0 ? hashtags : [],
          slides: slides as any,
          status: "draft",
          brand_id: brandId,
          brand_snapshot: brandSnapshot as any,
          visual_mode: selectedBrand === "free" ? "free" : "brand_strict",
          source_summary: sourceSummary || null,
          key_insights: keyInsights.length > 0 ? keyInsights : null,
          template_set_id: resolvedTsId || null,
          slide_count: selectedFormat === "carousel" ? slides.length : null,
          include_cta: selectedFormat === "carousel" ? includeCta : true,
        })
        .select()
        .single();

      if (error) throw error;
      clearDraftStorage();

      // Start background image generation if brand is selected
      const saveBrandId = selectedBrand === "free" ? null : selectedBrand;
      // Skip image generation for caption_only mode
      if (generationMode === "caption_only") {
        toast.success("Rascunho salvo! Adicione suas imagens no editor.");
      } else if (selectedBgTemplate && saveBrandId) {
        // Apply saved background template
        const bgTemplate = backgroundTemplates.find(bt => bt.id === selectedBgTemplate);
        if (bgTemplate) {
          const bgImages = bgTemplate.background_images;
          const updatedSlides = slides.map((s: any, i: number) => {
            const bgIdx = i % bgImages.length;
            const bgUrl = bgImages[bgIdx]?.url;
            if (!bgUrl) return s;
            return { ...s, background_image_url: bgUrl, image_url: bgUrl, previewImage: bgUrl, render_mode: "ai_bg_overlay", image_stale: false };
          });
          await supabase.from("generated_contents").update({ slides: JSON.parse(JSON.stringify(updatedSlides)) }).eq("id", data.id);
          toast.success("Rascunho salvo com background reutilizado!");
        }
      } else if (saveBrandId && slides.length > 0) {
        startImageGeneration({
          contentDbId: data.id,
          title: title.trim(),
          slides: slides,
          brandId: saveBrandId,
          format: selectedFormat,
          templateSetId: resolvedTsId || null,
          categoryId: resolvedTs?.category_id || null,
          briefingImages: briefingImages.length > 0 ? briefingImages : undefined,
          renderMode: (ENABLE_BG_OVERLAY || currentBrand?.render_mode === "AI_BG_OVERLAY") ? "AI_BG_OVERLAY" : undefined,
        });
        toast.success("Rascunho salvo! Imagens sendo geradas em segundo plano.");
      } else {
        toast.success("Rascunho salvo!");
      }
      navigate(`/content/${data.id}`);
    } catch (err: any) {
      toast.error("Erro ao salvar: " + (err.message || "Tente novamente"));
    } finally {
      setSaving(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiado!");
  };

  // ── Dimensions ──
  const FORMATS = FORMATS_BY_PLATFORM[selectedPlatform];
  const format = FORMATS.find(f => f.id === selectedFormat)!;
  const dims = format.dims;
  const slide = slides[currentSlide];
  const showBullets = slide?.role === "insight" || slide?.role === "bullets";
  const slideTemplate = selectedBrand === "free" ? "generic_free" : (slide?.templateHint || slide?.template || "parameterized");

  return (
    <div className="space-y-6">
      {/* Silent draft auto-restore — no modal */}
      {/* Drafts are silently restored on mount via useDraft */}

      {/* Config Bar */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium flex items-center gap-1.5">
            <Smartphone className="w-3.5 h-3.5" /> Plataforma
          </Label>
          <Select value={selectedPlatform} onValueChange={(v) => setSelectedPlatform(v as Platform)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PLATFORMS.map(p => (
                <SelectItem key={p.id} value={p.id}>
                  <span className="flex items-center gap-2"><p.icon className="w-3.5 h-3.5" /> {p.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium flex items-center gap-1.5">
            <Palette className="w-3.5 h-3.5" /> Marca
          </Label>
          <Select value={selectedBrand} onValueChange={setSelectedBrand}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="free">
                <span className="flex items-center gap-2"><Sparkles className="w-3.5 h-3.5 text-primary" /> Modo Livre</span>
              </SelectItem>
              {brands.map(b => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedBrand !== "free" && (
          <div className="space-y-1.5">
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" /> Estilo de Conteúdo
            </Label>
            <Select value={selectedTemplateSet} onValueChange={setSelectedTemplateSet}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">
                  Auto{defaultTsName ? ` — ${defaultTsName}` : " — (sem padrão)"}
                </SelectItem>
                {templateSets.map(ts => (
                  <SelectItem key={ts.id} value={ts.id}>
                    {ts.name}{ts.category_name ? ` (${ts.category_name})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Formato</Label>
          <Select value={selectedFormat} onValueChange={setSelectedFormat}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {FORMATS.map(f => (
                <SelectItem key={f.id} value={f.id}>
                  <span className="flex items-center gap-2"><f.icon className="w-3.5 h-3.5" /> {f.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Estilo Editorial</Label>
          <Select value={selectedStyle} onValueChange={setSelectedStyle}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {STYLES.map(s => (
                <SelectItem key={s.id} value={s.id}>
                  <span className="flex items-center gap-2"><s.icon className="w-3.5 h-3.5" /> {s.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Background Template Selector */}
      {selectedBrand !== "free" && (() => {
        const filteredBg = backgroundTemplates;
        if (filteredBg.length === 0) return null;
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1.5 lg:col-span-2">
              <Label className="text-xs font-medium flex items-center gap-1.5">
                <Save className="w-3.5 h-3.5" /> Background Salvo
              </Label>
              <Select value={selectedBgTemplate || "none"} onValueChange={v => setSelectedBgTemplate(v === "none" ? null : v)}>
                <SelectTrigger><SelectValue placeholder="Usar background salvo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    <span className="flex items-center gap-2"><Wand2 className="w-3.5 h-3.5 text-muted-foreground" /> Gerar novo com IA</span>
                  </SelectItem>
                  {filteredBg.map(bt => (
                    <SelectItem key={bt.id} value={bt.id}>
                      <span className="flex items-center gap-2">
                        <Save className="w-3.5 h-3.5 text-muted-foreground" />
                        {bt.name}
                        <span className="text-[10px] text-muted-foreground">{bt.slide_count} slide{bt.slide_count > 1 ? "s" : ""}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedBgTemplate && (
                <p className="text-[10px] text-muted-foreground">
                  ⚡ Background salvo será aplicado sem gerar imagens com IA.
                </p>
              )}
            </div>
          </div>
        );
      })()}
      {selectedFormat === "carousel" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-lg border border-border p-4 bg-muted/20">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">Nº de slides ({effectiveSlideCount})</Label>
              <Select value={slideCountMode} onValueChange={(v) => setSlideCountMode(v as "auto" | "fixed")}>
                <SelectTrigger className="w-24 h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto</SelectItem>
                  <SelectItem value="fixed">Fixo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {slideCountMode === "fixed" && (
              <div className="flex items-center gap-3">
                <Slider
                  value={[slideCountVal]}
                  onValueChange={([v]) => setSlideCountVal(v)}
                  min={3}
                  max={10}
                  step={1}
                  className="flex-1"
                />
                <span className="text-sm font-mono font-medium w-6 text-center">{slideCountVal}</span>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-xs font-medium">Slide CTA final</Label>
              <p className="text-[10px] text-muted-foreground">Fechamento com chamada para ação</p>
            </div>
            <Switch checked={includeCta} onCheckedChange={setIncludeCta} />
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-5 space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Título / Tema do Conteúdo</Label>
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Ex: Novo estudo sobre cardiopatias congênitas"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Notas / Briefing (opcional)</Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Contexto adicional, links, pontos a abordar..."
              rows={3}
            />
          </div>
          <BriefingImageUpload images={briefingImages} onChange={setBriefingImages} />

          {/* Generation Mode Selector */}
          <div className="space-y-2 rounded-lg border border-border p-3 bg-muted/20">
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <Wand2 className="w-3.5 h-3.5" /> Modo de Geração
            </Label>
            <RadioGroup
              value={generationMode}
              onValueChange={(v) => setGenerationMode(v as GenerationMode)}
              className="space-y-1.5"
            >
              <div className="flex items-start gap-2">
                <RadioGroupItem value="full" id="gen-full" className="mt-0.5" />
                <Label htmlFor="gen-full" className="text-xs cursor-pointer leading-tight">
                  <span className="font-medium flex items-center gap-1"><Sparkles className="w-3 h-3" /> Gerar Tudo</span>
                  <span className="text-muted-foreground block">Texto, legenda e imagens com IA</span>
                </Label>
              </div>
              <div className="flex items-start gap-2">
                <RadioGroupItem value="caption_only" id="gen-caption" className="mt-0.5" />
                <Label htmlFor="gen-caption" className="text-xs cursor-pointer leading-tight">
                  <span className="font-medium flex items-center gap-1"><Type className="w-3 h-3" /> Só Legenda</span>
                  <span className="text-muted-foreground block">Gera texto e legenda. Você envia as imagens.</span>
                </Label>
              </div>
              <div className="flex items-start gap-2">
                <RadioGroupItem value="images_only" id="gen-images" className="mt-0.5" />
                <Label htmlFor="gen-images" className="text-xs cursor-pointer leading-tight">
                  <span className="font-medium flex items-center gap-1"><FileImage className="w-3 h-3" /> Só Imagens</span>
                  <span className="text-muted-foreground block">Usa o briefing como legenda, gera só as imagens.</span>
                </Label>
              </div>
            </RadioGroup>
          </div>
        </div>
        <div className="lg:col-span-7 flex items-end">
          <div className="space-y-2 w-full">
            <Button
              onClick={handleGenerateWithAI}
              disabled={generating || generatingImages || !title.trim()}
              className="gap-2 h-12"
              size="lg"
            >
              {generating ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Gerando texto...</>
              ) : generatingImages ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> {imageGenProgress || "Gerando imagens..."}</>
              ) : generationMode === "caption_only" ? (
                <><Type className="w-5 h-5" /> Gerar Legenda com IA</>
              ) : generationMode === "images_only" ? (
                <><FileImage className="w-5 h-5" /> Gerar Imagens com IA</>
              ) : (
                <><Wand2 className="w-5 h-5" /> Gerar com IA</>
              )}
            </Button>
            {generating && (
              <div className="space-y-1.5 animate-fade-in">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                  <span>A IA está criando seu conteúdo...</span>
                </div>
                <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                  <div className="bg-primary h-1.5 rounded-full animate-pulse" style={{ width: "60%" }} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <Separator />

      {/* Main: Editor + Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Editor */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">
              Slide {currentSlide + 1}/{slides.length}
              {slide?.role && (
                <Badge variant="outline" className="ml-2 text-[10px]">{slide.role}</Badge>
              )}
            </h3>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={currentSlide === 0} onClick={() => setCurrentSlide(p => p - 1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={currentSlide >= slides.length - 1} onClick={() => setCurrentSlide(p => p + 1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Stale image warning */}
          {slide?.image_stale && (slide?.image_url || slide?.previewImage || slide?.background_image_url) && (
            <div className="flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2">
              <Badge variant="outline" className="text-[10px] border-accent/50 text-accent-foreground">Texto mudou</Badge>
              <span className="text-xs text-muted-foreground flex-1">Imagem desatualizada — regenere para refletir as alterações.</span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => handleRegenerateSlideImage(currentSlide)}
                disabled={generatingImages}
              >
                {generatingImages ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                Atualizar imagem
              </Button>
            </div>
          )}
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Headline</Label>
              <Input
                value={slide?.headline || ""}
                onChange={e => updateSlide(currentSlide, "headline", e.target.value)}
                placeholder={selectedStyle === "quote" ? "Escreva a frase que deseja na imagem" : "Título principal do slide"}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Body</Label>
              <Textarea
                value={slide?.body || ""}
                onChange={e => updateSlide(currentSlide, "body", e.target.value)}
                placeholder={selectedStyle === "quote" ? "Autor / assinatura (opcional)" : "Texto complementar"}
                rows={selectedStyle === "quote" ? 1 : 3}
              />
            </div>

            {/* Font size controls */}
            {slide?.background_image_url && (
              <div className="space-y-2 rounded-lg border border-border p-3 bg-muted/20">
                <Label className="text-xs font-medium flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3" /> Tamanho dos textos
                </Label>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">Título: {slide?.overlay_style?.headline_font_size || (currentSlide === 0 ? 52 : 44)}px</span>
                    <Slider
                      value={[slide?.overlay_style?.headline_font_size || (currentSlide === 0 ? 52 : 44)]}
                      onValueChange={([v]) => {
                        setSlides(prev => prev.map((s, i) => i === currentSlide ? {
                          ...s,
                          overlay_style: { ...s.overlay_style, headline_font_size: v },
                        } : s));
                      }}
                      min={24}
                      max={80}
                      step={2}
                      className="w-32"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">Corpo: {slide?.overlay_style?.body_font_size || 26}px</span>
                    <Slider
                      value={[slide?.overlay_style?.body_font_size || 26]}
                      onValueChange={([v]) => {
                        setSlides(prev => prev.map((s, i) => i === currentSlide ? {
                          ...s,
                          overlay_style: { ...s.overlay_style, body_font_size: v },
                        } : s));
                      }}
                      min={14}
                      max={48}
                      step={2}
                      className="w-32"
                    />
                  </div>
                </div>
              </div>
            )}
            {showBullets && (
              <div className="space-y-2">
                <Label className="text-xs">Bullets</Label>
                {(slide?.bullets || []).map((bullet, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground font-mono w-4">{i + 1}</span>
                    <Input
                      value={bullet}
                      onChange={e => updateBullet(currentSlide, i, e.target.value)}
                      placeholder={`Ponto ${i + 1}`}
                      className="flex-1"
                    />
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeBullet(currentSlide, i)}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => addBullet(currentSlide)} className="gap-1">
                  <Plus className="w-3.5 h-3.5" /> Adicionar bullet
                </Button>
              </div>
            )}
          </div>

          {/* Slide thumbnails */}
          {slides.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-2">
              {slides.map((s, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentSlide(i)}
                  className={`shrink-0 rounded-lg border-2 p-1.5 transition-all ${
                    i === currentSlide ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                  }`}
                  style={{ width: 64 }}
                >
                  <div className="text-[8px] text-muted-foreground font-mono">{s.role || `#${i + 1}`}</div>
                  <div className="text-[9px] font-medium truncate">{s.headline || "—"}</div>
                </button>
              ))}
            </div>
          )}

          {/* Caption / Hashtags / Insights (AI output) */}
          {(caption || hashtags.length > 0) && (
            <div className="space-y-3 pt-2">
              <Separator />
              {caption && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Legenda gerada</Label>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(caption)}>
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <Textarea value={caption} onChange={e => setCaption(e.target.value)} rows={5} className="text-xs" />
                </div>
              )}
              {hashtags.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium flex items-center gap-1"><Hash className="w-3 h-3" /> Hashtags</Label>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(hashtags.map(h => h.startsWith("#") ? h : `#${h}`).join(" "))}>
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {hashtags.map((h, i) => (
                      <Badge key={i} variant="secondary" className="text-[10px]">{h.startsWith("#") ? h : `#${h}`}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {sourceSummary && (
                <div className="space-y-1">
                  <Label className="text-xs font-medium">📚 Resumo da Fonte</Label>
                  <p className="text-xs text-muted-foreground leading-relaxed">{sourceSummary}</p>
                </div>
              )}
              {keyInsights.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs font-medium">💡 Insights-Chave</Label>
                  <ul className="space-y-0.5">
                    {keyInsights.map((ins, i) => (
                      <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                        <span className="text-primary">•</span>{ins}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Preview */}
        <div className="lg:col-span-7 flex flex-col items-center">
          {selectedPlatform === "linkedin" ? (
            /* Desktop browser frame for LinkedIn */
            <div className="relative mx-auto w-full max-w-[480px]">
              <div className="rounded-xl border border-border bg-card shadow-lg overflow-hidden">
                <div className="flex items-center gap-1.5 px-3 py-2 bg-muted/60 border-b border-border">
                  <div className="flex gap-1">
                    <div className="w-2.5 h-2.5 rounded-full bg-destructive/60" />
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/60" />
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
                  </div>
                  <div className="flex-1 mx-2 bg-background rounded-md px-3 py-0.5 text-[10px] text-muted-foreground font-mono truncate">
                    linkedin.com/feed
                  </div>
                </div>
                <div
                  className="overflow-hidden bg-background"
                  style={{ aspectRatio: selectedFormat === "carousel" ? "4/5" : "1200/627" }}
                >
                  {slide?.background_image_url ? (
                    <div
                      style={{
                        transform: `scale(${(480 - 2) / dims.width})`,
                        transformOrigin: "top left",
                        width: dims.width,
                        height: dims.height,
                      }}
                    >
                      <SlideBgOverlayRenderer
                        backgroundImageUrl={slide.background_image_url}
                        overlay={{ headline: slide.headline, body: slide.body, bullets: slide.bullets }}
                        overlayStyle={slide.overlay_style}
                        overlayPositions={slide.overlay_positions}
                        onPositionChange={(key, pos) => {
                          const updated = [...slides];
                          updated[currentSlide] = {
                            ...updated[currentSlide],
                            overlay_positions: {
                              ...updated[currentSlide].overlay_positions,
                              [key]: pos,
                            },
                          };
                          setSlides(updated);
                        }}
                        editable={true}
                        dimensions={dims}
                        role={slide.role}
                        slideIndex={currentSlide}
                        totalSlides={slides.length}
                        brandSnapshot={brandSnapshot}
                      />
                    </div>
                  ) : (slide?.image_url || slide?.previewImage) ? (
                    <img
                      src={slide.image_url || slide.previewImage}
                      alt={`Slide ${currentSlide + 1}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div
                      style={{
                        transform: `scale(${(480 - 2) / dims.width})`,
                        transformOrigin: "top left",
                        width: dims.width,
                        height: dims.height,
                      }}
                    >
                      <SlideTemplateRenderer
                        slide={slide || { headline: "", body: "" }}
                        slideIndex={currentSlide}
                        totalSlides={slides.length}
                        brand={brandSnapshot}
                        template={slideTemplate}
                        dimensions={dims}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Phone mockup for Instagram */
            <div className="relative mx-auto" style={{ width: 340 }}>
              <div className="rounded-[2.5rem] border-[6px] border-muted-foreground/20 bg-muted/30 p-2 shadow-2xl">
                <div className="mx-auto mb-2 h-5 w-28 rounded-full bg-muted-foreground/15" />
                <div
                  className="overflow-hidden rounded-[1.5rem] bg-background"
                  style={{ aspectRatio: selectedFormat === "story" ? "9/16" : "4/5" }}
                >
                  {slide?.background_image_url ? (
                    <div
                      style={{
                        transform: `scale(${328 / dims.width})`,
                        transformOrigin: "top left",
                        width: dims.width,
                        height: dims.height,
                      }}
                    >
                      <SlideBgOverlayRenderer
                        backgroundImageUrl={slide.background_image_url}
                        overlay={{ headline: slide.headline, body: slide.body, bullets: slide.bullets }}
                        overlayStyle={slide.overlay_style}
                        overlayPositions={slide.overlay_positions}
                        onPositionChange={(key, pos) => {
                          const updated = [...slides];
                          updated[currentSlide] = {
                            ...updated[currentSlide],
                            overlay_positions: {
                              ...updated[currentSlide].overlay_positions,
                              [key]: pos,
                            },
                          };
                          setSlides(updated);
                        }}
                        editable={true}
                        dimensions={dims}
                        role={slide.role}
                        slideIndex={currentSlide}
                        totalSlides={slides.length}
                        brandSnapshot={brandSnapshot}
                      />
                    </div>
                  ) : (slide?.image_url || slide?.previewImage) ? (
                    <img
                      src={slide.image_url || slide.previewImage}
                      alt={`Slide ${currentSlide + 1}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div
                      style={{
                        transform: `scale(${328 / dims.width})`,
                        transformOrigin: "top left",
                        width: dims.width,
                        height: dims.height,
                      }}
                    >
                      <SlideTemplateRenderer
                        slide={slide || { headline: "", body: "" }}
                        slideIndex={currentSlide}
                        totalSlides={slides.length}
                        brand={brandSnapshot}
                        template={slideTemplate}
                        dimensions={dims}
                      />
                    </div>
                  )}
                </div>
                <div className="mx-auto mt-2 h-1 w-24 rounded-full bg-muted-foreground/20" />
              </div>
            </div>
          )}

          <div className="mt-4 text-center space-y-2">
            {/* Regenerate / Upload buttons */}
            <div className="flex items-center justify-center gap-2">
              {selectedBrand !== "free" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => handleRegenerateSlideImage(currentSlide)}
                  disabled={generatingImages}
                >
                  {generatingImages ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (ENABLE_BG_OVERLAY || currentBrand?.render_mode === "AI_BG_OVERLAY") ? (
                    <ImageIcon className="w-3.5 h-3.5" />
                  ) : (
                    <Wand2 className="w-3.5 h-3.5" />
                  )}
                  {(ENABLE_BG_OVERLAY || currentBrand?.render_mode === "AI_BG_OVERLAY")
                    ? (slide?.background_image_url ? "Regenerar background" : "Gerar background")
                    : (slide?.image_url || slide?.previewImage) ? "Regenerar imagem" : "Gerar imagem"}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setUploadDialogOpen(true)}
              >
                <Upload className="w-3.5 h-3.5" />
                Substituir imagem
              </Button>
            </div>

            {/* Debug info */}
            <div className="space-y-1">
              {resolvedTs && (
                <Badge className="text-xs px-3 py-1">
                  Estilo: {resolvedTs.name}
                </Badge>
              )}
              {pilarEditorial && (
                <div className="text-[10px] text-muted-foreground font-mono">
                  Pilar: {pilarEditorial}
                </div>
              )}
              <div className="text-[10px] text-muted-foreground font-mono">
                Role: {slide?.role || "?"} | Template: {slide?.template || slide?.templateHint || "?"} | SetId: {resolvedTsId?.substring(0, 8) || "none"}
              </div>
            </div>
          </div>
        </div>
      </div>

      <Separator />

      {/* Actions */}
      <div className="flex items-center justify-end gap-3">
        <Button variant="outline" onClick={() => navigate("/dashboard")}>Cancelar</Button>
        <Button onClick={handleSaveDraft} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Salvar Rascunho
        </Button>
      </div>

      {/* Image Upload Dialog */}
      <ImageUpload
        open={uploadDialogOpen}
        onClose={() => setUploadDialogOpen(false)}
        onUploadComplete={(imageUrl) => {
          const isOverlayMode = ENABLE_BG_OVERLAY || currentBrand?.render_mode === "AI_BG_OVERLAY";
          setSlides(prev => prev.map((s, i) => {
            if (i !== currentSlide) return s;
            if (isOverlayMode) {
              return {
                ...s,
                background_image_url: imageUrl,
                image_url: imageUrl,
                previewImage: imageUrl,
                render_mode: "ai_bg_overlay" as const,
                image_stale: false,
              };
            }
            return {
              ...s,
              image_url: imageUrl,
              previewImage: imageUrl,
              image_stale: false,
            };
          }));
          toast.success("Imagem substituída!");
        }}
      />
    </div>
  );
}
