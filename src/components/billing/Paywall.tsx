/**
 * Paywall overlay — shown when user hits their generation limit.
 *
 * Psychology applied:
 * - Endowment Effect: blurred content behind = they already "have" it
 * - Zeigarnik Effect: "Seu conteúdo está quase pronto" = unfinished task tension
 * - Loss Aversion: framed as what they're losing, not what they'd gain
 * - Mental Accounting: "menos de R$5/dia" reframes cost
 * - Contrast Effect: "5 gerações → 100 gerações" shows 20x jump
 */
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Lock, Sparkles, Zap, ArrowRight } from "lucide-react";

interface PaywallProps {
  generationsUsed: number;
  generationsLimit: number;
  planName: string;
  children?: React.ReactNode;
}

export default function Paywall({ generationsUsed, generationsLimit, planName, children }: PaywallProps) {
  const navigate = useNavigate();
  const remaining = Math.max(0, generationsLimit - generationsUsed);

  return (
    <div className="relative">
      {/* Blurred content behind — Endowment: they can SEE what they created */}
      {children && (
        <div className="blur-md opacity-50 pointer-events-none select-none">
          {children}
        </div>
      )}

      {/* Paywall overlay */}
      <div className="absolute inset-0 flex items-center justify-center z-50">
        <div className="bg-background border border-border rounded-2xl shadow-2xl p-8 max-w-md mx-4 text-center">
          <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-950/50 flex items-center justify-center mx-auto mb-6">
            <Lock className="w-8 h-8 text-amber-600 dark:text-amber-400" />
          </div>

          {/* Zeigarnik: unfinished task framing */}
          <h2 className="text-2xl font-bold text-foreground mb-2">
            Seu conteúdo está quase pronto
          </h2>

          {/* Loss Aversion: focus on what they lose */}
          <p className="text-muted-foreground mb-4">
            {remaining === 0
              ? <>Você usou todas as <strong>{generationsLimit} gerações</strong> do plano {planName} este mês.</>
              : <>Você atingiu o limite de <strong>{generationsLimit} gerações</strong> do plano {planName}.</>
            }
          </p>

          {/* Contrast: show the upgrade value */}
          <div className="flex items-center justify-center gap-3 mb-6 text-sm">
            <span className="px-3 py-1.5 rounded-lg bg-muted text-muted-foreground">
              {generationsLimit} gerações
            </span>
            <ArrowRight className="w-4 h-4 text-primary" />
            <span className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary font-medium">
              100 gerações
            </span>
          </div>

          <div className="space-y-3">
            <Button
              size="lg"
              className="w-full gap-2 text-base shadow-md"
              onClick={() => navigate("/pricing")}
            >
              <Zap className="w-5 h-5" />
              Desbloquear com Pro
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground"
              onClick={() => navigate("/contents")}
            >
              Ver conteúdos que já criei
            </Button>
          </div>

          {/* Mental Accounting: reframe price as daily cost */}
          <div className="mt-6 p-3 bg-primary/5 border border-primary/10 rounded-lg">
            <div className="flex items-center gap-2 justify-center text-sm">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-foreground">
                <strong>R$147,90/mês</strong>
                <span className="text-muted-foreground"> — menos de R$5/dia</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
