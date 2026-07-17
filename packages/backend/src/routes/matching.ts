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
  ewayBillIds: z.array(z.string().uuid()).optional(),
  autoPersist: z.boolean().optional().default(true),
});

// ── Routes ──────────────────────────────────────────────────────────

/**
 * POST /api/matching/run — Trigger 2-way or 3-way matching
 * Matches invoice against delivery notes and/or E-Way Bills.
 */
router.post("/run", validate(runMatchSchema), async (req: Request, res: Response) => {
  const { invoiceId, deliveryNoteIds, ewayBillIds, autoPersist } = req.body;

  // Verify invoice exists
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) {
    res.status(404).json({ error: "Invoice not found", code: "NOT_FOUND" });
    return;
  }

  // Run matching (3-way)
  const results = await runMatch({ invoiceId, deliveryNoteIds, ewayBillIds });

  // Optionally persist to database
  const persisted = autoPersist
    ? await Promise.all(
        results.map((r) =>
          persistMatchResult(
            invoiceId,
            (r as any)._dnId ?? null,
            (r as any)._ewbId ?? null,
            r
          ).catch(() => null)
        )
      )
    : null;

  // Strip internal tracking fields from output
  const output = results.map((r, i) => {
    const { _dnId, _ewbId, ...clean } = r as any;
    return { ...clean, id: persisted?.[i]?.id ?? null };
  });

  res.json({
    data: output,
    meta: {
      invoiceId,
      matchCount: results.length,
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
        ewayBill: { select: { id: true, ewayBillNumber: true, totalValue: true } },
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
        include: { vendor: { select: { id: true, name: true, gstin: true } } },
      },
      deliveryNote: {
        include: { vendor: { select: { id: true, name: true } } },
      },
      ewayBill: true,
    },
  });

  if (!result) {
    res.status(404).json({ error: "Match result not found", code: "NOT_FOUND" });
    return;
  }

  const discrepancies = result.discrepancies ? JSON.parse(result.discrepancies) : [];

  res.json({
    data: { ...result, discrepancies },
  });
});

/**
 * GET /api/matching/stats — Aggregate reconciliation statistics
 * Returns counts by status, match rate, and document totals.
 */
router.get("/stats", async (_req: Request, res: Response) => {
  const [
    totalMatches,
    matched,
    partial,
    mismatched,
    totalInvoices,
    totalDns,
    totalEwbs,
    resolved,
  ] = await Promise.all([
    prisma.matchResult.count(),
    prisma.matchResult.count({ where: { status: "MATCHED" } }),
    prisma.matchResult.count({ where: { status: "PARTIAL" } }),
    prisma.matchResult.count({ where: { status: "MISMATCH" } }),
    prisma.invoice.count(),
    prisma.deliveryNote.count(),
    prisma.eWayBill.count(),
    prisma.matchResult.count({ where: { reviewedBy: { not: null } } }),
  ]);

  const pendingReview = totalMatches - resolved;
  const matchRate = totalMatches > 0
    ? Math.round((matched / totalMatches) * 10000) / 100
    : 0;

  res.json({
    data: {
      totalMatches,
      matched,
      partial,
      mismatched,
      matchRate,
      pendingReview,
      resolved,
      documents: {
        invoices: totalInvoices,
        deliveryNotes: totalDns,
        ewayBills: totalEwbs,
      },
    },
  });
});

/**
 * PUT /api/matching/results/:id/resolve — Approve or reject a match result
 * Body: { action: "accept" | "reject", reviewedBy: string, notes?: string }
 * On accept: status → RESOLVED, document statuses → RESOLVED
 * On reject: triggers re-match (status stays for audit)
 */
const resolveSchema = z.object({
  action: z.enum(["accept", "reject"]),
  reviewedBy: z.string().min(1),
  notes: z.string().optional(),
});

router.put("/results/:id/resolve", validate(resolveSchema), async (req: Request, res: Response) => {
  const { action, reviewedBy, notes } = req.body;
  const matchId = req.params.id;

  const match = await prisma.matchResult.findUnique({
    where: { id: matchId },
  });

  if (!match) {
    res.status(404).json({ error: "Match result not found", code: "NOT_FOUND" });
    return;
  }

  if (match.reviewedBy) {
    res.status(409).json({
      error: "Match result already reviewed",
      code: "ALREADY_REVIEWED",
      data: { reviewedBy: match.reviewedBy, reviewedAt: match.reviewedAt },
    });
    return;
  }

  // Update the match result
  const updated = await prisma.matchResult.update({
    where: { id: matchId },
    data: {
      reviewedBy,
      reviewedAt: new Date(),
      status: action === "accept" ? "MATCHED" : match.status,
      ...(notes ? { discrepancies: (() => {
        try {
          const existing = JSON.parse(match.discrepancies || "[]");
          existing.push({ type: "REVIEW_NOTE", field: "review", expected: "", actual: notes, severity: "LOW" });
          return JSON.stringify(existing);
        } catch { return match.discrepancies; }
      })() } : {}),
    },
  });

  // Update document statuses on acceptance
  if (action === "accept") {
    await Promise.all([
      prisma.invoice.update({ where: { id: match.invoiceId }, data: { status: "RESOLVED" } }),
      match.deliveryNoteId
        ? prisma.deliveryNote.update({ where: { id: match.deliveryNoteId }, data: { status: "RESOLVED" } })
        : Promise.resolve(),
      match.ewayBillId
        ? prisma.eWayBill.update({ where: { id: match.ewayBillId }, data: { status: "RESOLVED" } })
        : Promise.resolve(),
    ]);
  }

  const discrepancies = updated.discrepancies ? JSON.parse(updated.discrepancies) : [];

  res.json({
    data: { ...updated, discrepancies },
    meta: { action, resolved: action === "accept" },
  });
});

export default router;
