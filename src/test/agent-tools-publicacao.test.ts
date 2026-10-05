/**
 * O que o app e os agentes enxergam sobre PUBLICAR: quando uma conexão precisa do usuário, o motivo de
 * uma falha e a legenda que sai.
 *
 * Caso que motiva estes testes (2026-10-05): um post agendado no LinkedIn falhou às 09:00 com "A conexão
 * com o Linkedin expirou. Reconecte a conta". O token de ACESSO tinha mesmo vencido (dura ~60 dias), mas
 * a conta tinha refresh token válido por mais nove meses, e o Post for Me renova o acesso sozinho na hora
 * de publicar. Quem barrou foi o nosso pré-check, que tratava todo acesso vencido como "reconecte" — regra
 * que só vale para Instagram, Facebook e Threads, onde token vencido não renova. De quebra:
 *  - o agente só via "failed": o motivo estava no banco (`publish_error`) e nenhuma ferramenta mostrava;
 *  - `detalhes_conteudo` devolvia a legenda padrão, e a que vai ao ar é a variante da rede.
 *
 * Run: npm test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { dispatchTool, resolverContas, type ToolCtx } from "../../supabase/functions/_shared/agent-tools";
import { bloqueioPorConexao, contaDoPfm, erroComConexaoVencida } from "../../supabase/functions/_shared/publicacao";

// As MESMAS expressões com que o conselho da Pulse lê estas ferramentas (pulse: kernel/conteudo.mjs).
// Mudou o formato da linha? O teste quebra aqui, antes de o painel de conteúdo de lá ficar cego.
const RE_CONEXAO = /^- ([a-z]+): (.+?) → conta=(\S+)/gm;
const RE_AGENDA = /\(([^,()]*), ([a-z_]+)\) → content_id=([0-9a-f-]{36})/g;

const AGORA = "2026-10-05T17:00:00Z"; // 14:00 em Brasília
// LinkedIn em dia: acesso até dezembro, refresh token por um ano
const PAGINA = { platform: "linkedin", pfm_account_id: "spc_pagina", account_name: "PulseID - Solutions Architecture", expires_at: "2026-12-03T16:33:00Z", renovavel: true, refresh_expires_at: "2027-10-05T16:34:00Z" };
// LinkedIn do caso real: o ACESSO venceu, mas o refresh token vale até julho — o Post for Me renova
const LAPSA = { platform: "linkedin", pfm_account_id: "spc_lapsa", account_name: "Raul Seixas", expires_at: "2026-10-01T12:00:00Z", renovavel: true, refresh_expires_at: "2027-07-10T12:00:00Z" };
// Instagram vencido: não tem refresh token, só volta reconectando
const VENCIDA = { platform: "instagram", pfm_account_id: "spc_vencida", account_name: "pulse.id", expires_at: "2026-10-01T12:00:00Z", renovavel: false, refresh_expires_at: null };
const VENCENDO = { platform: "instagram", pfm_account_id: "spc_insta", account_name: "raulsxs", expires_at: "2026-10-10T13:42:00Z", renovavel: false, refresh_expires_at: null };
const FIM_DO_REFRESH = { platform: "linkedin", pfm_account_id: "spc_fim", account_name: "TrendPulse", expires_at: "2026-10-20T12:00:00Z", renovavel: true, refresh_expires_at: "2026-10-08T12:00:00Z" };
const SEM_DATA = { platform: "x", pfm_account_id: "spc_x", account_name: "pulseid", expires_at: null, renovavel: false, refresh_expires_at: null };

const ID_FALHA = "7a6dd3b6-4293-40d8-8132-b5997ae6d4e2";
const ID_OK = "3b4984eb-0000-4000-8000-000000000001";
const MOTIVO = "A conexão com o Instagram expirou. Reconecte a conta em Perfil → Conexões e tente publicar de novo.";

/**
 * Cliente falso que RESPEITA o `select`: coluna não pedida não volta. Sem isso o teste passaria mesmo
 * com a coluna esquecida na consulta, que é exatamente o defeito que ele precisa pegar.
 */
function clienteFalso(tabelas: Record<string, any[]>) {
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
        if (patch) atualizacoes.push({ tabela, patch });
        return Promise.resolve({ data: linhas.map(projeta), error: null }).then(ok, ko);
      },
    };
    return q;
  };
  return { from, atualizacoes };
}

function contexto(conexoes: any[], tabelas: Record<string, any[]> = {}) {
  const userClient = clienteFalso(tabelas);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ connections: conexoes }), { status: 200 })));
  const ctx: ToolCtx = { supabaseUrl: "https://x.supabase.co", anonKey: "anon", userAuthHeader: "Bearer jwt", userClient, anthropicKey: "", userId: "u1" };
  return { ctx, userClient };
}

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(AGORA)); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("contaDoPfm — o que sai do Post for Me para o app e para os agentes", () => {
  const DO_PFM = {
    id: "spc_pagina", platform: "linkedin", username: "PulseID - Solutions Architecture", status: "connected", external_id: "u1",
    access_token: "AQX-segredo", refresh_token: "AQR-segredo",
    access_token_expires_at: "2026-12-03T16:33:00Z", refresh_token_expires_at: "2027-10-05T16:33:00Z",
  };
  const ACESSO_VENCIDO = "2026-10-01T12:00:00Z";

  it("os tokens nunca saem: só as datas e se dá para renovar sem o usuário", () => {
    const c = contaDoPfm(DO_PFM, "u1");
    expect(JSON.stringify(c)).not.toMatch(/segredo/);
    expect(c).toMatchObject({
      user_id: "u1", platform: "linkedin", pfm_account_id: "spc_pagina", status: "connected",
      account_name: "PulseID - Solutions Architecture", expires_at: "2026-12-03T16:33:00Z",
      renovavel: true, refresh_expires_at: "2027-10-05T16:33:00Z",
    });
  });

  it("sem refresh token, ou com ele vencido, não é renovável", () => {
    expect(contaDoPfm({ ...DO_PFM, refresh_token: null, refresh_token_expires_at: null }, "u1")).toMatchObject({ renovavel: false, refresh_expires_at: null });
    expect(contaDoPfm({ ...DO_PFM, refresh_token_expires_at: "2026-10-01T00:00:00Z" }, "u1").renovavel).toBe(false);
  });

  it("refresh token sem data de fim vale como renovável", () => {
    expect(contaDoPfm({ ...DO_PFM, refresh_token_expires_at: null }, "u1")).toMatchObject({ renovavel: true, refresh_expires_at: null });
  });

  it("`expired` (o app lê para pedir 'Reconectar' e travar a conta) só vale quando precisa MESMO do usuário", () => {
    expect(contaDoPfm(DO_PFM, "u1").expired).toBe(false);
    // o caso de 05/10: acesso vencido, refresh token válido — o Post for Me renova, não é para travar
    expect(contaDoPfm({ ...DO_PFM, access_token_expires_at: ACESSO_VENCIDO }, "u1").expired).toBe(false);
    // acesso vencido sem como renovar: aí sim
    expect(contaDoPfm({ ...DO_PFM, access_token_expires_at: ACESSO_VENCIDO, refresh_token: null }, "u1").expired).toBe(true);
    expect(contaDoPfm({ ...DO_PFM, access_token_expires_at: ACESSO_VENCIDO, refresh_token_expires_at: "2026-10-02T00:00:00Z" }, "u1").expired).toBe(true);
    expect(contaDoPfm({ ...DO_PFM, access_token_expires_at: null }, "u1")).toMatchObject({ expires_at: null, expired: false });
  });
});

describe("publicador — o pré-check só barra o que o Post for Me não tem como renovar", () => {
  const alvo = (c: any) => ({ platform: c.platform, pfm_account_id: c.pfm_account_id, expires_at: c.expires_at, renovavel: c.renovavel });

  it("acesso vencido com refresh token válido PASSA: foi o bloqueio indevido de 05/10", () => {
    expect(bloqueioPorConexao(alvo(LAPSA))).toBeNull();
  });

  it("acesso vencido sem como renovar é barrado com a instrução de reconectar", () => {
    expect(bloqueioPorConexao(alvo(VENCIDA))).toBe("A conexão com o Instagram expirou. Reconecte a conta em Perfil → Conexões e tente publicar de novo.");
  });

  it("conta em dia e conta sem data passam", () => {
    expect(bloqueioPorConexao(alvo(PAGINA))).toBeNull();
    expect(bloqueioPorConexao(alvo(VENCENDO))).toBeNull();
    expect(bloqueioPorConexao({ platform: "x", pfm_account_id: "spc_x" })).toBeNull();
  });

  it("se a renovação automática falhar, o erro continua dizendo o que fazer e guarda o original", () => {
    const erro = erroComConexaoVencida("Failed to refresh LinkedIn token: invalid_grant", alvo(LAPSA));
    expect(erro).toMatch(/Linkedin/);
    expect(erro).toMatch(/renovação automática falhou/);
    expect(erro).toMatch(/Perfil → Conexões/);
    expect(erro).toContain("Failed to refresh LinkedIn token: invalid_grant");
  });

  it("erro em conta com o acesso em dia não é reescrito", () => {
    expect(erroComConexaoVencida("Failed to refresh LinkedIn token: invalid_grant", alvo(PAGINA))).toBe("Failed to refresh LinkedIn token: invalid_grant");
    expect(erroComConexaoVencida("Erro 422: mídia inválida", { platform: "x", pfm_account_id: "spc_x" })).toBe("Erro 422: mídia inválida");
  });

  it("erro que não é de acesso (mídia, legenda) não é jogado na conta da conexão, mesmo com o acesso vencido", () => {
    expect(erroComConexaoVencida("Erro 422: mídia inválida", alvo(LAPSA))).toBe("Erro 422: mídia inválida");
    // o 400/401 cru do axios é como a falha de renovação chega em algumas redes
    expect(erroComConexaoVencida("Request failed with status code 401", alvo(LAPSA))).toMatch(/renovação automática falhou/);
  });
});

describe("listar_conexoes — até quando a conexão se sustenta sem o usuário", () => {
  it("conta renovável mostra que renova sozinha e até quando", async () => {
    const { ctx } = contexto([PAGINA]);
    const r = await dispatchTool(ctx, "listar_conexoes", {});
    expect(r.content).toContain("- linkedin: PulseID - Solutions Architecture → conta=spc_pagina · renova sozinha · validade=2027-10-05 (365 dias)");
    expect(r.content).not.toMatch(/VENCIDA|ATENÇÃO/);
  });

  it("acesso vencido em conta renovável NÃO é conta vencida", async () => {
    const { ctx } = contexto([LAPSA]);
    const r = await dispatchTool(ctx, "listar_conexoes", {});
    expect(r.content).toContain("- linkedin: Raul Seixas → conta=spc_lapsa · renova sozinha · validade=2027-07-10 (278 dias)");
    expect(r.content).not.toMatch(/VENCIDA|ATENÇÃO/);
  });

  it("conta vencida sem como renovar vem marcada, com o que fazer e quem faz", async () => {
    const { ctx } = contexto([PAGINA, VENCIDA]);
    const r = await dispatchTool(ctx, "listar_conexoes", {});
    expect(r.content).toContain("- instagram: pulse.id → conta=spc_vencida · validade=2026-10-01 VENCIDA");
    expect(r.content).toMatch(/ATENÇÃO[^\n]*VENCIDA[^\n]*instagram \(pulse\.id\)/);
    expect(r.content).toMatch(/Perfil → Conexões/);
    // a conta em dia não entra no aviso
    expect(r.content).not.toMatch(/ATENÇÃO[^\n]*PulseID/);
  });

  it("conta sem renovação que vence em até 7 dias: avisa, e diz que publicar nela renova", async () => {
    const { ctx } = contexto([PAGINA, VENCENDO]);
    const r = await dispatchTool(ctx, "listar_conexoes", {});
    expect(r.content).toContain("- instagram: raulsxs → conta=spc_insta · validade=2026-10-10 (5 dias)");
    expect(r.content).toMatch(/ATENÇÃO[^\n]*vence[^\n]*instagram \(raulsxs\)[^\n]*2026-10-10/);
  });

  it("renovação automática perto do fim também é avisada", async () => {
    const { ctx } = contexto([FIM_DO_REFRESH]);
    const r = await dispatchTool(ctx, "listar_conexoes", {});
    expect(r.content).toContain("→ conta=spc_fim · renova sozinha · validade=2026-10-08 (3 dias)");
    expect(r.content).toMatch(/ATENÇÃO[^\n]*renovação automática[^\n]*linkedin \(TrendPulse\)[^\n]*2026-10-08/);
  });

  it("rede que não informa validade fica como era", async () => {
    const { ctx } = contexto([SEM_DATA]);
    const r = await dispatchTool(ctx, "listar_conexoes", {});
    expect(r.content).toMatch(/^- x: pulseid → conta=spc_x$/m);
  });

  it("quem lê por programa continua achando plataforma, nome e id", async () => {
    const { ctx } = contexto([PAGINA, LAPSA, VENCIDA, VENCENDO, SEM_DATA]);
    const r = await dispatchTool(ctx, "listar_conexoes", {});
    const lidas = [...r.content.matchAll(RE_CONEXAO)].map((m) => [m[1], m[2], m[3]]);
    expect(lidas).toEqual([
      ["linkedin", "PulseID - Solutions Architecture", "spc_pagina"],
      ["linkedin", "Raul Seixas", "spc_lapsa"],
      ["instagram", "pulse.id", "spc_vencida"],
      ["instagram", "raulsxs", "spc_insta"],
      ["x", "pulseid", "spc_x"],
    ]);
  });
});

describe("Post for Me fora do ar não é 'nenhuma conta conectada'", () => {
  // connect-social devolve lista vazia COM error=pfm_unavailable. Ler isso como "sem conta" faria o
  // agente mandar o usuário reconectar tudo à toa — o mesmo falso "reconecte" de 05/10, por outro caminho.
  const foraDoAr = () => {
    const { ctx, userClient } = contexto([], { generated_contents: [{ id: ID_OK }] });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ connections: [], error: "pfm_unavailable", message: "Não consegui verificar suas contas conectadas agora. Tente de novo em instantes." }), { status: 200 })));
    return { ctx, userClient };
  };

  it("listar_conexoes falha dizendo que não deu para verificar", async () => {
    const r = await dispatchTool(foraDoAr().ctx, "listar_conexoes", {});
    expect(r.ok).toBe(false);
    expect(r.content).toMatch(/Não consegui verificar/);
    expect(r.content).not.toMatch(/Nenhuma rede conectada|conectar em Perfil/);
  });

  it("agendar não conclui que a conta sumiu nem grava nada", async () => {
    const { ctx, userClient } = foraDoAr();
    const r = await resolverContas(ctx, ["linkedin"], ["spc_pagina"]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.erro).toMatch(/Não consegui verificar/);
      expect(r.erro).not.toMatch(/desconhecida|não tem conta/);
    }
    const a = await dispatchTool(ctx, "agendar_conteudo", { contentId: ID_OK, data_hora_iso: "2026-10-06T09:00:00-03:00", plataformas: ["linkedin"], contas: ["spc_pagina"] });
    expect(a.ok).toBe(false);
    expect(userClient.atualizacoes).toEqual([]);
  });
});

describe("agendar — conta que precisa reconectar é recusada na hora, não às 09:00 do dia", () => {
  it("resolverContas recusa a conta vencida pedida pelo id e diz como resolver", async () => {
    const { ctx } = contexto([PAGINA, VENCIDA]);
    const r = await resolverContas(ctx, ["instagram"], ["spc_vencida"]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.erro).toMatch(/instagram \(pulse\.id\)/);
      expect(r.erro).toMatch(/vencida/i);
      expect(r.erro).toMatch(/Perfil → Conexões/);
    }
  });

  it("recusa também quando a única conta da rede está vencida", async () => {
    const { ctx } = contexto([PAGINA, VENCIDA]);
    const r = await resolverContas(ctx, ["instagram"], []);
    expect(r.ok).toBe(false);
  });

  it("acesso vencido em conta renovável é aceito: o Post for Me renova ao publicar", async () => {
    const { ctx } = contexto([PAGINA, LAPSA]);
    expect(await resolverContas(ctx, ["linkedin"], ["spc_lapsa"])).toEqual({ ok: true, accountIds: ["spc_lapsa"] });
  });

  it("conta em dia segue passando", async () => {
    const { ctx } = contexto([PAGINA, VENCIDA]);
    expect(await resolverContas(ctx, ["linkedin"], ["spc_pagina"])).toEqual({ ok: true, accountIds: ["spc_pagina"] });
  });

  it("agendar_conteudo em conta vencida não grava nada", async () => {
    const { ctx, userClient } = contexto([VENCIDA], { generated_contents: [{ id: ID_OK }] });
    const r = await dispatchTool(ctx, "agendar_conteudo", { contentId: ID_OK, data_hora_iso: "2026-10-06T09:00:00-03:00", plataformas: ["instagram"], contas: ["spc_vencida"] });
    expect(r.ok).toBe(false);
    expect(r.content).toMatch(/vencida/i);
    expect(userClient.atualizacoes).toEqual([]);
  });
});

describe("listar_agenda — a peça que falhou diz por quê", () => {
  const linhas = [
    { id: ID_FALHA, title: "O custo invisível (da desorganização)", content_type: "post", scheduled_at: "2026-10-05T12:00:00Z", platform: "linkedin", status: "failed", publish_error: MOTIVO },
    { id: ID_OK, title: "Dados que transformam decisões", content_type: "post", scheduled_at: "2026-10-06T12:00:00Z", platform: "linkedin", status: "scheduled", publish_error: null },
  ];

  it("o motivo gravado pelo publicador vem na linha da peça", async () => {
    const { ctx } = contexto([], { generated_contents: linhas });
    const r = await dispatchTool(ctx, "listar_agenda", { de: "2026-10-05T00:00:00-03:00", ate: "2026-10-10T00:00:00-03:00" });
    const daFalha = r.content.split("\n").find((l) => l.includes(ID_FALHA))!;
    expect(daFalha).toContain(`→ content_id=${ID_FALHA} · FALHOU: ${MOTIVO}`);
    const daOk = r.content.split("\n").find((l) => l.includes(ID_OK))!;
    expect(daOk).not.toMatch(/FALHOU/);
  });

  it("falha sem motivo gravado é dita assim, não escondida", async () => {
    const { ctx } = contexto([], { generated_contents: [{ ...linhas[0], publish_error: null }] });
    const r = await dispatchTool(ctx, "listar_agenda", {});
    expect(r.content).toMatch(/FALHOU: motivo não registrado/);
  });

  it("o motivo fica numa linha só, mesmo quando o erro tem quebra de linha", async () => {
    const { ctx } = contexto([], { generated_contents: [{ ...linhas[0], publish_error: "Erro 400:\n  token inválido\n" }] });
    const r = await dispatchTool(ctx, "listar_agenda", {});
    expect(r.content.split("\n").filter((l) => l.includes("content_id=")).length).toBe(1);
    expect(r.content).toContain("FALHOU: Erro 400: token inválido");
  });

  it("quem lê por programa continua achando rede, estado e id", async () => {
    const { ctx } = contexto([], { generated_contents: linhas });
    const r = await dispatchTool(ctx, "listar_agenda", {});
    expect([...r.content.matchAll(RE_AGENDA)].map((m) => [m[1], m[2], m[3]])).toEqual([
      ["linkedin", "failed", ID_FALHA],
      ["linkedin", "scheduled", ID_OK],
    ]);
  });
});

describe("detalhes_conteudo — estado da publicação e a legenda que vai ao ar", () => {
  const peca = {
    id: ID_FALHA, title: "O custo invisível", content_type: "post", platform: "linkedin", slide_count: null, generation_metadata: {},
    caption: "Legenda padrão.", hashtags: ["#Um", "#Dois"], platform_captions: { linkedin: "Variante do LinkedIn.\n\n#Um #Dois", instagram: "Variante do Instagram." },
    image_urls: ["https://img/x.png"], rendered_image_urls: null, slides: null,
    status: "failed", publish_error: MOTIVO, scheduled_accounts: { platforms: ["linkedin"], accountIds: ["spc_pagina"] },
  };

  it("traz o estado e o motivo da falha", async () => {
    const { ctx } = contexto([], { generated_contents: [peca] });
    const r = await dispatchTool(ctx, "detalhes_conteudo", { contentId: ID_FALHA });
    expect(r.content).toMatch(/^status=failed$/m);
    expect(r.content).toContain(`erro_publicacao=${MOTIVO}`);
  });

  it("diz para quando está agendada e quando saiu, em horário de Brasília com fuso", async () => {
    const agendada = { ...peca, status: "scheduled", publish_error: null, scheduled_at: "2026-10-06T12:00:00Z", published_at: null };
    const a = await dispatchTool(contexto([], { generated_contents: [agendada] }).ctx, "detalhes_conteudo", { contentId: ID_FALHA });
    expect(a.content).toMatch(/^agendado_para=2026-10-06T09:00:00-03:00$/m);
    expect(a.content).not.toMatch(/publicado_em=/);
    // publicada pelo agendador: o publicador zera scheduled_at, então só sobra a hora em que saiu
    const publicada = { ...peca, status: "published", publish_error: null, scheduled_at: null, published_at: "2026-10-05T17:40:19.826Z" };
    const p = await dispatchTool(contexto([], { generated_contents: [publicada] }).ctx, "detalhes_conteudo", { contentId: ID_FALHA });
    expect(p.content).toMatch(/^status=published$/m);
    expect(p.content).toMatch(/^publicado_em=2026-10-05T14:40:19-03:00$/m);
    expect(p.content).not.toMatch(/agendado_para=/);
  });

  it("peça sem falha não ganha linha de erro", async () => {
    const { ctx } = contexto([], { generated_contents: [{ ...peca, status: "scheduled", publish_error: null }] });
    const r = await dispatchTool(ctx, "detalhes_conteudo", { contentId: ID_FALHA });
    expect(r.content).toMatch(/^status=scheduled$/m);
    expect(r.content).not.toMatch(/erro_publicacao=/);
  });

  it("a legenda é a variante da rede em que a peça sai, que é o que o publicador manda", async () => {
    const { ctx } = contexto([], { generated_contents: [peca] });
    const r = await dispatchTool(ctx, "detalhes_conteudo", { contentId: ID_FALHA });
    expect(r.content).toMatch(/legenda=Variante do LinkedIn\.\n\n#Um #Dois$/);
    expect(r.content).not.toContain("Legenda padrão.");
  });

  it("sem variante da rede, sai a legenda padrão com as hashtags, como no publicador", async () => {
    const { ctx } = contexto([], { generated_contents: [{ ...peca, platform_captions: { instagram: "Variante do Instagram." } }] });
    const r = await dispatchTool(ctx, "detalhes_conteudo", { contentId: ID_FALHA });
    expect(r.content).toMatch(/legenda=Legenda padrão\.\n\n#Um #Dois$/);
  });

  it("a legenda continua sendo a última linha e a imagem continua com prefixo fixo", async () => {
    const { ctx } = contexto([], { generated_contents: [peca] });
    const r = await dispatchTool(ctx, "detalhes_conteudo", { contentId: ID_FALHA });
    expect((r.content.match(/^imagem_url=(\S+)/m) || [])[1]).toBe("https://img/x.png");
    expect((r.content.match(/^legenda=([\s\S]*)$/m) || [])[1]).toBe("Variante do LinkedIn.\n\n#Um #Dois");
  });
});
