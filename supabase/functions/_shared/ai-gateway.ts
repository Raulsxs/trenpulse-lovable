/**
 * Centralized AI Gateway configuration for TrendPulse.
 *
 * Supports three providers (priority order):
 * 1. inference.sh (INFERENCE_SH_API_KEY) — primary, text + image generation
 * 2. Google AI Studio (GOOGLE_AI_API_KEY) — direct access, no intermediary
 * 3. Lovable Gateway (LOVABLE_API_KEY) — legacy fallback
 *
 * Usage in edge functions:
 *   import { fetchAI, getAIConfig, resolveModel } from "../_shared/ai-gateway.ts";
 *
 *   // Text generation:
 *   const result = await fetchAI({
 *     model: "google/gemini-2.5-flash",
 *     messages: [{ role: "user", content: "Hello" }],
 *   });
 *   const text = result.choices[0].message.content;
 *
 *   // Image generation (via inference.sh or Google/Lovable fallback):
 *   const result = await fetchAI({
 *     model: "google/gemini-2.5-flash-image",
 *     messages: [{ role: "user", content: "draw a cat" }],
 *     modalities: ["image", "text"],
 *   });
 *   const imageUrl = result.choices[0].message.images?.[0]?.image_url?.url;
 */

interface AIConfig {
  url: string;
  apiKey: string;
  provider: "inference" | "google" | "lovable";
}

/** inference.sh app IDs */
const INFERENCE_CHAT_APP = "openrouter/minimax-m-25@4fjnhng9";
const INFERENCE_IMAGE_APP = "google/gemini-2-5-flash-image@19ht2vsk";
const INFERENCE_IMAGE_APP_PREMIUM = "google/gemini-3-1-flash-image-preview@7f5j281b";

/** Map OpenAI model names to inference.sh image apps */
const INFERENCE_IMAGE_APP_MAP: Record<string, string> = {
  "google/gemini-2.5-flash-image": INFERENCE_IMAGE_APP,
  "google/gemini-3-pro-image-preview": INFERENCE_IMAGE_APP_PREMIUM,
  "google/gemini-3-1-flash-image-preview": INFERENCE_IMAGE_APP_PREMIUM,
};

let _cached: AIConfig | null = null;
let _cachedFallback: AIConfig | null = null;

/**
 * Get the primary AI config. Priority: inference.sh > Google > Lovable.
 */
export function getAIConfig(): AIConfig {
  if (_cached) return _cached;

  const inferenceKey = Deno.env.get("INFERENCE_SH_API_KEY");
  if (inferenceKey) {
    _cached = {
      url: "https://api.inference.sh/run",
      apiKey: inferenceKey,
      provider: "inference",
    };
    return _cached;
  }

  const googleKey = Deno.env.get("GOOGLE_AI_API_KEY");
  if (googleKey) {
    _cached = {
      url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      apiKey: googleKey,
      provider: "google",
    };
    return _cached;
  }

  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (lovableKey) {
    _cached = {
      url: "https://ai.gateway.lovable.dev/v1/chat/completions",
      apiKey: lovableKey,
      provider: "lovable",
    };
    return _cached;
  }

  throw new Error("No AI API key configured. Set INFERENCE_SH_API_KEY, GOOGLE_AI_API_KEY, or LOVABLE_API_KEY.");
}

/**
 * Get fallback AI config (skips inference.sh). Priority: Google > Lovable.
 */
export function getFallbackAIConfig(): AIConfig {
  if (_cachedFallback) return _cachedFallback;

  const googleKey = Deno.env.get("GOOGLE_AI_API_KEY");
  if (googleKey) {
    _cachedFallback = {
      url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      apiKey: googleKey,
      provider: "google",
    };
    return _cachedFallback;
  }

  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (lovableKey) {
    _cachedFallback = {
      url: "https://ai.gateway.lovable.dev/v1/chat/completions",
      apiKey: lovableKey,
      provider: "lovable",
    };
    return _cachedFallback;
  }

  throw new Error("No fallback AI API key configured. Set GOOGLE_AI_API_KEY or LOVABLE_API_KEY.");
}

// Keep backward compatibility
export const getImageAIConfig = getFallbackAIConfig;

/**
 * Resolve model name based on provider.
 * Google AI Studio uses different model identifiers than Lovable Gateway.
 */
export function resolveModel(model: string): string {
  const config = getAIConfig();
  if (config.provider !== "google") return model;

  const map: Record<string, string> = {
    "google/gemini-2.5-flash": "gemini-2.5-flash",
    "google/gemini-2.5-flash-lite": "gemini-2.5-flash",
    "google/gemini-3-pro-image-preview": "gemini-2.0-flash",
  };
  return map[model] || model;
}

// ── OpenAI-compatible types (used by callers) ──

interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

interface FetchAIRequest {
  model: string;
  messages: OpenAIMessage[];
  modalities?: string[];
  [key: string]: unknown;
}

interface OpenAIChoice {
  message: {
    content: string;
    images?: Array<{ image_url: { url: string } }>;
  };
}

interface FetchAIResponse {
  ok: boolean;
  status: number;
  choices: OpenAIChoice[];
  raw?: unknown;
}

// ── Format translation helpers ──

function openaiToInference(messages: OpenAIMessage[]): {
  system_prompt: string;
  context: Array<{ role: string; content: Array<{ text: string; type: string }> }>;
  text: string;
  images: string[];
} {
  let system_prompt = "";
  const context: Array<{ role: string; content: Array<{ text: string; type: string }> }> = [];
  const images: string[] = [];

  // Extract system prompt
  const systemMsgs = messages.filter((m) => m.role === "system");
  if (systemMsgs.length > 0) {
    system_prompt = typeof systemMsgs[0].content === "string"
      ? systemMsgs[0].content
      : systemMsgs[0].content.filter((p) => p.type === "text").map((p) => p.text).join("\n");
  }

  // Non-system messages
  const chatMsgs = messages.filter((m) => m.role !== "system");

  // All except last go into context
  for (let i = 0; i < chatMsgs.length - 1; i++) {
    const msg = chatMsgs[i];
    const textContent = typeof msg.content === "string"
      ? msg.content
      : msg.content.filter((p) => p.type === "text").map((p) => p.text).join("\n");
    context.push({
      role: msg.role,
      content: [{ text: textContent, type: "text" }],
    });
  }

  // Last message becomes `text`
  const lastMsg = chatMsgs[chatMsgs.length - 1];
  let text = "";
  if (lastMsg) {
    if (typeof lastMsg.content === "string") {
      text = lastMsg.content;
    } else {
      const parts: string[] = [];
      for (const part of lastMsg.content) {
        if (part.type === "text" && part.text) {
          parts.push(part.text);
        } else if (part.type === "image_url" && part.image_url?.url) {
          images.push(part.image_url.url);
        }
      }
      text = parts.join("\n");
    }
  }

  // Also extract images from earlier messages
  for (const msg of chatMsgs.slice(0, -1)) {
    if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === "image_url" && part.image_url?.url) {
          images.push(part.image_url.url);
        }
      }
    }
  }

  return { system_prompt, context, text, images };
}

/**
 * Extract prompt text from OpenAI messages for image generation.
 */
function extractPromptForImage(messages: OpenAIMessage[]): string {
  // Use the last user message as the prompt
  const userMsgs = messages.filter((m) => m.role === "user");
  const lastMsg = userMsgs[userMsgs.length - 1];
  if (!lastMsg) return "";
  if (typeof lastMsg.content === "string") return lastMsg.content;
  return lastMsg.content.filter((p) => p.type === "text").map((p) => p.text).join("\n");
}

/**
 * High-level AI fetch that works with any configured provider.
 *
 * Accepts OpenAI-compatible format. Automatically routes to the best provider:
 * - Text: inference.sh (chat app) > Google > Lovable
 * - Image: inference.sh (image app) > Google > Lovable
 */
export async function fetchAI(request: FetchAIRequest): Promise<FetchAIResponse> {
  const hasImageModality = request.modalities?.includes("image");
  const config = getAIConfig();

  if (hasImageModality && config.provider === "inference") {
    return fetchInferenceImage(config, request);
  }

  if (hasImageModality) {
    // Google / Lovable for images
    return fetchOpenAICompatible(config, request);
  }

  // Text generation
  if (config.provider === "inference") {
    return fetchInference(config, request);
  }

  return fetchOpenAICompatible(config, request);
}

async function fetchOpenAICompatible(config: AIConfig, request: FetchAIRequest): Promise<FetchAIResponse> {
  const model = config.provider === "google" ? resolveModelForGoogle(request.model) : request.model;

  const res = await fetch(config.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...request, model }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[ai-gateway] ${config.provider} error [${res.status}]: ${errText.substring(0, 300)}`);

    // If Google fails, try Lovable
    if (config.provider === "google") {
      const lovableKey = Deno.env.get("LOVABLE_API_KEY");
      if (lovableKey) {
        console.warn("[ai-gateway] Google failed, falling back to Lovable Gateway");
        return fetchOpenAICompatible({
          url: "https://ai.gateway.lovable.dev/v1/chat/completions",
          apiKey: lovableKey,
          provider: "lovable",
        }, request);
      }
    }

    return { ok: false, status: res.status, choices: [{ message: { content: "" } }] };
  }

  const data = await res.json();
  return {
    ok: true,
    status: res.status,
    choices: data.choices || [{ message: { content: "" } }],
    raw: data,
  };
}

// ── inference.sh text (chat) ──

async function fetchInference(config: AIConfig, request: FetchAIRequest): Promise<FetchAIResponse> {
  const { system_prompt, context, text, images } = openaiToInference(request.messages);

  const body: Record<string, unknown> = {
    app: INFERENCE_CHAT_APP,
    wait: true,
    input: {
      text,
      system_prompt: system_prompt || "you are a helpful assistant that can answer questions and help with tasks.",
      context,
      stream: false,
      temperature: 0.7,
      max_tokens: 64000,
      ...(images.length > 0 ? { images } : {}),
    },
  };

  console.log(`[ai-gateway] inference.sh chat: app=${INFERENCE_CHAT_APP}, textLen=${text.length}, contextLen=${context.length}, images=${images.length}`);

  const res = await fetch(config.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[ai-gateway] inference.sh chat error [${res.status}]: ${errText.substring(0, 300)}`);

    // Fallback to Google or Lovable
    console.warn("[ai-gateway] inference.sh chat failed, trying fallback...");
    try {
      return fetchOpenAICompatible(getFallbackAIConfig(), request);
    } catch {
      return { ok: false, status: res.status, choices: [{ message: { content: "" } }] };
    }
  }

  const data = await res.json();
  // With wait:true, response is in data.data.output.response
  // Without wait, it's in data.output.response
  const responseText = data.data?.output?.response || data.output?.response || data.response || "";

  console.log(`[ai-gateway] inference.sh chat response: ${responseText.length} chars, keys: ${JSON.stringify(Object.keys(data))}`);

  // If inference.sh returns 200 but empty content, fallback to Google/Lovable
  if (!responseText || responseText.trim().length === 0) {
    console.warn("[ai-gateway] inference.sh returned empty response (200), trying fallback...");
    try {
      return fetchOpenAICompatible(getFallbackAIConfig(), request);
    } catch {
      return { ok: true, status: 200, choices: [{ message: { content: "" } }] };
    }
  }

  return {
    ok: true,
    status: 200,
    choices: [{
      message: {
        content: responseText,
      },
    }],
    raw: data,
  };
}

// ── inference.sh image generation ──

async function fetchInferenceImage(config: AIConfig, request: FetchAIRequest): Promise<FetchAIResponse> {
  const prompt = extractPromptForImage(request.messages);
  const app = INFERENCE_IMAGE_APP_MAP[request.model] || INFERENCE_IMAGE_APP;

  const body: Record<string, unknown> = {
    app,
    wait: true,
    input: {
      prompt,
      num_images: 1,
      aspect_ratio: "1:1",
      safety_tolerance: "BLOCK_MEDIUM_AND_ABOVE",
    },
  };

  console.log(`[ai-gateway] inference.sh image: app=${app}, promptLen=${prompt.length}`);

  const res = await fetch(config.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[ai-gateway] inference.sh image error [${res.status}]: ${errText.substring(0, 300)}`);

    // Fallback to Google/Lovable for image generation
    console.warn("[ai-gateway] inference.sh image failed, trying fallback...");
    try {
      return fetchOpenAICompatible(getFallbackAIConfig(), request);
    } catch {
      return { ok: false, status: res.status, choices: [{ message: { content: "" } }] };
    }
  }

  const data = await res.json();
  // With wait:true, data is in data.data.output
  const output = data.data?.output || data.output || {};
  const images = output.images || data.images || [];
  const description = output.description || data.description || "";

  console.log(`[ai-gateway] inference.sh image response: ${images.length} images, desc=${description.length} chars`);

  // Normalize to OpenAI image format (choices[0].message.images[0].image_url.url)
  const normalizedImages = images.map((img: string) => ({
    image_url: { url: img },
  }));

  return {
    ok: true,
    status: 200,
    choices: [{
      message: {
        content: description,
        images: normalizedImages.length > 0 ? normalizedImages : undefined,
      },
    }],
    raw: data,
  };
}

function resolveModelForGoogle(model: string): string {
  const map: Record<string, string> = {
    "google/gemini-2.5-flash": "gemini-2.5-flash",
    "google/gemini-2.5-flash-lite": "gemini-2.5-flash",
    "google/gemini-3-pro-image-preview": "gemini-2.0-flash",
  };
  return map[model] || model;
}
