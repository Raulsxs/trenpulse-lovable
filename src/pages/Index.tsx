import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { TrendingUp, Sparkles, Zap, Target, ArrowRight } from "lucide-react";

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
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-primary rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <span className="font-heading font-bold text-xl text-foreground">TrendPulse</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => navigate("/auth")}>
              Entrar
            </Button>
            <Button onClick={() => navigate("/auth")} className="gap-2">
              Começar Grátis
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6">
        <div className="container mx-auto max-w-5xl text-center">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-6">
            <Sparkles className="w-4 h-4" />
            Potencializado por Inteligência Artificial
          </div>
          
          <h1 className="font-heading text-4xl md:text-6xl font-bold text-foreground mb-6 leading-tight">
            Transforme Tendências em{" "}
            <span className="text-transparent bg-clip-text bg-gradient-primary">
              Conteúdo de Alto Impacto
            </span>
          </h1>
          
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
            Plataforma SaaS que monitora tendências do seu setor e gera automaticamente 
            posts, stories e carrosséis prontos para publicar no Instagram.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" className="gap-2 text-lg px-8" onClick={() => navigate("/auth")}>
              Começar Agora
              <ArrowRight className="w-5 h-5" />
            </Button>
            <Button size="lg" variant="outline" className="text-lg px-8" onClick={() => navigate("/pricing")}>
              Ver Planos
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-6 bg-muted/30">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="font-heading text-3xl md:text-4xl font-bold text-foreground mb-4">
              Como Funciona
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Em apenas 3 passos, você transforma as últimas notícias em conteúdo engajador
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard 
              icon={<TrendingUp className="w-8 h-8" />}
              step="01"
              title="Monitore Tendências"
              description="Coletamos automaticamente as principais notícias e tendências do seu setor de fontes confiáveis."
            />
            <FeatureCard 
              icon={<Sparkles className="w-8 h-8" />}
              step="02"
              title="Gere Conteúdo com IA"
              description="Nossa IA cria textos, legendas e imagens personalizadas para seu público-alvo."
            />
            <FeatureCard 
              icon={<Zap className="w-8 h-8" />}
              step="03"
              title="Publique e Engaje"
              description="Baixe o conteúdo pronto e publique diretamente no Instagram com um clique."
            />
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20 px-6">
        <div className="container mx-auto max-w-6xl">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="font-heading text-3xl md:text-4xl font-bold text-foreground mb-6">
                Feito para Criadores e Negócios
              </h2>
              <div className="space-y-4">
                <BenefitItem 
                  icon={<Target className="w-5 h-5 text-primary" />}
                  text="Conteúdo especializado para o seu nicho de atuação"
                />
                <BenefitItem 
                  icon={<Target className="w-5 h-5 text-primary" />}
                  text="Economize até 10 horas por semana na criação de posts"
                />
                <BenefitItem 
                  icon={<Target className="w-5 h-5 text-primary" />}
                  text="Mantenha-se atualizado com as últimas tendências do mercado"
                />
                <BenefitItem 
                  icon={<Target className="w-5 h-5 text-primary" />}
                  text="Imagens profissionais geradas automaticamente"
                />
              </div>
              <Button size="lg" className="mt-8 gap-2" onClick={() => navigate("/auth")}>
                Experimentar Grátis
                <ArrowRight className="w-5 h-5" />
              </Button>
            </div>
            <div className="relative">
              <div className="bg-gradient-to-br from-primary/20 to-accent/20 rounded-2xl p-8 aspect-square flex items-center justify-center">
                <div className="bg-card rounded-xl shadow-card-hover p-6 max-w-xs transform rotate-3 hover:rotate-0 transition-transform">
                  <div className="h-2 w-full bg-score-high rounded mb-4" />
                  <div className="h-4 w-3/4 bg-muted rounded mb-2" />
                  <div className="h-3 w-full bg-muted/50 rounded mb-4" />
                  <div className="flex gap-2">
                    <div className="h-6 w-16 bg-primary/20 rounded" />
                    <div className="h-6 w-20 bg-accent/20 rounded" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6 bg-gradient-primary">
        <div className="container mx-auto max-w-4xl text-center">
          <h2 className="font-heading text-3xl md:text-4xl font-bold text-white mb-6">
            Pronto para Revolucionar seu Marketing?
          </h2>
          <p className="text-lg text-white/80 mb-8 max-w-2xl mx-auto">
            Junte-se a centenas de criadores e negócios que já estão economizando tempo e gerando mais engajamento.
          </p>
          <Button 
            size="lg" 
            variant="secondary" 
            className="text-lg px-8 gap-2"
            onClick={() => navigate("/auth")}
          >
            Criar Conta Gratuita
            <ArrowRight className="w-5 h-5" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-border">
        <div className="container mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-gradient-primary rounded-md flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-white" />
            </div>
            <span className="font-heading font-semibold text-foreground">TrendPulse</span>
          </div>
          <p className="text-sm text-muted-foreground">
            © 2025 TrendPulse. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
};

const FeatureCard = ({ icon, step, title, description }: { 
  icon: React.ReactNode; 
  step: string;
  title: string; 
  description: string; 
}) => (
  <div className="bg-card rounded-xl p-6 shadow-card hover:shadow-card-hover transition-all border border-border/50 group">
    <div className="flex items-center gap-4 mb-4">
      <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors">
        {icon}
      </div>
      <span className="text-4xl font-heading font-bold text-muted-foreground/30">{step}</span>
    </div>
    <h3 className="font-heading font-semibold text-xl text-foreground mb-2">{title}</h3>
    <p className="text-muted-foreground">{description}</p>
  </div>
);

const BenefitItem = ({ icon, text }: { icon: React.ReactNode; text: string }) => (
  <div className="flex items-start gap-3">
    <div className="mt-0.5">{icon}</div>
    <p className="text-foreground">{text}</p>
  </div>
);

export default Index;