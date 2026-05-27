/**
 * Extract plain text from documents (PDF, DOCX, TXT/MD) client-side.
 * Used by the chat to convert dragged documents into a briefing prompt.
 */
import mammoth from "mammoth";

export const SUPPORTED_DOC_EXTENSIONS = [".pdf", ".docx", ".txt", ".md"];
export const SUPPORTED_DOC_MIMES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
];

export function isSupportedDocument(file: File): boolean {
  const name = file.name.toLowerCase();
  if (SUPPORTED_DOC_EXTENSIONS.some((ext) => name.endsWith(ext))) return true;
  return SUPPORTED_DOC_MIMES.includes(file.type);
}

async function extractPdf(file: File): Promise<string> {
  // Lazy import to keep initial bundle small
  const pdfjs: any = await import("pdfjs-dist/build/pdf.mjs");
  const workerSrc = (await import("pdfjs-dist/build/pdf.worker.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const parts: string[] = [];
  const maxPages = Math.min(pdf.numPages, 30); // safety cap
  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((it: any) => ("str" in it ? it.str : "")).join(" ");
    parts.push(text);
  }
  return parts.join("\n\n").trim();
}

async function extractDocx(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buf });
  return (result.value || "").trim();
}

async function extractTxt(file: File): Promise<string> {
  return (await file.text()).trim();
}

export async function extractDocumentText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf") || file.type === "application/pdf") return extractPdf(file);
  if (name.endsWith(".docx")) return extractDocx(file);
  return extractTxt(file);
}

/** Truncate to keep prompts within reasonable size (~12k chars ≈ ~3k tokens). */
export function truncateForPrompt(text: string, max = 12000): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "\n\n[...documento truncado]";
}
