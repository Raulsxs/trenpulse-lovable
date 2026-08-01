// Overlay determinístico do logo da marca sobre uma imagem gerada (T02).
//
// PROBLEMA QUE RESOLVE: modelos de imagem redesenham o logo diferente a cada geração (logo drift) —
// num carrossel, o mesmo logo saía com ícones diferentes em cada slide. Nenhum prompt resolve isso.
// A ÚNICA forma de ter logo idêntico é compor o PNG real (brands.logo_url) por cima, deterministicamente.
//
// Reusa o mesmo motor do render-slide-image: Satori/resvg via og_edge (JSX/CSS → SVG → PNG). O logo é
// baixado e embutido como data-URI (Satori não faz fetch de URL remota de forma confiável no edge).

import React from "https://esm.sh/react@18.2.0";
import { ImageResponse } from "https://deno.land/x/og_edge@0.0.4/mod.ts";
import { Image } from "https://deno.land/x/imagescript@1.2.15/mod.ts";

export type LogoPosition =
  | "top-right" | "top-left" | "bottom-right" | "bottom-left" | "top-center" | "bottom-center";

export interface LogoConfig {
  position?: LogoPosition;
  opacity?: number;      // 0..1
  widthPct?: number;     // largura da caixa do logo em % da largura da imagem (default 0.22)
}

function bytesToDataUri(buf: Uint8Array, mime = "image/png"): string {
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return `data:${mime};base64,${btoa(bin)}`;
}

// Chroma-key: muitos logos vêm como "logo sobre card colorido" (o Pulse ID é branco/cyan sobre navy
// sólido opaco) → sobrepostos, aparecem numa caixa "colada". Se os cantos forem OPACOS e uniformes,
// removemos essa cor de fundo (alpha 0) num passo único sobre o bitmap. Se os cantos já são
// transparentes, devolve como está (não mexe em logo que já tem fundo transparente).
// Tolerância baixa (70 na soma dos diffs RGB) pega o fundo + antialiasing sem tocar no logo em si.
async function stripBackground(buf: Uint8Array): Promise<Uint8Array> {
  try {
    const img = await Image.decode(buf);
    const bmp = img.bitmap; // Uint8ClampedArray RGBA (w*h*4)
    if (bmp.length < 16) return buf;
    // Cor de fundo = pixel do canto superior esquerdo; se já transparente, não mexe.
    const br = bmp[0], bg = bmp[1], bb = bmp[2], ba = bmp[3];
    if (ba < 200) return buf;
    const TOL = 70;
    let lumSum = 0, lumN = 0;
    for (let i = 0; i < bmp.length; i += 4) {
      if (Math.abs(bmp[i] - br) + Math.abs(bmp[i + 1] - bg) + Math.abs(bmp[i + 2] - bb) < TOL) {
        bmp[i + 3] = 0;
      } else {
        lumSum += 0.299 * bmp[i] + 0.587 * bmp[i + 1] + 0.114 * bmp[i + 2];
        lumN++;
      }
    }
    // Guard: se o LOGO restante for muito CLARO (ex.: branco/cyan sobre navy), removê-lo o deixaria
    // invisível num slide de fundo claro → melhor devolver o original (card visível) do que um logo
    // fantasma. Só entrega o strip quando o logo tem contraste próprio (some limpo no fundo claro).
    if (lumN > 0 && lumSum / lumN > 175) return buf;
    return await img.encode();
  } catch {
    return buf; // qualquer falha de decode/encode → usa o logo original
  }
}

// Baixa o logo, remove fundo sólido opaco (se houver) e devolve data-URI base64.
async function fetchLogoDataUri(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`logo fetch ${res.status}`);
  const raw = new Uint8Array(await res.arrayBuffer());
  const stripped = await stripBackground(raw);
  return bytesToDataUri(stripped, "image/png");
}

// Mapeia a posição -> âncoras absolutas + alinhamento do objectPosition (pra colar no canto certo).
function cornerStyle(pos: LogoPosition, margin: number): Record<string, unknown> {
  const s: Record<string, unknown> = { position: "absolute" };
  if (pos.startsWith("top")) s.top = margin; else s.bottom = margin;
  if (pos.endsWith("left")) { s.left = margin; s.objectPosition = "left"; }
  else if (pos.endsWith("right")) { s.right = margin; s.objectPosition = "right"; }
  else { s.left = "50%"; s.transform = "translateX(-50%)"; s.objectPosition = "center"; }
  return s;
}

/**
 * Compõe o logo por cima de `baseDataUrl` (data:image/...;base64) e devolve o PNG composto como
 * data-URI base64. Lança se algo falhar (o chamador trata com fallback "sem logo").
 */
export async function overlayLogo(
  baseDataUrl: string, logoUrl: string, w: number, h: number, cfg?: LogoConfig,
): Promise<string> {
  const logoDataUri = await fetchLogoDataUri(logoUrl);
  const position = cfg?.position || "top-right";
  const opacity = typeof cfg?.opacity === "number" ? cfg.opacity : 1;
  const boxW = Math.round(w * (cfg?.widthPct || 0.18));
  const boxH = Math.round(h * 0.10);
  const margin = Math.round(w * 0.035);

  const base = React.createElement("img", {
    src: baseDataUrl, width: w, height: h,
    style: { position: "absolute", top: 0, left: 0, width: w, height: h, objectFit: "cover" as any },
  });
  const logo = React.createElement("img", {
    src: logoDataUri, width: boxW, height: boxH,
    style: { width: boxW, height: boxH, objectFit: "contain" as any, opacity, ...cornerStyle(position, margin) },
  });
  const container = React.createElement(
    "div",
    { style: { position: "relative", width: w, height: h, display: "flex" } },
    [base, logo],
  );

  const resp = new ImageResponse(container, { width: w, height: h });
  const bytes = new Uint8Array(await resp.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return `data:image/png;base64,${btoa(bin)}`;
}
