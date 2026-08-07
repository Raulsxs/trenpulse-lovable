/**
 * redeem-coupon — resgata um código de cupom e credita os créditos da campanha.
 * Chamado pelo frontend com o JWT do usuário (verify_jwt = true, o padrão).
 *
 * SEGURANÇA (isto credita saldo — trate como endpoint de dinheiro):
 *  - NÃO adicionar entrada em supabase/config.toml: o verify_jwt=true default faz o gateway rejeitar
 *    chamada sem JWT válido ANTES de chegar aqui. É a primeira linha de defesa, de graça.
 *  - O usuário sai SEMPRE de getUser() (o JWT), NUNCA do body — body.userId é o vetor clássico de
 *    roubo de crédito (ver _shared/require-auth.ts).
 *  - A validação real (existe? já usado? expirou? rate limit?) mora toda na RPC redeem_coupon, que é
 *    SECURITY DEFINER e só executável por service_role. Aqui só traduzimos erro pra mensagem pt-BR.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// Erro da RPC → status HTTP + mensagem pro usuário final.
const ERRORS: Record<string, { status: number; message: string }> = {
  NOT_FOUND: { status: 400, message: "Código não encontrado. Confira as letras e tente de novo." },
  ALREADY_REDEEMED: { status: 409, message: "Esse código já foi resgatado." },
  CAMPAIGN_ALREADY_REDEEMED: { status: 409, message: "Você já resgatou um código desta promoção." },
  EXPIRED: { status: 410, message: "Esse código expirou." },
  INACTIVE: { status: 410, message: "Esse código não está mais válido." },
  RATE_LIMITED: { status: 429, message: "Muitas tentativas. Tente de novo daqui a pouco." },
};

// Hash do IP (nunca guardamos IP cru). O pepper impede reverter o hash por força bruta do espaço de IPs.
async function hashIp(req: Request): Promise<string | null> {
  const raw = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (!raw) return null;
  const pepper = Deno.env.get("COUPON_IP_PEPPER") || "";
  const bytes = new TextEncoder().encode(raw + pepper);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const rawCode = typeof body?.code === "string" ? body.code : "";

    // Normaliza igual a RPC faz (strip não-alfanumérico, upper, tira o prefixo TP de exibição).
    let code = rawCode.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    if (code.length === 10 && code.startsWith("TP")) code = code.slice(2);

    // Formato errado → devolve sem tocar no banco, pra um typo de tamanho não queimar tentativa
    // do rate limiter (o comprador legítimo não pode se auto-bloquear digitando errado).
    if (!/^[A-Z0-9]{8}$/.test(code)) {
      return json({ ok: false, error: "NOT_FOUND", message: ERRORS.NOT_FOUND.message }, 400);
    }

    const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data, error } = await svc.rpc("redeem_coupon", {
      p_user: user.id,          // SEMPRE do JWT
      p_code: code,
      p_ip_hash: await hashIp(req),
    });

    if (error) {
      console.error(`[redeem-coupon] RPC falhou user=${user.id} code=${code}:`, error.message);
      return json({ ok: false, error: "SERVER_ERROR", message: "Não consegui resgatar agora. Tente de novo." }, 500);
    }

    const result = data as { ok: boolean; error?: string; credits?: number; balance?: number; campaign?: string; already?: boolean };

    if (!result?.ok) {
      const e = ERRORS[result?.error || ""] || { status: 400, message: "Não consegui resgatar esse código." };
      console.log(`[redeem-coupon] recusado user=${user.id} code=${code} motivo=${result?.error}`);
      return json({ ok: false, error: result?.error, message: e.message }, e.status);
    }

    console.log(`[redeem-coupon] OK user=${user.id} code=${code} creditos=${result.credits} replay=${result.already}`);
    return json(result);
  } catch (e: any) {
    console.error("[redeem-coupon] exceção:", e?.message);
    return json({ ok: false, error: "SERVER_ERROR", message: "Não consegui resgatar agora. Tente de novo." }, 500);
  }
});
