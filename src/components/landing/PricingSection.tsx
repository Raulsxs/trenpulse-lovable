import { motion } from "framer-motion";
import { Check, ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

// Espelha os PACKS da edge function create-credit-charge (e do BuyCreditsModal).
// Tradução crédito→resultado usa credit_pricing: post 4cr, carrossel 4cr/slide, story 6cr.
const PACKS = [
  {
    name: "Inicial",
    price: "50",
    credits: 500,
    description: "Pra começar a publicar",
    features: [
      "≈ 62 posts com imagem",
      "ou ≈ 125 slides editoriais",
      "Todos os formatos liberados",
      "Publicação e agendamento em 9 redes",
    ],
    cta: "Comprar créditos",
    variant: "outline" as const,
    popular: false,
  },
  {
    name: "Popular",
    price: "100",
    credits: 1050,
    bonus: "+5% de bônus",
    description: "4 meses de post diário",
    features: [
      "≈ 131 posts com imagem",
      "ou ≈ 26 carrosséis completos",
      "Todos os formatos liberados",
      "Publicação e agendamento em 9 redes",
      "Legendas bilíngues",
    ],
    cta: "Comprar créditos",
    variant: "default" as const,
    popular: true,
  },
  {
    name: "Pro",
    price: "200",
    credits: 2200,
    bonus: "+10% de bônus",
    description: "9 meses de post diário",
    features: [
      "≈ 275 posts com imagem",
      "ou ≈ 55 carrosséis completos",
      "Todos os formatos liberados",
      "Publicação e agendamento em 9 redes",
      "Legendas bilíngues",
    ],
    cta: "Comprar créditos",
    variant: "outline" as const,
    popular: false,
  },
];

export function PricingSection() {
  const navigate = useNavigate();

  return (
    <div className="max-w-5xl mx-auto">
      <div className="text-center mb-8">
        <p className="inline-flex items-center gap-2 text-sm font-medium text-primary bg-primary/10 px-4 py-2 rounded-full">
          <Sparkles className="w-4 h-4" />
          Crie a conta e ganhe 50 créditos grátis — sem cartão
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {PACKS.map((pack, i) => (
          <motion.div
            key={pack.name}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: i * 0.1 }}
            className={`relative ${pack.popular ? "md:-mt-4 md:mb-4" : ""}`}
          >
            {pack.popular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-medium px-3 py-1 rounded-full z-10">
                Mais popular
              </div>
            )}
            <div
              className={`bg-card rounded-xl p-6 h-full flex flex-col border ${
                pack.popular ? "border-primary shadow-lg" : "border-border/60 shadow-sm"
              }`}
            >
              <div className="mb-4">
                <h3 className="font-heading font-semibold text-lg text-foreground">{pack.name}</h3>
                <p className="text-xs text-muted-foreground">{pack.description}</p>
              </div>

              <div className="mb-1">
                <span className="text-4xl font-heading font-bold text-foreground">R${pack.price}</span>
              </div>
              <p className="text-sm text-muted-foreground mb-6">
                {pack.credits.toLocaleString("pt-BR")} créditos
                {pack.bonus && <span className="text-primary font-medium"> · {pack.bonus}</span>}
              </p>

              <ul className="space-y-2.5 mb-8 flex-1">
                {pack.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm">
                    <Check className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                    <span className="text-foreground">{feature}</span>
                  </li>
                ))}
              </ul>

              <Button variant={pack.variant} className="w-full gap-2" onClick={() => navigate("/auth")}>
                {pack.cta}
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </motion.div>
        ))}
      </div>

      <p className="text-center text-sm text-muted-foreground mt-8">
        Sem mensalidade. Seus créditos <strong className="text-foreground">não expiram</strong> — pague só pelo que criar. PIX na hora.
      </p>
    </div>
  );
}
