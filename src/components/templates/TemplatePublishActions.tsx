/**
 * TemplatePublishActions — substitui o botao "Publicar (em breve)" do TemplateGenerator
 * por publish/schedule reais via PFM (Fase 2.1 do refactor template-first).
 *
 * Comportamento:
 *   - Carrega contas conectadas via useConnectedAccounts (cache compartilhado).
 *   - Lista checkboxes agrupados por plataforma.
 *   - Botoes "Publicar agora" e "Agendar" (modal com input datetime-local).
 *   - Invoca publish-postforme com platforms (set unico) + accountIds selecionados.
 */
import { useMemo, useState } from "react";
import { CalendarClock, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useConnectedAccounts } from "@/hooks/useConnectedAccounts";
import { supabase } from "@/integrations/supabase/client";

const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Instagram",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  x: "X",
  facebook: "Facebook",
  pinterest: "Pinterest",
  bluesky: "Bluesky",
  threads: "Threads",
  youtube: "YouTube",
};

export type TemplatePublishActionsProps = {
  contentId: string;
  onSuccess?: () => void;
};

type SelectedSet = Set<string>; // pfm_account_id

export default function TemplatePublishActions({ contentId, onSuccess }: TemplatePublishActionsProps) {
  const { accounts, loading } = useConnectedAccounts();
  const [selected, setSelected] = useState<SelectedSet>(new Set());
  const [busyMode, setBusyMode] = useState<"idle" | "publishing" | "scheduling">("idle");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduledAt, setScheduledAt] = useState<string>("");

  const grouped = useMemo(() => {
    const map = new Map<string, typeof accounts>();
    for (const a of accounts) {
      if (!a.pfm_account_id) continue;
      const arr = map.get(a.platform) ?? [];
      arr.push(a);
      map.set(a.platform, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [accounts]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedAccounts = useMemo(
    () => accounts.filter((a) => a.pfm_account_id && selected.has(a.pfm_account_id)),
    [accounts, selected],
  );

  const platformsSet = useMemo(
    () => Array.from(new Set(selectedAccounts.map((a) => a.platform))),
    [selectedAccounts],
  );

  const callPublish = async (scheduledAtIso?: string) => {
    if (selected.size === 0) return;
    setBusyMode(scheduledAtIso ? "scheduling" : "publishing");
    try {
      const body: Record<string, unknown> = {
        contentId,
        platforms: platformsSet,
        accountIds: Array.from(selected),
      };
      if (scheduledAtIso) body.scheduledAt = scheduledAtIso;

      const { data, error } = await supabase.functions.invoke("publish-postforme", { body });
      if (error || (data as any)?.error) {
        const msg = (error as any)?.message || (data as any)?.error || "Erro ao publicar";
        toast.error(msg);
        return;
      }
      toast.success(scheduledAtIso ? "Publicação agendada!" : "Publicação enviada!");
      onSuccess?.();
      if (scheduledAtIso) {
        setScheduleOpen(false);
        setScheduledAt("");
      }
    } catch (e: any) {
      toast.error(e?.message || "Erro ao publicar");
    } finally {
      setBusyMode("idle");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="publish-loading">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando contas conectadas...
      </div>
    );
  }

  if (grouped.length === 0) {
    return (
      <div className="text-sm text-muted-foreground" data-testid="publish-no-accounts">
        Nenhuma conta conectada. Conecte uma rede social no perfil pra publicar.
      </div>
    );
  }

  const isBusy = busyMode !== "idle";

  return (
    <div className="space-y-4" data-testid="publish-actions">
      <div className="space-y-3" data-testid="publish-account-list">
        {grouped.map(([platform, list]) => (
          <div key={platform} className="space-y-1.5" data-testid={`publish-platform-${platform}`}>
            <p className="text-xs font-medium text-muted-foreground">
              {PLATFORM_LABEL[platform] ?? platform}
            </p>
            <div className="space-y-1.5 pl-1">
              {list.map((acc) => {
                const id = acc.pfm_account_id!;
                const checked = selected.has(id);
                return (
                  <label
                    key={id}
                    htmlFor={`acc-${id}`}
                    className="flex items-center gap-2 cursor-pointer text-sm"
                    data-testid={`publish-account-${id}`}
                  >
                    <Checkbox
                      id={`acc-${id}`}
                      checked={checked}
                      onCheckedChange={() => toggle(id)}
                      disabled={isBusy}
                    />
                    <span>{acc.account_name || `${platform} (sem nome)`}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => callPublish()}
          disabled={selected.size === 0 || isBusy}
          data-testid="publish-now"
        >
          {busyMode === "publishing" ? (
            <Loader2 className="h-4 w-4 animate-spin mr-1" />
          ) : (
            <Send className="h-4 w-4 mr-1" />
          )}
          {busyMode === "publishing" ? "Publicando..." : "Publicar agora"}
        </Button>
        <Button
          variant="outline"
          onClick={() => setScheduleOpen(true)}
          disabled={selected.size === 0 || isBusy}
          data-testid="publish-schedule-open"
        >
          <CalendarClock className="h-4 w-4 mr-1" />
          Agendar
        </Button>
      </div>

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent data-testid="publish-schedule-dialog">
          <DialogHeader>
            <DialogTitle>Agendar publicação</DialogTitle>
            <DialogDescription>
              Escolha data e hora futura para publicar nas {selected.size} conta(s) selecionada(s).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="schedule-datetime">Data e hora</Label>
            <input
              id="schedule-datetime"
              type="datetime-local"
              className="w-full border rounded-md px-3 py-2 text-sm bg-background"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              data-testid="publish-schedule-input"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setScheduleOpen(false)}
              disabled={isBusy}
              data-testid="publish-schedule-cancel"
            >
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (!scheduledAt) {
                  toast.error("Escolha uma data e hora");
                  return;
                }
                const iso = new Date(scheduledAt).toISOString();
                callPublish(iso);
              }}
              disabled={!scheduledAt || isBusy}
              data-testid="publish-schedule-confirm"
            >
              {busyMode === "scheduling" ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : null}
              Confirmar agendamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
