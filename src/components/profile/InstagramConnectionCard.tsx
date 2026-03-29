import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Instagram, Link2, Unlink, RefreshCw, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface InstagramConnection {
  id: string;
  instagram_username: string | null;
  page_name: string | null;
  instagram_user_id: string;
  is_active: boolean;
  token_expires_at: string | null;
  created_at: string;
}

const InstagramConnectionCard = () => {
  const [connections, setConnections] = useState<InstagramConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [metaAppId, setMetaAppId] = useState<string>("");

  useEffect(() => {
    fetchConnections();
    fetchMetaAppId();
  }, []);

  // Listen for OAuth callback
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === "instagram-oauth-callback" && event.data?.code) {
        await handleOAuthCallback(event.data.code);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const fetchConnections = async () => {
    try {
      const { data, error } = await supabase
        .from("instagram_connections")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setConnections((data as InstagramConnection[]) || []);
    } catch (err) {
      console.error("Error fetching connections:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMetaAppId = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("instagram-config");
      if (!error && data?.app_id) {
        setMetaAppId(data.app_id);
      }
    } catch (err) {
      console.error("Error fetching Meta App ID:", err);
    }
  };

  const handleConnect = () => {
    if (!metaAppId) {
      toast.error("Configuração do Meta App não encontrada. Entre em contato com o suporte.");
      return;
    }

    setConnecting(true);
    const redirectUri = `${window.location.origin}/auth/instagram/callback`;
    const scope = "instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement,business_management";

    const authUrl = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${metaAppId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&response_type=code`;

    // Open popup for OAuth
    const popup = window.open(authUrl, "instagram-oauth", "width=600,height=700,scrollbars=yes");

    // Poll for popup close
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
      const redirectUri = `${window.location.origin}/auth/instagram/callback`;

      const { data, error } = await supabase.functions.invoke("instagram-oauth-callback", {
        body: { code, redirect_uri: redirectUri },
      });

      if (error) {
        // Try to parse error body for user_hint
        let hint = "Erro ao conectar Instagram. Tente novamente.";
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
        const hint = data.user_hint || data.error || "Erro desconhecido ao conectar.";
        toast.error(hint, { duration: 8000 });
        return;
      }

      if (data?.connections?.length > 0) {
        toast.success(`Instagram conectado: @${data.connections[0].instagram_username || "conta vinculada"}`);
        await fetchConnections();
      } else {
        toast.error("Nenhuma conta Instagram Business encontrada.");
      }
    } catch (err: any) {
      console.error("OAuth callback error:", err);
      toast.error(err?.message || "Erro ao conectar Instagram. Tente novamente.", { duration: 8000 });
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async (connectionId: string) => {
    try {
      const { error } = await supabase
        .from("instagram_connections")
        .update({ is_active: false })
        .eq("id", connectionId);

      if (error) throw error;
      toast.success("Instagram desconectado");
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
          <Instagram className="w-5 h-5 text-pink-500" />
          Instagram
          {activeConnections.length > 0 && (
            <Badge variant="default" className="text-xs bg-green-500/10 text-green-600 border-green-500/20">
              Conectado
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Conecte sua conta Instagram Business para publicação automática de conteúdos agendados
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
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center">
                    <Instagram className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {conn.instagram_username ? `@${conn.instagram_username}` : "Conta Instagram"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {conn.page_name && `via ${conn.page_name}`}
                    </p>
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
                  <p>Conteúdos agendados serão publicados automaticamente no horário definido no calendário.</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="p-4 rounded-lg border border-dashed border-border bg-muted/20 text-center">
              <Instagram className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground mb-1">Nenhuma conta conectada</p>
              <p className="text-xs text-muted-foreground mb-4">
                Conecte sua conta Instagram Business para habilitar publicação automática
              </p>
              <Button onClick={handleConnect} disabled={connecting} className="gap-2">
                {connecting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Link2 className="w-4 h-4" />
                )}
                {connecting ? "Conectando..." : "Conectar Instagram"}
              </Button>
            </div>

          <div className="space-y-3">
              <p className="text-xs font-semibold text-foreground">Como conectar (passo a passo):</p>
              <ol className="text-xs text-muted-foreground space-y-2 list-none">
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold mt-0.5">1</span>
                  <span>Acesse as <strong>Configurações do Instagram</strong> &gt; Conta &gt; Mudar para <strong>conta profissional</strong> (Business ou Creator).</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold mt-0.5">2</span>
                  <span>Crie uma <strong>Página no Facebook</strong> (se ainda não tem) e vincule-a à sua conta Instagram profissional nas configurações do Instagram.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold mt-0.5">3</span>
                  <span>Clique em <strong>"Conectar Instagram"</strong> abaixo e autorize o acesso à sua Página e conta Instagram.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold mt-0.5">4</span>
                  <span>Pronto! Seus conteúdos agendados serão publicados automaticamente. 🎉</span>
                </li>
              </ol>

              <div className="p-2.5 rounded-md bg-amber-500/10 border border-amber-500/20">
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  <strong>⚠️ Importante:</strong> Contas pessoais do Instagram não são compatíveis. Você precisa de uma conta <strong>Business</strong> ou <strong>Creator</strong> com uma Página do Facebook vinculada.
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default InstagramConnectionCard;
