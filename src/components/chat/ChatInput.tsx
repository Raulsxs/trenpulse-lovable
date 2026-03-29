import { useState, useRef, useEffect, KeyboardEvent, useMemo } from "react";
import { Send, Loader2, Link, ImagePlus, MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import GenerationDefaults from "./GenerationDefaults";
import type { GenerationDefaultsData } from "./GenerationDefaults";

interface ChatInputProps {
  onSend: (message: string) => void;
  onFilesSelected?: (files: File[]) => void;
  disabled?: boolean;
  placeholder?: string;
  showImageUpload?: boolean;
  userId?: string;
  generationDefaults?: GenerationDefaultsData;
  onDefaultsChange?: (defaults: GenerationDefaultsData) => void;
  onNewChat?: () => void;
  hasMessages?: boolean;
}

const URL_REGEX = /https?:\/\/[^\s]+/;

export default function ChatInput({ onSend, onFilesSelected, disabled, placeholder = "Cole um link ou descreva o conteúdo...", showImageUpload, userId, generationDefaults, onDefaultsChange, onNewChat, hasMessages }: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [value]);

  const hasUrl = useMemo(() => URL_REGEX.test(value), [value]);
  const detectedUrl = useMemo(() => value.match(URL_REGEX)?.[0] || "", [value]);

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  };

  const [linkPlatform, setLinkPlatform] = useState<string | null>(null);

  const handleLinkPlatform = (platform: string) => {
    setLinkPlatform(platform);
  };

  const handleLinkAction = (type: string) => {
    if (!detectedUrl || disabled) return;
    const platform = linkPlatform || "instagram";
    onSend(`Cria um ${type} para ${platform} a partir deste link: ${detectedUrl}`);
    setValue("");
    setLinkPlatform(null);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0 && onFilesSelected) {
      onFilesSelected(files);
    }
    if (e.target) e.target.value = "";
  };

  return (
    <div className="border-t border-border/30 bg-gradient-to-t from-background via-background to-background/80 p-3 pb-4">
      <div className="max-w-3xl mx-auto space-y-2">
        {/* URL detection banner */}
        {hasUrl && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center gap-1.5 mb-2">
              <Link className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-medium text-foreground">
                {!linkPlatform ? "Link detectado — para qual plataforma?" : `${linkPlatform === "linkedin" ? "LinkedIn" : "Instagram"} — que tipo de conteúdo?`}
              </span>
            </div>
            <div className="flex gap-1.5">
              {!linkPlatform ? (
                <>
                  {[
                    { emoji: "📸", label: "Instagram", platform: "instagram" },
                    { emoji: "💼", label: "LinkedIn", platform: "linkedin" },
                  ].map((item) => (
                    <button
                      key={item.platform}
                      onClick={() => handleLinkPlatform(item.platform)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-background border border-border/60 hover:border-primary/40 hover:bg-primary/5 transition-all duration-150"
                    >
                      <span>{item.emoji}</span>
                      {item.label}
                    </button>
                  ))}
                </>
              ) : (
                (linkPlatform === "linkedin"
                  ? [
                      { emoji: "📷", label: "Post", type: "post" },
                      { emoji: "📄", label: "Documento", type: "documento" },
                      { emoji: "📰", label: "Artigo", type: "artigo" },
                    ]
                  : [
                      { emoji: "📸", label: "Post", type: "post" },
                      { emoji: "🎠", label: "Carrossel", type: "carrossel" },
                      { emoji: "📱", label: "Story", type: "story" },
                    ]
                ).map((item) => (
                  <button
                    key={item.type}
                    onClick={() => handleLinkAction(item.type)}
                    className="text-xs px-3 py-1.5 rounded-lg border border-border/60 bg-background hover:bg-primary/5 hover:border-primary/40 transition-all duration-150 hover:scale-[1.02] active:scale-[0.98]"
                  >
                    {item.emoji} {item.label}
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* Input row — new chat + settings + textarea + send */}
        <div className="flex items-end gap-1.5">
          {/* New chat button */}
          {hasMessages && onNewChat && (
            <button
              onClick={onNewChat}
              className="flex-shrink-0 h-10 w-10 rounded-xl border border-border/60 bg-muted/20 flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/5 hover:border-primary/30 transition-all duration-200"
              title="Nova conversa"
            >
              <MessageSquarePlus className="w-4 h-4" />
            </button>
          )}

          {/* Settings button (generation defaults) */}
          {userId && generationDefaults && onDefaultsChange && (
            <GenerationDefaults
              userId={userId}
              defaults={generationDefaults}
              onDefaultsChange={onDefaultsChange}
            />
          )}

          {/* Image upload button */}
          {showImageUpload && (
            <>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled}
                className="flex-shrink-0 h-10 w-10 rounded-xl border border-border/60 bg-muted/20 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-200 disabled:opacity-50"
                title="Enviar imagem"
              >
                <ImagePlus className="w-4 h-4" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileChange}
                className="hidden"
              />
            </>
          )}

          {/* Textarea */}
          <div className="relative flex-1">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={disabled}
              rows={1}
              className="w-full resize-none rounded-xl border border-border/60 bg-muted/20 px-4 py-2.5 pr-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 disabled:opacity-50 transition-all duration-200"
            />
            {value.length > 0 && (
              <span className="absolute bottom-1.5 right-3 text-[10px] text-muted-foreground/30 tabular-nums">
                {value.length}
              </span>
            )}
          </div>

          {/* Send button */}
          <Button
            size="icon"
            onClick={handleSend}
            disabled={disabled || !value.trim()}
            className="rounded-xl h-10 w-10 flex-shrink-0 shadow-sm transition-all duration-200 hover:shadow-md hover:scale-105 active:scale-95 disabled:hover:scale-100"
          >
            {disabled ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>

        <p className="text-[10px] text-muted-foreground/30 text-center">
          Enter para enviar · Shift+Enter para nova linha
        </p>
      </div>
    </div>
  );
}
