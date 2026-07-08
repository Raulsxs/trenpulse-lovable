/**
 * Studio — superfície de geração com seletor de modelo (a "estante").
 * Vitrine pro novato: escolhas visíveis (modelo + formato + marca) com custo antes do
 * clique. Reusa o pipeline do ai-chat (param `model` cobra pela estante) e renderiza o
 * resultado no ActionCard (publicar/agendar/baixar/refazer). Chat segue como modo assistido.
 */
import { useState, useEffect, useRef } from "react";
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
  Zap, Crown, Gauge, Film, Lock, Palette, Check, MessageSquareQuote, ChevronDown, ChevronUp, Camera, X, Type,
  Rocket, PenTool, Layers, Aperture, Copy, ImagePlus,
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
  // acceptsRefs: o modelo recebe imagens de referência da marca (cópia fiel de estilo).
  // Os que NÃO recebem (imagen/recraft/flux/reve) não conseguem copiar o estilo 1:1.
  acceptsRefs: boolean;
}[] = [
  { id: "gpt-image-2", name: "GPT-Image 2", forte: "Texto pt-BR perfeito, design gráfico", cost: 10, speed: "~30s", icon: Crown, tag: "Recomendado", tone: "text-primary", sample: "/showcase/gpt_post.jpg", acceptsRefs: true },
  { id: "imagen-fast", name: "Imagen 4 Fast", forte: "Google — pronto em segundos, acentos certos", cost: 4, speed: "~5s", icon: Rocket, tag: "Mais rápido", tone: "text-blue-600", sample: "/showcase/imagen_post.jpg", acceptsRefs: false },
  { id: "ideogram", name: "Ideogram v3", forte: "Design gráfico + copiar estilo da marca", cost: 5, speed: "~10s", icon: PenTool, tone: "text-fuchsia-600", sample: "/showcase/ideogram_post.jpg", acceptsRefs: true },
  { id: "recraft", name: "Recraft v3", forte: "Tipografia e design SOTA, card limpo", cost: 6, speed: "~10s", icon: Layers, tone: "text-orange-600", sample: "/showcase/recraft_post.jpg", acceptsRefs: false },
  { id: "flux-pro", name: "Flux 1.1 Pro", forte: "Fotorrealismo premium (Black Forest Labs)", cost: 6, speed: "~5s", icon: Aperture, tone: "text-violet-600", sample: "/showcase/flux_post.jpg", acceptsRefs: false },
  { id: "seedream", name: "Seedream 4.0", forte: "Rápido e barato, texto bom", cost: 5, speed: "~10s", icon: Zap, tone: "text-[hsl(var(--credit))]", sample: "/showcase/seedream_post.jpg", acceptsRefs: true },
  { id: "nano-banana", name: "Nano Banana Pro", forte: "Premium, melhor pra 9:16", cost: 25, speed: "~40s", icon: Gauge, tone: "text-accent", sample: "/showcase/nano_story.jpg", acceptsRefs: true },
  { id: "qwen", name: "Qwen", forte: "Fotos e cenas realistas (sem texto)", cost: 6, speed: "~10s", icon: Camera, tone: "text-emerald-600", sample: "/showcase/qwen_photo.jpg", noText: true, acceptsRefs: true },
  { id: "reve", name: "Reve", forte: "Texto pt-BR impecável, estilo minimalista", cost: 4, speed: "~10s", icon: Type, tone: "text-sky-600", sample: "/showcase/reve_post.jpg", acceptsRefs: false },
];

const DIAL: { id: string; label: string; hint: string }[] = [
  { id: "copy", label: "Copiar estilo", hint: "fiel às referências da marca" },
  { id: "inspire", label: "Inspirar", hint: "estilo próximo, com liberdade" },
  { id: "free", label: "Criar livre", hint: "só paleta e tom" },
];

// ── Porta por intenção: a 1ª pergunta da tela. Três perfis entram pela mesma porta e
// o que os separa é o papel da marca (ver doc "Análise & Redesign"). Cada intenção
// revela primeiro o que importa pra ela e esconde a complexidade até ser pedida. ──
type Intent = "replicar" | "criar" | "editar";
const INTENTS: { id: Intent; label: string; sub: string; icon: any; accent: string }[] = [
  { id: "replicar", label: "Replicar", sub: "meu estilo", icon: Copy, accent: "text-primary" },
  { id: "criar", label: "Criar", sub: "do zero com IA", icon: Wand2, accent: "text-accent" },
  { id: "editar", label: "Editar", sub: "subir foto + pedir", icon: ImagePlus, accent: "text-violet-600" },
];

// Galeria de inspiração (empty-state): mostra o que dá pra criar — "show, don't tell".
const SHOWCASE = [
  { src: "/showcase/gpt_post.jpg", label: "Post" },
  { src: "/showcase/nano_story.jpg", label: "Story" },
  { src: "/showcase/seedream_post.jpg", label: "Post" },
  { src: "/showcase/ideogram_post.jpg", label: "Post" },
  { src: "/showcase/recraft_post.jpg", label: "Post" },
  { src: "/showcase/flux_post.jpg", label: "Post" },
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
  // ou "Regerar no mesmo estilo" vindo de /contents (replicate: prompt + marca + imagem-ref).
  const navState = useLocation().state as
    | { prefill?: string; replicate?: { prompt?: string; brandId?: string | null; refUrl?: string | null } }
    | null;
  const onboardingPrefill = navState?.prefill;
  const replicateState = navState?.replicate;
  const [prompt, setPrompt] = useState(replicateState?.prompt ?? onboardingPrefill ?? "");
  const [formatId, setFormatId] = useState<FormatId>("post");
  const [modelId, setModelId] = useState<ModelId>("gpt-image-2");
  const [brandId, setBrandId] = useState<string | null>(null);
  const [dial, setDial] = useState("copy");
  // Intenção (porta) + estante recolhida: a grade de 9 modelos vira uma linha com o
  // recomendado; "Trocar" abre a grade pra quem quer escolher (perfil Criador).
  const [intent, setIntent] = useState<Intent>("criar");
  const [showModels, setShowModels] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ contentId: string; contentType: any; platform?: string } | null>(null);
  const [recents, setRecents] = useState<{ id: string; img: string }[]>([]);
  // "Replicar um post": referência anexada (print/upload) → IA recria parecido com a sua marca.
  const [refPostUrl, setRefPostUrl] = useState<string | null>(null);
  const [uploadingRef, setUploadingRef] = useState(false);
  // "Anexar imagem": ao anexar, o usuário ESCOLHE o que fazer (chooser) em vez do sistema adivinhar.
  // post = post no estilo da marca usando a foto · editorial = carrossel 1 slide/foto · edit → vira "Editar".
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [photoAction, setPhotoAction] = useState<"post" | "editorial">("post");
  const brandPreselected = useRef(false);
  const intentTouched = useRef(false); // não sobrescrever a escolha do usuário

  // Postura adaptativa: usuário ATIVADO (tem marca) abre em "Replicar" com a última marca
  // pré-selecionada — pra ele o valor é a fidelidade. Usuário NOVO (0 marcas) abre em "Criar"
  // (a estante é o herói) sem marca. Roda uma vez quando as marcas chegam.
  useEffect(() => {
    if (brandPreselected.current || !brands || brandId) return;
    if (brands.length === 0) {
      brandPreselected.current = true;
      if (!intentTouched.current) setIntent("criar");
      return;
    }
    // Prefere a marca PADRÃO definida em /brands (tp_default_brand); cai pra última usada.
    let pref: string | null = null;
    try { pref = localStorage.getItem("tp_default_brand") || localStorage.getItem("tp_last_brand"); } catch { /* ignore */ }
    const pick = (pref && brands.find((b: any) => b.id === pref)) ? pref : brands[0].id;
    setBrandId(pick);
    brandPreselected.current = true;
    if (!intentTouched.current) { setIntent("replicar"); setDial("copy"); }
  }, [brands, brandId]);

  // "Regerar no mesmo estilo" (vindo de /contents): abre direto em Replicar com a marca do
  // post original e a imagem dele como referência (image-to-image). Trava a postura adaptativa.
  useEffect(() => {
    if (!replicateState) return;
    intentTouched.current = true;
    brandPreselected.current = true;
    setIntent("replicar");
    setDial("copy");
    if (replicateState.brandId) setBrandId(replicateState.brandId);
    if (replicateState.refUrl) setRefPostUrl(replicateState.refUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Troca de intenção ajusta os defaults pra cada perfil (mas tudo segue acessível).
  function pickIntent(id: Intent) {
    intentTouched.current = true;
    setIntent(id);
    setShowModels(false);
    if (id === "replicar") {
      setDial("copy");
      setRefPostUrl(null);
      if (!brandId && brands?.length) {
        setBrandId(brands[0].id);
        try { localStorage.setItem("tp_last_brand", brands[0].id); } catch { /* ignore */ }
      }
    } else if (id === "criar") {
      setRefPostUrl(null);
    }
  }

  const format = FORMATS.find((f) => f.id === formatId)!;
  const model = MODELS.find((m) => m.id === modelId)!;
  const isSatori = !!format.satori; // tweet card = motor próprio, estante não se aplica
  // Story precisa de 9:16 nativo → Nano Banana (os outros não fazem vertical de verdade).
  const effectiveModel = formatId === "story" ? "nano-banana" : modelId;
  const effectiveCost = format.fixedCost ?? (MODELS.find((m) => m.id === effectiveModel)?.cost ?? model.cost) * format.slides;
  // Carrossel editorial (Satori): 4 cr/slide, 1 slide por foto. Post: custo de 1 imagem do modelo.
  const EDITORIAL_SLIDE_COST = 4;
  const hasPhotos = photos.length > 0;
  const photosAsEditorial = hasPhotos && photoAction === "editorial";
  const displayCost = !hasPhotos
    ? effectiveCost
    : photosAsEditorial
      ? EDITORIAL_SLIDE_COST * photos.length
      : (MODELS.find((m) => m.id === effectiveModel)?.cost ?? model.cost);
  const selectedBrand = brands?.find((b: any) => b.id === brandId);
  const brandSwatch = (b: any) => (b?.palette?.[0] && (typeof b.palette[0] === "string" ? b.palette[0] : b.palette[0]?.hex)) || "#94a3b8";
  // Quer copiar o estilo da marca? (marca de referência + dial não-livre). Se sim, modelos que
  // NÃO aceitam referência (acceptsRefs:false) não conseguem copiar o estilo 1:1 → avisar.
  const brandMode = (selectedBrand as any)?.creation_mode;
  const wantsStyleFidelity = !!selectedBrand && (brandMode === "style_copy" || brandMode === "inspired") && dial !== "free";
  // Modelo efetivo (story força Nano Banana) — alimenta a linha recolhida da estante.
  const effModel = MODELS.find((m) => m.id === effectiveModel) ?? model;
  const isEditing = intent === "editar"; // "subir foto + pedir" — estante não se aplica
  const promptPlaceholder = isEditing
    ? "O que fazer com a imagem? (ex: deixe mais nítida, troque o fundo por um consultório)"
    : intent === "replicar"
      ? `Descreva o post — sai com o estilo da ${(selectedBrand as any)?.name || "sua marca"}`
      : "Descreva o que você quer criar… (ex: 5 sinais de hipertensão que seus pacientes ignoram)";

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

  async function handleRefUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) e.target.value = "";
    if (!file) return;
    setPhotos([]); // "replicar post" e "anexar fotos" são caminhos distintos
    setUploadingRef(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");
      const ext = file.name.split(".").pop() || "png";
      const path = `${user.id}/ref/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("content-images").upload(path, file, { contentType: file.type, upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("content-images").getPublicUrl(path);
      setRefPostUrl(urlData.publicUrl);
    } catch (err: any) {
      toast.error("Erro ao anexar referência: " + (err.message || "tente de novo"));
    } finally {
      setUploadingRef(false);
    }
  }

  // Upload múltiplo das fotos do usuário → fundos do carrossel editorial.
  async function handlePhotosUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (e.target) e.target.value = "";
    if (!files.length) return;
    setRefPostUrl(null); // exclusivo com "replicar post"
    setUploadingPhotos(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");
      const uploaded: string[] = [];
      for (const file of files) {
        const ext = file.name.split(".").pop() || "png";
        const path = `${user.id}/photos/${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;
        const { error } = await supabase.storage.from("content-images").upload(path, file, { contentType: file.type, upsert: true });
        if (error) throw error;
        const { data: urlData } = supabase.storage.from("content-images").getPublicUrl(path);
        uploaded.push(urlData.publicUrl);
      }
      setPhotos((prev) => [...prev, ...uploaded].slice(0, 10));
    } catch (err: any) {
      toast.error("Erro ao anexar fotos: " + (err.message || "tente de novo"));
    } finally {
      setUploadingPhotos(false);
    }
  }

  async function generate() {
    if (!prompt.trim() || generating) return;
    // Carrossel editorial usa as fotos como fundo — o backend só ativa o photoMode com 2+.
    if (hasPhotos && photoAction === "editorial" && photos.length < 2) {
      toast.error("O carrossel editorial precisa de pelo menos 2 fotos.");
      return;
    }
    const usePhotosEditorial = hasPhotos && photoAction === "editorial" && photos.length >= 2;
    const usePhotosPost = hasPhotos && photoAction === "post";
    setGenerating(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("ai-chat", {
        body: usePhotosEditorial
          ? {
              // Carrossel editorial: cada foto vira o fundo de um slide, com a cor da marca. Satori.
              message: prompt.trim(),
              intent_hint: "GENERATE_EDITORIAL_CAROUSEL",
              format: "carousel",
              platform: "instagram",
              brandId: brandId || undefined,
              imageUrls: photos,
              generationParams: { slideCount: photos.length },
            }
          : usePhotosPost
          ? {
              // Post no estilo da marca usando a foto: a foto vai como referência (image-to-image)
              // e a marca + dial governam o estilo. 1 post, formato 1:1.
              message: prompt.trim(),
              intent_hint: "GENERATE",
              format: "post",
              platform: "instagram",
              brandId: brandId || undefined,
              model: effectiveModel,
              creationModeOverride: brandId ? dial : undefined,
              imageUrls: photos.slice(0, 6),
              replicateRef: true,
            }
          : {
              message: prompt.trim(),
              intent_hint: format.intent,
              format: format.format,
              platform: "instagram",
              brandId: brandId || undefined,
              // Tweet card é Satori (custo fixo 2cr) — NÃO mandar model, senão cobraria por img_<model>.
              model: isSatori ? undefined : effectiveModel,
              creationModeOverride: brandId && !isSatori ? dial : undefined,
              // "Replicar um post": a referência anexada vai como imagem de referência (image-to-image).
              imageUrls: refPostUrl && !isSatori ? [refPostUrl] : undefined,
              replicateRef: refPostUrl && !isSatori ? true : undefined,
              generationParams: format.slides > 1 ? { slideCount: format.slides } : undefined,
            },
      });
      if (error) throw error;
      const ar = data?.action_result;
      if (ar?.content_id) {
        setResult({ contentId: ar.content_id, contentType: ar.content_type || "post", platform: ar.platform });
        setPhotos([]);
        setPhotoAction("post");
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
            <p className="text-xs text-muted-foreground">O que você quer fazer hoje?</p>
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">{balance ?? "—"} créditos</span>
        </div>

        {/* ── PORTA POR INTENÇÃO — a primeira escolha da tela. Cada perfil entra no caminho certo. ── */}
        <div className="grid grid-cols-3 gap-2">
          {INTENTS.map((it) => {
            const active = intent === it.id;
            return (
              <button
                key={it.id}
                onClick={() => pickIntent(it.id)}
                className={cn(
                  "text-left rounded-xl border px-3 py-2.5 transition-all duration-300 ease-expo active:scale-[.98]",
                  active ? "border-primary bg-primary/5 ring-1 ring-primary/30 shadow-sm" : "border-border hover:border-primary/40",
                )}
              >
                <span className="flex items-center gap-1.5 text-[13px] font-bold">
                  <it.icon className={cn("w-4 h-4", active ? it.accent : "text-muted-foreground")} />
                  {it.label}
                </span>
                <span className="block text-[11px] text-muted-foreground mt-0.5 leading-tight">{it.sub}</span>
              </button>
            );
          })}
        </div>

        {/* "Editar": subir foto é o ato principal — dropzone antes do prompt (reusa handleRefUpload) */}
        {isEditing && !refPostUrl && (
          <label className="flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border bg-card cursor-pointer py-7 px-4 text-center hover:border-violet-400/60 transition-colors">
            {uploadingRef ? <Loader2 className="w-5 h-5 animate-spin text-violet-600" /> : <ImagePlus className="w-5 h-5 text-violet-600" />}
            <span className="text-sm font-medium">Solte uma foto ou clique para enviar</span>
            <span className="text-[11px] text-muted-foreground">A IA edita a imagem com o que você pedir abaixo</span>
            <input type="file" accept="image/*" className="hidden" onChange={handleRefUpload} disabled={uploadingRef} />
          </label>
        )}

        {/* Prompt */}
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={promptPlaceholder}
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
            {/* Replicar um post: anexa uma referência → IA recria parecido (com a marca, se houver).
                Em "Editar" some — lá o upload é o ato principal (dropzone acima). */}
            {!isSatori && !isEditing && (
              <label
                title="Anexe um post de referência (print/imagem) e a IA recria um parecido com a sua marca"
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border cursor-pointer transition-colors",
                  refPostUrl ? "bg-accent/10 text-accent border-accent/40" : "bg-background text-muted-foreground border-border hover:border-accent/40",
                )}
              >
                {uploadingRef ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
                {refPostUrl ? "Replicando" : "Replicar um post"}
                <input type="file" accept="image/*" className="hidden" onChange={handleRefUpload} disabled={uploadingRef} />
              </label>
            )}
            {/* "Anexar fotos": suas fotos viram um carrossel editorial com a sua marca (1 slide/foto). */}
            {!isSatori && !isEditing && (
              <label
                title="Anexe suas fotos (ex.: de um evento) — viram um carrossel editorial com as cores da sua marca"
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border cursor-pointer transition-colors",
                  photos.length ? "bg-[hsl(var(--credit-bg))] text-[hsl(var(--credit))] border-[hsl(var(--credit))]/40" : "bg-background text-muted-foreground border-border hover:border-[hsl(var(--credit))]/40",
                )}
              >
                {uploadingPhotos ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                {photos.length ? `${photos.length} foto${photos.length > 1 ? "s" : ""}` : "Anexar fotos"}
                <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotosUpload} disabled={uploadingPhotos} />
              </label>
            )}
            <Button onClick={generate} disabled={generating || !prompt.trim()} className="ml-auto h-9 gap-2 transition-transform duration-200 ease-expo hover:-translate-y-0.5 active:translate-y-0 active:scale-[.98]">
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {generating ? "Gerando…" : "Gerar"}
              {!generating && <CostChip cost={displayCost} className="bg-primary-foreground/15 border-primary-foreground/25 text-primary-foreground" />}
            </Button>
          </div>
          {/* Chip da referência anexada (replicar post) */}
          {refPostUrl && (
            <div className="flex items-center gap-2 px-3 py-2 border-t border-border/60 bg-accent/5">
              <img src={refPostUrl} alt="" className="w-8 h-8 rounded object-cover border border-border" />
              <span className="text-xs text-foreground/80 flex-1 min-w-0">Replicando este post — a IA vai recriar um parecido{brandId ? ", com a sua marca" : ""}.</span>
              <button onClick={() => setRefPostUrl(null)} className="text-muted-foreground hover:text-foreground shrink-0" title="Remover referência"><X className="w-3.5 h-3.5" /></button>
            </div>
          )}
          {/* Fotos anexadas → carrossel editorial com a marca */}
          {photos.length > 0 && (
            <div className="px-3 py-2.5 border-t border-border/60 bg-[hsl(var(--credit-bg))]/40 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                {photos.map((url, i) => (
                  <div key={i} className="relative">
                    <img src={url} alt="" className="w-12 h-12 rounded object-cover border border-border" />
                    <button
                      onClick={() => setPhotos(photos.filter((_, j) => j !== i))}
                      className="absolute -top-1.5 -right-1.5 bg-background border border-border rounded-full p-0.5 text-muted-foreground hover:text-destructive shadow-sm"
                      title="Remover foto"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
              {/* Chooser: o usuário decide o que fazer com a(s) imagem(ns) — em vez do sistema adivinhar. */}
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-foreground/70">O que fazer com {photos.length > 1 ? "essas fotos" : "essa foto"}?</p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setPhotoAction("post")}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors",
                      photoAction === "post" ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:border-primary/40",
                    )}
                  >
                    <Sparkles className="w-3 h-3" /> Post no estilo da marca
                  </button>
                  <button
                    onClick={() => setPhotoAction("editorial")}
                    disabled={photos.length < 2}
                    title={photos.length < 2 ? "Precisa de 2+ fotos" : undefined}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
                      photoAction === "editorial" ? "bg-[hsl(var(--credit))] text-white border-[hsl(var(--credit))]" : "bg-background text-muted-foreground border-border hover:border-[hsl(var(--credit))]/40",
                    )}
                  >
                    <Film className="w-3 h-3" /> Carrossel editorial
                  </button>
                  <button
                    onClick={() => { const url = photos[0]; setPhotos([]); pickIntent("editar"); setRefPostUrl(url); }}
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium border bg-background text-muted-foreground border-border hover:border-violet-400/50 transition-colors"
                  >
                    <Wand2 className="w-3 h-3" /> Editar a imagem
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {photoAction === "editorial"
                    ? `${photos.length} fotos → carrossel editorial${selectedBrand ? `, com as cores da ${(selectedBrand as any).name}` : ""} (1 slide por foto).`
                    : `Cria 1 post ${selectedBrand ? `no estilo da ${(selectedBrand as any).name}` : "no estilo livre"}, usando ${photos.length > 1 ? "as fotos" : "a foto"} como referência.`}
                </p>
              </div>
            </div>
          )}
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
                    onClick={() => { setBrandId(b.id); try { localStorage.setItem("tp_last_brand", b.id); } catch { /* ignore */ } }}
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

        {selectedBrand && !isSatori && !isEditing && (
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

        {/* Estante de modelos — recolhida a uma linha (o recomendado já escolhido); "Trocar" abre a
            grade pra quem é Criador. Não se aplica ao Tweet card (Satori) nem ao "Editar". */}
        {!isSatori && !isEditing && (
          <div className="order-3">
            {!showModels ? (
              <button
                onClick={() => setShowModels(true)}
                className="w-full flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-left hover:border-primary/40 hover:shadow-sm transition-all duration-200 ease-expo"
              >
                <div className="w-9 h-9 rounded-lg overflow-hidden border border-border shrink-0">
                  <img src={effModel.sample} alt={effModel.name} className="w-full h-full object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] font-bold truncate">{effModel.name}</span>
                    {effModel.tag && <span className="text-[9px] font-bold uppercase tracking-wide bg-primary/10 text-primary px-1.5 py-0.5 rounded shrink-0">{effModel.tag}</span>}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">{effModel.forte} · {effModel.speed}</div>
                </div>
                <CostChip cost={effModel.cost} />
                <span className="text-xs font-semibold text-primary shrink-0 inline-flex items-center gap-0.5">Trocar <ChevronDown className="w-3.5 h-3.5" /></span>
              </button>
            ) : (
            <div className="animate-grow-down">
            <div className="flex items-baseline gap-2 mb-2 flex-wrap">
              <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Modelo</h2>
              {wantsStyleFidelity && (
                <span className="text-[11px] text-accent font-medium">Pra copiar o estilo da {(selectedBrand as any)?.name || "marca"}: GPT-Image 2, Ideogram ou Nano Banana.</span>
              )}
              {formatId === "story" && <span className="text-[11px] text-muted-foreground">story usa Nano Banana (9:16 nativo)</span>}
              {modelId === "qwen" && formatId !== "free" && (
                <span className="text-[11px] text-[hsl(var(--credit))] font-medium">⚠ Qwen é pra fotos/cenas — não renderiza texto. Ideal em "Imagem livre".</span>
              )}
              <button onClick={() => setShowModels(false)} className="ml-auto text-[11px] font-semibold text-primary inline-flex items-center gap-0.5 hover:underline">Recolher <ChevronUp className="w-3.5 h-3.5" /></button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 stagger-children">
              {MODELS.map((m) => {
                const active = effectiveModel === m.id;
                const locked = formatId === "story" && m.id !== "nano-banana";
                const noRefWarn = wantsStyleFidelity && !m.acceptsRefs; // não copia o estilo da marca
                return (
                  <button
                    key={m.id}
                    onClick={() => !locked && setModelId(m.id)}
                    disabled={locked}
                    title={noRefWarn ? "Este modelo não copia o estilo da sua marca — use GPT-Image 2, Ideogram ou Nano Banana pra fidelidade." : undefined}
                    className={cn(
                      "group text-left rounded-xl border overflow-hidden transition-all duration-200 relative",
                      active ? "border-primary ring-2 ring-primary/30 shadow-sm" : "border-border hover:border-primary/40 hover:shadow-sm",
                      locked && "opacity-40 cursor-not-allowed",
                      noRefWarn && !active && "opacity-60",
                    )}
                  >
                    <div className="relative h-20 overflow-hidden bg-muted">
                      <img src={m.sample} alt={`Exemplo ${m.name}`} loading="lazy" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                      {m.tag && !locked && !noRefWarn && <span className="absolute top-1.5 left-1.5 text-[8px] font-bold uppercase tracking-wide bg-primary text-primary-foreground px-1.5 py-0.5 rounded shadow">{m.tag}</span>}
                      {noRefWarn && <span className="absolute top-1.5 left-1.5 text-[8px] font-bold uppercase tracking-wide bg-[hsl(var(--credit))] text-white px-1.5 py-0.5 rounded shadow">não copia o estilo</span>}
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
