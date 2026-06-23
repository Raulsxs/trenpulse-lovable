import { Button } from "@/components/ui/button";
import { CostChip } from "@/components/ui/cost-chip";
import { Send, CalendarClock, X, Check, Loader2, Coins } from "lucide-react";

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
// Card neutro: âmbar é reservado a CRÉDITOS (DESIGN.md), então o custo sai só pelo CostChip,
// nunca pintando o fundo de uma confirmação de publicar/agendar.
export default function ConfirmAction({ name, input, cost, busy, onConfirm, onCancel }: Props) {
  const isPublish = name === "publicar";
  const isSchedule = name === "agendar_conteudo";
  const plataformas: string[] = Array.isArray(input?.plataformas) ? input.plataformas : [];

  let Icon = Coins, titulo = "Confirmar geração?", detalhe = "", cta = "Confirmar";
  if (isPublish) {
    Icon = Send; titulo = "Publicar agora?"; cta = "Publicar";
    detalhe = `Vou publicar este conteúdo${plataformas.length ? ` em ${plataformas.join(", ")}` : " nas redes conectadas"}.`;
  } else if (isSchedule) {
    Icon = CalendarClock; titulo = "Agendar publicação?"; cta = "Agendar";
    detalhe = `Vou agendar para ${input?.data_hora_iso ? new Date(input.data_hora_iso).toLocaleString("pt-BR") : "a data informada"}${plataformas.length ? ` em ${plataformas.join(", ")}` : ""}.`;
  } else {
    Icon = Coins; titulo = "Confirmar geração?";
    detalhe = "Esta criação consome créditos. Confirma pra eu seguir?";
  }

  const showCost = typeof cost === "number" && cost > 0;

  return (
    <div className="rounded-xl border border-border bg-card p-3.5 space-y-3 shadow-sm">
      <div className="flex items-start gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-foreground">{titulo}</p>
            {showCost && <CostChip cost={cost} />}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{detalhe}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" className="flex-1 gap-1.5" onClick={onConfirm} disabled={busy}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {cta}
        </Button>
        <Button size="sm" variant="outline" className="flex-1 gap-1.5" onClick={onCancel} disabled={busy}>
          <X className="w-4 h-4" /> Cancelar
        </Button>
      </div>
    </div>
  );
}
