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

export type LogoPosition =
  | "top-right" | "top-left" | "bottom-right" | "bottom-left" | "top-center" | "bottom-center";

export interface LogoConfig {
  position?: LogoPosition;
  opacity?: number;      // 0..1
  widthPct?: number;     // largura da caixa do logo em % da largura da imagem (default 0.22)
}

// Baixa uma imagem pública e devolve data-URI base64 (mesmo helper do render-slide-image).
async function toDataUri(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`logo fetch ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  const mime = res.headers.get("content-type") || "image/png";
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return `data:${mime};base64,${btoa(bin)}`;
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
  const logoDataUri = await toDataUri(logoUrl);
  const position = cfg?.position || "top-right";
  const opacity = typeof cfg?.opacity === "number" ? cfg.opacity : 1;
  const boxW = Math.round(w * (cfg?.widthPct || 0.22));
  const boxH = Math.round(h * 0.12);
  const margin = Math.round(w * 0.04);

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
