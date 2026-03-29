/**
 * Magic Onboarding — gets user to first content in under 90 seconds.
 * 4-step wizard: Instagram handle → Business niche → Pick content idea → See result.
 * The aha moment happens at step 3: user sees real content for THEIR niche.
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Instagram,
  Briefcase,
  Sparkles,
  ArrowRight,
  Loader2,
  CheckCircle,
  SkipForward,
  Palette,
  Zap,
  TrendingUp,
  Lightbulb,
  Newspaper,
} from "lucide-react";

// Niche visual config for instant mockups — images from Supabase Storage
const STORAGE_BASE = "https://pbsqmaomyaiexgajfrsa.supabase.co/storage/v1/object/public/guides";
const NICHE_COLORS: Record<string, { primary: string; secondary: string; text: string; image?: string }> = {
  default: { primary: "#667eea", secondary: "#764ba2", text: "#ffffff" },
  saude: { primary: "#0891b2", secondary: "#164e63", text: "#ffffff", image: "https://cloud.inference.sh/app/files/u/6d8q5x9g2wsb3kwpk157p4nr3q/01km8a4wyhv8r24rdtb1rwmvx6.png" },
  tecnologia: { primary: "#2563eb", secondary: "#0f172a", text: "#ffffff", image: "https://cloud.inference.sh/app/files/u/6d8q5x9g2wsb3kwpk157p4nr3q/01km8a5feqsdec66n99pgny4pn.png" },
  advocacia: { primary: "#1e3a5f", secondary: "#0f2440", text: "#c9a96e", image: "https://cloud.inference.sh/app/files/u/6d8q5x9g2wsb3kwpk157p4nr3q/01km8a5wkrj2jt42nh82xbd902.png" },
  marketing: { primary: "#e11d48", secondary: "#4c1d95", text: "#ffffff", image: "https://cloud.inference.sh/app/files/u/6d8q5x9g2wsb3kwpk157p4nr3q/01km8a551hvavacynza5cdvvfb.png" },
  fitness: { primary: "#16a34a", secondary: "#14532d", text: "#ffffff", image: "https://cloud.inference.sh/app/files/u/6d8q5x9g2wsb3kwpk157p4nr3q/01km8a55az6p72tf474w40t4bw.png" },
  contabilidade: { primary: "#1e40af", secondary: "#172554", text: "#ffffff", image: "https://cloud.inference.sh/app/files/u/6d8q5x9g2wsb3kwpk157p4nr3q/01km8bmpnnnc0t7w19qex8mkgz.png" },
  beleza: { primary: "#db2777", secondary: "#831843", text: "#ffffff", image: "https://cloud.inference.sh/app/files/u/6d8q5x9g2wsb3kwpk157p4nr3q/01km8bmy7tx5w2dnca8af4fjhw.png" },
  gastronomia: { primary: "#dc2626", secondary: "#7f1d1d", text: "#f59e0b", image: "https://cloud.inference.sh/app/files/u/6d8q5x9g2wsb3kwpk157p4nr3q/01km8bn26a5tjsesw4t0z5gh40.png" },
  imobiliario: { primary: "#0d9488", secondary: "#134e4a", text: "#ffffff", image: "https://cloud.inference.sh/app/files/u/6d8q5x9g2wsb3kwpk157p4nr3q/01km8a5g64tnq32b97fzsyfdvx.png" },
  educacao: { primary: "#7c3aed", secondary: "#2e1065", text: "#ffffff", image: "https://cloud.inference.sh/app/files/u/6d8q5x9g2wsb3kwpk157p4nr3q/01km8a5cr0rnfd4h126wta9ghd.png" },
  coaching: { primary: "#f97316", secondary: "#1a1a2e", text: "#ffffff" },
  consultoria: { primary: "#1e293b", secondary: "#0f172a", text: "#3b82f6" },
  // Sub-niches map to parent niche images
  odontologia: { primary: "#0891b2", secondary: "#164e63", text: "#ffffff", image: "https://cloud.inference.sh/app/files/u/6d8q5x9g2wsb3kwpk157p4nr3q/01km8a4wyhv8r24rdtb1rwmvx6.png" },
  psicologia: { primary: "#7c3aed", secondary: "#2e1065", text: "#ffffff", image: "https://cloud.inference.sh/app/files/u/6d8q5x9g2wsb3kwpk157p4nr3q/01km8a5cr0rnfd4h126wta9ghd.png" },
  nutricao: { primary: "#16a34a", secondary: "#14532d", text: "#ffffff", image: "https://cloud.inference.sh/app/files/u/6d8q5x9g2wsb3kwpk157p4nr3q/01km8a55az6p72tf474w40t4bw.png" },
  medicina: { primary: "#0891b2", secondary: "#164e63", text: "#ffffff", image: "https://cloud.inference.sh/app/files/u/6d8q5x9g2wsb3kwpk157p4nr3q/01km8a4wyhv8r24rdtb1rwmvx6.png" },
  arquitetura: { primary: "#0d9488", secondary: "#134e4a", text: "#ffffff", image: "https://cloud.inference.sh/app/files/u/6d8q5x9g2wsb3kwpk157p4nr3q/01km8a5g64tnq32b97fzsyfdvx.png" },
  engenharia: { primary: "#2563eb", secondary: "#0f172a", text: "#ffffff", image: "https://cloud.inference.sh/app/files/u/6d8q5x9g2wsb3kwpk157p4nr3q/01km8a5feqsdec66n99pgny4pn.png" },
  moda: { primary: "#db2777", secondary: "#831843", text: "#ffffff", image: "https://cloud.inference.sh/app/files/u/6d8q5x9g2wsb3kwpk157p4nr3q/01km8bmy7tx5w2dnca8af4fjhw.png" },
  confeitaria: { primary: "#dc2626", secondary: "#7f1d1d", text: "#f59e0b", image: "https://cloud.inference.sh/app/files/u/6d8q5x9g2wsb3kwpk157p4nr3q/01km8bn26a5tjsesw4t0z5gh40.png" },
  social_media: { primary: "#e11d48", secondary: "#4c1d95", text: "#ffffff", image: "https://cloud.inference.sh/app/files/u/6d8q5x9g2wsb3kwpk157p4nr3q/01km8a551hvavacynza5cdvvfb.png" },
  financas: { primary: "#1e40af", secondary: "#172554", text: "#ffffff", image: "https://cloud.inference.sh/app/files/u/6d8q5x9g2wsb3kwpk157p4nr3q/01km8bmpnnnc0t7w19qex8mkgz.png" },
  seguros: { primary: "#1e40af", secondary: "#172554", text: "#ffffff", image: "https://cloud.inference.sh/app/files/u/6d8q5x9g2wsb3kwpk157p4nr3q/01km8bmpnnnc0t7w19qex8mkgz.png" },
  fotografia: { primary: "#e11d48", secondary: "#4c1d95", text: "#ffffff", image: "https://cloud.inference.sh/app/files/u/6d8q5x9g2wsb3kwpk157p4nr3q/01km8a551hvavacynza5cdvvfb.png" },
  eventos: { primary: "#e11d48", secondary: "#4c1d95", text: "#ffffff", image: "https://cloud.inference.sh/app/files/u/6d8q5x9g2wsb3kwpk157p4nr3q/01km8a551hvavacynza5cdvvfb.png" },
  turismo: { primary: "#0d9488", secondary: "#134e4a", text: "#ffffff", image: "https://cloud.inference.sh/app/files/u/6d8q5x9g2wsb3kwpk157p4nr3q/01km8a5g64tnq32b97fzsyfdvx.png" },
  pets: { primary: "#16a34a", secondary: "#14532d", text: "#ffffff", image: "https://cloud.inference.sh/app/files/u/6d8q5x9g2wsb3kwpk157p4nr3q/01km8a55az6p72tf474w40t4bw.png" },
  automotivo: { primary: "#1e293b", secondary: "#0f172a", text: "#3b82f6" },
  agronegocio: { primary: "#16a34a", secondary: "#14532d", text: "#ffffff", image: "https://cloud.inference.sh/app/files/u/6d8q5x9g2wsb3kwpk157p4nr3q/01km8a55az6p72tf474w40t4bw.png" },
  industria: { primary: "#1e293b", secondary: "#0f172a", text: "#3b82f6" },
  religioso: { primary: "#7c3aed", secondary: "#2e1065", text: "#ffffff", image: "https://cloud.inference.sh/app/files/u/6d8q5x9g2wsb3kwpk157p4nr3q/01km8a5cr0rnfd4h126wta9ghd.png" },
  ong: { primary: "#16a34a", secondary: "#14532d", text: "#ffffff", image: "https://cloud.inference.sh/app/files/u/6d8q5x9g2wsb3kwpk157p4nr3q/01km8a55az6p72tf474w40t4bw.png" },
  varejo: { primary: "#e11d48", secondary: "#4c1d95", text: "#ffffff", image: "https://cloud.inference.sh/app/files/u/6d8q5x9g2wsb3kwpk157p4nr3q/01km8a551hvavacynza5cdvvfb.png" },
};

// Instagram post mockup component for onboarding
function PostMockup({ headline, niche }: { headline: string; niche: string }) {
  const colors = NICHE_COLORS[niche] || NICHE_COLORS.default;
  const hasImage = !!colors.image;
  return (
    <div className="w-full max-w-[240px] mx-auto rounded-xl overflow-hidden shadow-xl border border-border">
      {/* Instagram header */}
      <div className="flex items-center gap-2 px-2.5 py-1.5 bg-background">
        <div className="w-6 h-6 rounded-full" style={{ background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})` }} />
        <div>
          <p className="text-[10px] font-semibold text-foreground">Sua marca</p>
          <p className="text-[8px] text-muted-foreground">Patrocinado</p>
        </div>
      </div>
      {/* Image area */}
      <div className="aspect-square relative overflow-hidden">
        {/* Background: image or gradient */}
        {hasImage ? (
          <img
            src={colors.image}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : null}
        {/* Gradient overlay (always, stronger when no image) */}
        <div
          className="absolute inset-0"
          style={{
            background: hasImage
              ? "linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.15) 40%, rgba(0,0,0,0.6) 100%)"
              : `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`,
          }}
        />
        {/* Headline text */}
        <div className="absolute inset-0 flex items-end p-4">
          <p
            className="text-base font-bold leading-tight"
            style={{
              color: "#ffffff",
              textShadow: "0 2px 12px rgba(0,0,0,0.5), 0 1px 4px rgba(0,0,0,0.3)",
            }}
          >
            {headline}
          </p>
        </div>
      </div>
      {/* Instagram actions */}
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

// Pre-defined content ideas per niche — instant, no API call needed
const NICHE_CONTENT_IDEAS: Record<string, { icon: React.ReactNode; title: string; style: string }[]> = {
  default: [
    { icon: <TrendingUp className="w-5 h-5" />, title: "Tendência do seu setor que poucos conhecem", style: "news" },
    { icon: <Lightbulb className="w-5 h-5" />, title: "5 dicas práticas para seu público", style: "tip" },
    { icon: <Newspaper className="w-5 h-5" />, title: "Post educativo sobre seu nicho", style: "educational" },
  ],
  saude: [
    { icon: <TrendingUp className="w-5 h-5" />, title: "Nova pesquisa sobre bem-estar no trabalho", style: "news" },
    { icon: <Lightbulb className="w-5 h-5" />, title: "5 hábitos simples para mais saúde no dia a dia", style: "tip" },
    { icon: <Newspaper className="w-5 h-5" />, title: "O que mudou na saúde preventiva em 2026", style: "educational" },
  ],
  tecnologia: [
    { icon: <TrendingUp className="w-5 h-5" />, title: "IA está transformando negócios: o que você precisa saber", style: "news" },
    { icon: <Lightbulb className="w-5 h-5" />, title: "5 ferramentas de produtividade que todo gestor deveria usar", style: "tip" },
    { icon: <Newspaper className="w-5 h-5" />, title: "Tendências de tecnologia para pequenas empresas", style: "educational" },
  ],
  advocacia: [
    { icon: <TrendingUp className="w-5 h-5" />, title: "Mudança na legislação que impacta seu cliente", style: "news" },
    { icon: <Lightbulb className="w-5 h-5" />, title: "5 direitos que poucos conhecem", style: "tip" },
    { icon: <Newspaper className="w-5 h-5" />, title: "Como proteger seu negócio juridicamente", style: "educational" },
  ],
  marketing: [
    { icon: <TrendingUp className="w-5 h-5" />, title: "O algoritmo mudou: como adaptar sua estratégia", style: "news" },
    { icon: <Lightbulb className="w-5 h-5" />, title: "5 erros de marketing que estão custando clientes", style: "tip" },
    { icon: <Newspaper className="w-5 h-5" />, title: "ROI em redes sociais: como medir de verdade", style: "educational" },
  ],
  fitness: [
    { icon: <TrendingUp className="w-5 h-5" />, title: "Treino funcional: a tendência que veio para ficar", style: "news" },
    { icon: <Lightbulb className="w-5 h-5" />, title: "5 exercícios que podem ser feitos em casa", style: "tip" },
    { icon: <Newspaper className="w-5 h-5" />, title: "Nutrição e treino: mitos que você ainda acredita", style: "educational" },
  ],
  contabilidade: [
    { icon: <TrendingUp className="w-5 h-5" />, title: "Novas regras fiscais que seu cliente precisa saber", style: "news" },
    { icon: <Lightbulb className="w-5 h-5" />, title: "5 erros contábeis que custam dinheiro", style: "tip" },
    { icon: <Newspaper className="w-5 h-5" />, title: "Planejamento tributário: por onde começar", style: "educational" },
  ],
  beleza: [
    { icon: <TrendingUp className="w-5 h-5" />, title: "Tendências de beleza que estão dominando as redes", style: "news" },
    { icon: <Lightbulb className="w-5 h-5" />, title: "5 cuidados essenciais com a pele no dia a dia", style: "tip" },
    { icon: <Newspaper className="w-5 h-5" />, title: "Como escolher os melhores produtos para seu tipo de pele", style: "educational" },
  ],
  gastronomia: [
    { icon: <TrendingUp className="w-5 h-5" />, title: "Food trends: o que está bombando nos restaurantes", style: "news" },
    { icon: <Lightbulb className="w-5 h-5" />, title: "5 dicas para um cardápio mais rentável", style: "tip" },
    { icon: <Newspaper className="w-5 h-5" />, title: "Como atrair mais clientes pelo Instagram do seu restaurante", style: "educational" },
  ],
  imobiliario: [
    { icon: <TrendingUp className="w-5 h-5" />, title: "Mercado imobiliário: tendências para investidores", style: "news" },
    { icon: <Lightbulb className="w-5 h-5" />, title: "5 dicas para vender imóveis mais rápido", style: "tip" },
    { icon: <Newspaper className="w-5 h-5" />, title: "Como usar redes sociais para captar clientes", style: "educational" },
  ],
};

const NICHES = [
  // Saúde
  { id: "saude", label: "Saúde e Bem-estar", emoji: "🏥" },
  { id: "odontologia", label: "Odontologia", emoji: "🦷" },
  { id: "psicologia", label: "Psicologia e Terapia", emoji: "🧠" },
  { id: "nutricao", label: "Nutrição", emoji: "🥗" },
  { id: "medicina", label: "Medicina e Clínicas", emoji: "⚕️" },
  // Profissões regulamentadas
  { id: "advocacia", label: "Advocacia e Direito", emoji: "⚖️" },
  { id: "contabilidade", label: "Contabilidade e Finanças", emoji: "📊" },
  { id: "arquitetura", label: "Arquitetura e Design", emoji: "📐" },
  { id: "engenharia", label: "Engenharia", emoji: "🔧" },
  // Educação
  { id: "educacao", label: "Educação e Cursos", emoji: "📚" },
  { id: "coaching", label: "Coaching e Mentoria", emoji: "🎯" },
  // Corpo e lifestyle
  { id: "fitness", label: "Fitness e Academia", emoji: "💪" },
  { id: "beleza", label: "Beleza e Estética", emoji: "💅" },
  { id: "moda", label: "Moda e Vestuário", emoji: "👗" },
  // Alimentação
  { id: "gastronomia", label: "Gastronomia e Restaurantes", emoji: "🍽️" },
  { id: "confeitaria", label: "Confeitaria e Doces", emoji: "🧁" },
  // Tech e digital
  { id: "tecnologia", label: "Tecnologia e Software", emoji: "💻" },
  { id: "marketing", label: "Marketing e Publicidade", emoji: "📣" },
  { id: "social_media", label: "Social Media e Influência", emoji: "📱" },
  // Negócios
  { id: "imobiliario", label: "Mercado Imobiliário", emoji: "🏠" },
  { id: "varejo", label: "Varejo e E-commerce", emoji: "🛒" },
  { id: "consultoria", label: "Consultoria Empresarial", emoji: "📋" },
  { id: "financas", label: "Investimentos e Finanças", emoji: "💰" },
  { id: "seguros", label: "Seguros", emoji: "🛡️" },
  // Serviços
  { id: "fotografia", label: "Fotografia e Vídeo", emoji: "📸" },
  { id: "eventos", label: "Eventos e Festas", emoji: "🎉" },
  { id: "turismo", label: "Turismo e Viagens", emoji: "✈️" },
  { id: "pets", label: "Pets e Veterinária", emoji: "🐾" },
  { id: "automotivo", label: "Automotivo", emoji: "🚗" },
  // Indústria
  { id: "agronegocio", label: "Agronegócio", emoji: "🌾" },
  { id: "industria", label: "Indústria e Manufatura", emoji: "🏭" },
  // Outros
  { id: "religioso", label: "Igrejas e Ministérios", emoji: "⛪" },
  { id: "ong", label: "ONGs e Terceiro Setor", emoji: "🤝" },
  { id: "outro", label: "Outro", emoji: "🏢" },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [instagramHandle, setInstagramHandle] = useState("");
  const [selectedNiches, setSelectedNiches] = useState<string[]>([]);
  const [nicheSearch, setNicheSearch] = useState("");
  const [customNiche, setCustomNiche] = useState("");
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [selectedIdea, setSelectedIdea] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        navigate("/auth");
        return;
      }
      setUserId(data.session.user.id);
    });
  }, [navigate]);

  const saveAndAdvance = async () => {
    if (!userId) return;

    if (step === 0) {
      // Save Instagram handle
      const handle = instagramHandle.replace(/^@/, "").trim();
      if (handle) {
        await supabase.from("ai_user_context").upsert({
          user_id: userId,
          instagram_handle: handle,
        }, { onConflict: "user_id" });

        await supabase.from("profiles").upsert({
          user_id: userId,
          instagram_handle: handle,
        }, { onConflict: "user_id" });
      }
      setStep(1);
    } else if (step === 1) {
      // Save niches (join multiple selections)
      const nicheLabels = selectedNiches
        .map(id => id === "outro" ? customNiche : NICHES.find(n => n.id === id)?.label)
        .filter(Boolean);
      const niche = nicheLabels.join(", ") || customNiche;
      if (niche) {
        await supabase.from("ai_user_context").upsert({
          user_id: userId,
          business_niche: niche,
        }, { onConflict: "user_id" });
      }
      setStep(2);
    } else if (step === 2) {
      // Generate content from selected idea
      if (selectedIdea === null) return;
      setIsGenerating(true);

      const primaryNiche = selectedNiches[0] || "default";
      const ideas = NICHE_CONTENT_IDEAS[primaryNiche] || NICHE_CONTENT_IDEAS.default;
      const idea = ideas[selectedIdea];

      try {
        const { data, error } = await supabase.functions.invoke("generate-content", {
          body: {
            trend: {
              title: idea.title,
              description: idea.title,
              theme: selectedNiches.map(id => NICHES.find(n => n.id === id)?.label).filter(Boolean).join(", ") || "Geral",
              keywords: [],
              fullContent: idea.title,
            },
            contentType: "post",
            contentStyle: idea.style,
            platform: "instagram",
            visualMode: "free",
            includeCta: false,
          },
        });

        if (error) throw error;
        if (data?.success && data?.content) {
          setGeneratedContent(data.content);
        }
      } catch (err) {
        console.error("[Onboarding] Generation error:", err);
        toast.error("Erro ao gerar preview. Você pode gerar no chat!");
      } finally {
        setIsGenerating(false);
        setStep(3);
      }
    } else if (step === 3) {
      // Mark onboarding done and go to chat
      await supabase.from("ai_user_context").upsert({
        user_id: userId,
        onboarding_done: true,
      }, { onConflict: "user_id" });

      navigate("/chat");
    }
  };

  const skipToChat = async () => {
    if (!userId) return;
    await supabase.from("ai_user_context").upsert({
      user_id: userId,
      onboarding_done: true,
    }, { onConflict: "user_id" });
    navigate("/chat");
  };

  return (
    <div className="h-[100dvh] bg-background overflow-y-auto">
      {/* Progress */}
      <div className="flex items-center justify-center gap-2 mb-6 pt-6">
        {[0, 1, 2, 3].map((s) => (
          <div
            key={s}
            className={`h-2 rounded-full transition-all ${
              s <= step ? "bg-primary w-12" : "bg-muted w-8"
            }`}
          />
        ))}
      </div>

      <div className="w-full max-w-lg mx-auto px-4">
        {/* Step 0: Instagram Handle */}
        {step === 0 && (
          <div className="text-center space-y-4 animate-in fade-in slide-in-from-bottom-4">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
              <Instagram className="w-7 h-7 text-primary" />
            </div>

            <div>
              <h1 className="text-3xl font-bold mb-2">Bem-vindo ao TrendPulse!</h1>
              <p className="text-muted-foreground text-lg">
                Qual o @ do seu Instagram? Vamos personalizar tudo para você.
              </p>
            </div>

            <Input
              placeholder="@seuperfil"
              value={instagramHandle}
              onChange={(e) => setInstagramHandle(e.target.value)}
              className="text-center text-lg h-14 rounded-xl"
              onKeyDown={(e) => e.key === "Enter" && saveAndAdvance()}
            />

            <div className="flex flex-col gap-3">
              <Button size="lg" className="w-full gap-2 text-base h-14 rounded-xl" onClick={saveAndAdvance}>
                Continuar
                <ArrowRight className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setStep(1)}>
                <SkipForward className="w-4 h-4 mr-1" />
                Pular esta etapa
              </Button>
            </div>
          </div>
        )}

        {/* Step 1: Business Niche */}
        {step === 1 && (
          <div className="text-center space-y-4 animate-in fade-in slide-in-from-bottom-4">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
              <Briefcase className="w-7 h-7 text-primary" />
            </div>

            <div>
              <h1 className="text-3xl font-bold mb-2">Quais são seus nichos?</h1>
              <p className="text-muted-foreground text-lg">
                Selecione um ou mais. Isso ajuda a IA a criar conteúdo relevante.
                {selectedNiches.length > 0 && (
                  <span className="block text-sm text-primary mt-1">{selectedNiches.length} selecionado{selectedNiches.length > 1 ? "s" : ""}</span>
                )}
              </p>
            </div>

            <Input
              placeholder="Buscar nicho..."
              value={nicheSearch}
              onChange={(e) => setNicheSearch(e.target.value)}
              className="text-sm h-10 rounded-xl"
            />

            <div className="grid grid-cols-2 gap-2 text-left max-h-[340px] overflow-y-auto pr-1 scrollbar-thin">
              {NICHES
                .filter((n) => !nicheSearch || n.label.toLowerCase().includes(nicheSearch.toLowerCase()))
                .map((niche) => (
                <button
                  key={niche.id}
                  onClick={() => setSelectedNiches(prev =>
                    prev.includes(niche.id)
                      ? prev.filter(id => id !== niche.id)
                      : [...prev, niche.id]
                  )}
                  className={`p-2.5 rounded-xl border text-sm font-medium transition-all text-left ${
                    selectedNiches.includes(niche.id)
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border hover:border-primary/50 text-foreground"
                  }`}
                >
                  <span className="mr-1.5">{niche.emoji}</span>
                  {niche.label}
                </button>
              ))}
            </div>

            {selectedNiches.includes("outro") && (
              <Input
                placeholder="Descreva seu nicho..."
                value={customNiche}
                onChange={(e) => setCustomNiche(e.target.value)}
                className="text-center text-lg h-14 rounded-xl"
              />
            )}

            <Button
              size="lg"
              className="w-full gap-2 text-base h-14 rounded-xl"
              onClick={saveAndAdvance}
              disabled={selectedNiches.length === 0 || (selectedNiches.includes("outro") && !customNiche.trim())}
            >
              Continuar
              <ArrowRight className="w-5 h-5" />
            </Button>
          </div>
        )}

        {/* Step 2: Pick a content idea — THE AHA MOMENT */}
        {step === 2 && (
          <div className="text-center space-y-4 animate-in fade-in slide-in-from-bottom-4">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
              <Zap className="w-7 h-7 text-primary" />
            </div>

            <div>
              <h1 className="text-3xl font-bold mb-2">Veja o TrendPulse em ação!</h1>
              <p className="text-muted-foreground text-lg">
                Escolha um tema e a IA vai criar um post completo para você em segundos.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              {(NICHE_CONTENT_IDEAS[selectedNiches[0]] || NICHE_CONTENT_IDEAS.default).map((idea, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedIdea(i)}
                  disabled={isGenerating}
                  className={`flex items-center gap-4 p-4 rounded-xl border text-left transition-all ${
                    selectedIdea === i
                      ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                      : "border-border hover:border-primary/50"
                  } ${isGenerating ? "opacity-50" : ""}`}
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    selectedIdea === i ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                  }`}>
                    {idea.icon}
                  </div>
                  <p className="text-sm font-medium">{idea.title}</p>
                </button>
              ))}
            </div>

            {/* Live mockup preview — instant, no API */}
            {selectedIdea !== null && (
              <div className="animate-in fade-in zoom-in-95 duration-300">
                <p className="text-xs text-muted-foreground mb-3">Preview de como ficaria:</p>
                <PostMockup
                  headline={(NICHE_CONTENT_IDEAS[selectedNiches[0]] || NICHE_CONTENT_IDEAS.default)[selectedIdea].title}
                  niche={selectedNiches[0] || "default"}
                />
              </div>
            )}

            <Button
              size="lg"
              className="w-full gap-2 text-base h-14 rounded-xl"
              onClick={saveAndAdvance}
              disabled={selectedIdea === null || isGenerating}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Gerando conteúdo completo...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Gerar conteúdo completo com IA
                </>
              )}
            </Button>
          </div>
        )}

        {/* Step 3: Result — Show generated content + CTA */}
        {step === 3 && (
          <div className="text-center space-y-4 animate-in fade-in slide-in-from-bottom-4">
            <div className="w-14 h-14 rounded-2xl bg-green-500/10 flex items-center justify-center mx-auto">
              <CheckCircle className="w-7 h-7 text-green-500" />
            </div>

            <div>
              <h1 className="text-3xl font-bold mb-2">
                {generatedContent ? "Seu conteúdo está pronto!" : "Tudo pronto!"}
              </h1>
              <p className="text-muted-foreground text-lg">
                {generatedContent
                  ? "Este é o tipo de conteúdo que o TrendPulse cria para você."
                  : "Vamos começar a criar conteúdo incrível."}
              </p>
            </div>

            {/* Show generated content as platform mockup */}
            {generatedContent && (
              <div className="space-y-4">
                <PostMockup
                  headline={generatedContent.slides?.[0]?.headline || generatedContent.title}
                  niche={selectedNiches[0] || "default"}
                />
                <div className="bg-muted/50 rounded-xl p-4 text-left space-y-2">
                  <p className="text-xs font-semibold text-foreground">Legenda gerada:</p>
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4">
                    {generatedContent.caption?.substring(0, 250)}...
                  </p>
                  {generatedContent.hashtags?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {generatedContent.hashtags.slice(0, 5).map((tag: string, i: number) => (
                        <span key={i} className="text-[10px] text-primary">
                          {tag.startsWith("#") ? tag : `#${tag}`}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Fallback when generation failed */}
            {!generatedContent && (
              <div className="space-y-4">
                <PostMockup
                  headline={(NICHE_CONTENT_IDEAS[selectedNiches[0]] || NICHE_CONTENT_IDEAS.default)[selectedIdea || 0]?.title || "Seu conteúdo aqui"}
                  niche={selectedNiches[0] || "default"}
                />
                <p className="text-xs text-muted-foreground">No chat você gera conteúdos completos com imagem, legenda e hashtags.</p>
              </div>
            )}

            {/* Brand creation CTA — strong messaging */}
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 text-left space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Palette className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Crie sua marca para conteúdo personalizado</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed mt-1">
                    No chat, diga <strong>"criar minha marca"</strong> e envie <strong>exemplos de posts</strong> que
                    você já fez ou que goste o estilo. A IA vai copiar as cores, fontes e layout
                    e todo conteúdo será gerado com a cara do seu negócio.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                  <Instagram className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Conecte suas redes sociais</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed mt-1">
                    Em <strong>Meu Perfil</strong>, conecte Instagram e LinkedIn para agendar e publicar direto pela plataforma.
                  </p>
                </div>
              </div>
            </div>

            <Button
              size="lg"
              className="w-full gap-2 text-base h-14 rounded-xl"
              onClick={saveAndAdvance}
            >
              <Sparkles className="w-5 h-5" />
              Ir para o chat e criar mais
            </Button>
          </div>
        )}
      </div>

      <div className="h-8" />
    </div>
  );
}
