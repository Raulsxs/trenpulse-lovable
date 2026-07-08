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
  anthropicKey: string;          // p/ tools que usam modelo (planejar_calendario → Sonnet)
  userId: string;                // p/ chamar generate-slide-images (que recebe userId no body)
  defaultBrandId?: string | null;
  defaultModel?: string | null;  // modelo de imagem selecionado no chat (estante)
  pendingImageUrls?: string[];   // fotos anexadas na mensagem atual
}

export interface ToolResult {
  ok: boolean;
  content: string;               // texto que vira o tool_result pro Claude
  action_result?: any;           // p/ o front renderizar ActionCard (via SSE)
}

// Ações irreversíveis/externas: SEMPRE pedem confirmação antes de executar.
export const GATED_TOOLS = new Set(["publicar", "agendar_conteudo"]);
// Acima deste custo (créditos) qualquer geração também pede confirmação (ex.: carrossel grande).
export const CONFIRM_CREDIT_THRESHOLD = 50;

// Multiplicador de custo por modelo de imagem — aproxima credit_pricing (modelos premium custam
// mais por chamada). Base (×1) = gpt-image-2/seedream/imagen-fast/ideogram/qwen; premium (Nano
// Banana Pro, Flux Pro, Reve, Recraft) ≈ 2×. Mantém o gate de custo ciente do modelo escolhido.
function modelCostMultiplier(model?: string | null): number {
  if (!model) return 1;
  switch (model) {
    case "nano-banana":
    case "flux-pro":
    case "reve":
    case "recraft": return 2;
    default: return 1; // gpt-image-2, seedream, imagen-fast, ideogram, qwen
  }
}

// Estimativa de custo (créditos) por tool — usada só pra decidir gating. Aproxima credit_pricing.
export function estimateToolCost(name: string, input: any): number {
  const slides = Math.min(10, Math.max(3, input?.slides || 5));
  const mult = modelCostMultiplier(input?.modelo);
  switch (name) {
    // Estimativa do GATE de confirmação — deve espelhar credit_pricing (pricing 3x, 2026-07-08).
    case "gerar_post":
    case "imagem_livre":
    case "editar_imagem":
    case "editar_conteudo":
    case "editar_slide":      // debita 10 no dispatch (era 8) — alinhado ao post 3x
    case "replicar_post":
    case "link_para_post": return 10 * mult;
    case "gerar_story": return 25 * mult;
    case "gerar_carrossel": return 10 * slides * mult;
    case "gerar_carrossel_editorial": return 5 * 5 * mult;
    case "gerar_tweet_card": return 6;
    case "postar_imagem_com_legenda": return 4; // só legenda (Haiku), usa a imagem do usuário as-is
    case "gerar_video": return Math.min(15, Math.max(3, input?.duracao || 5)) * 9; // ~$0.05/s × margem 3x
    default: return 0;
  }
}

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
        plataforma: { type: "string", enum: ["instagram", "linkedin", "facebook", "tiktok", "x"], description: "Preencha quando o usuário nomear a rede (ex.: 'post pro LinkedIn'). Define formato/legenda da plataforma. Omitir = instagram." },
        brandId: { type: "string", description: "ID da marca a aplicar (opcional; usa a marca padrão se omitido)." },
        modelo: { type: "string", enum: ["gpt-image-2", "reve", "ideogram", "seedream", "imagen-fast", "nano-banana", "qwen", "recraft", "flux-pro"], description: "Só preencha se o usuário pedir um modelo específico. Senão o app usa o selecionado no chat." },
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
        plataforma: { type: "string", enum: ["instagram", "linkedin", "facebook", "tiktok", "x"], description: "Preencha quando o usuário nomear a rede (ex.: 'carrossel pro LinkedIn'). Define formato/legenda da plataforma. Omitir = instagram." },
        brandId: { type: "string" },
        modelo: { type: "string", enum: ["gpt-image-2", "reve", "ideogram", "seedream", "imagen-fast", "nano-banana", "qwen", "recraft", "flux-pro"], description: "Só preencha se o usuário pedir um modelo específico." },
      },
      required: ["tema"],
    },
  },
  {
    name: "gerar_story",
    description: "Cria um Story 9:16 vertical sobre um tema. Chame quando o usuário pede story.",
    input_schema: {
      type: "object",
      properties: {
        tema: { type: "string" },
        plataforma: { type: "string", enum: ["instagram", "linkedin", "facebook", "tiktok"], description: "Preencha quando o usuário nomear a rede. Omitir = instagram." },
        brandId: { type: "string" },
      },
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
    name: "postar_imagem_com_legenda",
    description: "Publica a IMAGEM ANEXADA COMO ESTÁ (sem redesenhar/gerar nova imagem) e escreve só uma legenda. Chame quando o usuário quer postar a PRÓPRIA imagem original — ex.: um CERTIFICADO/diploma (post de conquista no LinkedIn), foto de evento, print, arte já pronta. NÃO use quando ele quer que a IA CRIE/desenhe uma imagem nova (aí é gerar_post). Barato: só gera texto. A imagem é a anexada nesta mensagem (não precisa de URL).",
    input_schema: {
      type: "object",
      properties: {
        contexto: { type: "string", description: "O que a imagem representa / detalhes pra legenda. Ex.: 'certificado do CS50 de Harvard, curso de IA com Python, 12 projetos' ou 'foto do congresso de cardiologia 2026'." },
        plataforma: { type: "string", enum: ["linkedin", "instagram", "facebook", "x"], description: "Rede alvo. Certificado/conquista costuma ser LinkedIn. Omitir = linkedin." },
        brandId: { type: "string" },
      },
      required: ["contexto"],
    },
  },
  {
    name: "gerar_video",
    description: "Cria um VÍDEO animado curto (motion graphics) que EXPLICA um tema — animação ilustrativa sobre um assunto (ex.: como o coração bombeia sangue, um conceito, uma notícia). Chame quando o usuário pede vídeo/reel/animação sobre um ASSUNTO. NÃO é avatar nem pessoa falando — é animação do tema. Segue a marca se houver, ou estilo livre.",
    input_schema: {
      type: "object",
      properties: {
        tema: { type: "string", description: "O ASSUNTO que o vídeo explica (ex.: 'como funciona uma ponte de safena')." },
        duracao: { type: "integer", minimum: 5, maximum: 15, description: "Segundos do vídeo (padrão 10; 15 é o máximo. Mais longo custa mais — ~7cr/s. Se o usuário quiser, ofereça estender pra 15s)." },
        formato: { type: "string", enum: ["9:16", "1:1", "16:9"], description: "9:16 reel/story (padrão), 1:1 feed, 16:9 horizontal." },
        brandId: { type: "string", description: "Marca a seguir (opcional; sem marca = estilo livre)." },
      },
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
    description: "Edita uma FOTO que o usuário ANEXOU (image-to-image): ex.: 'melhore a nitidez', 'troque o fundo'. Chame quando há foto anexada nesta mensagem (a foto anexada é usada automaticamente — não precisa da URL). Se o usuário descreve uma edição mas NÃO anexou foto, NÃO chame — peça a foto.",
    input_schema: {
      type: "object",
      properties: {
        instrucao: { type: "string", description: "O que fazer com a foto." },
        foto_url: { type: "string", description: "Opcional — deixe vazio; a foto anexada é usada automaticamente." },
        brandId: { type: "string" },
      },
      required: ["instrucao"],
    },
  },
  {
    name: "editar_conteudo",
    description: "Regenera a IMAGEM PRINCIPAL de um conteúdo já gerado com um ajuste (texto maior, outras cores, refazer). IMPORTANTE: NÃO edita nem remove slides individuais de um carrossel — regenera a peça principal. Se o usuário quer trocar UM slide específico de um carrossel, diga que a edição por-slide ainda não está disponível por aqui (em breve), e ofereça refazer o conteúdo. Precisa do content_id de uma geração anterior.",
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
    name: "editar_slide",
    description: "Refaz UM slide específico de um carrossel (ex.: 'o slide 2 saiu com erro / fora do estilo'). Mantém os outros slides e ancora no estilo deles. Chame quando o usuário aponta um slide errado de um carrossel já gerado. Índice começa em 1 (slide 1 = capa).",
    input_schema: {
      type: "object",
      properties: {
        contentId: { type: "string", description: "ID do carrossel." },
        slide: { type: "integer", minimum: 1, description: "Número do slide a refazer (1 = capa)." },
        instrucao: { type: "string", description: "O que corrigir nele (ex.: 'corrige o português', 'deixa no estilo da capa', 'fundo mais escuro')." },
      },
      required: ["contentId", "slide", "instrucao"],
    },
  },
  {
    name: "detalhes_conteudo",
    description: "Retorna detalhes técnicos de um conteúdo gerado (qual MODELO de imagem foi usado, prompt, formato). Chame quando o usuário pergunta 'qual modelo foi usado' ou detalhes da geração.",
    input_schema: {
      type: "object",
      properties: { contentId: { type: "string" } },
      required: ["contentId"],
    },
  },
  {
    name: "replicar_post",
    description: "Recria um post parecido com um POST DE REFERÊNCIA anexado, no estilo da marca (o print anexado é usado automaticamente — não precisa da URL). Chame quando o usuário anexa um print/post e diz 'faça parecido com este'.",
    input_schema: {
      type: "object",
      properties: {
        tema: { type: "string", description: "Tema/ajuste do novo post." },
        post_referencia_url: { type: "string", description: "Opcional — deixe vazio; o print anexado é usado automaticamente." },
        brandId: { type: "string" },
      },
      required: [],
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
    name: "planejar_calendario",
    description: "Monta um PLANO de calendário de conteúdo (vários dias/temas). Chame quando o usuário pede um planejamento/cronograma (ex.: 'plano semanal de medicina: segunda sobre prevenção, terça sobre…'). Retorna o plano dia a dia para o usuário aprovar — NÃO gera nem agenda nada sozinho; depois o usuário decide.",
    input_schema: {
      type: "object",
      properties: {
        objetivo: { type: "string", description: "O que o usuário quer planejar." },
        dias: { type: "integer", minimum: 1, maximum: 14, description: "Quantos dias (padrão 7)." },
        temas: { type: "string", description: "Temas/observações específicas do usuário, se houver." },
      },
      required: ["objetivo"],
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
  // Modelo: o que o usuário nomeou na fala (input.modelo) vence o selecionado no chat (defaultModel).
  const model = input?.modelo || ctx.defaultModel || undefined;
  switch (name) {
    case "gerar_post": {
      // Imagem anexada vira referência de estilo (image-to-image), igual gerar_carrossel.
      const refs = (ctx.pendingImageUrls || []).filter((u) => typeof u === "string" && u.startsWith("http"));
      return genResult(await callAiChat(ctx, { message: input.tema, intent_hint: "GENERATE", format: "post", platform: input.plataforma, brandId, model, imageUrls: refs.length ? refs : undefined, replicateRef: refs.length ? true : undefined }), "Post");
    }
    case "gerar_carrossel": {
      // Imagens anexadas viram REFERÊNCIA DE ESTILO (recriar carrossel mantendo a identidade visual —
      // caso Felipe). O LLM não conhece as URLs; puxamos de ctx.pendingImageUrls.
      const refFotos = (ctx.pendingImageUrls || []).filter((u) => typeof u === "string" && u.startsWith("http"));
      return genResult(await callAiChat(ctx, { message: input.tema, intent_hint: "GENERATE_CAROUSEL", format: "carousel", platform: input.plataforma, brandId, model, imageUrls: refFotos.length ? refFotos : undefined, replicateRef: refFotos.length ? true : undefined, generationParams: input.slides ? { slideCount: input.slides } : undefined }), "Carrossel");
    }
    case "gerar_story": {
      const refs = (ctx.pendingImageUrls || []).filter((u) => typeof u === "string" && u.startsWith("http"));
      return genResult(await callAiChat(ctx, { message: input.tema, intent_hint: "GENERATE", format: "story", platform: input.plataforma, brandId, model, imageUrls: refs.length ? refs : undefined, replicateRef: refs.length ? true : undefined }), "Story");
    }
    case "gerar_tweet_card":
      return genResult(await callAiChat(ctx, { message: input.tema, intent_hint: "GENERATE_TWEET_CARD", brandId }), "Tweet card");
    case "postar_imagem_com_legenda": {
      const COST = 4; // pricing 3x (2026-07-08): só legenda, usa a imagem do usuário
      // Imagem anexada as-is (não regenera). O LLM não conhece a URL — pega de pendingImageUrls.
      const img = (ctx.pendingImageUrls || []).find((u) => typeof u === "string" && u.startsWith("http"));
      if (!img) return { ok: false, content: "Nenhuma imagem anexada nesta mensagem. Peça ao usuário para anexar a imagem (📎) que ele quer postar." };

      const { data: creds } = await ctx.userClient.from("user_credits").select("balance").maybeSingle();
      const balance = Number(creds?.balance ?? 0);
      if (balance < COST) return { ok: false, content: `Saldo insuficiente (precisa de ${COST} créditos, você tem ${balance}). Recarregue em Perfil → Créditos.` };

      const plataforma = input.plataforma || "linkedin";
      // Tom de voz da marca (best-effort) pra a legenda sair na voz do usuário.
      let voice = "";
      try {
        const { data: uc } = await ctx.userClient.from("ai_user_context").select("business_niche, brand_voice").maybeSingle();
        if (uc) voice = `Nicho: ${uc.business_niche || "?"}. Tom de voz: ${uc.brand_voice || "profissional e acessível"}.`;
      } catch { /* opcional */ }

      const capPrompt = `Você é copywriter de redes sociais. Escreva a legenda de um post para ${plataforma === "linkedin" ? "LinkedIn" : plataforma} sobre a imagem que o usuário está postando (a IMAGEM é o visual — não a descreva literalmente, contextualize).
CONTEXTO DO USUÁRIO: ${input.contexto}
${voice}
Se for um CERTIFICADO/conquista: tom de celebração autêntica (1ª pessoa), o que aprendeu, por que importa, gratidão — sem soar arrogante. Gancho forte na 1ª linha, parágrafos curtos, CTA leve (pergunta pra engajar). ${plataforma === "linkedin" ? "Máx 3000 chars, 3-5 hashtags." : "Máx 2200 chars, 8-12 hashtags."}
Responda SOMENTE JSON: {"title":"título curto interno","caption":"a legenda completa","hashtags":["#..."]}`;
      let title = "Post com imagem", caption = "", hashtags: string[] = [];
      try {
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": ctx.anthropicKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({ model: "claude-haiku-4-5", max_tokens: 1200, messages: [{ role: "user", content: capPrompt }] }),
        });
        const d = await r.json();
        if (!r.ok) return { ok: false, content: `Não consegui gerar a legenda agora (${d?.error?.message || r.status}). Tente de novo.` };
        const raw = (d.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
        const m = raw.match(/\{[\s\S]*\}/);
        if (m) { const p = JSON.parse(m[0]); title = p.title || title; caption = p.caption || ""; hashtags = Array.isArray(p.hashtags) ? p.hashtags : []; }
        if (!caption) caption = raw.trim();
      } catch (e: any) { return { ok: false, content: `Erro ao gerar a legenda: ${e?.message || e}` }; }

      // Salva usando a imagem ORIGINAL do usuário (image_urls + slides[0] p/ o preview do card).
      const { data: inserted, error: insErr } = await ctx.userClient.from("generated_contents").insert({
        user_id: ctx.userId,
        title,
        content_type: "post",
        caption,
        hashtags: hashtags.length ? hashtags : null,
        image_urls: [img],
        slides: [{ role: "cover", headline: "", body: "", bullets: [], image_url: img, background_image_url: img, render_mode: "user_image" }],
        slide_count: 1,
        status: "draft",
        platform: plataforma,
        visual_mode: "user_image",
        brand_id: input.brandId || ctx.defaultBrandId || null,
        generation_metadata: { action: "post_user_image", contexto: String(input.contexto || "").slice(0, 500) },
      }).select("id").maybeSingle();
      if (insErr || !inserted?.id) return { ok: false, content: `Não consegui salvar o post: ${insErr?.message || "erro"}.` };

      try {
        const { error: spendErr } = await ctx.userClient.rpc("spend_credits", { p_user: ctx.userId, p_amount: COST, p_generation_id: inserted.id, p_metadata: { action: "post_user_image" } });
        if (spendErr) console.error(`[agent-tools] postar_imagem_com_legenda: spend_credits FALHOU (post entregue sem cobrança) user=${ctx.userId} content=${inserted.id}:`, spendErr.message || spendErr);
      } catch (e: any) {
        console.error(`[agent-tools] postar_imagem_com_legenda: spend_credits LANÇOU user=${ctx.userId} content=${inserted.id}:`, e?.message || e);
      }

      return {
        ok: true,
        content: `Post pronto com a imagem original + legenda (content_id=${inserted.id}). Pré-visualização pronta. Confirme em 1 frase e ofereça publicar/agendar; não repita a legenda.`,
        action_result: { content_id: inserted.id, content_type: "post", platform: plataforma },
      };
    }
    case "gerar_video": {
      const res = await fetch(`${ctx.supabaseUrl}/functions/v1/generate-video`, {
        method: "POST",
        headers: { Authorization: ctx.userAuthHeader, apikey: ctx.anonKey, "Content-Type": "application/json" },
        body: JSON.stringify({ userId: ctx.userId, tema: input.tema, duration: input.duracao || 5, aspectRatio: input.formato || "9:16", brandId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.contentId) return { ok: false, content: data?.error || "Não consegui gerar o vídeo agora. Tente de novo." };
      return {
        ok: true,
        content: `Vídeo gerado (content_id=${data.contentId}). Pré-visualização pronta para o usuário. Confirme em 1 frase e ofereça publicar/agendar; não repita o conteúdo.`,
        action_result: { content_id: data.contentId, content_type: "video" },
      };
    }
    case "gerar_carrossel_editorial": {
      const fotos = (ctx.pendingImageUrls || []).filter((u) => typeof u === "string" && u.startsWith("http"));
      return genResult(await callAiChat(ctx, { message: input.tema, intent_hint: "GENERATE_EDITORIAL_CAROUSEL", format: "carousel", brandId, imageUrls: fotos, generationParams: { slideCount: fotos.length || 5 } }), "Carrossel editorial");
    }
    case "imagem_livre":
      return genResult(await callAiChat(ctx, { message: input.descricao, intent_hint: "FREE_IMAGE", model }), "Imagem");
    case "editar_imagem": {
      // O LLM não conhece a URL da foto anexada — cai pra ctx.pendingImageUrls (queixa do Felipe:
      // "não identifica imagem anexada"). Antes exigia input.foto_url, que o modelo não tinha como preencher.
      const foto = input.foto_url || (ctx.pendingImageUrls || []).find((u) => typeof u === "string" && u.startsWith("http"));
      if (!foto) return { ok: false, content: "Nenhuma foto anexada nesta mensagem. Peça ao usuário para anexar a foto (📎) e tente de novo." };
      return genResult(await callAiChat(ctx, { message: input.instrucao, intent_hint: "GENERATE", format: "post", brandId, model, imageUrls: [foto], replicateRef: true }), "Imagem editada");
    }
    case "editar_conteudo":
      // model: a edição usa o mesmo modelo selecionado (senão cai no default e perde qualidade vs a original).
      return genResult(await callAiChat(ctx, { message: input.instrucao, intent_hint: "EDIT_CONTENT", contentId: input.contentId, editInstruction: input.instrucao, model, generationParams: { contentId: input.contentId } }), "Conteúdo ajustado");
    case "editar_slide": {
      const SLIDE_EDIT_COST = 10; // pricing 3x (2026-07-08): alinhado ao post (10cr)
      const idx = Math.max(0, (Number(input.slide) || 1) - 1); // usuário conta de 1
      // Checa saldo ANTES de gastar a geração (mesma fonte que spend_credits afeta: user_credits.balance).
      // Evita o furo de "gera o slide e depois descobre que não dá pra debitar".
      const { data: creds } = await ctx.userClient.from("user_credits").select("balance").maybeSingle();
      const balance = Number(creds?.balance ?? 0);
      if (balance < SLIDE_EDIT_COST) {
        return { ok: false, content: `Saldo insuficiente para refazer o slide (precisa de ${SLIDE_EDIT_COST} créditos, você tem ${balance}). Recarregue em Perfil → Créditos.` };
      }
      const { data: content } = await ctx.userClient.from("generated_contents")
        .select("id, slides, image_urls, brand_id, platform, content_type").eq("id", input.contentId).maybeSingle();
      if (!content) return { ok: false, content: "Conteúdo não encontrado." };
      const slides = Array.isArray(content.slides) ? content.slides : [];
      if (idx < 0 || idx >= slides.length) return { ok: false, content: `Esse carrossel tem ${slides.length} slide(s) — não existe o slide ${idx + 1}.` };
      const slide = slides[idx];
      // Âncora: usa a imagem de OUTRO slide como referência de estilo (consistência).
      const anchorUrl = (slides.find((s: any, j: number) => j !== idx && (s.image_url || s.background_image_url)) || {}).image_url
        || (slides.find((s: any, j: number) => j !== idx && s.background_image_url) || {}).background_image_url || null;
      let brandRefs: string[] = [];
      if (content.brand_id) {
        const { data: refs } = await ctx.userClient.from("brand_examples").select("image_url").eq("brand_id", content.brand_id).eq("purpose", "reference").limit(4);
        brandRefs = (refs || []).map((r: any) => r.image_url).filter(Boolean);
      }
      const refImgs = [anchorUrl, ...brandRefs].filter(Boolean).slice(0, 6);
      const prompt = `Você refaz UM slide de um carrossel fazendo uma EDIÇÃO PONTUAL — mexa SÓ no que o ajuste pede, preserve o resto.

>>> AJUSTE PEDIDO (é isto, exatamente, que deve mudar): "${input.instrucao}"

Conteúdo do slide (mantenha estes textos, salvo se o ajuste mandar trocá-los):
Headline: ${slide.headline || ""}${slide.body ? `\nBody: ${slide.body}` : ""}${slide.bullets?.length ? `\nBullets: ${slide.bullets.join("; ")}` : ""}
${anchorUrl ? "A 1ª imagem anexada é OUTRO slide do MESMO carrossel — replique FIELMENTE o estilo dela (paleta, tipografia, layout, fundo, clima) para ficar consistente." : ""}
REGRAS: faça EXATAMENTE o ajuste pedido, nem mais nem menos; se ele cita um elemento (cor, título, palavra, fundo), mexa só nele e preserve todo o resto. Se ambíguo, interprete de forma conservadora (a que menos altera). Texto em pt-BR impecável e legível. Responda APENAS com a imagem.`;
      const res = await fetch(`${ctx.supabaseUrl}/functions/v1/generate-slide-images`, {
        method: "POST",
        headers: { Authorization: ctx.userAuthHeader, apikey: ctx.anonKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: ctx.userId, model, slide, slideIndex: idx, totalSlides: slides.length,
          contentFormat: content.content_type || "carousel", platform: content.platform || "instagram",
          backgroundOnly: false, customPrompt: prompt, brandId: content.brand_id || null,
          referenceImageUrls: refImgs.length ? refImgs : undefined,
        }),
      });
      const d = await res.json().catch(() => ({}));
      const imageUrl = d.imageUrl || d.bgImageUrl;
      if (!imageUrl) return { ok: false, content: "Não consegui refazer o slide agora. Tenta de novo." };
      const newSlides = slides.map((s: any, j: number) => j === idx ? { ...s, image_url: imageUrl, background_image_url: imageUrl, render_mode: "ai_full_design" } : s);
      const imgs = Array.isArray(content.image_urls) ? [...content.image_urls] : [];
      imgs[idx] = imageUrl;
      await ctx.userClient.from("generated_contents").update({ slides: newSlides, image_urls: imgs }).eq("id", content.id);
      // Débito relevante: se spend_credits falhar, o usuário recebeu o slide e ninguém pagou — loga
      // VISÍVEL (não engole) pra rastrear o furo de gasto. A pré-checagem de saldo acima reduz, mas
      // não elimina (race), o risco de o débito falhar aqui.
      try {
        const { error: spendErr } = await ctx.userClient.rpc("spend_credits", { p_user: ctx.userId, p_amount: SLIDE_EDIT_COST, p_generation_id: content.id, p_metadata: { action: "edit_slide", slide: idx + 1 } });
        if (spendErr) console.error(`[agent-tools] editar_slide: spend_credits FALHOU (slide entregue sem cobrança) user=${ctx.userId} content=${content.id} slide=${idx + 1}:`, spendErr.message || spendErr);
      } catch (e: any) {
        console.error(`[agent-tools] editar_slide: spend_credits LANÇOU (slide entregue sem cobrança) user=${ctx.userId} content=${content.id} slide=${idx + 1}:`, e?.message || e);
      }
      return { ok: true, content: `Slide ${idx + 1} refeito no estilo dos demais — o preview atualiza sozinho.`, action_result: { content_id: content.id, content_type: content.content_type || "carousel", platform: content.platform } };
    }
    case "detalhes_conteudo": {
      const { data: c } = await ctx.userClient.from("generated_contents")
        .select("title, content_type, platform, slide_count, generation_metadata").eq("id", input.contentId).maybeSingle();
      if (!c) return { ok: false, content: "Conteúdo não encontrado." };
      const gm: any = c.generation_metadata || {};
      // A PRIMEIRA entrada (asc) é a geração original; ignora edições posteriores (edit_slide).
      const { data: led } = await ctx.userClient.from("credit_ledger")
        .select("metadata, created_at").eq("generation_id", input.contentId).eq("reason", "generation").order("created_at", { ascending: true }).limit(5);
      const genEntry = (led || []).find((e: any) => (e.metadata as any)?.action !== "edit_slide") || (led || [])[0];
      const action = (genEntry?.metadata as any)?.action as string | undefined;
      const MODEL_BY_ACTION: Record<string, string> = {
        img_gpt: "GPT-Image 2", post: "GPT-Image 2 (padrão)", carousel_slide: "GPT-Image 2 (padrão)", free_image: "GPT-Image 2",
        img_seedream: "Seedream", img_reve: "Reve", img_ideogram: "Ideogram", img_nano: "Nano Banana Pro", story: "Nano Banana Pro",
        img_qwen: "Qwen", img_imagen: "Imagen 4 Fast", img_recraft: "Recraft", img_flux: "Flux 1.1 Pro",
        tweet_card: "Satori (tweet card)", editorial_slide: "Satori + foto (editorial)", edit_slide: "edição de slide",
      };
      const modelo = action ? (MODEL_BY_ACTION[action] || action) : "padrão (GPT-Image 2)";
      return { ok: true, content: `"${c.title || c.content_type}" — ${c.content_type}${c.slide_count ? ` (${c.slide_count} slides)` : ""}, ${c.platform || "instagram"}. Modelo de imagem: **${modelo}**.${gm.prompt ? ` Prompt: "${String(gm.prompt).slice(0, 160)}".` : ""}` };
    }
    case "replicar_post": {
      const ref = input.post_referencia_url || (ctx.pendingImageUrls || []).find((u) => typeof u === "string" && u.startsWith("http"));
      if (!ref) return { ok: false, content: "Nenhum post de referência anexado. Peça ao usuário para anexar o print (📎) e tente de novo." };
      return genResult(await callAiChat(ctx, { message: input.tema || "Recrie um post parecido com este, no estilo da marca.", intent_hint: "GENERATE", format: "post", brandId, model, imageUrls: [ref], replicateRef: true }), "Post replicado");
    }
    case "link_para_post":
      return genResult(await callAiChat(ctx, { message: input.url, intent_hint: "LINK_PARA_POST", brandId }), "Post do link");

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

    case "planejar_calendario": {
      // Planejamento multi-passo usa Sonnet 4.6 (mais inteligente) — isolado neste tool;
      // o resto do agente roda em Haiku. Retorna o plano pro usuário aprovar.
      const dias = Math.min(14, Math.max(1, input.dias || 7));
      const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      const prompt = `Você é estrategista de conteúdo para redes sociais. Monte um plano de ${dias} dias começando em ${amanha}.
OBJETIVO: ${input.objetivo}
${input.temas ? `TEMAS/OBSERVAÇÕES: ${input.temas}` : ""}
Para cada dia dê: data (YYYY-MM-DD), tema (específico, não genérico), formato (post | carrossel | story), e um gancho curto.
Responda em português, como uma lista dia a dia clara e enxuta pro usuário aprovar. No fim, pergunte se ele quer que você gere e agende.`;
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": ctx.anthropicKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1500, messages: [{ role: "user", content: prompt }] }),
        });
        const d = await res.json();
        if (!res.ok) return { ok: false, content: `Não consegui montar o plano agora (${d?.error?.message || res.status}).` };
        const text = (d.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
        return { ok: true, content: text || "Plano vazio — peça ao usuário pra detalhar o objetivo." };
      } catch (e: any) {
        return { ok: false, content: `Erro ao planejar: ${e?.message || e}` };
      }
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
      // INVARIANTE de código (não só dica ao LLM): só publica se houver rede conectada.
      // Reusa o mesmo endpoint/lógica de listar_conexoes (connect-social action:"list").
      const connRes = await fetch(`${ctx.supabaseUrl}/functions/v1/connect-social`, {
        method: "POST", headers: { Authorization: ctx.userAuthHeader, apikey: ctx.anonKey, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "list" }),
      });
      const connData = await connRes.json().catch(() => ({}));
      const connections = connData?.connections || [];
      if (!Array.isArray(connections) || connections.length === 0) {
        return { ok: false, content: "Nenhuma rede social conectada. Conecte uma rede em Perfil → Conexões antes de publicar." };
      }
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
