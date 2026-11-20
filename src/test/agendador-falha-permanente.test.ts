/**
 * Sessão da Meta invalidada na hora de publicar uma peça agendada.
 *
 * Caso real (2026-11-06): a peça #40 da Pulse (Instagram, 06/11 12:00, content_id 1b18f0c4-…) falhou com
 * "Account needs to be reconnected: Error validating access token: The session has been invalidated
 * because the user changed their password or Facebook has changed the session for security reasons."
 * A conta estava `connected` em social_connections e o acesso não tinha vencido, então:
 *  1. o publicador só reconhecia "reconecte" quando o acesso JÁ estava vencido: gravou o erro cru, em inglês;
 *  2. o agendador tratou como passageiro: voltou a peça para scheduled e tentou mais duas vezes (cada uma
 *     um post novo, rejeitado, no Post for Me);
 *  3. o conselho da Pulse lê o motivo com /conex[aã]o|reconect|conectad/ para saber se é o Raul quem
 *     reconecta; "reconnected" não casa, e a falha virou tarefa de defeito em vez de aviso ao Raul.
 *
 * Run: npm test
 */
import { describe, it, expect } from "vitest";
import { erroComConexaoVencida, falhaDaPublicacao, semSegredo } from "../../supabase/functions/_shared/publicacao";
import { MAX_TENTATIVAS, corpoDaPublicacao, desfechoDaTentativa, publicarPecaVencida } from "../../supabase/functions/_shared/agendador";

// A MESMA expressão com que o conselho da Pulse decide que a falha é de conexão (pulse: kernel/conteudo.mjs).
const FALHA_DE_CONEXAO = /conex[aã]o|reconect|conectad/i;

const MSG_META =
  "Account needs to be reconnected: Error validating access token: The session has been invalidated because the user changed their password or Facebook has changed the session for security reasons.";

const ID_40 = "1b18f0c4-3ee9-4bcf-86d0-476b0b9132ef";
const ID_OUTRO = "3b4984eb-0000-4000-8000-000000000001";
const PULSE = "user-pulse";
const OUTRO_USUARIO = "user-maikon";
// Conta do cache social_connections: sem expires_at (o publicador não lê essa coluna do cache)
const INSTA_CACHE = { platform: "instagram", pfm_account_id: "spc_pulse_insta" };
// Conta do fallback do Post for Me, com o acesso no prazo: a sessão cai antes de vencer
const INSTA_NO_PRAZO = { ...INSTA_CACHE, expires_at: "2026-12-20T12:00:00Z", renovavel: false };

describe("falhaDaPublicacao — sessão da Meta invalidada", () => {
  it("a mensagem crua não diz 'reconecte' em português: era por isso que caía como defeito", () => {
    expect(FALHA_DE_CONEXAO.test(MSG_META)).toBe(false);
    // e a regra antiga só reconhecia com o acesso vencido
    expect(erroComConexaoVencida(MSG_META, INSTA_CACHE)).toBe(MSG_META);
  });

  it("com a conta do cache (sem validade) é permanente, orienta reconectar no Perfil e guarda o motivo técnico", () => {
    const f = falhaDaPublicacao(MSG_META, INSTA_CACHE);
    expect(f.permanente).toBe(true);
    expect(f.erro).toMatch(/^A conexão com o Instagram foi encerrada pela rede/);
    expect(f.erro).toContain("Reconecte a conta em Perfil → Conexões");
    expect(f.erro).toContain("The session has been invalidated");
    expect(FALHA_DE_CONEXAO.test(f.erro)).toBe(true);
  });

  it("com o acesso ainda no prazo também (o fallback do Post for Me traz a validade)", () => {
    expect(falhaDaPublicacao(MSG_META, INSTA_NO_PRAZO).permanente).toBe(true);
  });

  it("chega igual pelo 4xx do POST (\"Erro 400: …\") e pelo resultado da publicação", () => {
    expect(falhaDaPublicacao(`Erro 400: ${MSG_META}`, INSTA_CACHE).permanente).toBe(true);
    expect(falhaDaPublicacao("Error validating access token: Session has expired on Friday", INSTA_CACHE).permanente).toBe(true);
    expect(falhaDaPublicacao("Error validating access token: The user has not authorized application 123.", INSTA_CACHE).permanente).toBe(true);
  });

  it("erro de mídia, legenda ou rede fora do ar não é permanente e segue como veio", () => {
    for (const e of ["Erro 422: mídia inválida", "Erro 500: Internal Server Error", "fetch failed", "Erro 429: rate limit"]) {
      expect(falhaDaPublicacao(e, INSTA_CACHE)).toEqual({ erro: e, permanente: false });
    }
  });

  it("acesso vencido cuja renovação falhou continua permanente (regra de 2026-10-05)", () => {
    const vencida = { platform: "linkedin", pfm_account_id: "spc_l", expires_at: "2026-10-01T12:00:00Z", renovavel: true };
    const f = falhaDaPublicacao("Request failed with status code 401", vencida, Date.parse("2026-11-06T15:00:00Z"));
    expect(f.permanente).toBe(true);
    expect(f.erro).toMatch(/renovação automática falhou/);
  });
});

describe("semSegredo — nada de token no motivo gravado nem no log", () => {
  it("oculta token da Meta, JWT, Bearer e access_token= sem estragar o texto da Meta", () => {
    const tokenMeta = "EAAGm0PX4ZCpsBAKZCZBe1aZCs9ZBabcdef123456";
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
    const sujo = `${MSG_META} url=https://graph.facebook.com/v19/me?access_token=${tokenMeta}&x=1 Authorization: Bearer ${jwt} {"refresh_token":"rt_abc123"}`;
    const limpo = semSegredo(sujo);
    expect(limpo).not.toContain(tokenMeta);
    expect(limpo).not.toContain(jwt);
    expect(limpo).not.toContain("rt_abc123");
    expect(limpo).toContain("access_token=[oculto]");
    expect(limpo).toContain("Error validating access token: The session has been invalidated");
  });

  it("o motivo permanente sai sem o token mesmo que o Post for Me o devolva", () => {
    const f = falhaDaPublicacao(`${MSG_META} (access_token=EAAB1234567890abcdefXYZ)`, INSTA_CACHE);
    expect(f.erro).not.toContain("EAAB1234567890abcdefXYZ");
  });

  it("corta texto enorme e junta numa linha só", () => {
    const s = semSegredo("a b\n\nc " + "x ".repeat(500));
    expect(s.length).toBeLessThanOrEqual(401);
    expect(s).not.toMatch(/\n/);
  });
});

/** O que o publish-postforme devolve quando o Post for Me recusa (mesma montagem do `publishOne`). */
function respostaDoPublicador(erroDoPfm: string, alvo = INSTA_CACHE) {
  const falha = falhaDaPublicacao(erroDoPfm, alvo);
  return {
    ok: true,
    data: {
      success: false,
      message: "❌ Falha na publicação.",
      results: [{ platform: alvo.platform, accountId: alvo.pfm_account_id, success: false, error: falha.erro, ...(falha.permanente ? { permanent: true } : {}) }],
    },
  };
}

describe("desfechoDaTentativa — permanente x passageira", () => {
  it("permanente vai para failed já na 1ª tentativa e o publish_error diz que não tenta de novo", () => {
    const d = desfechoDaTentativa(respostaDoPublicador(MSG_META), 1);
    expect(d.status).toBe("failed");
    expect(d.permanente).toBe(true);
    expect(d.publish_error).toMatch(/^Falha permanente, sem nova tentativa automática: A conexão com o Instagram/);
    expect(FALHA_DE_CONEXAO.test(d.publish_error!)).toBe(true);
  });

  it("passageira volta para scheduled até a 3ª e diz qual tentativa foi", () => {
    const r = respostaDoPublicador("Erro 500: Internal Server Error");
    expect(desfechoDaTentativa(r, 1)).toEqual({ status: "scheduled", publish_error: "Falha temporária (tentativa 1 de 3), nova tentativa automática em alguns minutos: Erro 500: Internal Server Error" });
    expect(desfechoDaTentativa(r, 2).status).toBe("scheduled");
    expect(desfechoDaTentativa(r, 3)).toEqual({ status: "failed", publish_error: "Falhou nas 3 tentativas automáticas: Erro 500: Internal Server Error" });
  });

  it("erro do próprio publicador (HTTP não-ok) continua passageiro", () => {
    expect(desfechoDaTentativa({ ok: false, data: { error: "Internal error" } }, 1).status).toBe("scheduled");
    // mesmo que alguém mande permanent num erro HTTP: sem resposta confiável, não decide por permanente
    expect(desfechoDaTentativa({ ok: false, data: { error: "x", results: [{ success: false, permanent: true }] } }, 1).status).toBe("scheduled");
  });

  it("duas contas, uma permanente e outra passageira: tenta de novo (nada saiu, não duplica)", () => {
    const d = desfechoDaTentativa({ ok: true, data: { results: [
      { platform: "instagram", success: false, permanent: true, error: "A conexão com o Instagram foi encerrada" },
      { platform: "linkedin", success: false, error: "Erro 503" },
    ] } }, 1);
    expect(d.status).toBe("scheduled");
  });

  it("sucesso e pendente seguem como antes (o publicador já gravou a peça)", () => {
    expect(desfechoDaTentativa({ ok: true, data: { results: [{ success: true }] } }, 1)).toEqual({ status: "published" });
    expect(desfechoDaTentativa({ ok: true, data: { results: [{ success: false, pending: true }] } }, 1)).toEqual({ status: "pending" });
    // uma conta saiu e outra caiu por sessão: published (não repete a que saiu)
    expect(desfechoDaTentativa({ ok: true, data: { results: [{ success: true }, { success: false, permanent: true, error: "x" }] } }, 1).status).toBe("published");
  });
});

/**
 * generated_contents em memória com o que o agendador usa: update().eq().eq() e .select() depois do update
 * (devolve só as linhas trocadas, como o PostgREST).
 */
function bancoFalso(linhas: any[]) {
  const updates: Array<{ id: string; patch: any }> = [];
  const from = (tabela: string) => {
    expect(tabela).toBe("generated_contents");
    let patch: any = null;
    const filtros: Array<[string, any]> = [];
    const executa = () => {
      const alvo = linhas.filter((l) => filtros.every(([c, v]) => l[c] === v));
      for (const l of alvo) { Object.assign(l, patch); updates.push({ id: l.id, patch }); }
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
  return { from, updates };
}

/** Um tick do instagram-scheduler: a mesma consulta (scheduled, attempts < 3) e o passo por peça. */
async function tick(db: any, linhas: any[], publicar: (corpo: any) => Promise<{ ok: boolean; data: any }>) {
  const vencidas = linhas
    .filter((l) => l.status === "scheduled" && (l.publish_attempts ?? 0) < MAX_TENTATIVAS)
    .map((l) => ({ id: l.id, user_id: l.user_id, platform: l.platform, publish_attempts: l.publish_attempts, scheduled_accounts: l.scheduled_accounts }));
  const out = [];
  for (const c of vencidas) out.push(await publicarPecaVencida(db, c, publicar));
  return out;
}

const peca40 = () => ({
  id: ID_40, user_id: PULSE, platform: "instagram", status: "scheduled", publish_attempts: 0, publish_error: null,
  scheduled_at: "2026-11-06T15:00:00Z", title: "11,3%: o que a alíquota de referência muda na margem?",
  caption: "Legenda da peça", image_urls: ["https://x/40.png"],
  scheduled_accounts: { platforms: ["instagram"], accountIds: ["spc_pulse_insta"] },
});

describe("publicarPecaVencida — estado final de generated_contents", () => {
  it("peça #40: uma chamada ao publicador, failed na hora, e os ticks seguintes não a pegam de novo", async () => {
    const linhas = [peca40()];
    const db = bancoFalso(linhas);
    const chamadas: any[] = [];
    const publicar = async (corpo: any) => { chamadas.push(corpo); return respostaDoPublicador(MSG_META); };

    const [r] = await tick(db, linhas, publicar);
    await tick(db, linhas, publicar); // 12:05
    await tick(db, linhas, publicar); // 12:10

    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]).toEqual({ contentId: ID_40, platforms: ["instagram"], accountIds: ["spc_pulse_insta"] });
    expect(r).toMatchObject({ id: ID_40, status: "failed", permanent: true });
    const [p] = linhas;
    expect(p.status).toBe("failed");
    expect(p.publish_attempts).toBe(1);
    expect(p.publish_error).toMatch(/^Falha permanente, sem nova tentativa automática: A conexão com o Instagram/);
    expect(p.publish_error).toContain("Perfil → Conexões");
    expect(p.publish_error).toContain("The session has been invalidated");
    // a peça é a mesma: mesmo id, mesma legenda, mesma imagem, mesma data
    expect(p).toMatchObject({ id: ID_40, caption: "Legenda da peça", image_urls: ["https://x/40.png"], scheduled_at: "2026-11-06T15:00:00Z" });
    expect(new Set(db.updates.flatMap((u) => Object.keys(u.patch)))).toEqual(new Set(["status", "publish_attempts", "publish_error"]));
  });

  it("falha passageira continua com no máximo 3 tentativas, e o motivo diz em qual está", async () => {
    const linhas = [peca40()];
    const db = bancoFalso(linhas);
    let n = 0;
    const publicar = async () => { n++; return respostaDoPublicador("Erro 503: Service Unavailable"); };

    await tick(db, linhas, publicar);
    expect(linhas[0]).toMatchObject({ status: "scheduled", publish_attempts: 1 });
    expect(linhas[0].publish_error).toMatch(/^Falha temporária \(tentativa 1 de 3\)/);
    await tick(db, linhas, publicar);
    await tick(db, linhas, publicar);
    await tick(db, linhas, publicar);
    expect(n).toBe(3);
    expect(linhas[0]).toMatchObject({ status: "failed", publish_attempts: 3 });
    expect(linhas[0].publish_error).toMatch(/^Falhou nas 3 tentativas automáticas: Erro 503/);
  });

  it("só a peça que falhou muda: a peça de outro usuário no mesmo tick segue o próprio caminho", async () => {
    const outra = { id: ID_OUTRO, user_id: OUTRO_USUARIO, platform: "linkedin", status: "scheduled", publish_attempts: 0, scheduled_accounts: null };
    const linhas = [peca40(), outra];
    const db = bancoFalso(linhas);
    const publicar = async (corpo: any) => {
      if (corpo.contentId === ID_40) return respostaDoPublicador(MSG_META);
      // o publicador grava published na peça que saiu
      Object.assign(linhas[1], { status: "published" });
      return { ok: true, data: { results: [{ platform: "linkedin", success: true }] } };
    };
    const rs = await tick(db, linhas, publicar);
    expect(rs.map((r) => r.status)).toEqual(["failed", "published"]);
    expect(linhas[1]).toMatchObject({ status: "published", publish_attempts: 1 });
    expect(linhas[1].publish_error).toBeUndefined();
    expect(db.updates.filter((u) => u.id === ID_OUTRO).map((u) => u.patch)).toEqual([{ status: "publishing", publish_attempts: 1 }]);
  });

  it("peça que outra execução já travou não é publicada de novo", async () => {
    const linhas = [{ ...peca40(), status: "publishing", publish_attempts: 1 }];
    const db = bancoFalso(linhas);
    let n = 0;
    // a consulta já tinha lido a peça como scheduled; outra execução a travou antes deste lock
    const r = await publicarPecaVencida(db, { id: ID_40, platform: "instagram", publish_attempts: 0 }, async () => { n++; return { ok: true, data: {} }; });
    expect(r.status).toBe("lock_lost");
    expect(n).toBe(0);
    expect(linhas[0]).toMatchObject({ status: "publishing", publish_attempts: 1 });
  });

  it("se o usuário reagendou enquanto o publicador rodava, o resultado não passa por cima", async () => {
    const linhas = [peca40()];
    const db = bancoFalso(linhas);
    await tick(db, linhas, async () => {
      Object.assign(linhas[0], { status: "scheduled", publish_attempts: 0, publish_error: null, scheduled_at: "2026-11-07T15:00:00Z" });
      return respostaDoPublicador(MSG_META);
    });
    expect(linhas[0]).toMatchObject({ status: "scheduled", publish_attempts: 0, publish_error: null, scheduled_at: "2026-11-07T15:00:00Z" });
  });

  it("erro de rede ao chamar o publicador é passageiro, como sempre foi", async () => {
    const linhas = [peca40()];
    const db = bancoFalso(linhas);
    const r = await publicarPecaVencida(db, linhas[0], async () => { throw new Error("connection reset"); });
    expect(r.status).toBe("scheduled");
    expect(linhas[0].publish_error).toMatch(/^Falha temporária \(tentativa 1 de 3\).*connection reset/);
  });

  it("sem contas escolhidas, publica só na rede de criação (agendamento antigo)", () => {
    expect(corpoDaPublicacao({ id: ID_40, platform: "linkedin", scheduled_accounts: null })).toEqual({ contentId: ID_40, platforms: ["linkedin"] });
    expect(corpoDaPublicacao({ id: ID_40, platform: null, scheduled_accounts: { platforms: [], accountIds: ["spc_a"] } }))
      .toEqual({ contentId: ID_40, platforms: ["instagram"], accountIds: ["spc_a"] });
  });
});
