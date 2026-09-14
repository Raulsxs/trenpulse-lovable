/**
 * Fotos pessoais de marca — o que conta como foto VÁLIDA para a frase com foto.
 *
 * POR QUE EXISTE: parte das fotos cadastradas aponta para o projeto Supabase antigo (da época do
 * Lovable), cujo domínio não existe mais. Em 2026-09-14, 4 das 5 fotos de fundo do sistema estavam
 * assim — inclusive a única do Maikon, e por isso as frases dele saíam sem a foto. A foto continua
 * listada na marca, mas não carrega em lugar nenhum.
 *
 * O backend (ai-chat) aplica a MESMA regra ao escolher a foto. Aqui ela serve para o atalho "Frase"
 * não escolher uma marca cujas fotos estão todas mortas.
 */

/** Endereço do projeto atual — tem que bater com SUPABASE_URL em src/integrations/supabase/client.ts. */
export const PROJETO_SUPABASE = "https://qdmhqxpazffmaxleyzxs.supabase.co";

export const fotoValida = (url: unknown): boolean =>
  typeof url === "string" && url.startsWith(`${PROJETO_SUPABASE}/`);

export interface MarcaResumo {
  id: string;
  name: string;
  creation_mode?: string | null;
}

/**
 * Qual marca o atalho "Frase" deve usar: entre as de fotos pessoais, a atual se tiver foto válida;
 * senão a que tiver MAIS fotos válidas. Devolve também quantas fotos ela tem (0 = precisa cadastrar).
 */
export function escolherMarcaDeFotos(
  marcas: MarcaResumo[],
  fotos: { brand_id: string; image_url: string }[],
  marcaAtual: string,
): { marca: MarcaResumo; fotos: number } | null {
  const deFotos = marcas.filter((m) => m.creation_mode === "photo_backgrounds");
  if (deFotos.length === 0) return null;
  const contagem = new Map<string, number>();
  for (const f of fotos) {
    if (fotoValida(f.image_url)) contagem.set(f.brand_id, (contagem.get(f.brand_id) || 0) + 1);
  }
  const atual = deFotos.find((m) => m.id === marcaAtual && (contagem.get(m.id) || 0) > 0);
  const marca = atual ?? [...deFotos].sort((a, b) => (contagem.get(b.id) || 0) - (contagem.get(a.id) || 0))[0];
  return { marca, fotos: contagem.get(marca.id) || 0 };
}
