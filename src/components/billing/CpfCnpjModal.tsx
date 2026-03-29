import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface CpfCnpjModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (cpfCnpj: string) => void;
  loading?: boolean;
}

function formatCpfCnpj(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 11) {
    // CPF: 000.000.000-00
    return digits
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }
  // CNPJ: 00.000.000/0000-00
  return digits
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

function isValidCpfCnpj(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length === 11 || digits.length === 14;
}

export default function CpfCnpjModal({ open, onClose, onConfirm, loading }: CpfCnpjModalProps) {
  const [value, setValue] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 14);
    setValue(formatCpfCnpj(raw));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const digits = value.replace(/\D/g, "");
    if (isValidCpfCnpj(digits)) {
      onConfirm(digits);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>CPF ou CNPJ</DialogTitle>
          <DialogDescription>
            Para processar o pagamento, precisamos do seu CPF ou CNPJ.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cpf-cnpj">CPF / CNPJ</Label>
            <Input
              id="cpf-cnpj"
              placeholder="000.000.000-00"
              value={value}
              onChange={handleChange}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!isValidCpfCnpj(value) || loading}>
              {loading ? "Processando..." : "Continuar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
