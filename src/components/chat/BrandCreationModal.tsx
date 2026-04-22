import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useCreateBrand, useUpdateBrand } from "@/hooks/useStudio";
import { VISUAL_TONES } from "@/types/studio";
import BrandExamples from "@/components/studio/BrandExamples";
import BrandPhotoBackgrounds from "@/components/studio/BrandPhotoBackgrounds";
import { Plus, X, Upload, Loader2, Image as ImageIcon, Sparkles, Lock } from "lucide-react";

const FONT_OPTIONS = [
  "Inter", "Roboto", "Open Sans", "Lato", "Montserrat", "Poppins",
  "Raleway", "Nunito", "Oswald", "Playfair Display", "Merriweather",
  "PT Sans", "Source Sans Pro", "Ubuntu", "Mulish", "Quicksand",
  "Josefin Sans", "Exo 2", "Titillium Web", "DM Sans",
  "Bebas Neue", "Anton", "Pacifico", "Dancing Script", "Lobster",
  "Abril Fatface", "Cinzel", "Cormorant Garamond", "EB Garamond",
];

const CREATION_MODE_TO_STYLE: Record<string, string | null> = {
  photo_backgrounds: "photo_overlay",
  style_copy: "ai_background",
  inspired: "ai_background",
  from_scratch: null,
};

const PRESETS = [
  { id: "minimalista", label: "Minimalista", emoji: "⚪", visual_tone: "clean", palette: ["#FFFFFF", "#1A1A2E", "#E2E2E2"] },
  { id: "colorido", label: "Colorido", emoji: "🎨", visual_tone: "playful", palette: ["#FF6B6B", "#4ECDC4", "#FFE66D", "#2C3E50"] },
  { id: "sofisticado", label: "Sofisticado", emoji: "✨", visual_tone: "luxury", palette: ["#1A1A2E", "#C9A96E", "#F5F5F0"] },
  { id: "moderno", label: "Moderno", emoji: "💎", visual_tone: "tech", palette: ["#0F0F23", "#00D4FF", "#7B2FFF", "#FFFFFF"] },
  { id: "organico", label: "Orgânico", emoji: "🌿", visual_tone: "organic", palette: ["#5D4E37", "#8B9D77", "#F5E6D3", "#2D3B2D"] },
];

const INITIAL_FORM = {
  name: "",
  logo_url: "",
  visual_tone: "clean",
  creation_mode: "style_copy" as string,
  palette: ["#6366f1", "#ec4899", "#f59e0b"] as string[],
  fonts: { headings: "Inter", body: "Inter" },
  do_rules: "",
  dont_rules: "",
  visual_preferences: {
    phone_mockup: null as boolean | null,
    body_in_card: null as boolean | null,
    inner_frame: null as boolean | null,
    waves: null as boolean | null,
    abstract_elements: null as boolean | null,
    preferred_bg_mode: null as string | null,
    custom_notes: "",
  },
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (brandId: string) => void;
}

export default function BrandCreationModal({ open, onOpenChange, onCreated }: Props) {
  const createBrand = useCreateBrand();
  const updateBrand = useUpdateBrand();
  const [brandId, setBrandId] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [tab, setTab] = useState<"identity" | "generation" | "images">("identity");
  const [formData, setFormData] = useState(INITIAL_FORM);

  const resetAll = () => {
    setBrandId(null);
    setTab("identity");
    setFormData(INITIAL_FORM);
  };

  const closeAndReset = () => {
    const createdId = brandId;
    onOpenChange(false);
    if (createdId && onCreated) onCreated(createdId);
    setTimeout(resetAll, 250);
  };

  const handleDialogOpenChange = (next: boolean) => {
    if (!next) closeAndReset();
    else onOpenChange(true);
  };

  const handleLogoUpload = async (file: File) => {
    setUploadingLogo(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `brands/${Date.now()}-logo.${ext}`;
      const { error } = await supabase.storage.from("content-images").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("content-images").getPublicUrl(path);
      const url = urlData.publicUrl;
      setFormData(prev => ({ ...prev, logo_url: url }));
      if (brandId) {
        await supabase.from("brands").update({ logo_url: url }).eq("id", brandId);
      }
      toast.success("Logo enviado!");
    } catch (err: any) {
      toast.error("Erro no upload: " + (err.message || "Tente novamente"));
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleCreate = async () => {
    if (!formData.name.trim()) {
      toast.error("Nome é obrigatório");
      setTab("identity");
      return;
    }
    try {
      const result = await createBrand.mutateAsync({
        name: formData.name.trim(),
        palette: formData.palette as any,
        fonts: formData.fonts as any,
        visual_tone: formData.visual_tone,
        do_rules: formData.do_rules || null,
        dont_rules: formData.dont_rules || null,
        logo_url: formData.logo_url || null,
        creation_mode: formData.creation_mode,
        default_visual_style: CREATION_MODE_TO_STYLE[formData.creation_mode],
        visual_preferences: formData.visual_preferences,
      } as any);
      setBrandId(result.id);

      if (formData.creation_mode === "from_scratch") {
        closeAndReset();
      } else {
        setTab("images");
      }
    } catch (err: any) {
      toast.error("Erro ao criar marca: " + (err.message || "Tente novamente"));
    }
  };

  const handleSaveChanges = async () => {
    if (!brandId) return;
    try {
      await updateBrand.mutateAsync({
        id: brandId,
        name: formData.name.trim(),
        palette: formData.palette as any,
        fonts: formData.fonts as any,
        visual_tone: formData.visual_tone,
        do_rules: formData.do_rules || null,
        dont_rules: formData.dont_rules || null,
        logo_url: formData.logo_url || null,
        creation_mode: formData.creation_mode,
        default_visual_style: CREATION_MODE_TO_STYLE[formData.creation_mode],
        visual_preferences: formData.visual_preferences,
      } as any);
    } catch (err: any) {
      toast.error("Erro ao salvar: " + (err.message || "Tente novamente"));
    }
  };

  const handleAnalyzeStyle = async () => {
    if (!brandId) return;
    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-brand-examples", { body: { brandId } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("Style Guide gerado!", {
        description: `Preset: ${(data as any)?.styleGuide?.style_preset || "detectado"}`,
      });
    } catch (err: any) {
      toast.error("Erro ao analisar: " + (err.message || "Tente novamente"));
    } finally {
      setAnalyzing(false);
    }
  };

  const applyPreset = (preset: typeof PRESETS[0]) => {
    setFormData(prev => ({
      ...prev,
      visual_tone: preset.visual_tone,
      palette: [...preset.palette],
    }));
    toast.success(`Preset "${preset.label}" aplicado!`);
  };

  const updatePaletteColor = (index: number, color: string) => {
    setFormData(prev => {
      const p = [...prev.palette];
      p[index] = color;
      return { ...prev, palette: p };
    });
  };

  const addColor = () => {
    if (formData.palette.length < 6) {
      setFormData(prev => ({ ...prev, palette: [...prev.palette, "#000000"] }));
    }
  };

  const removeColor = (index: number) => {
    if (formData.palette.length > 1) {
      setFormData(prev => ({ ...prev, palette: prev.palette.filter((_, i) => i !== index) }));
    }
  };

  const imagesTabDisabled = !brandId || formData.creation_mode === "from_scratch";
  const creating = createBrand.isPending;
  const saving = updateBrand.isPending;

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            {brandId ? `Marca "${formData.name}" criada — adicione imagens` : "Criar Nova Marca"}
          </DialogTitle>
          <DialogDescription>
            {brandId
              ? formData.creation_mode === "photo_backgrounds"
                ? "Envie suas fotos pessoais para usar como fundo dos posts."
                : "Envie exemplos de posts do seu estilo para a IA analisar."
              : "Configure sua identidade visual. Você poderá ajustar tudo depois."}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="identity">Identidade</TabsTrigger>
            <TabsTrigger value="generation">Regras para IA</TabsTrigger>
            <TabsTrigger value="images" disabled={imagesTabDisabled}>
              {imagesTabDisabled && !brandId ? <Lock className="w-3 h-3 mr-1" /> : null}
              Imagens
            </TabsTrigger>
          </TabsList>

          {/* ── Tab 1: Identidade ── */}
          <TabsContent value="identity" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Nome da Marca *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))}
                placeholder="Ex: Pulse Care"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label>Logo (opcional)</Label>
              <div className="flex items-center gap-4">
                {formData.logo_url ? (
                  <img src={formData.logo_url} alt="Logo" className="w-16 h-16 object-contain rounded-lg border border-border" />
                ) : (
                  <div className="w-16 h-16 rounded-lg border-2 border-dashed border-border flex items-center justify-center">
                    <ImageIcon className="w-6 h-6 text-muted-foreground" />
                  </div>
                )}
                <label className="cursor-pointer">
                  <Button type="button" variant="outline" size="sm" asChild disabled={uploadingLogo}>
                    <span>
                      {uploadingLogo ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Upload className="w-4 h-4 mr-1" />}
                      Enviar Logo
                    </span>
                  </Button>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleLogoUpload(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Modo de Criação</Label>
              <p className="text-xs text-muted-foreground">Define como a IA usa referências visuais ao gerar conteúdo.</p>
              <Select value={formData.creation_mode} onValueChange={(v) => setFormData(p => ({ ...p, creation_mode: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="photo_backgrounds">📸 Fotos pessoais como fundo</SelectItem>
                  <SelectItem value="style_copy">🎨 Copiar estilo de referências (recomendado)</SelectItem>
                  <SelectItem value="inspired">💡 Inspirado em referências</SelectItem>
                  <SelectItem value="from_scratch">✨ Criar do zero (sem referências)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Tom Visual</Label>
              <Select value={formData.visual_tone} onValueChange={(v) => setFormData(p => ({ ...p, visual_tone: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VISUAL_TONES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Aplicar preset rápido</Label>
              <p className="text-xs text-muted-foreground">Substitui paleta e tom atuais por um estilo pronto.</p>
              <div className="grid grid-cols-5 gap-2">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className="p-2 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 text-xs flex flex-col items-center gap-1 transition-colors"
                  >
                    <span className="text-base">{preset.emoji}</span>
                    <span className="font-medium">{preset.label}</span>
                    <div className="flex gap-0.5 mt-1">
                      {preset.palette.slice(0, 3).map((c, i) => (
                        <span key={i} className="w-2 h-2 rounded-full border border-border/50" style={{ backgroundColor: c }} />
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Paleta de Cores</Label>
                {formData.palette.length < 6 && (
                  <Button type="button" variant="ghost" size="sm" onClick={addColor}>
                    <Plus className="w-4 h-4" />
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                {formData.palette.map((color, i) => (
                  <div key={i} className="flex items-center gap-2 group">
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => updatePaletteColor(i, e.target.value)}
                      className="w-10 h-10 rounded-lg cursor-pointer border-2 border-border flex-shrink-0"
                    />
                    <Input
                      value={color}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (/^#[0-9A-Fa-f]{0,6}$/.test(val) || val === "") updatePaletteColor(i, val);
                      }}
                      placeholder="#000000"
                      className="font-mono text-sm w-28"
                      maxLength={7}
                    />
                    {formData.palette.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeColor(i)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8"
                      >
                        <X className="w-4 h-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Fontes</Label>
              <p className="text-xs text-muted-foreground">Usadas nos textos sobrepostos nas imagens.</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Títulos</Label>
                  <Select
                    value={formData.fonts.headings}
                    onValueChange={(v) => setFormData(p => ({ ...p, fonts: { ...p.fonts, headings: v } }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FONT_OPTIONS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Corpo</Label>
                  <Select
                    value={formData.fonts.body}
                    onValueChange={(v) => setFormData(p => ({ ...p, fonts: { ...p.fonts, body: v } }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FONT_OPTIONS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ── Tab 2: Regras para IA ── */}
          <TabsContent value="generation" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>✅ O que a IA DEVE fazer</Label>
              <p className="text-xs text-muted-foreground">Regras positivas a seguir em toda geração.</p>
              <Textarea
                value={formData.do_rules}
                onChange={(e) => setFormData(p => ({ ...p, do_rules: e.target.value }))}
                placeholder={"Ex: usar linguagem próxima, headlines curtos, sempre mencionar a marca..."}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>🚫 O que a IA NÃO deve fazer</Label>
              <p className="text-xs text-muted-foreground">Regras do que evitar.</p>
              <Textarea
                value={formData.dont_rules}
                onChange={(e) => setFormData(p => ({ ...p, dont_rules: e.target.value }))}
                placeholder={"Ex: não usar jargões técnicos, não citar concorrentes, nada de CAPS LOCK..."}
                rows={3}
              />
            </div>

            <div className="border-t border-border pt-4 space-y-4">
              <div>
                <Label>🎨 Preferências visuais</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Toque para alternar: ✅ sim / 🚫 não / ➖ sem preferência.</p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <VisualPrefToggle
                  label="Mockup de celular"
                  description="Incluir mockup de dispositivo"
                  value={formData.visual_preferences.phone_mockup}
                  onChange={(v) => setFormData(p => ({ ...p, visual_preferences: { ...p.visual_preferences, phone_mockup: v } }))}
                />
                <VisualPrefToggle
                  label="Texto em card"
                  description="Texto dentro de caixas/cards"
                  value={formData.visual_preferences.body_in_card}
                  onChange={(v) => setFormData(p => ({ ...p, visual_preferences: { ...p.visual_preferences, body_in_card: v } }))}
                />
                <VisualPrefToggle
                  label="Moldura decorativa"
                  description="Moldura/borda interna"
                  value={formData.visual_preferences.inner_frame}
                  onChange={(v) => setFormData(p => ({ ...p, visual_preferences: { ...p.visual_preferences, inner_frame: v } }))}
                />
                <VisualPrefToggle
                  label="Ondas/curvas"
                  description="Elementos ondulados"
                  value={formData.visual_preferences.waves}
                  onChange={(v) => setFormData(p => ({ ...p, visual_preferences: { ...p.visual_preferences, waves: v } }))}
                />
                <VisualPrefToggle
                  label="Formas abstratas"
                  description="Geometria decorativa"
                  value={formData.visual_preferences.abstract_elements}
                  onChange={(v) => setFormData(p => ({ ...p, visual_preferences: { ...p.visual_preferences, abstract_elements: v } }))}
                />
              </div>

              <div className="space-y-2">
                <Label>Fundo preferido</Label>
                <Select
                  value={formData.visual_preferences.preferred_bg_mode || "none"}
                  onValueChange={(v) => setFormData(p => ({
                    ...p,
                    visual_preferences: { ...p.visual_preferences, preferred_bg_mode: v === "none" ? null : v },
                  }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem preferência</SelectItem>
                    <SelectItem value="gradient">Gradiente</SelectItem>
                    <SelectItem value="photo">Foto</SelectItem>
                    <SelectItem value="solid">Cor sólida</SelectItem>
                    <SelectItem value="illustration">Ilustração</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>📝 Instruções extras para a IA (imagens)</Label>
                <p className="text-xs text-muted-foreground">Texto livre enviado ao gerador. Descreva o estilo que você quer.</p>
                <Textarea
                  value={formData.visual_preferences.custom_notes}
                  onChange={(e) => setFormData(p => ({
                    ...p,
                    visual_preferences: { ...p.visual_preferences, custom_notes: e.target.value },
                  }))}
                  placeholder={"Ex: minimalista, fundo escuro com detalhes dourados, headlines na parte inferior..."}
                  rows={3}
                />
              </div>
            </div>
          </TabsContent>

          {/* ── Tab 3: Imagens ── */}
          <TabsContent value="images" className="space-y-4 pt-4">
            {!brandId ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                Salve a marca primeiro para poder enviar imagens.
              </div>
            ) : formData.creation_mode === "photo_backgrounds" ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Fotos que serão usadas como fundo dos posts. Ideal para fotos profissionais.
                </p>
                <BrandPhotoBackgrounds brandId={brandId} />
              </div>
            ) : formData.creation_mode === "style_copy" || formData.creation_mode === "inspired" ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Envie 3+ exemplos de posts do seu estilo. A IA vai analisar e copiar o estilo visual.
                </p>
                <BrandExamples
                  brandId={brandId}
                  brandName={formData.name}
                  onAnalyzeStyle={handleAnalyzeStyle}
                  isAnalyzing={analyzing}
                />
              </div>
            ) : (
              <div className="text-center py-8 text-sm text-muted-foreground">
                Modo "Do zero" não usa imagens de referência.
              </div>
            )}
          </TabsContent>
        </Tabs>

        <div className="flex justify-between items-center pt-4 border-t border-border">
          <Button variant="ghost" onClick={closeAndReset}>
            {brandId ? "Fechar" : "Cancelar"}
          </Button>
          {!brandId ? (
            <Button onClick={handleCreate} disabled={!formData.name.trim() || creating}>
              {creating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
              Criar marca
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleSaveChanges} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Salvar alterações
              </Button>
              <Button onClick={closeAndReset}>
                Concluir
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function VisualPrefToggle({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean | null;
  onChange: (v: boolean | null) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => {
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
        {value === true ? "✅" : value === false ? "🚫" : "➖"}
      </span>
      <div>
        <p
          className={`text-xs font-medium ${
            value === true ? "text-green-700" : value === false ? "text-red-600" : "text-muted-foreground"
          }`}
        >
          {label}
        </p>
        <p className="text-[10px] text-muted-foreground leading-relaxed">{description}</p>
      </div>
    </button>
  );
}
