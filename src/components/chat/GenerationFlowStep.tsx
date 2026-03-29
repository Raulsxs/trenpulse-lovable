import type { GenerationFlowState, GenerationPhase } from "@/hooks/useGenerationFlow";
import ConfigPhase from "./generation/ConfigPhase";

interface GenerationFlowStepProps {
  flow: GenerationFlowState;
  userId: string;
  onConfigSelect: (key: string, value: any) => void;
  onCancel: () => void;
  onBack?: () => void;
}

export default function GenerationFlowStep({
  flow,
  userId,
  onConfigSelect,
  onCancel,
  onBack,
}: GenerationFlowStepProps) {
  // Only config phase remains — background/text/composition are now async
  if (flow.phase === "config") {
    return (
      <ConfigPhase
        configStep={flow.configStep}
        flow={flow}
        userId={userId}
        onSelect={onConfigSelect}
        onCancel={onCancel}
        onBack={onBack}
      />
    );
  }

  // Loading state while INICIAR_GERACAO is running
  if (flow.phase === "background" && flow.isLoading) {
    return (
      <div className="bg-muted/50 border border-border rounded-xl p-4 my-2 animate-in fade-in slide-in-from-bottom-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-foreground">
              {flow.loadingMessage || "Preparando seu conteúdo... ⏳"}
            </p>
          </div>
          <button
            onClick={onCancel}
            className="text-xs text-muted-foreground hover:text-destructive transition-colors px-2 py-1 rounded-md hover:bg-destructive/10"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return null;
}
