import { motion } from "framer-motion";
import { MessageSquare, Palette, Zap, Calendar, Share2, BarChart3 } from "lucide-react";

const FEATURES = [
  {
    icon: MessageSquare,
    title: "Chat Inteligente",
    description: "Digite um tema, cole um link ou peça sugestões. A IA entende e gera o conteúdo ideal.",
    color: "bg-blue-500/10 text-blue-500",
  },
  {
    icon: Palette,
    title: "Sua Identidade Visual",
    description: "Suba exemplos da sua marca e a IA replica cores, tipografia e estilo em cada post.",
    color: "bg-purple-500/10 text-purple-500",
  },
  {
    icon: Zap,
    title: "Geração Instantânea",
    description: "Posts, carrosséis, stories e documentos LinkedIn gerados em segundos com IA.",
    color: "bg-amber-500/10 text-amber-500",
  },
  {
    icon: Calendar,
    title: "Agendamento",
    description: "Agende publicações e organize seu calendário editorial sem sair da plataforma.",
    color: "bg-green-500/10 text-green-500",
  },
  {
    icon: Share2,
    title: "Publicação Direta",
    description: "Publique no Instagram e LinkedIn com um clique. Sem baixar, sem complicação.",
    color: "bg-pink-500/10 text-pink-500",
  },
  {
    icon: BarChart3,
    title: "Frases & Citações",
    description: "Escreva sua frase e a IA cria uma arte profissional com aspas, autor e design elegante.",
    color: "bg-teal-500/10 text-teal-500",
  },
];

export function FeatureShowcase() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {FEATURES.map((feature, i) => (
        <motion.div
          key={feature.title}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.4, delay: i * 0.08 }}
          className="group"
        >
          <div className="bg-card border border-border/60 rounded-xl p-6 h-full hover:border-primary/30 hover:shadow-md transition-all">
            <div className={`w-12 h-12 rounded-lg ${feature.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
              <feature.icon className="w-6 h-6" />
            </div>
            <h3 className="font-heading font-semibold text-lg text-foreground mb-2">{feature.title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
