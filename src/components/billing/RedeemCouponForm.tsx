import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useCredits } from "@/hooks/useCredits";
import { normalizeCoupon, isValidCouponFormat, formatCoupon, clearPendingCoupon } from "@/lib/coupon";
import { Loader2, Gift, Check } from "lucide-react";
import { toast } from "sonner";

/**
 * Form de resgate de cupom, compartilhado por todas as superfícies (/resgatar, BuyCreditsModal,
 * Profile). Só a moldura muda; a lógica de resgate mora aqui.
 *
 * A validação REAL acontece toda no servidor (edge function redeem-coupon → RPC redeem_coupon).
 * Aqui só validamos o FORMATO, e por um motivo específico: um typo de tamanho não deve gastar uma
 * tentativa do rate limiter, senão o comprador legítimo se auto-bloqueia digitando errado.
 */
interface Props {
  initialCode?: string;
  onRedeemed?: (credits: number) => void;
  autoFocus?: boolean;
}

export default function RedeemCouponForm({ initialCode = "", onRedeemed, autoFocus }: Props) {
  const [code, setCode] = useState(initialCode ? formatCoupon(initialCode) : "");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { refresh } = useCredits();

  const submit = async () => {
    setError(null);
    if (!isValidCouponFormat(code)) {
      setError("O código tem 8 caracteres, no formato TP-XXXX-XXXX.");
      return;
    }
    setLoading(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("redeem-coupon", {
        body: { code: normalizeCoupon(code) },
      });
      // supabase.functions.invoke trata status >= 400 como erro e o corpo vem em context.
      if (fnErr) {
        let msg = "Não consegui resgatar agora. Tente de novo.";
        try {
          const body = await (fnErr as any).context?.json?.();
          if (body?.message) msg = body.message;
        } catch { /* mantém a mensagem padrão */ }
        setError(msg);
        return;
      }
      if (!data?.ok) {
        setError(data?.message || "Não consegui resgatar esse código.");
        return;
      }
      clearPendingCoupon();
      setDone(data.credits);
      // O realtime da user_credits já atualiza o saldo sozinho; o refresh cobre o caso de o
      // canal não estar conectado ainda (mesmo padrão do onCredited do BuyCreditsModal).
      refresh();
      toast.success(`${data.credits} créditos adicionados!`);
      onRedeemed?.(data.credits);
    } finally {
      setLoading(false);
    }
  };

  if (done !== null) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-sm">
        <Check className="w-4 h-4 text-emerald-600 shrink-0" />
        <span><strong>{done} créditos</strong> adicionados à sua conta.</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Input
          value={code}
          onChange={(e) => { setCode(e.target.value); setError(null); }}
          onKeyDown={(e) => e.key === "Enter" && !loading && submit()}
          placeholder="TP-XXXX-XXXX"
          autoFocus={autoFocus}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          className="font-mono tracking-wider uppercase"
          disabled={loading}
        />
        <Button onClick={submit} disabled={loading || !code.trim()} className="gap-1.5 shrink-0">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gift className="w-4 h-4" />}
          Resgatar
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
