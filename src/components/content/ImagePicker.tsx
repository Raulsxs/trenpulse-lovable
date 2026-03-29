import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Search, Loader2, Image, Check, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface StockImage {
  id: string;
  url: string;
  thumb: string;
  author: string;
  authorUrl: string;
  downloadUrl: string;
  alt: string;
  color: string;
}

interface ImagePickerProps {
  open: boolean;
  onClose: () => void;
  onSelectImage: (imageUrl: string) => void;
}

const categories = [
  { id: "healthcare", label: "Saúde", emoji: "🏥" },
  { id: "technology", label: "Tecnologia", emoji: "💻" },
  { id: "business", label: "Negócios", emoji: "💼" },
  { id: "wellness", label: "Bem-estar", emoji: "🧘" },
  { id: "science", label: "Ciência", emoji: "🔬" },
  { id: "people", label: "Pessoas", emoji: "👥" },
];

const ImagePicker = ({ open, onClose, onSelectImage }: ImagePickerProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("business");
  const [images, setImages] = useState<StockImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const searchImages = async (query?: string, category?: string) => {
    setLoading(true);
    setImages([]);

    try {
      const { data, error } = await supabase.functions.invoke("search-images", {
        body: {
          query: query || "",
          category: category || selectedCategory,
          perPage: 12,
        },
      });

      if (error) throw error;

      if (data.success) {
        setImages(data.images);
      } else {
        throw new Error(data.error || "Erro ao buscar imagens");
      }
    } catch (error) {
      console.error("Error searching images:", error);
      toast.error("Erro ao buscar imagens", {
        description: "Tente novamente em alguns segundos",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryClick = (categoryId: string) => {
    setSelectedCategory(categoryId);
    searchImages(searchQuery, categoryId);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    searchImages(searchQuery, selectedCategory);
  };

  const handleSelectImage = () => {
    if (selectedImage) {
      onSelectImage(selectedImage);
      onClose();
      setSelectedImage(null);
    }
  };

  // Load initial images when dialog opens
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen && images.length === 0) {
      searchImages("", "business");
    }
    if (!isOpen) {
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] p-0 gap-0">
        <DialogHeader className="p-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Image className="w-5 h-5 text-primary" />
            Banco de Imagens
          </DialogTitle>
          <DialogDescription>
            Selecione uma imagem profissional para seu conteúdo
          </DialogDescription>
        </DialogHeader>

        <div className="p-4 space-y-4">
          {/* Search */}
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar imagens..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Buscar"}
            </Button>
          </form>

          {/* Categories */}
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                className={cn(
                  "inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium transition-all cursor-pointer",
                  selectedCategory === cat.id
                    ? "bg-primary text-primary-foreground border-primary hover:bg-primary/90"
                    : "border-border bg-background hover:bg-primary/10"
                )}
                onClick={() => handleCategoryClick(cat.id)}
              >
                <span className="mr-1.5">{cat.emoji}</span>
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Image Grid */}
        <ScrollArea className="flex-1 px-4 pb-4" style={{ height: "400px" }}>
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Buscando imagens...</p>
              </div>
            </div>
          ) : images.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <Image className="w-12 h-12 text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">
                Clique em uma categoria ou busque para ver imagens
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {images.map((image) => (
                <div
                  key={image.id}
                  className={cn(
                    "relative group rounded-xl overflow-hidden cursor-pointer transition-all duration-200",
                    "aspect-[3/4] bg-muted",
                    selectedImage === image.downloadUrl
                      ? "ring-4 ring-primary ring-offset-2 scale-[0.98]"
                      : "hover:scale-[1.02] hover:shadow-lg"
                  )}
                  onClick={() => setSelectedImage(image.downloadUrl)}
                >
                  <img
                    src={image.thumb}
                    alt={image.alt}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  
                  {/* Overlay */}
                  <div className={cn(
                    "absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent",
                    "opacity-0 group-hover:opacity-100 transition-opacity",
                    selectedImage === image.downloadUrl && "opacity-100"
                  )}>
                    <div className="absolute bottom-2 left-2 right-2">
                      <p className="text-xs text-white/80 truncate">
                        📷 {image.author}
                      </p>
                    </div>
                  </div>

                  {/* Selected indicator */}
                  {selectedImage === image.downloadUrl && (
                    <div className="absolute top-2 right-2 w-6 h-6 bg-primary rounded-full flex items-center justify-center shadow-lg">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="p-4 border-t bg-muted/30 flex items-center justify-between">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            Fotos por{" "}
            <a
              href="https://unsplash.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-0.5"
            >
              Unsplash
              <ExternalLink className="w-3 h-3" />
            </a>
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={handleSelectImage} disabled={!selectedImage}>
              <Check className="w-4 h-4 mr-1.5" />
              Usar Imagem
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ImagePicker;
