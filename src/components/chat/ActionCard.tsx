import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, CalendarDays, Loader2, Save, ExternalLink, Pencil, ImageIcon, RefreshCw, X, Send, ChevronDown, Play } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import ScheduleModal from "@/components/content/ScheduleModal";
import SlideBgOverlayRenderer from "@/components/content/SlideBgOverlayRenderer";
import { getContentDimensions } from "@/lib/contentDimensions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { PLATFORMS } from "@/components/profile/SocialConnections";
import type { ConnectedAccount } from "@/components/profile/SocialConnections";

interface ActionCardProps {
  contentId: string;
  contentType: "post" | "carousel" | "story" | "document" | "article" | "cron_config";
  platform?: string;
  previewImageUrl?: string;
  headline?: string;
  scheduledAt?: string;
  messageId?: string;
  onRegenerate?: () => void;
  onReject?: () => void;
  onAddMessage?: (content: string) => void;
}

const DAYS = [
  { value: "1", label: "Seg" },
  { value: "2", label: "Ter" },
  { value: "3", label: "Qua" },
  { value: "4", label: "Qui" },
  { value: "5", label: "Sex" },
  { value: "6", label: "Sab" },
  { value: "0", label: "Dom" },
];

const HOURS = Array.from({ length: 17 }, (_, i) => i + 6);

const PHASE_MESSAGES = [
  "Criando o roteiro do conteúdo... ✍️",
  "Gerando as imagens... 🎨",
  "Compondo o visual final... ✨",
  "Quase pronto... ⏳",
];

const PHASE_THRESHOLDS = [0, 30, 90, 150];

// Separate component to avoid IIFE reconciliation issues with React DOM
function ActionCardPreview({
  slideData, composedImageUrls, isRegeneratingImage, isPolling,
  pollingTimedOut, generationFailed, generationPhase, generationMetadata,
  brandSnapshot, containerWidth, effectivePlatform, contentType, contentId, navigate,
}: {
  slideData: any; composedImageUrls: string[] | null; isRegeneratingImage: boolean;
  isPolling: boolean; pollingTimedOut: boolean; generationFailed: boolean;
  generationPhase: number; generationMetadata: any; brandSnapshot: any;
  containerWidth: number; effectivePlatform: string; contentType: string;
  contentId: string; navigate: (path: string) => void;
}) {
  // Compute whether we have a renderable image
  const hasComposed = !!composedImageUrls?.[0];
  const hasRenderableImage = hasComposed
    || (slideData?.render_mode === "ai_full_design" || slideData?.render_mode === "template_clean"
      ? Boolean(slideData?.background_image_url || slideData?.image_url)
      : Boolean(slideData?.image_url || slideData?.background_image_url));
  const showImage = hasRenderableImage && !isRegeneratingImage;

  if (showImage && slideData) {
    const dims = getContentDimensions(effectivePlatform, contentType);
    const scale = containerWidth / dims.width;
    const renderImageUrl = slideData.background_image_url || slideData.image_url;
    const composedUrl = composedImageUrls?.[0];
    const isFullDesign = slideData.render_mode === "ai_full_design";
    const showAsFinishedImage = isFullDesign || !!composedUrl;
    const displayUrl = composedUrl || renderImageUrl;
    const isIllustrationTitled = generationMetadata?.visual_style === "ai_illustration_titled";

    const isVideoContent = slideData?.media_type === "video" || /\.(mp4|webm|mov)(\?|$)/i.test(displayUrl || "");
    const aspectRatio = `${dims.width} / ${dims.height}`;

    return (
      <div style={{ width: "100%", aspectRatio, overflow: "hidden" }}>
        {isVideoContent && displayUrl ? (
          <video src={displayUrl} controls muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : showAsFinishedImage ? (
          <img src={displayUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ transform: `scale(${scale})`, transformOrigin: "top center", width: dims.width, height: dims.height, margin: "0 auto" }}>
            <SlideBgOverlayRenderer
              backgroundImageUrl={renderImageUrl}
              overlay={{
                headline: slideData.overlay?.headline || slideData.headline,
                body: isIllustrationTitled ? "" : (slideData.overlay?.body || slideData.body),
                bullets: isIllustrationTitled ? [] : (slideData.overlay?.bullets || slideData.bullets),
                footer: slideData.overlay?.footer,
              }}
              overlayStyle={slideData.overlay_style}
              overlayPositions={slideData.overlay_positions}
              dimensions={dims}
              role={slideData.role}
              slideIndex={0}
              totalSlides={1}
              brandSnapshot={brandSnapshot ? { palette: brandSnapshot.palette, fonts: brandSnapshot.fonts } : null}
            />
          </div>
        )}
      </div>
    );
  }

  if (isPolling || isRegeneratingImage) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground animate-pulse transition-all duration-300">
          {isRegeneratingImage ? "Gerando nova imagem... 🎨" : (PHASE_MESSAGES[generationPhase] || PHASE_MESSAGES[0])}
        </span>
      </div>
    );
  }

  if (pollingTimedOut || generationFailed) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-4 py-12">
        <span className="text-xs text-muted-foreground text-center leading-relaxed">
          {pollingTimedOut ? "A geração está demorando mais que o normal." : "A geração deste preview não foi concluída."}
          <br />Clique abaixo para acompanhar ou excluir o conteúdo.
        </span>
        <Button size="sm" variant="outline" className="text-xs" onClick={(e) => { e.stopPropagation(); navigate(`/content/${contentId}`); }}>
          <ExternalLink className="w-3 h-3" /> Ver no Studio
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      <span className="text-xs text-muted-foreground animate-pulse">Carregando preview...</span>
    </div>
  );
}

export default function ActionCard({
  contentId,
  contentType,
  platform,
  previewImageUrl,
  headline,
  scheduledAt,
  messageId,
  onRegenerate,
  onReject,
  onAddMessage,
}: ActionCardProps) {
  const navigate = useNavigate();
  const [resolvedPlatform, setResolvedPlatform] = useState(platform || "instagram");
  const effectivePlatform = resolvedPlatform;
  const [isApproving, setIsApproving] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [approved, setApproved] = useState(false);
  const [isRejected, setIsRejected] = useState(false);
  const [showRejectConfirm, setShowRejectConfirm] = useState(false);
  const [isRegeneratingText, setIsRegeneratingText] = useState(false);
  const [isRegeneratingImage, setIsRegeneratingImage] = useState(false);
  const [showImageEditDialog, setShowImageEditDialog] = useState(false);
  const [imageEditInstruction, setImageEditInstruction] = useState("");
  const [isAnimating, setIsAnimating] = useState(false);
  const [animatedVideoUrl, setAnimatedVideoUrl] = useState<string | null>(null);

  // Multi-platform publish state — uses pfm_account_id for uniqueness (multiple accounts per platform)
  const [connectedAccounts, setConnectedAccounts] = useState<ConnectedAccount[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [publishOpen, setPublishOpen] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishResults, setPublishResults] = useState<Record<string, { success: boolean; error?: string }> | null>(null);

  // Slide data for client-side rendering (same component as studio)
  const [slideData, setSlideData] = useState<any>(null);
  const [allSlides, setAllSlides] = useState<any[]>([]);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [brandSnapshot, setBrandSnapshot] = useState<any>(null);
  const [generationMetadata, setGenerationMetadata] = useState<any>(null);
  const [composedImageUrls, setComposedImageUrls] = useState<string[] | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [pollingTimedOut, setPollingTimedOut] = useState(false);
  const [generationFailed, setGenerationFailed] = useState(false);
  const [contentDeleted, setContentDeleted] = useState(false);
  const [generationPhase, setGenerationPhase] = useState(0);
  const [captionText, setCaptionText] = useState<string | null>(null);
  const [hashtagsList, setHashtagsList] = useState<string[] | null>(null);
  const [showFullCaption, setShowFullCaption] = useState(false);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(360);

  // Cron config state
  const [cronDays, setCronDays] = useState<string[]>(["1", "3", "5"]);
  const [cronHour, setCronHour] = useState("9");
  const [isSavingCron, setIsSavingCron] = useState(false);
  const [cronSaved, setCronSaved] = useState(false);

  // Measure container width for scaling
  useEffect(() => {
    if (previewContainerRef.current) {
      const w = previewContainerRef.current.offsetWidth;
      if (w > 0) setContainerWidth(w);
    }
  }, []);

  // ── Fetch connected social accounts for publish ──
  const accountsFetchedRef = useRef(false);
  useEffect(() => {
    if (contentType === "cron_config" || accountsFetchedRef.current) return;
    accountsFetchedRef.current = true;
    supabase.functions.invoke("connect-social", { body: { action: "list" } })
      .then(({ data }) => {
        const list = data?.connections || data?.accounts || [];
        const connected = Array.isArray(list) ? list.filter((a: any) => a.connected || a.status === "connected") : [];
        const mapped = connected.map((a: any) => ({
          platform: a.platform,
          connected: true,
          account_name: a.account_name || a.username || null,
          pfm_account_id: a.pfm_account_id || a.id || null,
        }));
        setConnectedAccounts(mapped);
        // Pre-select accounts matching the content's platform
        if (platform) {
          const matches = mapped.filter((a: ConnectedAccount) => a.platform === platform);
          if (matches.length === 1 && matches[0].pfm_account_id) {
            setSelectedAccountIds([matches[0].pfm_account_id]);
          }
        }
      })
      .catch(() => { /* silent */ });
  }, [contentType, platform]);

  const handlePublish = async () => {
    if (selectedAccountIds.length === 0) return;
    setIsPublishing(true);
    setPublishResults(null);
    try {
      // Map selected account IDs to platforms + account IDs for publish
      const selectedAccounts = connectedAccounts.filter(a => a.pfm_account_id && selectedAccountIds.includes(a.pfm_account_id));
      const platforms = [...new Set(selectedAccounts.map(a => a.platform))];
      const accountIds = selectedAccounts.map(a => a.pfm_account_id).filter(Boolean);

      const { data, error } = await supabase.functions.invoke("publish-postforme", {
        body: { contentId, platforms, accountIds },
      });
      if (error) throw error;

      // Parse results per platform
      const results: Record<string, { success: boolean; error?: string }> = {};
      if (data?.results) {
        for (const r of data.results) {
          results[r.platform] = { success: r.success !== false, error: r.error };
        }
      } else {
        // If no per-platform results, assume all succeeded
        for (const p of selectedAccountIds) {
          results[p] = { success: true };
        }
      }
      setPublishResults(results);

      const successCount = Object.values(results).filter((r) => r.success).length;
      const failCount = Object.values(results).filter((r) => !r.success).length;

      if (failCount === 0) {
        toast.success(`Publicado em ${successCount} plataforma${successCount > 1 ? "s" : ""}!`);
      } else if (successCount > 0) {
        toast.warning(`Publicado em ${successCount}, falhou em ${failCount} plataforma${failCount > 1 ? "s" : ""}`);
      } else {
        toast.error("Falha ao publicar em todas as plataformas");
      }
    } catch (err: any) {
      console.error("[ActionCard] publish error:", err);
      toast.error("Erro ao publicar conteudo");
      const failResults: Record<string, { success: boolean; error?: string }> = {};
      for (const p of selectedAccountIds) failResults[p] = { success: false, error: err.message };
      setPublishResults(failResults);
    } finally {
      setIsPublishing(false);
    }
  };

  const toggleAccountSelection = (accountId: string) => {
    setSelectedAccountIds((prev) =>
      prev.includes(accountId) ? prev.filter((p) => p !== accountId) : [...prev, accountId]
    );
    setPublishResults(null);
  };

  // ── Fetch slide data for client-side rendering (same as studio) ──
  const bgLoadedRef = useRef(false);
  useEffect(() => {
    if (contentType === "cron_config" || !contentId || bgLoadedRef.current) return;

    let cancelled = false;
    let phaseTimers: ReturnType<typeof setTimeout>[] = [];
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;

    setIsPolling(true);
    setPollingTimedOut(false);
    setGenerationFailed(false);
    setGenerationPhase(0);

    // For ai_full_design or template_clean, a background_image_url is the final image.
    // For other modes, the final image is in image_urls (composite with text overlay).
    // Don't stop polling on just background_image_url when composite is still pending.
    const hasRenderableImage = (slide: any, imageUrls?: string[]) => {
      if (imageUrls?.[0]) return true; // composite ready
      if (slide?.render_mode === "ai_full_design" || slide?.render_mode === "template_clean") {
        return Boolean(slide?.background_image_url || slide?.image_url);
      }
      // For any mode: if slide has a direct image_url or background, it's renderable
      return Boolean(slide?.image_url || slide?.background_image_url || slide?.previewImage);
    };

    // Track creation time to detect stale content that will never get images
    let contentCreatedAt: Date | null = null;

    // Check if slide data already exists
    const checkExisting = async () => {
      try {
        const { data } = await supabase
          .from("generated_contents")
          .select("slides, brand_snapshot, platform, content_type, created_at, image_urls, generation_metadata, caption, hashtags")
          .eq("id", contentId)
          .maybeSingle();

        // Content was deleted — stop polling and show "removed" state
        if (!cancelled && !data) {
          setContentDeleted(true);
          setIsPolling(false);
          bgLoadedRef.current = true;
          return true;
        }

        if (!cancelled && data?.slides?.[0]) {
          const slides = data.slides as any[];
          const slide = slides[0];

          // Track when content was created
          if (data.created_at && !contentCreatedAt) {
            contentCreatedAt = new Date(data.created_at);
          }

          // Always update slideData with latest
          setAllSlides(slides);
          setSlideData(slide);
          setBrandSnapshot(data.brand_snapshot);
          if (data.generation_metadata) setGenerationMetadata(data.generation_metadata);
          if (data.platform) setResolvedPlatform(data.platform);
          if ((data as any).caption) setCaptionText((data as any).caption);
          if ((data as any).hashtags) setHashtagsList((data as any).hashtags);
          const fetchedImageUrls = data.image_urls as string[] | null;
          if (fetchedImageUrls?.length) setComposedImageUrls(fetchedImageUrls);

          if (hasRenderableImage(slide, fetchedImageUrls || undefined)) {
            setIsPolling(false);
            bgLoadedRef.current = true;
            return true;
          }

          // If content is old and still no image, stop polling
          // template_clean doesn't need images — show immediately
          if (slide.render_mode === "template_clean") {
            setIsPolling(false);
            bgLoadedRef.current = true;
            return true;
          }

          if (contentCreatedAt) {
            const ageMs = Date.now() - contentCreatedAt.getTime();
            // 5 min timeout — inference.sh fallback to Lovable can take time
            if (ageMs > 5 * 60 * 1000) {
              console.log(`[ActionCard] Content ${contentId} is ${Math.round(ageMs/1000)}s old with no image, stopping poll`);
              setIsPolling(false);
              setGenerationFailed(true);
              bgLoadedRef.current = true;
              return true;
            }
          }
        }
      } catch {
        /* ignore */
      }
      return false;
    };

    // Subscribe to Realtime updates for when background generation completes
    const channel = supabase
      .channel(`content-${contentId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'generated_contents',
        filter: `id=eq.${contentId}`
      }, async (payload) => {
        if (cancelled) return;
        const slides = (payload.new as any)?.slides;
        const slide = slides?.[0];
        if (slide) {
          setSlideData(slide);
          setBrandSnapshot((payload.new as any)?.brand_snapshot);
          const newMeta = (payload.new as any)?.generation_metadata;
          if (newMeta) setGenerationMetadata(newMeta);
          const newImageUrls = (payload.new as any)?.image_urls as string[] | null;
          if (newImageUrls?.length) setComposedImageUrls(newImageUrls);
          if (hasRenderableImage(slide, newImageUrls || undefined)) {
            setIsPolling(false);
            bgLoadedRef.current = true;
          }
        }
      })
      .subscribe();

    // Check existing first, then poll every 5s as fallback for Realtime
    checkExisting().then((found) => {
      if (found || cancelled) {
        supabase.removeChannel(channel);
        return;
      }
    });

    // Fallback polling every 3s in case Realtime misses the update
    const pollInterval = setInterval(async () => {
      if (cancelled) return;
      const found = await checkExisting();
      if (found) {
        clearInterval(pollInterval);
        supabase.removeChannel(channel);
      }
    }, 3000);

    // Phase messages for progress feedback
    phaseTimers = PHASE_THRESHOLDS.slice(1).map((sec, i) =>
      setTimeout(() => { if (!cancelled) setGenerationPhase(i + 1); }, sec * 1000)
    );

    // 5 min timeout
    timeoutTimer = setTimeout(() => {
      if (!cancelled) {
        setIsPolling(false);
        setPollingTimedOut(true);
        setGenerationFailed(true);
      }
    }, 300000);

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      phaseTimers.forEach(clearTimeout);
    };
  }, [contentId, contentType]);

  // ── Cron config card ──
  if (contentType === "cron_config") {
    const handleSaveCron = async () => {
      setIsSavingCron(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) throw new Error("Not authenticated");

        await supabase.from("ai_cron_config").upsert({
          user_id: session.user.id,
          active: true,
          days_of_week: cronDays.map(Number),
          hour_utc: parseInt(cronHour),
          qty_suggestions: cronDays.length,
        }, { onConflict: "user_id" });

        setCronSaved(true);
        const dayLabels = cronDays.map(d => DAYS.find(dd => dd.value === d)?.label).join(", ");
        toast.success(`✓ Vou te enviar sugestões toda ${dayLabels} às ${cronHour}h`);
      } catch {
        toast.error("Erro ao salvar configuração");
      } finally {
        setIsSavingCron(false);
      }
    };

    return (
      <Card className="mt-2 overflow-hidden border-border/50 bg-card">
        <CardContent className="p-4 space-y-4">
          <p className="text-sm font-medium text-foreground">⚙️ Configurar sugestões automáticas</p>

          <div>
            <p className="text-xs text-muted-foreground mb-2">Dias da semana</p>
            <ToggleGroup type="multiple" value={cronDays} onValueChange={(v) => v.length && setCronDays(v)} className="flex-wrap justify-start">
              {DAYS.map((d) => (
                <ToggleGroupItem key={d.value} value={d.value} size="sm" className="text-xs px-3">
                  {d.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-2">Horário</p>
            <Select value={cronHour} onValueChange={setCronHour}>
              <SelectTrigger className="w-24 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HOURS.map((h) => (
                  <SelectItem key={h} value={String(h)} className="text-xs">
                    {String(h).padStart(2, "0")}h
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            size="sm"
            onClick={handleSaveCron}
            disabled={isSavingCron || cronSaved}
            className="w-full text-xs"
          >
            {isSavingCron ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />}
            {cronSaved ? "Configuração salva ✓" : "Salvar configuração"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ── Content card ──
  // Aspect ratio uses exact pixel dimensions from getContentDimensions
  // so the preview matches the actual generated image without cropping
  const getAspectRatio = () => {
    if (effectivePlatform === "linkedin") {
      if (contentType === "post" || contentType === "article") return 1200 / 627;
      return 1080 / 1350; // document/carousel
    }
    if (contentType === "story") return 1080 / 1920;
    return 1080 / 1350; // Instagram post/carousel
  };
  const aspectRatio = getAspectRatio();

  const handleApprove = async () => {
    setIsApproving(true);
    try {
      await supabase
        .from("generated_contents")
        .update({ status: "approved" })
        .eq("id", contentId);
      setApproved(true);
      toast.success("Conteúdo aprovado!");
    } catch {
      toast.error("Erro ao aprovar conteúdo");
    } finally {
      setIsApproving(false);
    }
  };

  const handleSchedule = async (date: Date) => {
    setIsScheduling(true);
    try {
      await supabase
        .from("generated_contents")
        .update({ scheduled_at: date.toISOString(), status: "scheduled" })
        .eq("id", contentId);
      toast.success("Conteúdo agendado!");
      setScheduleOpen(false);
    } catch {
      toast.error("Erro ao agendar");
    } finally {
      setIsScheduling(false);
    }
  };

  const handleReject = async () => {
    try {
      // Fetch metadata to find related project/post IDs
      const { data: gc, error: gcErr } = await supabase
        .from("generated_contents")
        .select("generation_metadata")
        .eq("id", contentId)
        .single();

      if (gcErr) {
        console.error("[ActionCard] fetch metadata error:", gcErr.message);
      }

      const postId = (gc?.generation_metadata as any)?.post_id;
      const projectId = (gc?.generation_metadata as any)?.project_id;
      const errors: string[] = [];

      // Delete project first — cascades to posts → slides → visual_briefs,
      // image_prompts, image_generations, slide_versions, quality_metrics
      if (projectId) {
        const { error } = await supabase.from("projects").delete().eq("id", projectId);
        if (error) errors.push(`projects: ${error.message}`);
      } else if (postId) {
        // No project but has post — delete post (cascades slides + deps)
        const { error } = await supabase.from("posts").delete().eq("id", postId);
        if (error) errors.push(`posts: ${error.message}`);
      }

      // Delete the content itself — cascades content_metrics, sets null on brand_background_templates
      const { error: gcDelErr } = await supabase
        .from("generated_contents")
        .delete()
        .eq("id", contentId);
      if (gcDelErr) errors.push(`generated_contents: ${gcDelErr.message}`);

      // Delete chat message so content doesn't reappear on reload
      if (messageId) {
        await supabase.from("chat_messages").delete().eq("id", messageId);
      } else {
        const { data: chatMsgs } = await supabase
          .from("chat_messages")
          .select("id, metadata")
          .eq("intent", "INICIAR_GERACAO")
          .limit(100);
        const toDelete = (chatMsgs || []).filter(
          (m: any) => (m.metadata as any)?.action_result?.content_id === contentId
        );
        for (const m of toDelete) {
          await supabase.from("chat_messages").delete().eq("id", m.id);
        }
      }

      if (errors.length) {
        console.error("[ActionCard] partial delete errors:", errors);
        // If generated_contents itself failed to delete, fall back to status update
        if (gcDelErr) {
          await supabase.from("generated_contents").update({ status: "rejected" }).eq("id", contentId);
          toast.error("Erro ao excluir completamente, conteúdo marcado como descartado");
        }
      }

      setIsRejected(true);
      setShowRejectConfirm(false);
      onReject?.();
      if (!gcDelErr) {
        onAddMessage?.("Conteúdo excluído. Quer criar outro?");
      }
    } catch (err) {
      console.error("[ActionCard] delete error:", err);
      await supabase.from("generated_contents").update({ status: "rejected" }).eq("id", contentId);
      setIsRejected(true);
      setShowRejectConfirm(false);
      toast.error("Erro ao excluir completamente, conteúdo marcado como descartado");
    }
  };

  const handleRegenerateText = async () => {
    setIsRegeneratingText(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const resp = await supabase.functions.invoke("ai-chat", {
        body: {
          message: `Regenerar apenas o texto do conteúdo ${contentId}`,
          intent_hint: "REGENERAR_TEXTO",
          generationParams: { contentId, keepImage: true },
        },
      });

      if (resp.error) throw resp.error;
      toast.success("Texto atualizado! Recarregando preview...");
      // Reset slide data to trigger re-fetch
      setSlideData(null);
    } catch (err: any) {
      console.error("[ActionCard] regenerate text error:", err);
      toast.error("Erro ao regenerar texto");
    } finally {
      setIsRegeneratingText(false);
    }
  };

  const handleRegenerateImage = () => {
    setImageEditInstruction("");
    setShowImageEditDialog(true);
  };

  const handleConfirmImageEdit = async () => {
    const instruction = imageEditInstruction.trim();
    if (!instruction) return;
    setShowImageEditDialog(false);
    setIsRegeneratingImage(true);
    setSlideData(null);
    setComposedImageUrls(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const { error: invokeErr } = await supabase.functions.invoke("ai-chat", {
        body: {
          message: instruction,
          intent_hint: "EDIT_CONTENT",
          editInstruction: instruction,
          generationParams: { contentId },
        },
      });

      if (invokeErr) throw invokeErr;

      // Realtime subscription is stopped for existing content — fetch DB directly after invoke
      const { data } = await supabase
        .from("generated_contents")
        .select("slides, image_urls, brand_snapshot, generation_metadata, platform, caption, hashtags")
        .eq("id", contentId)
        .maybeSingle();

      if (data) {
        if ((data as any).caption) setCaptionText((data as any).caption);
        if ((data as any).hashtags) setHashtagsList((data as any).hashtags);
        const slides = data.slides as any[];
        if (slides?.length) {
          setAllSlides(slides);
          setSlideData(slides[0]);
        }
        if (data.brand_snapshot) setBrandSnapshot(data.brand_snapshot);
        if (data.platform) setResolvedPlatform(data.platform);
        const newImageUrls = data.image_urls as string[] | null;
        if (newImageUrls?.length) {
          setComposedImageUrls(newImageUrls);
          toast.success("Imagem atualizada!");
        } else {
          toast.error("A imagem não foi gerada. Tente novamente.");
        }
      }
    } catch (err: any) {
      console.error("[ActionCard] regenerate image error:", err);
      toast.error("Erro ao regenerar imagem");
    } finally {
      setIsRegeneratingImage(false);
    }
  };

  const typeLabels: Record<string, string> = {
    carousel: "Carrossel",
    story: "Story",
    post: "Post",
    document: "Documento",
    article: "Artigo",
  };
  const typeLabel = typeLabels[contentType] || "Post";
  const platformLabel = effectivePlatform === "linkedin" ? "LinkedIn" : "Instagram";

  // Content was deleted (e.g. from another session or DB cleanup)
  if (contentDeleted) {
    return (
      <Card className="mt-2 overflow-hidden border-border/50 bg-card">
        <CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">Conteúdo removido</p>
        </CardContent>
      </Card>
    );
  }

  // Fade out on rejection
  if (isRejected) {
    return (
      <Card className="mt-2 overflow-hidden border-border/50 bg-card animate-fade-out opacity-0 transition-all duration-500">
        <CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">Conteúdo descartado</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="mt-2 overflow-hidden border-border/50 bg-card">
        {/* Client-side preview — SAME renderer as Studio for pixel-perfect match */}
        <div className="p-3 pb-0" ref={previewContainerRef}>
          <div
            className="overflow-hidden rounded-lg bg-muted relative group cursor-pointer hover:brightness-[0.97] transition-all"
            onClick={() => navigate(`/content/${contentId}`)}
            title="Clique para ver no Studio"
          >
            <ActionCardPreview
              slideData={allSlides[currentSlideIndex] || slideData}
              composedImageUrls={composedImageUrls ? [composedImageUrls[currentSlideIndex] || composedImageUrls[0]].filter(Boolean) : null}
              isRegeneratingImage={isRegeneratingImage}
              isPolling={isPolling}
              pollingTimedOut={pollingTimedOut}
              generationFailed={generationFailed}
              generationPhase={generationPhase}
              generationMetadata={generationMetadata}
              brandSnapshot={brandSnapshot}
              containerWidth={containerWidth}
              effectivePlatform={effectivePlatform}
              contentType={contentType}
              contentId={contentId}
              navigate={navigate}
            />
            {/* Carousel navigation arrows */}
            {allSlides.length > 1 && !isPolling && !isRegeneratingImage && (
              <>
                {currentSlideIndex > 0 && (
                  <button
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    onClick={(e) => { e.stopPropagation(); setCurrentSlideIndex(i => i - 1); }}
                  >
                    ‹
                  </button>
                )}
                {currentSlideIndex < allSlides.length - 1 && (
                  <button
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    onClick={(e) => { e.stopPropagation(); setCurrentSlideIndex(i => i + 1); }}
                  >
                    ›
                  </button>
                )}
                {/* Slide dots indicator */}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
                  {allSlides.map((_, i) => (
                    <button
                      key={i}
                      className={`w-1.5 h-1.5 rounded-full transition-all ${
                        i === currentSlideIndex ? "bg-white w-3" : "bg-white/50"
                      }`}
                      onClick={(e) => { e.stopPropagation(); setCurrentSlideIndex(i); }}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <CardContent className="p-3 pt-2.5">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-primary/60">{platformLabel} · {typeLabel}</div>
          {headline && <p className="mb-2 text-sm font-semibold text-foreground line-clamp-2">{headline}</p>}
          {captionText && (
            <div className="mb-3 rounded-lg bg-muted/40 px-3 py-2.5">
              <p className={`text-[13px] leading-relaxed text-foreground/80 whitespace-pre-line ${showFullCaption ? "" : "line-clamp-4"}`}>
                {captionText}
              </p>
              {captionText.length > 120 && (
                <button
                  className="text-[11px] text-primary font-medium hover:underline mt-1.5 block"
                  onClick={() => setShowFullCaption(!showFullCaption)}
                >
                  {showFullCaption ? "ver menos" : "ver mais"}
                </button>
              )}
              {hashtagsList && hashtagsList.length > 0 && (
                <p className="text-[11px] text-primary/60 mt-2 leading-relaxed flex flex-wrap gap-x-1.5 gap-y-0.5">
                  {hashtagsList.map(h => (
                    <span key={h}>{h.startsWith("#") ? h : `#${h}`}</span>
                  ))}
                </p>
              )}
            </div>
          )}
          {scheduledAt && (
            <p className="mb-2 text-xs text-muted-foreground">📅 Agendado: {new Date(scheduledAt).toLocaleDateString("pt-BR")}</p>
          )}

          {/* Row 1: Primary actions */}
          <div className="flex gap-2 mb-2">
            <Button size="sm" variant={approved ? "secondary" : "default"} className="flex-1 text-xs" onClick={handleApprove} disabled={isApproving || approved}>
              {isApproving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              {approved ? "Aprovado" : "Aprovar"}
            </Button>
            <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => setScheduleOpen(true)}>
              <CalendarDays className="w-3 h-3" />
              Agendar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="flex-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => navigate(`/content/${contentId}`)}
            >
              <ExternalLink className="w-3 h-3" />
              Studio
            </Button>
          </div>

          {/* Publish — highlighted after approval */}
          {connectedAccounts.length > 0 && (
            <div className="mb-2">
              <Popover open={publishOpen} onOpenChange={setPublishOpen}>
                <PopoverTrigger asChild>
                  <Button
                    size="sm"
                    variant={approved ? "default" : "outline"}
                    className={`w-full text-xs gap-1.5 ${approved && !publishResults ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border-primary/20 text-primary hover:bg-primary/5"}`}
                    disabled={isPublishing}
                  >
                    {isPublishing ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Send className="w-3 h-3" />
                    )}
                    {isPublishing
                      ? "Publicando..."
                      : publishResults
                        ? "Publicado"
                        : "Publicar"}
                    <ChevronDown className="w-3 h-3 ml-auto" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-3" align="start">
                  <p className="text-xs font-medium mb-2 text-foreground">Publicar em:</p>
                  <div className="space-y-1.5 mb-3">
                    {connectedAccounts.map((account) => {
                      const info = PLATFORMS.find((p) => p.id === account.platform);
                      if (!info) return null;
                      const accountKey = account.pfm_account_id || account.platform;
                      const isSelected = selectedAccountIds.includes(accountKey);
                      const result = publishResults?.[account.platform];

                      return (
                        <label
                          key={accountKey}
                          className={`flex items-center gap-2.5 p-2 rounded-md cursor-pointer transition-colors ${
                            isSelected ? "bg-primary/5" : "hover:bg-muted/50"
                          }`}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleAccountSelection(accountKey)}
                            disabled={isPublishing}
                          />
                          <div
                            className={`w-6 h-6 rounded ${info.bgColor} flex items-center justify-center ${info.iconColor} shrink-0`}
                          >
                            <info.icon className="w-3.5 h-3.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-medium block">{info.name}</span>
                            {account.account_name && (
                              <span className="text-[10px] text-muted-foreground block truncate">{account.account_name}</span>
                            )}
                          </div>
                          {result && (
                            result.success ? (
                              <Check className="w-3.5 h-3.5 text-green-500" />
                            ) : (
                              <X className="w-3.5 h-3.5 text-destructive" />
                            )
                          )}
                        </label>
                      );
                    })}
                  </div>
                  {publishResults && (
                    <div className="mb-2 space-y-1">
                      {Object.entries(publishResults)
                        .filter(([, r]) => !r.success && r.error)
                        .map(([plat, r]) => (
                          <p key={plat} className="text-[10px] text-destructive">
                            {PLATFORMS.find((p) => p.id === plat)?.name}: {r.error}
                          </p>
                        ))}
                    </div>
                  )}
                  <Button
                    size="sm"
                    className="w-full text-xs"
                    onClick={handlePublish}
                    disabled={selectedAccountIds.length === 0 || isPublishing}
                  >
                    {isPublishing ? (
                      <Loader2 className="w-3 h-3 animate-spin mr-1" />
                    ) : (
                      <Send className="w-3 h-3 mr-1" />
                    )}
                    Publicar em {selectedAccountIds.length} conta{selectedAccountIds.length !== 1 ? "s" : ""}
                  </Button>
                </PopoverContent>
              </Popover>
            </div>
          )}

          {/* Row 2: Regeneration + Animate actions */}
          <div className="flex gap-2 mb-2">
            <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={handleRegenerateImage} disabled={isRegeneratingImage}>
              {isRegeneratingImage ? <Loader2 className="w-3 h-3 animate-spin" /> : <Pencil className="w-3 h-3" />}
              Ajustar
            </Button>
            <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={onRegenerate}>
              <RefreshCw className="w-3 h-3" />
              Refazer
            </Button>
            {composedImageUrls?.[0] && !animatedVideoUrl && (
              <Button
                size="sm"
                variant="outline"
                className="flex-1 text-xs border-primary/20 text-primary hover:bg-primary/5"
                disabled={isAnimating}
                onClick={async () => {
                  setIsAnimating(true);
                  try {
                    const imageUrl = composedImageUrls[0];
                    const { data, error } = await supabase.functions.invoke("blotato-proxy", {
                      body: {
                        action: "create_visual",
                        templateKey: "image-slideshow",
                        prompt: captionText || headline || "Animate this image with smooth motion",
                        inputs: {
                          slides: [{ uploadedMedia: imageUrl }],
                          aspectRatio: effectivePlatform === "linkedin" ? "1:1" : contentType === "story" ? "9:16" : "1:1",
                          slideDuration: 5,
                          transition: "crossfade",
                        },
                      },
                    });
                    if (error) throw error;
                    if (data?.mediaUrl) {
                      setAnimatedVideoUrl(data.mediaUrl);
                      toast.success("Video animado gerado!");
                    } else if (data?.imageUrls?.[0]) {
                      setAnimatedVideoUrl(data.imageUrls[0]);
                      toast.success("Animação gerada!");
                    } else {
                      toast.error("Não foi possível gerar a animação");
                    }
                  } catch (err: any) {
                    console.error("[ActionCard] Animate error:", err);
                    toast.error("Erro ao animar: " + (err?.message || "tente novamente"));
                  } finally {
                    setIsAnimating(false);
                  }
                }}
              >
                {isAnimating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                {isAnimating ? "Animando..." : "Animar"}
              </Button>
            )}
          </div>
          {animatedVideoUrl && (
            <div className="mb-2 rounded-lg overflow-hidden border border-primary/20">
              <video src={animatedVideoUrl} controls playsInline className="w-full" />
            </div>
          )}

          {/* Save background nudge — only for ai_background mode (has bg image + overlay text) */}
          {slideData?.background_image_url && slideData?.render_mode !== "ai_full_design" && (
            <button
              className="w-full flex items-center justify-center gap-2 py-2 mb-2 text-xs text-primary/80 hover:text-primary bg-primary/5 hover:bg-primary/10 rounded-lg border border-primary/10 transition-all"
              onClick={async () => {
                try {
                  const { data } = await supabase.from("generated_contents").select("slides, brand_id").eq("id", contentId).single();
                  const bgUrl = data?.slides?.[0]?.background_image_url;
                  if (!bgUrl) { toast.error("Nenhum fundo disponível"); return; }
                  if (!data?.brand_id) { toast.error("Conteúdo sem marca associada"); return; }
                  await supabase.from("brand_background_templates").insert({
                    brand_id: data.brand_id,
                    name: headline?.substring(0, 40) || "Fundo salvo",
                    image_url: bgUrl,
                  });
                  toast.success("Fundo salvo no Brand Kit!");
                } catch { toast.error("Erro ao salvar fundo"); }
              }}
            >
              <Save className="w-3.5 h-3.5" />
              Gostou do visual? Salve este fundo para usar de novo
            </button>
          )}

          {/* Row 3: Reject (inline confirm) */}
          {showRejectConfirm ? (
            <div className="flex items-center justify-center gap-2 py-1">
              <span className="text-xs text-muted-foreground">Tem certeza?</span>
              <Button size="sm" variant="destructive" className="text-xs h-6 px-2" onClick={handleReject}>
                Sim, excluir
              </Button>
              <Button size="sm" variant="ghost" className="text-xs h-6 px-2" onClick={() => setShowRejectConfirm(false)}>
                Cancelar
              </Button>
            </div>
          ) : (
            <button
              onClick={() => setShowRejectConfirm(true)}
              className="w-full text-center text-[11px] text-muted-foreground/60 hover:text-destructive transition-colors py-1"
            >
              <X className="w-3 h-3 inline mr-1" />
              Reprovar e excluir
            </button>
          )}
        </CardContent>
      </Card>

      <ScheduleModal open={scheduleOpen} onClose={() => setScheduleOpen(false)} onSchedule={handleSchedule} isScheduling={isScheduling} />

      <Dialog open={showImageEditDialog} onOpenChange={setShowImageEditDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Pencil className="w-4 h-4" />
              O que quer ajustar?
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-1">
              A IA vai usar a imagem atual como base e aplicar as mudanças que você pedir.
            </p>
          </DialogHeader>

          {/* Quick suggestions */}
          <div className="flex flex-wrap gap-1.5">
            {[
              "Texto menor",
              "Fonte diferente",
              "Cores mais vibrantes",
              "Fundo mais escuro",
              "Remover elementos extras",
              "Mais profissional",
              "Mais minimalista",
            ].map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => setImageEditInstruction((prev) => prev ? `${prev}, ${suggestion.toLowerCase()}` : suggestion.toLowerCase())}
                className="text-[11px] px-2.5 py-1 rounded-full border border-border/60 text-muted-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all"
              >
                {suggestion}
              </button>
            ))}
          </div>

          <Textarea
            value={imageEditInstruction}
            onChange={(e) => setImageEditInstruction(e.target.value)}
            placeholder="Descreva o que quer mudar..."
            rows={3}
            className="text-sm resize-none"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleConfirmImageEdit();
            }}
          />
          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowImageEditDialog(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleConfirmImageEdit} disabled={!imageEditInstruction.trim()}>
              <RefreshCw className="w-3 h-3 mr-1" />
              Regenerar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
