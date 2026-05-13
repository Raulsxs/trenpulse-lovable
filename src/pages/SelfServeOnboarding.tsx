import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, Instagram, Linkedin, LayoutTemplate, CheckCircle } from "lucide-react";

const CURATED_TEMPLATES = [
  {
    slug: "newspaper-infographic",
    name: "Newspaper Infographic",
    emoji: "📰",
    description: "Posts educativos com layout de jornal — alto engajamento",
  },
  {
    slug: "quote-card",
    name: "Quote Card",
    emoji: "💬",
    description: "Frases e citações com visual minimalista — grátis",
  },
  {
    slug: "tutorial-carousel",
    name: "Tutorial Carousel",
    emoji: "📋",
    description: "Passo a passo em carrossel — grátis",
  },
];

export default function SelfServeOnboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [completing, setCompleting] = useState(false);

  const completeOnboarding = async (destination = "/discover") => {
    setCompleting(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from("ai_user_context")
        .upsert({ user_id: user.id, onboarding_done: true }, { onConflict: "user_id" });
    }
    navigate(destination);
  };

  return (
    <div className="h-[100dvh] bg-background overflow-y-auto">
      {/* Progress */}
      <div className="flex items-center justify-center gap-2 pt-6 mb-8">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`h-2 rounded-full transition-all duration-300 ${
              s <= step ? "bg-primary w-12" : "bg-muted w-8"
            }`}
          />
        ))}
      </div>

      <div className="w-full max-w-lg mx-auto px-4 pb-12">
        {/* Step 1 — Welcome */}
        {step === 1 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <div className="text-center space-y-3">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                <Sparkles className="w-8 h-8 text-primary" />
              </div>
              <h1 className="text-3xl font-bold">Bem-vindo ao TrendPulse!</h1>
              <p className="text-muted-foreground text-base leading-relaxed">
                Uma galeria de templates virais prontos para usar. Você escolhe um template,
                personaliza com seu conteúdo e publica direto nas redes sociais — em menos de 5 minutos.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { emoji: "🎨", label: "Escolhe o template" },
                { emoji: "✏️", label: "Personaliza" },
                { emoji: "🚀", label: "Publica" },
              ].map((item, i) => (
                <div key={i} className="bg-muted/50 rounded-xl p-4 space-y-2">
                  <span className="text-3xl">{item.emoji}</span>
                  <p className="text-xs font-medium text-foreground">{item.label}</p>
                </div>
              ))}
            </div>

            <Button
              size="lg"
              className="w-full gap-2 h-14 text-base rounded-xl"
              onClick={() => setStep(2)}
            >
              Começar
              <ArrowRight className="w-5 h-5" />
            </Button>
          </div>
        )}

        {/* Step 2 — Connect social */}
        {step === 2 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <div className="text-center space-y-3">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                <Instagram className="w-8 h-8 text-primary" />
              </div>
              <h1 className="text-3xl font-bold">Conecte suas redes</h1>
              <p className="text-muted-foreground text-base">
                Publique direto da plataforma — sem copiar e colar. Conecte quando quiser em{" "}
                <strong>Perfil → Redes Sociais</strong>.
              </p>
            </div>

            <div className="bg-muted/40 rounded-2xl p-5 space-y-4 border border-border">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                  <Instagram className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Instagram</p>
                  <p className="text-xs text-muted-foreground">Posts, carrosseis e stories</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0">
                  <Linkedin className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">LinkedIn</p>
                  <p className="text-xs text-muted-foreground">Posts profissionais</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground border-t border-border pt-3">
                Leva menos de 1 minuto. Disponível em <strong>Perfil</strong> a qualquer hora.
              </p>
            </div>

            <Button
              size="lg"
              className="w-full gap-2 h-14 text-base rounded-xl"
              onClick={() => setStep(3)}
            >
              Entendido
              <ArrowRight className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              className="w-full text-muted-foreground text-sm"
              onClick={() => setStep(3)}
            >
              Pular
            </Button>
          </div>
        )}

        {/* Step 3 — First template */}
        {step === 3 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <div className="text-center space-y-3">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                <LayoutTemplate className="w-8 h-8 text-primary" />
              </div>
              <h1 className="text-3xl font-bold">Seu primeiro template</h1>
              <p className="text-muted-foreground text-base">
                Escolha um para começar — ou explore a galeria completa.
              </p>
            </div>

            <div className="space-y-3">
              {CURATED_TEMPLATES.map((t) => (
                <button
                  key={t.slug}
                  onClick={() => completeOnboarding(`/templates/${t.slug}`)}
                  disabled={completing}
                  className="w-full flex items-center gap-4 p-4 rounded-xl border border-border hover:border-primary hover:bg-primary/5 transition-all text-left group disabled:opacity-50"
                >
                  <span className="text-3xl flex-shrink-0">{t.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.description}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                </button>
              ))}
            </div>

            <Button
              size="lg"
              variant="outline"
              className="w-full gap-2 h-12"
              onClick={() => completeOnboarding("/discover")}
              disabled={completing}
            >
              <CheckCircle className="w-4 h-4" />
              Ver galeria completa
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
