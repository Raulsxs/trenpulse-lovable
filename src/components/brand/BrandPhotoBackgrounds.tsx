import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Upload, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Photo {
  id: string;
  image_url: string;
  created_at: string;
}

export default function BrandPhotoBackgrounds({ brandId }: { brandId: string }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const fetchPhotos = async () => {
    const { data } = await supabase
      .from("brand_examples")
      .select("id, image_url, created_at")
      .eq("brand_id", brandId)
      .eq("purpose", "background")
      .order("created_at", { ascending: false });
    setPhotos(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchPhotos();
  }, [brandId]);

  const handleUpload = async (files: FileList) => {
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop() || "png";
        const path = `${user.id}/${Date.now()}-${Math.random().toString(36).substr(2, 5)}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("content-images")
          .upload(path, file, { contentType: file.type });
        if (uploadErr) throw uploadErr;

        const { data: urlData } = supabase.storage.from("content-images").getPublicUrl(path);

        await supabase.from("brand_examples").insert({
          brand_id: brandId,
          image_url: urlData.publicUrl,
          type: "post",
          purpose: "background",
        });
      }

      toast.success(`${files.length} foto(s) adicionada(s)`);
      fetchPhotos();
    } catch (err: any) {
      console.error("[BrandPhotoBackgrounds] upload error:", err);
      toast.error("Erro ao enviar foto: " + (err.message || "Tente novamente"));
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (photoId: string) => {
    try {
      await supabase.from("brand_examples").delete().eq("id", photoId);
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
      toast.success("Foto removida");
    } catch (err: any) {
      toast.error("Erro ao remover foto");
    }
  };

  if (loading) {
    return <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />;
  }

  return (
    <div className="space-y-4">
      {/* Upload button */}
      <label className="cursor-pointer inline-flex items-center gap-2 border border-dashed border-border rounded-lg px-4 py-3 text-sm hover:bg-accent transition-colors">
        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
        {uploading ? "Enviando..." : "Adicionar fotos"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          disabled={uploading}
          onChange={(e) => {
            if (e.target.files?.length) handleUpload(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

      {/* Photo grid */}
      {photos.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nenhuma foto pessoal adicionada. Suba fotos profissionais para usar como fundo dos posts.
        </p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
          {photos.map((photo) => (
            <div key={photo.id} className="relative group rounded-lg overflow-hidden border border-border">
              <img
                src={photo.image_url}
                alt=""
                className="w-full aspect-square object-cover"
              />
              <Button
                variant="destructive"
                size="icon"
                className="absolute top-1 right-1 w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => handleDelete(photo.id)}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {photos.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {photos.length} foto(s) disponível(is). No modo "📸 Foto + texto", a IA usa essas fotos como fundo automaticamente.
        </p>
      )}
    </div>
  );
}
