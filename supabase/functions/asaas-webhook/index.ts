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

    // 3. Mapeia externalReference -> user + créditos.
    //    "topup:<user_id>:<credits>" = recarga avulsa
    //    "sub:<user_id>:<credits>"   = ciclo de assinatura mensal
    //
    // O Asaas COPIA o externalReference da assinatura pra cada cobrança que ela gera, e cada
    // ciclo tem payment.id próprio — então a renovação credita por este mesmo caminho, e a
    // idempotência por credit_ledger(payment_ref) continua valendo ciclo a ciclo.
    const ref: string = payment.externalReference || "";
    const m = ref.match(/^(topup|sub):([0-9a-fA-F-]{36}):(\d+)$/);

    let recorrente = false;
    let userId: string | null = null;
    let credits = 0;

    if (m) {
      recorrente = m[1] === "sub";
      userId = m[2];
      credits = parseInt(m[3], 10);
    } else if (payment.subscription) {
      // REDE DE SEGURANÇA, e não um extra: a doc do Asaas NÃO garante que o externalReference da
      // assinatura seja copiado pra cada cobrança do ciclo. Se não vier, o caminho acima falha e a
      // pessoa pagaria a renovação sem receber crédito — o pior defeito possível num billing.
      // Aqui a cobrança é resolvida pelo id da ASSINATURA, que sempre vem em payment.subscription.
      const { data: sub } = await svc.from("credit_subscriptions")
        .select("user_id, credits_per_cycle")
        .eq("asaas_subscription_id", payment.subscription).maybeSingle();
      if (sub) {
        recorrente = true;
        userId = sub.user_id;
        credits = sub.credits_per_cycle;
        console.log(`[asaas-webhook] ref ausente; assinatura ${payment.subscription} resolvida pelo banco`);
      }
    }

    if (!userId || !credits) {
      console.warn(`[asaas-webhook] não deu pra resolver: ref="${ref}" sub="${payment.subscription || ""}"`);
      return json({ ok: true, ignored: "bad ref" });
    }

    // 4. Idempotência: já creditamos esse pagamento?
    const { data: existing } = await svc.from("credit_ledger")
      .select("id").eq("payment_ref", payment.id).eq("reason", "purchase").limit(1);
    if (existing && existing.length > 0) {
      return json({ ok: true, already: true });
    }

    // 5. Credita (grant_credits insere o ledger com payment_ref; índice único protege da corrida)
    const { error } = await svc.rpc("grant_credits", {
      p_user: userId, p_amount: credits, p_reason: "purchase",
      p_payment_ref: payment.id,
      p_metadata: { value_brl: payment.value, event, recorrente, subscription: payment.subscription || null },
    });
    if (error) {
      // violação do índice único = corrida, já foi creditado → ack
      if (error.code === "23505" || /duplicate|unique/i.test(error.message || "")) {
        return json({ ok: true, already: true });
      }
      throw error;
    }

    // Ciclo pago: reflete na assinatura (volta de 'overdue' e anda a data de renovação).
    // Best-effort: o crédito já caiu e é o que importa; falha aqui não pode derrubar o webhook,
    // senão o Asaas re-tenta e a única coisa que acontece é ruído.
    if (recorrente && payment.subscription) {
      const { error: subErr } = await svc.from("credit_subscriptions")
        .update({ status: "active", next_due_date: payment.dueDate || null })
        .eq("asaas_subscription_id", payment.subscription);
      if (subErr) console.warn(`[asaas-webhook] espelho da assinatura falhou (${payment.subscription}): ${subErr.message}`);
    }

    console.log(`[asaas-webhook] +${credits} créditos para ${userId} (payment ${payment.id}${recorrente ? ", recorrente" : ""})`);
    return json({ ok: true, credited: credits });
  } catch (e: any) {
    console.error("[asaas-webhook] error:", e?.message);
    return json({ error: e?.message || "internal" }, 500); // 500 → Asaas re-tenta (deduplicado)
  }
});
