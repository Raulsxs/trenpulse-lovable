import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bug, ChevronDown, ChevronUp, Clock, Cpu, Layers, Palette } from "lucide-react";
import { cn } from "@/lib/utils";

interface GenerationMetadata {
  text_model?: string;
  text_generation_ms?: number;
  slide_count?: number;
  content_style?: string;
  visual_mode?: string;
  template_set_name?: string | null;
  template_set_id?: string | null;
  bg_style?: string;
  include_cta?: boolean;
  generated_at?: string;
  image_generations?: {
    slideIndex: number;
    image_model?: string;
    image_generation_ms?: number;
    references_used?: number;
    fallback_level?: string;
    generated_at?: string;
  }[];
  [key: string]: any;
}

interface GenerationDebugPanelProps {
  metadata: GenerationMetadata | null;
}

const GenerationDebugPanel = ({ metadata }: GenerationDebugPanelProps) => {
  const [expanded, setExpanded] = useState(false);

  if (!metadata) return null;

  const formatMs = (ms?: number) => {
    if (!ms) return "—";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatDate = (iso?: string) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" });
    } catch { return iso; }
  };

  return (
    <Card className="shadow-card border-border/50">
      <CardContent className="p-0">
        <Button
          variant="ghost"
          className="w-full flex items-center justify-between p-4 h-auto"
          onClick={() => setExpanded(!expanded)}
        >
          <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Bug className="w-4 h-4" />
            Debug & Observabilidade
          </span>
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </Button>

        {expanded && (
          <div className="px-4 pb-4 space-y-4 animate-fade-in">
            {/* Text Generation */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Geração de Texto</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <MetricBadge icon={<Cpu className="w-3 h-3" />} label="Modelo" value={metadata.text_model || "—"} />
                <MetricBadge icon={<Clock className="w-3 h-3" />} label="Tempo" value={formatMs(metadata.text_generation_ms)} />
                <MetricBadge icon={<Layers className="w-3 h-3" />} label="Slides" value={String(metadata.slide_count || "—")} />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <MetricBadge label="Estilo" value={metadata.content_style || "—"} />
                <MetricBadge label="Modo Visual" value={metadata.visual_mode || "—"} />
                <MetricBadge label="CTA" value={metadata.include_cta ? "Sim" : "Não"} />
              </div>
              {metadata.template_set_name && (
                <MetricBadge icon={<Palette className="w-3 h-3" />} label="Template Set" value={metadata.template_set_name} />
              )}
              <p className="text-xs text-muted-foreground">Gerado em: {formatDate(metadata.generated_at)}</p>
            </div>

            {/* Image Generations */}
            {metadata.image_generations && metadata.image_generations.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Geração de Imagens</h4>
                <div className="space-y-1">
                  {metadata.image_generations.map((img, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded px-2 py-1">
                      <span className="font-mono font-medium">Slide {img.slideIndex + 1}</span>
                      <span>•</span>
                      <span>{formatMs(img.image_generation_ms)}</span>
                      <span>•</span>
                      <span>{img.references_used || 0} refs</span>
                      {img.fallback_level && (
                        <>
                          <span>•</span>
                          <Badge variant="outline" className="text-[10px] h-4 px-1">{img.fallback_level}</Badge>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Raw JSON toggle */}
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Ver JSON completo</summary>
              <pre className="mt-2 p-2 bg-muted/50 rounded text-[10px] overflow-x-auto max-h-48">
                {JSON.stringify(metadata, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const MetricBadge = ({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) => (
  <div className="flex items-center gap-1.5 text-xs bg-muted/30 rounded px-2 py-1.5">
    {icon}
    <span className="text-muted-foreground">{label}:</span>
    <span className="font-medium text-foreground truncate">{value}</span>
  </div>
);

export default GenerationDebugPanel;
