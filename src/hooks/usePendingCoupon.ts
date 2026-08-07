import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCredits } from "@/hooks/useCredits";
import { couponFromUrl, readPendingCoupon, clearPendingCoupon } from "@/lib/coupon";

/**
 * Resgate AUTOMÁTICO do cupom pendente, assim que o comprador entra logado.
 *
 * Resolve o código em três camadas, porque cada uma sozinha falha num cenário real:
 *   1. ?coupon= na URL          → morre se a allow-list de Redirect URLs do Supabase não bater
 *   2. user_metadata.coupon     → gravado no signUp; sobrevive a tudo, é a rede de segurança
 *   3. localStorage             → morre se o email for confirmado em outro dispositivo
 *
 * O user_metadata é gravável pelo usuário, mas isso não é brecha: o valor é só uma DICA de qual
 * código tentar. Quem valida (existe? já usado? expirou?) é a RPC no servidor.
 *
 * Montado em Onboarding (comprador novo) e DashboardLayout (quem já tinha conta e clicou no link
 * depois). O guard de useRef torna seguro montar nos dois.
 */
export function usePendingCoupon() {
  const location = useLocation();
  const attempted = useRef(false);
  const [redeemed, setRedeemed] = useState<number | null>(null);
  const { refresh } = useCredits();

  useEffect(() => {
    if (attempted.current) return;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return; // sem sessão ainda: o próximo mount tenta de novo

      const code = couponFromUrl(location.search)
        || (typeof user.user_metadata?.coupon === "string" ? user.user_metadata.coupon : null)
        || readPendingCoupon();
      if (!code) return;

      attempted.current = true;
      try {
        const { data, error } = await supabase.functions.invoke("redeem-coupon", { body: { code } });

        if (data?.ok) {
          clearPendingCoupon();
          setRedeemed(data.credits);
          refresh();
          return;
        }

        // Desfechos DEFINITIVOS: limpar, senão fica tentando pra sempre a cada navegação.
        // RATE_LIMITED e erro de rede NÃO limpam — são transitórios e merecem nova tentativa.
        let code_err: string | undefined = data?.error;
        if (error) {
          try { code_err = (await (error as any).context?.json?.())?.error; } catch { /* noop */ }
        }
        if (code_err && ["ALREADY_REDEEMED", "CAMPAIGN_ALREADY_REDEEMED", "NOT_FOUND", "EXPIRED", "INACTIVE"].includes(code_err)) {
          clearPendingCoupon();
        } else {
          attempted.current = false; // transitório: permite retry no próximo mount
        }
      } catch {
        attempted.current = false;
      }
    })();
  }, [location.search, refresh]);

  return { redeemed };
}
