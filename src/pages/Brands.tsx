import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useBrands, useDeleteBrand } from "@/hooks/useStudio";
import { VISUAL_TONES } from "@/types/studio";
import { Plus, Palette, Trash2, Edit, Sparkles, Loader2, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-heading font-bold text-foreground flex items-center gap-2">
              Marcas
            </h1>
            <p className="text-muted-foreground">Gerencie suas marcas, estilo visual e configurações de geração</p>
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {brands.map((brand) => {
              const mode = CREATION_MODE_META[(brand as any).creation_mode as string];
              const count = postCounts?.[brand.id] ?? 0;
              const logoUrl = (brand as any).logo_url as string | null;
              return (
              <Card key={brand.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(`/brands/${brand.id}/edit`)}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      {logoUrl ? (
                        <img src={logoUrl} alt="" className="w-10 h-10 rounded-lg object-cover border border-border shrink-0" />
                      ) : (
                        <div className="p-2 bg-primary/10 rounded-lg shrink-0">
                          <Palette className="w-5 h-5 text-primary" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <CardTitle className="text-lg truncate">{brand.name}</CardTitle>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <Badge variant="outline">
                            {VISUAL_TONES.find(t => t.value === brand.visual_tone)?.label || brand.visual_tone}
                          </Badge>
                          {mode && (
                            <Badge variant="secondary" className="text-[11px]">{mode.emoji} {mode.label}</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleAnalyzeStyle(brand.id)}
                        disabled={analyzingBrandId === brand.id}
                        title="Analisar estilo dos exemplos"
                      >
                        {analyzingBrandId === brand.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Sparkles className="w-4 h-4 text-primary" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDuplicate(brand)}
                        disabled={duplicatingBrandId === brand.id}
                        title="Duplicar marca"
                      >
                        {duplicatingBrandId === brand.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => navigate(`/brands/${brand.id}/edit`)} title="Editar">
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteTarget({ id: brand.id, name: brand.name })} title="Excluir">
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Palette — swatches maiores, mais visíveis */}
                  <div className="flex gap-1.5 mb-3 flex-wrap">
                    {(brand.palette as any[] || []).slice(0, 6).map((color, i) => {
                      const hex = typeof color === "string" ? color : color?.hex || "#ccc";
                      return (
                        <div
                          key={i}
                          className="w-9 h-9 rounded-lg border border-border"
                          style={{ backgroundColor: hex }}
                          title={hex}
                        />
                      );
                    })}
                  </div>
                  {brand.do_rules && (
                    <p className="text-xs text-muted-foreground line-clamp-1 mb-1">✓ {brand.do_rules}</p>
                  )}
                  {brand.dont_rules && (
                    <p className="text-xs text-muted-foreground line-clamp-1">✗ {brand.dont_rules}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {(brand as any).style_guide && (
                      <Badge className="text-[10px]" variant="secondary">
                        ✨ Style Guide: {(brand as any).style_guide?.style_preset || "ativo"}
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                      {count > 0 ? `${count} ${count === 1 ? "post" : "posts"}` : "Sem conteúdo ainda"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
              );
            })}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <Palette className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
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
