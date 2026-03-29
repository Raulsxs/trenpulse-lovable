import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";

interface SlideWithBg {
  background_image_url?: string;
  image_url?: string;
  role?: string;
}

interface SaveBackgroundTemplateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string;
  contentFormat: string;
  slides: SlideWithBg[];
  /** If provided, saves only this single slide */
  singleSlideIndex?: number;
  sourceContentId?: string;
}

export default function SaveBackgroundTemplateModal({
  open,
  onOpenChange,
  brandId,
  contentFormat,
  slides,
  singleSlideIndex,
  sourceContentId,
}: SaveBackgroundTemplateModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const isSingle = singleSlideIndex !== undefined;
  const relevantSlides = isSingle ? [slides[singleSlideIndex]] : slides;
  const bgCount = relevantSlides.filter(s => s?.background_image_url || s?.image_url).length;

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Informe um nome para o template");
      return;
    }
    if (bgCount === 0) {
      toast.error("Nenhum background disponível para salvar");
      return;
    }

    setSaving(true);
    try {
      const backgroundImages = relevantSlides.map((s, i) => ({
        index: i,
        url: s?.background_image_url || s?.image_url || null,
        role: s?.role || (i === 0 ? "cover" : "content"),
      }));

      const format = isSingle ? (contentFormat === "story" ? "story" : "post") : contentFormat;
      const slideCount = isSingle ? 1 : relevantSlides.length;

      const { error } = await supabase
        .from("brand_background_templates")
        .insert({
          brand_id: brandId,
          name: name.trim(),
          description: description.trim() || null,
          content_format: format,
          slide_count: slideCount,
          background_images: backgroundImages,
          source_content_id: sourceContentId || null,
        });

      if (error) throw error;

      toast.success("Template de background salvo!", {
        description: `"${name}" está disponível nos Estilos de Conteúdo.`,
      });
      setName("");
      setDescription("");
      onOpenChange(false);
    } catch (err: any) {
      console.error("Error saving bg template:", err);
      toast.error("Erro ao salvar template");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {isSingle ? "Salvar Background como Template" : "Salvar Todos os Backgrounds"}
          </DialogTitle>
          <DialogDescription>
            {isSingle
              ? "Este background será reutilizável em novos conteúdos do mesmo formato."
              : `${bgCount} background(s) serão salvos como um conjunto reutilizável.`}
          </DialogDescription>
        </DialogHeader>

        {/* Preview thumbnails */}
        <div className="flex gap-2 overflow-x-auto py-2">
          {relevantSlides.map((s, i) => {
            const url = s?.background_image_url || s?.image_url;
            return (
              <div key={i} className="shrink-0 w-16 h-20 rounded-md overflow-hidden border border-border bg-muted">
                {url ? (
                  <img src={url} alt={`BG ${i + 1}`} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground">
                    Sem BG
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nome do Template</Label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex: Fundo escuro com ondas"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label>Descrição (opcional)</Label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Quando usar este template..."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || bgCount === 0} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
