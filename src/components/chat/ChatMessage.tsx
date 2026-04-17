import { useState } from "react";
import { Sparkles, RefreshCw, Smartphone } from "lucide-react";
import ReactMarkdown from "react-markdown";
import ActionCard from "./ActionCard";
import QuickReplies from "./QuickReplies";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

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

interface ChatMessageProps {
  id?: string;
  role: "user" | "assistant";
  content: string;
  intent?: string;
  isLoading?: boolean;
  actionResult?: ActionResult;
  quickReplies?: string[];
  onQuickReply?: (text: string) => void;
  onRegenerate?: () => void;
  onReject?: () => void;
  onAddMessage?: (content: string) => void;
  onAdapt?: (contentId: string, platform: string, contentType: string) => void;
  isRetryable?: boolean;
  onRetry?: () => void;
  whatsappConfirm?: string | null;
  timestamp?: string;
}

export default function ChatMessage({
  id,
  role,
  content,
  intent,
  isLoading,
  actionResult,
  quickReplies,
  onQuickReply,
  onRegenerate,
  onReject,
  onAddMessage,
  onAdapt,
  isRetryable,
  onRetry,
  whatsappConfirm,
  timestamp,
}: ChatMessageProps) {
  const [showWhatsappInput, setShowWhatsappInput] = useState(false);
  const [whatsappInput, setWhatsappInput] = useState("");
  const [whatsappSaved, setWhatsappSaved] = useState<string | null>(null);

  const handleSaveWhatsapp = async () => {
    if (!whatsappInput.match(/\d{10,15}/)) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    await supabase.from("ai_user_context").update({ whatsapp_number: whatsappInput }).eq("user_id", session.user.id);
    setWhatsappSaved(whatsappInput);
    setShowWhatsappInput(false);
  };

  const maskPhone = (phone: string) => "******" + phone.slice(-4);

  // User message
  if (role === "user") {
    return (
      <div className="flex flex-col items-end mb-5 animate-in fade-in slide-in-from-right-3 duration-300">
        <div className="max-w-[75%] bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-4 py-3 shadow-sm">
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{content}</p>
        </div>
        {timestamp && <span className="text-[10px] text-muted-foreground/60 mt-1.5 mr-1 tabular-nums">{timestamp}</span>}
      </div>
    );
  }

  const isCronRecommendation = intent === "CRON_RECOMMENDATION";
  const suggestionNumbers = isCronRecommendation
    ? (content.match(/[📸🎠📱]/g) || []).map((_, i) => i + 1)
    : [];

  return (
    <div className="flex gap-3 mb-5 animate-in fade-in slide-in-from-left-3 duration-300">
      {/* Avatar */}
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shadow-sm ring-1 ring-primary/10">
        {isCronRecommendation ? (
          <span className="text-base">☀️</span>
        ) : isLoading ? (
          <div className="w-4 h-4 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
        ) : (
          <Sparkles className="w-4 h-4 text-primary" />
        )}
      </div>

      <div className={`space-y-2 ${actionResult?.content_id ? "max-w-[90%]" : "max-w-[75%]"}`}>
        {/* Cron badge */}
        {isCronRecommendation && (
          <span className="inline-block text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-2.5 py-0.5 rounded-full">
            Sugestões de hoje
          </span>
        )}

        {/* Message bubble */}
        <div
          className={`rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm transition-colors ${
            isCronRecommendation
              ? "bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800"
              : isRetryable
              ? "bg-destructive/10 border border-destructive/20"
              : "bg-muted"
          }`}
        >
          {isLoading ? (
            <div className="flex items-center gap-2 py-1.5 px-1">
              <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce [animation-delay:0ms]" />
              <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce [animation-delay:200ms]" />
              <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce [animation-delay:400ms]" />
              <span className="text-xs text-muted-foreground ml-1 animate-pulse">digitando...</span>
            </div>
          ) : (
            <div className="text-sm text-foreground prose prose-sm prose-neutral dark:prose-invert max-w-none leading-relaxed [&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5 [&_strong]:text-foreground [&_a]:text-primary">
              <ReactMarkdown>{content}</ReactMarkdown>
            </div>
          )}
        </div>

        {/* Cron suggestion buttons */}
        {isCronRecommendation && suggestionNumbers.length > 0 && onQuickReply && (
          <div className="flex gap-2">
            {suggestionNumbers.map((n) => (
              <button
                key={n}
                onClick={() => onQuickReply(`Quero criar a sugestão ${n}`)}
                className="w-8 h-8 rounded-full border border-amber-300 bg-amber-50 dark:bg-amber-900/30 text-sm font-semibold text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-800/40 transition-all hover:scale-110 active:scale-95"
              >
                {n}
              </button>
            ))}
          </div>
        )}

        {/* WhatsApp — hidden (feature futura) */}

        {/* Retry button for errors */}
        {isRetryable && onRetry && (
          <Button
            size="sm"
            variant="outline"
            className="text-xs gap-1.5 rounded-full border-destructive/30 text-destructive hover:bg-destructive/10 transition-all hover:scale-105 active:scale-95"
            onClick={onRetry}
          >
            <RefreshCw className="w-3 h-3" />
            Tentar novamente
          </Button>
        )}

        {/* Action card */}
        {actionResult?.content_id && actionResult?.content_type && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
            <ActionCard
              contentId={actionResult.content_id}
              contentType={actionResult.content_type as "post" | "carousel" | "story" | "document" | "article" | "cron_config"}
              platform={actionResult.platform}
              previewImageUrl={actionResult.preview_image_url}
              headline={actionResult.headline}
              messageId={id}
              onRegenerate={onRegenerate}
              onReject={onReject}
              onAddMessage={onAddMessage}
              onAdapt={onAdapt}
            />
          </div>
        )}

        {/* Quick reply buttons */}
        {quickReplies && quickReplies.length > 0 && onQuickReply && (
          <div className="animate-in fade-in slide-in-from-bottom-1 duration-300 delay-200">
            <QuickReplies options={quickReplies} onSelect={onQuickReply} />
          </div>
        )}

        {/* Timestamp */}
        {timestamp && !isLoading && (
          <span className="text-[10px] text-muted-foreground/60 ml-1 tabular-nums">{timestamp}</span>
        )}
      </div>
    </div>
  );
}