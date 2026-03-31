import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchAI } from "../_shared/ai-gateway.ts";

async function aiGatewayFetch(body: Record<string, unknown>): Promise<Response> {
  try {
    const result = await fetchAI(body as any);
    return new Response(JSON.stringify({ choices: result.choices }), {
      status: result.ok ? 200 : (result.status || 500),
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[aiGatewayFetch] Exception:", err?.message || err);
    return new Response(JSON.stringify({ choices: [{ message: { content: "" } }], error: err?.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ══════ TYPES ══════

interface GenerateContentRequest {
  trend: {
    title: string;
    description: string;
    theme: string;
    keywords: string[];
    fullContent?: string;
  };
  contentType: "post" | "story" | "carousel" | "article" | "document";
  contentStyle?: "news" | "quote" | "tip" | "educational" | "curiosity";
  brandId?: string | null;
  visualMode?: "brand_strict" | "brand_guided" | "text_only" | "free";
  templateSetId?: string | null;
  slideCount?: number | null;
  includeCta?: boolean;
  tone?: string;
  targetAudience?: string;
  platform?: "instagram" | "linkedin";
  secondaryLanguages?: string[];
  manualBriefing?: {
    headline?: string;
    body?: string;
    bullets?: string[];
    notes?: string;
  } | null;
  recentTitles?: string[];
}

interface StyleGuide {
  style_preset?: string;
  brand_tokens?: {
    palette_roles?: Record<string, string>;
    typography?: Record<string, unknown>;
    logo?: { preferred_position?: string; watermark_opacity?: number };
  };
  formats?: Record<string, {
    recommended_templates?: string[];
    layout_rules?: Record<string, unknown>;
    text_limits?: { headline_chars?: number[]; body_chars?: number[]; bullets_max?: number };
    slide_roles?: string[];
    role_to_template?: Record<string, string>;
    cta_policy?: "never" | "optional" | "always";
    cta_templates?: string[];
    slide_count_range?: [number, number];
    typography?: Record<string, unknown>;
    logo?: Record<string, unknown>;
  }>;
  visual_patterns?: string[];
  notes?: string[];
  confidence?: string;
}

interface BrandTokens {
  name: string;
  palette: { name: string; hex: string; role?: string }[];
  fonts: { headings: string; body: string };
  visual_tone: string;
  logo_url: string | null;
  do_rules: string | null;
  dont_rules: string | null;
  image_style: string;
  example_descriptions: string[];
  style_guide: StyleGuide | null;
  style_guide_version: number;
}

// ══════ NICHE-BASED DEFAULTS ══════
// Professional color palettes and fonts per business niche
// Used when user has no brand configured

const NICHE_DEFAULTS: Record<string, { palette: { name: string; hex: string }[]; fonts: { headings: string; body: string }; tone: string }> = {
  "saúde": { palette: [{ name: "Primary", hex: "#0891b2" }, { name: "Secondary", hex: "#164e63" }, { name: "Accent", hex: "#06b6d4" }, { name: "Light", hex: "#ecfeff" }, { name: "Dark", hex: "#0c4a6e" }], fonts: { headings: "Montserrat", body: "Open Sans" }, tone: "profissional e confiável" },
  "advocacia": { palette: [{ name: "Primary", hex: "#1e3a5f" }, { name: "Secondary", hex: "#0f2440" }, { name: "Accent", hex: "#c9a96e" }, { name: "Light", hex: "#f5f0e8" }, { name: "Dark", hex: "#0a1628" }], fonts: { headings: "Playfair Display", body: "Inter" }, tone: "sério e autoritativo" },
  "contabilidade": { palette: [{ name: "Primary", hex: "#1e40af" }, { name: "Secondary", hex: "#1e3a8a" }, { name: "Accent", hex: "#3b82f6" }, { name: "Light", hex: "#eff6ff" }, { name: "Dark", hex: "#172554" }], fonts: { headings: "Inter", body: "Inter" }, tone: "preciso e confiável" },
  "educação": { palette: [{ name: "Primary", hex: "#7c3aed" }, { name: "Secondary", hex: "#5b21b6" }, { name: "Accent", hex: "#a78bfa" }, { name: "Light", hex: "#f5f3ff" }, { name: "Dark", hex: "#2e1065" }], fonts: { headings: "Poppins", body: "Inter" }, tone: "acessível e inspirador" },
  "gastronomia": { palette: [{ name: "Primary", hex: "#dc2626" }, { name: "Secondary", hex: "#7f1d1d" }, { name: "Accent", hex: "#f59e0b" }, { name: "Light", hex: "#fef2f2" }, { name: "Dark", hex: "#450a0a" }], fonts: { headings: "Playfair Display", body: "Open Sans" }, tone: "quente e apetitoso" },
  "fitness": { palette: [{ name: "Primary", hex: "#16a34a" }, { name: "Secondary", hex: "#14532d" }, { name: "Accent", hex: "#f97316" }, { name: "Light", hex: "#f0fdf4" }, { name: "Dark", hex: "#052e16" }], fonts: { headings: "Montserrat", body: "Inter" }, tone: "energético e motivacional" },
  "beleza": { palette: [{ name: "Primary", hex: "#db2777" }, { name: "Secondary", hex: "#831843" }, { name: "Accent", hex: "#f9a8d4" }, { name: "Light", hex: "#fdf2f8" }, { name: "Dark", hex: "#500724" }], fonts: { headings: "Playfair Display", body: "Inter" }, tone: "elegante e sofisticado" },
  "tecnologia": { palette: [{ name: "Primary", hex: "#2563eb" }, { name: "Secondary", hex: "#1e3a8a" }, { name: "Accent", hex: "#06b6d4" }, { name: "Light", hex: "#eff6ff" }, { name: "Dark", hex: "#0f172a" }], fonts: { headings: "Inter", body: "Inter" }, tone: "moderno e inovador" },
  "imobiliário": { palette: [{ name: "Primary", hex: "#0d9488" }, { name: "Secondary", hex: "#134e4a" }, { name: "Accent", hex: "#d4a574" }, { name: "Light", hex: "#f0fdfa" }, { name: "Dark", hex: "#042f2e" }], fonts: { headings: "Montserrat", body: "Open Sans" }, tone: "confiável e aspiracional" },
  "marketing": { palette: [{ name: "Primary", hex: "#e11d48" }, { name: "Secondary", hex: "#4c1d95" }, { name: "Accent", hex: "#f97316" }, { name: "Light", hex: "#fff1f2" }, { name: "Dark", hex: "#1a1a2e" }], fonts: { headings: "Poppins", body: "Inter" }, tone: "criativo e engajador" },
  "consultoria": { palette: [{ name: "Primary", hex: "#1e293b" }, { name: "Secondary", hex: "#334155" }, { name: "Accent", hex: "#3b82f6" }, { name: "Light", hex: "#f8fafc" }, { name: "Dark", hex: "#0f172a" }], fonts: { headings: "Inter", body: "Inter" }, tone: "estratégico e profissional" },
};

function getNicheDefaults(niche?: string | null) {
  if (!niche) return null;
  const lower = niche.toLowerCase();
  for (const [key, val] of Object.entries(NICHE_DEFAULTS)) {
    if (lower.includes(key)) return val;
  }
  return null;
}

// ══════ DEFAULT STYLE GUIDE ══════

const DEFAULT_STYLE_GUIDE: StyleGuide = {
  style_preset: "clean_minimal",
  brand_tokens: {
    palette_roles: { primary: "#667eea", secondary: "#764ba2", accent: "#f093fb" },
    typography: { headline_weight: 800, body_weight: 400 },
    logo: { preferred_position: "none", watermark_opacity: 0 },
  },
  formats: {
    post: {
      recommended_templates: ["generic_free"],
      text_limits: { headline_chars: [35, 60], body_chars: [140, 260] },
    },
    story: {
      recommended_templates: ["generic_free"],
      text_limits: { headline_chars: [25, 45], body_chars: [90, 160] },
    },
    carousel: {
      recommended_templates: ["generic_free"],
      slide_roles: ["cover", "context", "insight", "insight", "closing"],
      text_limits: { headline_chars: [35, 60], body_chars: [160, 260], bullets_max: 5 },
      cta_policy: "optional",
      slide_count_range: [3, 10],
    },
  },
  confidence: "high",
};

// ══════ PALETTE NORMALIZATION ══════

function normalizePalette(raw: unknown): { name: string; hex: string; role?: string }[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((item: unknown, i: number) => {
      if (typeof item === "string") {
        const hex = item.startsWith("#") ? item : `#${item}`;
        return { name: `cor${i + 1}`, hex };
      }
      if (typeof item === "object" && item !== null) {
        const obj = item as Record<string, unknown>;
        const hex = typeof obj.hex === "string"
          ? (obj.hex.startsWith("#") ? obj.hex : `#${obj.hex}`)
          : "#000000";
        return {
          name: typeof obj.name === "string" ? obj.name : `cor${i + 1}`,
          hex,
          role: typeof obj.role === "string" ? obj.role : undefined,
        };
      }
      return { name: `cor${i + 1}`, hex: "#000000" };
    }).filter((c) => /^#[0-9a-fA-F]{3,8}$/.test(c.hex));
  }
  if (typeof raw === "object" && raw !== null) {
    const obj = raw as Record<string, unknown>;
    return Object.entries(obj)
      .filter(([, v]) => typeof v === "string")
      .map(([role, hex]) => ({
        name: role,
        hex: (hex as string).startsWith("#") ? (hex as string) : `#${hex as string}`,
        role,
      }))
      .filter((c) => /^#[0-9a-fA-F]{3,8}$/.test(c.hex));
  }
  return [];
}

function buildBrandTokens(brand: any, examples: any[]): BrandTokens {
  return {
    name: brand.name,
    palette: normalizePalette(brand.palette),
    fonts: brand.fonts || { headings: "Inter", body: "Inter" },
    visual_tone: brand.visual_tone || "clean",
    logo_url: brand.logo_url || null,
    do_rules: brand.do_rules || null,
    dont_rules: brand.dont_rules || null,
    image_style: brand.visual_tone || "clean",
    example_descriptions: examples.filter((e: any) => e.description).map((e: any) => e.description),
    style_guide: brand.style_guide || null,
    style_guide_version: brand.style_guide_version || 0,
  };
}

// ══════ STYLE-SPECIFIC PROMPT CONFIGS ══════

const stylePrompts: Record<string, { systemAddition: string; captionGuide: string; structure: string }> = {
  news: {
    systemAddition: `Crie conteúdo informativo e profissional sobre a notícia/tendência. Aborde o assunto com autoridade e dados concretos extraídos da fonte original.

ESTILO NOTÍCIA:
- Headline: título jornalístico com dado concreto quando disponível
- Body: contexto real extraído da fonte, quem/o quê/quando/por quê
- Incluir números, nomes, datas se existirem na fonte
- Tom: objetivo, direto, baseado em fatos
- NUNCA inventar dados — usar só o que está na fonte`,
    captionGuide: "Legenda informativa com: gancho (pergunta/dado impactante), contexto do setor, 3 aprendizados práticos, 1 recomendação acionável e CTA leve. 900–1600 caracteres. Emojis com moderação.",
    structure: "cover(gancho provocativo) → context(por que importa + dados) → insight1(passo prático/bullets) → insight2(armadilha ou mito vs verdade) → closing(takeaway + CTA leve)",
  },
  quote: {
    systemAddition: `Você está criando um conteúdo do tipo FRASE/CITAÇÃO.

REGRAS ABSOLUTAS PARA FRASES:
1. O título fornecido pelo usuário É A FRASE que deve aparecer EXATAMENTE como headline do slide principal.
2. NÃO invente outra frase. NÃO modifique a frase. Use LITERALMENTE o que o usuário escreveu no título.
3. A headline deve ser A FRASE INTEIRA — ela é o conteúdo principal e deve dominar o slide.
4. O body deve ser apenas uma atribuição/assinatura curta (autor, contexto) ou ficar vazio.
5. NÃO inclua CTAs. O conteúdo deve ser autossuficiente, profundo e memorável.
6. Para post/story: 1 slide com a frase como headline grande.
7. Para carrossel: slide 1 = frase principal como headline, demais slides = reflexões complementares.
8. O illustrationPrompt deve pedir um background abstrato, emocional e clean — SEM texto na imagem.

ESTILO FRASE:
- A frase fornecida pelo usuário É o headline — copiar LITERALMENTE
- Body: apenas atribuição/autor (máx 40 chars) ou vazio
- NUNCA parafrasear ou resumir a frase
- Sem CTA, sem bullets, sem dados adicionais`,
    captionGuide: "Legenda reflexiva e curta. 250–500 caracteres. SEM CTA, SEM 'saiba mais'. Apenas reflexão profunda conectada ao tema da frase.",
    structure: "cover(A FRASE EXATA do usuário como headline) → context(reflexão complementar) → insight1(perspectiva diferente) → closing(assinatura/marca, SEM CTA)",
  },
  tip: {
    systemAddition: `Crie dicas práticas, acionáveis e diretas baseadas no conteúdo da fonte. Seja útil e concreto.

ESTILO DICA:
- Headline: benefício direto ou ação clara ("Como X", "3 formas de Y")
- Body: a dica em si, aplicável imediatamente
- Se carrossel: 1 dica por slide, sem repetir
- Tom: prático, acionável, próximo`,
    captionGuide: "Legenda com tom prático e direto. 900–1600 caracteres. Inclua mini-resumo das dicas + exemplo real de aplicação.",
    structure: "cover(problema/pergunta provocativa) → context(por que essa dica importa + contexto do artigo) → insight1(dica 1 com bullets detalhados) → insight2(dica 2 ou checklist com exemplos) → closing(resumo + CTA leve)",
  },
  educational: {
    systemAddition: `Explique conceitos de forma didática, acessível e com analogias simples. Use os dados da fonte para embasar.

ESTILO EDUCATIVO:
- Headline: pergunta provocativa ou afirmação que gera curiosidade
- Body: explicação clara com analogia ou exemplo prático
- Estrutura: problema → contexto → insight
- Tom: didático mas acessível, sem jargão desnecessário`,
    captionGuide: "Legenda didática e acessível. 900–1600 caracteres. Use analogias simples, exemplos concretos e linguagem clara.",
    structure: "cover(pergunta 'O que é X?') → context(por que todo gestor precisa saber + dados da fonte) → insight1(como funciona na prática com exemplo) → insight2(comparação ou caso real) → closing(resumo + CTA educativo)",
  },
  curiosity: {
    systemAddition: `Crie conteúdo que desperte curiosidade com dados surpreendentes e fatos pouco conhecidos extraídos da fonte.

ESTILO CURIOSIDADE:
- Headline: fato surpreendente que gera "Nossa, não sabia disso"
- Body: contexto que explica o porquê do fato ser relevante
- Tom: leve, conversacional, pode usar ironia sutil`,
    captionGuide: "Legenda que surpreende. 900–1600 caracteres. Comece com dado impactante da fonte, depois contextualize.",
    structure: "cover('Você sabia?' + dado surpreendente da fonte) → context(contexto do dado + origem) → insight1(implicação prática + o que muda) → insight2(o que poucos sabem + exemplo) → closing(reflexão + CTA)",
  },
};

function buildBrandContextBlock(tokens: BrandTokens, styleGuide: StyleGuide | null): string {
  const parts: string[] = [];
  parts.push(`\n══════ IDENTIDADE VISUAL: "${tokens.name}" ══════`);
  parts.push(`Tom visual: ${tokens.visual_tone}`);
  if (tokens.palette.length > 0) {
    parts.push(`Paleta: ${tokens.palette.map((c) => `${c.name}=${c.hex}`).join(", ")}`);
  }
  if (tokens.fonts) {
    parts.push(`Fontes: Títulos=${tokens.fonts.headings}, Corpo=${tokens.fonts.body}`);
  }
  if (tokens.do_rules) parts.push(`✅ REGRAS: ${tokens.do_rules}`);
  if (tokens.dont_rules) parts.push(`🚫 PROIBIDO: ${tokens.dont_rules}`);
  if (tokens.example_descriptions.length > 0) {
    parts.push(`Referências:\n${tokens.example_descriptions.map((d) => `  • ${d}`).join("\n")}`);
  }
  if (styleGuide?.visual_patterns && styleGuide.visual_patterns.length > 0) {
    parts.push(`Padrões visuais detectados:\n${styleGuide.visual_patterns.map((p) => `  • ${p}`).join("\n")}`);
  }
  if (styleGuide?.notes && styleGuide.notes.length > 0) {
    parts.push(`Notas de estilo:\n${styleGuide.notes.map((n) => `  • ${n}`).join("\n")}`);
  }
  parts.push(`══════ FIM ══════`);
  return parts.join("\n");
}

function resolveSlideCount(
  contentType: string,
  requestedCount: number | null | undefined,
  formatConfig: any,
  contentStyle?: string,
  textLength?: number,
): number {
  if (contentType !== "carousel" && contentType !== "document") return 1;
  if (requestedCount && requestedCount >= 3 && requestedCount <= 10) {
    console.log(`[generate-content] Slide count: FIXED by user = ${requestedCount}`);
    return requestedCount;
  }
  return getAutoSlideCount(contentStyle || "news", textLength || 0, formatConfig);
}

function getAutoSlideCount(
  contentStyle: string,
  textLength: number,
  formatConfig: any,
): number {
  const range = formatConfig?.slide_count_range as [number, number] | undefined;
  const min = Math.max(range?.[0] || 6, 6);
  const max = Math.min(range?.[1] || 9, 10);

  // Quote carousels are shorter
  const styleRanges: Record<string, [number, number]> = {
    tip: [6, 7],
    quote: [4, 6],
    news: [7, 9],
    educational: [7, 9],
    curiosity: [6, 8],
  };
  const [styleMin, styleMax] = styleRanges[contentStyle] || [6, 8];

  let estimated: number;
  if (textLength < 500) {
    estimated = styleMin;
  } else if (textLength < 2000) {
    estimated = Math.round((styleMin + styleMax) / 2);
  } else if (textLength < 5000) {
    estimated = styleMax;
  } else {
    estimated = styleMax + 1;
  }

  const clampedMin = Math.max(min, styleMin);
  const clampedMax = Math.min(max, styleMax + 2);
  const result = Math.max(clampedMin, Math.min(clampedMax, estimated));

  console.log(`[generate-content] Auto slide count: style=${contentStyle}, textLen=${textLength}, estimated=${estimated}, range=[${clampedMin},${clampedMax}], result=${result}`);
  return result;
}

// ══════ DYNAMIC TEXT LIMITS BY contentType + contentStyle ══════

const textLimitMatrix: Record<string, Record<string, [number, number, number, number]>> = {
  post: {
    news:        [60, 90,  200, 350],
    educational: [50, 80,  180, 300],
    tip:         [40, 70,  150, 280],
    curiosity:   [50, 80,  150, 280],
    quote:       [80, 180, 0,   50],
  },
  story: {
    news:        [40, 65,  60,  120],
    educational: [35, 60,  60,  120],
    tip:         [30, 55,  50,  100],
    curiosity:   [35, 65,  50,  100],
    quote:       [60, 140, 0,   30],
  },
  carousel: {
    news:        [35, 60,  80,  160],
    educational: [30, 55,  80,  160],
    tip:         [25, 50,  70,  140],
    curiosity:   [30, 55,  70,  140],
    quote:       [50, 120, 0,   40],
  },
};

function getTextLimits(styleGuide: StyleGuide | null, contentType: string, contentStyle?: string): { headline: number[]; body: number[]; bulletsMax: number } {
  const formatGuide = styleGuide?.formats?.[contentType];
  const style = contentStyle || "news";
  const matrix = textLimitMatrix[contentType]?.[style] || textLimitMatrix["post"]["news"];
  
  // Style guide overrides take priority if they exist
  const sgHeadline = formatGuide?.text_limits?.headline_chars;
  const sgBody = formatGuide?.text_limits?.body_chars;
  
  return {
    headline: sgHeadline || [matrix[0], matrix[1]],
    body: sgBody || [matrix[2], matrix[3]],
    bulletsMax: formatGuide?.text_limits?.bullets_max || (contentType === "story" ? 3 : 5),
  };
}

function getTemplatesForFormat(styleGuide: StyleGuide | null, contentType: string, visualMode: string): string[] {
  if (visualMode === "free" || visualMode === "text_only") return ["generic_free"];
  const formatGuide = styleGuide?.formats?.[contentType];
  const recommended = formatGuide?.recommended_templates;
  if (recommended && recommended.length > 0) return recommended;
  if (contentType === "story") return ["story_cover", "story_tip"];
  return ["wave_cover", "wave_text_card", "wave_bullets", "wave_text_card", "wave_closing"];
}

function buildSlideRoles(
  contentType: string,
  slideCount: number,
  formatConfig: any,
  includeCta: boolean,
  platform?: string,
): string[] {
  if (contentType !== "carousel" && contentType !== "document") return ["cover"];

  // LinkedIn documents have a specific professional structure
  if (contentType === "document") {
    const roles: string[] = ["cover"];
    const contentSlots = slideCount - 2; // reserve cover + conclusion
    if (contentSlots >= 1) roles.push("context");
    if (contentSlots >= 2) roles.push("data");
    if (contentSlots >= 3) roles.push("insight");
    if (contentSlots >= 4) roles.push("tips");
    for (let i = 4; i < contentSlots; i++) {
      roles.push(i % 2 === 0 ? "insight" : "data");
    }
    roles.push("conclusion");
    console.log(`[generate-content] LinkedIn document roles: [${roles.join(", ")}] (count=${slideCount})`);
    return roles;
  }

  const roles: string[] = ["cover"];
  const contentSlots = includeCta ? slideCount - 2 : slideCount - 1;

  const tsRoles = formatConfig?.slide_roles as string[] | undefined;
  const hasBulletsRole = tsRoles?.includes("bullets");

  if (contentSlots > 0) {
    roles.push("context");
    for (let i = 1; i < contentSlots; i++) {
      if (hasBulletsRole && i === contentSlots - 1) {
        roles.push("bullets");
      } else {
        roles.push("insight");
      }
    }
  }

  if (includeCta) {
    roles.push("cta");
  }

  console.log(`[generate-content] Slide roles: [${roles.join(", ")}] (count=${slideCount}, cta=${includeCta}, hasBullets=${hasBulletsRole})`);
  return roles;
}

function getBackgroundStyle(styleGuide: StyleGuide | null, contentType: string): string {
  const rules = styleGuide?.formats?.[contentType]?.layout_rules as Record<string, unknown> | undefined;
  return (rules?.background_style as string) || "gradient";
}

function buildImagePromptForSlide(basePrompt: string, tokens: BrandTokens | null, visualMode: string): string {
  if (visualMode === "brand_strict" || visualMode === "text_only") return "";
  if (visualMode === "free" || !tokens) {
    return `${basePrompt}. Professional image. No text. Ultra high resolution.`;
  }
  const colors = tokens.palette.map((c) => c.hex).join(", ");
  return [
    `Background/illustration for professional content. Brand colors: ${colors}. Style: ${tokens.visual_tone}.`,
    `${basePrompt}`,
    "NO TEXT ON IMAGE. Abstract or photographic background only.",
    "Ultra high resolution, premium quality.",
  ].join(" ");
}

// ══════ DERIVE TEMPLATES BY ROLE ══════

function deriveTemplatesByRole(templateSet: any): Record<string, string> {
  if (templateSet?.templates_by_role) {
    return templateSet.templates_by_role;
  }
  
  const visualSig = templateSet?.visual_signature;
  const tv = visualSig?.theme_variant || "";
  
  if (tv.includes("editorial") || tv.includes("dark")) {
    return {
      cover: "parameterized", context: "parameterized", content: "parameterized",
      insight: "parameterized", bullets: "parameterized", quote: "parameterized",
      question: "parameterized", closing: "parameterized", cta: "parameterized",
    };
  }
  
  if (templateSet?.layout_params) {
    return {
      cover: "parameterized", context: "parameterized", content: "parameterized",
      insight: "parameterized", bullets: "parameterized", quote: "parameterized",
      question: "parameterized", closing: "parameterized", cta: "parameterized",
    };
  }
  
  return {
    cover: "wave_cover", context: "wave_text_card", content: "wave_text_card",
    insight: "wave_bullets", bullets: "wave_bullets", quote: "wave_text_card",
    question: "wave_text_card", closing: "wave_closing", cta: "wave_closing",
  };
}

// ══════ MAIN ══════

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const t0 = Date.now();
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      console.error("[generate-content] Auth error:", userError?.message || "No user");
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.log(`[generate-content] Authenticated user: ${userData.user.id}`);

    const {
      trend,
      contentType,
      contentStyle: rawContentStyle = "news",
      brandId = null,
      visualMode = brandId ? "brand_guided" : "free",
      templateSetId = null,
      slideCount: requestedSlideCount = null,
      includeCta = true,
      tone: rawTone = "profissional e engajador",
      targetAudience = "profissionais e empreendedores",
      platform: rawPlatform = "instagram",
      secondaryLanguages = [],
      manualBriefing = null,
      recentTitles = [],
    } = await req.json() as GenerateContentRequest;

    // Fix null values that bypass JS default assignment (defaults only apply for undefined, not null)
    const contentStyle = rawContentStyle || "news";
    const platform = rawPlatform || "instagram";
    const tone = rawTone || "profissional e engajador";

    // Bilingual caption: only when user has secondary languages configured
    const hasBilingual = secondaryLanguages && secondaryLanguages.length > 0;
    const bilingualLang = hasBilingual ? secondaryLanguages[0] : null; // e.g. "en", "es"

    // Defensive null guards — prevent 500 errors from missing/null params
    if (!trend || (!trend.title && !trend.theme && !trend.description)) {
      return new Response(JSON.stringify({ error: "Trend/tema é obrigatório para gerar conteúdo." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!contentType) {
      return new Response(JSON.stringify({ error: "Tipo de conteúdo (post/carousel/story) é obrigatório." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[generate-content] Request: contentType=${contentType}, contentStyle=${contentStyle}, brandId=${brandId}, templateSetId=${templateSetId}, requestedSlideCount=${requestedSlideCount}, includeCta=${includeCta}`);

    // ══════ BRAND LOADING ══════
    let brandTokens: BrandTokens | null = null;
    let brandContext = "";
    let brandReferenceImageUrls: string[] = [];
    const effectiveMode = brandId ? visualMode : "free";
    let activeStyleGuide: StyleGuide = DEFAULT_STYLE_GUIDE;

    // Apply niche-based defaults when no brand (better than generic purple)
    const nicheDefaults = getNicheDefaults(trend.theme);
    if (!brandId && nicheDefaults) {
      console.log(`[generate-content] No brand — using niche defaults for "${trend.theme}": ${nicheDefaults.fonts.headings}, ${nicheDefaults.palette[0].hex}`);
      brandTokens = {
        name: "",
        palette: nicheDefaults.palette,
        fonts: nicheDefaults.fonts,
        visual_tone: nicheDefaults.tone,
        logo_url: null,
        do_rules: null,
        dont_rules: null,
        image_style: "professional",
        example_descriptions: [],
        style_guide: null,
        style_guide_version: 0,
      };
    }
    let resolvedTemplateSetId: string | null = null;
    let templateSetName: string | null = null;
    let templateSetNotes: string[] = [];

    if (brandId && effectiveMode !== "free") {
      console.log(`[generate-content] Loading brand: ${brandId}, mode: ${effectiveMode}`);
      const { data: brand, error: brandError } = await supabase
        .from("brands")
        .select("name, palette, visual_tone, do_rules, dont_rules, fonts, logo_url, style_guide, style_guide_version, default_template_set_id")
        .eq("id", brandId)
        .single();

      if (brandError) {
        console.error("[generate-content] Brand error:", brandError);
      } else if (brand) {
        const { data: examples } = await supabase
          .from("brand_examples")
          .select("image_url, description, content_type, type, subtype")
          .eq("brand_id", brandId)
          .limit(8);
        brandTokens = buildBrandTokens(brand, examples || []);

        // Collect brand reference image URLs for multimodal context
        brandReferenceImageUrls = (examples || [])
          .filter((e: any) => e.image_url)
          .map((e: any) => e.image_url)
          .slice(0, 4);

        // ══════ HARD LOCK: Use ONLY the selected template set ══════
        const tsId = templateSetId || (brand as any).default_template_set_id;
        if (tsId) {
          console.log(`[generate-content] Loading template set: ${tsId} (source=${templateSetId ? 'selected' : 'default'})`);
          const { data: tsData, error: tsError } = await supabase
            .from("brand_template_sets")
            .select("template_set, name, visual_signature")
            .eq("id", tsId)
            .single();

          if (tsError) {
            console.error(`[generate-content] Template set load error:`, tsError);
          } else if (tsData?.template_set) {
            const ts = tsData.template_set as any;
            resolvedTemplateSetId = tsId;
            templateSetName = tsData.name;
            templateSetNotes = ts.notes || [];
            
            const visualSig = (tsData as any).visual_signature || ts.visual_signature || null;
            
            const formatConfig = ts.formats?.[contentType];
            
            activeStyleGuide = {
              style_preset: ts.style_preset || "clean_minimal",
              brand_tokens: {
                palette_roles: brand.style_guide?.brand_tokens?.palette_roles || {},
                typography: formatConfig?.typography || brand.style_guide?.brand_tokens?.typography || {},
                logo: formatConfig?.logo || brand.style_guide?.brand_tokens?.logo || {},
              },
              formats: ts.formats || {},
              visual_patterns: ts.visual_patterns || brand.style_guide?.visual_patterns || [],
              notes: ts.notes || [],
              confidence: ts.confidence || "high",
              visual_signature: visualSig,
              layout_params: ts.layout_params || null,
              templates_by_role: ts.templates_by_role || deriveTemplatesByRole(ts),
            } as any;

            console.log(`[generate-content] template_set_resolved=${tsId} name="${templateSetName}" source=${templateSetId ? 'selected' : 'default'} visual_signature=${JSON.stringify(visualSig)}`);
            console.log(`[generate-content] HARD-LOCK applied. Format config: recommended_templates=${formatConfig?.recommended_templates?.join(',')}, slide_roles=${formatConfig?.slide_roles?.join(',')}, background_style=${formatConfig?.layout_rules?.background_style}, card_style=${visualSig?.card_style}`);
          }
        } else if (brand.style_guide) {
          activeStyleGuide = brand.style_guide as StyleGuide;
          console.log(`[generate-content] No template set, using brand base style guide`);
        }

        brandContext = buildBrandContextBlock(brandTokens, activeStyleGuide);
        console.log(`[generate-content] Brand loaded: ${brandTokens.name}, ${brandTokens.palette.length} colors, mode=${effectiveMode}`);
      }
    }

    const isQuoteStyle = contentStyle === "quote";
    const styleConfig = stylePrompts[contentStyle] || stylePrompts.news;
    
    // ══════ RESOLVE SLIDE COUNT & CTA ══════
    const formatConfig = activeStyleGuide?.formats?.[contentType];
    const ctaPolicy = (formatConfig as any)?.cta_policy as string | undefined;
    
    // Quotes NEVER have CTA
    const effectiveIncludeCta = isQuoteStyle ? false : (ctaPolicy === "never" ? false : (ctaPolicy === "always" ? true : includeCta));
    
    const textLength = (trend.fullContent || "").length + (trend.description || "").length + (manualBriefing?.body || "").length + (manualBriefing?.notes || "").length;
    
    const contentSlideCount = resolveSlideCount(contentType, requestedSlideCount, formatConfig, contentStyle, textLength);
    const isMultiSlide = contentType === "carousel" || contentType === "document";
    const totalSlides = isMultiSlide && effectiveIncludeCta ? contentSlideCount + 1 : contentSlideCount;
    
    const textLimits = getTextLimits(activeStyleGuide, contentType, contentStyle);
    const templatePool = getTemplatesForFormat(activeStyleGuide, contentType, effectiveMode);
    const slideRoles = buildSlideRoles(contentType, totalSlides, formatConfig, effectiveIncludeCta, platform);

    console.log(`[generate-content] slide_count_resolved: content=${contentSlideCount}, cta=${effectiveIncludeCta ? 1 : 0}, total=${totalSlides}, roles=[${slideRoles.join(',')}]`);

    // ══════ SOURCE CONTEXT ══════
    const fullContent = trend.fullContent || "";
    let sourceBlock: string;

    if (isQuoteStyle) {
      // For quote style, the title IS the phrase — make this absolutely clear
      const userPhrase = trend.title;
      const parts: string[] = [
        `══════ FRASE DO USUÁRIO (USE LITERALMENTE) ══════`,
        `FRASE OBRIGATÓRIA: "${userPhrase}"`,
        ``,
        `INSTRUÇÃO: A headline do slide principal DEVE ser EXATAMENTE esta frase acima.`,
        `NÃO modifique, NÃO parafraseie, NÃO invente outra frase.`,
      ];
      if (manualBriefing?.notes) parts.push(`Contexto adicional: ${manualBriefing.notes}`);
      if (trend.description && trend.description !== userPhrase) parts.push(`Descrição: ${trend.description}`);
      parts.push(`══════ FIM ══════`);
      sourceBlock = parts.join("\n");
    } else if (fullContent) {
      sourceBlock = `══════ CONTEÚDO COMPLETO DA FONTE (use como base principal) ══════\n${fullContent.substring(0, 12000)}\n══════ FIM DO CONTEÚDO COMPLETO ══════`;
    } else if (manualBriefing && (manualBriefing.headline || manualBriefing.body || manualBriefing.notes)) {
      const parts: string[] = ["══════ BRIEFING MANUAL (use como base principal) ══════"];
      if (manualBriefing.headline) parts.push(`Headline sugerida: ${manualBriefing.headline}`);
      if (manualBriefing.body) parts.push(`Corpo/contexto: ${manualBriefing.body}`);
      if (manualBriefing.bullets && manualBriefing.bullets.length > 0) parts.push(`Pontos-chave:\n${manualBriefing.bullets.filter(Boolean).map(b => `  • ${b}`).join("\n")}`);
      if (manualBriefing.notes) parts.push(`Notas adicionais: ${manualBriefing.notes}`);
      parts.push("══════ FIM DO BRIEFING ══════");
      sourceBlock = parts.join("\n");
    } else {
      sourceBlock = `══════ TEMA SOLICITADO PELO USUÁRIO (PRIORIDADE MÁXIMA) ══════\nTema: ${trend.title}\nDescrição: ${trend.description || "Sem descrição detalhada disponível."}\n\nINSTRUÇÃO: O conteúdo DEVE ser sobre "${trend.title}". NÃO substitua pelo nicho do negócio. O nicho serve apenas para ajustar tom e público, NUNCA para mudar o assunto.\n══════ FIM ══════`;
    }

    // ══════ DEDUPLICATION BLOCK ══════
    let dedupBlock = "";
    if (recentTitles && recentTitles.length > 0) {
      dedupBlock = `\n══════ CONTEÚDOS JÁ CRIADOS (NÃO REPITA) ══════
O usuário já gerou conteúdos com estes títulos. Crie algo ORIGINAL e DIFERENTE:
${recentTitles.slice(0, 10).map((t: string, i: number) => `${i + 1}. ${t}`).join("\n")}
REGRA: O título e abordagem devem ser ÚNICOS. NÃO use frases, citações ou argumentos já usados.
══════ FIM ══════`;
    }

    // ══════ TEMPLATE SET ENFORCEMENT BLOCK ══════
    let templateSetEnforcementBlock = "";
    if (templateSetName && resolvedTemplateSetId) {
      const notesBlock = templateSetNotes.length > 0
        ? `NOTAS DE ESTILO (aplique rigorosamente):\n${templateSetNotes.map(n => `  • ${n}`).join("\n")}`
        : "";
      templateSetEnforcementBlock = `
══════ ESTILO SELECIONADO: "${templateSetName}" ══════
REGRAS OBRIGATÓRIAS: Use APENAS as regras deste estilo.
${notesBlock}
${formatConfig ? `CONFIGURAÇÃO DO FORMATO:\n${JSON.stringify(formatConfig, null, 2)}` : ""}
PROIBIDO: Usar elementos visuais, tom ou estrutura típicos de OUTROS estilos da marca.
Cada slide DEVE usar os templates definidos por este estilo. NÃO misture templates de estilos diferentes.
══════ FIM DO ESTILO ══════`;
    }

    // ══════ CTA INSTRUCTION ══════
    const ctaInstruction = effectiveIncludeCta
      ? `O último slide (slide ${totalSlides}) DEVE ser um CTA de engajamento com:
  - role: "cta"
  - headline: "Gostou do conteúdo?"
  - body: "Curta ❤️ Comente 💬 Compartilhe 🔄 Salve 📌"
  - template: "${(formatConfig as any)?.cta_templates?.[0] || (formatConfig as any)?.role_to_template?.closing || 'wave_closing'}"
  Este slide CTA é OBRIGATÓRIO e deve ser o ÚLTIMO slide.`
      : "NÃO inclua CTA final. O último slide deve ser um insight ou conclusão, NÃO um 'curta comente compartilhe'.";

    // ══════ QUOTE-SPECIFIC OVERRIDES ══════
    let quoteSpecificInstructions = "";
    if (isQuoteStyle) {
      quoteSpecificInstructions = `
══════ REGRAS ESPECIAIS PARA FRASE ══════
PRIORIDADE MÁXIMA: O headline do slide cover DEVE ser LITERALMENTE: "${trend.title}"
- NÃO crie uma frase diferente.
- NÃO resuma. NÃO parafraseie.
- O body do cover deve ser vazio ou conter apenas o nome do autor/assinatura.
- O title do JSON de resposta também deve ser a frase: "${trend.title}"
- O conteúdo deve ter tom reflexivo e inspiracional.
- SEM CTA. SEM "saiba mais". SEM "curta e compartilhe".
══════ FIM DAS REGRAS DE FRASE ══════`;
    }

    // ══════ PLATFORM-SPECIFIC CONFIG ══════
    const isLinkedIn = platform === "linkedin";
    const isLinkedInDocument = isLinkedIn && contentType === "document";
    const platformName = isLinkedIn ? "LinkedIn" : "Instagram";
    const platformRules = isLinkedIn
      ? (isLinkedInDocument
        ? `- PLATAFORMA: LinkedIn — DOCUMENTO PROFISSIONAL (PDF nativo para carrossel).
- Cada slide é uma PÁGINA profissional de apresentação/consultoria.
- Tom: thought leadership, consultivo, autoridade no assunto. Como um sócio de consultoria apresentando insights estratégicos.
- Cada slide deve ser autocontido mas fluir como uma narrativa argumentativa coesa.
- Estrutura narrativa: problema/contexto → dados e evidências → análise/insight → recomendações práticas → conclusão com CTA.
- Headlines: 40-80 chars, diretas e impactantes. Use dados quando disponíveis ("73% dos gestores...", "3 estratégias para...").
- Body: 150-400 chars por slide. Texto DENSO com informação real, análise profunda, nunca frases vagas.
- Bullets: 4-6 items substantivos de 60-100 chars. Cada bullet deve ter valor independente e ser acionável.
- Inclua um "key_stat" em slides de dados: um número/porcentagem proeminente que ancora o argumento.
- Inclua "slide_title" em cada slide: subtítulo curto (20-40 chars) que identifica o tema da página.
- Hashtags: use apenas 3-5 hashtags estratégicas na caption.
- Caption: 1500-3000 chars, estruturada como mini-artigo que convida a ver o documento.
- CTA: "Salve para consultar depois", "Compartilhe com sua equipe", "Comente sua experiência".
- ZERO emojis nos slides. Máx 2 na caption.
- Linguagem que demonstre expertise: cite tendências, dados de mercado, frameworks conhecidos.`
        : `- PLATAFORMA: LinkedIn — conteúdo profissional de alto engajamento.

REGRA CRÍTICA PARA SLIDES (imagem):
- headline: MÁXIMO 40 caracteres. Curto, direto, impactante.
- body: MÁXIMO 60 caracteres OU vazio. Uma frase curta no máximo.
- bullets: NÃO USE bullets nos slides. Toda informação detalhada vai na CAPTION.
- A imagem deve ser profissional e clean — o conteúdo denso fica na legenda.

REGRAS DE CAPTION LINKEDIN (PRIORIDADE MÁXIMA):
Os primeiros 210 caracteres são TUDO — é o que aparece antes do "ver mais". O hook DEVE ser irresistível.

HOOK (primeiras 1-2 linhas) — use UMA dessas fórmulas:
- Opinião contrária: "Opinião impopular: [afirmação ousada]."
- História pessoal: "Fui demitido numa terça. Melhor coisa que aconteceu."
- Estatística surpreendente: "92% das startups falham. Mas não pelo motivo que você pensa."
- Lista com promessa: "Entrevistei 200+ candidatos. Aqui estão 5 sinais de alerta."
- Afirmação bold: "Seu currículo não importa. O que importa é isto:"
- Antes/depois: "Há 3 anos não conseguia uma entrevista. Ontem recusei uma proposta."
- Pattern interrupt: "Pare. Antes de enviar aquele email, leia isto."

FORMATAÇÃO OBRIGATÓRIA:
- UMA frase por linha (nunca parágrafos densos)
- Linha em branco entre cada parágrafo
- Parágrafos curtos (1-2 frases no máximo)
- Use quebras de linha para criar ritmo e suspense
- Listas numeradas para dicas (escaneável, salvável)
- NUNCA escreva paredes de texto
- Escreva como fala — ZERO jargão corporativo ("leveraging synergies" = scroll imediato)

CTA (últimas 1-2 linhas) — SEMPRE termine com engajamento:
- Pergunta: "Qual o pior conselho de carreira que você já recebeu?"
- Concordância: "Concorda ou discorda?"
- Compartilhamento: "Reposte se isso ressoou ♻️"
- Save: "Salve para consultar depois 🔖"
- Experiência: "Já aconteceu com você?"

SINAIS DO ALGORITMO LINKEDIN:
- Dwell time (tempo de leitura) = MUITO ALTO impacto → posts longos que prendem
- Comentários = MUITO ALTO → faça perguntas, crie discussão
- Saves = ALTO → conteúdo acionável e referenciável
- "Ver mais" clicks = ALTO → hook forte que faz expandir
- Links externos = NEGATIVO → NUNCA coloque link na caption. Mencione "link nos comentários"
- NÃO edite o post na primeira hora após publicar

Hashtags: 3-5 no máximo, relevantes ao tema. Coloque no FINAL da caption.
Emojis: máx 1-2 por parágrafo. Use com moderação e propósito.
Tom: autoridade + autenticidade. 80% valor, 20% promoção.
Tamanho: 1500-3000 caracteres. Posts longos que prendem = mais dwell time.`)
      : contentType === "story"
        ? `- PLATAFORMA: Instagram STORY — formato vertical 9:16 (1080x1920).
- STORY = IMPACTO RÁPIDO. O usuário vê por 5-15 segundos.
- Headline: CURTO e PROVOCATIVO (máx 50 chars). Afirmação bold, não pergunta.
- Body: MÁXIMO 80 chars — 1 frase de impacto ou dado surpreendente.
- SEM bullets em story. Toda informação vai condensada em headline + body.
- Visual: design imersivo full-screen. O texto deve ser GRANDE e LEGÍVEL.
- Caption: 500-1000 chars, informal e direta. Hook forte + 1-2 insights + CTA.
- Hashtags: 5-10 relevantes.
- Emojis: use com propósito (máx 3 por slide).
- O story deve funcionar como "aperitivo" — gerar curiosidade pra ver mais.`
        : contentType === "carousel"
        ? `- PLATAFORMA: Instagram CARROSSEL — formato 1:1 (1080x1080), múltiplos slides.
- CARROSSEL = NARRATIVA PROGRESSIVA. Cada slide avança a história.
- Slide 1 (cover): HOOK irresistível que faz o usuário deslizar. Headline bold com DADO ESPECÍFICO.
  Exemplo: "73% dos devs vão mudar de stack em 2026" (NÃO "O futuro da tecnologia está mudando")
- Slides do meio (content/insight): CADA SLIDE = 1 PONTO com dado de suporte.
  Headlines curtos (30-50 chars). Body com informação DENSA (dados, exemplos, nomes).
  Bullets acionáveis (3-5 items, 40-80 chars cada).
- Slide final: conclusão forte OU CTA dependendo da config.
- CONSISTÊNCIA: todos os slides devem ter o MESMO tom e densidade de informação.
- Caption: 900-1600 chars. Gancho provocativo → 3 aprendizados práticos → CTA.
  Estrutura da caption: hook → contexto → insights numerados → recomendação → CTA.
- Hashtags: 8-15 relevantes e específicas do nicho.
- Emojis: com moderação (máx 2 por slide).`
        : `- PLATAFORMA: Instagram POST — formato 1:1 (1080x1080), 1 imagem única.
- POST = UMA IMAGEM QUE PARA O SCROLL. Deve ser autocontido e impactante.
- Headline: ASSERTIVO com dado específico (40-80 chars). Afirmação, NÃO pergunta genérica.
  BOM: "Alibaba cria chip de IA 3x mais rápido que concorrentes"
  RUIM: "O futuro da IA já chegou?"
- Body: 80-200 chars, informação DENSA com dado ou insight do artigo.
- Bullets: opcionais (3-4 items se o conteúdo for listável).
- Caption: 900-1600 chars. Hook provocativo → contexto do artigo → insights → CTA.
  Os primeiros 125 chars são o que aparece no feed — o hook DEVE ser irresistível.
- Hashtags: 8-15 relevantes e específicas.
- Emojis: com moderação (máx 3 no slide).
- O post deve demonstrar VALOR imediato — o usuário deve aprender algo só de olhar.`;

    // ══════ SYSTEM PROMPT ══════
    const systemPrompt = `Você é um especialista sênior em marketing digital e criação de conteúdo. Você cria conteúdos para ${platformName} que são criativos, informativos e PROFUNDAMENTE conectados com a fonte original.

${styleConfig.systemAddition}

REGRAS ABSOLUTAS:
- Linguagem: ${tone}. Público: ${targetAudience}.
- NUNCA invente dados, estatísticas ou números que não estejam na fonte. Se não houver dados numéricos, use linguagem qualitativa.
- Use ganchos criativos: pergunta provocativa, contraste, mini-história, analogia, mito vs verdade, checklist.
${platformRules}
- ${ctaInstruction}
- illustrationPrompt deve descrever APENAS backgrounds/ilustrações abstratas, NUNCA texto renderizado.
- NUNCA invente dados específicos, nomes técnicos ou informações que não estejam na fonte.
- O conteúdo deve demonstrar que você LEVE o artigo inteiro e extraiu os pontos mais relevantes.
${quoteSpecificInstructions}
${templateSetEnforcementBlock}
${brandContext}

REGRA CRÍTICA SOBRE MARCA vs TEMA:
A identidade visual da marca (cores, fontes, estilo) DEVE ser seguida.
Mas o ASSUNTO/TEMA do conteúdo é definido EXCLUSIVAMENTE pela fonte no user prompt.
Se a marca se chama "Frases" ou tem estilo de citações, isso NÃO significa que o conteúdo deve ser uma citação.
O nome da marca é apenas identidade visual — o TEMA vem da fonte fornecida pelo usuário.
NUNCA gere conteúdo genérico (frases motivacionais, citações) quando o usuário pediu um tema específico.`;

    // ══════ USER PROMPT ══════
    const formatLabel = isLinkedIn
      ? (contentType === "post" ? "post para LinkedIn (1 slide, 1200x627)" : contentType === "article" ? "artigo para LinkedIn (banner 1200x627 + texto longo)" : `documento profissional para LinkedIn com EXATAMENTE ${totalSlides} páginas (1080x1350 cada)`)
      : (contentType === "post" ? "post para feed (1 slide, 1080x1350)" : contentType === "story" ? "story (1 slide, 1080x1920)" : `carrossel com EXATAMENTE ${totalSlides} slides (1080x1350 cada)`);

    const slideRolesStr = (contentType === "carousel" || contentType === "document")
      ? (isLinkedInDocument
        ? `Cada página do documento TEM um papel (role): ${slideRoles.join(", ")}.\nEstrutura narrativa: problema → contexto → dados → insight → recomendações → conclusão.`
        : `Cada slide TEM um papel (role): ${slideRoles.join(", ")}.\nEstrutura: ${styleConfig.structure}`)
      : `1 slide com role "cover".`;

    const templatesByRole = (activeStyleGuide as any)?.templates_by_role as Record<string, string> | undefined;
    const roleToTemplate = templatesByRole || (formatConfig as any)?.role_to_template as Record<string, string> | undefined;
    const effectiveRoleToTemplate = roleToTemplate || deriveTemplatesByRole((activeStyleGuide as any));
    
    const templateAssignments = (contentType === "carousel" || contentType === "document")
      ? slideRoles.map((role, i) => {
          const tpl = effectiveRoleToTemplate[role] || effectiveRoleToTemplate["content"] || templatePool[Math.min(i, templatePool.length - 1)];
          return `Slide ${i + 1} (${role}): template="${tpl}"`;
        }).join("\n")
      : `Template: ${effectiveRoleToTemplate["cover"] || templatePool[0]}.`;

    // Quote-specific headline instruction in user prompt
    const headlineInstruction = isQuoteStyle 
      ? `- headline: DEVE SER LITERALMENTE "${trend.title}" (copie EXATAMENTE, sem alterações)`
      : `- headline: ${textLimits.headline[0]}-${textLimits.headline[1]} chars, gancho criativo`;

    const userPrompt = `Crie um ${formatLabel} do ${platformName}.
ESTILO: ${(contentStyle || "news").toUpperCase()}

${sourceBlock}
${dedupBlock}

Tema: ${trend.theme}
Palavras-chave: ${trend.keywords?.join(", ") || "não especificadas"}

${slideRolesStr}
${templateAssignments}

COMPRIMENTOS OBRIGATÓRIOS (respeite rigorosamente):
- caption: ${isLinkedIn ? "1500–3000" : (contentStyle === "quote" ? "250–500" : "900–1600")} caracteres${isLinkedInDocument ? " (mini-artigo que convida a ver o documento)" : ""}
  ${contentStyle !== "quote" ? "Estrutura da caption: gancho provocativo → contexto do artigo → 3 aprendizados práticos → 1 recomendação acionável → CTA leve" : "Caption reflexiva sem CTA."}
${headlineInstruction}
- body: ${isQuoteStyle ? "0-50 chars (vazio ou apenas atribuição/autor)" : isLinkedInDocument ? "150-400 chars, texto denso com análise profunda e dados reais da fonte" : `${textLimits.body[0]}-${Math.max(textLimits.body[1], 300)} chars, texto denso com informação real da fonte`}
- bullets: ${isQuoteStyle ? "não usar bullets para frases" : isLinkedInDocument ? "4–6 items de 60–100 chars cada (substantivos, acionáveis, com dados concretos)" : "3–5 items de 40–80 caracteres cada (acionáveis, específicos, com dados da fonte)"}
- speakerNotes: 2–3 frases (insight extra criativo, NÃO vai para arte)
- sourceSummary: ${isQuoteStyle ? "1-2 linhas contextualizando a frase" : "4–6 linhas resumindo a fonte original com os pontos-chave"}
- keyInsights: ${isQuoteStyle ? "2-3 reflexões conectadas à frase" : "3–5 insights PRÁTICOS extraídos da fonte (não genéricos)"}

QUALIDADE DO TEXTO (PRIORIDADE MÁXIMA):
${isQuoteStyle ? `- A headline do cover DEVE SER EXATAMENTE: "${trend.title}"
- O body deve ser vazio ou conter apenas assinatura/autor
- Tom reflexivo, inspiracional, profundo
- O title do JSON deve ser a própria frase` : `- Headlines DEVEM ser AFIRMAÇÕES ESPECÍFICAS com dados, NÃO perguntas genéricas.
  PROIBIDO: "O futuro da IA já chegou?", "Você sabia que a tecnologia está mudando?"
  OBRIGATÓRIO: "Alibaba lança chip de IA que processa 3x mais rápido", "73% dos devs mudarão de stack até 2027"
- Se o artigo tem NÚMEROS, PORCENTAGENS, VALORES, NOMES — USE-OS nos headlines e body.
- Body deve conter informação DENSA extraída da fonte. NUNCA frases vagas como "é importante considerar..." ou "cada vez mais empresas..."
- Bullets devem ser acionáveis e específicos: "Reduza o tempo de deploy em 40% com CI/CD" NÃO "Melhore seus processos"
- sourceSummary deve demonstrar que o artigo foi LIDO INTEIRAMENTE — cite pontos que só quem leu saberia
- keyInsights devem ser conclusões práticas e surpreendentes, NÃO obviedades
- PROIBIDO gerar conteúdo genérico que poderia ser sobre qualquer artigo. O conteúdo DEVE ser específico a ESTA fonte.
- image_headline: versão CURTA e IMPACTANTE do headline (6-10 palavras). Deve funcionar como chamada visual na imagem.`}

Retorne EXATAMENTE este JSON (sem markdown, sem backticks):
{
  "title": "${isQuoteStyle ? trend.title : 'título curto e chamativo (máx 60 chars)'}",
  "caption": "${hasBilingual ? `legenda BILÍNGUE. Estrutura obrigatória:
[Texto em português]

---

[${bilingualLang === 'en' ? 'Same text in English' : bilingualLang === 'es' ? 'Mismo texto en español' : 'Translation in ' + bilingualLang}]

${styleConfig.captionGuide}` : `legenda completa. ${styleConfig.captionGuide}`}",
  "hashtags": ["${isLinkedIn ? '3–5 hashtags estratégicas para LinkedIn' : '8–15 hashtags relevantes e específicas do nicho'}"],
  "sourceSummary": "${isQuoteStyle ? 'contexto breve da frase' : 'resumo de 4-6 linhas da fonte original com pontos-chave específicos'}",
  "keyInsights": ["insight 1", "insight 2", "insight 3"],
  "angle": "ângulo editorial escolhido",
  "audienceTakeaway": "valor concreto que o público leva",
  "slides": [
    {
      "role": "${slideRoles[0]}",
      "template": "${templatePool[0]}",
      "headline": "${isQuoteStyle ? trend.title : `${textLimits.headline[0]}-${textLimits.headline[1]} chars, gancho criativo`}",
      "image_headline": "${isQuoteStyle ? trend.title : '6-8 palavras no máximo — versão CURTA e IMPACTANTE do headline para usar como thumbnail visual na imagem. Deve capturar a essência em poucas palavras.'}",
      "body": "${isQuoteStyle ? '' : isLinkedInDocument ? '150-400 chars, análise profunda com dados' : `${textLimits.body[0]}-${textLimits.body[1]} chars, texto denso`}",
      "bullets": [${isQuoteStyle ? '' : '"opcional: items acionáveis para slides insight/context"'}],${isLinkedInDocument ? `
      "slide_title": "subtítulo curto 20-40 chars (identifica o tema da página)",
      "key_stat": "número/porcentagem proeminente (opcional, usado em slides data/insight)",` : ''}
      "speakerNotes": "2-3 frases com insight extra criativo",
      "illustrationPrompt": "${isQuoteStyle ? 'Abstract elegant background with soft gradient, emotional and clean aesthetic, no text, premium quality' : 'descrição em inglês de background abstrato SEM TEXTO'}"
    }
  ]
}

${(contentType === "carousel" || contentType === "document") ? (isLinkedInDocument ? `Crie EXATAMENTE ${totalSlides} páginas profissionais com roles: ${slideRoles.join(", ")}. Cada página deve ter slide_title e, quando relevante, key_stat.` : `Crie EXATAMENTE ${totalSlides} slides com roles: ${slideRoles.join(", ")}.`) : "Crie exatamente 1 slide."}`;

    console.log(`[generate-content] Generating ${contentStyle} ${contentType}, mode=${effectiveMode}${brandTokens ? `, brand=${brandTokens.name}` : ""}, slideCount=${totalSlides}, includeCta=${effectiveIncludeCta}, templateSet=${templateSetName || 'none'}, fullContent=${fullContent.length}chars...`);

    // ══════ CALL AI WITH RETRY ══════
    // Flash: fast (5-10s), good quality. Pro: slow (30-60s), slightly better.
    // Using Flash for speed — SaaS users expect fast responses.
    const aiModel = "google/gemini-2.5-flash";
    // Documents/carousels generate more JSON (5+ slides) — higher chance of truncation
    const maxRetries = effectiveMode === "text_only" ? 1 : (isMultiSlide ? 3 : 2);
    let content: string | null = null;
    let generated: any = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = attempt * 2000 + Math.random() * 1000;
        console.log(`[generate-content] Retry ${attempt}/${maxRetries - 1} after ${Math.round(delay)}ms...`);
        await new Promise(r => setTimeout(r, delay));
      }

      console.log(`[generate-content] calling AI model=${aiModel} attempt=${attempt + 1}/${maxRetries}`, Date.now() - t0, "ms");

      const abortCtrl = new AbortController();
      // 30s timeout — must complete within Lovable's ~50s CPU limit (including retry + DB ops)
      const aiTimeout = 30000;
      const abortTimer = setTimeout(() => abortCtrl.abort(), aiTimeout);

      let response: Response;
      try {
        const aiPromise = aiGatewayFetch({
          model: aiModel,
          messages: [
            { role: "system", content: systemPrompt },
            brandReferenceImageUrls.length > 0
              ? {
                  role: "user",
                  content: [
                    { type: "text", text: userPrompt },
                    ...brandReferenceImageUrls.map((url: string) => ({
                      type: "image_url",
                      image_url: { url },
                    })),
                    { type: "text", text: "\n\nAs imagens acima são referências visuais da marca. Use-as para entender o estilo visual e gerar conteúdo que siga essa identidade. O illustrationPrompt de cada slide DEVE descrever backgrounds que repliquem esse estilo." },
                  ],
                }
              : { role: "user", content: userPrompt },
          ],
        });
        const timeoutPromise = new Promise<never>((_, reject) => {
          abortCtrl.signal.addEventListener("abort", () => reject(Object.assign(new Error("AbortError"), { name: "AbortError" })));
        });
        response = await Promise.race([aiPromise, timeoutPromise]);
        clearTimeout(abortTimer);
      } catch (err: any) {
        clearTimeout(abortTimer);
        if (err.name === "AbortError") {
          console.error(`[generate-content] AI timeout after 30s, attempt`, attempt + 1);
          if (attempt < maxRetries - 1) continue;
          throw new Error("AI timeout after 30s");
        }
        throw err;
      }

      console.log(`[generate-content] AI responded status=${response.status}`, Date.now() - t0, "ms");

      if (!response.ok) {
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (response.status === 402) {
          return new Response(JSON.stringify({ error: "Payment required. Please add credits." }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const errorText = await response.text();
        if (response.status === 502 || response.status === 503) {
          console.warn(`[generate-content] Transient error ${response.status}, retrying...`);
          continue;
        }
        console.error("[generate-content] AI error:", response.status, errorText);
        throw new Error(`AI gateway error: ${response.status}`);
      }

      const data = await response.json();
      content = data.choices?.[0]?.message?.content;
      if (!content) {
        console.warn(`[generate-content] Empty AI response on attempt ${attempt + 1}, retrying...`);
        continue;
      }

      // Try to parse JSON immediately — if malformed, retry instead of failing
      const cleaned = (content || "")
        .replace(/```json\n?/gi, "")
        .replace(/```\n?/gi, "")
        .trim();

      try {
        const directMatch = cleaned.match(/\{[\s\S]*\}/);
        if (!directMatch) throw new Error("No JSON object found");
        generated = JSON.parse(directMatch[0]);
        break; // success — exit retry loop
      } catch (_e) {
        // Try repair: close unclosed brackets/braces and truncated strings
        const jsonMatch = cleaned.match(/(\{[\s\S]*\})/m);
        if (jsonMatch) {
          try {
            let repairAttempt = jsonMatch[1];
            // Fix truncated strings: find last unclosed quote and close it
            const quoteCount = (repairAttempt.match(/"/g) || []).length;
            if (quoteCount % 2 !== 0) repairAttempt += '"';
            const opens = (repairAttempt.match(/\{/g) || []).length;
            const closes = (repairAttempt.match(/\}/g) || []).length;
            const arrOpens = (repairAttempt.match(/\[/g) || []).length;
            const arrCloses = (repairAttempt.match(/\]/g) || []).length;
            repairAttempt += "]".repeat(Math.max(0, arrOpens - arrCloses));
            repairAttempt += "}".repeat(Math.max(0, opens - closes));
            generated = JSON.parse(repairAttempt);
            console.log("[generate-content] JSON repaired successfully");
            break; // repaired — exit retry loop
          } catch (_e2) {
            // Repair failed — retry if we have attempts left
            console.warn(`[generate-content] JSON malformed on attempt ${attempt + 1}, will retry. Preview: ${cleaned.substring(0, 200)}`);
            content = null; // reset so next iteration generates fresh
            continue;
          }
        } else {
          console.warn(`[generate-content] No JSON found on attempt ${attempt + 1}, will retry.`);
          content = null;
          continue;
        }
      }
    }

    if (!generated) throw new Error("Failed to generate valid JSON after retries");

    // ══════ POST-PROCESS SLIDES ══════
    let processedSlides = (generated.slides || []).map((slide: any, i: number) => {
      const role = slide.role || slideRoles[i] || (i === 0 ? "cover" : i === (generated.slides.length - 1) ? "closing" : "insight");
      
      let template: string;
      if (effectiveMode === "free" || effectiveMode === "text_only") {
        template = "generic_free";
      } else {
        template = effectiveRoleToTemplate[role] || effectiveRoleToTemplate["content"] || slide.template || templatePool[Math.min(i, templatePool.length - 1)];
      }

      // For quote style, force the user's phrase as headline on cover
      let headline = slide.headline || "";
      if (isQuoteStyle && i === 0) {
        headline = trend.title; // Force the user's exact phrase
      }

      return {
        role,
        template,
        headline,
        body: slide.body || "",
        bullets: slide.bullets || [],
        speakerNotes: slide.speakerNotes || "",
        illustrationPrompt: slide.illustrationPrompt || slide.imagePrompt || "",
        imagePrompt: slide.illustrationPrompt || slide.imagePrompt || "",
        templateHint: template,
      };
    });

    // ══════ ENFORCE CTA SLIDE ══════
    if (contentType === "carousel" && effectiveIncludeCta) {
      const ctaTemplate = effectiveRoleToTemplate["cta"] || effectiveRoleToTemplate["closing"] || "wave_closing";
      const ctaSlide = {
        role: "cta",
        template: ctaTemplate,
        templateHint: ctaTemplate,
        headline: "Gostou do conteúdo?",
        body: "Curta ❤️ Comente 💬 Compartilhe 🔄 Salve 📌",
        bullets: [],
        speakerNotes: "",
        illustrationPrompt: "",
        imagePrompt: "",
      };
      
      while (processedSlides.length > 1 && (processedSlides[processedSlides.length - 1].role === "cta" || processedSlides[processedSlides.length - 1].role === "closing")) {
        processedSlides.pop();
      }
      processedSlides.push(ctaSlide);
      console.log(`[generate-content] CTA slide appended at position ${processedSlides.length}, template=${ctaTemplate}, total=${processedSlides.length}`);
    }
    
    if (contentType === "carousel" && !effectiveIncludeCta) {
      processedSlides = processedSlides.filter((s: any) => s.role !== "cta");
      console.log(`[generate-content] CTA removed (toggle OFF), total=${processedSlides.length}`);
    }

    if (contentType === "carousel" && processedSlides.length !== totalSlides) {
      console.log(`[generate-content] Slide count mismatch: got ${processedSlides.length}, expected ${totalSlides}. Adjusting...`);
      if (processedSlides.length > totalSlides) {
        processedSlides = processedSlides.slice(0, totalSlides);
      }
    }

    // ══════ IMAGE GENERATION ══════
    const bgStyle = getBackgroundStyle(activeStyleGuide, contentType);
    const shouldGenerateImages = !["brand_strict", "text_only"].includes(effectiveMode) && bgStyle === "image";

    if (shouldGenerateImages) {
      console.log(`[generate-content] Generating background images for ${processedSlides.length} slides (mode=${effectiveMode}, bgStyle=${bgStyle})...`);
      for (let i = 0; i < processedSlides.length; i++) {
        const slide = processedSlides[i];
        const prompt = buildImagePromptForSlide(slide.illustrationPrompt, brandTokens, effectiveMode);
        if (!prompt) continue;

        try {
          const imgResponse = await aiGatewayFetch({
            model: "google/gemini-2.5-flash-image",
            messages: [{ role: "user", content: prompt }],
            modalities: ["image", "text"],
          });

          if (imgResponse.ok) {
            const imgData = await imgResponse.json();
            const imageUrl = imgData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
            if (imageUrl) {
              processedSlides[i].previewImage = imageUrl;
              processedSlides[i].image_url = imageUrl;
              console.log(`[generate-content] Background image generated for slide ${i + 1}`);
            }
          } else {
            console.error(`[generate-content] Image generation failed for slide ${i + 1}: ${imgResponse.status}`);
          }
        } catch (imgError) {
          console.error(`[generate-content] Image error slide ${i + 1}:`, imgError);
        }
      }
    } else {
      console.log(`[generate-content] Skipping AI image generation: mode=${effectiveMode}, bgStyle=${bgStyle}. Templates handle layout.`);
    }

    // ══════ RESPONSE ══════
    const generationMetadata = {
      text_model: "google/gemini-2.5-flash",
      text_generation_ms: Date.now() - t0,
      slide_count: processedSlides.length,
      content_style: contentStyle,
      visual_mode: effectiveMode,
      template_set_name: templateSetName || null,
      template_set_id: resolvedTemplateSetId || null,
      bg_style: bgStyle,
      include_cta: effectiveIncludeCta,
      generated_at: new Date().toISOString(),
    };

    // Clean markdown artifacts from caption (asterisks, headers, etc.)
    const cleanCaption = (text: string) => text
      .replace(/\*\*(.*?)\*\*/g, '$1')   // **bold** → bold
      .replace(/\*(.*?)\*/g, '$1')        // *italic* → italic
      .replace(/#{1,6}\s/g, '')           // # headers → remove
      .replace(/^\s*[-*+]\s/gm, '• ')    // markdown lists → bullet •
      .trim();

    if (generated.caption) {
      generated.caption = cleanCaption(generated.caption);
    }

    // For quote style, force the title to be the user's phrase
    const resultTitle = isQuoteStyle ? trend.title : (generated.title || trend.title);

    const result = {
      title: resultTitle,
      caption: generated.caption || "",
      hashtags: generated.hashtags || [],
      sourceSummary: generated.sourceSummary || "",
      keyInsights: generated.keyInsights || [],
      angle: generated.angle || "",
      audienceTakeaway: generated.audienceTakeaway || "",
      slides: processedSlides,
      contentType,
      contentStyle,
      visualMode: effectiveMode,
      platform: platform || "instagram",
      trendTitle: trend.title,
      brandId: brandId || null,
      templateSetId: resolvedTemplateSetId,
      templateSetName: templateSetName,
      slideCount: totalSlides,
      includeCta: effectiveIncludeCta,
      generationMetadata,
      brandSnapshot: brandTokens ? {
        name: brandTokens.name,
        palette: brandTokens.palette,
        fonts: brandTokens.fonts,
        visual_tone: brandTokens.visual_tone,
        logo_url: brandTokens.logo_url,
        style_guide: activeStyleGuide,
        visual_signature: (activeStyleGuide as any)?.visual_signature || null,
        layout_params: (activeStyleGuide as any)?.layout_params || null,
        style_guide_version: brandTokens.style_guide_version,
      } : null,
    };

    console.log(`[generate-content] SUCCESS in ${Date.now()-t0}ms: brandId=${brandId || 'null'}, templateSet="${templateSetName || 'none'}" (${resolvedTemplateSetId || 'null'}), palette=${brandTokens?.palette?.length ?? 0}, mode=${effectiveMode}, slides=${processedSlides.length}, includeCta=${effectiveIncludeCta}, bgStyle=${bgStyle}`);

    return new Response(JSON.stringify({ success: true, content: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[generate-content] error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Unknown error"
    }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
