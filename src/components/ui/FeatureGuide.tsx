/**
 * FeatureGuide — mini tutorial tooltip with auto-playing screenshot slideshow.
 * Shows a "?" button that opens a small popover with step-by-step screenshots.
 *
 * Usage:
 *   <FeatureGuide guideKey="create-brand" />
 *
 * Guides are configured in GUIDES map below. Each guide has:
 *   - title: short title
 *   - steps: array of { image (URL), text (instruction) }
 *
 * Screenshots are hosted in Supabase Storage under "guides/" bucket.
 * Auto-advances every 3 seconds, with manual prev/next controls.
 */
import { useState, useEffect, useRef } from "react";
import { HelpCircle, ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface GuideStep {
  image: string; // Supabase Storage URL or any image URL
  text: string;
}

interface GuideConfig {
  title: string;
  steps: GuideStep[];
}

// ══════ GUIDE CONFIGURATIONS ══════
// Add new guides here. Images should be uploaded to Supabase Storage.
// Recommended screenshot size: 600x400px (or similar 3:2 ratio)

const STORAGE_BASE = "https://pbsqmaomyaiexgajfrsa.supabase.co/storage/v1/object/public/guides";

const GUIDES: Record<string, GuideConfig> = {
  "create-brand": {
    title: "Como criar sua marca",
    steps: [
      { image: `${STORAGE_BASE}/create-brand-1.jpg`, text: "1. No chat, digite \"criar minha marca\"" },
      { image: `${STORAGE_BASE}/create-brand-2.jpg`, text: "2. Envie 3-5 exemplos de posts que representem seu estilo" },
      { image: `${STORAGE_BASE}/create-brand-3.jpg`, text: "3. A IA analisa cores, fontes e tom visual automaticamente" },
      { image: `${STORAGE_BASE}/create-brand-4.jpg`, text: "4. Sua marca está pronta! Todo conteúdo seguirá essa identidade" },
    ],
  },
  "generate-content": {
    title: "Como gerar conteúdo",
    steps: [
      { image: `${STORAGE_BASE}/generate-content-1.jpg`, text: "1. Cole um link de artigo ou descreva o tema no chat" },
      { image: `${STORAGE_BASE}/generate-content-2.jpg`, text: "2. Escolha: Instagram ou LinkedIn, Post ou Carrossel" },
      { image: `${STORAGE_BASE}/generate-content-3.jpg`, text: "3. Selecione o estilo (notícia, dica, educativo...)" },
      { image: `${STORAGE_BASE}/generate-content-4.jpg`, text: "4. A IA gera texto + imagem na identidade da sua marca" },
    ],
  },
  "connect-social": {
    title: "Como conectar redes sociais",
    steps: [
      { image: `${STORAGE_BASE}/connect-social-1.jpg`, text: "1. Vá em Meu Perfil (menu lateral)" },
      { image: `${STORAGE_BASE}/connect-social-2.jpg`, text: "2. Role até 'Contas Conectadas'" },
      { image: `${STORAGE_BASE}/connect-social-3.jpg`, text: "3. Clique em 'Conectar' no Instagram ou LinkedIn" },
      { image: `${STORAGE_BASE}/connect-social-4.jpg`, text: "4. Autorize o acesso — pronto para publicar!" },
    ],
  },
  "schedule-content": {
    title: "Como agendar publicações",
    steps: [
      { image: `${STORAGE_BASE}/schedule-content-1.jpg`, text: "1. Abra um conteúdo gerado e clique em 'Agendar'" },
      { image: `${STORAGE_BASE}/schedule-content-2.jpg`, text: "2. Escolha data e horário de publicação" },
      { image: `${STORAGE_BASE}/schedule-content-3.jpg`, text: "3. O conteúdo aparece no Calendário Editorial" },
      { image: `${STORAGE_BASE}/schedule-content-4.jpg`, text: "4. Publicação automática na hora agendada" },
    ],
  },
};

// ══════ COMPONENT ══════

interface FeatureGuideProps {
  guideKey: string;
  className?: string;
  size?: "sm" | "md";
}

export default function FeatureGuide({ guideKey, className, size = "sm" }: FeatureGuideProps) {
  const [open, setOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const guide = GUIDES[guideKey];
  if (!guide) return null;

  const totalSteps = guide.steps.length;

  // Auto-advance slideshow
  useEffect(() => {
    if (!open || isPaused) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setCurrentStep((prev) => (prev + 1) % totalSteps);
    }, 3500);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [open, isPaused, totalSteps]);

  const handleOpen = () => {
    setCurrentStep(0);
    setOpen(true);
  };

  const goNext = () => {
    setIsPaused(true);
    setCurrentStep((prev) => (prev + 1) % totalSteps);
  };

  const goPrev = () => {
    setIsPaused(true);
    setCurrentStep((prev) => (prev - 1 + totalSteps) % totalSteps);
  };

  const step = guide.steps[currentStep];
  const iconSize = size === "sm" ? "w-4 h-4" : "w-5 h-5";

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={handleOpen}
        className={cn(
          "inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors",
          size === "sm" ? "w-6 h-6" : "w-8 h-8",
          className,
        )}
        title={guide.title}
      >
        <HelpCircle className={iconSize} />
      </button>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-background border border-border rounded-2xl shadow-2xl w-[90vw] max-w-md overflow-hidden animate-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold">{guide.title}</h3>
              <button
                onClick={() => setOpen(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-muted transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Screenshot area */}
            <div className="relative aspect-[3/2] bg-muted overflow-hidden">
              {step.image ? (
                <img
                  src={step.image}
                  alt={step.text}
                  className="w-full h-full object-cover transition-opacity duration-500"
                  key={currentStep}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="text-center text-muted-foreground">
                    <div className="text-4xl mb-2">{currentStep + 1}</div>
                    <p className="text-xs">Screenshot aqui</p>
                  </div>
                </div>
              )}

              {/* Nav arrows */}
              <button
                onClick={goPrev}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-background/80 flex items-center justify-center hover:bg-background transition-colors shadow"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={goNext}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-background/80 flex items-center justify-center hover:bg-background transition-colors shadow"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Step text + dots */}
            <div className="p-4">
              <p className="text-sm text-foreground mb-3 min-h-[40px]">{step.text}</p>

              {/* Progress dots */}
              <div className="flex items-center justify-center gap-2">
                {guide.steps.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => { setIsPaused(true); setCurrentStep(i); }}
                    className={cn(
                      "h-1.5 rounded-full transition-all",
                      i === currentStep ? "bg-primary w-6" : "bg-muted-foreground/30 w-3",
                    )}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Export the guide keys for use in other components.
 * To add a guide to any feature, just add:
 *   <FeatureGuide guideKey="create-brand" />
 * next to the feature title/button.
 */
export const GUIDE_KEYS = Object.keys(GUIDES);
