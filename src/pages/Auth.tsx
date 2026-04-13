import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { TrendingUp, Sparkles, BarChart3, Zap, Eye, EyeOff, ArrowLeft, ChevronRight, X, Loader2 } from "lucide-react";

const SAVED_ACCOUNTS_KEY = "tp_saved_accounts";
const MAX_SAVED_ACCOUNTS = 5;

function saveAccounts(accounts: SavedAccount[]): void {
  const trimmed = accounts.slice(-MAX_SAVED_ACCOUNTS);
  try {
    localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(trimmed));
  } catch {
    // localStorage quota exceeded — drop oldest account and retry once
    try {
      localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(trimmed.slice(1)));
    } catch {
      // give up silently — user just won't have multi-account on this device
    }
  }
}

interface SavedAccount {
  userId: string;
  email: string;
  name: string;
  accessToken: string;
  refreshToken: string;
}

const Auth = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isSignupTab = searchParams.get("tab") === "signup";
  const emailParam = searchParams.get("email") || "";
  const isSessionExpired = searchParams.get("expired") === "1";
  const defaultTab = isSignupTab ? "signup" : "login";
  const [isLoading, setIsLoading] = useState(false);
  const [loadingAccountId, setLoadingAccountId] = useState<string | null>(null);
  const [email, setEmail] = useState(emailParam);
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"accounts" | "login" | "forgot">("login");
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);

  useEffect(() => {
    // If redirected here due to expired session, go straight to login form
    if (emailParam && isSessionExpired) {
      setMode("login");
      return;
    }
    const stored: SavedAccount[] = (() => {
      try { return JSON.parse(localStorage.getItem(SAVED_ACCOUNTS_KEY) || "[]"); } catch { return []; }
    })();
    setSavedAccounts(stored);
    if (stored.length > 0 && !isSignupTab) {
      setMode("accounts");
    }
  }, [isSignupTab, emailParam, isSessionExpired]);

  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + "/dashboard" },
    });
  };

  const handleSwitchAccount = async (account: SavedAccount) => {
    setLoadingAccountId(account.userId);
    try {
      const { data: { session: newSession }, error } = await supabase.auth.setSession({
        access_token: account.accessToken,
        refresh_token: account.refreshToken,
      });
      if (error) throw error;

      // Persist rotated tokens BEFORE navigating — page unload races onAuthStateChange
      if (newSession) {
        const uid = newSession.user.id;
        const em = newSession.user.email || "";
        const nm = newSession.user.user_metadata?.name || em.split("@")[0];
        const stored: SavedAccount[] = (() => {
          try { return JSON.parse(localStorage.getItem(SAVED_ACCOUNTS_KEY) || "[]"); } catch { return []; }
        })();
        const idx = stored.findIndex(a => a.userId === uid);
        const acct: SavedAccount = { userId: uid, email: em, name: nm, accessToken: newSession.access_token, refreshToken: newSession.refresh_token };
        if (idx >= 0) stored[idx] = acct; else stored.push(acct);
        saveAccounts(stored);
      }

      window.location.href = "/chat";
    } catch {
      // Token expired/rotated — go to login form pre-filled with this email
      const stored: SavedAccount[] = (() => {
        try { return JSON.parse(localStorage.getItem(SAVED_ACCOUNTS_KEY) || "[]"); } catch { return []; }
      })();
      const updated = stored.filter(a => a.userId !== account.userId);
      saveAccounts(updated);
      window.location.href = `/auth?email=${encodeURIComponent(account.email)}&expired=1`;
    } finally {
      setLoadingAccountId(null);
    }
  };

  const handleRemoveAccount = (e: React.MouseEvent, userId: string) => {
    e.stopPropagation();
    const updated = savedAccounts.filter(a => a.userId !== userId);
    saveAccounts(updated);
    setSavedAccounts(updated);
    if (updated.length === 0) setMode("login");
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error("Informe seu email");
      return;
    }
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("Email de recuperação enviado! Verifique sua caixa de entrada.");
      setMode(savedAccounts.length > 0 ? "accounts" : "login");
    } catch (error: any) {
      toast.error(error.message || "Erro ao enviar email de recuperação");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const { data: { session }, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      // Save tokens immediately so multi-account switcher has fresh tokens right away
      if (session) {
        const uid = session.user.id;
        const em = session.user.email || "";
        const nm = session.user.user_metadata?.name || em.split("@")[0];
        const stored: SavedAccount[] = (() => {
          try { return JSON.parse(localStorage.getItem(SAVED_ACCOUNTS_KEY) || "[]"); } catch { return []; }
        })();
        const idx = stored.findIndex(a => a.userId === uid);
        const acct: SavedAccount = { userId: uid, email: em, name: nm, accessToken: session.access_token, refreshToken: session.refresh_token };
        if (idx >= 0) stored[idx] = acct; else stored.push(acct);
        saveAccounts(stored);
      }

      navigate("/chat");
    } catch (error: any) {
      toast.error(error.message || "Erro ao fazer login");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const redirectUrl = `${window.location.origin}/dashboard`;
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: { name },
        },
      });
      if (error) throw error;
      toast.success("Conta criada com sucesso! Verifique seu email.");
    } catch (error: any) {
      toast.error(error.message || "Erro ao criar conta");
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackButton = () => {
    if (mode === "forgot") {
      setMode(savedAccounts.length > 0 ? "accounts" : "login");
    } else if (mode === "login" && savedAccounts.length > 0) {
      setMode("accounts");
    } else {
      navigate("/");
    }
  };

  const GoogleButton = () => (
    <Button type="button" variant="outline" className="w-full gap-2" onClick={handleGoogleLogin}>
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
      Continuar com Google
    </Button>
  );

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 gradient-primary p-12 flex-col justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-heading font-bold text-white">TrendPulse</h1>
          </div>
        </div>

        <div className="space-y-8">
          <div>
            <h2 className="text-4xl font-heading font-bold text-white leading-tight">
              Transforme tendências em conteúdo que engaja
            </h2>
            <p className="mt-4 text-lg text-white/80">
              A plataforma inteligente para criadores e negócios gerarem conteúdo relevante para suas redes sociais.
            </p>
          </div>

          <div className="grid gap-4">
            <div className="flex items-start gap-4 bg-white/10 rounded-lg p-4 backdrop-blur-sm">
              <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <BarChart3 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Tendências em Tempo Real</h3>
                <p className="text-sm text-white/70">Monitore as principais notícias e insights do seu setor</p>
              </div>
            </div>

            <div className="flex items-start gap-4 bg-white/10 rounded-lg p-4 backdrop-blur-sm">
              <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-white">IA Generativa</h3>
                <p className="text-sm text-white/70">Gere posts, stories e carrosséis automaticamente</p>
              </div>
            </div>

            <div className="flex items-start gap-4 bg-white/10 rounded-lg p-4 backdrop-blur-sm">
              <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Pronto para Publicar</h3>
                <p className="text-sm text-white/70">Baixe imagens prontas para seu Instagram</p>
              </div>
            </div>
          </div>
        </div>

        <p className="text-sm text-white/60">© 2026 TrendPulse. Todos os direitos reservados.</p>
      </div>

      {/* Right Side - Auth Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background relative">
        <button
          type="button"
          onClick={handleBackButton}
          className="absolute top-6 left-6 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </button>
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center justify-center gap-3 mb-8">
            <div className="w-10 h-10 gradient-primary rounded-lg flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-heading font-bold text-foreground">TrendPulse</h1>
          </div>

          <Card className="shadow-card border-border/50">
            {mode === "accounts" ? (
              <>
                <CardHeader className="text-center pb-2">
                  <CardTitle className="text-2xl font-heading">Bem-vindo de volta</CardTitle>
                  <CardDescription>Escolha uma conta para continuar</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {savedAccounts.map(account => (
                    <div
                      key={account.userId}
                      onClick={() => handleSwitchAccount(account)}
                      className="group relative flex items-center gap-3 p-3 rounded-lg border border-border/60 cursor-pointer hover:bg-accent transition-colors"
                    >
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="font-semibold text-primary">{account.name[0].toUpperCase()}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm">{account.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{account.email}</p>
                      </div>
                      {loadingAccountId === account.userId ? (
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground flex-shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      )}
                      <button
                        type="button"
                        onClick={(e) => handleRemoveAccount(e, account.userId)}
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-destructive/10 hover:text-destructive"
                        aria-label="Remover conta"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <div className="pt-2 space-y-2">
                    <GoogleButton />
                    <Button variant="outline" className="w-full" onClick={() => setMode("login")}>
                      Entrar com outra conta
                    </Button>
                  </div>
                </CardContent>
              </>
            ) : mode === "forgot" ? (
              <>
                <CardHeader className="text-center pb-2">
                  <CardTitle className="text-2xl font-heading">Recuperar senha</CardTitle>
                  <CardDescription>Informe seu email para receber o link</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleForgotPassword} className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Informe seu email para receber um link de recuperação de senha.
                    </p>
                    <div className="space-y-2">
                      <Label htmlFor="forgot-email">Email</Label>
                      <Input
                        id="forgot-email"
                        type="email"
                        placeholder="seu@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={isLoading}>
                      {isLoading ? "Enviando..." : "Enviar link de recuperação"}
                    </Button>
                    <Button
                      type="button"
                      variant="link"
                      className="w-full"
                      onClick={() => setMode(savedAccounts.length > 0 ? "accounts" : "login")}
                    >
                      Voltar ao login
                    </Button>
                  </form>
                </CardContent>
              </>
            ) : (
              <>
                <CardHeader className="text-center pb-2">
                  <CardTitle className="text-2xl font-heading">
                    {isSessionExpired && emailParam ? "Sessão expirada" : "Bem-vindo"}
                  </CardTitle>
                  <CardDescription>
                    {isSessionExpired && emailParam
                      ? "Sua sessão expirou. Entre com sua senha para continuar."
                      : "Acesse sua conta ou crie uma nova"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {isSessionExpired && emailParam && (
                    <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
                      <span className="font-medium">{emailParam}</span>
                    </div>
                  )}
                  <GoogleButton />
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-border" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">ou</span>
                    </div>
                  </div>
                  <Tabs defaultValue={defaultTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-2 mb-4">
                      <TabsTrigger value="login">Entrar</TabsTrigger>
                      <TabsTrigger value="signup">Criar Conta</TabsTrigger>
                    </TabsList>

                    <TabsContent value="login">
                      <form onSubmit={handleLogin} className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="login-email">Email</Label>
                          <Input
                            id="login-email"
                            type="email"
                            placeholder="seu@email.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label htmlFor="login-password">Senha</Label>
                            <button
                              type="button"
                              className="text-xs text-primary hover:underline"
                              onClick={() => setMode("forgot")}
                            >
                              Esqueceu a senha?
                            </button>
                          </div>
                          <div className="relative">
                            <Input
                              id="login-password"
                              type={showLoginPassword ? "text" : "password"}
                              placeholder="••••••••"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              className="pr-10"
                              required
                            />
                            <button
                              type="button"
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                              onClick={() => setShowLoginPassword(!showLoginPassword)}
                              tabIndex={-1}
                            >
                              {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                        <Button type="submit" className="w-full" disabled={isLoading}>
                          {isLoading ? "Entrando..." : "Entrar"}
                        </Button>
                      </form>
                    </TabsContent>

                    <TabsContent value="signup">
                      <form onSubmit={handleSignup} className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="signup-name">Nome</Label>
                          <Input
                            id="signup-name"
                            type="text"
                            placeholder="Seu nome completo"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="signup-email">Email</Label>
                          <Input
                            id="signup-email"
                            type="email"
                            placeholder="seu@email.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="signup-password">Senha</Label>
                          <div className="relative">
                            <Input
                              id="signup-password"
                              type={showSignupPassword ? "text" : "password"}
                              placeholder="Mínimo 6 caracteres"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              className="pr-10"
                              minLength={6}
                              required
                            />
                            <button
                              type="button"
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                              onClick={() => setShowSignupPassword(!showSignupPassword)}
                              tabIndex={-1}
                            >
                              {showSignupPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                        <Button type="submit" className="w-full" disabled={isLoading}>
                          {isLoading ? "Criando..." : "Criar Conta"}
                        </Button>
                      </form>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Auth;
