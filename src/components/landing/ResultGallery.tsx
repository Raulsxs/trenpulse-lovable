import { motion } from "framer-motion";
import { Instagram, Linkedin, Heart, MessageCircle, Send, Bookmark } from "lucide-react";

const RESULTS = [
  {
    platform: "instagram",
    type: "Post",
    imageUrl: "https://qdmhqxpazffmaxleyzxs.supabase.co/storage/v1/object/public/generated-images/ai-slides/9e262f50-ded1-4c29-9011-4e9ad399a827/slide-0-1775169134148.png",
    caption: "Nova ferramenta do Google converte desenhos visuais em código funcional em tempo real.",
  },
  {
    platform: "instagram",
    type: "Post",
    imageUrl: "https://qdmhqxpazffmaxleyzxs.supabase.co/storage/v1/object/public/generated-images/ai-slides/2ba03aab-666c-45d1-95b8-e2dc7723d0ad/slide-0-1775249665858.png",
    caption: "Agentes de IA dominam o desenvolvimento — escrevem, testam e fazem deploy sozinhos.",
  },
  {
    platform: "instagram",
    type: "Post",
    imageUrl: "https://qdmhqxpazffmaxleyzxs.supabase.co/storage/v1/object/public/generated-images/ai-slides/3eab3ddd-4174-457e-92f7-8c852da19c65/slide-0-1774992869605.png",
    caption: "Anthropic limita uso do Claude mesmo para assinantes pagantes — entenda o impacto.",
  },
  {
    platform: "instagram",
    type: "Post",
    imageUrl: "https://qdmhqxpazffmaxleyzxs.supabase.co/storage/v1/object/public/generated-images/ai-slides/9b4f83b3-9dff-416f-ba24-a0e47ffc3e9e/slide-0-1774959193413.png",
    caption: "OpenAI encerra Sora após 6 meses — downloads caíram 70%.",
  },
];

export function ResultGallery() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {RESULTS.map((result, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.5, delay: i * 0.1 }}
        >
          <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow group">
            {/* Real generated image */}
            <div className="aspect-square overflow-hidden">
              <img
                src={result.imageUrl}
                alt={result.caption}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                loading="lazy"
              />
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
                <span className="text-[10px] text-muted-foreground capitalize">{result.platform} • {result.type}</span>
              </div>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
