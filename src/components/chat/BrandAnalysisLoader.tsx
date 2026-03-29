import { useState, useEffect } from "react";
import { Loader2, Palette, Sparkles, Eye } from "lucide-react";

const PHASES = [
  { icon: Eye, text: "Analisando suas referências visuais... 🔍", duration: 15000 },
  { icon: Palette, text: "Extraindo paleta de cores e tipografia... 🎨", duration: 15000 },
  { icon: Sparkles, text: "Criando identidade visual da marca... ✨", duration: 20000 },
  { icon: Loader2, text: "Gerando templates personalizados... 🖼️", duration: 20000 },
  { icon: Sparkles, text: "Finalizando sua marca... quase lá! 🚀", duration: 999999 },
];

export default function BrandAnalysisLoader() {
  const [phaseIdx, setPhaseIdx] = useState(0);

  useEffect(() => {
    const phase = PHASES[phaseIdx];
    if (!phase || phaseIdx >= PHASES.length - 1) return;
    const timer = setTimeout(() => setPhaseIdx((i) => Math.min(i + 1, PHASES.length - 1)), phase.duration);
    return () => clearTimeout(timer);
  }, [phaseIdx]);

  const phase = PHASES[phaseIdx];
  const Icon = phase.icon;
  const progress = Math.min(((phaseIdx + 1) / PHASES.length) * 100, 95);

  return (
    <div className="flex gap-3 mb-5 animate-in fade-in slide-in-from-left-3 duration-300">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shadow-sm ring-1 ring-primary/10">
        <Palette className="w-4 h-4 text-primary" />
      </div>
      <div className="max-w-[75%] space-y-2">
        <span className="inline-block text-[10px] font-semibold uppercase tracking-wider text-primary bg-primary/10 px-2.5 py-0.5 rounded-full">
          Criando marca
        </span>
        <div className="rounded-2xl rounded-bl-sm bg-muted px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2.5">
            <Icon className="w-4 h-4 text-primary animate-spin" style={{ animationDuration: Icon === Loader2 ? "1s" : "2s" }} />
            <p className="text-sm text-foreground animate-pulse">{phase.text}</p>
          </div>
          <div className="mt-3 w-full bg-background rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-primary h-1.5 rounded-full transition-all duration-1000 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5">
            Isso leva cerca de 1 minuto. Você pode continuar navegando.
          </p>
        </div>
      </div>
    </div>
  );
}
