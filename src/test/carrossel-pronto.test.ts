/**
 * Carrossel pronto (várias imagens) → calendário → carrossel no Instagram.
 *
 * Caso que motiva (2026-10-26): a Pulse gera os slides do carrossel dela pela assinatura do ChatGPT
 * (fora do TrendPulse, sem crédito) e quer agendar como UM carrossel. Antes disto o agendar_arte
 * aceitava uma imagem só: cada slide virava um post separado, ou o carrossel tinha de sair pelo
 * gerar_carrossel, que cobra crédito por slide.
 *
 * Run: npm test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { dispatchTool, slidesDoCarrosselPronto, CARROSSEL_MAX, type ToolCtx } from "../../supabase/functions/_shared/agent-tools";
import { montarPostBody } from "../../supabase/functions/_shared/publicacao";

const SUPA = "https://qdmhqxpazffmaxleyzxs.supabase.co";
const USER = "1294d060-6783-4f7a-9df4-3c5f567eded4";
const AGORA = "2026-10-26T15:00:00Z";
const QUANDO = "2026-10-28T09:00:00-03:00";
const INSTA = { platform: "instagram", pfm_account_id: "spc_insta", account_name: "pulse.id", expires_at: null, renovavel: false };
const CONTENT_ID = "c0ffee00-0000-4000-8000-000000000002";
// os slides que o kernel da Pulse sobe pelo preparar_envio_imagem: ficam na pasta do usuário
const nosso = (n: number) => `${SUPA}/storage/v1/object/public/content-images/mcp/${USER}/envio-17920000000${n}0-ab${n}cd.png`;
const NOSSOS = [1, 2, 3, 4, 5].map(nosso);

/** Cliente falso com o mínimo que o agendar_arte usa: colisão de horário, insert, storage e rpc. */
function clienteFalso({ falhaInsert = false } = {}) {
  const inseridos: any[] = [];
  const uploads: Array<{ caminho: string; contentType: string; tamanho: number }> = [];
  const removidos: string[] = [];
  const rpc = vi.fn(async () => ({ data: null, error: null }));
  const from = (_tabela: string) => {
    const q: any = {
      select: () => q, eq: () => q, limit: () => q,
      insert: (linha: any) => { inseridos.push(linha); return q; },
      single: async () => (falhaInsert ? { data: null, error: { message: "violou algo" } } : { data: { id: CONTENT_ID }, error: null }),
      then: (ok: any, ko: any) => Promise.resolve({ data: [], error: null }).then(ok, ko),
    };
    return q;
  };
  let seq = 0;
  const storage = {
    from: (_b: string) => ({
      upload: async (caminho: string, bytes: Uint8Array, op: any) => { uploads.push({ caminho, contentType: op.contentType, tamanho: bytes.length }); return { error: null }; },
      // o caminho real tem Date.now() + sufixo aleatório; o número de ordem deixa o teste ver a ordem
      getPublicUrl: (caminho: string) => ({ data: { publicUrl: `${SUPA}/storage/v1/object/public/content-images/${caminho}#${++seq}` } }),
      remove: async (c: string[]) => { removidos.push(...c); return { error: null }; },
    }),
  };
  return { from, storage, rpc, inseridos, uploads, removidos };
}

/**
 * fetch falso: connect-social devolve as contas; as outras URLs devolvem um "arquivo" com o tipo do mapa
 * (padrão image/png). `baixados` anota de quais URLs o corpo foi lido (arrayBuffer).
 */
function contexto(tipos: Record<string, string> = {}, opcoes: { falhaInsert?: boolean } = {}) {
  const userClient = clienteFalso(opcoes);
  const baixados: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (String(url).includes("/functions/v1/connect-social")) {
      return new Response(JSON.stringify({ connections: [INSTA] }), { status: 200 });
    }
    const r = new Response(new Uint8Array(512), { status: 200, headers: { "content-type": tipos[url] || "image/png", "content-length": "512" } });
    const original = r.arrayBuffer.bind(r);
    (r as any).arrayBuffer = async () => { baixados.push(url); return original(); };
    return r;
  }));
  const ctx: ToolCtx = { supabaseUrl: SUPA, anonKey: "anon", userAuthHeader: "Bearer jwt", userClient, anthropicKey: "", userId: USER, defaultBrandId: "marca-1" };
  return { ctx, userClient, baixados };
}

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(AGORA)); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("agendar_arte — carrossel pronto (imagens)", () => {
  it("5 imagens da pasta do usuário: um carrossel, na ordem, sem baixar, sem copiar e sem cobrar", async () => {
    const { ctx, userClient, baixados } = contexto();
    const r = await dispatchTool(ctx, "agendar_arte", {
      imagens: NOSSOS, legenda: "Cinco números do seu caixa", data_hora_iso: QUANDO,
      plataformas: ["instagram"], contas: ["spc_insta"], titulo: "Caixa em 5 números",
    });
    expect(r.ok).toBe(true);
    expect(r.content).toMatch(/^Agendado para .* Carrossel de 5 imagens, nesta ordem\. .* content_id=c0ffee00-0000-4000-8000-000000000002$/);
    expect(baixados).toEqual([]);
    expect(userClient.uploads).toEqual([]);
    expect(userClient.rpc).not.toHaveBeenCalled();
    expect(userClient.inseridos).toHaveLength(1);
    const linha = userClient.inseridos[0];
    expect(linha).toMatchObject({
      content_type: "carousel",
      image_urls: NOSSOS,
      slide_count: 5,
      status: "scheduled",
      scheduled_at: "2026-10-28T12:00:00.000Z",
      brand_id: "marca-1",
      platform: "instagram",
      title: "Caixa em 5 números",
      caption: "Cinco números do seu caixa",
      scheduled_accounts: { platforms: ["instagram"], accountIds: ["spc_insta"] },
      generation_metadata: { origem: "agendar_arte" },
    });
    // slides[] no formato do gerar_carrossel, na mesma ordem de image_urls
    expect(linha.slides.map((s: any) => s.image_url)).toEqual(NOSSOS);
    expect(linha.slides[0]).toEqual({ headline: "", body: "", bullets: [], image_url: NOSSOS[0], background_image_url: NOSSOS[0], render_mode: "ai_full_design" });
    expect(r.action_result).toMatchObject({ contentId: CONTENT_ID, contentType: "carousel", imageUrl: NOSSOS[0], imageUrls: NOSSOS });
  });

  it("imagem externa é copiada para o bucket; a da pasta do usuário não; a ordem se mantém", async () => {
    const externa = "https://cdn.exemplo.com/slide-2.jpg";
    const { ctx, userClient, baixados } = contexto({ [externa]: "image/jpeg" });
    const r = await dispatchTool(ctx, "agendar_arte", { imagens: [NOSSOS[0], externa, NOSSOS[2]], legenda: "x" });
    expect(r.ok).toBe(true);
    expect(r.content).toMatch(/^Salvo como rascunho, sem data\. Carrossel de 3 imagens/);
    expect(baixados).toEqual([externa]);
    expect(userClient.uploads).toHaveLength(1);
    expect(userClient.uploads[0]).toMatchObject({ contentType: "image/jpeg", tamanho: 512 });
    expect(userClient.uploads[0].caminho).toMatch(new RegExp(`^mcp/${USER}/\\d+-[a-z0-9]+\\.jpg$`));
    const urls = userClient.inseridos[0].image_urls;
    expect(urls[0]).toBe(NOSSOS[0]);
    expect(urls[1]).toMatch(new RegExp(`content-images/mcp/${USER}/\\d+-[a-z0-9]+\\.jpg#1$`));
    expect(urls[2]).toBe(NOSSOS[2]);
  });

  it("de outra pasta do bucket conta como externa: é copiada (o post não depende do arquivo de outro usuário)", async () => {
    const deOutro = NOSSOS[1].replace(USER, "outro-usuario");
    const { ctx, userClient, baixados } = contexto();
    const r = await dispatchTool(ctx, "agendar_arte", { imagens: [NOSSOS[0], deOutro], legenda: "x" });
    expect(r.ok).toBe(true);
    expect(baixados).toEqual([deOutro]);
    expect(userClient.uploads).toHaveLength(1);
  });

  it("menos de 2, mais de 10, ou imagem e imagens juntas: recusa antes de qualquer arquivo", async () => {
    const { ctx, userClient, baixados } = contexto();
    const um = await dispatchTool(ctx, "agendar_arte", { imagens: [NOSSOS[0]], legenda: "x" });
    expect(um.ok).toBe(false);
    expect(um.content).toMatch(/2 a 10 imagens \(veio 1\)\. Para uma imagem so, use `imagem`/);
    const onze = await dispatchTool(ctx, "agendar_arte", { imagens: Array.from({ length: CARROSSEL_MAX + 1 }, (_, i) => nosso(i)), legenda: "x" });
    expect(onze.ok).toBe(false);
    expect(onze.content).toMatch(/no maximo 10 imagens \(veio 11\)/);
    const os2 = await dispatchTool(ctx, "agendar_arte", { imagem: NOSSOS[0], imagens: NOSSOS, legenda: "x" });
    expect(os2.ok).toBe(false);
    expect(os2.content).toMatch(/OU `imagens`/);
    expect(baixados).toEqual([]);
    expect(userClient.inseridos).toEqual([]);
  });

  it("vídeo no meio do carrossel é recusado dizendo qual item, e a cópia já feita sai do bucket", async () => {
    const externa = "https://cdn.exemplo.com/capa.png";
    const video = "https://cdn.exemplo.com/clip.mp4";
    const { ctx, userClient } = contexto({ [externa]: "image/png", [video]: "video/mp4" });
    const r = await dispatchTool(ctx, "agendar_arte", { imagens: [externa, video, NOSSOS[2]], legenda: "x" });
    expect(r.ok).toBe(false);
    expect(r.content).toBe("Imagem 2 de 3: Carrossel aceita so imagens (veio video/mp4). Video vai sozinho, em imagem.");
    expect(userClient.inseridos).toEqual([]);
    expect(userClient.removidos).toEqual([userClient.uploads[0].caminho]);
  });

  it("falha ao criar o conteúdo apaga só as cópias desta chamada, nunca o arquivo do usuário", async () => {
    const externa = "https://cdn.exemplo.com/slide.png";
    const { ctx, userClient } = contexto({}, { falhaInsert: true });
    const r = await dispatchTool(ctx, "agendar_arte", { imagens: [NOSSOS[0], externa], legenda: "x" });
    expect(r.ok).toBe(false);
    expect(r.content).toMatch(/Falha ao criar o conteudo/);
    expect(userClient.removidos).toHaveLength(1);
    expect(userClient.removidos[0]).toMatch(new RegExp(`^mcp/${USER}/\\d+-[a-z0-9]+\\.png$`));
  });

  it("imagem única da pasta do usuário também não é mais copiada (o arte_produzir da Pulse sobe por lá)", async () => {
    const { ctx, userClient, baixados } = contexto();
    const r = await dispatchTool(ctx, "agendar_arte", { imagem: NOSSOS[0], legenda: "Arte", data_hora_iso: QUANDO });
    expect(r.ok).toBe(true);
    expect(baixados).toEqual([]);
    expect(userClient.uploads).toEqual([]);
    expect(userClient.inseridos[0]).toMatchObject({ content_type: "post", image_urls: [NOSSOS[0]] });
    expect(userClient.inseridos[0]).not.toHaveProperty("slides");
  });
});

describe("publish-postforme — carrossel no Post for Me", () => {
  it("vai como um post com as imagens em ordem como itens de mídia, sem placement (carrossel do feed)", () => {
    const corpo = montarPostBody({
      platform: "instagram", pfmAccountId: "spc_insta", caption: "Legenda", mediaUrls: NOSSOS,
      contentType: "carousel", scheduledAt: "2026-10-28T12:00:00.000Z",
    });
    expect(corpo).toEqual({
      caption: "Legenda",
      social_accounts: ["spc_insta"],
      media: NOSSOS.map((url) => ({ url })),
      scheduled_at: "2026-10-28T12:00:00.000Z",
    });
  });

  it("slidesDoCarrosselPronto guarda a ordem que o publicador usa", () => {
    expect(slidesDoCarrosselPronto(["a", "b"]).map((s) => s.image_url)).toEqual(["a", "b"]);
  });
});
