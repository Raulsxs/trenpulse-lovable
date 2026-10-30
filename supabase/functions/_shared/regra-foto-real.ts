// regra-foto-real.ts — a regra que vai em todo prompt de imagem do TrendPulse.
//
// POR QUE EXISTE (30/10/2026, decisão do Raul): desde hoje o TrendPulse tira o metadado C2PA ("gerado por
// IA") de toda imagem antes de publicar, inclusive de foto realista (_shared/sem-metadado.ts). Sem o selo,
// uma foto realista de pessoa real ou de um fato real passaria por registro verdadeiro. Por isso o gerador
// não produz esse tipo de imagem. A exceção é a própria pessoa das fotos de referência que o dono da conta
// enviou (modo photo_backgrounds): é ele mesmo, com a imagem dele e por pedido dele.
export const REGRA_FOTO_REAL = `PROIBIDO ABSOLUTO — PESSOA REAL E FATO REAL: não gere imagem realista (fotografia ou aparência de foto) de pessoa real identificável — figura pública, político, celebridade, atleta, cliente, funcionário ou qualquer pessoa citada pelo nome — nem de acontecimento real (notícia, evento, acidente, protesto, desastre, cena de jornal) como se fosse um registro verdadeiro. Para falar de uma pessoa ou de um fato, use arte gráfica, ilustração estilizada, ícones, tipografia ou pessoas genéricas fictícias que não se pareçam com ninguém. Única exceção: a pessoa que aparece nas fotos de referência enviadas pelo dono da conta, que pode aparecer como nas referências.`;
