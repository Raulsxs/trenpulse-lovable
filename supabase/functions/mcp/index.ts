/**
 * mcp — servidor MCP do TrendPulse (Streamable HTTP), para Claude e Codex.
 *
 * Arquitetura completa em docs/arquitetura/mcp-trendpulse.md. O essencial:
 *
 * NÃO É UMA API PARALELA. Ele expõe o MESMO catálogo de `_shared/agent-tools.ts` que o agente
 * interno do app já usa. Tool nova nasce nas duas superfícies de uma vez; correção de bug vale pras
 * duas. Reimplementar agendar/gerar/publicar aqui criaria um segundo caminho de código que diverge
 * do app na primeira mudança — em cima de cobrança e publicação, que é onde erro custa dinheiro.
 *
 * AUTENTICAÇÃO em duas etapas, e a segunda é o pulo do gato:
 *   1. `Authorization: Bearer tp_pat_...` → verify_api_token → user_id + escopos.
 *   2. PAT → JWT REAL do usuário (admin/generate_link + verify). As tools dependem de RLS pra
 *      isolamento, e PAT não é JWT. A alternativa (service_role + filtrar user_id na mão em 24
 *      tools) trocaria isolamento garantido pelo banco por disciplina de código.
 *
 * TRANSPORTE: responde `application/json` no POST, que a spec permite explicitamente ("the server
 * MUST either return Content-Type: text/event-stream, or application/json"). Sem SSE e sem
 * Mcp-Session-Id: o servidor é sem estado, então não há mensagem iniciada por servidor pra
 * transportar. GET devolve 405, como a spec manda pra quem não oferece stream.
 *
 * verify_jwt = false no config.toml — a autenticação aqui é o PAT, não JWT do Supabase.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AGENT_TOOLS, dispatchTool, type ToolCtx } from "../_shared/agent-tools.ts";

const PROTOCOL_VERSION = "2025-06-18";
// A spec manda assumir esta quando o cliente não envia o header MCP-Protocol-Version.
const VERSOES_ACEITAS = new Set([PROTOCOL_VERSION, "2025-03-26", "2024-11-05"]);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, mcp-protocol-version, mcp-session-id, accept",
  "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
  "Access-Control-Expose-Headers": "mcp-session-id",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

/**
 * CATÁLOGO EXPOSTO. Deliberadamente um subconjunto das 24 tools do agente.
 *
 * Expor tudo seria ruído: o Claude escolhe pior com 24 opções, e metade delas (editar_slide,
 * mostrar_conteudo, listar_agenda…) só faz sentido dentro do chat do app, com a UI ao lado.
 * Aqui ficam as que resolvem o caso real — criar conteúdo e organizar o calendário de fora.
 *
 * Cada tool declara o ESCOPO que exige. Token sem o escopo nem vê a tool no tools/list — melhor que
 * mostrar e recusar na chamada, porque o agente não perde turno tentando.
 */
const CATALOGO: Record<string, { escopo: string }> = {
  consultar_saldo: { escopo: "read" },
  detalhes_conteudo: { escopo: "read" },
  listar_agenda: { escopo: "read" },
  listar_conexoes: { escopo: "read" },
  gerar_post: { escopo: "generate" },
  gerar_carrossel: { escopo: "generate" },
  gerar_story: { escopo: "generate" },
  gerar_tweet_card: { escopo: "generate" },
  link_para_post: { escopo: "generate" },
  adaptar_para_rede: { escopo: "generate" },
  agendar_conteudo: { escopo: "schedule" },
  planejar_calendario: { escopo: "schedule" },
};

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extra },
  });

const rpcErro = (id: unknown, code: number, message: string) =>
  json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

/**
 * Troca PAT por sessão real do usuário. Caminho oficial do Supabase, validado em produção:
 * generate_link devolve um hashed_token de uso único; verify troca por access_token.
 *
 * CACHE POR ISOLATE: o JWT vale 3600s. Sem cache seria uma troca (duas chamadas HTTP) por
 * ferramenta chamada — o agente costuma encadear várias no mesmo turno.
 */
const cacheSessao = new Map<string, { jwt: string; expira: number }>();

async function jwtDoUsuario(userId: string): Promise<string | null> {
  const emCache = cacheSessao.get(userId);
  if (emCache && emCache.expira > Date.now()) return emCache.jwt;

  const svc = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: u } = await svc.auth.admin.getUserById(userId);
  const email = u?.user?.email;
  if (!email) return null;

  const linkRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", email }),
  });
  const link = await linkRes.json();
  if (!link?.hashed_token) return null;

  const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }),
  });
  const sess = await verifyRes.json();
  if (!sess?.access_token) return null;

  // Margem de 5 min: melhor renovar cedo que estourar no meio de uma chamada.
  cacheSessao.set(userId, { jwt: sess.access_token, expira: Date.now() + 55 * 60 * 1000 });
  return sess.access_token;
}

interface Autenticado { userId: string; scopes: string[] }

async function autenticar(req: Request): Promise<Autenticado | null> {
  const header = req.headers.get("Authorization") || "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token.startsWith("tp_pat_")) return null;

  const svc = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data, error } = await svc.rpc("verify_api_token", { p_token: token });
  if (error || !data || data.length === 0) return null;
  return { userId: data[0].user_id, scopes: data[0].scopes || [] };
}

/** Tools visíveis pra este token, já no formato MCP (`inputSchema`, não `input_schema`). */
function toolsVisiveis(scopes: string[]) {
  return (AGENT_TOOLS as any[])
    .filter((t) => {
      const entrada = CATALOGO[t.name];
      return entrada && scopes.includes(entrada.escopo);
    })
    .map((t) => ({ name: t.name, description: t.description, inputSchema: t.input_schema }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Sem stream iniciado por servidor: a spec manda 405 pra quem não oferece SSE no GET.
  if (req.method === "GET") return new Response("SSE não oferecido neste endpoint", { status: 405, headers: corsHeaders });
  // Servidor sem estado: não há sessão pra encerrar.
  if (req.method === "DELETE") return new Response(null, { status: 405, headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });

  // Versão inválida é 400 por exigência da spec — falhar claro é melhor que negociar errado.
  const versao = req.headers.get("mcp-protocol-version");
  if (versao && !VERSOES_ACEITAS.has(versao)) {
    return json({ error: `Versão de protocolo não suportada: ${versao}` }, 400);
  }

  let msg: any;
  try { msg = await req.json(); } catch { return rpcErro(null, -32700, "JSON inválido"); }

  const { id, method, params } = msg || {};

  // Notificações e respostas não têm `id` e não geram resposta: 202 sem corpo, como a spec pede.
  if (id === undefined || id === null) return new Response(null, { status: 202, headers: corsHeaders });

  // `initialize` responde ANTES de exigir credencial: o cliente precisa conseguir descobrir o
  // servidor e mostrar erro de auth com contexto, em vez de um 401 seco no handshake.
  if (method === "initialize") {
    const pedida = params?.protocolVersion;
    return json({
      jsonrpc: "2.0", id,
      result: {
        protocolVersion: VERSOES_ACEITAS.has(pedida) ? pedida : PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "trendpulse", title: "TrendPulse", version: "0.1.0" },
        instructions:
          "Gera e agenda conteúdo de rede social no TrendPulse, com a identidade visual da marca do usuário. " +
          "Antes de gerar, chame listar_conexoes para saber quais redes estão conectadas, e consultar_saldo " +
          "para conferir crédito — geração cobra crédito e falha sem saldo. O `tema` das ferramentas de " +
          "geração é o ASSUNTO do conteúdo, nunca uma instrução ou referência como 'o post acima'.",
      },
    });
  }

  if (method === "ping") return json({ jsonrpc: "2.0", id, result: {} });

  const auth = await autenticar(req);
  if (!auth) {
    return rpcErro(id, -32001, "Token inválido, revogado ou expirado. Gere um novo em trendpulse.com.br → Perfil.");
  }

  if (method === "tools/list") {
    return json({ jsonrpc: "2.0", id, result: { tools: toolsVisiveis(auth.scopes) } });
  }

  if (method === "tools/call") {
    const nome = params?.name;
    const entrada = CATALOGO[nome];
    if (!entrada) return rpcErro(id, -32602, `Ferramenta desconhecida: ${nome}`);
    if (!auth.scopes.includes(entrada.escopo)) {
      return rpcErro(id, -32001, `Este token não tem o escopo "${entrada.escopo}", exigido por ${nome}.`);
    }

    const jwt = await jwtDoUsuario(auth.userId);
    if (!jwt) return rpcErro(id, -32603, "Não consegui abrir sessão para este usuário.");

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });

    const ctx: ToolCtx = {
      supabaseUrl: SUPABASE_URL,
      anonKey: ANON_KEY,
      userAuthHeader: `Bearer ${jwt}`,
      userClient,
      anthropicKey: Deno.env.get("ANTHROPIC_API_KEY") || "",
      userId: auth.userId,
    };

    try {
      const r = await dispatchTool(ctx, nome, params?.arguments || {});
      // isError sinaliza falha DA FERRAMENTA (saldo insuficiente, marca inexistente) — o agente lê o
      // texto e se corrige. Erro de protocolo é outra coisa e vai como JSON-RPC error.
      return json({
        jsonrpc: "2.0", id,
        result: { content: [{ type: "text", text: r.content }], isError: !r.ok },
      });
    } catch (e: any) {
      console.error(`[mcp] ${nome} falhou:`, e?.message);
      return json({
        jsonrpc: "2.0", id,
        result: { content: [{ type: "text", text: `Erro ao executar ${nome}: ${e?.message || "desconhecido"}` }], isError: true },
      });
    }
  }

  return rpcErro(id, -32601, `Método não suportado: ${method}`);
});
