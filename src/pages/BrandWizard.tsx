import { useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useCreateBrand } from "@/hooks/useStudio";
import { VISUAL_TONES } from "@/types/studio";
import BrandExamples from "@/components/studio/BrandExamples";
import {
  ArrowLeft, ArrowRight, Plus, X, Loader2, Upload, Sparkles, Check,
  Image as ImageIcon, Palette, Type, FileImage,
} from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { id: 1, label: "Nome & Logo", icon: Type },
  { id: 2, label: "Paleta & Fontes", icon: Palette },
  { id: 3, label: "Exemplos Visuais", icon: FileImage },
  { id: 4, label: "Gerar Estilos", icon: Sparkles },
];

export default function BrandWizard() {
  const navigate = useNavigate();
  const createBrand = useCreateBrand();
  const [step, setStep] = useState(1);
  const [brandId, setBrandId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    visual_tone: "clean",
    palette: ["#6366f1", "#ec4899", "#f59e0b"],
    fonts: { headings: "Inter", body: "Inter" },
    do_rules: "",
    dont_rules: "",
    logo_url: "",
  });

  const handleCreateBrand = async () => {
    if (!formData.name) { toast.error("Nome é obrigatório"); return; }
    try {
      const result = await createBrand.mutateAsync(formData);
      setBrandId(result.id);
      toast.success("Marca criada!");
      setStep(2);
    } catch (err: any) {
      toast.error("Erro: " + (err.message || "Tente novamente"));
    }
  };

  const handleSaveDetails = async () => {
    if (!brandId) return;
    try {
      await supabase.from("brands").update({
        palette: formData.palette as any,
        fonts: formData.fonts as any,
        visual_tone: formData.visual_tone,
        do_rules: formData.do_rules || null,
        dont_rules: formData.dont_rules || null,
      }).eq("id", brandId);
      toast.success("Detalhes salvos!");
      setStep(3);
    } catch (err: any) {
      toast.error("Erro ao salvar");
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) throw new Error("Não autenticado");
      const ext = file.name.split(".").pop();
      const path = `brands/${Date.now()}-logo.${ext}`;
      const { error } = await supabase.storage.from("content-images").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("content-images").getPublicUrl(path);
      setFormData(prev => ({ ...prev, logo_url: urlData.publicUrl }));
      toast.success("Logo enviado!");
    } catch (err: any) {
      toast.error("Erro no upload");
    } finally {
      setUploading(false);
    }
  };

  const handleGenerateStyles = async () => {
    if (!brandId) return;
    setAnalyzing(true);
    try {
      // Step 1: Analyze examples
      const { error: aErr } = await supabase.functions.invoke("analyze-brand-examples", { body: { brandId } });
      if (aErr) throw aErr;
      toast.success("Style Guide gerado!");

      // Step 2: Generate template sets
      setGenerating(true);
      const { error: gErr } = await supabase.functions.invoke("generate-template-sets", { body: { brandId } });
      if (gErr) throw gErr;
      toast.success("Estilos gerados com sucesso!");
      setStep(5); // done
    } catch (err: any) {
      toast.error("Erro: " + (err.message || "Tente novamente"));
    } finally {
      setAnalyzing(false);
      setGenerating(false);
    }
  };

  const updatePaletteColor = (index: number, color: string) => {
    const p = [...formData.palette];
    p[index] = color;
    setFormData(prev => ({ ...prev, palette: p }));
  };

  const addColor = () => {
    if (formData.palette.length < 6) setFormData(prev => ({ ...prev, palette: [...prev.palette, "#000000"] }));
  };

  const removeColor = (index: number) => {
    if (formData.palette.length > 1) setFormData(prev => ({ ...prev, palette: prev.palette.filter((_, i) => i !== index) }));
  };

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/brands")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-heading font-bold text-foreground">Criar Nova Marca</h1>
            <p className="text-muted-foreground">Siga os passos para configurar sua identidade visual</p>
          </div>
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2 flex-1">
              <div className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all flex-1",
                step === s.id ? "bg-primary text-primary-foreground" :
                step > s.id || step === 5 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
              )}>
                {step > s.id || step === 5 ? <Check className="w-4 h-4" /> : <s.icon className="w-4 h-4" />}
                <span className="hidden sm:inline">{s.label}</span>
              </div>
              {i < STEPS.length - 1 && <div className="w-4 h-px bg-border" />}
            </div>
          ))}
        </div>

        {/* Step 1: Name & Logo */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Nome & Logo</CardTitle>
              <CardDescription>Defina o nome da marca e envie o logo (opcional)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Nome da Marca *</Label>
                <Input value={formData.name} onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))} placeholder="Ex: Heart Surgery" />
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
                    <Button variant="outline" size="sm" asChild disabled={uploading}>
                      <span>{uploading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Upload className="w-4 h-4 mr-1" />}Enviar Logo</span>
                    </Button>
                    <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                  </label>
                </div>
              </div>
              <div className="flex justify-end pt-4">
                <Button onClick={handleCreateBrand} disabled={!formData.name || createBrand.isPending}>
                  {createBrand.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Próximo <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Palette & Fonts */}
        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Paleta & Fontes</CardTitle>
              <CardDescription>Configure cores e tipografia (pode ajustar depois)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Tom Visual</Label>
                <Select value={formData.visual_tone} onValueChange={v => setFormData(prev => ({ ...prev, visual_tone: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {VISUAL_TONES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Paleta de Cores</Label>
                  {formData.palette.length < 6 && <Button variant="ghost" size="sm" onClick={addColor}><Plus className="w-4 h-4" /></Button>}
                </div>
                <div className="space-y-2">
                  {formData.palette.map((color, i) => (
                    <div key={i} className="flex items-center gap-2 group">
                      <input type="color" value={color} onChange={e => updatePaletteColor(i, e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer border-2 border-border" />
                      <Input value={color} onChange={e => { if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value) || e.target.value === "") updatePaletteColor(i, e.target.value); }} className="font-mono text-sm w-28" maxLength={7} />
                      {formData.palette.length > 1 && (
                        <Button variant="ghost" size="icon" onClick={() => removeColor(i)} className="opacity-0 group-hover:opacity-100 h-8 w-8"><X className="w-4 h-4 text-destructive" /></Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Fonte Títulos</Label>
                  <Input value={formData.fonts.headings} onChange={e => setFormData(prev => ({ ...prev, fonts: { ...prev.fonts, headings: e.target.value } }))} placeholder="Inter" />
                </div>
                <div className="space-y-2">
                  <Label>Fonte Corpo</Label>
                  <Input value={formData.fonts.body} onChange={e => setFormData(prev => ({ ...prev, fonts: { ...prev.fonts, body: e.target.value } }))} placeholder="Inter" />
                </div>
              </div>
              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setStep(1)}>Voltar</Button>
                <Button onClick={handleSaveDetails}>Próximo <ArrowRight className="w-4 h-4 ml-2" /></Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Visual Examples */}
        {step === 3 && brandId && (
          <Card>
            <CardHeader>
              <CardTitle>Exemplos Visuais</CardTitle>
              <CardDescription>Faça upload de exemplos de posts, stories e carrosséis da sua marca</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <BrandExamples brandId={brandId} brandName={formData.name} onAnalyzeStyle={() => {}} isAnalyzing={false} />
              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setStep(2)}>Voltar</Button>
                <Button onClick={() => setStep(4)}>Próximo <ArrowRight className="w-4 h-4 ml-2" /></Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 4: Generate Styles */}
        {step === 4 && brandId && (
          <Card>
            <CardHeader>
              <CardTitle>Gerar Estilos da Marca</CardTitle>
              <CardDescription>A IA vai analisar seus exemplos e criar estilos visuais automaticamente</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="text-center py-8">
                <Sparkles className="w-16 h-16 text-primary mx-auto mb-4" />
                <p className="text-foreground font-medium mb-2">Tudo pronto!</p>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Clique no botão abaixo para analisar seus exemplos visuais e gerar estilos automáticos baseados na identidade da sua marca.
                </p>
              </div>
              {(analyzing || generating) && (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {analyzing && !generating && "Analisando exemplos..."}
                  {generating && "Gerando estilos..."}
                </div>
              )}
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(3)} disabled={analyzing || generating}>Voltar</Button>
                <Button onClick={handleGenerateStyles} disabled={analyzing || generating} className="gap-2">
                  {(analyzing || generating) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Gerar Estilos da Marca
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 5: Done */}
        {step === 5 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 space-y-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Check className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-xl font-heading font-bold text-foreground">Marca configurada!</h3>
              <p className="text-muted-foreground text-center max-w-md">
                Seus estilos foram gerados. Agora você pode usar essa marca para gerar conteúdos no Dashboard ou Studio.
              </p>
              <div className="flex gap-3 pt-4">
                <Button variant="outline" onClick={() => navigate(`/brands/${brandId}/edit`)}>Editar Marca</Button>
                <Button onClick={() => navigate("/dashboard")}>Ir para o Dashboard</Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
