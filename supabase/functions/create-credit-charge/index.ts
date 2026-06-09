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
const PACKS: Record<string, { value: number; credits: number }> = {
  "50": { value: 50, credits: 500 },
  "100": { value: 100, credits: 1050 },   // +5% bônus
  "200": { value: 200, credits: 2200 },   // +10% bônus
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

    const { pack, cpfCnpj, name } = await req.json();
    const p = PACKS[String(pack)];
    if (!p) return json({ error: "Pacote inválido" }, 400);
    const cpf = (cpfCnpj || "").replace(/\D/g, "");
    if (cpf.length !== 11 && cpf.length !== 14) return json({ error: "CPF/CNPJ inválido" }, 400);

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

    // 2. Cobrança PIX
    const dueDate = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10); // +2 dias
    const payment = await asaas("/payments", "POST", {
      customer: customerId,
      billingType: "PIX",
      value: p.value,
      dueDate,
      externalReference: `topup:${user.id}:${p.credits}`,
      description: `Recarga TrendPulse — ${p.credits} créditos (R$${p.value})`,
    });

    // 3. QR code — às vezes não fica pronto instantaneamente após criar a cobrança → retry.
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
      qrImage: qr.encodedImage,   // base64 PNG → data:image/png;base64,<...>
      qrPayload: qr.payload,      // copia-e-cola
      expiration: qr.expirationDate,
    });
  } catch (e: any) {
    console.error("[create-credit-charge] error:", e?.message);
    return json({ error: e?.message || "internal" }, 500);
  }
});
