import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useSubscription } from "@/hooks/useSubscription";
import {
  TrendingUp,
  LayoutDashboard,
  FileText,
  User,
  Palette,
  LogOut,
  Sparkles,
  Wand2,
  CalendarDays,
  MessageSquare,
  BarChart3,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { HelpCenterTrigger } from "@/components/onboarding/HelpCenterModal";

const BADGE_DEPLOY_DATE = "2026-03-10";
const BADGE_DURATION_DAYS = 30;

const SAVED_ACCOUNTS_KEY = "tp_saved_accounts";

interface SavedAccount {
  userId: string;
  email: string;
  name: string;
  accessToken: string;
  refreshToken: string;
}

// Primary: what 90% of users need daily
const primaryItems = [
  { icon: MessageSquare, label: "Assistente IA", href: "/chat", showBadge: true },
  { icon: FileText, label: "Meus Conteúdos", href: "/contents" },
  { icon: CalendarDays, label: "Calendário", href: "/calendar" },
];

// Secondary: configuration and insights
const secondaryItems = [
  { icon: Palette, label: "Marcas", href: "/brands" },
  { icon: BarChart3, label: "Analytics", href: "/analytics" },
  { icon: User, label: "Meu Perfil", href: "/profile" },
];

// Advanced: power user tools
const advancedItems = [
  { icon: LayoutDashboard, label: "Explorar Tendências", href: "/dashboard" },
];

const Sidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [showNewBadge, setShowNewBadge] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const { usage } = useSubscription();

  useEffect(() => {
    const dismissed = localStorage.getItem("assistente-ia-badge-dismissed");
    if (dismissed) return;
    const deployDate = new Date(BADGE_DEPLOY_DATE);
    const expiresAt = new Date(deployDate.getTime() + BADGE_DURATION_DAYS * 86400000);
    if (new Date() < expiresAt) {
      setShowNewBadge(true);
    }
  }, []);

  useEffect(() => {
    const saveSession = (session: { user: { id: string; email?: string; user_metadata?: { name?: string } }; access_token: string; refresh_token: string } | null) => {
      if (!session) return;
      const userId = session.user.id;
      const email = session.user.email || "";
      const name = session.user.user_metadata?.name || email.split("@")[0];
      setCurrentUserId(userId);
      const stored: SavedAccount[] = (() => {
        try { return JSON.parse(localStorage.getItem(SAVED_ACCOUNTS_KEY) || "[]"); } catch { return []; }
      })();
      const idx = stored.findIndex(a => a.userId === userId);
      const account: SavedAccount = { userId, email, name, accessToken: session.access_token, refreshToken: session.refresh_token };
      if (idx >= 0) stored[idx] = account; else stored.push(account);
      localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(stored));
      setSavedAccounts(stored);
    };

    supabase.auth.getSession().then(({ data: { session } }) => saveSession(session));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") {
        saveSession(session);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleDismissBadge = () => {
    localStorage.setItem("assistente-ia-badge-dismissed", "true");
    setShowNewBadge(false);
  };

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("Erro ao sair");
    } else {
      // Remove current account from saved accounts list
      const updated = savedAccounts.filter(a => a.userId !== currentUserId);
      localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(updated));
      toast.success("Você saiu da conta");
      navigate("/auth");
    }
  };

  const handleAddAccount = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const userId = session.user.id;
      const email = session.user.email || "";
      const name = session.user.user_metadata?.name || email.split("@")[0];
      const stored: SavedAccount[] = (() => {
        try { return JSON.parse(localStorage.getItem(SAVED_ACCOUNTS_KEY) || "[]"); } catch { return []; }
      })();
      const idx = stored.findIndex(a => a.userId === userId);
      const account: SavedAccount = { userId, email, name, accessToken: session.access_token, refreshToken: session.refresh_token };
      if (idx >= 0) stored[idx] = account; else stored.push(account);
      localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(stored));
    }
    await supabase.auth.signOut({ scope: "local" });
    navigate("/auth");
  };

  const handleSwitchAccount = async (account: SavedAccount) => {
    try {
      const { error } = await supabase.auth.setSession({
        access_token: account.accessToken,
        refresh_token: account.refreshToken,
      });
      if (error) throw error;
      toast.success(`Trocado para ${account.name}`);
      window.location.href = "/chat";
    } catch {
      toast.error("Sessão expirada. Faça login novamente.");
      const updated = savedAccounts.filter(a => a.userId !== account.userId);
      localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(updated));
      setSavedAccounts(updated);
    }
  };

  return (
    <aside className="w-64 h-full min-h-0 gradient-sidebar border-r border-sidebar-border flex flex-col overflow-hidden">
      {/* Logo */}
      <div className="shrink-0 p-6 border-b border-sidebar-border">
        <Link to="/chat" className="flex items-center gap-3">
          <div className="w-10 h-10 bg-sidebar-primary rounded-lg flex items-center justify-center">
            <TrendingUp className="w-6 h-6 text-white" />
          </div>
          <span className="text-xl font-heading font-bold text-sidebar-foreground">
            TrendPulse
          </span>
        </Link>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
        {/* Navigation */}
        <nav className="p-4 space-y-1" data-onboarding="sidebar-nav">
          {/* Primary — daily use */}
          {primaryItems.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.href}
                to={item.href}
                onClick={() => {
                  if (item.showBadge && showNewBadge) handleDismissBadge();
                }}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-primary"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
                {item.showBadge && showNewBadge && (
                  <span className="ml-auto text-[10px] font-bold bg-destructive text-destructive-foreground px-1.5 py-0.5 rounded-full leading-none">
                    NOVO
                  </span>
                )}
              </Link>
            );
          })}

          {/* Divider */}
          <div className="pt-3 pb-1 px-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">Configurar</p>
          </div>

          {/* Secondary — configuration & insights */}
          {secondaryItems.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-primary"
                    : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}

          {/* Divider */}
          <div className="pt-3 pb-1 px-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">Avançado</p>
          </div>

          {/* Advanced — power user tools */}
          {advancedItems.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-primary"
                    : "text-sidebar-foreground/50 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Usage & Plan Banner */}
        <div className="p-4 pt-0">
          <div className="bg-sidebar-accent rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-5 h-5 text-sidebar-primary" />
              <span className="text-sm font-semibold text-sidebar-foreground">
                {usage?.plan_display_name || "Gratuito"}
              </span>
            </div>
            {(() => {
              const used = usage?.generations_used ?? 0;
              const limit = usage?.generations_limit ?? 5;
              const remaining = Math.max(0, limit - used);
              const isLow = remaining <= 2 && remaining > 0;
              const isOver = usage?.is_over_limit;

              return (
                <>
                  <p className="text-xs text-sidebar-foreground/60 mb-3">
                    {isOver
                      ? "Limite atingido — desbloqueie com Pro"
                      : isLow
                        ? `Resta${remaining === 1 ? "" : "m"} apenas ${remaining} geraç${remaining === 1 ? "ão" : "ões"}`
                        : "Gere conteúdos com nossa IA avançada"}
                  </p>
                  <div className="h-2 bg-sidebar-border rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        isOver ? "bg-destructive" : isLow ? "bg-amber-500" : "bg-sidebar-primary"
                      )}
                      style={{ width: `${usage?.usage_percentage ?? 0}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <p className={cn(
                      "text-xs",
                      isOver ? "text-destructive font-medium" : isLow ? "text-amber-600 dark:text-amber-400 font-medium" : "text-sidebar-foreground/50"
                    )}>
                      {isOver
                        ? `${used}/${limit} — limite atingido`
                        : `${remaining} de ${limit} restantes`}
                    </p>
                    <button
                      onClick={() => navigate("/pricing")}
                      className="text-xs text-sidebar-primary hover:underline font-medium"
                    >
                      {usage?.plan_name === "free" ? "Upgrade" : "Gerenciar"}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-sidebar-border bg-sidebar-background/95">
        {/* Saved accounts switcher */}
        {savedAccounts.filter(a => a.userId !== currentUserId).length > 0 && (
          <div className="px-3 pt-3 pb-2 border-b border-sidebar-border/50 space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40 px-1 mb-1">Contas salvas</p>
            {savedAccounts.filter(a => a.userId !== currentUserId).map(account => (
              <button
                key={account.userId}
                onClick={() => handleSwitchAccount(account)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-all"
              >
                <div className="w-7 h-7 rounded-full bg-sidebar-primary/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-semibold text-sidebar-primary">
                    {account.name[0].toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0 text-left">
                  <p className="text-xs font-medium truncate">{account.name}</p>
                  <p className="text-[10px] text-sidebar-foreground/50 truncate">{account.email}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="p-4 space-y-1">
          <HelpCenterTrigger />
          <Button
            variant="ghost"
            onClick={handleAddAccount}
            className="w-full justify-start gap-3 px-4 py-3 h-auto text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
          >
            <UserPlus className="w-5 h-5" />
            Adicionar outra conta
          </Button>

          {showLogoutConfirm ? (
            <div className="px-2 py-2 rounded-lg bg-destructive/10 border border-destructive/20">
              <p className="text-xs text-destructive font-medium mb-2 px-1">Você realmente deseja sair?</p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleLogout}
                  className="flex-1 h-7 text-xs"
                >
                  Sair
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 h-7 text-xs"
                >
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
      </div>
    </aside>
  );
};

export default Sidebar;
