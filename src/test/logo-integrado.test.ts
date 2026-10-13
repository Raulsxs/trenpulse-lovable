import { describe, it, expect } from "vitest";
import { assinaComLogo, dispensaLogo, refsComLogo, instrucaoDoLogo, instrucaoSemLogo } from "../../supabase/functions/_shared/logo-integrado.ts";

const LOGO = "https://x.supabase.co/storage/v1/object/public/content-images/logos/a.png";

describe("assinaComLogo", () => {
  it("marca com logo assina", () => {
    expect(assinaComLogo({ logo_url: LOGO, creation_mode: "style_copy" })).toBe(true);
  });
  it("foto pessoal como fundo não leva logo (não mexer no fluxo do Maikon)", () => {
    expect(assinaComLogo({ logo_url: LOGO, creation_mode: "photo_backgrounds" })).toBe(false);
  });
  it("sem marca, sem logo ou com logo que não é URL: não assina", () => {
    expect(assinaComLogo(null)).toBe(false);
    expect(assinaComLogo({ logo_url: null })).toBe(false);
    expect(assinaComLogo({ logo_url: "data:image/png;base64,AAAA" })).toBe(false);
  });
});

describe("refsComLogo", () => {
  it("o logo é sempre a última imagem — a instrução aponta para ela", () => {
    expect(refsComLogo(["a", "b"], LOGO)).toEqual(["a", "b", LOGO]);
  });
  it("no teto do provedor, corta referência de estilo e nunca o logo", () => {
    const r = refsComLogo(["1", "2", "3", "4", "5", "6"], LOGO, 6);
    expect(r).toHaveLength(6);
    expect(r[5]).toBe(LOGO);
    expect(r.slice(0, 5)).toEqual(["1", "2", "3", "4", "5"]);
  });
  it("logo que já estava entre as referências não vai duas vezes", () => {
    expect(refsComLogo(["a", LOGO], LOGO)).toEqual(["a", LOGO]);
  });
  it("sem referência de estilo, vai só o logo", () => {
    expect(refsComLogo([], LOGO)).toEqual([LOGO]);
  });
});

describe("instrucaoDoLogo", () => {
  it("manda reproduzir uma vez, sem caixa atrás e sem inventar", () => {
    const t = instrucaoDoLogo({});
    expect(t).toContain("ÚLTIMA imagem anexada");
    expect(t).toContain("UMA única vez");
    expect(t).toContain("não desenhe caixa");
    expect(t).toContain("não desenhe nem invente logo nenhum");
  });
  it("usa a posição preferida da marca quando existe", () => {
    expect(instrucaoDoLogo({ posicaoPreferida: "bottom-left" })).toContain("no canto inferior esquerdo");
    expect(instrucaoDoLogo({ posicaoPreferida: "qualquer-coisa" })).toContain("lugar de assinatura do layout");
  });
  it("carrossel fixa posição e tamanho entre slides", () => {
    expect(instrucaoDoLogo({ variosSlides: true })).toContain("MESMA posição");
    expect(instrucaoDoLogo({ variosSlides: false })).not.toContain("MESMA posição");
  });
  it("com referências de estilo, proíbe copiar o logo delas (era a origem do logo duplicado)", () => {
    expect(instrucaoDoLogo({ temRefsDeEstilo: true })).toContain("NÃO copie de lá");
    expect(instrucaoDoLogo({ temRefsDeEstilo: false })).not.toContain("NÃO copie de lá");
  });
  it("não reserva mais canto vazio nem fala em logo aplicado depois", () => {
    const t = instrucaoDoLogo({ posicaoPreferida: "top-right", variosSlides: true, temRefsDeEstilo: true });
    expect(t).not.toMatch(/ÁREA RESERVADA|aplicado ali depois/);
  });
});

describe("peça sem logo (opção da marca ou do pedido)", () => {
  const marca = { logo_url: LOGO, creation_mode: "style_copy" };
  it("marca com logo_na_imagem=false não assina, e o arquivo do logo continua lá", () => {
    const m = { ...marca, visual_preferences: { logo_na_imagem: false } };
    expect(assinaComLogo(m)).toBe(false);
    expect(dispensaLogo(m)).toBe(true);
    expect(m.logo_url).toBe(LOGO);
  });
  it("pedido avulso sem_logo vence a marca que normalmente assina", () => {
    expect(assinaComLogo(marca, true)).toBe(false);
    expect(dispensaLogo(marca, true)).toBe(true);
  });
  it("sem opção nenhuma, ou com a opção ausente/true, continua assinando", () => {
    expect(assinaComLogo(marca)).toBe(true);
    expect(assinaComLogo({ ...marca, visual_preferences: { logo_na_imagem: null } })).toBe(true);
    expect(assinaComLogo({ ...marca, visual_preferences: { logo_na_imagem: true } })).toBe(true);
    expect(dispensaLogo(marca)).toBe(false);
    expect(dispensaLogo(null)).toBe(false);
  });
  it("a instrução proíbe o logo e proíbe copiar das referências", () => {
    const t = instrucaoSemLogo();
    expect(t).toContain("SEM LOGO NESTA PEÇA");
    expect(t).toContain("NÃO copie");
  });
});
