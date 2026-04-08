import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, X, Loader2, Image as ImageIcon } from "lucide-react";
import ImageEditorModal from "@/components/ui/ImageEditorModal";

interface BriefingImageUploadProps {
  images: string[];
  onChange: (images: string[]) => void;
}

export default function BriefingImageUpload({ images, onChange }: BriefingImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [editorQueue, setEditorQueue] = useState<File[]>([]);
  const [editorCurrentFile, setEditorCurrentFile] = useState<File | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const pendingUrlsRef = useRef<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFile = async (file: File): Promise<string | null> => {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) throw new Error("Não autenticado");

    const ext = file.name.split(".").pop();
    const path = `briefing/${session.session.user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from("content-images").upload(path, file);
    if (error) { toast.error(`Falha no upload: ${error.message}`); return null; }

    const { data: urlData } = supabase.storage.from("content-images").getPublicUrl(path);
    return urlData.publicUrl;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter((f) => {
      if (!f.type.startsWith("image/")) return false;
      if (f.size > 20 * 1024 * 1024) { toast.error(`${f.name} excede 20MB`); return false; }
      return true;
    });
    if (e.target) e.target.value = "";
    if (files.length === 0) return;

    pendingUrlsRef.current = [];
    const [first, ...rest] = files;
    setEditorQueue(rest);
    setEditorCurrentFile(first);
    setEditorOpen(true);
  };

  const advanceQueue = (queue: File[]) => {
    if (queue.length > 0) {
      const [next, ...rest] = queue;
      setEditorQueue(rest);
      setEditorCurrentFile(next);
      // editorOpen stays true
    } else {
      setEditorOpen(false);
      setEditorCurrentFile(null);
      setEditorQueue([]);
    }
  };

  const handleEditorConfirm = async (editedFile: File) => {
    const remainingQueue = editorQueue;
    advanceQueue(remainingQueue);

    setUploading(true);
    try {
      const url = await uploadFile(editedFile);
      if (url) {
        pendingUrlsRef.current = [...pendingUrlsRef.current, url];
      }
    } catch (err: any) {
      toast.error(err?.message || "Erro no upload");
    } finally {
      setUploading(false);
    }

    // If no more in queue, flush results
    if (remainingQueue.length === 0) {
      const newUrls = pendingUrlsRef.current;
      if (newUrls.length > 0) {
        onChange([...images, ...newUrls]);
        toast.success(`${newUrls.length} imagem(ns) anexada(s)`);
      }
      pendingUrlsRef.current = [];
    }
  };

  const handleEditorCancel = () => {
    const remainingQueue = editorQueue;
    advanceQueue(remainingQueue);

    if (remainingQueue.length === 0) {
      const newUrls = pendingUrlsRef.current;
      if (newUrls.length > 0) {
        onChange([...images, ...newUrls]);
        toast.success(`${newUrls.length} imagem(ns) anexada(s)`);
      }
      pendingUrlsRef.current = [];
    }
  };

  const removeImage = (index: number) => {
    onChange(images.filter((_, i) => i !== index));
  };

  return (
    <>
      <ImageEditorModal
        open={editorOpen}
        file={editorCurrentFile}
        onConfirm={handleEditorConfirm}
        onCancel={handleEditorCancel}
        title="Ajustar imagem do briefing"
      />
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
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileChange}
            disabled={uploading}
          />
        </label>
      </div>
    </>
  );
}
