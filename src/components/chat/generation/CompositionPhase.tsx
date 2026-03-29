import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2 } from "lucide-react";

interface CompositionPhaseProps {
  isLoading: boolean;
  loadingMessage: string | null;
  onCancel: () => void;
}

export default function CompositionPhase({
  isLoading,
  loadingMessage,
  onCancel,
}: CompositionPhaseProps) {
  if (!isLoading) return null;

  return (
    <div className="bg-muted/50 border border-border rounded-xl p-4 my-2 animate-in fade-in slide-in-from-bottom-2">
      <div className="flex items-center gap-3 mb-3">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
        <p className="text-sm text-foreground">
          {loadingMessage || "Compondo as imagens finais... 🖼️"}
        </p>
      </div>
      <Skeleton className="w-full aspect-square rounded-lg" />
      <div className="mt-3 flex justify-end">
        <Button size="sm" variant="ghost" className="text-xs text-muted-foreground" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
