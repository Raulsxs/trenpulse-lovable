import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SlidersHorizontal, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface GenerationDefaultsData {
  defaultBrandId: string | null;
  defaultBrandName: string | null;
  defaultPlatform: "instagram" | "linkedin" | null;
  defaultContentStyle: string;
  defaultFormat: string | null;
}

interface Brand {
  id: string;
  name: string;
}

const CONTENT_STYLES = [
  { value: "news", label: "Informar", icon: "📰" },
  { value: "tip", label: "Ensinar", icon: "💡" },
  { value: "curiosity", label: "Provocar", icon: "🤔" },
  { value: "quote", label: "Inspirar", icon: "💬" },
  { value: "educational", label: "Convencer", icon: "📊" },
];

const PLATFORMS = [
  { value: "instagram", label: "Instagram", icon: "📸" },
  { value: "linkedin", label: "LinkedIn", icon: "💼" },
];

const FORMATS = [
  { value: "post", label: "Post", icon: "📷" },
  { value: "carousel", label: "Carrossel", icon: "🎠" },
  { value: "story", label: "Story", icon: "📱" },
  { value: "document", label: "Documento", icon: "📄" },
];

interface Props {
  userId: string;
  defaults: GenerationDefaultsData;
  onDefaultsChange: (defaults: GenerationDefaultsData) => void;
}

export default function GenerationDefaults({ userId, defaults, onDefaultsChange }: Props) {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) {
      supabase
        .from("brands")
        .select("id, name")
        .eq("owner_user_id", userId)
        .then(({ data }) => setBrands(data || []));
    }
  }, [open, userId]);

  const update = (partial: Partial<GenerationDefaultsData>) => {
    const updated = { ...defaults, ...partial };
    onDefaultsChange(updated);
    supabase
      .from("ai_user_context")
      .select("extra_context")
      .eq("user_id", userId)
      .single()
      .then(({ data }) => {
        const extra = (data?.extra_context as Record<string, unknown>) || {};
        supabase
          .from("ai_user_context")
          .update({ extra_context: { ...extra, generation_defaults: updated } })
          .eq("user_id", userId)
          .then(() => {});
      });
  };

  // Count active (non-default) settings
  const activeCount = [
    defaults.defaultBrandId,
    defaults.defaultPlatform,
    defaults.defaultContentStyle !== "news" ? defaults.defaultContentStyle : null,
    defaults.defaultFormat,
  ].filter(Boolean).length;

  // Build summary chips for active defaults
  const activeChips: string[] = [];
  if (defaults.defaultPlatform) activeChips.push(defaults.defaultPlatform === "instagram" ? "📸 IG" : "💼 LI");
  if (defaults.defaultFormat) {
    const f = FORMATS.find(f => f.value === defaults.defaultFormat);
    if (f) activeChips.push(`${f.icon}`);
  }
  if (defaults.defaultBrandName) activeChips.push(defaults.defaultBrandName.substring(0, 8));

  const OptionButton = ({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
        selected
          ? "bg-primary/10 text-primary border border-primary/30 shadow-sm"
          : "bg-muted/40 text-muted-foreground border border-transparent hover:bg-muted/80 hover:text-foreground"
      }`}
    >
      {children}
      {selected && <Check className="w-3 h-3 text-primary" />}
    </button>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative flex-shrink-0 h-10 rounded-xl border border-border/60 bg-muted/20 flex items-center gap-1.5 px-2.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 hover:border-border transition-all duration-200"
          title="Configurações de geração"
        >
          <SlidersHorizontal className="w-4 h-4" />
          {activeChips.length > 0 && (
            <div className="flex items-center gap-1">
              {activeChips.map((chip, i) => (
                <span key={i} className="text-[10px] font-medium text-foreground/70">{chip}</span>
              ))}
            </div>
          )}
          {activeCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary text-[9px] font-bold text-primary-foreground flex items-center justify-center shadow-sm">
              {activeCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-[280px] p-0 rounded-xl border border-border shadow-xl bg-popover"
      >
        <div className="p-3 border-b border-border/40">
          <p className="text-xs font-semibold text-foreground">Configurar geração</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Atalhos aplicados automaticamente</p>
        </div>

        <div className="p-3 space-y-3">
          {/* Brand */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Marca</label>
            <div className="flex flex-wrap gap-1.5">
              <OptionButton
                selected={!defaults.defaultBrandId}
                onClick={() => update({ defaultBrandId: null, defaultBrandName: null })}
              >
                Perguntar
              </OptionButton>
              {brands.map((b) => (
                <OptionButton
                  key={b.id}
                  selected={defaults.defaultBrandId === b.id}
                  onClick={() => update({ defaultBrandId: b.id, defaultBrandName: b.name })}
                >
                  {b.name.length > 12 ? b.name.substring(0, 12) + "…" : b.name}
                </OptionButton>
              ))}
            </div>
          </div>

          {/* Platform */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Plataforma</label>
            <div className="flex flex-wrap gap-1.5">
              <OptionButton
                selected={!defaults.defaultPlatform}
                onClick={() => update({ defaultPlatform: null })}
              >
                Perguntar
              </OptionButton>
              {PLATFORMS.map((p) => (
                <OptionButton
                  key={p.value}
                  selected={defaults.defaultPlatform === p.value}
                  onClick={() => update({ defaultPlatform: p.value as any })}
                >
                  {p.icon} {p.label}
                </OptionButton>
              ))}
            </div>
          </div>

          {/* Content Style */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Tom</label>
            <div className="flex flex-wrap gap-1.5">
              {CONTENT_STYLES.map((s) => (
                <OptionButton
                  key={s.value}
                  selected={defaults.defaultContentStyle === s.value}
                  onClick={() => update({ defaultContentStyle: s.value })}
                >
                  {s.icon} {s.label}
                </OptionButton>
              ))}
            </div>
          </div>

          {/* Format */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Formato</label>
            <div className="flex flex-wrap gap-1.5">
              <OptionButton
                selected={!defaults.defaultFormat}
                onClick={() => update({ defaultFormat: null })}
              >
                Perguntar
              </OptionButton>
              {FORMATS.map((f) => (
                <OptionButton
                  key={f.value}
                  selected={defaults.defaultFormat === f.value}
                  onClick={() => update({ defaultFormat: f.value })}
                >
                  {f.icon} {f.label}
                </OptionButton>
              ))}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export type { GenerationDefaultsData };
