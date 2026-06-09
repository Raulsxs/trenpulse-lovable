/**
 * Onboarding leve — 1 tela, zero chamadas de geração.
 * Nicho via chips → preview mockup instantâneo (CSS, sem API) → cai no chat com
 * um prompt pré-armado do nicho. O aha real acontece DENTRO do produto (chat),
 * onde a geração tem loader próprio e o resultado é editável/publicável.
 * (Substitui o wizard de 4 steps que chamava generate-content síncrono por ~2min.)
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, ArrowRight, SkipForward } from "lucide-react";

// Visual por nicho pro mockup instantâneo (imagens já hospedadas; CSS puro como fallback)
const NICHE_COLORS: Record<string, { primary: string; secondary: string; image?: string }> = {
  default: { primary: "#667eea", secondary: "#764ba2" },
  saude: { primary: "#0891b2", secondary: "#164e63", image: "https://cloud.inference.sh/app/files/u/6d8q5x9g2wsb3kwpk157p4nr3q/01km8a4wyhv8r24rdtb1rwmvx6.png" },
  coaching: { primary: "#f97316", secondary: "#1a1a2e" },
  fitness: { primary: "#16a34a", secondary: "#14532d", image: "https://cloud.inference.sh/app/files/u/6d8q5x9g2wsb3kwpk157p4nr3q/01km8a55az6p72tf474w40t4bw.png" },
  beleza: { primary: "#db2777", secondary: "#831843", image: "https://cloud.inference.sh/app/files/u/6d8q5x9g2wsb3kwpk157p4nr3q/01km8bmy7tx5w2dnca8af4fjhw.png" },
  advocacia: { primary: "#1e3a5f", secondary: "#0f2440", image: "https://cloud.inference.sh/app/files/u/6d8q5x9g2wsb3kwpk157p4nr3q/01km8a5wkrj2jt42nh82xbd902.png" },
  marketing: { primary: "#e11d48", secondary: "#4c1d95", image: "https://cloud.inference.sh/app/files/u/6d8q5x9g2wsb3kwpk157p4nr3q/01km8a551hvavacynza5cdvvfb.png" },
};

// 6 nichos (ICP: saúde/coach primeiro) + "Outro". A ideia vira o headline do mockup
// E o prompt pré-armado que o usuário encontra no chat.
const NICHES: { id: string; label: string; emoji: string; idea: string }[] = [
  { id: "saude", label: "Saúde e Bem-estar", emoji: "🏥", idea: "5 hábitos simples para mais saúde no dia a dia" },
  { id: "coaching", label: "Coaching e Mentoria", emoji: "🎯", idea: "A mentalidade que separa quem evolui de quem desiste" },
  { id: "fitness", label: "Fitness e Academia", emoji: "💪", idea: "5 exercícios que podem ser feitos em casa" },
  { id: "beleza", label: "Beleza e Estética", emoji: "💅", idea: "5 cuidados essenciais com a pele no dia a dia" },
  { id: "advocacia", label: "Advocacia e Direito", emoji: "⚖️", idea: "5 direitos que poucos conhecem" },
  { id: "marketing", label: "Marketing e Publicidade", emoji: "📣", idea: "5 erros de marketing que estão custando clientes" },
];

function PostMockup({ headline, nicheId }: { headline: string; nicheId: string }) {
  const colors = NICHE_COLORS[nicheId] || NICHE_COLORS.default;
  const hasImage = !!colors.image;
  return (
    <div className="w-full max-w-[240px] mx-auto rounded-xl overflow-hidden shadow-xl border border-border">
      <div className="flex items-center gap-2 px-2.5 py-1.5 bg-background">
        <div className="w-6 h-6 rounded-full" style={{ background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})` }} />
        <div>
          <p className="text-[10px] font-semibold text-foreground">Sua marca</p>
          <p className="text-[8px] text-muted-foreground">Patrocinado</p>
        </div>
      </div>
      <div className="aspect-square relative overflow-hidden">
        {hasImage && (
          <img
            src={colors.image}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        )}
        <div
          className="absolute inset-0"
          style={{
            background: hasImage
              ? "linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.15) 40%, rgba(0,0,0,0.6) 100%)"
              : `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`,
          }}
        />
        <div className="absolute inset-0 flex items-end p-4">
          <p
            className="text-base font-bold leading-tight"
            style={{ color: "#ffffff", textShadow: "0 2px 12px rgba(0,0,0,0.5), 0 1px 4px rgba(0,0,0,0.3)" }}
          >
            {headline}
          </p>
        </div>
      </div>
      <div className="px-2.5 py-1.5 bg-background space-y-1">
        <div className="flex gap-3">
          <span className="text-xs">❤️</span>
          <span className="text-xs">💬</span>
          <span className="text-xs">📤</span>
          <span className="text-xs ml-auto">🔖</span>
        </div>
        <p className="text-[9px] text-foreground font-semibold">127 curtidas</p>
        <p className="text-[9px] text-muted-foreground line-clamp-1">
          <strong className="text-foreground">suamarca</strong> Conteúdo gerado pelo TrendPulse...
        </p>
      </div>
    </div>
  );
}

export default function Onboarding() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string | null>(null);
  const [customNiche, setCustomNiche] = useState("");
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        navigate("/auth");
        return;
      }
      setUserId(data.session.user.id);
    });
  }, [navigate]);

  const niche = NICHES.find((n) => n.id === selected);
  const isOther = selected === "outro";
  const nicheLabel = isOther ? customNiche.trim() : niche?.label || "";
  const mockupHeadline = isOther
    ? `Uma dica de ${customNiche.trim() || "especialista"} que seu cliente precisa ver`
    : niche?.idea || "";
  const canContinue = !!selected && (!isOther || customNiche.trim().length > 0);

  const finish = async (skipped = false) => {
    if (!userId || saving) return;
    setSaving(true);
    try {
      await supabase.from("ai_user_context").upsert(
        {
          user_id: userId,
          onboarding_done: true,
          ...(nicheLabel && !skipped ? { business_niche: nicheLabel } : {}),
        },
        { onConflict: "user_id" },
      );
      // Prompt pré-armado: o ChatWindow preenche o input com isso (editável, não envia sozinho)
      const prefill = !skipped && nicheLabel ? `Crie um post para Instagram sobre: ${mockupHeadline}` : undefined;
      navigate("/chat", prefill ? { state: { prefill } } : undefined);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-[100dvh] bg-background overflow-y-auto">
      <div className="w-full max-w-lg mx-auto px-4 pt-10 pb-8">
        <div className="text-center space-y-5 animate-in fade-in slide-in-from-bottom-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <Sparkles className="w-7 h-7 text-primary" />
          </div>

          <div>
            <h1 className="text-3xl font-bold mb-2">Bem-vindo ao TrendPulse!</h1>
            <p className="text-muted-foreground text-lg">
              O que você faz? A IA cria conteúdo sob medida pro seu negócio.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 text-left">
            {NICHES.map((n) => (
              <button
                key={n.id}
                onClick={() => setSelected(n.id)}
                className={`p-3 rounded-xl border text-sm font-medium transition-all text-left ${
                  selected === n.id
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border hover:border-primary/50 text-foreground"
                }`}
              >
                <span className="mr-1.5">{n.emoji}</span>
                {n.label}
              </button>
            ))}
            <button
              onClick={() => setSelected("outro")}
              className={`p-3 rounded-xl border text-sm font-medium transition-all text-left col-span-2 ${
                isOther
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border hover:border-primary/50 text-foreground"
              }`}
            >
              <span className="mr-1.5">🏢</span>
              Outro
            </button>
          </div>

          {isOther && (
            <Input
              placeholder="Descreva seu negócio (ex: pet shop, consultoria financeira...)"
              value={customNiche}
              onChange={(e) => setCustomNiche(e.target.value)}
              className="text-center h-12 rounded-xl"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && canContinue && finish()}
            />
          )}

          {canContinue && (
            <div className="animate-in fade-in zoom-in-95 duration-300">
              <p className="text-xs text-muted-foreground mb-3">Exemplo do que a IA cria pra você:</p>
              <PostMockup headline={mockupHeadline} nicheId={isOther ? "default" : selected!} />
            </div>
          )}

          <div className="flex flex-col gap-3">
            <Button
              size="lg"
              className="w-full gap-2 text-base h-14 rounded-xl"
              onClick={() => finish()}
              disabled={!canContinue || saving}
            >
              <Sparkles className="w-5 h-5" />
              Criar meu primeiro post
              <ArrowRight className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => finish(true)} disabled={saving}>
              <SkipForward className="w-4 h-4 mr-1" />
              Pular e explorar sozinho
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
