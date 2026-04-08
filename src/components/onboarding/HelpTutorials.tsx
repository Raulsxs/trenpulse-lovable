import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, Send, Upload, Check, Calendar, ExternalLink,
  TrendingUp, Play, ChevronRight, Tag,
} from "lucide-react";

// ── Shared mini-components ──

function MiniChat({ children, inputText = "", showQuickBar, activeQuick }: {
  children: React.ReactNode;
  inputText?: string;
  showQuickBar?: boolean;
  activeQuick?: string;
}) {
  const QUICK_ACTIONS = [
    { emoji: "📷", label: "Post" },
    { emoji: "🎠", label: "Carrossel" },
    { emoji: "📱", label: "Story" },
    { emoji: "💬", label: "Frase" },
    { emoji: "🔗", label: "Link" },
    { emoji: "💼", label: "LinkedIn" },
  ];

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="bg-muted/40 border-b border-border px-3 py-2 flex items-center gap-2">
        <div className="w-6 h-6 bg-gradient-to-br from-blue-500 to-blue-600 rounded-md flex items-center justify-center">
          <TrendingUp className="w-3 h-3 text-white" />
        </div>
        <span className="text-xs font-medium">TrendPulse</span>
        <div className="flex items-center gap-1 ml-1">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
          <span className="text-[9px] text-muted-foreground">Assistente IA</span>
        </div>
      </div>

      {/* Messages */}
      <div className="p-4 min-h-[240px] space-y-2.5 overflow-y-auto">{children}</div>

      {/* Quick action bar */}
      {showQuickBar && (
        <div className="border-t border-border/40 px-3 py-1.5 flex gap-1.5 flex-wrap bg-muted/10">
          {QUICK_ACTIONS.map((a) => (
            <span
              key={a.label}
              className={`text-[10px] px-2 py-0.5 rounded-md border transition-all ${
                activeQuick === a.label
                  ? "border-primary/60 bg-primary/10 text-primary font-semibold"
                  : "border-border/50 text-muted-foreground"
              }`}
            >
              {a.emoji} {a.label}
            </span>
          ))}
          <span className="text-[10px] px-2 py-0.5 rounded-md border border-border/50 text-muted-foreground">🎨 Nova marca</span>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-border px-3 py-2 flex items-center gap-2 bg-muted/20">
        <div className="w-7 h-7 rounded-lg border border-border/50 bg-muted/30 flex items-center justify-center flex-shrink-0">
          <Tag className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
        <div className="flex-1 bg-background rounded-lg px-3 py-1.5 text-xs border border-border/50 min-h-[28px] flex items-center">
          {inputText ? (
            <span className="text-foreground">{inputText}<span className="animate-pulse">|</span></span>
          ) : (
            <span className="text-muted-foreground/40">Cole um link ou descreva o conteúdo...</span>
          )}
        </div>
        <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
          inputText ? "bg-primary" : "bg-muted/50"
        }`}>
          <Send className="w-3 h-3 text-primary-foreground" />
        </div>
      </div>
    </div>
  );
}

function Bubble({ role, children, delay = 0 }: { role: "user" | "assistant"; children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay }}
      className={`flex ${role === "user" ? "justify-end" : "justify-start gap-1.5"}`}
    >
      {role === "assistant" && (
        <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Sparkles className="w-2.5 h-2.5 text-white" />
        </div>
      )}
      <div className={`max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed ${
        role === "user" ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted/80 text-foreground rounded-bl-sm"
      }`}>
        {children}
      </div>
    </motion.div>
  );
}

function MiniLoading({ text }: { text: string }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="flex gap-1.5 items-start">
      <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Sparkles className="w-2.5 h-2.5 text-white" />
      </div>
      <div className="bg-muted/80 rounded-xl rounded-bl-sm px-3 py-2 flex items-center gap-2">
        <div className="w-3 h-3 rounded-full border-2 border-primary border-t-transparent animate-spin flex-shrink-0" />
        <span className="text-xs text-muted-foreground">{text}</span>
      </div>
    </motion.div>
  );
}

function MiniResult({ title, platform = "Instagram · Post", hasImage }: { title: string; platform?: string; hasImage?: boolean }) {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }}
      className="border border-border/60 rounded-lg overflow-hidden bg-card ml-7">
      {hasImage && (
        <div className="h-24 bg-gradient-to-br from-blue-600/80 to-purple-600/80 flex items-center justify-center p-3">
          <p className="text-white text-xs font-bold text-center leading-tight">{title}</p>
        </div>
      )}
      <div className="p-2.5">
        <p className="text-[10px] text-muted-foreground uppercase">{platform}</p>
        <p className="text-xs font-semibold text-foreground mt-0.5 line-clamp-2">{title}</p>
        <div className="flex gap-1.5 mt-2 flex-wrap">
          <span className="px-2 py-0.5 bg-green-500 text-white text-[9px] rounded font-medium flex items-center gap-0.5"><Check className="w-2.5 h-2.5" /> Aprovar</span>
          <span className="px-2 py-0.5 border border-border text-[9px] rounded flex items-center gap-0.5"><Calendar className="w-2.5 h-2.5" /> Agendar</span>
          <span className="px-2 py-0.5 border border-border text-[9px] rounded flex items-center gap-0.5"><ExternalLink className="w-2.5 h-2.5" /> Studio</span>
        </div>
      </div>
    </motion.div>
  );
}

// ── Tutorial 1: Criar post com tema ──
function TutorialPostTema() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    setStep(0);
    const t = [
      setTimeout(() => setStep(1), 500),   // quick bar appears, "Post" highlighted
      setTimeout(() => setStep(2), 1800),  // user typing
      setTimeout(() => setStep(3), 3200),  // message sent
      setTimeout(() => setStep(4), 4200),  // loading
      setTimeout(() => setStep(5), 6000),  // result
    ];
    return () => t.forEach(clearTimeout);
  }, []);

  const inputText = step === 2 ? "Crie um post para Instagram sobre: 5 dicas de produtividade" : "";

  return (
    <MiniChat
      inputText={step < 3 ? inputText : ""}
      showQuickBar={step >= 1}
      activeQuick={step === 1 ? "Post" : undefined}
    >
      <Bubble role="assistant">Olá! Cole um link, descreva um tema ou use os atalhos abaixo 👇</Bubble>
      {step >= 3 && (
        <Bubble role="user" delay={0.1}>
          Crie um post para Instagram sobre: 5 dicas de produtividade
        </Bubble>
      )}
      {step === 4 && <MiniLoading text="Gerando post..." />}
      {step >= 5 && (
        <>
          <Bubble role="assistant" delay={0.1}>✅ Conteúdo gerado! Confira abaixo 👇</Bubble>
          <MiniResult title="5 Hábitos que Vão Dobrar Sua Produtividade" hasImage />
        </>
      )}
    </MiniChat>
  );
}

// ── Tutorial 2: Post com frase ──
function TutorialFrase() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    setStep(0);
    const t = [
      setTimeout(() => setStep(1), 500),   // quick bar, "Frase" highlighted
      setTimeout(() => setStep(2), 1800),  // typing
      setTimeout(() => setStep(3), 3400),  // sent
      setTimeout(() => setStep(4), 4300),  // loading
      setTimeout(() => setStep(5), 6200),  // result
    ];
    return () => t.forEach(clearTimeout);
  }, []);

  const inputText = step === 2 ? `Crie um post com a frase: "Pequenos passos levam a grandes conquistas"` : "";

  return (
    <MiniChat
      inputText={step < 3 ? inputText : ""}
      showQuickBar={step >= 1}
      activeQuick={step === 1 ? "Frase" : undefined}
    >
      <Bubble role="assistant">Olá! Cole um link, descreva um tema ou use os atalhos abaixo 👇</Bubble>
      {step >= 3 && (
        <Bubble role="user" delay={0.1}>
          Crie um post com a frase: "Pequenos passos levam a grandes conquistas"
        </Bubble>
      )}
      {step === 4 && <MiniLoading text="Gerando design com sua frase..." />}
      {step >= 5 && (
        <>
          <Bubble role="assistant" delay={0.1}>✅ Post com frase gerado! 👇</Bubble>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
            className="ml-7 border border-border/60 rounded-lg overflow-hidden">
            <div className="h-28 bg-gradient-to-br from-indigo-600/90 to-purple-700/90 flex items-center justify-center p-4">
              <div className="text-center">
                <div className="w-8 h-0.5 bg-white/40 rounded mx-auto mb-2" />
                <p className="text-white text-xs font-bold italic leading-snug">"Pequenos passos levam a grandes conquistas"</p>
              </div>
            </div>
            <div className="p-2.5 flex gap-1.5">
              <span className="px-2 py-0.5 bg-green-500 text-white text-[9px] rounded font-medium flex items-center gap-0.5"><Check className="w-2.5 h-2.5" /> Aprovar</span>
              <span className="px-2 py-0.5 border border-border text-[9px] rounded"><ExternalLink className="w-2.5 h-2.5 inline" /> Studio</span>
            </div>
          </motion.div>
        </>
      )}
    </MiniChat>
  );
}

// ── Tutorial 3: Post a partir de link ──
function TutorialLink() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    setStep(0);
    const t = [
      setTimeout(() => setStep(1), 500),   // quick bar, "Link" highlighted
      setTimeout(() => setStep(2), 1800),  // typing
      setTimeout(() => setStep(3), 3400),  // sent
      setTimeout(() => setStep(4), 4200),  // loading
      setTimeout(() => setStep(5), 6500),  // result
    ];
    return () => t.forEach(clearTimeout);
  }, []);

  const inputText = step === 2 ? "Crie um post baseado neste link: https://exemplo.com/artigo-ia-saude" : "";

  return (
    <MiniChat
      inputText={step < 3 ? inputText : ""}
      showQuickBar={step >= 1}
      activeQuick={step === 1 ? "Link" : undefined}
    >
      <Bubble role="assistant">Olá! Cole um link, descreva um tema ou use os atalhos abaixo 👇</Bubble>
      {step >= 3 && (
        <Bubble role="user" delay={0.1}>
          Crie um post baseado neste link: https://exemplo.com/artigo-ia-saude
        </Bubble>
      )}
      {step === 4 && <MiniLoading text="Lendo artigo e gerando conteúdo..." />}
      {step >= 5 && (
        <>
          <Bubble role="assistant" delay={0.1}>✅ Artigo analisado! Post gerado com os pontos-chave 👇</Bubble>
          <MiniResult title="Como a IA Está Revolucionando a Saúde em 2025" hasImage />
        </>
      )}
    </MiniChat>
  );
}

// ── Tutorial 4: Criar marca ──
function TutorialMarca() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    setStep(0);
    const t = [
      setTimeout(() => setStep(1), 500),   // quick bar, "Nova marca" visible
      setTimeout(() => setStep(2), 1800),  // typing "criar marca"
      setTimeout(() => setStep(3), 3200),  // sent
      setTimeout(() => setStep(4), 4000),  // AI asks for name
      setTimeout(() => setStep(5), 5200),  // user types name
      setTimeout(() => setStep(6), 6500),  // AI asks for images
      setTimeout(() => setStep(7), 7800),  // upload shown
      setTimeout(() => setStep(8), 9000),  // brand ready
    ];
    return () => t.forEach(clearTimeout);
  }, []);

  const inputText = step === 2 ? "Quero criar minha marca" : step === 5 ? "Motivacional" : "";

  return (
    <MiniChat
      inputText={step < 3 || (step >= 5 && step < 6) ? inputText : ""}
      showQuickBar={step >= 1}
    >
      <Bubble role="assistant">Olá! Cole um link, descreva um tema ou use os atalhos abaixo 👇</Bubble>
      {step >= 3 && <Bubble role="user" delay={0.1}>Quero criar minha marca</Bubble>}
      {step >= 4 && (
        <Bubble role="assistant" delay={0.2}>
          Ótimo! 🎨 Qual é o nome da sua marca?
        </Bubble>
      )}
      {step >= 6 && <Bubble role="user" delay={0.1}>Motivacional</Bubble>}
      {step >= 6 && (
        <Bubble role="assistant" delay={0.3}>
          Perfeito! Agora envie de <strong>3 a 8 imagens</strong> de referência — posts que você gosta ou que representam seu estilo visual.
        </Bubble>
      )}
      {step >= 7 && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="ml-7 border-2 border-dashed border-primary/30 rounded-lg p-3 flex items-center gap-2 bg-primary/5">
          <Upload className="w-4 h-4 text-primary/60 flex-shrink-0" />
          <span className="text-[10px] text-muted-foreground">3 imagens enviadas ✓</span>
        </motion.div>
      )}
      {step >= 8 && (
        <Bubble role="assistant" delay={0.3}>
          <div>
            <p>✅ Marca <strong>Motivacional</strong> criada!</p>
            <p className="text-[10px] opacity-70 mt-1">🎨 Paleta detectada · ✍️ Tom de voz definido</p>
          </div>
        </Bubble>
      )}
    </MiniChat>
  );
}

// ── Tutorial 5: Criar carrossel ──
function TutorialCarrossel() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    setStep(0);
    const t = [
      setTimeout(() => setStep(1), 500),   // quick bar, "Carrossel" highlighted
      setTimeout(() => setStep(2), 1800),  // typing
      setTimeout(() => setStep(3), 3400),  // sent
      setTimeout(() => setStep(4), 4200),  // loading
      setTimeout(() => setStep(5), 6800),  // result
    ];
    return () => t.forEach(clearTimeout);
  }, []);

  const inputText = step === 2 ? "Crie um carrossel de 5 slides sobre os benefícios da meditação" : "";

  return (
    <MiniChat
      inputText={step < 3 ? inputText : ""}
      showQuickBar={step >= 1}
      activeQuick={step === 1 ? "Carrossel" : undefined}
    >
      <Bubble role="assistant">Olá! Cole um link, descreva um tema ou use os atalhos abaixo 👇</Bubble>
      {step >= 3 && (
        <Bubble role="user" delay={0.1}>
          Crie um carrossel de 5 slides sobre os benefícios da meditação
        </Bubble>
      )}
      {step === 4 && <MiniLoading text="Gerando 5 slides do carrossel..." />}
      {step >= 5 && (
        <>
          <Bubble role="assistant" delay={0.1}>✅ Carrossel de 5 slides gerado! 👇</Bubble>
          <MiniResult
            title="Meditação: 5 Benefícios que Vão Mudar Sua Rotina"
            platform="Instagram · Carrossel · 5 slides"
            hasImage
          />
        </>
      )}
    </MiniChat>
  );
}

// ── Tutorial list ──

const TUTORIALS = [
  { id: "post", emoji: "📷", title: "Criar um post", desc: "Digite o tema → IA gera direto", component: TutorialPostTema },
  { id: "frase", emoji: "💬", title: "Post com frase", desc: "Cole a frase → IA cria o design", component: TutorialFrase },
  { id: "link", emoji: "🔗", title: "Post a partir de link", desc: "Cole um artigo → post automático", component: TutorialLink },
  { id: "marca", emoji: "🎨", title: "Criar uma marca", desc: "Nome + imagens → identidade visual", component: TutorialMarca },
  { id: "carrossel", emoji: "🎠", title: "Criar carrossel", desc: "Descreva o tema → slides prontos", component: TutorialCarrossel },
];

export function HelpTutorials() {
  const [activeTutorial, setActiveTutorial] = useState<string | null>(null);
  const [key, setKey] = useState(0);

  const ActiveComponent = TUTORIALS.find(t => t.id === activeTutorial)?.component;

  const handleSelect = (id: string) => {
    setActiveTutorial(id);
    setKey(k => k + 1);
  };

  return (
    <div className="space-y-3">
      {/* Tutorial grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {TUTORIALS.map((t) => (
          <button
            key={t.id}
            onClick={() => handleSelect(t.id)}
            className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
              activeTutorial === t.id
                ? "border-primary bg-primary/5"
                : "border-border/60 hover:border-primary/30 hover:bg-muted/30"
            }`}
          >
            <span className="text-xl">{t.emoji}</span>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${activeTutorial === t.id ? "text-primary" : "text-foreground"}`}>{t.title}</p>
              <p className="text-[10px] text-muted-foreground">{t.desc}</p>
            </div>
            <ChevronRight className={`w-4 h-4 flex-shrink-0 transition-transform ${
              activeTutorial === t.id ? "text-primary rotate-90" : "text-muted-foreground"
            }`} />
          </button>
        ))}
      </div>

      {/* Active tutorial animation */}
      <AnimatePresence mode="wait">
        {ActiveComponent && (
          <motion.div
            key={`${activeTutorial}-${key}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground">Veja como usar o prompt:</p>
              <button
                onClick={() => setKey(k => k + 1)}
                className="text-xs text-primary flex items-center gap-1 hover:underline"
              >
                <Play className="w-3 h-3" /> Repetir
              </button>
            </div>
            <ActiveComponent />
          </motion.div>
        )}
      </AnimatePresence>

      {!activeTutorial && (
        <p className="text-center text-xs text-muted-foreground py-6">
          Selecione um tutorial acima para ver como usar o chat
        </p>
      )}
    </div>
  );
}
