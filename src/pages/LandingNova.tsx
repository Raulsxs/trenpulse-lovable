import { useNavigate } from "react-router-dom";
import AtelieLanding from "@/components/landing/AtelieLanding";

/**
 * Rota /landing-nova — a direção "Ateliê" em avaliação, lado a lado com a landing que está no ar.
 *
 * Existe separada de propósito: a / continua servindo a landing atual enquanto as duas são
 * comparadas. Quando a nova for aprovada, o Index.tsx passa a renderizar o AtelieLanding e esta
 * rota some. Se for reprovada, some o componente e a rota, sem tocar em nada que está em produção.
 *
 * Não faz gate de sessão: é página de venda, e quem já está logado também precisa conseguir abrir
 * pra comparar.
 */
export default function LandingNova() {
  const navigate = useNavigate();
  return (
    <AtelieLanding
      onSignup={() => navigate("/auth?tab=signup")}
      onLogin={() => navigate("/auth")}
    />
  );
}
