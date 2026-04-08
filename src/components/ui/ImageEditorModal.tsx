/**
 * ImageEditorModal — Reusable image manipulation modal.
 *
 * Features: pan (drag), zoom (scroll / buttons), rotate (90° steps), flip horizontal.
 * On confirm, uses Canvas to export the visible crop area as a JPEG File.
 *
 * Usage:
 *   <ImageEditorModal
 *     open={open}
 *     file={selectedFile}
 *     onConfirm={(file) => upload(file)}
 *     onCancel={() => setOpen(false)}
 *     aspectRatio={1}           // 1 = square, 16/9, 4/5, etc.  undefined = free (square default)
 *     title="Ajustar imagem"
 *   />
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RotateCcw, RotateCw, ZoomIn, ZoomOut, FlipHorizontal, Check, X } from "lucide-react";

interface ImageEditorModalProps {
  open: boolean;
  file: File | null;
  onConfirm: (editedFile: File) => void;
  onCancel: () => void;
  /** Width / Height ratio. Default 1 (square). */
  aspectRatio?: number;
  title?: string;
  /** Output filename. Defaults to original name with .jpg extension. */
  outputFilename?: string;
}

export default function ImageEditorModal({
  open,
  file,
  onConfirm,
  onCancel,
  aspectRatio = 1,
  title = "Ajustar imagem",
  outputFilename,
}: ImageEditorModalProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [rotation, setRotation] = useState(0); // 0 | 90 | 180 | 270
  const [flipH, setFlipH] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isExporting, setIsExporting] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const objectUrlRef = useRef<string | null>(null);

  // Load image from File
  useEffect(() => {
    if (!file || !open) return;

    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    setImageSrc(url);
    // Reset all transforms
    setScale(1);
    setOffsetX(0);
    setOffsetY(0);
    setRotation(0);
    setFlipH(false);

    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, [file, open]);

  // Auto-fit image to fill the container (cover) once it loads
  const handleImageLoad = useCallback(() => {
    if (!imageRef.current || !containerRef.current) return;
    const img = imageRef.current;
    const container = containerRef.current;
    const cW = container.offsetWidth;
    const cH = container.offsetHeight;
    const iW = img.naturalWidth;
    const iH = img.naturalHeight;
    const scaleToFill = Math.max(cW / iW, cH / iH);
    setScale(scaleToFill);
    setOffsetX(0);
    setOffsetY(0);
  }, []);

  // ── Drag (mouse) ──
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - offsetX, y: e.clientY - offsetY });
  }, [offsetX, offsetY]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    setOffsetX(e.clientX - dragStart.x);
    setOffsetY(e.clientY - dragStart.y);
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => setIsDragging(false), []);

  // ── Drag (touch) ──
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    setIsDragging(true);
    setDragStart({ x: e.touches[0].clientX - offsetX, y: e.touches[0].clientY - offsetY });
  }, [offsetX, offsetY]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;
    e.preventDefault();
    setOffsetX(e.touches[0].clientX - dragStart.x);
    setOffsetY(e.touches[0].clientY - dragStart.y);
  }, [isDragging, dragStart]);

  // ── Scroll zoom ──
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    setScale(s => Math.max(0.05, Math.min(15, s * factor)));
  }, []);

  // ── Button controls ──
  const zoomIn = () => setScale(s => Math.min(15, +(s * 1.15).toFixed(3)));
  const zoomOut = () => setScale(s => Math.max(0.05, +(s / 1.15).toFixed(3)));
  const rotateCW = () => setRotation(r => (r + 90) % 360);
  const rotateCCW = () => setRotation(r => (r - 90 + 360) % 360);
  const toggleFlip = () => setFlipH(f => !f);
  const resetAll = () => { setScale(1); setOffsetX(0); setOffsetY(0); setRotation(0); setFlipH(false); handleImageLoad(); };

  // ── Canvas export ──
  const handleConfirm = useCallback(async () => {
    if (!imageRef.current || !containerRef.current || !imageSrc) return;
    setIsExporting(true);

    try {
      const container = containerRef.current;
      const img = imageRef.current;
      const cW = container.offsetWidth;
      const cH = container.offsetHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2); // cap at 2x

      const canvas = document.createElement("canvas");
      canvas.width = Math.round(cW * dpr);
      canvas.height = Math.round(cH * dpr);
      const ctx = canvas.getContext("2d")!;
      ctx.scale(dpr, dpr);

      // Replicate the CSS transforms applied to the image
      ctx.save();
      ctx.translate(cW / 2 + offsetX, cH / 2 + offsetY);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(flipH ? -scale : scale, scale);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2, img.naturalWidth, img.naturalHeight);
      ctx.restore();

      canvas.toBlob(
        (blob) => {
          if (!blob) { setIsExporting(false); return; }
          const fname = outputFilename
            || (file?.name.replace(/\.[^.]+$/, ".jpg"))
            || "imagem.jpg";
          onConfirm(new File([blob], fname, { type: "image/jpeg" }));
          setIsExporting(false);
        },
        "image/jpeg",
        0.92,
      );
    } catch {
      setIsExporting(false);
    }
  }, [imageSrc, scale, offsetX, offsetY, rotation, flipH, file, outputFilename, onConfirm]);

  // CSS transform string applied to the image element
  const imgTransform = [
    `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`,
    `rotate(${rotation}deg)`,
    `scale(${flipH ? -scale : scale}, ${scale})`,
  ].join(" ");

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-3 border-b border-border/40">
          <DialogTitle className="text-base">{title}</DialogTitle>
        </DialogHeader>

        {/* ── Crop / preview area ── */}
        <div className="px-4 pt-4">
          <div
            ref={containerRef}
            className={`relative overflow-hidden rounded-xl bg-muted/60 border border-border/40 ${isDragging ? "cursor-grabbing" : "cursor-grab"} select-none`}
            style={{ width: "100%", aspectRatio: String(aspectRatio) }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={() => setIsDragging(false)}
            onWheel={handleWheel}
          >
            {/* Checkerboard for transparency */}
            <div className="absolute inset-0 opacity-20"
              style={{ backgroundImage: "linear-gradient(45deg,#ccc 25%,transparent 25%,transparent 75%,#ccc 75%),linear-gradient(45deg,#ccc 25%,transparent 25%,transparent 75%,#ccc 75%)", backgroundSize: "16px 16px", backgroundPosition: "0 0,8px 8px" }}
            />

            {imageSrc && (
              <img
                ref={imageRef}
                src={imageSrc}
                alt=""
                onLoad={handleImageLoad}
                draggable={false}
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  transform: imgTransform,
                  transformOrigin: "center center",
                  maxWidth: "none",
                  pointerEvents: "none",
                  userSelect: "none",
                }}
              />
            )}

            {/* Corner guides */}
            {["top-0 left-0", "top-0 right-0", "bottom-0 left-0", "bottom-0 right-0"].map((pos, i) => (
              <div key={i} className={`absolute ${pos} w-5 h-5 border-primary/70 ${i === 0 ? "border-t-2 border-l-2 rounded-tl" : i === 1 ? "border-t-2 border-r-2 rounded-tr" : i === 2 ? "border-b-2 border-l-2 rounded-bl" : "border-b-2 border-r-2 rounded-br"}`} />
            ))}
          </div>
        </div>

        {/* Hint */}
        <p className="text-center text-[10px] text-muted-foreground/50 mt-1.5 mb-0.5">
          Arraste para mover · Scroll para zoom
        </p>

        {/* ── Controls ── */}
        <div className="flex items-center justify-center gap-1.5 px-4 py-2">
          <Button size="icon" variant="outline" className="h-8 w-8" onClick={zoomOut} title="Reduzir">
            <ZoomOut className="w-3.5 h-3.5" />
          </Button>
          <span className="text-xs text-muted-foreground w-14 text-center tabular-nums">
            {Math.round(scale * 100)}%
          </span>
          <Button size="icon" variant="outline" className="h-8 w-8" onClick={zoomIn} title="Ampliar">
            <ZoomIn className="w-3.5 h-3.5" />
          </Button>

          <div className="w-px h-4 bg-border/60 mx-0.5" />

          <Button size="icon" variant="outline" className="h-8 w-8" onClick={rotateCCW} title="Girar esquerda">
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
          <Button size="icon" variant="outline" className="h-8 w-8" onClick={rotateCW} title="Girar direita">
            <RotateCw className="w-3.5 h-3.5" />
          </Button>

          <div className="w-px h-4 bg-border/60 mx-0.5" />

          <Button
            size="icon"
            variant="outline"
            className={`h-8 w-8 transition-colors ${flipH ? "border-primary text-primary bg-primary/5" : ""}`}
            onClick={toggleFlip}
            title="Espelhar horizontalmente"
          >
            <FlipHorizontal className="w-3.5 h-3.5" />
          </Button>

          <button
            onClick={resetAll}
            className="text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2 ml-1 transition-colors"
          >
            Resetar
          </button>
        </div>

        {/* ── Actions ── */}
        <div className="flex gap-2 px-4 pb-4">
          <Button variant="outline" className="flex-1 gap-1.5" onClick={onCancel}>
            <X className="w-3.5 h-3.5" />
            Cancelar
          </Button>
          <Button className="flex-1 gap-1.5" onClick={handleConfirm} disabled={isExporting || !imageSrc}>
            {isExporting
              ? <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              : <Check className="w-3.5 h-3.5" />
            }
            Confirmar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
