/**
 * SMOKE TESTS — sanitizeConvo (histórico Anthropic do /agent)
 *
 * Garante que uma conversa que morreu no meio (turno órfão) NÃO trava as mensagens
 * seguintes com 400 da Anthropic. Foi o bug que travou o /agent do Maikon:
 * carrossel morreu sem `done` → user órfão no localStorage → 4x "Tive um problema".
 *
 * Run: npm test
 */

import { describe, it, expect } from "vitest";
import { sanitizeConvo } from "@/pages/AgentChat";

const roles = (m: any[]) => m.map((x) => x.role).join(",");

describe("sanitizeConvo — histórico saudável passa intacto", () => {
  it("conversa completa (user/assistant alternados) fica igual", () => {
    const convo = [
      { role: "user", content: "oi" },
      { role: "assistant", content: "olá!" },
      { role: "user", content: "faz um post" },
      { role: "assistant", content: "pronto, aqui está" },
    ];
    const out = sanitizeConvo(convo);
    expect(roles(out)).toBe("user,assistant,user,assistant");
    expect(out).toHaveLength(4);
  });

  it("array vazio continua vazio", () => {
    expect(sanitizeConvo([])).toEqual([]);
  });
});

describe("sanitizeConvo — cura conversas envenenadas (o caso Maikon)", () => {
  it("dois user seguidos (turno órfão) → termina em assistant, sem user duplo", () => {
    // Exatamente o estado que gerava 400: turno morreu, user ficou órfão, veio outro user.
    const convo = [
      { role: "user", content: "faz um carrossel" },
      { role: "assistant", content: "vou criar o carrossel" },
      { role: "user", content: "pergunta órfã (turno morreu)" }, // sem resposta
    ];
    const out = sanitizeConvo(convo);
    // O último user órfão é removido → conversa termina limpa no assistant.
    expect(roles(out)).toBe("user,assistant");
    expect(out[out.length - 1].role).toBe("assistant");
  });

  it("vários user órfãos empilhados são mesclados e podados", () => {
    const convo = [
      { role: "user", content: "a" },
      { role: "user", content: "b" },
      { role: "user", content: "c" },
    ];
    // Tudo é user consecutivo → mescla em 1 → poda o trailing user → vazio (nada válido sobra).
    const out = sanitizeConvo(convo);
    expect(out).toEqual([]);
  });

  it("assistant com tool_use PENDENTE (sem tool_result) é removido do fim", () => {
    const convo = [
      { role: "user", content: "publica isso" },
      { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "publicar", input: {} }] },
    ];
    // tool_use sem tool_result = turno incompleto → remove → sobra só user → poda user → vazio.
    const out = sanitizeConvo(convo);
    expect(out).toEqual([]);
  });

  it("mantém o histórico bom e só descarta a cauda incompleta", () => {
    const convo = [
      { role: "user", content: "oi" },
      { role: "assistant", content: "olá" },
      { role: "user", content: "faz um post" },
      { role: "assistant", content: "feito!" },
      { role: "user", content: "e um carrossel?" }, // turno que morreu (órfão)
    ];
    const out = sanitizeConvo(convo);
    expect(roles(out)).toBe("user,assistant,user,assistant");
    expect(out[out.length - 1].content).toBe("feito!");
  });
});

describe("sanitizeConvo — invariantes da API Anthropic", () => {
  it("nunca começa com assistant (1º turno tem que ser user)", () => {
    const convo = [
      { role: "assistant", content: "resposta sem pergunta" },
      { role: "user", content: "oi" },
      { role: "assistant", content: "olá" },
    ];
    const out = sanitizeConvo(convo);
    expect(out[0].role).toBe("user");
  });

  it("nunca deixa dois turnos do mesmo papel seguidos", () => {
    const convo = [
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
      { role: "assistant", content: "c (duplicado)" },
      { role: "user", content: "d" },
      { role: "assistant", content: "e" },
    ];
    const out = sanitizeConvo(convo);
    for (let i = 1; i < out.length; i++) {
      expect(out[i].role).not.toBe(out[i - 1].role);
    }
  });

  it("ignora entradas inválidas (role desconhecido / null)", () => {
    const convo = [
      { role: "user", content: "oi" },
      null,
      { role: "system", content: "lixo" },
      { role: "assistant", content: "olá" },
    ];
    const out = sanitizeConvo(convo as any);
    expect(roles(out)).toBe("user,assistant");
  });
});
