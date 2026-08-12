import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { rememberAccount } from "@/lib/savedAccounts";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { BackgroundGenerationProvider } from "@/contexts/BackgroundGenerationContext";
import { useAccountType } from "@/hooks/useAccountType";
import DashboardLayout from "@/components/layout/DashboardLayout";

/**
 * DIVISÃO DO BUNDLE — o que o visitante ANÔNIMO baixa vs. o resto.
 *
 * Tudo era importado estaticamente: um único chunk de 2,8 MB. Quem caía na home vindo do TikTok
 * baixava o calendário, o gerador de PDF e o html2canvas antes mesmo de ter conta — LCP e TBT na
 * boca exata do funil, no aparelho mais fraco e na rede mais lenta.
 *
 * ESTÁTICO (chunk inicial): só o que uma pessoa deslogada pode ver — landing, login, recuperação
 * de senha, preços, privacidade, resgate de cupom (link do email pós-compra) e o 404. Se qualquer
 * um destes virar lazy, a primeira tela pisca um fallback à toa.
 *
 * LAZY: todo o resto. São telas atrás de login, então a pessoa já está engajada quando o chunk
 * carrega, e a espera some atrás da própria navegação.
 */
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Pricing from "./pages/Pricing";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import RedeemCoupon from "./pages/RedeemCoupon";
import NotFound from "./pages/NotFound";

// Landing em avaliação. Lazy porque é rota de comparação, não o caminho de ninguém que chega
// pela home — não tem por que pesar no chunk inicial.
const LandingNova = lazy(() => import("./pages/LandingNova"));

const ContentPreview = lazy(() => import("./pages/ContentPreview"));
const DownloadPage = lazy(() => import("./pages/Download"));       // puxa jsPDF + html2canvas
const Contents = lazy(() => import("./pages/Contents"));
const Profile = lazy(() => import("./pages/Profile"));
const BrandWizard = lazy(() => import("./pages/BrandWizard"));
const Brands = lazy(() => import("./pages/Brands"));
const BrandEdit = lazy(() => import("./pages/BrandEdit"));
const Calendar = lazy(() => import("./pages/Calendar"));
const ChatPage = lazy(() => import("./pages/ChatPage"));
const Studio = lazy(() => import("./pages/Studio"));
const AgentChat = lazy(() => import("./pages/AgentChat"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const AdminAnalytics = lazy(() => import("./pages/AdminAnalytics"));

/** Fallback do Suspense: mesmo visual do gate do useAccountType, pra a troca não piscar diferente. */
const CarregandoTela = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <div className="animate-pulse text-primary">Carregando...</div>
  </div>
);

const queryClient = new QueryClient();

// white_glove é o PADRÃO ÚNICO em produção (decisão 2026-06-09). A árvore self_serve/
// template-first foi removida do bundle; o código vive na branch backup/self-serve.
const RoutedApp = () => {
  const { loading } = useAccountType();

  // Salva a conta no switcher multi-conta sempre que uma sessão é estabelecida.
  //
  // Vive AQUI, e não no Auth.tsx, por causa do login com Google: ele volta por redirect direto pro
  // /onboarding, então o Auth.tsx nunca chega a rodar e quem entrasse com Google simplesmente sumia
  // da lista de contas salvas. Um listener na raiz cobre todo caminho de entrada de uma vez.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") rememberAccount(session);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-primary">Carregando...</div>
      </div>
    );
  }

  return (
    // Suspense envolve TODAS as rotas, não cada lazy: as estáticas não suspendem (já estão no
    // chunk inicial), então um único boundary aqui basta e evita 14 wrappers repetidos.
    <Suspense fallback={<CarregandoTela />}>
    <Routes>
      <Route path="/" element={<Index />} />
      {/* Direção "Ateliê" em avaliação, ao lado da / que continua no ar. Ver LandingNova.tsx. */}
      <Route path="/landing-nova" element={<LandingNova />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/content/:id" element={<ContentPreview />} />
      <Route path="/download/:id" element={<DownloadPage />} />
      <Route path="/contents" element={<Contents />} />
      <Route path="/profile" element={<DashboardLayout><Profile /></DashboardLayout>} />
      <Route path="/calendar" element={<Calendar />} />
      <Route path="/brands" element={<Brands />} />
      <Route path="/brands/new" element={<BrandWizard />} />
      <Route path="/brands/:id/edit" element={<BrandEdit />} />
      <Route path="/chat" element={<ChatPage />} />
      <Route path="/studio" element={<Studio />} />
      <Route path="/agent" element={<DashboardLayout><AgentChat /></DashboardLayout>} />
      <Route path="/analytics" element={<Analytics />} />
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      {/* Pública de propósito: é o link do email pós-compra e precisa abrir pra quem ainda não tem conta. */}
      <Route path="/resgatar" element={<RedeemCoupon />} />
      <Route path="/admin" element={<AdminAnalytics />} />

      {/* Rotas legadas → destino atual.
          Corrigir os links no código (commit 4cf98af) não conserta quem JÁ tem essas URLs no
          histórico do navegador, em bookmark ou em email antigo: o botão "voltar" continua caindo
          nelas e batendo em 404. Redirect com replace pra não empilhar entrada nova no histórico. */}
      <Route path="/dashboard" element={<Navigate to="/agent" replace />} />
      <Route path="/dashboard/*" element={<Navigate to="/agent" replace />} />
      <Route path="/calendario" element={<Navigate to="/calendar" replace />} />
      <Route path="/conteudos" element={<Navigate to="/contents" replace />} />
      <Route path="/marcas" element={<Navigate to="/brands" replace />} />
      <Route path="/perfil" element={<Navigate to="/profile" replace />} />

      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
      <Route path="*" element={<NotFound />} />
    </Routes>
    </Suspense>
  );
};

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
           <BackgroundGenerationProvider>
              <RoutedApp />
          </BackgroundGenerationProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
