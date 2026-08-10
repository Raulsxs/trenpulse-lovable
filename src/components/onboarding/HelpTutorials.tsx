import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, ChevronRight } from "lucide-react";
import { CONTENT_FORMATS, BRAND_WIZARD_STEPS } from "@/lib/formats";
import {
  AppFrame, AppHeader, AppComposer, Msg, Working, ResultCard, BrandDropdown, BrandWizardPanel,
} from "./AppReplica";

/**
 * Tutoriais da Central de Ajuda — reprodução PASSO A PASSO da interface real.
 *
 * Antes eram desenhos "parecidos" com o produto, feitos à mão, que envelheceram em silêncio:
 * mostravam botões que não existiam mais e escondiam os que existiam. Agora a tela é montada com
 * os componentes de AppReplica.tsx (mesmas classes do produto) e os formatos vêm de
 * src/lib/formats.ts — a MESMA lista que o chat usa. Mudou um formato no produto, muda aqui junto.
 */

/** Roteiro de tempos: cada tutorial declara em que instante cada passo entra. */
function useSteps(marks: number[]) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    setStep(0);
    const timers = marks.map((ms, i) => setTimeout(() => setStep(i + 1), ms));
    return () => timers.forEach(clearTimeout);
  }, []);
  return step;
}

/** Efeito de digitação: revela o texto conforme o passo avança. */
function typed(text: string, from: number, to: number, step: number) {
  if (step < from) return "";
  if (step >= to) return text;
  const ratio = (step - from + 1) / (to - from + 1);
  return text.slice(0, Math.round(text.length * ratio));
}

// ── 1. Criar um post ───────────────────────────────────────────────────────────────────────────
function TutorialPost() {
  const step = useSteps([600, 1800, 2900, 3800, 6200]);
  const pedido = "Crie um post para Instagram sobre: 5 sinais de burnout";

  return (
    <AppFrame>
      <AppHeader />
      <div className="flex-1 p-2.5 space-y-1.5 overflow-hidden">
        <Msg role="assistant">Me diz o que postar. Eu faço o resto.</Msg>
        {step >= 3 && <Msg role="user" delay={0.05}>{pedido}</Msg>}
        {step === 4 && <Working text="Gerando imagem…" />}
        {step >= 5 && (
          <>
            <Msg role="assistant" delay={0.05}>Prontinho! Quer publicar agora ou agendar?</Msg>
            <ResultCard title="5 sinais de burnout que você ignora" meta="Instagram · Post" />
          </>
        )}
      </div>
      <AppComposer
        highlight={step >= 1 && step < 3 ? "post" : undefined}
        typed={step >= 2 && step < 3 ? typed(pedido, 2, 2, step) : ""}
        caret={step === 2}
      />
    </AppFrame>
  );
}

// ── 2. Post com uma frase sua ──────────────────────────────────────────────────────────────────
function TutorialFrase() {
  const step = useSteps([700, 2100, 3000, 5400]);
  const pedido = 'Cria um post com a frase: "Pequenos passos levam a grandes conquistas"';

  return (
    <AppFrame>
      <AppHeader />
      <div className="flex-1 p-2.5 space-y-1.5 overflow-hidden">
        <Msg role="assistant">Me diz o que postar. Eu faço o resto.</Msg>
        {step >= 2 && <Msg role="user" delay={0.05}>{pedido}</Msg>}
        {step === 3 && <Working text="Criando o design…" />}
        {step >= 4 && (
          <>
            <Msg role="assistant" delay={0.05}>Feito, com as cores da sua marca.</Msg>
            <ResultCard title="Pequenos passos levam a grandes conquistas" meta="Instagram · Post" />
          </>
        )}
      </div>
      {/* Sem atalho aceso: este pedido é digitado direto, não existe botão "Frase". */}
      <AppComposer typed={step === 1 ? typed(pedido, 1, 1, step) : ""} caret={step === 1} />
    </AppFrame>
  );
}

// ── 3. Post a partir de um link ────────────────────────────────────────────────────────────────
function TutorialLink() {
  const step = useSteps([700, 2100, 3000, 5600]);
  const pedido = "Faz um carrossel sobre esse artigo: https://exemplo.com/sono-e-saude";

  return (
    <AppFrame>
      <AppHeader />
      <div className="flex-1 p-2.5 space-y-1.5 overflow-hidden">
        <Msg role="assistant">Me diz o que postar. Eu faço o resto.</Msg>
        {step >= 2 && <Msg role="user" delay={0.05}>{pedido}</Msg>}
        {step === 3 && <Working text="Lendo o artigo…" />}
        {step >= 4 && (
          <>
            <Msg role="assistant" delay={0.05}>Li o artigo e montei 5 slides com os pontos principais.</Msg>
            <ResultCard title="O que 6h de sono fazem com seu corpo" meta="Instagram · Carrossel · 5 slides" />
          </>
        )}
      </div>
      <AppComposer typed={step === 1 ? typed(pedido, 1, 1, step) : ""} caret={step === 1} />
    </AppFrame>
  );
}

// ── 4. Criar uma marca ─────────────────────────────────────────────────────────────────────────
// A marca NÃO é criada por conversa (o agente não tem essa ferramenta). É o formulário de
// /brands/new. O tutorial começa mostrando onde fica o botão, que é o que ninguém acha sozinho.
function TutorialMarca() {
  const step = useSteps([700, 1900, 3100, 4300, 5500, 6700]);

  // Passos 1-2: o chat com o seletor de marca aberto. Passo 3+: o formulário.
  if (step <= 2) {
    return (
      <AppFrame>
        <AppHeader />
        <div className="flex-1 p-2.5 space-y-1.5">
          <Msg role="assistant">Me diz o que postar. Eu faço o resto.</Msg>
          {step >= 1 && (
            <p className="text-[9px] text-muted-foreground text-center pt-6">
              Abra o seletor de marca, no rodapé do chat
            </p>
          )}
        </div>
        <div className="relative">
          {step >= 2 && <BrandDropdown highlightCreate />}
          <AppComposer brand="Sem marca" />
        </div>
      </AppFrame>
    );
  }

  return (
    <AppFrame>
      <div className="border-b border-border px-3 py-2">
        <p className="text-[10px] font-bold leading-none">Nova marca</p>
        <p className="text-[8px] text-muted-foreground leading-none mt-0.5">Menu → Marcas → Criar marca</p>
      </div>
      <BrandWizardPanel step={step - 2} steps={BRAND_WIZARD_STEPS} />
      {step >= 6 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="mx-3 mb-3 rounded-lg border border-green-500/30 bg-green-500/10 px-2.5 py-1.5">
          <p className="text-[10px] font-semibold">✅ Marca criada</p>
          <p className="text-[9px] text-muted-foreground mt-0.5">
            Daqui pra frente, todo conteúdo sai com essas cores e com o logo aplicado sozinho.
          </p>
        </motion.div>
      )}
    </AppFrame>
  );
}

// ── 5. Criar um carrossel ──────────────────────────────────────────────────────────────────────
function TutorialCarrossel() {
  const step = useSteps([600, 1800, 2900, 3900, 6500]);
  const pedido = "Crie um carrossel de 5 slides sobre: benefícios da meditação";

  return (
    <AppFrame>
      <AppHeader />
      <div className="flex-1 p-2.5 space-y-1.5 overflow-hidden">
        <Msg role="assistant">Me diz o que postar. Eu faço o resto.</Msg>
        {step >= 3 && <Msg role="user" delay={0.05}>{pedido}</Msg>}
        {step === 4 && <Working text="Gerando 5 slides…" />}
        {step >= 5 && (
          <>
            <Msg role="assistant" delay={0.05}>Carrossel de 5 slides pronto.</Msg>
            <ResultCard title="Meditação: 5 benefícios reais" meta="Instagram · Carrossel · 5 slides" />
          </>
        )}
      </div>
      <AppComposer
        highlight={step >= 1 && step < 3 ? "carrossel" : undefined}
        typed={step >= 2 && step < 3 ? typed(pedido, 2, 2, step) : ""}
        caret={step === 2}
      />
    </AppFrame>
  );
}

// ── 6. Publicar nas redes ──────────────────────────────────────────────────────────────────────
// O tutorial mais importante pra quem chega: é onde o usuário novo trava, porque ninguém avisa
// que a rede precisa estar conectada ANTES.
function TutorialPublicar() {
  const step = useSteps([700, 2000, 3300, 5000]);

  return (
    <AppFrame>
      <AppHeader />
      <div className="flex-1 p-2.5 space-y-1.5 overflow-hidden">
        <Msg role="assistant">Conteúdo pronto. Quer publicar agora ou agendar?</Msg>
        {step >= 1 && <ResultCard title="5 hábitos que melhoram seu sono" meta="Instagram · Post" />}
        {step >= 2 && <Msg role="user" delay={0.05}>Publica no Instagram</Msg>}
        {step === 3 && <Working text="Enviando para o Instagram…" />}
        {step >= 4 && (
          <Msg role="assistant" delay={0.05}>
            Publicado. <b>Antes da primeira vez</b>, conecte a conta em Perfil → Conexões.
          </Msg>
        )}
      </div>
      <AppComposer />
    </AppFrame>
  );
}

// ── Lista ──────────────────────────────────────────────────────────────────────────────────────
const TUTORIALS = [
  { id: "post", emoji: CONTENT_FORMATS[0].emoji, title: "Criar um post", desc: "Clique no atalho, escreva o tema", component: TutorialPost },
  { id: "frase", emoji: "💡", title: "Post com uma frase sua", desc: "Cole a frase, ele cria o design", component: TutorialFrase },
  { id: "link", emoji: "🔗", title: "Post a partir de um link", desc: "Cole o link, ele lê e monta", component: TutorialLink },
  { id: "marca", emoji: "🎨", title: "Criar uma marca", desc: "4 passos → sua identidade em toda peça", component: TutorialMarca },
  { id: "carrossel", emoji: CONTENT_FORMATS[1].emoji, title: "Criar um carrossel", desc: "Vários slides de uma vez", component: TutorialCarrossel },
  { id: "publicar", emoji: "🚀", title: "Publicar nas redes", desc: "Conecte a conta → publique ou agende", component: TutorialPublicar },
];

export function HelpTutorials() {
  const [activeTutorial, setActiveTutorial] = useState<string | null>(null);
  const [key, setKey] = useState(0);

  const handleSelect = (id: string) => {
    if (activeTutorial === id) { setKey((k) => k + 1); return; }
    setActiveTutorial(id);
    setKey((k) => k + 1);
  };

  const ActiveComponent = TUTORIALS.find((t) => t.id === activeTutorial)?.component;

  return (
    <div className="space-y-3">
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
              <p className="text-xs text-muted-foreground">Veja o passo a passo:</p>
              <button
                onClick={() => setKey((k) => k + 1)}
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
          Escolha um tutorial acima para ver a tela real, passo a passo
        </p>
      )}
    </div>
  );
}
