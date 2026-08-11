// brand-context.ts — serializador único da identidade de marca para o prompt de geração.
//
// PROBLEMA QUE RESOLVE (achado P0 da auditoria): a coluna `brands.style_guide`
// (JSON rico gerado por gemini-2.5-pro em analyze-brand-examples) era SALVA e
// NUNCA lida na geração. Os três handlers (GENERATE / GENERATE_CAROUSEL / EDIT)
// montavam o brandContext por copy-paste, só com campos legados, e o EDIT ainda
// era mais pobre (perdia custom_notes). Aqui centralizamos TUDO num bloco
// prescritivo único, enriquecendo com o style_guide quando ele existe.
//
// Tolerância: `brand` pode vir sem style_guide (ou parcial). A função degrada
// graciosamente para o grounding legado sem quebrar.

// ── Schema relevante do style_guide (espelha analyze-brand-examples/index.ts) ──
// {
//   brand_tokens: {
//     palette_roles: { primary, secondary, accent, background, text_primary, text_secondary },
//     typography: { headline_weight, body_weight, uppercase_headlines, headline_alignment, body_alignment },
//     logo: { preferred_position, watermark_opacity, size_hint }
//   },
//   formats: {
//     post|story|carousel: { ..., text_limits: { headline_chars:[min,max], body_chars:[min,max], bullets_max } }
//   },
//   visual_patterns: string[],
//   do_summary: string[],
//   dont_summary: string[]
// }

type Hex = string;

/** Normaliza uma paleta que pode vir como string[] ou {hex}[] para hex[] válido. */
function paletteToHexes(palette: unknown): Hex[] {
  if (!Array.isArray(palette)) return [];
  return palette
    .map((c) => (typeof c === "string" ? c : (c && typeof c === "object" ? (c as any).hex : null)))
    .filter((c): c is string => typeof c === "string" && c.trim().length > 0);
}

/** Junta uma lista de strings num bullet block, ignorando vazios. */
function bullets(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter((s) => s.length > 0);
}

/**
 * Constrói o bloco de contexto de marca (pt-BR) pronto pra concatenar no prompt
 * de geração de imagem. Inclui campos legados sempre; enriquece com style_guide
 * quando presente. Não inclui text_limits aqui (uso de validação — ver
 * `brandTextLimits`). Campos vazios não poluem a saída.
 */
export function buildBrandContext(brand: any): string {
  if (!brand) return "";

  const parts: string[] = [];
  const sg = brand.style_guide && typeof brand.style_guide === "object" ? brand.style_guide : null;
  const tokens = sg?.brand_tokens && typeof sg.brand_tokens === "object" ? sg.brand_tokens : null;

  // ── Identidade base ──
  if (brand.name) parts.push(`Marca: ${brand.name}`);

  // ── Paleta: papéis de cor do style_guide quando houver; senão paleta legada ──
  const roles = tokens?.palette_roles && typeof tokens.palette_roles === "object" ? tokens.palette_roles : null;
  if (roles) {
    const roleLines: string[] = [];
    const map: Array<[string, string]> = [
      ["primary", "primária"],
      ["secondary", "secundária"],
      ["accent", "destaque"],
      ["background", "fundo"],
      ["text_primary", "texto principal"],
      ["text_secondary", "texto secundário"],
    ];
    for (const [key, label] of map) {
      const v = roles[key];
      if (typeof v === "string" && v.trim()) roleLines.push(`${label}=${v.trim()}`);
    }
    if (roleLines.length) parts.push(`Papéis de cor: ${roleLines.join(", ")}`);
  } else {
    const colors = paletteToHexes(brand.palette);
    if (colors.length) parts.push(`Cores: ${colors.join(", ")}`);
  }

  // ── Fontes ──
  // A fonte que a IA RECONHECEU nas referências ganha da que está no formulário: `Inter/Inter` é o
  // default de criação da marca e 20 das 22 marcas nunca saíram dele, então mandar isso como fato
  // instruía o modelo a desenhar uma tipografia que a marca não usa. O que veio das imagens é
  // evidência; o que veio do formulário pode ser só o default que ninguém tocou.
  const detectadas = (tokens as any)?.detected_fonts;
  const fonts = brand.fonts && typeof brand.fonts === "object" ? (brand.fonts as any) : null;
  const headings = detectadas?.headings || fonts?.headings;
  const body = detectadas?.body || fonts?.body;
  if (headings || body) {
    parts.push(`Fontes: títulos=${headings || body}, corpo=${body || headings}`);
  }

  // ── Tipografia prescritiva do style_guide (peso/caixa/alinhamento) ──
  const typo = tokens?.typography && typeof tokens.typography === "object" ? tokens.typography : null;
  if (typo) {
    const tLines: string[] = [];
    if (typeof typo.headline_weight === "number") tLines.push(`peso do título ${typo.headline_weight}`);
    if (typeof typo.body_weight === "number") tLines.push(`peso do corpo ${typo.body_weight}`);
    if (typeof typo.uppercase_headlines === "boolean") {
      tLines.push(typo.uppercase_headlines ? "títulos em CAIXA ALTA" : "títulos em caixa normal");
    }
    if (typeof typo.headline_alignment === "string" && typo.headline_alignment.trim()) {
      tLines.push(`título alinhado à ${typo.headline_alignment.trim()}`);
    }
    if (typeof typo.body_alignment === "string" && typo.body_alignment.trim()) {
      tLines.push(`corpo alinhado à ${typo.body_alignment.trim()}`);
    }
    if (tLines.length) parts.push(`Tipografia: ${tLines.join(", ")}`);
  }

  // ── Logo (style_guide) ──
  const logo = tokens?.logo && typeof tokens.logo === "object" ? tokens.logo : null;
  if (logo && typeof logo.preferred_position === "string" && logo.preferred_position.trim()) {
    const extra: string[] = [];
    if (typeof logo.size_hint === "string" && logo.size_hint.trim()) extra.push(`tamanho ${logo.size_hint.trim()}`);
    if (typeof logo.watermark_opacity === "number") extra.push(`opacidade ${logo.watermark_opacity}`);
    const suffix = extra.length ? ` (${extra.join(", ")})` : "";
    parts.push(`Posição do logo: ${logo.preferred_position.trim()}${suffix}`);
  } else if (brand.logo_url) {
    parts.push(`Logo: ${brand.logo_url}`);
  }

  // ── Tom visual (legado) ──
  if (brand.visual_tone) parts.push(`Tom visual: ${brand.visual_tone}`);

  // ── FAÇA / NÃO FAÇA: preferir do_summary/dont_summary do style_guide quando houver ──
  const doSummary = bullets(sg?.do_summary);
  const dontSummary = bullets(sg?.dont_summary);
  if (doSummary.length) {
    parts.push(`FAÇA:\n${doSummary.map((s) => `- ${s}`).join("\n")}`);
  } else if (brand.do_rules) {
    parts.push(`FAÇA: ${brand.do_rules}`);
  }
  if (dontSummary.length) {
    parts.push(`NÃO FAÇA:\n${dontSummary.map((s) => `- ${s}`).join("\n")}`);
  } else if (brand.dont_rules) {
    parts.push(`NÃO FAÇA: ${brand.dont_rules}`);
  }

  // ── Padrões visuais observados (style_guide) — como diretrizes de composição ──
  const patterns = bullets(sg?.visual_patterns);
  if (patterns.length) {
    parts.push(`Padrões visuais a seguir:\n${patterns.map((s) => `- ${s}`).join("\n")}`);
  }

  // ── Nota visual custom (legado) — SEMPRE incluir (o EDIT antigo perdia isto) ──
  const prefs = brand.visual_preferences && typeof brand.visual_preferences === "object"
    ? (brand.visual_preferences as any)
    : null;
  if (prefs?.custom_notes) parts.push(`Nota visual: ${prefs.custom_notes}`);

  return parts.join("\n");
}

/**
 * Resumo ENXUTO da marca para o RACIOCÍNIO do agente (ai-agent), NÃO para o prompt de imagem.
 * O agente não desenha — então paleta/tipografia/posição de logo são ruído aqui. Ele precisa só do
 * que molda TEXTO e CONVERSA: nome, tom, FAÇA/NÃO FAÇA e nota visual. Assim o agente escreve legenda,
 * sugere ângulo e fala no tom da marca ativa (o VISUAL já é aplicado pelo app na geração).
 * Prefere os *_summary do style_guide; cai pros campos legados quando não houver. Retorna "" sem marca.
 */
export function buildBrandBrief(brand: any): string {
  if (!brand) return "";
  const sg = brand.style_guide && typeof brand.style_guide === "object" ? brand.style_guide : null;

  const ident: string[] = [];
  if (brand.name) ident.push(`nome "${brand.name}"`);
  if (brand.visual_tone) ident.push(`tom ${brand.visual_tone}`);

  const doList = (bullets(sg?.do_summary).length ? bullets(sg?.do_summary) : (brand.do_rules ? [String(brand.do_rules)] : []));
  const dontList = (bullets(sg?.dont_summary).length ? bullets(sg?.dont_summary) : (brand.dont_rules ? [String(brand.dont_rules)] : []));

  let out = `MARCA ATIVA selecionada${ident.length ? ` — ${ident.join(", ")}` : ""}. O app já aplica o VISUAL dela na geração automaticamente; use o tom e as regras abaixo ao escrever legenda, sugerir ângulo e conversar (NÃO passe brandId nas ferramentas).`;
  if (doList.length) out += `\nFAÇA: ${doList.slice(0, 5).join("; ")}`;
  if (dontList.length) out += `\nNÃO FAÇA: ${dontList.slice(0, 5).join("; ")}`;
  const prefs = brand.visual_preferences && typeof brand.visual_preferences === "object" ? brand.visual_preferences : null;
  if (prefs?.custom_notes) out += `\nNota: ${String(prefs.custom_notes).slice(0, 200)}`;
  return out;
}

/**
 * Lê os limites de texto (headline/body) do style_guide para um formato dado.
 * Usado pela VALIDAÇÃO de texto gerado, não pelo prompt de imagem.
 *
 * `format` aceita as chaves de style_guide.formats: "post" | "story" | "carousel".
 * Os limites no JSON vêm como faixa [min, max]; aqui retornamos o MÁXIMO
 * (limite superior de caracteres), que é o que a validação precisa.
 * Retorna null se não houver style_guide / formato / limites.
 */
export function brandTextLimits(
  brand: any,
  format: string,
): { headline?: number; body?: number } | null {
  const sg = brand?.style_guide;
  if (!sg || typeof sg !== "object") return null;
  const formats = sg.formats;
  if (!formats || typeof formats !== "object") return null;
  const fmt = formats[format];
  if (!fmt || typeof fmt !== "object") return null;
  const limits = fmt.text_limits;
  if (!limits || typeof limits !== "object") return null;

  // text_limits.headline_chars / body_chars vêm como [min, max].
  const upper = (range: unknown): number | undefined => {
    if (Array.isArray(range) && range.length >= 2 && typeof range[1] === "number") return range[1];
    if (typeof range === "number") return range;
    return undefined;
  };

  const headline = upper(limits.headline_chars);
  const body = upper(limits.body_chars);

  if (headline === undefined && body === undefined) return null;

  const out: { headline?: number; body?: number } = {};
  if (headline !== undefined) out.headline = headline;
  if (body !== undefined) out.body = body;
  return out;
}
