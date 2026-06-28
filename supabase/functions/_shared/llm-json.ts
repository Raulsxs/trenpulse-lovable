// ── Shared helper: parsing seguro de JSON emitido por LLM ──
//
// Motivação (P0/P1): modelos de reasoning (minimax-m-25, etc.) frequentemente emitem
// texto/raciocínio ANTES e DEPOIS do JSON (ex.: "Vou pensar... do.\n{...}\nPronto.").
// O regex guloso /\{[\s\S]*\}/ usado em ~8 call sites pega demais quando há chaves ({})
// no texto ao redor → JSON.parse quebra. Pior: em alguns call sites, quando o parse falha,
// o código usa o texto CRU do modelo como legenda — e o raciocínio acaba publicado.
//
// `extractJsonObject` rastreia profundidade de chaves (string/escape-aware) e pega
// EXATAMENTE o primeiro objeto JSON completo, ignorando o ruído ao redor.
// `parseLlmJson` faz extract + JSON.parse e retorna null em qualquer falha — NUNCA o raw.

// Extrai o primeiro objeto JSON balanceado de um texto.
// Comportamento idêntico ao extractJsonObject de ai-chat/index.ts (~linha 202).
// Tolera markdown fences (```json ... ```).
export function extractJsonObject(raw: string): string | null {
  if (!raw) return null;
  const t = raw.replace(/```json\s*|\s*```/gi, "");
  const start = t.indexOf("{");
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return t.slice(start, i + 1); }
  }
  return null;
}

// Extrai o objeto JSON via extractJsonObject e faz JSON.parse com try/catch.
// Retorna null em qualquer falha (sem objeto, JSON inválido). NUNCA retorna o texto cru.
// Use isto em vez do regex guloso /\{[\s\S]*\}/ em todos os call sites.
export function parseLlmJson<T = any>(raw: string): T | null {
  const extracted = extractJsonObject(raw);
  if (extracted === null) return null;
  try {
    return JSON.parse(extracted) as T;
  } catch {
    return null;
  }
}
