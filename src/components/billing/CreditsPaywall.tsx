import { Coins, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface CreditsPaywallProps {
  open: boolean;
  onClose: () => void;
  balance: number;
  cost: number;
  templateName?: string;
}

export function CreditsPaywall({
  open,
  onClose,
  balance,
  cost,
  templateName,
}: CreditsPaywallProps) {
  const needed = cost - balance;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader className="text-center items-center">
          <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mb-2">
            <Coins className="w-7 h-7 text-destructive" />
          </div>
          <DialogTitle>Créditos insuficientes</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-1 text-center">
              <p>
                {templateName ? (
                  <>
                    O template <strong className="text-foreground">{templateName}</strong> custa{" "}
                    <strong className="text-foreground">{cost} crédito{cost !== 1 ? "s" : ""}</strong>.
                  </>
                ) : (
                  <>
                    Esta ação custa{" "}
                    <strong className="text-foreground">{cost} crédito{cost !== 1 ? "s" : ""}</strong>.
                  </>
                )}
              </p>
              <p>
                Seu saldo: <strong className="text-foreground">{balance}</strong>
                {needed > 0 && (
                  <span className="text-destructive"> (faltam {needed})</span>
                )}
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 mt-2">
          {/* Gateway de pagamento pendente TASK-21 (Asaas vs Stripe) */}
          <Button className="w-full gap-2" disabled title="Compra de créditos em breve">
            <ShoppingBag className="w-4 h-4" />
            Comprar créditos
            <span className="ml-auto text-xs opacity-50">em breve</span>
          </Button>
          <Button variant="ghost" size="sm" className="w-full" onClick={onClose}>
            Voltar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
