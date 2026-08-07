/**
 * Cupom de créditos — normalização e persistência do código entre o clique no link e o resgate.
 *
 * O código é EXIBIDO como TP-XXXX-XXXX mas armazenado no banco como os 8 caracteres puros.
 * A normalização precisa bater com a da RPC `redeem_coupon` (migration 20260807120000): sem isso,
 * o comprador que copia o código do email exatamente como está recebe "código não encontrado".
 */

const STORAGE_KEY = "tp_pending_coupon";
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias: cobre quem compra e só cria conta dias depois

/** Tira tudo que não é alfanumérico, sobe pra maiúscula e remove o prefixo TP de exibição. */
export function normalizeCoupon(raw: string): string {
  let code = (raw || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (code.length === 10 && code.startsWith("TP")) code = code.slice(2);
  return code;
}

export function isValidCouponFormat(raw: string): boolean {
  return /^[A-Z0-9]{8}$/.test(normalizeCoupon(raw));
}

/** 8 caracteres puros → TP-XXXX-XXXX (como aparece no email e na arte). */
export function formatCoupon(raw: string): string {
  const c = normalizeCoupon(raw);
  return c.length === 8 ? `TP-${c.slice(0, 4)}-${c.slice(4)}` : raw;
}

/**
 * L1 das três camadas de sobrevivência do código (as outras são a query do emailRedirectTo e o
 * user_metadata do signUp). Esta é a única que sobrevive a um emailRedirectTo rejeitado pela
 * allow-list do Supabase; e é a única que NÃO sobrevive a confirmar o email em outro dispositivo.
 */
export function savePendingCoupon(code: string): void {
  const c = normalizeCoupon(code);
  if (!/^[A-Z0-9]{8}$/.test(c)) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ code: c, ts: Date.now() }));
  } catch { /* modo privado / storage cheio: as outras camadas cobrem */ }
}

export function readPendingCoupon(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const { code, ts } = JSON.parse(raw);
    if (typeof code !== "string" || typeof ts !== "number") return null;
    if (Date.now() - ts > TTL_MS) { clearPendingCoupon(); return null; }
    return /^[A-Z0-9]{8}$/.test(code) ? code : null;
  } catch { return null; }
}

export function clearPendingCoupon(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
}

/**
 * Lê o código da URL. SEMPRE `?coupon=` — NUNCA `?code=`, que é o parâmetro do PKCE do Supabase
 * Auth e seria consumido/embaralhado no retorno da confirmação de email.
 */
export function couponFromUrl(search: string): string | null {
  try {
    const v = new URLSearchParams(search).get("coupon");
    if (!v) return null;
    const c = normalizeCoupon(v);
    return /^[A-Z0-9]{8}$/.test(c) ? c : null;
  } catch { return null; }
}
