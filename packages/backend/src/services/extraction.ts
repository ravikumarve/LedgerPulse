/**
 * Extract structured data from OCR / raw text.
 * Uses regex patterns tuned for Indian invoice formats.
 * Returns structured fields + confidence score.
 */

export interface ExtractedInvoice {
  invoiceNumber: string | null;
  vendorName: string | null;
  invoiceDate: string | null;
  totalAmount: number | null;
  taxAmount: number | null;
  lineItems: ExtractedLineItem[];
  confidence: number; // 0–100
}

export interface ExtractedLineItem {
  sku: string | null;
  description: string | null;
  quantity: number | null;
  unitPrice: number | null;
  total: number | null;
}

/**
 * Common Indian invoice regex patterns
 */
const PATTERNS = {
  invoiceNumber: [
    /INV(?:OICE)?[-\s]*#?[:\s]*([A-Z0-9][-/A-Z0-9]{4,20})/i,
    /(?:Invoice|Bill|Tax\s*Invoice)\s*(?:No|Number|#|[.:])\s*[:\s]*([A-Z0-9][-/A-Z0-9]{4,20})/i,
    /([A-Z]{2,4}\d{4,10})/,
  ],
  vendorName: [
    /(?:(?:Vendor|Supplier|Seller|Sold\s*by|Bill\s*from)[:\s]*)\n?\s*(.+)/i,
    /^(.*?)(?:\n|$)/,
  ],
  invoiceDate: [
    /(?:Date|Invoice\s*Date)[:\s]*\n?\s*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
    /(\d{1,2}[-/]\d{1,2}[-/]20\d{2})/,
  ],
  totalAmount: [
    /(?:Total|Grand\s*Total|Amount\s*Payable|Net\s*Amount)[:\s]*[₹Rs.\s]*([\d,]+\.?\d{0,2})/i,
    /(?:TOTAL|NET\s*AMOUNT)[:\s]*([\d,]+\.?\d{0,2})/i,
  ],
  taxAmount: [
    /(?:GST|Tax|IGST|CGST|SGST)[:\s]*[₹Rs.\s]*([\d,]+\.?\d{0,2})/i,
    /(?:Total\s*Tax|Tax\s*Amount)[:\s]*[₹Rs.\s]*([\d,]+\.?\d{0,2})/i,
  ],
};

/**
 * Parse raw OCR text into structured invoice data.
 */
export function extractInvoiceData(rawText: string): ExtractedInvoice {
  const lines = rawText.split("\n").filter((l) => l.trim());

  const matchFirst = (patterns: RegExp[]): string | null => {
    for (const p of patterns) {
      const m = rawText.match(p);
      if (m?.[1]) return m[1].trim();
    }
    return null;
  };

  const parseAmount = (val: string | null): number | null => {
    if (!val) return null;
    const cleaned = val.replace(/[₹Rs,\s]/g, "");
    const n = parseFloat(cleaned);
    return isNaN(n) ? null : n;
  };

  const invoiceNumber = matchFirst(PATTERNS.invoiceNumber);
  const vendorName = matchFirst(PATTERNS.vendorName);
  const invoiceDate = matchFirst(PATTERNS.invoiceDate);
  const totalAmount = parseAmount(matchFirst(PATTERNS.totalAmount));
  const taxAmount = parseAmount(matchFirst(PATTERNS.taxAmount));

  // Extract line items (simple heuristic: rows with qty × price pattern)
  const lineItems: ExtractedLineItem[] = [];
  const itemPattern = /(\d+)\s*x\s*([₹Rs.]*[\d,]+\.?\d{0,2})/gi;
  let itemMatch: RegExpExecArray | null;
  while ((itemMatch = itemPattern.exec(rawText)) !== null) {
    lineItems.push({
      sku: null,
      description: null,
      quantity: parseInt(itemMatch[1], 10),
      unitPrice: parseAmount(itemMatch[2]),
      total: null,
    });
  }

  // Estimate confidence based on how many fields we extracted
  const foundFields = [invoiceNumber, vendorName, invoiceDate, totalAmount].filter(Boolean).length;
  const confidence = Math.min(100, Math.round((foundFields / 4) * 100) + (lineItems.length > 0 ? 10 : 0));

  return {
    invoiceNumber,
    vendorName,
    invoiceDate,
    totalAmount,
    taxAmount,
    lineItems,
    confidence,
  };
}
