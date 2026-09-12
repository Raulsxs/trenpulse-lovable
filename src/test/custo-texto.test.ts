/**
 * SMOKE TESTS — as duas defesas de custo de texto (Fase 1).
 *
 * Contexto medido em produção (11/08–10/09/2026, 464 chamadas): texto virou 95% do custo do produto,
 * US$ 12,64 de US$ 13,28. Duas causas, testadas aqui:
 *
 *  1. `comCache` — o prompt inteiro era reenviado a cada volta do loop de ferramentas, sem cache.
 *  2. `consumidorSumiu` — aba fechada era lida como falha de provedor, e a chain inteira era
 *     percorrida (Haiku 15 + Gemini 12 + Qwen 10 = as 37 falhas da janela) mais o backstop.
 *
 * Run: npm test
 */
import { describe, it, expect } from "vitest";
import { comCache, consumidorSumiu, modeloEfetivo } from "../../supabase/functions/_shared/openrouter";

const SYS_GRANDE = "Você é o agente do TrendPulse. ".repeat(200); // > 4000 chars
const corpo = (msgs: any[]) => ({ messages: msgs, max_tokens: 2048 });

/** Percorre o corpo e devolve todos os blocos que carregam cache_control. */
function marcados(body: any): any[] {
  const achados: any[] = [];
  for (const m of body.messages) {
    if (Array.isArray(m.content)) {
      for (const p of m.content) if (p?.cache_control) achados.push({ role: m.role, part: p });
    }
  }
  return achados;
}

describe("comCache", () => {
  it("não marca nada em modelo que não cobra cache — o campo só existiria para ser ignorado", () => {
    const b = corpo([{ role: "system", content: SYS_GRANDE }, { role: "user", content: "oi" }]);
    for (const modelo of ["google/gemini-2.5-flash", "qwen/qwen3.5-flash-02-23", "openai/gpt-5-mini"]) {
      const out = comCache(b, modelo);
      expect(marcados(out), modelo).toHaveLength(0);
      expect(out).toBe(b); // devolve o mesmo objeto, sem cópia à toa
    }
  });

  it("marca o system, que é o breakpoint que leva as 25 ferramentas junto", () => {
    // A Anthropic monta o prefixo na ordem ferramentas → system → mensagens. Um breakpoint no system
    // cacheia tudo que vem antes dele: os ~4.900 tokens de schema entram de graça. É a razão de o
    // breakpoint estar aqui e não em outro lugar.
    const out = comCache(corpo([{ role: "system", content: SYS_GRANDE }, { role: "user", content: "oi" }]), "anthropic/claude-haiku-4.5");
    const m = marcados(out);
    expect(m.some((x) => x.role === "system")).toBe(true);
    expect(m[0].part.text).toBe(SYS_GRANDE);
  });

  it("system curto não gasta breakpoint — abaixo do mínimo a Anthropic não cacheia mesmo", () => {
    const out = comCache(corpo([{ role: "system", content: "seja breve" }, { role: "user", content: "oi" }]), "anthropic/claude-haiku-4.5");
    expect(marcados(out).some((x) => x.role === "system")).toBe(false);
  });

  it("o segundo breakpoint rola para o fim do histórico a cada rodada", () => {
    // É o que faz a rodada N+1 LER o que a rodada N pagou. Sem isso o histórico — a parte que cresce
    // — seria repaga inteira em todas as 8 voltas do loop.
    const historico = [
      { role: "system", content: SYS_GRANDE },
      { role: "user", content: "cria 3 posts" },
      { role: "assistant", content: "vou gerar" },
      { role: "user", content: "pode ir" },
    ];
    const out = comCache(corpo(historico), "anthropic/claude-haiku-4.5");
    const m = marcados(out);
    expect(m).toHaveLength(2);                       // limite da Anthropic é 4; usamos 2
    expect(m[1].role).toBe("user");
    expect(m[1].part.text).toBe("pode ir");          // a ÚLTIMA, não a primeira
  });

  it("não marca role tool — o OpenRouter traduz isso para tool_result e parts não é formato garantido", () => {
    const out = comCache(corpo([
      { role: "system", content: SYS_GRANDE },
      { role: "assistant", content: "chamando" },
      { role: "tool", tool_call_id: "t1", content: "resultado da ferramenta" },
    ]), "anthropic/claude-haiku-4.5");
    const m = marcados(out);
    expect(m.some((x) => x.role === "tool")).toBe(false);
    expect(m[1].role).toBe("assistant");             // pula a tool e marca a anterior
    // e a mensagem tool segue string, intocada
    expect(out.messages[2].content).toBe("resultado da ferramenta");
  });

  it("não muta o corpo original — a chain reusa baseBody entre modelos", () => {
    const original = corpo([{ role: "system", content: SYS_GRANDE }, { role: "user", content: "oi" }]);
    const copia = JSON.parse(JSON.stringify(original));
    comCache(original, "anthropic/claude-haiku-4.5");
    expect(original).toEqual(copia);
  });

  it("preserva content em partes, marcando só a última", () => {
    const out = comCache(corpo([
      { role: "system", content: SYS_GRANDE },
      { role: "user", content: [{ type: "text", text: "olha essa" }, { type: "image_url", image_url: { url: "https://x/y.png" } }] },
    ]), "anthropic/claude-haiku-4.5");
    const partes = out.messages[1].content;
    expect(partes).toHaveLength(2);
    expect(partes[0].cache_control).toBeUndefined();
    expect(partes[1].cache_control).toEqual({ type: "ephemeral" });
    expect(partes[1].image_url.url).toBe("https://x/y.png"); // não perdeu o payload
  });
});

describe("consumidorSumiu", () => {
  it("reconhece o erro real que apareceu nas 37 falhas", () => {
    expect(consumidorSumiu("The stream controller cannot close or enqueue")).toBe(true);
  });

  it("reconhece as variantes de stream morto", () => {
    expect(consumidorSumiu("ReadableStream is already closed")).toBe(true);
    expect(consumidorSumiu("readablestream is locked")).toBe(true);
    expect(consumidorSumiu("Invalid state: Controller is already closed")).toBe(true);
  });

  it("NÃO confunde com falha de provedor — essas devem seguir para o próximo modelo", () => {
    for (const msg of [
      "OpenRouter anthropic/claude-haiku-4.5 HTTP 429: rate limited",
      "OpenRouter HTTP 502: bad gateway",
      "The operation was aborted due to timeout",
      "error sending request for url: connection reset",
      "OPENROUTER_API_KEY ausente",
    ]) {
      expect(consumidorSumiu(msg), msg).toBe(false);
    }
  });
});

describe("modeloEfetivo — preço tem que seguir o modelo que roda", () => {
  it("gpt-image-2 em vertical vira nano-banana: era aqui que o story dava prejuízo", () => {
    // O usuário escolhia GPT-Image 2 e pagava img_gpt (10 créditos = R$ 1,00), mas a peça saía no
    // Nano Banana Pro (US$ 0,1384 = R$ 0,75). Com o texto junto, R$ 1,15 de custo. −R$ 0,15.
    expect(modeloEfetivo("gpt-image-2", "9:16")).toBe("nano-banana");
    expect(modeloEfetivo("gpt-image-2", "4:5")).toBe("nano-banana");
  });

  it("em 1:1 o gpt-image-2 é honrado — a proporção é nativa, não há motivo para trocar", () => {
    expect(modeloEfetivo("gpt-image-2", "1:1")).toBe("gpt-image-2");
    expect(modeloEfetivo("gpt-image-2", "3:2")).toBe("gpt-image-2");
    expect(modeloEfetivo("gpt-image-2", "2:3")).toBe("gpt-image-2");
  });

  it("proporção desconhecida cai em 1:1, e aí não reroteia", () => {
    expect(modeloEfetivo("gpt-image-2", "banana")).toBe("gpt-image-2");
    expect(modeloEfetivo("gpt-image-2", "")).toBe("gpt-image-2");
  });

  it("nenhum outro modelo é re-roteado — todos entregam vertical nativamente", () => {
    for (const m of ["nano-banana", "seedream", "flux", "imagen-fast", "qwen", "recraft"]) {
      expect(modeloEfetivo(m, "9:16"), m).toBe(m);
      expect(modeloEfetivo(m, "1:1"), m).toBe(m);
    }
  });

  it("sem modelo escolhido devolve undefined — o preço cai no padrão do formato", () => {
    expect(modeloEfetivo(undefined, "9:16")).toBeUndefined();
    expect(modeloEfetivo(null, "1:1")).toBeUndefined();
  });
});
