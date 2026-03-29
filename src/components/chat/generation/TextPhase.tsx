import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Check, RefreshCw, Pencil, ChevronRight } from "lucide-react";
import type { SlideData } from "@/hooks/useGenerationFlow";
import { cn } from "@/lib/utils";

interface TextPhaseProps {
  slides: SlideData[];
  isLoading: boolean;
  loadingMessage: string | null;
  onApproveText: (slideId: string, texts: { headline: string; body: string }) => void;
  onAllApproved: () => void;
  onRegenerateText: (slideId: string) => void;
  onCancel: () => void;
}

export default function TextPhase({
  slides,
  isLoading,
  loadingMessage,
  onApproveText,
  onAllApproved,
  onRegenerateText,
  onCancel,
}: TextPhaseProps) {
  const [currentSlideIdx, setCurrentSlideIdx] = useState(0);
  const [editMode, setEditMode] = useState<Record<string, boolean>>({});
  const [editHeadlines, setEditHeadlines] = useState<Record<string, string>>({});
  const [editBodies, setEditBodies] = useState<Record<string, string>>({});
  const [approvedSlides, setApprovedSlides] = useState<Set<string>>(new Set());

  // Initialize edit values from slide data
  useEffect(() => {
    const newHeadlines: Record<string, string> = {};
    const newBodies: Record<string, string> = {};
    slides.forEach((s) => {
      if (!editHeadlines[s.id]) newHeadlines[s.id] = s.headline || "";
      if (!editBodies[s.id]) newBodies[s.id] = s.body || "";
    });
    if (Object.keys(newHeadlines).length > 0) {
      setEditHeadlines((prev) => ({ ...prev, ...newHeadlines }));
      setEditBodies((prev) => ({ ...prev, ...newBodies }));
    }
  }, [slides]);

  // Check if all approved
  useEffect(() => {
    if (slides.length > 0 && approvedSlides.size === slides.length) {
      onAllApproved();
    }
  }, [approvedSlides, slides.length, onAllApproved]);

  if (isLoading || slides.length === 0) {
    return (
      <div className="bg-muted/50 border border-border rounded-xl p-4 my-2 animate-in fade-in slide-in-from-bottom-2">
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          <p className="text-sm text-foreground">
            {loadingMessage || "Gerando o texto com base no conteúdo... ✍️"}
          </p>
        </div>
      </div>
    );
  }

  const currentSlide = slides[currentSlideIdx];
  if (!currentSlide) return null;

  const isEditing = editMode[currentSlide.id] || false;
  const isApproved = approvedSlides.has(currentSlide.id);

  const handleApprove = () => {
    const headline = editHeadlines[currentSlide.id] || currentSlide.headline || "";
    const body = editBodies[currentSlide.id] || currentSlide.body || "";
    onApproveText(currentSlide.id, { headline, body });
    setApprovedSlides((prev) => new Set([...prev, currentSlide.id]));
    setEditMode((prev) => ({ ...prev, [currentSlide.id]: false }));
    // Auto-advance
    if (currentSlideIdx < slides.length - 1) {
      setCurrentSlideIdx((p) => p + 1);
    }
  };

  return (
    <div className="bg-muted/50 border border-border rounded-xl p-4 my-2 animate-in fade-in slide-in-from-bottom-2">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-foreground">
          Texto do Slide {currentSlideIdx + 1} de {slides.length}:
        </p>
        <div className="flex gap-1">
          {slides.map((s, idx) => (
            <div
              key={s.id}
              className={cn(
                "w-6 h-6 rounded-full text-[10px] flex items-center justify-center font-medium cursor-pointer transition-colors",
                idx === currentSlideIdx
                  ? "bg-primary text-primary-foreground"
                  : approvedSlides.has(s.id)
                    ? "bg-primary/20 text-primary"
                    : "bg-muted-foreground/20 text-muted-foreground"
              )}
              onClick={() => setCurrentSlideIdx(idx)}
            >
              {approvedSlides.has(s.id) ? <Check className="w-3 h-3" /> : idx + 1}
            </div>
          ))}
        </div>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        {/* Background preview thumbnail */}
        {currentSlide.selectedBackground && (
          <div className="h-20 overflow-hidden">
            <img
              src={currentSlide.selectedBackground}
              alt="Fundo"
              className="w-full h-full object-cover opacity-60"
            />
          </div>
        )}

        <div className="p-3 space-y-2">
          {isEditing ? (
            <>
              <div>
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Título</label>
                <Textarea
                  value={editHeadlines[currentSlide.id] || ""}
                  onChange={(e) => setEditHeadlines((prev) => ({ ...prev, [currentSlide.id]: e.target.value }))}
                  className="min-h-[40px] text-sm mt-1"
                  rows={2}
                />
              </div>
              <div>
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Corpo</label>
                <Textarea
                  value={editBodies[currentSlide.id] || ""}
                  onChange={(e) => setEditBodies((prev) => ({ ...prev, [currentSlide.id]: e.target.value }))}
                  className="min-h-[40px] text-sm mt-1"
                  rows={3}
                />
              </div>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-foreground">
                {editHeadlines[currentSlide.id] || currentSlide.headline || "(sem título)"}
              </p>
              <p className="text-xs text-muted-foreground">
                {editBodies[currentSlide.id] || currentSlide.body || "(sem corpo)"}
              </p>
            </>
          )}
        </div>
      </div>

      <div className="flex justify-between mt-3">
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="text-xs text-muted-foreground"
            onClick={() => onRegenerateText(currentSlide.id)}
          >
            <RefreshCw className="w-3 h-3 mr-1" />
            Regenerar texto
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-xs text-muted-foreground"
            onClick={() => setEditMode((prev) => ({ ...prev, [currentSlide.id]: !prev[currentSlide.id] }))}
          >
            <Pencil className="w-3 h-3 mr-1" />
            {isEditing ? "Visualizar" : "Editar"}
          </Button>
        </div>

        <div className="flex gap-2">
          <Button size="sm" variant="ghost" className="text-xs text-muted-foreground" onClick={onCancel}>
            Cancelar
          </Button>
          <Button
            size="sm"
            variant={isApproved ? "secondary" : "default"}
            className="text-xs"
            onClick={handleApprove}
            disabled={isApproved}
          >
            <Check className="w-3 h-3 mr-1" />
            {isApproved ? "Aprovado" : "Aprovar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
