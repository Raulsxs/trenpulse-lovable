import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Link2, Unlink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface PlatformInfo {
  id: string;
  name: string;
  emoji: string;
  color: string;
}

const PLATFORMS: PlatformInfo[] = [
  { id: "instagram", name: "Instagram", emoji: "\u{1F4F8}", color: "from-pink-500 to-purple-500" },
  { id: "linkedin", name: "LinkedIn", emoji: "\u{1F4BC}", color: "from-blue-600 to-blue-700" },
  { id: "tiktok", name: "TikTok", emoji: "\u{1F3B5}", color: "from-gray-900 to-gray-800" },
  { id: "x", name: "X (Twitter)", emoji: "\u{1D54F}", color: "from-gray-900 to-gray-800" },
  { id: "facebook", name: "Facebook", emoji: "\u{1F4D8}", color: "from-blue-500 to-blue-600" },
  { id: "pinterest", name: "Pinterest", emoji: "\u{1F4CC}", color: "from-red-500 to-red-600" },
  { id: "bluesky", name: "Bluesky", emoji: "\u{1F98B}", color: "from-sky-400 to-sky-500" },
  { id: "threads", name: "Threads", emoji: "\u{1F9F5}", color: "from-gray-800 to-gray-900" },
  { id: "youtube", name: "YouTube", emoji: "\u25B6\uFE0F", color: "from-red-600 to-red-700" },
];

export interface ConnectedAccount {
  platform: string;
  connected: boolean;
  account_name?: string;
}

export default function SocialConnections() {
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null);
  const [disconnectingPlatform, setDisconnectingPlatform] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke("connect-social", {
        body: { action: "list" },
      });
      if (error) throw error;
      const list = data?.accounts || data || [];
      setAccounts(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error("[SocialConnections] list error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  // Auto-refresh when redirected back from OAuth with ?pfm_connected= param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("pfm_connected") || params.has("pfm_error")) {
      fetchAccounts();
    }
  }, [fetchAccounts]);

  const handleConnect = async (platformId: string) => {
    setConnectingPlatform(platformId);
    try {
      const { data, error } = await supabase.functions.invoke("connect-social", {
        body: { action: "connect", platform: platformId },
      });
      if (error) throw error;
      const authUrl = data?.url || data?.auth_url || data?.redirect_url;
      if (authUrl) {
        window.open(authUrl, "_blank", "noopener,noreferrer");
      } else {
        toast.error("Nenhuma URL de autenticacao retornada");
      }
    } catch (err: any) {
      console.error("[SocialConnections] connect error:", err);
      toast.error(`Erro ao conectar ${platformId}`);
    } finally {
      setConnectingPlatform(null);
    }
  };

  const handleDisconnect = async (platformId: string) => {
    setDisconnectingPlatform(platformId);
    try {
      const { error } = await supabase.functions.invoke("connect-social", {
        body: { action: "disconnect", platform: platformId },
      });
      if (error) throw error;
      setAccounts((prev) =>
        prev.map((a) => (a.platform === platformId ? { ...a, connected: false, account_name: undefined } : a))
      );
      toast.success("Conta desconectada");
    } catch (err: any) {
      console.error("[SocialConnections] disconnect error:", err);
      toast.error(`Erro ao desconectar ${platformId}`);
    } finally {
      setDisconnectingPlatform(null);
    }
  };

  const isConnected = (platformId: string) => {
    return accounts.some((a) => a.platform === platformId && a.connected);
  };

  const getAccountName = (platformId: string) => {
    return accounts.find((a) => a.platform === platformId)?.account_name;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Link2 className="w-5 h-5 text-primary" />
          Redes Sociais
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Conecte suas contas para publicar direto pelo TrendPulse
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {PLATFORMS.map((p) => {
              const connected = isConnected(p.id);
              const accountName = getAccountName(p.id);
              const isConnecting = connectingPlatform === p.id;
              const isDisconnecting = disconnectingPlatform === p.id;

              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                    connected
                      ? "border-primary/20 bg-primary/5"
                      : "border-border bg-card hover:bg-muted/50"
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-lg bg-gradient-to-br ${p.color} flex items-center justify-center text-white text-lg shrink-0`}
                  >
                    {p.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{p.name}</span>
                      <Badge
                        variant={connected ? "default" : "secondary"}
                        className={`text-[10px] px-1.5 py-0 ${
                          connected ? "bg-green-500/10 text-green-600 border-green-500/20" : ""
                        }`}
                      >
                        {connected ? "Conectado" : "Desconectado"}
                      </Badge>
                    </div>
                    {accountName && (
                      <p className="text-xs text-muted-foreground truncate">{accountName}</p>
                    )}
                  </div>
                  <div className="shrink-0">
                    {connected ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs text-muted-foreground hover:text-destructive h-7 px-2"
                        onClick={() => handleDisconnect(p.id)}
                        disabled={isDisconnecting}
                      >
                        {isDisconnecting ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Unlink className="w-3 h-3" />
                        )}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-7 px-3"
                        onClick={() => handleConnect(p.id)}
                        disabled={isConnecting}
                      >
                        {isConnecting ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          "Conectar"
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Re-export PLATFORMS for use in ActionCard publish dropdown
export { PLATFORMS };
