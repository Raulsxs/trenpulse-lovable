-- Per-user override for image generation: when set, generate-slide-images uses this
-- key against Google AI Studio directly (gemini-2.5-flash-image / nano banana)
-- instead of inference.sh. Lets paying clients with their own Google Cloud quota
-- bypass our shared inference.sh credit pool.
--
-- Stored in plaintext (low blast radius — only Gemini scope, easy to rotate).
-- DO NOT log this field in console output.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gemini_api_key TEXT;

COMMENT ON COLUMN public.profiles.gemini_api_key IS
  'Optional per-user Google AI Studio API key. When set, generate-slide-images bypasses inference.sh and calls Gemini natively. Rotate via Google AI Studio if leaked.';
