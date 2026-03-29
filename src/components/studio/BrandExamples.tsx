import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useBrandExamples, useAddBrandExample, useDeleteBrandExample, useUpdateBrandExample, useBrandCategories, useCreateBrandCategory } from "@/hooks/useStudio";
import { supabase } from "@/integrations/supabase/client";
import { Upload, Image, X, Edit, Sparkles, Loader2, Plus, Layers } from "lucide-react";
import { toast } from "sonner";

const EXAMPLE_TYPES = [
  { value: "post", label: "Post" },
  { value: "story", label: "Story" },
  { value: "carousel", label: "Carrossel" },
];

const EXAMPLE_SUBTYPES = [
  { value: "cover", label: "Capa" },
  { value: "text_card", label: "Card de Texto" },
  { value: "bullets", label: "Bullets" },
  { value: "closing", label: "Fechamento" },
];

interface BrandExamplesProps {
  brandId: string;
  brandName: string;
  onAnalyzeStyle?: () => void;
  isAnalyzing?: boolean;
}

export default function BrandExamples({ brandId, brandName, onAnalyzeStyle, isAnalyzing }: BrandExamplesProps) {
  const { data: examples, isLoading } = useBrandExamples(brandId);
  const { data: categories } = useBrandCategories(brandId);
  const addExample = useAddBrandExample();
  const deleteExample = useDeleteBrandExample();
  const updateExample = useUpdateBrandExample();
  const createCategory = useCreateBrandCategory();

  const [uploading, setUploading] = useState(false);
  const [description, setDescription] = useState("");
  const [uploadType, setUploadType] = useState("post");
  const [uploadSubtype, setUploadSubtype] = useState<string>("");
  const [categoryMode, setCategoryMode] = useState<string>("auto");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // New category dialog
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatDesc, setNewCatDesc] = useState("");

  // Carousel organizer
  const [carouselGroup, setCarouselGroup] = useState<any[]>([]);
  const [showCarouselOrganizer, setShowCarouselOrganizer] = useState(false);

  // Edit dialog state
  const [editingExample, setEditingExample] = useState<any>(null);
  const [editType, setEditType] = useState("post");
  const [editSubtype, setEditSubtype] = useState<string>("");
  const [editDescription, setEditDescription] = useState("");
  const [editCategoryMode, setEditCategoryMode] = useState("auto");
  const [editCategoryId, setEditCategoryId] = useState<string>("");

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Multi-upload for carousel
    if (uploadType === "carousel" && files.length > 1) {
      await handleCarouselMultiUpload(files);
      return;
    }

    const file = files[0];
    if (!file.type.startsWith("image/")) {
      toast.error("Apenas imagens são aceitas");
      return;
    }

    setUploading(true);
    try {
      const fileName = `${brandId}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("content-images")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("content-images")
        .getPublicUrl(fileName);

      await addExample.mutateAsync({
        brand_id: brandId,
        image_url: publicUrl,
        description: description || undefined,
        content_type: uploadType,
        type: uploadType,
        subtype: uploadSubtype || undefined,
        category_id: categoryMode === "manual" ? selectedCategoryId || null : null,
        category_mode: categoryMode,
      });

      setDescription("");
      setUploadSubtype("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error: any) {
      toast.error("Erro ao fazer upload: " + error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleCarouselMultiUpload = async (files: FileList) => {
    setUploading(true);
    const groupId = crypto.randomUUID();
    const uploaded: any[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith("image/")) continue;

        const fileName = `${brandId}/${Date.now()}-${i}-${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("content-images")
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from("content-images")
          .getPublicUrl(fileName);

        const result = await addExample.mutateAsync({
          brand_id: brandId,
          image_url: publicUrl,
          description: description || undefined,
          content_type: "carousel",
          type: "carousel",
          subtype: undefined,
          category_id: categoryMode === "manual" ? selectedCategoryId || null : null,
          category_mode: categoryMode,
          carousel_group_id: groupId,
          slide_index: i,
        });

        uploaded.push(result);
      }

      toast.success(`${uploaded.length} slides do carrossel enviados!`);
      setDescription("");
      if (fileInputRef.current) fileInputRef.current.value = "";

      // Open organizer
      setCarouselGroup(uploaded);
      setShowCarouselOrganizer(true);
    } catch (error: any) {
      toast.error("Erro no multi-upload: " + error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Remover este exemplo?")) {
      await deleteExample.mutateAsync({ id, brandId });
    }
  };

  const openEdit = (example: any) => {
    setEditingExample(example);
    setEditType(example.type || "post");
    setEditSubtype(example.subtype || "");
    setEditDescription(example.description || "");
    setEditCategoryMode(example.category_mode || "auto");
    setEditCategoryId(example.category_id || "");
  };

  const handleSaveEdit = async () => {
    if (!editingExample) return;
    await updateExample.mutateAsync({
      id: editingExample.id,
      brandId,
      type: editType,
      subtype: editSubtype || null,
      description: editDescription || null,
      category_id: editCategoryMode === "manual" ? editCategoryId || null : null,
      category_mode: editCategoryMode,
    });
    setEditingExample(null);
  };

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) return;
    const result = await createCategory.mutateAsync({
      brandId,
      name: newCatName.trim(),
      description: newCatDesc.trim() || undefined,
    });
    setSelectedCategoryId(result.id);
    setCategoryMode("manual");
    setNewCatName("");
    setNewCatDesc("");
    setShowNewCategory(false);
  };

  const handleSaveCarouselOrganizer = async () => {
    try {
      for (const item of carouselGroup) {
        await supabase
          .from("brand_examples")
          .update({ slide_index: item.slide_index, subtype: item.subtype || null } as any)
          .eq("id", item.id);
      }
      toast.success("Carrossel organizado!");
      setShowCarouselOrganizer(false);
      setCarouselGroup([]);
    } catch (error: any) {
      toast.error("Erro ao salvar: " + error.message);
    }
  };

  const typeLabel = (type: string) => EXAMPLE_TYPES.find((t) => t.value === type)?.label || type;
  const subtypeLabel = (subtype: string) => EXAMPLE_SUBTYPES.find((t) => t.value === subtype)?.label || subtype;
  const categoryName = (catId: string) => categories?.find((c: any) => c.id === catId)?.name || "";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Exemplos de Referência</h3>
          <p className="text-xs text-muted-foreground">
            Imagens classificadas por formato e pilar editorial
          </p>
        </div>
        {onAnalyzeStyle && (
          <Button variant="outline" size="sm" onClick={onAnalyzeStyle} disabled={isAnalyzing}>
            {isAnalyzing ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 mr-2" />
            )}
            Reanalisar Estilo
          </Button>
        )}
      </div>

      {/* Upload area */}
      <div className="border-2 border-dashed border-border rounded-lg p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Formato *</Label>
            <Select value={uploadType} onValueChange={setUploadType}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXAMPLE_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Pilar editorial *</Label>
            <div className="flex gap-1">
              <Select
                value={categoryMode === "auto" ? "auto" : selectedCategoryId || "auto"}
                onValueChange={(v) => {
                  if (v === "auto") {
                    setCategoryMode("auto");
                    setSelectedCategoryId("");
                  } else if (v === "__new__") {
                    setShowNewCategory(true);
                  } else {
                    setCategoryMode("manual");
                    setSelectedCategoryId(v);
                  }
                }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Auto (recomendado)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto (recomendado)</SelectItem>
                  {categories?.map((cat: any) => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                  ))}
                  <SelectItem value="__new__">
                    <span className="flex items-center gap-1"><Plus className="w-3 h-3" /> Novo pilar</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        {uploadType !== "carousel" && (
          <div className="space-y-1">
            <Label className="text-xs">Papel do slide (opcional)</Label>
            <Select value={uploadSubtype} onValueChange={setUploadSubtype}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum</SelectItem>
                {EXAMPLE_SUBTYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="flex items-center gap-3">
          <Input
            placeholder="Descrição do exemplo (opcional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="flex-1 text-sm"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple={uploadType === "carousel"}
            onChange={handleFileUpload}
            className="hidden"
            disabled={uploading}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                Enviando...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Upload className="w-4 h-4" />
                {uploadType === "carousel" ? "Upload (multi)" : "Upload"}
              </span>
            )}
          </Button>
        </div>
        {uploadType === "carousel" && (
          <p className="text-[10px] text-muted-foreground">
            Selecione várias imagens para criar um grupo de carrossel.
          </p>
        )}
      </div>

      {/* Examples grid */}
      {isLoading ? (
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="aspect-square rounded-lg" />
          ))}
        </div>
      ) : examples && examples.length > 0 ? (
        <div className="grid grid-cols-3 gap-3">
          {examples.map((example: any) => (
            <div key={example.id} className="relative group aspect-square">
              <img
                src={example.image_url}
                alt={example.description || "Exemplo"}
                className="w-full h-full object-cover rounded-lg border border-border"
              />
              {/* Action buttons */}
              <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => openEdit(example)}
                  className="w-6 h-6 bg-background/90 text-foreground rounded-full flex items-center justify-center border border-border"
                >
                  <Edit className="w-3 h-3" />
                </button>
                <button
                  onClick={() => handleDelete(example.id)}
                  className="w-6 h-6 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              {/* Chips */}
              <div className="absolute bottom-1 left-1 right-1 flex flex-wrap gap-1">
                <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 bg-background/80">
                  {typeLabel(example.type || example.content_type || "post")}
                </Badge>
                {example.subtype && (
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 bg-background/80">
                    {subtypeLabel(example.subtype)}
                  </Badge>
                )}
                {example.category_mode === "manual" && example.category_id ? (
                  <Badge variant="default" className="text-[9px] px-1.5 py-0 h-4">
                    {categoryName(example.category_id)}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 bg-background/80 opacity-60">
                    Auto
                  </Badge>
                )}
                {example.carousel_group_id && (
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 bg-background/80">
                    <Layers className="w-2.5 h-2.5 mr-0.5" />
                    {example.slide_index != null ? `#${example.slide_index + 1}` : ""}
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-6 text-muted-foreground">
          <Image className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-xs">Nenhum exemplo ainda</p>
        </div>
      )}

      {/* New Category Dialog */}
      <Dialog open={showNewCategory} onOpenChange={setShowNewCategory}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Novo Pilar Editorial</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Nome *</Label>
              <Input value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="Ex: Caso Clínico, Institucional..." />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Descrição (opcional)</Label>
              <Input value={newCatDesc} onChange={(e) => setNewCatDesc(e.target.value)} placeholder="Breve descrição do pilar" />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleCreateCategory} disabled={!newCatName.trim() || createCategory.isPending} size="sm">
              {createCategory.isPending ? "Criando..." : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Carousel Organizer Dialog */}
      <Dialog open={showCarouselOrganizer} onOpenChange={setShowCarouselOrganizer}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Organizar Carrossel ({carouselGroup.length} slides)</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-96 overflow-y-auto py-2">
            {carouselGroup
              .sort((a, b) => (a.slide_index ?? 0) - (b.slide_index ?? 0))
              .map((item, idx) => (
                <div key={item.id} className="flex items-center gap-3 p-2 border border-border rounded-lg">
                  <span className="text-xs text-muted-foreground font-mono w-6">#{idx + 1}</span>
                  <img src={item.image_url} alt="" className="w-12 h-12 object-cover rounded" />
                  <Select
                    value={item.subtype || "none"}
                    onValueChange={(v) => {
                      setCarouselGroup(prev =>
                        prev.map(g => g.id === item.id ? { ...g, subtype: v === "none" ? null : v } : g)
                      );
                    }}
                  >
                    <SelectTrigger className="h-8 flex-1">
                      <SelectValue placeholder="Papel..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem papel</SelectItem>
                      {EXAMPLE_SUBTYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
          </div>
          <DialogFooter>
            <Button onClick={handleSaveCarouselOrganizer} size="sm">Salvar organização</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingExample} onOpenChange={(open) => { if (!open) setEditingExample(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar Exemplo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Formato</Label>
              <Select value={editType} onValueChange={setEditType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EXAMPLE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Papel do slide</Label>
              <Select value={editSubtype || "none"} onValueChange={(v) => setEditSubtype(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {EXAMPLE_SUBTYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Pilar editorial</Label>
              <Select
                value={editCategoryMode === "auto" ? "auto" : editCategoryId || "auto"}
                onValueChange={(v) => {
                  if (v === "auto") {
                    setEditCategoryMode("auto");
                    setEditCategoryId("");
                  } else {
                    setEditCategoryMode("manual");
                    setEditCategoryId(v);
                  }
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto (recomendado)</SelectItem>
                  {categories?.map((cat: any) => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Descrição</Label>
              <Input
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Descrição do exemplo"
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSaveEdit} disabled={updateExample.isPending} size="sm">
              {updateExample.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
