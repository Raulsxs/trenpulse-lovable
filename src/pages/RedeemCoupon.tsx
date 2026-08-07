import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import RedeemCouponForm from "@/components/billing/RedeemCouponForm";
import { couponFromUrl, savePendingCoupon, formatCoupon } from "@/lib/coupon";
import { Gift, Loader2, ArrowRight } from "lucide-react";

/**
 * /resgatar — o link canônico que vai no email pós-compra.
 *
 * Precisa funcionar DESLOGADO (o comprador acabou de comprar e provavelmente ainda não tem conta):
 * nesse caso a página guarda o código e manda pro signup preservando-o, e o resgate acontece sozinho
 * assim que ele entra (usePendingCoupon).
 */
export default function RedeemCoupon() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const urlCode = couponFromUrl(`?${searchParams.toString()}`);
  const [session, setSession] = useState<"loading" | "in" | "out">("loading");

  useEffect(() => {
    // Guarda o código ANTES de qualquer navegação: se o usuário for pro signup, ele precisa
    // sobreviver ao round-trip da confirmação de email.
    if (urlCode) savePendingCoupon(urlCode);
    supabase.auth.getUser().then(({ data: { user } }) => setSession(user ? "in" : "out"));
  }, [urlCode]);

  return (
    <div className="min-h-screen grid place-items-center bg-background px-4">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 grid place-items-center">
          <Gift className="w-7 h-7 text-primary" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Resgatar créditos</h1>
          <p className="text-muted-foreground text-sm">
            {urlCode
              ? <>Seu código <strong className="font-mono text-foreground">{formatCoupon(urlCode)}</strong> está pronto pra ser usado.</>
              : "Digite o código que você recebeu por email."}
          </p>
        </div>

        {session === "loading" && (
          <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        )}

        {session === "in" && (
          <div className="text-left">
            <RedeemCouponForm initialCode={urlCode || ""} autoFocus onRedeemed={() => setTimeout(() => navigate("/agent"), 1600)} />
          </div>
        )}

        {session === "out" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Crie sua conta (ou entre) e os créditos entram automaticamente.
            </p>
            <Button
              className="w-full gap-2"
              onClick={() => navigate(`/auth?tab=signup${urlCode ? `&coupon=${urlCode}` : ""}`)}
            >
              Criar conta e resgatar <ArrowRight className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => navigate(`/auth${urlCode ? `?coupon=${urlCode}` : ""}`)}
            >
              Já tenho conta
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
