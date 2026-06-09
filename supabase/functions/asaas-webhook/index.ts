/**
 * asaas-webhook — recebe notificações de pagamento do Asaas e credita a carteira.
 * Credita no PAYMENT_RECEIVED (PIX pula CONFIRMED). Idempotente por payment_ref
 * (índice único em credit_ledger) — webhooks do Asaas são at-least-once.
 *
 * verify_jwt = false (config.toml): o Asaas não manda JWT do Supabase; a autenticidade
 * vem do header `asaas-access-token` validado contra ASAAS_CREDITS_WEBHOOK_TOKEN.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  try {
    // 1. Autenticidade do webhook
    const token = req.headers.get("asaas-access-token") || req.headers.get("access_token");
    if (token !== Deno.env.get("ASAAS_CREDITS_WEBHOOK_TOKEN")) {
      console.warn("[asaas-webhook] rejected: invalid token");
      return json({ error: "invalid token" }, 401);
    }

    const body = await req.json();
    const event: string = body.event;
    const payment = body.payment;
    if (!payment?.id) return json({ ok: true, ignored: "no payment" });

    const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // 2. Só creditamos em RECEIVED (PIX) / CONFIRMED (cartão) — outros eventos só ack.
    if (event !== "PAYMENT_RECEIVED" && event !== "PAYMENT_CONFIRMED") {
      return json({ ok: true, event });
    }

    // 3. Mapeia externalReference -> user + créditos.  Formato: "topup:<user_id>:<credits>"
    const ref: string = payment.externalReference || "";
    const m = ref.match(/^topup:([0-9a-fA-F-]{36}):(\d+)$/);
    if (!m) {
      console.warn(`[asaas-webhook] externalReference não reconhecido: "${ref}"`);
      return json({ ok: true, ignored: "bad ref" });
    }
    const userId = m[1];
    const credits = parseInt(m[2], 10);

    // 4. Idempotência: já creditamos esse pagamento?
    const { data: existing } = await svc.from("credit_ledger")
      .select("id").eq("payment_ref", payment.id).eq("reason", "purchase").limit(1);
    if (existing && existing.length > 0) {
      return json({ ok: true, already: true });
    }

    // 5. Credita (grant_credits insere o ledger com payment_ref; índice único protege da corrida)
    const { error } = await svc.rpc("grant_credits", {
      p_user: userId, p_amount: credits, p_reason: "purchase",
      p_payment_ref: payment.id, p_metadata: { value_brl: payment.value, event },
    });
    if (error) {
      // violação do índice único = corrida, já foi creditado → ack
      if (error.code === "23505" || /duplicate|unique/i.test(error.message || "")) {
        return json({ ok: true, already: true });
      }
      throw error;
    }

    console.log(`[asaas-webhook] +${credits} créditos para ${userId} (payment ${payment.id})`);
    return json({ ok: true, credited: credits });
  } catch (e: any) {
    console.error("[asaas-webhook] error:", e?.message);
    return json({ error: e?.message || "internal" }, 500); // 500 → Asaas re-tenta (deduplicado)
  }
});
