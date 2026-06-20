import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useBrands, useDeleteBrand } from "@/hooks/useStudio";
import { VISUAL_TONES } from "@/types/studio";
import { Plus, Palette, Trash2, Edit, Sparkles, Loader2, Copy, MoreHorizontal, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// Como cada modo de criação aparece na lista (o usuário esquece em que modo a marca está).
const CREATION_MODE_META: Record<string, { label: string; emoji: string }> = {
  photo_backgrounds: { label: "Fotos pessoais", emoji: "📸" },
  style_copy: { label: "Copia meu estilo", emoji: "🎨" },
  inspired: { label: "Inspirado", emoji: "✨" },
  from_scratch: { label: "Do zero", emoji: "🆕" },
};

export default function Brands() {
  const navigate = useNavigate();
  const { data: brands, isLoading, refetch } = useBrands();
  const deleteBrand = useDeleteBrand();
  const [analyzingBrandId, setAnalyzingBrandId] = useState<string | null>(null);
  const [duplicatingBrandId, setDuplicatingBrandId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  // Marca padrão (frontend-first via localStorage; o Studio lê `tp_default_brand` pra pré-aplicar).
  // Sem default explícito, a 1ª marca é a padrão implícita — sempre há uma em destaque.
  const [defaultBrandId, setDefaultBrandId] = useState<string | null>(() => {
    try { return localStorage.getItem("tp_default_brand"); } catch { return null; }
  });
  const makeDefault = (id: string) => {
    setDefaultBrandId(id);
    try { localStorage.setItem("tp_default_brand", id); localStorage.setItem("tp_last_brand", id); } catch { /* ignore */ }
    toast.success("Marca padrão atualizada — o Studio já abre com ela.");
  };

  // Contagem de posts por marca — mostra quais marcas estão ativas vs abandonadas.
  const { data: postCounts } = useQuery({
    queryKey: ["brand-post-counts"],
    queryFn: async () => {
      const { data } = await supabase.from("generated_contents").select("brand_id");
      const counts: Record<string, number> = {};
      (data || []).forEach((r: any) => { if (r.brand_id) counts[r.brand_id] = (counts[r.brand_id] || 0) + 1; });
      return counts;
    },
  });

  const handleDuplicate = async (brand: any) => {
    setDuplicatingBrandId(brand.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      // 1. Duplicate brand — inclui creation_mode + default_visual_style (senão a cópia nasce "sem modo").
      const { data: newBrand, error: brandErr } = await supabase
        .from("brands")
        .insert({
          name: `${brand.name} (cópia)`,
          owner_user_id: user.id,
          palette: brand.palette,
          fonts: brand.fonts,
          visual_tone: brand.visual_tone,
          do_rules: brand.do_rules,
          dont_rules: brand.dont_rules,
          logo_url: brand.logo_url,
          style_guide: (brand as any).style_guide,
          creation_mode: (brand as any).creation_mode,
          default_visual_style: (brand as any).default_visual_style,
          visual_preferences: (brand as any).visual_preferences,
        } as any)
        .select()
        .single();
      if (brandErr) throw brandErr;

      // 2. Duplicate categories
      const { data: cats } = await supabase
        .from("brand_example_categories")
        .select("*")
        .eq("brand_id", brand.id);

      const catMap: Record<string, string> = {};
      if (cats && cats.length > 0) {
        for (const cat of cats) {
          const { data: newCat } = await supabase
            .from("brand_example_categories")
            .insert({ brand_id: newBrand.id, name: cat.name, description: cat.description } as any)
            .select()
            .single();
          if (newCat) catMap[cat.id] = newCat.id;
        }
      }

      // 3. Duplicate examples
      const { data: examples } = await supabase
        .from("brand_examples")
        .select("*")
        .eq("brand_id", brand.id);

      if (examples && examples.length > 0) {
        const exInserts = examples.map((ex: any) => ({
          brand_id: newBrand.id,
          image_url: ex.image_url,
          thumb_url: ex.thumb_url,
          description: ex.description,
          content_type: ex.content_type,
          type: ex.type,
          subtype: ex.subtype,
          category_id: ex.category_id ? (catMap[ex.category_id] || null) : null,
          category_mode: ex.category_mode,
          carousel_group_id: ex.carousel_group_id,
          slide_index: ex.slide_index,
        }));
        await supabase.from("brand_examples").insert(exInserts as any);
      }

      // 4. Duplicate template sets
      const { data: tsets } = await supabase
        .from("brand_template_sets")
        .select("*")
        .eq("brand_id", brand.id);

      if (tsets && tsets.length > 0) {
        const tsInserts = tsets.map((ts: any) => ({
          brand_id: newBrand.id,
          name: ts.name,
          description: ts.description,
          template_set: ts.template_set,
          visual_signature: ts.visual_signature,
          status: ts.status,
          category_id: ts.category_id ? (catMap[ts.category_id] || null) : null,
          category_name: ts.category_name,
          source_example_ids: ts.source_example_ids,
        }));
        await supabase.from("brand_template_sets").insert(tsInserts as any);
      }

      toast.success("Marca duplicada com sucesso!");
      refetch();
    } catch (err: any) {
      toast.error("Erro ao duplicar: " + (err.message || "Tente novamente"));
    } finally {
      setDuplicatingBrandId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    await deleteBrand.mutateAsync(id);
  };

  const handleAnalyzeStyle = async (brandId: string) => {
    setAnalyzingBrandId(brandId);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-brand-examples", {
        body: { brandId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Style Guide gerado com sucesso!", {
        description: `Preset: ${data.styleGuide?.style_preset || "detectado"}`,
      });
      refetch();
    } catch (err: any) {
      toast.error("Erro ao analisar estilo: " + (err.message || "Tente novamente"));
    } finally {
      setAnalyzingBrandId(null);
    }
  };

  // Padrão efetiva: a marcada explicitamente (se ainda existe) ou, na falta, a 1ª da lista.
  const effectiveDefaultId = (defaultBrandId && brands?.some((b: any) => b.id === defaultBrandId))
    ? defaultBrandId
    : (brands?.[0]?.id ?? null);

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-heading font-bold text-foreground flex items-center gap-2">
              Marcas
            </h1>
            <p className="text-muted-foreground">A marca <b className="text-foreground font-semibold">padrão</b> é aplicada no Studio automaticamente.</p>
          </div>
          <Button onClick={() => navigate("/brands/new")}>
            <Plus className="w-4 h-4 mr-2" />
            Nova Marca
          </Button>
        </div>

        {/* Brands List */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-48" />
            ))}
          </div>
        ) : brands && brands.length > 0 ? (
          <div className="space-y-2.5 stagger-children">
            {brands.map((brand) => {
              const mode = CREATION_MODE_META[(brand as any).creation_mode as string];
              const count = postCounts?.[brand.id] ?? 0;
              const logoUrl = (brand as any).logo_url as string | null;
              const palette = (brand.palette as any[] || [])
                .map((c) => (typeof c === "string" ? c : c?.hex))
                .filter(Boolean) as string[];
              const toneLabel = VISUAL_TONES.find(t => t.value === brand.visual_tone)?.label || brand.visual_tone;
              const isDefault = brand.id === effectiveDefaultId;
              const busy = analyzingBrandId === brand.id || duplicatingBrandId === brand.id;
              const meta = [toneLabel, mode?.label, count > 0 ? `${count} ${count === 1 ? "post" : "posts"}` : "sem posts"]
                .filter(Boolean).join(" · ");
              return (
                <div
                  key={brand.id}
                  onClick={() => navigate(`/brands/${brand.id}/edit`)}
                  className={cn(
                    "group flex items-center gap-3.5 rounded-xl border bg-card px-4 py-3 cursor-pointer transition-all duration-200 ease-expo hover:-translate-y-0.5 hover:shadow-md",
                    isDefault ? "border-primary/40 ring-1 ring-primary/20 bg-primary/[0.03]" : "border-border hover:border-primary/40",
                  )}
                >
                  {/* Miniatura: logo real ou bloco com a paleta da marca */}
                  {logoUrl ? (
                    <img src={logoUrl} alt="" className="w-11 h-11 rounded-lg object-cover border border-border shrink-0" />
                  ) : (
                    <div className="w-11 h-11 rounded-lg overflow-hidden border border-border shrink-0 flex">
                      {palette.length > 0 ? (
                        palette.slice(0, 3).map((hex, i) => (
                          <span key={i} className="flex-1 h-full" style={{ backgroundColor: hex }} title={hex} />
                        ))
                      ) : (
                        <span className="flex-1 h-full bg-primary/10 flex items-center justify-center"><Palette className="w-5 h-5 text-primary" /></span>
                      )}
                    </div>
                  )}
                  {/* Nome + meta condensada (tom · modo · posts) */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold truncate">{brand.name}</span>
                      {isDefault && (
                        <Badge variant="outline" className="text-[10px] gap-1 bg-primary/10 text-primary border-primary/20 hover:bg-primary/10 shrink-0">
                          <Star className="w-2.5 h-2.5 fill-current" /> PADRÃO
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{meta}</p>
                  </div>
                  {/* Ações: primária Editar + resto no menu ⋯ (confortável no toque) */}
                  <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <Button variant="outline" size="sm" className="h-8" onClick={() => navigate(`/brands/${brand.id}/edit`)}>
                      <Edit className="w-3.5 h-3.5 mr-1.5" /> Editar
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Mais ações">
                          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <MoreHorizontal className="w-4 h-4" />}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        {!isDefault && (
                          <DropdownMenuItem onClick={() => makeDefault(brand.id)}>
                            <Star className="w-4 h-4 mr-2" /> Definir como padrão
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => handleAnalyzeStyle(brand.id)} disabled={analyzingBrandId === brand.id}>
                          <Sparkles className="w-4 h-4 mr-2 text-primary" /> Analisar estilo
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDuplicate(brand)} disabled={duplicatingBrandId === brand.id}>
                          <Copy className="w-4 h-4 mr-2" /> Duplicar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setDeleteTarget({ id: brand.id, name: brand.name })} className="text-destructive focus:text-destructive">
                          <Trash2 className="w-4 h-4 mr-2" /> Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              );
            })}
            {/* Adicionar marca — CTA escaneável no fim da lista */}
            <button
              onClick={() => navigate("/brands/new")}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-border py-3 text-sm font-medium text-muted-foreground hover:text-primary hover:border-primary/40 hover:bg-primary/[0.03] transition-colors"
            >
              <Plus className="w-4 h-4" /> Adicionar marca
            </button>
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              {/* Faixa de exemplos — "show, don't tell": o que dá pra gerar com uma marca */}
              <div className="flex justify-center gap-2 mb-5">
                {["/showcase/gpt_post.jpg", "/showcase/ideogram_post.jpg", "/showcase/recraft_post.jpg", "/showcase/seedream_post.jpg", "/showcase/flux_post.jpg"].map((src) => (
                  <img key={src} src={src} alt="" loading="lazy" className="w-16 h-16 rounded-lg object-cover border border-border shadow-sm" />
                ))}
              </div>
              <h3 className="text-lg font-medium mb-2">Nenhuma marca ainda</h3>
              <p className="text-muted-foreground mb-4">
                Crie sua primeira marca para definir identidade visual
              </p>
              <Button onClick={() => navigate("/brands/new")}>
                <Plus className="w-4 h-4 mr-2" />
                Criar Primeira Marca
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Confirmação de exclusão (substitui o confirm() nativo) */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é permanente. A marca, seus exemplos e configurações de estilo serão excluídos.
              Os conteúdos já gerados continuam salvos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir marca
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
