import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Camera } from "lucide-react";
import ImageEditorModal from "@/components/ui/ImageEditorModal";

interface ProfileAvatarSectionProps {
  avatarUrl?: string | null;
  fullName: string;
  companyName: string;
  uploading: boolean;
  onAvatarUpload: (file: File) => void;
}

const ProfileAvatarSection = ({ avatarUrl, fullName, companyName, uploading, onAvatarUpload }: ProfileAvatarSectionProps) => {
  const [editorFile, setEditorFile] = useState<File | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (e.target) e.target.value = "";
    setEditorFile(file);
    setEditorOpen(true);
  };

  return (
    <>
      <ImageEditorModal
        open={editorOpen}
        file={editorFile}
        onConfirm={(editedFile) => { setEditorOpen(false); setEditorFile(null); onAvatarUpload(editedFile); }}
        onCancel={() => { setEditorOpen(false); setEditorFile(null); }}
        aspectRatio={1}
        title="Ajustar foto de perfil"
      />
      <Card className="shadow-card border-border/50">
        <CardHeader>
          <CardTitle className="text-lg">Foto de Perfil</CardTitle>
          <CardDescription>Clique na imagem para alterar sua foto</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            <div className="relative group">
              <Avatar className="w-24 h-24 border-4 border-primary/20">
                <AvatarImage src={avatarUrl || undefined} />
                <AvatarFallback className="text-2xl bg-primary/10 text-primary">
                  {fullName?.charAt(0) || "U"}
                </AvatarFallback>
              </Avatar>
              <label className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                {uploading ? (
                  <Loader2 className="w-6 h-6 text-white animate-spin" />
                ) : (
                  <Camera className="w-6 h-6 text-white" />
                )}
                <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} disabled={uploading} />
              </label>
            </div>
            <div>
              <p className="font-medium text-foreground">{fullName || "Seu nome"}</p>
              <p className="text-sm text-muted-foreground">{companyName || "Sua empresa"}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
};

export default ProfileAvatarSection;
