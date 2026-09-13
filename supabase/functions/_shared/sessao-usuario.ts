/**
 * JWT de usuário para quem age em nome dele no servidor (MCP e worker da fila) — REUSANDO a sessão.
 *
 * POR QUE ISTO EXISTE: antes, cada chamada fazia admin/generate_link + /verify, e cada verify é um
 * LOGIN NOVO. O cache ficava na memória do isolate e cada chamada cai num isolate diferente, então
 * nunca acertava. Medido em 2026-09-13: 8 sessões abertas em 15 s. Isso custava ~1,5 s por chamada,
 * esbarrava no rate limit de /verify (30 por 5 min, em IPs de saída compartilhados) e sobrescrevia
 * `last_sign_in_at`, inflando a métrica de usuários ativos.
 *
 * Ordem agora, do mais barato ao mais caro:
 *   1. memória do isolate
 *   2. linha em `sessoes_servico` (vale entre isolates)
 *   3. refresh_token → sessão continua a mesma, sem login novo (rate limit 150)
 *   4. magic link → só na primeira vez, ou se o refresh for recusado
 *
 * Sem SDK, só fetch: é a lição de `telemetry.ts`, que emudeceu duas vezes por import do supabase-js.
 */
import { sessaoAindaValida } from "./mcp-core.ts";

declare const Deno: { env: { get(k: string): string | undefined } };

interface Sessao { access_token: string; refresh_token: string; expira_em: string }

const memoria = new Map<string, Sessao>();

function env() {
  return {
    url: Deno.env.get("SUPABASE_URL")!,
    service: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    anon: Deno.env.get("SUPABASE_ANON_KEY")!,
  };
}

const svcHeaders = (service: string, extra: Record<string, string> = {}) => ({
  apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json", ...extra,
});

/** Converte a resposta do GoTrue numa sessão com expiração absoluta. */
function paraSessao(r: any): Sessao | null {
  if (!r?.access_token || !r?.refresh_token) return null;
  const expSeg = Number(r.expires_at) || Math.floor(Date.now() / 1000) + (Number(r.expires_in) || 3600);
  return { access_token: r.access_token, refresh_token: r.refresh_token, expira_em: new Date(expSeg * 1000).toISOString() };
}

async function lerDoBanco(userId: string): Promise<Sessao | null> {
  const { url, service } = env();
  const res = await fetch(
    `${url}/rest/v1/sessoes_servico?user_id=eq.${userId}&select=access_token,refresh_token,expira_em`,
    { headers: svcHeaders(service) },
  );
  if (!res.ok) return null;
  const linhas = await res.json().catch(() => []);
  return linhas?.[0] ?? null;
}

async function gravar(userId: string, s: Sessao): Promise<void> {
  const { url, service } = env();
  await fetch(`${url}/rest/v1/sessoes_servico`, {
    method: "POST",
    headers: svcHeaders(service, { Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify({ user_id: userId, ...s, atualizada_em: new Date().toISOString() }),
  }).catch(() => {});
}

/**
 * Renova pelo refresh_token. Grava com trava otimista (`refresh_token=eq.<antigo>`): se dois isolates
 * renovarem ao mesmo tempo, só o primeiro grava e o outro relê a linha vencedora.
 */
async function renovar(userId: string, antiga: Sessao): Promise<Sessao | null> {
  const { url, service, anon } = env();
  const res = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: antiga.refresh_token }),
  });
  if (!res.ok) {
    // Refresh recusado (revogado, reusado fora da janela de 10 s da rotação): outro isolate pode ter
    // renovado agora mesmo — confere o banco antes de desistir.
    const atual = await lerDoBanco(userId);
    return atual && atual.refresh_token !== antiga.refresh_token && sessaoAindaValida(atual.expira_em) ? atual : null;
  }
  const nova = paraSessao(await res.json().catch(() => null));
  if (!nova) return null;

  const up = await fetch(
    `${url}/rest/v1/sessoes_servico?user_id=eq.${userId}&refresh_token=eq.${encodeURIComponent(antiga.refresh_token)}`,
    {
      method: "PATCH",
      headers: svcHeaders(service, { Prefer: "return=representation" }),
      body: JSON.stringify({ ...nova, atualizada_em: new Date().toISOString() }),
    },
  );
  const gravadas = up.ok ? await up.json().catch(() => []) : [];
  if (Array.isArray(gravadas) && gravadas.length) return nova;
  // Perdeu a corrida: a sessão válida é a que o outro isolate gravou.
  return (await lerDoBanco(userId)) ?? nova;
}

/** Login por magic link, sem enviar e-mail. Só quando não há sessão reaproveitável. */
async function abrirSessao(userId: string): Promise<Sessao | null> {
  const { url, service, anon } = env();
  const u = await fetch(`${url}/auth/v1/admin/users/${userId}`, { headers: svcHeaders(service) })
    .then((r) => r.json()).catch(() => null);
  if (!u?.email) return null;
  const link = await fetch(`${url}/auth/v1/admin/generate_link`, {
    method: "POST", headers: svcHeaders(service),
    body: JSON.stringify({ type: "magiclink", email: u.email }),
  }).then((r) => r.json()).catch(() => null);
  if (!link?.hashed_token) return null;
  const verify = await fetch(`${url}/auth/v1/verify`, {
    method: "POST", headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }),
  }).then((r) => r.json()).catch(() => null);
  const s = paraSessao(verify);
  if (s) await gravar(userId, s);
  return s;
}

export async function jwtDoUsuario(userId: string): Promise<string | null> {
  const emMemoria = memoria.get(userId);
  if (emMemoria && sessaoAindaValida(emMemoria.expira_em)) return emMemoria.access_token;

  let s = emMemoria ?? (await lerDoBanco(userId));
  if (s && !sessaoAindaValida(s.expira_em)) s = await renovar(userId, s);
  if (!s) s = await abrirSessao(userId);
  if (!s) return null;

  memoria.set(userId, s);
  return s.access_token;
}
