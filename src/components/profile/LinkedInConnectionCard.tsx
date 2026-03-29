import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Linkedin, Link2, Unlink, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface LinkedInConnection {
  id: string;
  linkedin_name: string | null;
  linkedin_email: string | null;
  linkedin_user_id: string;
  is_active: boolean;
  token_expires_at: string | null;
  created_at: string;
}

const LinkedInConnectionCard = () => {
  const [connections, setConnections] = useState<LinkedInConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [clientId, setClientId] = useState("");

  useEffect(() => {
    fetchConnections();
    fetchClientId();
  }, []);

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === "linkedin-oauth-callback" && event.data?.code) {
        await handleOAuthCallback(event.data.code);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const fetchConnections = async () => {
    try {
      const { data, error } = await supabase
        .from("linkedin_connections" as any)
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setConnections((data as unknown as LinkedInConnection[]) || []);
    } catch (err) {
      console.error("Error fetching LinkedIn connections:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchClientId = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("linkedin-config");
      if (!error && data?.client_id) {
        setClientId(data.client_id);
      }
    } catch (err) {
      console.error("Error fetching LinkedIn client ID:", err);
    }
  };

  const handleConnect = () => {
    if (!clientId) {
      toast.error("Configuração do LinkedIn App não encontrada.");
      return;
    }

    setConnecting(true);
    const redirectUri = `${window.location.origin}/auth/linkedin/callback`;
    const scope = "openid profile email w_member_social";

    const authUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}`;

    const popup = window.open(authUrl, "linkedin-oauth", "width=600,height=700,scrollbars=yes");

    const checkPopup = setInterval(() => {
      if (popup?.closed) {
        clearInterval(checkPopup);
        setConnecting(false);
        fetchConnections();
      }
    }, 1000);
  };

  const handleOAuthCallback = async (code: string) => {
    try {
      setConnecting(true);
      const redirectUri = `${window.location.origin}/auth/linkedin/callback`;

      const { data, error } = await supabase.functions.invoke("linkedin-oauth-callback", {
        body: { code, redirect_uri: redirectUri },
      });

      if (error) {
        let hint = "Erro ao conectar LinkedIn. Tente novamente.";
        try {
          const errorBody = typeof error === "object" && error !== null && "context" in error
            ? JSON.parse((error as any).context?.body || "{}")
            : null;
          if (errorBody?.user_hint) hint = errorBody.user_hint;
        } catch {}
        toast.error(hint, { duration: 8000 });
        return;
      }

      if (data?.error) {
        toast.error(data.user_hint || data.error, { duration: 8000 });
        return;
      }

      if (data?.connection) {
        toast.success(`LinkedIn conectado: ${data.connection.linkedin_name || "conta vinculada"}`);
        await fetchConnections();
      } else {
        toast.error("Erro ao salvar conexão LinkedIn.");
      }
    } catch (err: any) {
      console.error("LinkedIn OAuth callback error:", err);
      toast.error(err?.message || "Erro ao conectar LinkedIn.", { duration: 8000 });
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async (connectionId: string) => {
    try {
      const { error } = await supabase
        .from("linkedin_connections" as any)
        .update({ is_active: false } as any)
        .eq("id", connectionId);

      if (error) throw error;
      toast.success("LinkedIn desconectado");
      await fetchConnections();
    } catch (err) {
      console.error("Disconnect error:", err);
      toast.error("Erro ao desconectar");
    }
  };

  const isTokenExpiring = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    const daysLeft = (new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return daysLeft < 7;
  };

  const isTokenExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  const activeConnections = connections.filter(c => c.is_active);

  return (
    <Card className="shadow-card border-border/50">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Linkedin className="w-5 h-5 text-[#0A66C2]" />
          LinkedIn
          {activeConnections.length > 0 && (
            <Badge variant="default" className="text-xs bg-green-500/10 text-green-600 border-green-500/20">
              Conectado
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Conecte sua conta LinkedIn para publicação automática de conteúdos agendados
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Carregando...
          </div>
        ) : activeConnections.length > 0 ? (
          <div className="space-y-3">
            {activeConnections.map((conn) => (
              <div key={conn.id} className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-muted/30">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#0A66C2] flex items-center justify-center">
                    <Linkedin className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {conn.linkedin_name || conn.linkedin_email || "Conta LinkedIn"}
                    </p>
                    {conn.linkedin_email && conn.linkedin_name && (
                      <p className="text-xs text-muted-foreground">{conn.linkedin_email}</p>
                    )}
                    {isTokenExpired(conn.token_expires_at) ? (
                      <div className="flex items-center gap-1 mt-1">
                        <AlertCircle className="w-3 h-3 text-destructive" />
                        <span className="text-xs text-destructive">Token expirado — reconecte</span>
                      </div>
                    ) : isTokenExpiring(conn.token_expires_at) ? (
                      <div className="flex items-center gap-1 mt-1">
                        <AlertCircle className="w-3 h-3 text-amber-500" />
                        <span className="text-xs text-amber-500">Token expira em breve</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 mt-1">
                        <CheckCircle2 className="w-3 h-3 text-green-500" />
                        <span className="text-xs text-green-600">Ativo</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {(isTokenExpired(conn.token_expires_at) || isTokenExpiring(conn.token_expires_at)) && (
                    <Button variant="outline" size="sm" onClick={handleConnect} disabled={connecting}>
                      <RefreshCw className="w-3.5 h-3.5 mr-1" />
                      Reconectar
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => handleDisconnect(conn.id)} className="text-destructive hover:text-destructive hover:bg-destructive/10">
                    <Unlink className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}

            <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <div className="text-xs text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">Publicação automática ativa</p>
                  <p>Conteúdos LinkedIn agendados serão publicados automaticamente no horário definido.</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="p-4 rounded-lg border border-dashed border-border bg-muted/20 text-center">
              <Linkedin className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground mb-1">Nenhuma conta conectada</p>
              <p className="text-xs text-muted-foreground mb-4">
                Conecte sua conta LinkedIn para habilitar publicação automática
              </p>
              <Button onClick={handleConnect} disabled={connecting} className="gap-2">
                {connecting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Link2 className="w-4 h-4" />
                )}
                {connecting ? "Conectando..." : "Conectar LinkedIn"}
              </Button>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold text-foreground">Como conectar:</p>
              <ol className="text-xs text-muted-foreground space-y-2 list-none">
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold mt-0.5">1</span>
                  <span>Clique em <strong>"Conectar LinkedIn"</strong> e autorize o acesso à sua conta.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold mt-0.5">2</span>
                  <span>Conceda permissão para publicar posts em seu nome.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold mt-0.5">3</span>
                  <span>Pronto! Seus conteúdos agendados serão publicados automaticamente. 🎉</span>
                </li>
              </ol>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default LinkedInConnectionCard;
