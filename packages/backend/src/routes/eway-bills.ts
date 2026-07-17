import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../index";
import { validate } from "../middleware/validate";

const router = Router();

// ── Schemas ─────────────────────────────────────────────────────────

const createEWayBillSchema = z.object({
  ewayBillNumber: z.string().min(1),
  invoiceId: z.string().uuid().optional(),
  generatedDate: z.string().transform((s) => new Date(s)),
  validUntil: z.string().transform((s) => new Date(s)),
  fromGstin: z.string().min(1),
  toGstin: z.string().min(1),
  totalValue: z.number().nonnegative(),
  transportMode: z.string().optional(),
  vehicleNumber: z.string().optional(),
});

const syncEWayBillSchema = z.object({
  fromDate: z.string().transform((s) => new Date(s)),
  toDate: z.string().transform((s) => new Date(s)).optional(),
  limit: z.number().int().positive().max(100).optional().default(50),
});

// ── Routes ──────────────────────────────────────────────────────────

/**
 * GET /api/eway-bills — List E-Way Bills with filters
 */
router.get("/", async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const perPage = Math.min(100, Math.max(1, parseInt(req.query.perPage as string) || 20));
  const status = req.query.status as string;
  const invoiceId = req.query.invoiceId as string;
  const q = req.query.q as string;

  const where: any = {};
  if (status) where.status = status;
  if (invoiceId) where.invoiceId = invoiceId;
  if (q) where.ewayBillNumber = { contains: q };

  const [data, total] = await Promise.all([
    prisma.eWayBill.findMany({
      where,
      include: {
        invoice: { select: { id: true, invoiceNumber: true } },
      },
      skip: (page - 1) * perPage,
      take: perPage,
      orderBy: { createdAt: "desc" },
    }),
    prisma.eWayBill.count({ where }),
  ]);

  res.json({
    data,
    meta: { page, perPage, total, totalPages: Math.ceil(total / perPage) },
  });
});

/**
 * POST /api/eway-bills — Create E-Way Bill manually
 */
router.post("/", validate(createEWayBillSchema), async (req: Request, res: Response) => {
  try {
    const ewayBill = await prisma.eWayBill.create({ data: req.body });
    res.status(201).json({ data: ewayBill });
  } catch (err: any) {
    if (err?.code === "P2002") {
      res.status(409).json({ error: "Duplicate E-Way Bill number", code: "DUPLICATE_EWB" });
      return;
    }
    throw err;
  }
});

/**
 * POST /api/eway-bills/sync — Sync from GST portal (mock)
 */
router.post("/sync", validate(syncEWayBillSchema), async (req: Request, res: Response) => {
  const { fromDate, toDate = new Date(), limit } = req.body;

  // Validate date range (max 30 days)
  const daysRange = Math.abs(toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24);
  if (daysRange > 30) {
    res.status(422).json({
      error: "Date range exceeds 30 days",
      code: "INVALID_DATE_RANGE",
    });
    return;
  }

  // Mock: generate sample E-Way Bills for testing
  const mockBills = [];
  for (let i = 0; i < Math.min(limit, 5); i++) {
    const ewbNumber = `EWB${String(Date.now()).slice(-8)}${i}`;
    mockBills.push({
      ewayBillNumber: ewbNumber,
      generatedDate: fromDate,
      validUntil: new Date(fromDate.getTime() + 30 * 24 * 60 * 60 * 1000),
      fromGstin: "27AAACA1234A1Z1",
      toGstin: "27AAACA5678A1Z1",
      totalValue: 50000 + i * 1000,
      transportMode: "Road",
      vehicleNumber: `MH-01-AB-${String(1000 + i)}`,
      status: "PROCESSED" as const,
      rawData: JSON.stringify({ mock: true, generatedAt: new Date().toISOString() }),
    });
  }

  let created = 0;
  for (const bill of mockBills) {
    try {
      await prisma.eWayBill.create({ data: bill });
      created++;
    } catch {
      // skip duplicates
    }
  }

  res.status(202).json({
    data: {
      syncId: `sync-${Date.now()}`,
      status: "COMPLETED",
      requestedFrom: fromDate,
      requestedTo: toDate,
      recordsCreated: created,
      message: `Sync completed. ${created} E-Way Bill(s) created.`,
    },
  });
});

/**
 * GET /api/eway-bills/:id — Get E-Way Bill detail
 */
router.get("/:id", async (req: Request, res: Response) => {
  const ewayBill = await prisma.eWayBill.findUnique({
    where: { id: req.params.id },
    include: {
      invoice: {
        include: { vendor: { select: { id: true, name: true, gstin: true } } },
      },
    },
  });

  if (!ewayBill) {
    res.status(404).json({ error: "E-Way Bill not found", code: "NOT_FOUND" });
    return;
  }

  res.json({ data: ewayBill });
});

export default router;
