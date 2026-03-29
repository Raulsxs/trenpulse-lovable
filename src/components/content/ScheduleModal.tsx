import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarClock, Clock, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ScheduleModalProps {
  open: boolean;
  onClose: () => void;
  onSchedule: (date: Date) => Promise<void>;
  isScheduling: boolean;
}

const ScheduleModal = ({ open, onClose, onSchedule, isScheduling }: ScheduleModalProps) => {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [selectedHour, setSelectedHour] = useState("09");
  const [selectedMinute, setSelectedMinute] = useState("00");

  const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, "0"));
  const minutes = ["00", "15", "30", "45"];

  const handleSchedule = async () => {
    if (!selectedDate) return;

    const scheduledDate = new Date(selectedDate);
    scheduledDate.setHours(parseInt(selectedHour), parseInt(selectedMinute), 0, 0);
    
    await onSchedule(scheduledDate);
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
              disabled={!selectedDate || isScheduling}
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
