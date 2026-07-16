// generate-video — vídeo animado via Replicate.
// PRIMÁRIO: Kling v3 (cinematográfico 3D, ~115-130s — cabe na janela da Edge Function).
// Selecionáveis via `videoModel`: "kling" (default) | "seedance" (mais cinematográfico, ~180s,
// PODE estourar o limite) | "grok" (rápido ~30s, qualidade menor).
// Estilo: animação EXPLICATIVA 3D sobre um tema. NUNCA avatar/pessoa/rosto. SEM texto baked
// (modelo de vídeo erra ortografia pt-BR; a explicação vai na legenda). text-to-video (do tema)
// ou image-to-video (anima uma imagem). Chamada interna (service_role). verify_jwt=false.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth } from "../_shared/require-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Modelos de vídeo no Replicate. maxMs = teto de poll (sob o limite ~150s da Edge Function).
const VIDEO_MODELS: Record<string, { slug: string; maxMs: number }> = {
  kling: { slug: "kwaivgi/kling-v3-video", maxMs: 145000 },
  seedance: { slug: "bytedance/seedance-1.5-pro", maxMs: 145000 }, // ~180s: pode estourar; use com cautela
  grok: { slug: "xai/grok-imagine-video", maxMs: 140000 },
};

/** Schema de input difere por modelo (nomes de parâmetro distintos). */
function buildVideoInput(model: string, prompt: string, dur: number, aspectRatio: string, imageUrl?: string): Record<string, unknown> {
  if (model === "kling") {
    // Kling aceita só 5 ou 10s. mode "pro" = cinematográfico. start_image p/ image-to-video.
    const input: Record<string, unknown> = { prompt, aspect_ratio: aspectRatio, duration: dur <= 7 ? 5 : 10, mode: "pro" };
    if (imageUrl) input.start_image = imageUrl;
    return input;
  }
  if (model === "seedance") {
    // camera_fixed:false = câmera SE MOVE (o "mergulha no coração" que o Maikon quer).
    const input: Record<string, unknown> = { prompt, aspect_ratio: aspectRatio, duration: dur, camera_fixed: false };
    if (imageUrl) input.image = imageUrl;
    return input;
  }
  // grok
  const input: Record<string, unknown> = { prompt, duration: dur, aspect_ratio: aspectRatio, resolution: "720p" };
  if (imageUrl) input.image = imageUrl;
  return input;
}

/** Roda um modelo de vídeo no Replicate (Prefer:wait + poll). Retorna URL do .mp4 ou null. */
async function replicateVideo(token: string, slug: string, input: Record<string, unknown>, maxMs: number): Promise<string | null> {
  try {
    const res = await fetch(`https://api.replicate.com/v1/models/${slug}/predictions`, {
      method: "POST",
      headers: { Authorization: `Token ${token}`, "Content-Type": "application/json", Prefer: "wait" },
      body: JSON.stringify({ input }),
    });
    if (!res.ok) { console.error(`[generate-video] ${slug} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`); return null; }
    let pred = await res.json();
    const start = Date.now();
    while (pred.status && !["succeeded", "failed", "canceled"].includes(pred.status) && Date.now() - start < maxMs) {
      await new Promise((r) => setTimeout(r, 3000));
      const pr = await fetch(`https://api.replicate.com/v1/predictions/${pred.id}`, { headers: { Authorization: `Token ${token}` } });
      if (!pr.ok) break;
      pred = await pr.json();
    }
    if (pred.status !== "succeeded") { console.warn(`[generate-video] ${slug} status=${pred.status}`); return null; }
    const out = Array.isArray(pred.output) ? pred.output[0] : pred.output;
    return typeof out === "string" ? out : (out?.url || null);
  } catch (e: any) {
    console.error(`[generate-video] ${slug} exceção: ${e?.message}`);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    // Auth: antes só checava o prefixo "Bearer" e confiava no body.userId → qualquer um debitava
    // crédito de outro usuário. Agora exige service key (interno) OU JWT válido, e usa o user.id
    // autenticado (ignora body.userId quando não é chamada interna).
    const auth = await requireAuth(req);
    if (!auth) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const svc = createClient(supabaseUrl, serviceKey);
    const token = Deno.env.get("REPLICATE_API_TOKEN");
    if (!token) return new Response(JSON.stringify({ error: "REPLICATE_API_TOKEN ausente" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json();
    const { tema, prompt, imageUrl, duration = 5, aspectRatio = "9:16", brandId, platform = "instagram", videoModel } = body;
    // userId: usa o autenticado (não interno). Interno (service key) confia no body.userId.
    const userId = auth.internal ? body.userId : auth.userId;
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

    // Prompt de vídeo: animação CINEMATOGRÁFICA 3D que EXPLICA o tema (sem "flat", sem texto baked).
    const videoPrompt = (prompt as string) ||
      `Animação CINEMATOGRÁFICA e dinâmica em 3D que explica visualmente o tema: "${tema}". Câmera com movimento fluido que REVELA e explora o assunto (aproximação/dolly que mergulha no objeto do tema — ex.: a câmera entra no corpo e chega no órgão, ou percorre o processo). Mostre o ASSUNTO em si pela animação (anatomia, órgão, mecanismo, processo ou conceito do tema), com volume, profundidade, iluminação rica e materiais realistas — sensação premium, científica e educativa. Movimento suave e contínuo.
PROIBIDO: pessoas, avatares, rostos ou mãos realistas. PROIBIDO renderizar TEXTO, letras, números ou legendas DENTRO do vídeo (texto em vídeo sai com erro de ortografia — a explicação vai na legenda do post).${brandBlock}`;

    const dur = Math.min(Math.max(parseInt(String(duration)) || 5, 1), 15);
    const model = (typeof videoModel === "string" && VIDEO_MODELS[videoModel]) ? videoModel : "kling";
    const cfg = VIDEO_MODELS[model];

    const t0 = Date.now();
    const input = buildVideoInput(model, videoPrompt, dur, aspectRatio, imageUrl);
    console.log(`[generate-video] model=${model} slug=${cfg.slug} dur=${dur} ar=${aspectRatio}`);
    const videoUrl = await replicateVideo(token, cfg.slug, input, cfg.maxMs);
    if (!videoUrl) {
      return new Response(JSON.stringify({ error: "Falha ao gerar o vídeo. Tente de novo." }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    console.log(`[generate-video] ok (${model}) em ${Date.now() - t0}ms: ${videoUrl}`);

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
      generation_metadata: { model: cfg.slug, prompt: videoPrompt, duration: dur, aspect_ratio: aspectRatio, video_url: videoUrl },
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
