/**
 * Centralized AI Gateway configuration for TrendPulse.
 *
 * Supports two providers (auto-detected from env vars):
 * 1. Google AI Studio (GOOGLE_AI_API_KEY) — direct access, no intermediary
 * 2. Lovable Gateway (LOVABLE_API_KEY) — legacy, used in Lovable Cloud
 *
 * Both use OpenAI-compatible chat/completions format.
 *
 * Usage in edge functions:
 *   import { getAIConfig, resolveModel } from "../_shared/ai-gateway.ts";
 *   const ai = getAIConfig();
 *   const resp = await fetch(ai.url, {
 *     headers: { Authorization: `Bearer ${ai.apiKey}`, "Content-Type": "application/json" },
 *     body: JSON.stringify({ model: resolveModel("google/gemini-2.5-flash"), messages: [...] }),
 *   });
 */

interface AIConfig {
  url: string;
  apiKey: string;
  provider: "google" | "lovable";
}

let _cached: AIConfig | null = null;

export function getAIConfig(): AIConfig {
  if (_cached) return _cached;

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

  throw new Error("No AI API key configured. Set GOOGLE_AI_API_KEY or LOVABLE_API_KEY.");
}

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
