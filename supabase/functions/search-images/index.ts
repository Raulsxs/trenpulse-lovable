import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SearchImagesRequest {
  query: string;
  category?: string;
  page?: number;
  perPage?: number;
}

// Curated stock image collections by category (using Unsplash Source API)
const categoryKeywords: Record<string, string[]> = {
  healthcare: ["hospital", "doctor", "medical", "healthcare", "nurse", "clinic", "medicine", "stethoscope"],
  technology: ["technology", "digital", "computer", "innovation", "data", "ai", "coding", "software"],
  business: ["business", "office", "meeting", "teamwork", "corporate", "professional", "success"],
  wellness: ["wellness", "health", "fitness", "yoga", "meditation", "nature", "peaceful", "calm"],
  science: ["science", "laboratory", "research", "microscope", "chemistry", "biology", "experiment"],
  people: ["team", "professional people", "diverse group", "collaboration", "communication"],
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { query, category = "business", page = 1, perPage = 12 } = await req.json() as SearchImagesRequest;
    
    // Build search query
    let searchQuery = query || "";
    if (category && categoryKeywords[category]) {
      const categoryTerms = categoryKeywords[category];
      const randomTerm = categoryTerms[Math.floor(Math.random() * categoryTerms.length)];
      searchQuery = query ? `${query} ${randomTerm}` : randomTerm;
    }

    console.log("Searching images for:", searchQuery);

    // Use Unsplash API (free tier with attribution)
    const unsplashUrl = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(searchQuery)}&page=${page}&per_page=${perPage}&orientation=portrait`;
    
    const UNSPLASH_ACCESS_KEY = Deno.env.get("UNSPLASH_ACCESS_KEY");
    if (!UNSPLASH_ACCESS_KEY) {
      console.error("UNSPLASH_ACCESS_KEY not configured");
      const fallbackImages = generateFallbackImages(category, perPage);
      return new Response(JSON.stringify({
        success: true,
        images: fallbackImages,
        source: "fallback",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch(unsplashUrl, {
      headers: {
        "Authorization": `Client-ID ${UNSPLASH_ACCESS_KEY}`,
        "Accept-Version": "v1",
      },
    });

    if (!response.ok) {
      console.error("Unsplash API error:", response.status);
      // Fallback to curated placeholder images
      const fallbackImages = generateFallbackImages(category, perPage);
      return new Response(JSON.stringify({
        success: true,
        images: fallbackImages,
        source: "fallback",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    
    const images = data.results.map((img: any) => ({
      id: img.id,
      url: img.urls.regular,
      thumb: img.urls.small,
      author: img.user.name,
      authorUrl: img.user.links.html,
      downloadUrl: img.urls.full,
      alt: img.alt_description || img.description || searchQuery,
      color: img.color,
    }));

    console.log(`Found ${images.length} images`);

    return new Response(JSON.stringify({
      success: true,
      images,
      total: data.total,
      totalPages: data.total_pages,
      source: "unsplash",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("search-images error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function generateFallbackImages(category: string, count: number) {
  const colors = ["0D9488", "3B82F6", "8B5CF6", "EC4899", "F59E0B", "10B981"];
  const images = [];
  
  for (let i = 0; i < count; i++) {
    const color = colors[i % colors.length];
    images.push({
      id: `fallback-${category}-${i}`,
      url: `https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=800&h=1200&fit=crop&auto=format`,
      thumb: `https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=400&h=600&fit=crop&auto=format`,
      author: "Stock Photo",
      authorUrl: "#",
      downloadUrl: `https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=1080&h=1350&fit=crop&auto=format`,
      alt: `${category} image ${i + 1}`,
      color: `#${color}`,
    });
  }
  
  return images;
}
