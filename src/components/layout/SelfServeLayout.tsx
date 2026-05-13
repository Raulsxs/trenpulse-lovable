import { ReactNode, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Menu, Compass, BookOpen, User, LogOut, TrendingUp } from "lucide-react";
import { toast } from "sonner";

const navItems = [
  { icon: Compass, label: "Descobrir", href: "/discover" },
  { icon: BookOpen, label: "Biblioteca", href: "/library" },
  { icon: User, label: "Perfil", href: "/profile" },
];

function SelfServeSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("Erro ao sair");
    } else {
      toast.success("Você saiu da conta");
      navigate("/auth");
    }
  };

  return (
    <aside className="w-64 h-full min-h-0 gradient-sidebar border-r border-sidebar-border flex flex-col overflow-hidden">
      <div className="shrink-0 p-6 border-b border-sidebar-border">
        <Link to="/discover" className="flex items-center gap-3">
          <div className="w-10 h-10 bg-sidebar-primary rounded-lg flex items-center justify-center">
            <TrendingUp className="w-6 h-6 text-white" />
          </div>
          <span className="text-xl font-heading font-bold text-sidebar-foreground">TrendPulse</span>
        </Link>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const isActive =
            location.pathname === item.href ||
            (item.href !== "/discover" && location.pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-sidebar-border p-4">
        {showLogoutConfirm ? (
          <div className="px-2 py-2 rounded-lg bg-destructive/10 border border-destructive/20">
            <p className="text-xs text-destructive font-medium mb-2 px-1">
              Você realmente deseja sair?
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" onClick={handleLogout} className="flex-1 h-7 text-xs">
                Sair
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowLogoutConfirm(false)} className="flex-1 h-7 text-xs">
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="ghost"
            onClick={() => setShowLogoutConfirm(true)}
            className="w-full justify-start gap-3 px-4 py-3 h-auto text-sm text-sidebar-foreground/70 hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="w-5 h-5" />
            Sair
          </Button>
        )}
      </div>
    </aside>
  );
}

export default function SelfServeLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) {
        navigate("/auth");
      } else {
        setUser(session.user);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      if (!session?.user) navigate("/auth");
      else setUser(session.user);
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  // Redirect new self_serve users to onboarding — same pattern as DashboardLayout lines 47-62
  useEffect(() => {
    if (!user || location.pathname === "/onboarding") return;

    supabase
      .from("ai_user_context")
      .select("onboarding_done")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data || !data.onboarding_done) {
          navigate("/onboarding");
        }
      });
  }, [user, location.pathname, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className="flex flex-col h-screen bg-background overflow-hidden">
        <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-border bg-background/95 backdrop-blur-sm z-30">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => setSidebarOpen(true)}>
            <Menu className="w-5 h-5" />
          </Button>
          <span className="text-lg font-heading font-bold text-foreground">TrendPulse</span>
        </div>
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="left" className="p-0 w-72">
            <SelfServeSidebar />
          </SheetContent>
        </Sheet>
        <main className="flex-1 min-h-0 bg-background overflow-y-auto overflow-x-hidden">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <SelfServeSidebar />
      <main className="flex-1 min-h-0 bg-background overflow-y-auto overflow-x-hidden scrollbar-thin">
        {children}
      </main>
    </div>
  );
}
