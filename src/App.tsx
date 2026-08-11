import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { BackgroundGenerationProvider } from "@/contexts/BackgroundGenerationContext";
import { useAccountType } from "@/hooks/useAccountType";
import DashboardLayout from "@/components/layout/DashboardLayout";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ContentPreview from "./pages/ContentPreview";
import DownloadPage from "./pages/Download";
import Contents from "./pages/Contents";
import Profile from "./pages/Profile";
import BrandWizard from "./pages/BrandWizard";
import Brands from "./pages/Brands";
import BrandEdit from "./pages/BrandEdit";
import Calendar from "./pages/Calendar";
import ChatPage from "./pages/ChatPage";
import Studio from "./pages/Studio";
import AgentChat from "./pages/AgentChat";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import Pricing from "./pages/Pricing";
import Analytics from "./pages/Analytics";
import Onboarding from "./pages/Onboarding";
import AdminAnalytics from "./pages/AdminAnalytics";
import RedeemCoupon from "./pages/RedeemCoupon";

const queryClient = new QueryClient();

// white_glove é o PADRÃO ÚNICO em produção (decisão 2026-06-09). A árvore self_serve/
// template-first foi removida do bundle; o código vive na branch backup/self-serve.
const RoutedApp = () => {
  const { loading } = useAccountType();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-primary">Carregando...</div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Index />} />
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
