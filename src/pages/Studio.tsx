/**
 * Studio — superfície de geração com seletor de modelo (a "estante").
 * Vitrine pro novato: escolhas visíveis (modelo + formato + marca) com custo antes do
 * clique. Reusa o pipeline do ai-chat (param `model` cobra pela estante) e renderiza o
 * resultado no ActionCard (publicar/agendar/baixar/refazer). Chat segue como modo assistido.
 */
import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";
import ActionCard from "@/components/chat/ActionCard";
import BrandCreationModal from "@/components/chat/BrandCreationModal";
import { CostChip } from "@/components/ui/cost-chip";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useBrands } from "@/hooks/useStudio";
import { useCredits } from "@/hooks/useCredits";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Sparkles, Loader2, ImageIcon, GalleryHorizontalEnd, Smartphone, Wand2,
  Zap, Crown, Gauge, Film, Lock, Palette, Check, MessageSquareQuote, ChevronDown, Camera, X, Type,
  Rocket, PenTool, Layers, Aperture,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Formatos (preset esconde aspect ratio do usuário). Tweet card = Satori (motor próprio,
// custo fixo 2cr, não usa a estante de modelos). Grande case pra empresário/autoridade. ──
type FormatId = "post" | "carousel" | "story" | "tweet" | "free";
const FORMATS: { id: FormatId; label: string; icon: any; intent: string; format: string; slides: number; fixedCost?: number; satori?: boolean }[] = [
  { id: "post", label: "Post 1:1", icon: ImageIcon, intent: "GENERATE", format: "post", slides: 1 },
  { id: "carousel", label: "Carrossel", icon: GalleryHorizontalEnd, intent: "GENERATE_CAROUSEL", format: "carousel", slides: 5 },
  { id: "story", label: "Story 9:16", icon: Smartphone, intent: "GENERATE", format: "story", slides: 1 },
  { id: "tweet", label: "Tweet card", icon: MessageSquareQuote, intent: "GENERATE_TWEET_CARD", format: "post", slides: 1, fixedCost: 5, satori: true },
  { id: "free", label: "Imagem livre", icon: Wand2, intent: "FREE_IMAGE", format: "post", slides: 1 },
];

// ── Estante de modelos (custo = credit_pricing img_<model>; specs validados na F0) ──
type ModelId = "seedream" | "gpt-image-2" | "nano-banana" | "qwen" | "reve" | "imagen-fast" | "ideogram" | "recraft" | "flux-pro";
const MODELS: {
  id: ModelId; name: string; forte: string; cost: number; speed: string;
  icon: any; tag?: string; tone: string; sample: string; noText?: boolean;
}[] = [
  { id: "gpt-image-2", name: "GPT-Image 2", forte: "Texto pt-BR perfeito, design gráfico", cost: 8, speed: "~30s", icon: Crown, tag: "Recomendado", tone: "text-primary", sample: "/showcase/gpt_post.jpg" },
  { id: "imagen-fast", name: "Imagen 4 Fast", forte: "Google — pronto em segundos, acentos certos", cost: 3, speed: "~5s", icon: Rocket, tag: "Mais rápido", tone: "text-blue-600", sample: "/showcase/imagen_post.jpg" },
  { id: "ideogram", name: "Ideogram v3", forte: "Design gráfico + copiar estilo da marca", cost: 4, speed: "~10s", icon: PenTool, tone: "text-fuchsia-600", sample: "/showcase/ideogram_post.jpg" },
  { id: "recraft", name: "Recraft v3", forte: "Tipografia e design SOTA, card limpo", cost: 5, speed: "~10s", icon: Layers, tone: "text-orange-600", sample: "/showcase/recraft_post.jpg" },
  { id: "flux-pro", name: "Flux 1.1 Pro", forte: "Fotorrealismo premium (Black Forest Labs)", cost: 5, speed: "~5s", icon: Aperture, tone: "text-violet-600", sample: "/showcase/flux_post.jpg" },
  { id: "seedream", name: "Seedream 4.0", forte: "Rápido e barato, texto bom", cost: 4, speed: "~10s", icon: Zap, tone: "text-[hsl(var(--credit))]", sample: "/showcase/seedream_post.jpg" },
  { id: "nano-banana", name: "Nano Banana Pro", forte: "Premium, melhor pra 9:16", cost: 20, speed: "~40s", icon: Gauge, tone: "text-accent", sample: "/showcase/nano_story.jpg" },
  { id: "qwen", name: "Qwen", forte: "Fotos e cenas realistas (sem texto)", cost: 5, speed: "~10s", icon: Camera, tone: "text-emerald-600", sample: "/showcase/qwen_photo.jpg", noText: true },
  { id: "reve", name: "Reve", forte: "Texto pt-BR impecável, estilo minimalista", cost: 3, speed: "~10s", icon: Type, tone: "text-sky-600", sample: "/showcase/reve_post.jpg" },
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
  // Hint de marca no 1º acesso — garante que o usuário aprenda essa feature de valor.
  const [showBrandHint, setShowBrandHint] = useState(() => {
    try { return localStorage.getItem("tp_brand_hint_seen") !== "1"; } catch { return true; }
  });
  const dismissBrandHint = () => { try { localStorage.setItem("tp_brand_hint_seen", "1"); } catch { /* ignore */ } setShowBrandHint(false); };

  // Prefill do onboarding (novas contas caem aqui com o prompt do nicho pré-armado)
  const onboardingPrefill = (useLocation().state as { prefill?: string } | null)?.prefill;
  const [prompt, setPrompt] = useState(onboardingPrefill ?? "");
  const [formatId, setFormatId] = useState<FormatId>("post");
  const [modelId, setModelId] = useState<ModelId>("gpt-image-2");
  const [brandId, setBrandId] = useState<string | null>(null);
  const [dial, setDial] = useState("copy");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ contentId: string; contentType: any; platform?: string } | null>(null);
  const [recents, setRecents] = useState<{ id: string; img: string }[]>([]);

  const format = FORMATS.find((f) => f.id === formatId)!;
  const model = MODELS.find((m) => m.id === modelId)!;
  const isSatori = !!format.satori; // tweet card = motor próprio, estante não se aplica
  // Story precisa de 9:16 nativo → Nano Banana (os outros não fazem vertical de verdade).
  const effectiveModel = formatId === "story" ? "nano-banana" : modelId;
  const effectiveCost = format.fixedCost ?? (MODELS.find((m) => m.id === effectiveModel)?.cost ?? model.cost) * format.slides;
  const selectedBrand = brands?.find((b: any) => b.id === brandId);
  const brandSwatch = (b: any) => (b?.palette?.[0] && (typeof b.palette[0] === "string" ? b.palette[0] : b.palette[0]?.hex)) || "#94a3b8";

  // Últimas geradas do usuário — viram a galeria (real, pessoal). Estático só se não houver nenhuma.
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("generated_contents")
        .select("id, image_urls")
        .eq("user_id", user.id)
        .not("image_urls", "is", null)
        .order("created_at", { ascending: false })
        .limit(6);
      const list = (data || [])
        .map((r: any) => ({ id: r.id, img: r.image_urls?.[0] }))
        .filter((r: any) => !!r.img);
      setRecents(list);
    })();
  }, [result]);

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
          // Tweet card é Satori (custo fixo 2cr) — NÃO mandar model, senão cobraria por img_<model>.
          model: isSatori ? undefined : effectiveModel,
          creationModeOverride: brandId && !isSatori ? dial : undefined,
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
      {/* flex-col + order: reordena visualmente (modelo logo após o prompt → marca → dial)
          sem mover blocos de JSX. Ordem de decisão: formato → modelo → marca → gerar. */}
      <div className="max-w-3xl mx-auto px-4 py-6 flex flex-col gap-5 animate-fade-in">
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

        {/* ── ZONA DE RESULTADO — aparece logo abaixo do prompt, empurrando o resto pra
            baixo. A imagem que está sendo criada fica no topo, em foco. ── */}
        {generating && (
          <div className="rounded-xl border border-border bg-card overflow-hidden animate-grow-down">
            <div className="skeleton-shimmer aspect-[16/10] w-full" />
            <div className="p-4 flex items-center gap-2.5">
              <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium">Criando {format.label.toLowerCase()}{isSatori ? "" : ` com ${model.name}`}…</p>
                <p className="text-xs text-muted-foreground">{format.slides > 1 ? `${format.slides} slides · ` : ""}a IA está caprichando no texto e no visual. Pode trocar de aba, a gente avisa quando ficar pronto.</p>
              </div>
            </div>
          </div>
        )}
        {result && !generating && (
          <div className="animate-grow-down overflow-hidden">
            <ActionCard contentId={result.contentId} contentType={result.contentType} platform={result.platform} />
            <button onClick={() => { setResult(null); setPrompt(""); }} className="mt-2 text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> Criar outro
            </button>
          </div>
        )}

        {/* Hint de marca (1º acesso) — explica a feature de valor: marca = sua cara em tudo */}
        {showBrandHint && (
          <div className="flex items-start gap-2.5 rounded-xl border border-accent/30 bg-accent/5 p-3 animate-fade-in">
            <Palette className="w-4 h-4 text-accent shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-foreground"><b>Crie sua marca uma vez</b> e todo conteúdo sai com a sua cara — cores, fontes, tom e estilo aplicados automaticamente. Mande exemplos que você curte e a IA copia.</p>
              <div className="flex items-center gap-3 mt-2">
                <button onClick={() => { dismissBrandHint(); setBrandModalOpen(true); }} className="text-xs font-semibold text-accent hover:underline">Criar minha marca</button>
                <button onClick={dismissBrandHint} className="text-xs text-muted-foreground hover:text-foreground">Entendi</button>
              </div>
            </div>
            <button onClick={dismissBrandHint} className="text-muted-foreground hover:text-foreground shrink-0"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}

        {/* Marca — alto (identidade = valor central, "seu conteúdo com a sua cara") */}
        <div className="order-1 flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground inline-flex items-center gap-1.5 shrink-0">
            <Palette className="w-3.5 h-3.5" /> Marca
          </span>
          <Popover>
            <PopoverTrigger asChild>
              <button className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-xs hover:border-primary/40 transition-colors min-w-[180px]">
                {selectedBrand ? (
                  <>
                    <span className="w-3 h-3 rounded-full border border-border/50 shrink-0" style={{ backgroundColor: brandSwatch(selectedBrand) }} />
                    <span className="font-medium truncate">{(selectedBrand as any).name}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">Sem marca</span>
                )}
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground ml-auto shrink-0" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-1.5" align="start">
              <button
                onClick={() => setBrandId(null)}
                className={cn("w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs hover:bg-muted/80 transition-colors", !brandId && "bg-primary/5 text-primary font-medium")}
              >
                <span className="w-3 h-3 rounded-full border border-dashed border-muted-foreground/40 shrink-0" />
                Sem marca
                {!brandId && <Check className="w-3.5 h-3.5 ml-auto" />}
              </button>
              <div className="max-h-56 overflow-y-auto">
                {brands?.map((b: any) => (
                  <button
                    key={b.id}
                    onClick={() => setBrandId(b.id)}
                    className={cn("w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs hover:bg-muted/80 transition-colors", brandId === b.id && "bg-primary/5 text-primary font-medium")}
                  >
                    <span className="w-3 h-3 rounded-full border border-border/50 shrink-0" style={{ backgroundColor: brandSwatch(b) }} />
                    <span className="truncate">{b.name}</span>
                    {brandId === b.id && <Check className="w-3.5 h-3.5 ml-auto shrink-0" />}
                  </button>
                ))}
              </div>
              <div className="border-t border-border/60 mt-1 pt-1">
                <button
                  onClick={() => setBrandModalOpen(true)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-primary hover:bg-primary/5 transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" /> Criar nova marca
                </button>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {selectedBrand && !isSatori && (
          <div className="order-2 flex gap-2">
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

        {/* Estante de modelos — não se aplica ao Tweet card (motor Satori próprio) */}
        {!isSatori && (
          <div className="order-3">
            <div className="flex items-baseline gap-2 mb-2 flex-wrap">
              <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Modelo</h2>
              {formatId === "story" && <span className="text-[11px] text-muted-foreground">story usa Nano Banana (9:16 nativo)</span>}
              {modelId === "qwen" && formatId !== "free" && (
                <span className="text-[11px] text-[hsl(var(--credit))] font-medium">⚠ Qwen é pra fotos/cenas — não renderiza texto. Ideal em "Imagem livre".</span>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 stagger-children">
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
        )}

        {isSatori && (
          <div className="order-3 rounded-xl border border-border bg-muted/30 p-3 flex items-center gap-2.5 text-xs text-muted-foreground">
            <MessageSquareQuote className="w-4 h-4 text-primary shrink-0" />
            <span>O <b className="text-foreground">Tweet card</b> usa nosso motor próprio (tipografia fiel ao X), com a sua foto e @ de perfil. Sem escolha de modelo.</span>
          </div>
        )}

        {/* Galeria: suas últimas criações (real, pessoal). Estático só no 1º acesso sem conteúdo.
            Some quando há resultado/gerando — a tela já está cheia de valor em cima. */}
        {!result && !generating && (
          <div className="order-4 pt-1 animate-fade-in">
            {recents.length > 0 ? (
              <>
                <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2.5">Suas últimas criações</h2>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {recents.map((r) => (
                    <a key={r.id} href={`/content/${r.id}`} className="rounded-lg overflow-hidden border border-border bg-muted aspect-square group">
                      <img src={r.img} alt="" loading="lazy" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                    </a>
                  ))}
                </div>
              </>
            ) : (
              <>
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
              </>
            )}
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
