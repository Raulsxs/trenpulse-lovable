/**
 * manage-subscription — Asaas payment gateway integration.
 * Handles customer creation, subscription management, and webhook processing.
 *
 * Endpoints (via POST body "action"):
 *   create-customer    → Creates Asaas customer from user profile
 *   create-subscription → Creates subscription (PIX/boleto/cartão)
 *   get-subscription   → Returns current subscription + payment link
 *   cancel             → Cancels at period end
 *   webhook            → Receives Asaas payment notifications
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ASAAS_BASE_URL = "https://sandbox.asaas.com/api/v3";
// Production: "https://api.asaas.com/v3"

async function asaasRequest(path: string, method: string, body?: any) {
  const apiKey = Deno.env.get("ASAAS_API_KEY");
  if (!apiKey) throw new Error("ASAAS_API_KEY not configured");

  const res = await fetch(`${ASAAS_BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "access_token": apiKey,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const data = await res.json();
  if (!res.ok) {
    console.error(`[manage-subscription] Asaas ${method} ${path} failed:`, JSON.stringify(data));
    throw new Error(data.errors?.[0]?.description || `Asaas error: ${res.status}`);
  }
  return data;
}

const ASAAS_WEBHOOK_TOKEN = "whsec_7gE6SplECFwo9HaHDwt1n0uE5EEW5oqnFDVzAQfbfEM";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const rawBody = await req.text();
    const body = JSON.parse(rawBody);

    // Detect webhook: Asaas sends "event" field at root level (no "action" field)
    // Also validate webhook token from header
    const isWebhook = body.event && !body.action;
    const webhookToken = req.headers.get("asaas-access-token") || req.headers.get("access_token");

    if (isWebhook) {
      // Validate webhook authenticity
      if (webhookToken !== ASAAS_WEBHOOK_TOKEN) {
        console.warn("[manage-subscription] Webhook rejected: invalid token");
        return new Response(JSON.stringify({ error: "Invalid webhook token" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const action = isWebhook ? "webhook" : body.action;
    const params = isWebhook ? body : (({ action: _, ...rest }) => rest)(body);
    console.log(`[manage-subscription] action=${action}${isWebhook ? " (webhook)" : ""}`);

    switch (action) {
      // ══════ CREATE CUSTOMER ══════
      case "create-customer": {
        const { user_id, name, email, cpf_cnpj, phone } = params;
        if (!user_id || !name || !email) {
          throw new Error("user_id, name, and email are required");
        }

        // Check if customer already exists
        const { data: existingSub } = await supabase
          .from("user_subscriptions")
          .select("asaas_customer_id")
          .eq("user_id", user_id)
          .single();

        if (existingSub?.asaas_customer_id) {
          // Update existing customer with CPF/CNPJ if provided
          if (cpf_cnpj) {
            try {
              await asaasRequest(`/customers/${existingSub.asaas_customer_id}`, "POST", {
                cpfCnpj: cpf_cnpj,
              });
            } catch (e) {
              console.warn("[manage-subscription] Could not update customer CPF/CNPJ:", (e as Error).message);
            }
          }
          return new Response(
            JSON.stringify({ success: true, customer_id: existingSub.asaas_customer_id, existing: true }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        // Create customer in Asaas
        const customer = await asaasRequest("/customers", "POST", {
          name,
          email,
          cpfCnpj: cpf_cnpj || undefined,
          phone: phone || undefined,
          externalReference: user_id,
        });

        console.log(`[manage-subscription] Asaas customer created: ${customer.id}`);

        return new Response(
          JSON.stringify({ success: true, customer_id: customer.id }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // ══════ CREATE SUBSCRIPTION ══════
      case "create-subscription": {
        const { user_id, plan_name, customer_id, billing_type } = params;
        if (!user_id || !plan_name || !customer_id) {
          throw new Error("user_id, plan_name, and customer_id are required");
        }

        // Get plan from DB
        const { data: plan, error: planErr } = await supabase
          .from("subscription_plans")
          .select("*")
          .eq("name", plan_name)
          .eq("is_active", true)
          .single();

        if (planErr || !plan) throw new Error(`Plan ${plan_name} not found`);
        if (plan.price_monthly === 0) throw new Error("Cannot subscribe to free plan via payment");

        const priceInReais = plan.price_monthly / 100;

        // Create subscription in Asaas
        const subscription = await asaasRequest("/subscriptions", "POST", {
          customer: customer_id,
          billingType: billing_type || "UNDEFINED", // UNDEFINED = customer chooses (PIX/boleto/cartão)
          value: priceInReais,
          cycle: "MONTHLY",
          description: `TrendPulse ${plan.display_name}`,
          externalReference: user_id,
        });

        console.log(`[manage-subscription] Asaas subscription created: ${subscription.id}`);

        // Save to DB
        const now = new Date();
        const periodEnd = new Date(now);
        periodEnd.setDate(periodEnd.getDate() + 30);

        await supabase.from("user_subscriptions").upsert({
          user_id,
          plan_id: plan.id,
          status: "pending",
          asaas_subscription_id: subscription.id,
          asaas_customer_id: customer_id,
          current_period_start: now.toISOString(),
          current_period_end: periodEnd.toISOString(),
          updated_at: now.toISOString(),
        }, { onConflict: "user_id" });

        // Get payment link for the first invoice
        let paymentLink = null;
        try {
          const payments = await asaasRequest(`/subscriptions/${subscription.id}/payments`, "GET");
          if (payments.data?.[0]?.invoiceUrl) {
            paymentLink = payments.data[0].invoiceUrl;
          } else if (payments.data?.[0]?.id) {
            paymentLink = `https://sandbox.asaas.com/i/${payments.data[0].id}`;
          }
        } catch (err) {
          console.warn("[manage-subscription] Could not fetch payment link:", (err as Error).message);
        }

        return new Response(
          JSON.stringify({
            success: true,
            subscription_id: subscription.id,
            payment_link: paymentLink,
            plan: plan.display_name,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // ══════ GET SUBSCRIPTION ══════
      case "get-subscription": {
        const { user_id } = params;
        if (!user_id) throw new Error("user_id is required");

        const { data: sub } = await supabase
          .from("user_subscriptions")
          .select("*, plan:plan_id(*)")
          .eq("user_id", user_id)
          .single();

        if (!sub) {
          // Return free plan info
          const { data: freePlan } = await supabase
            .from("subscription_plans")
            .select("*")
            .eq("name", "free")
            .single();

          return new Response(
            JSON.stringify({ success: true, subscription: null, plan: freePlan }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        return new Response(
          JSON.stringify({ success: true, subscription: sub }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // ══════ CANCEL ══════
      case "cancel": {
        const { user_id } = params;
        if (!user_id) throw new Error("user_id is required");

        const { data: sub } = await supabase
          .from("user_subscriptions")
          .select("asaas_subscription_id")
          .eq("user_id", user_id)
          .single();

        if (!sub?.asaas_subscription_id) {
          throw new Error("No active subscription found");
        }

        // Cancel in Asaas (at period end)
        await asaasRequest(`/subscriptions/${sub.asaas_subscription_id}`, "DELETE");

        // Update DB
        await supabase
          .from("user_subscriptions")
          .update({
            cancel_at_period_end: true,
            status: "canceled",
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", user_id);

        console.log(`[manage-subscription] Subscription canceled for user ${user_id}`);

        return new Response(
          JSON.stringify({ success: true, message: "Assinatura cancelada. Acesso até o fim do período." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // ══════ WEBHOOK ══════
      case "webhook": {
        // Asaas sends payment events directly (event + payment at root level)
        console.log(`[manage-subscription] Webhook event: ${params.event}`, JSON.stringify(params).substring(0, 500));

        const eventType = params.event;
        const payment = params.payment;

        if (!payment?.subscription) {
          console.log("[manage-subscription] Webhook without subscription ID, skipping");
          return new Response(JSON.stringify({ received: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Find user by subscription ID
        const { data: sub } = await supabase
          .from("user_subscriptions")
          .select("user_id, plan_id")
          .eq("asaas_subscription_id", payment.subscription)
          .single();

        if (!sub) {
          console.warn("[manage-subscription] Webhook: subscription not found in DB:", payment.subscription);
          return new Response(JSON.stringify({ received: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        switch (eventType) {
          case "PAYMENT_CONFIRMED":
          case "PAYMENT_RECEIVED": {
            // Payment successful — activate/renew subscription
            const now = new Date();
            const periodEnd = new Date(now);
            periodEnd.setDate(periodEnd.getDate() + 30);

            await supabase
              .from("user_subscriptions")
              .update({
                status: "active",
                current_period_start: now.toISOString(),
                current_period_end: periodEnd.toISOString(),
                cancel_at_period_end: false,
                updated_at: now.toISOString(),
              })
              .eq("user_id", sub.user_id);

            // Reset monthly usage counter
            const periodStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
            await supabase.from("usage_tracking").upsert({
              user_id: sub.user_id,
              period_start: periodStart,
              generations_count: 0,
              publications_count: 0,
              updated_at: now.toISOString(),
            }, { onConflict: "user_id, period_start" });

            console.log(`[manage-subscription] Payment confirmed for user ${sub.user_id}`);
            break;
          }

          case "PAYMENT_OVERDUE": {
            await supabase
              .from("user_subscriptions")
              .update({ status: "past_due", updated_at: new Date().toISOString() })
              .eq("user_id", sub.user_id);
            break;
          }

          case "PAYMENT_DELETED":
          case "PAYMENT_REFUNDED": {
            await supabase
              .from("user_subscriptions")
              .update({ status: "canceled", updated_at: new Date().toISOString() })
              .eq("user_id", sub.user_id);
            break;
          }
        }

        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (error: any) {
    console.error("[manage-subscription] Error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
