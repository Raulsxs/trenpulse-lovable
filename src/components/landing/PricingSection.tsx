import { motion } from "framer-motion";
import { Check, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const PLANS = [
  {
    name: "Free",
    price: "0",
    period: "",
    description: "Para experimentar",
    features: [
      "5 gerações por mês",
      "1 marca",
      "Post, carrossel e story",
      "Download de imagens",
    ],
    cta: "Começar Grátis",
    variant: "outline" as const,
    popular: false,
  },
  {
    name: "Pro",
    price: "147",
    period: "/mês",
    description: "Para criadores ativos",
    features: [
      "100 gerações por mês",
      "5 marcas",
      "Todos os formatos",
      "Publicação direta",
      "Agendamento",
      "Imagens premium (IA avançada)",
      "Legendas bilíngues",
    ],
    cta: "Assinar Pro",
    variant: "default" as const,
    popular: true,
  },
  {
    name: "Business",
    price: "297",
    period: "/mês",
    description: "Para agências e equipes",
    features: [
      "Gerações ilimitadas",
      "10 marcas",
      "Todos os formatos",
      "Publicação direta",
      "Agendamento",
      "Imagens premium",
      "Analytics avançado",
      "Suporte prioritário",
    ],
    cta: "Assinar Business",
    variant: "outline" as const,
    popular: false,
  },
];

export function PricingSection() {
  const navigate = useNavigate();

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
      {PLANS.map((plan, i) => (
        <motion.div
          key={plan.name}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: i * 0.1 }}
          className={`relative ${plan.popular ? "md:-mt-4 md:mb-4" : ""}`}
        >
          {plan.popular && (
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-medium px-3 py-1 rounded-full z-10">
              Mais popular
            </div>
          )}
          <div
            className={`bg-card rounded-xl p-6 h-full flex flex-col border ${
              plan.popular
                ? "border-primary shadow-lg"
                : "border-border/60 shadow-sm"
            }`}
          >
            <div className="mb-4">
              <h3 className="font-heading font-semibold text-lg text-foreground">{plan.name}</h3>
              <p className="text-xs text-muted-foreground">{plan.description}</p>
            </div>

            <div className="mb-6">
              <span className="text-4xl font-heading font-bold text-foreground">
                R${plan.price}
              </span>
              <span className="text-muted-foreground text-sm">{plan.period}</span>
            </div>

            <ul className="space-y-2.5 mb-8 flex-1">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm">
                  <Check className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-foreground">{feature}</span>
                </li>
              ))}
            </ul>

            <Button
              variant={plan.variant}
              className={`w-full gap-2 ${plan.popular ? "" : ""}`}
              onClick={() => navigate("/auth")}
            >
              {plan.cta}
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
