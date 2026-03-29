import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { Trend } from "./TrendCard";
import { 
  Square, 
  Smartphone, 
  Layers, 
  Sparkles,
  Loader2,
  Newspaper,
  Quote,
  Lightbulb,
  GraduationCap,
  HelpCircle,
  Wand2,
  Palette,
  Lock,
  Compass,
  Brush,
  Star,
  Save,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";

interface GenerateContentModalProps {
  trend: Trend | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerate: (
    trendId: string,
    format: string,
    contentStyle: string,
    brandId: string | null,
    visualMode: string,
    templateSetId: string | null,
    slideCount: number | null,
    includeCta: boolean,
    styleGalleryId?: string | null,
    backgroundTemplateId?: string | null,
    platform?: string,
  ) => void;
  isGenerating: boolean;
}

interface BackgroundTemplateOption {
  id: string;
  name: string;
  description: string | null;
  content_format: string;
  slide_count: number;
  background_images: { index: number; url: string | null; role?: string }[];
}

interface TemplateSetOption {
  id: string;
  name: string;
  description: string | null;
  template_set: { formats?: Record<string, any> };
}

interface SystemStyleOption {
  id: string;
  name: string;
  description: string | null;
  category: string;
  preview_images: Record<string, string[]>;
  supported_formats: string[];
}

interface FavoriteRecord {
  template_set_type: string;
  template_set_id: string;
}

type Platform = "instagram" | "linkedin";

const platformOptions = [
  { id: "instagram" as Platform, name: "Instagram" },
  { id: "linkedin" as Platform, name: "LinkedIn" },
];

const formatsByPlatform: Record<Platform, { id: string; name: string; description: string; icon: any; dimensions: string }[]> = {
  instagram: [
    { id: "post", name: "Post", description: "Imagem única 1080x1350px", icon: Square, dimensions: "1080 × 1350" },
    { id: "story", name: "Story", description: "Formato vertical 1080x1920px", icon: Smartphone, dimensions: "1080 × 1920" },
    { id: "carousel", name: "Carrossel", description: "Múltiplos slides 1080x1350px", icon: Layers, dimensions: "1080 × 1350" },
  ],
  linkedin: [
    { id: "post", name: "Post com Imagem", description: "Imagem horizontal + texto profissional", icon: Square, dimensions: "1200 × 627" },
    { id: "document", name: "Documento", description: "PDF profissional multi-slide", icon: Layers, dimensions: "1080 × 1350" },
    { id: "article", name: "Artigo", description: "Banner + texto longo", icon: Newspaper, dimensions: "1200 × 627" },
  ],
};

const contentStyles = [
  { id: "news", name: "Notícia", description: "Informativo sobre a tendência", icon: Newspaper, example: "Nova regulamentação da ANS entra em vigor...", color: "bg-blue-500" },
  { id: "quote", name: "Frase", description: "Motivacional ou reflexiva, sem CTA", icon: Quote, example: "Liderança é sobre pessoas", color: "bg-purple-500" },
  { id: "tip", name: "Dica Rápida", description: "Conselho prático e direto", icon: Lightbulb, example: "3 formas de reduzir custos operacionais", color: "bg-amber-500" },
  { id: "educational", name: "Educativo", description: "Explicação simples de conceito", icon: GraduationCap, example: "O que é acreditação hospitalar?", color: "bg-emerald-500" },
  { id: "curiosity", name: "Curiosidade", description: "Fato interessante para engajar", icon: HelpCircle, example: "Você sabia que 70% dos hospitais...", color: "bg-rose-500" },
];

const visualModes = [
  {
    id: "brand_strict",
    name: "Identidade Rígida",
    description: "100% determinístico, template puro, sem IA para imagem",
    icon: Lock,
    color: "bg-indigo-500",
  },
  {
    id: "brand_guided",
    name: "Identidade + IA",
    description: "Template para layout/texto, IA gera background dentro da paleta",
    icon: Compass,
    color: "bg-teal-500",
  },
  {
    id: "free",
    name: "Livre",
    description: "Sem identidade visual, IA totalmente livre",
    icon: Brush,
    color: "bg-orange-500",
  },
];

const getSuggestedStyle = (theme: string, title: string): string => {
  const t = title.toLowerCase();
  if (t.includes("dica") || t.includes("como") || t.includes("formas de")) return "tip";
  if (t.includes("o que é") || t.includes("entenda") || t.includes("guia")) return "educational";
  if (t.includes("você sabia") || t.includes("curiosidade") || t.includes("%")) return "curiosity";
  if (t.includes("frase") || t.includes("reflexão") || t.includes("inspiração")) return "quote";
  const themeMap: Record<string, string> = { Gestão: "tip", Tecnologia: "news", Legislação: "news", Inovação: "curiosity", Qualidade: "educational" };
  return themeMap[theme] || "news";
};

interface BrandOption { id: string; name: string; visual_tone: string | null; palette: unknown; default_template_set_id: string | null; }

const GenerateContentModal = ({ trend, open, onOpenChange, onGenerate, isGenerating }: GenerateContentModalProps) => {
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>("instagram");
  const [selectedFormat, setSelectedFormat] = useState("carousel");
  const [selectedStyle, setSelectedStyle] = useState("news");
  const [suggestedStyle, setSuggestedStyle] = useState<string | null>(null);
  const [selectedBrand, setSelectedBrand] = useState<string>("ai");
  const [selectedVisualMode, setSelectedVisualMode] = useState("brand_guided");
  const [selectedTemplateSet, setSelectedTemplateSet] = useState<string>("auto");
  const [selectedSystemStyle, setSelectedSystemStyle] = useState<string | null>(null);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [templateSets, setTemplateSets] = useState<TemplateSetOption[]>([]);
  const [systemStyles, setSystemStyles] = useState<SystemStyleOption[]>([]);
  const [favorites, setFavorites] = useState<FavoriteRecord[]>([]);
  const [loadingBrands, setLoadingBrands] = useState(false);
  const [backgroundTemplates, setBackgroundTemplates] = useState<BackgroundTemplateOption[]>([]);
  const [selectedBgTemplate, setSelectedBgTemplate] = useState<string | null>(null);

  // Carousel controls
  const [slideCountMode, setSlideCountMode] = useState<"auto" | "fixed">("auto");
  const [slideCount, setSlideCount] = useState(5);
  const [includeCta, setIncludeCta] = useState(true);

  useEffect(() => {
    if (open) {
      const fetchData = async () => {
        setLoadingBrands(true);
        try {
          const { data: session } = await supabase.auth.getSession();
          const uid = session.session?.user?.id;

          const [brandsRes, stylesRes, favsRes] = await Promise.all([
            supabase.from("brands").select("id, name, visual_tone, palette, default_template_set_id").order("name"),
            supabase.from("system_template_sets").select("id, name, description, category, preview_images, supported_formats").eq("is_active", true).order("sort_order"),
            uid ? supabase.from("favorite_template_sets").select("template_set_type, template_set_id").eq("user_id", uid) : Promise.resolve({ data: [] }),
          ]);

          if (!brandsRes.error && brandsRes.data) setBrands(brandsRes.data as unknown as BrandOption[]);
          if (!stylesRes.error && stylesRes.data) setSystemStyles(stylesRes.data as unknown as SystemStyleOption[]);
          if (favsRes.data) setFavorites(favsRes.data as unknown as FavoriteRecord[]);
        } catch (e) { console.error("Error fetching data:", e); }
        finally { setLoadingBrands(false); }
      };
      fetchData();
    }
  }, [open]);

  // Load template sets and background templates when brand changes
  useEffect(() => {
    if (selectedBrand && selectedBrand !== "ai") {
      const fetchBrandData = async () => {
        const [tsRes, bgRes] = await Promise.all([
          supabase
            .from("brand_template_sets")
            .select("id, name, description, template_set")
            .eq("brand_id", selectedBrand)
            .eq("status", "active")
            .order("created_at"),
          supabase
            .from("brand_background_templates")
            .select("id, name, description, content_format, slide_count, background_images")
            .eq("brand_id", selectedBrand)
            .order("created_at", { ascending: false }),
        ]);
        setTemplateSets((tsRes.data || []) as unknown as TemplateSetOption[]);
        setBackgroundTemplates((bgRes.data || []) as unknown as BackgroundTemplateOption[]);
      };
      fetchBrandData();
    } else {
      setTemplateSets([]);
      setBackgroundTemplates([]);
    }
    setSelectedTemplateSet("auto");
    setSelectedBgTemplate(null);
  }, [selectedBrand]);

  useEffect(() => {
    if (trend) {
      const suggested = getSuggestedStyle(trend.theme, trend.title);
      setSuggestedStyle(suggested);
      setSelectedStyle(suggested);
    }
  }, [trend]);

  // Auto-select visual mode based on brand selection
  useEffect(() => {
    if (selectedBrand === "ai") {
      setSelectedVisualMode("free");
    } else if (selectedVisualMode === "free") {
      setSelectedVisualMode("brand_guided");
    }
  }, [selectedBrand]);

  // Update carousel defaults from selected template set
  const resolvedTs = (() => {
    const currentBrand = brands.find(b => b.id === selectedBrand);
    const defaultTsId = currentBrand?.default_template_set_id || null;
    const tsId = selectedTemplateSet === "auto" ? defaultTsId : selectedTemplateSet;
    return templateSets.find(ts => ts.id === tsId);
  })();

  useEffect(() => {
    if (resolvedTs?.template_set?.formats?.carousel) {
      const carouselConfig = resolvedTs.template_set.formats.carousel;
      if (carouselConfig.slide_count_range) {
        const [min, max] = carouselConfig.slide_count_range;
        setSlideCount(Math.round((min + max) / 2));
      }
      if (carouselConfig.cta_policy === "never") {
        setIncludeCta(false);
      } else if (carouselConfig.cta_policy === "always") {
        setIncludeCta(true);
      }
    }
  }, [resolvedTs]);

  const currentBrand = brands.find(b => b.id === selectedBrand);
  const defaultTemplateSet = currentBrand?.default_template_set_id || null;
  const defaultTemplateSetName = templateSets.find(ts => ts.id === defaultTemplateSet)?.name || null;

  const handleGenerate = () => {
    if (trend) {
      const resolvedTemplateSetId = selectedTemplateSet === "auto"
        ? defaultTemplateSet
        : selectedTemplateSet;
      onGenerate(
        trend.id,
        selectedFormat,
        selectedStyle,
        selectedBrand === "ai" ? null : selectedBrand,
        selectedVisualMode,
        resolvedTemplateSetId,
        (selectedFormat === "carousel" || selectedFormat === "document") ? (slideCountMode === "auto" ? null : slideCount) : null,
        (selectedFormat === "carousel" || selectedFormat === "document") ? includeCta : true,
        selectedSystemStyle,
        selectedBgTemplate,
        selectedPlatform,
      );
    }
  };

  // Show all background templates for the brand (cyclic repetition handles mismatches)
  const filteredBgTemplates = backgroundTemplates;

  // Compute favorite system styles
  const favoriteStyleIds = new Set(
    favorites.filter(f => f.template_set_type === "system").map(f => f.template_set_id)
  );
  const favoriteStyles = systemStyles.filter(s => favoriteStyleIds.has(s.id));
  const nonFavoriteStyles = systemStyles.filter(s => !favoriteStyleIds.has(s.id));

  const showVisualModes = selectedBrand !== "ai";
  const showCarouselControls = selectedFormat === "carousel" || selectedFormat === "document";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">Gerar Conteúdo</DialogTitle>
          <DialogDescription>A IA irá criar o conteúdo no estilo e formato escolhidos.</DialogDescription>
        </DialogHeader>

        {trend && (
          <div className="bg-muted/50 rounded-lg p-4 mb-4">
            <p className="text-sm font-medium text-foreground line-clamp-2">{trend.title}</p>
            <p className="text-xs text-muted-foreground mt-1">{trend.source} • {trend.theme}</p>
          </div>
        )}

        <div className="space-y-6">
          {/* Brand Selection */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium">Identidade Visual</Label>
              <Palette className="w-4 h-4 text-muted-foreground" />
            </div>
            <Select value={selectedBrand} onValueChange={setSelectedBrand}>
              <SelectTrigger><SelectValue placeholder="Selecione uma marca" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ai">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary" />
                    <span>Modo Livre (sem marca)</span>
                  </div>
                </SelectItem>
                {brands.map((brand) => (
                  <SelectItem key={brand.id} value={brand.id}>
                    <div className="flex items-center gap-2">
                      <Palette className="w-4 h-4 text-muted-foreground" />
                      <span>{brand.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!loadingBrands && brands.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhuma marca cadastrada. As imagens serão geradas com estilo livre.</p>
          )}

          {/* Template Set Selection - only when brand selected */}
          {showVisualModes && templateSets.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Label className="text-sm font-medium">Estilo de Conteúdo</Label>
                <Layers className="w-4 h-4 text-muted-foreground" />
              </div>
              <Select value={selectedTemplateSet} onValueChange={setSelectedTemplateSet}>
                <SelectTrigger><SelectValue placeholder="Selecione um estilo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-primary" />
                      <span>
                        Auto
                        {defaultTemplateSetName
                          ? ` — Padrão: ${defaultTemplateSetName}`
                          : " — (sem padrão)"}
                      </span>
                    </div>
                  </SelectItem>
                  {templateSets.map((ts) => (
                    <SelectItem key={ts.id} value={ts.id}>
                      <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4 text-muted-foreground" />
                        <span>{ts.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {resolvedTs && (
                <p className="text-xs text-muted-foreground">
                  Estilo ativo: <span className="font-medium text-foreground">{resolvedTs.name}</span> — apenas as regras deste estilo serão usadas.
                </p>
              )}
            </div>
          )}
          </div>

          {/* Background Templates - saved reusable backgrounds */}
          {showVisualModes && filteredBgTemplates.length > 0 && (
            <div className="space-y-3">
              <Separator />
              <div className="flex items-center gap-2">
                <Label className="text-sm font-medium">Background Salvo</Label>
                <Save className="w-4 h-4 text-muted-foreground" />
              </div>
              <Select value={selectedBgTemplate || "none"} onValueChange={v => setSelectedBgTemplate(v === "none" ? null : v)}>
                <SelectTrigger><SelectValue placeholder="Usar background salvo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    <div className="flex items-center gap-2">
                      <Wand2 className="w-4 h-4 text-muted-foreground" />
                      <span>Gerar novo com IA</span>
                    </div>
                  </SelectItem>
                  {filteredBgTemplates.map(bt => (
                    <SelectItem key={bt.id} value={bt.id}>
                      <div className="flex items-center gap-2">
                        <Save className="w-4 h-4 text-muted-foreground" />
                        <span>{bt.name}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {bt.slide_count} slide{bt.slide_count > 1 ? "s" : ""}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedBgTemplate && (() => {
                const bt = filteredBgTemplates.find(t => t.id === selectedBgTemplate);
                if (!bt) return null;
                return (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      ⚡ O background salvo será aplicado diretamente, <span className="font-medium text-foreground">sem gerar imagens com IA</span>.
                    </p>
                    <div className="flex gap-1.5 overflow-x-auto py-1">
                      {bt.background_images.slice(0, 6).map((img: any, i: number) => (
                        <div key={i} className="shrink-0 w-12 h-15 rounded border border-border overflow-hidden bg-muted">
                          {img.url ? (
                            <img src={img.url} alt={`BG ${i + 1}`} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[8px] text-muted-foreground">—</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* System Style Gallery Selection - when no brand or free mode */}
          {systemStyles.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Label className="text-sm font-medium">Estilo Visual da Galeria</Label>
                <Star className="w-4 h-4 text-muted-foreground" />
              </div>
              <Select value={selectedSystemStyle || "none"} onValueChange={v => setSelectedSystemStyle(v === "none" ? null : v)}>
                <SelectTrigger><SelectValue placeholder="Sem estilo da galeria" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-muted-foreground" />
                      <span>Nenhum (usar marca ou modo livre)</span>
                    </div>
                  </SelectItem>
                  {favoriteStyles.length > 0 && (
                    <>
                      <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">⭐ Favoritos</div>
                      {favoriteStyles.map(s => (
                        <SelectItem key={s.id} value={s.id}>
                          <div className="flex items-center gap-2">
                            <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                            <span>{s.name}</span>
                            <span className="text-[10px] text-muted-foreground">{s.category}</span>
                          </div>
                        </SelectItem>
                      ))}
                      <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Todos</div>
                    </>
                  )}
                  {nonFavoriteStyles.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      <div className="flex items-center gap-2">
                        <Layers className="w-3 h-3 text-muted-foreground" />
                        <span>{s.name}</span>
                        <span className="text-[10px] text-muted-foreground">{s.category}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedSystemStyle && (
                <p className="text-xs text-muted-foreground">
                  As imagens serão geradas seguindo as referências visuais do estilo "<span className="font-medium text-foreground">{systemStyles.find(s => s.id === selectedSystemStyle)?.name}</span>".
                </p>
              )}
            </div>
          )}
          {showVisualModes && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Label className="text-sm font-medium">Modo Visual</Label>
              </div>
              <RadioGroup value={selectedVisualMode} onValueChange={setSelectedVisualMode} className="grid grid-cols-1 gap-2">
                {visualModes.filter(m => m.id !== "free").map((mode) => (
                  <Label
                    key={mode.id}
                    htmlFor={`mode-${mode.id}`}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all",
                      selectedVisualMode === mode.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                    )}
                  >
                    <RadioGroupItem value={mode.id} id={`mode-${mode.id}`} className="sr-only" />
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                      selectedVisualMode === mode.id ? mode.color + " text-white" : "bg-muted text-muted-foreground"
                    )}>
                      <mode.icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground text-sm">{mode.name}</p>
                      <p className="text-xs text-muted-foreground">{mode.description}</p>
                    </div>
                  </Label>
                ))}
              </RadioGroup>
            </div>
          )}

          {/* Content Style Selection */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium">Estilo do Conteúdo</Label>
              <Wand2 className="w-4 h-4 text-muted-foreground" />
            </div>
            <RadioGroup value={selectedStyle} onValueChange={setSelectedStyle} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {contentStyles.map((style) => (
                <Label
                  key={style.id}
                  htmlFor={`style-${style.id}`}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all",
                    selectedStyle === style.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                  )}
                >
                  <RadioGroupItem value={style.id} id={`style-${style.id}`} className="sr-only" />
                  <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                    selectedStyle === style.id ? style.color + " text-white" : "bg-muted text-muted-foreground"
                  )}>
                    <style.icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground text-sm">{style.name}</p>
                      {suggestedStyle === style.id && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Sugerido</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{style.description}</p>
                  </div>
                </Label>
              ))}
            </RadioGroup>
            <div className="bg-muted/30 rounded-lg p-3 border border-dashed border-border">
              <p className="text-xs text-muted-foreground">
                <span className="font-medium">Exemplo:</span>{" "}
                <span className="italic">"{contentStyles.find(s => s.id === selectedStyle)?.example}"</span>
              </p>
            </div>
          </div>

          {/* Platform Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Plataforma</Label>
            <RadioGroup value={selectedPlatform} onValueChange={(v) => {
              setSelectedPlatform(v as Platform);
              const newFormats = formatsByPlatform[v as Platform];
              if (!newFormats.some(f => f.id === selectedFormat)) {
                setSelectedFormat(newFormats[0].id);
              }
            }} className="grid grid-cols-2 gap-2">
              {platformOptions.map((p) => (
                <Label
                  key={p.id}
                  htmlFor={`platform-${p.id}`}
                  className={cn(
                    "flex items-center justify-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-all",
                    selectedPlatform === p.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                  )}
                >
                  <RadioGroupItem value={p.id} id={`platform-${p.id}`} className="sr-only" />
                  <p className="font-medium text-foreground text-sm">{p.name}</p>
                </Label>
              ))}
            </RadioGroup>
          </div>

          {/* Format Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Formato do Conteúdo</Label>
            <RadioGroup value={selectedFormat} onValueChange={setSelectedFormat} className="grid gap-2">
              {formatsByPlatform[selectedPlatform].map((format) => (
                <Label
                  key={format.id}
                  htmlFor={`fmt-${format.id}`}
                  className={cn(
                    "flex items-center gap-4 p-3 rounded-lg border-2 cursor-pointer transition-all",
                    selectedFormat === format.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                  )}
                >
                  <RadioGroupItem value={format.id} id={`fmt-${format.id}`} className="sr-only" />
                  <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center",
                    selectedFormat === format.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  )}>
                    <format.icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-foreground text-sm">{format.name}</p>
                    <p className="text-xs text-muted-foreground">{format.description}</p>
                  </div>
                  <span className="text-xs text-muted-foreground font-mono">{format.dimensions}</span>
                </Label>
              ))}
            </RadioGroup>
          </div>

          {/* Carousel Controls */}
          {showCarouselControls && (
            <div className="space-y-4 rounded-lg border border-border p-4 bg-muted/20">
              <Label className="text-sm font-medium">Controles do Carrossel</Label>
              
              {/* Slide Count */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Nº de slides</Label>
                  <Select value={slideCountMode} onValueChange={(v) => setSlideCountMode(v as "auto" | "fixed")}>
                    <SelectTrigger className="w-28 h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto</SelectItem>
                      <SelectItem value="fixed">Fixo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {slideCountMode === "fixed" && (
                  <div className="flex items-center gap-3">
                    <Slider
                      value={[slideCount]}
                      onValueChange={([v]) => setSlideCount(v)}
                      min={3}
                      max={10}
                      step={1}
                      className="flex-1"
                    />
                    <span className="text-sm font-mono font-medium w-6 text-center">{slideCount}</span>
                  </div>
                )}
              </div>

              {/* CTA Toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs">Incluir slide CTA final</Label>
                  <p className="text-[10px] text-muted-foreground">Slide de fechamento com chamada para ação</p>
                </div>
                <Switch checked={includeCta} onCheckedChange={setIncludeCta} />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isGenerating}>Cancelar</Button>
          <Button onClick={handleGenerate} disabled={isGenerating} className="gap-2">
            {isGenerating ? (
              <><Loader2 className="w-4 h-4 animate-spin" />Gerando conteúdo...</>
            ) : (
              <><Sparkles className="w-4 h-4" />Gerar Conteúdo</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default GenerateContentModal;
