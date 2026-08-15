import { useNavigate } from "react-router-dom";
import HistoriaLanding from "@/components/landing/HistoriaLanding";

/**
 * Rota /landing-nova — a direção "História", em avaliação lado a lado com a landing no ar.
 *
 * A / continua servindo a atual enquanto as duas são comparadas. Aprovada, o Index.tsx passa a
 * renderizar o HistoriaLanding e esta rota some; reprovada, some o componente e a rota, sem tocar
 * em nada que está em produção. Plano em docs/arquitetura/landing-historia.md.
 *
 * Sem gate de sessão de propósito: é página de venda, e quem já está logado precisa conseguir
 * abrir pra comparar.
 */
export default function LandingNova() {
  const navigate = useNavigate();
  return (
    <HistoriaLanding
      onSignup={() => navigate("/auth?tab=signup")}
      onLogin={() => navigate("/auth")}
    />
  );
}
