export type TemplateStyle = "editorial" | "magazine" | "clinical" | "modern" | "neon" | "wellness" | "tech" | "luxury";

export interface TemplateConfig {
  id: TemplateStyle;
  name: string;
  description: string;
  // Overlay styles
  overlayStyle: string;
  overlayGradient: string;
  // Typography
  headlineStyle: string;
  bodyStyle: string;
  // Accent elements
  accentColor: string;
  accentBg: string;
  // Decorative
  hasFrame: boolean;
  frameStyle?: string;
  badgeStyle: string;
}

export const templates: Record<TemplateStyle, TemplateConfig> = {
  editorial: {
    id: "editorial",
    name: "Editorial",
    description: "Estilo revista premium",
    overlayStyle: "bg-gradient-to-t from-black/90 via-black/50 to-transparent",
    overlayGradient: "from-black/90 via-black/40 to-black/20",
    headlineStyle: "font-serif text-2xl font-bold tracking-tight leading-tight",
    bodyStyle: "font-sans text-sm font-light tracking-wide leading-relaxed",
    accentColor: "text-amber-400",
    accentBg: "bg-amber-400",
    hasFrame: true,
    frameStyle: "border-2 border-white/20",
    badgeStyle: "bg-white/10 backdrop-blur-md border border-white/20",
  },
  magazine: {
    id: "magazine",
    name: "Magazine",
    description: "Layout bold de revista",
    overlayStyle: "bg-gradient-to-br from-violet-900/80 via-purple-900/60 to-fuchsia-900/80",
    overlayGradient: "from-violet-900/80 via-transparent to-fuchsia-900/70",
    headlineStyle: "font-black text-3xl uppercase tracking-tighter leading-none",
    bodyStyle: "font-medium text-sm tracking-wide leading-relaxed",
    accentColor: "text-fuchsia-400",
    accentBg: "bg-fuchsia-500",
    hasFrame: false,
    badgeStyle: "bg-fuchsia-500/80 backdrop-blur-sm",
  },
  clinical: {
    id: "clinical",
    name: "Clínico",
    description: "Profissional de saúde",
    overlayStyle: "bg-gradient-to-t from-slate-900/95 via-slate-800/60 to-slate-700/30",
    overlayGradient: "from-slate-900/90 via-slate-800/50 to-transparent",
    headlineStyle: "font-semibold text-2xl tracking-tight leading-tight",
    bodyStyle: "font-normal text-sm tracking-normal leading-relaxed",
    accentColor: "text-teal-400",
    accentBg: "bg-teal-500",
    hasFrame: true,
    frameStyle: "border border-teal-500/30",
    badgeStyle: "bg-teal-500/20 backdrop-blur-md border border-teal-500/30",
  },
  modern: {
    id: "modern",
    name: "Moderno",
    description: "Clean e minimalista",
    overlayStyle: "bg-gradient-to-t from-zinc-950/95 via-zinc-900/70 to-zinc-800/40",
    overlayGradient: "from-zinc-950/90 via-zinc-900/50 to-transparent",
    headlineStyle: "font-light text-2xl tracking-wide leading-snug",
    bodyStyle: "font-extralight text-sm tracking-widest leading-relaxed uppercase",
    accentColor: "text-sky-400",
    accentBg: "bg-sky-500",
    hasFrame: false,
    badgeStyle: "bg-white/5 backdrop-blur-lg border border-white/10",
  },
  neon: {
    id: "neon",
    name: "Neon",
    description: "Dark com cores vibrantes",
    overlayStyle: "bg-gradient-to-br from-purple-950/95 via-black/90 to-pink-950/95",
    overlayGradient: "from-purple-950/90 via-black/80 to-pink-950/90",
    headlineStyle: "font-extrabold text-2xl tracking-tight leading-tight",
    bodyStyle: "font-light text-sm tracking-wide leading-relaxed",
    accentColor: "text-pink-400",
    accentBg: "bg-gradient-to-r from-pink-500 to-purple-500",
    hasFrame: true,
    frameStyle: "border border-pink-500/50 shadow-[0_0_20px_rgba(236,72,153,0.3)]",
    badgeStyle: "bg-pink-500/30 backdrop-blur-md border border-pink-500/50",
  },
  wellness: {
    id: "wellness",
    name: "Wellness",
    description: "Verde e natureza",
    overlayStyle: "bg-gradient-to-t from-emerald-950/90 via-green-900/50 to-teal-900/30",
    overlayGradient: "from-emerald-950/85 via-green-900/40 to-transparent",
    headlineStyle: "font-medium text-2xl tracking-normal leading-snug",
    bodyStyle: "font-light text-sm tracking-wide leading-relaxed",
    accentColor: "text-emerald-400",
    accentBg: "bg-emerald-500",
    hasFrame: false,
    badgeStyle: "bg-emerald-500/20 backdrop-blur-md border border-emerald-500/30",
  },
  tech: {
    id: "tech",
    name: "Tech",
    description: "Azul escuro futurista",
    overlayStyle: "bg-gradient-to-br from-slate-950/95 via-blue-950/80 to-indigo-950/95",
    overlayGradient: "from-slate-950/90 via-blue-950/70 to-indigo-950/80",
    headlineStyle: "font-bold text-2xl tracking-tight leading-tight",
    bodyStyle: "font-normal text-sm tracking-wide leading-relaxed",
    accentColor: "text-cyan-400",
    accentBg: "bg-gradient-to-r from-cyan-500 to-blue-500",
    hasFrame: true,
    frameStyle: "border border-cyan-500/30",
    badgeStyle: "bg-cyan-500/20 backdrop-blur-md border border-cyan-500/40",
  },
  luxury: {
    id: "luxury",
    name: "Luxury",
    description: "Dourado e preto elegante",
    overlayStyle: "bg-gradient-to-t from-black/95 via-neutral-900/80 to-stone-900/60",
    overlayGradient: "from-black/90 via-neutral-900/70 to-stone-900/40",
    headlineStyle: "font-semibold text-2xl tracking-wide leading-snug",
    bodyStyle: "font-light text-sm tracking-widest leading-relaxed uppercase",
    accentColor: "text-amber-300",
    accentBg: "bg-gradient-to-r from-amber-400 to-yellow-500",
    hasFrame: true,
    frameStyle: "border-2 border-amber-400/40",
    badgeStyle: "bg-amber-400/20 backdrop-blur-md border border-amber-400/30",
  },
};
