// generate-video — vídeo animado via Grok (xai/grok-imagine-video no Replicate).
// Estilo: animação EXPLICATIVA sobre um tema (motion graphics), seguindo a marca OU livre.
// NUNCA avatar/pessoa/rosto. text-to-video (do tema) ou image-to-video (anima uma imagem).
// Chamada interna (service_role) — reusada pela tool gerar_video do /agent. verify_jwt=false.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GROK_SLUG = "xai/grok-imagine-video";

/** Gera o vídeo no Grok (Prefer:wait + poll). Retorna URL do .mp4 ou null. */
async function grokVideo(token: string, input: Record<string, unknown>): Promise<string | null> {
  try {
    const res = await fetch(`https://api.replicate.com/v1/models/${GROK_SLUG}/predictions`, {
      method: "POST",
      headers: { Authorization: `Token ${token}`, "Content-Type": "application/json", Prefer: "wait" },
      body: JSON.stringify({ input }),
    });
    if (!res.ok) { console.error(`[generate-video] Grok HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`); return null; }
    let pred = await res.json();
    const start = Date.now();
    while (pred.status && !["succeeded", "failed", "canceled"].includes(pred.status) && Date.now() - start < 140000) {
      await new Promise((r) => setTimeout(r, 3000));
      const pr = await fetch(`https://api.replicate.com/v1/predictions/${pred.id}`, { headers: { Authorization: `Token ${token}` } });
      if (!pr.ok) break;
      pred = await pr.json();
    }
    if (pred.status !== "succeeded") { console.warn(`[generate-video] Grok status=${pred.status}`); return null; }
    const out = Array.isArray(pred.output) ? pred.output[0] : pred.output;
    return typeof out === "string" ? out : (out?.url || null);
  } catch (e: any) {
    console.error(`[generate-video] Grok exceção: ${e?.message}`);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const svc = createClient(supabaseUrl, serviceKey);
    const token = Deno.env.get("REPLICATE_API_TOKEN");
    if (!token) return new Response(JSON.stringify({ error: "REPLICATE_API_TOKEN ausente" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json();
    const { userId, tema, prompt, imageUrl, duration = 10, aspectRatio = "9:16", brandId, platform = "instagram" } = body;
    if (!userId || (!tema && !prompt && !imageUrl)) {
      return new Response(JSON.stringify({ error: "userId + (tema | prompt | imageUrl) obrigatórios" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Contexto de marca (paleta) — segue a marca quando houver; senão fica livre.
    let brandBlock = "";
    if (brandId) {
      const { data: brand } = await svc.from("brands").select("name, palette, visual_tone").eq("id", brandId).maybeSingle();
      if (brand) {
        const pal = Array.isArray(brand.palette) ? brand.palette.map((c: any) => (typeof c === "string" ? c : c?.hex)).filter(Boolean).join(", ") : "";
        brandBlock = ` Paleta da marca${brand.name ? ` ${brand.name}` : ""}: ${pal || "cores da marca"}. Tom: ${brand.visual_tone || "profissional"}.`;
      }
    }

    // Prompt de vídeo: animação CINEMATOGRÁFICA 3D que EXPLICA o tema (não motion graphics flat —
    // o "flat" antigo matava o 3D que o Maikon quer: câmera mergulhando na anatomia, etc.).
    // SEM pessoa/rosto e SEM TEXTO baked (modelo de vídeo erra ortografia pt-BR, ex.: "safenão";
    // a explicação vai na legenda do post).
    const videoPrompt = (prompt as string) ||
      `Animação CINEMATOGRÁFICA e dinâmica em 3D que explica visualmente o tema: "${tema}". Câmera com movimento fluido que REVELA e explora o assunto (aproximação/dolly que mergulha no objeto do tema — ex.: a câmera entra no corpo e chega no órgão, ou percorre o processo). Mostre o ASSUNTO em si pela animação (anatomia, órgão, mecanismo, processo ou conceito do tema), com volume, profundidade, iluminação rica e materiais realistas — sensação premium, científica e educativa. Movimento suave e contínuo.
PROIBIDO: pessoas, avatares, rostos ou mãos realistas. PROIBIDO renderizar TEXTO, letras, números ou legendas DENTRO do vídeo (texto em vídeo sai com erro de ortografia — a explicação vai na legenda do post).${brandBlock}`;

    const dur = Math.min(Math.max(parseInt(String(duration)) || 5, 1), 15);
    const input: Record<string, unknown> = { prompt: videoPrompt, duration: dur, aspect_ratio: aspectRatio, resolution: "720p" };
    if (imageUrl) input.image = imageUrl; // image-to-video: anima uma imagem já gerada

    const t0 = Date.now();
    const videoUrl = await grokVideo(token, input);
    if (!videoUrl) {
      return new Response(JSON.stringify({ error: "Falha ao gerar o vídeo. Tente de novo." }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    console.log(`[generate-video] ok em ${Date.now() - t0}ms: ${videoUrl}`);

    // Salva como conteúdo (content_type=video; ActionCard detecta .mp4 e renderiza <video>).
    const { data: content, error: insErr } = await svc.from("generated_contents").insert({
      user_id: userId,
      content_type: "video",
      title: (tema || "Vídeo animado").toString().slice(0, 120),
      caption: "",
      image_urls: [videoUrl],
      brand_id: brandId || null,
      platform,
      status: "draft",
      generation_metadata: { model: GROK_SLUG, prompt: videoPrompt, duration: dur, aspect_ratio: aspectRatio, video_url: videoUrl },
    }).select("id").single();
    if (insErr) { console.error("[generate-video] insert error:", insErr.message); return new Response(JSON.stringify({ error: "Falha ao salvar o vídeo" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }

    // Débito por segundo (~$0.05/s × margem ≈ 7cr/s). Best-effort com log visível.
    const cost = dur * 7;
    const { error: spendErr } = await svc.rpc("spend_credits", { p_user: userId, p_amount: cost, p_generation_id: content.id, p_metadata: { action: "video_grok", duration: dur } });
    if (spendErr) console.error(`[generate-video] spend_credits FALHOU (vídeo entregue sem cobrança) user=${userId} content=${content.id}: ${spendErr.message}`);

    return new Response(JSON.stringify({ contentId: content.id, videoUrl, cost }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("[generate-video] erro:", e?.message);
    return new Response(JSON.stringify({ error: e?.message || "erro" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
