import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Loader2, Wand2, Trash2, ImageIcon } from "lucide-react";

interface SavedVisual {
  id: string;
  name: string;
  description: string | null;
  content_format: string;
  slide_count: number;
  background_images: { index?: number; url?: string | null; role?: string }[];
}

/**
 * Lista os visuais que o usuário salvou ("Gostou do visual? Salve para reutilizar") e permite
 * REUTILIZAR: "Usar este visual" abre o Studio em modo Replicar com a imagem como referência
 * (image-to-image) — reaproveita o fluxo replicate que já existe. Fecha o loop da feature
 * (antes salvava em brand_background_templates mas nada lia de volta).
 */
export default function SavedVisualsSection({ brandId }: { brandId: string }) {
  const navigate = useNavigate();
  const [items, setItems] = useState<SavedVisual[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("brand_background_templates")
        .select("id, name, description, content_format, slide_count, background_images")
        .eq("brand_id", brandId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setItems((data as unknown as SavedVisual[]) || []);
    } catch (err) {
      console.error("[SavedVisuals] load error:", err);
    } finally {
      setLoading(false);
    }
  }, [brandId]);

  useEffect(() => { load(); }, [load]);

  const firstImage = (v: SavedVisual): string | null =>
    v.background_images?.find((b) => b?.url)?.url || null;

  const useVisual = (v: SavedVisual) => {
    const ref = firstImage(v);
    if (!ref) { toast.error("Este visual não tem imagem disponível"); return; }
    // Studio lê navState.replicate → abre em Replicar com a imagem como referência.
    navigate("/studio", { state: { replicate: { brandId, refUrl: ref } } });
  };

  const remove = async (id: string) => {
    setDeletingId(id);
    try {
      const { error } = await supabase.from("brand_background_templates").delete().eq("id", id);
      if (error) throw error;
      setItems((prev) => prev.filter((x) => x.id !== id));
      toast.success("Visual removido");
    } catch {
      toast.error("Erro ao remover");
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-6 text-xs text-muted-foreground">
        <ImageIcon className="w-6 h-6 mx-auto mb-2 opacity-40" />
        Nenhum visual salvo ainda. Ao gerar um post que você curtir, clique em
        <span className="font-medium text-foreground"> "Gostou do visual? Salve para reutilizar"</span> no card.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {items.map((v) => {
        const img = firstImage(v);
        return (
          <div key={v.id} className="rounded-lg border border-border overflow-hidden bg-muted/30 flex flex-col">
            <div className="aspect-square bg-muted overflow-hidden">
              {img ? (
                <img src={img} alt={v.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground"><ImageIcon className="w-6 h-6" /></div>
              )}
            </div>
            <div className="p-2 space-y-2">
              <p className="text-xs font-medium truncate" title={v.name}>{v.name}</p>
              <div className="flex items-center gap-1">
                <Button size="sm" className="h-7 flex-1 text-[11px] gap-1" onClick={() => useVisual(v)}>
                  <Wand2 className="w-3 h-3" /> Usar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => remove(v.id)}
                  disabled={deletingId === v.id}
                >
                  {deletingId === v.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
