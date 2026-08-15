import { motion } from "framer-motion";
import { Check, ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { PACOTES, postsPorPacote, carrosseisPorPacote } from "@/lib/precos";

/**
 * Os pacotes vêm de @/lib/precos, e a tradução crédito→resultado é CALCULADA, não escrita.
 *
 * Estava tudo à mão e tinha divergido feio: o comentário citava "post 4cr", os textos assumiam 8cr
 * ("≈ 62 posts" por 500 créditos), e o sistema cobra 10cr. Ou seja, os três pacotes prometiam ~25%
 * mais peça do que entregam — na seção que fecha a venda.
 *
 * Calculando a partir da fonte única, mudar o preço no banco e esquecer de mexer aqui deixa de ser
 * possível: os números se recalculam sozinhos.
 */
const PACKS = PACOTES.map((p) => ({
  name: p.nome,
  price: String(p.precoReais),
  credits: p.creditos,
  bonus: p.bonus,
  description:
    p.nome === "Inicial" ? "Pra começar a publicar"
    : p.nome === "Popular" ? "Três meses de post diário"
    : "Sete meses de post diário",
  features: [
    `≈ ${postsPorPacote(p)} posts com imagem`,
    `ou ≈ ${carrosseisPorPacote(p)} carrosséis de 5 slides`,
    "Todos os formatos liberados",
    "Publicação e agendamento em 9 redes",
    ...(p.nome === "Inicial" ? [] : ["Legendas bilíngues"]),
  ],
  cta: "Comprar créditos",
  variant: (p.destaque ? "default" : "outline") as "default" | "outline",
  popular: !!p.destaque,
}));

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
