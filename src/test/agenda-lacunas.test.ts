/**
 * Lacunas de AGENDAR e PUBLICAR achadas com um cliente operando o TrendPulse pelo MCP (2026-10-04/05).
 *
 * O que estava acontecendo em produção, cada item com teste abaixo:
 *  1. `agendar_conteudo` respondia "Agendado" sem agendar: com RLS, um content_id errado não dá erro no
 *     update, só atualiza zero linhas — e a ferramenta só olhava o erro.
 *  2. `publicar` mandava só a rede; o publicador pegava a PRIMEIRA conta dela. Com três LinkedIn, sorteio.
 *  3. Toda peça publicada sumia do calendário: o publicador zerava a data agendada (257 de 286).
 *  4. Recorrentes não apareciam no `listar_agenda`, e disparavam sem conta: um recorrente de Facebook de
 *     quem não tem Facebook falhou sete dias, de 14/09 a 05/10, sem aviso a ninguém.
 *
 * Run: npm test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { dispatchTool, type ToolCtx } from "../../supabase/functions/_shared/agent-tools";
import { alvosDoRecorrente, estadoAposPublicar, linhaDoRecorrente } from "../../supabase/functions/_shared/publicacao";

// A MESMA expressão com que o conselho da Pulse lê a agenda (pulse: kernel/conteudo.mjs). As linhas
// novas (recorrentes) não podem casar com ela: recorrente não é peça.
const RE_AGENDA = /\(([^,()]*), ([a-z_]+)\) → content_id=([0-9a-f-]{36})/g;

const AGORA = "2026-10-05T17:00:00Z"; // 14:00 em Brasília
const FUTURO = "2026-10-10T09:00:00-03:00";
const VALIDADE = { expires_at: "2026-12-03T16:33:00Z", renovavel: true, refresh_expires_at: "2027-10-05T16:34:00Z" };
const conta = (platform: string, id: string, nome: string, extra: Record<string, unknown> = {}) =>
  ({ platform, pfm_account_id: id, account_name: nome, ...VALIDADE, ...extra });

const INSTA = conta("instagram", "spc_insta", "maikonmadeira");
const INSTA_2 = conta("instagram", "spc_insta2", "hearttsurgery");
const INSTA_3 = conta("instagram", "spc_insta3", "agessaude");
const X = conta("x", "spc_x", "maikon");
const LINKEDINS = [conta("linkedin", "spc_l1", "Maikon"), conta("linkedin", "spc_l2", "DrEscala"), conta("linkedin", "spc_l3", "AGES")];
const INSTA_VENCIDA = conta("instagram", "spc_velha", "antiga", { expires_at: "2026-10-01T12:00:00Z", renovavel: false, refresh_expires_at: null });

const ID = "7a6dd3b6-4293-40d8-8132-b5997ae6d4e2";
const ID_DE_OUTRA_CONTA = "11111111-2222-4333-8444-555555555555";

/** Cliente falso que respeita `select` e `eq`. `updateNaoGrava` simula o update que afeta zero linhas. */
function clienteFalso(tabelas: Record<string, any[]>, opts: { updateNaoGrava?: boolean } = {}) {
  const atualizacoes: Array<{ tabela: string; patch: any }> = [];
  const from = (tabela: string) => {
    let linhas = [...(tabelas[tabela] || [])];
    let colunas: string[] | null = null;
    let patch: any = null;
    const projeta = (l: any) => (colunas ? Object.fromEntries(colunas.map((c) => [c, l[c]])) : l);
    const q: any = {
      select: (cols: string) => { colunas = cols.split(",").map((c) => c.trim()); return q; },
      update: (p: any) => { patch = p; return q; },
      eq: (col: string, v: any) => { linhas = linhas.filter((l) => l[col] === v); return q; },
      not: () => q, gte: () => q, lte: () => q, order: () => q, limit: () => q,
      maybeSingle: async () => ({ data: linhas[0] ? projeta(linhas[0]) : null, error: null }),
      then: (ok: any, ko: any) => {
        if (patch && !opts.updateNaoGrava) atualizacoes.push({ tabela, patch });
        const data = patch && opts.updateNaoGrava ? [] : linhas.map(projeta);
        return Promise.resolve({ data, error: null }).then(ok, ko);
      },
    };
    return q;
  };
  return { from, atualizacoes };
}

function contexto(conexoes: any[], tabelas: Record<string, any[]> = {}, opts: { updateNaoGrava?: boolean } = {}) {
  const userClient = clienteFalso(tabelas, opts);
  const chamadas: Array<{ url: string; body: any }> = [];
  vi.stubGlobal("fetch", vi.fn(async (url: any, init?: any) => {
    const u = String(url);
    chamadas.push({ url: u, body: init?.body ? JSON.parse(init.body) : null });
    if (u.includes("publish-postforme")) return new Response(JSON.stringify({ results: [{ platform: "linkedin", success: true }] }), { status: 200 });
    return new Response(JSON.stringify({ connections: conexoes }), { status: 200 });
  }));
  const ctx: ToolCtx = { supabaseUrl: "https://x.supabase.co", anonKey: "anon", userAuthHeader: "Bearer jwt", userClient, anthropicKey: "", userId: "u1" };
  const publicacoes = () => chamadas.filter((c) => c.url.includes("publish-postforme"));
  return { ctx, userClient, publicacoes };
}

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(AGORA)); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("agendar_conteudo — só diz 'Agendado' se gravou", () => {
  const peca = { id: ID, title: "Semaglutida vence rival", status: "draft", published_at: null };

  it("content_id que não existe (ou é de outra conta) é recusado, sem gravar nada", async () => {
    const { ctx, userClient } = contexto([INSTA], { generated_contents: [peca] });
    const r = await dispatchTool(ctx, "agendar_conteudo", { contentId: ID_DE_OUTRA_CONTA, data_hora_iso: FUTURO, plataformas: ["instagram"] });
    expect(r.ok).toBe(false);
    expect(r.content).toMatch(/não encontrado/);
    expect(r.content).toMatch(/NADA foi agendado/);
    expect(userClient.atualizacoes).toHaveLength(0);
  });

  it("update que afeta zero linhas NÃO vira sucesso — era aqui que respondia 'Agendado' com o calendário vazio", async () => {
    const { ctx } = contexto([INSTA], { generated_contents: [peca] }, { updateNaoGrava: true });
    const r = await dispatchTool(ctx, "agendar_conteudo", { contentId: ID, data_hora_iso: FUTURO, plataformas: ["instagram"] });
    expect(r.ok).toBe(false);
    expect(r.content).not.toMatch(/^Agendado para/);
    expect(r.content).toMatch(/NADA foi agendado/);
  });

  it("peça já publicada não é agendada de novo: publicaria a mesma peça duas vezes", async () => {
    const { ctx, userClient } = contexto([INSTA], { generated_contents: [{ ...peca, status: "published", published_at: "2026-10-01T12:00:00Z" }] });
    const r = await dispatchTool(ctx, "agendar_conteudo", { contentId: ID, data_hora_iso: FUTURO, plataformas: ["instagram"] });
    expect(r.ok).toBe(false);
    expect(r.content).toMatch(/já foi publicado/);
    expect(userClient.atualizacoes).toHaveLength(0);
  });

  it("no caminho feliz grava a data e a conta, e a resposta começa como quem lê por programa espera", async () => {
    const { ctx, userClient } = contexto([INSTA], { generated_contents: [peca] });
    const r = await dispatchTool(ctx, "agendar_conteudo", { contentId: ID, data_hora_iso: FUTURO, plataformas: ["instagram"] });
    expect(r.ok).toBe(true);
    expect(r.content).toMatch(/^Agendado para 10\/10\/2026, 09:00:00 \(horario de Brasilia\)\.$/);
    expect(userClient.atualizacoes).toHaveLength(1);
    expect(userClient.atualizacoes[0].patch).toMatchObject({
      status: "scheduled", scheduled_at: "2026-10-10T12:00:00.000Z", publish_attempts: 0,
      scheduled_accounts: { platforms: ["instagram"], accountIds: ["spc_insta"] },
    });
  });
});

describe("publicar — sai no perfil escolhido, nunca no primeiro da lista", () => {
  const peca = { id: ID, title: "Post", platform: "linkedin", scheduled_accounts: null };

  it("três LinkedIn e nenhum perfil dito: recusa, lista os perfis e NÃO chama o publicador", async () => {
    const { ctx, publicacoes } = contexto(LINKEDINS, { generated_contents: [peca] });
    const r = await dispatchTool(ctx, "publicar", { contentId: ID });
    expect(r.ok).toBe(false);
    expect(r.content).toMatch(/mais de uma conta em linkedin/);
    expect(r.content).toMatch(/conta=spc_l2/);
    expect(r.content).toMatch(/Nada foi publicado/);
    expect(publicacoes()).toHaveLength(0);
  });

  it("com o perfil escolhido, o publicador recebe EXATAMENTE aquela conta", async () => {
    const { ctx, publicacoes } = contexto(LINKEDINS, { generated_contents: [peca] });
    const r = await dispatchTool(ctx, "publicar", { contentId: ID, contas: ["spc_l2"] });
    expect(r.ok).toBe(true);
    expect(publicacoes()).toHaveLength(1);
    expect(publicacoes()[0].body).toMatchObject({ contentId: ID, accountIds: ["spc_l2"] });
  });

  it("peça que já tinha perfis escolhidos ao agendar publica neles", async () => {
    const { ctx, publicacoes } = contexto(LINKEDINS, { generated_contents: [{ ...peca, scheduled_accounts: { platforms: ["linkedin"], accountIds: ["spc_l3"] } }] });
    await dispatchTool(ctx, "publicar", { contentId: ID });
    expect(publicacoes()[0].body.accountIds).toEqual(["spc_l3"]);
  });

  it("rede com uma conta só resolve sozinha — não pergunta à toa", async () => {
    const { ctx, publicacoes } = contexto([INSTA, ...LINKEDINS], { generated_contents: [{ ...peca, platform: "instagram" }] });
    const r = await dispatchTool(ctx, "publicar", { contentId: ID });
    expect(r.ok).toBe(true);
    expect(publicacoes()[0].body.accountIds).toEqual(["spc_insta"]);
  });

  it("conta que não é do usuário é recusada antes de publicar", async () => {
    const { ctx, publicacoes } = contexto(LINKEDINS, { generated_contents: [peca] });
    const r = await dispatchTool(ctx, "publicar", { contentId: ID, contas: ["spc_de_outro"] });
    expect(r.ok).toBe(false);
    expect(publicacoes()).toHaveLength(0);
  });

  it("content_id que não existe não chega ao publicador", async () => {
    const { ctx, publicacoes } = contexto(LINKEDINS, { generated_contents: [peca] });
    const r = await dispatchTool(ctx, "publicar", { contentId: ID_DE_OUTRA_CONTA, contas: ["spc_l1"] });
    expect(r.ok).toBe(false);
    expect(r.content).toMatch(/não encontrado/);
    expect(publicacoes()).toHaveLength(0);
  });
});

describe("estadoAposPublicar — publicar não tira a peça do calendário", () => {
  it("publicação imediata NÃO toca em scheduled_at: era o que apagava 9 em cada 10 publicadas", () => {
    const patch = estadoAposPublicar(null, "2026-10-05T17:00:00.000Z");
    expect(patch).toEqual({ status: "published", published_at: "2026-10-05T17:00:00.000Z" });
    expect("scheduled_at" in patch).toBe(false);
  });

  it("agendamento feito no Post for Me segue agendado na data pedida", () => {
    expect(estadoAposPublicar("2026-10-10T12:00:00.000Z", "2026-10-05T17:00:00.000Z"))
      .toEqual({ status: "scheduled", published_at: null, scheduled_at: "2026-10-10T12:00:00.000Z" });
  });
});

describe("alvosDoRecorrente — onde o recorrente publica hoje", () => {
  it("o caso real: Facebook e X, sem Facebook conectado → não publica e diz por quê", () => {
    const a = alvosDoRecorrente({ platforms: ["facebook", "x"] }, [INSTA, X, ...LINKEDINS]);
    expect(a.publica).toBe(false);
    expect(a.accountIds).toEqual([]);
    expect(a.aviso).toMatch(/Sem conta de facebook conectada/);
    // a segunda rede nunca foi publicada por recorrente antigo; isso é DITO, não ligado em silêncio
    expect(a.aviso).toMatch(/publica só em facebook: x não sai/);
  });

  it("rede com uma conta: grava a conta, para não depender da ordem da lista", () => {
    expect(alvosDoRecorrente({ platforms: ["instagram"] }, [INSTA, X]))
      .toEqual({ publica: true, platforms: ["instagram"], accountIds: ["spc_insta"], aviso: null });
  });

  it("rede com três perfis e nenhum escolhido: mantém o comportamento antigo e AVISA", () => {
    const a = alvosDoRecorrente({ platforms: ["instagram"] }, [INSTA, INSTA_2, INSTA_3]);
    expect(a.publica).toBe(true);
    // sem accountIds o publicador escolhe como sempre fez: trocar o perfil dos posts diários de alguém
    // sem ele ver seria pior que o defeito
    expect(a.accountIds).toEqual([]);
    expect(a.aviso).toMatch(/Há 3 perfis de instagram/);
    expect(a.aviso).toMatch(/Recrie-o escolhendo o perfil/);
  });

  it("perfis escolhidos: publica exatamente neles, em todas as redes", () => {
    expect(alvosDoRecorrente({ platforms: ["instagram", "x"], account_ids: ["spc_insta2", "spc_x"] }, [INSTA, INSTA_2, INSTA_3, X]))
      .toEqual({ publica: true, platforms: ["instagram", "x"], accountIds: ["spc_insta2", "spc_x"], aviso: null });
  });

  it("perfil escolhido que foi desconectado: publica nos demais e avisa", () => {
    const a = alvosDoRecorrente({ platforms: ["instagram", "x"], account_ids: ["spc_sumiu", "spc_x"] }, [INSTA, X]);
    expect(a).toMatchObject({ publica: true, platforms: ["x"], accountIds: ["spc_x"] });
    expect(a.aviso).toMatch(/não está mais conectado/);
  });

  it("todos os perfis escolhidos fora: não publica", () => {
    const a = alvosDoRecorrente({ platforms: ["instagram"], account_ids: ["spc_sumiu"] }, [INSTA]);
    expect(a.publica).toBe(false);
    expect(a.aviso).toMatch(/Nenhum dos perfis escolhidos está conectado/);
  });

  it("conta vencida sem como renovar não conta como conta", () => {
    const a = alvosDoRecorrente({ platforms: ["instagram"] }, [INSTA_VENCIDA], Date.parse(AGORA));
    expect(a.publica).toBe(false);
  });
});

describe("recorrentes no listar_agenda", () => {
  const RECORRENTE = { id: "f2d7453f-5e03-45c3-a301-8feb39057967", name: "Facebook Jornada Brasil Alemanha", platforms: ["facebook", "x"], days_of_week: [0, 1, 2, 3, 4, 5, 6], hour_utc: 11, active: true, last_error: null };

  it("a linha diz dias, hora de Brasília, redes e estado", () => {
    expect(linhaDoRecorrente(RECORRENTE))
      .toBe("↻ Facebook Jornada Brasil Alemanha — todo dia às 08:00 em facebook, x · ativo → recorrente=f2d7453f-5e03-45c3-a301-8feb39057967");
    expect(linhaDoRecorrente({ ...RECORRENTE, days_of_week: [5, 1, 3], hour_utc: 1, active: false }))
      .toMatch(/— seg, qua, sex às 22:00 em facebook, x · pausado →/);
  });

  it("o erro do último disparo vai na mesma linha, numa linha só", () => {
    const l = linhaDoRecorrente({ ...RECORRENTE, last_error: "Sem conta de facebook conectada:\n nada foi publicado." });
    expect(l).toMatch(/ · ATENÇÃO: Sem conta de facebook conectada: nada foi publicado\.$/);
    expect(l.split("\n")).toHaveLength(1);
  });

  it("aparece no listar_agenda, DEPOIS das peças, sem virar linha de peça para quem lê por programa", async () => {
    const pecaAgendada = { id: ID, title: "IA transformando pacientes", content_type: "post", scheduled_at: "2026-10-12T22:00:00Z", platform: "instagram", status: "scheduled", publish_error: null };
    const { ctx } = contexto([INSTA], { generated_contents: [pecaAgendada], recurring_schedules: [RECORRENTE] });
    const r = await dispatchTool(ctx, "listar_agenda", {});
    expect(r.ok).toBe(true);
    expect(r.content).toMatch(/Recorrentes \(publicam sozinhos/);
    expect(r.content).toMatch(/↻ Facebook Jornada Brasil Alemanha — todo dia às 08:00/);
    expect(r.content.indexOf("content_id=" + ID)).toBeLessThan(r.content.indexOf("↻"));
    const lidas = [...r.content.matchAll(RE_AGENDA)];
    expect(lidas).toHaveLength(1);
    expect(lidas[0].slice(1)).toEqual(["instagram", "scheduled", ID]);
  });

  it("semana sem peça avulsa mas com recorrente não é 'nada programado'", async () => {
    const { ctx } = contexto([INSTA], { generated_contents: [], recurring_schedules: [RECORRENTE] });
    const r = await dispatchTool(ctx, "listar_agenda", {});
    expect(r.content).toMatch(/^Nada agendado entre /);
    expect(r.content).toMatch(/↻ Facebook Jornada Brasil Alemanha/);
  });

  it("sem recorrente, a resposta é a de sempre", async () => {
    const { ctx } = contexto([INSTA], { generated_contents: [] });
    const r = await dispatchTool(ctx, "listar_agenda", {});
    expect(r.content).toMatch(/^Nada agendado entre \d{2}\/\d{2}\/\d{4} e \d{2}\/\d{2}\/\d{4}\.$/);
  });
});
