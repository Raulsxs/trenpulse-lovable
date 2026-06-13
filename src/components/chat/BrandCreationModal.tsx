import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useCreateBrand } from "@/hooks/useStudio";
import BrandExamples from "@/components/brand/BrandExamples";
import BrandPhotoBackgrounds from "@/components/brand/BrandPhotoBackgrounds";
import {
  Plus, X, Upload, Loader2, Image as ImageIcon, Sparkles, ArrowLeft, ArrowRight,
  Check, ChevronDown, Camera, Palette as PaletteIcon, Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const CREATION_MODE_TO_STYLE: Record<string, string | null> = {
  photo_backgrounds: "photo_overlay",
  style_copy: "ai_background",
  from_scratch: null,
};

// A decisão central, enquadrada por OUTCOME (a pessoa escolhe pela situação dela, não pelo jargão).
const MODES = [
  {
    id: "photo_backgrounds", icon: Camera, title: "Apareço nas minhas fotos",
    desc: "Suas fotos viram o fundo dos posts, com o texto por cima.",
    who: "Coach, médico, advogado — quem mostra o rosto.",
  },
  {
    id: "style_copy", icon: PaletteIcon, title: "Já tenho um estilo",
    desc: "Você envia posts que já curte e a IA replica o visual.",
    who: "Quem já tem identidade ou referências que gosta.",
  },
  {
    id: "from_scratch", icon: Wand2, title: "Começar do zero",
    desc: "Você escolhe as cores e a IA cria a arte livremente.",
    who: "Quem está começando agora.",
  },
];

const PRESETS = [
  { id: "minimalista", label: "Minimalista", visual_tone: "clean", palette: ["#FFFFFF", "#1A1A2E", "#E2E2E2"] },
  { id: "colorido", label: "Colorido", visual_tone: "playful", palette: ["#FF6B6B", "#4ECDC4", "#FFE66D", "#2C3E50"] },
  { id: "sofisticado", label: "Sofisticado", visual_tone: "luxury", palette: ["#1A1A2E", "#C9A96E", "#F5F5F0"] },
  { id: "moderno", label: "Moderno", visual_tone: "tech", palette: ["#0F0F23", "#00D4FF", "#7B2FFF", "#FFFFFF"] },
  { id: "organico", label: "Orgânico", visual_tone: "organic", palette: ["#5D4E37", "#8B9D77", "#F5E6D3", "#2D3B2D"] },
];

const FONT_OPTIONS = [
  "Inter", "Roboto", "Montserrat", "Poppins", "Raleway", "Playfair Display",
  "Oswald", "Bebas Neue", "Anton", "DM Sans", "Lato", "Open Sans",
];

const INITIAL_FORM = {
  name: "",
  logo_url: "",
  visual_tone: "clean",
  creation_mode: "" as string,
  palette: ["#6366f1", "#ec4899", "#f59e0b"] as string[],
  fonts: { headings: "Inter", body: "Inter" },
  do_rules: "",
  dont_rules: "",
  visual_preferences: { custom_notes: "" } as Record<string, any>,
};

type Step = "choose" | "setup" | "images";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (brandId: string) => void;
}

export default function BrandCreationModal({ open, onOpenChange, onCreated }: Props) {
  const createBrand = useCreateBrand();
  const [brandId, setBrandId] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [step, setStep] = useState<Step>("choose");
  const [formData, setFormData] = useState(INITIAL_FORM);

  const mode = MODES.find((m) => m.id === formData.creation_mode);

  const resetAll = () => {
    setBrandId(null);
    setStep("choose");
    setAdvanced(false);
    setFormData(INITIAL_FORM);
  };
  const closeAndReset = () => {
    const createdId = brandId;
    onOpenChange(false);
    if (createdId && onCreated) onCreated(createdId);
    setTimeout(resetAll, 250);
  };
  const handleDialogOpenChange = (next: boolean) => { if (!next) closeAndReset(); else onOpenChange(true); };

  const handleLogoUpload = async (file: File) => {
    setUploadingLogo(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `brands/${Date.now()}-logo.${ext}`;
      const { error } = await supabase.storage.from("content-images").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("content-images").getPublicUrl(path);
      setFormData((prev) => ({ ...prev, logo_url: urlData.publicUrl }));
      toast.success("Logo enviado!");
    } catch (err: any) {
      toast.error("Erro no upload: " + (err.message || "Tente novamente"));
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleCreate = async () => {
    if (!formData.name.trim()) { toast.error("Dê um nome pra sua marca"); return; }
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
        toast.success("Marca criada! Já pode gerar com ela.");
        closeAndReset();
      } else {
        setStep("images");
      }
    } catch (err: any) {
      toast.error("Erro ao criar marca: " + (err.message || "Tente novamente"));
    }
  };

  const handleAnalyzeStyle = async () => {
    if (!brandId) return;
    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-brand-examples", { body: { brandId } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("Estilo analisado! A IA já aprendeu sua cara.");
    } catch (err: any) {
      toast.error("Erro ao analisar: " + (err.message || "Tente novamente"));
    } finally {
      setAnalyzing(false);
    }
  };

  const applyPreset = (preset: typeof PRESETS[0]) => {
    setFormData((prev) => ({ ...prev, visual_tone: preset.visual_tone, palette: [...preset.palette] }));
  };
  const updatePaletteColor = (i: number, color: string) =>
    setFormData((prev) => { const p = [...prev.palette]; p[i] = color; return { ...prev, palette: p }; });
  const addColor = () => formData.palette.length < 6 && setFormData((prev) => ({ ...prev, palette: [...prev.palette, "#000000"] }));
  const removeColor = (i: number) => formData.palette.length > 1 && setFormData((prev) => ({ ...prev, palette: prev.palette.filter((_, idx) => idx !== i) }));

  const creating = createBrand.isPending;

  // Progresso: 1 escolher · 2 configurar · 3 (condicional) imagens
  const stepNum = step === "choose" ? 1 : step === "setup" ? 2 : 3;
  const totalSteps = formData.creation_mode === "from_scratch" ? 2 : 3;

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            {step !== "choose" && !brandId && (
              <button onClick={() => setStep("choose")} className="text-muted-foreground hover:text-foreground">
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <DialogTitle className="flex items-center gap-2 text-base">
              <Sparkles className="w-4 h-4 text-primary" />
              {step === "choose" ? "Vamos criar sua marca" : step === "setup" ? "Quase lá" : "Última etapa"}
            </DialogTitle>
          </div>
          {/* Stepper de progresso — a pessoa sabe onde está e quanto falta */}
          <div className="flex items-center gap-1.5 pt-1">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div key={i} className={cn("h-1 rounded-full flex-1 transition-colors", i < stepNum ? "bg-primary" : "bg-muted")} />
            ))}
          </div>
        </DialogHeader>

        {/* ── STEP 1: a decisão que importa, por outcome ── */}
        {step === "choose" && (
          <div className="space-y-2.5 pt-1">
            <p className="text-sm text-muted-foreground">Como você quer que a IA crie suas artes?</p>
            {MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => { setFormData((p) => ({ ...p, creation_mode: m.id })); setStep("setup"); }}
                className="w-full flex items-start gap-3 rounded-xl border border-border p-3.5 text-left hover:border-primary/50 hover:bg-primary/[0.03] transition-colors group"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/15">
                  <m.icon className="w-5 h-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm">{m.title}</div>
                  <div className="text-xs text-muted-foreground leading-snug mt-0.5">{m.desc}</div>
                  <div className="text-[11px] text-muted-foreground/70 mt-1">{m.who}</div>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary self-center shrink-0" />
              </button>
            ))}
          </div>
        )}

        {/* ── STEP 2: mínimo necessário (nome + cores), resto colapsado ── */}
        {step === "setup" && (
          <div className="space-y-4 pt-1">
            {mode && (
              <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs">
                <mode.icon className="w-4 h-4 text-primary shrink-0" />
                <span className="text-muted-foreground"><b className="text-foreground">{mode.title}</b> — {mode.desc}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-sm">Nome da marca</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                placeholder="Ex: Dr. Maikon"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && formData.name.trim() && handleCreate()}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Cores</Label>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => applyPreset(preset)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs hover:border-primary/40 transition-colors"
                  >
                    <span className="flex">
                      {preset.palette.slice(0, 3).map((c, i) => (
                        <span key={i} className="w-3 h-3 rounded-full border border-background -ml-0.5 first:ml-0" style={{ backgroundColor: c }} />
                      ))}
                    </span>
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5 pt-1">
                {formData.palette.map((color, i) => (
                  <div key={i} className="relative group">
                    <input
                      type="color" value={color}
                      onChange={(e) => updatePaletteColor(i, e.target.value)}
                      className="w-8 h-8 rounded-md cursor-pointer border border-border"
                    />
                    {formData.palette.length > 1 && (
                      <button onClick={() => removeColor(i)} className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-background border border-border opacity-0 group-hover:opacity-100 flex items-center justify-center">
                        <X className="w-2.5 h-2.5 text-destructive" />
                      </button>
                    )}
                  </div>
                ))}
                {formData.palette.length < 6 && (
                  <button onClick={addColor} className="w-8 h-8 rounded-md border border-dashed border-border flex items-center justify-center text-muted-foreground hover:border-primary/40">
                    <Plus className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Avançado — progressive disclosure: fica fora do caminho de quem só quer o básico */}
            <div className="border-t border-border/60 pt-2">
              <button onClick={() => setAdvanced((a) => !a)} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
                <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", advanced && "rotate-180")} />
                Ajustes avançados (opcional)
              </button>
              {advanced && (
                <div className="space-y-3 pt-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Logo (opcional)</Label>
                    <div className="flex items-center gap-3">
                      {formData.logo_url ? (
                        <img src={formData.logo_url} alt="" className="w-12 h-12 object-contain rounded-lg border border-border" />
                      ) : (
                        <div className="w-12 h-12 rounded-lg border-2 border-dashed border-border flex items-center justify-center">
                          <ImageIcon className="w-5 h-5 text-muted-foreground" />
                        </div>
                      )}
                      <label className="cursor-pointer">
                        <Button type="button" variant="outline" size="sm" asChild disabled={uploadingLogo}>
                          <span>{uploadingLogo ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Upload className="w-3.5 h-3.5 mr-1" />}Enviar</span>
                        </Button>
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); e.target.value = ""; }} />
                      </label>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Fonte títulos</Label>
                      <Select value={formData.fonts.headings} onValueChange={(v) => setFormData((p) => ({ ...p, fonts: { ...p.fonts, headings: v } }))}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{FONT_OPTIONS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Fonte corpo</Label>
                      <Select value={formData.fonts.body} onValueChange={(v) => setFormData((p) => ({ ...p, fonts: { ...p.fonts, body: v } }))}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{FONT_OPTIONS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Instruções pra IA (opcional)</Label>
                    <Textarea
                      value={formData.visual_preferences.custom_notes}
                      onChange={(e) => setFormData((p) => ({ ...p, visual_preferences: { ...p.visual_preferences, custom_notes: e.target.value } }))}
                      placeholder="Ex: fundo escuro com detalhes dourados, headlines embaixo, nada de CAPS LOCK..."
                      rows={2}
                      className="text-xs"
                    />
                  </div>
                </div>
              )}
            </div>

            <Button onClick={handleCreate} disabled={!formData.name.trim() || creating} className="w-full gap-2">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {formData.creation_mode === "from_scratch" ? "Criar marca" : "Criar e adicionar imagens"}
            </Button>
          </div>
        )}

        {/* ── STEP 3: imagens (condicional ao modo) ── */}
        {step === "images" && brandId && (
          <div className="space-y-3 pt-1">
            {formData.creation_mode === "photo_backgrounds" ? (
              <>
                <p className="text-sm text-muted-foreground">Envie suas fotos. Elas viram o fundo dos posts — a IA preserva você e escreve por cima.</p>
                <BrandPhotoBackgrounds brandId={brandId} />
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">Envie <b className="text-foreground">3 ou mais</b> posts do seu estilo. A IA analisa e aprende sua cara.</p>
                <BrandExamples brandId={brandId} brandName={formData.name} onAnalyzeStyle={handleAnalyzeStyle} isAnalyzing={analyzing} />
              </>
            )}
            <Button onClick={closeAndReset} className="w-full">Concluir</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
