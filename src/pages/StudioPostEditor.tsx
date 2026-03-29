import { useState, useMemo, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useImageLayoutParams } from "@/hooks/useImageLayoutParams";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { 
  usePost, 
  useUpdateSlide,
  useGenerateBrief, 
  useBuildPrompts, 
  useGenerateImages, 
  useRankAndSelect,
  useSelectImage,
  useSubmitFeedback
} from "@/hooks/useStudio";
import { LAYOUT_PRESETS } from "@/types/studio";
import type { Slide, ImageGeneration } from "@/types/studio";
import { 
  ArrowLeft, 
  Sparkles, 
  Image as ImageIcon, 
  FileText, 
  RefreshCw,
  Check,
  ThumbsUp,
  ThumbsDown,
  Zap,
  Crown,
  Loader2
} from "lucide-react";

export default function StudioPostEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: post, isLoading, refetch } = usePost(id!);
  
  const [selectedSlideIndex, setSelectedSlideIndex] = useState(0);
  const [qualityTier, setQualityTier] = useState<'cheap' | 'high'>('cheap');
  
  const generateBrief = useGenerateBrief();
  const buildPrompts = useBuildPrompts();
  const generateImages = useGenerateImages();
  const rankAndSelect = useRankAndSelect();
  const selectImage = useSelectImage();
  const updateSlide = useUpdateSlide();
  const submitFeedback = useSubmitFeedback();

  const selectedSlide = post?.slides?.[selectedSlideIndex];
  const isCoverSlide = selectedSlideIndex === 0;

  const selectedImageId = selectedSlide?.selected_image?.id ?? null;
  const { imageLayoutParams, isAnalyzing, refresh: refreshLayout } = useImageLayoutParams(
    selectedSlide?.id,
    selectedImageId
  );

  // Toast when layout analysis completes
  const prevAnalyzing = useRef(false);
  useEffect(() => {
    if (prevAnalyzing.current && !isAnalyzing && imageLayoutParams) {
      toast.success("Layout otimizado automaticamente ✓");
    }
    prevAnalyzing.current = isAnalyzing;
  }, [isAnalyzing, imageLayoutParams]);

  // Compute text overlay style based on layout analysis
  const textOverlayStyle = useMemo(() => {
    if (!imageLayoutParams) return null;
    const pos = imageLayoutParams.suggested_text_position || "bottom";
    const opacity = imageLayoutParams.suggested_overlay_opacity ?? 0.5;
    const isDark = imageLayoutParams.brightness === "dark";
    
    const baseStyle: React.CSSProperties = {
      position: "absolute",
      padding: "1.5rem",
      width: "100%",
    };

    // Position
    if (pos.includes("top")) {
      baseStyle.top = 0;
    } else if (pos.includes("bottom") || pos === "center") {
      baseStyle.bottom = 0;
    } else {
      baseStyle.bottom = 0;
    }

    // Text color based on brightness
    baseStyle.color = isDark ? "#ffffff" : "#1a1a2e";

    return { style: baseStyle, overlayOpacity: opacity, isDark };
  }, [imageLayoutParams]);

  const isGenerating = generateBrief.isPending || buildPrompts.isPending || generateImages.isPending || rankAndSelect.isPending;


  // Full pipeline: Brief -> Prompts -> Images -> Rank
  const handleFullGenerate = async () => {
    if (!selectedSlide) return;
    
    const tier = isCoverSlide ? 'high' : qualityTier;
    
    await generateBrief.mutateAsync(selectedSlide.id);
    await buildPrompts.mutateAsync(selectedSlide.id);
    await generateImages.mutateAsync({ slideId: selectedSlide.id, qualityTier: tier, nVariations: 2 });
    await rankAndSelect.mutateAsync(selectedSlide.id);
    
    refetch();
  };

  const handleRegenerateBrief = async () => {
    if (!selectedSlide) return;
    await generateBrief.mutateAsync(selectedSlide.id);
    refetch();
  };

  const handleRegeneratePrompts = async () => {
    if (!selectedSlide) return;
    await buildPrompts.mutateAsync(selectedSlide.id);
    refetch();
  };

  const handleRegenerateImages = async () => {
    if (!selectedSlide) return;
    const tier = isCoverSlide ? 'high' : qualityTier;
    await generateImages.mutateAsync({ slideId: selectedSlide.id, qualityTier: tier, nVariations: 2 });
    await rankAndSelect.mutateAsync(selectedSlide.id);
    refetch();
  };

  const handleSelectImage = async (imageId: string) => {
    if (!selectedSlide) return;
    await selectImage.mutateAsync({ slideId: selectedSlide.id, imageId });
    refetch();
  };

  const handleFeedback = async (imageId: string, vote: 'up' | 'down') => {
    await submitFeedback.mutateAsync({ image_generation_id: imageId, vote });
  };

  const handleUpdateSlideText = async (text: string) => {
    if (!selectedSlide) return;
    await updateSlide.mutateAsync({ id: selectedSlide.id, slide_text: text });
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <Skeleton className="h-12 w-64" />
          <div className="grid grid-cols-12 gap-4 h-[calc(100vh-200px)]">
            <Skeleton className="col-span-2 h-full" />
            <Skeleton className="col-span-6 h-full" />
            <Skeleton className="col-span-4 h-full" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-heading font-bold text-foreground">
                Editor de Slides
              </h1>
              <p className="text-sm text-muted-foreground line-clamp-1">
                {post?.raw_post_text.substring(0, 60)}...
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 mr-4">
              <Label className="text-sm">Qualidade:</Label>
              <Select value={qualityTier} onValueChange={(v) => setQualityTier(v as any)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cheap">
                    <span className="flex items-center gap-2">
                      <Zap className="w-3 h-3" />
                      Rápido
                    </span>
                  </SelectItem>
                  <SelectItem value="high">
                    <span className="flex items-center gap-2">
                      <Crown className="w-3 h-3" />
                      Alta Qualidade
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button 
              onClick={handleFullGenerate} 
              disabled={isGenerating || !selectedSlide}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Gerar Tudo
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Three Column Layout */}
        <div className="grid grid-cols-12 gap-4 h-[calc(100vh-220px)]">
          {/* Left: Slide List */}
          <div className="col-span-2">
            <Card className="h-full">
              <CardHeader className="py-3 px-3">
                <CardTitle className="text-sm">Slides</CardTitle>
              </CardHeader>
              <ScrollArea className="h-[calc(100%-60px)]">
                <div className="space-y-2 p-2">
                  {post?.slides?.map((slide, index) => (
                    <div
                      key={slide.id}
                      className={`relative cursor-pointer rounded-lg border-2 p-2 transition-all ${
                        selectedSlideIndex === index 
                          ? 'border-primary bg-primary/5' 
                          : 'border-border hover:border-primary/50'
                      }`}
                      onClick={() => setSelectedSlideIndex(index)}
                    >
                      {/* Thumbnail */}
                      <div className="aspect-square bg-muted rounded-md mb-2 overflow-hidden">
                        {slide.selected_image?.image_url ? (
                          <img 
                            src={slide.selected_image.image_url} 
                            alt={`Slide ${index + 1}`}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <ImageIcon className="w-6 h-6 text-muted-foreground/50" />
                          </div>
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">
                          {index === 0 ? 'Capa' : `Slide ${index + 1}`}
                        </span>
                        {slide.visual_brief && (
                          <Badge variant="secondary" className="text-[10px] px-1">
                            Brief
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </Card>
          </div>

          {/* Center: Canvas Preview */}
          <div className="col-span-6">
            <Card className="h-full">
              <CardHeader className="py-3 px-4 border-b">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">
                    Preview - {isCoverSlide ? 'Capa' : `Slide ${selectedSlideIndex + 1}`}
                  </CardTitle>
                  <Select 
                    value={selectedSlide?.layout_preset || 'default'}
                    onValueChange={(v) => selectedSlide && updateSlide.mutate({ id: selectedSlide.id, layout_preset: v })}
                  >
                    <SelectTrigger className="w-[140px] h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LAYOUT_PRESETS.map((preset) => (
                        <SelectItem key={preset.value} value={preset.value}>
                          {preset.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="p-4 flex items-center justify-center h-[calc(100%-60px)]">
                <div className="relative aspect-square w-full max-w-md bg-muted rounded-lg overflow-hidden shadow-lg">
                  {selectedSlide?.selected_image?.image_url ? (
                    <img 
                      src={selectedSlide.selected_image.image_url} 
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                      <ImageIcon className="w-16 h-16 mb-4 opacity-50" />
                      <p className="text-sm">Clique em "Gerar Tudo" para criar a imagem</p>
                    </div>
                  )}
                  
                  {/* Text Overlay Preview - positioned by layout analysis */}
                  {selectedSlide?.slide_text && selectedSlide?.selected_image?.image_url && (
                    <div 
                      className="absolute inset-x-0 flex items-end p-4"
                      style={textOverlayStyle?.style || { position: 'absolute', bottom: 0, width: '100%', padding: '1.5rem' }}
                    >
                      <div 
                        className="backdrop-blur-sm rounded-lg p-4 w-full"
                        style={{ 
                          backgroundColor: textOverlayStyle?.isDark 
                            ? `rgba(0,0,0,${textOverlayStyle.overlayOpacity})` 
                            : `rgba(0,0,0,0.6)` 
                        }}
                      >
                        <p className="text-sm font-medium line-clamp-3" style={{ color: '#ffffff' }}>
                          {selectedSlide.slide_text}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Layout analyzing indicator */}
                  {isAnalyzing && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-background/90 backdrop-blur-sm rounded-full px-3 py-1.5 shadow-sm cursor-help">
                            <Loader2 className="w-3 h-3 animate-spin text-primary" />
                            <span className="text-xs text-muted-foreground">Ajustando layout...</span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-[220px]">
                          <p className="text-xs">A IA está analisando a imagem para posicionar o texto na área mais limpa do fundo</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}

                  {/* Reset layout button */}
                  {!isAnalyzing && imageLayoutParams && (
                    <button
                      onClick={refreshLayout}
                      className="absolute top-2 right-2 flex items-center gap-1.5 bg-background/80 backdrop-blur-sm rounded-full px-2.5 py-1 shadow-sm hover:bg-background transition-colors"
                      title="Resetar layout"
                    >
                      <RefreshCw className="w-3 h-3 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground">Resetar</span>
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right: Art Direction Panel */}
          <div className="col-span-4">
            <Card className="h-full">
              <CardHeader className="py-3 px-4 border-b">
                <CardTitle className="text-sm">Direção de Arte</CardTitle>
              </CardHeader>
              <ScrollArea className="h-[calc(100%-50px)]">
                <div className="p-4">
                  <Tabs defaultValue="text" className="w-full">
                    <TabsList className="w-full grid grid-cols-4">
                      <TabsTrigger value="text" className="text-xs">Texto</TabsTrigger>
                      <TabsTrigger value="brief" className="text-xs">Brief</TabsTrigger>
                      <TabsTrigger value="prompts" className="text-xs">Prompts</TabsTrigger>
                      <TabsTrigger value="images" className="text-xs">Imagens</TabsTrigger>
                    </TabsList>
                    
                    {/* Text Tab */}
                    <TabsContent value="text" className="mt-4 space-y-4">
                      <div className="space-y-2">
                        <Label>Texto do Slide</Label>
                        <Textarea
                          value={selectedSlide?.slide_text || ''}
                          onChange={(e) => handleUpdateSlideText(e.target.value)}
                          rows={6}
                          placeholder="Texto que aparecerá no slide..."
                        />
                      </div>
                    </TabsContent>
                    
                    {/* Brief Tab */}
                    <TabsContent value="brief" className="mt-4 space-y-4">
                      {selectedSlide?.visual_brief ? (
                        <>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label className="text-xs text-muted-foreground">Tema</Label>
                              <p className="text-sm">{selectedSlide.visual_brief.theme || '-'}</p>
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">Emoção</Label>
                              <p className="text-sm">{selectedSlide.visual_brief.emotion || '-'}</p>
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">Estilo</Label>
                              <p className="text-sm">{selectedSlide.visual_brief.style || '-'}</p>
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">Metáfora</Label>
                              <p className="text-sm">{selectedSlide.visual_brief.visual_metaphor || '-'}</p>
                            </div>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Mensagem Chave</Label>
                            <p className="text-sm">{selectedSlide.visual_brief.key_message || '-'}</p>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Composição</Label>
                            <p className="text-sm">{selectedSlide.visual_brief.composition_notes || '-'}</p>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                              <Switch checked={selectedSlide.visual_brief.text_on_image} disabled />
                              <Label className="text-xs">Texto na imagem</Label>
                            </div>
                          </div>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={handleRegenerateBrief}
                            disabled={generateBrief.isPending}
                          >
                            <RefreshCw className={`w-3 h-3 mr-2 ${generateBrief.isPending ? 'animate-spin' : ''}`} />
                            Regenerar Brief
                          </Button>
                        </>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          <FileText className="w-10 h-10 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">Nenhum brief gerado ainda</p>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="mt-2"
                            onClick={handleRegenerateBrief}
                            disabled={generateBrief.isPending}
                          >
                            Gerar Brief
                          </Button>
                        </div>
                      )}
                    </TabsContent>
                    
                    {/* Prompts Tab */}
                    <TabsContent value="prompts" className="mt-4 space-y-4">
                      {selectedSlide?.image_prompts && selectedSlide.image_prompts.length > 0 ? (
                        <>
                          {selectedSlide.image_prompts.map((prompt, i) => (
                            <div key={prompt.id} className="p-3 border rounded-lg space-y-2">
                              <div className="flex items-center justify-between">
                                <Badge variant="outline">Variante {i + 1}</Badge>
                                <Badge variant={prompt.model_hint === 'high' ? 'default' : 'secondary'}>
                                  {prompt.model_hint === 'high' ? 'Alta' : 'Rápido'}
                                </Badge>
                              </div>
                              <p className="text-xs line-clamp-3">{prompt.prompt}</p>
                            </div>
                          ))}
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={handleRegeneratePrompts}
                            disabled={buildPrompts.isPending}
                          >
                            <RefreshCw className={`w-3 h-3 mr-2 ${buildPrompts.isPending ? 'animate-spin' : ''}`} />
                            Regenerar Prompts
                          </Button>
                        </>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          <Sparkles className="w-10 h-10 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">Nenhum prompt gerado ainda</p>
                          <p className="text-xs">Gere o Brief primeiro</p>
                        </div>
                      )}
                    </TabsContent>
                    
                    {/* Images Tab */}
                    <TabsContent value="images" className="mt-4 space-y-4">
                      {selectedSlide?.image_generations && selectedSlide.image_generations.length > 0 ? (
                        <>
                          <div className="grid grid-cols-2 gap-2">
                            {selectedSlide.image_generations.map((gen) => (
                              <div 
                                key={gen.id} 
                                className={`relative rounded-lg overflow-hidden border-2 cursor-pointer transition-all ${
                                  gen.is_selected ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-primary/50'
                                }`}
                                onClick={() => handleSelectImage(gen.id)}
                              >
                                <img 
                                  src={gen.thumb_url || gen.image_url || ''} 
                                  alt="Generated"
                                  className="w-full aspect-square object-cover"
                                />
                                {gen.is_selected && (
                                  <div className="absolute top-1 right-1 bg-primary text-primary-foreground rounded-full p-1">
                                    <Check className="w-3 h-3" />
                                  </div>
                                )}
                                {gen.ranking_score && (
                                  <div className="absolute bottom-1 left-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded">
                                    Score: {gen.ranking_score}
                                  </div>
                                )}
                                <div className="absolute bottom-1 right-1 flex gap-1">
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); handleFeedback(gen.id, 'up'); }}
                                    className="bg-green-500/80 text-white p-1 rounded hover:bg-green-600"
                                  >
                                    <ThumbsUp className="w-3 h-3" />
                                  </button>
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); handleFeedback(gen.id, 'down'); }}
                                    className="bg-red-500/80 text-white p-1 rounded hover:bg-red-600"
                                  >
                                    <ThumbsDown className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={handleRegenerateImages}
                            disabled={generateImages.isPending || rankAndSelect.isPending}
                          >
                            <RefreshCw className={`w-3 h-3 mr-2 ${(generateImages.isPending || rankAndSelect.isPending) ? 'animate-spin' : ''}`} />
                            Regenerar Imagens
                          </Button>
                        </>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          <ImageIcon className="w-10 h-10 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">Nenhuma imagem gerada ainda</p>
                          <p className="text-xs">Gere os prompts primeiro</p>
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                </div>
              </ScrollArea>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
