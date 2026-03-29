/**
 * Client-side PDF generation from rendered slide PNGs.
 * Combines multiple slide images into a multi-page PDF document
 * for LinkedIn's native document/carousel upload.
 */
import { jsPDF } from "jspdf";

/**
 * Generate a PDF from an array of PNG data URLs (base64).
 * Each image becomes a full-page in the PDF.
 */
export async function generatePdfFromSlides(
  pngDataUrls: string[],
  dimensions: { width: number; height: number },
): Promise<Blob> {
  // Convert px to mm (at 72 DPI baseline, then scale for quality)
  // We use the actual pixel dimensions as mm values divided by a factor
  // to keep the PDF compact while maintaining sharp rendering.
  const scaleFactor = 3; // px to mm ratio
  const pageWidth = dimensions.width / scaleFactor;
  const pageHeight = dimensions.height / scaleFactor;

  const pdf = new jsPDF({
    orientation: pageHeight > pageWidth ? "portrait" : "landscape",
    unit: "mm",
    format: [pageWidth, pageHeight],
    compress: true,
  });

  for (let i = 0; i < pngDataUrls.length; i++) {
    if (i > 0) {
      pdf.addPage([pageWidth, pageHeight], pageHeight > pageWidth ? "portrait" : "landscape");
    }
    pdf.addImage(pngDataUrls[i], "PNG", 0, 0, pageWidth, pageHeight, undefined, "FAST");
  }

  return pdf.output("blob");
}

/**
 * Trigger a browser download of a PDF blob.
 */
export function downloadPdf(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
