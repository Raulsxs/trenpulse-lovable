import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, Send, Upload, Check, Pencil, Image, RefreshCw,
  Calendar, ExternalLink, TrendingUp, Play, ChevronRight,
} from "lucide-react";

// ── Shared mini-components ──

function MiniChat({ children, minH = "min-h-[320px]" }: { children: React.ReactNode; minH?: string }) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
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
      <div className={`p-4 ${minH} space-y-2.5 overflow-y-auto`}>{children}</div>
      <div className="border-t border-border px-3 py-2 flex items-center gap-2 bg-muted/20">
        <div className="flex-1 bg-background rounded-lg px-3 py-1.5 text-xs text-muted-foreground/40 border border-border/50">
          Cole um link ou descreva o conteúdo...
        </div>
        <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center">
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

function WizardStep({ title, children, delay = 0 }: { title: string; children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25, delay }}
      className="border border-border/60 rounded-lg p-3 bg-card"
    >
      <p className="text-xs font-medium text-foreground mb-2">{title}</p>
      {children}
    </motion.div>
  );
}

function Option({ emoji, label, active, delay = 0 }: { emoji: string; label: string; active?: boolean; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, delay }}
      className={`flex items-center gap-2 p-2 rounded-lg border text-xs ${
        active ? "border-primary bg-primary/5 text-primary font-medium" : "border-border/50 text-muted-foreground"
      }`}
    >
      <span>{emoji}</span>
      {label}
    </motion.div>
  );
}

function MiniLoading({ text }: { text: string }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="border border-border/60 rounded-lg p-3 bg-card flex items-center gap-2">
      <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin flex-shrink-0" />
      <span className="text-xs text-muted-foreground">{text}</span>
    </motion.div>
  );
}

function MiniResult({ title, hasImage }: { title: string; hasImage?: boolean }) {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }}
      className="border border-border/60 rounded-lg overflow-hidden bg-card ml-7">
      {hasImage && (
        <div className="h-28 bg-gradient-to-br from-blue-600/80 to-purple-600/80 flex items-center justify-center p-3">
          <p className="text-white text-xs font-bold text-center leading-tight">{title}</p>
        </div>
      )}
      <div className="p-2.5">
        <p className="text-[10px] text-muted-foreground uppercase">Instagram · Post</p>
        <p className="text-xs font-semibold text-foreground mt-0.5">{title}</p>
        <div className="flex gap-1.5 mt-2 flex-wrap">
          <span className="px-2 py-0.5 bg-green-500 text-white text-[9px] rounded font-medium flex items-center gap-0.5"><Check className="w-2.5 h-2.5" /> Aprovar</span>
          <span className="px-2 py-0.5 border border-border text-[9px] rounded flex items-center gap-0.5"><Calendar className="w-2.5 h-2.5" /> Agendar</span>
          <span className="px-2 py-0.5 border border-border text-[9px] rounded flex items-center gap-0.5"><ExternalLink className="w-2.5 h-2.5" /> Studio</span>
        </div>
      </div>
    </motion.div>
  );
}

// ── Tutorials ──

function TutorialPostTema() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    setStep(0);
    const t = [
      setTimeout(() => setStep(1), 600),
      setTimeout(() => setStep(2), 2000),
      setTimeout(() => setStep(3), 3200),
      setTimeout(() => setStep(4), 4500),
      setTimeout(() => setStep(5), 5800),
      setTimeout(() => setStep(6), 7200),
      setTimeout(() => setStep(7), 8500),
    ];
    return () => t.forEach(clearTimeout);
  }, []);

  return (
    <MiniChat>
      <Bubble role="assistant">Vamos criar seu conteúdo! 🌟</Bubble>
      {step >= 1 && (
        <WizardStep title="Para qual plataforma?" delay={0.1}>
          <div className="flex gap-2">
            <Option emoji="📸" label="Instagram" active />
            <Option emoji="💼" label="LinkedIn" delay={0.05} />
          </div>
        </WizardStep>
      )}
      {step >= 2 && (
        <WizardStep title="Que tipo de publicação?" delay={0.1}>
          <div className="flex gap-2">
            <Option emoji="📷" label="Post" active />
            <Option emoji="🎠" label="Carrossel" delay={0.05} />
            <Option emoji="📱" label="Story" delay={0.1} />
          </div>
        </WizardStep>
      )}
      {step >= 3 && (
        <WizardStep title="Qual marca usar?" delay={0.1}>
          <div className="flex gap-2 flex-wrap">
            <Option emoji="🎨" label="Motivacional" active />
            <Option emoji="📓" label="Caderno" delay={0.05} />
          </div>
        </WizardStep>
      )}
      {step >= 4 && (
        <WizardStep title="📝 De onde vem o conteúdo?" delay={0.1}>
          <div className="space-y-1.5">
            <Option emoji="🔗" label="Colar um link" />
            <Option emoji="💡" label="Sugestões de conteúdo" />
            <Option emoji="✏️" label="Escrever do zero" active delay={0.1} />
          </div>
        </WizardStep>
      )}
      {step >= 5 && <Bubble role="user" delay={0.1}>5 dicas para dormir melhor</Bubble>}
      {step >= 5 && step < 7 && <AnimatePresence>{step === 6 ? <MiniLoading text="Gerando conteúdo..." /> : null}</AnimatePresence>}
      {step >= 7 && (
        <>
          <Bubble role="assistant" delay={0.1}>✅ Conteúdo gerado! Confira abaixo 👇</Bubble>
          <MiniResult title="5 Hábitos Noturnos que Transformam seu Sono" hasImage />
        </>
      )}
    </MiniChat>
  );
}

function TutorialFrase() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    setStep(0);
    const t = [
      setTimeout(() => setStep(1), 600),
      setTimeout(() => setStep(2), 2000),
      setTimeout(() => setStep(3), 3500),
      setTimeout(() => setStep(4), 5000),
      setTimeout(() => setStep(5), 6500),
      setTimeout(() => setStep(6), 8000),
    ];
    return () => t.forEach(clearTimeout);
  }, []);

  return (
    <MiniChat>
      <Bubble role="assistant">Vamos criar seu conteúdo! 🌟</Bubble>
      {step >= 1 && (
        <WizardStep title="✍️ O que você quer escrever?" delay={0.1}>
          <div className="space-y-1.5">
            <Option emoji="💬" label="Uma frase — usada exatamente como você escrever" active />
            <Option emoji="📝" label="Um tema — IA gera o conteúdo" delay={0.05} />
          </div>
        </WizardStep>
      )}
      {step >= 2 && (
        <WizardStep title="💬 Digite sua frase" delay={0.1}>
          <div className="bg-muted/30 rounded-lg px-3 py-2 text-xs italic border border-border/30">
            "Sonhos são caminhos do coração"
          </div>
        </WizardStep>
      )}
      {step >= 3 && (
        <WizardStep title="Como quer o visual?" delay={0.1}>
          <div className="space-y-1.5">
            <Option emoji="✨" label="Design completo por IA" active />
            <Option emoji="📸" label="Sua foto + texto" delay={0.05} />
          </div>
        </WizardStep>
      )}
      {step === 4 && <MiniLoading text="Polindo frase e gerando design... ✨" />}
      {step >= 5 && (
        <>
          <Bubble role="assistant" delay={0.1}>✅ Frase gerada com design profissional 👇</Bubble>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
            className="ml-7 border border-border/60 rounded-lg overflow-hidden">
            <div className="h-32 relative">
              <img src="/landing/foto_pessoal.png" alt="" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-3">
                <div className="w-6 h-0.5 bg-blue-400 rounded mb-1.5" />
                <p className="text-white text-xs font-bold italic">"Sonhos são caminhos do coração"</p>
                <p className="text-white/50 text-[9px] mt-1">— Autor</p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </MiniChat>
  );
}

function TutorialLink() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    setStep(0);
    const t = [
      setTimeout(() => setStep(1), 600),
      setTimeout(() => setStep(2), 2000),
      setTimeout(() => setStep(3), 3500),
      setTimeout(() => setStep(4), 5500),
      setTimeout(() => setStep(5), 7500),
    ];
    return () => t.forEach(clearTimeout);
  }, []);

  return (
    <MiniChat>
      <Bubble role="assistant">Vamos criar seu conteúdo! 🌟</Bubble>
      {step >= 1 && (
        <WizardStep title="📝 De onde vem o conteúdo?" delay={0.1}>
          <div className="space-y-1.5">
            <Option emoji="🔗" label="Colar um link" active />
            <Option emoji="💡" label="Sugestões de conteúdo" />
            <Option emoji="✏️" label="Escrever do zero" delay={0.05} />
          </div>
        </WizardStep>
      )}
      {step >= 2 && (
        <WizardStep title="🔗 Cole o link do artigo" delay={0.1}>
          <div className="bg-muted/30 rounded-lg px-3 py-2 text-xs border border-border/30 text-primary">
            https://exemplo.com/artigo-telemedicina
          </div>
        </WizardStep>
      )}
      {step === 3 && <MiniLoading text="Lendo artigo e extraindo conteúdo..." />}
      {step >= 4 && (
        <>
          <Bubble role="assistant" delay={0.1}>✅ Artigo analisado! Post gerado com os pontos-chave 👇</Bubble>
          <MiniResult title="Telemedicina Reduz Internações em 40%" hasImage />
        </>
      )}
    </MiniChat>
  );
}

function TutorialMarca() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    setStep(0);
    const t = [
      setTimeout(() => setStep(1), 600),
      setTimeout(() => setStep(2), 2000),
      setTimeout(() => setStep(3), 3500),
      setTimeout(() => setStep(4), 5500),
      setTimeout(() => setStep(5), 7500),
    ];
    return () => t.forEach(clearTimeout);
  }, []);

  return (
    <MiniChat>
      <Bubble role="assistant">Vamos criar sua marca! Suba exemplos de posts que você usa ou gosta 🎨</Bubble>
      {step >= 1 && (
        <WizardStep title="📸 Exemplos visuais" delay={0.1}>
          <div className="border-2 border-dashed border-border rounded-lg p-4 flex flex-col items-center gap-1.5">
            <Upload className="w-5 h-5 text-muted-foreground/40" />
            <span className="text-[10px] text-muted-foreground">Arraste imagens de referência</span>
          </div>
        </WizardStep>
      )}
      {step >= 2 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 ml-7 p-2 bg-muted/30 rounded-lg">
          <img src="/landing/story_motivacional.png" alt="" className="w-10 h-10 rounded-md object-cover border border-primary" />
          <span className="text-[10px] text-foreground">Referência enviada!</span>
        </motion.div>
      )}
      {step === 3 && <MiniLoading text="Analisando estilo visual..." />}
      {step >= 4 && (
        <Bubble role="assistant" delay={0.1}>
          <div>
            <p>✅ Sua marca <strong>Motivacional</strong> está pronta!</p>
            <p className="text-[10px] opacity-70 mt-1">🎨 Paleta detectada · ✨ Style Guide criado</p>
          </div>
        </Bubble>
      )}
      {step >= 5 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-1.5 ml-7">
          <span className="px-2 py-1 border border-border rounded text-[9px]">📱 Criar um post</span>
          <span className="px-2 py-1 border border-border rounded text-[9px]">🎠 Criar carrossel</span>
          <span className="px-2 py-1 border border-border rounded text-[9px]">🎨 Editar marca</span>
        </motion.div>
      )}
    </MiniChat>
  );
}

function TutorialCarrossel() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    setStep(0);
    const t = [
      setTimeout(() => setStep(1), 600),
      setTimeout(() => setStep(2), 2200),
      setTimeout(() => setStep(3), 3800),
      setTimeout(() => setStep(4), 5000),
      setTimeout(() => setStep(5), 6500),
      setTimeout(() => setStep(6), 8000),
    ];
    return () => t.forEach(clearTimeout);
  }, []);

  return (
    <MiniChat>
      <Bubble role="assistant">Vamos criar seu conteúdo! 🌟</Bubble>
      {step >= 1 && (
        <WizardStep title="Que tipo de publicação?" delay={0.1}>
          <div className="flex gap-2">
            <Option emoji="📷" label="Post" />
            <Option emoji="🎠" label="Carrossel" active />
            <Option emoji="📱" label="Story" delay={0.05} />
          </div>
        </WizardStep>
      )}
      {step >= 2 && <Bubble role="user" delay={0.1}>Os benefícios da meditação para executivos</Bubble>}
      {step >= 3 && (
        <WizardStep title="Quantos slides?" delay={0.1}>
          <div className="flex gap-2">
            {["3", "5", "7", "🤖 IA decide"].map((n, i) => (
              <Option key={n} emoji="" label={n} active={n === "5"} delay={i * 0.05} />
            ))}
          </div>
        </WizardStep>
      )}
      {step === 4 && <MiniLoading text="Gerando 5 slides do carrossel..." />}
      {step >= 5 && (
        <>
          <Bubble role="assistant" delay={0.1}>✅ Carrossel de 5 slides gerado! 👇</Bubble>
          <MiniResult title="Meditação para Executivos: 5 Benefícios Comprovados" hasImage />
        </>
      )}
    </MiniChat>
  );
}

// ── Tutorial list ──

const TUTORIALS = [
  { id: "post", emoji: "📷", title: "Criar um post", desc: "Tema → marca → post pronto", component: TutorialPostTema },
  { id: "frase", emoji: "💬", title: "Post com frase", desc: "Frase de impacto + foto pessoal", component: TutorialFrase },
  { id: "link", emoji: "🔗", title: "Post a partir de link", desc: "Cole um artigo → post automático", component: TutorialLink },
  { id: "marca", emoji: "🎨", title: "Criar uma marca", desc: "Upload de referências → identidade visual", component: TutorialMarca },
  { id: "carrossel", emoji: "🎠", title: "Criar carrossel", desc: "Múltiplos slides educativos", component: TutorialCarrossel },
];

export function HelpTutorials() {
  const [activeTutorial, setActiveTutorial] = useState<string | null>(null);
  const [key, setKey] = useState(0);

  const ActiveComponent = TUTORIALS.find(t => t.id === activeTutorial)?.component;

  const handleSelect = (id: string) => {
    setActiveTutorial(id);
    setKey(k => k + 1); // force re-mount to restart animation
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
              <p className="text-xs text-muted-foreground">Acompanhe o passo a passo:</p>
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
          Selecione um tutorial acima para ver o passo a passo animado
        </p>
      )}
    </div>
  );
}
