import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { normalizeSlides, buildContentDraftKey, getSlideRenderMode, clearDraft } from "@/lib/slideUtils";
import { useDraft } from "@/hooks/useDraft";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import DraftRestoreModal from "@/components/content/DraftRestoreModal";
import SlideBgOverlayRenderer from "@/components/content/SlideBgOverlayRenderer";
import LinkedInDocumentRenderer from "@/components/content/LinkedInDocumentRenderer";
import TextBlockToolbar from "@/components/content/TextBlockToolbar";
import { ENABLE_BG_OVERLAY } from "@/lib/featureFlags";
import { getContentDimensions, getAspectRatio, isMultiSlide } from "@/lib/contentDimensions";
import { useBackgroundGeneration } from "@/contexts/BackgroundGenerationContext";
import { useSlideCapture } from "@/hooks/useSlideCapture";
import OffScreenSlideRenderer from "@/components/content/OffScreenSlideRenderer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { templates, TemplateStyle } from "@/lib/templates";
import TemplateSelector from "@/components/content/TemplateSelector";
import SlidePreview from "@/components/content/SlidePreview";
import SlideEditor from "@/components/content/SlideEditor";
import GenerationDebugPanel from "@/components/content/GenerationDebugPanel";
import RegenerateModal from "@/components/content/RegenerateModal";
import ScheduleModal from "@/components/content/ScheduleModal";
import SlideTemplateRenderer, { getTemplateForSlide } from "@/components/content/SlideTemplateRenderer";
import SaveBackgroundTemplateModal from "@/components/content/SaveBackgroundTemplateModal";
import ImageUpload from "@/components/content/ImageUpload";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  ArrowLeft,
  Check,
  X,
  RefreshCw,
  Sparkles,
  Loader2,
  Wand2,
  CalendarClock,
  Download,
  RotateCcw,
  MoreHorizontal,
  Type,
  Save,
  Edit2,
  Instagram,
  Send,
  Upload,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Slide {
  headline: string;
  body: string;
  imagePrompt?: string;
  illustrationPrompt?: string;
  image_url?: string;
  // Legacy fields - normalized to image_url on load
  previewImage?: string;
  imageUrl?: string;
  image?: string;
  templateHint?: string;
  template?: string;
  role?: string;
  bullets?: string[];
  speakerNotes?: string;
  image_stale?: boolean;
  // AI_BG_OVERLAY mode fields
  background_image_url?: string;
  overlay?: { headline?: string; body?: string; bullets?: string[]; footer?: string };
  overlay_style?: { safe_area_top?: number; safe_area_bottom?: number; text_align?: "left" | "center"; max_headline_lines?: number; font_scale?: number; headline_font_size?: number; body_font_size?: number; bullets_font_size?: number; max_width_pct?: number; text_shadow_level?: number };
  render_mode?: "legacy_image" | "ai_bg_overlay";
  overlay_positions?: Record<string, { x: number; y: number }>;
}

interface BrandSnapshotData {
  name: string;
  palette: { name: string; hex: string }[] | string[];
  fonts: { headings: string; body: string };
  visual_tone: string;
  logo_url: string | null;
  style_guide?: any;
}

interface GeneratedContent {
  id: string;
  title: string;
  caption: string;
  hashtags: string[];
  slides: Slide[];
  content_type: string;
  trend_id: string | null;
  status: string;
  scheduled_at: string | null;
  created_at: string;
  brand_snapshot: BrandSnapshotData | null;
  visual_mode?: string;
  source_summary?: string;
  key_insights?: string[];
  generation_metadata?: Record<string, any> | null;
  platform?: string;
  image_urls?: string[];
}

// Strip leading command phrases from titles that were stored as raw user prompts
function sanitizeTitle(title: string): string {
  if (!title) return title;
  return title
    .replace(/^(quero|crie|gere|criar|gerar|me\s+d[eê]|fa[çc]a)\s+(um[a]?\s+)?(post|story|carrossel|imagem|conteúdo)\s+(com\s+|para\s+o\s+)?(instagram|linkedin)?\s*(sobre\s*:?\s*)?/i, "")
    .trim();
}

// Recover caption from stored raw AI JSON (happens when JSON parse failed on the backend)
function sanitizeCaption(raw: string): string {
  if (!raw) return raw;
  // If it looks like a JSON object, try to extract the caption field
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.caption) return parsed.caption;
    } catch {
      // Try regex extraction as fallback
      const m = trimmed.match(/"caption"\s*:\s*"((?:[^"\\]|\\.)*)"/s);
      if (m) return m[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
    }
  }
  // Replace any remaining literal \n escape sequences
  return raw.replace(/\\n/g, "\n");
}

const ContentPreview = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { activeJobs } = useBackgroundGeneration();
  const { captureIndex, captureRef, renderAndUploadAllSlides } = useSlideCapture();
  
  const [content, setContent] = useState<GeneratedContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [editingSlide, setEditingSlide] = useState<number | null>(null);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateStyle>("editorial");
  const [generatingPreview, setGeneratingPreview] = useState(false);
  const [isRegenerateModalOpen, setIsRegenerateModalOpen] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isSaveBgTemplateOpen, setIsSaveBgTemplateOpen] = useState(false);
  const [saveBgSingleIndex, setSaveBgSingleIndex] = useState<number | undefined>(undefined);
  const [isPublishing, setIsPublishing] = useState(false);
  const [editCaption, setEditCaption] = useState("");
  const [editHashtags, setEditHashtags] = useState("");
  const [isEditingCaption, setIsEditingCaption] = useState(false);
  const [isRegeneratingCaption, setIsRegeneratingCaption] = useState(false);
  const compositeRenderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null);
  // Background scheduling progress
  const [scheduleProgress, setScheduleProgress] = useState<{ open: boolean; step: "rendering" | "scheduling" | "done" | "error"; message?: string }>({ open: false, step: "rendering" });
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);

  // Draft persistence for content editor
  const draftKey = id ? buildContentDraftKey(id) : null;
  const { pendingDraft, restoreDraft, discardDraft, saveToDraft, hasUnsavedChanges } = useDraft({
    draftKey,
    enabled: !!id,
  });
  useUnsavedChangesGuard(hasUnsavedChanges);

  // Track whether we've done the initial fetch — prevents draft from overwriting DB data
  const initialFetchDone = useRef(false);
  const skipDraftAutoSave = useRef(false);
  const isHydratingFromDb = useRef(false);
  const dbSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset selected block when changing slides
  useEffect(() => { setSelectedBlock(null); }, [currentSlide]);

  // Auto-save draft when slides change (but skip during silent refetch)
  useEffect(() => {
    if (!content || slides.length === 0) return;
    if (skipDraftAutoSave.current) {
      skipDraftAutoSave.current = false;
      return;
    }
    saveToDraft({ slides, caption: content.caption, hashtags: content.hashtags, title: content.title });
  }, [slides, content?.caption, content?.hashtags, content?.title, saveToDraft]);

  // Silent auto-restore draft on mount — only if initial fetch didn't find images
  useEffect(() => {
    if (!pendingDraft || !initialFetchDone.current) return;
    // Don't restore draft if current slides already have images
    const currentHasImages = slides.some((s: any) => s.image_url || s.background_image_url);
    if (currentHasImages) {
      discardDraft();
      return;
    }
    const draft = restoreDraft();
    if (!draft) return;
    if (draft.slides) setSlides(normalizeSlides(draft.slides as Slide[]));
    toast.success("Rascunho restaurado automaticamente");
  }, [pendingDraft]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchContent = useCallback(async (silent = false) => {
    if (!id) return;
    
    try {
      const { data, error } = await supabase
        .from("generated_contents")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;

      const gc = data as unknown as GeneratedContent;
      const cleanCaption = sanitizeCaption(gc.caption || "");
      const cleanTitle = sanitizeTitle(gc.title || "");
      const cleanContent = (cleanCaption !== gc.caption || cleanTitle !== gc.title)
        ? { ...gc, caption: cleanCaption, title: cleanTitle }
        : gc;
      setContent(cleanContent);
      setEditCaption(cleanCaption);
      setEditHashtags((gc.hashtags || []).join(" "));
      // Normalize slides: image_url is the single source of truth
      const rawSlides = (data.slides as unknown) as Slide[];
      const normalized = normalizeSlides(rawSlides);
      
      // Skip auto-save when updating from DB to prevent re-saving stale data
      if (silent) skipDraftAutoSave.current = true;
      isHydratingFromDb.current = true;
      setSlides(normalized);
      
      // If DB slides have images, clear draft to avoid stale data overriding fresh images
      const hasImages = normalized.some((s: any) => s.image_url || s.background_image_url);
      if (hasImages && draftKey) {
        clearDraft(draftKey);
        discardDraft();
      }
      
      initialFetchDone.current = true;
    } catch (error) {
      console.error("Error fetching content:", error);
      if (!silent) {
        toast.error("Erro ao carregar conteúdo");
        navigate("/dashboard");
      }
    } finally {
      setLoading(false);
    }
  }, [id, navigate, draftKey, discardDraft]);

  useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  const persistSlidesToDatabase = useCallback(async (slidesToSave: Slide[]) => {
    if (!id) return;
    await supabase
      .from("generated_contents")
      .update({ slides: JSON.parse(JSON.stringify(slidesToSave)) })
      .eq("id", id);
  }, [id]);

  const handleSaveCaption = useCallback(async () => {
    if (!id || !content) return;
    const hashtagsArr = editHashtags.split(/[\s,]+/).filter(t => t.length > 0).map(t => t.startsWith("#") ? t : `#${t}`);
    try {
      await supabase
        .from("generated_contents")
        .update({ caption: editCaption, hashtags: hashtagsArr })
        .eq("id", id);
      setContent(prev => prev ? { ...prev, caption: editCaption, hashtags: hashtagsArr } : prev);
      setIsEditingCaption(false);
      toast.success("Legenda salva!");
    } catch {
      toast.error("Erro ao salvar legenda");
    }
  }, [id, content, editCaption, editHashtags]);

  const handleRegenerateCaption = useCallback(async () => {
    if (!id || !content) return;
    setIsRegeneratingCaption(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-content", {
        body: {
          trend: {
            title: content.title,
            description: content.caption,
            theme: (content.brand_snapshot as any)?.visual_tone || "Geral",
            keywords: content.hashtags,
            fullContent: content.caption,
          },
          contentType: content.content_type,
          contentStyle: "news",
          brandId: (content as any).brand_id || undefined,
          visualMode: "text_only",
          platform: content.platform || "instagram",
          includeCta: false,
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || "Erro");

      const newCaption = data.content.caption || content.caption;
      const newHashtags = data.content.hashtags || content.hashtags;

      await supabase.from("generated_contents")
        .update({ caption: newCaption, hashtags: newHashtags })
        .eq("id", id);

      setContent(prev => prev ? { ...prev, caption: newCaption, hashtags: newHashtags } : prev);
      setEditCaption(newCaption);
      setEditHashtags(newHashtags.join(" "));
      toast.success("Legenda regenerada!");
    } catch (err: any) {
      console.error("[ContentPreview] regenerate caption error:", err);
      toast.error("Erro ao regenerar legenda");
    } finally {
      setIsRegeneratingCaption(false);
    }
  }, [id, content]);

  // Auto-save edits (font size, posições, texto/imagem) no banco com debounce
  useEffect(() => {
    if (!id || !content || slides.length === 0 || !initialFetchDone.current) return;

    if (isHydratingFromDb.current) {
      isHydratingFromDb.current = false;
      return;
    }

    if (dbSaveTimerRef.current) clearTimeout(dbSaveTimerRef.current);
    dbSaveTimerRef.current = setTimeout(() => {
      persistSlidesToDatabase(slides).catch((err) => {
        console.error("Error auto-saving slides:", err);
      });
    }, 700);

    return () => {
      if (dbSaveTimerRef.current) clearTimeout(dbSaveTimerRef.current);
    };
  }, [slides, id, content, persistSlidesToDatabase]);

  const flushSlidesSave = useCallback(async () => {
    if (dbSaveTimerRef.current) {
      clearTimeout(dbSaveTimerRef.current);
      dbSaveTimerRef.current = null;
    }
    await persistSlidesToDatabase(slides);
  }, [persistSlidesToDatabase, slides]);

  // Server-side Satori rendering removed — all composite rendering now happens
  // client-side via renderAndUploadAllSlides (html-to-image) at approve/schedule/download time.

  // Composite rendering is now done only at approve/schedule/download time
  // via renderAndUploadAllSlides (html-to-image, client-side).
  // No longer auto-rendering on every text edit to avoid WORKER_LIMIT errors.

  // Auto-refresh slides when background generation completes for this content
  const hasActiveJobForContent = activeJobs.some(
    j => j.contentDbId === id && j.status === "running"
  );
  const prevHadActiveJob = useRef(false);
  
  useEffect(() => {
    if (prevHadActiveJob.current && !hasActiveJobForContent) {
      // Job just finished — reload slides from DB
      console.log("[ContentPreview] Background job completed, reloading slides...");
      fetchContent(true);
    }
    prevHadActiveJob.current = hasActiveJobForContent;
  }, [hasActiveJobForContent, fetchContent]);

  // Also poll while there's an active job (fallback for edge cases)
  useEffect(() => {
    if (!hasActiveJobForContent) return;
    const interval = setInterval(() => {
      fetchContent(true);
    }, 5000);
    return () => clearInterval(interval);
  }, [hasActiveJobForContent, fetchContent]);

  // Fallback polling: if content was recently created (< 3 min) and has no images, poll DB
  useEffect(() => {
    if (hasActiveJobForContent) return; // already polling via active jobs
    if (!content || slides.length === 0) return;
    const hasImages = slides.some((s: any) => s.image_url || s.background_image_url);
    if (hasImages) return;
    const createdAt = new Date(content.created_at || "").getTime();
    const ageMs = Date.now() - createdAt;
    if (ageMs > 3 * 60 * 1000) return; // stop polling after 3 min
    console.log("[ContentPreview] No images & recent content — polling for background gen results...");
    const interval = setInterval(() => {
      fetchContent(true);
    }, 5000);
    return () => clearInterval(interval);
  }, [hasActiveJobForContent, content, slides, fetchContent]);

  const handleApprove = async () => {
    if (!id) return;
    try {
      await flushSlidesSave();

      // Immediately approve — user is free to navigate
      await supabase
        .from("generated_contents")
        .update({ status: "approved" })
        .eq("id", id);
      setContent(prev => prev ? { ...prev, status: "approved" } : null);
      
      toast.success("Conteúdo aprovado!", {
        description: "Quer agendar agora?",
        action: {
          label: "Agendar",
          onClick: () => setIsScheduleModalOpen(true),
        },
      });

      // Render composites in background (non-blocking)
      const hasBgOverlay = slides.some(s => s.background_image_url || s.render_mode === "ai_bg_overlay");
      if (hasBgOverlay) {
        setIsApproving(true);
        renderAndUploadAllSlides(slides, content?.content_type || "carousel", id, content?.platform || "instagram")
          .then(async (compositeUrls) => {
            if (compositeUrls && compositeUrls.length > 0) {
              await supabase
                .from("generated_contents")
                .update({ image_urls: compositeUrls, updated_at: new Date().toISOString() })
                .eq("id", id);
              console.log(`[Approve] ${compositeUrls.length} composites saved in background`);
            }
          })
          .catch((err) => {
            console.error("Background composite render failed:", err);
            toast.error("Erro ao renderizar imagens finais");
          })
          .finally(() => setIsApproving(false));
      }
    } catch (error) {
      console.error("Error approving:", error);
      toast.error("Erro ao aprovar");
    }
  };

  const handleApproveAndDownload = async () => {
    if (!id) return;
    try {
      await flushSlidesSave();
      await supabase
        .from("generated_contents")
        .update({ status: "approved" })
        .eq("id", id);
      setContent(prev => prev ? { ...prev, status: "approved" } : null);
      toast.success("Conteúdo aprovado!");
      navigate(`/download/${id}`);
    } catch (error) {
      toast.error("Erro ao aprovar");
    }
  };

  const handleGoToDownload = async () => {
    if (!id) return;
    try {
      await flushSlidesSave();
      navigate(`/download/${id}`);
    } catch (error) {
      toast.error("Erro ao salvar alterações antes do download");
    }
  };

  const handleReopen = async () => {
    if (!id) return;
    try {
      await supabase
        .from("generated_contents")
        .update({ status: "draft", scheduled_at: null })
        .eq("id", id);
      setContent(prev => prev ? { ...prev, status: "draft", scheduled_at: null } : null);
      toast.success("Conteúdo reaberto para edição");
    } catch (error) {
      toast.error("Erro ao reabrir");
    }
  };

  const handleReject = async () => {
    if (!id) return;
    
    try {
      await supabase
        .from("generated_contents")
        .update({ status: "rejected" })
        .eq("id", id);
      
      toast.info("Conteúdo rejeitado");
      navigate("/dashboard");
    } catch (error) {
      console.error("Error rejecting content:", error);
    }
  };

  const handleRegenerate = async (customPrompt: string) => {
    if (!id || !content) return;
    
    setIsRegenerating(true);
    
    try {
      const { data, error } = await supabase.functions.invoke("generate-content", {
        body: {
          trend: {
            title: content.title,
            description: content.caption,
            theme: "Geral",
            keywords: content.hashtags,
          },
          contentType: content.content_type,
          customPrompt: customPrompt || undefined,
          templateSetId: (content as any).template_set_id || undefined,
          brandId: (content as any).brand_snapshot ? (content.brand_snapshot as any)?.brandId || undefined : undefined,
          visualMode: (content as any).visual_mode || "free",
          includeCta: (content as any).include_cta ?? true,
        },
      });

      if (error) throw error;

      if (!data.success) {
        throw new Error(data.error || "Erro ao regenerar");
      }

      // Update content in database
      const { error: updateError } = await supabase
        .from("generated_contents")
        .update({
          title: data.content.title,
          caption: data.content.caption,
          hashtags: data.content.hashtags,
          slides: data.content.slides,
          generation_metadata: data.content.generationMetadata || null,
        })
        .eq("id", id);

      if (updateError) throw updateError;

      // Update local state
      setContent({
        ...content,
        title: data.content.title,
        caption: data.content.caption,
        hashtags: data.content.hashtags,
      });
      setSlides(data.content.slides);
      setCurrentSlide(0);
      
      toast.success("Conteúdo regenerado com sucesso!");
      setIsRegenerateModalOpen(false);
    } catch (error) {
      console.error("Error regenerating:", error);
      toast.error("Erro ao regenerar conteúdo");
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleSchedule = async (scheduledDate: Date) => {
    if (!id) return;
    
    // Close modal immediately and show progress sheet
    setIsScheduleModalOpen(false);
    setScheduleProgress({ open: true, step: "rendering" });
    
    try {
      await flushSlidesSave();

      const hasBgOverlay = slides.some(s => s.background_image_url || s.render_mode === "ai_bg_overlay");
      let compositeUrls: string[] | null = null;

      if (hasBgOverlay) {
        try {
          compositeUrls = await renderAndUploadAllSlides(slides, content?.content_type || "carousel", id, content?.platform || "instagram");
          if (compositeUrls && compositeUrls.length > 0) {
            console.log(`[Schedule] ${compositeUrls.length} pixel-perfect composites rendered`);
          }
        } catch (err) {
          console.error("Composite render failed:", err);
          setScheduleProgress({ open: true, step: "error", message: "Erro ao renderizar imagens. Tente novamente." });
          return;
        }
      }

      setScheduleProgress({ open: true, step: "scheduling" });

      const updatePayload: Record<string, any> = {
        scheduled_at: scheduledDate.toISOString(),
        status: "scheduled",
        publish_attempts: 0,
        publish_error: null,
        updated_at: new Date().toISOString(),
      };
      if (compositeUrls && compositeUrls.length > 0) {
        updatePayload.image_urls = compositeUrls;
      }

      const { error } = await supabase
        .from("generated_contents")
        .update(updatePayload)
        .eq("id", id);

      if (error) throw error;

      setContent(prev => prev ? { ...prev, status: "scheduled", scheduled_at: scheduledDate.toISOString() } : null);
      setScheduleProgress({ open: true, step: "done", message: `Publicação agendada para ${scheduledDate.toLocaleString("pt-BR")}` });
      
      // Auto-close after 3s
      setTimeout(() => setScheduleProgress(p => p.step === "done" ? { ...p, open: false } : p), 3000);
    } catch (error) {
      console.error("Error scheduling:", error);
      setScheduleProgress({ open: true, step: "error", message: "Erro ao agendar publicação" });
    }
  };

  const handlePublishNow = async () => {
    if (!id) return;
    setIsPublishing(true);
    try {
      await flushSlidesSave();

      // If any slide uses BG_OVERLAY, render composites via frontend capture
      const hasBgOverlay = slides.some(s => s.background_image_url || s.render_mode === "ai_bg_overlay");
      let compositeUrls: string[] | undefined;

      if (hasBgOverlay) {
        toast.info("Renderizando imagens com texto...");
        compositeUrls = await renderAndUploadAllSlides(
          slides,
          content?.content_type || "carousel",
          id,
          content?.platform || "instagram",
        );
      }

      const isLinkedIn = content?.platform === "linkedin";
      const publishFn = isLinkedIn ? "publish-linkedin" : "publish-instagram";
      const platformName = isLinkedIn ? "LinkedIn" : "Instagram";

      const { data, error } = await supabase.functions.invoke(publishFn, {
        body: { content_id: id, composite_urls: compositeUrls },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setContent(prev => prev ? { ...prev, status: "published" } : null);
      toast.success(`Publicado no ${platformName} com sucesso! 🎉`);
    } catch (error) {
      console.error("Publish error:", error);
      toast.error("Erro ao publicar no Instagram", {
        description: error instanceof Error ? error.message : "Tente novamente",
      });
    } finally {
      setIsPublishing(false);
    }
  };

  const handleSaveEdit = async (index: number, headline: string, body: string, imagePrompt: string) => {
    const updatedSlides = [...slides];
    const existing = updatedSlides[index];
    const textChanged = existing.headline !== headline || existing.body !== body;
    const hasImage = !!existing.image_url;
    
    updatedSlides[index] = {
      ...existing,
      headline,
      body,
      imagePrompt,
      image_url: existing.image_url,
      previewImage: existing.image_url,
      // Mark stale if text changed and slide already has an AI image
      image_stale: (textChanged && hasImage) ? true : existing.image_stale,
    };
    setSlides(updatedSlides);
    setEditingSlide(null);
    
    if (id) {
      try {
        await supabase
          .from("generated_contents")
          .update({ slides: JSON.parse(JSON.stringify(updatedSlides)) })
          .eq("id", id);
        
        toast.success(textChanged && hasImage
          ? "Slide atualizado — imagem precisa ser regenerada"
          : "Slide atualizado");
      } catch (error) {
        console.error("Error updating slide:", error);
        toast.error("Erro ao salvar alterações");
      }
    }
  };

  const handleSetStockImage = (index: number, imageUrl: string) => {
    const updatedSlides = [...slides];
    updatedSlides[index] = {
      ...updatedSlides[index],
      image_url: imageUrl,
      previewImage: imageUrl,
    };
    setSlides(updatedSlides);
    setCurrentSlide(index);
    toast.success("Imagem selecionada!");
  };

  const handleDeleteSlide = async (index: number) => {
    if (slides.length <= 1) return;
    const updatedSlides = slides.filter((_, i) => i !== index);
    setSlides(updatedSlides);
    if (currentSlide >= updatedSlides.length) {
      setCurrentSlide(updatedSlides.length - 1);
    } else if (currentSlide === index) {
      setCurrentSlide(Math.max(0, index - 1));
    }
    if (id) {
      await supabase
        .from("generated_contents")
        .update({ slides: JSON.parse(JSON.stringify(updatedSlides)) })
        .eq("id", id);
    }
    toast.success("Slide excluído");
  };

  const handleGeneratePreview = async (index: number) => {
    const slide = slides[index];
    const brandId = (content as any)?.brand_id;

    if (!brandId) {
      // Fallback for free mode — use generic generate-image
      if (!slide.imagePrompt) {
        toast.error("Este slide não tem um prompt de imagem definido");
        return;
      }
      setGeneratingPreview(true);
      setCurrentSlide(index);
      try {
        const { data, error } = await supabase.functions.invoke("generate-image", {
          body: { prompt: slide.imagePrompt, style: `professional social media marketing for Instagram` },
        });
        if (error) throw error;
      if (data.imageUrl) {
          const updatedSlides = [...slides];
          updatedSlides[index] = { ...updatedSlides[index], image_url: data.imageUrl, previewImage: data.imageUrl, image_stale: false };
          setSlides(updatedSlides);
          toast.success("Preview gerado com sucesso!");
        }
      } catch (error) {
        console.error("Error generating preview:", error);
        toast.error("Erro ao gerar preview", { description: error instanceof Error ? error.message : "Tente novamente" });
      } finally {
        setGeneratingPreview(false);
      }
      return;
    }

    // Brand mode — use generate-slide-images (same as Studio)
    const isOverlayMode = ENABLE_BG_OVERLAY || !!slide.background_image_url || slide.render_mode === "ai_bg_overlay";
    setGeneratingPreview(true);
    setCurrentSlide(index);
    try {
      const templateSetId = (content as any)?.template_set_id || undefined;
      const { data, error } = await supabase.functions.invoke("generate-slide-images", {
        body: {
          brandId,
          slide,
          slideIndex: index,
          totalSlides: slides.length,
          contentFormat: content?.content_type || "carousel",
          contentId: `dashboard-${id}-${Date.now()}`,
          templateSetId,
          backgroundOnly: isOverlayMode,
        },
      });
      if (error) throw error;
      if (isOverlayMode && (data?.bgImageUrl || data?.imageUrl)) {
        const bgUrl = data.bgImageUrl || data.imageUrl;
        const updatedSlides = [...slides];
        updatedSlides[index] = {
          ...updatedSlides[index],
          image_url: bgUrl,
          previewImage: bgUrl,
          background_image_url: bgUrl,
          render_mode: "ai_bg_overlay" as const,
          image_stale: false,
        };
        setSlides(updatedSlides);
      } else if (data?.imageUrl) {
        const updatedSlides = [...slides];
        updatedSlides[index] = { ...updatedSlides[index], image_url: data.imageUrl, previewImage: data.imageUrl, image_stale: false };
        setSlides(updatedSlides);
        // Save image generation debug info to metadata
        if (data?.debug) {
          setContent(prev => {
            if (!prev) return prev;
            const meta = { ...(prev.generation_metadata || {}) };
            const imageGens = [...(meta.image_generations || [])];
            imageGens.push({
              slideIndex: index,
              image_model: data.debug.image_model || "google/gemini-2.5-flash-image",
              image_generation_ms: data.debug.image_generation_ms,
              references_used: data.debug.referencesUsedCount,
              fallback_level: data.debug.fallbackLevel,
              generated_at: data.debug.generated_at,
            });
            meta.image_generations = imageGens;
            // Persist metadata
            if (id) {
              supabase.from("generated_contents").update({ generation_metadata: meta }).eq("id", id);
            }
            return { ...prev, generation_metadata: meta };
          });
        }
        // Persist to DB
        if (id) {
          const updatedForDb = [...slides];
          updatedForDb[index] = { ...updatedForDb[index], image_url: data.imageUrl, previewImage: data.imageUrl, image_stale: false };
          await supabase.from("generated_contents").update({ slides: JSON.parse(JSON.stringify(updatedForDb)) }).eq("id", id);
        }
        toast.success("Imagem gerada com sucesso!");
      }
    } catch (error) {
      console.error("Error generating preview:", error);
      toast.error("Erro ao gerar preview", { description: error instanceof Error ? error.message : "Tente novamente" });
    } finally {
      setGeneratingPreview(false);
    }
  };

  const handleGenerateAllPreviews = async () => {
    const brandId = (content as any)?.brand_id;
    setGeneratingPreview(true);

    if (brandId) {
      // Brand mode — batch with generate-slide-images (same as Studio)
      const templateSetId = (content as any)?.template_set_id || undefined;
      const contentId = `dashboard-${id}-${Date.now()}`;
      // Check if any slide already uses overlay mode
      const isOverlayMode = ENABLE_BG_OVERLAY || slides.some(s => s.background_image_url || s.render_mode === "ai_bg_overlay");
      let completedCount = 0;
      const batchSize = 2;

      for (let batch = 0; batch < slides.length; batch += batchSize) {
        const batchSlides = slides.slice(batch, batch + batchSize);
        const batchPromises = batchSlides.map((s, batchIdx) => {
          const i = batch + batchIdx;
          return supabase.functions.invoke("generate-slide-images", {
            body: {
              brandId,
              slide: s,
              slideIndex: i,
              totalSlides: slides.length,
              contentFormat: content?.content_type || "carousel",
              contentId,
              templateSetId,
              backgroundOnly: isOverlayMode,
            },
          }).then(result => {
            completedCount++;
            if (isOverlayMode && (result.data?.bgImageUrl || result.data?.imageUrl)) {
              const bgUrl = result.data.bgImageUrl || result.data.imageUrl;
              setSlides(prev => prev.map((sl, idx) =>
                idx === i ? {
                  ...sl,
                  image_url: bgUrl,
                  previewImage: bgUrl,
                  background_image_url: bgUrl,
                  render_mode: "ai_bg_overlay" as const,
                  image_stale: false,
                } : sl
              ));
            } else if (result.data?.imageUrl) {
              setSlides(prev => prev.map((sl, idx) =>
                idx === i ? { ...sl, image_url: result.data.imageUrl, previewImage: result.data.imageUrl } : sl
              ));
            }
            return { index: i, data: result.data, error: result.error };
          });
        });

        await Promise.allSettled(batchPromises);

        if (batch + batchSize < slides.length) {
          await new Promise(r => setTimeout(r, 1500));
        }
      }

      // Persist all updated slides to DB
      setSlides(prev => {
        if (id) {
          supabase.from("generated_contents").update({ slides: JSON.parse(JSON.stringify(prev)) }).eq("id", id);
        }
        return prev;
      });

      toast.success(`${completedCount} imagens geradas!`);
    } else {
      // Free mode — fallback to old generic method
      for (let i = 0; i < slides.length; i++) {
        if (slides[i].imagePrompt && !slides[i].previewImage) {
          setCurrentSlide(i);
          await handleGeneratePreviewSingle(i);
        }
      }
      toast.success("Todos os previews gerados!");
    }

    setGeneratingPreview(false);
  };

  const handleGeneratePreviewSingle = async (index: number) => {
    const slide = slides[index];
    if (!slide.imagePrompt) return;

    try {
      const { data, error } = await supabase.functions.invoke("generate-image", {
        body: { prompt: slide.imagePrompt, style: `professional social media marketing for Instagram` },
      });
      if (error) throw error;
      if (data.imageUrl) {
        setSlides(prev => {
          const updated = [...prev];
          updated[index] = { ...updated[index], image_url: data.imageUrl, previewImage: data.imageUrl };
          return updated;
        });
      }
    } catch (error) {
      console.error("Error generating preview:", error);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!content) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
          <p className="text-muted-foreground">Conteúdo não encontrado</p>
          <Button onClick={() => navigate("/dashboard")}>Voltar ao Dashboard</Button>
        </div>
      </DashboardLayout>
    );
  }

  const previewCount = slides.filter(s => s.image_url).length;

  return (
    <DashboardLayout>
      {/* Silent draft auto-restore */}
      <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-heading font-bold text-foreground">
              Editor de Conteúdo
            </h1>
            <p className="text-muted-foreground">
              Personalize seu conteúdo antes de baixar
            </p>
          </div>
          <div className="flex items-center gap-2">
            {content.platform === "linkedin" && (
              <Badge variant="outline" className="text-sm">LinkedIn</Badge>
            )}
            <Badge variant="secondary" className="text-sm">
              {content.content_type === "carousel" ? "Carrossel" : content.content_type === "story" ? "Story" : content.content_type === "article" ? "Artigo" : "Post"}
            </Badge>
          </div>
        </div>

        {/* Content Info */}
        <Card className="shadow-card border-border/50 bg-gradient-to-r from-primary/5 to-accent/5">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <p className="font-medium text-foreground">{content.title}</p>
                <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{content.caption}</p>
                {content.visual_mode && (
                  <Badge variant="outline" className="mt-2 text-xs">
                    {content.visual_mode === "brand_strict" ? "🔒 Identidade Rígida" : content.visual_mode === "brand_guided" ? "🧭 Identidade + IA" : "🎨 Livre"}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={handleGenerateAllPreviews}
                  disabled={generatingPreview}
                >
                  {generatingPreview ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Wand2 className="w-4 h-4" />
                  )}
                  Gerar {ENABLE_BG_OVERLAY ? "Backgrounds" : "Previews"} ({previewCount}/{slides.length})
                </Button>
                {previewCount > 0 && (content as any)?.brand_id && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => {
                      setSaveBgSingleIndex(undefined);
                      setIsSaveBgTemplateOpen(true);
                    }}
                  >
                    <Save className="w-4 h-4" />
                    Salvar como Template
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Source Context (Base do Conteúdo) */}
        {(content.source_summary || (content.key_insights && content.key_insights.length > 0)) && (
          <Card className="shadow-card border-border/50">
            <CardContent className="p-4 space-y-3">
              <h3 className="text-sm font-heading font-semibold text-foreground flex items-center gap-2">
                📚 Base do Conteúdo
              </h3>
              {content.source_summary && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Resumo da Fonte</p>
                  <p className="text-sm text-foreground leading-relaxed">{content.source_summary}</p>
                </div>
              )}
              {content.key_insights && content.key_insights.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Insights-Chave</p>
                  <ul className="space-y-1">
                    {content.key_insights.map((insight, i) => (
                      <li key={i} className="text-sm text-foreground flex items-start gap-2">
                        <span className="text-primary mt-0.5">•</span>
                        <span>{insight}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column - Preview */}
          <div className="lg:col-span-5 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-heading font-semibold text-foreground flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                Preview Visual
              </h2>
            </div>

            {(() => {
              const currentSlideData = slides[currentSlide];
              const hasBgOverlay = !!currentSlideData?.background_image_url;
              const currentSlideSrc = currentSlideData?.image_url;
              const hasText = !!(currentSlideData?.headline || currentSlideData?.body);
              const isLinkedIn = content.platform === "linkedin";
              const previewDims = getContentDimensions(content.platform || "instagram", content.content_type);
              const previewWidth = isLinkedIn ? 380 : 320;
              const contentWidth = previewWidth - 12;
              const aspectRatio = getAspectRatio(content.platform || "instagram", content.content_type);

              const isStoryContent = content.content_type === "story";
              const captionPreview = isStoryContent ? "" : (content.caption || "");
              const hashtagsPreview = isStoryContent ? "" : (content.hashtags || []).join(" ");
              const brandName = content.brand_snapshot?.name || "Sua marca";
              const truncatedCaption = captionPreview.length > 200 ? captionPreview.substring(0, 200) + "..." : captionPreview;

              const renderFrame = (children: React.ReactNode) => {
                if (isLinkedIn) {
                  // LinkedIn feed card mockup — realistic post appearance
                  const isDocOrCarousel = content.content_type === "document" || content.content_type === "carousel";
                  const imageAspect = isDocOrCarousel ? "4/5" : "1200/627";
                  return (
                    <div className="flex justify-center">
                      <div className="relative mx-auto" style={{ width: previewWidth }}>
                        <div className="rounded-xl border border-border bg-card shadow-lg overflow-hidden">
                          {/* LinkedIn post header — profile info */}
                          <div className="flex items-center gap-2.5 px-3.5 py-3 bg-card">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center flex-shrink-0 border border-primary/10">
                              <span className="text-xs font-bold text-primary">{brandName.charAt(0).toUpperCase()}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] font-semibold text-foreground leading-tight">{brandName}</p>
                              <p className="text-[9px] text-muted-foreground leading-tight mt-0.5">Publicação · Agora</p>
                            </div>
                          </div>
                          {/* Caption ABOVE image (LinkedIn style) */}
                          {captionPreview && (
                            <div className="px-3.5 pb-2">
                              <p className="text-[10px] text-foreground leading-relaxed whitespace-pre-line">{truncatedCaption}</p>
                              {captionPreview.length > 200 && (
                                <span className="text-[9px] text-muted-foreground cursor-pointer hover:underline">...ver mais</span>
                              )}
                            </div>
                          )}
                          {/* Content area with correct aspect ratio */}
                          <div className="bg-background relative overflow-hidden" style={{ aspectRatio: imageAspect }}>
                            {children}
                          </div>
                          {/* Hashtags */}
                          {hashtagsPreview && (
                            <div className="px-3.5 py-1.5">
                              <p className="text-[9px] text-primary/70 leading-relaxed">{hashtagsPreview.substring(0, 100)}</p>
                            </div>
                          )}
                          {/* LinkedIn engagement bar */}
                          <div className="px-3.5 py-2 bg-card border-t border-border/50">
                            <div className="flex items-center gap-1.5 mb-2">
                              <div className="flex -space-x-1">
                                <div className="w-3.5 h-3.5 rounded-full bg-blue-500/70" />
                                <div className="w-3.5 h-3.5 rounded-full bg-green-500/60" />
                                <div className="w-3.5 h-3.5 rounded-full bg-red-400/60" />
                              </div>
                              <span className="text-[9px] text-muted-foreground ml-1">42 reações</span>
                            </div>
                            <div className="flex items-center justify-around pt-1.5 border-t border-border/30">
                              <span className="text-[9px] text-muted-foreground">👍 Gostei</span>
                              <span className="text-[9px] text-muted-foreground">💬 Comentar</span>
                              <span className="text-[9px] text-muted-foreground">🔄 Repostar</span>
                              <span className="text-[9px] text-muted-foreground">📤 Enviar</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }
                // Instagram Story — fullscreen, no chrome
                if (isStoryContent) {
                  return (
                    <div className="flex justify-center">
                      <div className="relative mx-auto" style={{ width: previewWidth }}>
                        <div className="rounded-2xl border border-border bg-black shadow-lg overflow-hidden">
                          {/* Story top bar */}
                          <div className="absolute top-0 left-0 right-0 z-10 p-3 bg-gradient-to-b from-black/50 to-transparent">
                            <div className="h-0.5 w-full rounded-full bg-white/30 mb-2">
                              <div className="h-full w-1/3 rounded-full bg-white" />
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
                                <span className="text-[8px] font-bold text-white">{brandName.charAt(0)}</span>
                              </div>
                              <span className="text-[10px] text-white font-medium">{brandName.toLowerCase().replace(/\s/g, "")}</span>
                              <span className="text-[9px] text-white/60">Agora</span>
                            </div>
                          </div>
                          {/* Story content */}
                          <div className="bg-black relative overflow-hidden" style={{ aspectRatio: "9/16" }}>
                            {children}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }

                // Instagram feed post mockup
                return (
                  <div className="flex justify-center">
                    <div className="relative mx-auto" style={{ width: previewWidth }}>
                      <div className="rounded-xl border border-border bg-card shadow-lg overflow-hidden">
                        {/* Instagram header */}
                        <div className="flex items-center gap-2.5 px-3 py-2.5 bg-card">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 via-red-500 to-yellow-500 p-[2px]">
                            <div className="w-full h-full rounded-full bg-card flex items-center justify-center">
                              <span className="text-[8px] font-bold text-foreground">{brandName.charAt(0).toUpperCase()}</span>
                            </div>
                          </div>
                          <div className="flex-1">
                            <p className="text-[11px] font-semibold text-foreground">{brandName.toLowerCase().replace(/\s/g, "")}</p>
                          </div>
                          <span className="text-muted-foreground text-sm">•••</span>
                        </div>
                        {/* Image area */}
                        <div className="bg-background relative overflow-hidden" style={{ aspectRatio }}>
                          {children}
                        </div>
                        {/* Instagram action buttons */}
                        <div className="px-3 py-2 bg-card flex items-center justify-between">
                          <div className="flex items-center gap-3.5">
                            <span className="text-sm">♡</span>
                            <span className="text-sm">💬</span>
                            <span className="text-sm">📤</span>
                          </div>
                          <span className="text-sm">🔖</span>
                        </div>
                        {/* Caption below image (Instagram style) */}
                        {captionPreview && (
                          <div className="px-3 pb-2">
                            <p className="text-[10px] text-foreground leading-relaxed">
                              <span className="font-semibold">{brandName.toLowerCase().replace(/\s/g, "")}</span>{" "}
                              {truncatedCaption}
                            </p>
                            {captionPreview.length > 200 && (
                              <span className="text-[9px] text-muted-foreground">...mais</span>
                            )}
                            {hashtagsPreview && (
                              <p className="text-[9px] text-primary/70 mt-1">{hashtagsPreview.substring(0, 80)}</p>
                            )}
                          </div>
                        )}
                        {/* Timestamp */}
                        <div className="px-3 pb-2">
                          <p className="text-[8px] text-muted-foreground uppercase">Agora mesmo</p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              };

              // Priority 0: LinkedIn Document — use PDF-style renderer ONLY if no AI image
              const isLinkedInDoc = isLinkedIn && content.content_type === "document";
              const scaleRatio = contentWidth / previewDims.width;
              const hasAiImage = (currentSlideData as any).render_mode === "ai_full_design" && (currentSlideData.background_image_url || currentSlideData.image_url || (content.image_urls as string[])?.[currentSlide]);
              if (isLinkedInDoc && !hasAiImage) {
                return renderFrame(
                  <div className="absolute inset-0" style={{
                    transform: `scale(${scaleRatio})`,
                    transformOrigin: "top left",
                    width: previewDims.width,
                    height: previewDims.height,
                  }}>
                    <LinkedInDocumentRenderer
                      slide={currentSlideData}
                      slideIndex={currentSlide}
                      totalSlides={slides.length}
                      brand={content.brand_snapshot as any}
                      dimensions={previewDims}
                    />
                    {generatingPreview && (
                      <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center z-50 rounded-lg">
                        <Loader2 className="w-16 h-16 animate-spin text-white mb-4" />
                        <p className="text-white text-2xl font-semibold">Gerando imagem...</p>
                        <p className="text-white/70 text-lg mt-1">Aguarde alguns segundos</p>
                      </div>
                    )}
                  </div>
                );
              }

              // Priority 0.5: AI Full Design — image already has text, show directly
              const isFullDesign = (currentSlideData.render_mode as string) === "ai_full_design";
              const fullDesignImageUrl = currentSlideData.background_image_url || currentSlideData.image_url || (content.image_urls as string[])?.[currentSlide];
              if (isFullDesign && fullDesignImageUrl) {
                return renderFrame(
                  <div className="relative" style={{ width: contentWidth, aspectRatio: `${previewDims.width}/${previewDims.height}` }}>
                    <img
                      src={fullDesignImageUrl}
                      alt=""
                      className="w-full h-full object-cover rounded-lg"
                    />
                    {generatingPreview && (
                      <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center z-50 rounded-lg">
                        <Loader2 className="w-16 h-16 animate-spin text-white mb-4" />
                        <p className="text-white text-2xl font-semibold">Gerando imagem...</p>
                      </div>
                    )}
                  </div>
                );
              }

              // Priority 1: BG Overlay mode OR any slide with text
              if (hasBgOverlay || hasText) {
                const isIllustrationTitled = content?.generation_metadata?.visual_style === "ai_illustration_titled";
                return renderFrame(
                  <div className="absolute inset-0" style={{
                    transform: `scale(${scaleRatio})`,
                    transformOrigin: "top left",
                    width: previewDims.width,
                    height: previewDims.height,
                  }}>
                    <SlideBgOverlayRenderer
                      backgroundImageUrl={currentSlideData.background_image_url}
                      overlay={{
                        headline: currentSlideData.headline,
                        body: isIllustrationTitled ? "" : currentSlideData.body,
                        bullets: isIllustrationTitled ? [] : currentSlideData.bullets,
                      }}
                      overlayStyle={currentSlideData.overlay_style}
                      overlayPositions={currentSlideData.overlay_positions}
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
                      selectedBlock={selectedBlock}
                      onSelectBlock={setSelectedBlock}
                      editable={true}
                      dimensions={previewDims}
                      role={currentSlideData.role}
                      slideIndex={currentSlide}
                      totalSlides={slides.length}
                      brandSnapshot={content.brand_snapshot as any}
                    />
                    {/* Generation loading overlay */}
                    {generatingPreview && (
                      <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center z-50 rounded-lg">
                        <Loader2 className="w-16 h-16 animate-spin text-white mb-4" />
                        <p className="text-white text-2xl font-semibold">Gerando imagem...</p>
                        <p className="text-white/70 text-lg mt-1">Aguarde alguns segundos</p>
                      </div>
                    )}
                  </div>
                );
              }

              // Priority 2: Legacy full image (no text data)
              if (currentSlideSrc) {
                return renderFrame(
                  <img
                    src={currentSlideSrc}
                    alt={`Slide ${currentSlide + 1}`}
                    className="w-full h-full object-cover"
                  />
                );
              }

              // Generic fallback
              return (
                <SlidePreview
                  slides={slides}
                  currentSlide={currentSlide}
                  setCurrentSlide={setCurrentSlide}
                  template={templates[selectedTemplate]}
                  generatingImage={generatingPreview}
                />
              );
            })()}

            {/* Upload / Replace image button */}
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setUploadDialogOpen(true)}
              >
                <Upload className="w-3.5 h-3.5" />
                Substituir imagem do slide
              </Button>
            </div>

            <Separator />

            {/* Text editing controls — always visible for overlay mode */}
            {(() => {
              const currentSlideData = slides[currentSlide];
              const hasBgOverlay = !!(currentSlideData?.background_image_url || currentSlideData?.render_mode === "ai_bg_overlay");
              const hasText = !!(currentSlideData?.headline || currentSlideData?.body);

              if (hasBgOverlay || hasText) {
                return selectedBlock ? (
                  <TextBlockToolbar
                    selectedBlock={selectedBlock}
                    overlayStyle={currentSlideData?.overlay_style || {}}
                    isFirstSlide={currentSlide === 0}
                    hasBullets={!!(currentSlideData?.bullets && currentSlideData.bullets!.length > 0)}
                    onStyleChange={(updates) => {
                      const updated = [...slides];
                      updated[currentSlide] = {
                        ...updated[currentSlide],
                        overlay_style: {
                          ...updated[currentSlide].overlay_style,
                          ...updates,
                        },
                      };
                      setSlides(updated);
                    }}
                    onDeselect={() => setSelectedBlock(null)}
                  />
                ) : (
                  <Card className="shadow-card border-border/50 bg-muted/30">
                    <CardContent className="p-4">
                      <p className="text-sm text-muted-foreground text-center flex items-center justify-center gap-2">
                        <Type className="w-4 h-4" />
                        Clique em um bloco de texto no preview para editá-lo
                      </p>
                    </CardContent>
                  </Card>
                );
              }

              // Legacy mode — show template selector
              return (
                <TemplateSelector
                  selectedTemplate={selectedTemplate}
                  onSelectTemplate={setSelectedTemplate}
                />
              );
            })()}
          </div>

          {/* Right Column - Editor */}
          <div className="lg:col-span-7 space-y-4">
            <h2 className="text-lg font-heading font-semibold text-foreground">
              Editar Slides
            </h2>

            <SlideEditor
              slides={slides}
              currentSlide={currentSlide}
              editingSlide={editingSlide}
              onSlideClick={setCurrentSlide}
              onEditSlide={setEditingSlide}
              onSaveEdit={handleSaveEdit}
              onCancelEdit={() => setEditingSlide(null)}
              onGeneratePreview={handleGeneratePreview}
              onSetStockImage={handleSetStockImage}
              onDeleteSlide={handleDeleteSlide}
              generatingPreview={generatingPreview}
            />

            {/* Drag hint — show when slide has editable overlay */}
            {slides[currentSlide]?.background_image_url && (slides[currentSlide]?.render_mode as string) !== "ai_full_design" && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20 text-xs text-blue-600 dark:text-blue-400">
                <span className="text-base">👆</span>
                <p>O texto pode ser <strong>arrastado e reposicionado</strong> clicando nele na imagem acima. Ideal para ajustar dentro de mockups ou caixas visuais.</p>
              </div>
            )}

            {/* Legenda e Hashtags */}
            <Card className="shadow-card border-border/50">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-heading font-semibold text-foreground flex items-center gap-2">
                    📝 Legenda do Post
                  </h3>
                  <div className="flex gap-1">
                  {!isEditingCaption ? (
                    <>
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setIsEditingCaption(true)}>
                      <Edit2 className="w-3 h-3" />
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={handleRegenerateCaption}
                      disabled={isRegeneratingCaption}
                    >
                      {isRegeneratingCaption ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                      {isRegeneratingCaption ? "Gerando..." : "Regenerar"}
                    </Button>
                    </>
                  ) : (
                    <div className="flex gap-1">
                      <Button size="sm" className="h-7 text-xs gap-1" onClick={handleSaveCaption}>
                        <Check className="w-3 h-3" />
                        Salvar
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setIsEditingCaption(false); setEditCaption(content.caption || ""); setEditHashtags((content.hashtags || []).join(" ")); }}>
                        Cancelar
                      </Button>
                    </div>
                  )}
                  </div>
                </div>

                {isEditingCaption ? (
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">Legenda</Label>
                      <Textarea
                        value={editCaption}
                        onChange={(e) => setEditCaption(e.target.value)}
                        rows={4}
                        className="text-sm resize-none"
                        placeholder="Escreva a legenda do post..."
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">Hashtags</Label>
                      <Input
                        value={editHashtags}
                        onChange={(e) => setEditHashtags(e.target.value)}
                        className="text-sm"
                        placeholder="#hashtag1 #hashtag2 ..."
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                      {content.caption || <span className="text-muted-foreground italic">Sem legenda</span>}
                    </p>
                    {content.hashtags && content.hashtags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {content.hashtags.map((tag, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Debug Panel */}
            <GenerationDebugPanel metadata={content.generation_metadata || null} />
          </div>
        </div>

        {/* Actions - Status-aware, larger buttons */}
        <div className="space-y-3 pt-4 border-t border-border">
          {content.status === "draft" && (
            <>
              {/* Primary actions — large */}
              <div className="grid grid-cols-2 gap-3">
                <Button size="lg" className="gap-2 text-base h-12" onClick={handleApprove} disabled={isApproving}>
                  {isApproving ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Check className="w-5 h-5" />
                  )}
                  {isApproving ? "Renderizando..." : "Aprovar"}
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="gap-2 text-base h-12"
                  onClick={() => setIsScheduleModalOpen(true)}
                >
                  <CalendarClock className="w-5 h-5" />
                  Agendar
                </Button>
              </div>

              {/* Secondary actions */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 flex-1"
                  onClick={() => setIsRegenerateModalOpen(true)}
                >
                  <RefreshCw className="w-4 h-4" />
                  Regenerar Tudo
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 flex-1"
                  onClick={handleApproveAndDownload}
                >
                  <Download className="w-4 h-4" />
                  Aprovar e Baixar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-destructive hover:text-destructive"
                  onClick={handleReject}
                >
                  <X className="w-4 h-4" />
                  Rejeitar
                </Button>
              </div>
            </>
          )}

          {content.status === "approved" && (
            <>
              {content.platform === "instagram" && slides.length > 0 && (
                <Button
                  className="gap-2 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white"
                  onClick={handlePublishNow}
                  disabled={isPublishing}
                >
                  {isPublishing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Instagram className="w-4 h-4" />
                  )}
                  {isPublishing ? "Publicando..." : "Publicar Agora"}
                </Button>
              )}
              <Button className="gap-2" variant={content.platform === "instagram" ? "outline" : "default"} onClick={handleGoToDownload}>
                <Download className="w-4 h-4" />
                Baixar Agora
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => setIsScheduleModalOpen(true)}
              >
                <CalendarClock className="w-4 h-4" />
                Agendar
              </Button>
              <div className="flex-1" />
              <Button
                variant="ghost"
                className="gap-2 text-muted-foreground"
                onClick={handleReopen}
              >
                <RotateCcw className="w-4 h-4" />
                Reabrir para Edição
              </Button>
            </>
          )}

          {content.status === "scheduled" && (
            <>
              <Badge className="bg-primary/15 text-primary border-primary/30 px-3 py-2 text-sm self-center">
                <CalendarClock className="w-4 h-4 mr-1.5" />
                Agendado para {content.scheduled_at ? format(new Date(content.scheduled_at), "dd/MM 'às' HH:mm", { locale: ptBR }) : ""}
              </Badge>
              {content.platform === "instagram" && slides.length > 0 && (
                <Button
                  className="gap-2 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white"
                  onClick={handlePublishNow}
                  disabled={isPublishing}
                >
                  {isPublishing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Instagram className="w-4 h-4" />
                  )}
                  {isPublishing ? "Publicando..." : "Publicar Agora"}
                </Button>
              )}
              <Button className="gap-2" variant="outline" onClick={handleGoToDownload}>
                <Download className="w-4 h-4" />
                Baixar Agora
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => setIsScheduleModalOpen(true)}
              >
                <CalendarClock className="w-4 h-4" />
                Editar Agendamento
              </Button>
              <div className="flex-1" />
              <Button
                variant="ghost"
                className="gap-2 text-muted-foreground"
                onClick={handleReopen}
              >
                <RotateCcw className="w-4 h-4" />
                Reabrir para Edição
              </Button>
            </>
          )}

          {content.status === "published" && (
            <>
              <Badge className="bg-green-500/15 text-green-600 border-green-500/30 px-3 py-2 text-sm self-center">
                <Check className="w-4 h-4 mr-1.5" />
                Publicado {content.created_at ? format(new Date(content.created_at), "dd/MM 'às' HH:mm", { locale: ptBR }) : ""}
              </Badge>
              <Button className="gap-2" variant="outline" onClick={handleGoToDownload}>
                <Download className="w-4 h-4" />
                Baixar
              </Button>
              <div className="flex-1" />
              <Button
                variant="ghost"
                className="gap-2 text-muted-foreground"
                onClick={handleReopen}
              >
                <RotateCcw className="w-4 h-4" />
                Reabrir para Edição
              </Button>
            </>
          )}
        </div>

        {/* Regenerate Modal */}
        <RegenerateModal
          open={isRegenerateModalOpen}
          onClose={() => setIsRegenerateModalOpen(false)}
          onRegenerate={handleRegenerate}
          isRegenerating={isRegenerating}
          currentTitle={content?.title || ""}
        />

        {/* Schedule Modal */}
        <ScheduleModal
          open={isScheduleModalOpen}
          onClose={() => setIsScheduleModalOpen(false)}
          onSchedule={handleSchedule}
          isScheduling={isScheduling}
        />

        {/* Save Background Template Modal */}
        {(content as any)?.brand_id && (
          <SaveBackgroundTemplateModal
            open={isSaveBgTemplateOpen}
            onOpenChange={setIsSaveBgTemplateOpen}
            brandId={(content as any).brand_id}
            contentFormat={content.content_type}
            slides={slides}
            singleSlideIndex={saveBgSingleIndex}
            sourceContentId={id}
          />
        )}

        {/* Off-screen renderer for frontend slide capture (publish) */}
        <OffScreenSlideRenderer
          captureIndex={captureIndex}
          captureRef={captureRef}
          slides={slides}
          brandSnapshot={content?.brand_snapshot}
          contentType={content?.content_type || "carousel"}
          platform={content?.platform || "instagram"}
        />

        {/* Schedule progress sheet */}
        <Sheet open={scheduleProgress.open} onOpenChange={(open) => {
          if (!open && (scheduleProgress.step === "done" || scheduleProgress.step === "error")) {
            setScheduleProgress(p => ({ ...p, open: false }));
          }
        }}>
          <SheetContent side="right" className="w-[340px] sm:w-[380px] flex flex-col items-center justify-center gap-6">
            {scheduleProgress.step === "rendering" && (
              <>
                <Loader2 className="w-12 h-12 animate-spin text-primary" />
                <div className="text-center space-y-1">
                  <p className="text-lg font-semibold text-foreground">Renderizando alterações</p>
                  <p className="text-sm text-muted-foreground">Gerando imagens finais dos slides…</p>
                </div>
              </>
            )}
            {scheduleProgress.step === "scheduling" && (
              <>
                <CalendarClock className="w-12 h-12 text-primary animate-pulse" />
                <div className="text-center space-y-1">
                  <p className="text-lg font-semibold text-foreground">Agendando publicação</p>
                  <p className="text-sm text-muted-foreground">Salvando no calendário…</p>
                </div>
              </>
            )}
            {scheduleProgress.step === "done" && (
              <>
                <div className="w-12 h-12 rounded-full bg-green-500/15 flex items-center justify-center">
                  <Check className="w-6 h-6 text-green-600" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-lg font-semibold text-foreground">Agendado com sucesso!</p>
                  {scheduleProgress.message && (
                    <p className="text-sm text-muted-foreground">{scheduleProgress.message}</p>
                  )}
                </div>
              </>
            )}
            {scheduleProgress.step === "error" && (
              <>
                <div className="w-12 h-12 rounded-full bg-destructive/15 flex items-center justify-center">
                  <X className="w-6 h-6 text-destructive" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-lg font-semibold text-foreground">Erro no agendamento</p>
                  {scheduleProgress.message && (
                    <p className="text-sm text-muted-foreground">{scheduleProgress.message}</p>
                  )}
                </div>
                <Button variant="outline" size="sm" onClick={() => setScheduleProgress(p => ({ ...p, open: false }))}>
                  Fechar
                </Button>
              </>
            )}
          </SheetContent>
        </Sheet>

        {/* Image Upload Dialog */}
        <ImageUpload
          open={uploadDialogOpen}
          onClose={() => setUploadDialogOpen(false)}
          onUploadComplete={(imageUrl) => {
            const currentSlideData = slides[currentSlide];
            const isOverlayMode = ENABLE_BG_OVERLAY || !!currentSlideData?.background_image_url || currentSlideData?.render_mode === "ai_bg_overlay";
            const updatedSlides = [...slides];
            if (isOverlayMode) {
              updatedSlides[currentSlide] = {
                ...updatedSlides[currentSlide],
                background_image_url: imageUrl,
                image_url: imageUrl,
                previewImage: imageUrl,
                render_mode: "ai_bg_overlay" as const,
                image_stale: false,
              };
            } else {
              updatedSlides[currentSlide] = {
                ...updatedSlides[currentSlide],
                image_url: imageUrl,
                previewImage: imageUrl,
                image_stale: false,
              };
            }
            setSlides(updatedSlides);
            toast.success("Imagem substituída!");
          }}
        />
      </div>
    </DashboardLayout>
  );
};

export default ContentPreview;
