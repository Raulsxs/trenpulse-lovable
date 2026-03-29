/**
 * TextBlockToolbar — Per-block editing controls for the selected text block.
 * Shows font size, max width, and text shadow controls specific to the selected block.
 */

import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Type, X, AlignLeft, AlignCenter } from "lucide-react";

interface OverlayStyle {
  headline_font_size?: number;
  body_font_size?: number;
  bullets_font_size?: number;
  max_width_pct?: number;
  headline_max_width_pct?: number;
  body_max_width_pct?: number;
  bullets_max_width_pct?: number;
  text_shadow_level?: number;
  text_align?: "left" | "center";
  font_scale?: number;
}

interface TextBlockToolbarProps {
  selectedBlock: string;
  overlayStyle: OverlayStyle;
  isFirstSlide: boolean;
  hasBullets: boolean;
  onStyleChange: (updates: Partial<OverlayStyle>) => void;
  onDeselect: () => void;
}

const BLOCK_LABELS: Record<string, string> = {
  headline: "Título",
  body: "Corpo",
  bullets: "Tópicos",
  footer: "Rodapé",
  cta: "CTA",
};

export default function TextBlockToolbar({
  selectedBlock,
  overlayStyle,
  isFirstSlide,
  hasBullets,
  onStyleChange,
  onDeselect,
}: TextBlockToolbarProps) {
  const label = BLOCK_LABELS[selectedBlock] || selectedBlock;

  // Get current values based on selected block
  const getFontSize = (): number => {
    switch (selectedBlock) {
      case "headline": return overlayStyle.headline_font_size || (isFirstSlide ? 52 : 44);
      case "body": return overlayStyle.body_font_size || 26;
      case "bullets": return overlayStyle.bullets_font_size || 24;
      default: return 18;
    }
  };

  const getFontRange = (): { min: number; max: number } => {
    switch (selectedBlock) {
      case "headline": return { min: 20, max: 80 };
      case "body": return { min: 14, max: 48 };
      case "bullets": return { min: 14, max: 40 };
      default: return { min: 10, max: 30 };
    }
  };

  const getMaxWidth = (): number => {
    const perBlock = (overlayStyle as any)?.[`${selectedBlock}_max_width_pct`];
    return perBlock || overlayStyle.max_width_pct || 90;
  };

  const handleFontSizeChange = (value: number) => {
    const key = `${selectedBlock}_font_size` as keyof OverlayStyle;
    onStyleChange({ [key]: value });
  };

  const handleMaxWidthChange = (value: number) => {
    const key = `${selectedBlock}_max_width_pct`;
    onStyleChange({ [key]: value } as any);
  };

  const handleAlignChange = (align: "left" | "center") => {
    onStyleChange({ text_align: align });
  };

  const fontRange = getFontRange();
  const currentSize = getFontSize();
  const currentWidth = getMaxWidth();
  const currentAlign = overlayStyle.text_align || "left";
  const shadowLevel = overlayStyle.text_shadow_level ?? 2;

  return (
    <Card className="shadow-card border-primary/20 bg-card">
      <CardContent className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-heading font-semibold text-foreground flex items-center gap-2">
            <Type className="w-4 h-4 text-primary" />
            Editando: <span className="text-primary">{label}</span>
          </h3>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onDeselect}
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Font Size */}
        {(selectedBlock === "headline" || selectedBlock === "body" || selectedBlock === "bullets") && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Tamanho da fonte: {currentSize}px
            </Label>
            <Slider
              min={fontRange.min}
              max={fontRange.max}
              step={2}
              value={[currentSize]}
              onValueChange={([v]) => handleFontSizeChange(v)}
            />
          </div>
        )}

        {/* Max Width */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">
            Largura: {currentWidth}%
          </Label>
          <Slider
            min={20}
            max={100}
            step={5}
            value={[currentWidth]}
            onValueChange={([v]) => handleMaxWidthChange(v)}
          />
        </div>

        {/* Alignment */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Alinhamento</Label>
          <div className="flex gap-1">
            <Button
              variant={currentAlign === "left" ? "default" : "outline"}
              size="sm"
              className="h-7 w-9 p-0"
              onClick={() => handleAlignChange("left")}
            >
              <AlignLeft className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant={currentAlign === "center" ? "default" : "outline"}
              size="sm"
              className="h-7 w-9 p-0"
              onClick={() => handleAlignChange("center")}
            >
              <AlignCenter className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Text Shadow */}
        <div className="space-y-1.5 pt-2 border-t border-border/30">
          <Label className="text-xs text-muted-foreground">
            Sombra: {["Nenhuma", "Leve", "Média", "Forte"][shadowLevel]}
          </Label>
          <Slider
            min={0}
            max={3}
            step={1}
            value={[shadowLevel]}
            onValueChange={([v]) => onStyleChange({ text_shadow_level: v })}
          />
        </div>
      </CardContent>
    </Card>
  );
}
