// Resolve a marca que um agente pediu (id OU nome) contra as marcas do PRÓPRIO usuário.
//
// Antes o brandId ia cru para o ai-chat. Um valor que não era id de marca (caso real, 14/10: o agente
// passou "pulseindata", que é o @ da conta do Instagram) quebrava a consulta da marca em silêncio e a
// peça saía SEM marca nenhuma — e a ferramenta respondia "gerado com sucesso". Três peças da Pulse
// foram agendadas assim. Agora marca desconhecida RECUSA antes de gerar (nada é cobrado).

export interface MarcaResumo { id: string; name: string | null }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Acha a marca por id exato, depois nome exato (sem caixa), depois nome contendo o texto — mas só
 * aceita o "contém" quando há UMA candidata; com várias, é ambíguo e devolve null.
 */
export function acharMarca(lista: MarcaResumo[], alvo: string): MarcaResumo | null {
  const t = String(alvo || "").trim();
  if (!t) return null;
  const porId = lista.find((b) => b.id === t);
  if (porId) return porId;
  if (UUID.test(t)) return null; // id bem formado que não é do usuário: não adivinhar por nome
  const baixo = t.toLowerCase();
  const exato = lista.filter((b) => (b.name || "").trim().toLowerCase() === baixo);
  if (exato.length === 1) return exato[0];
  const contem = lista.filter((b) => (b.name || "").toLowerCase().includes(baixo));
  return contem.length === 1 ? contem[0] : null;
}

/** Recusa legível, com as marcas que existem — o agente corrige sem precisar de outra chamada. */
export function recusaDeMarca(alvo: string, lista: MarcaResumo[]): string {
  const opcoes = lista.map((b) => `${b.name || "(sem nome)"} → marca=${b.id}`).join("; ");
  return `Marca "${alvo}" não encontrada entre as suas. NADA foi gerado e nada foi cobrado. ` +
    (opcoes ? `Suas marcas: ${opcoes}. Passe o id em brandId (ou o nome exato).` : `Você não tem marca cadastrada: omita brandId para gerar sem marca.`);
}

/** Como a marca de uma peça aparece para o agente. Sem marca vira aviso explícito, não silêncio. */
export function linhaDaMarca(marca: MarcaResumo | null | undefined): string {
  return marca ? `marca=${marca.name || "(sem nome)"} (marca_id=${marca.id})` : `marca=NENHUMA (gerada sem identidade de marca)`;
}
