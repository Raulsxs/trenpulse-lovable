import { Coins } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCredits } from "@/hooks/useCredits";

interface CreditsBadgeProps {
  className?: string;
}

export function CreditsBadge({ className }: CreditsBadgeProps) {
  // Fonte de verdade: tabela user_credits (via hook). NÃO usar profiles.credits_balance — coluna
  // legada (migration de mai/2026) que o débito/crédito atual não atualiza mais.
  const { balance } = useCredits();

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
