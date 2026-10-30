import { describe, expect, it } from "vitest";
import { deflateSync, inflateSync } from "node:zlib";
import {
  chunksDoPng,
  formatoDaImagem,
  limparImagem,
  limparJpeg,
  limparPng,
  limparWebp,
  midiasSemMetadado,
} from "../../supabase/functions/_shared/sem-metadado";
import { REGRA_FOTO_REAL } from "../../supabase/functions/_shared/regra-foto-real";

// ─── fábrica de arquivos de teste ───

const TABELA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (const x of b) c = TABELA_CRC[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
const txt = (s: string) => new TextEncoder().encode(s);
function juntar(...partes: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(partes.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of partes) { out.set(p, o); o += p.length; }
  return out;
}
function chunkPng(tipo: string, dados: Uint8Array): Uint8Array {
  const c = new Uint8Array(12 + dados.length);
  const v = new DataView(c.buffer);
  v.setUint32(0, dados.length);
  c.set(txt(tipo), 4);
  c.set(dados, 8);
  v.setUint32(8 + dados.length, crc32(c.subarray(4, 8 + dados.length)));
  return c;
}

/** PNG 2x2 RGB com pixels conhecidos, mais os blocos de proveniência que a OpenAI e editores gravam. */
const PIXELS = new Uint8Array([
  0, 255, 0, 0, 0, 255, 0, // linha 1: filtro 0, vermelho, verde
  0, 0, 0, 255, 255, 255, 255, // linha 2: filtro 0, azul, branco
]);
function pngComProveniencia(): Uint8Array {
  const ihdr = new Uint8Array([0, 0, 0, 2, 0, 0, 0, 2, 8, 2, 0, 0, 0]);
  return juntar(
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunkPng("IHDR", ihdr),
    chunkPng("sRGB", new Uint8Array([0])),
    chunkPng("caBX", txt("jumb c2pa OpenAI trainedAlgorithmicMedia c2pa.signature")),
    chunkPng("tEXt", txt("Software\0ChatGPT")),
    chunkPng("iTXt", txt("XML:com.adobe.xmp\0\0\0\0\0<x:xmpmeta>digitalSourceType</x:xmpmeta>")),
    chunkPng("IDAT", new Uint8Array(deflateSync(PIXELS))),
    chunkPng("IEND", new Uint8Array()),
  );
}
const idatDe = (png: Uint8Array) => {
  const v = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let p = 8;
  while (p < png.length) {
    const n = v.getUint32(p);
    if (new TextDecoder().decode(png.subarray(p + 4, p + 8)) === "IDAT") return png.subarray(p + 8, p + 8 + n);
    p += 12 + n;
  }
  throw new Error("sem IDAT");
};

function segJpeg(marcador: number, corpo: Uint8Array): Uint8Array {
  const n = corpo.length + 2;
  return juntar(new Uint8Array([0xff, marcador, n >> 8, n & 0xff]), corpo);
}
/** EXIF big endian com Orientation no IFD0, mais uma tag Software para mostrar que o resto sai. */
function exif(orientacao: number): Uint8Array {
  return new Uint8Array([
    ...txt("Exif\0\0"), 0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8,
    0, 2,
    0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientacao, 0, 0,
    0x01, 0x31, 0, 2, 0, 0, 0, 4, 0x41, 0x49, 0x21, 0,
    0, 0, 0, 0,
  ]);
}
const DADO_COMPRIMIDO = new Uint8Array([0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd0, 0x78]);
function jpegComProveniencia(orientacao = 1): Uint8Array {
  return juntar(
    new Uint8Array([0xff, 0xd8]),
    segJpeg(0xe0, txt("JFIF\0\x01\x01\0\0\x01\0\x01\0\0")),
    segJpeg(0xe1, exif(orientacao)),
    segJpeg(0xe1, txt("http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>trainedAlgorithmicMedia</x:xmpmeta>")),
    segJpeg(0xe2, txt("ICC_PROFILE\0\x01\x01perfil")),
    segJpeg(0xeb, txt("JP\0\x01jumb c2pa OpenAI")),
    segJpeg(0xed, txt("Photoshop 3.0\x008BIM IPTC")),
    segJpeg(0xfe, txt("comentario")),
    segJpeg(0xdb, new Uint8Array(65)), // DQT
    segJpeg(0xc0, new Uint8Array([8, 0, 2, 0, 2, 1, 1, 0x11, 0])), // SOF0
    segJpeg(0xda, new Uint8Array([1, 1, 0, 0, 0x3f, 0])), // SOS
    DADO_COMPRIMIDO,
    new Uint8Array([0xff, 0xd9]),
  );
}
const temTexto = (b: Uint8Array, s: string) => new TextDecoder("latin1").decode(b).includes(s);

function chunkWebp(tipo: string, dados: Uint8Array): Uint8Array {
  const pad = dados.length % 2 ? new Uint8Array([0]) : new Uint8Array();
  const h = new Uint8Array(8);
  h.set(txt(tipo));
  new DataView(h.buffer).setUint32(4, dados.length, true);
  return juntar(h, dados, pad);
}
function webpComProveniencia(): Uint8Array {
  const vp8x = new Uint8Array(10);
  vp8x[0] = 0x2c; // ICC + EXIF + XMP
  const corpo = juntar(
    txt("WEBP"),
    chunkWebp("VP8X", vp8x),
    chunkWebp("ICCP", txt("perfil")),
    chunkWebp("VP8L", txt("pixels!")),
    chunkWebp("EXIF", txt("MM\0*exif")),
    chunkWebp("XMP ", txt("<x:xmpmeta/>")),
    chunkWebp("C2PA", txt("jumb c2pa")),
  );
  const h = new Uint8Array(8);
  h.set(txt("RIFF"));
  new DataView(h.buffer).setUint32(4, corpo.length, true);
  return juntar(h, corpo);
}

// ─── testes ───

describe("limparPng", () => {
  it("tira caBX (C2PA), tEXt e iTXt e mantém os pixels idênticos", () => {
    const original = pngComProveniencia();
    const r = limparPng(original);
    expect(r.mudou).toBe(true);
    expect(r.removidos).toEqual(["caBX", "tEXt", "iTXt"]);
    expect(chunksDoPng(r.bytes)).toEqual(["IHDR", "sRGB", "IDAT", "IEND"]);
    expect(temTexto(r.bytes, "c2pa")).toBe(false);
    expect(temTexto(r.bytes, "ChatGPT")).toBe(false);
    expect(temTexto(r.bytes, "digitalSourceType")).toBe(false);
    // Mesmo IDAT byte a byte = mesmos pixels; e o IDAT descomprime nos pixels de origem.
    expect(Buffer.from(idatDe(r.bytes)).equals(Buffer.from(idatDe(original)))).toBe(true);
    expect(Buffer.from(inflateSync(idatDe(r.bytes))).equals(Buffer.from(PIXELS))).toBe(true);
  });

  it("os CRCs dos chunks mantidos continuam válidos", () => {
    const r = limparPng(pngComProveniencia());
    const v = new DataView(r.bytes.buffer, r.bytes.byteOffset, r.bytes.byteLength);
    let p = 8;
    while (p < r.bytes.length) {
      const n = v.getUint32(p);
      expect(v.getUint32(p + 8 + n)).toBe(crc32(r.bytes.subarray(p + 4, p + 8 + n)));
      p += 12 + n;
    }
  });

  it("PNG já limpo volta idêntico e uma segunda passada não muda nada", () => {
    const uma = limparPng(pngComProveniencia());
    const duas = limparPng(uma.bytes);
    expect(duas.mudou).toBe(false);
    expect(duas.bytes).toBe(uma.bytes);
  });
});

describe("limparJpeg", () => {
  it("tira APP1 (EXIF/XMP), APP11 (C2PA), APP13 (IPTC) e COM; mantém APP0, ICC e o dado comprimido", () => {
    const r = limparJpeg(jpegComProveniencia());
    expect(r.mudou).toBe(true);
    expect(r.removidos).toEqual(["APP1/EXIF", "APP1/XMP", "APP11", "APP13", "COM"]);
    for (const s of ["c2pa", "trainedAlgorithmicMedia", "8BIM", "comentario", "Exif"]) expect(temTexto(r.bytes, s)).toBe(false);
    expect(temTexto(r.bytes, "JFIF")).toBe(true);
    expect(temTexto(r.bytes, "ICC_PROFILE")).toBe(true);
    const fim = r.bytes.subarray(r.bytes.length - DADO_COMPRIMIDO.length - 2);
    expect(Array.from(fim)).toEqual([...DADO_COMPRIMIDO, 0xff, 0xd9]);
  });

  it("foto com orientação ≠ 1 ganha um EXIF mínimo só com ela (senão apareceria deitada)", () => {
    const r = limparJpeg(jpegComProveniencia(6));
    expect(temTexto(r.bytes, "Exif")).toBe(true);
    expect(temTexto(r.bytes, "AI!")).toBe(false); // a tag Software saiu
    // Logo depois do APP0: FF E1, e a Orientation = 6.
    const fimDoApp0 = 4 + ((r.bytes[4] << 8) | r.bytes[5]);
    expect([r.bytes[fimDoApp0], r.bytes[fimDoApp0 + 1]]).toEqual([0xff, 0xe1]);
    // APP1: FF E1 + tamanho(2) + "Exif\0\0"(6) + TIFF(8) + contagem(2) + tag/tipo/qtd(8) → valor (SHORT) em +28, byte baixo em +29.
    expect(r.bytes[fimDoApp0 + 29]).toBe(6);
    expect(limparJpeg(r.bytes).mudou).toBe(true); // o EXIF mínimo é reconhecido e refeito igual
    expect(Buffer.from(limparJpeg(r.bytes).bytes).equals(Buffer.from(r.bytes))).toBe(true);
  });
});

describe("limparWebp", () => {
  it("tira EXIF, XMP e C2PA, desliga as flags no VP8X e corrige o tamanho do RIFF", () => {
    const r = limparWebp(webpComProveniencia());
    expect(r.removidos).toEqual(["EXIF", "XMP ", "C2PA"]);
    expect(temTexto(r.bytes, "c2pa")).toBe(false);
    expect(temTexto(r.bytes, "VP8Lpixels!") || temTexto(r.bytes, "pixels!")).toBe(true);
    const v = new DataView(r.bytes.buffer);
    expect(v.getUint32(4, true)).toBe(r.bytes.length - 8);
    expect(r.bytes[12 + 8] & 0x0c).toBe(0); // flags EXIF/XMP
    expect(r.bytes[12 + 8] & 0x20).toBe(0x20); // ICC continua
  });
});

describe("limparImagem", () => {
  it("detecta o formato pelos bytes", () => {
    expect(formatoDaImagem(pngComProveniencia())).toBe("png");
    expect(formatoDaImagem(jpegComProveniencia())).toBe("jpeg");
    expect(formatoDaImagem(webpComProveniencia())).toBe("webp");
    expect(formatoDaImagem(txt("<html>erro</html>"))).toBe("desconhecido");
  });

  it("arquivo que não entende (vídeo, HTML, PNG truncado) volta como veio, sem lançar", () => {
    const html = txt("<html>403</html>");
    expect(limparImagem(html)).toMatchObject({ mudou: false, formato: "desconhecido" });
    const truncado = pngComProveniencia().subarray(0, 60);
    const r = limparImagem(truncado);
    expect(r.mudou).toBe(false);
    expect(r.bytes).toBe(truncado);
  });
});

describe("midiasSemMetadado (publish-postforme)", () => {
  const arquivos: Record<string, Uint8Array> = {
    "https/a.png": pngComProveniencia(),
    "https/b.png": limparPng(pngComProveniencia()).bytes,
    "https/c.mp4": txt("....ftypmp42"),
  };
  it("troca só a URL da imagem que tinha metadado; o resto segue com a original", async () => {
    const subidos: Uint8Array[] = [];
    const urls = await midiasSemMetadado(["https/a.png", "https/b.png", "https/c.mp4"], {
      baixar: async (u) => arquivos[u] ?? null,
      subir: async (b, formato, i) => { subidos.push(b); return `https/limpa-${i}.${formato}`; },
    });
    expect(urls).toEqual(["https/limpa-0.png", "https/b.png", "https/c.mp4"]);
    expect(subidos).toHaveLength(1);
    expect(temTexto(subidos[0], "c2pa")).toBe(false);
  });

  it("falha no download ou no upload mantém a URL original (o post sai mesmo assim)", async () => {
    const urls = await midiasSemMetadado(["https/a.png", "https/sumiu.png"], {
      baixar: async (u) => arquivos[u] ?? null,
      subir: async () => { throw new Error("storage fora"); },
    });
    expect(urls).toEqual(["https/a.png", "https/sumiu.png"]);
  });
});

describe("REGRA_FOTO_REAL", () => {
  it("proíbe foto realista de pessoa real e de fato real, com a exceção da referência do dono", () => {
    expect(REGRA_FOTO_REAL).toMatch(/pessoa real identificável/);
    expect(REGRA_FOTO_REAL).toMatch(/acontecimento real/);
    expect(REGRA_FOTO_REAL).toMatch(/fotos de referência enviadas pelo dono da conta/);
  });
});
