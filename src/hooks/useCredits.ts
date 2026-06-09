import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Saldo de créditos do usuário (tabela user_credits). Sem realtime (a tabela não está na
 * publication) — o BuyCreditsModal faz polling enquanto o QR está aberto; a sidebar dá refresh.
 */
export function useCredits() {
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setBalance(null);
      setLoading(false);
      return null;
    }
    // user_credits ainda não está nos tipos gerados → cast
    const { data } = await (supabase as any)
      .from("user_credits")
      .select("balance")
      .eq("user_id", user.id)
      .maybeSingle();
    const b = data?.balance ?? 0;
    setBalance(b);
    setLoading(false);
    return b as number;
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { balance, loading, refresh };
}
