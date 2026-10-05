// publicacao.ts — o que o app e os agentes precisam saber ANTES e DEPOIS de publicar: quando uma conexão
// precisa do usuário, por que uma peça falhou e qual legenda vai ao ar. Tudo puro (sem rede, sem Deno):
// connect-social, publish-postforme e agent-tools usam isto, e os testes rodam no `npm test`.
//
// POR QUE EXISTE (2026-10-05): um post agendado no LinkedIn falhou com "A conexão com o Linkedin expirou.
// Reconecte a conta". O token de ACESSO tinha vencido (dura ~60 dias), mas a conta tinha refresh token
// válido, e o Post for Me renova o acesso sozinho na hora de publicar (trigger/post-to-platform.ts, no
// código aberto deles: renova quando faltam 7 dias ou menos, inclusive depois de vencido). O nosso pré-check
// barrava antes de ele tentar. "Acesso vencido" só quer dizer "reconecte" quando não há como renovar:
// Instagram, Facebook e Threads vencidos (renovam com o próprio token, que precisa estar vivo) e qualquer
// rede sem refresh token válido.

/** Conta como o connect-social devolve em action=list. */
export interface ContaConectada {
  platform: string;
  pfm_account_id: string;
  account_name?: string | null;
  /** Fim do token de acesso. */
  expires_at?: string | null;
  /** O Post for Me renova o acesso sem o usuário (tem refresh token válido). */
  renovavel?: boolean;
  /** Fim do refresh token, quando há: é o prazo real para reconectar. */
  refresh_expires_at?: string | null;
}

/** Com quantos dias de antecedência o agente é avisado de que a conexão vai precisar do usuário. */
export const DIAS_DE_AVISO = 7;

const ms = (iso: string | null | undefined): number | null => {
  const t = iso ? new Date(iso).getTime() : NaN;
  return Number.isFinite(t) ? t : null;
};
const diaSP = (t: number): string => new Date(t).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const rotulo = (c: ContaConectada): string => `${c.platform} (${c.account_name || "sem nome"})`;
const nomeDaRede = (p: string): string => p.charAt(0).toUpperCase() + p.slice(1);

/**
 * Conta do Post for Me (GET /v1/social-accounts) reduzida ao que o app e os agentes usam. Os tokens
 * NUNCA saem daqui: só as datas e se o Post for Me consegue renovar o acesso sem o usuário.
 * `expired` é o que o app lê para mostrar "Reconectar" e travar a conta nos modais de publicar e agendar:
 * só fica verdadeiro quando precisa mesmo do usuário (ver `precisaReconectar`).
 */
export function contaDoPfm(a: any, userId: string, agora = Date.now()) {
  const temRefresh = typeof a.refresh_token === "string" && a.refresh_token.length > 0;
  const fimDoRefresh = ms(a.refresh_token_expires_at);
  const conta = {
    user_id: userId,
    platform: a.platform as string,
    pfm_account_id: a.id as string,
    status: "connected",
    account_name: (a.username || a.name || null) as string | null,
    expires_at: (a.access_token_expires_at || null) as string | null,
    renovavel: temRefresh && (fimDoRefresh === null || fimDoRefresh > agora),
    refresh_expires_at: (temRefresh ? a.refresh_token_expires_at || null : null) as string | null,
  };
  return { ...conta, expired: precisaReconectar(conta, agora) };
}

/** Precisa do usuário: o acesso venceu e o Post for Me não tem como renovar. Só volta reconectando. */
export function precisaReconectar(c: Pick<ContaConectada, "expires_at" | "renovavel">, agora = Date.now()): boolean {
  const fim = ms(c.expires_at);
  return fim !== null && fim < agora && c.renovavel !== true;
}

/**
 * Até quando a conexão se sustenta sem o usuário: o fim do refresh token quando ela é renovável; senão o
 * fim do acesso. Null = sem prazo conhecido.
 */
function prazo(c: ContaConectada): number | null {
  return c.renovavel === true ? ms(c.refresh_expires_at) : ms(c.expires_at);
}

/** Dias de calendário (Brasília) até o prazo; 0 = hoje. Null quando não há prazo conhecido. */
export function diasDeValidade(c: ContaConectada, agora = Date.now()): number | null {
  const t = prazo(c);
  if (t === null) return null;
  return Math.round((Date.parse(diaSP(t)) - Date.parse(diaSP(agora))) / 86_400_000);
}

/**
 * Uma linha por conta. O COMEÇO (`- rede: nome → conta=id`) é lido por programa (o conselho da Pulse
 * tira dali plataforma, nome e id): a validade só entra depois dele.
 */
export function linhaDaConexao(c: ContaConectada, agora = Date.now()): string {
  const base = `- ${c.platform}: ${c.account_name || "(sem nome)"} → conta=${c.pfm_account_id}`;
  if (precisaReconectar(c, agora)) return `${base} · validade=${diaSP(ms(c.expires_at)!)} VENCIDA`;
  const sozinha = c.renovavel === true ? " · renova sozinha" : "";
  const t = prazo(c);
  if (t === null) return base + sozinha;
  const dias = diasDeValidade(c, agora)!;
  return `${base}${sozinha} · validade=${diaSP(t)} (${dias === 0 ? "vence hoje" : dias === 1 ? "1 dia" : `${dias} dias`})`;
}

/** Aviso no fim da lista: o que precisa do usuário agora e o que vai precisar logo. Vazio se está tudo em dia. */
export function avisoDeValidade(contas: ContaConectada[], agora = Date.now()): string {
  const vencidas = contas.filter((c) => precisaReconectar(c, agora));
  const noPrazo = contas.filter((c) => !precisaReconectar(c, agora) && (diasDeValidade(c, agora) ?? Infinity) <= DIAS_DE_AVISO);
  const comData = (lista: ContaConectada[]) => lista.map((c) => `${rotulo(c)} em ${diaSP(prazo(c)!)}`).join(", ");
  const fimDaRenovacao = noPrazo.filter((c) => c.renovavel === true);
  const vencendo = noPrazo.filter((c) => c.renovavel !== true);
  const partes: string[] = [];
  if (vencidas.length) {
    partes.push(`ATENÇÃO — conexão VENCIDA: ${vencidas.map(rotulo).join(", ")}. Publicar ou agendar nela é recusado. Só o dono da conta reconecta, em Perfil → Conexões: avise o usuário e não agende nessa conta até lá.`);
  }
  if (fimDaRenovacao.length) {
    partes.push(`ATENÇÃO — a renovação automática termina em até ${DIAS_DE_AVISO} dias: ${comData(fimDaRenovacao)}. Avise o usuário para reconectar em Perfil → Conexões antes disso.`);
  }
  if (vencendo.length) {
    partes.push(`ATENÇÃO — vence em até ${DIAS_DE_AVISO} dias: ${comData(vencendo)}. O acesso costuma renovar sozinho quando algo é publicado nessa conta antes da data; se nada sair por ela até lá, o usuário precisa reconectar em Perfil → Conexões.`);
  }
  return partes.join("\n");
}

/** Recusa de agendamento em conta que precisa reconectar: qual conta, desde quando e quem resolve. */
export function recusaPorContaVencida(vencidas: ContaConectada[]): string {
  const quais = vencidas.map((c) => `${rotulo(c)}, vencida desde ${diaSP(ms(c.expires_at)!)}`).join("; ");
  return `Conexão vencida: ${quais}. Agendar nela só adiaria a falha para a hora de publicar. Só o dono da conta reconecta, em Perfil → Conexões: avise o usuário e agende de novo depois.`;
}

/** Alvo de uma publicação, como o publish-postforme monta. */
type Alvo = { platform: string; pfm_account_id: string; expires_at?: string | null; renovavel?: boolean };

/**
 * Pré-check do publicador: barra ANTES de chamar o Post for Me só quando o acesso venceu e não há como
 * renovar (a rede devolveria um 400 genérico). Conta renovável passa: o Post for Me renova na hora.
 */
export function bloqueioPorConexao(alvo: Alvo, agora = Date.now()): string | null {
  if (!precisaReconectar(alvo, agora)) return null;
  return `A conexão com o ${nomeDaRede(alvo.platform)} expirou. Reconecte a conta em Perfil → Conexões e tente publicar de novo.`;
}

// Como uma falha de acesso chega do Post for Me: o texto da rede ("Failed to refresh LinkedIn token: ...")
// ou o 400/401/403 cru do axios deles. Erro de mídia ou de legenda não casa e segue como veio.
const ERRO_DE_ACESSO = /token|refresh|oauth|unauthori[sz]ed|invalid_grant|expired|revoked|status code 40[013]/i;

/**
 * Erro de acesso do Post for Me numa conta cujo acesso já estava vencido: a renovação automática não deu
 * certo (refresh token revogado, por exemplo). Mantém a instrução de reconectar e guarda o erro original.
 */
export function erroComConexaoVencida(erro: string, alvo: Alvo, agora = Date.now()): string {
  const fim = ms(alvo.expires_at);
  if (fim === null || fim >= agora || !ERRO_DE_ACESSO.test(erro)) return erro;
  return `A conexão com o ${nomeDaRede(alvo.platform)} tinha vencido e a renovação automática falhou. Reconecte a conta em Perfil → Conexões e tente publicar de novo. (${erro})`;
}

/**
 * Instante no relógio de Brasília com o fuso escrito (2026-10-06T09:00:00-03:00): serve a quem lê por
 * programa e a quem lê por modelo. O Brasil não tem horário de verão desde 2019, por isso o -03:00 fixo.
 */
export function instanteSP(iso: string | null | undefined): string | null {
  const t = ms(iso);
  if (t === null) return null;
  return new Date(t).toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).replace(" ", "T") + "-03:00";
}

/** Sufixo da linha da agenda para a peça que falhou; vazio nas demais. Sempre numa linha só. */
export function motivoDaFalha(status: string | null | undefined, erro: string | null | undefined): string {
  if (status !== "failed") return "";
  const motivo = String(erro || "").replace(/\s+/g, " ").trim();
  return ` · FALHOU: ${motivo || "motivo não registrado"}`;
}

/**
 * A legenda que VAI AO AR numa rede. Espelha o publicador (publish-postforme, `publishOne`): a variante
 * da rede quando existe; senão a legenda padrão com as hashtags. Mudou lá, muda aqui.
 */
export function legendaQueSai(
  c: { caption?: string | null; title?: string | null; hashtags?: unknown; platform_captions?: unknown },
  plataforma: string,
): string {
  const variantes = (c.platform_captions && typeof c.platform_captions === "object" ? c.platform_captions : {}) as Record<string, unknown>;
  const variante = variantes[plataforma];
  if (typeof variante === "string" && variante) return variante;
  const hashtags = Array.isArray(c.hashtags) ? "\n\n" + c.hashtags.join(" ") : "";
  return ((c.caption || c.title || "") + hashtags).trimEnd();
}
