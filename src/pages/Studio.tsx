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
import BrandCreationModal from "@/components/chat/BrandCreationModal";
import { CostChip } from "@/components/ui/cost-chip";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useBrands } from "@/hooks/useStudio";
import { useCredits } from "@/hooks/useCredits";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Sparkles, Loader2, ImageIcon, GalleryHorizontalEnd, Smartphone, Wand2,
  Zap, Crown, Gauge, Film, Lock, Palette, Check,
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
  icon: any; tag?: string; tone: string; sample: string;
}[] = [
  { id: "gpt-image-2", name: "GPT-Image 2", forte: "Texto pt-BR perfeito, design gráfico", cost: 8, speed: "~20s", icon: Crown, tag: "Recomendado", tone: "text-primary", sample: "/showcase/gpt_post.jpg" },
  { id: "seedream", name: "Seedream 4.0", forte: "5x mais rápido, texto bom", cost: 4, speed: "~15s", icon: Zap, tone: "text-[hsl(var(--credit))]", sample: "/showcase/seedream_post.jpg" },
  { id: "nano-banana", name: "Nano Banana Pro", forte: "Premium, melhor pra 9:16", cost: 20, speed: "~80s", icon: Gauge, tone: "text-accent", sample: "/showcase/nano_story.jpg" },
];

const DIAL: { id: string; label: string; hint: string }[] = [
  { id: "copy", label: "Copiar estilo", hint: "fiel às referências da marca" },
  { id: "inspire", label: "Inspirar", hint: "estilo próximo, com liberdade" },
  { id: "free", label: "Criar livre", hint: "só paleta e tom" },
];

// Galeria de inspiração (empty-state): mostra o que dá pra criar — "show, don't tell".
const SHOWCASE = [
  { src: "/showcase/gpt_post.jpg", label: "Post" },
  { src: "/showcase/nano_story.jpg", label: "Story" },
  { src: "/showcase/seedream_post.jpg", label: "Post" },
];

// Prompts-exemplo clicáveis (empty-state): tira a pessoa da tela em branco.
const EXAMPLE_PROMPTS = [
  "5 sinais de burnout que você ignora",
  "3 hábitos para mais energia no dia a dia",
  "O mito da motivação que te trava",
  "Como criar autoridade nas redes sem aparecer",
];

export default function Studio() {
  const { data: brands, refetch: refetchBrands } = useBrands();
  const { balance, refresh: refreshCredits } = useCredits();
  const [brandModalOpen, setBrandModalOpen] = useState(false);

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
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5 animate-fade-in">
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

        {/* Marca — linha única com scroll (sem wrap-bagunça), swatch de cor por marca */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground inline-flex items-center gap-1.5 shrink-0">
            <Palette className="w-3.5 h-3.5" /> Marca
          </span>
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-thin py-0.5 min-w-0">
            <button
              onClick={() => setBrandId(null)}
              className={cn("shrink-0 rounded-full px-3 py-1 text-xs border transition-colors", !brandId ? "bg-primary/10 text-primary border-primary/40 font-medium" : "bg-background text-muted-foreground border-border hover:border-primary/30")}
            >
              Sem marca
            </button>
            {brands?.map((b: any) => {
              const swatch = (b.palette?.[0] && (typeof b.palette[0] === "string" ? b.palette[0] : b.palette[0]?.hex)) || "#94a3b8";
              return (
                <button
                  key={b.id}
                  onClick={() => setBrandId(b.id)}
                  className={cn("shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs border transition-colors", brandId === b.id ? "bg-primary/10 text-primary border-primary/40 font-medium" : "bg-background text-muted-foreground border-border hover:border-primary/30")}
                >
                  <span className="w-2.5 h-2.5 rounded-full border border-border/50" style={{ backgroundColor: swatch }} />
                  {b.name}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setBrandModalOpen(true)}
            className="shrink-0 inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs border border-dashed border-border text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
          >
            <Sparkles className="w-3 h-3" /> Criar marca
          </button>
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 stagger-children">
            {MODELS.map((m) => {
              const active = effectiveModel === m.id;
              const locked = formatId === "story" && m.id !== "nano-banana";
              return (
                <button
                  key={m.id}
                  onClick={() => !locked && setModelId(m.id)}
                  disabled={locked}
                  className={cn(
                    "group text-left rounded-xl border overflow-hidden transition-all duration-200 relative",
                    active ? "border-primary ring-2 ring-primary/30 shadow-sm" : "border-border hover:border-primary/40 hover:shadow-sm",
                    locked && "opacity-40 cursor-not-allowed",
                  )}
                >
                  {/* Amostra real do modelo — "show, don't tell" */}
                  <div className="relative h-20 overflow-hidden bg-muted">
                    <img src={m.sample} alt={`Exemplo ${m.name}`} loading="lazy" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                    {m.tag && !locked && <span className="absolute top-1.5 left-1.5 text-[8px] font-bold uppercase tracking-wide bg-primary text-primary-foreground px-1.5 py-0.5 rounded shadow">{m.tag}</span>}
                    {active && <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center"><Check className="w-3 h-3" /></span>}
                  </div>
                  <div className="p-2.5">
                    <div className="flex items-center gap-1 mb-0.5">
                      <m.icon className={cn("w-3.5 h-3.5", m.tone)} />
                      <span className="text-xs font-bold leading-tight">{m.name}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground leading-tight mb-1.5 line-clamp-2">{m.forte}</div>
                    <div className="flex items-center gap-1.5">
                      <CostChip cost={m.cost} />
                      <span className="text-[10px] text-muted-foreground font-semibold">{m.speed}</span>
                    </div>
                  </div>
                </button>
              );
            })}
            {/* Vídeo — Onda 4 */}
            <div className="rounded-xl border border-dashed border-border overflow-hidden opacity-70">
              <div className="h-20 bg-gradient-to-br from-muted to-muted/40 flex items-center justify-center">
                <Film className="w-6 h-6 text-muted-foreground/50" />
              </div>
              <div className="p-2.5">
                <div className="text-xs font-bold leading-tight flex items-center gap-1">Vídeo <Lock className="w-3 h-3" /></div>
                <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">Kling / Seedance</div>
                <span className="text-[10px] text-muted-foreground font-semibold">em breve</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Resultado / loader / vitrine ── */}
        {generating && (
          <div className="rounded-xl border border-border bg-card overflow-hidden animate-scale-in">
            <div className="skeleton-shimmer aspect-[16/10] w-full" />
            <div className="p-4 flex items-center gap-2.5">
              <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium">Gerando com {model.name}…</p>
                <p className="text-xs text-muted-foreground">{format.slides > 1 ? `${format.slides} slides · ` : ""}isso leva {model.speed.replace("~", "")}. Pode trocar de aba, a gente avisa.</p>
              </div>
            </div>
          </div>
        )}

        {result && !generating && (
          <div className="animate-scale-in">
            <ActionCard contentId={result.contentId} contentType={result.contentType} platform={result.platform} />
          </div>
        )}

        {/* Empty-state: vitrine de inspiração (mata o vácuo + "show, don't tell") */}
        {!result && !generating && (
          <div className="pt-1 animate-fade-in">
            <div className="flex items-baseline gap-2 mb-2.5">
              <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">O que dá pra criar</h2>
              <span className="text-[11px] text-muted-foreground">tudo isto saiu daqui, em segundos</span>
            </div>
            <div className="grid grid-cols-3 gap-2.5 mb-4">
              {SHOWCASE.map((s, i) => (
                <div key={i} className="rounded-xl overflow-hidden border border-border bg-muted aspect-[4/5] group cursor-default">
                  <img src={s.src} alt={`Exemplo ${s.label}`} loading="lazy" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                </div>
              ))}
            </div>
            <p className="text-xs font-semibold text-muted-foreground mb-2">Sem ideia? Comece por uma destas:</p>
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLE_PROMPTS.map((ex) => (
                <button
                  key={ex}
                  onClick={() => setPrompt(ex)}
                  className="text-xs px-3 py-1.5 rounded-full border border-border bg-background text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/5 transition-colors"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <BrandCreationModal
        open={brandModalOpen}
        onOpenChange={setBrandModalOpen}
        onCreated={async (newId) => { await refetchBrands(); setBrandId(newId); }}
      />
    </DashboardLayout>
  );
}
