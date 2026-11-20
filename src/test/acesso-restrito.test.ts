/**
 * Conta do Instagram RESTRITA pela Meta: a peça #68 da Pulse (Instagram, 20/11/2026 12:00, content_id
 * fba9374e-475d-438e-a711-f5e632605763) caiu com "Account needs to be reconnected: User access is restricted".
 * É o Instagram travando a conta (checkpoint: data de nascimento, aviso de segurança) até o dono entrar no
 * app e concluir o que ele pede. Nova tentativa automática só gera outro post rejeitado no Post for Me.
 *
 * Este arquivo cobre o texto literal da #68, o mesmo caso sem o prefixo do Post for Me e no código 2207050
 * da Meta, a transição do agendador (failed na 1ª, sem nova chamada) e que sessão invalidada, acesso vencido
 * e falhas passageiras continuam cada um no seu caso.
 *
 * Run: npm test
 */
import { describe, it, expect } from "vitest";
import { falhaDaPublicacao } from "../../supabase/functions/_shared/publicacao";
import { desfechoDaTentativa, publicarPecaVencida } from "../../supabase/functions/_shared/agendador";

// A expressão com que o conselho da Pulse decide que a falha é de conexão (pulse: kernel/conteudo.mjs).
const FALHA_DE_CONEXAO = /conex[aã]o|reconect|conectad/i;

const MSG_68 = "Account needs to be reconnected: User access is restricted";
const ID_68 = "fba9374e-475d-438e-a711-f5e632605763";
const INSTA = { platform: "instagram", pfm_account_id: "spc_pulse_insta" };
const INSTA_NO_PRAZO = { ...INSTA, expires_at: "2027-01-10T12:00:00Z", renovavel: false };
const AGORA = Date.parse("2026-11-20T15:00:00Z");
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

const peca68 = () => ({
  id: ID_68, user_id: "user-pulse", platform: "instagram", status: "scheduled", publish_attempts: 0, publish_error: null,
  scheduled_at: "2026-11-20T15:00:00Z", caption: "3 números para não vender com margem escondida", image_urls: ["https://x/68.png"],
  scheduled_accounts: { platforms: ["instagram"], accountIds: ["spc_pulse_insta"] },
});

/** Ticks do instagram-scheduler: a mesma consulta (scheduled, attempts < 3) e o passo por peça. */
async function ticks(n: number, db: any, linhas: any[], publicar: (corpo: any) => Promise<{ ok: boolean; data: any }>) {
  for (let i = 0; i < n; i++) {
    for (const l of linhas.filter((x) => x.status === "scheduled" && (x.publish_attempts ?? 0) < 3)) {
      await publicarPecaVencida(db, { ...l }, publicar);
    }
  }
}

describe("peça #68 — 'User access is restricted'", () => {
  it("o texto literal é falha permanente, diz o que fazer e o conselho lê como conexão", () => {
    for (const alvo of [INSTA, INSTA_NO_PRAZO]) {
      const f = falhaDaPublicacao(MSG_68, alvo, AGORA);
      expect(f.permanente).toBe(true);
      expect(f.erro).toMatch(/^O Instagram restringiu o acesso desta conta/);
      expect(f.erro).toContain("app do Instagram");
      expect(f.erro).toContain("Perfil → Conexões");
      expect(f.erro).toContain("nova tentativa automática não resolve");
      // o motivo técnico fica no fim, para quem diagnostica
      expect(f.erro).toContain("(Account needs to be reconnected: User access is restricted)");
      expect(FALHA_DE_CONEXAO.test(f.erro)).toBe(true);
    }
  });

  it("não é confundida com sessão invalidada: a orientação é outra", () => {
    expect(falhaDaPublicacao(MSG_68, INSTA, AGORA).erro).not.toContain("foi encerrada pela rede");
  });

  it("vem igual pelo 4xx do POST, sem o prefixo do Post for Me e no código 2207050 da Meta", () => {
    for (const e of [
      `Erro 400: ${MSG_68}`,
      "User access is restricted",
      "USER ACCESS IS RESTRICTED",
      "(#2207050) The app user's Instagram Professional account is inactive, checkpointed, or restricted.",
    ]) {
      const f = falhaDaPublicacao(e, INSTA, AGORA);
      expect(f.permanente).toBe(true);
      expect(f.erro).toMatch(/^O Instagram restringiu o acesso desta conta/);
    }
  });

  it("no Facebook o texto fala da rede certa", () => {
    const f = falhaDaPublicacao(MSG_68, { platform: "facebook", pfm_account_id: "spc_fb" }, AGORA);
    expect(f.erro).toMatch(/^O Facebook restringiu o acesso desta conta/);
    expect(f.erro).toContain("app do Facebook");
  });

  it("não guarda token que venha junto do texto", () => {
    const f = falhaDaPublicacao(`${MSG_68} (access_token=${TOKEN_META})`, INSTA, AGORA);
    expect(f.erro).not.toContain(TOKEN_META);
    expect(f.permanente).toBe(true);
  });
});

describe("peça #68 no agendador", () => {
  it("uma chamada só ao publicador; failed na 1ª tentativa; os ticks seguintes não a pegam", async () => {
    const linhas = [peca68()];
    const db = bancoFalso(linhas);
    const chamadas: any[] = [];
    await ticks(3, db, linhas, async (corpo) => { chamadas.push(corpo); return respostaDoPublicador(MSG_68); });

    expect(chamadas).toEqual([{ contentId: ID_68, platforms: ["instagram"], accountIds: ["spc_pulse_insta"] }]);
    expect(linhas[0]).toMatchObject({ id: ID_68, status: "failed", publish_attempts: 1 });
    expect(linhas[0].publish_error).toMatch(/^Falha permanente, sem nova tentativa automática: O Instagram restringiu o acesso/);
    expect(linhas[0].publish_error).toContain("Perfil → Conexões");
    // a peça não muda: legenda, imagem e data como estavam
    expect(linhas[0]).toMatchObject({ caption: peca68().caption, image_urls: ["https://x/68.png"], scheduled_at: "2026-11-20T15:00:00Z" });
  });

  it("nunca volta a scheduled, em nenhuma tentativa", () => {
    for (const tentativa of [1, 2, 3]) {
      expect(desfechoDaTentativa(respostaDoPublicador(MSG_68), tentativa)).toMatchObject({ status: "failed", permanente: true });
    }
  });

  it("peça já travada por outra execução não é publicada de novo", async () => {
    const linhas = [{ ...peca68(), status: "publishing", publish_attempts: 1 }];
    const db = bancoFalso(linhas);
    let n = 0;
    const r = await publicarPecaVencida(db, { ...peca68() }, async () => { n++; return respostaDoPublicador(MSG_68); });
    expect(n).toBe(0);
    expect(r.status).toBe("lock_lost");
    expect(linhas[0]).toMatchObject({ status: "publishing", publish_attempts: 1 });
  });
});

describe("os outros casos seguem separados", () => {
  it("passageiro (rede fora, 429, 500, mídia) tenta de novo e não fala em conexão", () => {
    for (const e of ["fetch failed", "Erro 429: rate limit", "Erro 500: Internal Server Error", "Erro 400: Media ID is not available"]) {
      const f = falhaDaPublicacao(e, INSTA_NO_PRAZO, AGORA);
      expect(f).toEqual({ erro: e, permanente: false });
      const d = desfechoDaTentativa(respostaDoPublicador(e), 1);
      expect(d.status).toBe("scheduled");
      expect(FALHA_DE_CONEXAO.test(d.publish_error!)).toBe(false);
    }
  });

  it("'restricted' de conteúdo (idade, região) não é conta restrita", () => {
    for (const e of ["Erro 400: This video is age restricted", "Erro 400: Content restricted in your region"]) {
      expect(falhaDaPublicacao(e, INSTA_NO_PRAZO, AGORA).permanente).toBe(false);
    }
  });

  it("sessão invalidada continua 'encerrada pela rede'", () => {
    const f = falhaDaPublicacao("Account needs to be reconnected: Error validating access token: The session has been invalidated because the user changed their password.", INSTA, AGORA);
    expect(f.permanente).toBe(true);
    expect(f.erro).toMatch(/^A conexão com o Instagram foi encerrada pela rede/);
  });

  it("acesso vencido que a renovação não salvou continua 'renovação automática falhou'", () => {
    const vencida = { platform: "linkedin", pfm_account_id: "spc_l", expires_at: "2026-11-01T12:00:00Z", renovavel: true };
    const f = falhaDaPublicacao("Request failed with status code 401", vencida, AGORA);
    expect(f.permanente).toBe(true);
    expect(f.erro).toMatch(/renovação automática falhou/);
  });
});
