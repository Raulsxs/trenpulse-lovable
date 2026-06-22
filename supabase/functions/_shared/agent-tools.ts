// agent-tools.ts — catálogo de ferramentas do orquestrador agêntico (ai-agent).
// Cada tool é um WRAPPER sobre uma edge function que JÁ existe (ai-chat via intent_hint,
// publish-postforme, connect-social, scrape-trends) — o agente COMPÕE, não reimplementa.
// Padrão: o LLM PROPÕE a tool call → o ai-agent VALIDA/gate → dispatchTool() EXECUTA.
//
// Auth: repassamos o JWT do usuário (não service_role) pro ai-chat resolver getUser() igual
// ao fluxo normal do front. apikey = anonKey (casa com o Authorization do usuário; o conflito
// de keys de 2026-06-11 só ocorre com service-role no Authorization + anon no apikey).

export interface ToolCtx {
  supabaseUrl: string;
  anonKey: string;
  userAuthHeader: string;        // "Bearer <jwt do usuário>"
  userClient: any;               // supabase client com auth do usuário (RLS)
  defaultBrandId?: string | null;
  pendingImageUrls?: string[];   // fotos anexadas na mensagem atual
}

export interface ToolResult {
  ok: boolean;
  content: string;               // texto que vira o tool_result pro Claude
  action_result?: any;           // p/ o front renderizar ActionCard (via SSE)
}

// Ações irreversíveis/externas: SEMPRE pedem confirmação antes de executar.
export const GATED_TOOLS = new Set(["publicar", "agendar_conteudo"]);
// Acima deste custo (créditos) qualquer geração também pede confirmação.
export const CONFIRM_CREDIT_THRESHOLD = 25;

// ─────────────────────────── Schemas (formato Anthropic tools) ───────────────────────────
// Descrições PRESCRITIVAS ("chame quando…") — Haiku é conservador; isso melhora o should-call.
export const AGENT_TOOLS = [
  {
    name: "gerar_post",
    description: "Cria UM post (imagem 1:1) no estilo da marca do usuário. Chame quando o usuário pede um post único sobre um tema (ex.: '5 sinais de burnout'). NÃO use para editar uma foto existente.",
    input_schema: {
      type: "object",
      properties: {
        tema: { type: "string", description: "O ASSUNTO do post (não uma instrução). Ex.: 'hábitos para mais energia'." },
        brandId: { type: "string", description: "ID da marca a aplicar (opcional; usa a marca padrão se omitido)." },
      },
      required: ["tema"],
    },
  },
  {
    name: "gerar_carrossel",
    description: "Cria um carrossel de N slides (educacional, listas, dicas). Chame quando o usuário pede carrossel/sequência de slides sobre um tema.",
    input_schema: {
      type: "object",
      properties: {
        tema: { type: "string" },
        slides: { type: "integer", minimum: 3, maximum: 10, description: "Nº de slides (padrão 5)." },
        brandId: { type: "string" },
      },
      required: ["tema"],
    },
  },
  {
    name: "gerar_story",
    description: "Cria um Story 9:16 vertical sobre um tema. Chame quando o usuário pede story.",
    input_schema: {
      type: "object",
      properties: { tema: { type: "string" }, brandId: { type: "string" } },
      required: ["tema"],
    },
  },
  {
    name: "gerar_tweet_card",
    description: "Cria um carrossel de 'tweet cards' (estilo print de X/Twitter) a partir de um tema. Chame quando o usuário pede tweet card / thread em cards.",
    input_schema: {
      type: "object",
      properties: { tema: { type: "string" }, brandId: { type: "string" } },
      required: ["tema"],
    },
  },
  {
    name: "gerar_carrossel_editorial",
    description: "Cria um carrossel editorial cinematográfico (foto + manchete de impacto). Chame quando o usuário ENVIOU 2+ FOTOS suas (ex.: de um evento/congresso) e quer um carrossel com elas, OU pede explicitamente estilo 'editorial/revista/viral'. Usa as fotos anexadas como fundo (1 slide por foto) com as cores da marca.",
    input_schema: {
      type: "object",
      properties: {
        tema: { type: "string", description: "O que o carrossel narra (ex.: 'aprendizados do congresso de cardiologia')." },
        brandId: { type: "string" },
      },
      required: ["tema"],
    },
  },
  {
    name: "imagem_livre",
    description: "Gera uma imagem CRUA (sem moldura de post/marca). Chame quando o usuário pede só 'uma imagem/ilustração/foto de X' sem falar em post/story/carrossel.",
    input_schema: {
      type: "object",
      properties: { descricao: { type: "string" } },
      required: ["descricao"],
    },
  },
  {
    name: "editar_imagem",
    description: "Edita uma FOTO que o usuário ANEXOU (image-to-image): ex.: 'melhore a nitidez', 'troque o fundo'. Chame SOMENTE quando há uma foto anexada nesta mensagem. Se o usuário descreve uma edição mas NÃO anexou foto, NÃO chame — peça a foto.",
    input_schema: {
      type: "object",
      properties: {
        instrucao: { type: "string", description: "O que fazer com a foto." },
        foto_url: { type: "string", description: "URL da foto anexada a editar." },
        brandId: { type: "string" },
      },
      required: ["instrucao", "foto_url"],
    },
  },
  {
    name: "editar_conteudo",
    description: "Regenera um conteúdo JÁ GERADO com um ajuste (texto maior, outras cores, refazer). Chame quando o usuário pede para mudar um post que já existe (precisa do content_id retornado por uma geração anterior).",
    input_schema: {
      type: "object",
      properties: {
        contentId: { type: "string" },
        instrucao: { type: "string", description: "Ex.: 'deixe o texto maior', 'cores mais vibrantes'." },
      },
      required: ["contentId", "instrucao"],
    },
  },
  {
    name: "replicar_post",
    description: "Recria um post parecido com um POST DE REFERÊNCIA anexado, no estilo da marca. Chame quando o usuário anexa um print/post e diz 'faça parecido com este'.",
    input_schema: {
      type: "object",
      properties: {
        tema: { type: "string", description: "Tema/ajuste do novo post." },
        post_referencia_url: { type: "string" },
        brandId: { type: "string" },
      },
      required: ["post_referencia_url"],
    },
  },
  {
    name: "link_para_post",
    description: "Transforma um LINK de notícia/artigo num post/infográfico do TEMA. Chame quando o usuário cola uma URL e quer conteúdo a partir dela.",
    input_schema: {
      type: "object",
      properties: { url: { type: "string" }, brandId: { type: "string" } },
      required: ["url"],
    },
  },
  {
    name: "listar_agenda",
    description: "Lista os conteúdos agendados do usuário (calendário). Chame quando ele pergunta o que está agendado ou antes de agendar algo novo.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "listar_conexoes",
    description: "Lista as redes sociais conectadas do usuário. Chame antes de publicar/agendar para saber onde dá pra postar.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "consultar_saldo",
    description: "Consulta o saldo de créditos do usuário. Chame quando ele pergunta de saldo/custos.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "buscar_tendencias",
    description: "Busca tendências/notícias recentes do nicho. Chame quando o usuário quer ideias do que postar baseado em tendências.",
    input_schema: {
      type: "object",
      properties: { tema: { type: "string", description: "Filtro opcional de tema." } },
    },
  },
  {
    name: "agendar_conteudo",
    description: "AGENDA um conteúdo já gerado para publicar numa data/hora. AÇÃO QUE PUBLICA NO FUTURO — sempre será confirmada pelo usuário antes de efetivar. Chame com o content_id e a data/hora.",
    input_schema: {
      type: "object",
      properties: {
        contentId: { type: "string" },
        data_hora_iso: { type: "string", description: "ISO 8601, ex.: 2026-06-23T09:00:00-03:00." },
        plataformas: { type: "array", items: { type: "string" }, description: "Ex.: ['instagram','linkedin']. Omitir = todas conectadas." },
      },
      required: ["contentId", "data_hora_iso"],
    },
  },
  {
    name: "publicar",
    description: "PUBLICA AGORA um conteúdo já gerado nas redes. AÇÃO IRREVERSÍVEL — sempre será confirmada pelo usuário antes de efetivar. Chame com o content_id.",
    input_schema: {
      type: "object",
      properties: {
        contentId: { type: "string" },
        plataformas: { type: "array", items: { type: "string" } },
      },
      required: ["contentId"],
    },
  },
];

// ─────────────────────────── Dispatch ───────────────────────────
async function callAiChat(ctx: ToolCtx, body: Record<string, unknown>): Promise<any> {
  const res = await fetch(`${ctx.supabaseUrl}/functions/v1/ai-chat`, {
    method: "POST",
    headers: { Authorization: ctx.userAuthHeader, apikey: ctx.anonKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `ai-chat ${res.status}`);
  return data;
}

function genResult(data: any, kind: string): ToolResult {
  const ar = data?.action_result;
  if (ar?.content_id) {
    return {
      ok: true,
      content: `${kind} gerado com sucesso (content_id=${ar.content_id}). Pré-visualização pronta para o usuário. Não repita o conteúdo no texto; só confirme em 1 frase e ofereça publicar/agendar.`,
      action_result: ar,
    };
  }
  return { ok: false, content: data?.reply || `Não consegui gerar o ${kind}. Peça para o usuário reformular.` };
}

export async function dispatchTool(ctx: ToolCtx, name: string, input: any): Promise<ToolResult> {
  const brandId = input?.brandId || ctx.defaultBrandId || undefined;
  switch (name) {
    case "gerar_post":
      return genResult(await callAiChat(ctx, { message: input.tema, intent_hint: "GENERATE", format: "post", brandId }), "Post");
    case "gerar_carrossel":
      return genResult(await callAiChat(ctx, { message: input.tema, intent_hint: "GENERATE_CAROUSEL", format: "carousel", brandId, generationParams: input.slides ? { slideCount: input.slides } : undefined }), "Carrossel");
    case "gerar_story":
      return genResult(await callAiChat(ctx, { message: input.tema, intent_hint: "GENERATE", format: "story", brandId }), "Story");
    case "gerar_tweet_card":
      return genResult(await callAiChat(ctx, { message: input.tema, intent_hint: "GENERATE_TWEET_CARD", brandId }), "Tweet card");
    case "gerar_carrossel_editorial": {
      const fotos = (ctx.pendingImageUrls || []).filter((u) => typeof u === "string" && u.startsWith("http"));
      return genResult(await callAiChat(ctx, { message: input.tema, intent_hint: "GENERATE_EDITORIAL_CAROUSEL", format: "carousel", brandId, imageUrls: fotos, generationParams: { slideCount: fotos.length || 5 } }), "Carrossel editorial");
    }
    case "imagem_livre":
      return genResult(await callAiChat(ctx, { message: input.descricao, intent_hint: "FREE_IMAGE" }), "Imagem");
    case "editar_imagem":
      return genResult(await callAiChat(ctx, { message: input.instrucao, intent_hint: "GENERATE", format: "post", brandId, imageUrls: [input.foto_url], replicateRef: true }), "Imagem editada");
    case "editar_conteudo":
      return genResult(await callAiChat(ctx, { message: input.instrucao, intent_hint: "EDIT_CONTENT", contentId: input.contentId, editInstruction: input.instrucao, generationParams: { contentId: input.contentId } }), "Conteúdo ajustado");
    case "replicar_post":
      return genResult(await callAiChat(ctx, { message: input.tema || "Recrie um post parecido com este, no estilo da marca.", intent_hint: "GENERATE", format: "post", brandId, imageUrls: [input.post_referencia_url], replicateRef: true }), "Post replicado");
    case "link_para_post":
      return genResult(await callAiChat(ctx, { message: `${input.url}${input.brandId ? "" : ""}`, intent_hint: "LINK_PARA_POST", brandId }), "Post do link");

    case "listar_agenda": {
      const { data } = await ctx.userClient
        .from("generated_contents")
        .select("id, title, content_type, scheduled_at, platform, status")
        .not("scheduled_at", "is", null)
        .order("scheduled_at", { ascending: true })
        .limit(20);
      const items = (data || []).map((c: any) => `• ${new Date(c.scheduled_at).toLocaleString("pt-BR")} — ${c.title || c.content_type} (${c.platform || "?"}, ${c.status})`).join("\n");
      return { ok: true, content: items ? `Agenda:\n${items}` : "Nenhum conteúdo agendado." };
    }
    case "listar_conexoes": {
      const res = await fetch(`${ctx.supabaseUrl}/functions/v1/connect-social`, {
        method: "POST", headers: { Authorization: ctx.userAuthHeader, apikey: ctx.anonKey, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "list" }),
      });
      const d = await res.json().catch(() => ({}));
      const conns = (d?.connections || []).map((c: any) => `${c.platform} (${c.account_name || c.status})`).join(", ");
      return { ok: true, content: conns ? `Conectado: ${conns}` : "Nenhuma rede conectada. O usuário precisa conectar em Perfil → Conexões antes de publicar." };
    }
    case "consultar_saldo": {
      const { data } = await ctx.userClient.from("user_credits").select("balance").maybeSingle();
      return { ok: true, content: `Saldo: ${data?.balance ?? 0} créditos.` };
    }
    case "buscar_tendencias": {
      const res = await fetch(`${ctx.supabaseUrl}/functions/v1/scrape-trends`, {
        method: "POST", headers: { Authorization: ctx.userAuthHeader, apikey: ctx.anonKey, "Content-Type": "application/json" },
        body: JSON.stringify({ tema: input?.tema }),
      }).catch(() => null);
      const d = res && res.ok ? await res.json().catch(() => ({})) : {};
      const list = (d?.trends || d?.data || []).slice(0, 6).map((t: any) => `• ${t.title || t.headline || t}`).join("\n");
      return { ok: true, content: list ? `Tendências:\n${list}` : "Não encontrei tendências agora." };
    }

    // ── Gated (só chegam aqui DEPOIS de confirmadas pelo usuário) ──
    case "agendar_conteudo": {
      const { error } = await ctx.userClient
        .from("generated_contents")
        .update({ scheduled_at: input.data_hora_iso, status: "scheduled" })
        .eq("id", input.contentId);
      if (error) return { ok: false, content: `Falha ao agendar: ${error.message}` };
      return { ok: true, content: `Agendado para ${new Date(input.data_hora_iso).toLocaleString("pt-BR")}.` };
    }
    case "publicar": {
      const res = await fetch(`${ctx.supabaseUrl}/functions/v1/publish-postforme`, {
        method: "POST", headers: { Authorization: ctx.userAuthHeader, apikey: ctx.anonKey, "Content-Type": "application/json" },
        body: JSON.stringify({ contentId: input.contentId, platforms: input.plataformas }),
      });
      const d = await res.json().catch(() => ({}));
      if (d?.error) return { ok: false, content: `Falha ao publicar: ${d.error}` };
      const oks = (d?.results || []).filter((r: any) => r.success).map((r: any) => r.platform).join(", ");
      const errs = (d?.results || []).filter((r: any) => !r.success).map((r: any) => `${r.platform}: ${r.error}`).join("; ");
      return { ok: true, content: `Publicado em: ${oks || "—"}${errs ? `. Falhas: ${errs}` : ""}` };
    }

    default:
      return { ok: false, content: `Tool desconhecida: ${name}` };
  }
}
