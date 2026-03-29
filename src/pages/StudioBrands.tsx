import { useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBrands, useCreateBrand, useUpdateBrand, useDeleteBrand, useBrandExamples } from "@/hooks/useStudio";
import { VISUAL_TONES } from "@/types/studio";
import { Plus, ArrowLeft, Palette, Trash2, Edit, X, Image, Sparkles, Loader2 } from "lucide-react";
import BrandExamples from "@/components/studio/BrandExamples";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function StudioBrands() {
  const navigate = useNavigate();
  const { data: brands, isLoading } = useBrands();
  const createBrand = useCreateBrand();
  const updateBrand = useUpdateBrand();
  const deleteBrand = useDeleteBrand();
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBrand, setEditingBrand] = useState<any>(null);
  const [analyzingBrandId, setAnalyzingBrandId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    visual_tone: "clean",
    palette: ["#6366f1", "#ec4899", "#f59e0b"],
    fonts: { headings: "Inter", body: "Inter" },
    do_rules: "",
    dont_rules: ""
  });

  const resetForm = () => {
    setFormData({
      name: "",
      visual_tone: "clean",
      palette: ["#6366f1", "#ec4899", "#f59e0b"],
      fonts: { headings: "Inter", body: "Inter" },
      do_rules: "",
      dont_rules: ""
    });
    setEditingBrand(null);
  };

  const handleOpenEdit = (brand: any) => {
    setEditingBrand(brand);
    setFormData({
      name: brand.name,
      visual_tone: brand.visual_tone || "clean",
      palette: brand.palette || ["#6366f1", "#ec4899", "#f59e0b"],
      fonts: brand.fonts || { headings: "Inter", body: "Inter" },
      do_rules: brand.do_rules || "",
      dont_rules: brand.dont_rules || ""
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name) return;
    
    if (editingBrand) {
      await updateBrand.mutateAsync({ id: editingBrand.id, ...formData });
    } else {
      await createBrand.mutateAsync(formData);
    }
    
    resetForm();
    setDialogOpen(false);
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
      // Refresh brands list
      window.location.reload();
    } catch (err: any) {
      toast.error("Erro ao analisar estilo: " + (err.message || "Tente novamente"));
    } finally {
      setAnalyzingBrandId(null);
    }
  };

  const updatePaletteColor = (index: number, color: string) => {
    const newPalette = [...formData.palette];
    newPalette[index] = color;
    setFormData({ ...formData, palette: newPalette });
  };

  const addColor = () => {
    if (formData.palette.length < 6) {
      setFormData({ ...formData, palette: [...formData.palette, "#000000"] });
    }
  };

  const removeColor = (index: number) => {
    if (formData.palette.length > 1) {
      setFormData({ ...formData, palette: formData.palette.filter((_, i) => i !== index) });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/studio")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-heading font-bold text-foreground">Brand Kit</h1>
              <p className="text-muted-foreground">Gerencie suas marcas e identidades visuais</p>
            </div>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Nova Marca
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingBrand ? "Editar Marca" : "Criar Marca"}</DialogTitle>
              </DialogHeader>
              
              <Tabs defaultValue="info" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="info">Informações</TabsTrigger>
                  <TabsTrigger value="examples" disabled={!editingBrand}>Exemplos</TabsTrigger>
                </TabsList>
                
                <TabsContent value="info" className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Nome da Marca *</Label>
                    <Input 
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Ex: Minha Empresa"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Tom Visual</Label>
                    <Select 
                      value={formData.visual_tone}
                      onValueChange={(value) => setFormData({ ...formData, visual_tone: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {VISUAL_TONES.map((tone) => (
                          <SelectItem key={tone.value} value={tone.value}>
                            {tone.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Paleta de Cores</Label>
                      {formData.palette.length < 6 && (
                        <Button variant="ghost" size="sm" onClick={addColor}>
                          <Plus className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                    <div className="space-y-2">
                      {formData.palette.map((color, index) => (
                        <div key={index} className="flex items-center gap-2 group">
                          <input
                            type="color"
                            value={color}
                            onChange={(e) => updatePaletteColor(index, e.target.value)}
                            className="w-10 h-10 rounded-lg cursor-pointer border-2 border-border flex-shrink-0"
                          />
                          <Input
                            value={color}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (/^#[0-9A-Fa-f]{0,6}$/.test(val) || val === "") {
                                updatePaletteColor(index, val);
                              }
                            }}
                            placeholder="#000000"
                            className="font-mono text-sm w-28"
                            maxLength={7}
                          />
                          {formData.palette.length > 1 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeColor(index)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8"
                            >
                              <X className="w-4 h-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Fonte Títulos</Label>
                      <Input 
                        value={formData.fonts.headings}
                        onChange={(e) => setFormData({ ...formData, fonts: { ...formData.fonts, headings: e.target.value } })}
                        placeholder="Inter"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Fonte Corpo</Label>
                      <Input 
                        value={formData.fonts.body}
                        onChange={(e) => setFormData({ ...formData, fonts: { ...formData.fonts, body: e.target.value } })}
                        placeholder="Inter"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Regras Positivas (O que fazer)</Label>
                    <Textarea 
                      value={formData.do_rules}
                      onChange={(e) => setFormData({ ...formData, do_rules: e.target.value })}
                      placeholder="Ex: Usar cores vibrantes, incluir elementos geométricos, manter espaço para texto..."
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Regras Negativas (O que evitar)</Label>
                    <Textarea 
                      value={formData.dont_rules}
                      onChange={(e) => setFormData({ ...formData, dont_rules: e.target.value })}
                      placeholder="Ex: Evitar fundos muito escuros, não usar muitos elementos, evitar estilo cartoon..."
                      rows={3}
                    />
                  </div>
                </TabsContent>
                
                <TabsContent value="examples" className="py-4">
                  {editingBrand && (
                    <BrandExamples brandId={editingBrand.id} brandName={editingBrand.name} />
                  )}
                </TabsContent>
              </Tabs>
              
              <DialogFooter>
                <Button 
                  onClick={handleSave} 
                  disabled={!formData.name || createBrand.isPending || updateBrand.isPending}
                >
                  {(createBrand.isPending || updateBrand.isPending) ? "Salvando..." : "Salvar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
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
              <Card key={brand.id}>
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
                    <div className="flex gap-1">
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
                      <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(brand)}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(brand.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Palette Preview */}
                  <div className="flex gap-2 mb-3 flex-wrap">
                    {(brand.palette as string[] || []).slice(0, 5).map((color, i) => (
                      <div key={i} className="flex flex-col items-center gap-1">
                        <div 
                          className="w-6 h-6 rounded-full border border-border"
                          style={{ backgroundColor: color }}
                        />
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {color}
                        </span>
                      </div>
                    ))}
                  </div>
                  
                  {brand.do_rules && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-1">
                      ✓ {brand.do_rules}
                    </p>
                  )}
                  {brand.dont_rules && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      ✗ {brand.dont_rules}
                    </p>
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
              <Button onClick={() => setDialogOpen(true)}>
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
