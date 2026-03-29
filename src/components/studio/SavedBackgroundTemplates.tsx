import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2, Image, Square, Smartphone, Layers } from "lucide-react";

interface SavedBackgroundTemplatesProps {
  brandId: string;
}

interface BgTemplate {
  id: string;
  name: string;
  description: string | null;
  content_format: string;
  slide_count: number;
  background_images: Array<{ index: number; role: string; url: string }>;
  created_at: string;
}

function useBgTemplates(brandId: string) {
  return useQuery({
    queryKey: ["bg-templates", brandId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brand_background_templates")
        .select("*")
        .eq("brand_id", brandId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as BgTemplate[];
    },
    enabled: !!brandId,
  });
}

const FORMAT_ICON: Record<string, { Icon: typeof Square; label: string }> = {
  post: { Icon: Square, label: "Post" },
  story: { Icon: Smartphone, label: "Story" },
  carousel: { Icon: Layers, label: "Carrossel" },
};

export default function SavedBackgroundTemplates({ brandId }: SavedBackgroundTemplatesProps) {
  const queryClient = useQueryClient();
  const { data: templates, isLoading } = useBgTemplates(brandId);

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este template de fundo?")) return;
    const { error } = await supabase
      .from("brand_background_templates")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error("Erro ao excluir");
    } else {
      toast.success("Template excluído");
      queryClient.invalidateQueries({ queryKey: ["bg-templates", brandId] });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!templates || templates.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground border-2 border-dashed border-border rounded-lg">
        <Image className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-xs">Nenhum template de fundo salvo</p>
        <p className="text-[10px] mt-1">
          Templates são criados ao salvar fundos de conteúdos gerados
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-medium">Templates de Fundo Salvos</h3>
        <p className="text-xs text-muted-foreground">
          Fundos reutilizáveis salvos a partir de conteúdos gerados
        </p>
      </div>

      <div className="grid gap-3">
        {templates.map((t) => {
          const fmt = FORMAT_ICON[t.content_format] || FORMAT_ICON.post;
          return (
            <div
              key={t.id}
              className="border border-border rounded-lg p-3 space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-medium">{t.name}</h4>
                  <Badge variant="outline" className="text-[10px] gap-1">
                    <fmt.Icon className="w-3 h-3" />
                    {fmt.label}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    {t.slide_count} slide{t.slide_count !== 1 ? "s" : ""}
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => handleDelete(t.id)}
                >
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </Button>
              </div>

              {t.description && (
                <p className="text-xs text-muted-foreground">{t.description}</p>
              )}

              {/* Preview thumbnails */}
              <div className="flex gap-2 flex-wrap">
                {t.background_images.map((bg, i) => (
                  <div
                    key={i}
                    className="w-16 h-16 rounded border border-border overflow-hidden bg-muted"
                  >
                    <img
                      src={bg.url}
                      alt={`Fundo ${i + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
