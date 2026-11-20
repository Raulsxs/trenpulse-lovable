// agendador.ts — uma peça vencida, do lock à gravação do resultado. O instagram-scheduler chama isto para
// cada peça com status="scheduled" e scheduled_at no passado. Sem rede e sem Deno: o banco e o publicador
// entram por parâmetro, e os testes rodam no `npm test` (src/test/agendador-falha-permanente.test.ts).
import { semSegredo } from "./publicacao.ts";

// Tudo o que vai para publish_error e para o log passa por aqui: o publicador já limpa o que vem do Post for
// Me, mas o erro geral dele e o erro de rede ao chamá-lo chegam crus. Limite folgado: o motivo permanente já
// tem a instrução de reconectar (~300 caracteres) antes do detalhe técnico.
const limpo = (t: unknown): string => semSegredo(String(t ?? ""), 1200);

/** Máximo de tentativas automáticas por peça. A consulta do agendador só pega `publish_attempts < MAX`. */
export const MAX_TENTATIVAS = 3;

/** Linha de generated_contents como o agendador lê. */
export interface PecaVencida {
  id: string;
  user_id?: string;
  platform?: string | null;
  publish_attempts?: number | null;
  scheduled_accounts?: { platforms?: string[] | null; accountIds?: string[] | null } | null;
}

/**
 * Corpo para o publish-postforme. Se o usuário escolheu contas ao agendar (scheduled_accounts), publica
 * EXATAMENTE nelas; sem seleção (agendamento antigo), só a rede de criação.
 */
export function corpoDaPublicacao(c: PecaVencida): Record<string, unknown> {
  const sel = c.scheduled_accounts;
  if (sel?.accountIds?.length) {
    return {
      contentId: c.id,
      platforms: sel.platforms?.length ? sel.platforms : [c.platform || "instagram"],
      accountIds: sel.accountIds,
    };
  }
  return { contentId: c.id, platforms: [c.platform || "instagram"] };
}

export interface Desfecho {
  /** published/pending: o publicador já gravou a peça. failed/scheduled: o agendador grava. */
  status: "published" | "pending" | "failed" | "scheduled";
  /** O que vai para generated_contents.publish_error (só em failed/scheduled). */
  publish_error?: string;
  /** true = falha que só o usuário resolve: não houve nem haverá nova tentativa automática. */
  permanente?: boolean;
}

/**
 * O que fazer com a resposta do publicador na tentativa `tentativa` (1, 2, 3...).
 *
 * Falha PERMANENTE (o publicador marca `permanent: true`, ex.: sessão da Meta invalidada) vai direto para
 * failed: tentar de novo em 5 minutos só cria outro post rejeitado no Post for Me. Precisa que TODAS as
 * contas que falharam sejam permanentes; se alguma falhou por motivo passageiro, segue a regra antiga
 * (nada saiu, então tentar de novo não duplica).
 *
 * O `publish_error` começa dizendo qual dos três casos é, para quem lê a agenda saber se ainda vai tentar.
 */
export function desfechoDaTentativa(resp: { ok: boolean; data: any }, tentativa: number): Desfecho {
  const results: any[] = Array.isArray(resp.data?.results) ? resp.data.results : [];
  if (resp.ok && results.some((r) => r?.success)) return { status: "published" };
  if (resp.ok && results.some((r) => r?.pending === true)) return { status: "pending" };

  const falhas = results.filter((r) => r && !r.success && r.pending !== true);
  const erro = limpo(resp.data?.error || falhas[0]?.error || "Erro desconhecido");

  if (resp.ok && falhas.length && falhas.every((r) => r.permanent === true)) {
    const motivos = [...new Set(falhas.map((r) => limpo(r.error)).filter(Boolean))].join(" · ") || erro;
    return { status: "failed", permanente: true, publish_error: `Falha permanente, sem nova tentativa automática: ${motivos}` };
  }
  if (tentativa >= MAX_TENTATIVAS) {
    return { status: "failed", publish_error: `Falhou nas ${MAX_TENTATIVAS} tentativas automáticas: ${erro}` };
  }
  return {
    status: "scheduled",
    publish_error: `Falha temporária (tentativa ${tentativa} de ${MAX_TENTATIVAS}), nova tentativa automática em alguns minutos: ${erro}`,
  };
}

export interface ResultadoDaPeca {
  id: string;
  status: string;
  error?: string;
  permanent?: boolean;
}

/**
 * Lock → publica → grava. `db` é o cliente Supabase com service role; `publicar` faz o POST no
 * publish-postforme e devolve `{ ok, data }` (pode lançar em erro de rede).
 *
 * O lock troca scheduled → publishing ANTES de publicar: com o publicador lento, o tick seguinte não pega
 * a mesma peça (foi o que duplicou 12+ posts no LinkedIn do Felipe em 2026-04-27). O update devolve as
 * linhas trocadas: zero linhas = outra execução já pegou a peça, e esta NÃO publica. Só olhar o erro não
 * bastava, porque update que não casa nada não dá erro.
 */
export async function publicarPecaVencida(
  db: any,
  c: PecaVencida,
  publicar: (corpo: Record<string, unknown>) => Promise<{ ok: boolean; data: any }>,
  log: (m: string) => void = () => {},
): Promise<ResultadoDaPeca> {
  const tentativa = (c.publish_attempts || 0) + 1;

  const { data: travadas, error: lockErr } = await db.from("generated_contents")
    .update({ status: "publishing", publish_attempts: tentativa })
    .eq("id", c.id)
    .eq("status", "scheduled")
    .select("id");
  if (lockErr) return { id: c.id, status: "lock_failed", error: lockErr.message };
  if (!travadas?.length) return { id: c.id, status: "lock_lost" };

  // Grava o fim só se a peça ainda está no lock desta execução: se o usuário reagendou ou tirou da
  // agenda enquanto o publicador rodava, a decisão dele vale.
  const gravar = (patch: Record<string, unknown>) =>
    db.from("generated_contents").update(patch).eq("id", c.id).eq("status", "publishing");

  try {
    const resp = await publicar(corpoDaPublicacao(c));
    const d = desfechoDaTentativa(resp, tentativa);
    if (d.status === "published" || d.status === "pending") {
      log(`${c.id}: ${d.status}`);
      return { id: c.id, status: d.status };
    }
    log(`${c.id}: ${d.status} (tentativa ${tentativa}/${MAX_TENTATIVAS}${d.permanente ? ", permanente" : ""}): ${d.publish_error}`);
    await gravar({ status: d.status, publish_error: d.publish_error });
    return { id: c.id, status: d.status, error: d.publish_error, ...(d.permanente ? { permanent: true } : {}) };
  } catch (err: any) {
    // Sem resposta legível do publicador: passageiro, como sempre foi.
    const d = desfechoDaTentativa({ ok: false, data: { error: err?.message || "erro ao chamar o publicador" } }, tentativa);
    log(`${c.id}: erro ao chamar o publicador (tentativa ${tentativa}/${MAX_TENTATIVAS}): ${limpo(err?.message)}`);
    await gravar({ status: d.status, publish_error: d.publish_error });
    return { id: c.id, status: d.status, error: d.publish_error };
  }
}
