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

  // Redirect new users to onboarding
  useEffect(() => {
    if (!user || location.pathname === "/onboarding" || location.pathname === "/pricing") return;

    supabase
      .from("ai_user_context")
      .select("onboarding_done")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        // Redirect if onboarding not completed (regardless of niche being set)
        if (!data || !data.onboarding_done) {
          navigate("/onboarding");
        }
      });
  }, [user, location.pathname, navigate]);

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
    </div>
  );
};

export default DashboardLayout;
