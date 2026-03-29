import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";
import TrendCard from "@/components/dashboard/TrendCard";
import TrendFilters, { FilterState } from "@/components/dashboard/TrendFilters";
import StatsCards from "@/components/dashboard/StatsCards";
import AnalyticsChart from "@/components/dashboard/AnalyticsChart";
import GenerateContentModal from "@/components/dashboard/GenerateContentModal";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Search, RefreshCw, Loader2, Sparkles, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ENABLE_BG_OVERLAY } from "@/lib/featureFlags";
import { useBackgroundGeneration } from "@/contexts/BackgroundGenerationContext";

interface DbTrend {
  id: string;
  title: string;
  description: string | null;
  source: string;
  source_url: string | null;
  theme: string;
  relevance_score: number | null;
  keywords: string[] | null;
  created_at: string;
  full_content: string | null;
}

interface TrendCardData {
  id: string;
  title: string;
  summary: string;
  source: string;
  sourceUrl: string;
  theme: string;
  publishedAt: string;
  score: number;
  keywords: string[];
  description: string;
  fullContent: string;
}

const Dashboard = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<FilterState>({
    sources: [],
    themes: [],
    dateRange: "all",
  });
  const [selectedTrend, setSelectedTrend] = useState<TrendCardData | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const { startImageGeneration } = useBackgroundGeneration();
  const [trends, setTrends] = useState<TrendCardData[]>([]);
  const [savedTrendIds, setSavedTrendIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  const [contentStats, setContentStats] = useState<{ created_at: string; status: string }[]>([]);

  const fetchTrends = async () => {
    try {
      // RLS already filters: user sees own trends (user_id = auth.uid()) + global (user_id IS NULL)
      const { data, error } = await supabase
        .from("trends")
        .select("*")
        .order("relevance_score", { ascending: false })
        .limit(50);

      if (error) throw error;

      const mappedTrends: TrendCardData[] = (data as DbTrend[]).map((trend) => ({
        id: trend.id,
        title: trend.title,
        summary: trend.description || "",
        source: trend.source,
        sourceUrl: trend.source_url || "",
        theme: trend.theme,
        publishedAt: trend.created_at,
        score: (trend.relevance_score || 50) / 10,
        keywords: trend.keywords || [],
        description: trend.description || "",
        fullContent: trend.full_content || "",
      }));

      setTrends(mappedTrends);
    } catch (error) {
      console.error("Error fetching trends:", error);
      toast.error("Erro ao carregar tendências");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const fetchSavedTrends = async () => {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) return;

      const { data, error } = await supabase
        .from("saved_trends")
        .select("trend_id")
        .eq("user_id", session.session.user.id);

      if (error) throw error;

      setSavedTrendIds(new Set(data.map(item => item.trend_id)));
    } catch (error) {
      console.error("Error fetching saved trends:", error);
    }
  };

  const fetchContentStats = async () => {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) return;

      const { data, error } = await supabase
        .from("generated_contents")
        .select("created_at, status")
        .eq("user_id", session.session.user.id)
        .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

      if (error) throw error;
      setContentStats(data || []);
    } catch (error) {
      console.error("Error fetching content stats:", error);
    }
  };

  useEffect(() => {
    fetchTrends();
    fetchSavedTrends();
    fetchContentStats();
  }, []);

  const handleToggleSave = async (trendId: string) => {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        toast.error("Faça login para salvar tendências");
        return;
      }

      const isSaved = savedTrendIds.has(trendId);

      if (isSaved) {
        const { error } = await supabase
          .from("saved_trends")
          .delete()
          .eq("trend_id", trendId)
          .eq("user_id", session.session.user.id);

        if (error) throw error;

        setSavedTrendIds(prev => {
          const next = new Set(prev);
          next.delete(trendId);
          return next;
        });
        toast.success("Tendência removida dos favoritos");
      } else {
        const { error } = await supabase
          .from("saved_trends")
          .insert({
            trend_id: trendId,
            user_id: session.session.user.id,
          });

        if (error) throw error;

        setSavedTrendIds(prev => new Set(prev).add(trendId));
        toast.success("Tendência salva nos favoritos!");
      }
    } catch (error) {
      console.error("Error toggling save:", error);
      toast.error("Erro ao salvar tendência");
    }
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchTrends();
    toast.success("Tendências atualizadas!");
  };

  const handleScrapeTrends = async () => {
    setIsScraping(true);
    toast.info("Buscando novas tendências...", {
      description: "Isso pode levar alguns segundos.",
    });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Autenticação necessária");
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scrape-trends`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erro ao buscar tendências");
      }

      toast.success(`${data.inserted} novas tendências encontradas!`, {
        description: `Total analisado: ${data.found} fontes.`,
      });

      // Refresh the trends list
      fetchTrends();
    } catch (error) {
      console.error("Scraping error:", error);
      toast.error("Erro ao buscar tendências", {
        description: error instanceof Error ? error.message : "Tente novamente.",
      });
    } finally {
      setIsScraping(false);
    }
  };

  // Filter trends based on search and filters
  const filteredTrends = trends.filter((trend) => {
    // Saved only filter
    if (showSavedOnly && !savedTrendIds.has(trend.id)) {
      return false;
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (
        !trend.title.toLowerCase().includes(query) &&
        !trend.summary.toLowerCase().includes(query)
      ) {
        return false;
      }
    }

    // Source filter
    if (filters.sources.length > 0 && !filters.sources.includes(trend.source)) {
      return false;
    }

    // Theme filter
    if (filters.themes.length > 0 && !filters.themes.includes(trend.theme)) {
      return false;
    }

    // Date range filter
    if (filters.dateRange !== "all") {
      const trendDate = new Date(trend.publishedAt);
      const now = new Date();
      const diffHours = (now.getTime() - trendDate.getTime()) / (1000 * 60 * 60);

      switch (filters.dateRange) {
        case "24h":
          if (diffHours > 24) return false;
          break;
        case "7d":
          if (diffHours > 24 * 7) return false;
          break;
        case "30d":
          if (diffHours > 24 * 30) return false;
          break;
      }
    }

    return true;
  });

  const handleGenerateContent = (trend: TrendCardData) => {
    setSelectedTrend(trend);
    setIsModalOpen(true);
  };

  const handleViewDetails = (trend: TrendCardData) => {
    if (trend.sourceUrl) {
      window.open(trend.sourceUrl, "_blank");
    }
  };

  const handleGenerate = async (trendId: string, format: string, contentStyle: string, brandId: string | null, visualMode: string, templateSetId: string | null = null, slideCount: number | null = null, includeCta: boolean = true, styleGalleryId?: string | null, backgroundTemplateId?: string | null, platform?: string) => {
    if (!selectedTrend) return;
    
    setIsGenerating(true);
    
    try {
      const { data, error } = await supabase.functions.invoke("generate-content", {
        body: {
          trend: {
            title: selectedTrend.title,
            description: selectedTrend.description,
            theme: selectedTrend.theme,
            keywords: selectedTrend.keywords,
            fullContent: selectedTrend.fullContent,
          },
          contentType: format,
          contentStyle: contentStyle,
          brandId: brandId,
          visualMode: visualMode,
          templateSetId: templateSetId,
          slideCount: slideCount,
          includeCta: includeCta,
          platform: platform || "instagram",
        },
      });

      if (error) throw error;

      console.log("[Dashboard] generate-content response:", JSON.stringify({
        success: data.success,
        brandId: data.content?.brandId,
        visualMode: data.content?.visualMode,
        snapshotPaletteSize: data.content?.brandSnapshot?.palette?.length ?? 0,
        slideCount: data.content?.slides?.length,
        sourceSummaryLen: data.content?.sourceSummary?.length ?? 0,
        keyInsightsCount: data.content?.keyInsights?.length ?? 0,
      }));

      if (!data.success) {
        throw new Error(data.error || "Erro ao gerar conteúdo");
      }

      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        throw new Error("Usuário não autenticado");
      }

      const insertPayload: Record<string, unknown> = {
        user_id: session.session.user.id,
        trend_id: trendId,
        content_type: format,
        platform: platform || "instagram",
        title: data.content.title,
        caption: data.content.caption,
        hashtags: data.content.hashtags,
        slides: data.content.slides,
        status: "draft",
        brand_id: data.content.brandId || null,
        brand_snapshot: data.content.brandSnapshot || null,
        visual_mode: data.content.visualMode || "free",
        source_summary: data.content.sourceSummary || null,
        key_insights: data.content.keyInsights || null,
        template_set_id: data.content.templateSetId || null,
        slide_count: data.content.slideCount || null,
        include_cta: data.content.includeCta ?? true,
        generation_metadata: data.content.generationMetadata || null,
      };

      console.log("[Dashboard] Inserting:", { brand_id: insertPayload.brand_id, visual_mode: insertPayload.visual_mode, palette: (insertPayload.brand_snapshot as any)?.palette?.length ?? 0 });

      const { data: savedContent, error: saveError } = await supabase
        .from("generated_contents")
        .insert(insertPayload as any)
        .select()
        .single();

      if (saveError) throw saveError;

      // ══════ STEP 2: Generate slide images in background ══════
      if (backgroundTemplateId && brandId) {
        // Use saved background template — no AI generation needed
        try {
          const { data: bgTemplate } = await supabase
            .from("brand_background_templates")
            .select("background_images, slide_count")
            .eq("id", backgroundTemplateId)
            .single();

          if (bgTemplate) {
            const bgImages = (bgTemplate as any).background_images as { index: number; url: string | null; role?: string }[];
            const updatedSlides = data.content.slides.map((slide: any, i: number) => {
              // Cyclic repetition for mismatched slide counts
              const bgIdx = i % bgImages.length;
              const bgUrl = bgImages[bgIdx]?.url;
              if (!bgUrl) return slide;
              return {
                ...slide,
                background_image_url: bgUrl,
                image_url: bgUrl,
                previewImage: bgUrl,
                render_mode: "ai_bg_overlay",
                image_stale: false,
              };
            });

            await supabase.from("generated_contents")
              .update({ slides: JSON.parse(JSON.stringify(updatedSlides)) })
              .eq("id", savedContent.id);

            toast.success("Background salvo aplicado!", {
              description: "Os backgrounds foram aplicados sem usar IA.",
            });
          }
        } catch (err) {
          console.error("Error applying bg template:", err);
          toast.error("Erro ao aplicar background salvo");
        }
      } else if (brandId && data.content.slides?.length > 0) {
        startImageGeneration({
          contentDbId: savedContent.id,
          title: data.content.title || selectedTrend.title,
          slides: data.content.slides,
          brandId,
          format,
          templateSetId: templateSetId || null,
          sourceUrl: selectedTrend?.sourceUrl || undefined,
          fullContent: selectedTrend?.fullContent || "",
          renderMode: ENABLE_BG_OVERLAY ? "AI_BG_OVERLAY" : undefined,
        });
        toast.success("Texto salvo! Imagens sendo geradas em segundo plano.", {
          description: "Você pode continuar navegando normalmente.",
        });
      } else {
        toast.success("Conteúdo gerado com sucesso!");
      }

      // Navigate to content preview
      navigate(`/content/${savedContent.id}`);
    } catch (error) {
      console.error("Error generating content:", error);
      toast.error("Erro ao gerar conteúdo", {
        description: error instanceof Error ? error.message : "Tente novamente mais tarde",
      });
    } finally {
      setIsGenerating(false);
      setIsModalOpen(false);
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-heading font-bold text-foreground">
              Dashboard de Tendências
            </h1>
            <p className="text-muted-foreground mt-1">
              Monitore as principais notícias e gere conteúdo para suas redes sociais
            </p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="default" 
              className="gap-2"
              onClick={handleScrapeTrends}
              disabled={isScraping}
              data-onboarding="scrape-button"
            >
              {isScraping ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              Buscar Novas Tendências
            </Button>
            <Button 
              variant="outline" 
              className="gap-2"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
        </div>

        {/* Stats */}
        <StatsCards trendsCount={trends.length} />

        {/* Analytics Chart */}
        <AnalyticsChart contents={contentStats} />

        {/* Search & Filters */}
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar tendências..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button
            variant={showSavedOnly ? "default" : "outline"}
            className={cn("gap-2", showSavedOnly && "bg-rose-500 hover:bg-rose-600")}
            onClick={() => setShowSavedOnly(!showSavedOnly)}
          >
            <Heart className={cn("w-4 h-4", showSavedOnly && "fill-current")} />
            Favoritos
            {savedTrendIds.size > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                {savedTrendIds.size}
              </Badge>
            )}
          </Button>
          <TrendFilters 
            filters={filters} 
            onFilterChange={setFilters}
            trends={trends}
          />
        </div>

        {/* Results Count */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Mostrando <span className="font-medium text-foreground">{filteredTrends.length}</span> tendências
            {showSavedOnly && " favoritas"}
          </p>
        </div>

        {/* Trends Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" data-onboarding="trends-grid">
          {filteredTrends.map((trend, index) => (
            <div key={trend.id} data-onboarding={index === 0 ? "trend-card" : undefined}>
              <TrendCard
                trend={trend}
                onGenerateContent={handleGenerateContent}
                onViewDetails={handleViewDetails}
                isSaved={savedTrendIds.has(trend.id)}
                onToggleSave={handleToggleSave}
              />
            </div>
          ))}
        </div>

        {/* Empty State */}
        {filteredTrends.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              Nenhuma tendência encontrada com os filtros aplicados.
            </p>
          </div>
        )}

        {/* Generate Content Modal */}
        <GenerateContentModal
          trend={selectedTrend}
          open={isModalOpen}
          onOpenChange={setIsModalOpen}
          onGenerate={handleGenerate}
          isGenerating={isGenerating}
        />
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;