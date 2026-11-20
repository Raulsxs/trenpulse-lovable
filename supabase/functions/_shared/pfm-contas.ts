// pfm-contas.ts — lê TODAS as contas do Post for Me (GET /v1/social-accounts), página por página.
//
// POR QUE EXISTE (2026-11-17): a lista do Post for Me é paginada e devolve 50 contas por padrão. Uma chave
// só serve a todos os usuários do TrendPulse, então as 50 são de todo mundo somado. connect-social,
// publish-postforme e instagram-scheduler pediam só a primeira página: passando de 50 contas no total,
// as mais novas sumiriam do cadastro ("conectei e não aparece") e da publicação. Em 17/11 eram 28.
//
// Sem dependência de Deno: roda nas edge functions e nos testes do `npm test`.

const URL_CONTAS = "https://api.postforme.dev/v1/social-accounts";
/** Tamanho de página que pedimos. A API aceita `limit`; 50 é o padrão dela. */
export const POR_PAGINA = 50;
/** Teto de segurança: 40 páginas = 2.000 contas. Evita laço infinito se a API devolver `next` sempre. */
const MAX_PAGINAS = 40;

export type ResultadoContas =
  | { ok: true; contas: any[] }
  | { ok: false; status: number | null; motivo: string };

/**
 * Busca todas as páginas. Falha em qualquer página = falha no todo: devolver só parte das contas faria
 * o app dizer "você não tem essa conta" quando ela existe (o mesmo erro que este arquivo corrige).
 */
export async function listarContasPfm(
  apiKey: string,
  opts: { fetchFn?: typeof fetch } = {},
): Promise<ResultadoContas> {
  const fetchFn = opts.fetchFn ?? fetch;
  const contas: any[] = [];
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const offset = pagina * POR_PAGINA;
    const qs = new URLSearchParams({ offset: String(offset), limit: String(POR_PAGINA) });
    let resp: Response;
    try {
      resp = await fetchFn(`${URL_CONTAS}?${qs}`, { headers: { Authorization: `Bearer ${apiKey}` } });
    } catch (e: any) {
      return { ok: false, status: null, motivo: e?.message || "rede" };
    }
    if (!resp.ok) return { ok: false, status: resp.status, motivo: `HTTP ${resp.status}` };
    let corpo: any;
    try { corpo = await resp.json(); } catch { return { ok: false, status: resp.status, motivo: "JSON inválido" }; }
    const dados = Array.isArray(corpo?.data) ? corpo.data : [];
    contas.push(...dados);
    // Para quando a página veio incompleta ou a API diz que acabou. `meta.total` quando vem é a verdade.
    const total = typeof corpo?.meta?.total === "number" ? corpo.meta.total : null;
    if (dados.length < POR_PAGINA) break;
    if (total !== null && contas.length >= total) break;
    if (corpo?.meta && corpo.meta.next == null && total === null) break;
  }
  return { ok: true, contas };
}
