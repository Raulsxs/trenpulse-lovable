import { useState, useEffect } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Palette, Plus, Trash2, Edit, Eye, Loader2, Save, Sparkles } from "lucide-react";

interface CustomTemplate {
  id: string;
  name: string;
  description: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  text_color: string;
  font_style: string;
  overlay_opacity: number;
  created_at: string;
}

const fontStyles = [
  { id: "serif", name: "Serifada (Clássica)", preview: "font-serif" },
  { id: "sans", name: "Sans-Serif (Moderna)", preview: "font-sans" },
  { id: "bold", name: "Bold (Impactante)", preview: "font-bold" },
  { id: "light", name: "Light (Elegante)", preview: "font-light" },
];

const presetColors = [
  { name: "Azul Médico", primary: "#0066CC", secondary: "#E6F2FF", accent: "#00A3CC" },
  { name: "Verde Saúde", primary: "#10B981", secondary: "#ECFDF5", accent: "#059669" },
  { name: "Roxo Premium", primary: "#7C3AED", secondary: "#F3E8FF", accent: "#A855F7" },
  { name: "Dourado Luxo", primary: "#F59E0B", secondary: "#FEF3C7", accent: "#D97706" },
  { name: "Rosa Vibrante", primary: "#EC4899", secondary: "#FDF2F8", accent: "#DB2777" },
  { name: "Cinza Moderno", primary: "#374151", secondary: "#F3F4F6", accent: "#6B7280" },
];

const CustomTemplates = () => {
  const [templates, setTemplates] = useState<CustomTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<CustomTemplate | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    primary_color: "#0066CC",
    secondary_color: "#E6F2FF",
    accent_color: "#00A3CC",
    text_color: "#FFFFFF",
    font_style: "sans",
    overlay_opacity: 80,
  });

  // Simulated templates stored in localStorage (since we don't have a custom_templates table)
  useEffect(() => {
    const stored = localStorage.getItem("custom_templates");
    if (stored) {
      setTemplates(JSON.parse(stored));
    }
    setLoading(false);
  }, []);

  const saveToLocalStorage = (updatedTemplates: CustomTemplate[]) => {
    localStorage.setItem("custom_templates", JSON.stringify(updatedTemplates));
    setTemplates(updatedTemplates);
  };

  const handleApplyPreset = (preset: typeof presetColors[0]) => {
    setFormData({
      ...formData,
      primary_color: preset.primary,
      secondary_color: preset.secondary,
      accent_color: preset.accent,
    });
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }

    setSaving(true);

    const newTemplate: CustomTemplate = {
      id: editingTemplate?.id || crypto.randomUUID(),
      name: formData.name,
      description: formData.description,
      primary_color: formData.primary_color,
      secondary_color: formData.secondary_color,
      accent_color: formData.accent_color,
      text_color: formData.text_color,
      font_style: formData.font_style,
      overlay_opacity: formData.overlay_opacity,
      created_at: editingTemplate?.created_at || new Date().toISOString(),
    };

    let updatedTemplates: CustomTemplate[];
    if (editingTemplate) {
      updatedTemplates = templates.map((t) =>
        t.id === editingTemplate.id ? newTemplate : t
      );
      toast.success("Template atualizado!");
    } else {
      updatedTemplates = [...templates, newTemplate];
      toast.success("Template criado!");
    }

    saveToLocalStorage(updatedTemplates);
    setSaving(false);
    setIsDialogOpen(false);
    resetForm();
  };

  const handleDelete = (id: string) => {
    const updatedTemplates = templates.filter((t) => t.id !== id);
    saveToLocalStorage(updatedTemplates);
    toast.success("Template excluído");
  };

  const handleEdit = (template: CustomTemplate) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      description: template.description,
      primary_color: template.primary_color,
      secondary_color: template.secondary_color,
      accent_color: template.accent_color,
      text_color: template.text_color,
      font_style: template.font_style,
      overlay_opacity: template.overlay_opacity,
    });
    setIsDialogOpen(true);
  };

  const resetForm = () => {
    setEditingTemplate(null);
    setFormData({
      name: "",
      description: "",
      primary_color: "#0066CC",
      secondary_color: "#E6F2FF",
      accent_color: "#00A3CC",
      text_color: "#FFFFFF",
      font_style: "sans",
      overlay_opacity: 80,
    });
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-heading font-bold text-foreground flex items-center gap-2">
              <Palette className="w-7 h-7 text-primary" />
              Templates Personalizados
            </h1>
            <p className="text-muted-foreground mt-1">
              Crie e gerencie seus próprios estilos visuais
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Novo Template
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingTemplate ? "Editar Template" : "Criar Novo Template"}
                </DialogTitle>
                <DialogDescription>
                  Personalize cores, fontes e estilos para seu conteúdo
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6 py-4">
                {/* Basic Info */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome do Template</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      placeholder="Ex: Meu Estilo Premium"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Descrição</Label>
                    <Input
                      id="description"
                      value={formData.description}
                      onChange={(e) =>
                        setFormData({ ...formData, description: e.target.value })
                      }
                      placeholder="Breve descrição do estilo"
                    />
                  </div>
                </div>

                {/* Color Presets */}
                <div className="space-y-3">
                  <Label>Paletas Pré-definidas</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {presetColors.map((preset) => (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() => handleApplyPreset(preset)}
                        className="flex items-center gap-2 p-2 rounded-lg border border-border hover:bg-muted transition-colors text-left"
                      >
                        <div className="flex gap-0.5">
                          <div
                            className="w-4 h-4 rounded-full"
                            style={{ backgroundColor: preset.primary }}
                          />
                          <div
                            className="w-4 h-4 rounded-full"
                            style={{ backgroundColor: preset.accent }}
                          />
                        </div>
                        <span className="text-xs font-medium">{preset.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Colors */}
                <div className="space-y-3">
                  <Label>Cores Personalizadas</Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Cor Primária</Label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={formData.primary_color}
                          onChange={(e) =>
                            setFormData({ ...formData, primary_color: e.target.value })
                          }
                          className="w-10 h-10 rounded cursor-pointer border-0"
                        />
                        <Input
                          value={formData.primary_color}
                          onChange={(e) =>
                            setFormData({ ...formData, primary_color: e.target.value })
                          }
                          className="flex-1"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Cor de Destaque</Label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={formData.accent_color}
                          onChange={(e) =>
                            setFormData({ ...formData, accent_color: e.target.value })
                          }
                          className="w-10 h-10 rounded cursor-pointer border-0"
                        />
                        <Input
                          value={formData.accent_color}
                          onChange={(e) =>
                            setFormData({ ...formData, accent_color: e.target.value })
                          }
                          className="flex-1"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Cor de Fundo</Label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={formData.secondary_color}
                          onChange={(e) =>
                            setFormData({ ...formData, secondary_color: e.target.value })
                          }
                          className="w-10 h-10 rounded cursor-pointer border-0"
                        />
                        <Input
                          value={formData.secondary_color}
                          onChange={(e) =>
                            setFormData({ ...formData, secondary_color: e.target.value })
                          }
                          className="flex-1"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Cor do Texto</Label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={formData.text_color}
                          onChange={(e) =>
                            setFormData({ ...formData, text_color: e.target.value })
                          }
                          className="w-10 h-10 rounded cursor-pointer border-0"
                        />
                        <Input
                          value={formData.text_color}
                          onChange={(e) =>
                            setFormData({ ...formData, text_color: e.target.value })
                          }
                          className="flex-1"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Font Style */}
                <div className="space-y-2">
                  <Label>Estilo de Fonte</Label>
                  <Select
                    value={formData.font_style}
                    onValueChange={(value) =>
                      setFormData({ ...formData, font_style: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {fontStyles.map((style) => (
                        <SelectItem key={style.id} value={style.id}>
                          <span className={style.preview}>{style.name}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Preview */}
                <div className="space-y-2">
                  <Label>Pré-visualização</Label>
                  <div
                    className="relative aspect-square max-w-xs mx-auto rounded-xl overflow-hidden"
                    style={{ backgroundColor: formData.secondary_color }}
                  >
                    <div
                      className="absolute inset-0 flex flex-col justify-end p-4"
                      style={{
                        background: `linear-gradient(to top, ${formData.primary_color}E6, ${formData.primary_color}80, transparent)`,
                      }}
                    >
                      <div
                        className={`text-lg font-${formData.font_style === "bold" ? "bold" : formData.font_style === "light" ? "light" : "semibold"}`}
                        style={{ color: formData.text_color }}
                      >
                        Título de Exemplo
                      </div>
                      <div
                        className="text-sm opacity-80 mt-1"
                        style={{ color: formData.text_color }}
                      >
                        Texto de apoio do slide
                      </div>
                      <div
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs mt-3 w-fit"
                        style={{ backgroundColor: formData.accent_color, color: formData.text_color }}
                      >
                        <Sparkles className="w-3 h-3" />
                        Badge
                      </div>
                    </div>
                  </div>
                </div>

                {/* Submit */}
                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button onClick={handleSubmit} disabled={saving} className="gap-2">
                    {saving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    {editingTemplate ? "Salvar" : "Criar Template"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Templates Grid */}
        {templates.length === 0 ? (
          <Card className="shadow-card border-border/50">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Palette className="w-16 h-16 text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-1">
                Nenhum template personalizado
              </h3>
              <p className="text-muted-foreground text-sm text-center max-w-sm mb-4">
                Crie seus próprios estilos visuais para usar na geração de conteúdo
              </p>
              <Button onClick={() => setIsDialogOpen(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                Criar Primeiro Template
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((template) => (
              <Card
                key={template.id}
                className="shadow-card border-border/50 overflow-hidden group"
              >
                {/* Preview */}
                <div
                  className="aspect-video relative"
                  style={{ backgroundColor: template.secondary_color }}
                >
                  <div
                    className="absolute inset-0 flex flex-col justify-end p-4"
                    style={{
                      background: `linear-gradient(to top, ${template.primary_color}E6, ${template.primary_color}80, transparent)`,
                    }}
                  >
                    <div
                      className="text-sm font-semibold"
                      style={{ color: template.text_color }}
                    >
                      Exemplo de Título
                    </div>
                    <div
                      className="text-xs opacity-80"
                      style={{ color: template.text_color }}
                    >
                      Texto de apoio
                    </div>
                  </div>
                </div>

                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-foreground">
                        {template.name}
                      </h3>
                      <p className="text-sm text-muted-foreground line-clamp-1">
                        {template.description || "Sem descrição"}
                      </p>
                    </div>
                    <div className="flex gap-0.5">
                      <div
                        className="w-4 h-4 rounded-full border border-white/20"
                        style={{ backgroundColor: template.primary_color }}
                      />
                      <div
                        className="w-4 h-4 rounded-full border border-white/20"
                        style={{ backgroundColor: template.accent_color }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-1"
                      onClick={() => handleEdit(template)}
                    >
                      <Edit className="w-3.5 h-3.5" />
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="px-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleDelete(template.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default CustomTemplates;
