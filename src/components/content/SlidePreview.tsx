import { cn } from "@/lib/utils";
import { TemplateConfig } from "@/lib/templates";
import { ChevronLeft, ChevronRight, ImageIcon, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Slide {
  headline: string;
  body: string;
  imagePrompt?: string;
  illustrationPrompt?: string;
  previewImage?: string;
  imageUrl?: string;
  image_url?: string;
  image?: string;
  templateHint?: string;
  template?: string;
  role?: string;
  bullets?: string[];
  speakerNotes?: string;
}

interface SlidePreviewProps {
  slides: Slide[];
  currentSlide: number;
  setCurrentSlide: (index: number) => void;
  template: TemplateConfig;
  generatingImage?: boolean;
}

const SlidePreview = ({
  slides,
  currentSlide,
  setCurrentSlide,
  template,
  generatingImage,
}: SlidePreviewProps) => {
  const slide = slides[currentSlide];
  const imageSrc = slide?.image_url || slide?.previewImage || slide?.imageUrl || slide?.image_url || slide?.image;
  const hasImage = !!imageSrc;
  const isFirst = currentSlide === 0;
  const isLast = currentSlide === slides.length - 1;

  return (
    <div className="flex justify-center">
      <div className="relative w-[320px]">
        {/* Phone Frame - More realistic */}
        <div className="bg-gradient-to-b from-zinc-700 via-zinc-800 to-zinc-900 rounded-[3rem] p-[3px] shadow-2xl shadow-black/50">
          <div className="bg-gradient-to-b from-zinc-800 to-zinc-900 rounded-[2.8rem] p-2">
            {/* Notch area */}
            <div className="relative">
              <div className="absolute top-1 left-1/2 -translate-x-1/2 w-20 h-5 bg-black rounded-full z-20 flex items-center justify-center gap-2">
                <div className="w-2 h-2 rounded-full bg-zinc-800" />
                <div className="w-8 h-2 rounded-full bg-zinc-800" />
              </div>
            </div>
            
            <div className={cn(
              "bg-black rounded-[2.3rem] overflow-hidden aspect-[9/16] relative",
              template.hasFrame && template.frameStyle
            )}>
              {/* Background Layer */}
              <div className="absolute inset-0">
                {hasImage ? (
                  <img 
                    src={imageSrc} 
                    alt="Preview" 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  // Placeholder gradient when no image
                  <div className="w-full h-full bg-gradient-to-br from-gray-600 via-gray-700 to-gray-800">
                    <div 
                      className="w-full h-full opacity-30"
                      style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23fff' fill-opacity='0.1'%3E%3Cpath d='M20 20h20v20H20V20zm0-20h20v20H20V0zM0 20h20v20H0V20zM0 0h20v20H0V0z'/%3E%3C/g%3E%3C/svg%3E")`,
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Overlay - only when no image */}
              {!hasImage && <div className={cn("absolute inset-0", template.overlayStyle)} />}

              {/* Content Layer */}
              <div className="relative z-10 w-full h-full flex flex-col p-5">
                {/* Top bar */}
                <div className="flex items-center justify-between mb-auto">
                  <div className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium text-white",
                    template.badgeStyle
                  )}>
                    {isFirst ? "CAPA" : isLast ? "CTA" : `${currentSlide + 1}/${slides.length}`}
                  </div>
                  
                  {!hasImage && !generatingImage && (
                    <div className={cn(
                      "px-3 py-1.5 rounded-full text-xs text-white/60 flex items-center gap-1.5",
                      template.badgeStyle
                    )}>
                      <ImageIcon className="w-3 h-3" />
                      Sem preview
                    </div>
                  )}
                </div>

                {/* Loading indicator */}
                {generatingImage && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-20">
                    <div className="flex flex-col items-center gap-3 text-white">
                      <div className="relative">
                        <Loader2 className="w-10 h-10 animate-spin text-white/80" />
                        <div className={cn("absolute inset-0 w-10 h-10 rounded-full blur-xl", template.accentBg, "opacity-50")} />
                      </div>
                      <span className="text-sm font-medium">Gerando imagem...</span>
                    </div>
                  </div>
                )}

                {/* Main content - bottom aligned */}
                <div className="mt-auto space-y-4">
                  {/* Accent line */}
                  <div className={cn("w-12 h-1 rounded-full", template.accentBg)} />
                  
                  {/* Headline */}
                  <h3 className={cn(
                    "text-white drop-shadow-2xl",
                    template.headlineStyle
                  )}>
                    {slide?.headline}
                  </h3>
                  
                  {/* Body */}
                  <p className={cn(
                    "text-white/85 drop-shadow-lg",
                    template.bodyStyle
                  )}>
                    {slide?.body}
                  </p>

                  {/* CTA Button for last slide */}
                  {isLast && (
                    <button className={cn(
                      "mt-4 w-full py-3 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2 shadow-lg",
                      template.accentBg
                    )}>
                      <Play className="w-4 h-4" />
                      Saiba Mais
                    </button>
                  )}
                </div>

                {/* Instagram-like dots at bottom */}
                <div className="flex justify-center gap-1.5 mt-4 pt-3 border-t border-white/10">
                  {slides.map((_, index) => (
                    <div
                      key={index}
                      className={cn(
                        "h-1 rounded-full transition-all duration-300",
                        currentSlide === index
                          ? cn("w-6", template.accentBg)
                          : "w-1 bg-white/30"
                      )}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation - Outside phone */}
        <div className="flex items-center justify-center gap-6 mt-6">
          <Button
            variant="outline"
            size="icon"
            className="rounded-full w-10 h-10 shadow-lg"
            onClick={() => setCurrentSlide(Math.max(0, currentSlide - 1))}
            disabled={currentSlide === 0}
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="font-bold text-foreground">{currentSlide + 1}</span>
            <span>/</span>
            <span>{slides.length}</span>
          </div>

          <Button
            variant="outline"
            size="icon"
            className="rounded-full w-10 h-10 shadow-lg"
            onClick={() => setCurrentSlide(Math.min(slides.length - 1, currentSlide + 1))}
            disabled={currentSlide === slides.length - 1}
          >
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SlidePreview;
