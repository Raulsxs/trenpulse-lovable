import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { brandId, force } = await req.json();
    if (!brandId) throw new Error("brandId is required");

    // Load brand dirty state
    const { data: brand, error: brandError } = await supabase
      .from("brands")
      .select("id, template_sets_dirty, template_sets_dirty_count, template_sets_updated_at")
      .eq("id", brandId)
      .single();

    if (brandError || !brand) throw new Error("Brand not found");

    if (force) {
      // Force refresh
      return await callGenerateTemplateSets(req, brandId, corsHeaders);
    }

    if (!brand.template_sets_dirty) {
      return new Response(JSON.stringify({ skipped: true, reason: "not_dirty" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check thresholds
    const dirtyCount = brand.template_sets_dirty_count || 0;
    const lastUpdate = brand.template_sets_updated_at ? new Date(brand.template_sets_updated_at) : null;
    const hoursAgo = lastUpdate ? (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60) : Infinity;

    const shouldRefresh = dirtyCount >= 3 || !lastUpdate || hoursAgo > 24;

    if (!shouldRefresh) {
      return new Response(JSON.stringify({
        skipped: true,
        reason: "threshold_not_met",
        dirty_count: dirtyCount,
        hours_since_update: Math.round(hoursAgo),
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return await callGenerateTemplateSets(req, brandId, corsHeaders);
  } catch (error) {
    console.error("[update-template-sets-if-needed] error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Unknown error",
    }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function callGenerateTemplateSets(
  req: Request,
  brandId: string,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const authHeader = req.headers.get("Authorization")!;

  const response = await fetch(`${supabaseUrl}/functions/v1/generate-template-sets`, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ brandId }),
  });

  const data = await response.json();

  if (!response.ok) {
    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ refreshed: true, ...data }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
