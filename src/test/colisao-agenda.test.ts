/**
 * Colisão de agenda por CONTA DE DESTINO (agendar_arte e agendar_conteudo).
 *
 * Caso que motiva (2026-11-21): a peça #167 da Pulse, no Instagram do Raul, para 04/12/2026 12:00, foi
 * recusada pelo agendar_arte porque o Instagram da Pulse já tinha uma peça nesse instante. A trava
 * comparava só o horário. Agora compara a conta: mesma conta + mesmo instante continua recusando; contas
 * diferentes no mesmo instante passam. Agendamento legado (sem accountIds) ocupa a rede inteira.
 *
 * Run: npm test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { dispatchTool, type ToolCtx } from "../../supabase/functions/_shared/agent-tools";
import { destinoDaPeca, destinoDoAgendamento, destinosColidem, pecaEmColisao } from "../../supabase/functions/_shared/colisao-agenda";

const SUPA = "https://qdmhqxpazffmaxleyzxs.supabase.co";
const USER = "1294d060-6783-4f7a-9df4-3c5f567eded4";
const AGORA = "2026-11-21T18:00:00Z";
const QUANDO = "2026-12-04T12:00:00-03:00";
const QUANDO_UTC = "2026-12-04T15:00:00.000Z";
const IMAGEM = `${SUPA}/storage/v1/object/public/content-images/mcp/${USER}/envio-1792000000010-ab1cd.png`;

const PULSE = { platform: "instagram", pfm_account_id: "spc_pulse", account_name: "pulse.id", expires_at: null, renovavel: false };
const RAUL = { platform: "instagram", pfm_account_id: "spc_raul", account_name: "raulsxs", expires_at: null, renovavel: false };
const LINKEDIN = { platform: "linkedin", pfm_account_id: "spc_li", account_name: "PulseID", expires_at: null, renovavel: false };
const CONTAS = [PULSE, RAUL, LINKEDIN];

const NOVO_ID = "c0ffee00-0000-4000-8000-000000000167";
const ID_PULSE = "aaaa0000-0000-4000-8000-000000000001";
const ID_OUTRA = "bbbb0000-0000-4000-8000-000000000002";

const agendada = (id: string, title: string, extra: Record<string, unknown>) => ({
  id, title, status: "scheduled", scheduled_at: QUANDO_UTC, published_at: null, platform: "instagram", scheduled_accounts: null, ...extra,
});
const PECA_PULSE = agendada(ID_PULSE, "Peça do Instagram da Pulse", { scheduled_accounts: { platforms: ["instagram"], accountIds: ["spc_pulse"] } });

/** Cliente falso: filtra por `eq`, projeta o `select`, grava insert e update. */
function clienteFalso(linhas: any[]) {
  const inseridos: any[] = [];
  const atualizacoes: any[] = [];
  const uploads: string[] = [];
  const from = (_tabela: string) => {
    let rows = [...linhas];
    let colunas: string[] | null = null;
    let patch: any = null;
    let inserido: any = null;
    const projeta = (l: any) => (colunas ? Object.fromEntries(colunas.map((c) => [c, l[c]])) : l);
    const q: any = {
      select: (cols: string) => { colunas = cols.split(",").map((c) => c.trim()); return q; },
      eq: (col: string, v: any) => { rows = rows.filter((l) => l[col] === v); return q; },
      limit: () => q,
      insert: (l: any) => { inserido = l; inseridos.push(l); return q; },
      update: (p: any) => { patch = p; return q; },
      single: async () => ({ data: inserido ? { id: NOVO_ID } : null, error: null }),
      maybeSingle: async () => ({ data: rows[0] ? projeta(rows[0]) : null, error: null }),
      then: (ok: any, ko: any) => {
        if (patch) atualizacoes.push(patch);
        return Promise.resolve({ data: rows.map(projeta), error: null }).then(ok, ko);
      },
    };
    return q;
  };
  const storage = {
    from: () => ({
      upload: async (c: string) => { uploads.push(c); return { error: null }; },
      getPublicUrl: (c: string) => ({ data: { publicUrl: `${SUPA}/storage/v1/object/public/content-images/${c}` } }),
      remove: async () => ({ error: null }),
    }),
  };
  return { from, storage, rpc: vi.fn(), inseridos, atualizacoes, uploads };
}

function contexto(linhas: any[], conexoes: any[] = CONTAS) {
  const userClient = clienteFalso(linhas);
  // connect-social devolve as contas; a URL da imagem (pasta do usuário) responde só o cabeçalho
  vi.stubGlobal("fetch", vi.fn(async (url: string) => String(url).includes("/functions/v1/connect-social")
    ? new Response(JSON.stringify({ connections: conexoes }), { status: 200 })
    : new Response(new Uint8Array(512), { status: 200, headers: { "content-type": "image/png", "content-length": "512" } })));
  const ctx: ToolCtx = { supabaseUrl: SUPA, anonKey: "anon", userAuthHeader: "Bearer jwt", userClient, anthropicKey: "", userId: USER, defaultBrandId: "marca-1" };
  return { ctx, userClient };
}

const arte = (ctx: ToolCtx, extra: Record<string, unknown>) =>
  dispatchTool(ctx, "agendar_arte", { imagem: IMAGEM, legenda: "O juro alto encurta o prazo do caixa", data_hora_iso: QUANDO, titulo: "Peça 167", ...extra });

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(AGORA)); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("agendar_arte — colisão pela conta de destino", () => {
  it("mesma conta + mesmo instante: recusa, diz qual peça ocupa o horário e não grava nada", async () => {
    const { ctx, userClient } = contexto([PECA_PULSE]);
    const r = await arte(ctx, { plataformas: ["instagram"], contas: ["spc_pulse"] });
    expect(r.ok).toBe(false);
    expect(r.content).toMatch(/mesma conta de destino/);
    expect(r.content).toContain(`"Peça do Instagram da Pulse", content_id=${ID_PULSE}`);
    expect(userClient.inseridos).toEqual([]);
    expect(userClient.uploads).toEqual([]);
  });

  it("caso da peça #167: Instagram do Raul no instante ocupado pelo Instagram da Pulse é aceito", async () => {
    const { ctx, userClient } = contexto([PECA_PULSE]);
    const r = await arte(ctx, { plataformas: ["instagram"], contas: ["spc_raul"] });
    expect(r.ok).toBe(true);
    expect(r.content).toMatch(/^Agendado para .* content_id=c0ffee00-0000-4000-8000-000000000167$/);
    expect(userClient.inseridos).toHaveLength(1);
    expect(userClient.inseridos[0]).toMatchObject({
      status: "scheduled", scheduled_at: QUANDO_UTC,
      scheduled_accounts: { platforms: ["instagram"], accountIds: ["spc_raul"] },
    });
  });

  it("duas contas no novo agendamento: recusa se UMA delas já está ocupada no instante", async () => {
    const noLinkedin = agendada(ID_OUTRA, "Post do LinkedIn", { platform: "linkedin", scheduled_accounts: { platforms: ["linkedin"], accountIds: ["spc_li"] } });
    const { ctx, userClient } = contexto([noLinkedin]);
    const r = await arte(ctx, { plataformas: ["instagram", "linkedin"], contas: ["spc_raul", "spc_li"] });
    expect(r.ok).toBe(false);
    expect(r.content).toContain(`content_id=${ID_OUTRA}`);
    expect(userClient.inseridos).toEqual([]);
  });

  it("peça existente em duas contas não ocupa uma terceira", async () => {
    const duas = agendada(ID_OUTRA, "Pulse no Insta e no LinkedIn", { scheduled_accounts: { platforms: ["instagram", "linkedin"], accountIds: ["spc_pulse", "spc_li"] } });
    const { ctx } = contexto([duas]);
    expect((await arte(ctx, { plataformas: ["instagram"], contas: ["spc_raul"] })).ok).toBe(true);
  });

  it("legado sem scheduled_accounts ocupa a REDE inteira: outro Instagram no instante é recusado", async () => {
    // Decisão conservadora (colisao-agenda.ts): o scheduler publica o legado na primeira conta da rede,
    // que pode ser qualquer uma; aceitar aqui poderia publicar duas peças no mesmo perfil.
    const legado = agendada(ID_OUTRA, "Agendamento antigo", { platform: "instagram", scheduled_accounts: null });
    const { ctx, userClient } = contexto([legado]);
    const r = await arte(ctx, { plataformas: ["instagram"], contas: ["spc_raul"] });
    expect(r.ok).toBe(false);
    expect(r.content).toContain(`"Agendamento antigo", content_id=${ID_OUTRA}`);
    expect(userClient.inseridos).toEqual([]);
  });

  it("legado de outra rede não ocupa o Instagram; legado com accountIds vazio conta como legado", async () => {
    const legadoLinkedin = agendada(ID_OUTRA, "LinkedIn antigo", { platform: "linkedin", scheduled_accounts: null });
    const { ctx } = contexto([legadoLinkedin]);
    expect((await arte(ctx, { plataformas: ["instagram"], contas: ["spc_raul"] })).ok).toBe(true);

    const vazio = agendada(ID_OUTRA, "Sem contas", { platform: "instagram", scheduled_accounts: { platforms: ["instagram"], accountIds: [] } });
    const c2 = contexto([vazio]);
    expect((await arte(c2.ctx, { plataformas: ["instagram"], contas: ["spc_raul"] })).ok).toBe(false);
  });

  it("novo agendamento sem conta nem rede é legado (instagram): colide com qualquer Instagram do instante", async () => {
    const { ctx, userClient } = contexto([PECA_PULSE]);
    const r = await arte(ctx, {});
    expect(r.ok).toBe(false);
    expect(userClient.inseridos).toEqual([]);
  });

  it("mesma conta em OUTRO instante, ou peça não agendada no instante, não bloqueia", async () => {
    const outroHorario = { ...PECA_PULSE, scheduled_at: "2026-12-04T15:30:00.000Z" };
    const aprovada = { ...PECA_PULSE, id: ID_OUTRA, status: "approved" };
    const { ctx } = contexto([outroHorario, aprovada]);
    expect((await arte(ctx, { plataformas: ["instagram"], contas: ["spc_pulse"] })).ok).toBe(true);
  });

  it("rascunho (sem data) não confere colisão", async () => {
    const { ctx } = contexto([PECA_PULSE]);
    const r = await arte(ctx, { data_hora_iso: undefined, plataformas: ["instagram"], contas: ["spc_pulse"] });
    expect(r.ok).toBe(true);
    expect(r.content).toMatch(/^Salvo como rascunho/);
  });
});

describe("agendar_conteudo — mesma trava, sem a peça colidir consigo mesma", () => {
  const reagendar = (ctx: ToolCtx, contentId: string, extra: Record<string, unknown> = {}) =>
    dispatchTool(ctx, "agendar_conteudo", { contentId, data_hora_iso: QUANDO, ...extra });

  it("reagendar a peça para o horário que ela já ocupa não recusa a si própria", async () => {
    const { ctx, userClient } = contexto([PECA_PULSE]);
    const r = await reagendar(ctx, ID_PULSE, { plataformas: ["instagram"], contas: ["spc_pulse"] });
    expect(r.ok).toBe(true);
    expect(r.content).toMatch(/^Agendado para/);
    expect(userClient.atualizacoes).toHaveLength(1);
    // sem contas: o destino é o que a peça já tinha, e ela continua não colidindo consigo
    const c2 = contexto([PECA_PULSE]);
    expect((await reagendar(c2.ctx, ID_PULSE)).ok).toBe(true);
  });

  it("outra peça na mesma conta e no mesmo instante: recusa e não grava", async () => {
    const outra = { ...PECA_PULSE, id: ID_OUTRA, title: "Outra peça", status: "approved", scheduled_at: null };
    const { ctx, userClient } = contexto([PECA_PULSE, outra]);
    const r = await reagendar(ctx, ID_OUTRA, { plataformas: ["instagram"], contas: ["spc_pulse"] });
    expect(r.ok).toBe(false);
    expect(r.content).toContain(`"Peça do Instagram da Pulse", content_id=${ID_PULSE}`);
    expect(r.content).toMatch(/NADA foi agendado/);
    expect(userClient.atualizacoes).toEqual([]);
  });

  it("sem `contas`, usa as contas que a peça já tinha: Raul no instante da Pulse passa, Pulse não", async () => {
    const doRaul = { ...PECA_PULSE, id: ID_OUTRA, status: "approved", scheduled_at: null, scheduled_accounts: { platforms: ["instagram"], accountIds: ["spc_raul"] } };
    const { ctx } = contexto([PECA_PULSE, doRaul]);
    expect((await reagendar(ctx, ID_OUTRA)).ok).toBe(true);

    const daPulse = { ...doRaul, scheduled_accounts: { platforms: ["instagram"], accountIds: ["spc_pulse"] } };
    const c2 = contexto([PECA_PULSE, daPulse]);
    const r = await reagendar(c2.ctx, ID_OUTRA);
    expect(r.ok).toBe(false);
    expect(c2.userClient.atualizacoes).toEqual([]);
  });

  it("outra conta no mesmo instante é aceita", async () => {
    const outra = { ...PECA_PULSE, id: ID_OUTRA, status: "approved", scheduled_at: null };
    const { ctx } = contexto([PECA_PULSE, outra]);
    expect((await reagendar(ctx, ID_OUTRA, { plataformas: ["linkedin"], contas: ["spc_li"] })).ok).toBe(true);
  });
});

describe("colisao-agenda — a regra pura", () => {
  const REDE = { spc_pulse: "instagram", spc_raul: "instagram", spc_li: "linkedin" };

  it("conta conhecida dos dois lados: só a conta importa", () => {
    const a = destinoDoAgendamento(["spc_pulse"], [], null, REDE);
    expect(destinosColidem(a, destinoDoAgendamento(["spc_raul"], [], null, REDE))).toBe(false);
    expect(destinosColidem(a, destinoDoAgendamento(["spc_raul", "spc_pulse"], [], null, REDE))).toBe(true);
  });

  it("conta desconectada: a rede sai das plataformas gravadas; sem elas, é 'qualquer rede' contra legado", () => {
    const legadoInsta = destinoDaPeca({ id: "x", platform: "instagram", scheduled_accounts: null }, REDE);
    const comPlataforma = destinoDaPeca({ id: "y", platform: "instagram", scheduled_accounts: { platforms: ["linkedin"], accountIds: ["spc_sumiu"] } }, REDE);
    expect(comPlataforma.redes).toEqual(new Set(["linkedin"]));
    expect(destinosColidem(legadoInsta, comPlataforma)).toBe(false);
    const semNada = destinoDaPeca({ id: "z", platform: "instagram", scheduled_accounts: { accountIds: ["spc_sumiu"] } }, REDE);
    expect(semNada.redes).toBeNull();
    expect(destinosColidem(legadoInsta, semNada)).toBe(true);
    // conta exata dos dois lados continua comparando só a conta, mesmo sem rede
    expect(destinosColidem(destinoDoAgendamento(["spc_raul"], [], null, REDE), semNada)).toBe(false);
  });

  it("pecaEmColisao ignora a própria peça", () => {
    const novo = destinoDoAgendamento(["spc_pulse"], ["instagram"], "instagram", REDE);
    expect(pecaEmColisao(novo, [PECA_PULSE], REDE, ID_PULSE)).toBeNull();
    expect(pecaEmColisao(novo, [PECA_PULSE], REDE)?.id).toBe(ID_PULSE);
  });
});
