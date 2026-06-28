// content-validators.ts
//
// Enforcement determinístico pós-geração do output do LLM.
//
// Por quê: a camada de geração só valida a SINTAXE do JSON que o modelo
// devolve (parse OK, campos presentes). As regras semânticas — "exatamente N
// slides", "hashtag começa com #", "tweet <= 280 chars" — vivem APENAS no
// prompt. Quando o modelo desobedece (slide a mais, hashtag sem #, legenda
// estourando o limite), passa direto. Estas funções aplicam essas regras de
// forma determinística DEPOIS da geração, antes de salvar/publicar.
//
// Todas são funções puras: sem I/O, sem dependências externas, sem mutar os
// argumentos. Fáceis de testar isoladamente.

/**
 * Corta o array de slides ao número desejado, preservando a ordem.
 *
 * Se `desired` for <= 0, NaN ou não inteiro, retorna os slides como estão
 * (não temos um alvo válido pra impor — melhor não destruir conteúdo).
 * Se `desired` >= slides.length, retorna como está (nada a cortar).
 *
 * Não muta o array de entrada.
 */
export function clampSlides<T>(slides: T[], desired: number): T[] {
  if (!Array.isArray(slides)) return slides;
  // desired inválido => no-op (não temos alvo confiável)
  if (!Number.isFinite(desired) || !Number.isInteger(desired) || desired <= 0) {
    return slides;
  }
  if (desired >= slides.length) return slides;
  return slides.slice(0, desired);
}

/**
 * Normaliza uma lista de hashtags:
 *  - remove entradas vazias / só-espaço
 *  - garante exatamente um prefixo "#" (colapsa "##tag" e "tag" -> "#tag")
 *  - remove duplicatas case-insensitive (mantém a primeira ocorrência)
 *  - preserva a ordem original
 *
 * Espaços internos viram nada (uma hashtag não tem espaço): "  #foo bar " -> "#foobar".
 * `undefined`/não-array => [].
 */
export function normalizeHashtags(tags: string[] | undefined): string[] {
  if (!Array.isArray(tags)) return [];

  const result: string[] = [];
  const seen = new Set<string>();

  for (const raw of tags) {
    if (typeof raw !== "string") continue;

    // remove todos os espaços/quebras e os '#' à esquerda, depois reaplica um único '#'
    const stripped = raw.replace(/\s+/g, "").replace(/^#+/, "");
    if (stripped.length === 0) continue;

    const tag = "#" + stripped;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(tag);
  }

  return result;
}

/**
 * Garante que um texto de tweet não exceda `max` caracteres (default 280).
 *
 * Se exceder, trunca preservando palavras: corta no último espaço antes do
 * limite, evitando cortar no meio de uma palavra. Se não houver espaço dentro
 * do limite (uma única palavra gigante), faz um corte duro em `max` — mas
 * NUNCA passa de `max`.
 *
 * `max` inválido (<=0 / NaN) => retorna o texto como está (sem limite a impor).
 * Remove espaço em branco nas pontas do resultado truncado.
 */
export function enforceTweetLimit(text: string, max = 280): string {
  if (typeof text !== "string") return text;
  if (!Number.isFinite(max) || max <= 0) return text;
  if (text.length <= max) return text;

  const slice = text.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");

  // há um espaço no meio do slice => corta nele (preserva palavra inteira)
  if (lastSpace > 0) {
    return slice.slice(0, lastSpace).trimEnd();
  }

  // palavra única maior que o limite => corte duro (garante <= max)
  return slice.trimEnd();
}

/**
 * Trunca um texto a um limite opcional de caracteres, preferindo cortar num
 * espaço pra não partir palavras.
 *
 * No-op se `max` for ausente, NaN ou <= 0 (sem limite a impor).
 * Se o texto couber, retorna como está. Caso contrário corta no último espaço
 * antes do limite; se não houver espaço, faz corte duro em `max`.
 * Resultado truncado tem o espaço das pontas removido.
 */
export function truncateToChars(text: string, max?: number): string {
  if (typeof text !== "string") return text;
  if (max === undefined || !Number.isFinite(max) || max <= 0) return text;
  if (text.length <= max) return text;

  const slice = text.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");

  if (lastSpace > 0) {
    return slice.slice(0, lastSpace).trimEnd();
  }

  return slice.trimEnd();
}
