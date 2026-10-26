/**
 * Vídeo pronto (MP4) → calendário → Reel.
 *
 * Caso que motiva (2026-10-26): a Pulse produz vídeos de produto prontos (MP4 1080x1920, H.264/AAC, 6 a
 * 46 s, até ~20 MB) e quer agendá-los no Instagram pelo MCP. Antes disto:
 *  - preparar_envio_imagem recusava .mp4;
 *  - agendar_arte recusava tudo que não fosse image/* ("Isso nao e uma imagem");
 *  - o publish-postforme mandava content_type "reels" como STORY (placement "stories"): o Reel sumia
 *    em 24 h.
 *
 * Run: npm test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { dispatchTool, mimeDoArquivo, urlDoNossoEnvio, type ToolCtx } from "../../supabase/functions/_shared/agent-tools";
import { extensaoImagem, mimeDaExtensao, caminhoEnvio, ehExtensaoVideo, TOOL_PREPARAR_ENVIO } from "../../supabase/functions/_shared/mcp-core";
import { montarPostBody, configuracaoDaPlataforma } from "../../supabase/functions/_shared/publicacao";

const SUPA = "https://qdmhqxpazffmaxleyzxs.supabase.co";
const USER = "1294d060-6783-4f7a-9df4-3c5f567eded4";
const AGORA = "2026-10-26T15:00:00Z";
const QUANDO = "2026-10-28T09:00:00-03:00";
const INSTA = { platform: "instagram", pfm_account_id: "spc_insta", account_name: "pulse.id", expires_at: null, renovavel: false };
const NOSSO_MP4 = `${SUPA}/storage/v1/object/public/content-images/mcp/${USER}/envio-1792000000000-abc123.mp4`;

describe("preparar_envio_imagem — aceita vídeo MP4", () => {
  it(".mp4 é aceito, com mime video/mp4 para o Content-Type do PUT", () => {
    expect(extensaoImagem("reel-produto.mp4")).toBe("mp4");
    expect(extensaoImagem("REEL.MP4")).toBe("mp4");
    expect(mimeDaExtensao("mp4")).toBe("video/mp4");
    expect(ehExtensaoVideo("mp4")).toBe(true);
    expect(ehExtensaoVideo("png")).toBe(false);
  });

  it("outros vídeos continuam recusados: só MP4 sai sem conversão", () => {
    expect(extensaoImagem("clip.mov")).toBeNull();
    expect(extensaoImagem("clip.webm")).toBeNull();
    expect(extensaoImagem("clip.mp4.exe")).toBeNull();
  });

  it("o caminho do vídeo fica na pasta do usuário, como o da imagem", () => {
    expect(caminhoEnvio(USER, "mp4", 1792000000000, "abc123")).toBe(`mcp/${USER}/envio-1792000000000-abc123.mp4`);
  });

  it("a descrição diz que aceita vídeo MP4 e mantém o nome antigo", () => {
    expect(TOOL_PREPARAR_ENVIO.name).toBe("preparar_envio_imagem");
    expect(TOOL_PREPARAR_ENVIO.description).toMatch(/vídeo MP4/);
    expect(TOOL_PREPARAR_ENVIO.inputSchema.properties.nome_arquivo.description).toMatch(/mp4/);
  });
});

describe("mimeDoArquivo / urlDoNossoEnvio", () => {
  it("MP4 servido como octet-stream conta como vídeo; imagem segue o cabeçalho", () => {
    expect(mimeDoArquivo("video/mp4", "https://cdn.x/a")).toBe("video/mp4");
    expect(mimeDoArquivo("application/octet-stream", "https://cdn.x/a.mp4?v=1")).toBe("video/mp4");
    expect(mimeDoArquivo(null, "https://cdn.x/a.mp4")).toBe("video/mp4");
    expect(mimeDoArquivo("image/png; charset=binary", "https://cdn.x/a.png")).toBe("image/png");
    expect(mimeDoArquivo("application/octet-stream", "https://cdn.x/a.png")).toBe("application/octet-stream");
    expect(mimeDoArquivo("video/quicktime", "https://cdn.x/a.mov")).toBe("video/quicktime");
  });

  it("só reaproveita sem cópia o que está na pasta do próprio usuário no nosso bucket", () => {
    expect(urlDoNossoEnvio(NOSSO_MP4, SUPA, USER)).toBe(true);
    expect(urlDoNossoEnvio(NOSSO_MP4.replace(USER, "outro-usuario"), SUPA, USER)).toBe(false);
    expect(urlDoNossoEnvio(`https://evil.example/storage/v1/object/public/content-images/mcp/${USER}/a.mp4`, SUPA, USER)).toBe(false);
    expect(urlDoNossoEnvio(`${SUPA}/storage/v1/object/public/content-images/mcp/${USER}/../outro/a.mp4`, SUPA, USER)).toBe(false);
    expect(urlDoNossoEnvio(`${SUPA}/storage/v1/object/public/content-images/mcp/${USER}/`, SUPA, USER)).toBe(false);
  });
});

/** Cliente falso com o mínimo que o agendar_arte usa: colisão de horário, insert, storage e rpc. */
function clienteFalso() {
  const inseridos: any[] = [];
  const uploads: Array<{ caminho: string; contentType: string; tamanho: number }> = [];
  const removidos: string[] = [];
  const rpc = vi.fn(async () => ({ data: null, error: null }));
  const from = (_tabela: string) => {
    const q: any = {
      select: () => q, eq: () => q, limit: () => q,
      insert: (linha: any) => { inseridos.push(linha); return q; },
      single: async () => ({ data: { id: "c0ffee00-0000-4000-8000-000000000001" }, error: null }),
      then: (ok: any, ko: any) => Promise.resolve({ data: [], error: null }).then(ok, ko),
    };
    return q;
  };
  const storage = {
    from: (_b: string) => ({
      upload: async (caminho: string, bytes: Uint8Array, op: any) => { uploads.push({ caminho, contentType: op.contentType, tamanho: bytes.length }); return { error: null }; },
      getPublicUrl: (caminho: string) => ({ data: { publicUrl: `${SUPA}/storage/v1/object/public/content-images/${caminho}` } }),
      remove: async (c: string[]) => { removidos.push(...c); return { error: null }; },
    }),
  };
  return { from, storage, rpc, inseridos, uploads, removidos };
}

/** fetch falso: connect-social devolve as contas; qualquer outra URL devolve o "arquivo". */
function contexto(arquivo: { contentType: string | null; tamanho: number; contentLength?: number }) {
  const userClient = clienteFalso();
  const baixou = { corpo: false };
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (String(url).includes("/functions/v1/connect-social")) {
      return new Response(JSON.stringify({ connections: [INSTA] }), { status: 200 });
    }
    const headers: Record<string, string> = {};
    if (arquivo.contentType) headers["content-type"] = arquivo.contentType;
    if (arquivo.contentLength !== undefined) headers["content-length"] = String(arquivo.contentLength);
    const r = new Response(new Uint8Array(arquivo.tamanho), { status: 200, headers });
    const original = r.arrayBuffer.bind(r);
    (r as any).arrayBuffer = async () => { baixou.corpo = true; return original(); };
    return r;
  }));
  const ctx: ToolCtx = { supabaseUrl: SUPA, anonKey: "anon", userAuthHeader: "Bearer jwt", userClient, anthropicKey: "", userId: USER, defaultBrandId: "marca-1" };
  return { ctx, userClient, baixou };
}

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(AGORA)); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("agendar_arte — vídeo MP4 pronto", () => {
  it("vídeo subido pelo preparar_envio_imagem: grava content_type video, sem baixar, sem copiar e sem cobrar", async () => {
    const { ctx, userClient, baixou } = contexto({ contentType: "video/mp4", tamanho: 16, contentLength: 20 * 1048576 });
    const r = await dispatchTool(ctx, "agendar_arte", { imagem: NOSSO_MP4, legenda: "Reel do produto", data_hora_iso: QUANDO, plataformas: ["instagram"] });
    expect(r.ok).toBe(true);
    expect(r.content).toMatch(/^Agendado para .* content_id=c0ffee00-0000-4000-8000-000000000001$/);
    expect(baixou.corpo).toBe(false);
    expect(userClient.uploads).toEqual([]);
    expect(userClient.rpc).not.toHaveBeenCalled();
    expect(userClient.inseridos).toHaveLength(1);
    expect(userClient.inseridos[0]).toMatchObject({
      content_type: "video",
      image_urls: [NOSSO_MP4],
      status: "scheduled",
      scheduled_at: "2026-10-28T12:00:00.000Z",
      brand_id: "marca-1",
      platform: "instagram",
      scheduled_accounts: { platforms: ["instagram"], accountIds: ["spc_insta"] },
      generation_metadata: { video_url: NOSSO_MP4, origem: "agendar_arte" },
    });
    expect(r.action_result).toMatchObject({ contentId: "c0ffee00-0000-4000-8000-000000000001", contentType: "video", imageUrl: NOSSO_MP4 });
  });

  it("vídeo por URL externa (servido como octet-stream) é copiado para o bucket como video/mp4", async () => {
    const { ctx, userClient } = contexto({ contentType: "application/octet-stream", tamanho: 2048 });
    const r = await dispatchTool(ctx, "agendar_arte", { imagem: "https://cdn.exemplo.com/reels/produto.mp4", legenda: "Reel" });
    expect(r.ok).toBe(true);
    expect(r.content).toMatch(/^Salvo como rascunho/);
    expect(userClient.uploads).toHaveLength(1);
    expect(userClient.uploads[0].contentType).toBe("video/mp4");
    expect(userClient.uploads[0].caminho).toMatch(new RegExp(`^mcp/${USER}/\\d+-[a-z0-9]+\\.mp4$`));
    expect(userClient.inseridos[0].content_type).toBe("video");
    expect(userClient.inseridos[0].image_urls[0]).toMatch(/\.mp4$/);
  });

  it("vídeo externo acima de 50 MB é recusado antes de baixar", async () => {
    const { ctx, userClient, baixou } = contexto({ contentType: "video/mp4", tamanho: 16, contentLength: 60 * 1048576 });
    const r = await dispatchTool(ctx, "agendar_arte", { imagem: "https://cdn.exemplo.com/grande.mp4", legenda: "x" });
    expect(r.ok).toBe(false);
    expect(r.content).toMatch(/Video grande demais \(60\.0 MB\)/);
    expect(baixou.corpo).toBe(false);
    expect(userClient.inseridos).toEqual([]);
  });

  it("vídeo que não é MP4 é recusado dizendo o formato certo", async () => {
    const { ctx, userClient } = contexto({ contentType: "video/quicktime", tamanho: 64 });
    const r = await dispatchTool(ctx, "agendar_arte", { imagem: "https://cdn.exemplo.com/clip.mov", legenda: "x" });
    expect(r.ok).toBe(false);
    expect(r.content).toBe("Formato de video nao aceito (video/quicktime). Mande MP4 (H.264/AAC).");
    expect(userClient.inseridos).toEqual([]);
  });

  it("o que não é imagem nem vídeo continua recusado", async () => {
    const { ctx } = contexto({ contentType: "application/pdf", tamanho: 64 });
    const r = await dispatchTool(ctx, "agendar_arte", { imagem: "https://cdn.exemplo.com/a.pdf", legenda: "x" });
    expect(r.ok).toBe(false);
    expect(r.content).toBe("Isso nao e uma imagem nem um video MP4 (application/pdf).");
  });

  it("imagem segue como antes: copiada, content_type post, sem generation_metadata", async () => {
    const { ctx, userClient } = contexto({ contentType: "image/png", tamanho: 1024 });
    const r = await dispatchTool(ctx, "agendar_arte", { imagem: "https://cdn.exemplo.com/arte.png", legenda: "Arte", data_hora_iso: QUANDO });
    expect(r.ok).toBe(true);
    expect(userClient.uploads).toHaveLength(1);
    expect(userClient.uploads[0]).toMatchObject({ contentType: "image/png", tamanho: 1024 });
    expect(userClient.uploads[0].caminho).toMatch(/\.png$/);
    expect(userClient.inseridos[0].content_type).toBe("post");
    expect(userClient.inseridos[0]).not.toHaveProperty("generation_metadata");
    expect(r.action_result).toMatchObject({ contentType: "post" });
  });
});

describe("publish-postforme — corpo do post no Post for Me", () => {
  const base = { pfmAccountId: "spc_insta", caption: "Legenda", mediaUrls: [NOSSO_MP4] };

  it("vídeo no Instagram sai como Reel", () => {
    expect(montarPostBody({ ...base, platform: "instagram", contentType: "video" })).toEqual({
      caption: "Legenda",
      social_accounts: ["spc_insta"],
      media: [{ url: NOSSO_MP4 }],
      platform_configurations: { instagram: { placement: "reels" } },
    });
  });

  it("content_type 'reels' (legado) também é Reel — não cai mais em story", () => {
    expect(configuracaoDaPlataforma("instagram", "reels")).toEqual({ instagram: { placement: "reels" } });
  });

  it("story continua story", () => {
    expect(montarPostBody({ ...base, platform: "instagram", contentType: "story" }).platform_configurations)
      .toEqual({ instagram: { placement: "stories" } });
    // carrossel de stories força story mesmo com outro content_type
    expect(montarPostBody({ ...base, platform: "instagram", contentType: "carousel", forceStory: true }).platform_configurations)
      .toEqual({ instagram: { placement: "stories" } });
  });

  it("vídeo no LinkedIn vai como vídeo nativo, sem configuração", () => {
    expect(montarPostBody({ ...base, pfmAccountId: "spc_li", platform: "linkedin", contentType: "video" })).not.toHaveProperty("platform_configurations");
  });

  it("post de imagem não ganha configuração e o agendamento é repassado", () => {
    const corpo = montarPostBody({ ...base, platform: "instagram", contentType: "post", mediaUrls: ["https://x/a.png"], scheduledAt: "2026-10-28T12:00:00.000Z" });
    expect(corpo).not.toHaveProperty("platform_configurations");
    expect(corpo.scheduled_at).toBe("2026-10-28T12:00:00.000Z");
  });
});
