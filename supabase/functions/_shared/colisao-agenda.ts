/**
 * Colisão de agenda POR CONTA DE DESTINO.
 *
 * A trava existe porque dois posts no mesmo instante na MESMA conta quase sempre são o agente repetindo
 * a chamada, não intenção. Até 2026-11-21 ela olhava só o horário: a peça #167 da Pulse, no Instagram do
 * Raul (@raulsxs), foi recusada porque o Instagram da Pulse já tinha uma peça às 12:00 do mesmo dia. São
 * perfis diferentes; publicar nos dois ao mesmo tempo é legítimo.
 *
 * Regra: recusa quando a peça já agendada no mesmo instante tem pelo menos UM destino em comum com o
 * novo agendamento. Destino é a conta do Post for Me (`scheduled_accounts.accountIds`).
 *
 * AGENDAMENTO LEGADO (sem `accountIds`): o instagram-scheduler publica na rede de criação
 * (`platform || "instagram"`), na PRIMEIRA conta daquela rede, e qual é a primeira depende da ordem da
 * lista do Post for Me. Não dá para saber a conta, então a decisão é conservadora: a peça legada ocupa a
 * REDE INTEIRA naquele instante. Colide com qualquer destino daquela rede; não colide com outra rede.
 * Quando não dá para saber nem a rede de uma conta (conta desconectada e peça sem `platforms`), conta
 * como "qualquer rede": mais vale pedir outro horário do que publicar em dobro no mesmo perfil.
 */

export interface PecaAgendada {
  id: string;
  title?: string | null;
  platform?: string | null;
  scheduled_accounts?: unknown;
}

export interface Destino {
  /** Contas exatas do Post for Me. null = legado: só se sabe a rede. */
  contas: string[] | null;
  /** Redes em que a peça pode sair. null = desconhecida (colide com qualquer rede). */
  redes: Set<string> | null;
}

const textos = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && !!x))] : [];

/**
 * Destino de um agendamento.
 * - Com contas: a rede de cada uma vem do mapa das contas conectadas; conta fora do mapa cai nas
 *   `plataformas` gravadas junto (a conta está numa delas); sem nenhuma das duas, a rede é desconhecida.
 * - Sem contas: legado, ocupa a rede de criação (o mesmo fallback do instagram-scheduler).
 */
export function destinoDoAgendamento(
  contas: string[],
  plataformas: string[],
  plataformaDeCriacao: string | null | undefined,
  redeDaConta: Record<string, string>,
): Destino {
  const ids = textos(contas);
  if (!ids.length) return { contas: null, redes: new Set([plataformaDeCriacao || "instagram"]) };
  const redes = new Set<string>();
  const gravadas = textos(plataformas);
  for (const id of ids) {
    if (redeDaConta[id]) redes.add(redeDaConta[id]);
    else if (gravadas.length) gravadas.forEach((p) => redes.add(p));
    else return { contas: ids, redes: null };
  }
  return { contas: ids, redes };
}

/** Destino de uma peça já gravada em generated_contents. */
export function destinoDaPeca(peca: PecaAgendada, redeDaConta: Record<string, string>): Destino {
  const sa = (peca.scheduled_accounts || {}) as { platforms?: unknown; accountIds?: unknown };
  return destinoDoAgendamento(textos(sa.accountIds), textos(sa.platforms), peca.platform, redeDaConta);
}

export function destinosColidem(a: Destino, b: Destino): boolean {
  // Os dois sabem a conta exata: só a conta importa (Instagram do Raul ≠ Instagram da Pulse).
  if (a.contas && b.contas) return a.contas.some((id) => b.contas!.includes(id));
  // Algum é legado: compara pela rede, e rede desconhecida colide com tudo.
  if (!a.redes || !b.redes) return true;
  return [...a.redes].some((r) => b.redes!.has(r));
}

/** A primeira peça do mesmo instante que divide destino com o novo agendamento, ignorando `ignorarId`. */
export function pecaEmColisao(
  novo: Destino,
  mesmoInstante: PecaAgendada[],
  redeDaConta: Record<string, string>,
  ignorarId?: string | null,
): PecaAgendada | null {
  for (const p of mesmoInstante) {
    // Reagendar a peça para o horário que ela já ocupa não é colisão consigo mesma.
    if (ignorarId && p.id === ignorarId) continue;
    if (destinosColidem(novo, destinoDaPeca(p, redeDaConta))) return p;
  }
  return null;
}

export function recusaPorColisao(p: PecaAgendada): string {
  return `Ja existe conteudo agendado exatamente para esse horario na mesma conta de destino ("${p.title || "sem titulo"}", content_id=${p.id}). Escolha outro horario ou outra conta. Se a peca nova substitui essa, tire a antiga com desagendar_conteudo antes.`;
}
