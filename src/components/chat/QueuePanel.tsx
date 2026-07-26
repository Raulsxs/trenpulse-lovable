import { Loader2, Clock, Check, AlertTriangle, X, Trash2, Eye, RotateCcw, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GenerationJob, JobStatus } from "@/hooks/useGenerationQueue";

// Painel lateral da FILA de gerações. Mostra os jobs ao vivo (realtime) com status; deixa cancelar
// o que está na fila, ver o conteúdo pronto no chat, retomar o que precisa de confirmação e limpar.
const STATUS: Record<JobStatus, { label: string; cls: string; icon: any; spin?: boolean }> = {
  queued:       { label: "Na fila",        cls: "text-muted-foreground",       icon: Clock },
  processing:   { label: "Gerando…",       cls: "text-primary",                icon: Loader2, spin: true },
  done:         { label: "Pronto",         cls: "text-emerald-600",            icon: Check },
  failed:       { label: "Falhou",         cls: "text-destructive",            icon: AlertTriangle },
  needs_review: { label: "Precisa de você", cls: "text-amber-600",             icon: AlertTriangle },
  canceled:     { label: "Cancelado",      cls: "text-muted-foreground/60",    icon: X },
};

interface Props {
  open: boolean;
  onClose: () => void;
  jobs: GenerationJob[];
  onCancel: (id: string) => void;
  onRemove: (id: string) => void;
  onClearFinished: () => void;
  onView: (contentId: string) => void;
  onResume: (prompt: string) => void;
}

export default function QueuePanel({ open, onClose, jobs, onCancel, onRemove, onClearFinished, onView, onResume }: Props) {
  const hasFinished = jobs.some((j) => ["done", "failed", "canceled"].includes(j.status));
  return (
    <>
      {/* Backdrop (mobile e desktop) — clicar fora fecha. */}
      <div
        className={`fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px] transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={onClose}
      />
      <aside
        className={`fixed top-0 right-0 z-50 h-[100dvh] w-[min(360px,90vw)] bg-background border-l border-border shadow-2xl flex flex-col transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`}
        aria-hidden={!open}
      >
        <header className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
          <ListChecks className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-bold flex-1">Fila de gerações</h2>
          {hasFinished && (
            <button onClick={onClearFinished} className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors" title="Limpar concluídos">
              <Trash2 className="w-3 h-3" /> Limpar
            </button>
          )}
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted transition-colors"><X className="w-4 h-4" /></button>
        </header>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {jobs.length === 0 && (
            <div className="text-center pt-16 px-6 text-sm text-muted-foreground">
              <ListChecks className="w-8 h-8 mx-auto mb-3 opacity-40" />
              Sua fila está vazia. Enfileire vários pedidos e eles são gerados um a um — pode fechar a aba que continua.
            </div>
          )}
          {jobs.map((j) => {
            const s = STATUS[j.status] || STATUS.queued;
            const Icon = s.icon;
            return (
              <div key={j.id} className="rounded-lg border border-border bg-card p-2.5 animate-in fade-in slide-in-from-right-2 duration-200">
                <div className="flex items-start gap-2">
                  <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${s.cls} ${s.spin ? "animate-spin" : ""}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] leading-snug line-clamp-2">{j.title || j.prompt}</p>
                    <p className={`text-[11px] font-medium mt-0.5 ${s.cls}`}>{s.label}</p>
                    {j.status === "failed" && j.error && (
                      <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{j.error}</p>
                    )}
                    {j.status === "needs_review" && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">Publicar/agendar precisa da sua confirmação no chat.</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 mt-2 pl-6">
                  {j.status === "done" && j.content_id && (
                    <Button size="sm" variant="outline" className="h-6 px-2 gap-1 text-[11px]" onClick={() => onView(j.content_id!)}>
                      <Eye className="w-3 h-3" /> Ver
                    </Button>
                  )}
                  {j.status === "needs_review" && (
                    <Button size="sm" variant="outline" className="h-6 px-2 gap-1 text-[11px]" onClick={() => onResume(j.prompt)}>
                      <RotateCcw className="w-3 h-3" /> Finalizar no chat
                    </Button>
                  )}
                  {j.status === "queued" && (
                    <Button size="sm" variant="ghost" className="h-6 px-2 gap-1 text-[11px] text-muted-foreground" onClick={() => onCancel(j.id)}>
                      <X className="w-3 h-3" /> Cancelar
                    </Button>
                  )}
                  {["done", "failed", "canceled"].includes(j.status) && (
                    <button onClick={() => onRemove(j.id)} className="ml-auto p-1 rounded hover:bg-muted text-muted-foreground/60 hover:text-destructive transition-colors" title="Remover">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </aside>
    </>
  );
}
