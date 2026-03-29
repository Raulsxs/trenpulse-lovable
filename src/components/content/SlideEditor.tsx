import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Edit2, Image, Wand2, Check, X, Sparkles, Type, FileText, ImagePlus, Upload, AlertTriangle, Trash2 } from "lucide-react";
import ImagePicker from "./ImagePicker";
import ImageUpload from "./ImageUpload";

interface Slide {
  headline: string;
  body: string;
  imagePrompt?: string;
  illustrationPrompt?: string;
  image_url?: string;
  previewImage?: string;
  templateHint?: string;
  template?: string;
  role?: string;
  bullets?: string[];
  speakerNotes?: string;
  image_stale?: boolean;
}

interface SlideEditorProps {
  slides: Slide[];
  currentSlide: number;
  editingSlide: number | null;
  onSlideClick: (index: number) => void;
  onEditSlide: (index: number) => void;
  onSaveEdit: (index: number, headline: string, body: string, imagePrompt: string) => void;
  onCancelEdit: () => void;
  onGeneratePreview: (index: number) => void;
  onSetStockImage: (index: number, imageUrl: string) => void;
  onDeleteSlide?: (index: number) => void;
  generatingPreview: boolean;
}

const SlideEditor = ({
  slides,
  currentSlide,
  editingSlide,
  onSlideClick,
  onEditSlide,
  onSaveEdit,
  onCancelEdit,
  onGeneratePreview,
  onSetStockImage,
  onDeleteSlide,
  generatingPreview,
}: SlideEditorProps) => {
  const [editHeadline, setEditHeadline] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editImagePrompt, setEditImagePrompt] = useState("");
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const [imagePickerSlideIndex, setImagePickerSlideIndex] = useState<number | null>(null);
  const [imageUploadOpen, setImageUploadOpen] = useState(false);
  const [imageUploadSlideIndex, setImageUploadSlideIndex] = useState<number | null>(null);

  const handleStartEdit = (index: number) => {
    setEditHeadline(slides[index].headline);
    setEditBody(slides[index].body);
    setEditImagePrompt(slides[index].imagePrompt);
    onEditSlide(index);
  };

  const handleSave = (index: number) => {
    onSaveEdit(index, editHeadline, editBody, editImagePrompt);
  };

  const handleOpenImagePicker = (index: number) => {
    setImagePickerSlideIndex(index);
    setImagePickerOpen(true);
  };

  const handleSelectStockImage = (imageUrl: string) => {
    if (imagePickerSlideIndex !== null) {
      onSetStockImage(imagePickerSlideIndex, imageUrl);
    }
    setImagePickerOpen(false);
    setImagePickerSlideIndex(null);
  };

  const handleOpenUpload = (index: number) => {
    setImageUploadSlideIndex(index);
    setImageUploadOpen(true);
  };

  const handleUploadComplete = (imageUrl: string) => {
    if (imageUploadSlideIndex !== null) {
      onSetStockImage(imageUploadSlideIndex, imageUrl);
    }
    setImageUploadOpen(false);
    setImageUploadSlideIndex(null);
  };

  const getSlideLabel = (index: number) => {
    if (index === 0) return "Capa";
    if (index === slides.length - 1) return "CTA";
    return `Slide ${index + 1}`;
  };

  const getSlideColor = (index: number) => {
    if (index === 0) return "from-amber-500 to-orange-500";
    if (index === slides.length - 1) return "from-violet-500 to-purple-500";
    return "from-sky-500 to-blue-500";
  };

  return (
    <>
      <div className="space-y-3 max-h-[650px] overflow-y-auto pr-2 scrollbar-thin">
        {slides.map((slide, index) => (
          <Card
            key={index}
            className={cn(
              "border transition-all duration-300 cursor-pointer group overflow-hidden",
              currentSlide === index 
                ? "border-primary shadow-lg shadow-primary/10 bg-primary/[0.02]" 
                : "border-border/50 hover:border-primary/30 hover:shadow-md"
            )}
            onClick={() => onSlideClick(index)}
          >
            <CardContent className="p-0">
              {/* Colored top bar */}
              <div className={cn(
                "h-1 w-full bg-gradient-to-r",
                getSlideColor(index)
              )} />
              
              <div className="p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge 
                      className={cn(
                        "text-xs font-semibold text-white bg-gradient-to-r",
                        getSlideColor(index)
                      )}
                    >
                      {getSlideLabel(index)}
                    </Badge>
                    {(slide.image_url || slide.previewImage) && (
                      <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                        <Image className="w-3 h-3 mr-1" />
                        Imagem
                      </Badge>
                    )}
                    {slide.image_stale && (
                      <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/30">
                        <AlertTriangle className="w-3 h-3 mr-1" />
                        Texto alterado — regenere a imagem
                      </Badge>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-1">
                    {/* Upload Image Button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "h-8 w-8 p-0 rounded-full",
                        "opacity-0 group-hover:opacity-100 transition-opacity"
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenUpload(index);
                      }}
                      title="Upload de imagem"
                    >
                      <Upload className="w-4 h-4 text-blue-500" />
                    </Button>
                    {/* Stock Image Button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "h-8 w-8 p-0 rounded-full",
                        "opacity-0 group-hover:opacity-100 transition-opacity"
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenImagePicker(index);
                      }}
                      title="Buscar no banco de imagens"
                    >
                      <ImagePlus className="w-4 h-4 text-emerald-500" />
                    </Button>
                    {/* AI Generate Button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "h-8 w-8 p-0 rounded-full",
                        "opacity-0 group-hover:opacity-100 transition-opacity",
                        generatingPreview && "opacity-50 pointer-events-none"
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        onGeneratePreview(index);
                      }}
                      disabled={generatingPreview}
                      title="Gerar imagem com IA"
                    >
                      <Wand2 className="w-4 h-4 text-violet-500" />
                    </Button>
                    {/* Edit Button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartEdit(index);
                      }}
                      title="Editar slide"
                    >
                      <Edit2 className="w-4 h-4 text-primary" />
                    </Button>
                    {/* Delete Button */}
                    {onDeleteSlide && slides.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteSlide(index);
                        }}
                        title="Excluir slide"
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Preview thumbnail if has image */}
                {(slide.image_url || slide.previewImage) && (
                  <div className="mb-3 rounded-lg overflow-hidden aspect-video relative group/thumb">
                    <img 
                      src={slide.image_url || slide.previewImage} 
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenImagePicker(index);
                        }}
                      >
                        <ImagePlus className="w-3 h-3 mr-1" />
                        Trocar
                      </Button>
                    </div>
                  </div>
                )}

                {editingSlide === index ? (
                  <div className="space-y-4 animate-fade-in" onClick={(e) => e.stopPropagation()}>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Type className="w-3 h-3" />
                        Título
                      </Label>
                      <Input
                        value={editHeadline}
                        onChange={(e) => setEditHeadline(e.target.value)}
                        className="text-sm font-semibold border-primary/30 focus:border-primary"
                        placeholder="Título impactante..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <FileText className="w-3 h-3" />
                        Texto
                      </Label>
                      <Textarea
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                        className="text-sm border-primary/30 focus:border-primary resize-none"
                        rows={2}
                        placeholder="Texto de apoio..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Sparkles className="w-3 h-3" />
                        Prompt da Imagem (IA)
                      </Label>
                      <Textarea
                        value={editImagePrompt}
                        onChange={(e) => setEditImagePrompt(e.target.value)}
                        className="text-sm text-muted-foreground border-violet-500/30 focus:border-violet-500 resize-none bg-violet-500/5"
                        rows={2}
                        placeholder="Descreva a imagem que a IA deve gerar..."
                      />
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button
                        size="sm"
                        onClick={() => handleSave(index)}
                        className="gap-1.5 flex-1"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Salvar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={onCancelEdit}
                        className="gap-1.5"
                      >
                        <X className="w-3.5 h-3.5" />
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="font-semibold text-foreground text-sm leading-snug line-clamp-2">
                      {slide.headline}
                    </p>
                    <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                      {slide.body}
                    </p>
                    {slide.imagePrompt && !slide.image_url && !slide.previewImage && (
                      <div className="flex items-start gap-2 mt-3 p-2.5 rounded-lg bg-violet-500/5 border border-violet-500/10">
                        <Sparkles className="w-3.5 h-3.5 text-violet-500 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-violet-600 dark:text-violet-400 line-clamp-2">
                          {slide.imagePrompt}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Image Picker Dialog */}
      <ImagePicker
        open={imagePickerOpen}
        onClose={() => {
          setImagePickerOpen(false);
          setImagePickerSlideIndex(null);
        }}
        onSelectImage={handleSelectStockImage}
      />

      {/* Image Upload Dialog */}
      <ImageUpload
        open={imageUploadOpen}
        onClose={() => {
          setImageUploadOpen(false);
          setImageUploadSlideIndex(null);
        }}
        onUploadComplete={handleUploadComplete}
      />
    </>
  );
};

export default SlideEditor;
