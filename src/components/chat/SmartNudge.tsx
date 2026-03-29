/**
 * SmartNudge — contextual tips that appear once to guide users toward key features.
 * Uses localStorage to track which nudges have been shown.
 */
import { useState, useEffect } from "react";
import { X, Palette, Link2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

interface NudgeConfig {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  cta: string;
  action: "navigate" | "dismiss";
  href?: string;
}

const NUDGES: NudgeConfig[] = [
  {
    id: "create-brand",
    icon: <Palette className="w-5 h-5 text-primary" />,
    title: "Crie sua marca para resultados melhores",
    description: "Com uma marca configurada, toda imagem gerada segue suas cores, fontes e estilo visual. Basta dizer \"criar minha marca\" aqui no chat e enviar exemplos de posts.",
    cta: "Criar marca agora",
    action: "dismiss",
  },
  {
    id: "connect-social",
    icon: <Link2 className="w-5 h-5 text-blue-500" />,
    title: "Conecte suas redes para publicar direto",
    description: "Com Instagram e LinkedIn conectados, você agenda e publica direto pelo TrendPulse sem sair da plataforma.",
    cta: "Conectar em Meu Perfil",
    action: "navigate",
    href: "/profile",
  },
];

interface SmartNudgeProps {
  hasBrand: boolean;
  hasSocialConnection: boolean;
  contentCount: number;
}

export default function SmartNudge({ hasBrand, hasSocialConnection, contentCount }: SmartNudgeProps) {
  const navigate = useNavigate();
  const [activeNudge, setActiveNudge] = useState<NudgeConfig | null>(null);

  useEffect(() => {
    // Determine which nudge to show (if any)
    // Rules: only 1 nudge per session, only if not dismissed before
    const shown = JSON.parse(localStorage.getItem("trendpulse_nudges_shown") || "[]");

    if (!hasBrand && !shown.includes("create-brand") && contentCount >= 1) {
      // After first content, suggest creating a brand
      setActiveNudge(NUDGES.find(n => n.id === "create-brand") || null);
    } else if (!hasSocialConnection && !shown.includes("connect-social") && contentCount >= 3) {
      // After 3 contents, suggest connecting social
      setActiveNudge(NUDGES.find(n => n.id === "connect-social") || null);
    }
  }, [hasBrand, hasSocialConnection, contentCount]);

  const dismissNudge = () => {
    if (activeNudge) {
      const shown = JSON.parse(localStorage.getItem("trendpulse_nudges_shown") || "[]");
      shown.push(activeNudge.id);
      localStorage.setItem("trendpulse_nudges_shown", JSON.stringify(shown));
    }
    setActiveNudge(null);
  };

  const handleAction = () => {
    if (activeNudge?.action === "navigate" && activeNudge.href) {
      navigate(activeNudge.href);
    }
    dismissNudge();
  };

  if (!activeNudge) return null;

  return (
    <div className="mx-3 mb-3 p-4 rounded-xl bg-primary/5 border border-primary/20 animate-in fade-in slide-in-from-bottom-2">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          {activeNudge.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">{activeNudge.title}</p>
            <button onClick={dismissNudge} className="flex-shrink-0 text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{activeNudge.description}</p>
          <Button size="sm" variant="outline" className="mt-2 h-7 text-xs" onClick={handleAction}>
            {activeNudge.cta}
          </Button>
        </div>
      </div>
    </div>
  );
}
