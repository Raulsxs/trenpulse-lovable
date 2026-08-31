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
  /** Preço PADRÃO: o que o fluxo de chat cobra quando ninguém escolhe modelo. */
  credits: number;
  /** O que a pessoa recebe, em português de gente. */
  detalhe: string;
  /**
   * Preenchido quando o preço MUDA conforme o modelo de imagem escolhido no Studio.
   * `min` é o modelo mais barato que entrega aquele formato; a nota nomeia os dois extremos.
   */
  variaPorModelo?: { min: number; nota: string };
}

/**
 * Custos por formato, conferidos contra public.credit_pricing.
 *
 * ⚠️ ESTE NÚMERO É O PADRÃO, NÃO O PREÇO FIXO. Em ai-chat/index.ts:1294 a cobrança é
 * `modelCostAction || (format === "story" ? "story" : "post")` — ou seja, **o modelo escolhido no
 * Studio VENCE o preço por formato**. Quem gera pelo chat paga o padrão abaixo; quem escolhe modelo
 * na estante paga o preço do modelo (`img_*` em credit_pricing):
 *
 *     Imagen 4 Fast 4 · Reve 4 · Ideogram 5 · Seedream 5 · Flux 6 · Qwen 6 · Recraft 6
 *     GPT-Image 2 10 · Nano Banana Pro 25
 *
 * Anunciar "Story 25" sem dizer isso é anunciar o TETO como se fosse o preço: o mesmo story sai por
 * 10 no GPT-Image 2. É a mesma classe de problema do preço divulgado ≠ praticado — por isso o campo
 * `variaPorModelo` existe, e as telas públicas são obrigadas a mostrar a faixa, não só o padrão.
 */
export const CUSTOS: CustoFormato[] = [
  { action: "post", label: "Post com imagem", credits: 10, detalhe: "Imagem + legenda pronta pra publicar",
    variaPorModelo: { min: 4, nota: "4 no Imagen 4 Fast · 10 no GPT-Image 2 · 25 no Nano Banana Pro" } },
  { action: "carousel_slide", label: "Carrossel", credits: 10, detalhe: "Por slide, com fio narrativo entre eles" },
  { action: "editorial_slide", label: "Carrossel editorial", credits: 5, detalhe: "Por slide, texto sobre foto" },
  { action: "story", label: "Story 9:16", credits: 25, detalhe: "Vertical, formato de tela cheia",
    variaPorModelo: { min: 10, nota: "10 no GPT-Image 2 · 25 no Nano Banana Pro, o premium pra 9:16" } },
  { action: "tweet_card", label: "Carrossel de tweet card", credits: 6, detalhe: "Print de tweet, em série" },
  { action: "free_image", label: "Imagem livre", credits: 10, detalhe: "Geração crua, sem estrutura de post",
    variaPorModelo: { min: 4, nota: "4 no Imagen 4 Fast · 25 no Nano Banana Pro" } },
];

export interface PacoteCreditos {
  nome: string;
  precoReais: number;
  creditos: number;
  bonus?: string;
  destaque?: boolean;
}

/**
 * PACOTES. O piso subiu de R$50 para R$100 em 2026-08-12, por dado de uso, não por palpite:
 * o consumo real medido em credit_ledger foi de 597 a 1.671 créditos por usuário/mês. O pacote de
 * 500 créditos acabava ANTES do fim do mês para quem usava de verdade, e a pessoa batia no saldo
 * zero no meio da rotina que a gente pede pra ela criar.
 *
 * A porta de entrada sem risco continua existindo, só que como TESTE e não como compra: toda conta
 * nova ganha 50 créditos, que dão 5 posts.
 *
 * ⚠️ ESTES VALORES PRECISAM BATER com PACKS em supabase/functions/create-credit-charge/index.ts —
 * é aquele arquivo que cobra. Divergir aqui e lá significa cobrar um valor e creditar outro.
 */
export const PACOTES: PacoteCreditos[] = [
  { nome: "Essencial", precoReais: 100, creditos: 1000, destaque: true },
  { nome: "Constante", precoReais: 200, creditos: 2200, bonus: "+10% de bônus" },
  { nome: "Estúdio", precoReais: 400, creditos: 4800, bonus: "+20% de bônus" },
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

/* ── Recorrência ──────────────────────────────────────────────────────────── */

export interface PlanoRecorrente {
  /** Chave em PLANOS de create-credit-charge — é ela que cobra. */
  id: string;
  nome: string;
  precoReais: number;
  /** Créditos do pacote avulso equivalente. */
  creditosBase: number;
  destaque?: boolean;
}

/**
 * BÔNUS DE RECORRÊNCIA: créditos a mais, todo mês, por assinar em vez de comprar avulso.
 * Vale igual em todos os planos de propósito — é um empurrão pra recorrência, não um degrau
 * de volume (esse já existe nos PACOTES, via +10% e +20%).
 */
export const BONUS_RECORRENCIA = 100;

/**
 * PLANOS RECORRENTES. Mesmos preços dos pacotes avulsos; o que muda é o bônus e o fato de
 * renovar sozinho.
 *
 * ⚠️ SÓ NO CARTÃO. Assinatura PIX no Asaas não cobra sozinha: ela gera um boleto/QR novo a cada
 * ciclo que a pessoa precisa pagar na mão — ou seja, não é recorrência de verdade do ponto de
 * vista de quem assina. Por isso a UI oferece recorrência apenas no cartão, e o PIX segue como
 * compra avulsa.
 *
 * ⚠️ ESTES VALORES PRECISAM BATER com PLANOS em supabase/functions/create-credit-charge/index.ts.
 */
export const PLANOS: PlanoRecorrente[] = [
  { id: "mensal-100", nome: "Essencial", precoReais: 100, creditosBase: 1000, destaque: true },
  { id: "mensal-200", nome: "Constante", precoReais: 200, creditosBase: 2200 },
  { id: "mensal-400", nome: "Estúdio", precoReais: 400, creditosBase: 4800 },
];

/** Créditos que caem por mês num plano: base do pacote + bônus de recorrência. */
export const creditosDoPlano = (p: PlanoRecorrente): number => p.creditosBase + BONUS_RECORRENCIA;

/** Quantos posts por mês o plano paga. */
export const postsPorPlano = (p: PlanoRecorrente): number =>
  Math.floor(creditosDoPlano(p) / custo("post"));
