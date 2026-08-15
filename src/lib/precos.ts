/**
 * FONTE ÚNICA de preço para todas as telas públicas.
 *
 * POR QUE ISTO EXISTE: a /pricing anunciava valores DIFERENTES dos que o sistema cobra. A tabela
 * public.credit_pricing (que o spend_credits consulta de verdade) dizia post=10, story=25,
 * tweet_card=6; a página dizia 8, 20 e 2. O tweet card era anunciado por um terço do preço real.
 *
 * Isso é preço divulgado diferente do praticado — problema de confiança e de CDC, não de layout.
 * A causa era a lista estar escrita à mão dentro do componente, sem nada ligando ela ao banco.
 *
 * REGRA DE MANUTENÇÃO: ao mexer em public.credit_pricing, atualizar AQUI e só aqui. Toda tela
 * pública importa deste arquivo. Conferência rápida:
 *
 *     select action, credits from public.credit_pricing order by action;
 *
 * Última conferência contra o banco: 2026-08-12.
 */

export interface CustoFormato {
  /** Chave em public.credit_pricing — serve para conferir contra o banco. */
  action: string;
  label: string;
  credits: number;
  /** O que a pessoa recebe, em português de gente. */
  detalhe: string;
}

/** Custos por formato, conferidos contra public.credit_pricing. */
export const CUSTOS: CustoFormato[] = [
  { action: "post", label: "Post com imagem", credits: 10, detalhe: "Imagem + legenda pronta pra publicar" },
  { action: "carousel_slide", label: "Carrossel", credits: 10, detalhe: "Por slide, com fio narrativo entre eles" },
  { action: "editorial_slide", label: "Carrossel editorial", credits: 5, detalhe: "Por slide, texto sobre foto" },
  { action: "story", label: "Story 9:16", credits: 25, detalhe: "Vertical, modelo premium" },
  { action: "tweet_card", label: "Carrossel de tweet card", credits: 6, detalhe: "Print de tweet, em série" },
  { action: "free_image", label: "Imagem livre", credits: 10, detalhe: "Geração crua, sem estrutura de post" },
];

export interface PacoteCreditos {
  nome: string;
  precoReais: number;
  creditos: number;
  bonus?: string;
  destaque?: boolean;
}

export const PACOTES: PacoteCreditos[] = [
  { nome: "Inicial", precoReais: 50, creditos: 500 },
  { nome: "Popular", precoReais: 100, creditos: 1050, bonus: "+5% de bônus", destaque: true },
  { nome: "Pro", precoReais: 200, creditos: 2200, bonus: "+10% de bônus" },
];

/** Créditos que toda conta nova ganha (trigger handle_new_user → grant_welcome_credits). */
export const CREDITOS_DE_BOAS_VINDAS = 50;

const custo = (action: string): number =>
  CUSTOS.find((c) => c.action === action)?.credits ?? 0;

/**
 * Quantos posts cabem num pacote. Usado para traduzir crédito em algo que a pessoa entende —
 * "500 créditos" não diz nada, "50 posts" diz.
 */
export const postsPorPacote = (p: PacoteCreditos): number =>
  Math.floor(p.creditos / custo("post"));

/** Idem para carrossel, assumindo o tamanho mais comum. */
export const carrosseisPorPacote = (p: PacoteCreditos, slides = 5): number =>
  Math.floor(p.creditos / (custo("carousel_slide") * slides));
