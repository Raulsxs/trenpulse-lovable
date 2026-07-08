import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarClock, Clock, Loader2, Send } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { PLATFORMS, type ConnectedAccount } from "@/components/profile/SocialConnections";

interface ScheduleModalProps {
  open: boolean;
  onClose: () => void;
  // selectedAccountIds só é passado quando o modal exibe a seleção de contas (Calendário).
  // Superfícies que já selecionaram a conta antes (ActionCard) ignoram o 2º argumento.
  onSchedule: (date: Date, selectedAccountIds?: string[]) => Promise<void>;
  isScheduling: boolean;
  // Quando fornecido, o modal mostra a seleção de REDE (contas) — mirror do popover do ActionCard.
  connectedAccounts?: ConnectedAccount[];
  preSelectedAccountIds?: string[];
  onReconnect?: () => void;
}

const ScheduleModal = ({ open, onClose, onSchedule, isScheduling, connectedAccounts, preSelectedAccountIds, onReconnect }: ScheduleModalProps) => {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [selectedHour, setSelectedHour] = useState("09");
  const [selectedMinute, setSelectedMinute] = useState("00");
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);

  const showAccounts = Array.isArray(connectedAccounts);
  const validAccounts = (connectedAccounts || []).filter((a) => a.pfm_account_id && !a.expired);

  // Pré-seleção quando abre: usa o que veio, ou todas as contas válidas.
  useEffect(() => {
    if (!open || !showAccounts) return;
    const pre = preSelectedAccountIds?.length
      ? preSelectedAccountIds
      : validAccounts.map((a) => a.pfm_account_id!).filter(Boolean);
    setSelectedAccountIds(pre);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggleAccount = (id: string) =>
    setSelectedAccountIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, "0"));
  const minutes = ["00", "15", "30", "45"];

  const noValidAccounts = showAccounts && validAccounts.length === 0;
  const needsAccountPick = showAccounts && selectedAccountIds.length === 0;

  const handleSchedule = async () => {
    if (!selectedDate) return;
    if (needsAccountPick) return;

    const scheduledDate = new Date(selectedDate);
    scheduledDate.setHours(parseInt(selectedHour), parseInt(selectedMinute), 0, 0);

    await onSchedule(scheduledDate, showAccounts ? selectedAccountIds : undefined);
  };

  const handleClose = () => {
    if (!isScheduling) {
      setSelectedDate(new Date());
      setSelectedHour("09");
      setSelectedMinute("00");
      onClose();
    }
  };

  const isDateDisabled = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-primary" />
            Agendar Publicação
          </DialogTitle>
          <DialogDescription>
            Escolha a data e horário para publicar este conteúdo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {showAccounts && (
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Send className="w-3.5 h-3.5" />
                Publicar em
              </Label>
              {noValidAccounts ? (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
                  <p className="text-amber-700 font-medium mb-1">Nenhuma rede conectada e ativa.</p>
                  <p className="text-muted-foreground text-xs mb-2">Conecte (ou reconecte) uma rede no Perfil para agendar.</p>
                  {onReconnect && (
                    <Button size="sm" variant="outline" onClick={onReconnect}>Ir para Conexões</Button>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {(connectedAccounts || []).map((account) => {
                    const info = PLATFORMS.find((p) => p.id === account.platform);
                    if (!info) return null;
                    const key = account.pfm_account_id || account.platform;
                    const expired = account.expired === true;
                    const isSelected = selectedAccountIds.includes(key) && !expired;
                    return (
                      <label
                        key={key}
                        className={`flex items-center gap-2.5 p-2 rounded-md transition-colors ${
                          expired ? "bg-amber-500/10 cursor-not-allowed" : isSelected ? "bg-primary/5 cursor-pointer" : "hover:bg-muted/50 cursor-pointer"
                        }`}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => !expired && account.pfm_account_id && toggleAccount(key)}
                          disabled={isScheduling || expired}
                        />
                        <div className={`w-6 h-6 rounded ${info.bgColor} flex items-center justify-center ${info.iconColor} shrink-0`}>
                          <info.icon className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-medium block">{info.name}</span>
                          {expired ? (
                            <span className="text-[10px] font-medium text-amber-600 block truncate">conexão expirada — reconecte no Perfil</span>
                          ) : account.account_name ? (
                            <span className="text-[10px] text-muted-foreground block truncate">{account.account_name}</span>
                          ) : null}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-center">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              disabled={isDateDisabled}
              locale={ptBR}
              className="rounded-md border pointer-events-auto"
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Horário
            </Label>
            <div className="flex gap-2">
              <Select value={selectedHour} onValueChange={setSelectedHour}>
                <SelectTrigger className="w-[100px]">
                  <SelectValue placeholder="Hora" />
                </SelectTrigger>
                <SelectContent>
                  {hours.map((hour) => (
                    <SelectItem key={hour} value={hour}>
                      {hour}h
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="flex items-center text-muted-foreground">:</span>
              <Select value={selectedMinute} onValueChange={setSelectedMinute}>
                <SelectTrigger className="w-[100px]">
                  <SelectValue placeholder="Min" />
                </SelectTrigger>
                <SelectContent>
                  {minutes.map((min) => (
                    <SelectItem key={min} value={min}>
                      {min}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedDate && (
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
              <p className="text-sm text-center">
                <span className="text-muted-foreground">Agendado para: </span>
                <span className="font-medium text-foreground">
                  {format(selectedDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })} às {selectedHour}:{selectedMinute}
                </span>
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button 
              variant="outline" 
              onClick={handleClose}
              disabled={isScheduling}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSchedule}
              disabled={!selectedDate || isScheduling || needsAccountPick || noValidAccounts}
              className="gap-2"
            >
              {isScheduling ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Agendando...
                </>
              ) : (
                <>
                  <CalendarClock className="w-4 h-4" />
                  Agendar
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ScheduleModal;
