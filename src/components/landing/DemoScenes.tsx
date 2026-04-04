import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, Check, Sparkles, Send, TrendingUp, Calendar, ExternalLink, Pencil, Image, RefreshCw } from "lucide-react";

const SCENE_DURATION = 11000;
const TOTAL_SCENES = 4;

// ── Shared UI components matching TrendPulse real interface ──

function ChatBubble({ role, children, delay = 0 }: { role: "user" | "assistant"; children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      className={`flex ${role === "user" ? "justify-end" : "justify-start gap-2"}`}
    >
      {role === "assistant" && (
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Sparkles className="w-3.5 h-3.5 text-white" />
        </div>
      )}
      <div className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
        role === "user"
          ? "bg-primary text-primary-foreground rounded-br-md"
          : "bg-muted/80 text-foreground rounded-bl-md"
      }`}>
        {children}
      </div>
    </motion.div>
  );
}

function WizardCard({ title, children, delay = 0 }: { title: string; children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -5 }}
      transition={{ duration: 0.3, delay }}
      className="border border-border/60 rounded-xl p-4 bg-card"
    >
      <p className="text-sm font-medium text-foreground mb-3">{title}</p>
      {children}
    </motion.div>
  );
}

function WizardOption({ emoji, label, sublabel, active, onClick, delay = 0 }: {
  emoji: string; label: string; sublabel?: string; active?: boolean; onClick?: () => void; delay?: number;
}) {
  return (
    <motion.button
      initial={{ opacity: 0, x: -5 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, delay }}
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
        active
          ? "border-primary bg-primary/5"
          : "border-border/60 bg-muted/20 hover:bg-primary/5 hover:border-primary/30"
      }`}
    >
      <span className="text-lg">{emoji}</span>
      <div>
        <div className={`text-sm font-medium ${active ? "text-primary" : ""}`}>{label}</div>
        {sublabel && <div className="text-xs text-muted-foreground">{sublabel}</div>}
      </div>
    </motion.button>
  );
}

function PillButton({ children, variant = "outline", className = "" }: {
  children: React.ReactNode; variant?: "primary" | "outline"; className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
      variant === "primary"
        ? "bg-green-500 text-white border-green-500"
        : "border-border bg-card text-foreground"
    } ${className}`}>
      {children}
    </span>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start gap-2">
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0">
        <Sparkles className="w-3.5 h-3.5 text-white" />
      </div>
      <div className="bg-muted/80 px-4 py-3 rounded-2xl rounded-bl-md">
        <div className="flex gap-1.5">
          <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    </div>
  );
}

function LoadingBar({ text }: { text: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="border border-border/60 rounded-xl p-4 bg-card flex items-center gap-3"
    >
      <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin flex-shrink-0" />
      <span className="text-sm text-muted-foreground">{text}</span>
    </motion.div>
  );
}

function ContentCard({ imageUrl, imageContent, title, type = "Post", platform = "Instagram" }: {
  imageUrl?: string; imageContent?: React.ReactNode; title: string; type?: string; platform?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="border border-border/60 rounded-xl overflow-hidden bg-card"
    >
      {/* Image area */}
      <div className="aspect-[4/3] relative overflow-hidden bg-muted/30">
        {imageUrl && <img src={imageUrl} alt={title} className="w-full h-full object-cover" />}
        {imageContent}
      </div>
      {/* Info */}
      <div className="p-3 border-t border-border/30">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{platform} · {type}</p>
        <p className="text-sm font-semibold text-foreground leading-tight mb-3">{title}</p>
        {/* Action buttons matching TrendPulse */}
        <div className="flex gap-2 mb-2">
          <PillButton variant="primary"><Check className="w-3 h-3" /> Aprovar</PillButton>
          <PillButton><Calendar className="w-3 h-3" /> Agendar</PillButton>
          <PillButton><ExternalLink className="w-3 h-3" /> Studio</PillButton>
        </div>
        <div className="flex gap-2">
          <PillButton><Pencil className="w-3 h-3" /> Novo texto</PillButton>
          <PillButton><Image className="w-3 h-3" /> Nova imagem</PillButton>
          <PillButton><RefreshCw className="w-3 h-3" /> Refazer tudo</PillButton>
        </div>
      </div>
    </motion.div>
  );
}

// ── Scene 1: Brand creation with reference upload ──
function SceneBrand({ active }: { active: boolean }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!active) { setStep(0); return; }
    const timers = [
      setTimeout(() => setStep(1), 600),
      setTimeout(() => setStep(2), 2000),
      setTimeout(() => setStep(3), 3500),
      setTimeout(() => setStep(4), 5500),
      setTimeout(() => setStep(5), 7500),
    ];
    return () => timers.forEach(clearTimeout);
  }, [active]);

  return (
    <div className="space-y-3">
      <ChatBubble role="assistant">Vamos criar sua marca! Suba exemplos de posts que você usa ou gosta 🎨</ChatBubble>

      <AnimatePresence mode="wait">
        {step >= 1 && step < 3 && (
          <WizardCard title="📸 Exemplos visuais" key="upload">
            <div className="border-2 border-dashed border-border rounded-xl p-5 flex flex-col items-center gap-2 mb-3">
              <Upload className="w-7 h-7 text-muted-foreground/40" />
              <span className="text-xs text-muted-foreground">Arraste imagens de referência</span>
            </div>
            {step >= 2 && (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center gap-3 p-2 bg-muted/30 rounded-lg">
                <img src="/landing/story_motivacional.png" alt="Referência" className="w-14 h-14 rounded-lg object-cover border border-primary shadow-sm" />
                <div>
                  <p className="text-xs font-medium text-foreground">Referência enviada!</p>
                  <p className="text-[10px] text-muted-foreground">A IA vai replicar este estilo visual</p>
                </div>
              </motion.div>
            )}
          </WizardCard>
        )}

        {step === 3 && <LoadingBar key="analyzing" text="Analisando estilo visual... Identificando cores, tipografia e layout" />}

        {step >= 4 && (
          <motion.div key="done" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <ChatBubble role="assistant" delay={0.1}>
              <div>
                <p className="mb-2">✅ Sua marca <strong>Motivacional</strong> está pronta!</p>
                <p className="text-xs opacity-70 mb-2">🎨 Paleta: #1a1a1a, #666, #3B82F6, #FFF</p>
                <p className="text-xs opacity-70">✨ Estilo detectado: editorial_quote_centered</p>
              </div>
            </ChatBubble>
            {step >= 5 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="flex gap-2 mt-2 ml-9">
                <PillButton>📱 Criar um post</PillButton>
                <PillButton>🎠 Criar carrossel</PillButton>
                <PillButton>🎨 Editar marca</PillButton>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Scene 2: Post generation with brand selection ──
function ScenePost({ active }: { active: boolean }) {
  const [step, setStep] = useState(0);
  const [inputText, setInputText] = useState("");
  const fullInput = "5 dicas para dormir melhor";

  useEffect(() => {
    if (!active) { setStep(0); setInputText(""); return; }
    let charIndex = 0;
    const typeInterval = setInterval(() => {
      if (charIndex <= fullInput.length) { setInputText(fullInput.substring(0, charIndex)); charIndex++; }
      else clearInterval(typeInterval);
    }, 40);
    const timers = [
      setTimeout(() => setStep(1), 2200),
      setTimeout(() => setStep(2), 3500),
      setTimeout(() => setStep(3), 5000),
      setTimeout(() => setStep(4), 7200),
    ];
    return () => { clearInterval(typeInterval); timers.forEach(clearTimeout); };
  }, [active]);

  return (
    <div className="space-y-3">
      {/* User types */}
      {step < 2 && (
        <div className="flex justify-end">
          <div className="bg-muted/40 rounded-2xl px-4 py-2.5 text-sm max-w-[80%] flex items-center">
            <span className="text-foreground">{inputText}</span>
            {inputText.length < fullInput.length && <span className="inline-block w-0.5 h-4 bg-primary animate-pulse ml-0.5" />}
            {!inputText && <span className="text-muted-foreground/40">Cole um link ou descreva o conteúdo...</span>}
          </div>
        </div>
      )}
      {step >= 1 && step < 3 && <ChatBubble role="user">{fullInput}</ChatBubble>}

      <AnimatePresence mode="wait">
        {step === 1 && <TypingIndicator key="typing" />}

        {step === 2 && (
          <WizardCard title="Qual marca usar?" key="brand">
            <div className="flex flex-wrap gap-2">
              {[
                { name: "Motivacional", active: true },
                { name: "Caderno", active: false },
                { name: "Fotos pessoais", active: false },
                { name: "Forbes frases", active: false },
              ].map((b, i) => (
                <motion.div
                  key={b.name}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.08 }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium cursor-pointer ${
                    b.active ? "border-primary bg-primary/5 text-primary" : "border-border/60 text-muted-foreground"
                  }`}
                >
                  <div className={`w-6 h-6 rounded-md ${b.active ? "bg-primary/20" : "bg-muted"}`} />
                  {b.name}
                </motion.div>
              ))}
            </div>
          </WizardCard>
        )}

        {step === 3 && <LoadingBar key="loading" text="Analisando o conteúdo... 🔍" />}

        {step >= 4 && (
          <div key="result">
            <ChatBubble role="assistant" delay={0.1}>
              ✅ Conteúdo criado! Gerando imagem completa com texto... 🌟
            </ChatBubble>
            <div className="ml-9 mt-2">
              <ContentCard
                imageUrl="https://qdmhqxpazffmaxleyzxs.supabase.co/storage/v1/object/public/generated-images/ai-slides/2ba03aab-666c-45d1-95b8-e2dc7723d0ad/slide-0-1775249665858.png"
                title="Agentes de IA dominam o desenvolvimento em 2025"
              />
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Scene 3: Phrase with personal photo ──
function ScenePhrase({ active }: { active: boolean }) {
  const [step, setStep] = useState(0);
  const [inputText, setInputText] = useState("");
  const fullInput = "Disciplina supera a motivação";

  useEffect(() => {
    if (!active) { setStep(0); setInputText(""); return; }
    let charIndex = 0;
    const typeInterval = setInterval(() => {
      if (charIndex <= fullInput.length) { setInputText(fullInput.substring(0, charIndex)); charIndex++; }
      else clearInterval(typeInterval);
    }, 45);
    const timers = [
      setTimeout(() => setStep(1), 1500),
      setTimeout(() => setStep(2), 3200),
      setTimeout(() => setStep(3), 5000),
      setTimeout(() => setStep(4), 7000),
    ];
    return () => { clearInterval(typeInterval); timers.forEach(clearTimeout); };
  }, [active]);

  return (
    <div className="space-y-3">
      {/* Mode selection */}
      <ChatBubble role="assistant">O que você quer escrever? ✍️</ChatBubble>

      <AnimatePresence mode="wait">
        {step === 0 && (
          <WizardCard title="✍️ O que você quer escrever?" key="mode">
            <div className="space-y-2">
              <WizardOption emoji="💬" label="Uma frase" sublabel="Frase de impacto, usada exatamente como você escrever" active />
              <WizardOption emoji="📝" label="Um tema ou assunto" sublabel="A IA gera o conteúdo completo" delay={0.1} />
            </div>
          </WizardCard>
        )}

        {step >= 1 && step < 3 && (
          <motion.div key="typing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <WizardCard title="💬 Digite sua frase">
              <div className="bg-muted/30 rounded-lg px-3 py-3 text-sm italic border border-border/30">
                <span className="text-foreground">{inputText}</span>
                {inputText.length < fullInput.length && <span className="inline-block w-0.5 h-4 bg-primary animate-pulse ml-0.5" />}
              </div>
              {step >= 2 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-end mt-2">
                  <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-medium">
                    <Send className="w-3 h-3" /> Continuar
                  </span>
                </motion.div>
              )}
            </WizardCard>
          </motion.div>
        )}

        {step === 3 && <LoadingBar key="loading" text="Polindo a frase e gerando design... ✨" />}

        {step >= 4 && (
          <div key="result">
            <ChatBubble role="assistant" delay={0.1}>✅ Pronto! Sua foto com a frase foi gerada 👇</ChatBubble>
            <div className="ml-9 mt-2">
              <ContentCard
                title={`"Disciplina supera a motivação"`}
                imageContent={
                  <div className="w-full h-full relative">
                    <img src="/landing/foto_pessoal.png" alt="Foto pessoal" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-5">
                      <div className="w-10 h-1 bg-blue-400 rounded mb-3" />
                      <p className="text-white text-base font-bold leading-tight italic">
                        "Disciplina supera a motivação"
                      </p>
                      <p className="text-white/50 text-xs mt-2">— Coach Daniel</p>
                    </div>
                  </div>
                }
              />
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Scene 4: Trend suggestions in chat ──
function SceneTrends({ active }: { active: boolean }) {
  const [step, setStep] = useState(0);
  const [selectedTrend, setSelectedTrend] = useState(-1);

  const trends = [
    "IA generativa no marketing digital",
    "Trabalho remoto: tendências 2026",
    "Saúde mental no ambiente de trabalho",
    "Sustentabilidade como diferencial competitivo",
    "Liderança em tempos de mudança",
  ];

  useEffect(() => {
    if (!active) { setStep(0); setSelectedTrend(-1); return; }
    const timers = [
      setTimeout(() => setStep(1), 600),
      setTimeout(() => { setSelectedTrend(2); setStep(2); }, 3500),
      setTimeout(() => setStep(3), 5000),
      setTimeout(() => setStep(4), 7500),
    ];
    return () => timers.forEach(clearTimeout);
  }, [active]);

  return (
    <div className="space-y-3">
      <ChatBubble role="assistant">Aqui estão as tendências do seu nicho 💡</ChatBubble>

      <AnimatePresence mode="wait">
        {step >= 1 && step < 3 && (
          <motion.div key="trends" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <ChatBubble role="assistant" delay={0.2}>
              <div className="space-y-0.5">
                <p className="text-xs opacity-70 mb-2">Escolha um tema para gerar o conteúdo:</p>
                {trends.map((trend, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + i * 0.1 }}
                  >
                    <span className={`text-sm ${selectedTrend === i ? "text-primary font-semibold" : ""}`}>
                      {selectedTrend === i ? "→ " : ""}{trend}
                    </span>
                  </motion.div>
                ))}
              </div>
            </ChatBubble>
            {step >= 1 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }} className="flex flex-wrap gap-1.5 ml-9 mt-2">
                {trends.map((t, i) => (
                  <span
                    key={i}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] border cursor-pointer transition-all ${
                      selectedTrend === i
                        ? "border-primary bg-primary/10 text-primary font-medium"
                        : "border-border/50 text-muted-foreground"
                    }`}
                  >
                    📝 {t.length > 25 ? t.substring(0, 25) + "..." : t}
                  </span>
                ))}
              </motion.div>
            )}
          </motion.div>
        )}

        {step === 3 && <LoadingBar key="loading" text={`Gerando post sobre "${trends[2]}"...`} />}

        {step >= 4 && (
          <div key="result">
            <ChatBubble role="assistant" delay={0.1}>
              ✅ Conteúdo gerado! Confira abaixo 👇
            </ChatBubble>
            <div className="ml-9 mt-2">
              <ContentCard
                imageUrl="https://qdmhqxpazffmaxleyzxs.supabase.co/storage/v1/object/public/generated-images/ai-slides/9e262f50-ded1-4c29-9011-4e9ad399a827/slide-0-1775169134148.png"
                title="Saúde Mental no Trabalho: O que Mudou em 2026"
              />
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main component ──
const SCENE_LABELS = [
  { label: "Criar marca", emoji: "🎨" },
  { label: "Gerar post", emoji: "📷" },
  { label: "Frase + foto", emoji: "💬" },
  { label: "Tendências", emoji: "💡" },
];

export function DemoScenes() {
  const [activeScene, setActiveScene] = useState(0);

  const nextScene = useCallback(() => {
    setActiveScene((prev) => (prev + 1) % TOTAL_SCENES);
  }, []);

  useEffect(() => {
    const interval = setInterval(nextScene, SCENE_DURATION);
    return () => clearInterval(interval);
  }, [nextScene]);

  return (
    <div className="space-y-6">
      {/* Scene selector tabs */}
      <div className="flex items-center justify-center gap-2 flex-wrap">
        {SCENE_LABELS.map((s, i) => (
          <button
            key={s.label}
            onClick={() => setActiveScene(i)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all ${
              activeScene === i
                ? "bg-primary text-primary-foreground shadow-md"
                : "bg-muted/60 text-muted-foreground hover:bg-muted"
            }`}
          >
            <span>{s.emoji}</span>
            {s.label}
          </button>
        ))}
      </div>

      {/* Scene container - bigger, with chat-like frame */}
      <div className="max-w-2xl mx-auto">
        <div className="bg-card border border-border rounded-2xl shadow-xl overflow-hidden">
          {/* Chat header */}
          <div className="bg-muted/40 border-b border-border px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-white" />
              </div>
              <div>
                <span className="text-sm font-semibold text-foreground">TrendPulse</span>
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  <span className="text-[10px] text-muted-foreground">Assistente IA</span>
                </div>
              </div>
            </div>
            <span className="text-[10px] text-muted-foreground">{SCENE_LABELS[activeScene].label}</span>
          </div>

          {/* Chat body */}
          <div className="p-5 min-h-[420px] max-h-[500px] overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeScene}
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.35 }}
              >
                {activeScene === 0 && <SceneBrand active />}
                {activeScene === 1 && <ScenePost active />}
                {activeScene === 2 && <ScenePhrase active />}
                {activeScene === 3 && <SceneTrends active />}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Chat input bar */}
          <div className="border-t border-border px-4 py-3 flex items-center gap-3 bg-muted/20">
            <div className="flex-1 bg-background rounded-xl px-4 py-2.5 text-sm text-muted-foreground/50 border border-border/50">
              Cole um link ou descreva o conteúdo...
            </div>
            <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
              <Send className="w-4 h-4 text-primary-foreground" />
            </div>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="flex justify-center">
        <div className="w-64 h-1 bg-muted rounded-full overflow-hidden">
          <motion.div
            key={activeScene}
            className="h-full bg-primary rounded-full"
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            transition={{ duration: SCENE_DURATION / 1000, ease: "linear" }}
          />
        </div>
      </div>
    </div>
  );
}
