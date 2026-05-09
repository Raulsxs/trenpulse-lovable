/**
 * Deno tests para render-template.
 * Roda com: deno test --allow-net --allow-env supabase/functions/render-template/test.ts
 *
 * Cobre:
 *   1. Template não encontrado → 404
 *   2. Input com required field ausente → 400 com missing[]
 *   3. Routing engine='blotato' → chama blotato-proxy e devolve mediaUrls
 *   4. Routing engine='gemini' → chama generate-slide-images e devolve imageUrl
 *   5. Happy path inserts em generated_contents (verifica payload)
 *   6. validateInputs unitário
 *   7. renderPromptTemplate substitui tokens
 */
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  callBlotato,
  callGemini,
  type EngineDeps,
  type InsertContent,
  type LoadTemplate,
  renderPromptTemplate,
  renderTemplate,
  type TemplateRow,
  validateInputs,
} from "./index.ts";

// ── Fixtures ─────────────────────────────────────────────────────

const tweetCardTemplate: TemplateRow = {
  id: "11111111-1111-1111-1111-111111111111",
  slug: "tweet-card",
  name: "Tweet Card",
  format: "post",
  category: "card",
  engine: "blotato",
  blotato_template_id: "tweet-minimal",
  prompt_template: null,
  input_schema: {
    fields: [
      { name: "author", type: "text", required: true },
      { name: "handle", type: "text", required: true },
      { name: "quote", type: "textarea", required: true, max: 280 },
      { name: "avatar_url", type: "image", required: false },
    ],
  },
  cost_credits: 0,
  brand_slots: ["avatar", "accent_color"],
};

const geminiTemplate: TemplateRow = {
  id: "22222222-2222-2222-2222-222222222222",
  slug: "photo-quote",
  name: "Photo Quote",
  format: "post",
  category: "photo_quote",
  engine: "gemini",
  blotato_template_id: null,
  prompt_template: "Generate a quote image with phrase: {{phrase}} by {{author_name}}",
  input_schema: {
    fields: [
      { name: "phrase", type: "textarea", required: true, max: 200 },
      { name: "author_name", type: "text", required: false },
    ],
  },
  cost_credits: 1,
  brand_slots: ["accent_color"],
};

const engineDepsBase: Omit<EngineDeps, "fetchImpl"> = {
  supabaseUrl: "https://example.supabase.co",
  serviceRoleKey: "fake-service-role",
};

// ── Mock helpers ─────────────────────────────────────────────────

function mockFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>): typeof fetch {
  return ((url: string | URL | Request, init?: RequestInit) => {
    const u = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
    return Promise.resolve(handler(u, init ?? {}));
  }) as unknown as typeof fetch;
}

function makeLoadTemplate(template: TemplateRow | null): LoadTemplate {
  return async (id: string) => {
    if (template && id === template.id) return template;
    return null;
  };
}

function makeInsertContent(captured: any[] = []): { fn: InsertContent; captured: any[] } {
  return {
    captured,
    fn: async (row) => {
      captured.push(row);
      return { id: "content-" + (captured.length) };
    },
  };
}

// ── 1. Template não encontrado ───────────────────────────────────

Deno.test("renderTemplate: 404 when template not found", async () => {
  const { fn: insert } = makeInsertContent();
  const result = await renderTemplate(
    { templateId: "missing", inputs: {} },
    "user-1",
    makeLoadTemplate(null),
    insert,
    engineDepsBase,
  );
  assertEquals(result.status, 404);
  assertEquals(("error" in result.body) && result.body.error, "Template not found");
});

// ── 2. Required field ausente ────────────────────────────────────

Deno.test("renderTemplate: 400 when required input missing", async () => {
  const { fn: insert } = makeInsertContent();
  const result = await renderTemplate(
    { templateId: tweetCardTemplate.id, inputs: { author: "Alex" } }, // missing handle, quote
    "user-1",
    makeLoadTemplate(tweetCardTemplate),
    insert,
    engineDepsBase,
  );
  assertEquals(result.status, 400);
  if ("missing" in result.body) {
    assertEquals(result.body.missing!.sort(), ["handle", "quote"]);
  } else {
    throw new Error("expected missing[] in body");
  }
});

// ── 3. Routing blotato ───────────────────────────────────────────

Deno.test("renderTemplate: blotato engine calls blotato-proxy and inserts content", async () => {
  let blotatoCalled = false;
  let blotatoBody: any = null;
  const fakeFetch = mockFetch((url, init) => {
    if (url.endsWith("/functions/v1/blotato-proxy")) {
      blotatoCalled = true;
      blotatoBody = JSON.parse(init.body as string);
      return new Response(
        JSON.stringify({
          status: "done",
          creationId: "creation-abc",
          imageUrls: ["https://cdn.blotato.com/abc.png"],
          mediaUrl: null,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response("not mocked: " + url, { status: 599 });
  });

  const { fn: insert, captured } = makeInsertContent();
  const result = await renderTemplate(
    {
      templateId: tweetCardTemplate.id,
      inputs: { author: "Alex", handle: "@alex", quote: "Build in public." },
    },
    "user-1",
    makeLoadTemplate(tweetCardTemplate),
    insert,
    { ...engineDepsBase, fetchImpl: fakeFetch },
  );

  assertEquals(result.status, 200);
  assertEquals(blotatoCalled, true);
  assertEquals(blotatoBody.templateKey, "tweet-minimal");
  assertEquals(blotatoBody.action, "create_visual");
  if ("contentId" in result.body) {
    assertExists(result.body.contentId);
    assertEquals(result.body.mediaUrls, ["https://cdn.blotato.com/abc.png"]);
    assertEquals(result.body.status, "done");
  } else {
    throw new Error("expected RenderResponse");
  }

  // Insert payload
  assertEquals(captured.length, 1);
  assertEquals(captured[0].user_id, "user-1");
  assertEquals(captured[0].template_id, tweetCardTemplate.id);
  assertEquals(captured[0].image_urls, ["https://cdn.blotato.com/abc.png"]);
  assertEquals(captured[0].status, "draft");
  assertEquals(captured[0].generation_metadata.template_slug, "tweet-card");
  assertEquals(captured[0].generation_metadata.blotato_creation_id, "creation-abc");
});

// ── 4. Routing gemini ────────────────────────────────────────────

Deno.test("renderTemplate: gemini engine renders prompt and calls generate-slide-images", async () => {
  let geminiCalled = false;
  let renderedPrompt: string | null = null;
  const fakeFetch = mockFetch((url, init) => {
    if (url.endsWith("/functions/v1/generate-slide-images")) {
      geminiCalled = true;
      const body = JSON.parse(init.body as string);
      renderedPrompt = body.customPrompt;
      return new Response(
        JSON.stringify({
          imageUrl: "https://cdn.gemini.example/img.png",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response("not mocked: " + url, { status: 599 });
  });

  const { fn: insert, captured } = makeInsertContent();
  const result = await renderTemplate(
    {
      templateId: geminiTemplate.id,
      inputs: { phrase: "Discipline equals freedom", author_name: "Jocko" },
    },
    "user-2",
    makeLoadTemplate(geminiTemplate),
    insert,
    { ...engineDepsBase, fetchImpl: fakeFetch },
  );

  assertEquals(result.status, 200);
  assertEquals(geminiCalled, true);
  assertEquals(
    renderedPrompt,
    "Generate a quote image with phrase: Discipline equals freedom by Jocko",
  );
  if ("contentId" in result.body) {
    assertEquals(result.body.mediaUrls, ["https://cdn.gemini.example/img.png"]);
  }
  assertEquals(captured[0].caption, "");
  assertEquals(captured[0].title, "Discipline equals freedom");
});

// ── 5. Engine satori não implementado ────────────────────────────

Deno.test("renderTemplate: satori engine returns 501", async () => {
  const satoriTemplate: TemplateRow = { ...geminiTemplate, engine: "satori", id: "sat-1" };
  const { fn: insert } = makeInsertContent();
  const result = await renderTemplate(
    { templateId: satoriTemplate.id, inputs: { phrase: "x" } },
    "user-1",
    makeLoadTemplate(satoriTemplate),
    insert,
    engineDepsBase,
  );
  assertEquals(result.status, 501);
});

// ── 6. validateInputs unitário ───────────────────────────────────

Deno.test("validateInputs: empty string is treated as missing for required field", () => {
  const result = validateInputs(
    { fields: [{ name: "x", type: "text", required: true }] },
    { x: "   " },
  );
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.missing, ["x"]);
});

Deno.test("validateInputs: non-required can be empty", () => {
  const result = validateInputs(
    { fields: [{ name: "x", type: "text", required: false }] },
    {},
  );
  assertEquals(result.ok, true);
});

Deno.test("validateInputs: empty array fails for required", () => {
  const result = validateInputs(
    { fields: [{ name: "items", type: "array", required: true }] },
    { items: [] },
  );
  assertEquals(result.ok, false);
});

// ── 7. renderPromptTemplate ──────────────────────────────────────

Deno.test("renderPromptTemplate: substitui tokens simples", () => {
  const out = renderPromptTemplate("Hello {{name}}, age {{age}}", { name: "Raul", age: 30 });
  assertEquals(out, "Hello Raul, age 30");
});

Deno.test("renderPromptTemplate: token ausente vira string vazia", () => {
  const out = renderPromptTemplate("[{{a}}|{{b}}]", { a: "ok" });
  assertEquals(out, "[ok|]");
});

Deno.test("renderPromptTemplate: {{json}} dump tudo", () => {
  const out = renderPromptTemplate("Inputs: {{json}}", { x: 1, y: "z" });
  assertEquals(out, 'Inputs: {"x":1,"y":"z"}');
});

// ── UUID raw em blotato_template_id ──────────────────────────────

Deno.test("renderTemplate: blotato com UUID raw envia templateId em vez de templateKey", async () => {
  const uuidTemplate: TemplateRow = {
    ...tweetCardTemplate,
    id: "44444444-4444-4444-4444-444444444444",
    slug: "newspaper-infographic",
    blotato_template_id: "07a5b5c5-387c-49e3-86b1-de822cd2dfc7",
    input_schema: { fields: [{ name: "description", type: "textarea", required: true }] },
  };
  let captured: any = null;
  const fakeFetch = mockFetch((url, init) => {
    if (url.endsWith("/functions/v1/blotato-proxy")) {
      captured = JSON.parse(init.body as string);
      return new Response(
        JSON.stringify({ status: "done", creationId: "c-uuid", imageUrls: ["https://x/y.png"] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response("not mocked", { status: 599 });
  });
  const { fn: insert } = makeInsertContent();
  await renderTemplate(
    { templateId: uuidTemplate.id, inputs: { description: "Tema do post" } },
    "user-x",
    makeLoadTemplate(uuidTemplate),
    insert,
    { ...engineDepsBase, fetchImpl: fakeFetch },
  );
  assertEquals(captured.templateId, "07a5b5c5-387c-49e3-86b1-de822cd2dfc7");
  assertEquals(captured.templateKey, undefined);
});

// ── 8. callBlotato propaga erro de upstream ──────────────────────

Deno.test("callBlotato: lança quando upstream retorna 500", async () => {
  const fakeFetch = mockFetch(() =>
    new Response("upstream boom", { status: 502 })
  );
  let threw = false;
  try {
    await callBlotato(tweetCardTemplate, { author: "a", handle: "b", quote: "c" }, {
      ...engineDepsBase,
      fetchImpl: fakeFetch,
    });
  } catch (e: any) {
    threw = true;
    assertEquals(e.message.includes("blotato-proxy failed"), true);
  }
  assertEquals(threw, true);
});

Deno.test("callGemini: lança quando template não tem prompt_template", async () => {
  let threw = false;
  try {
    await callGemini(
      { ...geminiTemplate, prompt_template: null },
      { phrase: "x" },
      engineDepsBase,
    );
  } catch (e: any) {
    threw = true;
    assertEquals(e.message.includes("missing prompt_template"), true);
  }
  assertEquals(threw, true);
});
