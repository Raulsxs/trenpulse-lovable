// Logo da marca INTEGRADO pela IA — substitui o carimbo por cima (logo-overlay, removido em 2026-10-09).
//
// O carimbo colava o PNG do logo num canto fixo da imagem pronta, sem olhar o que havia ali. Na prática:
//   - logo claro sobre card escuro virava uma caixa colada em arte de fundo claro;
//   - o modelo ignorava a "área reservada" e desenhava rodapé/decoração no canto → carimbo atropelava;
//   - o modelo copiava o logo das referências de estilo → dois logos, um cortando o outro.
// Agora o arquivo real do logo vai como a ÚLTIMA imagem de referência e o modelo o compõe dentro do
// layout. O risco conhecido é o logo variar entre slides (o motivo original do carimbo): por isso a
// instrução fixa posição e tamanho e proíbe redesenhar.

const POSICAO_PTBR: Record<string, string> = {
  "top-right": "no canto superior direito", "top-left": "no canto superior esquerdo",
  "bottom-right": "no canto inferior direito", "bottom-left": "no canto inferior esquerdo",
  "top-center": "no topo, centralizado", "bottom-center": "na base, centralizado",
};

/** Marca com logo que a IA deve assinar. Foto pessoal como fundo (photo_backgrounds) fica de fora. */
export function assinaComLogo(brand: { logo_url?: string | null; creation_mode?: string | null } | null | undefined): boolean {
  return !!brand?.logo_url && /^https?:\/\//.test(brand.logo_url) && brand.creation_mode !== "photo_backgrounds";
}

/**
 * Referências enviadas ao modelo: as de estilo e, por ÚLTIMO, o logo. A posição importa — a instrução
 * aponta para "a última imagem". Respeita o teto do provedor cortando referência de estilo, nunca o logo.
 */
export function refsComLogo(refsDeEstilo: string[], logoUrl: string, max = 6): string[] {
  const estilo = refsDeEstilo.filter((u) => u && u !== logoUrl).slice(0, Math.max(0, max - 1));
  return [...estilo, logoUrl];
}

/** Trecho de prompt que manda o modelo assinar a peça com o logo anexado. */
export function instrucaoDoLogo(opts: { posicaoPreferida?: string | null; variosSlides?: boolean; temRefsDeEstilo?: boolean }): string {
  const onde = POSICAO_PTBR[opts.posicaoPreferida || ""];
  const lugar = onde
    ? `Posição: ${onde}, alinhado às margens do layout. Se o layout tiver rodapé ou faixa de assinatura, o logo vai DENTRO dela, nesse mesmo lado.`
    : `Posição: o lugar de assinatura do layout (rodapé ou um canto livre), alinhado às margens.`;
  const linhas = [
    `LOGO OFICIAL DA MARCA — a ÚLTIMA imagem anexada é o arquivo do logo. Ela NÃO é referência de estilo, cor ou composição: é a assinatura da peça.`,
    `- Reproduza o logo FIELMENTE: mesmo símbolo, mesmas letras, mesmas proporções e cores. Não redesenhe, não simplifique, não traduza, não troque a fonte.`,
    `- Ele aparece UMA única vez. ${lugar}`,
    `- Tamanho discreto: cerca de 12% a 16% da largura da imagem. É assinatura, não é o destaque.`,
    `- O fundo do arquivo NÃO faz parte do logo: não desenhe caixa, card nem retângulo atrás dele. Aplique o logo direto sobre o fundo da peça, numa área com contraste suficiente para ele ficar legível (logo claro pede área escura; logo escuro pede área clara).`,
    `- Nada pode encostar ou passar por cima do logo: nenhum texto, ícone ou elemento decorativo.`,
  ];
  if (opts.temRefsDeEstilo) {
    linhas.push(`- Se as referências de estilo mostrarem um logo ou nome de marca, NÃO copie de lá: o único logo da peça é o da última imagem.`);
  }
  if (opts.variosSlides) {
    linhas.push(`- Esta peça tem vários slides: o logo fica na MESMA posição e no MESMO tamanho em todos eles.`);
  }
  linhas.push(`- Esta regra vale acima de qualquer instrução anterior que proíba logotipos: ela se refere a logos de terceiros. Se você não recebeu a imagem do logo, não desenhe nem invente logo nenhum.`);
  return linhas.join("\n");
}
