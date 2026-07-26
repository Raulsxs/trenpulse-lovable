// Fallback do CÉREBRO do agente quando a API da Anthropic falha (crédito zerado, 429, overload…).
// A Anthropic é o provider primário do loop de tool-calling do ai-agent (formato messages+tools
// nativo). O Replicate hospeda o MESMO Haiku, mas só no formato TEXTO (prompt/system_prompt) — sem
// tool-calling estruturado. Então aqui emulamos o tool-calling por um PROTOCOLO JSON manual (ReAct):
// o modelo responde OU um bloco JSON de ação OU a resposta final em texto. Parseamos e devolvemos
// no MESMO formato da Anthropic ({ content: blocks, stop_reason }) → o loop do ai-agent não muda.
//
// Não é tão afiado quanto o tool-calling nativo, mas mantém o agente DE PÉ numa queda da Anthropic
// em vez de derrubar o produto inteiro.

type Block = { type: string; [k: string]: any };
type Msg = { role: string; content: any };

const CLAUDE_REPLICATE_SLUG = "anthropic/claude-4.5-haiku";

// Reaproveita o padrão validado do ai-gateway: Prefer:wait + poll com timeout duro (nunca pendura).
async function callReplicateHaiku(system: string, prompt: string, maxTokens = 2048): Promise<string> {
  const token = Deno.env.get("REPLICATE_API_TOKEN");
  if (!token) throw new Error("REPLICATE_API_TOKEN ausente (fallback do agente indisponível)");
  const tfetch = (url: string, init: RequestInit, ms: number) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(t));
  };
  const res = await tfetch(`https://api.replicate.com/v1/models/${CLAUDE_REPLICATE_SLUG}/predictions`, {
    method: "POST",
    headers: { Authorization: `Token ${token}`, "Content-Type": "application/json", Prefer: "wait" },
    body: JSON.stringify({ input: { prompt, system_prompt: system, max_tokens: Math.min(maxTokens, 8192) } }),
  }, 40000);
  if (!res.ok) throw new Error(`Replicate Haiku HTTP ${res.status}: ${(await res.text()).slice(0, 150)}`);
  let pred = await res.json();
  const start = Date.now();
  while (pred.status && !["succeeded", "failed", "canceled"].includes(pred.status) && Date.now() - start < 40000) {
    await new Promise((r) => setTimeout(r, 1500));
    const pr = await tfetch(`https://api.replicate.com/v1/predictions/${pred.id}`, { headers: { Authorization: `Token ${token}` } }, 10000);
    if (!pr.ok) break;
    pred = await pr.json();
  }
  if (pred.status !== "succeeded") throw new Error(`Replicate Haiku status=${pred.status}`);
  return Array.isArray(pred.output) ? pred.output.join("") : String(pred.output ?? "");
}

// Renderiza o catálogo de ferramentas (nome + descrição + params) pro modelo saber o que existe.
function renderToolCatalog(tools: any[]): string {
  return tools.map((t) => {
    const props = t.input_schema?.properties || {};
    const params = Object.entries(props).map(([k, v]: [string, any]) => {
      const req = (t.input_schema?.required || []).includes(k) ? " (obrigatório)" : "";
      const enums = v.enum ? ` [${v.enum.join("|")}]` : "";
      return `    - ${k}${req}: ${v.description || v.type || ""}${enums}`;
    }).join("\n");
    return `• ${t.name}: ${t.description}\n${params}`;
  }).join("\n\n");
}

// Serializa o histórico Anthropic (com tool_use/tool_result) num transcript de texto que o Haiku lê.
function renderTranscript(messages: Msg[]): string {
  const lines: string[] = [];
  for (const m of messages) {
    const c = m.content;
    if (typeof c === "string") {
      lines.push(`${m.role === "user" ? "USUÁRIO" : "ASSISTENTE"}: ${c}`);
      continue;
    }
    if (!Array.isArray(c)) continue;
    for (const b of c) {
      if (b.type === "text" && b.text) lines.push(`${m.role === "user" ? "USUÁRIO" : "ASSISTENTE"}: ${b.text}`);
      else if (b.type === "tool_use") lines.push(`ASSISTENTE [chamou ferramenta]: ${b.name}(${JSON.stringify(b.input)})`);
      else if (b.type === "tool_result") {
        const txt = typeof b.content === "string" ? b.content : Array.isArray(b.content) ? b.content.map((x: any) => x.text || "").join(" ") : JSON.stringify(b.content);
        lines.push(`RESULTADO DA FERRAMENTA: ${txt}`);
      }
    }
  }
  return lines.join("\n");
}

// Extrai o primeiro objeto JSON com chave "tool" da resposta (tolerante: com/sem cerca ```json).
function parseToolAction(raw: string): { tool: string; input: any } | null {
  const fenced = raw.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  const candidates: string[] = [];
  if (fenced) candidates.push(fenced[1]);
  // também tenta o primeiro {...} balanceado que contenha "tool"
  const idx = raw.indexOf('"tool"');
  if (idx >= 0) {
    let s = raw.lastIndexOf("{", idx);
    if (s >= 0) {
      let depth = 0;
      for (let i = s; i < raw.length; i++) {
        if (raw[i] === "{") depth++;
        else if (raw[i] === "}") { depth--; if (depth === 0) { candidates.push(raw.slice(s, i + 1)); break; } }
      }
    }
  }
  for (const c of candidates) {
    try {
      const obj = JSON.parse(c);
      if (obj && typeof obj.tool === "string") return { tool: obj.tool, input: obj.input || {} };
    } catch { /* tenta o próximo candidato */ }
  }
  return null;
}

const genId = () => "toolu_" + (crypto.randomUUID?.() || String(Math.random())).replace(/-/g, "").slice(0, 22);

/**
 * Roda UM turno do agente via Replicate (fallback). Devolve no formato Anthropic:
 *   { content: [blocks], stop_reason }  — igual ao finalMessage() do SDK, pro loop não mudar.
 * Se o modelo pediu ferramenta → um bloco tool_use (+ texto opcional); senão → bloco text.
 */
export async function replicateAgentTurn(system: string, messages: Msg[], tools: any[]): Promise<{ content: Block[]; stop_reason: string }> {
  const toolNames = new Set(tools.map((t) => t.name));
  const protocol = `

━━━ MODO FERRAMENTAS (leia com atenção) ━━━
Você opera por ferramentas. A cada passo, responda com EXATAMENTE UMA das opções:

(A) USAR UMA FERRAMENTA — escreva SÓ um bloco JSON, sem mais nada:
\`\`\`json
{"tool": "nome_da_ferramenta", "input": { ...campos... }}
\`\`\`

(B) RESPOSTA FINAL — se a tarefa já está pronta (ex.: o RESULTADO DA FERRAMENTA anterior mostra "content_id=..."), NÃO chame ferramenta de novo: escreva só a resposta final ao usuário, em texto normal (1 frase), sem JSON.

Ferramentas disponíveis:
${renderToolCatalog(tools)}

Regras: use o campo "tema" com o ASSUNTO (não a instrução crua). Se o usuário nomeou a rede, passe "plataforma". NUNCA invente content_id. Se já gerou (viu content_id no resultado), passe pra opção (B).`;

  const prompt = `${renderTranscript(messages)}\n\n${protocol}\n\nSua resposta:`;
  const out = (await callReplicateHaiku(system, prompt)).trim();

  const action = parseToolAction(out);
  if (action && toolNames.has(action.tool)) {
    // Texto fora do JSON (se houver) vira um bloco de texto antes do tool_use.
    const preText = out.replace(/```(?:json)?[\s\S]*?```/g, "").replace(/\{[\s\S]*"tool"[\s\S]*\}/g, "").trim();
    const content: Block[] = [];
    if (preText) content.push({ type: "text", text: preText });
    content.push({ type: "tool_use", id: genId(), name: action.tool, input: action.input });
    return { content, stop_reason: "tool_use" };
  }
  // Sem ação válida → resposta final (texto). Remove qualquer JSON residual que não virou ferramenta.
  const finalText = out.replace(/```(?:json)?[\s\S]*?```/g, "").trim() || out;
  return { content: [{ type: "text", text: finalText }], stop_reason: "end_turn" };
}

// Heurística: a chamada à Anthropic falhou de um jeito que justifica cair pro fallback?
// Falha em QUASE tudo (crédito, 401, 429, overload, 5xx, timeout) — o fallback é sempre mais seguro
// que derrubar o agente. Só não cai em erro de abort explícito do cliente.
export function shouldFallback(err: any): boolean {
  const msg = String(err?.message || err || "");
  if (/abort/i.test(msg) && !/timeout/i.test(msg)) return false;
  return true;
}
