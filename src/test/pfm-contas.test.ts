/**
 * A lista de contas do Post for Me é paginada (50 por padrão) e uma chave serve a todos os usuários.
 * Ler só a primeira página fazia contas novas sumirem do cadastro quando o total passasse de 50.
 *
 * Run: npm test
 */
import { describe, it, expect } from "vitest";
import { listarContasPfm, POR_PAGINA } from "../../supabase/functions/_shared/pfm-contas";

const conta = (i: number) => ({ id: `spc_${i}`, platform: "instagram", status: "connected", external_id: "u1" });

/** Post for Me falso com `total` contas, que respeita offset e limit. */
function pfmFalso(total: number, opts: { falharNaPagina?: number; semMeta?: boolean } = {}) {
  const urls: string[] = [];
  const fetchFn = (async (url: string) => {
    urls.push(url);
    const q = new URL(url).searchParams;
    const offset = Number(q.get("offset"));
    const limit = Number(q.get("limit"));
    if (opts.falharNaPagina !== undefined && offset / limit === opts.falharNaPagina) {
      return new Response("erro", { status: 502 });
    }
    const data = Array.from({ length: Math.max(0, Math.min(limit, total - offset)) }, (_, k) => conta(offset + k));
    const next = offset + limit < total ? `https://api.postforme.dev/v1/social-accounts?offset=${offset + limit}&limit=${limit}` : null;
    const corpo = opts.semMeta ? { data } : { data, meta: { total, offset, limit, next } };
    return new Response(JSON.stringify(corpo), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetchFn, urls };
}

describe("listarContasPfm", () => {
  it("traz as contas além da 50ª (o bug: só a primeira página)", async () => {
    const { fetchFn, urls } = pfmFalso(123);
    const r = await listarContasPfm("k", { fetchFn });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.contas).toHaveLength(123);
    expect(r.contas.at(-1).id).toBe("spc_122");
    expect(urls).toHaveLength(3);
    expect(urls[0]).toContain(`offset=0&limit=${POR_PAGINA}`);
  });

  it("uma chamada só quando cabe numa página", async () => {
    const { fetchFn, urls } = pfmFalso(28);
    const r = await listarContasPfm("k", { fetchFn });
    expect(r.ok && r.contas.length).toBe(28);
    expect(urls).toHaveLength(1);
  });

  it("exatamente 50: para pelo meta.total, sem página extra", async () => {
    const { fetchFn, urls } = pfmFalso(50);
    const r = await listarContasPfm("k", { fetchFn });
    expect(r.ok && r.contas.length).toBe(50);
    expect(urls).toHaveLength(1);
  });

  it("sem meta na resposta: segue até vir página incompleta", async () => {
    const { fetchFn, urls } = pfmFalso(100, { semMeta: true });
    const r = await listarContasPfm("k", { fetchFn });
    expect(r.ok && r.contas.length).toBe(100);
    expect(urls).toHaveLength(3);
  });

  it("falha numa página do meio = falha no todo (nunca lista parcial)", async () => {
    const { fetchFn } = pfmFalso(123, { falharNaPagina: 1 });
    const r = await listarContasPfm("k", { fetchFn });
    expect(r).toEqual({ ok: false, status: 502, motivo: "HTTP 502" });
  });

  it("erro de rede vira falha, não exceção", async () => {
    const fetchFn = (async () => { throw new Error("ECONNRESET"); }) as unknown as typeof fetch;
    const r = await listarContasPfm("k", { fetchFn });
    expect(r).toEqual({ ok: false, status: null, motivo: "ECONNRESET" });
  });
});
