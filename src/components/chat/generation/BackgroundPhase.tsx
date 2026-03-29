import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, RefreshCw, ChevronRight, Check } from "lucide-react";
import type { SlideData } from "@/hooks/useGenerationFlow";
import { cn } from "@/lib/utils";

interface BackgroundPhaseProps {
  slides: SlideData[];
  isLoading: boolean;
  loadingMessage: string | null;
  onSelectBackground: (slideId: string, url: string) => void;
  onAllApproved: () => void;
  onRegenerateSlide: (slideId: string) => void;
  onCancel: () => void;
}

const LOADING_MESSAGES = [
  "Criando o brief visual... 🔍",       // 0-15s
  "Gerando prompts de imagem... ✍️",    // 15-30s
  "Gerando a imagem... 🎨",             // 30-90s
  "Finalizando... ✨",                   // 90s+
];

export default function BackgroundPhase({
  slides,
  isLoading,
  loadingMessage,
  onSelectBackground,
  onAllApproved,
  onRegenerateSlide,
  onCancel,
}: BackgroundPhaseProps) {
  const [currentSlideIdx, setCurrentSlideIdx] = useState(0);
  const [loadingPhase, setLoadingPhase] = useState(0);

  useEffect(() => {
    if (!isLoading) return;
    const interval = setInterval(() => {
      setLoadingPhase((p) => Math.min(p + 1, LOADING_MESSAGES.length - 1));
    }, 15000);
    return () => clearInterval(interval);
  }, [isLoading]);

  useEffect(() => {
    if (slides.length > 0 && slides.every((s) => s.selectedBackground)) {
      onAllApproved();
    }
  }, [slides, onAllApproved]);

  if (isLoading || slides.length === 0) {
    return (
      <div className="bg-muted/50 border border-border rounded-xl p-4 my-2 animate-in fade-in slide-in-from-bottom-2">
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          <p className="text-sm text-foreground">
            {loadingMessage || LOADING_MESSAGES[loadingPhase]}
          </p>
        </div>
        <Skeleton className="w-full aspect-square rounded-lg mt-3" />
      </div>
    );
  }

  const currentSlide = slides[currentSlideIdx];
  if (!currentSlide) return null;

  const bgUrl = currentSlide.backgroundOptions[0];
  const isApproved = !!currentSlide.selectedBackground;

  return (
    <div className="bg-muted/50 border border-border rounded-xl p-4 my-2 animate-in fade-in slide-in-from-bottom-2">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-foreground">
          {slides.length > 1
            ? `Slide ${currentSlideIdx + 1} de ${slides.length}`
            : "Fundo gerado"}
        </p>
        {slides.length > 1 && (
          <div className="flex gap-1">
            {slides.map((s, idx) => (
              <div
                key={s.id}
                className={cn(
                  "w-6 h-6 rounded-full text-[10px] flex items-center justify-center font-medium cursor-pointer transition-colors",
                  idx === currentSlideIdx
                    ? "bg-primary text-primary-foreground"
                    : s.selectedBackground
                      ? "bg-primary/20 text-primary"
                      : "bg-muted-foreground/20 text-muted-foreground"
                )}
                onClick={() => setCurrentSlideIdx(idx)}
              >
                {s.selectedBackground ? <Check className="w-3 h-3" /> : idx + 1}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {bgUrl ? (
          <div
            className={cn(
              "relative aspect-square rounded-lg overflow-hidden border-2 transition-all",
              isApproved ? "border-primary ring-2 ring-primary/30" : "border-border"
            )}
          >
            <img
              src={bgUrl}
              alt="Fundo gerado"
              className="w-full h-full object-cover"
              onError={(e) => {
                console.error("[BackgroundPhase] Image failed to load:", bgUrl);
                e.currentTarget.style.display = "none";
              }}
            />
            {isApproved && (
              <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                <Check className="w-3.5 h-3.5 text-primary-foreground" />
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Gerando...</span>
          </div>
        )}

        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 text-xs"
            onClick={() => onRegenerateSlide(currentSlide.id)}
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Gerar outro
          </Button>
          {!isApproved && bgUrl && (
            <Button
              size="sm"
              className="flex-1 text-xs"
              onClick={() => onSelectBackground(currentSlide.id, bgUrl)}
            >
              <Check className="w-3.5 h-3.5 mr-1.5" />
              Usar este fundo
            </Button>
          )}
          {isApproved && currentSlideIdx < slides.length - 1 && (
            <Button
              size="sm"
              variant="outline"
              className="flex-1 text-xs"
              onClick={() => setCurrentSlideIdx((p) => Math.min(p + 1, slides.length - 1))}
            >
              Próximo slide
              <ChevronRight className="w-3 h-3 ml-1" />
            </Button>
          )}
        </div>

        <div className="flex justify-end">
          <Button size="sm" variant="ghost" className="text-xs text-muted-foreground" onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}
