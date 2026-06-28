import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, ArrowRight } from "lucide-react";

/**
 * FeatureSpotlight — modal de DESCOBERTA de recurso. Aparece de vez em quando (1x por sessão)
 * mostrando um recurso que o usuário ainda não dispensou, COM um exemplo real na frente dele.
 * Detalhe de usabilidade que prende: o exemplo visual > descrição textual.
 * Dispensados ficam em localStorage; só mostra 1 por sessão, após um respiro.
 */

interface Showcase {
  key: string;
  badge: string;
  title: string;
  desc: string;
  image: string;   // exemplo real em /public/showcase
  cta: string;
  route: string;
  prompt?: string; // texto sugerido pra já cair no chat com o pedido pronto
}

// Recursos a divulgar — ordem = prioridade. Imagens reais em public/showcase.
const SHOWCASES: Showcase[] = [
  {
    key: "video",
    badge: "Novidade",
    title: "Vídeos animados que explicam um tema",
    desc: "Transforme um assunto num reel animado — sem gravar, sem avatar. A IA cria a animação que explica o tema, no estilo da sua marca.",
    image: "/showcase/nano_story.png",
    cta: "Criar um vídeo",
    route: "/agent",
    prompt: "Cria um vídeo animado de 10s explicando um tema do meu nicho",
  },
  {
    key: "editorial",
    badge: "Recurso",
    title: "Carrossel editorial com as suas fotos",
    desc: "Suas fotos (de um evento, bastidor, atendimento) viram um carrossel cinematográfico com manchetes de impacto e as cores da sua marca.",
    image: "/showcase/nano_editorial.png",
    cta: "Testar editorial",
    route: "/agent",
    prompt: "Quero um carrossel editorial com fotos minhas",
  },
  {
    key: "tweet_card",
    badge: "Recurso",
    title: "Tweet cards (estilo print do X)",
    desc: "Vire qualquer ideia num carrossel de cards estilo print de tweet, com o seu @ e avatar. Ótimo pra frases de autoridade.",
    image: "/showcase/gpt_post.png",
    cta: "Testar tweet card",
    route: "/agent",
    prompt: "Cria um tweet card com uma frase de autoridade do meu nicho",
  },
];

const DISMISSED_KEY = "tp_spotlight_dismissed";
const SESSION_KEY = "tp_spotlight_shown";

function getDismissed(): string[] {
  try { return JSON.parse(localStorage.getItem(DISMISSED_KEY) || "[]"); } catch { return []; }
}

export default function FeatureSpotlight() {
  const navigate = useNavigate();
  const [active, setActive] = useState<Showcase | null>(null);

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY)) return; // 1x por sessão
    const dismissed = getDismissed();
    const next = SHOWCASES.find((s) => !dismissed.includes(s.key));
    if (!next) return;
    const t = setTimeout(() => {
      setActive(next);
      sessionStorage.setItem(SESSION_KEY, "1");
    }, 9000); // respiro: só aparece depois que o usuário se situou
    return () => clearTimeout(t);
  }, []);

  const dismiss = (key: string) => {
    try { localStorage.setItem(DISMISSED_KEY, JSON.stringify([...new Set([...getDismissed(), key])])); } catch { /* ignore */ }
    setActive(null);
  };

  const tryIt = (s: Showcase) => {
    dismiss(s.key);
    navigate(s.route, s.prompt ? { state: { prefill: s.prompt } } : undefined);
  };

  if (!active) return null;

  return (
    <Dialog open onOpenChange={(o) => !o && dismiss(active.key)}>
      <DialogContent className="p-0 overflow-hidden max-w-md gap-0 border-border">
        <div className="relative h-56 bg-muted">
          <img src={active.image} alt="" className="w-full h-full object-cover" />
          <span className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full bg-primary text-primary-foreground text-[11px] font-semibold px-2.5 py-1 shadow-sm">
            <Sparkles className="w-3 h-3" /> {active.badge}
          </span>
        </div>
        <div className="p-5 space-y-3">
          <h2 className="text-lg font-bold leading-snug">{active.title}</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">{active.desc}</p>
          <div className="flex gap-2 pt-1">
            <Button className="flex-1 gap-1.5" onClick={() => tryIt(active)}>
              {active.cta} <ArrowRight className="w-4 h-4" />
            </Button>
            <Button variant="ghost" onClick={() => dismiss(active.key)}>Agora não</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
