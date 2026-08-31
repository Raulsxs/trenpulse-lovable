/**
 * create-credit-charge — cria uma cobrança PIX no Asaas pra recarga de créditos.
 * Chamado pelo frontend com o JWT do usuário (verify_jwt = true, padrão).
 * Fluxo: getUser → find/create customer Asaas (CPF coletado na hora) → POST /payments PIX
 *        (externalReference="topup:<user>:<credits>") → GET pixQrCode → retorna QR.
 * O crédito acontece depois, no asaas-webhook (PAYMENT_RECEIVED).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const ASAAS_BASE = "https://api.asaas.com/v3";

// Packs (R$ → créditos). 1 crédito ≈ R$0,10; packs maiores ganham bônus.
// ⚠️ ESPELHA src/lib/precos.ts. Este arquivo é quem COBRA: divergir dele significa cobrar um
// valor e creditar outro. Piso subiu para R$100 em 2026-08-12 porque o consumo real medido era de
// 597 a 1.671 créditos/mês e o pacote de 500 acabava no meio do mês.
// O "50" fica aceito por compatibilidade: cobrança já emitida com esse pack precisa liquidar.
const PACKS: Record<string, { value: number; credits: number }> = {
  "50": { value: 50, credits: 500 },       // legado — não é mais oferecido na UI
  "100": { value: 100, credits: 1000 },
  "200": { value: 200, credits: 2200 },    // +10% bônus
  "400": { value: 400, credits: 4800 },    // +20% bônus
};

/**
 * PLANOS RECORRENTES (assinatura mensal). Mesmos preços dos packs; o que muda é o BÔNUS de
 * recorrência e o fato de renovar sozinho.
 *
 * ⚠️ ESPELHA PLANOS/BONUS_RECORRENCIA em src/lib/precos.ts.
 *
 * ⚠️ SÓ CARTÃO. Assinatura PIX no Asaas não cobra sozinha — gera um QR novo a cada ciclo pra
 * pessoa pagar na mão, o que não é recorrência do ponto de vista de quem assina. Oferecer isso
 * como "renova sozinho" seria prometer o que o meio de pagamento não entrega.
 */
const BONUS_RECORRENCIA = 100;
const PLANOS: Record<string, { value: number; credits: number }> = {
  "mensal-100": { value: 100, credits: 1000 + BONUS_RECORRENCIA },
  "mensal-200": { value: 200, credits: 2200 + BONUS_RECORRENCIA },
  "mensal-400": { value: 400, credits: 4800 + BONUS_RECORRENCIA },
};

async function asaas(path: string, method: string, body?: unknown) {
  const key = Deno.env.get("ASAAS_PROD_KEY");
  if (!key) throw new Error("ASAAS_PROD_KEY não configurada");
  const res = await fetch(`${ASAAS_BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", access_token: key },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.errors?.[0]?.description || `Asaas ${res.status}`);
  return data;
}

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { pack, plano, cpfCnpj, name, method, card, holder } = await req.json();

    // Assinatura e recarga avulsa compartilham cliente Asaas e validação de CPF; o que muda é o
    // endpoint (/subscriptions x /payments) e o prefixo do externalReference.
    const assinatura = plano ? PLANOS[String(plano)] : null;
    if (plano && !assinatura) return json({ error: "Plano inválido" }, 400);
    const p = assinatura || PACKS[String(pack)];
    if (!p) return json({ error: "Pacote inválido" }, 400);

    const cpf = (cpfCnpj || "").replace(/\D/g, "");
    if (cpf.length !== 11 && cpf.length !== 14) return json({ error: "CPF/CNPJ inválido" }, 400);
    const payMethod = assinatura ? "card" : (method === "card" ? "card" : "pix");

    // 1. Find-or-create customer Asaas (externalReference = user.id)
    let customerId: string;
    const found = await asaas(`/customers?externalReference=${user.id}`, "GET");
    if (found?.data?.length) {
      customerId = found.data[0].id;
    } else {
      const created = await asaas("/customers", "POST", {
        name: name || user.email || "Usuário TrendPulse",
        cpfCnpj: cpf,
        email: user.email,
        externalReference: user.id,
      });
      customerId = created.id;
    }

    // ── ASSINATURA MENSAL ────────────────────────────────────────────────────
    // O Asaas COPIA o externalReference da assinatura pra cada cobranca que ela gera, e cada
    // cobranca tem id proprio. Entao o asaas-webhook credita todo mes sozinho, sem nenhuma
    // mudanca de fluxo: ele so precisa reconhecer o prefixo "sub:" alem de "topup:".
    // A idempotencia continua sendo por credit_ledger(payment_ref) = id da cobranca do ciclo.
    if (assinatura) {
      if (!card?.number || !card?.holderName || !card?.expiryMonth || !card?.expiryYear || !card?.ccv) {
        return json({ error: "Dados do cartão incompletos." }, 400);
      }
      if (!holder?.postalCode || !holder?.addressNumber || !holder?.phone) {
        return json({ error: "Informe CEP, número e telefone do titular." }, 400);
      }

      // Ja existe assinatura ativa? Barra ANTES de criar no Asaas — criar e depois falhar no
      // insert deixaria o usuario pagando uma assinatura que o nosso banco nao conhece.
      const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { data: ativa } = await svc.from("credit_subscriptions")
        .select("id").eq("user_id", user.id).eq("status", "active").limit(1);
      if (ativa && ativa.length > 0) {
        return json({ error: "Você já tem uma assinatura ativa." }, 409);
      }

      const remoteIp = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "0.0.0.0";
      const hoje = new Date().toISOString().slice(0, 10);
      const sub = await asaas("/subscriptions", "POST", {
        customer: customerId,
        billingType: "CREDIT_CARD",
        value: p.value,
        nextDueDate: hoje,          // primeira cobranca hoje
        cycle: "MONTHLY",
        description: `TrendPulse — ${p.credits} créditos por mês (R$${p.value})`,
        externalReference: `sub:${user.id}:${p.credits}`,
        creditCard: {
          holderName: card.holderName,
          number: (card.number || "").replace(/\s/g, ""),
          expiryMonth: card.expiryMonth,
          expiryYear: card.expiryYear,
          ccv: card.ccv,
        },
        creditCardHolderInfo: {
          name: card.holderName,
          email: user.email,
          cpfCnpj: cpf,
          postalCode: (holder.postalCode || "").replace(/\D/g, ""),
          addressNumber: String(holder.addressNumber),
          phone: (holder.phone || "").replace(/\D/g, ""),
        },
        remoteIp,
      });

      // Espelha o estado. Se este insert falhar, a assinatura EXISTE no Asaas e o usuario sera
      // cobrado — por isso o erro e logado alto: e caso de intervencao manual, nao de silencio.
      const { error: insErr } = await svc.from("credit_subscriptions").insert({
        user_id: user.id,
        asaas_subscription_id: sub.id,
        plan_id: String(plano),
        value_brl: p.value,
        credits_per_cycle: p.credits,
        status: "active",
        next_due_date: sub.nextDueDate || hoje,
      });
      if (insErr) {
        console.error(`[create-credit-charge] ASSINATURA ORFA no Asaas: ${sub.id} user=${user.id} — ${insErr.message}`);
      }

      return json({
        subscriptionId: sub.id,
        credits: p.credits,
        value: p.value,
        method: "card",
        recorrente: true,
        nextDueDate: sub.nextDueDate || hoje,
      });
    }

    const dueDate = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10); // +2 dias
    const base = {
      customer: customerId,
      value: p.value,
      dueDate,
      externalReference: `topup:${user.id}:${p.credits}`,
      description: `Recarga TrendPulse — ${p.credits} créditos (R$${p.value})`,
    };

    // ── CARTÃO: cobrança síncrona. Asaas processa na hora; o crédito cai no
    // asaas-webhook (PAYMENT_CONFIRMED, idempotente). Exige dados do portador. ──
    if (payMethod === "card") {
      if (!card?.number || !card?.holderName || !card?.expiryMonth || !card?.expiryYear || !card?.ccv) {
        return json({ error: "Dados do cartão incompletos." }, 400);
      }
      if (!holder?.postalCode || !holder?.addressNumber || !holder?.phone) {
        return json({ error: "Informe CEP, número e telefone do titular." }, 400);
      }
      const remoteIp = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "0.0.0.0";
      const payment = await asaas("/payments", "POST", {
        ...base,
        billingType: "CREDIT_CARD",
        creditCard: {
          holderName: card.holderName,
          number: (card.number || "").replace(/\s/g, ""),
          expiryMonth: card.expiryMonth,
          expiryYear: card.expiryYear,
          ccv: card.ccv,
        },
        creditCardHolderInfo: {
          name: card.holderName,
          email: user.email,
          cpfCnpj: cpf,
          postalCode: (holder.postalCode || "").replace(/\D/g, ""),
          addressNumber: String(holder.addressNumber),
          phone: (holder.phone || "").replace(/\D/g, ""),
        },
        remoteIp,
      });
      const paid = ["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"].includes(payment?.status);
      return json({
        paymentId: payment.id,
        credits: p.credits,
        value: p.value,
        method: "card",
        status: payment?.status,
        paid, // crédito real cai pelo webhook; isto só sinaliza a UI
      });
    }

    // ── PIX (default): cobrança + QR ──
    const payment = await asaas("/payments", "POST", { ...base, billingType: "PIX" });

    // QR code — às vezes não fica pronto instantaneamente após criar a cobrança → retry.
    let qr: any = null;
    for (let i = 0; i < 4 && !qr?.payload; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, 700));
      try { qr = await asaas(`/payments/${payment.id}/pixQrCode`, "GET"); } catch (_e) { /* retry */ }
    }
    if (!qr?.payload) return json({ error: "Não foi possível gerar o QR PIX agora. Tente de novo." }, 502);

    return json({
      paymentId: payment.id,
      credits: p.credits,
      value: p.value,
      method: "pix",
      qrImage: qr.encodedImage,   // base64 PNG → data:image/png;base64,<...>
      qrPayload: qr.payload,      // copia-e-cola
      expiration: qr.expirationDate,
    });
  } catch (e: any) {
    console.error("[create-credit-charge] error:", e?.message);
    return json({ error: e?.message || "internal" }, 500);
  }
});
