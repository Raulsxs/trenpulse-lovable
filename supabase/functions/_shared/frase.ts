/**
 * Frase literal — garante que uma CITAÇÃO chega intacta na imagem.
 *
 * POR QUE EXISTE (medido em 2026-09-14, atalho "Frase"): o usuário pediu "…e a frase: Pequenos passos
 * levam a grandes conquistas". O agente repassou o texto certo como `tema`, mas SEM a palavra "frase"
 * — e o ai-chat só entra no caminho de citação quando o texto tem essa palavra. Sem ela, o tema foi
 * para o gerador de manchete, e a imagem saiu com "Pequenos passos transformam vidas grandes" e uma
 * lista de "Pontos principais" embaixo. Para citação de autor, isso é inaceitável.
 *
 * A saída NÃO depende do modelo obedecer a uma regra de prompt: quando a fala do usuário traz
 * "frase:", o texto dele — e não o que o modelo escreveu — vira `frase: <texto>`, que o ai-chat
 * reconhece deterministicamente.
 *
 * Puro de propósito (sem Deno, sem rede): testado em src/test/frase.test.ts.
 */

/** Último texto escrito pelo usuário numa lista de mensagens no formato do agente. */
export function ultimoTextoDoUsuario(messages: unknown): string {
  if (!Array.isArray(messages)) return "";
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as { role?: string; content?: unknown };
    if (m?.role !== "user") continue;
    if (typeof m.content === "string") return m.content;
    if (Array.isArray(m.content)) {
      // Turno só de tool_result não é fala do usuário — segue procurando.
      const texto = m.content
        .filter((b: any) => b?.type === "text" && typeof b.text === "string")
        .map((b: any) => b.text)
        .join("\n")
        .trim();
      if (texto) return texto;
    }
  }
  return "";
}

const ASPAS = /^["'“”‘’«»]+|["'“”‘’«»]+$/g;

/** O texto depois de "frase:", sem aspas envolventes. `null` se o pedido não marca uma frase. */
export function extrairFraseLiteral(texto: string | null | undefined): string | null {
  const m = /\bfrase\s*:\s*([\s\S]+)$/i.exec(String(texto || ""));
  if (!m) return null;
  const frase = m[1].trim().replace(ASPAS, "").trim();
  return frase || null;
}

/**
 * Tema a mandar para o ai-chat. A fala do usuário com "frase:" manda; um tema que já vem marcado
 * (ex.: chamado pelo MCP com "frase: …") passa como está; o resto não muda.
 */
export function temaDeFrase(userText: string | null | undefined, tema: string): string {
  const t = String(tema || "").trim();
  if (/^frase\s*:/i.test(t)) return t;
  const literal = extrairFraseLiteral(userText);
  return literal ? `frase: ${literal}` : t;
}
