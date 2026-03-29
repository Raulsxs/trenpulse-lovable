/**
 * Hook to fetch and manage the current user's subscription and usage data.
 * Used by Sidebar (usage meter), Paywall, and generation flows.
 */
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface SubscriptionPlan {
  id: string;
  name: string;
  display_name: string;
  price_monthly: number;
  generation_limit: number;
  brand_limit: number;
  features: Record<string, any>;
}

export interface UserSubscription {
  plan: SubscriptionPlan;
  status: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
}

export interface UsageData {
  generations_used: number;
  generations_limit: number;
  publications_used: number;
  plan_name: string;
  plan_display_name: string;
  is_over_limit: boolean;
  usage_percentage: number;
}

const FREE_PLAN: SubscriptionPlan = {
  id: "free",
  name: "free",
  display_name: "Gratuito",
  price_monthly: 0,
  generation_limit: 5,
  brand_limit: 1,
  features: {},
};

export function useSubscription() {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUsage = useCallback(async () => {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) return;

      const userId = session.session.user.id;
      const now = new Date();
      const periodStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

      // Fetch subscription
      const { data: subRaw } = await supabase
        .from("user_subscriptions" as any)
        .select("*, plan:plan_id(*)")
        .eq("user_id", userId)
        .eq("status", "active")
        .single();

      const sub = subRaw as any;
      const plan: SubscriptionPlan = sub?.plan || FREE_PLAN;

      // Fetch usage for current month
      const { data: usageRaw } = await supabase
        .from("usage_tracking" as any)
        .select("generations_count, publications_count")
        .eq("user_id", userId)
        .eq("period_start", periodStart)
        .single();

      const usageRow = usageRaw as any;

      const generationsUsed = usageRow?.generations_count || 0;

      const usageData: UsageData = {
        generations_used: generationsUsed,
        generations_limit: plan.generation_limit,
        publications_used: usageRow?.publications_count || 0,
        plan_name: plan.name,
        plan_display_name: plan.display_name,
        is_over_limit: generationsUsed >= plan.generation_limit,
        usage_percentage: plan.generation_limit > 0
          ? Math.min(100, Math.round((generationsUsed / plan.generation_limit) * 100))
          : 0,
      };

      setUsage(usageData);
      setSubscription(sub ? {
        plan,
        status: sub.status,
        current_period_end: sub.current_period_end,
        cancel_at_period_end: sub.cancel_at_period_end,
      } : null);
    } catch (err) {
      // Tables might not exist yet — use free plan defaults
      console.warn("[useSubscription] Could not fetch subscription data:", (err as Error).message);
      setUsage({
        generations_used: 0,
        generations_limit: FREE_PLAN.generation_limit,
        publications_used: 0,
        plan_name: "free",
        plan_display_name: "Gratuito",
        is_over_limit: false,
        usage_percentage: 0,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  return { usage, subscription, loading, refetch: fetchUsage };
}
