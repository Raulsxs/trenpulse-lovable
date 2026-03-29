import { useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useBrands, useDeleteBrand } from "@/hooks/useStudio";
import { VISUAL_TONES } from "@/types/studio";
import { Plus, Palette, Trash2, Edit, Sparkles, Loader2, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";


export default function Brands() {
  const navigate = useNavigate();
  const { data: brands, isLoading, refetch } = useBrands();
  const deleteBrand = useDeleteBrand();
  const [analyzingBrandId, setAnalyzingBrandId] = useState<string | null>(null);
  const [duplicatingBrandId, setDuplicatingBrandId] = useState<string | null>(null);

  const handleDuplicate = async (brand: any) => {
    setDuplicatingBrandId(brand.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      // 1. Duplicate brand
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

  const handleDelete = async (id: string) => {
    if (confirm("Tem certeza que deseja excluir esta marca? Todos os projetos associados serão excluídos.")) {
      await deleteBrand.mutateAsync(id);
    }
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
            {brands.map((brand) => (
              <Card key={brand.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(`/brands/${brand.id}/edit`)}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <Palette className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{brand.name}</CardTitle>
                        <Badge variant="outline" className="mt-1">
                          {VISUAL_TONES.find(t => t.value === brand.visual_tone)?.label || brand.visual_tone}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
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
                      <Button variant="ghost" size="icon" onClick={() => navigate(`/brands/${brand.id}/edit`)}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(brand.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2 mb-3 flex-wrap">
                    {(brand.palette as any[] || []).slice(0, 5).map((color, i) => {
                      const hex = typeof color === "string" ? color : color?.hex || "#ccc";
                      return (
                        <div key={i} className="flex flex-col items-center gap-1">
                          <div
                            className="w-6 h-6 rounded-full border border-border"
                            style={{ backgroundColor: hex }}
                          />
                          <span className="text-[10px] font-mono text-muted-foreground">{hex}</span>
                        </div>
                      );
                    })}
                  </div>
                  {brand.do_rules && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-1">✓ {brand.do_rules}</p>
                  )}
                  {brand.dont_rules && (
                    <p className="text-xs text-muted-foreground line-clamp-2">✗ {brand.dont_rules}</p>
                  )}
                  {(brand as any).style_guide && (
                    <Badge className="mt-2 text-[10px]" variant="secondary">
                      ✨ Style Guide: {(brand as any).style_guide?.style_preset || "ativo"}
                    </Badge>
                  )}
                </CardContent>
              </Card>
            ))}
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
    </DashboardLayout>
  );
}
