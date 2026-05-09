/**
 * render-template — central engine de renderização da Fase 1 do refactor template-first.
 *
 * Contrato:
 *   POST { templateId: uuid, inputs: object, brandOverride?: object }
 *   → { contentId: uuid, mediaUrls: string[], status: "done" | "processing", creationId?: string }
 *
 * Lógica:
 *   1. Auth via getUser() (NUNCA getClaims, retorna user.id errado).
 *   2. Carrega template via service_role.
 *   3. Valida inputs.* contra input_schema.fields[].
 *   4. Roteia por template.engine:
 *        - blotato → invoca blotato-proxy passando templateKey = template.blotato_template_id
 *        - gemini  → renderiza prompt_template com inputs, invoca generate-slide-images com customPrompt
 *        - satori  → TODO Fase 2 (placeholder 501).
 *   5. Insere em generated_contents (status='draft', template_id, image_urls).
 *   6. Retorna contentId + mediaUrls.
 *
 * Internal calls usam Bearer SUPABASE_SERVICE_ROLE_KEY (padrão do projeto pra evitar JWT expiry).
 */
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── Tipos públicos ───────────────────────────────────────────────

export type FieldType = "text" | "textarea" | "image" | "array" | "boolean" | "number";

export type FieldSpec = {
  name: string;
  type: FieldType;
  label?: string;
  required?: boolean;
  max?: number;
  min?: number;
  item_type?: FieldType | "object";
  schema?: Record<string, FieldType>;
};

export type InputSchema = {
  fields: FieldSpec[];
};

export type TemplateRow = {
  id: string;
  slug: string;
  name: string;
  format: string;
  category: string;
  engine: "blotato" | "gemini" | "satori";
  blotato_template_id: string | null;
  prompt_template: string | null;
  input_schema: InputSchema;
  cost_credits: number;
  brand_slots: string[] | null;
};

export type RenderRequest = {
  templateId: string;
  inputs: Record<string, unknown>;
  brandOverride?: Record<string, unknown>;
};

export type RenderResponse = {
  contentId: string;
  mediaUrls: string[];
  status: "done" | "processing";
  creationId?: string;
};

// ── Validação ────────────────────────────────────────────────────

export function validateInputs(
  schema: InputSchema,
  inputs: Record<string, unknown>,
): { ok: true } | { ok: false; missing: string[] } {
  const missing: string[] = [];
  for (const f of schema.fields ?? []) {
    if (!f.required) continue;
    const v = inputs[f.name];
    const isEmpty =
      v === undefined ||
      v === null ||
      (typeof v === "string" && v.trim() === "") ||
      (Array.isArray(v) && v.length === 0);
    if (isEmpty) missing.push(f.name);
  }
  return missing.length === 0 ? { ok: true } : { ok: false, missing };
}

// ── Substituição de tokens em prompt_template ────────────────────
// Suporta {{nome_do_campo}} e {{json}} (dump completo dos inputs).
export function renderPromptTemplate(
  template: string,
  inputs: Record<string, unknown>,
): string {
  return template
    .replace(/\{\{\s*json\s*\}\}/g, JSON.stringify(inputs))
    .replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
      const v = inputs[key];
      if (v === undefined || v === null) return "";
      return typeof v === "string" ? v : JSON.stringify(v);
    });
}

// ── Engines (extraídas em funções pra serem mockáveis em testes) ─

export type EngineDeps = {
  supabaseUrl: string;
  serviceRoleKey: string;
  fetchImpl?: typeof fetch;
};

export async function callBlotato(
  template: TemplateRow,
  inputs: Record<string, unknown>,
  deps: EngineDeps,
): Promise<{ mediaUrls: string[]; status: "done" | "processing"; creationId?: string }> {
  if (!template.blotato_template_id) {
    throw new Error(`Template ${template.slug} missing blotato_template_id`);
  }
  const f = deps.fetchImpl ?? fetch;
  const resp = await f(`${deps.supabaseUrl}/functions/v1/blotato-proxy`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${deps.serviceRoleKey}`,
      "Content-Type": "application/json",
      apikey: deps.serviceRoleKey,
    },
    body: JSON.stringify({
      action: "create_visual",
      templateKey: template.blotato_template_id,
      inputs,
      prompt: typeof inputs.prompt === "string" ? inputs.prompt : "",
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`blotato-proxy failed (${resp.status}): ${text.slice(0, 200)}`);
  }
  const data = await resp.json();
  const mediaUrls: string[] = Array.isArray(data.imageUrls) ? data.imageUrls : [];
  if (data.mediaUrl && !mediaUrls.includes(data.mediaUrl)) mediaUrls.push(data.mediaUrl);
  return {
    mediaUrls,
    status: data.status === "done" ? "done" : "processing",
    creationId: data.creationId,
  };
}

export async function callGemini(
  template: TemplateRow,
  inputs: Record<string, unknown>,
  deps: EngineDeps,
): Promise<{ mediaUrls: string[]; status: "done" }> {
  if (!template.prompt_template) {
    throw new Error(`Template ${template.slug} missing prompt_template for gemini engine`);
  }
  const customPrompt = renderPromptTemplate(template.prompt_template, inputs);
  const f = deps.fetchImpl ?? fetch;
  const slide = {
    headline: typeof inputs.headline === "string" ? inputs.headline : template.name,
    body: typeof inputs.body === "string" ? inputs.body : "",
  };
  const resp = await f(`${deps.supabaseUrl}/functions/v1/generate-slide-images`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${deps.serviceRoleKey}`,
      "Content-Type": "application/json",
      apikey: deps.serviceRoleKey,
    },
    body: JSON.stringify({
      slide,
      slideIndex: 0,
      totalSlides: 1,
      contentFormat: template.format,
      platform: template.format === "linkedin" ? "linkedin" : "instagram",
      customPrompt,
      backgroundOnly: false,
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`generate-slide-images failed (${resp.status}): ${text.slice(0, 200)}`);
  }
  const data = await resp.json();
  const mediaUrls: string[] = [];
  if (typeof data.imageUrl === "string") mediaUrls.push(data.imageUrl);
  if (Array.isArray(data.imageUrls)) mediaUrls.push(...data.imageUrls);
  if (mediaUrls.length === 0 && typeof data.url === "string") mediaUrls.push(data.url);
  return { mediaUrls, status: "done" };
}

// ── Pipeline principal (orquestra tudo) ──────────────────────────

export type LoadTemplate = (id: string) => Promise<TemplateRow | null>;
export type InsertContent = (row: {
  user_id: string;
  template_id: string;
  title: string;
  caption: string;
  image_urls: string[];
  content_type: string;
  status: string;
  generation_metadata: Record<string, unknown>;
}) => Promise<{ id: string }>;

export async function renderTemplate(
  req: RenderRequest,
  userId: string,
  loadTemplate: LoadTemplate,
  insertContent: InsertContent,
  engineDeps: EngineDeps,
): Promise<{ status: number; body: RenderResponse | { error: string; missing?: string[] } }> {
  if (!req.templateId) return { status: 400, body: { error: "templateId is required" } };
  if (!req.inputs || typeof req.inputs !== "object") {
    return { status: 400, body: { error: "inputs must be an object" } };
  }

  const template = await loadTemplate(req.templateId);
  if (!template) return { status: 404, body: { error: "Template not found" } };

  const v = validateInputs(template.input_schema, req.inputs);
  if (!v.ok) return { status: 400, body: { error: "Missing required inputs", missing: v.missing } };

  let result: { mediaUrls: string[]; status: "done" | "processing"; creationId?: string };
  switch (template.engine) {
    case "blotato":
      result = await callBlotato(template, req.inputs, engineDeps);
      break;
    case "gemini":
      result = await callGemini(template, req.inputs, engineDeps);
      break;
    case "satori":
      return { status: 501, body: { error: "satori engine not implemented yet" } };
    default:
      return { status: 500, body: { error: `Unknown engine: ${(template as TemplateRow).engine}` } };
  }

  // Title/caption mínimos pra não quebrar generated_contents.NOT NULL columns.
  // Prioridade: title > headline > phrase > quote (truncado a 80 chars) > template.name.
  const inferredTitle = (typeof req.inputs.title === "string" && req.inputs.title) ||
    (typeof req.inputs.headline === "string" && req.inputs.headline) ||
    (typeof req.inputs.phrase === "string" && req.inputs.phrase) ||
    (typeof req.inputs.quote === "string" && (req.inputs.quote as string).slice(0, 80)) ||
    template.name;
  const inferredCaption = (typeof req.inputs.caption === "string" && req.inputs.caption) ||
    (typeof req.inputs.body === "string" && req.inputs.body) ||
    (typeof req.inputs.quote === "string" && req.inputs.quote) ||
    "";

  const inserted = await insertContent({
    user_id: userId,
    template_id: template.id,
    title: inferredTitle as string,
    caption: inferredCaption as string,
    image_urls: result.mediaUrls,
    content_type: template.format,
    status: "draft",
    generation_metadata: {
      template_slug: template.slug,
      template_engine: template.engine,
      blotato_creation_id: result.creationId,
      brand_override: req.brandOverride ?? null,
    },
  });

  return {
    status: 200,
    body: {
      contentId: inserted.id,
      mediaUrls: result.mediaUrls,
      status: result.status,
      creationId: result.creationId,
    },
  };
}

// ── HTTP handler ─────────────────────────────────────────────────

async function resolveUserId(
  authHeader: string,
  supabaseUrl: string,
  anonKey: string,
  serviceRoleKey: string,
  bodyUserId?: string,
): Promise<string | null> {
  const token = authHeader.slice("Bearer ".length).trim();
  // Match strict (env var) e também detecta service-role legacy JWT pelo formato.
  // Supabase introduziu novas API keys curtas (sb_secret_*, ~41 chars) em paralelo aos
  // JWT legacy de ~219 chars. Aceita qualquer um se não for um user JWT.
  if (token === serviceRoleKey) {
    return bodyUserId || null;
  }
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error } = await userClient.auth.getUser();
  if (user) return user.id;
  // getUser falhou: pode ser service-role JWT legacy (sem sub claim) ou anon key.
  // Aceita como internal call SE bodyUserId tiver sido passado explicitamente.
  const looksLikeServiceJwt = error?.message?.includes("missing sub claim") ||
    error?.message?.includes("invalid claim");
  if (looksLikeServiceJwt && bodyUserId) {
    console.log(`[render-template:auth] accepted as internal (legacy service JWT), userId=${bodyUserId}`);
    return bodyUserId;
  }
  console.log(`[render-template:auth] rejected: getUser err=${error?.message ?? "none"} bodyUserId=${bodyUserId ?? "null"}`);
  return null;
}

function makeLoaders(svc: SupabaseClient): { loadTemplate: LoadTemplate; insertContent: InsertContent } {
  return {
    loadTemplate: async (id) => {
      const { data, error } = await svc
        .from("templates")
        .select(
          "id, slug, name, format, category, engine, blotato_template_id, prompt_template, input_schema, cost_credits, brand_slots",
        )
        .eq("id", id)
        .eq("is_active", true)
        .maybeSingle();
      if (error || !data) return null;
      return data as TemplateRow;
    },
    insertContent: async (row) => {
      const { data, error } = await svc
        .from("generated_contents")
        .insert(row)
        .select("id")
        .single();
      if (error || !data) throw new Error(`Failed to insert content: ${error?.message ?? "unknown"}`);
      return { id: data.id as string };
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const body = await req.json() as RenderRequest & { userId?: string };
    const userId = await resolveUserId(authHeader, supabaseUrl, anonKey, serviceRoleKey, body.userId);
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const svc = createClient(supabaseUrl, serviceRoleKey);
    const { loadTemplate, insertContent } = makeLoaders(svc);

    const result = await renderTemplate(body, userId, loadTemplate, insertContent, {
      supabaseUrl,
      serviceRoleKey,
    });

    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[render-template] Error:", err?.message, err?.stack);
    return new Response(JSON.stringify({ error: err?.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
