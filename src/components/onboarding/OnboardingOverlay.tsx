import { useEffect, useState, useCallback } from "react";
import { useOnboarding } from "./OnboardingProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, X, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface Position {
  top?: number;
  left?: number;
}

const OnboardingOverlay = () => {
  const { isActive, currentStep, steps, nextStep, prevStep, skipOnboarding } = useOnboarding();
  const [tooltipPosition, setTooltipPosition] = useState<Position>({});
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);

  const updatePositions = useCallback(() => {
    if (!isActive || !steps[currentStep]) return;
    const step = steps[currentStep];

    if (step.target) {
      const element = document.querySelector(step.target);
      if (element) {
        const rect = element.getBoundingClientRect();
        setHighlightRect(rect);

        const padding = 16;
        const tooltipWidth = 400;
        const tooltipHeight = 220;
        let newPosition: Position = {};

        switch (step.position) {
          case "top":
            newPosition = {
              top: rect.top - tooltipHeight - padding,
              left: Math.max(padding, rect.left + rect.width / 2 - tooltipWidth / 2),
            };
            break;
          case "bottom":
            newPosition = {
              top: rect.bottom + padding,
              left: Math.max(padding, rect.left + rect.width / 2 - tooltipWidth / 2),
            };
            break;
          case "left":
            newPosition = {
              top: rect.top + rect.height / 2 - tooltipHeight / 2,
              left: rect.left - tooltipWidth - padding,
            };
            break;
          case "right":
            newPosition = {
              top: rect.top + rect.height / 2 - tooltipHeight / 2,
              left: rect.right + padding,
            };
            break;
        }

        const maxLeft = window.innerWidth - tooltipWidth - padding;
        const maxTop = window.innerHeight - tooltipHeight - padding;
        if (newPosition.left !== undefined) newPosition.left = Math.min(Math.max(padding, newPosition.left), maxLeft);
        if (newPosition.top !== undefined) newPosition.top = Math.min(Math.max(padding, newPosition.top), maxTop);

        setTooltipPosition(newPosition);
      } else {
        // Element not found yet (page still loading), treat as center
        setHighlightRect(null);
        setTooltipPosition({});
      }
    } else {
      setHighlightRect(null);
      setTooltipPosition({});
    }
  }, [isActive, currentStep, steps]);

  useEffect(() => {
    // Delay to allow route transitions to render
    const timer = setTimeout(updatePositions, 300);
    window.addEventListener("resize", updatePositions);
    window.addEventListener("scroll", updatePositions);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", updatePositions);
      window.removeEventListener("scroll", updatePositions);
    };
  }, [updatePositions]);

  if (!isActive || !steps[currentStep]) return null;

  const step = steps[currentStep];
  const isCenter = !highlightRect;
  const progress = ((currentStep + 1) / steps.length) * 100;

  return (
    <div className="fixed inset-0 z-[100] pointer-events-none">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto transition-opacity duration-300"
        onClick={skipOnboarding}
      />

      {highlightRect && (
        <div
          className="absolute bg-transparent pointer-events-none transition-all duration-300 ease-out"
          style={{
            top: highlightRect.top - 8,
            left: highlightRect.left - 8,
            width: highlightRect.width + 16,
            height: highlightRect.height + 16,
            boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.6), 0 0 20px rgba(59, 130, 246, 0.5)",
            borderRadius: "12px",
            border: "2px solid hsl(var(--primary))",
          }}
        />
      )}

      <Card
        className={cn(
          "absolute w-[400px] shadow-xl pointer-events-auto animate-scale-in",
          isCenter && "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
        )}
        style={isCenter ? {} : tooltipPosition}
      >
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <CardTitle className="text-lg font-heading">{step.title}</CardTitle>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={skipOnboarding}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="pb-4">
          <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
          <div className="mt-4 flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary transition-all duration-300 ease-out" style={{ width: `${progress}%` }} />
            </div>
            <span className="text-xs text-muted-foreground font-medium">
              {currentStep + 1}/{steps.length}
            </span>
          </div>
        </CardContent>

        <CardFooter className="pt-0 flex justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={skipOnboarding} className="text-muted-foreground">
            Pular tour
          </Button>
          <div className="flex gap-2">
            {currentStep > 0 && (
              <Button variant="outline" size="sm" onClick={prevStep}>
                <ChevronLeft className="w-4 h-4 mr-1" />
                Anterior
              </Button>
            )}
            <Button size="sm" onClick={nextStep}>
              {currentStep === steps.length - 1 ? "Começar!" : (
                <>
                  Próximo
                  <ChevronRight className="w-4 h-4 ml-1" />
                </>
              )}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
};

export default OnboardingOverlay;
