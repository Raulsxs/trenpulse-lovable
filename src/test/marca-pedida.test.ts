import { describe, it, expect } from "vitest";
import { acharMarca, recusaDeMarca, linhaDaMarca } from "../../supabase/functions/_shared/marca-pedida.ts";

const PULSE = { id: "a17524a3-7b06-4165-95b5-c72964f4a06a", name: "Pulse ID linkedin" };
const PID = { id: "1f4cdab8-693d-4278-9b99-c6a0f426ac25", name: "PulseID" };
const OUTRA = { id: "7bbbf42b-4797-4feb-8f72-ce608d320f03", name: "Por que softwares travam" };
const LISTA = [PULSE, PID, OUTRA];

describe("acharMarca", () => {
  it("acha por id", () => expect(acharMarca(LISTA, PULSE.id)).toBe(PULSE));
  it("acha por nome exato, sem caixa", () => expect(acharMarca(LISTA, "pulse id linkedin")).toBe(PULSE));
  it("nome exato vence o 'contém' (PulseID também está contido em outros nomes?)", () => expect(acharMarca(LISTA, "PulseID")).toBe(PID));
  it("parte do nome com UMA candidata", () => expect(acharMarca(LISTA, "linkedin")).toBe(PULSE));
  it("parte do nome com várias candidatas é ambíguo: não adivinha", () => expect(acharMarca(LISTA, "pulse")).toBeNull());
  it("o @ da conta do Instagram não é marca (caso real de 14/10)", () => expect(acharMarca(LISTA, "pulseindata")).toBeNull());
  it("id bem formado de outra pessoa não vira palpite por nome", () => expect(acharMarca(LISTA, "00000000-0000-0000-0000-000000000000")).toBeNull());
  it("vazio não acha", () => expect(acharMarca(LISTA, "  ")).toBeNull());
});

describe("recusaDeMarca", () => {
  it("diz que nada foi gerado nem cobrado e lista as marcas com id", () => {
    const t = recusaDeMarca("pulseindata", LISTA);
    expect(t).toContain("NADA foi gerado e nada foi cobrado");
    expect(t).toContain(`Pulse ID linkedin → marca=${PULSE.id}`);
  });
  it("sem marcas cadastradas, orienta a omitir", () => expect(recusaDeMarca("x", [])).toContain("omita brandId"));
});

describe("linhaDaMarca", () => {
  it("mostra nome e id", () => expect(linhaDaMarca(PULSE)).toBe(`marca=Pulse ID linkedin (marca_id=${PULSE.id})`));
  it("sem marca vira aviso explícito", () => expect(linhaDaMarca(null)).toContain("marca=NENHUMA"));
});
