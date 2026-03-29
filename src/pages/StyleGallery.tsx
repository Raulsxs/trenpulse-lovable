import { useState, useEffect } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Palette, Star, StarOff, Search, Loader2, Layers, Square, Smartphone,
  ChevronLeft, ChevronRight, Wand2, ImageOff,
} from "lucide-react";

interface SystemTemplate {
  id: string;
  name: string;
  description: string | null;
  category: string;
  content_format: string;
  preview_colors: string[];
  preview_images: Record<string, string[]>;
  reference_images: Record<string, Record<string, string[]>>;
  supported_formats: string[];
  template_set: any;
  style_prompt: string | null;
}

interface BrandTemplate {
  id: string;
  name: string;
  description: string | null;
  brand_id: string;
  brand_name?: string;
  category_name: string | null;
}

interface FavoriteRecord {
  id: string;
  template_set_type: string;
  template_set_id: string;
}

const FORMAT_ICONS: Record<string, any> = { post: Square, story: Smartphone, carousel: Layers };
const CATEGORY_LABELS: Record<string, string> = {
  noticia: "Notícia", frase: "Frase", dica: "Dica Rápida", educativo: "Educativo", curiosidade: "Curiosidade", geral: "Geral",
};

// ── Carousel Preview Component ──
function StyleCardCarousel({ images }: { images: string[] }) {
  const [idx, setIdx] = useState(0);
  if (!images || images.length === 0) return null;

  return (
    <div className="relative aspect-[4/5] rounded-md overflow-hidden bg-muted group/carousel">
      <img
        src={images[idx]}
        alt={`Preview ${idx + 1}`}
        className="w-full h-full object-cover"
        loading="lazy"
      />
      {images.length > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); setIdx(i => (i - 1 + images.length) % images.length); }}
            className="absolute left-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-background/80 flex items-center justify-center opacity-0 group-hover/carousel:opacity-100 transition-opacity"
          >
            <ChevronLeft className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setIdx(i => (i + 1) % images.length); }}
            className="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-background/80 flex items-center justify-center opacity-0 group-hover/carousel:opacity-100 transition-opacity"
          >
            <ChevronRight className="w-3 h-3" />
          </button>
          <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex gap-1">
            {images.map((_, i) => (
              <div
                key={i}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${i === idx ? "bg-primary" : "bg-background/60"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Color bar fallback ──
function ColorBar({ colors }: { colors: string[] }) {
  return (
    <div className="aspect-[4/5] rounded-md overflow-hidden bg-muted flex flex-col items-center justify-center gap-2 p-4">
      <ImageOff className="w-8 h-8 text-muted-foreground/40" />
      <p className="text-[10px] text-muted-foreground text-center">Sem preview</p>
      {colors.length > 0 && (
        <div className="flex gap-1 h-3 w-full max-w-[80px]">
          {colors.map((c: string, i: number) => (
            <div key={i} className="flex-1 rounded-full" style={{ backgroundColor: c }} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function StyleGallery() {
  const [systemTemplates, setSystemTemplates] = useState<SystemTemplate[]>([]);
  const [brandTemplates, setBrandTemplates] = useState<BrandTemplate[]>([]);
  const [favorites, setFavorites] = useState<FavoriteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [previewFormat, setPreviewFormat] = useState<string>("post");
  const [generatingPack, setGeneratingPack] = useState<string | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [generatingAllProgress, setGeneratingAllProgress] = useState({ current: 0, total: 0, currentName: "" });

  useEffect(() => {
    const load = async () => {
      const { data: session } = await supabase.auth.getSession();
      const uid = session.session?.user.id || null;
      setUserId(uid);

      const [sysRes, brandRes, favRes] = await Promise.all([
        supabase.from("system_template_sets").select("*").eq("is_active", true).order("sort_order"),
        uid ? supabase.from("brand_template_sets").select("id, name, description, brand_id, category_name").eq("status", "active").order("name") : Promise.resolve({ data: [] }),
        uid ? supabase.from("favorite_template_sets").select("*").eq("user_id", uid) : Promise.resolve({ data: [] }),
      ]);

      setSystemTemplates((sysRes.data || []) as unknown as SystemTemplate[]);
      setBrandTemplates((brandRes.data || []) as unknown as BrandTemplate[]);
      setFavorites((favRes.data || []) as unknown as FavoriteRecord[]);
      setLoading(false);
    };
    load();
  }, []);

  const getPreviewImages = (t: SystemTemplate): string[] => {
    const pi = t.preview_images;
    if (!pi || typeof pi !== "object") return [];
    const formatImages = pi[previewFormat] || pi["post"] || pi["carousel"] || pi["story"];
    return Array.isArray(formatImages) ? formatImages : [];
  };

  const isFavorite = (type: string, id: string) => favorites.some(f => f.template_set_type === type && f.template_set_id === id);

  const toggleFavorite = async (type: "system" | "brand", templateId: string) => {
    if (!userId) return;
    const existing = favorites.find(f => f.template_set_type === type && f.template_set_id === templateId);
    if (existing) {
      await supabase.from("favorite_template_sets").delete().eq("id", existing.id);
      setFavorites(prev => prev.filter(f => f.id !== existing.id));
      toast.success("Removido dos favoritos");
    } else {
      const { data } = await supabase.from("favorite_template_sets").insert({ user_id: userId, template_set_type: type, template_set_id: templateId } as any).select().single();
      if (data) setFavorites(prev => [...prev, data as unknown as FavoriteRecord]);
      toast.success("Adicionado aos favoritos!");
    }
  };

  const handleGeneratePack = async (styleId: string) => {
    setGeneratingPack(styleId);
    try {
      const style = systemTemplates.find(s => s.id === styleId);
      const formats = style?.supported_formats || ["post"];
      const { data, error } = await supabase.functions.invoke("generate-style-pack", {
        body: { styleId, formats },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setSystemTemplates(prev => prev.map(t => {
        if (t.id === styleId) {
          return { ...t, reference_images: data.referenceImages || {}, preview_images: data.previewImages || {} };
        }
        return t;
      }));

      toast.success(`${data.totalGenerated} imagens geradas para "${style?.name}"!`);
    } catch (e) {
      console.error("Error generating style pack:", e);
      toast.error(e instanceof Error ? e.message : "Erro ao gerar pack de estilo");
    } finally {
      setGeneratingPack(null);
    }
  };

  const handleGenerateAll = async () => {
    const stylesWithoutPreviews = systemTemplates.filter(t => {
      const imgs = getPreviewImages(t);
      return imgs.length === 0;
    });

    if (stylesWithoutPreviews.length === 0) {
      toast.info("Todos os estilos já possuem previews!");
      return;
    }

    setGeneratingAll(true);
    setGeneratingAllProgress({ current: 0, total: stylesWithoutPreviews.length, currentName: "" });

    let successCount = 0;
    for (let i = 0; i < stylesWithoutPreviews.length; i++) {
      const style = stylesWithoutPreviews[i];
      setGeneratingAllProgress({ current: i + 1, total: stylesWithoutPreviews.length, currentName: style.name });
      setGeneratingPack(style.id);

      try {
        const formats = style.supported_formats || ["post"];
        const { data, error } = await supabase.functions.invoke("generate-style-pack", {
          body: { styleId: style.id, formats },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        setSystemTemplates(prev => prev.map(t => {
          if (t.id === style.id) {
            return { ...t, reference_images: data.referenceImages || {}, preview_images: data.previewImages || {} };
          }
          return t;
        }));
        successCount++;
      } catch (e) {
        console.error(`Error generating pack for "${style.name}":`, e);
        toast.error(`Falha em "${style.name}": ${e instanceof Error ? e.message : "erro"}`);
      }

      setGeneratingPack(null);
      // Delay between styles to avoid rate limits
      if (i < stylesWithoutPreviews.length - 1) {
        await new Promise(r => setTimeout(r, 3000));
      }
    }

    setGeneratingAll(false);
    toast.success(`${successCount}/${stylesWithoutPreviews.length} estilos gerados com sucesso!`);
  };

  const filterBySearch = (name: string, desc: string | null) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return name.toLowerCase().includes(q) || (desc || "").toLowerCase().includes(q);
  };

  const favoriteSystemIds = new Set(favorites.filter(f => f.template_set_type === "system").map(f => f.template_set_id));
  const favoriteBrandIds = new Set(favorites.filter(f => f.template_set_type === "brand").map(f => f.template_set_id));
  const favSystemTemplates = systemTemplates.filter(t => favoriteSystemIds.has(t.id));
  const favBrandTemplates = brandTemplates.filter(t => favoriteBrandIds.has(t.id));
  const hasFavorites = favSystemTemplates.length > 0 || favBrandTemplates.length > 0;

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      </DashboardLayout>
    );
  }



  const renderSystemCard = (t: SystemTemplate) => {
    const FormatIcon = FORMAT_ICONS[t.content_format || "post"] || Square;
    const colors = Array.isArray(t.preview_colors) ? t.preview_colors.map(c => typeof c === "string" ? c : (c as any)?.hex || "") : [];
    const cat = t.category || "geral";
    const fav = isFavorite("system", t.id);
    const images = getPreviewImages(t);
    const isGenerating = generatingPack === t.id;

    return (
      <Card key={t.id} className="group border-border/50 hover:border-primary/30 hover:shadow-md transition-all overflow-hidden">
        <CardContent className="p-0">
          {/* Image preview area */}
          <div className="relative">
            {images.length > 0 ? (
              <StyleCardCarousel images={images} />
            ) : (
              <div className="relative">
                <ColorBar colors={colors} />
                <Button
                  variant="secondary"
                  size="sm"
                  className="absolute bottom-2 left-1/2 -translate-x-1/2 gap-1 text-[10px] h-7 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => handleGeneratePack(t.id)}
                  disabled={isGenerating}
                >
                  {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                  Gerar previews
                </Button>
              </div>
            )}

            {/* Favorite button overlay */}
            <Button
              variant="ghost"
              size="sm"
              className="absolute top-1.5 right-1.5 h-7 w-7 p-0 bg-background/70 backdrop-blur-sm rounded-full"
              onClick={() => toggleFavorite("system", t.id)}
            >
              {fav ? <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" /> : <StarOff className="w-3.5 h-3.5 text-muted-foreground" />}
            </Button>
          </div>

          {/* Info */}
          <div className="p-3 space-y-2">
            <p className="font-medium text-sm text-foreground truncate">{t.name}</p>
            {t.description && <p className="text-xs text-muted-foreground line-clamp-2">{t.description}</p>}

            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge variant="outline" className="text-[10px] gap-1">
                <FormatIcon className="w-3 h-3" />
                {t.content_format || "post"}
              </Badge>
              <Badge variant="secondary" className="text-[10px]">
                {CATEGORY_LABELS[cat] || cat}
              </Badge>
              {(t.supported_formats || []).length > 1 && (
                <Badge variant="outline" className="text-[10px]">
                  {t.supported_formats.length} formatos
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderBrandCard = (t: BrandTemplate) => {
    const fav = isFavorite("brand", t.id);
    return (
      <Card key={t.id} className="group border-border/50 hover:border-primary/30 hover:shadow-md transition-all">
        <CardContent className="p-4 space-y-3">
          <div className="aspect-[4/5] rounded-md overflow-hidden bg-muted flex items-center justify-center">
            <Palette className="w-8 h-8 text-muted-foreground/30" />
          </div>
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm text-foreground truncate">{t.name}</p>
              {t.description && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{t.description}</p>}
            </div>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0" onClick={() => toggleFavorite("brand", t.id)}>
              {fav ? <Star className="w-4 h-4 text-amber-500 fill-amber-500" /> : <StarOff className="w-4 h-4 text-muted-foreground" />}
            </Button>
          </div>
          {t.category_name && (
            <Badge variant="secondary" className="text-[10px]">{t.category_name}</Badge>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-heading font-bold text-foreground flex items-center gap-2">
              <Palette className="w-7 h-7 text-primary" />
              Galeria de Estilos
            </h1>
            <p className="text-muted-foreground mt-1">Explore e favorite estilos visuais para usar na geração de conteúdo</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Generate All Button */}
            <Button
              variant="default"
              size="sm"
              className="gap-1.5"
              onClick={handleGenerateAll}
              disabled={generatingAll || !!generatingPack}
            >
              {generatingAll ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {generatingAllProgress.current}/{generatingAllProgress.total} — {generatingAllProgress.currentName}
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4" />
                  Gerar todos os previews
                </>
              )}
            </Button>
            {/* Format filter for previews */}
            <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
              {(["post", "story", "carousel"] as const).map(f => {
                const Icon = FORMAT_ICONS[f];
                return (
                  <button
                    key={f}
                    onClick={() => setPreviewFormat(f)}
                    className={`p-1.5 rounded-md transition-colors ${previewFormat === f ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                );
              })}
            </div>
            <div className="relative w-full sm:w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar estilos..." className="pl-9" />
            </div>
          </div>
        </div>

        <Tabs defaultValue={hasFavorites ? "favorites" : "system"}>
          <TabsList>
            {hasFavorites && <TabsTrigger value="favorites" className="gap-1"><Star className="w-4 h-4" /> Favoritos</TabsTrigger>}
            <TabsTrigger value="brand" className="gap-1"><Palette className="w-4 h-4" /> Da sua marca</TabsTrigger>
            <TabsTrigger value="system" className="gap-1"><Layers className="w-4 h-4" /> Estilos prontos</TabsTrigger>
          </TabsList>

          {hasFavorites && (
            <TabsContent value="favorites">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 mt-4">
                {favBrandTemplates.filter(t => filterBySearch(t.name, t.description)).map(t => renderBrandCard(t))}
                {favSystemTemplates.filter(t => filterBySearch(t.name, t.description)).map(t => renderSystemCard(t))}
              </div>
            </TabsContent>
          )}

          <TabsContent value="brand">
            {brandTemplates.length === 0 ? (
              <Card className="mt-4">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <Palette className="w-16 h-16 text-muted-foreground/30 mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-1">Nenhum estilo da marca</h3>
                  <p className="text-muted-foreground text-sm text-center max-w-sm">Vá ao Brand Kit e gere estilos a partir dos seus exemplos visuais</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 mt-4">
                {brandTemplates.filter(t => filterBySearch(t.name, t.description)).map(t => renderBrandCard(t))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="system">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 mt-4">
              {systemTemplates.filter(t => filterBySearch(t.name, t.description)).map(t => renderSystemCard(t))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
