import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface DraftRestoreModalProps {
  open: boolean;
  savedAt: number;
  onRestore: () => void;
  onDiscard: () => void;
}

export default function DraftRestoreModal({ open, savedAt, onRestore, onDiscard }: DraftRestoreModalProps) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Restaurar rascunho?</AlertDialogTitle>
          <AlertDialogDescription>
            Encontramos um rascunho salvo em{" "}
            <strong>
              {format(new Date(savedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </strong>
            . Deseja restaurar ou descartar?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onDiscard}>Descartar</AlertDialogCancel>
          <AlertDialogAction onClick={onRestore}>Restaurar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
