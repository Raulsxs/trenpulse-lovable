/**
 * Studio — superfície de geração com seletor de modelo (a "estante").
 * Vitrine pro novato: escolhas visíveis (modelo + formato + marca) com custo antes do
 * clique. Reusa o pipeline do ai-chat (param `model` cobra pela estante) e renderiza o
 * resultado no ActionCard (publicar/agendar/baixar/refazer). Chat segue como modo assistido.
 */
import { useState } from "react";
import { useLocation } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";
import ActionCard from "@/components/chat/ActionCard";
import { CostChip } from "@/components/ui/cost-chip";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useBrands } from "@/hooks/useStudio";
import { useCredits } from "@/hooks/useCredits";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Sparkles, Loader2, ImageIcon, GalleryHorizontalEnd, Smartphone, Wand2,
  Zap, Crown, Gauge, Film, Lock, Palette,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Formatos (preset esconde aspect ratio do usuário) ──
type FormatId = "post" | "carousel" | "story" | "free";
const FORMATS: { id: FormatId; label: string; icon: any; intent: string; format: string; slides: number }[] = [
  { id: "post", label: "Post 1:1", icon: ImageIcon, intent: "GENERATE", format: "post", slides: 1 },
  { id: "carousel", label: "Carrossel", icon: GalleryHorizontalEnd, intent: "GENERATE_CAROUSEL", format: "carousel", slides: 5 },
  { id: "story", label: "Story 9:16", icon: Smartphone, intent: "GENERATE", format: "story", slides: 1 },
  { id: "free", label: "Imagem livre", icon: Wand2, intent: "FREE_IMAGE", format: "post", slides: 1 },
];

// ── Estante de modelos (custo = credit_pricing img_<model>; specs validados na F0) ──
type ModelId = "seedream" | "gpt-image-2" | "nano-banana";
const MODELS: {
  id: ModelId; name: string; forte: string; cost: number; speed: string;
  icon: any; tag?: string; tone: string;
}[] = [
  { id: "gpt-image-2", name: "GPT-Image 2", forte: "Texto pt-BR perfeito, design gráfico", cost: 8, speed: "~20s", icon: Crown, tag: "Recomendado", tone: "text-primary" },
  { id: "seedream", name: "Seedream 4.0", forte: "5x mais rápido, texto bom", cost: 4, speed: "~15s", icon: Zap, tone: "text-[hsl(var(--credit))]" },
  { id: "nano-banana", name: "Nano Banana Pro", forte: "Premium, melhor pra 9:16", cost: 20, speed: "~80s", icon: Gauge, tone: "text-accent" },
];

const DIAL: { id: string; label: string; hint: string }[] = [
  { id: "copy", label: "Copiar estilo", hint: "fiel às referências da marca" },
  { id: "inspire", label: "Inspirar", hint: "estilo próximo, com liberdade" },
  { id: "free", label: "Criar livre", hint: "só paleta e tom" },
];

export default function Studio() {
  const { data: brands } = useBrands();
  const { balance, refresh: refreshCredits } = useCredits();

  // Prefill do onboarding (novas contas caem aqui com o prompt do nicho pré-armado)
  const onboardingPrefill = (useLocation().state as { prefill?: string } | null)?.prefill;
  const [prompt, setPrompt] = useState(onboardingPrefill ?? "");
  const [formatId, setFormatId] = useState<FormatId>("post");
  const [modelId, setModelId] = useState<ModelId>("gpt-image-2");
  const [brandId, setBrandId] = useState<string | null>(null);
  const [dial, setDial] = useState("copy");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ contentId: string; contentType: any; platform?: string } | null>(null);

  const format = FORMATS.find((f) => f.id === formatId)!;
  const model = MODELS.find((m) => m.id === modelId)!;
  // Story precisa de 9:16 nativo → Nano Banana (os outros não fazem vertical de verdade).
  const effectiveModel = formatId === "story" ? "nano-banana" : modelId;
  const effectiveCost = (MODELS.find((m) => m.id === effectiveModel)?.cost ?? model.cost) * format.slides;
  const selectedBrand = brands?.find((b: any) => b.id === brandId);

  async function generate() {
    if (!prompt.trim() || generating) return;
    setGenerating(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("ai-chat", {
        body: {
          message: prompt.trim(),
          intent_hint: format.intent,
          format: format.format,
          platform: "instagram",
          brandId: brandId || undefined,
          model: effectiveModel,
          creationModeOverride: brandId ? dial : undefined,
          generationParams: format.slides > 1 ? { slideCount: format.slides } : undefined,
        },
      });
      if (error) throw error;
      const ar = data?.action_result;
      if (ar?.content_id) {
        setResult({ contentId: ar.content_id, contentType: ar.content_type || "post", platform: ar.platform });
        refreshCredits();
      } else {
        toast.error(data?.reply || "Não consegui gerar. Tente de novo.");
      }
    } catch (e: any) {
      toast.error(e?.message || "Erro ao gerar");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-baseline justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight">Studio</h1>
            <p className="text-xs text-muted-foreground">Escolha o modelo, aplique sua marca, publique sem sair da tela.</p>
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">{balance ?? "—"} créditos</span>
        </div>

        {/* Prompt */}
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Descreva o que você quer criar… (ex: 5 sinais de hipertensão que seus pacientes ignoram)"
            className="border-0 resize-none min-h-[84px] text-[15px] focus-visible:ring-0 rounded-none"
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) generate(); }}
          />
          <div className="flex items-center gap-2 px-3 py-2.5 border-t border-border/60 bg-muted/20 flex-wrap">
            {FORMATS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFormatId(f.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors",
                  formatId === f.id ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:border-primary/40",
                )}
              >
                <f.icon className="w-3.5 h-3.5" />
                {f.label}
              </button>
            ))}
            <Button onClick={generate} disabled={generating || !prompt.trim()} className="ml-auto h-9 gap-2">
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {generating ? "Gerando…" : "Gerar"}
              {!generating && <CostChip cost={effectiveCost} className="bg-primary-foreground/15 border-primary-foreground/25 text-primary-foreground" />}
            </Button>
          </div>
        </div>

        {/* Marca + dial de fidelidade */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground inline-flex items-center gap-1.5">
            <Palette className="w-3.5 h-3.5" /> Marca
          </span>
          <button
            onClick={() => setBrandId(null)}
            className={cn("rounded-full px-3 py-1 text-xs border", !brandId ? "bg-primary/10 text-primary border-primary/40" : "bg-background text-muted-foreground border-border hover:border-primary/30")}
          >
            Sem marca
          </button>
          {brands?.map((b: any) => (
            <button
              key={b.id}
              onClick={() => setBrandId(b.id)}
              className={cn("rounded-full px-3 py-1 text-xs border", brandId === b.id ? "bg-primary/10 text-primary border-primary/40" : "bg-background text-muted-foreground border-border hover:border-primary/30")}
            >
              {b.name}
            </button>
          ))}
        </div>

        {selectedBrand && (
          <div className="flex gap-2">
            {DIAL.map((d) => (
              <button
                key={d.id}
                onClick={() => setDial(d.id)}
                className={cn(
                  "flex-1 text-left rounded-lg border px-3 py-2 transition-colors",
                  dial === d.id ? "border-accent bg-accent/5 ring-1 ring-accent/40" : "border-border hover:border-accent/30",
                )}
              >
                <span className={cn("block text-xs font-semibold", dial === d.id && "text-accent")}>{d.label}</span>
                <span className="block text-[11px] text-muted-foreground leading-tight">{d.hint}</span>
              </button>
            ))}
          </div>
        )}

        {/* Estante de modelos */}
        <div>
          <div className="flex items-baseline gap-2 mb-2">
            <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Modelo</h2>
            {formatId === "story" && <span className="text-[11px] text-muted-foreground">story usa Nano Banana (9:16 nativo)</span>}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {MODELS.map((m) => {
              const active = effectiveModel === m.id;
              const locked = formatId === "story" && m.id !== "nano-banana";
              return (
                <button
                  key={m.id}
                  onClick={() => !locked && setModelId(m.id)}
                  disabled={locked}
                  className={cn(
                    "text-left rounded-lg border p-2.5 transition-colors relative",
                    active ? "border-primary ring-1 ring-primary/40 bg-primary/[0.03]" : "border-border hover:border-primary/30",
                    locked && "opacity-40 cursor-not-allowed",
                  )}
                >
                  {m.tag && !locked && <span className="absolute top-1.5 right-1.5 text-[8px] font-bold uppercase tracking-wide bg-primary text-primary-foreground px-1.5 py-0.5 rounded">{m.tag}</span>}
                  <m.icon className={cn("w-4 h-4 mb-1.5", m.tone)} />
                  <div className="text-xs font-bold leading-tight">{m.name}</div>
                  <div className="text-[10px] text-muted-foreground leading-tight mt-0.5 mb-1.5 line-clamp-2">{m.forte}</div>
                  <div className="flex items-center gap-1.5">
                    <CostChip cost={m.cost} />
                    <span className="text-[10px] text-muted-foreground font-semibold">{m.speed}</span>
                  </div>
                </button>
              );
            })}
            {/* Vídeo — Onda 4 */}
            <div className="text-left rounded-lg border border-dashed border-border p-2.5 opacity-60">
              <Film className="w-4 h-4 mb-1.5 text-muted-foreground" />
              <div className="text-xs font-bold leading-tight flex items-center gap-1">Vídeo <Lock className="w-3 h-3" /></div>
              <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">Kling / Seedance</div>
              <span className="text-[10px] text-muted-foreground font-semibold">em breve</span>
            </div>
          </div>
        </div>

        {/* Resultado */}
        {generating && (
          <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center gap-2 text-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Gerando com {model.name}… {format.slides > 1 ? `${format.slides} slides` : ""}</p>
          </div>
        )}
        {result && !generating && (
          <div className="pt-1">
            <ActionCard contentId={result.contentId} contentType={result.contentType} platform={result.platform} />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
