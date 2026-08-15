import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import HistoriaLanding from "@/components/landing/HistoriaLanding";

const Index = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        // Routing fork: self_serve → Studio (multigeração); white_glove (default) → Assistente (/agent).
        // O /agent é a experiência padrão agora (antes era /chat).
        const accountType = (session.user.app_metadata?.account_type as string) ?? "white_glove";
        navigate(accountType === "self_serve" ? "/studio" : "/agent");
      }
      setIsLoading(false);
    };
    checkAuth();
  }, [navigate]);

  const goToSignup = () => { setLeaving(true); setTimeout(() => navigate("/auth?tab=signup"), 350); };
  const goToLogin = () => { setLeaving(true); setTimeout(() => navigate("/auth"), 350); };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: "#F7F9FB" }}>
        <div className="animate-pulse" style={{ color: "#0059B3" }}>Carregando...</div>
      </div>
    );
  }

  return (
    <>
      {leaving && (
        <motion.div
          className="fixed inset-0 z-[9999]"
          style={{ background: "#F7F9FB" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        />
      )}
      {/* Landing "História" promovida à / em 2026-08-15, depois da comparação lado a lado.
          O redirect de sessão acima é o motivo de a troca ser aqui e não na rota: quem já está
          logado tem que cair no /agent, e o LandingNova não faz essa checagem. */}
      <HistoriaLanding onSignup={goToSignup} onLogin={goToLogin} />
    </>
  );
};

export default Index;
