/**
 * Sessão da Meta invalidada: a peça #19 da Pulse (Instagram, 11/11/2026 12:00, content_id
 * 4b9f9041-09df-4467-8643-d6e3077d0dc6) caiu com a mesma mensagem da peça #40 (06/11), cuja correção ficou
 * numa branch e nunca chegou à main. Este arquivo cobre o caso literal da #19 e o que o teste da #40
 * (agendador-falha-permanente.test.ts) não cobria: as outras formas do mesmo erro, mídia e legenda que NÃO
 * são de conexão, e nenhum segredo no publish_error nem no log do agendador.
 *
 * Run: npm test
 */
import { describe, it, expect } from "vitest";
import { falhaDaPublicacao, semSegredo } from "../../supabase/functions/_shared/publicacao";
import { desfechoDaTentativa, publicarPecaVencida } from "../../supabase/functions/_shared/agendador";

// A expressão com que o conselho da Pulse decide que a falha é de conexão (pulse: kernel/conteudo.mjs).
const FALHA_DE_CONEXAO = /conex[aã]o|reconect|conectad/i;

const MSG_19 =
  "Account needs to be reconnected: Error validating access token: The session has been invalidated because the user changed their password or Facebook has changed the session for security reasons.";
const ID_19 = "4b9f9041-09df-4467-8643-d6e3077d0dc6";
// Como o publicador vê a conta do Instagram da Pulse: connected no cache, sem validade (ou no prazo).
const INSTA = { platform: "instagram", pfm_account_id: "spc_pulse_insta" };
const INSTA_NO_PRAZO = { ...INSTA, expires_at: "2027-01-10T12:00:00Z", renovavel: false };
const AGORA = Date.parse("2026-11-11T15:00:00Z");

const JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.c2VncmVkby1kby1zZXJ2aWNlLXJvbGU";
const TOKEN_META = "EAAGm0PX4ZCpsBAKZCZBe1aZCs9ZBpeca19xyz";

/** O que o publish-postforme devolve ao agendador (mesma montagem do `publishOne`). */
function respostaDoPublicador(erroDoPfm: string, alvo: { platform: string; pfm_account_id: string } = INSTA) {
  const falha = falhaDaPublicacao(erroDoPfm, alvo, AGORA);
  return {
    ok: true,
    data: {
      success: false,
      message: "❌ Falha na publicação.",
      results: [{ platform: alvo.platform, accountId: alvo.pfm_account_id, success: false, error: falha.erro, ...(falha.permanente ? { permanent: true } : {}) }],
    },
  };
}

/** generated_contents em memória: update().eq().eq() e .select() devolvendo as linhas trocadas (PostgREST). */
function bancoFalso(linhas: any[]) {
  const from = () => {
    let patch: any = null;
    const filtros: Array<[string, any]> = [];
    const executa = () => {
      const alvo = linhas.filter((l) => filtros.every(([c, v]) => l[c] === v));
      for (const l of alvo) Object.assign(l, patch);
      return alvo.map((l) => ({ id: l.id }));
    };
    const q: any = {
      update: (p: any) => { patch = p; return q; },
      eq: (c: string, v: any) => { filtros.push([c, v]); return q; },
      select: async () => ({ data: executa(), error: null }),
      then: (ok: any, ko: any) => Promise.resolve({ data: null, error: null, _: executa() }).then(ok, ko),
    };
    return q;
  };
  return { from };
}

const peca19 = () => ({
  id: ID_19, user_id: "user-pulse", platform: "instagram", status: "scheduled", publish_attempts: 0, publish_error: null,
  scheduled_at: "2026-11-11T15:00:00Z", caption: "Legenda da #19", image_urls: ["https://x/19.png"],
  scheduled_accounts: { platforms: ["instagram"], accountIds: ["spc_pulse_insta"] },
});

/** Ticks do instagram-scheduler: a mesma consulta (scheduled, attempts < 3) e o passo por peça. */
async function ticks(n: number, db: any, linhas: any[], publicar: (corpo: any) => Promise<{ ok: boolean; data: any }>, log?: (m: string) => void) {
  for (let i = 0; i < n; i++) {
    for (const l of linhas.filter((x) => x.status === "scheduled" && (x.publish_attempts ?? 0) < 3)) {
      await publicarPecaVencida(db, { ...l }, publicar, log);
    }
  }
}

describe("peça #19 — a mensagem literal do Post for Me", () => {
  it("é falha permanente e orienta reconectar em Perfil → Conexões, com a conta do cache ou no prazo", () => {
    for (const alvo of [INSTA, INSTA_NO_PRAZO]) {
      const f = falhaDaPublicacao(MSG_19, alvo, AGORA);
      expect(f.permanente).toBe(true);
      expect(f.erro).toMatch(/^A conexão com o Instagram foi encerrada pela rede/);
      expect(f.erro).toContain("Reconecte a conta em Perfil → Conexões");
      expect(f.erro).toContain("nova tentativa automática não resolve");
      expect(f.erro).toContain("The session has been invalidated");
      // o conselho passa a ler como "só o Raul reconecta", e não como defeito
      expect(FALHA_DE_CONEXAO.test(f.erro)).toBe(true);
    }
  });

  it("vem igual pelo 4xx do POST e pelo resultado da publicação", () => {
    expect(falhaDaPublicacao(`Erro 400: ${MSG_19}`, INSTA, AGORA).permanente).toBe(true);
    expect(falhaDaPublicacao(MSG_19.toUpperCase(), INSTA, AGORA).permanente).toBe(true);
  });

  it("no agendador: uma chamada só, failed na 1ª tentativa, e os ticks de 12:05 e 12:10 não a pegam", async () => {
    const linhas = [peca19()];
    const db = bancoFalso(linhas);
    const chamadas: any[] = [];
    await ticks(3, db, linhas, async (corpo) => { chamadas.push(corpo); return respostaDoPublicador(MSG_19); });

    expect(chamadas).toEqual([{ contentId: ID_19, platforms: ["instagram"], accountIds: ["spc_pulse_insta"] }]);
    expect(linhas[0]).toMatchObject({ id: ID_19, status: "failed", publish_attempts: 1 });
    expect(linhas[0].publish_error).toMatch(/^Falha permanente, sem nova tentativa automática: A conexão com o Instagram/);
    expect(linhas[0].publish_error).toContain("Perfil → Conexões");
    // a peça não muda: legenda, imagem e data como estavam
    expect(linhas[0]).toMatchObject({ caption: "Legenda da #19", image_urls: ["https://x/19.png"], scheduled_at: "2026-11-11T15:00:00Z" });
  });

  it("falha permanente nunca deixa scheduled, nem na última tentativa", () => {
    for (const tentativa of [1, 2, 3]) {
      const d = desfechoDaTentativa(respostaDoPublicador(MSG_19), tentativa);
      expect(d).toMatchObject({ status: "failed", permanente: true });
    }
  });

  it("peça que já falhou continua failed: o agendador só pega scheduled", async () => {
    const linhas = [{ ...peca19(), status: "failed", publish_attempts: 1, publish_error: "Falha permanente, sem nova tentativa automática: …" }];
    const db = bancoFalso(linhas);
    let n = 0;
    await ticks(3, db, linhas, async () => { n++; return respostaDoPublicador(MSG_19); });
    // e mesmo que alguém a passe adiante por engano, o lock (scheduled → publishing) não a pega
    const r = await publicarPecaVencida(db, { id: ID_19, platform: "instagram", publish_attempts: 0 }, async () => { n++; return { ok: true, data: {} }; });
    expect(n).toBe(0);
    expect(r.status).toBe("lock_lost");
    expect(linhas[0]).toMatchObject({ status: "failed", publish_attempts: 1 });
  });
});

describe("as outras formas do mesmo erro também pedem reconexão", () => {
  const casos = [
    "Error validating access token: Session has expired on Wednesday, 11-Nov-26 04:00:00 PST.",
    "Invalid OAuth access token - Cannot parse access token",
    "Invalid OAuth 2.0 Access Token",
    "Error validating access token: The user has not authorized application 123456.",
    "The token used in the request has been revoked by the user",
    "REVOKED_ACCESS_TOKEN",
    "Permissions have been revoked",
    "Failed to refresh LinkedIn token: invalid_grant",
  ];
  for (const e of casos) {
    it(e, () => {
      const f = falhaDaPublicacao(e, INSTA_NO_PRAZO, AGORA);
      expect(f.permanente).toBe(true);
      expect(f.erro).toContain("Perfil → Conexões");
    });
  }
});

describe("mídia e legenda continuam falha de conteúdo, não de conexão", () => {
  const casos = [
    "Erro 400: The image's aspect ratio is not supported.",
    "Erro 400: Media ID is not available",
    "(#9004) The media could not be fetched from this uri: https://x/19.png",
    "Only photo or video can be accepted as media type.",
    "Erro 400: The caption exceeds the maximum length of 2200 characters",
    "Invalid parameter: caption contains too many hashtags (max 30)",
    "Erro 422: mídia inválida",
    "Erro 500: Internal Server Error",
  ];
  for (const e of casos) {
    it(e, () => {
      const f = falhaDaPublicacao(e, INSTA_NO_PRAZO, AGORA);
      expect(f).toEqual({ erro: e, permanente: false });
      expect(FALHA_DE_CONEXAO.test(f.erro)).toBe(false);
    });
  }

  it("mesmo com o acesso vencido, erro de mídia não vira 'reconecte'", () => {
    const vencida = { platform: "instagram", pfm_account_id: "spc_v", expires_at: "2026-11-01T00:00:00Z", renovavel: false };
    expect(falhaDaPublicacao("Erro 400: The image's aspect ratio is not supported.", vencida, AGORA).permanente).toBe(false);
  });

  it("no agendador, falha de mídia tenta de novo (até 3) e não fala em conexão", () => {
    const d = desfechoDaTentativa(respostaDoPublicador("Erro 400: Media ID is not available"), 1);
    expect(d.status).toBe("scheduled");
    expect(FALHA_DE_CONEXAO.test(d.publish_error!)).toBe(false);
  });
});

describe("nenhum token, JWT, Bearer ou access_token no publish_error, na resposta ou no log", () => {
  const sujo = `${MSG_19} GET https://graph.facebook.com/v21.0/me?access_token=${TOKEN_META}&fields=id Authorization: Bearer ${JWT} {"access_token": "${TOKEN_META}", "refresh_token":"rt_segredo_123"} apikey=sk_live_abc123`;
  const segredos = [TOKEN_META, JWT, "rt_segredo_123", "sk_live_abc123"];

  it("semSegredo tira todos e mantém o texto da Meta legível", () => {
    const limpo = semSegredo(sujo, 2000);
    for (const s of segredos) expect(limpo).not.toContain(s);
    expect(limpo).toContain("Bearer [oculto]");
    expect(limpo).toContain("access_token=[oculto]");
    expect(limpo).toContain("Error validating access token: The session has been invalidated");
  });

  it("texto comum com 'token' e 'basic' não é estragado", () => {
    expect(semSegredo("Error validating access token: Basic plan does not allow this")).toBe("Error validating access token: Basic plan does not allow this");
  });

  it("publish_error, retorno e log do agendador saem limpos quando o Post for Me devolve credencial", async () => {
    const linhas = [peca19()];
    const db = bancoFalso(linhas);
    const logs: string[] = [];
    const r = await publicarPecaVencida(db, { ...linhas[0] }, async () => respostaDoPublicador(sujo), (m) => logs.push(m));
    const tudo = [linhas[0].publish_error, r.error, ...logs].join("\n");
    for (const s of segredos) expect(tudo).not.toContain(s);
    expect(r).toMatchObject({ status: "failed", permanent: true });
  });

  it("erro geral do publicador e erro de rede ao chamá-lo também saem limpos", async () => {
    for (const publicar of [
      async () => ({ ok: false, data: { error: `upstream 401 Authorization: Bearer ${JWT}` } }),
      async () => { throw new Error(`connect failed (token=${TOKEN_META}, Bearer ${JWT})`); },
    ]) {
      const linhas = [peca19()];
      const db = bancoFalso(linhas);
      const logs: string[] = [];
      const r = await publicarPecaVencida(db, { ...linhas[0] }, publicar, (m) => logs.push(m));
      const tudo = [linhas[0].publish_error, r.error, ...logs].join("\n");
      for (const s of segredos) expect(tudo).not.toContain(s);
      // sem resposta confiável do publicador: passageiro, volta para nova tentativa
      expect(linhas[0].status).toBe("scheduled");
    }
  });
});
