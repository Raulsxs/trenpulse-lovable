/**
 * admin-analytics — Admin-only endpoint returning platform analytics.
 * Restricted to raul.sxs27@gmail.com. Uses service_role to bypass RLS.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ADMIN_EMAIL = "raul.sxs27@gmail.com";

// inference.sh cost per call (USD)
const COST_PER_CALL: Record<string, number> = {
  "google/gemini-3-1-flash-image-preview": 0.076,
  "google/gemini-2-5-flash-image": 0.039,
  "openrouter/minimax-m-25": 0.001,
  "openrouter/gemini-3-pro-preview": 0.001,
  "photo_background": 0,
  "saved_template": 0,
  "user_upload": 0,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller is admin
    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await anonClient.auth.getUser();
    if (!user || user.email !== ADMIN_EMAIL) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const svc = createClient(supabaseUrl, serviceKey);

    const now = new Date();
    const periodStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Run all queries in parallel
    const [
      usersResult,
      profilesResult,
      subscriptionsResult,
      plansResult,
      usageResult,
      imageGensResult,
      contentsResult,
      contentsByDayResult,
      lastActiveResult,
    ] = await Promise.all([
      // 1. All auth users (for email mapping)
      svc.auth.admin.listUsers({ perPage: 1000 }),

      // 2. All profiles
      svc.from("profiles").select("user_id, full_name, company_name, created_at"),

      // 3. Active subscriptions with plan info
      svc.from("user_subscriptions")
        .select("user_id, status, plan_id, plan:plan_id(name, display_name, price_monthly)")
        .eq("status", "active"),

      // 4. All plans
      svc.from("subscription_plans").select("*").eq("is_active", true),

      // 5. Usage tracking for current month
      svc.from("usage_tracking")
        .select("user_id, generations_count, publications_count")
        .eq("period_start", periodStart),

      // 6. Image generations by model (all time)
      svc.from("image_generations").select("model_used, created_at"),

      // 7. Generated contents (all)
      svc.from("generated_contents").select("user_id, platform, content_type, status, created_at"),

      // 8. Contents by day (last 30 days)
      svc.from("generated_contents")
        .select("created_at")
        .gte("created_at", thirtyDaysAgo),

      // 9. Last activity per user
      svc.from("chat_messages")
        .select("user_id, created_at")
        .order("created_at", { ascending: false }),
    ]);

    // Build email map from auth users
    const authUsers = usersResult.data?.users || [];
    const emailMap = new Map<string, string>();
    for (const u of authUsers) {
      emailMap.set(u.id, u.email || "");
    }

    // Build last active map (most recent chat message per user)
    const lastActiveMap = new Map<string, string>();
    for (const msg of (lastActiveResult.data || [])) {
      if (!lastActiveMap.has(msg.user_id)) {
        lastActiveMap.set(msg.user_id, msg.created_at);
      }
    }

    // Build subscription map
    const subMap = new Map<string, any>();
    for (const sub of (subscriptionsResult.data || [])) {
      subMap.set(sub.user_id, sub);
    }

    // Build usage map
    const usageMap = new Map<string, any>();
    for (const u of (usageResult.data || [])) {
      usageMap.set(u.user_id, u);
    }

    // ── KPIs ──
    const totalUsers = authUsers.length;
    const allContents = contentsResult.data || [];
    const thisMonthContents = allContents.filter(
      (c: any) => c.created_at >= periodStart
    );
    const activeUserIds = new Set(thisMonthContents.map((c: any) => c.user_id));
    const activeThisMonth = activeUserIds.size;
    const totalGenerations = allContents.length;

    // Cost by model
    const imageGens = imageGensResult.data || [];
    const modelCounts: Record<string, number> = {};
    for (const ig of imageGens) {
      const model = ig.model_used || "unknown";
      modelCounts[model] = (modelCounts[model] || 0) + 1;
    }
    const costByModel = Object.entries(modelCounts).map(([model, calls]) => ({
      model: model.split("/").pop() || model,
      modelFull: model,
      calls,
      cost: Math.round((calls * (COST_PER_CALL[model] || 0.01)) * 100) / 100,
    })).sort((a, b) => b.cost - a.cost);

    const estimatedCostUsd = costByModel.reduce((sum, m) => sum + m.cost, 0);

    // MRR
    const activeSubs = subscriptionsResult.data || [];
    const estimatedMrrBrl = activeSubs.reduce((sum: number, sub: any) => {
      const plan = sub.plan as any;
      return sum + ((plan?.price_monthly || 0) / 100);
    }, 0);

    // ── Users table ──
    const profiles = profilesResult.data || [];
    const users = profiles.map((p: any) => {
      const usage = usageMap.get(p.user_id);
      const sub = subMap.get(p.user_id);
      const plan = sub?.plan as any;
      const gens = usage?.generations_count || 0;
      // Estimate cost: proportional to generations vs total
      const userCostEstimate = totalGenerations > 0
        ? Math.round((gens / totalGenerations) * estimatedCostUsd * 100) / 100
        : 0;

      return {
        userId: p.user_id,
        email: emailMap.get(p.user_id) || "",
        fullName: p.full_name,
        companyName: p.company_name,
        planName: plan?.display_name || plan?.name || "Free",
        generationsThisMonth: gens,
        publicationsThisMonth: usage?.publications_count || 0,
        estimatedCostUsd: userCostEstimate,
        lastActive: lastActiveMap.get(p.user_id) || null,
        createdAt: p.created_at,
      };
    }).sort((a: any, b: any) => b.generationsThisMonth - a.generationsThisMonth);

    // ── Daily generations (last 30 days) ──
    const dailyMap: Record<string, number> = {};
    for (const c of (contentsByDayResult.data || [])) {
      const day = c.created_at?.substring(0, 10);
      if (day) dailyMap[day] = (dailyMap[day] || 0) + 1;
    }
    const dailyGenerations = Object.entries(dailyMap)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // ── Platform split ──
    const platformCounts: Record<string, number> = {};
    for (const c of allContents) {
      const p = c.platform || "instagram";
      platformCounts[p] = (platformCounts[p] || 0) + 1;
    }
    const platformSplit = Object.entries(platformCounts).map(([platform, count]) => ({
      platform, count,
    }));

    // ── Content type split ──
    const typeCounts: Record<string, number> = {};
    for (const c of allContents) {
      const t = c.content_type || "post";
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    }
    const contentTypeSplit = Object.entries(typeCounts).map(([contentType, count]) => ({
      contentType, count,
    }));

    // ── Status split ──
    const statusCounts: Record<string, number> = {};
    for (const c of allContents) {
      const s = c.status || "draft";
      statusCounts[s] = (statusCounts[s] || 0) + 1;
    }
    const statusSplit = Object.entries(statusCounts).map(([status, count]) => ({
      status, count,
    }));

    // ── Image generations by month (cost trend) ──
    const monthlyImageCost: Record<string, number> = {};
    for (const ig of imageGens) {
      const month = ig.created_at?.substring(0, 7); // YYYY-MM
      if (month) {
        const cost = COST_PER_CALL[ig.model_used] || 0.01;
        monthlyImageCost[month] = (monthlyImageCost[month] || 0) + cost;
      }
    }
    const costTrend = Object.entries(monthlyImageCost)
      .map(([month, cost]) => ({ month, cost: Math.round(cost * 100) / 100 }))
      .sort((a, b) => a.month.localeCompare(b.month));

    return new Response(
      JSON.stringify({
        kpis: {
          totalUsers,
          activeThisMonth,
          totalGenerations,
          generationsThisMonth: thisMonthContents.length,
          estimatedCostUsd: Math.round(estimatedCostUsd * 100) / 100,
          estimatedMrrBrl: Math.round(estimatedMrrBrl * 100) / 100,
          totalImages: imageGens.length,
        },
        users,
        costByModel,
        costTrend,
        dailyGenerations,
        platformSplit,
        contentTypeSplit,
        statusSplit,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("admin-analytics error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
