import { useEffect, useRef, useState } from "react";
import { Coins } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface CreditsBadgeProps {
  className?: string;
}

export function CreditsBadge({ className }: CreditsBadgeProps) {
  const [balance, setBalance] = useState<number | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user || !mounted) return;
      const userId = session.user.id;

      const { data } = await supabase
        .from("profiles" as any)
        .select("credits_balance")
        .eq("user_id", userId)
        .single();

      if (mounted && data) {
        setBalance((data as any).credits_balance ?? 0);
      }

      // Realtime: atualiza badge imediatamente após débito/crédito
      channelRef.current = supabase
        .channel(`credits-${userId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "profiles",
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            const b = (payload.new as any).credits_balance;
            if (typeof b === "number" && mounted) setBalance(b);
          }
        )
        .subscribe();
    });

    return () => {
      mounted = false;
      channelRef.current?.unsubscribe();
    };
  }, []);

  if (balance === null) return null;

  const low = balance <= 2;

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
        balance === 0
          ? "bg-destructive/15 text-destructive border border-destructive/25"
          : low
          ? "bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800/40"
          : "bg-primary/10 text-primary border border-primary/20",
        className
      )}
      title={`${balance} crédito${balance !== 1 ? "s" : ""} disponíveis`}
    >
      <Coins className="w-3.5 h-3.5 shrink-0" />
      <span>{balance}</span>
    </div>
  );
}
