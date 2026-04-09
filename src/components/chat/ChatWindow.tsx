import { useState, useEffect, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import ChatMessage from "./ChatMessage";
import ChatInput from "./ChatInput";
import BrandAnalysisLoader from "./BrandAnalysisLoader";
import { Sparkles, ArrowDown, X, MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import SmartNudge from "./SmartNudge";
import { useNotification } from "@/hooks/useNotification";

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

const QUICK_ACTIONS = [
  { emoji: "📷", label: "Post", template: "Crie um post para Instagram sobre: " },
  { emoji: "🎠", label: "Carrossel", template: "Crie um carrossel de 5 slides sobre: " },
  { emoji: "📱", label: "Story", template: "Crie um story para Instagram sobre: " },
  { emoji: "💬", label: "Frase", template: "Crie uma imagem com a frase: " },
  { emoji: "🔗", label: "Link", template: "Crie um post baseado neste link: " },
  { emoji: "💼", label: "LinkedIn", template: "Crie um post para LinkedIn sobre: " },
];

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 12) return "Bom dia! ☀️ Vamos criar conteúdo hoje? Posso sugerir algumas ideias ou você tem algo em mente?";
  if (hour >= 12 && hour < 18) return "Olá! 👋 Que bom te ver. Quer criar algo novo ou ver o que está agendado?";
  if (hour >= 18 && hour <= 23) return "Boa noite! 🌙 Posso preparar conteúdo para amanhã. O que acha?";
  return "Olá! 👋 Como posso ajudar hoje?";
}

export default function ChatWindow() {
  const navigate = useNavigate();
  const { requestPermission, notify } = useNotification();
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
  const [brands, setBrands] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);
  const [prefillText, setPrefillText] = useState("");
  const [prefillKey, setPrefillKey] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasLoadedHistory = useRef(false);
  const lastActiveContentId = useRef<string | null>(null);

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

  // ── Load user's brands ──
  useEffect(() => {
    if (!userId) return;
    supabase.from("brands").select("id, name").eq("owner_user_id", userId)
      .order("created_at", { ascending: false })
      .then(({ data }) => { if (data) setBrands(data); });
  }, [userId]);

  // ── Nudge context — check if user has brand + social connection ──
  useEffect(() => {
    if (!userId) return;
    Promise.all([
      supabase.from("brands").select("id").eq("owner_user_id", userId).limit(1),
      supabase.from("instagram_connections").select("id").eq("user_id", userId).eq("is_active", true).limit(1),
      supabase.from("linkedin_connections").select("id").eq("user_id", userId).eq("is_active", true).limit(1),
      supabase.from("generated_contents").select("id").eq("user_id", userId).limit(1),
    ]).then(([brandsResult, ig, li, contents]) => {
      setNudgeContext({
        hasBrand: (brandsResult.data?.length || 0) > 0,
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
              // Reload brands list after brand creation
              supabase.from("brands").select("id, name").eq("owner_user_id", userId)
                .order("created_at", { ascending: false })
                .then(({ data }) => { if (data) setBrands(data); });
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
  }, [messages, isAtBottom, scrollToBottom]);

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
  const handleSend = useCallback(async (text: string, extraParams?: Record<string, any>) => {
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

    // 2. Normal chat flow — send message with brandId, backend handles everything
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

    // Show loading indicator
    setMessages((prev) => [...prev, { role: "assistant", content: "", isLoading: true }]);

    try {
      // Send only text content in history — no action_result metadata to avoid context contamination
      const recentHistory = messages.slice(-6).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const { data, error } = await supabase.functions.invoke("ai-chat", {
        body: {
          message: text,
          brandId: selectedBrandId || null,
          history: recentHistory,
          ...extraParams,
        },
      });
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
          // Prefer the AI-generated slide headline over content.title (which is the raw user prompt)
          const slideHeadline = slides[0]?.headline || slides[0]?.slide_text || slides[0]?.overlay?.headline;
          actionResult = {
            ...actionResult,
            headline: slideHeadline || actionResult.headline,
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
  }, [userId, isSending, messages, onboardingStep, processOnboardingAnswer, brandCreationStep, selectedBrandId]);

  const handleQuickReply = useCallback((text: string) => {
    handleSend(text);
  }, [handleSend]);

  const handleRetry = useCallback((retryText: string) => {
    setMessages((prev) => prev.filter((m) => !m.isRetryable));
    handleSend(retryText);
  }, [handleSend]);

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setBrandCreationStep(null);
    hasLoadedHistory.current = true; // prevent re-loading old history
    // Persist conversation boundary so navigating away and back doesn't reload old messages
    localStorage.setItem("tp_conversation_since", new Date().toISOString());
    toast.success("Nova conversa iniciada!");
  }, []);

  const handleQuickAction = useCallback((template: string) => {
    setPrefillText(template);
    setPrefillKey((k) => k + 1);
  }, []);

  if (!onboardingChecked) {
    return (
      <div className="flex flex-col h-full items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 relative bg-background">
      {/* Cron banner */}
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
                {QUICK_ACTIONS.map((action) => (
                  <button
                    key={action.label}
                    className="border border-border/60 bg-background text-foreground/80 rounded-xl px-4 py-2 text-[13px] hover:bg-primary/5 hover:border-primary/30 hover:text-foreground transition-all duration-200 cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                    onClick={() => handleQuickAction(action.template)}
                  >
                    {action.emoji} {action.label}
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
                  onRegenerate={() => {
                    const cid = msg.actionResult?.content_id;
                    if (cid) {
                      handleSend(`Refaça este conteúdo do zero com um visual completamente novo`, {
                        intent_hint: "EDIT_CONTENT",
                        editInstruction: "Refaça completamente com visual novo, mantendo o mesmo tema",
                        generationParams: { contentId: cid },
                      });
                    } else {
                      handleSend("Regenere o último conteúdo com um visual novo");
                    }
                  }}
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

      {/* Quick action pills above input */}
      {onboardingStep == null && (
        <div className="flex flex-wrap gap-1.5 px-4 py-2 border-t border-border/30 justify-center">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.label}
              onClick={() => handleQuickAction(action.template)}
              className="text-[11px] px-3 py-1 rounded-lg border border-border/50 bg-background text-muted-foreground hover:text-foreground hover:bg-primary/5 hover:border-primary/30 transition-all duration-150"
            >
              {action.emoji} {action.label}
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
        onNewChat={handleNewChat}
        hasMessages={messages.length > 0}
        brands={brands}
        selectedBrandId={selectedBrandId}
        onBrandSelect={setSelectedBrandId}
        prefillText={prefillText}
        prefillKey={prefillKey}
        placeholder={
          onboardingStep != null
            ? "Digite sua resposta..."
            : brandCreationStep === 1
              ? "Digite o nome da marca..."
              : brandCreationStep === 1.5
                ? "Escolha uma opção acima..."
                : brandCreationStep === 3
                  ? "Envie imagens ou digite 'pronto'..."
                  : "Cole um link ou descreva o conteúdo..."
        }
      />
    </div>
  );
}
