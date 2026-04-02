import { motion } from "framer-motion";

const STEPS = [
  {
    number: "01",
    title: "Escolha o formato",
    description: "Post, carrossel, story ou documento. Para Instagram ou LinkedIn.",
    visual: (
      <div className="flex gap-2">
        {["Post", "Carrossel", "Story"].map((t) => (
          <div key={t} className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium border border-primary/20">
            {t}
          </div>
        ))}
      </div>
    ),
  },
  {
    number: "02",
    title: "Diga o que quer",
    description: "Cole um link, escreva uma frase ou peça sugestões. A IA cuida do resto.",
    visual: (
      <div className="bg-muted/50 rounded-lg px-3 py-2 text-sm">
        <span className="text-muted-foreground">Ex: </span>
        <span className="text-foreground">Os benefícios da meditação para executivos</span>
      </div>
    ),
  },
  {
    number: "03",
    title: "Publique",
    description: "Revise, edite se quiser, e publique direto no Instagram ou LinkedIn.",
    visual: (
      <div className="flex gap-2">
        <div className="px-4 py-2 rounded-lg bg-gradient-to-r from-pink-500 to-purple-500 text-white text-xs font-medium">
          Publicar no Instagram
        </div>
        <div className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium">
          LinkedIn
        </div>
      </div>
    ),
  },
];

export function HowItWorks() {
  return (
    <div className="grid md:grid-cols-3 gap-8">
      {STEPS.map((step, i) => (
        <motion.div
          key={step.number}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: i * 0.15 }}
          className="relative"
        >
          {/* Connector line */}
          {i < STEPS.length - 1 && (
            <div className="hidden md:block absolute top-8 left-[calc(100%+0.5rem)] w-[calc(100%-1rem)] h-px bg-border z-0" />
          )}

          <div className="relative z-10">
            <div className="text-5xl font-heading font-bold text-primary/15 mb-3">{step.number}</div>
            <h3 className="font-heading font-semibold text-xl text-foreground mb-2">{step.title}</h3>
            <p className="text-sm text-muted-foreground mb-4 leading-relaxed">{step.description}</p>
            <div className="mt-3">{step.visual}</div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
