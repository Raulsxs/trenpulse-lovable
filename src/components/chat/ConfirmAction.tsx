import { Button } from "@/components/ui/button";
import { Send, CalendarClock, AlertTriangle, X, Check, Loader2, Coins } from "lucide-react";

interface Props {
  name: string;            // "publicar" | "agendar_conteudo" | tool de geração cara
  input: any;              // args propostos pelo agente
  cost?: number;           // créditos estimados (geração cara)
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// Confirmação obrigatória antes de ações irreversíveis (publicar/agendar) OU de gasto alto.
// O agente PROPÔS a ação; o usuário decide. Nada acontece até clicar Confirmar.
export default function ConfirmAction({ name, input, cost, busy, onConfirm, onCancel }: Props) {
  const isPublish = name === "publicar";
  const isSchedule = name === "agendar_conteudo";
  const plataformas: string[] = Array.isArray(input?.plataformas) ? input.plataformas : [];

  let Icon = Coins, titulo = "Confirmar ação?", detalhe = "";
  if (isPublish) {
    Icon = Send; titulo = "Publicar agora?";
    detalhe = `Vou publicar este conteúdo${plataformas.length ? ` em ${plataformas.join(", ")}` : " nas redes conectadas"}.`;
  } else if (isSchedule) {
    Icon = CalendarClock; titulo = "Agendar publicação?";
    detalhe = `Vou agendar para ${input?.data_hora_iso ? new Date(input.data_hora_iso).toLocaleString("pt-BR") : "a data informada"}${plataformas.length ? ` em ${plataformas.join(", ")}` : ""}.`;
  } else {
    Icon = Coins; titulo = "Confirmar geração?";
    detalhe = `Esta criação custa cerca de ${cost ?? "?"} créditos.`;
  }

  return (
    <div className="rounded-xl border border-amber-300/60 bg-amber-50 dark:bg-amber-950/20 p-3.5 space-y-3">
      <div className="flex items-start gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-amber-600" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> {titulo}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{detalhe}</p>
          {(isPublish || isSchedule) && typeof cost === "number" && cost > 0 && (
            <p className="text-[11px] text-muted-foreground mt-0.5">Custo: ~{cost} créditos.</p>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" className="flex-1 gap-1.5" onClick={onConfirm} disabled={busy}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Confirmar
        </Button>
        <Button size="sm" variant="outline" className="flex-1 gap-1.5" onClick={onCancel} disabled={busy}>
          <X className="w-4 h-4" /> Cancelar
        </Button>
      </div>
    </div>
  );
}
