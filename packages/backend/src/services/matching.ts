/**
 * 2-Way Matching Engine — Invoice ↔ Delivery Note
 *
 * Computes a composite match score (0.0–1.0) with breakdown:
 * - Header match (40%): vendor, date proximity, total amount tolerance
 * - Line-item match (60%): quantity & unit price comparison
 *
 * Produces discrepancies at the field level for audit trail.
 */

import { prisma } from "../index";

// ── Types ───────────────────────────────────────────────────────────

export interface MatchedLineItem {
  index: number;
  description: string | null;
  invQty: number | null;
  dnQty: number | null;
  invPrice: number | null;
  dnPrice: number | null;
  qtyMatch: number; // 0.0–1.0
  priceMatch: number; // 0.0–1.0
}

export interface Discrepancy {
  type: "VENDOR" | "DATE" | "AMOUNT" | "QUANTITY" | "UNIT_PRICE" | "LINE_ITEM" | "MISSING_DOCUMENT";
  field: string;
  expected: string | number;
  actual: string | number;
  severity: "LOW" | "MEDIUM" | "HIGH";
  details?: string;
}

export interface HeaderScore {
  vendor: number; // 0 or 1
  dateProximity: number; // 0.0–1.0
  amountTolerance: number; // 0.0–1.0
  total: number; // weighted average of above
}

export interface LineItemScore {
  matchedItems: MatchedLineItem[];
  quantityScore: number;
  priceScore: number;
  total: number;
}

export interface MatchResultOutput {
  matchScore: number;
  headerScore: HeaderScore;
  lineItemScore: LineItemScore;
  discrepancies: Discrepancy[];
  status: "MATCHED" | "PARTIAL" | "MISMATCH";
}

export interface MatchInput {
  invoiceId: string;
  deliveryNoteIds?: string[];
  dateToleranceDays?: number;
  amountTolerancePercent?: number;
  quantityTolerancePercent?: number;
}

// ── Defaults ────────────────────────────────────────────────────────

const DEFAULT_DATE_TOLERANCE_DAYS = 7;
const DEFAULT_AMOUNT_TOLERANCE_PCT = 10;
const DEFAULT_QTY_TOLERANCE_PCT = 5;
const HEADER_WEIGHT = 0.4;
const LINE_ITEM_WEIGHT = 0.6;
const MATCH_THRESHOLD = 0.85;
const PARTIAL_THRESHOLD = 0.5;

// ── Helpers ─────────────────────────────────────────────────────────

function parseLineItems(json: string | null): any[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
}

// ── Header Matching ─────────────────────────────────────────────────

function matchHeaders(
  invoice: { vendorId: string; invoiceDate: Date; totalAmount: number },
  deliveryNote: { vendorId: string; deliveryDate: Date; totalQuantity: number },
  dateToleranceDays: number,
  amountTolerancePct: number
): { headerScore: HeaderScore; discrepancies: Discrepancy[] } {
  const discrepancies: Discrepancy[] = [];

  // Vendor match (hard requirement)
  const vendor = invoice.vendorId === deliveryNote.vendorId ? 1 : 0;
  if (vendor === 0) {
    discrepancies.push({
      type: "VENDOR",
      field: "vendorId",
      expected: invoice.vendorId,
      actual: deliveryNote.vendorId,
      severity: "HIGH",
      details: "Vendor mismatch between invoice and delivery note",
    });
  }

  // Date proximity
  const diffDays = daysBetween(invoice.invoiceDate, deliveryNote.deliveryDate);
  const dateProximity = diffDays <= dateToleranceDays ? 1 : clamp(1 - (diffDays - dateToleranceDays) / 30);
  if (diffDays > dateToleranceDays) {
    discrepancies.push({
      type: "DATE",
      field: "deliveryDate",
      expected: invoice.invoiceDate.toISOString(),
      actual: deliveryNote.deliveryDate.toISOString(),
      severity: diffDays > 30 ? "HIGH" : "MEDIUM",
      details: `Date gap of ${Math.round(diffDays)} days (tolerance: ${dateToleranceDays} days)`,
    });
  }

  // Amount tolerance — use totalQuantity from delivery note as proxy for value
  // (delivery notes may not have totalAmount; we use qty as fallback reference)
  // For now: skip amount check on delivery note side since they track qty, not value.
  // We'll flag it if both sides have amount data in Phase 3.
  const amountTolerance = 1; // neutral until we have delivery note amounts

  const total = vendor * 0.5 + dateProximity * 0.3 + amountTolerance * 0.2;

  return {
    headerScore: { vendor, dateProximity, amountTolerance, total },
    discrepancies,
  };
}

// ── Line-Item Matching ──────────────────────────────────────────────

function matchLineItems(
  invLineItems: any[],
  dnLineItems: any[],
  invTotalQty: number,
  dnTotalQty: number,
  qtyTolerancePct: number
): { lineItemScore: LineItemScore; discrepancies: Discrepancy[] } {
  const discrepancies: Discrepancy[] = [];
  const matchedItems: MatchedLineItem[] = [];

  // If both have structured line items, compare them
  if (invLineItems.length > 0 && dnLineItems.length > 0) {
    const maxLen = Math.max(invLineItems.length, dnLineItems.length);

    for (let i = 0; i < maxLen; i++) {
      const invItem = invLineItems[i] || {};
      const dnItem = dnLineItems[i] || {};

      const invQty = invItem.quantity ?? invItem.qty ?? null;
      const dnQty = dnItem.quantity ?? dnItem.qty ?? null;

      let qtyMatch = 1;
      if (invQty !== null && dnQty !== null && dnQty > 0) {
        const diffPct = Math.abs(invQty - dnQty) / dnQty * 100;
        qtyMatch = diffPct <= qtyTolerancePct ? 1 : clamp(1 - (diffPct - qtyTolerancePct) / 50);
        if (diffPct > qtyTolerancePct) {
          discrepancies.push({
            type: "QUANTITY",
            field: `lineItems[${i}].quantity`,
            expected: invQty,
            actual: dnQty,
            severity: diffPct > 20 ? "HIGH" : "MEDIUM",
            details: `Qty difference of ${Math.round(diffPct)}% (tolerance: ${qtyTolerancePct}%)`,
          });
        }
      }

      const invPrice = invItem.unitPrice ?? invItem.rate ?? null;
      const dnPrice = dnItem.unitPrice ?? dnItem.rate ?? null;
      let priceMatch = 1;
      if (invPrice !== null && dnPrice !== null && dnPrice > 0) {
        const diffPct = Math.abs(invPrice - dnPrice) / dnPrice * 100;
        priceMatch = diffPct <= 10 ? 1 : clamp(1 - (diffPct - 10) / 100);
        if (diffPct > 10) {
          discrepancies.push({
            type: "UNIT_PRICE",
            field: `lineItems[${i}].unitPrice`,
            expected: invPrice,
            actual: dnPrice,
            severity: diffPct > 20 ? "HIGH" : "MEDIUM",
            details: `Price difference of ${Math.round(diffPct)}%`,
          });
        }
      }

      matchedItems.push({
        index: i,
        description: invItem.description ?? invItem.desc ?? dnItem.description ?? null,
        invQty,
        dnQty,
        invPrice,
        dnPrice,
        qtyMatch,
        priceMatch,
      });
    }
  }

  // Fallback: compare total quantities
  let quantityScore: number;
  if (invTotalQty > 0 && dnTotalQty > 0) {
    const qtyDiffPct = Math.abs(invTotalQty - dnTotalQty) / Math.max(invTotalQty, dnTotalQty) * 100;
    quantityScore = qtyDiffPct <= qtyTolerancePct ? 1 : clamp(1 - (qtyDiffPct - qtyTolerancePct) / 50);

    if (qtyDiffPct > qtyTolerancePct) {
      discrepancies.push({
        type: "QUANTITY",
        field: "totalQuantity",
        expected: invTotalQty,
        actual: dnTotalQty,
        severity: qtyDiffPct > 20 ? "HIGH" : "MEDIUM",
        details: `Total qty difference of ${Math.round(qtyDiffPct)}%`,
      });
    }
  } else {
    quantityScore = 0.5; // uncertain
  }

  const priceScore = matchedItems.length > 0
    ? matchedItems.reduce((s, i) => s + i.priceMatch, 0) / matchedItems.length
    : 1; // no price data → neutral

  const itemLevelQtyScore = matchedItems.length > 0
    ? matchedItems.reduce((s, i) => s + i.qtyMatch, 0) / matchedItems.length
    : quantityScore; // use total qty if no item breakdown

  return {
    lineItemScore: {
      matchedItems,
      quantityScore: itemLevelQtyScore,
      priceScore,
      total: itemLevelQtyScore * 0.6 + priceScore * 0.4,
    },
    discrepancies,
  };
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Run 2-way matching between an invoice and one or more delivery notes.
 * If no deliveryNoteIds provided, auto-selects from the same vendor.
 */
export async function runMatch(input: MatchInput): Promise<MatchResultOutput[]> {
  const {
    invoiceId,
    deliveryNoteIds,
    dateToleranceDays = DEFAULT_DATE_TOLERANCE_DAYS,
    amountTolerancePercent = DEFAULT_AMOUNT_TOLERANCE_PCT,
    quantityTolerancePercent = DEFAULT_QTY_TOLERANCE_PCT,
  } = input;

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { deliveryNotes: true },
  });

  if (!invoice) {
    throw new Error(`Invoice not found: ${invoiceId}`);
  }

  // Determine which delivery notes to match against
  let targets = deliveryNoteIds
    ? await prisma.deliveryNote.findMany({
        where: { id: { in: deliveryNoteIds } },
      })
    : invoice.deliveryNotes.length > 0
    ? invoice.deliveryNotes
    : await prisma.deliveryNote.findMany({
        where: {
          vendorId: invoice.vendorId,
          status: { in: ["PROCESSED", "PENDING"] },
        },
        take: 10,
      });

  if (targets.length === 0) {
    // Return a "no target" result
    return [
      {
        matchScore: 0,
        headerScore: { vendor: 0, dateProximity: 0, amountTolerance: 0, total: 0 },
        lineItemScore: { matchedItems: [], quantityScore: 0, priceScore: 0, total: 0 },
        status: "MISMATCH",
        discrepancies: [
          {
            type: "MISSING_DOCUMENT",
            field: "deliveryNote",
            expected: "At least one delivery note",
            actual: "None found",
            severity: "HIGH",
            details: "No delivery notes found for this vendor to match against",
          },
        ],
      },
    ];
  }

  const invLineItems = parseLineItems(invoice.lineItems);
  const invTotalQty = invLineItems.reduce((sum: number, item: any) => {
    return sum + (item.quantity ?? item.qty ?? 0);
  }, 0);
  const results: MatchResultOutput[] = [];

  for (const dn of targets) {
    const dnLineItems = parseLineItems(dn.lineItems);

    // Header
    const { headerScore, discrepancies: headerDiscs } = matchHeaders(
      invoice,
      dn,
      dateToleranceDays,
      amountTolerancePercent
    );

    // Line items
    const { lineItemScore, discrepancies: itemDiscs } = matchLineItems(
      invLineItems,
      dnLineItems,
      invTotalQty,
      dn.totalQuantity,
      quantityTolerancePercent
    );

    const allDiscs = [...headerDiscs, ...itemDiscs];

    // Composite score
    const matchScore = headerScore.total * HEADER_WEIGHT + lineItemScore.total * LINE_ITEM_WEIGHT;

    // Classification
    const status: "MATCHED" | "PARTIAL" | "MISMATCH" =
      matchScore >= MATCH_THRESHOLD ? "MATCHED"
      : matchScore >= PARTIAL_THRESHOLD ? "PARTIAL"
      : "MISMATCH";

    results.push({
      matchScore: Math.round(matchScore * 100) / 100,
      headerScore,
      lineItemScore,
      discrepancies: allDiscs,
      status,
    });
  }

  return results;
}

/**
 * Store a match result to the database.
 */
export async function persistMatchResult(
  invoiceId: string,
  deliveryNoteId: string | null,
  output: MatchResultOutput
) {
  const result = await prisma.matchResult.create({
    data: {
      invoiceId,
      deliveryNoteId,
      matchScore: output.matchScore,
      status: output.status,
      discrepancies: JSON.stringify(output.discrepancies),
    },
  });

  // Update invoice status if matched
  if (output.status === "MATCHED") {
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: "MATCHED" },
    });
    if (deliveryNoteId) {
      await prisma.deliveryNote.update({
        where: { id: deliveryNoteId },
        data: { status: "MATCHED" },
      });
    }
  } else if (output.status === "MISMATCH") {
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: "DISCREPANCY" },
    });
  }

  return result;
}
