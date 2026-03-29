import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBrands, useUpdateBrand } from "@/hooks/useStudio";
import { VISUAL_TONES } from "@/types/studio";
import { ArrowLeft, Plus, X, Save, Loader2 } from "lucide-react";
import BrandExamples from "@/components/studio/BrandExamples";
import TemplateSetsSection from "@/components/studio/TemplateSetsSection";
import SavedBackgroundTemplates from "@/components/studio/SavedBackgroundTemplates";
import BrandPhotoBackgrounds from "@/components/studio/BrandPhotoBackgrounds";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function BrandEdit() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { data: brands, isLoading, refetch } = useBrands();
  const updateBrand = useUpdateBrand();
  const [analyzingStyle, setAnalyzingStyle] = useState(false);

  const brand = brands?.find((b) => b.id === id);

  const [formData, setFormData] = useState({
    name: "",
    visual_tone: "clean",
    palette: ["#6366f1", "#ec4899", "#f59e0b"],
    fonts: { headings: "Inter", body: "Inter" },
    do_rules: "",
    dont_rules: "",
    default_visual_style: null as string | null,
    creation_mode: null as string | null,
  });

  useEffect(() => {
    if (brand) {
      setFormData({
        name: brand.name,
        visual_tone: brand.visual_tone || "clean",
        palette: (brand.palette as string[]) || ["#6366f1", "#ec4899", "#f59e0b"],
        fonts: (brand.fonts as { headings: string; body: string }) || { headings: "Inter", body: "Inter" },
        do_rules: brand.do_rules || "",
        dont_rules: brand.dont_rules || "",
        default_visual_style: (brand as any).default_visual_style || null,
        creation_mode: (brand as any).creation_mode || null,
      });
    }
  }, [brand]);

  const handleSave = async () => {
    if (!formData.name || !id) return;
    await updateBrand.mutateAsync({ id, ...formData });
    navigate("/brands");
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

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (!brand) {
    return (
      <DashboardLayout>
        <div className="p-6 text-center">
          <p className="text-muted-foreground">Marca não encontrada.</p>
          <Button variant="link" onClick={() => navigate("/brands")}>Voltar</Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/brands")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-heading font-bold text-foreground">Editar Marca</h1>
              <p className="text-muted-foreground">{brand.name}</p>
            </div>
          </div>
          <Button onClick={handleSave} disabled={!formData.name || updateBrand.isPending}>
            {updateBrand.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Salvar
          </Button>
        </div>

        <Tabs defaultValue="identity" className="w-full">
          <TabsList className="flex-wrap">
            <TabsTrigger value="identity">Identidade</TabsTrigger>
            <TabsTrigger value="generation">Geração</TabsTrigger>
            <TabsTrigger value="images">Imagens</TabsTrigger>
            <TabsTrigger value="styles">Estilos</TabsTrigger>
          </TabsList>

          {/* ── Tab 1: Identidade — nome, cores, fontes, tom visual ── */}
          <TabsContent value="identity">
            <Card>
              <CardContent className="space-y-4 pt-6">
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
                  <Select value={formData.visual_tone} onValueChange={(value) => setFormData({ ...formData, visual_tone: value })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {VISUAL_TONES.map((tone) => (
                        <SelectItem key={tone.value} value={tone.value}>{tone.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Paleta de Cores</Label>
                    {formData.palette.length < 6 && (
                      <Button variant="ghost" size="sm" onClick={addColor}><Plus className="w-4 h-4" /></Button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {formData.palette.map((color, index) => (
                      <div key={index} className="flex items-center gap-2 group">
                        <input type="color" value={color} onChange={(e) => updatePaletteColor(index, e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer border-2 border-border flex-shrink-0" />
                        <Input value={color} onChange={(e) => { const val = e.target.value; if (/^#[0-9A-Fa-f]{0,6}$/.test(val) || val === "") updatePaletteColor(index, val); }} placeholder="#000000" className="font-mono text-sm w-28" maxLength={7} />
                        {formData.palette.length > 1 && (
                          <Button variant="ghost" size="icon" onClick={() => removeColor(index)} className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8">
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
                    <Input value={formData.fonts.headings} onChange={(e) => setFormData({ ...formData, fonts: { ...formData.fonts, headings: e.target.value } })} placeholder="Inter" />
                  </div>
                  <div className="space-y-2">
                    <Label>Fonte Corpo</Label>
                    <Input value={formData.fonts.body} onChange={(e) => setFormData({ ...formData, fonts: { ...formData.fonts, body: e.target.value } })} placeholder="Inter" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Tipo de marca</Label>
                  <p className="text-xs text-muted-foreground">Define como a IA usa as imagens dessa marca na geração.</p>
                  <Select
                    value={formData.creation_mode || "style_copy"}
                    onValueChange={(value) => {
                      const autoDefault: Record<string, string | null> = {
                        photo_backgrounds: "photo_overlay",
                        style_copy: "ai_background",
                        inspired: "ai_background",
                        from_scratch: null,
                      };
                      setFormData({
                        ...formData,
                        creation_mode: value,
                        default_visual_style: autoDefault[value] ?? formData.default_visual_style,
                      });
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="style_copy">🎨 Copiar estilo — IA replica seu estilo visual</SelectItem>
                      <SelectItem value="photo_backgrounds">📸 Fotos pessoais — suas fotos como fundo</SelectItem>
                      <SelectItem value="inspired">🔍 Inspirado — IA se inspira nas referências</SelectItem>
                      <SelectItem value="from_scratch">✨ Do zero — sem referências visuais</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Tab 2: Geração — como a IA gera conteúdo para esta marca ── */}
          <TabsContent value="generation">
            <Card>
              <CardContent className="space-y-4 pt-6">
                <div className="space-y-3">
                  <div>
                    <Label>Modo visual padrão</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Define como os posts são gerados por padrão. Se definido, pula a pergunta "Como quer o visual?" no chat.
                    </p>
                  </div>
                  <Select
                    value={formData.default_visual_style || "ask"}
                    onValueChange={(value) => setFormData({ ...formData, default_visual_style: value === "ask" ? null : value })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ask">Perguntar sempre</SelectItem>
                      <SelectItem value="ai_full_design">✨ Design completo por IA — imagem pronta com texto</SelectItem>
                      <SelectItem value="ai_background">🖼️ Visual da marca + texto — background fiel ao estilo</SelectItem>
                      <SelectItem value="photo_overlay">📸 Foto pessoal + texto — sua foto como fundo</SelectItem>
                      <SelectItem value="template_clean">🎨 Só texto — cores da marca, sem imagem</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="border-t border-border pt-4 space-y-4">
                  <div className="space-y-2">
                    <Label>Regras para a IA (O que fazer)</Label>
                    <Textarea value={formData.do_rules} onChange={(e) => setFormData({ ...formData, do_rules: e.target.value })} placeholder="Ex: Usar linguagem informal, incluir dados estatísticos, sempre mencionar o nome da marca..." rows={3} />
                  </div>

                  <div className="space-y-2">
                    <Label>Regras para a IA (O que evitar)</Label>
                    <Textarea value={formData.dont_rules} onChange={(e) => setFormData({ ...formData, dont_rules: e.target.value })} placeholder="Ex: Não usar jargões técnicos, evitar textos longos, não usar emojis em excesso..." rows={3} />
                  </div>
                </div>

                {/* Style Guide Preview */}
                {(brand as any).style_guide && (
                  <div className="border-t border-border pt-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-medium">Style Guide (gerado pela IA)</h4>
                      <Badge variant="secondary" className="text-[10px]">
                        v{(brand as any).style_guide_version || 1}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Preset detectado: <strong>{(brand as any).style_guide?.style_preset}</strong>
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Tab 3: Imagens — referências visuais + fotos pessoais ── */}
          <TabsContent value="images">
            <div className="space-y-6">
              {/* Referências de estilo */}
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold">Referências de estilo</h3>
                    <p className="text-xs text-muted-foreground">
                      Exemplos de posts que você já usa ou que gosta. A IA analisa e copia o estilo visual.
                    </p>
                  </div>
                  <BrandExamples
                    brandId={brand.id}
                    brandName={brand.name}
                    onAnalyzeStyle={async () => {
                      setAnalyzingStyle(true);
                      try {
                        const { data, error } = await supabase.functions.invoke("analyze-brand-examples", {
                          body: { brandId: brand.id },
                        });
                        if (error) throw error;
                        if (data?.error) throw new Error(data.error);
                        toast.success("Style Guide atualizado!", {
                          description: `Preset: ${data.styleGuide?.style_preset || "detectado"} (v${data.version})`,
                        });
                        refetch();
                      } catch (err: any) {
                        toast.error("Erro ao analisar: " + (err.message || "Tente novamente"));
                      } finally {
                        setAnalyzingStyle(false);
                      }
                    }}
                    isAnalyzing={analyzingStyle}
                  />
                </CardContent>
              </Card>

              {/* Fotos pessoais (background) */}
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold">Fotos pessoais</h3>
                    <p className="text-xs text-muted-foreground">
                      Fotos que serão usadas como fundo dos posts no modo "📸 Foto + texto". Ideal para fotos profissionais.
                    </p>
                  </div>
                  <BrandPhotoBackgrounds brandId={brand.id} />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Tab 4: Estilos — template sets + backgrounds ── */}
          <TabsContent value="styles">
            <div className="space-y-6">
              <Card>
                <CardContent className="pt-6">
                  <div className="space-y-1 mb-4">
                    <h3 className="text-sm font-semibold">Estilos de conteúdo</h3>
                    <p className="text-xs text-muted-foreground">
                      Templates gerados pela IA a partir das suas referências visuais.
                    </p>
                  </div>
                  <TemplateSetsSection
                    brandId={brand.id}
                    brandName={brand.name}
                    defaultTemplateSetId={(brand as any).default_template_set_id || null}
                    templateSetsDirty={(brand as any).template_sets_dirty || false}
                    templateSetsDirtyCount={(brand as any).template_sets_dirty_count || 0}
                    templateSetsStatus={(brand as any).template_sets_status || "idle"}
                    brandPalette={(brand as any).palette}
                    brandFonts={(brand as any).fonts}
                    brandVisualTone={(brand as any).visual_tone}
                    brandLogoUrl={(brand as any).logo_url}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="space-y-1 mb-4">
                    <h3 className="text-sm font-semibold">Backgrounds salvos</h3>
                    <p className="text-xs text-muted-foreground">
                      Fundos gerados que você salvou para reusar em novos conteúdos.
                    </p>
                  </div>
                  <SavedBackgroundTemplates brandId={brand.id} />
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
