import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, X, Loader2, Image as ImageIcon } from "lucide-react";

interface BriefingImageUploadProps {
  images: string[];
  onChange: (images: string[]) => void;
}

export default function BriefingImageUpload({ images, onChange }: BriefingImageUploadProps) {
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) throw new Error("Não autenticado");

      const newUrls: string[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        if (file.size > 20 * 1024 * 1024) {
          toast.error(`${file.name} excede 20MB`);
          continue;
        }

        const ext = file.name.split(".").pop();
        const path = `briefing/${session.session.user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        console.log("[BriefingImageUpload] Uploading:", path, "size:", file.size, "type:", file.type);
        const { error } = await supabase.storage.from("content-images").upload(path, file);
        if (error) {
          console.error("[BriefingImageUpload] Upload error:", error.message, error);
          toast.error(`Falha no upload de ${file.name}: ${error.message}`);
          continue;
        }

        const { data: urlData } = supabase.storage.from("content-images").getPublicUrl(path);
        newUrls.push(urlData.publicUrl);
      }

      if (newUrls.length > 0) {
        onChange([...images, ...newUrls]);
        toast.success(`${newUrls.length} imagem(ns) anexada(s)`);
      }
    } catch (err: any) {
      console.error("[BriefingImageUpload] Error:", err);
      toast.error(err?.message || "Erro no upload de imagem");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const removeImage = (index: number) => {
    onChange(images.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
          <ImageIcon className="w-3 h-3" />
          Imagens do Briefing
        </Label>
        <Badge variant="secondary" className="text-[10px]">{images.length} anexo(s)</Badge>
      </div>

      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((url, i) => (
            <div key={i} className="relative group w-16 h-16 rounded-lg overflow-hidden border border-border">
              <img src={url} alt={`Briefing ${i + 1}`} className="w-full h-full object-cover" />
              <button
                onClick={() => removeImage(i)}
                className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <label className="cursor-pointer">
        <Button variant="outline" size="sm" className="w-full gap-2" asChild disabled={uploading}>
          <span>
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Anexar imagens ao briefing
          </span>
        </Button>
        <input type="file" accept="image/*" multiple className="hidden" onChange={handleUpload} disabled={uploading} />
      </label>
    </div>
  );
}
