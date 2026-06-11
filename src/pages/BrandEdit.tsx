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
import BrandExamples from "@/components/brand/BrandExamples";
// TemplateSetsSection and SavedBackgroundTemplates removed in simplification
import BrandPhotoBackgrounds from "@/components/brand/BrandPhotoBackgrounds";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const FONT_OPTIONS = [
  "Inter", "Roboto", "Open Sans", "Lato", "Montserrat", "Poppins",
  "Raleway", "Nunito", "Oswald", "Playfair Display", "Merriweather",
  "PT Sans", "Source Sans Pro", "Ubuntu", "Mulish", "Quicksand",
  "Josefin Sans", "Exo 2", "Titillium Web", "DM Sans",
  "Bebas Neue", "Anton", "Pacifico", "Dancing Script", "Lobster",
  "Abril Fatface", "Cinzel", "Cormorant Garamond", "EB Garamond",
];

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
    visual_preferences: {
      phone_mockup: null as boolean | null,
      body_in_card: null as boolean | null,
      inner_frame: null as boolean | null,
      waves: null as boolean | null,
      abstract_elements: null as boolean | null,
      preferred_bg_mode: null as string | null,
      custom_notes: "",
    },
  });

  useEffect(() => {
    if (brand) {
      const vp = (brand as any).visual_preferences || {};
      setFormData({
        name: brand.name,
        visual_tone: brand.visual_tone || "clean",
        palette: (brand.palette as string[]) || ["#6366f1", "#ec4899", "#f59e0b"],
        fonts: (brand.fonts as { headings: string; body: string }) || { headings: "Inter", body: "Inter" },
        do_rules: brand.do_rules || "",
        dont_rules: brand.dont_rules || "",
        default_visual_style: (brand as any).default_visual_style || null,
        creation_mode: (brand as any).creation_mode || null,
        visual_preferences: {
          phone_mockup: vp.phone_mockup ?? null,
          body_in_card: vp.body_in_card ?? null,
          inner_frame: vp.inner_frame ?? null,
          waves: vp.waves ?? null,
          abstract_elements: vp.abstract_elements ?? null,
          preferred_bg_mode: vp.preferred_bg_mode || null,
          custom_notes: vp.custom_notes || "",
        },
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
          <p className="text-muted-foreground">Marca nÃ£o encontrada.</p>
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
            <TabsTrigger value="generation">Regras para IA</TabsTrigger>
            <TabsTrigger value="images">Imagens</TabsTrigger>
          </TabsList>

          {/* â”€â”€ Tab 1: Identidade â€” nome, cores, fontes, tom visual â”€â”€ */}
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
                  <Label>Modo de CriaÃ§Ã£o</Label>
                  <p className="text-xs text-muted-foreground">Define como a IA usa referÃªncias visuais ao gerar conteÃºdo.</p>
                  <Select value={formData.creation_mode || "from_scratch"} onValueChange={(value) => setFormData({ ...formData, creation_mode: value })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="photo_backgrounds">ðŸ“¸ Fotos pessoais como fundo</SelectItem>
                      <SelectItem value="style_copy">ðŸŽ¨ Copiar estilo de referÃªncias</SelectItem>
                      <SelectItem value="inspired">ðŸ’¡ Inspirado em referÃªncias</SelectItem>
                      <SelectItem value="from_scratch">âœ¨ Criar do zero (sem referÃªncias)</SelectItem>
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

                <div className="space-y-2">
                  <Label>Fontes</Label>
                  <p className="text-xs text-muted-foreground">Usadas nos textos sobrepostos nas imagens. Ex: Inter, Montserrat, Playfair Display, Poppins.</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">TÃ­tulos (headlines)</Label>
                      <Select value={formData.fonts.headings} onValueChange={v => setFormData({ ...formData, fonts: { ...formData.fonts, headings: v } })}>
                        <SelectTrigger><SelectValue placeholder="Selecione uma fonte" /></SelectTrigger>
                        <SelectContent>
                          {FONT_OPTIONS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Corpo (body text)</Label>
                      <Select value={formData.fonts.body} onValueChange={v => setFormData({ ...formData, fonts: { ...formData.fonts, body: v } })}>
                        <SelectTrigger><SelectValue placeholder="Selecione uma fonte" /></SelectTrigger>
                        <SelectContent>
                          {FONT_OPTIONS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

              </CardContent>
            </Card>
          </TabsContent>

          {/* â”€â”€ Tab 2: GeraÃ§Ã£o â€” como a IA gera conteÃºdo para esta marca â”€â”€ */}
          <TabsContent value="generation">
            <Card>
              <CardContent className="space-y-4 pt-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>âœ… O que a IA DEVE fazer nos conteÃºdos</Label>
                    <p className="text-xs text-muted-foreground">Regras que a IA vai seguir ao gerar textos e imagens para esta marca.</p>
                    <Textarea value={formData.do_rules} onChange={(e) => setFormData({ ...formData, do_rules: e.target.value })} placeholder={"Exemplos:\nâ€¢ Usar linguagem informal e prÃ³xima\nâ€¢ Sempre incluir dados e estatÃ­sticas\nâ€¢ Mencionar o nome da marca nos slides\nâ€¢ Usar emojis com moderaÃ§Ã£o\nâ€¢ Headlines curtos e impactantes (mÃ¡x 60 caracteres)"} rows={4} />
                  </div>

                  <div className="space-y-2">
                    <Label>ðŸš« O que a IA NÃƒO deve fazer</Label>
                    <p className="text-xs text-muted-foreground">Regras do que evitar â€” a IA nÃ£o vai fazer nada desta lista.</p>
                    <Textarea value={formData.dont_rules} onChange={(e) => setFormData({ ...formData, dont_rules: e.target.value })} placeholder={"Exemplos:\nâ€¢ NÃ£o usar jargÃµes tÃ©cnicos\nâ€¢ NÃ£o fazer textos longos demais\nâ€¢ NÃ£o usar emojis em excesso\nâ€¢ NÃ£o mencionar concorrentes\nâ€¢ NÃ£o usar CAPS LOCK nos headlines"} rows={4} />
                  </div>
                </div>

                {/* Visual Preferences */}
                <div className="border-t border-border pt-4 space-y-4">
                  <div>
                    <Label>ðŸŽ¨ PreferÃªncias visuais das imagens</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Controle como a IA gera as imagens. Essas preferÃªncias sÃ£o aplicadas automaticamente em toda geraÃ§Ã£o.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <VisualPrefToggle
                      label="Mockup de celular"
                      description="Incluir mockup de celular nas imagens"
                      value={formData.visual_preferences.phone_mockup}
                      onChange={(v) => setFormData({ ...formData, visual_preferences: { ...formData.visual_preferences, phone_mockup: v } })}
                    />
                    <VisualPrefToggle
                      label="Texto em card/caixa"
                      description="Colocar texto dentro de cards com fundo"
                      value={formData.visual_preferences.body_in_card}
                      onChange={(v) => setFormData({ ...formData, visual_preferences: { ...formData.visual_preferences, body_in_card: v } })}
                    />
                    <VisualPrefToggle
                      label="Moldura decorativa"
                      description="Usar moldura/borda interna decorativa"
                      value={formData.visual_preferences.inner_frame}
                      onChange={(v) => setFormData({ ...formData, visual_preferences: { ...formData.visual_preferences, inner_frame: v } })}
                    />
                    <VisualPrefToggle
                      label="Ondas/curvas"
                      description="Elementos ondulados ou curvos no design"
                      value={formData.visual_preferences.waves}
                      onChange={(v) => setFormData({ ...formData, visual_preferences: { ...formData.visual_preferences, waves: v } })}
                    />
                    <VisualPrefToggle
                      label="Formas abstratas"
                      description="Formas geomÃ©tricas e abstratas como decoraÃ§Ã£o"
                      value={formData.visual_preferences.abstract_elements}
                      onChange={(v) => setFormData({ ...formData, visual_preferences: { ...formData.visual_preferences, abstract_elements: v } })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>ðŸ“ InstruÃ§Ãµes extras para a IA (imagens)</Label>
                    <p className="text-xs text-muted-foreground">Texto livre que serÃ¡ enviado ao gerador de imagens. Use para descrever o estilo que vocÃª quer.</p>
                    <Textarea
                      value={formData.visual_preferences.custom_notes}
                      onChange={(e) => setFormData({ ...formData, visual_preferences: { ...formData.visual_preferences, custom_notes: e.target.value } })}
                      placeholder={"Exemplos:\nâ€¢ Estilo minimalista, fundo escuro com detalhes dourados\nâ€¢ Sempre usar degradÃª azul para roxo\nâ€¢ Preferir fotos reais ao invÃ©s de ilustraÃ§Ãµes\nâ€¢ Headlines sempre na parte inferior da imagem"}
                      rows={4}
                    />
                  </div>
                </div>

              </CardContent>
            </Card>
          </TabsContent>

          {/* â”€â”€ Tab 3: Imagens â€” referÃªncias visuais + fotos pessoais â”€â”€ */}
          <TabsContent value="images">
            <div className="space-y-6">
              {/* ReferÃªncias de estilo */}
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold">ReferÃªncias de estilo</h3>
                    <p className="text-xs text-muted-foreground">
                      Exemplos de posts que vocÃª jÃ¡ usa ou que gosta. A IA analisa e copia o estilo visual.
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
                      Fotos que serÃ£o usadas como fundo dos posts no modo "ðŸ“¸ Foto + texto". Ideal para fotos profissionais.
                    </p>
                  </div>
                  <BrandPhotoBackgrounds brandId={brand.id} />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

        </Tabs>
      </div>
    </DashboardLayout>
  );
}

function VisualPrefToggle({ label, description, value, onChange }: {
  label: string; description: string; value: boolean | null; onChange: (v: boolean | null) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        // Cycle: null (nÃ£o definido) â†’ true (sim) â†’ false (nÃ£o) â†’ null
        if (value === null) onChange(true);
        else if (value === true) onChange(false);
        else onChange(null);
      }}
      className={`flex items-start gap-2 p-3 rounded-lg border text-left transition-all ${
        value === true
          ? "border-green-500/50 bg-green-500/5"
          : value === false
            ? "border-red-500/30 bg-red-500/5"
            : "border-border/60 hover:border-border"
      }`}
    >
      <span className="text-sm mt-0.5">
        {value === true ? "âœ…" : value === false ? "ðŸš«" : "âž–"}
      </span>
      <div>
        <p className={`text-xs font-medium ${value === true ? "text-green-700" : value === false ? "text-red-600" : "text-muted-foreground"}`}>
          {label}
        </p>
        <p className="text-[10px] text-muted-foreground leading-relaxed">{description}</p>
      </div>
    </button>
  );
}
