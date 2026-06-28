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
import { ArrowLeft, Plus, X, Save, Loader2, Star, Eye } from "lucide-react";
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
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) e.target.value = "";
    if (!file) return;
    setUploadingLogo(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");
      const ext = file.name.split(".").pop() || "png";
      const path = `${user.id}/logos/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("content-images").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("content-images").getPublicUrl(path);
      setFormData((prev) => ({ ...prev, logo_url: urlData.publicUrl }));
    } catch (err: any) {
      toast.error("Erro ao subir logo: " + (err.message || "tente novamente"));
    } finally {
      setUploadingLogo(false);
    }
  };

  const brand = brands?.find((b) => b.id === id);
  // Marca padrão (mesma chave usada em /brands e no preselect do Studio).
  const isDefault = (() => { try { return localStorage.getItem("tp_default_brand") === id; } catch { return false; } })();

  const [formData, setFormData] = useState({
    name: "",
    visual_tone: "clean",
    palette: ["#6366f1", "#ec4899", "#f59e0b"],
    fonts: { headings: "Inter", body: "Inter" },
    do_rules: "",
    dont_rules: "",
    default_visual_style: null as string | null,
    creation_mode: null as string | null,
    logo_url: "" as string,
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
        logo_url: (brand as any).logo_url || "",
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
              <div className="flex items-center gap-2">
                <h1 className="text-3xl font-heading font-bold text-foreground">{brand.name}</h1>
                {isDefault && (
                  <Badge variant="outline" className="text-[10px] gap-1 bg-primary/10 text-primary border-primary/20">
                    <Star className="w-2.5 h-2.5 fill-current" /> PADRÃO
                  </Badge>
                )}
              </div>
              <p className="text-muted-foreground">Edite a identidade — a prévia à direita atualiza ao vivo.</p>
            </div>
          </div>
          <Button onClick={handleSave} disabled={!formData.name || updateBrand.isPending}>
            {updateBrand.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Salvar
          </Button>
        </div>

        <div className="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
          <Tabs defaultValue="identity" className="w-full">
          <TabsList className="flex-wrap">
            <TabsTrigger value="identity">Identidade</TabsTrigger>
            <TabsTrigger value="generation">Regras para IA</TabsTrigger>
            <TabsTrigger value="images">Exemplos</TabsTrigger>
          </TabsList>

          {/* â”€â”€ Tab 1: Identidade — nome, cores, fontes, tom visual â”€â”€ */}
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
                  <Label>Logo</Label>
                  <div className="flex items-center gap-3">
                    {formData.logo_url ? (
                      <img src={formData.logo_url} alt="Logo" className="w-16 h-16 object-contain rounded-lg border border-border bg-muted/30" />
                    ) : (
                      <div className="w-16 h-16 rounded-lg border border-dashed border-border grid place-items-center text-muted-foreground">
                        <Plus className="w-5 h-5" />
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <label className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md border border-border bg-background hover:bg-muted cursor-pointer">
                        {uploadingLogo ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        {formData.logo_url ? "Trocar logo" : "Subir logo"}
                        <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} disabled={uploadingLogo} />
                      </label>
                      {formData.logo_url && (
                        <Button variant="ghost" size="sm" onClick={() => setFormData({ ...formData, logo_url: "" })}>
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">PNG/JPG, fundo transparente recomendado. Máx ~5MB.</p>
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
                  <Label>Modo de Criação</Label>
                  <p className="text-xs text-muted-foreground">Define como a IA usa referências visuais ao gerar conteúdo.</p>
                  <Select value={formData.creation_mode || "from_scratch"} onValueChange={(value) => setFormData({ ...formData, creation_mode: value })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="photo_backgrounds">ðŸ“¸ Fotos pessoais como fundo</SelectItem>
                      <SelectItem value="style_copy">ðŸŽ¨ Copiar estilo de referências</SelectItem>
                      <SelectItem value="inspired">ðŸ’¡ Inspirado em referências</SelectItem>
                      <SelectItem value="from_scratch">âœ¨ Criar do zero (sem referências)</SelectItem>
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
                      <Label className="text-xs text-muted-foreground">Títulos (headlines)</Label>
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

          {/* â”€â”€ Tab 2: Geração — como a IA gera conteúdo para esta marca â”€â”€ */}
          <TabsContent value="generation">
            <Card>
              <CardContent className="space-y-4 pt-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>âœ… O que a IA DEVE fazer nos conteúdos</Label>
                    <p className="text-xs text-muted-foreground">Regras que a IA vai seguir ao gerar textos e imagens para esta marca.</p>
                    <Textarea value={formData.do_rules} onChange={(e) => setFormData({ ...formData, do_rules: e.target.value })} placeholder={"Exemplos:\nâ€¢ Usar linguagem informal e próxima\nâ€¢ Sempre incluir dados e estatísticas\nâ€¢ Mencionar o nome da marca nos slides\nâ€¢ Usar emojis com moderação\nâ€¢ Headlines curtos e impactantes (máx 60 caracteres)"} rows={4} />
                  </div>

                  <div className="space-y-2">
                    <Label>ðŸš« O que a IA NÃO deve fazer</Label>
                    <p className="text-xs text-muted-foreground">Regras do que evitar — a IA não vai fazer nada desta lista.</p>
                    <Textarea value={formData.dont_rules} onChange={(e) => setFormData({ ...formData, dont_rules: e.target.value })} placeholder={"Exemplos:\nâ€¢ Não usar jargões técnicos\nâ€¢ Não fazer textos longos demais\nâ€¢ Não usar emojis em excesso\nâ€¢ Não mencionar concorrentes\nâ€¢ Não usar CAPS LOCK nos headlines"} rows={4} />
                  </div>
                </div>

                {/* Visual Preferences */}
                <div className="border-t border-border pt-4 space-y-4">
                  <div>
                    <Label>ðŸŽ¨ Preferências visuais das imagens</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Controle como a IA gera as imagens. Essas preferências são aplicadas automaticamente em toda geração.</p>
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
                      description="Formas geométricas e abstratas como decoração"
                      value={formData.visual_preferences.abstract_elements}
                      onChange={(v) => setFormData({ ...formData, visual_preferences: { ...formData.visual_preferences, abstract_elements: v } })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>ðŸ“ Instruções extras para a IA (imagens)</Label>
                    <p className="text-xs text-muted-foreground">Texto livre que será enviado ao gerador de imagens. Use para descrever o estilo que você quer.</p>
                    <Textarea
                      value={formData.visual_preferences.custom_notes}
                      onChange={(e) => setFormData({ ...formData, visual_preferences: { ...formData.visual_preferences, custom_notes: e.target.value } })}
                      placeholder={"Exemplos:\nâ€¢ Estilo minimalista, fundo escuro com detalhes dourados\nâ€¢ Sempre usar degradê azul para roxo\nâ€¢ Preferir fotos reais ao invés de ilustrações\nâ€¢ Headlines sempre na parte inferior da imagem"}
                      rows={4}
                    />
                  </div>
                </div>

              </CardContent>
            </Card>
          </TabsContent>

          {/* â”€â”€ Tab 3: Imagens — referências visuais + fotos pessoais â”€â”€ */}
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
                      Fotos que serão usadas como fundo dos posts no modo "ðŸ“¸ Foto + texto". Ideal para fotos profissionais.
                    </p>
                  </div>
                  <BrandPhotoBackgrounds brandId={brand.id} />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          </Tabs>

          {/* ── Espelho ao vivo: o Replicador vê o efeito das regras de identidade antes de
              sair da tela. Frontend-only (custo zero) — reflete paleta, fontes, logo e nome.
              O resultado real continua saindo do Studio (geração paga). ── */}
          <div className="hidden lg:block">
            <div className="sticky top-6 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <Eye className="w-3.5 h-3.5" /> Preview ao vivo
              </div>
              <BrandPreview formData={formData} />
              <p className="text-[11px] text-muted-foreground leading-snug">
                Prévia ilustrativa da identidade (paleta, fontes, logo). O resultado final sai no Studio.
              </p>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

// Mock de post que reflete a identidade da marca em tempo real (sem geração).
function pickTextColor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  // Luminância relativa (WCAG) → escolhe texto claro ou escuro pra contraste.
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#16202c" : "#ffffff";
}

function BrandPreview({ formData }: { formData: any }) {
  const palette: string[] = (formData.palette || []).filter(Boolean);
  const c0 = palette[0] || "#1f2a37";
  const c1 = palette[1] || c0;
  const accent = palette[palette.length - 1] || c1;
  const fg = pickTextColor(c0);
  const headingFont = `'${formData.fonts?.headings || "Inter"}', system-ui, sans-serif`;
  const bodyFont = `'${formData.fonts?.body || "Inter"}', system-ui, sans-serif`;
  return (
    <div
      className="rounded-2xl overflow-hidden border border-border shadow-sm aspect-[4/5] flex flex-col justify-between p-5 relative animate-scale-in"
      style={{ background: `linear-gradient(150deg, ${c0} 0%, ${c1} 100%)`, color: fg }}
    >
      {/* topo: logo ou nome */}
      <div className="flex items-center gap-2">
        {formData.logo_url ? (
          <img src={formData.logo_url} alt="" className="w-8 h-8 rounded-lg object-contain bg-white/15 p-0.5" />
        ) : null}
        <span className="text-[11px] font-semibold tracking-wide" style={{ opacity: 0.85, fontFamily: bodyFont }}>
          {formData.name || "Sua marca"}
        </span>
      </div>
      {/* headline de exemplo na fonte de títulos */}
      <div>
        <div className="text-[22px] font-extrabold leading-tight" style={{ fontFamily: headingFont }}>
          5 sinais de hipertensão que seus pacientes ignoram
        </div>
        <div className="text-[12px] mt-2" style={{ fontFamily: bodyFont, opacity: 0.85 }}>
          Conteúdo gerado com o estilo da sua marca.
        </div>
      </div>
      {/* rodapé: chip de acento + swatches */}
      <div className="flex items-center justify-between">
        <span
          className="text-[10px] font-bold px-2.5 py-1 rounded-full"
          style={{ background: accent, color: pickTextColor(accent) }}
        >
          Saiba mais →
        </span>
        <div className="flex gap-1">
          {palette.slice(0, 4).map((hex, i) => (
            <span key={i} className="w-3 h-3 rounded-full border border-white/40" style={{ background: hex }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function VisualPrefToggle({ label, description, value, onChange }: {
  label: string; description: string; value: boolean | null; onChange: (v: boolean | null) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        // Cycle: null (não definido) â†’ true (sim) â†’ false (não) â†’ null
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
