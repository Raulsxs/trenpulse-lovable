/**
 * SMOKE TESTS — tradução Anthropic ↔ OpenAI do cliente OpenRouter (T01).
 *
 * A parte mais delicada da capacidade: mapear o loop de tool-calling entre os dois formatos.
 * Se errar, o agente entra em loop ou perde contexto. Testa as funções PURAS (sem chamar a API).
 *
 * Run: npm test
 */
import { describe, it, expect } from "vitest";
import { toOpenAITools, toOpenAIMessages, fromOpenAIResponse } from "../../supabase/functions/_shared/openrouter";

describe("toOpenAITools", () => {
  it("converte tool Anthropic → function OpenAI", () => {
    const out = toOpenAITools([{ name: "gerar_post", description: "cria post", input_schema: { type: "object", properties: { tema: { type: "string" } }, required: ["tema"] } }]);
    expect(out).toEqual([{ type: "function", function: { name: "gerar_post", description: "cria post", parameters: { type: "object", properties: { tema: { type: "string" } }, required: ["tema"] } } }]);
  });
  it("sem tools → undefined", () => {
    expect(toOpenAITools(undefined)).toBeUndefined();
    expect(toOpenAITools([])).toBeUndefined();
  });
});

describe("toOpenAIMessages — loop de tool-calling", () => {
  it("system + user string", () => {
    const out = toOpenAIMessages("sys", [{ role: "user", content: "oi" }]);
    expect(out).toEqual([{ role: "system", content: "sys" }, { role: "user", content: "oi" }]);
  });

  it("assistant com tool_use → tool_calls", () => {
    const out = toOpenAIMessages("", [
      { role: "assistant", content: [{ type: "text", text: "vou criar" }, { type: "tool_use", id: "t1", name: "gerar_post", input: { tema: "sono" } }] },
    ]);
    expect(out[0].role).toBe("assistant");
    expect(out[0].content).toBe("vou criar");
    expect(out[0].tool_calls).toEqual([{ id: "t1", type: "function", function: { name: "gerar_post", arguments: JSON.stringify({ tema: "sono" }) } }]);
  });

  it("user com tool_result → mensagem role:tool com tool_call_id", () => {
    const out = toOpenAIMessages("", [
      { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "Post gerado (content_id=abc)" }] },
    ]);
    expect(out).toEqual([{ role: "tool", tool_call_id: "t1", content: "Post gerado (content_id=abc)" }]);
  });

  it("loop completo (user → assistant+tool → tool_result → assistant) traduz alternando certo", () => {
    const out = toOpenAIMessages("sys", [
      { role: "user", content: "faz um post sobre sono" },
      { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "gerar_post", input: { tema: "sono" } }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "ok content_id=abc" }] },
      { role: "assistant", content: [{ type: "text", text: "Pronto!" }] },
    ]);
    expect(out.map((m: any) => m.role)).toEqual(["system", "user", "assistant", "tool", "assistant"]);
    expect(out[2].tool_calls[0].id).toBe("t1");
    expect(out[3].tool_call_id).toBe("t1");
  });

  it("user com imagem → content parts image_url", () => {
    const out = toOpenAIMessages("", [
      { role: "user", content: [{ type: "text", text: "veja" }, { type: "image", source: { type: "url", url: "https://x/y.png" } }] },
    ]);
    expect(Array.isArray(out[0].content)).toBe(true);
    expect(out[0].content).toContainEqual({ type: "image_url", image_url: { url: "https://x/y.png" } });
  });
});

describe("fromOpenAIResponse", () => {
  it("texto simples → bloco text, stop end_turn", () => {
    const r = fromOpenAIResponse({ message: { content: "olá!" }, finish_reason: "stop" });
    expect(r.content).toEqual([{ type: "text", text: "olá!" }]);
    expect(r.stop_reason).toBe("end_turn");
  });

  it("tool_calls → bloco tool_use, stop tool_use, arguments parseado", () => {
    const r = fromOpenAIResponse({ message: { content: null, tool_calls: [{ id: "c1", function: { name: "gerar_post", arguments: '{"tema":"sono"}' } }] }, finish_reason: "tool_calls" });
    expect(r.stop_reason).toBe("tool_use");
    const tu = r.content.find((b: any) => b.type === "tool_use") as any;
    expect(tu.name).toBe("gerar_post");
    expect(tu.input).toEqual({ tema: "sono" });
    expect(tu.id).toBe("c1");
  });

  it("arguments inválido não quebra → input {}", () => {
    const r = fromOpenAIResponse({ message: { tool_calls: [{ id: "c1", function: { name: "x", arguments: "{quebrado" } }] }, finish_reason: "tool_calls" });
    const tu = r.content.find((b: any) => b.type === "tool_use") as any;
    expect(tu.input).toEqual({});
  });

  it("texto + tool_call juntos → ambos os blocos", () => {
    const r = fromOpenAIResponse({ message: { content: "vou criar", tool_calls: [{ id: "c1", function: { name: "gerar_post", arguments: "{}" } }] }, finish_reason: "tool_calls" });
    expect(r.content.some((b: any) => b.type === "text")).toBe(true);
    expect(r.content.some((b: any) => b.type === "tool_use")).toBe(true);
  });
});
