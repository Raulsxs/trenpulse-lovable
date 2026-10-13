/**
 * Legenda que a pessoa escreve é a legenda que vai ao ar.
 *
 * Caso que motiva estes testes (2026-10-13): o CMO da Pulse trocou a imagem da peça #14, agendada para
 * 14/10 às 09:00 no LinkedIn, e precisava da MESMA legenda. Pelo MCP não havia como gravar um texto:
 * gerar_post escreve legenda nova e editar_legenda pede à IA para reescrever. Investigando, apareceu um
 * defeito maior: toda edição de legenda (app, chat, IA) gravava só `caption`, e o publicador manda a
 * variante da rede (`platform_captions`) quando ela existe. A pessoa via o texto novo na tela e o
 * LinkedIn recebia o antigo.
 *
 * Run: npm test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { dispatchTool, estimateToolCost, AGENT_TOOLS, type ToolCtx } from "../../supabase/functions/_shared/agent-tools";
import { legendaQueSai, patchDeLegenda, redesDaPeca, legendaAcimaDoLimite } from "../../supabase/functions/_shared/publicacao";

const ID = "9f0c2d4e-1111-4000-8000-000000000014";
const AGORA = "2026-10-13T14:00:00Z";
const ORIGINAL = "Exceção documentada não é processo.\n\nQuando o desvio vira rotina, o processo quebrou.\n\n#Processos #Operações";

/**
 * Cliente falso que respeita select, eq e neq, e APLICA o update nas linhas: o teste lê de volta o que
 * ficou gravado, como o publicador leria.
 */
function clienteFalso(tabelas: Record<string, any[]>) {
  const atualizacoes: any[] = [];
  const rpcs: any[] = [];
  const from = (tabela: string) => {
    let filtradas = [...(tabelas[tabela] || [])];
    let colunas: string[] | null = null;
    let patch: any = null;
    const projeta = (l: any) => (colunas ? Object.fromEntries(colunas.map((c) => [c, l[c]])) : l);
    const q: any = {
      select: (cols: string) => { colunas = cols.split(",").map((c) => c.trim()); return q; },
      update: (p: any) => { patch = p; return q; },
      eq: (col: string, v: any) => { filtradas = filtradas.filter((l) => l[col] === v); return q; },
      neq: (col: string, v: any) => { filtradas = filtradas.filter((l) => l[col] !== v); return q; },
      order: () => q, limit: () => q,
      maybeSingle: async () => ({ data: filtradas[0] ? projeta(filtradas[0]) : null, error: null }),
      then: (ok: any, ko: any) => {
        if (patch) {
          atualizacoes.push(patch);
          for (const l of filtradas) Object.assign(l, patch);
        }
        return Promise.resolve({ data: filtradas.map(projeta), error: null }).then(ok, ko);
      },
    };
    return q;
  };
  return { from, rpc: async (...a: any[]) => { rpcs.push(a); return { error: null }; }, atualizacoes, rpcs };
}

function pecaAgendada(extra: Record<string, unknown> = {}) {
  return {
    id: ID,
    title: "Quando a exceção vira o processo",
    status: "scheduled",
    published_at: null,
    platform: "linkedin",
    scheduled_at: "2026-10-14T12:00:00Z",
    scheduled_accounts: { platforms: ["linkedin"], accountIds: ["spc_pagina"] },
    image_urls: ["https://x.supabase.co/storage/v1/object/public/content-images/sem-logo.png"],
    caption: "Exceções documentadas revelam processos quebrados.",
    hashtags: ["#Gestão"],
    platform_captions: { linkedin: "Exceções documentadas revelam processos quebrados... (variante gerada)", instagram: "variante insta" },
    generation_metadata: { prompt: "tema da peça" },
    publish_attempts: 0,
    ...extra,
  };
}

function contexto(pecas: any[], outras: Record<string, any[]> = {}) {
  const userClient = clienteFalso({ generated_contents: pecas, ...outras });
  const ctx: ToolCtx = { supabaseUrl: "https://x.supabase.co", anonKey: "anon", userAuthHeader: "Bearer jwt", userClient, anthropicKey: "k", userId: "u1" };
  return { ctx, userClient };
}

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(AGORA)); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("definir_legenda — grava o texto exato, e só ele", () => {
  it("o que vai ao ar no LinkedIn é exatamente o texto enviado, não a variante gerada", async () => {
    const peca = pecaAgendada();
    const { ctx } = contexto([peca]);
    const r = await dispatchTool(ctx, "definir_legenda", { contentId: ID, legenda: ORIGINAL });
    expect(r.ok).toBe(true);
    expect(r.content).toMatch(/^Legenda gravada \(content_id=/);
    expect(legendaQueSai(peca, "linkedin")).toBe(ORIGINAL);
    // vale para qualquer rede para onde a peça for, não só a de criação
    expect(legendaQueSai(peca, "instagram")).toBe(ORIGINAL);
  });

  it("imagem, status, data, conta e tentativas não mudam", async () => {
    const peca = pecaAgendada();
    const antes = JSON.parse(JSON.stringify(peca));
    const { ctx, userClient } = contexto([peca]);
    await dispatchTool(ctx, "definir_legenda", { contentId: ID, legenda: ORIGINAL });
    const [patch] = userClient.atualizacoes;
    expect(Object.keys(patch).sort()).toEqual(["caption", "generation_metadata", "hashtags", "platform_captions"]);
    for (const campo of ["image_urls", "status", "scheduled_at", "scheduled_accounts", "platform", "publish_attempts"]) {
      expect((peca as any)[campo], campo).toEqual(antes[campo]);
    }
  });

  it("não usa IA nem cobra crédito", async () => {
    const fetchEspiao = vi.fn();
    vi.stubGlobal("fetch", fetchEspiao);
    const { ctx, userClient } = contexto([pecaAgendada()]);
    await dispatchTool(ctx, "definir_legenda", { contentId: ID, legenda: ORIGINAL });
    expect(fetchEspiao).not.toHaveBeenCalled();
    expect(userClient.rpcs).toEqual([]);
    expect(estimateToolCost("definir_legenda", {})).toBe(0);
  });

  it("guarda a legenda que ia ao ar antes, para dar para conferir ou voltar", async () => {
    const peca = pecaAgendada();
    const { ctx } = contexto([peca]);
    await dispatchTool(ctx, "definir_legenda", { contentId: ID, legenda: ORIGINAL });
    const gm = peca.generation_metadata as any;
    expect(gm.prompt).toBe("tema da peça");
    expect(gm.legenda_anterior.texto).toBe("Exceções documentadas revelam processos quebrados... (variante gerada)");
    expect(gm.legenda_anterior.por).toBe("definir_legenda");
    expect(gm.legenda_anterior.trocada_em).toBe(new Date(AGORA).toISOString());
  });

  it("diz para quando continua agendada, em horário de Brasília", async () => {
    const { ctx } = contexto([pecaAgendada()]);
    const r = await dispatchTool(ctx, "definir_legenda", { contentId: ID, legenda: ORIGINAL });
    expect(r.content).toContain("2026-10-14T09:00:00-03:00");
    expect(r.content).toContain("linkedin");
  });

  it("peça já publicada é recusada sem gravar", async () => {
    const { ctx, userClient } = contexto([pecaAgendada({ status: "published", published_at: "2026-10-12T12:00:00Z" })]);
    const r = await dispatchTool(ctx, "definir_legenda", { contentId: ID, legenda: ORIGINAL });
    expect(r.ok).toBe(false);
    expect(r.content).toMatch(/já foi publicado/);
    expect(userClient.atualizacoes).toEqual([]);
  });

  it("peça sendo publicada agora é recusada sem gravar", async () => {
    const { ctx, userClient } = contexto([pecaAgendada({ status: "publishing" })]);
    const r = await dispatchTool(ctx, "definir_legenda", { contentId: ID, legenda: ORIGINAL });
    expect(r.ok).toBe(false);
    expect(r.content).toMatch(/sendo publicado/);
    expect(userClient.atualizacoes).toEqual([]);
  });

  it("id inexistente ou de outra conta (RLS esconde) é recusado, dizendo que nada foi gravado", async () => {
    const { ctx } = contexto([pecaAgendada()]);
    const r = await dispatchTool(ctx, "definir_legenda", { contentId: "00000000-0000-4000-8000-000000000000", legenda: ORIGINAL });
    expect(r.ok).toBe(false);
    expect(r.content).toMatch(/Nada foi gravado/);
  });

  it("se o update não grava nenhuma linha, não diz que gravou", async () => {
    const peca = pecaAgendada();
    const { ctx } = contexto([peca]);
    // O agendador pega a peça entre a leitura e a gravação: o filtro do update não casa mais.
    const fromOriginal = ctx.userClient.from;
    let leituras = 0;
    ctx.userClient.from = (t: string) => {
      const q = fromOriginal(t);
      const updateOriginal = q.update;
      q.update = (p: any) => { peca.status = "publishing"; return updateOriginal(p); };
      leituras++;
      return q;
    };
    const r = await dispatchTool(ctx, "definir_legenda", { contentId: ID, legenda: ORIGINAL });
    expect(leituras).toBe(2);
    expect(r.ok).toBe(false);
    expect(r.content).not.toMatch(/Legenda gravada/);
    expect(peca.caption).not.toBe(ORIGINAL);
  });

  it("legenda vazia ou sem content_id é recusada", async () => {
    const { ctx, userClient } = contexto([pecaAgendada()]);
    expect((await dispatchTool(ctx, "definir_legenda", { contentId: ID, legenda: "   \n " })).ok).toBe(false);
    expect((await dispatchTool(ctx, "definir_legenda", { legenda: ORIGINAL })).ok).toBe(false);
    expect(userClient.atualizacoes).toEqual([]);
  });

  it("legenda maior do que a rede aceita é recusada na hora, não às 09:00 do dia", async () => {
    const { ctx, userClient } = contexto([pecaAgendada({ platform: "x", scheduled_accounts: { platforms: ["x"], accountIds: ["spc_x"] } })]);
    const r = await dispatchTool(ctx, "definir_legenda", { contentId: ID, legenda: "a".repeat(281) });
    expect(r.ok).toBe(false);
    expect(r.content).toMatch(/281 caracteres/);
    expect(r.content).toMatch(/x aceita 280/);
    expect(userClient.atualizacoes).toEqual([]);
  });

  it("quebras de linha, emojis e espaços chegam intactos", async () => {
    const texto = "  Linha 1 🚀\n\n\tLinha 2 — com travessão  \n#Tag ";
    const peca = pecaAgendada();
    const { ctx } = contexto([peca]);
    await dispatchTool(ctx, "definir_legenda", { contentId: ID, legenda: texto });
    expect(peca.caption).toBe(texto);
    expect(peca.hashtags).toBeNull();
  });

  it("o schema exige content_id e legenda", () => {
    const t = AGENT_TOOLS.find((x) => x.name === "definir_legenda")!;
    expect((t.input_schema as any).required.sort()).toEqual(["contentId", "legenda"]);
  });
});

describe("editar_legenda — a legenda reescrita é a que sai, não a variante antiga", () => {
  it("apaga as variantes por rede junto com a legenda nova", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      content: [{ type: "text", text: JSON.stringify({ caption: "Legenda reescrita pela IA.", hashtags: ["#Nova"] }) }],
    }), { status: 200 })));
    const peca = pecaAgendada();
    const { ctx } = contexto([peca], { user_credits: [{ balance: 100 }] });
    const r = await dispatchTool(ctx, "editar_legenda", { contentId: ID, instrucao: "mais curta" });
    expect(r.ok).toBe(true);
    expect(peca.platform_captions).toBeNull();
    expect(legendaQueSai(peca, "linkedin")).toBe("Legenda reescrita pela IA.\n\n#Nova");
  });
});

describe("regras puras da troca de legenda", () => {
  it("patchDeLegenda sempre zera as variantes, e hashtag vazia vira null", () => {
    expect(patchDeLegenda("x", [])).toEqual({ caption: "x", hashtags: null, platform_captions: null });
    expect(patchDeLegenda("x", ["#a"])).toEqual({ caption: "x", hashtags: ["#a"], platform_captions: null });
  });

  it("redesDaPeca usa as redes escolhidas ao agendar; sem elas, a de criação", () => {
    expect(redesDaPeca({ platform: "instagram", scheduled_accounts: { platforms: ["linkedin", "linkedin", "x"] } })).toEqual(["linkedin", "x"]);
    expect(redesDaPeca({ platform: "linkedin", scheduled_accounts: { platforms: [], accountIds: ["spc"] } })).toEqual(["linkedin"]);
    expect(redesDaPeca({ platform: null })).toEqual(["instagram"]);
  });

  it("limite conta emoji como um caractere e ignora rede sem limite conhecido", () => {
    expect(legendaAcimaDoLimite("🚀".repeat(280), ["x"])).toBeNull();
    expect(legendaAcimaDoLimite("a".repeat(5000), ["facebook"])).toBeNull();
    expect(legendaAcimaDoLimite("a".repeat(2201), ["linkedin", "instagram"])).toMatch(/instagram aceita 2200/);
  });
});
