import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Loader2, ShieldCheck, TrendingUp, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Tela de consentimento da conexão por link (OAuth).
 *
 * Quem chega aqui acabou de colar `trendpulse.com.br/mcp` no Claude ou no Codex. O OAuth é todo do
 * Supabase Auth; esta página é só a parte que é nossa por definição: mostrar QUEM está pedindo acesso
 * e O QUE vai poder fazer, e registrar a decisão. Configurada como `oauth_server_authorization_path`.
 *
 * A lista "vai poder" tem que bater com ESCOPOS_OAUTH em `_shared/mcp-core.ts`. O Supabase não aceita
 * escopo customizado, então a permissão não vem do token — é fixa, e esta tela é onde ela é declarada.
 * Mudar lá sem mudar aqui é pedir consentimento para uma coisa e entregar outra.
 */

type Detalhes = {
  authorization_id: string;
  redirect_uri: string;
  client: { id: string; name: string; uri: string; logo_uri: string };
  user: { id: string; email: string };
  scope: string;
};

const PODE = [
  "Ver seu saldo de créditos, o calendário e as redes conectadas",
  "Criar posts, carrosséis e stories com a sua marca — gastando créditos",
  "Agendar, reagendar e tirar conteúdo do calendário",
  "Receber artes que você criou e colocá-las no calendário",
];
const NAO_PODE = [
  "Publicar na hora, sem passar pelo calendário",
  "Ver sua senha ou mudar os dados da sua conta",
];

/** Para onde a pessoa volta depois de autorizar, em linguagem de gente — o anti-phishing visível. */
function destino(uri: string): string {
  try {
    const u = new URL(uri);
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return "o app no seu computador";
    return u.hostname;
  } catch {
    return uri;
  }
}

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const authorizationId = params.get("authorization_id");

  const [detalhes, setDetalhes] = useState<Detalhes | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [decidindo, setDecidindo] = useState<"approve" | "deny" | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      if (!authorizationId) {
        setErro("Este link de conexão está incompleto. Volte ao Claude ou ao Codex e conecte de novo.");
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        // Sem sessão: login e VOLTA para cá com o mesmo authorization_id — senão o pedido se perde.
        navigate(`/auth?next=${encodeURIComponent(location.pathname + location.search)}`, { replace: true });
        return;
      }
      const { data, error } = await (supabase.auth as any).oauth.getAuthorizationDetails(authorizationId);
      if (!vivo) return;
      if (error || !data) {
        setErro("Este pedido de conexão expirou ou já foi usado. Volte ao Claude ou ao Codex e conecte de novo.");
        return;
      }
      // Já autorizado antes para este app: o Supabase devolve direto para onde voltar.
      if ("redirect_url" in data) {
        window.location.assign(data.redirect_url);
        return;
      }
      setDetalhes(data as Detalhes);
    })();
    return () => { vivo = false; };
  }, [authorizationId, location.pathname, location.search, navigate]);

  const decidir = async (acao: "approve" | "deny") => {
    if (!authorizationId) return;
    setDecidindo(acao);
    const api = (supabase.auth as any).oauth;
    // Sem skipBrowserRedirect: o SDK já leva o navegador de volta ao Claude/Codex com o código.
    const { error } = acao === "approve"
      ? await api.approveAuthorization(authorizationId)
      : await api.denyAuthorization(authorizationId);
    if (error) {
      setDecidindo(null);
      setErro("Não consegui registrar sua resposta. Volte ao Claude ou ao Codex e conecte de novo.");
    }
  };

  const trocarConta = async () => {
    await supabase.auth.signOut();
    navigate(`/auth?next=${encodeURIComponent(location.pathname + location.search)}`, { replace: true });
  };

  const app = detalhes?.client?.name || "Um app";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-card border-border/60">
        <CardContent className="p-6 sm:p-8 space-y-6">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-semibold text-lg">TrendPulse</span>
          </div>

          {erro ? (
            <div className="space-y-4">
              <h1 className="text-xl font-semibold">Não deu para conectar</h1>
              <p className="text-sm text-muted-foreground">{erro}</p>
            </div>
          ) : !detalhes ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
              <Loader2 className="w-4 h-4 animate-spin" /> Conferindo o pedido de conexão…
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <h1 className="text-xl font-semibold text-balance">
                  Conectar {app} à sua conta TrendPulse
                </h1>
                <p className="text-sm text-muted-foreground">
                  Entrando como <span className="font-medium text-foreground">{detalhes.user.email}</span>.{" "}
                  <button type="button" onClick={trocarConta} className="underline underline-offset-2 hover:text-foreground">
                    Usar outra conta
                  </button>
                </p>
              </div>

              <div className="space-y-2.5">
                <p className="text-sm font-medium">{app} vai poder:</p>
                <ul className="space-y-2">
                  {PODE.map((item) => (
                    <li key={item} className="flex gap-2.5 text-sm">
                      <Check className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-2.5">
                <p className="text-sm font-medium">Não vai poder:</p>
                <ul className="space-y-2">
                  {NAO_PODE.map((item) => (
                    <li key={item} className="flex gap-2.5 text-sm text-muted-foreground">
                      <X className="w-4 h-4 mt-0.5 shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <p className="text-xs text-muted-foreground flex gap-2 rounded-md bg-muted/50 p-3">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>
                  Depois de autorizar você volta para <span className="font-medium text-foreground">{destino(detalhes.redirect_uri)}</span>.
                  Dá para desconectar a qualquer momento em Perfil → Agentes.
                </span>
              </p>

              <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
                <Button variant="outline" className="sm:flex-1" disabled={!!decidindo} onClick={() => decidir("deny")}>
                  {decidindo === "deny" && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Cancelar
                </Button>
                <Button className="sm:flex-1" disabled={!!decidindo} onClick={() => decidir("approve")}>
                  {decidindo === "approve" && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Autorizar
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
