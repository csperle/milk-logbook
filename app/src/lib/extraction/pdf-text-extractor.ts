import fs from "node:fs";
import path from "node:path";
import { PDFParse } from "pdf-parse";
import { InvoiceExtractionError } from "@/lib/extraction/invoice-extraction-core";

function normalizeExtractedText(input: string): string {
  return input
    .replace(/\u0000/g, "")
    .replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, " ")
    .replace(/[^\S\r\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

let workerConfigured = false;

function ensurePdfWorkerConfigured() {
  if (workerConfigured) {
    return;
  }

  const workerCandidates = [
    path.join(process.cwd(), "node_modules/pdf-parse/dist/worker/pdf.worker.mjs"),
    path.join(process.cwd(), "node_modules/pdf-parse/dist/pdf-parse/cjs/pdf.worker.mjs"),
    path.join(process.cwd(), "node_modules/pdf-parse/dist/pdf-parse/esm/pdf.worker.mjs"),
  ];

  for (const candidate of workerCandidates) {
    if (fs.existsSync(candidate)) {
      PDFParse.setWorker(candidate);
      workerConfigured = true;
      return;
    }
  }
}

export async function extractTextFromPdfBuffer(buffer: Buffer): Promise<string> {
  ensurePdfWorkerConfigured();
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const text = normalizeExtractedText(result.text).slice(0, 200_000);
    if (text.length < 1) {
      throw new InvoiceExtractionError(
        "EXTRACTION_INVALID_OUTPUT",
        "Could not extract readable text from the PDF.",
      );
    }
    return text;
  } catch (error) {
    if (error instanceof InvoiceExtractionError) {
      throw error;
    }
    throw new InvoiceExtractionError(
      "EXTRACTION_INVALID_OUTPUT",
      `PDF text extraction failed: ${error instanceof Error ? error.message : "unknown error"}.`,
    );
  } finally {
    try {
      await parser.destroy();
    } catch {
      // best-effort cleanup only
    }
  }
}
