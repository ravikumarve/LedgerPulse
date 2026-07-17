import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../index";
import { validate } from "../middleware/validate";
import { runMatch, persistMatchResult } from "../services/matching";

const router = Router();

// ── Schemas ─────────────────────────────────────────────────────────

const runMatchSchema = z.object({
  invoiceId: z.string().uuid(),
  deliveryNoteIds: z.array(z.string().uuid()).optional(),
  autoPersist: z.boolean().optional().default(true),
});

// ── Routes ──────────────────────────────────────────────────────────

/**
 * POST /api/matching/run — Trigger 2-way matching for invoice ↔ delivery notes
 */
router.post("/run", validate(runMatchSchema), async (req: Request, res: Response) => {
  const { invoiceId, deliveryNoteIds, autoPersist } = req.body;

  // Verify invoice exists
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) {
    res.status(404).json({ error: "Invoice not found", code: "NOT_FOUND" });
    return;
  }

  // Run matching
  const results = await runMatch({
    invoiceId,
    deliveryNoteIds,
  });

  // Optionally persist to database
  const persisted = autoPersist
    ? await Promise.all(
        results.map((r, i) =>
          persistMatchResult(
            invoiceId,
            deliveryNoteIds?.[i] ?? null,
            r
          ).catch(() => null) // continue if one fails
        )
      )
    : null;

  res.json({
    data: results.map((r, i) => ({
      ...r,
      id: persisted?.[i]?.id ?? null,
    })),
    meta: {
      invoiceId,
      deliveryNoteCount: results.length,
      persisted: autoPersist,
    },
  });
});

/**
 * GET /api/matching/results — List match results with filters
 */
router.get("/results", async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const perPage = Math.min(100, Math.max(1, parseInt(req.query.perPage as string) || 20));
  const status = req.query.status as string;
  const invoiceId = req.query.invoiceId as string;

  const where: any = {};
  if (status) where.status = status;
  if (invoiceId) where.invoiceId = invoiceId;

  const [data, total] = await Promise.all([
    prisma.matchResult.findMany({
      where,
      include: {
        invoice: { select: { id: true, invoiceNumber: true, totalAmount: true } },
        deliveryNote: { select: { id: true, deliveryNoteNumber: true } },
      },
      skip: (page - 1) * perPage,
      take: perPage,
      orderBy: { createdAt: "desc" },
    }),
    prisma.matchResult.count({ where }),
  ]);

  res.json({
    data,
    meta: { page, perPage, total, totalPages: Math.ceil(total / perPage) },
  });
});

/**
 * GET /api/matching/results/:id — Single match result detail
 */
router.get("/results/:id", async (req: Request, res: Response) => {
  const result = await prisma.matchResult.findUnique({
    where: { id: req.params.id },
    include: {
      invoice: {
        include: {
          vendor: { select: { id: true, name: true, gstin: true } },
        },
      },
      deliveryNote: {
        include: {
          vendor: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!result) {
    res.status(404).json({ error: "Match result not found", code: "NOT_FOUND" });
    return;
  }

  // Parse stored discrepancies JSON
  const discrepancies = result.discrepancies ? JSON.parse(result.discrepancies) : [];

  res.json({
    data: {
      ...result,
      discrepancies,
    },
  });
});

export default router;
