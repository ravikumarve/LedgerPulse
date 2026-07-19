import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../index";
import { validate } from "../middleware/validate";
import { upload } from "../middleware/upload";
import { runOcr } from "../services/ocr";

const router = Router();

// --- Schemas ---
const createDeliveryNoteSchema = z.object({
  organizationId: z.string().uuid(),
  vendorId: z.string().uuid(),
  deliveryNoteNumber: z.string().min(1),
  deliveryDate: z.string().transform((s) => new Date(s)),
  invoiceId: z.string().uuid().optional(),
  totalQuantity: z.number().nonnegative(),
  lineItems: z.string().optional(),
  weightbridgeValue: z.number().nonnegative().optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(["PENDING", "PROCESSED", "MATCHED", "DISCREPANCY", "RESOLVED"]),
});

// --- Routes ---

/**
 * GET /api/delivery-notes — List delivery notes with filters
 */
router.get("/", async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const perPage = Math.min(100, Math.max(1, parseInt(req.query.perPage as string) || 20));
  const status = req.query.status as string;
  const vendorId = req.query.vendorId as string;

  const where: any = {};
  if (status) where.status = status;
  if (vendorId) where.vendorId = vendorId;

  const [data, total] = await Promise.all([
    prisma.deliveryNote.findMany({
      where,
      include: { vendor: { select: { id: true, name: true } } },
      skip: (page - 1) * perPage,
      take: perPage,
      orderBy: { createdAt: "desc" },
    }),
    prisma.deliveryNote.count({ where }),
  ]);

  res.json({
    data,
    meta: { page, perPage, total, totalPages: Math.ceil(total / perPage) },
  });
});

/**
 * POST /api/delivery-notes/upload — Upload delivery note file + OCR
 */
router.post("/upload", upload.single("file"), async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: "No file provided", code: "VALIDATION_ERROR" });
    return;
  }

  const filePath = req.file.path;
  const vendorId = req.body.vendorId as string;
  const organizationId = req.body.organizationId as string;

  // Run OCR
  const ocrResult = await runOcr(filePath);

  const deliveryNote = await prisma.deliveryNote.create({
    data: {
      organizationId: organizationId || "00000000-0000-0000-0000-000000000000",
      vendorId: vendorId || "00000000-0000-0000-0000-000000000000",
      deliveryNoteNumber: `OCR-DN-${Date.now()}`,
      deliveryDate: new Date(),
      totalQuantity: 0,
      filePath,
      rawText: ocrResult.text,
      status: ocrResult.confidence >= 70 ? "PROCESSED" : "PENDING",
      processedAt: new Date(),
    },
  });

  res.status(201).json({
    data: deliveryNote,
    meta: {
      ocrConfidence: ocrResult.confidence,
      processingTimeMs: ocrResult.processingTimeMs,
    },
  });
});

/**
 * POST /api/delivery-notes — Create delivery note manually
 */
router.post("/", validate(createDeliveryNoteSchema), async (req: Request, res: Response) => {
  const deliveryNote = await prisma.deliveryNote.create({ data: req.body });
  res.status(201).json({ data: deliveryNote });
});

/**
 * GET /api/delivery-notes/:id — Get delivery note detail
 */
router.get("/:id", async (req: Request, res: Response) => {
  const deliveryNote = await prisma.deliveryNote.findUnique({
    where: { id: req.params.id },
    include: { vendor: true, invoice: true },
  });
  if (!deliveryNote) {
    res.status(404).json({ error: "Delivery note not found", code: "NOT_FOUND" });
    return;
  }
  res.json({ data: deliveryNote });
});

/**
 * PUT /api/delivery-notes/:id/status — Update status
 */
router.put("/:id/status", validate(updateStatusSchema), async (req: Request, res: Response) => {
  try {
    const dn = await prisma.deliveryNote.update({
      where: { id: req.params.id },
      data: { status: req.body.status },
    });
    res.json({ data: dn });
  } catch (err: any) {
    if (err?.code === "P2025") {
      res.status(404).json({ error: "Delivery note not found", code: "NOT_FOUND" });
      return;
    }
    throw err;
  }
});

export default router;
