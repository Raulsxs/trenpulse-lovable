import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchAI } from "../_shared/ai-gateway.ts";

async function aiGatewayFetch(body: Record<string, unknown>): Promise<Response> {
  try {
    const result = await fetchAI(body as any);
    return new Response(JSON.stringify({ choices: result.choices }), {
      status: result.ok ? 200 : (result.status || 500),
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[aiGatewayFetch] Exception:", err?.message || err);
    return new Response(JSON.stringify({ choices: [{ message: { content: "" } }], error: err?.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Broad theme list — any niche can be categorized
const ALLOWED_THEMES = [
  "Tecnologia", "Marketing", "Negócios", "Saúde", "Educação",
  "Finanças", "RH", "Sustentabilidade", "Varejo", "Jurídico",
  "Gastronomia", "Moda", "Esporte", "Entretenimento", "Inovação",
  "Gestão", "Qualidade", "Geral",
];

function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, "").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "").trim();
}

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

interface TrendData {
  title: string;
  description: string;
  source: string;
  source_url: string;
  theme: string;
  keywords: string[];
  relevance_score: number;
  full_content?: string;
}

function sanitizeTrend(trend: TrendData, fallbackTheme: string): TrendData | null {
  const title = stripHtml(trend.title || "");
  const description = stripHtml(trend.description || "");
  const sourceUrl = trend.source_url || "";

  if (!title || !isValidUrl(sourceUrl)) return null;

  const theme = ALLOWED_THEMES.includes(trend.theme) ? trend.theme : fallbackTheme;
  const keywords = (trend.keywords || [])
    .filter((k): k is string => typeof k === "string")
    .map((k) => stripHtml(k).substring(0, 50))
    .slice(0, 5);
  const score = typeof trend.relevance_score === "number"
    ? Math.max(0, Math.min(100, Math.round(trend.relevance_score)))
    : 50;

  return {
    title: title.substring(0, 255),
    description: description.substring(0, 500),
    source: stripHtml(trend.source || "").substring(0, 100),
    source_url: sourceUrl,
    theme,
    keywords,
    relevance_score: score,
    full_content: trend.full_content || undefined,
  };
}

// Generic default sources (no sector bias)
const DEFAULT_SOURCES = [
  { name: "G1 Economia", url: "https://g1.globo.com/economia/", searchQuery: "" },
  { name: "Exame", url: "https://exame.com/", searchQuery: "" },
  { name: "InfoMoney", url: "https://www.infomoney.com.br/", searchQuery: "" },
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Support two auth modes:
    // 1. User JWT (from frontend) → auth.getUser()
    // 2. Service role key + user_id in body (from trends-scheduler cron)
    let userId: string;
    const body = await req.json().catch(() => ({}));
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const token = authHeader.replace("Bearer ", "");

    if (token === serviceRoleKey && body.user_id) {
      // Called from scheduler with service role — trust the user_id
      userId = body.user_id;
    } else {
      // Normal user auth
      const supabaseAuth = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );

      const { data: userData, error: userError } = await supabaseAuth.auth.getUser();
      if (userError || !userData?.user) {
        return new Response(
          JSON.stringify({ error: "Invalid token" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      userId = userData.user.id;
    }

    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const apiKey = Deno.env.get("LOVABLE_API_KEY") || Deno.env.get("INFERENCE_SH_API_KEY") || Deno.env.get("GOOGLE_AI_API_KEY") || "";

    if (!FIRECRAWL_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: "Firecrawl not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: "Database not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── Load user context for personalization ──
    const { data: userCtx } = await supabase
      .from("ai_user_context")
      .select("business_niche, content_topics, extra_context")
      .eq("user_id", userId)
      .maybeSingle();

    const niche = userCtx?.business_niche || "";
    const topics: string[] = userCtx?.content_topics || [];
    const extraCtx = (userCtx?.extra_context as Record<string, unknown>) || {};
    const refSources = (extraCtx.reference_sources as string[]) || [];

    // Build personalized search query from niche + topics
    const nicheQuery = [niche, ...topics.slice(0, 3)].filter(Boolean).join(" ");
    const fallbackTheme = detectThemeFromNiche(niche);

    // Load user's custom RSS sources from profile
    const { data: profileData } = await supabase
      .from("profiles")
      .select("rss_sources, interest_areas")
      .eq("user_id", userId)
      .single();

    // ── Build source list ──
    // 1. Default generic sources with niche-personalized queries
    const allSources = DEFAULT_SOURCES.map((s) => ({
      ...s,
      searchQuery: nicheQuery
        ? `${nicheQuery} tendências ${new Date().getFullYear()}`
        : `tendências negócios ${new Date().getFullYear()}`,
    }));

    // 2. User reference_sources from ai_user_context
    for (const rawUrl of refSources) {
      const url = typeof rawUrl === "string"
        ? rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`
        : null;
      if (url && isValidUrl(url)) {
        try {
          const hostname = new URL(url).hostname.replace("www.", "");
          const exists = allSources.some((s) => s.url.includes(hostname));
          if (!exists) {
            allSources.push({ name: hostname, url, searchQuery: nicheQuery || "tendências" });
          }
        } catch { /* skip */ }
      }
    }

    // 3. User RSS sources from profile
    if (profileData?.rss_sources && Array.isArray(profileData.rss_sources)) {
      for (const rssUrl of profileData.rss_sources) {
        if (typeof rssUrl === "string" && isValidUrl(rssUrl)) {
          try {
            const hostname = new URL(rssUrl).hostname.replace("www.", "");
            const exists = allSources.some((s) => s.url.includes(hostname));
            if (!exists) {
              allSources.push({
                name: hostname,
                url: rssUrl,
                searchQuery: nicheQuery || `tendências ${(profileData.interest_areas || []).slice(0, 3).join(" ")}`.trim(),
              });
            }
          } catch { /* skip */ }
        }
      }
    }

    console.log(`[scrape-trends] user=${userId}, niche="${niche}", sources=${allSources.length}, query="${nicheQuery}"`);

    const allTrends: TrendData[] = [];

    // ── Search for trends using Firecrawl ──
    for (const source of allSources) {
      try {
        console.log(`Searching: "${source.searchQuery}" (${source.name})`);

        const searchResponse = await fetch("https://api.firecrawl.dev/v1/search", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: source.searchQuery,
            limit: 5,
            lang: "pt",
            country: "BR",
            tbs: "qdr:w",
            scrapeOptions: { formats: ["markdown"] },
          }),
        });

        if (!searchResponse.ok) {
          console.error(`Search failed for ${source.name}:`, await searchResponse.text());
          continue;
        }

        const searchData = await searchResponse.json();
        console.log(`Found ${searchData.data?.length || 0} results for ${source.name}`);

        if (searchData.data && Array.isArray(searchData.data)) {
          for (const result of searchData.data) {
            if (result.title && result.url) {
              const fullContent = result.markdown ? result.markdown.substring(0, 15000) : "";
              allTrends.push({
                title: result.title,
                description: result.description || result.markdown?.substring(0, 300) || "",
                source: source.name,
                source_url: result.url,
                theme: detectTheme(result.title + " " + (result.description || ""), niche),
                keywords: extractKeywords(result.title + " " + (result.description || ""), niche, topics),
                relevance_score: Math.floor(Math.random() * 30) + 70,
                full_content: fullContent,
              });
            }
          }
        }
      } catch (error) {
        console.error(`Error scraping ${source.name}:`, error);
      }
    }

    console.log(`Total trends found: ${allTrends.length}`);

    // ── AI enrichment ──
    if (allTrends.length > 0 && apiKey) {
      try {
        console.log("Enriching trends with AI...");

        const trendsForAi = allTrends.slice(0, 10).map((t) => ({
          title: t.title,
          description: t.description,
          source: t.source,
          source_url: t.source_url,
          theme: t.theme,
          keywords: t.keywords,
          relevance_score: t.relevance_score,
        }));

        const themesStr = ALLOWED_THEMES.join('", "');
        const nicheContext = niche ? `O nicho do usuário é "${niche}". Priorize relevância para esse setor.` : "";

        const aiResponse = await aiGatewayFetch({
          model: "google/gemini-2.5-flash-lite",
          messages: [
            {
              role: "system",
              content: `Você é um especialista em tendências de mercado.
${nicheContext}
Analise as tendências fornecidas e retorne um JSON válido com:
- theme: uma das categorias: "${themesStr}"
- description melhorada (máx 200 chars)
- keywords relevantes (3-5)
- relevance_score (70-99) baseado em atualidade e impacto${niche ? ` para o setor de ${niche}` : ""}

Retorne APENAS o JSON válido, sem markdown ou explicações.`,
            },
            { role: "user", content: JSON.stringify(trendsForAi) },
          ],
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          const enrichedContent = aiData.choices?.[0]?.message?.content;

          if (enrichedContent) {
            try {
              const enrichedTrends = JSON.parse(enrichedContent.replace(/```json\n?|\n?```/g, ""));
              if (Array.isArray(enrichedTrends)) {
                for (let i = 0; i < Math.min(enrichedTrends.length, allTrends.length); i++) {
                  allTrends[i] = {
                    ...allTrends[i],
                    ...enrichedTrends[i],
                    full_content: allTrends[i].full_content,
                  };
                }
                console.log("Trends enriched successfully");
              }
            } catch (parseError) {
              console.error("Failed to parse AI response:", parseError);
            }
          }
        }
      } catch (aiError) {
        console.error("AI enrichment failed:", aiError);
      }
    }

    // ── Insert trends with user_id ──
    let insertedCount = 0;
    for (const raw of allTrends) {
      const trend = sanitizeTrend(raw, fallbackTheme);
      if (!trend) {
        console.warn("Skipped invalid trend:", raw.title?.substring(0, 40));
        continue;
      }

      // Check duplicate by source_url + user_id
      const { data: existing } = await supabase
        .from("trends")
        .select("id")
        .eq("source_url", trend.source_url)
        .eq("user_id", userId)
        .maybeSingle();

      if (!existing) {
        const { error: insertError } = await supabase.from("trends").insert({
          title: trend.title,
          description: trend.description,
          source: trend.source,
          source_url: trend.source_url,
          theme: trend.theme,
          keywords: trend.keywords,
          relevance_score: trend.relevance_score,
          full_content: trend.full_content || null,
          is_active: true,
          scraped_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          user_id: userId,
        });

        if (insertError) {
          console.error("Insert error:", insertError);
        } else {
          insertedCount++;
        }
      }
    }

    console.log(`Inserted ${insertedCount} new trends for user ${userId}`);

    return new Response(
      JSON.stringify({
        success: true,
        found: allTrends.length,
        inserted: insertedCount,
        sources_used: allSources.length,
        niche: niche || "generic",
        message: `Scraped ${allTrends.length} trends from ${allSources.length} sources, inserted ${insertedCount} new`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Scraping error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Scraping failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ── Theme detection with niche awareness ──
function detectThemeFromNiche(niche: string): string {
  if (!niche) return "Geral";
  const lower = niche.toLowerCase();
  for (const theme of ALLOWED_THEMES) {
    if (lower.includes(theme.toLowerCase())) return theme;
  }
  // Common niche → theme mappings
  if (lower.includes("hospital") || lower.includes("médic") || lower.includes("saúde") || lower.includes("clínic")) return "Saúde";
  if (lower.includes("advocacia") || lower.includes("direito") || lower.includes("jurídic")) return "Jurídico";
  if (lower.includes("restaurante") || lower.includes("comida") || lower.includes("culinária")) return "Gastronomia";
  if (lower.includes("loja") || lower.includes("e-commerce") || lower.includes("ecommerce")) return "Varejo";
  if (lower.includes("escola") || lower.includes("curso") || lower.includes("ensino")) return "Educação";
  if (lower.includes("fitness") || lower.includes("academia") || lower.includes("esporte")) return "Esporte";
  return "Negócios";
}

function detectTheme(text: string, niche?: string): string {
  const lower = text.toLowerCase();

  if (lower.includes("ia ") || lower.includes("inteligência artificial") || lower.includes("digital") || lower.includes("software") || lower.includes("tech")) return "Tecnologia";
  if (lower.includes("marketing") || lower.includes("redes sociais") || lower.includes("engajamento") || lower.includes("branding")) return "Marketing";
  if (lower.includes("sustentab") || lower.includes("esg") || lower.includes("ambiental")) return "Sustentabilidade";
  if (lower.includes("inovaç") || lower.includes("startup") || lower.includes("disrupt")) return "Inovação";
  if (lower.includes("burnout") || lower.includes("colaborador") || lower.includes("rh") || lower.includes("recursos humanos")) return "RH";
  if (lower.includes("custo") || lower.includes("financ") || lower.includes("investimento")) return "Finanças";
  if (lower.includes("gestão") || lower.includes("administra") || lower.includes("eficiência")) return "Gestão";
  if (lower.includes("saúde") || lower.includes("hospital") || lower.includes("médic")) return "Saúde";
  if (lower.includes("educa") || lower.includes("ensino") || lower.includes("escola")) return "Educação";
  if (lower.includes("varejo") || lower.includes("loja") || lower.includes("e-commerce")) return "Varejo";
  if (lower.includes("moda") || lower.includes("fashion") || lower.includes("estilo")) return "Moda";
  if (lower.includes("gastro") || lower.includes("restaurante") || lower.includes("culinária")) return "Gastronomia";
  if (lower.includes("direito") || lower.includes("jurídic") || lower.includes("lei ")) return "Jurídico";
  if (lower.includes("esporte") || lower.includes("fitness") || lower.includes("academia")) return "Esporte";

  // Fallback to niche-derived theme
  if (niche) return detectThemeFromNiche(niche);
  return "Geral";
}

function extractKeywords(text: string, niche?: string, topics?: string[]): string[] {
  const keywords: string[] = [];
  const lower = text.toLowerCase();

  const genericTerms = [
    "ia", "inteligência artificial", "transformação digital", "inovação",
    "sustentabilidade", "esg", "marketing digital", "redes sociais",
    "gestão", "tecnologia", "startup", "investimento", "tendências",
    "automação", "produtividade", "liderança", "empreendedorismo",
  ];

  // Add niche-specific terms
  const nicheTerms = [niche, ...(topics || [])].filter(Boolean).map((t) => t!.toLowerCase());

  for (const term of [...nicheTerms, ...genericTerms]) {
    if (lower.includes(term) && keywords.length < 5 && !keywords.includes(term)) {
      keywords.push(term);
    }
  }

  return keywords.length > 0 ? keywords : (niche ? [niche.toLowerCase()] : ["negócios"]);
}
