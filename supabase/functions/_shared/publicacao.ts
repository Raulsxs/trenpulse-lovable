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

// ───────────────────────────── Depois de publicar ─────────────────────────────

/**
 * O que o publicador grava na peça quando a publicação dá certo.
 *
 * POR QUE EXISTE (2026-10-05): a gravação era `scheduled_at: scheduledAt || null`. Publicação feita na
 * hora não traz `scheduledAt`, então a data agendada era APAGADA — e o calendário e o `listar_agenda`
 * só mostram o que tem data. Em 286 peças publicadas, 257 tinham sumido do calendário.
 *
 * Publicou agora: marca published e NÃO toca em `scheduled_at` (a peça continua no dia em que estava).
 * Agendou no Post for Me: segue scheduled, na data pedida.
 * O agendador só reprocessa `status = scheduled`, então manter a data numa peça publicada não a republica.
 */
export function estadoAposPublicar(scheduledAt: string | null | undefined, agoraIso: string): Record<string, unknown> {
  if (scheduledAt) return { status: "scheduled", published_at: null, scheduled_at: scheduledAt };
  return { status: "published", published_at: agoraIso };
}

// ──────────────────────────────── Recorrentes ────────────────────────────────

/** Linha de `recurring_schedules`, no que o agendador e os agentes usam. */
export interface Recorrente {
  id?: string;
  name?: string | null;
  platforms?: string[] | null;
  /** Perfis escolhidos (ids do Post for Me). Vazio/null = recorrente antigo, que só conhece a rede. */
  account_ids?: string[] | null;
  days_of_week?: number[] | null;
  hour_utc?: number | null;
  active?: boolean;
  last_error?: string | null;
}

export interface AlvosDoRecorrente {
  /** false = não há onde publicar: o agendador NÃO cria a cópia (ela falharia três vezes em silêncio). */
  publica: boolean;
  platforms: string[];
  /** Vazio com `publica: true` = perfil ambíguo num recorrente antigo: o publicador escolhe como sempre fez. */
  accountIds: string[];
  /** O que o dono precisa saber; vai para `last_error` e aparece na tela e no listar_agenda. */
  aviso: string | null;
}

/**
 * Em quais contas um recorrente publica HOJE, dadas as contas conectadas do dono.
 *
 * POR QUE EXISTE (2026-10-05): o agendador criava a cópia do recorrente sem conta nenhuma, só com a
 * primeira rede. Duas consequências medidas em produção:
 *  - rede SEM conta (recorrente de Facebook de quem não tem Facebook): a cópia falhava três vezes com
 *    "Nenhuma conta selecionada" e morria. Sete dias de falha entre 14/09 e 05/10, sem aviso a ninguém.
 *  - rede com VÁRIAS contas: o publicador caía no legado e pegava a primeira da lista.
 *
 * Recorrente com perfis escolhidos (`account_ids`): publica exatamente neles, tirando os que não estão
 * mais conectados. Recorrente antigo: usa a primeira rede, como sempre usou — as outras redes de
 * `platforms` NUNCA foram publicadas, e passar a publicá-las agora faria um perfil começar a postar
 * todo dia sem o dono ter visto. Isso fica avisado, não ligado.
 *  - uma conta na rede → grava a conta (deixa de depender da ordem da lista);
 *  - várias → mantém o comportamento antigo e avisa para escolher o perfil;
 *  - nenhuma → não publica e avisa.
 */
export function alvosDoRecorrente(r: Recorrente, contas: ContaConectada[], agora = Date.now()): AlvosDoRecorrente {
  const usaveis = contas.filter((c) => c.pfm_account_id && !precisaReconectar(c, agora));
  const escolhidos = (r.account_ids || []).filter(Boolean);

  if (escolhidos.length) {
    const vivos = usaveis.filter((c) => escolhidos.includes(c.pfm_account_id));
    if (!vivos.length) {
      return { publica: false, platforms: [], accountIds: [], aviso: "Nenhum dos perfis escolhidos está conectado: nada foi publicado. Reconecte em Perfil → Conexões ou recrie o recorrente." };
    }
    const faltam = escolhidos.length - vivos.length;
    return {
      publica: true,
      platforms: [...new Set(vivos.map((c) => c.platform))],
      accountIds: vivos.map((c) => c.pfm_account_id),
      aviso: faltam ? `${faltam} dos perfis escolhidos não está mais conectado: publicando só nos demais. Reconecte em Perfil → Conexões.` : null,
    };
  }

  const redes = (r.platforms || []).filter(Boolean);
  const rede = redes[0] || "instagram";
  const outras = redes.slice(1);
  const notaOutras = outras.length ? ` Este recorrente é antigo e publica só em ${rede}: ${outras.join(", ")} não sai. Recrie-o escolhendo os perfis.` : "";
  const daRede = usaveis.filter((c) => c.platform === rede);

  if (!daRede.length) {
    return { publica: false, platforms: [rede], accountIds: [], aviso: `Sem conta de ${rede} conectada: nada foi publicado. Conecte em Perfil → Conexões ou recrie o recorrente em outra rede.${notaOutras}` };
  }
  if (daRede.length === 1) {
    return { publica: true, platforms: [rede], accountIds: [daRede[0].pfm_account_id], aviso: notaOutras.trim() || null };
  }
  return { publica: true, platforms: [rede], accountIds: [], aviso: `Há ${daRede.length} perfis de ${rede} conectados e este recorrente não diz qual: está saindo no primeiro da lista. Recrie-o escolhendo o perfil.${notaOutras}` };
}

const DIAS_DA_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/**
 * Uma linha por recorrente, para o `listar_agenda`. De propósito NÃO casa com a linha de peça
 * (`(rede, status) → content_id=`), que é lida por programa: recorrente não é peça e não tem content_id
 * até o dia em que dispara.
 */
export function linhaDoRecorrente(r: Recorrente): string {
  const dias = [...new Set(r.days_of_week || [])].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b);
  const quando = dias.length === 7 ? "todo dia" : dias.map((d) => DIAS_DA_SEMANA[d]).join(", ") || "sem dia marcado";
  // hour_utc → Brasília. O Brasil não tem horário de verão desde 2019, por isso o -3 fixo.
  const hora = String((((r.hour_utc ?? 0) - 3) % 24 + 24) % 24).padStart(2, "0") + ":00";
  const onde = (r.platforms || []).filter(Boolean).join(", ") || "sem rede";
  const erro = String(r.last_error || "").replace(/\s+/g, " ").trim();
  return `↻ ${r.name || "Sem nome"} — ${quando} às ${hora} em ${onde} · ${r.active === false ? "pausado" : "ativo"} → recorrente=${r.id}${erro ? ` · ATENÇÃO: ${erro}` : ""}`;
}
