import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Saldo de créditos (tabela user_credits) num STORE COMPARTILHADO entre todos os componentes.
 * Antes cada useCredits tinha cópia própria → gerar no Studio não atualizava a Sidebar (só no
 * refresh da página). Agora: (1) um refresh em qualquer lugar propaga pra todos; (2) realtime na
 * user_credits reflete débito/crédito na hora (precisa da tabela na publication supabase_realtime
 * — ver migration 20260621_user_credits_realtime). Sem realtime, o refresh pós-ação ainda cobre.
 */
let sharedBalance: number | null = null;
let sharedLoading = true;
let currentUserId: string | null = null;
let realtimeStarted = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

async function fetchBalance(): Promise<number | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    sharedBalance = null;
    sharedLoading = false;
    currentUserId = null;
    emit();
    return null;
  }
  currentUserId = user.id;
  // user_credits ainda não está nos tipos gerados → cast
  const { data } = await (supabase as any)
    .from("user_credits")
    .select("balance")
    .eq("user_id", user.id)
    .maybeSingle();
  sharedBalance = data?.balance ?? 0;
  sharedLoading = false;
  emit();
  return sharedBalance;
}

function startRealtime() {
  if (realtimeStarted || !currentUserId) return;
  realtimeStarted = true;
  supabase
    .channel(`user_credits-${currentUserId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "user_credits", filter: `user_id=eq.${currentUserId}` },
      (payload) => {
        const b = (payload.new as any)?.balance;
        if (typeof b === "number") {
          sharedBalance = b;
          emit();
        }
      },
    )
    .subscribe();
}

export function useCredits() {
  const [, force] = useState(0);

  useEffect(() => {
    const listener = () => force((n) => n + 1);
    listeners.add(listener);
    // Refetch a cada mount (cobre navegação + ações em outras telas mesmo sem realtime),
    // e liga o realtime uma única vez assim que sabemos o user.
    fetchBalance().then(() => startRealtime());
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const refresh = useCallback(() => fetchBalance(), []);

  return { balance: sharedBalance, loading: sharedLoading, refresh };
}
