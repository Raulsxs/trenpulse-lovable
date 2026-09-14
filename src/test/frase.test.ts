/**
 * SMOKE TESTS — a frase do usuário chega intacta na imagem.
 *
 * Bug medido (2026-09-14): pedido "…e a frase: Pequenos passos levam a grandes conquistas" virou, na
 * imagem, "Pequenos passos transformam vidas grandes" + "Pontos principais". O tema chegou ao ai-chat
 * sem a palavra "frase" e caiu no gerador de manchete.
 *
 * Run: npm test
 */
import { describe, it, expect } from "vitest";
import { temaDeFrase, extrairFraseLiteral, ultimoTextoDoUsuario } from "../../supabase/functions/_shared/frase";

// Mesmo detector e extrator que o ai-chat usa (supabase/functions/ai-chat/index.ts).
const detectaCitacao = (msg: string) => /\b(frase|citação|citacao|quote)\b/i.test(msg);
const extratorDoAiChat = (msg: string) =>
  msg.match(/(?:frase[:\s]+|com\s+a\s+frase[:\s]+|imagem\s+com\s+a\s+frase[:\s]+)(.+)/i)?.[1]
    ?.replace(/^["'"']|["'"']$/g, "").trim();

describe("temaDeFrase", () => {
  const PEDIDO = "Crie uma imagem com a minha foto pessoal de fundo e a frase: Pequenos passos levam a grandes conquistas";

  it("o caso real: tema sem a palavra frase vira citação com o texto DO USUÁRIO", () => {
    const tema = temaDeFrase(PEDIDO, "Pequenos passos levam a grandes conquistas");
    expect(tema).toBe("frase: Pequenos passos levam a grandes conquistas");
    expect(detectaCitacao(tema)).toBe(true);
    expect(extratorDoAiChat(tema)).toBe("Pequenos passos levam a grandes conquistas");
  });

  it("se o modelo parafrasear, a fala do usuário vence", () => {
    expect(temaDeFrase(PEDIDO, "Pequenos passos, grandes conquistas"))
      .toBe("frase: Pequenos passos levam a grandes conquistas");
  });

  it("tira aspas envolventes e mantém o autor", () => {
    const pedido = 'Crie uma imagem com a frase: “A imaginação é mais importante que o conhecimento.” — Albert Einstein';
    expect(extrairFraseLiteral(pedido)).toBe("A imaginação é mais importante que o conhecimento.” — Albert Einstein");
    expect(extrairFraseLiteral('frase: "Seja constante"')).toBe("Seja constante");
  });

  it("tema já marcado (ex.: vindo do MCP) passa como está", () => {
    expect(temaDeFrase(undefined, "frase: Seja constante")).toBe("frase: Seja constante");
  });

  it("pedido que não é frase não muda nada — não pode sequestrar post comum", () => {
    expect(temaDeFrase("Crie um post sobre prevenção de infarto", "prevenção de infarto")).toBe("prevenção de infarto");
    expect(temaDeFrase("uma frase curta sobre o que você faz", "o que faço")).toBe("o que faço");
    expect(temaDeFrase(null, "tema")).toBe("tema");
  });
});

describe("ultimoTextoDoUsuario", () => {
  it("pega o último turno do usuário, em string ou blocos", () => {
    expect(ultimoTextoDoUsuario([
      { role: "user", content: "primeiro" },
      { role: "assistant", content: "ok" },
      { role: "user", content: [{ type: "text", text: "frase: Seja constante" }, { type: "image", source: {} }] },
    ])).toBe("frase: Seja constante");
  });

  it("pula turno que só tem tool_result", () => {
    expect(ultimoTextoDoUsuario([
      { role: "user", content: "e a frase: Vai dar certo" },
      { role: "assistant", content: [{ type: "tool_use" }] },
      { role: "user", content: [{ type: "tool_result", content: "ok" }] },
    ])).toBe("e a frase: Vai dar certo");
  });

  it("entrada inválida vira string vazia", () => {
    expect(ultimoTextoDoUsuario(undefined)).toBe("");
    expect(ultimoTextoDoUsuario([])).toBe("");
  });
});
