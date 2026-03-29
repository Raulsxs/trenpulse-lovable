import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, CheckCircle2, XCircle } from "lucide-react";

const LinkedInCallback = () => {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Conectando sua conta LinkedIn...");

  useEffect(() => {
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    if (error) {
      setStatus("error");
      setMessage("Autorização cancelada ou negada.");
      setTimeout(() => window.close(), 3000);
      return;
    }

    if (!code) {
      setStatus("error");
      setMessage("Código de autorização não encontrado.");
      setTimeout(() => window.close(), 3000);
      return;
    }

    if (window.opener) {
      window.opener.postMessage({ type: "linkedin-oauth-callback", code }, window.location.origin);
      setStatus("success");
      setMessage("Conta conectada! Esta janela será fechada...");
      setTimeout(() => window.close(), 2000);
    } else {
      processCallback(code);
    }
  }, [searchParams]);

  const processCallback = async (code: string) => {
    try {
      const redirectUri = `${window.location.origin}/auth/linkedin/callback`;
      const { data, error } = await supabase.functions.invoke("linkedin-oauth-callback", {
        body: { code, redirect_uri: redirectUri },
      });

      if (error) throw error;

      setStatus("success");
      setMessage(`LinkedIn conectado com sucesso! ${data?.connection?.linkedin_name || ""}`);
      setTimeout(() => {
        window.location.href = "/profile";
      }, 2000);
    } catch (err) {
      console.error("LinkedIn callback error:", err);
      setStatus("error");
      setMessage("Erro ao conectar. Tente novamente pelo perfil.");
      setTimeout(() => {
        window.location.href = "/profile";
      }, 3000);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4 p-8">
        {status === "loading" && (
          <RefreshCw className="w-12 h-12 text-primary mx-auto animate-spin" />
        )}
        {status === "success" && (
          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
        )}
        {status === "error" && (
          <XCircle className="w-12 h-12 text-destructive mx-auto" />
        )}
        <p className="text-lg font-medium text-foreground">{message}</p>
      </div>
    </div>
  );
};

export default LinkedInCallback;
