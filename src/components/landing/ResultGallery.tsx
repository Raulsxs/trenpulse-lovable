import { motion } from "framer-motion";
import { Instagram, Linkedin, Heart, MessageCircle, Send, Bookmark } from "lucide-react";

const MOCK_RESULTS = [
  {
    platform: "instagram",
    type: "Post",
    headline: "5 Hábitos Noturnos que Transformam seu Sono",
    gradient: "from-indigo-600 to-purple-600",
    caption: "Sabia que 72% das pessoas dormem menos de 7h? Veja como mudar isso...",
  },
  {
    platform: "instagram",
    type: "Carrossel",
    headline: "O Futuro da Telemedicina em 2026",
    gradient: "from-teal-500 to-cyan-600",
    caption: "A telemedicina está revolucionando o acesso à saúde. Deslize para saber mais...",
    slides: 5,
  },
  {
    platform: "linkedin",
    type: "Documento",
    headline: "Como Implementar OKRs na Sua Empresa",
    gradient: "from-blue-700 to-blue-500",
    caption: "Um guia prático para alinhar sua equipe com metas que realmente importam.",
    slides: 7,
  },
  {
    platform: "instagram",
    type: "Post",
    headline: '"Sonhos são caminhos do coração"',
    gradient: "from-amber-500 to-orange-600",
    caption: "Cada passo que você dá é uma escolha de coragem. #motivação",
    isQuote: true,
  },
];

export function ResultGallery() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {MOCK_RESULTS.map((result, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.5, delay: i * 0.1 }}
        >
          <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow group">
            {/* Image mockup */}
            <div className={`aspect-square bg-gradient-to-br ${result.gradient} p-6 flex flex-col justify-end relative overflow-hidden`}>
              {/* Decorative elements */}
              <div className="absolute top-4 right-4 opacity-20">
                <div className="w-20 h-20 rounded-full border-2 border-white/30" />
              </div>
              <div className="absolute top-8 left-8 opacity-10">
                <div className="w-32 h-32 rounded-full bg-white/20" />
              </div>

              {/* Type badge */}
              <div className="absolute top-3 left-3">
                <span className="bg-black/30 backdrop-blur-sm text-white text-[10px] px-2 py-0.5 rounded-full font-medium">
                  {result.type}{result.slides ? ` • ${result.slides} slides` : ""}
                </span>
              </div>

              {/* Text overlay */}
              <div className="relative z-10">
                {result.isQuote && (
                  <div className="w-8 h-0.5 bg-white/60 rounded mb-3" />
                )}
                <h3 className={`text-white font-bold leading-tight ${result.isQuote ? "text-lg italic" : "text-base"}`}>
                  {result.headline}
                </h3>
                {result.isQuote && (
                  <p className="text-white/60 text-xs mt-2">— Autor</p>
                )}
              </div>
            </div>

            {/* Social mockup footer */}
            <div className="p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <Heart className="w-4 h-4 text-muted-foreground" />
                  <MessageCircle className="w-4 h-4 text-muted-foreground" />
                  <Send className="w-4 h-4 text-muted-foreground" />
                </div>
                <Bookmark className="w-4 h-4 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">{result.caption}</p>
              <div className="flex items-center gap-1 mt-2">
                {result.platform === "instagram" ? (
                  <Instagram className="w-3 h-3 text-pink-500" />
                ) : (
                  <Linkedin className="w-3 h-3 text-blue-600" />
                )}
                <span className="text-[10px] text-muted-foreground capitalize">{result.platform}</span>
              </div>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
