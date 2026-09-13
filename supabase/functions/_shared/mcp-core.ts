/**
 * Núcleo PURO do servidor MCP — sem Deno, sem rede, sem banco. Existe separado do index.ts para ser
 * testável em Vitest: as regras que decidem se uma chamada é segura (escopo, fila, validade de
 * sessão) não podem depender de subir uma edge function para serem verificadas.
 */

/**
 * Ferramentas que GERAM conteúdo e levam de 1 a 2 minutos. Vão para a fila, não rodam na chamada.
 *
 * POR QUE: medido em 2026-09-13, um `gerar_post` pelo MCP levou 75,8 s. O Codex corta chamada de
 * ferramenta em 60 s por padrão (`tool_timeout_sec`), e o Claude Desktop tem o mesmo corte de ~60 s.
 * Ou seja: a peça era gerada e cobrada, e o agente recebia timeout — e tentava de novo, gerando e
 * cobrando outra vez.
 *
 * Documentar "aumente o timeout" empurraria o conserto para cada cliente, e o Desktop nem respeita a
 * configuração. Responder na hora com um id e deixar a geração na fila tira o problema do caminho.
 *
 * Critério para entrar aqui: a ferramenta chama o ai-chat (geração de imagem). As que só leem ou
 * reescrevem texto ficam síncronas.
 */
export const FERRAMENTAS_LENTAS = new Set([
  "gerar_post",
  "gerar_carrossel",
  "gerar_story",
  "gerar_tweet_card",
  "link_para_post",
]);

/** Ferramenta que só existe no MCP: acompanha um job enfileirado por uma ferramenta lenta. */
export const TOOL_ACOMPANHAR = {
  name: "acompanhar_geracao",
  description:
    "Consulta o andamento de uma geração enfileirada (post, carrossel, story, tweet card, link para post). " +
    "As ferramentas de geração respondem na hora com um job_id e a peça fica pronta em 1 a 2 minutos. " +
    "Chame esta ferramenta com o job_id para saber se terminou e obter o content_id. Se ainda estiver " +
    "em andamento, espere uns 20 segundos antes de chamar de novo — não gere a peça outra vez.",
  inputSchema: {
    type: "object",
    properties: { job_id: { type: "string", description: "O job_id devolvido pela ferramenta de geração." } },
    required: ["job_id"],
  },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ehUuid = (s: unknown): s is string => typeof s === "string" && UUID.test(s);

/**
 * Ferramenta só do MCP: prepara o envio de uma imagem que está NO COMPUTADOR de quem usa o agente.
 *
 * POR QUE EXISTE: `agendar_arte` aceita URL ou base64, e base64 não funciona na prática. Medido em
 * 2026-09-13: uma arte real de 537 KB vira 734 mil caracteres de base64, ~183 mil tokens que o agente
 * teria de ESCREVER dentro de uma chamada de ferramenta. Não cabe. Então o caso central — "criei a
 * arte no Claude/Codex, joga no calendário" — só funcionava se a arte já estivesse numa URL pública.
 *
 * Com isto: o servidor emite uma URL de upload ASSINADA (vale para um único caminho, dentro da pasta
 * do usuário, e expira), o agente sobe o arquivo com curl pelo terminal dele e passa a URL pública ao
 * agendar_arte. O arquivo nunca passa pelo contexto do modelo.
 *
 * Limite honesto: exige terminal. Claude Code e Codex têm; o Claude Desktop sem ferramenta de arquivo
 * não — lá a imagem precisa estar numa URL pública.
 */
export const TOOL_PREPARAR_ENVIO = {
  name: "preparar_envio_imagem",
  description:
    "Prepara o envio de uma imagem que está NO COMPUTADOR (arte criada no Claude, no Codex, num editor) " +
    "para depois agendá-la. Devolve um comando curl que sobe o arquivo e a URL pública que ele vai ter. " +
    "Fluxo: 1) chame esta ferramenta com o nome do arquivo; 2) rode o comando no terminal, trocando " +
    "CAMINHO_DO_ARQUIVO pelo caminho real; 3) chame agendar_arte com imagem = a URL pública devolvida. " +
    "Use isto em vez de base64 — uma arte real tem centenas de milhares de caracteres e não cabe numa " +
    "chamada. Se a imagem já está numa URL pública, pule esta ferramenta. Uma chamada por arquivo.",
  inputSchema: {
    type: "object",
    properties: {
      nome_arquivo: {
        type: "string",
        description: "Nome do arquivo com extensão, ex.: arte-segunda.png. Aceita png, jpg, jpeg e webp.",
      },
    },
    required: ["nome_arquivo"],
  },
};

/** Extensão aceita a partir do nome do arquivo. Qualquer outra coisa é recusada. */
export function extensaoImagem(nome: string): "png" | "jpg" | "webp" | null {
  const m = /\.([a-z0-9]+)\s*$/i.exec(String(nome || ""));
  if (!m) return null;
  const e = m[1].toLowerCase();
  if (e === "png") return "png";
  if (e === "jpg" || e === "jpeg") return "jpg";
  if (e === "webp") return "webp";
  return null;
}

export const mimeDaExtensao = (ext: "png" | "jpg" | "webp"): string =>
  ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";

/**
 * Caminho do upload. Gerado pelo SERVIDOR, sempre dentro de `mcp/<userId>/`: quem escolhe onde o
 * arquivo cai não é o agente — senão uma URL assinada poderia sobrescrever arquivo de outra conta.
 */
export function caminhoEnvio(
  userId: string, ext: "png" | "jpg" | "webp", agora = Date.now(), sufixo = Math.random().toString(36).slice(2, 10),
): string {
  if (!ehUuid(userId)) throw new Error("userId inválido");
  const limpo = String(sufixo).replace(/[^a-z0-9]/gi, "").slice(0, 16) || "x";
  return `mcp/${userId}/envio-${agora}-${limpo}.${ext}`;
}

/**
 * Monta o pedido que o worker da fila entrega ao agente headless.
 *
 * O worker roda o MESMO agente do app, que decide qual ferramenta chamar. Quem pediu aqui já é um
 * agente (Claude/Codex) que decidiu com o usuário — então o texto é uma ordem explícita, com os
 * argumentos em JSON, e proíbe perguntas. Sem isso o agente headless podia "conversar" em vez de
 * gerar, e o job terminava sem peça.
 */
export function promptDoJob(nome: string, args: Record<string, unknown>): string {
  // brandId e modelo viajam como colunas do job (o worker os aplica como seleção do usuário);
  // repetidos no texto, o agente poderia tratá-los como sugestão e trocar.
  const { brandId: _b, modelo: _m, ...resto } = args || {};
  const argumentos = JSON.stringify(resto).slice(0, 2000);
  return (
    `Execute exatamente UMA chamada da ferramenta ${nome} com estes argumentos: ${argumentos}. ` +
    `Não faça perguntas e não gere nada além disso: o pedido veio de um agente externo que já ` +
    `decidiu com o usuário.`
  );
}

/** Colunas extras do job, vindas dos argumentos da ferramenta. Só aceita o que tem forma válida. */
export function colunasDoJob(args: Record<string, unknown>): { brand_id: string | null; model: string | null } {
  return {
    brand_id: ehUuid(args?.brandId) ? args.brandId : null,
    model: typeof args?.modelo === "string" && args.modelo.length <= 40 ? args.modelo : null,
  };
}

/** Título curto do job, como a fila do app já mostra. */
export function tituloDoJob(nome: string, args: Record<string, unknown>): string {
  const tema = String(args?.tema || args?.url || nome);
  const rotulo = nome.replace(/_/g, " ");
  const t = `${rotulo}: ${tema}`;
  return t.length > 60 ? t.slice(0, 57) + "…" : t;
}

/**
 * A sessão guardada ainda serve? Margem de 5 min: melhor renovar antes que estourar no meio de uma
 * geração de 2 minutos com um JWT que expirou no caminho.
 */
export function sessaoAindaValida(expiraEm: string | number | null | undefined, agora = Date.now(), margemMs = 5 * 60 * 1000): boolean {
  if (expiraEm === null || expiraEm === undefined || expiraEm === "") return false;
  const t = typeof expiraEm === "number" ? expiraEm : Date.parse(expiraEm);
  if (!Number.isFinite(t)) return false;
  return t - margemMs > agora;
}

export interface JobResumo {
  id: string;
  status: string;
  content_id: string | null;
  error: string | null;
  created_at?: string | null;
}

/** O que o agente lê ao acompanhar um job. Cada estado diz o PRÓXIMO PASSO, não só o estado. */
export function textoDoJob(job: JobResumo | null): { ok: boolean; texto: string } {
  if (!job) return { ok: false, texto: "Job não encontrado. Confira o job_id — ele só é visível para a conta que criou." };
  switch (job.status) {
    case "queued":
      return { ok: true, texto: `Na fila (job_id=${job.id}). Espere uns 20 segundos e chame acompanhar_geracao de novo.` };
    case "processing":
      return { ok: true, texto: `Gerando agora (job_id=${job.id}). Costuma levar 1 a 2 minutos. Espere uns 20 segundos e consulte de novo — não peça a peça outra vez.` };
    case "done":
      return job.content_id
        ? { ok: true, texto: `Pronto: content_id=${job.content_id}. Use detalhes_conteudo para ver a peça ou agendar_conteudo para colocá-la no calendário.` }
        : { ok: false, texto: `O job terminou sem registrar a peça (job_id=${job.id}). Gere de novo.` };
    case "failed":
      return { ok: false, texto: `A geração falhou: ${job.error || "motivo não registrado"}. Ajuste o pedido e gere de novo.` };
    case "needs_review":
      return { ok: false, texto: `A geração parou pedindo confirmação no app: ${job.error || ""}. Abra o TrendPulse para concluir.` };
    case "canceled":
      return { ok: false, texto: "Este job foi cancelado." };
    default:
      return { ok: false, texto: `Estado desconhecido: ${job.status}.` };
  }
}

/**
 * Ferramentas visíveis para um token, já no formato MCP (`inputSchema`, não `input_schema`).
 * Ferramenta fora do escopo NEM APARECE — o agente não gasta turno tentando o que vai ser recusado.
 */
export function toolsVisiveis(
  agentTools: Array<{ name: string; description?: string; input_schema?: unknown }>,
  catalogo: Record<string, { escopo: string }>,
  scopes: string[],
): Array<{ name: string; description?: string; inputSchema: unknown }> {
  const lista = agentTools
    .filter((t) => catalogo[t.name] && scopes.includes(catalogo[t.name].escopo))
    .map((t) => ({
      name: t.name,
      // Nas lentas, o agente precisa saber ANTES de chamar que a resposta é um job, não a peça.
      description: FERRAMENTAS_LENTAS.has(t.name)
        ? `${t.description || ""} RESPONDE NA HORA COM UM job_id — a peça fica pronta em 1 a 2 minutos; acompanhe com acompanhar_geracao.`
        : t.description,
      inputSchema: t.input_schema ?? { type: "object", properties: {} },
    }));
  // Quem pode gerar precisa poder acompanhar; senão receberia um job_id sem ter como usá-lo.
  if (scopes.includes("generate")) lista.push(TOOL_ACOMPANHAR);
  // Quem pode agendar precisa conseguir mandar a arte do próprio computador — é o caso central.
  if (scopes.includes("schedule")) lista.push(TOOL_PREPARAR_ENVIO);
  return lista;
}
