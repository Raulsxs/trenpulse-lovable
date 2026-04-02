import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { BackgroundGenerationProvider } from "@/contexts/BackgroundGenerationContext";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import ContentPreview from "./pages/ContentPreview";
import DownloadPage from "./pages/Download";
import Contents from "./pages/Contents";
import Profile from "./pages/Profile";
// StyleGallery removed — brand visuals now in chat brand selection
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

const queryClient = new QueryClient();

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
           <BackgroundGenerationProvider>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/content/:id" element={<ContentPreview />} />
                <Route path="/download/:id" element={<DownloadPage />} />
                <Route path="/contents" element={<Contents />} />
                <Route path="/profile" element={<Profile />} />
                {/* /styles and /templates removed — gallery deprecated */}
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
          </BackgroundGenerationProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
