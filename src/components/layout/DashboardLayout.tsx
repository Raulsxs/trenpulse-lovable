import { ReactNode, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Sidebar from "./Sidebar";
import { User } from "@supabase/supabase-js";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import FeatureSpotlight from "@/components/showcase/FeatureSpotlight";

interface DashboardLayoutProps {
  children: ReactNode;
}

const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_, session) => {
        setUser(session?.user ?? null);
        setLoading(false);
        if (!session?.user) navigate("/auth");
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
      if (!session?.user) navigate("/auth");
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  // NOTA: o auto-redirect pro /onboarding foi REMOVIDO. Ele rodava em toda navegação e tratava
  // uma falha transitória da query (data:null por race/erro/RLS) como "usuário novo", jogando
  // usuários EXISTENTES pro onboarding por engano (bug recorrente — a flag do Raul era true e mesmo
  // assim ele era redirecionado). Novos cadastros já caem no /onboarding pelo emailRedirectTo do
  // signup; a própria página faz self-guard. Sem redirect forçado aqui = sem bounce indevido.

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const isChatRoute = location.pathname === "/chat";

  // Mobile layout: hamburger + sheet sidebar
  if (isMobile) {
    return (
      <div className="flex flex-col h-screen bg-background overflow-hidden">
        {/* Mobile top bar */}
        <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-border bg-background/95 backdrop-blur-sm z-30">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </Button>
          <span className="text-lg font-heading font-bold text-foreground">TrendPulse</span>
        </div>

        {/* Sidebar as sheet */}
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="left" className="p-0 w-72">
            <Sidebar />
          </SheetContent>
        </Sheet>

        {/* Main content */}
        <main className={cn("flex-1 min-h-0 bg-background", isChatRoute ? "overflow-hidden" : "overflow-y-auto overflow-x-hidden")}>
          {children}
        </main>
        <FeatureSpotlight />
      </div>
    );
  }

  // Desktop layout: fixed sidebar
  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar />
      <main className={cn("flex-1 min-h-0 bg-background scrollbar-thin", isChatRoute ? "overflow-hidden" : "overflow-y-auto overflow-x-hidden")}>
        {children}
      </main>
      <FeatureSpotlight />
    </div>
  );
};

export default DashboardLayout;
