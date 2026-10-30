// sem-metadado.ts — tira da imagem o metadado de proveniência (C2PA, XMP, IPTC, EXIF) sem tocar nos pixels.
//
// POR QUE EXISTE (30/10/2026, decisão do Raul): toda imagem que sai da OpenAI (gpt-image, ChatGPT) traz um
// manifesto C2PA assinado ("Content Credentials", `digitalSourceType = trainedAlgorithmicMedia`). O LinkedIn
// lê esse bloco e põe o selo "CR / A IA foi usada para gerar tudo desta imagem"; Instagram ("AI info") e
// TikTok também leem C2PA e IPTC. O Post for Me repassa o arquivo intacto, então o selo ia para todo post
// gerado no TrendPulse. O Raul decidiu tirar o metadado de TODA imagem antes de publicar, inclusive foto
// realista. O SynthID (marca d'água nos pixels) continua: aqui só sai o metadado, nunca um pixel muda.
// O outro lado da decisão está no prompt de imagem (regra-foto-real.ts): não gerar foto realista de
// pessoa real identificável nem de acontecimento real como se fosse verdadeira.
//
// Tudo puro (sem rede, sem Deno): o publish-postforme e os geradores usam isto, e os testes rodam no `npm test`.
//
// O que cada formato perde:
//  - PNG: todo chunk fora da lista PNG_MANTIDOS (caBX = C2PA, tEXt/iTXt/zTXt = XMP e texto, eXIf, tIME...).
//    Os chunks mantidos são copiados byte a byte, com o CRC original: IDAT idêntico = pixels idênticos.
//  - JPEG: APP1 (EXIF/XMP), APP11 (JUMBF/C2PA), APP13 (IPTC/Photoshop) e COM. Se o EXIF tinha orientação
//    diferente de 1, entra um EXIF mínimo só com ela: sem isso a foto de celular apareceria deitada.
//  - WebP: chunks EXIF, "XMP " e C2PA, e as flags correspondentes do VP8X.
// Formato desconhecido (GIF, vídeo, HTML de erro) volta como veio, com `mudou: false`.

export type FormatoDeImagem = "png" | "jpeg" | "webp" | "desconhecido";

export interface ImagemLimpa {
  bytes: Uint8Array;
  formato: FormatoDeImagem;
  /** true = algum bloco saiu; false = o arquivo voltou idêntico. */
  mudou: boolean;
  /** O que saiu, para log: "caBX", "tEXt", "APP11", "XMP " ... */
  removidos: string[];
}

const PNG_ASSINATURA = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Chunks de PNG que ficam. Os críticos (IHDR, PLTE, IDAT, IEND), a transparência (tRNS), os de cor
 * (gAMA, cHRM, sRGB, iCCP, sBIT: sem eles a cor pode mudar no app) e os de animação do APNG (acTL,
 * fcTL, fdAT: tirar um só corromperia o arquivo). Nenhum deles carrega proveniência.
 */
const PNG_MANTIDOS = new Set([
  "IHDR", "PLTE", "tRNS", "IDAT", "IEND",
  "gAMA", "cHRM", "sRGB", "iCCP", "sBIT",
  "acTL", "fcTL", "fdAT",
]);

export function formatoDaImagem(b: Uint8Array): FormatoDeImagem {
  if (b.length >= 8 && PNG_ASSINATURA.every((v, i) => b[i] === v)) return "png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return "webp";
  return "desconhecido";
}

/** Tira o metadado de proveniência. Nunca lança: arquivo que não entende volta como veio. */
export function limparImagem(bytes: Uint8Array): ImagemLimpa {
  const formato = formatoDaImagem(bytes);
  try {
    if (formato === "png") return limparPng(bytes);
    if (formato === "jpeg") return limparJpeg(bytes);
    if (formato === "webp") return limparWebp(bytes);
  } catch (_e) {
    // Arquivo truncado ou fora do padrão: publicar o original é melhor que derrubar a publicação.
  }
  return { bytes, formato, mudou: false, removidos: [] };
}

// ─────────────────────────────────── PNG ───────────────────────────────────

export function limparPng(b: Uint8Array): ImagemLimpa {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const partes: Uint8Array[] = [b.subarray(0, 8)];
  const removidos: string[] = [];
  let p = 8;
  let fim = false;
  while (p + 12 <= b.length) {
    const tamanho = v.getUint32(p);
    const tipo = ascii(b, p + 4, 4);
    const total = 12 + tamanho;
    if (p + total > b.length) throw new Error("PNG truncado");
    if (PNG_MANTIDOS.has(tipo)) partes.push(b.subarray(p, p + total));
    else removidos.push(tipo);
    p += total;
    if (tipo === "IEND") { fim = true; break; }
  }
  if (!fim) throw new Error("PNG sem IEND");
  if (!removidos.length) return { bytes: b, formato: "png", mudou: false, removidos };
  return { bytes: juntar(partes), formato: "png", mudou: true, removidos };
}

/** Lista os tipos de chunk de um PNG, na ordem (para teste e diagnóstico). */
export function chunksDoPng(b: Uint8Array): string[] {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const tipos: string[] = [];
  let p = 8;
  while (p + 12 <= b.length) {
    const tamanho = v.getUint32(p);
    tipos.push(ascii(b, p + 4, 4));
    p += 12 + tamanho;
  }
  return tipos;
}

// ─────────────────────────────────── JPEG ──────────────────────────────────

const APP1 = 0xe1, APP11 = 0xeb, APP13 = 0xed, COM = 0xfe, SOS = 0xda, EOI = 0xd9;

export function limparJpeg(b: Uint8Array): ImagemLimpa {
  const partes: Uint8Array[] = [b.subarray(0, 2)]; // SOI
  const removidos: string[] = [];
  let orientacao = 1;
  let p = 2;
  while (p < b.length) {
    if (b[p] !== 0xff) throw new Error("JPEG: marcador esperado");
    // Bytes 0xFF de preenchimento entre segmentos são permitidos.
    let m = p + 1;
    while (m < b.length && b[m] === 0xff) m++;
    const marcador = b[m];
    const inicio = m - 1;
    // Marcadores sem tamanho: RSTn, TEM, SOI e EOI.
    if ((marcador >= 0xd0 && marcador <= 0xd7) || marcador === 0x01 || marcador === 0xd8) {
      partes.push(b.subarray(inicio, m + 1));
      p = m + 1;
      continue;
    }
    if (marcador === EOI) { partes.push(b.subarray(inicio, m + 1)); p = m + 1; break; }
    const tamanho = (b[m + 1] << 8) | b[m + 2];
    const fimSeg = m + 1 + tamanho;
    if (fimSeg > b.length) throw new Error("JPEG truncado");
    if (marcador === SOS) {
      // Depois do SOS vem o dado comprimido até o EOI: segue como está, junto com o resto do arquivo.
      partes.push(b.subarray(inicio));
      p = b.length;
      break;
    }
    const corpo = b.subarray(m + 3, fimSeg);
    if (marcador === APP1 || marcador === APP11 || marcador === APP13 || marcador === COM) {
      if (marcador === APP1 && ascii(corpo, 0, 6) === "Exif\0\0") {
        orientacao = orientacaoDoExif(corpo.subarray(6)) ?? orientacao;
        removidos.push("APP1/EXIF");
      } else if (marcador === APP1) removidos.push("APP1/XMP");
      else removidos.push(marcador === APP11 ? "APP11" : marcador === APP13 ? "APP13" : "COM");
    } else {
      partes.push(b.subarray(inicio, fimSeg));
    }
    p = fimSeg;
  }
  if (!removidos.length) return { bytes: b, formato: "jpeg", mudou: false, removidos };
  // EXIF mínimo logo depois do SOI (e do APP0, se houver) só com a orientação.
  if (orientacao !== 1) {
    const posicao = partes.length > 1 && partes[1][1] === 0xe0 ? 2 : 1;
    partes.splice(posicao, 0, exifSoComOrientacao(orientacao));
  }
  return { bytes: juntar(partes), formato: "jpeg", mudou: true, removidos };
}

/** Lê a tag Orientation (0x0112) do IFD0 de um bloco TIFF. Null quando não há. */
function orientacaoDoExif(tiff: Uint8Array): number | null {
  if (tiff.length < 8) return null;
  const le = tiff[0] === 0x49; // "II" = little endian; "MM" = big endian
  const v = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const u16 = (o: number) => v.getUint16(o, le);
  const ifd = v.getUint32(4, le);
  if (ifd + 2 > tiff.length) return null;
  const n = u16(ifd);
  for (let i = 0; i < n; i++) {
    const e = ifd + 2 + i * 12;
    if (e + 12 > tiff.length) return null;
    if (u16(e) === 0x0112) {
      const valor = u16(e + 8);
      return valor >= 1 && valor <= 8 ? valor : null;
    }
  }
  return null;
}

/** Segmento APP1 com um EXIF de uma tag só (Orientation), big endian. */
function exifSoComOrientacao(orientacao: number): Uint8Array {
  const corpo = [
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // TIFF "MM", 42, IFD0 no offset 8
    0x00, 0x01, // 1 entrada
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientacao, 0x00, 0x00, // Orientation SHORT
    0x00, 0x00, 0x00, 0x00, // sem próximo IFD
  ];
  const tamanho = corpo.length + 2;
  return new Uint8Array([0xff, APP1, tamanho >> 8, tamanho & 0xff, ...corpo]);
}

// ─────────────────────────────────── WebP ──────────────────────────────────

const WEBP_REMOVIDOS = new Set(["EXIF", "XMP ", "C2PA"]);

export function limparWebp(b: Uint8Array): ImagemLimpa {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const partes: Uint8Array[] = [];
  const removidos: string[] = [];
  let vp8x: Uint8Array | null = null;
  let p = 12;
  while (p + 8 <= b.length) {
    const tipo = ascii(b, p, 4);
    const tamanho = v.getUint32(p + 4, true);
    const total = 8 + tamanho + (tamanho % 2); // chunk ímpar tem 1 byte de preenchimento
    if (p + 8 + tamanho > b.length) throw new Error("WebP truncado");
    const chunk = b.subarray(p, Math.min(p + total, b.length));
    if (WEBP_REMOVIDOS.has(tipo)) removidos.push(tipo);
    else if (tipo === "VP8X") { vp8x = chunk.slice(); partes.push(vp8x); }
    else partes.push(chunk);
    p += total;
  }
  if (!removidos.length) return { bytes: b, formato: "webp", mudou: false, removidos };
  // VP8X: bit 0x08 = tem EXIF, 0x04 = tem XMP. Sem os chunks, as flags precisam sair também.
  if (vp8x) vp8x[8] &= ~0x0c;
  const corpo = juntar(partes);
  const saida = new Uint8Array(12 + corpo.length);
  saida.set(b.subarray(0, 12));
  new DataView(saida.buffer).setUint32(4, 4 + corpo.length, true);
  saida.set(corpo, 12);
  return { bytes: saida, formato: "webp", mudou: true, removidos };
}

// ──────────────────────── Mídia de um post antes de publicar ────────────────────────

export interface DependenciasDaLimpeza {
  /** Baixa a mídia. Null = não deu (a URL original segue). */
  baixar: (url: string) => Promise<Uint8Array | null>;
  /** Sobe a versão limpa e devolve a URL pública dela. */
  subir: (bytes: Uint8Array, formato: Exclude<FormatoDeImagem, "desconhecido">, indice: number) => Promise<string>;
  log?: (msg: string) => void;
}

/**
 * As URLs que vão ao Post for Me, cada uma trocada pela versão sem metadado quando havia o que tirar.
 * Imagem já limpa e o que não é imagem (vídeo) seguem com a URL original. Qualquer falha (download,
 * upload) também mantém a original: o post sai, só que com o selo, e o log diz por quê.
 */
export async function midiasSemMetadado(urls: string[], deps: DependenciasDaLimpeza): Promise<string[]> {
  const log = deps.log || (() => {});
  return await Promise.all(urls.map(async (url, i) => {
    try {
      const bytes = await deps.baixar(url);
      if (!bytes) { log(`mídia ${i + 1}: não baixou, segue a original`); return url; }
      const limpa = limparImagem(bytes);
      if (!limpa.mudou || limpa.formato === "desconhecido") return url;
      const nova = await deps.subir(limpa.bytes, limpa.formato, i);
      log(`mídia ${i + 1}: ${limpa.formato} sem ${limpa.removidos.join(", ")} (${bytes.length} → ${limpa.bytes.length} bytes)`);
      return nova;
    } catch (e) {
      log(`mídia ${i + 1}: limpeza falhou (${(e as Error)?.message}), segue a original`);
      return url;
    }
  }));
}

export const MIME_DO_FORMATO: Record<Exclude<FormatoDeImagem, "desconhecido">, string> = {
  png: "image/png", jpeg: "image/jpeg", webp: "image/webp",
};
export const EXTENSAO_DO_FORMATO: Record<Exclude<FormatoDeImagem, "desconhecido">, string> = {
  png: "png", jpeg: "jpg", webp: "webp",
};

// ─────────────────────────────────── util ──────────────────────────────────

function ascii(b: Uint8Array, inicio: number, n: number): string {
  let s = "";
  for (let i = inicio; i < inicio + n && i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
}

function juntar(partes: Uint8Array[]): Uint8Array {
  const total = partes.reduce((s, x) => s + x.length, 0);
  const saida = new Uint8Array(total);
  let o = 0;
  for (const x of partes) { saida.set(x, o); o += x.length; }
  return saida;
}
