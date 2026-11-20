/**
 * Arquivo da conversa do ChatGPT no agendar_arte (2026-11-20).
 *
 * O Maikon usa o agente do ChatGPT. O vídeo pronto estava na conversa e o agente disse que não tinha como
 * mandar: o agendar_arte pedia URL pública e o ChatGPT não tem terminal com internet para o upload. O
 * ChatGPT só entrega arquivo da conversa a campos declarados em `_meta["openai/fileParams"]`.
 *
 * Run: npm test
 */
import { describe, it, expect } from "vitest";
import {
  ARQUIVO_OPENAI, comArquivoDaConversa, mimeDoArquivoOpenAI, normalizarArquivosDaConversa, toolsVisiveis, CATALOGO_MCP,
} from "../../supabase/functions/_shared/mcp-core";
import { AGENT_TOOLS, mimePelosBytes } from "../../supabase/functions/_shared/agent-tools";

const arq = (o: Record<string, string> = {}) => ({ download_url: "https://files.oaiusercontent.com/abc?sig=1", file_id: "file_1", ...o });

describe("agendar_arte no tools/list do MCP", () => {
  const tools = toolsVisiveis(AGENT_TOOLS as any, CATALOGO_MCP, ["read", "schedule"]);
  const agendar = tools.find((t) => t.name === "agendar_arte")! as any;

  it("declara arquivo e arquivos em openai/fileParams", () => {
    expect(agendar._meta).toEqual({ "openai/fileParams": ["arquivo", "arquivos"] });
  });

  it("schema do arquivo no formato que o ChatGPT exige", () => {
    const s = agendar.inputSchema;
    expect(s.properties.arquivo).toMatchObject({ $ref: "#/$defs/OpenAIFile" });
    expect(s.properties.arquivos.items).toEqual({ $ref: "#/$defs/OpenAIFile" });
    expect(s.$defs.OpenAIFile).toEqual(ARQUIVO_OPENAI);
    expect(Object.keys(ARQUIVO_OPENAI.properties).sort()).toEqual(["download_url", "file_id", "file_name", "mime_type"]);
    expect([...ARQUIVO_OPENAI.required]).toEqual(["download_url", "file_id"]);
  });

  it("mantém imagem/imagens e o que já existia", () => {
    expect(agendar.inputSchema.properties.imagem).toBeDefined();
    expect(agendar.inputSchema.properties.imagens).toBeDefined();
    expect(agendar.inputSchema.required).toEqual(["legenda"]);
    expect(agendar.description).toContain("NO CHATGPT");
  });

  it("outras ferramentas não ganham _meta", () => {
    expect(tools.filter((t: any) => t._meta).map((t) => t.name)).toEqual(["agendar_arte"]);
    expect(comArquivoDaConversa({ name: "listar_agenda", inputSchema: {} })).not.toHaveProperty("_meta");
  });
});

describe("normalizarArquivosDaConversa", () => {
  it("vídeo da conversa vira imagem = download_url com a dica de tipo", () => {
    const r = normalizarArquivosDaConversa("agendar_arte", { legenda: "x", arquivo: arq({ mime_type: "video/mp4", file_name: "reel.mp4" }) });
    expect(r).toEqual({ legenda: "x", imagem: "https://files.oaiusercontent.com/abc?sig=1", _mime_imagem: "video/mp4" });
  });

  it("sem mime_type, o tipo sai do nome do arquivo", () => {
    const r = normalizarArquivosDaConversa("agendar_arte", { legenda: "x", arquivo: arq({ file_name: "Reel Final.MP4" }) });
    expect(r._mime_imagem).toBe("video/mp4");
  });

  it("sem mime nem nome: só a URL (o servidor reconhece pelos bytes)", () => {
    const r = normalizarArquivosDaConversa("agendar_arte", { legenda: "x", arquivo: arq() });
    expect(r.imagem).toBe("https://files.oaiusercontent.com/abc?sig=1");
    expect(r).not.toHaveProperty("_mime_imagem");
  });

  it("carrossel: arquivos viram imagens na mesma ordem", () => {
    const r = normalizarArquivosDaConversa("agendar_arte", {
      legenda: "x",
      arquivos: [arq({ download_url: "https://a/1", mime_type: "image/png" }), arq({ download_url: "https://a/2", file_name: "b.jpg" })],
    });
    expect(r.imagens).toEqual(["https://a/1", "https://a/2"]);
    expect(r._mimes_imagens).toEqual(["image/png", "image/jpeg"]);
    expect(r).not.toHaveProperty("arquivos");
  });

  it("imagem passada pelo agente ganha do arquivo", () => {
    const r = normalizarArquivosDaConversa("agendar_arte", { legenda: "x", imagem: "https://minha/url.mp4", arquivo: arq() });
    expect(r.imagem).toBe("https://minha/url.mp4");
    expect(r).not.toHaveProperty("arquivo");
  });

  it("outra ferramenta passa intacta", () => {
    const a = { contentId: "1", arquivo: arq() };
    expect(normalizarArquivosDaConversa("agendar_conteudo", a)).toBe(a);
  });

  it("arquivo sem download_url http(s) é ignorado", () => {
    const r = normalizarArquivosDaConversa("agendar_arte", { legenda: "x", arquivo: { file_id: "f", download_url: "file:///etc/x" } });
    expect(r).toEqual({ legenda: "x" });
  });
});

describe("mimeDoArquivoOpenAI", () => {
  it("octet-stream não conta; cai para a extensão", () => {
    expect(mimeDoArquivoOpenAI({ mime_type: "application/octet-stream", file_name: "x.webp" })).toBe("image/webp");
    expect(mimeDoArquivoOpenAI({})).toBeNull();
  });
});

describe("mimePelosBytes", () => {
  const b = (...xs: number[]) => new Uint8Array([...xs, ...new Array(16).fill(0)]);
  it("reconhece MP4, PNG, JPEG e WebP", () => {
    expect(mimePelosBytes(b(0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d))).toBe("video/mp4");
    expect(mimePelosBytes(b(0x89, 0x50, 0x4e, 0x47))).toBe("image/png");
    expect(mimePelosBytes(b(0xff, 0xd8, 0xff))).toBe("image/jpeg");
    expect(mimePelosBytes(b(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50))).toBe("image/webp");
  });
  it("desconhecido ou curto = null", () => {
    expect(mimePelosBytes(b(1, 2, 3))).toBeNull();
    expect(mimePelosBytes(new Uint8Array([1]))).toBeNull();
    expect(mimePelosBytes(null)).toBeNull();
  });
});

// ── Ponta a ponta: do arquivo do ChatGPT ao conteúdo de vídeo gravado ──
import { vi, afterEach } from "vitest";
import { dispatchTool, type ToolCtx } from "../../supabase/functions/_shared/agent-tools";

const SUPA = "https://qdmhqxpazffmaxleyzxs.supabase.co";
const USER = "58a0c7ec-faf7-4b70-91cd-ce335100f66f";

/** Cliente falso que guarda o que foi inserido e subido. */
function cenario(corpo: Uint8Array, contentType = "application/octet-stream") {
  const inseridos: any[] = [];
  const uploads: Array<{ caminho: string; contentType: string }> = [];
  const q: any = {
    select: () => q, eq: () => q, limit: () => q,
    insert: (linha: any) => { inseridos.push(linha); return q; },
    single: async () => ({ data: { id: "c0ffee00-0000-4000-8000-000000000002" }, error: null }),
    then: (ok: any, ko: any) => Promise.resolve({ data: [], error: null }).then(ok, ko),
  };
  const userClient: any = {
    from: () => q,
    rpc: vi.fn(async () => ({ data: null, error: null })),
    storage: {
      from: () => ({
        upload: async (caminho: string, _b: Uint8Array, op: any) => { uploads.push({ caminho, contentType: op.contentType }); return { error: null }; },
        getPublicUrl: (caminho: string) => ({ data: { publicUrl: `${SUPA}/storage/v1/object/public/content-images/${caminho}` } }),
        remove: async () => ({ error: null }),
      }),
    },
  };
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (String(url).includes("/functions/v1/connect-social")) return new Response(JSON.stringify({ connections: [] }), { status: 200 });
    return new Response(corpo, { status: 200, headers: { "content-type": contentType } });
  }));
  const ctx: ToolCtx = { supabaseUrl: SUPA, anonKey: "anon", userAuthHeader: "Bearer jwt", userClient, anthropicKey: "", userId: USER, defaultBrandId: "marca-1" };
  return { ctx, inseridos, uploads };
}

const MP4 = () => { const b = new Uint8Array(4096); b.set([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]); return b; };

describe("agendar_arte com arquivo da conversa do ChatGPT", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("vídeo com mime_type, link sem .mp4 e octet-stream: copia para o bucket e grava como vídeo", async () => {
    const { ctx, inseridos, uploads } = cenario(new Uint8Array(4096));
    const args = normalizarArquivosDaConversa("agendar_arte", { legenda: "Reel", arquivo: arq({ mime_type: "video/mp4", file_name: "reel.mp4" }) });
    const r = await dispatchTool(ctx, "agendar_arte", args);
    expect(r.ok).toBe(true);
    expect(uploads).toHaveLength(1);
    expect(uploads[0].contentType).toBe("video/mp4");
    expect(uploads[0].caminho).toMatch(/\.mp4$/);
    expect(inseridos[0].content_type).toBe("video");
    // A peça aponta para o NOSSO bucket, não para o link temporário do ChatGPT.
    expect(inseridos[0].image_urls[0]).toMatch(new RegExp(`^${SUPA}/storage/v1/object/public/content-images/mcp/${USER}/`));
  });

  it("sem mime nem nome: reconhece o MP4 pelos bytes", async () => {
    const { ctx, inseridos, uploads } = cenario(MP4());
    const r = await dispatchTool(ctx, "agendar_arte", normalizarArquivosDaConversa("agendar_arte", { legenda: "Reel", arquivo: arq() }));
    expect(r.ok).toBe(true);
    expect(uploads[0].contentType).toBe("video/mp4");
    expect(inseridos[0].content_type).toBe("video");
  });

  it("dica falsa não transforma PDF em vídeo: o cabeçalho real manda", async () => {
    const { ctx, inseridos } = cenario(new Uint8Array(64), "application/pdf");
    const r = await dispatchTool(ctx, "agendar_arte", { legenda: "x", imagem: "https://files.oaiusercontent.com/x", _mime_imagem: "video/mp4" });
    expect(r.ok).toBe(false);
    expect(r.content).toBe("Isso nao e uma imagem nem um video MP4 (application/pdf).");
    expect(inseridos).toEqual([]);
  });
});
