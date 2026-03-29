import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sparkles, Loader2, Star, Edit, Trash2, Square, Smartphone, Layers, AlertTriangle, RefreshCw } from "lucide-react";
import TemplateSetPreview from "./TemplateSetPreview";

interface TemplateSetsProps {
  brandId: string;
  brandName: string;
  defaultTemplateSetId: string | null;
  templateSetsDirty?: boolean;
  templateSetsDirtyCount?: number;
  templateSetsStatus?: string;
  brandPalette?: any;
  brandFonts?: any;
  brandVisualTone?: string;
  brandLogoUrl?: string | null;
}

interface TemplateSet {
  id: string;
  brand_id: string;
  name: string;
  description: string | null;
  status: string;
  source_example_ids: string[];
  template_set: {
    id_hint?: string;
    formats?: Record<string, unknown>;
    notes?: string[];
  };
  created_at: string;
  updated_at: string;
}

function useTemplateSets(brandId: string) {
  return useQuery({
    queryKey: ["template-sets", brandId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brand_template_sets")
        .select("*")
        .eq("brand_id", brandId)
        .eq("status", "active")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as TemplateSet[];
    },
    enabled: !!brandId,
  });
}

export default function TemplateSetsSection({ brandId, brandName, defaultTemplateSetId, templateSetsDirty, templateSetsDirtyCount, templateSetsStatus, brandPalette, brandFonts, brandVisualTone, brandLogoUrl }: TemplateSetsProps) {
  const queryClient = useQueryClient();
  const { data: templateSets, isLoading } = useTemplateSets(brandId);
  const [generating, setGenerating] = useState(false);
  const [editingSet, setEditingSet] = useState<TemplateSet | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const hasActiveSets = templateSets && templateSets.length > 0;

  const handleGenerate = async (force = false) => {
    setGenerating(true);
    try {
      const fnName = force ? "update-template-sets-if-needed" : "generate-template-sets";
      const body = force ? { brandId, force: true } : { brandId };

      const { data, error } = await supabase.functions.invoke(fnName, { body });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.skipped) {
        toast.info("Estilos de Conteúdo estão atualizados.");
      } else {
        const count = data.count || 0;
        const skipped = data.skippedCategories || [];
        toast.success(`${count} Estilo(s) de Conteúdo criado(s)!`);
        if (skipped.length > 0) {
          toast.warning(`Pilares ignorados (poucos exemplos): ${skipped.join(", ")}`, { duration: 8000 });
        }
      }
      queryClient.invalidateQueries({ queryKey: ["template-sets", brandId] });
      queryClient.invalidateQueries({ queryKey: ["brands"] });
    } catch (err: any) {
      toast.error("Erro: " + (err.message || "Tente novamente"));
    } finally {
      setGenerating(false);
    }
  };

  const handleSetDefault = async (setId: string) => {
    const { error } = await supabase
      .from("brands")
      .update({ default_template_set_id: setId } as any)
      .eq("id", brandId);
    if (error) {
      toast.error("Erro ao definir padrão");
    } else {
      toast.success("Estilo padrão atualizado!");
      queryClient.invalidateQueries({ queryKey: ["brands"] });
    }
  };

  const handleDelete = async (setId: string) => {
    if (!confirm("Excluir este Estilo de Conteúdo?")) return;
    const { error } = await supabase
      .from("brand_template_sets")
      .delete()
      .eq("id", setId);
    if (error) {
      toast.error("Erro ao excluir");
    } else {
      toast.success("Estilo de Conteúdo excluído");
      queryClient.invalidateQueries({ queryKey: ["template-sets", brandId] });
    }
  };

  const handleSaveEdit = async () => {
    if (!editingSet) return;
    const { error } = await supabase
      .from("brand_template_sets")
      .update({ name: editName, description: editDesc || null })
      .eq("id", editingSet.id);
    if (error) {
      toast.error("Erro ao atualizar");
    } else {
      toast.success("Atualizado!");
      queryClient.invalidateQueries({ queryKey: ["template-sets", brandId] });
      setEditingSet(null);
    }
  };

  const openEdit = (ts: TemplateSet) => {
    setEditingSet(ts);
    setEditName(ts.name);
    setEditDesc(ts.description || "");
  };

  const getFormatIcons = (formats: Record<string, unknown> | undefined) => {
    if (!formats) return [];
    const icons = [];
    if (formats.post) icons.push({ key: "post", label: "Post", Icon: Square });
    if (formats.story) icons.push({ key: "story", label: "Story", Icon: Smartphone });
    if (formats.carousel) icons.push({ key: "carousel", label: "Carrossel", Icon: Layers });
    return icons;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Estilos de Conteúdo</h3>
          <p className="text-xs text-muted-foreground">
            Estilos gerados automaticamente a partir dos exemplos
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => handleGenerate(false)} disabled={generating}>
          {generating ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4 mr-2" />
          )}
          {hasActiveSets ? "Atualizar Estilos" : "Gerar Estilos"}
        </Button>
      </div>

      {/* Dirty banner */}
      {templateSetsDirty && (
        <div className="flex items-center gap-3 p-3 bg-accent/50 border border-accent rounded-lg">
          <AlertTriangle className="w-4 h-4 text-primary flex-shrink-0" />
          <div className="flex-1">
            <p className="text-xs font-medium">
              Estilos de Conteúdo desatualizados ({templateSetsDirtyCount || 0} mudança{(templateSetsDirtyCount || 0) !== 1 ? "s" : ""})
            </p>
            <p className="text-[10px] text-muted-foreground">
              Exemplos foram adicionados ou modificados desde a última geração.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="default" size="sm" onClick={() => handleGenerate(true)} disabled={generating}>
              {generating ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
              Atualizar agora
            </Button>
          </div>
        </div>
      )}

      {/* Info box about minimum requirements */}
      <div className="text-[10px] text-muted-foreground bg-muted/50 rounded-md p-2.5 space-y-0.5">
        <p className="font-medium text-xs text-foreground/70">Requisitos mínimos por pilar:</p>
        <p>• <strong>Post / Story / Frase:</strong> 1 exemplo de referência</p>
        <p>• <strong>Carrossel:</strong> 3 exemplos de referência (capa + conteúdo + fechamento)</p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : templateSets && templateSets.length > 0 ? (
        <div className="space-y-2">
          {templateSets.map((ts) => {
            const isDefault = defaultTemplateSetId === ts.id;
            const formats = getFormatIcons(ts.template_set?.formats as Record<string, unknown> | undefined);
            return (
              <div
                key={ts.id}
                className={`border rounded-lg p-3 space-y-2 ${
                  isDefault ? "border-primary bg-primary/5" : "border-border"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-medium">{ts.name}</h4>
                    {isDefault && (
                      <Badge variant="default" className="text-[10px]">Padrão</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {!isDefault && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleSetDefault(ts.id)} title="Definir como padrão">
                        <Star className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(ts)}>
                      <Edit className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(ts.id)}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
                {ts.description && (
                  <p className="text-xs text-muted-foreground">{ts.description}</p>
                )}
                <div className="flex items-center gap-2">
                  {formats.map(({ key, label, Icon }) => (
                    <Badge key={key} variant="outline" className="text-[10px] gap-1">
                      <Icon className="w-3 h-3" />
                      {label}
                    </Badge>
                  ))}
                </div>
                {ts.template_set?.notes && (ts.template_set.notes as string[]).length > 0 && (
                  <div className="text-[10px] text-muted-foreground space-y-0.5">
                    {(ts.template_set.notes as string[]).map((note, i) => (
                      <p key={i}>• {note}</p>
                    ))}
                  </div>
                )}
                <TemplateSetPreview
                  templateSet={ts}
                  brand={{
                    name: brandName,
                    palette: brandPalette || [],
                    fonts: brandFonts || { headings: "Inter", body: "Inter" },
                    visual_tone: brandVisualTone || "clean",
                    logo_url: brandLogoUrl || null,
                  }}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-6 text-muted-foreground border-2 border-dashed border-border rounded-lg">
          <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-xs">Nenhum Estilo de Conteúdo criado</p>
          <p className="text-[10px] mt-1">Faça upload de exemplos e clique em "Gerar Estilos"</p>
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingSet} onOpenChange={(open) => { if (!open) setEditingSet(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar Estilo de Conteúdo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Nome</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Descrição</Label>
              <Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="Opcional" />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSaveEdit} size="sm">Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
