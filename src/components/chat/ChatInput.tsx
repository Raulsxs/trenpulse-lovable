import { useState, useRef, useEffect, KeyboardEvent, useMemo } from "react";
import { Send, Loader2, ImagePlus, MessageSquarePlus, Tag, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChatInputProps {
  onSend: (message: string) => void;
  onFilesSelected?: (files: File[]) => void;
  disabled?: boolean;
  placeholder?: string;
  showImageUpload?: boolean;
  userId?: string;
  onNewChat?: () => void;
  hasMessages?: boolean;
  brands?: Array<{ id: string; name: string }>;
  selectedBrandId?: string | null;
  onBrandSelect?: (brandId: string | null) => void;
  prefillText?: string;
  prefillKey?: number;
}

export default function ChatInput({ onSend, onFilesSelected, disabled, placeholder = "Cole um link ou descreva o conteúdo...", showImageUpload, userId, onNewChat, hasMessages, brands, selectedBrandId, onBrandSelect, prefillText, prefillKey }: ChatInputProps) {
  const [value, setValue] = useState("");
  const [showBrandDropdown, setShowBrandDropdown] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const brandDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [value]);

  // Handle prefill text from quick actions (prefillKey forces re-trigger for same template)
  useEffect(() => {
    if (prefillText) {
      setValue(prefillText);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [prefillText, prefillKey]);

  // Close brand dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (brandDropdownRef.current && !brandDropdownRef.current.contains(e.target as Node)) {
        setShowBrandDropdown(false);
      }
    };
    if (showBrandDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showBrandDropdown]);

  const selectedBrand = useMemo(() => {
    if (!selectedBrandId || !brands) return null;
    return brands.find((b) => b.id === selectedBrandId) || null;
  }, [selectedBrandId, brands]);

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
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
        {/* Selected brand chip */}
        {selectedBrand && (
          <div className="flex items-center gap-1.5 animate-in fade-in slide-in-from-bottom-1 duration-200">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/20 text-xs font-medium text-primary">
              <Tag className="w-3 h-3" />
              {selectedBrand.name}
              <button
                onClick={() => onBrandSelect?.(null)}
                className="ml-0.5 hover:text-primary/70 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          </div>
        )}

        {/* Input row — new chat + brand selector + textarea + send */}
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

          {/* Brand selector button */}
          {brands && brands.length > 0 && onBrandSelect && (
            <div className="relative" ref={brandDropdownRef}>
              <button
                onClick={() => setShowBrandDropdown(!showBrandDropdown)}
                className={`flex-shrink-0 h-10 w-10 rounded-xl border bg-muted/20 flex items-center justify-center transition-all duration-200 ${
                  selectedBrandId
                    ? "border-primary/40 text-primary bg-primary/5"
                    : "border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
                title="Selecionar marca"
              >
                <Tag className="w-4 h-4" />
              </button>

              {/* Brand dropdown */}
              {showBrandDropdown && (
                <div className="absolute bottom-12 left-0 z-50 w-52 rounded-xl border border-border/60 bg-background shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <div className="p-1.5">
                    <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                      Marca
                    </div>
                    {/* No brand option */}
                    <button
                      onClick={() => {
                        onBrandSelect(null);
                        setShowBrandDropdown(false);
                      }}
                      className={`w-full text-left px-2.5 py-2 rounded-lg text-xs transition-colors ${
                        !selectedBrandId
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-foreground/80 hover:bg-muted/50"
                      }`}
                    >
                      Sem marca
                    </button>
                    {/* Brand list */}
                    {brands.map((brand) => (
                      <button
                        key={brand.id}
                        onClick={() => {
                          onBrandSelect(brand.id);
                          setShowBrandDropdown(false);
                        }}
                        className={`w-full text-left px-2.5 py-2 rounded-lg text-xs transition-colors ${
                          selectedBrandId === brand.id
                            ? "bg-primary/10 text-primary font-medium"
                            : "text-foreground/80 hover:bg-muted/50"
                        }`}
                      >
                        {brand.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
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
