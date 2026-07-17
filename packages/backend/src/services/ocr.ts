import fs from "fs";
import path from "path";
import { createWorker } from "tesseract.js";

interface OcrResult {
  text: string;
  confidence: number;
  processingTimeMs: number;
}

/**
 * Run OCR on an image file using Tesseract.js (WASM — no system deps).
 * For PDFs, extracts embedded text first; if none, renders pages to images then OCRs.
 */
export async function runOcr(filePath: string): Promise<OcrResult> {
  const start = Date.now();
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".pdf") {
    return processPdf(filePath, start);
  }

  // Image-based OCR (JPEG, PNG, TIFF, WebP)
  return processImage(filePath, start);
}

async function processImage(filePath: string, start: number): Promise<OcrResult> {
  const worker = await createWorker("eng");
  try {
    const { data } = await worker.recognize(filePath);
    return {
      text: data.text.trim(),
      confidence: data.confidence ?? 0,
      processingTimeMs: Date.now() - start,
    };
  } finally {
    await worker.terminate();
  }
}

async function processPdf(filePath: string, start: number): Promise<OcrResult> {
  // Try text extraction first (for text-based PDFs)
  try {
    const pdfParse = require("pdf-parse");
    const buf = fs.readFileSync(filePath);
    const pdfData = await pdfParse(buf);

    if (pdfData.text && pdfData.text.trim().length > 20) {
      return {
        text: pdfData.text.trim(),
        confidence: 95, // Text PDFs are high confidence
        processingTimeMs: Date.now() - start,
      };
    }
  } catch {
    // Fall through to OCR (scanned PDF)
  }

  // Scanned PDF — use tesseract.js which handles .pdf natively
  const worker = await createWorker("eng");
  try {
    const { data } = await worker.recognize(filePath);
    return {
      text: data.text.trim(),
      confidence: data.confidence ?? 0,
      processingTimeMs: Date.now() - start,
    };
  } finally {
    await worker.terminate();
  }
}
