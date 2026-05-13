import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  CalendarClock,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  GripVertical,
  Instagram,
  Linkedin,
  RotateCcw,
  Trash2,
  Loader2,
  Filter,
} from "lucide-react";

import SlideTemplateRenderer from "@/components/content/SlideTemplateRenderer";
import SlideBgOverlayRenderer from "@/components/content/SlideBgOverlayRenderer";
import OffScreenSlideRenderer from "@/components/content/OffScreenSlideRenderer";
import RecurringSchedules from "@/components/calendar/RecurringSchedules";
import { getSlideRenderMode } from "@/lib/slideUtils";
import { useSlideCapture } from "@/hooks/useSlideCapture";
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  addDays,
  addWeeks,
  addMonths,
  subWeeks,
  subMonths,
  isSameDay,
  isToday,
  eachDayOfInterval,
  setHours,
  setMinutes,
} from "date-fns";
import { ptBR } from "date-fns/locale";

interface CalendarContent {
  id: string;
  title: string;
  content_type: string;
  status: string;
  scheduled_at: string | null;
  created_at: string;
  updated_at: string;
  brand_id: string | null;
  template_set_id: string | null;
  template_id: string | null;
  templates: { name: string; category: string } | null;
  slides: any[];
  caption: string | null;
  brand_snapshot: any;
  image_urls: string[] | null;
  platform: string;
}

type ViewMode = "week" | "month";

const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 6h-23h
const HOUR_HEIGHT = 52; // px per hour row — compact for usability

const Calendar = () => {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [contents, setContents] = useState<CalendarContent[]>([]);
  const [backlog, setBacklog] = useState<CalendarContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedContent, setSelectedContent] = useState<CalendarContent | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverCell, setDragOverCell] = useState<string | null>(null);
  const [previewSlideIndex, setPreviewSlideIndex] = useState(0);
  const [isPublishing, setIsPublishing] = useState(false);
  const { captureIndex, captureRef, renderAndUploadAllSlides } = useSlideCapture();
  const [publishingContent, setPublishingContent] = useState<CalendarContent | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState<Date | undefined>(undefined);
  const [rescheduleHour, setRescheduleHour] = useState("09");
  const [rescheduleMinute, setRescheduleMinute] = useState("00");
  const [isRescheduling, setIsRescheduling] = useState(false);

  const weekScrollRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);

  // Auto-scroll to current hour on week view load
  useEffect(() => {
    if (viewMode === "week" && !loading && weekScrollRef.current && !hasScrolledRef.current) {
      const now = new Date();
      const currentHour = now.getHours();
      const hourIndex = Math.max(0, currentHour - 6 - 2); // 2 hours before current
      weekScrollRef.current.scrollTo({
        top: hourIndex * HOUR_HEIGHT,
        behavior: "smooth",
      });
      hasScrolledRef.current = true;
    }
  }, [viewMode, loading]);

  // Reset scroll flag on date change
  useEffect(() => {
    hasScrolledRef.current = false;
  }, [currentDate]);

  // Stats
  const todayScheduledCount = useMemo(() => {
    const now = new Date();
    return contents.filter(c => {
      if (!c.scheduled_at) return false;
      return isSameDay(new Date(c.scheduled_at), now) && (c.status === "scheduled" || c.status === "approved");
    }).length;
  }, [contents]);

  const weekPublishedCount = useMemo(() => {
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
    return contents.filter(c => {
      if (c.status !== "published" || !c.scheduled_at) return false;
      const d = new Date(c.scheduled_at);
      return d >= weekStart && d <= weekEnd;
    }).length;
  }, [contents]);

  const rescheduleHours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, "0"));
  const rescheduleMinutes = ["00", "15", "30", "45"];

  const handleReschedule = async () => {
    if (!selectedContent || !rescheduleDate) return;
    setIsRescheduling(true);
    try {
      const newDate = new Date(rescheduleDate);
      newDate.setHours(parseInt(rescheduleHour), parseInt(rescheduleMinute), 0, 0);
      const { error } = await supabase
        .from("generated_contents")
        .update({ scheduled_at: newDate.toISOString(), status: "scheduled", publish_attempts: 0, publish_error: null })
        .eq("id", selectedContent.id);
      if (error) throw error;
      toast.success("Conteúdo reagendado!", {
        description: format(newDate, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }),
      });
      setSelectedContent(null);
      fetchData();
    } catch (error) {
      toast.error("Erro ao reagendar conteúdo");
    } finally {
      setIsRescheduling(false);
    }
  };

  // Filters
  const [filterBrand, setFilterBrand] = useState<string>("all");
  const [filterFormat, setFilterFormat] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPlatform, setFilterPlatform] = useState<string>("all");
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
  const renderingCompositeIdsRef = useRef<Set<string>>(new Set());

  const ensureCompositeThumbs = useCallback(async (items: CalendarContent[]) => {
    const candidates = items.filter((item) => {
      if (item.image_urls?.[0]) return false;
      if (renderingCompositeIdsRef.current.has(item.id)) return false;
      return item.slides?.some((s: any) => s?.background_image_url || s?.render_mode === "ai_bg_overlay");
    });

    if (candidates.length === 0) return;

    await Promise.all(
      candidates.map(async (item) => {
        renderingCompositeIdsRef.current.add(item.id);
        try {
          const isStory = item.content_type === "story";
          const dims = { width: 1080, height: isStory ? 1920 : 1350 };
          const slides = item.slides || [];
          const BATCH_SIZE = 2;
          const allUrls: string[] = [];

          for (let batchStart = 0; batchStart < slides.length; batchStart += BATCH_SIZE) {
            const batch = slides.slice(batchStart, batchStart + BATCH_SIZE);
            const { data, error } = await supabase.functions.invoke("render-slide-image", {
              body: {
                slides: batch,
                brand_snapshot: item.brand_snapshot,
                content_id: item.id,
                dimensions: dims,
                slide_offset: batchStart,
              },
            });
            if (error) throw error;
            if (data?.composite_urls) allUrls.push(...data.composite_urls);
          }

          if (allUrls.length > 0) {
            await supabase
              .from("generated_contents")
              .update({ image_urls: allUrls, updated_at: new Date().toISOString() })
              .eq("id", item.id);
            setContents((prev) => prev.map((c) => (c.id === item.id ? { ...c, image_urls: allUrls } : c)));
            setBacklog((prev) => prev.map((c) => (c.id === item.id ? { ...c, image_urls: allUrls } : c)));
            setSelectedContent((prev) => (prev?.id === item.id ? { ...prev, image_urls: allUrls } : prev));
          }
        } catch (err) {
          console.error(`[Calendar] failed to render composite thumbnail for ${item.id}:`, err);
        } finally {
          renderingCompositeIdsRef.current.delete(item.id);
        }
      }),
    );
  }, []);

  const [userId, setUserId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data: brandsData } = await supabase
        .from("brands")
        .select("id, name")
        .eq("owner_user_id", user.id);
      setBrands(brandsData || []);

      const rawStart = viewMode === "week"
        ? startOfWeek(currentDate, { weekStartsOn: 1 })
        : startOfMonth(currentDate);
      const rawEnd = viewMode === "week"
        ? endOfWeek(currentDate, { weekStartsOn: 1 })
        : endOfMonth(currentDate);
      const rangeStart = addDays(rawStart, -1);
      const rangeEnd = addDays(rawEnd, 1);

      let scheduledQuery = supabase
        .from("generated_contents")
        .select("id, title, content_type, status, scheduled_at, created_at, updated_at, brand_id, template_set_id, template_id, templates(name, category), slides, caption, brand_snapshot, image_urls, platform")
        .eq("user_id", user.id)
        .in("status", ["scheduled", "approved", "published"])
        .gte("scheduled_at", rangeStart.toISOString())
        .lte("scheduled_at", rangeEnd.toISOString())
        .order("scheduled_at", { ascending: true });

      if (filterBrand !== "all") scheduledQuery = scheduledQuery.eq("brand_id", filterBrand);
      if (filterFormat !== "all") scheduledQuery = scheduledQuery.eq("content_type", filterFormat);
      if (filterStatus !== "all") scheduledQuery = scheduledQuery.eq("status", filterStatus);
      if (filterPlatform !== "all") scheduledQuery = scheduledQuery.eq("platform", filterPlatform);

      const { data: scheduledData } = await scheduledQuery;
      const scheduled = (scheduledData as unknown as CalendarContent[]) || [];
      setContents(scheduled);

      let backlogQuery = supabase
        .from("generated_contents")
        .select("id, title, content_type, status, scheduled_at, created_at, updated_at, brand_id, template_set_id, template_id, templates(name, category), slides, caption, brand_snapshot, image_urls, platform")
        .eq("user_id", user.id)
        .eq("status", "approved")
        .is("scheduled_at", null)
        .order("created_at", { ascending: false })
        .limit(20);

      if (filterBrand !== "all") backlogQuery = backlogQuery.eq("brand_id", filterBrand);
      if (filterFormat !== "all") backlogQuery = backlogQuery.eq("content_type", filterFormat);
      if (filterPlatform !== "all") backlogQuery = backlogQuery.eq("platform", filterPlatform);

      const { data: backlogData } = await backlogQuery;
      const backlogItems = (backlogData as unknown as CalendarContent[]) || [];
      setBacklog(backlogItems);

      void ensureCompositeThumbs([...scheduled, ...backlogItems]);
    } catch (error) {
      console.error("Error fetching calendar data:", error);
    } finally {
      setLoading(false);
    }
  }, [currentDate, viewMode, filterBrand, filterFormat, filterStatus, filterPlatform, ensureCompositeThumbs]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const navigateDate = (direction: "prev" | "next") => {
    if (viewMode === "week") {
      setCurrentDate(prev => direction === "prev" ? subWeeks(prev, 1) : addWeeks(prev, 1));
    } else {
      setCurrentDate(prev => direction === "prev" ? subMonths(prev, 1) : addMonths(prev, 1));
    }
  };

  const goToToday = () => setCurrentDate(new Date());

  const handleDragStart = (e: React.DragEvent, contentId: string) => {
    e.dataTransfer.setData("text/plain", contentId);
    e.dataTransfer.effectAllowed = "move";
    setDraggingId(contentId);
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setDragOverCell(null);
  };

  const handleDragOver = (e: React.DragEvent, cellKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverCell(cellKey);
  };

  const handleDragLeave = () => {
    setDragOverCell(null);
  };

  const handleDrop = async (e: React.DragEvent, day: Date, hour?: number) => {
    e.preventDefault();
    setDragOverCell(null);
    const contentId = e.dataTransfer.getData("text/plain");
    if (!contentId) return;

    const dropDate = hour !== undefined
      ? setMinutes(setHours(new Date(day), hour), 0)
      : setMinutes(setHours(new Date(day), 9), 0);

    try {
      const { error } = await supabase
        .from("generated_contents")
        .update({ scheduled_at: dropDate.toISOString(), status: "scheduled", publish_attempts: 0, publish_error: null })
        .eq("id", contentId);

      if (error) throw error;
      toast.success("Conteúdo agendado!", {
        description: format(dropDate, "dd/MM 'às' HH:mm", { locale: ptBR }),
      });
      fetchData();
    } catch (error) {
      console.error("Error scheduling:", error);
      toast.error("Erro ao agendar conteúdo");
    }
    setDraggingId(null);
  };

  const handleRemoveSchedule = async (id: string) => {
    try {
      await supabase
        .from("generated_contents")
        .update({ scheduled_at: null, status: "approved", publish_attempts: 0, publish_error: null })
        .eq("id", id);
      toast.success("Agendamento removido");
      setSelectedContent(null);
      fetchData();
    } catch (error) {
      toast.error("Erro ao remover agendamento");
    }
  };

  const handleReopen = async (id: string) => {
    try {
      await supabase
        .from("generated_contents")
        .update({ scheduled_at: null, status: "draft", publish_attempts: 0, publish_error: null })
        .eq("id", id);
      toast.success("Conteúdo reaberto para edição");
      setSelectedContent(null);
      fetchData();
    } catch (error) {
      toast.error("Erro ao reabrir conteúdo");
    }
  };

  const handlePublishNow = async (content: CalendarContent) => {
    setIsPublishing(true);
    setPublishingContent(content);
    try {
      toast.info("Renderizando imagens compostas...", { duration: 8000 });
      const compositeUrls = await renderAndUploadAllSlides(
        content.slides || [],
        content.content_type,
        content.id,
      );

      const platformName = content.platform === "linkedin" ? "LinkedIn" : "Instagram";

      toast.info(`Publicando no ${platformName}...`, { duration: 8000 });
      const { data, error } = await supabase.functions.invoke("publish-postforme", {
        body: { contentId: content.id, platforms: [content.platform || "instagram"] },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Publicado no ${platformName} com sucesso! 🎉`);
      setSelectedContent(null);
      fetchData();
    } catch (error) {
      console.error("Publish error:", error);
      toast.error("Erro ao publicar", {
        description: error instanceof Error ? error.message : "Tente novamente",
      });
    } finally {
      setIsPublishing(false);
      setPublishingContent(null);
    }
  };

  const days = viewMode === "week"
    ? eachDayOfInterval({
        start: startOfWeek(currentDate, { weekStartsOn: 1 }),
        end: endOfWeek(currentDate, { weekStartsOn: 1 }),
      })
    : eachDayOfInterval({
        start: startOfMonth(currentDate),
        end: endOfMonth(currentDate),
      });

  const toLocalDate = (isoString: string) => new Date(isoString);

  const getContentsForDay = (day: Date) =>
    contents.filter(c => {
      if (!c.scheduled_at) return false;
      return isSameDay(toLocalDate(c.scheduled_at), day);
    });

  const getContentsForDayHour = (day: Date, hour: number) =>
    contents.filter(c => {
      if (!c.scheduled_at) return false;
      const local = toLocalDate(c.scheduled_at);
      return isSameDay(local, day) && local.getHours() === hour;
    });

  const formatBadge = (type: string) => {
    switch (type) {
      case "carousel": return "Carrossel";
      case "story": return "Story";
      default: return "Post";
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "draft": return "bg-muted text-muted-foreground";
      case "approved": return "bg-success/15 text-success border-success/30";
      case "scheduled": return "bg-primary/15 text-primary border-primary/30";
      case "published": return "bg-accent/15 text-accent border-accent/30";
      default: return "bg-muted text-muted-foreground";
    }
  };

  // Current time indicator position
  const currentTimePosition = useMemo(() => {
    const now = new Date();
    const hour = now.getHours();
    const minutes = now.getMinutes();
    if (hour < 6 || hour > 23) return null;
    const top = (hour - 6) * HOUR_HEIGHT + (minutes / 60) * HOUR_HEIGHT;
    return top;
  }, [contents]); // re-calc on data refresh

  const MiniSlidePreview = ({ item }: { item: CalendarContent }) => {
    const slide = item.slides?.[0];
    const isStory = item.content_type === "story";
    const miniW = 48;
    const miniH = isStory ? Math.round(miniW * (1920 / 1080)) : Math.round(miniW * (1350 / 1080));

    // Priority: image_urls (composite final) > slide background > slide image
    const rawUrl =
      item.image_urls?.[0] ||
      slide?.background_image_url ||
      slide?.image_url ||
      slide?.imageUrl;

    if (!rawUrl) return null;

    // Add cache-busting based on updated_at to ensure fresh thumbnails after edits
    const cacheBuster = item.updated_at ? `?v=${new Date(item.updated_at).getTime()}` : "";
    const imageUrl = rawUrl.includes("?") ? rawUrl : `${rawUrl}${cacheBuster}`;

    return (
      <div className="rounded-md overflow-hidden flex-shrink-0" style={{ width: miniW, height: miniH }}>
        <img src={imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
      </div>
    );
  };

  const ContentCard = ({ item, isDraggable = true, compact = false }: { item: CalendarContent; isDraggable?: boolean; compact?: boolean }) => {
    const slide = item.slides?.[0];
    const isStory = item.content_type === "story";
    const rawUrl = item.image_urls?.[0] || slide?.background_image_url || slide?.image_url || slide?.imageUrl;
    const cacheBuster = item.updated_at ? `?v=${new Date(item.updated_at).getTime()}` : "";
    const imageUrl = rawUrl && !rawUrl.includes("?") ? `${rawUrl}${cacheBuster}` : rawUrl;

    if (compact) {
      // Week view: tiny image-only pill
      return (
        <div
          draggable={isDraggable}
          onDragStart={(e) => handleDragStart(e, item.id)}
          onDragEnd={handleDragEnd}
          onClick={() => {
            setPreviewSlideIndex(0);
            if (item.scheduled_at) {
              const d = new Date(item.scheduled_at);
              setRescheduleDate(d);
              setRescheduleHour(d.getHours().toString().padStart(2, "0"));
              setRescheduleMinute((Math.floor(d.getMinutes() / 15) * 15).toString().padStart(2, "0"));
            }
            setSelectedContent(item);
          }}
          className={`group cursor-pointer rounded overflow-hidden transition-all duration-150 hover:ring-2 hover:ring-primary/40 active:scale-95 ${
            draggingId === item.id ? "opacity-40 scale-90" : ""
          }`}
          title={`${item.title} • ${format(new Date(item.scheduled_at!), "HH:mm")}`}
          style={{ height: HOUR_HEIGHT - 12 }}
        >
          {imageUrl ? (
            <img src={imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div className="w-full h-full bg-muted flex items-center justify-center">
              <span className="text-[9px] text-muted-foreground truncate px-1">{item.title?.slice(0, 12)}</span>
            </div>
          )}
        </div>
      );
    }

    // Backlog / month view: image + minimal info
    return (
      <div
        draggable={isDraggable}
        onDragStart={(e) => handleDragStart(e, item.id)}
        onDragEnd={handleDragEnd}
        onClick={() => {
          setPreviewSlideIndex(0);
          if (item.scheduled_at) {
            const d = new Date(item.scheduled_at);
            setRescheduleDate(d);
            setRescheduleHour(d.getHours().toString().padStart(2, "0"));
            setRescheduleMinute((Math.floor(d.getMinutes() / 15) * 15).toString().padStart(2, "0"));
          } else {
            setRescheduleDate(undefined);
            setRescheduleHour("09");
            setRescheduleMinute("00");
          }
          setSelectedContent(item);
        }}
        className={`group cursor-pointer rounded-lg border p-1.5 transition-all duration-200 hover:shadow-md active:scale-[0.97] ${
          draggingId === item.id ? "opacity-40 scale-95" : ""
        } bg-card border-border/50 hover:border-primary/30`}
      >
        <div className="flex items-center gap-2">
          {isDraggable && (
            <GripVertical className="w-3.5 h-3.5 text-muted-foreground/40 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing" />
          )}
          {imageUrl ? (
            <div className="rounded overflow-hidden flex-shrink-0" style={{ width: 36, height: isStory ? 64 : 48 }}>
              <img src={imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
            </div>
          ) : <MiniSlidePreview item={item} />}
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-medium text-foreground truncate leading-tight">{item.title}</p>
            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
              <Badge variant="outline" className="text-[9px] px-1 py-0 leading-tight">{formatBadge(item.content_type)}</Badge>
              {item.templates && (
                <Badge variant="secondary" className="text-[9px] px-1 py-0 leading-tight truncate max-w-[100px]">{item.templates.name}</Badge>
              )}
              {item.scheduled_at && (
                <span className="text-[9px] text-muted-foreground">
                  {format(new Date(item.scheduled_at), "HH:mm")}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="p-4 lg:p-6 space-y-4 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-heading font-bold text-foreground flex items-center gap-2">
              <CalendarDays className="w-6 h-6 text-primary" />
              Calendário
              
            </h1>
            <p className="text-muted-foreground text-sm">
              Organize e agende seus conteúdos
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={goToToday} className="text-xs h-8">
              Hoje
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigateDate("prev")}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-medium min-w-[150px] text-center">
              {viewMode === "week"
                ? `${format(days[0], "dd MMM", { locale: ptBR })} — ${format(days[days.length - 1], "dd MMM", { locale: ptBR })}`
                : format(currentDate, "MMMM yyyy", { locale: ptBR })}
            </span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigateDate("next")}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Select value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
              <SelectTrigger className="w-[100px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="week">Semana</SelectItem>
                <SelectItem value="month">Mês</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Recurring schedules — same content posted on a weekly cadence */}
        {userId && <RecurringSchedules userId={userId} />}

        {/* Filters + Stats */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <Select value={filterBrand} onValueChange={setFilterBrand}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue placeholder="Marca" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as marcas</SelectItem>
                {brands.map(b => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterFormat} onValueChange={setFilterFormat}>
              <SelectTrigger className="w-[120px] h-8 text-xs">
                <SelectValue placeholder="Formato" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="carousel">Carrossel</SelectItem>
                <SelectItem value="post">Post</SelectItem>
                <SelectItem value="story">Story</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[120px] h-8 text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="draft">Rascunho</SelectItem>
                <SelectItem value="approved">Aprovado</SelectItem>
                <SelectItem value="scheduled">Agendado</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterPlatform} onValueChange={setFilterPlatform}>
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <SelectValue placeholder="Plataforma" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas plataformas</SelectItem>
                <SelectItem value="instagram">Instagram</SelectItem>
                <SelectItem value="linkedin">LinkedIn</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-1.5 rounded-md border border-primary/20 bg-primary/5 px-2.5 py-1.5">
              <CalendarClock className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs text-foreground">
                <span className="font-semibold">{todayScheduledCount}</span>{" "}
                <span className="text-muted-foreground">hoje</span>
              </span>
            </div>
            <div className="flex items-center gap-1.5 rounded-md border border-success/20 bg-success/5 px-2.5 py-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-success" />
              <span className="text-xs text-foreground">
                <span className="font-semibold">{weekPublishedCount}</span>{" "}
                <span className="text-muted-foreground">esta semana</span>
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
          {/* Backlog */}
          <Card className="shadow-card border-border/50 h-fit lg:sticky lg:top-4">
            <CardHeader className="p-3 pb-2">
              <CardTitle className="text-sm font-heading flex items-center justify-between">
                Backlog
                <Badge variant="secondary" className="text-[10px]">{backlog.length}</Badge>
              </CardTitle>
              <p className="text-[11px] text-muted-foreground">Arraste para o calendário</p>
            </CardHeader>
            <CardContent className="p-2 space-y-1.5 max-h-[60vh] overflow-y-auto">
              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : backlog.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  Nenhum conteúdo pendente
                </p>
              ) : (
                backlog.map(item => <ContentCard key={item.id} item={item} />)
              )}
            </CardContent>
          </Card>

          {/* Calendar Grid */}
          <Card className="shadow-card border-border/50 overflow-hidden">
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : viewMode === "week" ? (
                /* ====== WEEK VIEW with sticky headers ====== */
                <div className="relative">
                  {/* Sticky day header row - sits above the scrollable area */}
                  <div className="grid grid-cols-[56px_repeat(7,1fr)] min-w-[700px] border-b border-border bg-card">
                    <div className="p-2 bg-muted/60" />
                    {days.map(day => (
                      <div
                        key={day.toISOString()}
                        className={`border-l border-border p-2 text-center transition-colors ${
                          isToday(day) ? "bg-primary/8" : "bg-muted/60"
                        }`}
                      >
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                          {format(day, "EEE", { locale: ptBR })}
                        </p>
                        <p className={`text-sm font-bold ${isToday(day) ? "text-primary" : "text-foreground"}`}>
                          {format(day, "dd")}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Scrollable time grid */}
                  <div
                    ref={weekScrollRef}
                    className="overflow-auto"
                    style={{ maxHeight: "calc(100vh - 320px)" }}
                  >
                    <div className="grid grid-cols-[56px_repeat(7,1fr)] min-w-[700px] relative">
                      {/* Current time indicator */}
                      {currentTimePosition !== null && (
                        <div
                          className="absolute left-[56px] right-0 z-20 pointer-events-none flex items-center"
                          style={{ top: currentTimePosition }}
                        >
                          <div className="w-2.5 h-2.5 rounded-full bg-destructive -ml-[5px] shadow-sm" />
                          <div className="flex-1 h-[2px] bg-destructive/70" />
                        </div>
                      )}

                      {/* Time slots */}
                      {HOURS.map(hour => (
                        <>
                          {/* Sticky time label */}
                          <div
                            key={`h-${hour}`}
                            className="sticky left-0 z-10 bg-card border-b border-r border-border text-[11px] text-muted-foreground text-right pr-2 pt-1.5 font-medium"
                            style={{ height: HOUR_HEIGHT }}
                          >
                            {String(hour).padStart(2, "0")}:00
                          </div>
                          {days.map(day => {
                            const cellKey = `${day.toISOString()}-${hour}`;
                            const dayContents = getContentsForDayHour(day, hour);
                            const isOver = dragOverCell === cellKey;
                            return (
                              <div
                                key={cellKey}
                                className={`border-b border-l border-border p-1 transition-colors duration-150 ${
                                  isOver
                                    ? "bg-primary/15 ring-1 ring-inset ring-primary/30"
                                    : isToday(day)
                                    ? "bg-primary/[0.03]"
                                    : ""
                                }`}
                                style={{ height: HOUR_HEIGHT }}
                                onDragOver={(e) => handleDragOver(e, cellKey)}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, day, hour)}
                              >
                                {dayContents.map(c => (
                                  <ContentCard key={c.id} item={c} isDraggable compact />
                                ))}
                              </div>
                            );
                          })}
                        </>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                /* ====== MONTH VIEW ====== */
                <div className="grid grid-cols-7 min-w-[600px]">
                  {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map(d => (
                    <div key={d} className="p-2 text-center text-[11px] font-semibold text-muted-foreground border-b border-border bg-muted/50 uppercase tracking-wide">
                      {d}
                    </div>
                  ))}
                  {(() => {
                    const monthStart = startOfMonth(currentDate);
                    const dayOfWeek = (monthStart.getDay() + 6) % 7;
                    const pads = [];
                    for (let i = 0; i < dayOfWeek; i++) {
                      pads.push(
                        <div key={`pad-${i}`} className="border-b border-r border-border min-h-[100px] p-1 bg-muted/10" />
                      );
                    }
                    return pads;
                  })()}
                  {days.map(day => {
                    const dayContents = getContentsForDay(day);
                    const cellKey = `month-${day.toISOString()}`;
                    const isOver = dragOverCell === cellKey;
                    return (
                      <div
                        key={day.toISOString()}
                        className={`border-b border-r border-border min-h-[100px] p-1.5 transition-colors duration-150 ${
                          isToday(day) ? "bg-primary/5" : ""
                        } ${isOver ? "bg-primary/15 ring-1 ring-inset ring-primary/30" : ""}`}
                        onDragOver={(e) => handleDragOver(e, cellKey)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, day)}
                      >
                        <p className={`text-xs font-semibold mb-1 ${isToday(day) ? "text-primary" : "text-muted-foreground"}`}>
                          {format(day, "d")}
                        </p>
                        <div className="space-y-1">
                          {dayContents.slice(0, 3).map(c => (
                            <ContentCard key={c.id} item={c} isDraggable />
                          ))}
                          {dayContents.length > 3 && (
                            <p className="text-[10px] text-muted-foreground text-center">
                              +{dayContents.length - 3} mais
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Detail Sheet */}
      <Sheet open={!!selectedContent} onOpenChange={() => setSelectedContent(null)}>
        <SheetContent className="sm:max-w-md overflow-y-auto max-h-screen">
          {selectedContent && (
            <>
              <SheetHeader>
                <SheetTitle className="text-lg">{selectedContent.title}</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4 pb-8">
                {/* Slide Carousel */}
                {selectedContent.slides && selectedContent.slides.length > 0 && (() => {
                  const slides = selectedContent.slides;
                  const currentSlide = slides[previewSlideIndex];
                  const hasMultiple = slides.length > 1;
                  const isStory = selectedContent.content_type === "story";
                  const RENDER_W = 1080;
                  const RENDER_H = isStory ? 1920 : 1350;
                  const PREVIEW_W = 360;
                  const scale = PREVIEW_W / RENDER_W;
                  const PREVIEW_H = Math.round(RENDER_H * scale);

                  // Use final composite image_urls when available (these are the actual published images)
                  const compositeUrl = selectedContent.image_urls?.[previewSlideIndex];
                  // Fallback: slide-level image (Gemini-generated full image)
                  const slideImageUrl = currentSlide?.image_url || currentSlide?.imageUrl || currentSlide?.previewImage;

                  return (
                    <div className="relative">
                      <div
                        className="rounded-lg overflow-hidden mx-auto"
                        style={{ width: PREVIEW_W, height: PREVIEW_H }}
                      >
                        {compositeUrl || slideImageUrl ? (
                          // Show the actual final image directly
                          <img
                            src={compositeUrl || slideImageUrl}
                            alt={selectedContent.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          // Fallback: render via template system (for legacy content without images)
                          <div
                            style={{
                              width: RENDER_W,
                              height: RENDER_H,
                              transform: `scale(${scale})`,
                              transformOrigin: "top left",
                              pointerEvents: "none",
                            }}
                          >
                            {(() => {
                              const brandSnap = selectedContent.brand_snapshot;
                              const renderMode = getSlideRenderMode(currentSlide, brandSnap?.render_mode);
                              return renderMode === "ai_bg_overlay" && currentSlide?.background_image_url ? (
                                <SlideBgOverlayRenderer
                                  backgroundImageUrl={currentSlide.background_image_url}
                                  overlay={currentSlide.overlay || { headline: currentSlide.headline, body: currentSlide.body, bullets: currentSlide.bullets }}
                                  overlayStyle={currentSlide.overlay_style}
                                  overlayPositions={currentSlide.overlay_positions}
                                  dimensions={{ width: RENDER_W, height: RENDER_H }}
                                  role={currentSlide.role}
                                  slideIndex={previewSlideIndex}
                                  totalSlides={slides.length}
                                  brandSnapshot={brandSnap ? { palette: brandSnap.palette, fonts: brandSnap.fonts } : null}
                                />
                              ) : (
                                <SlideTemplateRenderer
                                  slide={currentSlide}
                                  slideIndex={previewSlideIndex}
                                  totalSlides={slides.length}
                                  brand={brandSnap ? {
                                    name: brandSnap.name || "",
                                    palette: brandSnap.palette || [],
                                    fonts: brandSnap.fonts || { headings: "Inter", body: "Inter" },
                                    visual_tone: brandSnap.visual_tone || "clean",
                                    logo_url: brandSnap.logo_url || null,
                                    layout_params: brandSnap.layout_params,
                                  } : undefined}
                                  template="parameterized"
                                  dimensions={{ width: RENDER_W, height: RENDER_H }}
                                />
                              );
                            })()}
                          </div>
                        )}
                      </div>
                      {hasMultiple && (
                        <>
                          <Button
                            variant="secondary"
                            size="icon"
                            className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-background/80 backdrop-blur hover:bg-background shadow-md"
                            disabled={previewSlideIndex === 0}
                            onClick={() => setPreviewSlideIndex(i => Math.max(0, i - 1))}
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="secondary"
                            size="icon"
                            className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-background/80 backdrop-blur hover:bg-background shadow-md"
                            disabled={previewSlideIndex === slides.length - 1}
                            onClick={() => setPreviewSlideIndex(i => Math.min(slides.length - 1, i + 1))}
                          >
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-background/80 backdrop-blur rounded-full px-2 py-0.5">
                            <span className="text-xs font-medium text-foreground">
                              {previewSlideIndex + 1} / {slides.length}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })()}

                {/* Info */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Status</span>
                    <Badge className={statusColor(selectedContent.status)}>
                      {selectedContent.status === "draft" ? "Rascunho" :
                       selectedContent.status === "approved" ? "Aprovado" :
                       selectedContent.status === "scheduled" ? "Agendado" : "Publicado"}
                    </Badge>
                  </div>
                   <div className="flex items-center justify-between">
                     <span className="text-sm text-muted-foreground">Plataforma</span>
                     <span className="text-sm font-medium flex items-center gap-1">
                       {selectedContent.platform === "linkedin" ? <Linkedin className="w-3.5 h-3.5" /> : <Instagram className="w-3.5 h-3.5" />}
                       {selectedContent.platform === "linkedin" ? "LinkedIn" : "Instagram"}
                     </span>
                   </div>
                   <div className="flex items-center justify-between">
                     <span className="text-sm text-muted-foreground">Formato</span>
                     <span className="text-sm font-medium">{formatBadge(selectedContent.content_type)}</span>
                   </div>
                  {selectedContent.brand_snapshot?.name && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Marca</span>
                      <span className="text-sm font-medium">{selectedContent.brand_snapshot.name}</span>
                    </div>
                  )}
                  {selectedContent.templates && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Template</span>
                      <Badge variant="secondary" className="text-xs">{selectedContent.templates.name}</Badge>
                    </div>
                  )}
                  {selectedContent.scheduled_at && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Agendado para</span>
                      <span className="text-sm font-medium flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {format(new Date(selectedContent.scheduled_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Slides</span>
                    <span className="text-sm font-medium">{selectedContent.slides?.length || 0}</span>
                  </div>
                </div>

                {selectedContent.caption && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Legenda</p>
                      <p className="text-sm text-foreground line-clamp-4">{selectedContent.caption}</p>
                    </div>
                  </>
                )}

                <Separator />

                {/* Reschedule */}
                <div className="space-y-3">
                  <Label className="flex items-center gap-1.5 text-sm font-medium">
                    <CalendarClock className="w-3.5 h-3.5" />
                    Reagendar
                  </Label>
                  <div className="flex items-center gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="flex-1 justify-start text-left font-normal text-xs">
                          <CalendarDays className="w-3.5 h-3.5 mr-1.5" />
                          {rescheduleDate
                            ? format(rescheduleDate, "dd/MM/yyyy", { locale: ptBR })
                            : "Selecionar data"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarPicker
                          mode="single"
                          selected={rescheduleDate}
                          onSelect={setRescheduleDate}
                          disabled={(date) => {
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            return date < today;
                          }}
                          locale={ptBR}
                          className="p-3 pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={rescheduleHour} onValueChange={setRescheduleHour}>
                      <SelectTrigger className="w-[80px] h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {rescheduleHours.map(h => (
                          <SelectItem key={h} value={h}>{h}h</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-muted-foreground text-sm">:</span>
                    <Select value={rescheduleMinute} onValueChange={setRescheduleMinute}>
                      <SelectTrigger className="w-[80px] h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {rescheduleMinutes.map(m => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      className="ml-auto gap-1.5"
                      disabled={!rescheduleDate || isRescheduling}
                      onClick={handleReschedule}
                    >
                      {isRescheduling ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CalendarClock className="w-3.5 h-3.5" />
                      )}
                      Reagendar
                    </Button>
                  </div>
                </div>

                <Separator />

                {/* Actions */}
                <div className="space-y-2">
                  <Button
                    className="w-full gap-2"
                    onClick={() => navigate(`/content/${selectedContent.id}`)}
                  >
                    <ExternalLink className="w-4 h-4" />
                    Abrir Editor
                  </Button>
                  {(selectedContent.status === "approved" || selectedContent.status === "scheduled") && selectedContent.slides?.length > 0 && (() => {
                    const isLI = selectedContent.platform === "linkedin";
                    return (
                      <Button
                        className={`w-full gap-2 text-white ${
                          isLI
                            ? "bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
                            : "bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700"
                        }`}
                        onClick={() => handlePublishNow(selectedContent)}
                        disabled={isPublishing}
                      >
                        {isPublishing ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : isLI ? (
                          <Linkedin className="w-4 h-4" />
                        ) : (
                          <Instagram className="w-4 h-4" />
                        )}
                        {isPublishing ? "Publicando..." : `Publicar Agora no ${isLI ? "LinkedIn" : "Instagram"}`}
                      </Button>
                    );
                  })()}
                  {(selectedContent.status === "approved" || selectedContent.status === "scheduled") && (
                    <Button
                      variant="outline"
                      className="w-full gap-2"
                      onClick={() => navigate(`/download/${selectedContent.id}`)}
                    >
                      <Download className="w-4 h-4" />
                      Baixar ZIP
                    </Button>
                  )}
                  {selectedContent.status === "scheduled" && (
                    <Button
                      variant="outline"
                      className="w-full gap-2"
                      onClick={() => handleRemoveSchedule(selectedContent.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                      Remover Agendamento
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    className="w-full gap-2 text-muted-foreground"
                    onClick={() => handleReopen(selectedContent.id)}
                  >
                    <RotateCcw className="w-4 h-4" />
                    Reabrir para Edição
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Off-screen renderer for PNG capture before publishing */}
      <OffScreenSlideRenderer
        captureIndex={captureIndex}
        captureRef={captureRef}
        slides={publishingContent?.slides || []}
        brandSnapshot={publishingContent?.brand_snapshot}
        contentType={publishingContent?.content_type || "carousel"}
      />
    </DashboardLayout>
  );
};

export default Calendar;
