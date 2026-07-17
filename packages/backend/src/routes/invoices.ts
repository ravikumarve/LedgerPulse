import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../index";
import { validate } from "../middleware/validate";
import { upload } from "../middleware/upload";
import { runOcr } from "../services/ocr";
import { extractInvoiceData } from "../services/extraction";
import path from "path";

const router = Router();

// --- Schemas ---
const createInvoiceSchema = z.object({
  vendorId: z.string().uuid(),
  invoiceNumber: z.string().min(1),
  invoiceDate: z.string().transform((s) => new Date(s)),
  totalAmount: z.number().positive(),
  taxAmount: z.number().optional(),
  lineItems: z.string().optional(), // JSON string
});

const updateStatusSchema = z.object({
  status: z.enum(["PENDING", "PROCESSED", "MATCHED", "DISCREPANCY", "RESOLVED"]),
});

// --- Routes ---

/**
 * GET /api/invoices — List invoices with filters
 */
router.get("/", async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const perPage = Math.min(100, Math.max(1, parseInt(req.query.perPage as string) || 20));
  const status = req.query.status as string;
  const vendorId = req.query.vendorId as string;
  const dateFrom = req.query.dateFrom as string;
  const dateTo = req.query.dateTo as string;

  const where: any = {};

  if (status) where.status = status;
  if (vendorId) where.vendorId = vendorId;
  if (dateFrom || dateTo) {
    where.invoiceDate = {};
    if (dateFrom) where.invoiceDate.gte = new Date(dateFrom);
    if (dateTo) where.invoiceDate.lte = new Date(dateTo);
  }

  const [data, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      include: { vendor: { select: { id: true, name: true, gstin: true } } },
      skip: (page - 1) * perPage,
      take: perPage,
      orderBy: { createdAt: "desc" },
    }),
    prisma.invoice.count({ where }),
  ]);

  res.json({
    data,
    meta: { page, perPage, total, totalPages: Math.ceil(total / perPage) },
  });
});

/**
 * POST /api/invoices/upload — Upload invoice file + run OCR pipeline
 */
router.post("/upload", upload.single("file"), async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: "No file provided", code: "VALIDATION_ERROR" });
    return;
  }

  const filePath = req.file.path;
  const vendorId = req.body.vendorId as string | undefined;

  // Run OCR
  const ocrResult = await runOcr(filePath);

  // Extract structured data
  const extracted = extractInvoiceData(ocrResult.text);

  // Create invoice record
  const invoice = await prisma.invoice.create({
    data: {
      vendorId: vendorId || "00000000-0000-0000-0000-000000000000",
      invoiceNumber: extracted.invoiceNumber || `OCR-${Date.now()}`,
      invoiceDate: extracted.invoiceDate ? new Date(extracted.invoiceDate) : new Date(),
      totalAmount: extracted.totalAmount ?? 0,
      taxAmount: extracted.taxAmount,
      lineItems: extracted.lineItems.length > 0 ? JSON.stringify(extracted.lineItems) : null,
      filePath,
      rawText: ocrResult.text,
      status: ocrResult.confidence >= 70 ? "PROCESSED" : "PENDING",
      processedAt: new Date(),
    },
  });

  res.status(201).json({
    data: invoice,
    meta: {
      ocrConfidence: ocrResult.confidence,
      extractionConfidence: extracted.confidence,
      processingTimeMs: ocrResult.processingTimeMs,
    },
  });
});

/**
 * POST /api/invoices — Create invoice manually
 */
router.post("/", validate(createInvoiceSchema), async (req: Request, res: Response) => {
  const invoice = await prisma.invoice.create({ data: req.body });
  res.status(201).json({ data: invoice });
});

/**
 * GET /api/invoices/:id — Get invoice detail
 */
router.get("/:id", async (req: Request, res: Response) => {
  const invoice = await prisma.invoice.findUnique({
    where: { id: req.params.id },
    include: {
      vendor: true,
      deliveryNotes: true,
      ewayBills: true,
      matchResults: true,
    },
  });
  if (!invoice) {
    res.status(404).json({ error: "Invoice not found", code: "NOT_FOUND" });
    return;
  }
  res.json({ data: invoice });
});

/**
 * PUT /api/invoices/:id/status — Update invoice status
 */
router.put("/:id/status", validate(updateStatusSchema), async (req: Request, res: Response) => {
  try {
    const invoice = await prisma.invoice.update({
      where: { id: req.params.id },
      data: { status: req.body.status },
    });
    res.json({ data: invoice });
  } catch (err: any) {
    if (err?.code === "P2025") {
      res.status(404).json({ error: "Invoice not found", code: "NOT_FOUND" });
      return;
    }
    throw err;
  }
});

/**
 * POST /api/invoices/:id/reprocess — Re-run OCR on an existing invoice file
 */
router.post("/:id/reprocess", async (req: Request, res: Response) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  if (!invoice) {
    res.status(404).json({ error: "Invoice not found", code: "NOT_FOUND" });
    return;
  }
  if (!invoice.filePath) {
    res.status(400).json({ error: "No file to reprocess", code: "NO_FILE" });
    return;
  }

  // Check file still exists
  const fs = await import("fs");
  if (!fs.existsSync(invoice.filePath)) {
    res.status(400).json({ error: "Original file no longer on disk", code: "FILE_MISSING" });
    return;
  }

  const ocrResult = await runOcr(invoice.filePath);
  const extracted = extractInvoiceData(ocrResult.text);

  const updated = await prisma.invoice.update({
    where: { id: req.params.id },
    data: {
      rawText: ocrResult.text,
      lineItems: extracted.lineItems.length > 0 ? JSON.stringify(extracted.lineItems) : undefined,
      totalAmount: extracted.totalAmount ?? undefined,
      taxAmount: extracted.taxAmount ?? undefined,
      invoiceNumber: extracted.invoiceNumber ?? undefined,
      status: ocrResult.confidence >= 70 ? "PROCESSED" : "PENDING",
      processedAt: new Date(),
    },
  });

  res.json({
    data: updated,
    meta: {
      ocrConfidence: ocrResult.confidence,
      extractionConfidence: extracted.confidence,
      processingTimeMs: ocrResult.processingTimeMs,
    },
  });
});

export default router;
