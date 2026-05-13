import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { BackgroundGenerationProvider } from "@/contexts/BackgroundGenerationContext";
import { useAccountType } from "@/hooks/useAccountType";
import SelfServeLayout from "@/components/layout/SelfServeLayout";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import ContentPreview from "./pages/ContentPreview";
import DownloadPage from "./pages/Download";
import Contents from "./pages/Contents";
import Profile from "./pages/Profile";
import BrandWizard from "./pages/BrandWizard";
import Studio from "./pages/Studio";
import StudioProject from "./pages/StudioProject";
import StudioPostEditor from "./pages/StudioPostEditor";
import Brands from "./pages/Brands";
import BrandNew from "./pages/BrandNew";
import BrandEdit from "./pages/BrandEdit";
import Calendar from "./pages/Calendar";
import InstagramCallback from "./pages/InstagramCallback";
import InstagramHistory from "./pages/InstagramHistory";
import ChatPage from "./pages/ChatPage";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import LinkedInCallback from "./pages/LinkedInCallback";
import Pricing from "./pages/Pricing";
import Analytics from "./pages/Analytics";
import Onboarding from "./pages/Onboarding";
import AdminAnalytics from "./pages/AdminAnalytics";
import SelfServePlaceholder from "./pages/SelfServePlaceholder";
import Discover from "./pages/Discover";
import TemplateGenerator from "./pages/TemplateGenerator";
import Library from "./pages/Library";
import Templates from "./pages/Templates";
import SelfServeOnboarding from "./pages/SelfServeOnboarding";

const queryClient = new QueryClient();

// Routing fork: white_glove (existentes / Maikon) vê todas as rotas atuais; self_serve vê placeholder
// até a Fase 1 do refactor ficar pronta. Visitantes deslogados sempre veem rotas públicas.
const RoutedApp = () => {
  const { accountType, loading, isAuthenticated } = useAccountType();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-primary">Carregando...</div>
      </div>
    );
  }

  if (isAuthenticated && accountType === "self_serve") {
    return (
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/auth/instagram/callback" element={<InstagramCallback />} />
        <Route path="/auth/linkedin/callback" element={<LinkedInCallback />} />
        {/* Fase 1: rotas template-first ativas. Fase 2: Library adicionada. */}
        <Route path="/onboarding" element={<SelfServeOnboarding />} />
        <Route path="/discover" element={<SelfServeLayout><Discover /></SelfServeLayout>} />
        <Route path="/templates/:slug" element={<SelfServeLayout><TemplateGenerator /></SelfServeLayout>} />
        <Route path="/library" element={<SelfServeLayout><Library /></SelfServeLayout>} />
        <Route path="/profile" element={<SelfServeLayout><Profile /></SelfServeLayout>} />
        <Route path="*" element={<SelfServeLayout><SelfServePlaceholder /></SelfServeLayout>} />
      </Routes>
    );
  }

  // Default: white_glove + visitantes deslogados — rotas atuais inalteradas.
  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/content/:id" element={<ContentPreview />} />
      <Route path="/download/:id" element={<DownloadPage />} />
      <Route path="/contents" element={<Contents />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/templates" element={<Templates />} />
      <Route path="/studio" element={<Studio />} />
      <Route path="/studio/project/:id" element={<StudioProject />} />
      <Route path="/studio/post/:id" element={<StudioPostEditor />} />
      <Route path="/calendar" element={<Calendar />} />
      <Route path="/brands" element={<Brands />} />
      <Route path="/brands/new" element={<BrandWizard />} />
      <Route path="/brands/new/simple" element={<BrandNew />} />
      <Route path="/brands/:id/edit" element={<BrandEdit />} />
      <Route path="/auth/instagram/callback" element={<InstagramCallback />} />
      <Route path="/auth/linkedin/callback" element={<LinkedInCallback />} />
      <Route path="/instagram/history" element={<InstagramHistory />} />
      <Route path="/chat" element={<ChatPage />} />
      <Route path="/analytics" element={<Analytics />} />
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/admin" element={<AdminAnalytics />} />
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
