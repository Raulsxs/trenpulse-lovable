import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Link2, Unlink, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// SVG icons for each platform — clean, recognizable, consistent size
function InstagramIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    </svg>
  );
}

function LinkedInIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

function TikTokIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
    </svg>
  );
}

function XIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function FacebookIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function PinterestIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 01.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12.017 24c6.624 0 11.99-5.367 11.99-11.988C24.007 5.367 18.641 0 12.017 0z" />
    </svg>
  );
}

function BlueskyIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.785 2.627 3.6 3.476 6.154 3.17-4.075.593-7.653 2.028-3.03 7.072C7.063 23.572 9.685 18.49 12 18.49c2.315 0 4.938 5.082 8.252 1.999 4.622-5.044 1.045-6.479-3.03-7.072 2.554.306 5.369-.543 6.154-3.17.246-.828.624-5.789.624-6.479 0-.689-.139-1.861-.902-2.203-.659-.299-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8z" />
    </svg>
  );
}

function ThreadsIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.59 12c.025 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.96-.065-1.187.408-2.26 1.33-3.017.88-.724 2.107-1.138 3.456-1.165 1.1-.022 2.09.163 2.944.493-.06-.782-.249-1.391-.564-1.823-.392-.537-1.004-.814-1.822-.826-1.164-.018-2.26.451-2.566.85l-1.68-1.239c.773-1.046 2.449-1.735 4.24-1.71 1.428.021 2.584.525 3.337 1.455.643.793 1.006 1.859 1.078 3.168.54.254 1.032.566 1.47.935 1.197 1.012 1.907 2.396 2.05 3.996.075.826-.01 2.488-1.385 4.16C18.37 22.09 15.868 23.04 12.186 24zm-1.638-7.666c-.94.018-1.694.266-2.179.717-.399.372-.59.828-.56 1.357.035.63.39 1.098.996 1.45.641.352 1.411.49 2.167.449 1.554-.083 2.681-1.07 2.895-2.562-.86-.422-1.92-.627-3.03-.622l-.289.011z" />
    </svg>
  );
}

function YouTubeIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

interface PlatformInfo {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  bgColor: string;
  iconColor: string;
}

export const PLATFORMS: PlatformInfo[] = [
  { id: "instagram", name: "Instagram", icon: InstagramIcon, bgColor: "bg-gradient-to-br from-pink-500 to-purple-600", iconColor: "text-white" },
  { id: "linkedin", name: "LinkedIn", icon: LinkedInIcon, bgColor: "bg-[#0A66C2]", iconColor: "text-white" },
  { id: "tiktok", name: "TikTok", icon: TikTokIcon, bgColor: "bg-black", iconColor: "text-white" },
  { id: "x", name: "X", icon: XIcon, bgColor: "bg-black", iconColor: "text-white" },
  { id: "facebook", name: "Facebook", icon: FacebookIcon, bgColor: "bg-[#1877F2]", iconColor: "text-white" },
  { id: "pinterest", name: "Pinterest", icon: PinterestIcon, bgColor: "bg-[#E60023]", iconColor: "text-white" },
  { id: "bluesky", name: "Bluesky", icon: BlueskyIcon, bgColor: "bg-[#0085FF]", iconColor: "text-white" },
  { id: "threads", name: "Threads", icon: ThreadsIcon, bgColor: "bg-black", iconColor: "text-white" },
  { id: "youtube", name: "YouTube", icon: YouTubeIcon, bgColor: "bg-[#FF0000]", iconColor: "text-white" },
];

export interface ConnectedAccount {
  platform: string;
  connected: boolean;
  account_name?: string;
  pfm_account_id?: string;
}

export default function SocialConnections() {
  // One entry per connected account (a user can have multiple accounts on the same platform)
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null);
  const [disconnectingAccountId, setDisconnectingAccountId] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke("connect-social", {
        body: { action: "list" },
      });
      if (error) throw error;
      const connections = data?.connections || [];
      setAccounts(
        connections
          .filter((c: any) => c.status === "connected")
          .map((c: any) => ({
            platform: c.platform,
            connected: true,
            account_name: c.account_name,
            pfm_account_id: c.pfm_account_id,
          })),
      );
    } catch (err) {
      console.error("[SocialConnections] list error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("pfm_connected") || params.has("pfm_error")) {
      fetchAccounts();
    }
  }, [fetchAccounts]);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup polling on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const handleConnect = async (platformId: string) => {
    // Snapshot the current count for this platform so the poll can detect a NEW account
    // (instead of just "any connected account exists" — important for multi-account users).
    const accountsBefore = accounts.filter((a) => a.platform === platformId).length;

    setConnectingPlatform(platformId);
    try {
      const { data, error } = await supabase.functions.invoke("connect-social", {
        body: { platform: platformId },
      });
      if (error) throw error;
      const authUrl = data?.auth_url;
      if (authUrl) {
        window.open(authUrl, "_blank", "noopener,noreferrer");
        toast.success("Janela de autorização aberta. Autorize o acesso e volte aqui.", { duration: 5000 });
        // Auto-poll for connection status after OAuth (every 4s for 60s)
        if (pollRef.current) clearInterval(pollRef.current);
        let polls = 0;
        pollRef.current = setInterval(async () => {
          polls++;
          try {
            const { data: listData } = await supabase.functions.invoke("connect-social", { body: { action: "list" } });
            const connections = listData?.connections || [];
            const newCount = connections.filter((c: any) => c.platform === platformId && c.status === "connected").length;
            if (newCount > accountsBefore) {
              clearInterval(pollRef.current!);
              pollRef.current = null;
              toast.success(`${platformId} conectado com sucesso!`);
              fetchAccounts();
            } else if (polls >= 15) {
              clearInterval(pollRef.current!);
              pollRef.current = null;
            }
          } catch { /* ignore poll errors */ }
        }, 4000);
      } else {
        console.error("[SocialConnections] No auth_url in response:", data);
        toast.error("Não foi possível gerar link de conexão. Verifique a configuração da API.");
      }
    } catch (err: any) {
      console.error("[SocialConnections] connect error:", err);
      toast.error(err?.message || `Erro ao conectar ${platformId}`);
    } finally {
      setConnectingPlatform(null);
    }
  };

  const handleDisconnect = async (pfmAccountId: string, platformId: string) => {
    setDisconnectingAccountId(pfmAccountId);
    try {
      const { error } = await supabase.functions.invoke("connect-social", {
        body: { action: "disconnect", platform: platformId, pfm_account_id: pfmAccountId },
      });
      if (error) throw error;
      setAccounts((prev) => prev.filter((a) => a.pfm_account_id !== pfmAccountId));
      toast.success("Conta desconectada");
    } catch (err: any) {
      toast.error(err?.message || `Erro ao desconectar`);
    } finally {
      setDisconnectingAccountId(null);
    }
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
              const platformAccounts = accounts.filter((a) => a.platform === p.id);
              const hasAccounts = platformAccounts.length > 0;
              const isConnecting = connectingPlatform === p.id;
              const IconComp = p.icon;

              return (
                <div
                  key={p.id}
                  className={`p-3 rounded-xl border transition-all ${
                    hasAccounts
                      ? "border-green-500/30 bg-green-500/5"
                      : "border-border hover:border-primary/30 hover:bg-muted/30"
                  }`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`w-9 h-9 rounded-lg ${p.bgColor} flex items-center justify-center shrink-0`}>
                      <IconComp className={`w-4.5 h-4.5 ${p.iconColor}`} />
                    </div>
                    <span className="text-sm font-medium flex-1">{p.name}</span>
                    {hasAccounts && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {platformAccounts.length}
                      </Badge>
                    )}
                  </div>

                  {hasAccounts ? (
                    <div className="space-y-1.5">
                      {platformAccounts.map((account) => {
                        const isDisc = disconnectingAccountId === account.pfm_account_id;
                        return (
                          <div
                            key={account.pfm_account_id || `${p.id}-unknown`}
                            className="flex items-center gap-2 p-2 rounded-md bg-background/50 border border-border/50"
                          >
                            <div className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                            <span className="text-xs flex-1 truncate" title={account.account_name || ""}>
                              {account.account_name || "Conta conectada"}
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-muted-foreground hover:text-destructive h-6 w-6 p-0"
                              onClick={() => account.pfm_account_id && handleDisconnect(account.pfm_account_id, p.id)}
                              disabled={isDisc || !account.pfm_account_id}
                              title="Desconectar esta conta"
                            >
                              {isDisc ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unlink className="w-3 h-3" />}
                            </Button>
                          </div>
                        );
                      })}
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full text-xs h-7 mt-1"
                        onClick={() => handleConnect(p.id)}
                        disabled={isConnecting}
                      >
                        {isConnecting ? (
                          <Loader2 className="w-3 h-3 animate-spin mr-1" />
                        ) : (
                          <Plus className="w-3 h-3 mr-1" />
                        )}
                        Adicionar outra
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full text-xs h-7"
                      onClick={() => handleConnect(p.id)}
                      disabled={isConnecting}
                    >
                      {isConnecting ? (
                        <Loader2 className="w-3 h-3 animate-spin mr-1" />
                      ) : (
                        <Link2 className="w-3 h-3 mr-1" />
                      )}
                      Conectar
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-3 flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={fetchAccounts}
          >
            <Loader2 className="w-3 h-3 mr-1" />
            Atualizar status
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
