/**
 * SMOKE TESTS — Chat & Generation Logic
 *
 * These test the pure logic functions that broke most often.
 * They run in <5 seconds and catch regressions before push.
 *
 * Run: npm test
 * Watch: npm run test:watch
 */

import { describe, it, expect } from "vitest";

// ──────────────────────────────────────────────
// Helper: simulate the chat history filter
// (mirrors ChatWindow.tsx lines 201-206)
// ──────────────────────────────────────────────

const INTERNAL_INTENTS = [
  "PIPELINE_BACKGROUND",
  "INICIAR_GERACAO",
  "GERAR_CONTEUDO",
  "CRIAR_MARCA_ANALYZE",
  "PIPELINE_DONE",
];

function filterChatMessages(messages: any[]) {
  return messages.filter((m) => {
    if (INTERNAL_INTENTS.includes(m.content?.trim())) return false;
    const meta = m.metadata as any;
    if (INTERNAL_INTENTS.includes(m.intent) && !meta?.action_result?.content_id)
      return false;
    return true;
  });
}

// ──────────────────────────────────────────────
// Helper: simulate ActionCard deduplication
// (mirrors ChatWindow.tsx loaded messages reduce)
// ──────────────────────────────────────────────

function deduplicateByContentId(messages: any[]) {
  const seen = new Set<string>();
  return messages.filter((m) => {
    const cid = m.actionResult?.content_id;
    if (cid && seen.has(cid)) return false;
    if (cid) seen.add(cid);
    return true;
  });
}

// ──────────────────────────────────────────────
// Helper: simulate sourceInput URL detection
// (mirrors ChatWindow.tsx sourceInput case)
// ──────────────────────────────────────────────

function processSourceInput(value: string) {
  const sourceUrlMatch = value.match(/https?:\/\/[^\s]+/);
  if (sourceUrlMatch) {
    const cleanText = value.replace(sourceUrlMatch[0], "").trim();
    return { sourceUrl: sourceUrlMatch[0], sourceText: cleanText || undefined };
  }
  return { sourceUrl: undefined, sourceText: value };
}

// ──────────────────────────────────────────────
// Helper: simulate hasSource check
// (mirrors ChatWindow.tsx hasSourceAuto/hasSourceBrand)
// ──────────────────────────────────────────────

function hasSource(flow: { sourceUrl?: string; sourceText?: string }) {
  return !!flow.sourceUrl || (!!flow.sourceText && flow.sourceText.length >= 15);
}

// ──────────────────────────────────────────────
// Helper: simulate hasRenderableImage
// (mirrors ActionCard.tsx)
// ──────────────────────────────────────────────

function hasRenderableImage(
  slide: any,
  imageUrls?: string[]
) {
  if (imageUrls?.[0]) return true;
  if (
    slide?.render_mode === "ai_full_design" ||
    slide?.render_mode === "template_clean"
  ) {
    return Boolean(slide?.background_image_url || slide?.image_url);
  }
  return Boolean(slide?.previewImage);
}

// ══════════════════════════════════════════════
// TESTS
// ══════════════════════════════════════════════

describe("Chat history filter", () => {
  it("preserves ActionCard messages with content_id even if intent is INICIAR_GERACAO", () => {
    const messages = [
      {
        content: "✅ Conteúdo criado! A imagem está sendo gerada... 🎨",
        intent: "INICIAR_GERACAO",
        metadata: { action_result: { content_id: "abc-123", content_type: "post" } },
      },
    ];
    const filtered = filterChatMessages(messages);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].metadata.action_result.content_id).toBe("abc-123");
  });

  it("filters out PIPELINE_DONE messages (no action_result)", () => {
    const messages = [
      {
        content: "✅ Imagem gerada! Confira o resultado acima.",
        intent: "PIPELINE_DONE",
        metadata: { pipeline_content_id: "abc-123" },
      },
    ];
    const filtered = filterChatMessages(messages);
    expect(filtered).toHaveLength(0);
  });

  it("filters out messages where content IS an internal intent name", () => {
    const messages = [
      { content: "PIPELINE_BACKGROUND", intent: null, metadata: {} },
      { content: "INICIAR_GERACAO", intent: null, metadata: {} },
    ];
    const filtered = filterChatMessages(messages);
    expect(filtered).toHaveLength(0);
  });

  it("preserves normal user and assistant messages", () => {
    const messages = [
      { content: "Cria um post sobre IA", intent: null, metadata: {} },
      { content: "Claro! Para qual plataforma?", intent: "CONVERSA_LIVRE", metadata: {} },
    ];
    const filtered = filterChatMessages(messages);
    expect(filtered).toHaveLength(2);
  });

  it("filters PIPELINE_BACKGROUND response that had content_id (old bug)", () => {
    const messages = [
      {
        content: "Pipeline de imagem iniciado em background.",
        intent: "PIPELINE_BACKGROUND",
        metadata: { action_result: { pipeline_started: true } }, // no content_id
      },
    ];
    const filtered = filterChatMessages(messages);
    expect(filtered).toHaveLength(0);
  });
});

describe("ActionCard deduplication", () => {
  it("keeps first message per content_id, removes duplicates", () => {
    const messages = [
      { actionResult: { content_id: "abc-123" }, content: "first" },
      { actionResult: { content_id: "abc-123" }, content: "duplicate" },
      { actionResult: { content_id: "def-456" }, content: "different" },
    ];
    const deduped = deduplicateByContentId(messages);
    expect(deduped).toHaveLength(2);
    expect(deduped[0].content).toBe("first");
    expect(deduped[1].content).toBe("different");
  });

  it("preserves messages without content_id", () => {
    const messages = [
      { content: "normal message" },
      { actionResult: { content_id: "abc" }, content: "card" },
      { content: "another normal" },
    ];
    const deduped = deduplicateByContentId(messages);
    expect(deduped).toHaveLength(3);
  });
});

describe("sourceInput URL detection", () => {
  it("detects URL and sets sourceUrl", () => {
    const result = processSourceInput("https://example.com/article-about-ai");
    expect(result.sourceUrl).toBe("https://example.com/article-about-ai");
    expect(result.sourceText).toBeUndefined();
  });

  it("extracts URL from mixed text", () => {
    const result = processSourceInput(
      "Veja esse artigo https://example.com/ai sobre IA no Brasil"
    );
    expect(result.sourceUrl).toBe("https://example.com/ai");
    expect(result.sourceText).toBe("Veja esse artigo  sobre IA no Brasil");
  });

  it("treats plain text as sourceText", () => {
    const result = processSourceInput("Hospitais do RS");
    expect(result.sourceUrl).toBeUndefined();
    expect(result.sourceText).toBe("Hospitais do RS");
  });

  it("handles URL-only input", () => {
    const result = processSourceInput("https://g1.globo.com/tech/ia");
    expect(result.sourceUrl).toBe("https://g1.globo.com/tech/ia");
    expect(result.sourceText).toBeUndefined();
  });
});

describe("hasSource check (skip sourceInput step)", () => {
  it("recognizes sourceUrl as valid source", () => {
    expect(hasSource({ sourceUrl: "https://example.com" })).toBe(true);
  });

  it("recognizes long sourceText as valid source", () => {
    expect(hasSource({ sourceText: "Hospitais do Rio Grande do Sul e seus desafios" })).toBe(true);
  });

  it("rejects short sourceText without URL", () => {
    expect(hasSource({ sourceText: "teste" })).toBe(false);
  });

  it("rejects empty flow", () => {
    expect(hasSource({})).toBe(false);
  });

  it("sourceUrl takes priority even with empty sourceText", () => {
    expect(hasSource({ sourceUrl: "https://example.com", sourceText: "" })).toBe(true);
  });
});

describe("hasRenderableImage (ActionCard polling)", () => {
  it("stops polling when image_urls has composite", () => {
    expect(hasRenderableImage({}, ["https://img.com/composite.png"])).toBe(true);
  });

  it("stops polling for ai_full_design with background", () => {
    expect(
      hasRenderableImage({ render_mode: "ai_full_design", background_image_url: "url" })
    ).toBe(true);
  });

  it("stops polling for template_clean with background", () => {
    expect(
      hasRenderableImage({ render_mode: "template_clean", image_url: "url" })
    ).toBe(true);
  });

  it("does NOT stop polling on background-only for compose mode", () => {
    expect(
      hasRenderableImage({ render_mode: "ai_background", background_image_url: "url" })
    ).toBe(false);
  });

  it("does NOT stop polling when no images at all", () => {
    expect(hasRenderableImage({})).toBe(false);
  });

  it("detects deleted content (null slide)", () => {
    // When data is null, checkExisting sets contentDeleted — tested separately
    expect(hasRenderableImage(null)).toBe(false);
  });
});

describe("Edge function logic: theme vs niche", () => {
  // Simulates the sourceBlock fallback in generate-content
  function buildSourceBlock(trend: { title: string; description?: string; fullContent?: string }) {
    const fullContent = trend.fullContent || "";
    if (fullContent) {
      return `CONTEÚDO COMPLETO DA FONTE: ${fullContent.substring(0, 100)}`;
    }
    return `TEMA SOLICITADO PELO USUÁRIO (PRIORIDADE MÁXIMA): ${trend.title}`;
  }

  it("uses fullContent when available (link flow)", () => {
    const block = buildSourceBlock({
      title: "IA no mundo corporativo",
      fullContent: "Artigo completo sobre IA no mundo corporativo com dados e estatísticas...",
    });
    expect(block).toContain("CONTEÚDO COMPLETO");
    expect(block).toContain("Artigo completo");
  });

  it("marks short topic as PRIORIDADE MÁXIMA (button flow)", () => {
    const block = buildSourceBlock({ title: "Hospitais do RS" });
    expect(block).toContain("PRIORIDADE MÁXIMA");
    expect(block).toContain("Hospitais do RS");
  });

  it("does NOT include niche in sourceBlock", () => {
    const block = buildSourceBlock({ title: "Marketing Digital" });
    expect(block).not.toContain("heart surgery");
    expect(block).not.toContain("cardiologia");
  });
});

describe("Carousel: consistent render_mode across slides", () => {
  // Simulates Phase 3 slide update logic
  function updateSlides(
    slides: any[],
    slideImageMap: Record<string, string>,
    dbSlideRows: { id: string; slide_index: number }[],
    pipeBackgroundOnly: boolean
  ) {
    const updated = [...slides];
    for (const row of dbSlideRows) {
      const imgUrl = slideImageMap[row.id];
      if (updated[row.slide_index]) {
        if (imgUrl) {
          updated[row.slide_index] = {
            ...updated[row.slide_index],
            image_url: imgUrl,
            background_image_url: imgUrl,
            image_stale: false,
            ...(pipeBackgroundOnly ? {} : { render_mode: "ai_full_design" }),
          };
        } else if (!pipeBackgroundOnly) {
          updated[row.slide_index] = {
            ...updated[row.slide_index],
            render_mode: "ai_full_design",
            image_stale: true,
          };
        }
      }
    }
    return updated;
  }

  it("all slides get ai_full_design even when some fail", () => {
    const slides = [{}, {}, {}, {}];
    const imageMap: Record<string, string> = {
      "slide-1": "img1.png",
      "slide-2": "img2.png",
      // slide-3 FAILED — no image
      "slide-4": "img4.png",
    };
    const dbRows = [
      { id: "slide-1", slide_index: 0 },
      { id: "slide-2", slide_index: 1 },
      { id: "slide-3", slide_index: 2 },
      { id: "slide-4", slide_index: 3 },
    ];

    const result = updateSlides(slides, imageMap, dbRows, false);

    // ALL slides should have render_mode: "ai_full_design"
    for (let i = 0; i < 4; i++) {
      expect(result[i].render_mode).toBe("ai_full_design");
    }

    // Failed slide should be marked stale
    expect(result[2].image_stale).toBe(true);
    expect(result[2].image_url).toBeUndefined();

    // Successful slides should have images
    expect(result[0].image_url).toBe("img1.png");
    expect(result[3].image_url).toBe("img4.png");
  });

  it("background-only mode does not force render_mode on failed slides", () => {
    const slides = [{}, {}];
    const imageMap: Record<string, string> = { "slide-1": "bg.png" };
    const dbRows = [
      { id: "slide-1", slide_index: 0 },
      { id: "slide-2", slide_index: 1 },
    ];

    const result = updateSlides(slides, imageMap, dbRows, true);
    expect(result[0].image_url).toBe("bg.png");
    expect(result[0].render_mode).toBeUndefined();
    expect(result[1].render_mode).toBeUndefined();
  });
});
