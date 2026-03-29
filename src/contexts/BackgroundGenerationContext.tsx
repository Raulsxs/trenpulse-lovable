import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ENABLE_BG_OVERLAY } from "@/lib/featureFlags";
import { useNavigate } from "react-router-dom";

interface GenerationJob {
  id: string;
  contentDbId: string;
  title: string;
  slides: any[];
  brandId: string;
  format: string;
  templateSetId?: string | null;
  categoryId?: string | null;
  sourceUrl?: string;
  fullContent?: string;
  briefingImages?: string[];
  renderMode?: string;
  completedCount: number;
  totalCount: number;
  status: "running" | "done" | "error";
}

interface BackgroundGenerationContextType {
  activeJobs: GenerationJob[];
  startImageGeneration: (params: Omit<GenerationJob, "id" | "completedCount" | "totalCount" | "status">) => void;
  hasActiveJobs: boolean;
}

const BackgroundGenerationContext = createContext<BackgroundGenerationContextType>({
  activeJobs: [],
  startImageGeneration: () => {},
  hasActiveJobs: false,
});

export const useBackgroundGeneration = () => useContext(BackgroundGenerationContext);

export function BackgroundGenerationProvider({ children }: { children: React.ReactNode }) {
  const [activeJobs, setActiveJobs] = useState<GenerationJob[]>([]);
  const jobsRef = useRef<GenerationJob[]>([]);

  const updateJob = useCallback((jobId: string, update: Partial<GenerationJob>) => {
    setActiveJobs(prev => {
      const next = prev.map(j => j.id === jobId ? { ...j, ...update } : j);
      jobsRef.current = next;
      return next;
    });
  }, []);

  const removeJob = useCallback((jobId: string) => {
    setActiveJobs(prev => {
      const next = prev.filter(j => j.id !== jobId);
      jobsRef.current = next;
      return next;
    });
  }, []);

  const startImageGeneration = useCallback((params: Omit<GenerationJob, "id" | "completedCount" | "totalCount" | "status">) => {
    const jobId = `job-${Date.now()}`;
    const isOverlayMode = ENABLE_BG_OVERLAY || params.renderMode === "AI_BG_OVERLAY";
    const label = isOverlayMode ? "backgrounds" : "imagens";

    const job: GenerationJob = {
      ...params,
      id: jobId,
      completedCount: 0,
      totalCount: params.slides.length,
      status: "running",
    };

    setActiveJobs(prev => {
      const next = [...prev, job];
      jobsRef.current = next;
      return next;
    });

    // Show persistent toast immediately so user knows generation started
    toast.info(`⏳ Gerando ${label} em segundo plano...`, {
      description: `"${params.title}" — você pode continuar navegando.`,
      duration: 8000,
      id: `bg-gen-${jobId}`,
    });

    // Run in background (not awaited)
    (async () => {
      const contentId = `bg-${params.contentDbId}`;
      const slidesData = [...params.slides];
      const batchSize = 2;
      let completed = 0;

      try {
        for (let batch = 0; batch < slidesData.length; batch += batchSize) {
          const batchSlides = slidesData.slice(batch, batch + batchSize);
          const batchPromises = batchSlides.map((s, batchIdx) => {
            const i = batch + batchIdx;
            return supabase.functions.invoke("generate-slide-images", {
              body: {
                brandId: params.brandId,
                slide: s,
                slideIndex: i,
                totalSlides: slidesData.length,
                contentFormat: params.format,
                articleUrl: params.sourceUrl || undefined,
                articleContent: params.fullContent || "",
                contentId,
                templateSetId: params.templateSetId || undefined,
                categoryId: params.categoryId || undefined,
                briefingImages: params.briefingImages || undefined,
                backgroundOnly: isOverlayMode,
              },
            }).then(result => {
              if (result.error) {
                console.warn(`[BgGen] Slide ${i} error:`, result.error);
              } else if (result.data?.imageUrl || result.data?.bgImageUrl) {
                const url = result.data.bgImageUrl || result.data.imageUrl;
                if (isOverlayMode) {
                  slidesData[i] = {
                    ...slidesData[i],
                    background_image_url: url,
                    image_url: url,
                    previewImage: url,
                    render_mode: "ai_bg_overlay",
                    overlay: {
                      headline: slidesData[i].headline || "",
                      body: slidesData[i].body || "",
                      bullets: slidesData[i].bullets || [],
                    },
                    image_stale: false,
                  };
                } else {
                  slidesData[i] = {
                    ...slidesData[i],
                    image_url: url,
                    previewImage: url,
                    image_stale: false,
                  };
                }
              } else {
                console.warn(`[BgGen] Slide ${i}: no image returned`, result.data);
              }
              completed++;
              updateJob(jobId, { completedCount: completed });
              return result;
            });
          });

          await Promise.allSettled(batchPromises);
          if (batch + batchSize < slidesData.length) {
            await new Promise(r => setTimeout(r, 1500));
          }
        }

        // Persist slides with images to DB
        await supabase.from("generated_contents")
          .update({ slides: JSON.parse(JSON.stringify(slidesData)) })
          .eq("id", params.contentDbId);

        const imgCount = slidesData.filter((s: any) => s.image_url || s.previewImage || s.background_image_url).length;

        updateJob(jobId, { status: "done", completedCount: slidesData.length });

        if (imgCount === 0) {
          toast.error(`⚠️ "${params.title}" — nenhum ${label} foi gerado.`, {
            description: "A IA não retornou imagens. Tente regenerar manualmente.",
            duration: 10000,
          });
        } else {
          toast.success(`✅ "${params.title}" — ${imgCount} ${label} gerados!`, {
            description: "Clique para visualizar o conteúdo.",
            duration: 10000,
            action: {
              label: "Ver conteúdo",
              onClick: () => {
                window.location.href = `/content/${params.contentDbId}`;
              },
            },
          });
        }
      } catch (err: any) {
        console.error("Background image generation error:", err);
        updateJob(jobId, { status: "error" });
        toast.error(`Erro ao gerar imagens de "${params.title}"`, {
          description: err.message || "Tente novamente.",
          duration: 8000,
        });
      } finally {
        // Remove job after a delay
        setTimeout(() => removeJob(jobId), 15000);
      }
    })();
  }, [updateJob, removeJob]);

  return (
    <BackgroundGenerationContext.Provider value={{
      activeJobs,
      startImageGeneration,
      hasActiveJobs: activeJobs.some(j => j.status === "running"),
    }}>
      {children}
      {/* Floating progress indicator */}
      {activeJobs.filter(j => j.status === "running").length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
          {activeJobs.filter(j => j.status === "running").map(job => (
            <div
              key={job.id}
              className="bg-card border border-border rounded-lg shadow-lg p-3 min-w-[280px] animate-fade-in"
            >
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <div className="w-3 h-3 rounded-full bg-primary animate-pulse" />
                Gerando imagens...
              </div>
              <p className="text-xs text-muted-foreground mt-1 truncate max-w-[260px]">
                {job.title}
              </p>
              <div className="mt-2 w-full bg-muted rounded-full h-1.5">
                <div
                  className="bg-primary h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${Math.round((job.completedCount / job.totalCount) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {job.completedCount}/{job.totalCount} slides
              </p>
            </div>
          ))}
        </div>
      )}
    </BackgroundGenerationContext.Provider>
  );
}
