/**
 * Hook to capture slides as PNG using html-to-image (pixel-perfect match with frontend preview).
 * Used before publishing to Instagram/LinkedIn to ensure the published image matches exactly what the user sees.
 * Also supports PDF generation for LinkedIn documents.
 */
import { useState, useRef, useCallback } from "react";
import { toPng } from "html-to-image";
import { supabase } from "@/integrations/supabase/client";
import { getContentDimensions } from "@/lib/contentDimensions";
import { generatePdfFromSlides } from "@/lib/pdfGenerator";

export function useSlideCapture() {
  const [captureIndex, setCaptureIndex] = useState<number | null>(null);
  const captureRef = useRef<HTMLDivElement>(null);

  /** Capture the currently rendered slide (pointed to by captureRef) as a data URL. */
  const captureCurrentSlideDataUrl = useCallback(
    async (dims: { width: number; height: number }): Promise<string> => {
      return new Promise((resolve, reject) => {
        setTimeout(async () => {
          try {
            if (!captureRef.current) throw new Error("Capture ref not ready");
            const dataUrl = await toPng(captureRef.current, {
              width: dims.width,
              height: dims.height,
              pixelRatio: 1,
              quality: 0.95,
              cacheBust: true,
            });
            resolve(dataUrl);
          } catch (err) {
            reject(err);
          }
        }, 600);
      });
    },
    [],
  );

  /** Capture the currently rendered slide as a Blob. */
  const captureCurrentSlide = useCallback(
    async (dims: { width: number; height: number }): Promise<Blob> => {
      const dataUrl = await captureCurrentSlideDataUrl(dims);
      const res = await fetch(dataUrl);
      return res.blob();
    },
    [captureCurrentSlideDataUrl],
  );

  /**
   * Render every slide to PNG, upload to storage, and return public URLs.
   * The caller MUST include the OffScreenSlideRenderer in its JSX for this to work.
   */
  const renderAndUploadAllSlides = useCallback(
    async (
      slides: any[],
      contentType: string,
      contentId: string,
      platform: string = "instagram",
    ): Promise<string[]> => {
      const dims = getContentDimensions(platform, contentType);

      const urls: string[] = [];

      for (let i = 0; i < slides.length; i++) {
        setCaptureIndex(i);
        await new Promise((r) => setTimeout(r, 150));

        const blob = await captureCurrentSlide(dims);

        const path = `composite/${contentId}/slide_${i}_${Date.now()}.png`;
        const { error } = await supabase.storage
          .from("generated-images")
          .upload(path, blob, { contentType: "image/png", upsert: true });

        if (error) throw new Error(`Upload slide ${i}: ${error.message}`);

        const { data } = supabase.storage
          .from("generated-images")
          .getPublicUrl(path);

        urls.push(data.publicUrl);
      }

      setCaptureIndex(null);
      return urls;
    },
    [captureCurrentSlide],
  );

  /**
   * Render all slides to PNG, combine into PDF, upload to storage, and return the PDF URL.
   * Used for LinkedIn document publishing.
   */
  const renderAndUploadPdf = useCallback(
    async (
      slides: any[],
      contentType: string,
      contentId: string,
      platform: string = "linkedin",
    ): Promise<{ pdfUrl: string; compositeUrls: string[] }> => {
      const dims = getContentDimensions(platform, contentType);
      const dataUrls: string[] = [];
      const compositeUrls: string[] = [];

      // Render each slide and collect data URLs + upload PNGs
      for (let i = 0; i < slides.length; i++) {
        setCaptureIndex(i);
        await new Promise((r) => setTimeout(r, 150));

        const dataUrl = await captureCurrentSlideDataUrl(dims);
        dataUrls.push(dataUrl);

        // Also upload PNG composite
        const blob = await (await fetch(dataUrl)).blob();
        const pngPath = `composite/${contentId}/slide_${i}_${Date.now()}.png`;
        const { error } = await supabase.storage
          .from("generated-images")
          .upload(pngPath, blob, { contentType: "image/png", upsert: true });

        if (!error) {
          const { data } = supabase.storage.from("generated-images").getPublicUrl(pngPath);
          compositeUrls.push(data.publicUrl);
        }
      }

      setCaptureIndex(null);

      // Generate PDF from all slide PNGs
      const pdfBlob = await generatePdfFromSlides(dataUrls, dims);

      // Upload PDF to storage
      const pdfPath = `pdf/${contentId}/document_${Date.now()}.pdf`;
      const { error: pdfError } = await supabase.storage
        .from("generated-images")
        .upload(pdfPath, pdfBlob, { contentType: "application/pdf", upsert: true });

      if (pdfError) throw new Error(`Upload PDF: ${pdfError.message}`);

      const { data: pdfData } = supabase.storage
        .from("generated-images")
        .getPublicUrl(pdfPath);

      return { pdfUrl: pdfData.publicUrl, compositeUrls };
    },
    [captureCurrentSlideDataUrl, captureCurrentSlide],
  );

  return {
    /** Index of the slide currently being captured (null when idle) */
    captureIndex,
    /** Ref to attach to the off-screen render container */
    captureRef,
    /** Render all slides to PNG and upload to storage */
    renderAndUploadAllSlides,
    /** Render all slides to PDF (for LinkedIn documents) and upload to storage */
    renderAndUploadPdf,
  };
}
