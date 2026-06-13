import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Check, Copy, Loader2, QrCode, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";

// Espelha os PACKS da edge function create-credit-charge
const PACKS = [
  { id: "50", value: 50, credits: 500, label: "Inicial" },
  { id: "100", value: 100, credits: 1050, label: "Popular", bonus: "+5%" },
  { id: "200", value: 200, credits: 2200, label: "Pro", bonus: "+10%" },
];

interface Charge {
  paymentId: string;
  credits: number;
  value: number;
  qrImage: string;
  qrPayload: string;
}

export default function BuyCreditsModal({
  open,
  onClose,
  onCredited,
}: {
  open: boolean;
  onClose: () => void;
  onCredited?: () => void;
}) {
  const [pack, setPack] = useState("100");
  const [method, setMethod] = useState<"pix" | "card">("pix");
  const [cpf, setCpf] = useState("");
  const [loading, setLoading] = useState(false);
  const [charge, setCharge] = useState<Charge | null>(null);
  const [paid, setPaid] = useState(false);
  const [copied, setCopied] = useState(false);
  // Cartão
  const [cardNumber, setCardNumber] = useState("");
  const [cardName, setCardName] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCcv, setCardCcv] = useState("");
  const [cep, setCep] = useState("");
  const [addrNum, setAddrNum] = useState("");
  const [phone, setPhone] = useState("");
  const startBalance = useRef<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // reset ao abrir/fechar
  useEffect(() => {
    if (!open) {
      if (pollRef.current) clearInterval(pollRef.current);
      setTimeout(() => {
        setCharge(null); setPaid(false); setCpf(""); setLoading(false); setMethod("pix");
        setCardNumber(""); setCardName(""); setCardExpiry(""); setCardCcv(""); setCep(""); setAddrNum(""); setPhone("");
      }, 200);
    }
  }, [open]);

  // Quando o pagamento cai (PIX ou cartão), o webhook credita — aqui só detectamos o aumento de saldo.
  function pollUntilCredited() {
    pollRef.current = setInterval(async () => {
      const b = await readBalance();
      if (startBalance.current !== null && b > startBalance.current) {
        if (pollRef.current) clearInterval(pollRef.current);
        setPaid(true);
        onCredited?.();
      }
    }, 4000);
  }

  async function handleCardPay() {
    const digits = cpf.replace(/\D/g, "");
    if (digits.length !== 11 && digits.length !== 14) { toast.error("Informe um CPF ou CNPJ válido"); return; }
    const [mm, aa] = cardExpiry.split("/").map((s) => s.trim());
    if (!cardNumber || !cardName || !mm || !aa || !cardCcv) { toast.error("Preencha os dados do cartão"); return; }
    if (!cep || !addrNum || !phone) { toast.error("Preencha CEP, número e telefone do titular"); return; }
    setLoading(true);
    try {
      startBalance.current = await readBalance();
      const { data, error } = await supabase.functions.invoke("create-credit-charge", {
        body: {
          pack, cpfCnpj: digits, method: "card",
          card: { number: cardNumber, holderName: cardName, expiryMonth: mm, expiryYear: aa.length === 2 ? `20${aa}` : aa, ccv: cardCcv },
          holder: { postalCode: cep, addressNumber: addrNum, phone },
        },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message || "Falha no pagamento");
      if (data?.paid) { setPaid(true); onCredited?.(); }
      else { toast.info("Pagamento em processamento…"); pollUntilCredited(); }
    } catch (e: any) {
      toast.error(e.message || "Cartão recusado. Tente outro ou use o PIX.");
    } finally {
      setLoading(false);
    }
  }

  async function readBalance(): Promise<number> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 0;
    const { data } = await (supabase as any).from("user_credits").select("balance").eq("user_id", user.id).maybeSingle();
    return data?.balance ?? 0;
  }

  async function handleGenerate() {
    const digits = cpf.replace(/\D/g, "");
    if (digits.length !== 11 && digits.length !== 14) {
      toast.error("Informe um CPF ou CNPJ válido");
      return;
    }
    setLoading(true);
    try {
      startBalance.current = await readBalance();
      const { data, error } = await supabase.functions.invoke("create-credit-charge", {
        body: { pack, cpfCnpj: digits },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message || "Falha ao gerar cobrança");
      setCharge(data as Charge);
      pollUntilCredited();
    } catch (e: any) {
      toast.error(e.message || "Erro ao gerar PIX");
    } finally {
      setLoading(false);
    }
  }

  function copyPayload() {
    if (!charge) return;
    navigator.clipboard.writeText(charge.qrPayload);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const selected = PACKS.find((p) => p.id === pack)!;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{paid ? "Créditos adicionados!" : "Comprar créditos"}</DialogTitle>
        </DialogHeader>

        {paid ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center">
              <Check className="w-7 h-7 text-emerald-600" />
            </div>
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">+{charge?.credits} créditos</span> caíram na sua conta.
            </p>
            <Button onClick={onClose} className="mt-2 w-full">Pronto</Button>
          </div>
        ) : charge ? (
          <div className="flex flex-col items-center gap-3 py-2">
            <p className="text-sm text-muted-foreground text-center">
              Escaneie o QR no app do banco ou copie o código. Os créditos entram automaticamente após o pagamento.
            </p>
            <img
              src={`data:image/png;base64,${charge.qrImage}`}
              alt="QR Code PIX"
              className="w-48 h-48 rounded-lg border border-border"
            />
            <button
              onClick={copyPayload}
              className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg border border-border bg-muted/30 hover:bg-muted/60 transition-colors w-full justify-center"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copiado!" : "Copiar código PIX"}
            </button>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Aguardando pagamento de R${charge.value}…
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-1">
            <div className="grid grid-cols-3 gap-2">
              {PACKS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPack(p.id)}
                  className={cn(
                    "rounded-xl border p-3 text-center transition-all",
                    pack === p.id
                      ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                      : "border-border hover:border-primary/40",
                  )}
                >
                  <div className="text-sm font-semibold text-foreground">R${p.value}</div>
                  <div className="text-[11px] text-muted-foreground">{p.credits} créditos</div>
                  {p.bonus && <div className="text-[10px] text-emerald-600 font-medium mt-0.5">{p.bonus}</div>}
                </button>
              ))}
            </div>

            {/* Tradução crédito → resultado (ancoragem: psicologia do plano-ideal) */}
            <div className="rounded-lg border border-[hsl(var(--credit))]/25 bg-[hsl(var(--credit-bg))] px-3 py-2 text-center text-xs font-medium text-[hsl(var(--credit))] tabular-nums">
              {selected.credits.toLocaleString("pt-BR")} créditos ≈ {Math.floor(selected.credits / 8)} posts com imagem · não expiram
            </div>

            {/* Abas de método */}
            <div className="flex gap-1 rounded-lg bg-muted/40 p-1">
              {(["pix", "card"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMethod(m)}
                  className={cn(
                    "flex-1 inline-flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-semibold transition-colors",
                    method === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {m === "pix" ? <QrCode className="w-3.5 h-3.5" /> : <CreditCard className="w-3.5 h-3.5" />}
                  {m === "pix" ? "PIX · na hora" : "Cartão"}
                </button>
              ))}
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">CPF/CNPJ</label>
              <Input value={cpf} onChange={(e) => setCpf(e.target.value)} placeholder="000.000.000-00" inputMode="numeric" />
            </div>

            {method === "pix" ? (
              <Button onClick={handleGenerate} disabled={loading} className="w-full gap-2">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
                Gerar PIX de R${selected.value}
              </Button>
            ) : (
              <div className="space-y-2.5">
                <Input value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} placeholder="Número do cartão" inputMode="numeric" />
                <Input value={cardName} onChange={(e) => setCardName(e.target.value)} placeholder="Nome impresso no cartão" />
                <div className="grid grid-cols-2 gap-2">
                  <Input value={cardExpiry} onChange={(e) => setCardExpiry(e.target.value)} placeholder="Validade MM/AA" inputMode="numeric" />
                  <Input value={cardCcv} onChange={(e) => setCardCcv(e.target.value)} placeholder="CVV" inputMode="numeric" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Input value={cep} onChange={(e) => setCep(e.target.value)} placeholder="CEP" inputMode="numeric" />
                  <Input value={addrNum} onChange={(e) => setAddrNum(e.target.value)} placeholder="Nº" inputMode="numeric" />
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Telefone" inputMode="numeric" />
                </div>
                <Button onClick={handleCardPay} disabled={loading} className="w-full gap-2">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                  Pagar R${selected.value} no cartão
                </Button>
                <p className="text-[10px] text-muted-foreground text-center">🔒 Processado pelo Asaas. Os créditos caem em até 1 min.</p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
