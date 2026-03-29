/**
 * Pricing cards component — reusable on both the public Pricing page and inside the app.
 * 3 tiers: Free (lead gen), Pro R$147,90 (target), Business R$297 (anchor).
 *
 * Psychology applied:
 * - Anchoring: Business shown at R$297 makes Pro look like great value
 * - Decoy: Business exists mainly to make Pro the obvious choice
 * - Mental Accounting: "menos de R$5/dia" reframes monthly cost
 * - Social Proof: "Mais escolhido" badge on Pro
 * - Loss Aversion: Free tier framed around what you DON'T get
 * - Charm Pricing: R$147,90 (left-digit = 1, not 1-5-0)
 */
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, X, Sparkles, Crown, Rocket } from "lucide-react";

interface PricingFeature {
  text: string;
  included: boolean;
}

interface PricingPlan {
  name: string;
  displayName: string;
  price: string;
  priceDetail: string;
  priceSubtext?: string;
  features: PricingFeature[];
  highlighted?: boolean;
  cta: string;
  icon: React.ReactNode;
}

const plans: PricingPlan[] = [
  {
    name: "free",
    displayName: "Gratuito",
    price: "R$0",
    priceDetail: "para sempre",
    icon: <Sparkles className="w-6 h-6" />,
    cta: "Começar grátis",
    features: [
      { text: "5 gerações por mês", included: true },
      { text: "1 marca", included: true },
      { text: "Instagram + LinkedIn", included: true },
      { text: "Download PNG", included: true },
      { text: "Agendamento e publicação", included: false },
      { text: "Imagens premium com IA", included: false },
      { text: "Suporte prioritário", included: false },
    ],
  },
  {
    name: "pro",
    displayName: "Pro",
    price: "R$147,90",
    priceDetail: "/mês",
    priceSubtext: "menos de R$5/dia",
    icon: <Crown className="w-6 h-6" />,
    highlighted: true,
    cta: "Começar agora",
    features: [
      { text: "100 gerações por mês", included: true },
      { text: "5 marcas", included: true },
      { text: "Instagram + LinkedIn", included: true },
      { text: "Imagens premium com IA (Gemini 3.1)", included: true },
      { text: "Agendamento automático", included: true },
      { text: "Publicação direta nas redes", included: true },
      { text: "Download PDF para LinkedIn", included: true },
      { text: "Análise de layout inteligente", included: true },
      { text: "Suporte prioritário", included: true },
    ],
  },
  {
    name: "business",
    displayName: "Business",
    price: "R$297",
    priceDetail: "/mês",
    priceSubtext: "para equipes e agências",
    icon: <Rocket className="w-6 h-6" />,
    cta: "Falar com equipe",
    features: [
      { text: "Gerações ilimitadas", included: true },
      { text: "10 marcas", included: true },
      { text: "Tudo do Pro +", included: true },
      { text: "Múltiplas contas sociais", included: true },
      { text: "Relatórios de performance", included: true },
      { text: "API de integração", included: true },
      { text: "Suporte dedicado via WhatsApp", included: true },
      { text: "Onboarding personalizado", included: true },
      { text: "Gestão de equipe (em breve)", included: true },
    ],
  },
];

interface PricingCardsProps {
  currentPlan?: string;
  onSelectPlan?: (planName: string) => void;
}

export default function PricingCards({ currentPlan, onSelectPlan }: PricingCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto items-start">
      {plans.map((plan) => {
        const isCurrent = currentPlan === plan.name;

        return (
          <Card
            key={plan.name}
            className={`relative ${
              plan.highlighted
                ? "border-primary border-2 shadow-xl shadow-primary/15 scale-[1.03] z-10"
                : "border-border"
            }`}
          >
            {plan.highlighted && (
              <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-4 py-1">
                Mais escolhido
              </Badge>
            )}

            <CardHeader className="text-center pb-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3 ${
                plan.highlighted ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
              }`}>
                {plan.icon}
              </div>
              <CardTitle className="text-xl">{plan.displayName}</CardTitle>
              <div className="mt-2">
                <span className="text-3xl font-bold">{plan.price}</span>
                <span className="text-muted-foreground text-sm ml-1">{plan.priceDetail}</span>
              </div>
              {plan.priceSubtext && (
                <p className="text-xs text-muted-foreground mt-1">{plan.priceSubtext}</p>
              )}
            </CardHeader>

            <CardContent className="space-y-4">
              <ul className="space-y-3">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm">
                    {feature.included ? (
                      <Check className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                        plan.highlighted ? "text-primary" : "text-green-600"
                      }`} />
                    ) : (
                      <X className="w-4 h-4 mt-0.5 flex-shrink-0 text-muted-foreground/40" />
                    )}
                    <span className={feature.included ? "" : "text-muted-foreground/50"}>
                      {feature.text}
                    </span>
                  </li>
                ))}
              </ul>

              <Button
                className={`w-full mt-4 ${plan.highlighted ? "shadow-md" : ""}`}
                variant={plan.highlighted ? "default" : "outline"}
                size="lg"
                disabled={isCurrent}
                onClick={() => onSelectPlan?.(plan.name)}
              >
                {isCurrent ? "Plano atual" : plan.cta}
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
