import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, Check, Sparkles, Send, TrendingUp } from "lucide-react";

const SCENE_DURATION = 10000; // 10s per scene
const TOTAL_SCENES = 4;

// ── Scene 1: Brand creation with reference upload ──
function SceneBrand({ active }: { active: boolean }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!active) { setStep(0); return; }
    const timers = [
      setTimeout(() => setStep(1), 800),   // show upload area
      setTimeout(() => setStep(2), 2200),  // image "uploaded"
      setTimeout(() => setStep(3), 3800),  // analyzing
      setTimeout(() => setStep(4), 5500),  // brand created
      setTimeout(() => setStep(5), 7000),  // show result
    ];
    return () => timers.forEach(clearTimeout);
  }, [active]);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden shadow-lg w-full max-w-md mx-auto">
      <div className="bg-muted/50 border-b border-border px-4 py-3 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-green-500" />
        <span className="text-sm font-medium">Criar Marca</span>
      </div>
      <div className="p-5 min-h-[280px] flex flex-col justify-center">
        <AnimatePresence mode="wait">
          {step <= 1 && (
            <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center">
              <p className="text-sm text-muted-foreground mb-3">Suba exemplos de posts da sua marca</p>
              <div className="border-2 border-dashed border-border rounded-xl p-6 flex flex-col items-center gap-2">
                <Upload className="w-8 h-8 text-muted-foreground/50" />
                <span className="text-xs text-muted-foreground">Arraste imagens de referência</span>
              </div>
            </motion.div>
          )}
          {step === 2 && (
            <motion.div key="uploaded" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="text-center">
              <p className="text-sm text-muted-foreground mb-3">Referência enviada!</p>
              <div className="flex justify-center">
                <img src="/landing/story_motivacional.png" alt="Referência" className="w-24 h-24 rounded-lg object-cover border-2 border-primary shadow-md" />
              </div>
            </motion.div>
          )}
          {step === 3 && (
            <motion.div key="analyzing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center">
              <div className="w-10 h-10 mx-auto mb-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              <p className="text-sm text-foreground">Analisando estilo visual...</p>
              <p className="text-xs text-muted-foreground mt-1">Identificando cores, tipografia e layout</p>
            </motion.div>
          )}
          {step >= 4 && (
            <motion.div key="done" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center">
              <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-green-500/10 flex items-center justify-center">
                <Check className="w-5 h-5 text-green-500" />
              </div>
              <p className="text-sm font-semibold text-foreground">Marca criada!</p>
              {step >= 5 && (
                <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mt-3 bg-muted/50 rounded-lg p-3 text-left">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-md bg-gradient-to-br from-green-600 to-green-800" />
                    <div>
                      <p className="text-xs font-semibold">Motivacional</p>
                      <p className="text-[10px] text-muted-foreground">Style Guide: editorial_quote</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {["#1a1a1a", "#666666", "#3B82F6", "#FFFFFF", "#1a1a1a"].map((c, i) => (
                      <div key={i} className="w-4 h-4 rounded-full border border-border/50" style={{ backgroundColor: c }} />
                    ))}
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
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
    // Type input
    let charIndex = 0;
    const typeInterval = setInterval(() => {
      if (charIndex <= fullInput.length) {
        setInputText(fullInput.substring(0, charIndex));
        charIndex++;
      } else {
        clearInterval(typeInterval);
      }
    }, 45);

    const timers = [
      setTimeout(() => setStep(1), 2400),  // brand selection
      setTimeout(() => setStep(2), 4000),  // loading
      setTimeout(() => setStep(3), 6000),  // result
    ];
    return () => { clearInterval(typeInterval); timers.forEach(clearTimeout); };
  }, [active]);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden shadow-lg w-full max-w-md mx-auto">
      <div className="bg-muted/50 border-b border-border px-4 py-3 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-green-500" />
        <span className="text-sm font-medium">TrendPulse Chat</span>
      </div>
      <div className="p-4 min-h-[280px] space-y-3">
        {/* Input */}
        <div className="border-b border-border/30 pb-3">
          <div className="bg-muted/50 rounded-lg px-3 py-2 text-sm flex items-center">
            <span className="text-foreground">{inputText}</span>
            {inputText.length < fullInput.length && <span className="inline-block w-0.5 h-4 bg-primary animate-pulse ml-0.5" />}
            {!inputText && <span className="text-muted-foreground/40">Digite seu tema...</span>}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div key="brand" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <p className="text-xs text-muted-foreground mb-2">Qual marca usar?</p>
              <div className="flex gap-2">
                {["Motivacional", "Caderno", "Fotos"].map((name, i) => (
                  <motion.div
                    key={name}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.1 }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border cursor-pointer transition-all ${
                      i === 0 ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                    }`}
                  >
                    {name}
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
          {step === 2 && (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center py-4">
              <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin mb-2" />
              <p className="text-xs text-muted-foreground">Gerando imagem completa...</p>
            </motion.div>
          )}
          {step >= 3 && (
            <motion.div key="result" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }}>
              <div className="bg-gradient-to-br from-primary/10 to-accent/10 border border-primary/20 rounded-lg p-3">
                <div className="flex gap-3">
                  <img
                    src="https://qdmhqxpazffmaxleyzxs.supabase.co/storage/v1/object/public/generated-images/ai-slides/2ba03aab-666c-45d1-95b8-e2dc7723d0ad/slide-0-1775249665858.png"
                    alt="Post gerado"
                    className="w-16 h-16 rounded-md object-cover flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-primary mb-1">Post • Instagram</div>
                    <div className="text-sm font-semibold text-foreground leading-tight">5 Hábitos Noturnos que Transformam seu Sono</div>
                    <div className="text-xs text-muted-foreground mt-1">1 slide • Pronto para publicar</div>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mt-2">
                <span className="px-2 py-1 bg-green-500/10 text-green-600 text-[10px] rounded font-medium">Aprovar</span>
                <span className="px-2 py-1 bg-muted text-muted-foreground text-[10px] rounded">Agendar</span>
                <span className="px-2 py-1 bg-muted text-muted-foreground text-[10px] rounded">Studio</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
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
      if (charIndex <= fullInput.length) {
        setInputText(fullInput.substring(0, charIndex));
        charIndex++;
      } else {
        clearInterval(typeInterval);
      }
    }, 50);

    const timers = [
      setTimeout(() => setStep(1), 2500),  // selected "Uma frase"
      setTimeout(() => setStep(2), 4500),  // loading
      setTimeout(() => setStep(3), 6500),  // result with photo
    ];
    return () => { clearInterval(typeInterval); timers.forEach(clearTimeout); };
  }, [active]);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden shadow-lg w-full max-w-md mx-auto">
      <div className="bg-muted/50 border-b border-border px-4 py-3 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-green-500" />
        <span className="text-sm font-medium">TrendPulse Chat</span>
      </div>
      <div className="p-4 min-h-[280px] space-y-3">
        {/* Mode selection */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-2 mb-2">
          <span className="px-2 py-1 bg-primary/10 text-primary text-[10px] rounded-full font-medium border border-primary/20">
            💬 Uma frase
          </span>
          <span className="px-2 py-1 text-muted-foreground/40 text-[10px] rounded-full border border-border/30">
            📝 Um tema
          </span>
        </motion.div>

        {/* Typing */}
        <div className="bg-muted/50 rounded-lg px-3 py-2 text-sm italic">
          <span className="text-foreground">{inputText}</span>
          {inputText.length < fullInput.length && <span className="inline-block w-0.5 h-4 bg-primary animate-pulse ml-0.5" />}
        </div>

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div key="polishing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center py-2">
              <Sparkles className="w-5 h-5 text-primary mx-auto mb-1 animate-pulse" />
              <p className="text-xs text-muted-foreground">Polindo a frase...</p>
            </motion.div>
          )}
          {step === 2 && (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center py-2">
              <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">Gerando design com sua foto...</p>
            </motion.div>
          )}
          {step >= 3 && (
            <motion.div key="result" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}>
              {/* Photo with quote overlay */}
              <div className="relative rounded-lg overflow-hidden aspect-[4/5] max-h-[180px]">
                <img src="/landing/foto_pessoal.png" alt="Foto pessoal" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-4">
                  <div className="w-8 h-0.5 bg-blue-400 rounded mb-2" />
                  <p className="text-white text-sm font-semibold leading-tight italic">
                    "Disciplina supera a motivação"
                  </p>
                  <p className="text-white/50 text-[10px] mt-1">— Coach Daniel</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
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
    "Saúde mental no trabalho",
    "Sustentabilidade como diferencial",
    "Liderança em tempos de mudança",
  ];

  useEffect(() => {
    if (!active) { setStep(0); setSelectedTrend(-1); return; }
    const timers = [
      setTimeout(() => setStep(1), 800),    // show trends
      setTimeout(() => setStep(2), 3500),   // "click" trend 2
      setTimeout(() => { setSelectedTrend(2); setStep(3); }, 3600),
      setTimeout(() => setStep(4), 5500),   // loading
      setTimeout(() => setStep(5), 7500),   // result
    ];
    return () => timers.forEach(clearTimeout);
  }, [active]);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden shadow-lg w-full max-w-md mx-auto">
      <div className="bg-muted/50 border-b border-border px-4 py-3 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-green-500" />
        <span className="text-sm font-medium">TrendPulse Chat</span>
      </div>
      <div className="p-4 min-h-[280px] space-y-3">
        {/* Assistant message */}
        <div className="flex justify-start">
          <div className="bg-muted px-3 py-2 rounded-lg text-xs text-foreground max-w-[85%]">
            Aqui estão as tendências do seu nicho:
          </div>
        </div>

        <AnimatePresence mode="wait">
          {step >= 1 && step < 4 && (
            <motion.div key="trends" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-1.5">
              {trends.map((trend, i) => (
                <motion.button
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs border transition-all flex items-center gap-2 ${
                    selectedTrend === i
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "border-border/50 text-foreground hover:border-primary/30"
                  }`}
                >
                  <TrendingUp className="w-3 h-3 flex-shrink-0" />
                  {trend}
                </motion.button>
              ))}
            </motion.div>
          )}
          {step === 4 && (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center py-6">
              <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin mb-2" />
              <p className="text-xs text-muted-foreground">Gerando post sobre "{trends[2]}"...</p>
            </motion.div>
          )}
          {step >= 5 && (
            <motion.div key="result" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }}>
              <div className="bg-gradient-to-br from-primary/10 to-accent/10 border border-primary/20 rounded-lg p-3">
                <div className="flex gap-3">
                  <div className="w-16 h-16 rounded-md bg-gradient-to-br from-green-600 to-teal-600 flex-shrink-0 flex items-center justify-center">
                    <span className="text-white text-lg">🧠</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-primary mb-1">Post • Instagram</div>
                    <div className="text-sm font-semibold text-foreground leading-tight">Saúde Mental no Trabalho: o que Mudou em 2026</div>
                    <div className="text-xs text-muted-foreground mt-1">1 slide • Pronto para publicar</div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Main component: cycles through all scenes ──
const SCENE_LABELS = [
  "Criar marca",
  "Gerar post",
  "Frase + foto",
  "Tendências",
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
      {/* Scene container */}
      <div className="relative min-h-[360px] flex items-center justify-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeScene}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.4 }}
            className="w-full"
          >
            {activeScene === 0 && <SceneBrand active />}
            {activeScene === 1 && <ScenePost active />}
            {activeScene === 2 && <ScenePhrase active />}
            {activeScene === 3 && <SceneTrends active />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Scene indicators + labels */}
      <div className="flex items-center justify-center gap-3">
        {SCENE_LABELS.map((label, i) => (
          <button
            key={label}
            onClick={() => setActiveScene(i)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              activeScene === i
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Progress bar */}
      <div className="flex justify-center">
        <div className="w-48 h-1 bg-muted rounded-full overflow-hidden">
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
