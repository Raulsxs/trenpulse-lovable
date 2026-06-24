// diag-claude — diagnóstico temporário do hang do motor de texto Claude.
// Testa fetch cru vs SDK Anthropic lado a lado (ambos com timeout duro), e devolve o
// resultado no corpo (sem custo de imagem, sem precisar de usuário). verify_jwt=false.
// REMOVER após diagnosticar.
import Anthropic from "npm:@anthropic-ai/sdk";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (o: unknown) => new Response(JSON.stringify(o, null, 2), { headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const key = Deno.env.get("ANTHROPIC_API_KEY");
  const out: Record<string, unknown> = { hasKey: !!key, keyPrefix: key ? key.slice(0, 12) : null };
  if (!key) return json(out);

  const MODEL = "claude-haiku-4-5";
  const msg = [{ role: "user", content: "Responda apenas: OK" }];

  // Teste A — fetch cru (o que está no fetchClaude hoje), com AbortController 20s.
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    const t0 = Date.now();
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctrl.signal,
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 50, messages: msg }),
    });
    clearTimeout(t);
    out.rawFetch = { ms: Date.now() - t0, status: res.status, body: (await res.text()).slice(0, 400) };
  } catch (e: any) {
    out.rawFetch = { error: `${e?.name}: ${e?.message}` };
  }

  // Teste B — SDK Anthropic (o que o orquestrador /agent usa), timeout 20s.
  try {
    const t0 = Date.now();
    const client = new Anthropic({ apiKey: key, timeout: 20000, maxRetries: 0 });
    const m: any = await client.messages.create({ model: MODEL, max_tokens: 50, messages: msg as any });
    out.sdk = { ms: Date.now() - t0, text: (m.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("") };
  } catch (e: any) {
    out.sdk = { error: `${e?.name}: ${e?.message}`, status: e?.status };
  }

  // Teste C — gerar a ESTRUTURA do carrossel em JSON (exatamente o passo que falha pro Maikon).
  try {
    const t0 = Date.now();
    const client = new Anthropic({ apiKey: key, timeout: 30000, maxRetries: 1 });
    const m: any = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      temperature: 0.5,
      messages: [{ role: "user", content: `Crie um carrossel de 5 slides educativos sobre "recuperação cardíaca e fibrilação atrial". Responda APENAS com JSON: {"title":"...","slides":[{"role":"cover","headline":"...","body":"","bullets":[]},{"role":"content","headline":"...","body":"...","bullets":["..."]}]}` }],
    });
    const raw = (m.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
    let parsed = null, slides = -1;
    try { const jm = raw.match(/\{[\s\S]*\}/); if (jm) { parsed = JSON.parse(jm[0]); slides = parsed?.slides?.length ?? -1; } } catch { /* */ }
    out.structure = { ms: Date.now() - t0, chars: raw.length, slidesParsed: slides, title: parsed?.title ?? null };
  } catch (e: any) {
    out.structure = { error: `${e?.name}: ${e?.message}`, status: e?.status };
  }

  return json(out);
});
