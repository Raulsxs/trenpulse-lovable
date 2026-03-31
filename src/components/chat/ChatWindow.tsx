import { useState, useEffect, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import ChatMessage from "./ChatMessage";
import ChatInput from "./ChatInput";
import GenerationFlowStep from "./GenerationFlowStep";
import BrandAnalysisLoader from "./BrandAnalysisLoader";
import { useGenerationFlow } from "@/hooks/useGenerationFlow";
import { Sparkles, ArrowDown, X, MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import SmartNudge from "./SmartNudge";
import type { GenerationDefaultsData } from "./GenerationDefaults";

interface ActionResult {
  content_id?: string;
  content_type?: "post" | "carousel" | "story" | "cron_config";
  platform?: string;
  preview_image_url?: string;
  headline?: string;
  detected_url?: string;
  awaiting_choice?: boolean;
  navigate_to?: string;
}

interface Message {
  id?: string;
  role: "user" | "assistant";
  content: string;
  intent?: string;
  isLoading?: boolean;
  actionResult?: ActionResult;
  quickReplies?: string[];
  isRetryable?: boolean;
  retryText?: string;
  whatsappConfirm?: string | null;
  timestamp?: string;
}

const formatTime = (date?: string | null) => {
  if (!date) return undefined;
  return new Date(date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
};

const ONBOARDING_QUESTIONS: Record<number, string> = {
  0: "Olá! 👋 Sou sua assistente de conteúdo. Para personalizar tudo para você, preciso de algumas informações.\n\nComece me dizendo:\n1. **Seu nome** (como quer ser chamado/a)\n2. **Seu @ do Instagram** (ex: @seuperfil)\n\nPor favor, envie os dois! 😊",
  1: "Prazer! 😊 Agora me conta: **qual é o seu nicho ou área de atuação?**\n\nSeja específico para que eu possa criar conteúdos relevantes.\n\nExemplos: *tecnologia, marketing digital, gastronomia, advocacia, educação, moda, fitness, arquitetura, psicologia...*",
  2: "Entendi! Qual **tom de comunicação** você prefere para seus posts?\n\n• **Informal** — descontraído e próximo\n• **Formal** — técnico e profissional\n• **Inspiracional** — motivador e envolvente\n• **Educativo** — didático e informativo\n\nVocê também pode descrever com suas palavras! Ex: *informal mas com autoridade*",
  3: "Perfeito! Quais **temas de conteúdo** você gostaria de abordar? (pode listar vários separados por vírgula)\n\nPense no que seu público quer ver. Exemplos para te inspirar:\n• *novidades do setor, dicas práticas, bastidores, cases de sucesso, tutoriais, tendências, opinião, lifestyle...*",
  4: "Tem algum **site, portal de notícias, blog ou perfil do Instagram** que você acompanha e quer que eu monitore para sugerir conteúdos? 📰\n\nEx: *tecmundo.com.br, canaltech.com.br, @umperfilx*\n\n(pode pular digitando **não**)",
  5: "Última pergunta! Quantos posts por semana você pretende publicar e em qual horário prefere receber sugestões automáticas?\n\nExemplo: *3x por semana, às 9h da manhã*",
};

const ONBOARDING_RETRY_MESSAGES: Record<number, string> = {
  0: "Preciso do seu **nome** e do **@ do Instagram** para continuar. 😊\n\nPode enviar assim: *João @joaoperfil*",
  1: "Preciso entender melhor. Descreva em poucas palavras **o que você ou seu negócio faz**. Ex: *agência de marketing digital*, *personal trainer*, *loja de roupas*...",
  3: "Pode listar pelo menos **um tema** que gostaria de abordar? Ex: *dicas práticas, novidades, bastidores, tutoriais*...",
};

const buildCompletionMsg = (data: { name?: string; handle?: string; niche?: string; voice?: string; topics?: string[]; sources?: string[]; qty?: number }) => {
  const sourcesText = data.sources && data.sources.length > 0 ? data.sources.join(", ") : "nenhuma por enquanto";
  return `✅ **Perfil criado!** Aqui está o que configurei para você:\n\n` +
    `- **Nome:** ${data.name || "—"}\n` +
    `- **Instagram:** ${data.handle || "—"}\n` +
    `- **Nicho:** ${data.niche || "—"}\n` +
    `- **Tom:** ${data.voice || "—"}\n` +
    `- **Temas:** ${data.topics?.join(", ") || "—"}\n` +
    `- **Fontes monitoradas:** ${sourcesText}\n` +
    `- **Posts por semana:** ${data.qty || 3}\n\n` +
    `Quer ajustar alguma informação ou posso começar a trabalhar? 🚀\n\n` +
    `💡 **Dica rápida:** você pode me enviar links de notícias ou artigos e eu transformo em post, carrossel ou story automaticamente. Experimente colar um link aqui!`;
};

const QUICK_SUGGESTIONS = [
  "✨ Criar conteúdo",
  "📸 Criar um post",
  "🎠 Criar um carrossel",
  "📱 Criar um story",
  "🔗 Tenho um link",
];

const GENERATION_PATTERNS = /\b(cri(?:a|e|ar)|gerar?|fa(?:z|ça|zer)|quero\s+um|fazer?\s+um|preciso\s+de\s+um)\b.*\b(post|carrossel|carousel|story|stories|conteúdo|conteudo)\b/i;

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 12) return "Bom dia! ☀️ Vamos criar conteúdo hoje? Posso sugerir algumas ideias ou você tem algo em mente?";
  if (hour >= 12 && hour < 18) return "Olá! 👋 Que bom te ver. Quer criar algo novo ou ver o que está agendado?";
  if (hour >= 18 && hour <= 23) return "Boa noite! 🌙 Posso preparar conteúdo para amanhã. O que acha?";
  return "Olá! 👋 Como posso ajudar hoje?";
}

export default function ChatWindow() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [onboardingStep, setOnboardingStep] = useState<number | null>(null);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [cronBanner, setCronBanner] = useState<Message | null>(null);
  const [brandCreationStep, setBrandCreationStep] = useState<number | null>(null);
  const [nudgeContext, setNudgeContext] = useState({ hasBrand: true, hasSocialConnection: true, contentCount: 0 });
  const [generationDefaults, setGenerationDefaults] = useState<GenerationDefaultsData>({
    defaultBrandId: null, defaultBrandName: null, defaultPlatform: null,
    defaultContentStyle: "news", defaultFormat: null,
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasLoadedHistory = useRef(false);
  const lastActiveContentId = useRef<string | null>(null);

  const genFlow = useGenerationFlow();

  // Scroll tracking
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setIsAtBottom(atBottom);
    if (atBottom) setShowScrollBtn(false);
  }, []);

  const scrollToBottom = useCallback((instant = false) => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: instant ? "instant" : "smooth" });
    setShowScrollBtn(false);
  }, []);

  // ── Nudge context — check if user has brand + social connection ──
  useEffect(() => {
    if (!userId) return;
    Promise.all([
      supabase.from("brands").select("id").eq("owner_user_id", userId).limit(1),
      supabase.from("instagram_connections").select("id").eq("user_id", userId).eq("is_active", true).limit(1),
      supabase.from("linkedin_connections").select("id").eq("user_id", userId).eq("is_active", true).limit(1),
      supabase.from("generated_contents").select("id").eq("user_id", userId).limit(1),
    ]).then(([brands, ig, li, contents]) => {
      setNudgeContext({
        hasBrand: (brands.data?.length || 0) > 0,
        hasSocialConnection: (ig.data?.length || 0) > 0 || (li.data?.length || 0) > 0,
        contentCount: contents.data?.length || 0,
      });
    });
  }, [userId]);

  // ── Init: load history ──
  useEffect(() => {
    if (hasLoadedHistory.current) return;

    const init = async () => {
      try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      const uid = session.user.id;
      setUserId(uid);

      const { data: ctx } = await supabase
        .from("ai_user_context")
        .select("onboarding_done, onboarding_step, extra_context")
        .eq("user_id", uid)
        .maybeSingle();

      // Load generation defaults from extra_context
      const savedDefaults = (ctx?.extra_context as any)?.generation_defaults;
      if (savedDefaults) {
        setGenerationDefaults((prev) => ({ ...prev, ...savedDefaults }));
      }

      if (!ctx || !ctx.onboarding_done) {
        // Page onboarding (/onboarding) handles this now — skip chat onboarding
        // DashboardLayout will redirect to /onboarding if needed
        if (!ctx) {
          await supabase.from("ai_user_context").insert({ user_id: uid, onboarding_step: 0, onboarding_done: false });
        }
        setOnboardingChecked(true);
        return;
      }

      setOnboardingStep(null);

      // Restaurar estado de criação de marca se estava em andamento
      const extra = (ctx?.extra_context as any) || {};
      const bc = extra?.brand_creation;
      if (bc && bc.step > 0 && bc.step <= 3) {
        setBrandCreationStep(bc.step);
      }

      // Only load messages from current conversation (if user started a "new chat")
      const conversationSince = localStorage.getItem("tp_conversation_since");
      let query = supabase
        .from("chat_messages")
        .select("*")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(50);
      if (conversationSince) {
        query = query.gte("created_at", conversationSince);
      }
      const { data: rawData } = await query;

      // Filter out internal intent messages that leaked into chat history
      const INTERNAL_INTENTS = ["PIPELINE_BACKGROUND", "INICIAR_GERACAO", "GERAR_CONTEUDO", "CRIAR_MARCA_ANALYZE", "PIPELINE_DONE", "SUGERIR_CONTEUDO", "CRIAR_SERIE", "GERAR_POST", "GERAR_CARROSSEL", "GERAR_STORY"];
      const data = (rawData || [])
        .filter((m: any) => {
          // Filter out internal messages that leaked into chat history
          if (INTERNAL_INTENTS.includes(m.content?.trim())) return false;
          // Filter by intent ONLY if the message has no actionable content (no action_result with content_id)
          // Messages with intent=INICIAR_GERACAO that carry action_result.content_id MUST be kept — they render ActionCards
          const meta = m.metadata as any;
          if (INTERNAL_INTENTS.includes(m.intent) && !meta?.action_result?.content_id) return false;
          return true;
        })
        .slice()
        .reverse();

      // Collect content IDs that need image resolution
      const contentIdsToResolve: string[] = [];
      (data || []).forEach((m) => {
        const meta = m.metadata as any;
        const ar = meta?.action_result;
        if (ar?.content_id && ar.content_type !== "cron_config" && !meta?.resolved_image_url && !ar?.preview_image_url && !meta?.image_resolve_attempted) {
          contentIdsToResolve.push(ar.content_id);
        }
      });

      // Batch-fetch image previews
      const resolvedImages: Record<string, string> = {};
      if (contentIdsToResolve.length > 0) {
        try {
          const { data: contents } = await supabase
            .from("generated_contents")
            .select("id, image_urls, slides")
            .in("id", contentIdsToResolve);

          for (const c of contents || []) {
            const slides = (c.slides as any[]) || [];
            const url = c.image_urls?.[0]
              || slides[0]?.background_url
              || slides[0]?.background_image_url
              || slides[0]?.image_url;
            if (url) resolvedImages[c.id] = url;
          }
        } catch (err) {
          console.error("[ChatWindow] Error batch-fetching image previews:", err);
        }
      }

      // Deduplicate: only keep the FIRST message per content_id (prevents duplicate ActionCards)
      const seenContentIds = new Set<string>();
      const loaded: Message[] = (data || []).reduce<Message[]>((acc, m) => {
        const meta = m.metadata as any;
        const actionResult = meta?.action_result ? { ...meta.action_result } : undefined;
        if (actionResult?.content_id) {
          const resolvedUrl = meta?.resolved_image_url || resolvedImages[actionResult.content_id];
          if (resolvedUrl) {
            actionResult.preview_image_url = resolvedUrl;
            if (!meta?.resolved_image_url && resolvedUrl) {
              supabase.from("chat_messages")
                .update({ metadata: { ...meta, resolved_image_url: resolvedUrl } })
                .eq("id", m.id)
                .then(() => { });
            }
          } else if (!meta?.resolved_image_url && contentIdsToResolve.includes(actionResult.content_id)) {
            // Mark that we attempted resolution so we don't retry on every page load
            supabase.from("chat_messages")
              .update({ metadata: { ...meta, image_resolve_attempted: true } })
              .eq("id", m.id)
              .then(() => { });
          }
        }
        // Skip duplicate ActionCards for the same content_id
        const cid = actionResult?.content_id;
        if (cid && seenContentIds.has(cid)) {
          return acc; // duplicate — skip this message
        }
        if (cid) seenContentIds.add(cid);

        acc.push({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          intent: m.intent ?? undefined,
          actionResult,
          quickReplies: meta?.quick_replies ?? undefined,
          timestamp: formatTime(m.created_at),
        });
        return acc;
      }, []);

      const oneDayAgo = Date.now() - 24 * 3600 * 1000;
      const recentCron = (data || []).find(
        (m) => m.intent === "CRON_RECOMMENDATION" && new Date(m.created_at || 0).getTime() > oneDayAgo
      );
      if (recentCron) {
        setCronBanner({ role: "assistant", content: recentCron.content, intent: recentCron.intent ?? undefined });
      }

      if (data && data.length > 0) {
        const lastMsg = data[data.length - 1];
        const lastTime = new Date(lastMsg.created_at || 0).getTime();
        const eightHoursAgo = Date.now() - 8 * 3600 * 1000;
        if (lastTime < eightHoursAgo) {
          loaded.push({ role: "assistant", content: getGreeting() });
        }
      }

      setMessages(loaded);
      setOnboardingChecked(true);
      hasLoadedHistory.current = true;
      // Scroll to bottom instantly after loading history
      setTimeout(() => scrollToBottom(true), 100);
      } catch (err) {
        console.error("[ChatWindow] init error:", err);
        setOnboardingChecked(true);
        setMessages([{ role: "assistant", content: "Desculpe, houve um erro ao carregar o chat. Tente recarregar a página." }]);
      }
    };
    init();
  }, []);

  // ── Realtime: listen for background messages (e.g. CRIAR_MARCA_DONE) ──
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel('bg-chat-messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const newMsg = payload.new as any;
          if (newMsg?.role === 'assistant') {
            const meta = newMsg.metadata as any;

            if (newMsg.intent === 'CRIAR_MARCA_DONE') {
              setMessages((prev) => [
                ...prev,
                {
                  role: 'assistant' as const,
                  content: newMsg.content,
                  intent: newMsg.intent,
                  actionResult: meta?.action_result,
                  quickReplies: meta?.quick_replies,
                  timestamp: formatTime(newMsg.created_at),
                },
              ]);
              setBrandCreationStep(null);
              toast.success('Marca criada com sucesso! 🎨');
            }

            if (newMsg.intent === 'PIPELINE_DONE' || newMsg.intent === 'REGENERAR_IMAGEM_DONE') {
              const contentId = meta?.action_result?.content_id;
              const previewUrl = meta?.action_result?.preview_image_url;

              if (contentId) {
                // Update existing ActionCard with the generated image URL
                // Use a single setMessages call that both updates AND checks for existing card
                setMessages((prev) => {
                  const hasExisting = prev.some((msg) => msg.actionResult?.content_id === contentId);

                  if (hasExisting) {
                    // Update the existing ActionCard's preview URL
                    return prev.map((msg) => {
                      if (msg.actionResult?.content_id === contentId) {
                        return {
                          ...msg,
                          actionResult: { ...msg.actionResult, preview_image_url: previewUrl },
                        };
                      }
                      return msg;
                    });
                  }

                  // No existing card found — append as new message
                  return [
                    ...prev,
                    {
                      role: 'assistant' as const,
                      content: newMsg.content,
                      intent: newMsg.intent,
                      actionResult: meta?.action_result,
                      quickReplies: meta?.quick_replies,
                      timestamp: formatTime(newMsg.created_at),
                    },
                  ];
                });
              }
              toast.success('Imagem gerada com sucesso! 🖼️');
            }

            if (newMsg.intent === 'PIPELINE_ERROR') {
              setMessages((prev) => [
                ...prev,
                {
                  role: 'assistant' as const,
                  content: newMsg.content,
                  intent: newMsg.intent,
                  timestamp: formatTime(newMsg.created_at),
                },
              ]);
              toast.error('Erro na geração de imagem');
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const initialScrollDone = useRef(false);
  useEffect(() => {
    // Always scroll instantly on first render after history loads
    if (!initialScrollDone.current && messages.length > 0) {
      initialScrollDone.current = true;
      scrollToBottom(true);
      return;
    }
    if (isAtBottom) {
      scrollToBottom();
    } else {
      setShowScrollBtn(true);
    }
  }, [messages, genFlow.flow.phase, genFlow.flow.configStep, isAtBottom, scrollToBottom]);

  // ── Onboarding helpers ──
  const extractNameFromText = useCallback((text: string): string => {
    // Try structured patterns first: "meu nome é X", "me chamo X", "sou X", "eu sou X"
    const namePatterns = [
      /meu\s+nome\s+[eé]\s+(.+?)(?:\s+e\s+(?:meu|o|a)\s|$)/i,
      /me\s+chamo\s+(.+?)(?:\s+e\s+(?:meu|o|a)\s|$)/i,
      /(?:eu\s+)?sou\s+(?:o|a\s+)?(.+?)(?:\s+e\s+(?:meu|o|a)\s|$)/i,
    ];
    for (const pat of namePatterns) {
      const m = text.match(pat);
      if (m && m[1]) {
        const candidate = m[1].replace(/[,;!?.]/g, "").trim();
        // Take only first 2-3 words (first + last name)
        const words = candidate.split(/\s+/).filter(w => w.length > 1).slice(0, 3);
        if (words.length > 0) return words.join(" ");
      }
    }
    // Fallback: remove greetings, handles, and noise, then take first 2-3 words
    const greetings = /\b(ol[aá]|oi|hey|hi|hello|e\s*a[ií]|bom\s*dia|boa\s*tarde|boa\s*noite)\b/gi;
    const cleaned = text.replace(/@[\w.]+/g, "").replace(greetings, "").replace(/[,;!?.]/g, "").trim();
    const words = cleaned.split(/\s+/).filter(w => w.length > 1).slice(0, 3);
    return words.join(" ");
  }, []);

  const validateOnboardingAnswer = useCallback((text: string, step: number): string | null => {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length < 1) return ONBOARDING_RETRY_MESSAGES[step] || "Não entendi sua resposta. Pode tentar novamente?";
    switch (step) {
      case 0: {
        const hasHandle = /@[\w.]+/.test(trimmed);
        const name = extractNameFromText(trimmed);
        if (!hasHandle || !name || name.length < 2) return "Não consegui identificar seu nome e @ 😅 Me manda assim:\n\n*Meu nome é [nome] e meu Instagram é @[seu_perfil]*";
        return null;
      }
      case 1: return trimmed.length < 3 ? ONBOARDING_RETRY_MESSAGES[1]! : null;
      case 3: return trimmed.length < 3 ? ONBOARDING_RETRY_MESSAGES[3]! : null;
      default: return null;
    }
  }, [extractNameFromText]);

  const processOnboardingAnswer = useCallback(async (text: string, step: number) => {
    if (!userId) return;
    try {
      switch (step) {
        case 0: {
          const handleMatch = text.match(/@[\w.]+/);
          const instagramHandle = handleMatch ? handleMatch[0] : null;
          const name = extractNameFromText(text);
          await supabase.from("ai_user_context").update({ instagram_handle: instagramHandle, onboarding_step: 1 }).eq("user_id", userId);
          await supabase.from("profiles").upsert({ user_id: userId, full_name: name, instagram_handle: instagramHandle?.replace("@", "") || null }, { onConflict: "user_id" });
          break;
        }
        case 1:
          await supabase.from("ai_user_context").update({ business_niche: text.trim(), onboarding_step: 2 }).eq("user_id", userId);
          break;
        case 2:
          await supabase.from("ai_user_context").update({ brand_voice: text.trim(), onboarding_step: 3 }).eq("user_id", userId);
          break;
        case 3: {
          const topics = text.split(/[,;]/).map((t) => t.trim()).filter(Boolean);
          await supabase.from("ai_user_context").update({ content_topics: topics, onboarding_step: 4 }).eq("user_id", userId);
          break;
        }
        case 4: {
          const isSkip = /^(pular|skip|não|nao|n|nenhum|sem|nada)$/i.test(text.trim());
          if (!isSkip) {
            const sources = text.split(/[,;\n]+/).map((u) => u.trim()).filter((u) => u.length > 2);
            if (sources.length > 0) {
              await supabase.from("profiles").upsert({ user_id: userId, rss_sources: sources }, { onConflict: "user_id" });
              const { data: ctxData } = await supabase.from("ai_user_context").select("extra_context").eq("user_id", userId).maybeSingle();
              const extra = (ctxData?.extra_context as Record<string, unknown>) || {};
              await supabase.from("ai_user_context").update({
                extra_context: { ...extra, reference_sources: sources, reference_sources_raw: text.trim() },
                onboarding_step: 5,
              }).eq("user_id", userId);
            } else {
              await supabase.from("ai_user_context").update({ onboarding_step: 5 }).eq("user_id", userId);
            }
          } else {
            await supabase.from("ai_user_context").update({ onboarding_step: 5 }).eq("user_id", userId);
          }
          break;
        }
        case 5: {
          const numMatch = text.match(/(\d+)/);
          const hourMatch = text.match(/(\d{1,2})\s*h/i);
          const phoneMatch = text.match(/(\d{10,15})/);
          const qty = numMatch ? parseInt(numMatch[1]) : 3;
          const hour = hourMatch ? parseInt(hourMatch[1]) : 9;
          const whatsappNumber = phoneMatch ? phoneMatch[0] : null;
          const defaultDays = [1, 3, 5];
          const daysOfWeek = qty <= 3 ? defaultDays.slice(0, qty) : [1, 2, 3, 4, 5].slice(0, Math.min(qty, 5));
          await supabase.from("ai_cron_config").upsert({ user_id: userId, active: true, days_of_week: daysOfWeek, hour_utc: hour, qty_suggestions: qty }, { onConflict: "user_id" });
          await supabase.from("ai_user_context").update({ onboarding_done: true, onboarding_step: 6, whatsapp_number: whatsappNumber }).eq("user_id", userId);

          try {
            const { data: finalCtx } = await supabase.from("ai_user_context").select("*").eq("user_id", userId).maybeSingle();
            if (finalCtx) {
              const brandName = finalCtx.instagram_handle || "Minha Marca";
              const voice = finalCtx.brand_voice || "natural";
              const niche = finalCtx.business_niche || "geral";
              const topicsArr = (finalCtx.content_topics || []).join(", ");
              const doRules = `Tom: ${voice}. Nicho: ${niche}. Temas: ${topicsArr}`;
              const dontRules = "Evitar conteúdo genérico não relacionado ao nicho";
              const { data: existingBrands } = await supabase.from("brands").select("id").eq("owner_user_id", userId).limit(1);
              if (!existingBrands || existingBrands.length === 0) {
                const { data: newBrand } = await supabase.from("brands").insert({
                  owner_user_id: userId,
                  name: brandName,
                  visual_tone: voice,
                  do_rules: doRules,
                  dont_rules: dontRules,
                  palette: [],
                  fonts: { headings: "Inter", body: "Inter" },
                }).select("id").single();

                // Fire-and-forget: generate style pack
                if (newBrand?.id) {
                  supabase.functions.invoke("generate-style-pack", {
                    body: { brandId: newBrand.id, niche, voice },
                  }).catch(err => console.warn("Style pack generation deferred:", err));
                }
              }
            }
          } catch (brandErr) {
            console.error("Error creating brand from onboarding:", brandErr);
          }
          break;
        }
      }
    } catch (err) {
      console.error("Error saving onboarding step:", err);
    }
  }, [userId]);

  // ══════ CONFIG PHASE HANDLER ══════
  const handleConfigSelect = useCallback(async (key: string, value: any) => {
    const { flow, updateFlow, setConfigStep, setPhase, setLoading } = genFlow;

    switch (key) {
      case "platform":
        updateFlow({ platform: value });
        if (flow.contentType) {
          setConfigStep("brand");
        } else {
          setConfigStep("content_type");
        }
        break;
      case "contentType":
        updateFlow({ contentType: value });
        setConfigStep("brand");
        break;
      case "brand_auto": {
        const brandMeta = value;
        updateFlow({
          brandId: brandMeta.id,
          brandName: brandMeta.name,
          brandCreationMode: brandMeta.creation_mode || null,
          brandDefaultVisualStyle: brandMeta.default_visual_style || null,
        });
        // Determine next step based on source + brand default
        // sourceUrl (link) OR meaningful sourceText (>= 15 chars) skips source_input
        const hasSourceAuto = flow.sourceUrl || (flow.sourceText && flow.sourceText.length >= 15);
        // Content style comes from defaults (no more asking)
        if (!flow.contentStyle) updateFlow({ contentStyle: (generationDefaults.defaultContentStyle as any) || "news" });
        if (!hasSourceAuto) {
          // No real source → ask for it
          setConfigStep("source_input");
        } else {
          // If brand has a default visual style, skip visual_style step
          if (brandMeta.default_visual_style) {
            updateFlow({ visualStyle: brandMeta.default_visual_style });
            // photo_overlay needs photo source selection
            if (brandMeta.default_visual_style === "photo_overlay") {
              setConfigStep("photo_source");
            } else if (brandMeta.default_visual_style === "template_clean") {
              const ct = flow.contentType;
              if (ct === "carousel" || ct === "document") {
                setConfigStep("slide_count");
              } else {
                startGeneration({ visualStyle: brandMeta.default_visual_style });
                return;
              }
            } else if (brandMeta.default_visual_style === "ai_full_design") {
              const ct = flow.contentType;
              if (ct === "carousel" || ct === "document") {
                setConfigStep("slide_count");
              } else {
                startGeneration({ visualStyle: brandMeta.default_visual_style });
                return;
              }
            } else {
              // ai_background — proceed to source_input or visual generation
              const ct = flow.contentType;
              if (ct === "carousel" || ct === "document") {
                setConfigStep("slide_count");
              } else {
                setConfigStep("background_mode");
              }
            }
          } else {
            setConfigStep("visual_style");
          }
        }
        break;
      }
      case "brandId": {
        const brandObj = typeof value === "string" ? { id: value } : value;
        updateFlow({
          brandId: brandObj.id,
          brandName: brandObj.name || null,
          brandCreationMode: brandObj.creation_mode || null,
          brandDefaultVisualStyle: brandObj.default_visual_style || null,
        });
        const hasSourceBrand = flow.sourceUrl || (flow.sourceText && flow.sourceText.length >= 15);
        if (hasSourceBrand) {
          if (!flow.contentStyle) updateFlow({ contentStyle: "news" });
          // If brand has default visual style, skip the question
          if (brandObj.default_visual_style) {
            updateFlow({ visualStyle: brandObj.default_visual_style });
            if (brandObj.default_visual_style === "photo_overlay") {
              setConfigStep("photo_source");
            } else if (brandObj.default_visual_style === "template_clean" || brandObj.default_visual_style === "ai_full_design") {
              const ct = flow.contentType;
              if (ct === "carousel" || ct === "document") {
                setConfigStep("slide_count");
              } else {
                startGeneration({ visualStyle: brandObj.default_visual_style });
                return;
              }
            } else {
              const ct = flow.contentType;
              if (ct === "carousel" || ct === "document") {
                setConfigStep("slide_count");
              } else {
                setConfigStep("background_mode");
              }
            }
          } else {
            setConfigStep("visual_style");
          }
        } else {
          // No real source → ask for it (content style comes from defaults)
          if (!flow.contentStyle) updateFlow({ contentStyle: (generationDefaults.defaultContentStyle as any) || "news" });
          setConfigStep("source_input");
        }
        break;
      }
      case "brand_skip":
        // Explicitly set brandId to "none" so backend doesn't auto-resolve
        updateFlow({ brandId: "none", brandName: null });
        if (!flow.contentStyle) updateFlow({ contentStyle: (generationDefaults.defaultContentStyle as any) || "news" });
        if (flow.sourceUrl || (flow.sourceText && flow.sourceText.length >= 15)) {
          if (!flow.contentStyle) updateFlow({ contentStyle: "news" });
          setConfigStep("visual_style");
        } else {
          setConfigStep("source_input");
        }
        break;
      case "contentStyle": {
        updateFlow({ contentStyle: value });
        // Check if we need source text input
        const hasUrlCS = flow.sourceUrl || (flow.sourceText && /https?:\/\/[^\s]+/.test(flow.sourceText));
        const isButtonTextCS = !flow.sourceText || flow.sourceText.length < 20
          || /^[\p{Emoji}\s]*(criar|gerar|fazer|quero|preciso|me |um |uma |novo|nova)\s/iu.test(flow.sourceText.trim());
        const hasRealSourceCS = hasUrlCS || (flow.sourceText && flow.sourceText.length >= 20 && !isButtonTextCS);

        // Always ask for source input unless user already pasted a real URL or long text
        if (value === "quote" || !hasRealSourceCS) {
          setConfigStep("source_input");
        } else {
          // Has real source — check if brand has visual style default
          const brandDefaultCS = flow.brandDefaultVisualStyle;
          if (brandDefaultCS) {
            updateFlow({ visualStyle: brandDefaultCS as any });
            if (brandDefaultCS === "photo_overlay") {
              setConfigStep("photo_source");
            } else if (brandDefaultCS === "template_clean" || brandDefaultCS === "ai_full_design") {
              const ctCS = flow.contentType;
              if (ctCS === "carousel" || ctCS === "document") {
                setConfigStep("slide_count");
              } else {
                startGeneration({ contentStyle: value, visualStyle: brandDefaultCS });
                return;
              }
            } else {
              const ctCS = flow.contentType;
              if (ctCS === "carousel" || ctCS === "document") {
                setConfigStep("slide_count");
              } else {
                setConfigStep("background_mode");
              }
            }
          } else {
            setConfigStep("visual_style");
          }
        }
        break;
      }
      case "source_mode": {
        // User chose how to provide content source
        if (value === "link") {
          setConfigStep("source_link");
        } else if (value === "suggest") {
          // Hide the 3 options immediately by moving to a non-visible step
          setConfigStep("source_write");
          // Fire content suggestions — show as quick reply options
          (async () => {
            try {
              setMessages((prev) => [...prev, { role: "assistant", content: "Buscando sugestões para o seu nicho... 💡", isLoading: true }]);
              const { data } = await supabase.functions.invoke("ai-chat", {
                body: { message: "SUGERIR_CONTEUDO", intent_hint: "SUGERIR_CONTEUDO" },
              });
              // Remove loading message
              setMessages((prev) => prev.filter((m) => !m.isLoading));

              const suggestions = data?.action_result?.suggestions || [];
              const reply = data?.reply || "";
              if (suggestions.length > 0) {
                setMessages((prev) => [...prev, {
                  role: "assistant",
                  content: (reply || "Escolha um tema para o seu conteúdo:") + "\n\n_Clique numa sugestão ou digite seu próprio tema abaixo._",
                  quickReplies: suggestions.map((s: any) => `📝 ${s.title}`),
                }]);
                // Hide the wizard text field — suggestions are in the chat as quickReplies
                // User clicks a suggestion → handleQuickReply routes to sourceInput
                setConfigStep("suggestions_pending");
              } else if (reply) {
                setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
                setConfigStep("source_write");
              } else {
                setMessages((prev) => [...prev, { role: "assistant", content: "Descreva o tema do conteúdo:" }]);
                setConfigStep("source_write");
              }
            } catch {
              setMessages((prev) => prev.filter((m) => !m.isLoading));
              setMessages((prev) => [...prev, { role: "assistant", content: "Descreva o tema do conteúdo:" }]);
              setConfigStep("source_write");
            }
          })();
        } else {
          // write from scratch
          setConfigStep("source_write");
        }
        break;
      }

      case "sourceInput": {
        // Detect if the user pasted a URL — set as sourceUrl so the backend fetches the article
        const sourceUrlMatch = value.match(/https?:\/\/[^\s]+/);
        if (sourceUrlMatch) {
          const cleanText = value.replace(sourceUrlMatch[0], "").trim();
          updateFlow({ sourceUrl: sourceUrlMatch[0], sourceText: cleanText || undefined });
        } else {
          // Detect if the provided text is a quote/phrase and update contentStyle
          // Only detect as quote if it genuinely looks like a phrase to be used literally
          // NOT if it starts with action verbs (crie, gere, faça, etc.) — those are instructions, not quotes
          const trimmedVal = value.trim();
          const startsWithAction = /^(cri[ea]|ger[ea]|fa[çz]a|quero|preciso|pode|me\s|um\s|sobre\s)/i.test(trimmedVal);
          const looksLikeQuote = !startsWithAction && (
            /^(seguinte\s+)?frase/i.test(trimmedVal) ||
            /^["'"'«]/.test(trimmedVal) ||
            /["'"'»]$/.test(trimmedVal)
          );
          if (looksLikeQuote && flow.contentStyle !== "quote") {
            updateFlow({ sourceText: value, contentStyle: "quote" });
          } else {
            updateFlow({ sourceText: value });
          }
        }
        // If brand already has default visual style, skip visual_style step
        const brandDefault = flow.brandDefaultVisualStyle;
        if (brandDefault) {
          updateFlow({ visualStyle: brandDefault as any });
          if (brandDefault === "photo_overlay") {
            setConfigStep("photo_source");
          } else if (brandDefault === "template_clean" || brandDefault === "ai_full_design" || brandDefault === "ai_illustration") {
            const ctSrc = flow.contentType;
            if (ctSrc === "carousel" || ctSrc === "document") {
              setConfigStep("slide_count");
            } else {
              startGeneration({ sourceText: value, visualStyle: brandDefault });
              return;
            }
          } else {
            // ai_background
            const ctSrc = flow.contentType;
            if (ctSrc === "carousel" || ctSrc === "document") {
              setConfigStep("slide_count");
            } else {
              setConfigStep("background_mode");
            }
          }
        } else {
          setConfigStep("visual_style");
        }
        break;
      }
      case "illustration_title": {
        // "with_title" = illustration bg + title overlay (pipeBackgroundOnly=true)
        // "no_title" = pure illustration, image IS the final (pipeBackgroundOnly=false)
        const illustrationWithTitle = value === "with_title";
        updateFlow({
          visualStyle: illustrationWithTitle ? "ai_illustration_titled" : "ai_illustration",
        });
        const ctIllust = flow.contentType;
        if (ctIllust === "carousel" || ctIllust === "document") {
          setConfigStep("slide_count");
        } else {
          startGeneration({
            visualStyle: illustrationWithTitle ? "ai_illustration_titled" : "ai_illustration",
          });
          return;
        }
        break;
      }

      case "visualStyle": {
        updateFlow({ visualStyle: value });
        const ctAfterVisual = flow.contentType;
        if (value === "ai_illustration") {
          // Ask if user wants title on the illustration
          setConfigStep("illustration_title");
        } else if (value === "template_clean" || value === "ai_full_design") {
          if (ctAfterVisual === "carousel" || ctAfterVisual === "document") {
            setConfigStep("slide_count");
          } else {
            startGeneration({ visualStyle: value });
            return;
          }
        } else if (value === "photo_overlay") {
          // Photo overlay — need to select photo source
          if (ctAfterVisual === "carousel" || ctAfterVisual === "document") {
            setConfigStep("slide_count");
          } else {
            setConfigStep("photo_source");
          }
        } else {
          // ai_background mode — proceed to slide count or background mode
          if (ctAfterVisual === "carousel" || ctAfterVisual === "document") {
            setConfigStep("slide_count");
          } else {
            setConfigStep("background_mode");
          }
        }
        break;
      }
      case "slideCount": {
        const sc = value === "auto" ? null : parseInt(value);
        updateFlow({ slideCount: sc });
        const vs = flow.visualStyle;
        if (vs === "template_clean" || vs === "ai_full_design") {
          startGeneration({ slideCount: sc, visualStyle: vs });
          return;
        }
        if (vs === "photo_overlay") {
          setConfigStep("photo_source");
        } else {
          setConfigStep("background_mode");
        }
        break;
      }
      case "backgroundMode":
        updateFlow({ backgroundMode: value });
        if (value === "saved_template") {
          setConfigStep("background_template_pick");
        } else if (value === "user_upload") {
          setConfigStep("upload_image");
        } else {
          // ai_generate → start generation with brand_guided default (skip fidelity question)
          startGeneration({ backgroundMode: value, visualMode: "brand_guided" });
          return;
        }
        break;
      case "templateId":
        updateFlow({ templateId: value, backgroundMode: "saved_template" });
        startGeneration({ templateId: value, backgroundMode: "saved_template" });
        break;
      case "photoSource":
        if (value === "brand_photos") {
          // Use brand's background photos — start generation with photo_overlay mode
          startGeneration({ visualStyle: "photo_overlay", backgroundMode: "brand_photos", visualMode: "brand_guided" });
          return;
        } else if (value === "upload") {
          // Upload a new photo
          setConfigStep("upload_image");
        }
        break;
      case "upload_file":
        // Handle file upload
        await handleFileUpload(value);
        break;
    }
  }, [genFlow]);

  // ── File upload handler ──
  const handleFileUpload = useCallback(async (file: File) => {
    if (!userId) return;
    genFlow.setLoading(true, "Enviando arquivo...");
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${userId}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("content-images").upload(path, file, { contentType: file.type });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("content-images").getPublicUrl(path);
      genFlow.updateFlow({ uploadedImageUrl: urlData.publicUrl });
      startGeneration({ uploadedImageUrl: urlData.publicUrl });
    } catch (err) {
      console.error("[ChatWindow] Upload error:", err);
      toast.error("Erro ao enviar arquivo");
      genFlow.setLoading(false);
    }
  }, [userId, genFlow]);

  // ══════ PHASE TRANSITIONS ══════

  // Start generation: config → fire async pipeline → show ActionCard immediately
  const startGeneration = useCallback(async (overrides?: Partial<typeof genFlow.flow>) => {
    if (!userId) return;
    const flow = { ...genFlow.flow, ...overrides };
    genFlow.setPhase("background");
    genFlow.setLoading(true, "Analisando o conteúdo... 🔍");

    // Progressive feedback timers
    const progressTimer1 = setTimeout(() => {
      genFlow.setLoading(true, "Gerando estrutura dos slides... ✍️");
    }, 10000);
    const progressTimer2 = setTimeout(() => {
      genFlow.setLoading(true, "Quase lá... ⏳");
    }, 25000);
    const progressTimer3 = setTimeout(() => {
      genFlow.setLoading(true, "Documentos demoram um pouco mais... 📄");
    }, 50000);

    // 90s frontend timeout — Lovable edge functions have ~50s CPU limit, wall-time can be longer due to I/O
    let didTimeout = false;
    const flowTimeout = setTimeout(() => {
      didTimeout = true;
      genFlow.resetFlow();
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: "A geração demorou mais que o esperado. Tente novamente — se o problema persistir, tente com um texto mais curto.",
      }]);
    }, 90000);

    const clearTimers = () => {
      clearTimeout(progressTimer1);
      clearTimeout(progressTimer2);
      clearTimeout(progressTimer3);
      clearTimeout(flowTimeout);
    };

    try {
      const { data, error } = await supabase.functions.invoke("ai-chat", {
        body: {
          message: "INICIAR_GERACAO",
          intent_hint: "INICIAR_GERACAO",
          generationParams: {
            platform: flow.platform,
            contentType: flow.contentType,
            brandId: flow.brandId,
            contentStyle: flow.contentStyle,
            slideCount: flow.slideCount,
            backgroundMode: flow.backgroundMode,
            visualMode: flow.visualMode,
            visualStyle: flow.visualStyle || "ai_full_design",
            templateId: flow.templateId,
            uploadedImageUrl: flow.uploadedImageUrl,
            sourceUrl: flow.sourceUrl,
            sourceText: flow.sourceText,
          },
        },
      });

      clearTimers();
      if (didTimeout) return;

      if (error) throw error;

      console.log('[ChatWindow] INICIAR_GERACAO response:', JSON.stringify(data));

      // Check if server returned an error message instead of content
      if (data?.reply && !data?.action_result?.generation_result && !data?.action_result?.content_id) {
        // Server returned a reply without generation — show it as message
        setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
        genFlow.resetFlow();
        return;
      }

      const result = data?.action_result?.generation_result || data?.generation_result;
      const contentId = result?.contentId || data?.action_result?.content_id;
      if (!contentId) throw new Error("No contentId returned");

      const slides = result?.slides || [];

      // Fire pipeline in background — one call PER SLIDE sequentially.
      // Each generate-slide-images takes 30-50s (fits in 60s edge function limit).
      // Sending all slides in one call causes the parent function to timeout at 60s
      // before all slides complete, losing Phase 3 (image_urls update).
      // Without a brand, default to illustration mode (no brand refs to replicate)
      const vs = flow.visualStyle || (flow.brandId ? "ai_full_design" : "ai_illustration");
      const slideIds = slides.map((s: any) => s.id);
      const pipelineParams = {
        contentId,
        backgroundMode: (vs === "ai_full_design" || vs === "ai_illustration" || vs === "ai_illustration_titled") ? "ai_generate" : vs === "photo_overlay" ? (flow.backgroundMode || "brand_photos") : flow.backgroundMode,
        templateId: flow.templateId,
        uploadedImageUrl: flow.uploadedImageUrl,
        visualMode: flow.visualMode || "brand_guided",
        visualStyle: vs,
        contentStyle: flow.contentStyle,
        platform: flow.platform,
        ...((vs === "ai_full_design" || vs === "ai_illustration") ? { backgroundOnly: false } : {}),
      };

      if (vs !== "template_clean" && slideIds.length > 0) {
        // Fire sequentially: one PIPELINE_BACKGROUND call per slide
        // Each call handles 1 slide → fits in 60s timeout
        // Show persistent progress toast so user can navigate freely
        const isMultiSlide = slideIds.length > 1;
        const toastId = isMultiSlide
          ? toast.loading(`Gerando imagens: slide 1 de ${slideIds.length}...`, { duration: Infinity })
          : toast.loading("Gerando imagem do conteúdo...", { duration: Infinity });

        (async () => {
          let completed = 0;
          let failed = 0;
          for (let i = 0; i < slideIds.length; i++) {
            try {
              console.log(`[pipeline] slide ${i + 1}/${slideIds.length}: ${slideIds[i]}`);
              if (isMultiSlide) {
                toast.loading(`Gerando imagens: slide ${i + 1} de ${slideIds.length}...`, { id: toastId });
              }
              await supabase.functions.invoke('ai-chat', {
                body: {
                  message: 'PIPELINE_BACKGROUND',
                  intent_hint: 'PIPELINE_BACKGROUND',
                  generationParams: {
                    ...pipelineParams,
                    slides: [slideIds[i]],
                  }
                }
              });
              completed++;
            } catch (err) {
              console.error(`[pipeline] slide ${i + 1} error:`, err);
              failed++;
            }
          }
          // Final status toast
          toast.dismiss(toastId);
          if (failed === 0) {
            toast.success(isMultiSlide
              ? `Todas as ${completed} imagens foram geradas! 🎨`
              : "Imagem gerada com sucesso! 🎨"
            );
          } else if (completed > 0) {
            toast.warning(`${completed} de ${slideIds.length} imagens geradas. ${failed} falharam.`);
          } else {
            toast.error("Erro ao gerar imagens. Tente novamente.");
          }
        })();
      }
      // template_clean: no pipeline needed — SlideTemplateRenderer handles it

      // Track last active content
      lastActiveContentId.current = contentId;

      // Show ActionCard immediately with skeleton (no image yet)
      const hasBrand = !!flow.brandId;
      const brandHint = hasBrand ? "" : "\n\n💡 _Dica: crie sua marca no chat (\"criar minha marca\") para personalizar cores e fontes._";
      const modeMessages: Record<string, string> = {
        template_clean: "✅ Conteúdo criado! Usando as cores da sua marca como fundo.",
        ai_background: "✅ Conteúdo criado! Gerando visual da marca + texto... 🖼️\n\n_Resultado pronto para publicar. Clique para editar se quiser._",
        photo_overlay: "✅ Conteúdo criado! Montando sua foto + texto... 📸\n\n_Resultado pronto para publicar. Clique para editar se quiser._",
        ai_full_design: "✅ Conteúdo criado! Gerando imagem completa com texto... 🎨\n\n_O resultado final já vem pronto para publicar._",
      };
      const actionMsg: Message = {
        role: "assistant",
        content: (modeMessages[vs] || modeMessages.ai_full_design) + brandHint,
        actionResult: {
          content_id: contentId,
          content_type: flow.contentType as any,
          platform: flow.platform || "instagram",
          preview_image_url: undefined,
          headline: slides[0]?.headline || slides[0]?.slide_text || undefined,
        },
      };
      setMessages((prev) => [...prev, actionMsg]);

      // Persist to chat_messages
      try {
        await supabase.from("chat_messages").insert([{
          user_id: userId,
          role: "assistant",
          content: "✅ Conteúdo criado! A imagem está sendo gerada... 🎨",
          intent: "INICIAR_GERACAO",
          metadata: {
            action_result: {
              content_id: contentId,
              content_type: flow.contentType,
            },
          },
        }]);
      } catch (saveErr) {
        console.error("[ChatWindow] Error saving generation message:", saveErr);
      }

      genFlow.resetFlow();
    } catch (err: any) {
      clearTimers();
      if (didTimeout) return;
      console.error("[ChatWindow] startGeneration error:", err);
      const userFriendlyMsg = err?.message?.includes("contentId")
        ? "A geração demorou mais que o esperado. Tente novamente — às vezes o servidor precisa de um segundo aquecimento."
        : `Tive um problema ao gerar o conteúdo. Tente novamente em alguns instantes.`;
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: `${userFriendlyMsg} 🙏`,
      }]);
      genFlow.resetFlow();
      genFlow.setError("Erro ao iniciar geração. Tente novamente.");
    }
  }, [userId, genFlow]);

  // ── Brand image upload handler ──
  const handleBrandImageUpload = useCallback(async (files: File[]) => {
    if (!userId) return;
    setIsSending(true);
    const now = formatTime(new Date().toISOString());
    setMessages(prev => [...prev, { role: "user" as const, content: `📎 ${files.length} imagem(ns) enviada(s)`, timestamp: now }]);
    setMessages(prev => [...prev, { role: "assistant" as const, content: "", isLoading: true }]);

    try {
      const uploadedUrls: string[] = [];
      for (const file of files) {
        const ext = file.name.split(".").pop() || "png";
        const path = `${userId}/${Date.now()}-${Math.random().toString(36).substr(2, 5)}.${ext}`;
        const { error } = await supabase.storage.from("content-images").upload(path, file, { contentType: file.type });
        if (error) throw error;
        const { data: urlData } = supabase.storage.from("content-images").getPublicUrl(path);
        uploadedUrls.push(urlData.publicUrl);
      }

      const { data, error } = await supabase.functions.invoke("ai-chat", {
        body: {
          message: `Enviando ${files.length} imagem(ns)`,
          imageUrls: uploadedUrls,
          history: messages.slice(-6).map(m => ({ role: m.role, content: m.content })),
        },
      });

      if (error) throw error;
      const reply = data?.reply || "Recebido!";
      const bcStep = data?.brand_creation_step;
      if (bcStep !== undefined) setBrandCreationStep(bcStep > 0 ? bcStep : null);

      setMessages(prev => {
        const updated = [...prev];
        const loadingIdx = updated.map((m, i) => m.isLoading ? i : -1).filter(i => i >= 0).pop();
        if (loadingIdx != null && loadingIdx >= 0) {
          updated[loadingIdx] = { role: "assistant", content: reply, quickReplies: data?.quick_replies };
        }
        return updated;
      });
    } catch (err: any) {
      console.error("[ChatWindow] Brand image upload error:", err);
      setMessages(prev => {
        const updated = [...prev];
        const loadingIdx = updated.map((m, i) => m.isLoading ? i : -1).filter(i => i >= 0).pop();
        if (loadingIdx != null && loadingIdx >= 0) {
          updated[loadingIdx] = { role: "assistant", content: "Erro ao enviar imagens. Tente novamente." };
        }
        return updated;
      });
    } finally {
      setIsSending(false);
    }
  }, [userId, messages]);




  // ══════ CHAT SEND ══════
  const handleSend = useCallback(async (text: string, opts?: { skipUrlDetection?: boolean }) => {
    if (!userId || isSending) return;

    // 1. FIRST: Check if brand creation flow is active — takes priority over everything
    if (brandCreationStep !== null && brandCreationStep > 0) {
      setIsSending(true);
      const now = formatTime(new Date().toISOString());
      setMessages((prev) => [...prev, { role: "user", content: text, timestamp: now }]);
      setMessages((prev) => [...prev, { role: "assistant", content: "", isLoading: true }]);

      try {
        const { data, error } = await supabase.functions.invoke("ai-chat", {
          body: {
            message: text,
            intent_hint: "CRIAR_MARCA",
            history: messages.slice(-6).map(m => ({ role: m.role, content: m.content })),
          },
        });
        if (error) throw error;

        const bcStep = data?.brand_creation_step;
        if (bcStep !== undefined) {
          setBrandCreationStep(bcStep > 0 ? bcStep : null);
        } else {
          // If no step returned, assume flow ended
          setBrandCreationStep(null);
        }

        // If step 4 returned with trigger_analyze, fire brand analysis in a separate request
        if (bcStep === 4 && data?.action_result?.trigger_analyze && data?.action_result?.brand_id) {
          supabase.functions.invoke('ai-chat', {
            body: {
              message: 'CRIAR_MARCA_ANALYZE',
              intent_hint: 'CRIAR_MARCA_ANALYZE',
              generationParams: { brandId: data.action_result.brand_id },
            },
          }).catch(err => console.error('[CRIAR_MARCA_ANALYZE] background error:', err));
        }

        const reply = data?.reply || "Recebido!";
        const quickReplies = data?.quick_replies;
        const actionResult = data?.action_result;

        setMessages((prev) => {
          const updated = [...prev];
          const loadingIdx = updated.map((m, i) => m.isLoading ? i : -1).filter(i => i >= 0).pop();
          if (loadingIdx != null && loadingIdx >= 0) {
            updated[loadingIdx] = { role: "assistant", content: reply, quickReplies, actionResult };
          }
          return updated;
        });
      } catch (err: any) {
        console.error("[ChatWindow] Brand creation error:", err);
        setMessages((prev) => {
          const updated = [...prev];
          const loadingIdx = updated.map((m, i) => m.isLoading ? i : -1).filter(i => i >= 0).pop();
          if (loadingIdx != null && loadingIdx >= 0) {
            updated[loadingIdx] = { role: "assistant", content: "Erro no fluxo de criação da marca. Tente novamente." };
          }
          return updated;
        });
      } finally {
        setIsSending(false);
      }
      return;
    }

    // 2. If generation flow is active, handle cancel or feed source_input
    if (genFlow.isActive) {
      const cancelWords = /\b(cancel|cancelar|parar|sair|não|voltar)\b/i;
      if (cancelWords.test(text)) {
        genFlow.resetFlow();
        setMessages((prev) => [...prev,
          { role: "user", content: text },
          { role: "assistant", content: "Ok, criação cancelada. Como posso ajudar?" },
        ]);
        return;
      }
      // If we're at source_input step, treat the message as the source text
      const currentStep = genFlow.flow.configStep;
      console.log("[ChatWindow] Flow active, configStep=", currentStep, "phase=", genFlow.flow.phase, "text=", text.substring(0, 50));
      if (currentStep === "source_input" || currentStep === "source_write" || currentStep === "source_link" || currentStep === "suggestions_pending") {
        setMessages((prev) => [...prev, { role: "user", content: text }]);
        // Strip emoji prefix if present (from suggestion quick replies)
        const cleanText = text.replace(/^[\p{Emoji}\s]+/u, "").trim() || text;
        handleConfigSelect("sourceInput", cleanText);
        return;
      }
      setMessages((prev) => [...prev,
        { role: "user", content: text },
        { role: "assistant", content: "Você está no meio de uma criação. Quer **cancelar** e fazer outra coisa, ou continuar escolhendo as opções acima?" },
      ]);
      return;
    }

    setIsSending(true);
    const now = formatTime(new Date().toISOString());
    const userMsg: Message = { role: "user", content: text, timestamp: now };
    setMessages((prev) => [...prev, userMsg]);

    // Onboarding flow
    if (onboardingStep != null && onboardingStep <= 5) {
      const validationError = validateOnboardingAnswer(text, onboardingStep);
      if (validationError) {
        setMessages((prev) => [...prev, { role: "assistant", content: validationError }]);
        setIsSending(false);
        return;
      }

      await processOnboardingAnswer(text, onboardingStep);
      const nextStep = onboardingStep + 1;
      if (nextStep <= 5) {
        setMessages((prev) => [...prev, { role: "assistant", content: ONBOARDING_QUESTIONS[nextStep] }]);
        setOnboardingStep(nextStep);
      } else {
        const phoneMatch = text.match(/(\d{10,15})/);
        const whatsappNumber = phoneMatch ? phoneMatch[0] : null;
        const numMatch = text.match(/(\d+)/);
        const qty = numMatch ? parseInt(numMatch[1]) : 3;
        const { data: finalSummary } = await supabase.from("ai_user_context").select("*").eq("user_id", userId).maybeSingle();
        const extraCtx = (finalSummary?.extra_context as Record<string, unknown>) || {};
        const { data: profileData } = await supabase.from("profiles").select("full_name").eq("user_id", userId).maybeSingle();
        const completionMsg = buildCompletionMsg({
          name: profileData?.full_name || undefined,
          handle: finalSummary?.instagram_handle || undefined,
          niche: finalSummary?.business_niche || undefined,
          voice: finalSummary?.brand_voice || undefined,
          topics: finalSummary?.content_topics || undefined,
          sources: (extraCtx.reference_sources as string[]) || undefined,
          qty,
        });
        setMessages((prev) => [...prev, { role: "assistant", content: completionMsg, whatsappConfirm: whatsappNumber }]);
        setOnboardingStep(null);
      }
      setIsSending(false);
      return;
    }

    // ── Detect generation intent → smart routing ──
    const urlMatch = opts?.skipUrlDetection ? null : text.match(/https?:\/\/[^\s]+/);
    const wantsGeneration = GENERATION_PATTERNS.test(text);

    if ((urlMatch || wantsGeneration) && !brandCreationStep && !genFlow.isActive) {
      const textLower = text.toLowerCase();

      // Detect platform from message — fall back to user's default
      const detectedFromText = textLower.includes("linkedin") ? "linkedin"
        : textLower.includes("instagram") || textLower.includes("insta") ? "instagram"
        : null;
      const detectedPlatform = detectedFromText || generationDefaults.defaultPlatform || null;

      // Detect format from message — fall back to user's default, otherwise null (will ask)
      const explicitFormat = /\b(post|publicação)\b/i.test(textLower);
      const formatFromText = textLower.includes("carrossel") || textLower.includes("carousel") ? "carousel"
        : textLower.includes("story") || textLower.includes("stories") ? "story"
        : textLower.includes("document") || textLower.includes("documento") ? "document"
        : explicitFormat ? "post"
        : null;
      const detectedFormat = formatFromText || (generationDefaults.defaultFormat as any) || null;

      // Smart topic extraction — understands natural language requests
      const extractTopic = (msg: string): string => {
        let topic = msg;
        // Remove command prefixes
        topic = topic.replace(/^[\p{Emoji}\s]*/u, "");
        topic = topic.replace(/^(quero|preciso|pode|gostaria de|vou|vamos)\s+(criar|gerar|fazer|montar)\s+(um|uma|o|a)?\s*/i, "");
        topic = topic.replace(/^(cri[ae]|ger[ae]|fa[zç]a?|monte)\s+(um|uma|o|a)?\s*/i, "");
        // Remove format words
        topic = topic.replace(/\b(post|carrossel|carousel|story|stories|documento|artigo|conteúdo|conteudo|publicação)\b\s*/gi, "");
        // Remove platform words
        topic = topic.replace(/\b(para|pro|pra|no|na|do|da)\s+(o\s+)?(instagram|insta|linkedin)\b/gi, "");
        topic = topic.replace(/\b(instagram|insta|linkedin)\b/gi, "");
        // Remove connector words left over
        topic = topic.replace(/^(sobre|com\s+mensagem|com\s+tema|com\s+o\s+tema|a\s+partir\s+de|baseado\s+em|com)\s+/i, "");
        // Remove quotes around topic
        topic = topic.replace(/^['"""'']+|['"""'']+$/g, "");
        return topic.trim();
      };

      const extractedTopic = extractTopic(text);
      const hasUrl = !!urlMatch;
      // Topic must be meaningful — reject generic placeholders like "uma frase", "algo", "um tema"
      const genericTopicPatterns = /^(uma?\s+(frase|tema|post|texto|coisa|conteúdo|ideia|exemplo)|algo|isso|aqui|nada)$/i;
      const hasExtractedTopic = extractedTopic.length >= 10 && !genericTopicPatterns.test(extractedTopic);
      const hasSource = hasUrl || hasExtractedTopic;

      // Detect content style: message hint > user default > fallback "news"
      const styleFromText = /\b(frase|citação|citacao|quote|pensamento|reflexão|reflexao)\b/i.test(textLower) ? "quote"
        : /\b(dica|tip|truque|hack)\b/i.test(textLower) ? "tip"
        : /\b(curiosidade|sabia\s+que|você\s+sabia)\b/i.test(textLower) ? "curiosity"
        : null;
      const detectedStyle = styleFromText || generationDefaults.defaultContentStyle || "news";

      // Use extracted topic as sourceText (cleaner than raw message)
      const sourceText = hasUrl ? text : (hasExtractedTopic ? extractedTopic : text);

      console.log(`[ChatWindow] Generation detected: topic="${extractedTopic}", platform=${detectedPlatform}, format=${detectedFormat}, hasSource=${hasSource}, style=${detectedStyle}, defaultBrand=${generationDefaults.defaultBrandId}`);

      // MODE 0 (NEW): Defaults cover everything → generate DIRECTLY, no wizard
      const hasDefaults = generationDefaults.defaultPlatform && generationDefaults.defaultBrandId;
      if (hasSource && hasDefaults) {
        const finalPlatform = detectedPlatform || generationDefaults.defaultPlatform!;
        const finalFormat = detectedFormat || (generationDefaults.defaultFormat as any) || "post";
        const finalBrandId = generationDefaults.defaultBrandId!;
        const finalBrandName = generationDefaults.defaultBrandName || "";
        const platformLabel = finalPlatform === "linkedin" ? "LinkedIn" : "Instagram";

        console.log(`[ChatWindow] MODE 0 (direct): ${platformLabel} ${finalFormat}, brand=${finalBrandId.substring(0,8)}`);
        setMessages((prev) => [...prev, {
          role: "assistant",
          content: `Gerando ${finalFormat} para ${platformLabel}... 🚀`,
        }]);

        // Start generation directly — no wizard steps
        genFlow.startFlow({
          sourceUrl: urlMatch?.[0] || undefined,
          sourceText: hasUrl ? undefined : sourceText,
          platform: finalPlatform,
          contentType: finalFormat,
          contentStyle: detectedStyle as any,
          brandId: finalBrandId,
          brandName: finalBrandName,
        });
        startGeneration({
          sourceUrl: urlMatch?.[0] || undefined,
          sourceText: hasUrl ? undefined : sourceText,
          platform: finalPlatform,
          contentType: finalFormat,
          contentStyle: detectedStyle as any,
          brandId: finalBrandId,
          brandName: finalBrandName,
          visualStyle: "ai_full_design",
        });
        setIsSending(false);
        return;
      }

      // MODE 1: Has platform + source → ask brand (or content_type if format unknown)
      if (hasSource && detectedPlatform) {
        genFlow.startFlow({
          sourceUrl: urlMatch?.[0] || undefined,
          sourceText: sourceText,
          platform: detectedPlatform,
          contentType: detectedFormat as any || undefined,
          contentStyle: detectedStyle as any,
        });
        const formatLabel = detectedFormat || "conteúdo";
        console.log(`[ChatWindow] MODE 1: has platform+source, format=${detectedFormat || 'unknown'}`);
        setMessages((prev) => [...prev, {
          role: "assistant",
          content: hasUrl
            ? `Recebi o link! 🔗 ${detectedPlatform === "linkedin" ? "LinkedIn" : "Instagram"} · ${formatLabel}.`
            : `Ótimo! ${detectedPlatform === "linkedin" ? "LinkedIn" : "Instagram"} · ${formatLabel}.`,
        }]);
        // If format not detected, ask content_type; otherwise go to brand
        genFlow.setConfigStep(detectedFormat ? "brand" : "content_type");
        setIsSending(false);
        return;
      }

      // MODE 2: Has source but no platform → ask platform first
      if (hasSource && !detectedPlatform) {
        genFlow.startFlow({
          sourceUrl: urlMatch?.[0] || undefined,
          sourceText: sourceText,
          contentType: detectedFormat as any || undefined,
          contentStyle: detectedStyle as any,
        });
        console.log('[ChatWindow] MODE 2: has source, asking platform');
        setMessages((prev) => [...prev, {
          role: "assistant",
          content: hasUrl
            ? "Recebi o link! 🔗 Para qual plataforma?"
            : "Ótimo! Para qual plataforma?",
        }]);
        setIsSending(false);
        return;
      }

      // MODE 3: No real source text — start wizard but preserve detected platform/contentType/style
      genFlow.startFlow({
        sourceUrl: urlMatch?.[0] || undefined,
        sourceText: undefined, // no valid source — will ask in source_input step
        platform: detectedPlatform || undefined,
        contentType: detectedFormat as any || undefined,
        contentStyle: (detectedStyle !== "news" ? detectedStyle : undefined) as any,
      });
      console.log(`[ChatWindow] MODE 3: no source, platform=${detectedPlatform}, format=${detectedFormat}, style=${detectedStyle}`);
      const platformLabel3 = detectedPlatform === "linkedin" ? "LinkedIn" : detectedPlatform === "instagram" ? "Instagram" : null;
      const formatLabel3 = detectedFormat || null;
      const contextHint = platformLabel3 && formatLabel3
        ? `${platformLabel3} · ${formatLabel3}. `
        : platformLabel3 ? `${platformLabel3}. ` : "";
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: `${contextHint}Vamos criar seu conteúdo! 🎨`,
      }]);
      setIsSending(false);
      return;
    }

    // Check if this looks like a text edit request
    const EDIT_PATTERNS = /\b(muda|troca|substitui|altera|edita|ajusta|deixa|torna|faz|coloca|põe|mais\s+(curto|longo|informal|formal|direto))\b/i;
    const isEditRequest = EDIT_PATTERNS.test(text) && lastActiveContentId.current;

    // Normal chat flow
    setMessages((prev) => [...prev, { role: "assistant", content: "", isLoading: true }]);

    try {
      // Send only text content in history — no action_result metadata to avoid context contamination
      const history = messages.slice(-6).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const body: any = { message: text, history };
      if (isEditRequest) {
        body.intent_hint = "EDITAR_TEXTO";
        body.generationParams = { contentId: lastActiveContentId.current };
      }

      const { data, error } = await supabase.functions.invoke("ai-chat", { body });
      if (error) throw error;

      // Verificar brand creation step na resposta
      const bcStep = data?.brand_creation_step;
      if (bcStep !== undefined) {
        setBrandCreationStep(bcStep > 0 ? bcStep : null);
      }

      const reply = data?.reply || "Desculpe, não consegui processar sua mensagem.";
      const intent = data?.intent;
      let actionResult = data?.action_result;
      const quickReplies = data?.quick_replies;

      if (actionResult?.content_id && actionResult.content_type !== "cron_config") {
        const { data: content } = await supabase
          .from("generated_contents")
          .select("id, title, image_urls, caption, content_type, status, scheduled_at, slides")
          .eq("id", actionResult.content_id)
          .maybeSingle();

        if (content) {
          const slides = (content.slides as any[]) || [];
          const previewUrl = content.image_urls?.[0]
            || slides[0]?.background_url
            || slides[0]?.background_image_url
            || slides[0]?.image_url
            || actionResult.preview_image_url;
          actionResult = {
            ...actionResult,
            headline: content.title || actionResult.headline,
            preview_image_url: previewUrl,
          };
        }
      }

      if (actionResult?.edited) {
        actionResult.preview_image_url = undefined;
      }

      if (actionResult?.content_id && actionResult.content_type !== "cron_config") {
        lastActiveContentId.current = actionResult.content_id;
      }

      const finalActionResult = intent === "CONFIGURAR_CRON"
        ? { content_id: "cron", content_type: "cron_config" as const }
        : actionResult;

      setMessages((prev) => {
        const updated = [...prev];
        const loadingIdx = updated.map((m, i) => m.isLoading ? i : -1).filter(i => i >= 0).pop();
        if (loadingIdx != null && loadingIdx >= 0) {
          updated[loadingIdx] = { role: "assistant", content: reply, intent, actionResult: finalActionResult, quickReplies };
        }
        return updated;
      });
    } catch (err) {
      console.error("Chat error:", err);
      setMessages((prev) => {
        const updated = [...prev];
        const loadingIdx = updated.map((m, i) => m.isLoading ? i : -1).filter(i => i >= 0).pop();
        if (loadingIdx != null && loadingIdx >= 0) {
          updated[loadingIdx] = { role: "assistant", content: "Ops, tive um problema de conexão. Pode repetir?", isRetryable: true, retryText: text };
        }
        return updated;
      });
    } finally {
      setIsSending(false);
    }
  }, [userId, isSending, messages, onboardingStep, processOnboardingAnswer, genFlow]);

  const handleQuickReply = useCallback((text: string) => {
    // If we're in source_write or source_link step, treat quick reply as source input
    const currentStep = genFlow.flow.configStep;
    if (genFlow.isActive && (currentStep === "source_write" || currentStep === "source_link" || currentStep === "suggestions_pending")) {
      // Strip emoji prefix if present (e.g., "📝 Título da sugestão" → "Título da sugestão")
      const cleanText = text.replace(/^[\p{Emoji}\s]+/u, "").trim();
      handleConfigSelect("sourceInput", cleanText);
      // Add user message to chat
      setMessages((prev) => [...prev, { role: "user", content: text }]);
      return;
    }
    handleSend(text);
  }, [handleSend, genFlow.flow.configStep, genFlow.isActive, handleConfigSelect]);
  const handleRetry = useCallback((retryText: string) => {
    setMessages((prev) => prev.filter((m) => !m.isRetryable));
    handleSend(retryText);
  }, [handleSend]);

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setBrandCreationStep(null);
    genFlow.resetFlow();
    hasLoadedHistory.current = true; // prevent re-loading old history
    // Persist conversation boundary so navigating away and back doesn't reload old messages
    localStorage.setItem("tp_conversation_since", new Date().toISOString());
    toast.success("Nova conversa iniciada!");
  }, [genFlow]);

  if (!onboardingChecked) {
    return (
      <div className="flex flex-col h-full items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 relative bg-background">
      {/* Empty spacer for top — new chat moved to input area */}
      {cronBanner && (
        <div className="sticky top-0 z-20 mx-4 mt-2 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="text-lg">☀️</span>
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">Sugestões de hoje</span>
            </div>
            <button onClick={() => setCronBanner(null)} className="text-amber-500 hover:text-amber-700 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="text-sm text-foreground prose prose-sm max-w-none [&_p]:my-1">
            <ReactMarkdown>{cronBanner.content}</ReactMarkdown>
          </div>
          <div className="flex gap-2 mt-2">
            {[1, 2, 3].map((n) => (
              <button
                key={n}
                onClick={() => { setCronBanner(null); handleSend(`Quero criar a sugestão ${n}`); }}
                className="w-8 h-8 rounded-full border border-amber-300 bg-background text-sm font-semibold text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-800/40 transition-colors"
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      )}
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 min-h-0 overflow-y-auto px-4 py-6">
        {/* Smart nudges — contextual tips for key features */}
        <div className="max-w-3xl mx-auto">
          <SmartNudge
            hasBrand={nudgeContext.hasBrand}
            hasSocialConnection={nudgeContext.hasSocialConnection}
            contentCount={nudgeContext.contentCount}
          />
        </div>
        <div className="max-w-3xl mx-auto pt-8">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center px-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mb-5 shadow-sm">
                <Sparkles className="w-7 h-7 text-primary" />
              </div>
              <h2 className="text-lg font-heading font-semibold text-foreground mb-1.5">
                O que vamos criar hoje?
              </h2>
              <p className="text-sm text-muted-foreground/70 max-w-sm mb-8">
                Cole um link, descreva um tema, ou escolha abaixo para começar.
              </p>
              <div className="flex flex-wrap justify-center gap-2 max-w-lg">
                {QUICK_SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    className="border border-border/60 bg-background text-foreground/80 rounded-xl px-4 py-2 text-[13px] hover:bg-primary/5 hover:border-primary/30 hover:text-foreground transition-all duration-200 cursor-pointer"
                    onClick={() => handleSend(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg, i) => (
                <ChatMessage
                  key={msg.id || i}
                  id={msg.id}
                  role={msg.role}
                  content={msg.content}
                  intent={msg.intent}
                  isLoading={msg.isLoading}
                  actionResult={msg.actionResult}
                  quickReplies={msg.quickReplies}
                  onQuickReply={handleQuickReply}
                  onRegenerate={() => handleSend("Regenere o último conteúdo por favor")}
                  onReject={() => {
                    setMessages(prev => prev.filter(existingMsg => existingMsg !== msg && existingMsg.id !== msg.id));
                  }}
                  onAddMessage={(content: string) => {
                    setMessages(prev => [...prev, { role: "assistant" as const, content, timestamp: new Date().toISOString() }]);
                  }}
                  isRetryable={msg.isRetryable}
                  onRetry={msg.retryText ? () => handleRetry(msg.retryText!) : undefined}
                  whatsappConfirm={msg.whatsappConfirm}
                  timestamp={msg.timestamp}
                />
              ))}
              {/* Brand analysis loading indicator */}
              {brandCreationStep === 4 && <BrandAnalysisLoader />}
              {/* Generation flow UI (config only) */}
              {genFlow.isActive && userId && (
                <GenerationFlowStep
                  flow={genFlow.flow}
                  userId={userId}
                  onConfigSelect={handleConfigSelect}
                  onCancel={genFlow.resetFlow}
                  onBack={() => {
                    const hasSourcePreset = genFlow.flow.sourceUrl || (genFlow.flow.sourceText && genFlow.flow.sourceText.length >= 10);
                    const stepOrder: Record<string, string> = {
                      content_type: "platform",
                      brand: hasSourcePreset ? "platform" : "content_type",
                      source_input: "brand",
                      source_link: "source_input",
                      source_write: "source_input",
                      suggestions_pending: "source_input",
                      visual_style: "source_input",
                      illustration_title: "visual_style",
                      slide_count: "visual_style",
                      background_mode: "visual_style",
                      background_template_pick: "background_mode",
                      upload_image: "background_mode",
                      photo_source: "visual_style",
                    };
                    const prev = stepOrder[genFlow.flow.configStep];
                    if (prev) genFlow.setConfigStep(prev as any);
                  }}
                />
              )}
            </>
          )}
        </div>
      </div>

      {showScrollBtn && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10">
          <Button
            size="sm"
            variant="secondary"
            className="rounded-full shadow-lg gap-1 text-xs"
            onClick={() => scrollToBottom()}
          >
            <ArrowDown className="w-3 h-3" />
            Nova mensagem
          </Button>
        </div>
      )}

      {!genFlow.isActive && onboardingStep == null && (
        <div className="flex flex-wrap gap-1.5 px-4 py-2 border-t border-border/30 justify-center">
          {QUICK_SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => handleSend(s)}
              className="text-[11px] px-3 py-1 rounded-lg border border-border/50 bg-background text-muted-foreground hover:text-foreground hover:bg-primary/5 hover:border-primary/30 transition-all duration-150"
            >
              {s}
            </button>
          ))}
          <button onClick={() => handleSend('Quero criar uma nova marca')}
            className="text-[11px] px-3 py-1 rounded-lg border border-border/50 bg-background text-muted-foreground hover:text-foreground hover:bg-primary/5 hover:border-primary/30 transition-all duration-150">
            🎨 Nova marca
          </button>
        </div>
      )}

      <ChatInput
        onSend={handleSend}
        onFilesSelected={handleBrandImageUpload}
        disabled={isSending}
        showImageUpload={brandCreationStep === 1 || brandCreationStep === 3}
        userId={userId || undefined}
        generationDefaults={generationDefaults}
        onDefaultsChange={setGenerationDefaults}
        onNewChat={handleNewChat}
        hasMessages={messages.length > 0}
        placeholder={
          onboardingStep != null
            ? "Digite sua resposta..."
            : brandCreationStep === 1
              ? "Digite o nome da marca..."
              : brandCreationStep === 1.5
                ? "Escolha uma opção acima..."
                : brandCreationStep === 3
                  ? "Envie imagens ou digite 'pronto'..."
                  : genFlow.isActive
                    ? "Escolha uma opção acima ou digite 'cancelar'"
                    : "Cole um link ou descreva o conteúdo..."
        }
      />
    </div>
  );
}
