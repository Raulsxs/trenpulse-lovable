import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { TrendingUp, ArrowRight, Sparkles, Instagram, Linkedin } from "lucide-react";
import { ChatMockup } from "@/components/landing/ChatMockup";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { FeatureShowcase } from "@/components/landing/FeatureShowcase";
import { ResultGallery } from "@/components/landing/ResultGallery";
import { PricingSection } from "@/components/landing/PricingSection";

const Index = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        navigate("/chat");
      }
      setIsLoading(false);
    };
    checkAuth();
  }, [navigate]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-primary">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ── */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="container mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-primary rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <span className="font-heading font-bold text-xl text-foreground">TrendPulse</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#como-funciona" className="hover:text-foreground transition-colors">Como funciona</a>
            <a href="#recursos" className="hover:text-foreground transition-colors">Recursos</a>
            <a href="#exemplos" className="hover:text-foreground transition-colors">Exemplos</a>
            <a href="#precos" className="hover:text-foreground transition-colors">Preços</a>
          </nav>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/auth")}>
              Entrar
            </Button>
            <Button size="sm" onClick={() => navigate("/auth")} className="gap-1.5">
              Começar Grátis
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="pt-28 pb-16 md:pt-36 md:pb-24 px-6">
        <div className="container mx-auto max-w-6xl">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Left: Copy */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-1.5 rounded-full text-xs font-medium mb-6">
                <Sparkles className="w-3 h-3" />
                Geração de conteúdo com IA
              </div>

              <h1 className="font-heading text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-6 leading-[1.1]">
                Digite o tema.{" "}
                <span className="text-transparent bg-clip-text bg-gradient-primary">
                  A IA cria o post.
                </span>
              </h1>

              <p className="text-lg text-muted-foreground mb-8 max-w-lg leading-relaxed">
                Cole um link, escreva uma frase ou escolha um tema. Em segundos,
                o TrendPulse gera posts, carrosséis e stories com a identidade visual
                da sua marca — prontos para publicar.
              </p>

              <div className="flex flex-col sm:flex-row gap-3">
                <Button size="lg" className="gap-2 text-base px-6" onClick={() => navigate("/auth")}>
                  Criar Conta Grátis
                  <ArrowRight className="w-5 h-5" />
                </Button>
                <Button size="lg" variant="outline" className="text-base px-6 gap-2" onClick={() => {
                  document.getElementById("exemplos")?.scrollIntoView({ behavior: "smooth" });
                }}>
                  Ver Exemplos
                </Button>
              </div>

              <div className="flex items-center gap-4 mt-8 text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Instagram className="w-4 h-4" />
                  Instagram
                </div>
                <div className="flex items-center gap-1.5">
                  <Linkedin className="w-4 h-4" />
                  LinkedIn
                </div>
                <span className="text-xs">5 gerações grátis • Sem cartão</span>
              </div>
            </motion.div>

            {/* Right: Chat mockup */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              <ChatMockup />
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Social proof bar ── */}
      <section className="py-6 border-y border-border/50 bg-muted/20">
        <div className="container mx-auto px-6">
          <div className="flex flex-wrap items-center justify-center gap-8 md:gap-16 text-center">
            <Stat value="Posts, Carrosséis, Stories" label="Todos os formatos" />
            <Stat value="Instagram & LinkedIn" label="Publicação direta" />
            <Stat value="< 30s" label="Tempo de geração" />
            <Stat value="Sua marca" label="Identidade visual preservada" />
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="como-funciona" className="py-20 px-6">
        <div className="container mx-auto max-w-5xl">
          <SectionHeader
            title="Como funciona"
            subtitle="3 passos para transformar qualquer ideia em conteúdo profissional"
          />
          <HowItWorks />
        </div>
      </section>

      {/* ── Features ── */}
      <section id="recursos" className="py-20 px-6 bg-muted/20">
        <div className="container mx-auto max-w-6xl">
          <SectionHeader
            title="Tudo que você precisa"
            subtitle="Ferramentas pensadas para quem cria conteúdo profissionalmente"
          />
          <FeatureShowcase />
        </div>
      </section>

      {/* ── Use cases ── */}
      <section className="py-20 px-6">
        <div className="container mx-auto max-w-6xl">
          <SectionHeader
            title="Para todo tipo de criador"
            subtitle="De coaches a agências, médicos a marketers — o TrendPulse se adapta ao seu nicho"
          />
          <div className="grid md:grid-cols-3 gap-6">
            <UseCaseCard
              emoji="🩺"
              title="Profissionais de Saúde"
              examples={["Posts sobre estudos recentes", "Frases motivacionais com foto profissional", "Carrosséis educativos sobre saúde"]}
            />
            <UseCaseCard
              emoji="🎯"
              title="Coaches & Consultores"
              examples={["Frases de impacto com design elegante", "Documentos LinkedIn sobre frameworks", "Dicas rápidas para o feed"]}
            />
            <UseCaseCard
              emoji="📱"
              title="Agências & Social Media"
              examples={["Múltiplas marcas, um lugar só", "Conteúdo a partir de links/notícias", "Calendário editorial integrado"]}
            />
          </div>
        </div>
      </section>

      {/* ── Results gallery ── */}
      <section id="exemplos" className="py-20 px-6 bg-muted/20">
        <div className="container mx-auto max-w-6xl">
          <SectionHeader
            title="Resultados reais"
            subtitle="Conteúdos gerados pelo TrendPulse — prontos para publicar"
          />
          {/* Placeholder note */}
          <p className="text-center text-xs text-muted-foreground mb-6 italic">
            Mockups ilustrativos — substitua por prints reais da plataforma
          </p>
          <ResultGallery />
        </div>
      </section>

      {/* ── Demo section ── */}
      <section className="py-20 px-6">
        <div className="container mx-auto max-w-4xl">
          <SectionHeader
            title="Veja em ação"
            subtitle="Do tema ao post pronto em menos de 30 segundos"
          />
          {/* Video/GIF placeholder */}
          <div className="aspect-video bg-muted/50 rounded-xl border border-border flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <div className="w-0 h-0 border-t-8 border-b-8 border-l-12 border-transparent border-l-primary ml-1" />
              </div>
              <p className="text-sm text-muted-foreground">Grave um vídeo demonstrativo da plataforma</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Coloque em public/landing/demo.mp4</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="precos" className="py-20 px-6 bg-muted/20">
        <div className="container mx-auto">
          <SectionHeader
            title="Planos simples, sem surpresa"
            subtitle="Comece grátis. Escale quando precisar."
          />
          <PricingSection />
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="py-24 px-6 bg-gradient-to-r from-primary to-primary/80">
        <div className="container mx-auto max-w-3xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="font-heading text-3xl md:text-4xl font-bold text-white mb-4">
              Seu próximo post está a 30 segundos de distância
            </h2>
            <p className="text-lg text-white/80 mb-8 max-w-xl mx-auto">
              Crie sua conta grátis agora e gere seu primeiro conteúdo com IA. Sem cartão de crédito.
            </p>
            <Button
              size="lg"
              variant="secondary"
              className="text-lg px-8 gap-2"
              onClick={() => navigate("/auth")}
            >
              Começar Agora — É Grátis
              <ArrowRight className="w-5 h-5" />
            </Button>
          </motion.div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-10 px-6 border-t border-border">
        <div className="container mx-auto max-w-6xl">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-gradient-primary rounded-md flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-white" />
              </div>
              <span className="font-heading font-bold text-foreground">TrendPulse</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <button onClick={() => navigate("/privacy")} className="hover:text-foreground transition-colors">
                Privacidade
              </button>
              <button onClick={() => navigate("/pricing")} className="hover:text-foreground transition-colors">
                Preços
              </button>
              <a href="mailto:raul@trendpulse.app" className="hover:text-foreground transition-colors">
                Contato
              </a>
            </div>
            <p className="text-xs text-muted-foreground">
              © 2026 TrendPulse. Todos os direitos reservados.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4 }}
      className="text-center mb-12"
    >
      <h2 className="font-heading text-3xl md:text-4xl font-bold text-foreground mb-3">{title}</h2>
      <p className="text-muted-foreground max-w-2xl mx-auto">{subtitle}</p>
    </motion.div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="font-heading font-semibold text-foreground text-sm">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function UseCaseCard({ emoji, title, examples }: { emoji: string; title: string; examples: string[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4 }}
      className="bg-card border border-border/60 rounded-xl p-6"
    >
      <span className="text-3xl mb-3 block">{emoji}</span>
      <h3 className="font-heading font-semibold text-lg text-foreground mb-3">{title}</h3>
      <ul className="space-y-2">
        {examples.map((ex) => (
          <li key={ex} className="text-sm text-muted-foreground flex items-start gap-2">
            <span className="text-primary mt-1">•</span>
            {ex}
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

export default Index;
