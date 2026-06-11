import { cn } from "@/lib/utils";

/**
 * Chip de custo — assinatura do design system (DESIGN.md): toda ação que gasta
 * créditos mostra o preço ANTES do clique. Âmbar é reservado a créditos.
 * `cost={0}` ou `free` renderiza a variante verde "grátis".
 */
export function CostChip({
  cost,
  free = false,
  className,
}: {
  cost?: number;
  free?: boolean;
  className?: string;
}) {
  const isFree = free || cost === 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0 text-[10px] font-bold leading-4 tabular-nums",
        isFree
          ? "border-success/25 bg-success/10 text-success"
          : "border-[hsl(var(--credit))]/25 bg-[hsl(var(--credit-bg))] text-[hsl(var(--credit))]",
        className,
      )}
    >
      {isFree ? "grátis" : `${cost} cr`}
    </span>
  );
}
