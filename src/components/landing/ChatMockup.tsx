import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Sparkles } from "lucide-react";

const MESSAGES = [
  { role: "user", text: "5 dicas para melhorar o sono", delay: 0 },
  { role: "assistant", text: "Analisando o tema... 🔍", delay: 1200, transient: true },
  { role: "assistant", text: "✅ Conteúdo gerado! Confira abaixo 👇", delay: 2800 },
];

export function ChatMockup() {
  const [visibleMessages, setVisibleMessages] = useState<typeof MESSAGES>([]);
  const [showCard, setShowCard] = useState(false);
  const [typing, setTyping] = useState(false);
  const [inputText, setInputText] = useState("");
  const fullInput = "5 dicas para melhorar o sono";

  useEffect(() => {
    // Type the input first
    let charIndex = 0;
    const typeInterval = setInterval(() => {
      if (charIndex <= fullInput.length) {
        setInputText(fullInput.substring(0, charIndex));
        charIndex++;
      } else {
        clearInterval(typeInterval);
        // After typing, "send" the message
        setTimeout(() => {
          setInputText("");
          setVisibleMessages([MESSAGES[0]]);
          setTyping(true);

          // Show "analyzing" message
          setTimeout(() => {
            setTyping(false);
            setVisibleMessages([MESSAGES[0], MESSAGES[1]]);

            // Replace with final message + show card
            setTimeout(() => {
              setVisibleMessages([MESSAGES[0], MESSAGES[2]]);
              setTimeout(() => setShowCard(true), 400);
            }, 1600);
          }, 1200);
        }, 600);
      }
    }, 50);

    return () => clearInterval(typeInterval);
  }, []);

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-card border border-border rounded-xl shadow-lg overflow-hidden">
        {/* Chat header */}
        <div className="bg-muted/50 border-b border-border px-4 py-3 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-sm font-medium text-foreground">TrendPulse Chat</span>
        </div>

        {/* Messages area */}
        <div className="p-4 space-y-3 min-h-[240px]">
          <AnimatePresence mode="popLayout">
            {visibleMessages.map((msg, i) => (
              <motion.div
                key={`${i}-${msg.text}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] px-3 py-2 rounded-lg text-sm ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}
                >
                  {msg.text}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {typing && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-start"
            >
              <div className="bg-muted px-3 py-2 rounded-lg">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </motion.div>
          )}

          {/* Result card mockup */}
          <AnimatePresence>
            {showCard && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="bg-gradient-to-br from-primary/10 to-accent/10 border border-primary/20 rounded-lg p-3"
              >
                <div className="flex gap-3">
                  <div className="w-16 h-16 rounded-md bg-gradient-to-br from-blue-500/80 to-purple-500/80 flex-shrink-0 flex items-center justify-center">
                    <Sparkles className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-primary mb-1">Post • Instagram</div>
                    <div className="text-sm font-semibold text-foreground leading-tight">5 Hábitos Noturnos que Transformam seu Sono</div>
                    <div className="text-xs text-muted-foreground mt-1">1 slide • Pronto para publicar</div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Input area */}
        <div className="border-t border-border px-3 py-2 flex items-center gap-2">
          <div className="flex-1 bg-muted/50 rounded-lg px-3 py-2 text-sm text-muted-foreground min-h-[36px] flex items-center">
            {inputText || <span className="opacity-40">Digite seu tema...</span>}
            {inputText && <span className="inline-block w-0.5 h-4 bg-primary animate-pulse ml-0.5" />}
          </div>
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
            <Send className="w-4 h-4 text-primary-foreground" />
          </div>
        </div>
      </div>
    </div>
  );
}
