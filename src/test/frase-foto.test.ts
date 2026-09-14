/**
 * SMOKE TESTS — atalho "Frase" com foto pessoal.
 *
 * Caso real (Maikon, 2026-09-14): o atalho não existia no /agent, as tentativas de frase saíam "sem
 * marca" (sem foto), e a única foto dele apontava para o projeto Supabase antigo, que não existe mais.
 *
 * Run: npm test
 */
import { describe, it, expect } from "vitest";
import { CONTENT_FORMATS } from "@/lib/formats";
import { fotoValida, escolherMarcaDeFotos, PROJETO_SUPABASE } from "@/lib/fotosPessoais";

describe("atalho Frase", () => {
  const frase = CONTENT_FORMATS.find((f) => f.id === "frase");

  it("existe na lista única — a mesma que o /agent e a Central de Ajuda leem", () => {
    expect(frase).toBeDefined();
    expect(frase!.label).toBe("Frase");
  });

  it('o template termina em "frase: " para o extrator pegar só o texto da frase', () => {
    // O template antigo ("...frase inspiracional de autoridade sobre: X") fazia o extrator do ai-chat
    // (/frase[:\s]+(.+)/) capturar "inspiracional de autoridade sobre: X" como se fosse a frase.
    expect(frase!.template.endsWith("frase: ")).toBe(true);
    const pedido = frase!.template + "Pequenos passos levam a grandes conquistas";
    const capturado = pedido.match(/(?:frase[:\s]+|com\s+a\s+frase[:\s]+|imagem\s+com\s+a\s+frase[:\s]+)(.+)/i)?.[1];
    expect(capturado).toBe("Pequenos passos levam a grandes conquistas");
  });

  it("o template dispara o estilo de frase no ai-chat", () => {
    expect(/\b(frase|citação|citacao|quote)\b/i.test(frase!.template)).toBe(true);
  });
});

describe("fotoValida", () => {
  it("aceita foto do projeto atual", () => {
    expect(fotoValida(`${PROJETO_SUPABASE}/storage/v1/object/public/content-images/u/foto.jpg`)).toBe(true);
  });
  it("recusa foto do projeto antigo — o domínio não existe mais e a frase sairia sem a pessoa", () => {
    expect(fotoValida("https://pbsqmaomyaiexgajfrsa.supabase.co/storage/v1/object/public/content-images/u/foto.jpeg")).toBe(false);
  });
  it("recusa lixo e domínio parecido", () => {
    expect(fotoValida(null)).toBe(false);
    expect(fotoValida("")).toBe(false);
    expect(fotoValida(`${PROJETO_SUPABASE}.evil.com/foto.jpg`)).toBe(false);
  });
});

describe("escolherMarcaDeFotos", () => {
  const vivo = (n: number) => `${PROJETO_SUPABASE}/storage/v1/object/public/content-images/u/${n}.jpg`;
  const morto = "https://pbsqmaomyaiexgajfrsa.supabase.co/storage/v1/object/public/content-images/u/x.jpeg";
  const marcas = [
    { id: "fotos", name: "Fotos pessoais", creation_mode: "photo_backgrounds" },
    { id: "ages", name: "Ages", creation_mode: "photo_backgrounds" },
    { id: "heart", name: "Heart surgery", creation_mode: "style_copy" },
  ];

  it("sem marca de fotos, não escolhe nada — o atalho manda criar", () => {
    expect(escolherMarcaDeFotos([marcas[2]], [], "")).toBeNull();
  });

  it("escolhe a marca com MAIS fotos válidas, ignorando as mortas", () => {
    const fotos = [
      { brand_id: "fotos", image_url: morto },
      { brand_id: "ages", image_url: vivo(1) },
      { brand_id: "ages", image_url: vivo(2) },
    ];
    expect(escolherMarcaDeFotos(marcas, fotos, "heart")).toEqual({ marca: marcas[1], fotos: 2 });
  });

  it("mantém a marca atual se ela já tem foto válida", () => {
    const fotos = [{ brand_id: "fotos", image_url: vivo(1) }, { brand_id: "ages", image_url: vivo(2) }, { brand_id: "ages", image_url: vivo(3) }];
    expect(escolherMarcaDeFotos(marcas, fotos, "fotos")).toEqual({ marca: marcas[0], fotos: 1 });
  });

  it("caso do Maikon hoje: só foto morta → escolhe a marca de fotos, com 0 fotos, para o aviso de cadastrar", () => {
    const r = escolherMarcaDeFotos(marcas, [{ brand_id: "fotos", image_url: morto }], "heart");
    expect(r?.fotos).toBe(0);
    expect(marcas.filter((m) => m.creation_mode === "photo_backgrounds").map((m) => m.id)).toContain(r?.marca.id);
  });
});
