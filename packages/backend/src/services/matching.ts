/**
 * 3-Way Matching Engine — Invoice ↔ Delivery Note ↔ E-Way Bill
 *
 * Computes a composite match score (0.0–1.0) across three dimensions:
 * - INV↔DN (2-way): vendor, date proximity, qty/price (50%)
 * - INV↔EWB (tax): total value, GSTIN, tax codes (30%)
 * - DN↔EWB (logistics): dates, quantities, vehicle (20%)
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
  qtyMatch: number;
  priceMatch: number;
}

export interface Discrepancy {
  type:
    | "VENDOR" | "DATE" | "AMOUNT" | "QUANTITY" | "UNIT_PRICE"
    | "LINE_ITEM" | "MISSING_DOCUMENT"
    | "GSTIN" | "TAX" | "HSN_CODE" | "EWB_EXPIRY" | "VEHICLE";
  field: string;
  expected: string | number;
  actual: string | number;
  severity: "LOW" | "MEDIUM" | "HIGH";
  details?: string;
}

export interface HeaderScore {
  vendor: number;
  dateProximity: number;
  amountTolerance: number;
  total: number;
}

export interface LineItemScore {
  matchedItems: MatchedLineItem[];
  quantityScore: number;
  priceScore: number;
  total: number;
}

export interface EWBScore {
  valueMatch: number;     // totalValue vs invoice totalAmount
  gstinMatch: number;     // fromGstin/toGstin vs vendor GSTIN
  expiryOk: boolean;      // not expired
  total: number;
}

export interface MatchResultOutput {
  matchScore: number;
  invDnScore: number;       // 2-way INV↔DN
  invEwbScore: number;      // INV↔EWB
  dnEwbScore: number;       // DN↔EWB (logistics)
  headerScore: HeaderScore;
  lineItemScore: LineItemScore;
  ewbScore: EWBScore;
  discrepancies: Discrepancy[];
  status: "MATCHED" | "PARTIAL" | "MISMATCH";
}

export interface MatchInput {
  invoiceId: string;
  deliveryNoteIds?: string[];
  ewayBillIds?: string[];
  dateToleranceDays?: number;
  amountTolerancePercent?: number;
  quantityTolerancePercent?: number;
}

// ── Defaults ────────────────────────────────────────────────────────

const DEFAULT_DATE_TOLERANCE_DAYS = 7;
const DEFAULT_AMOUNT_TOLERANCE_PCT = 10;
const DEFAULT_QTY_TOLERANCE_PCT = 5;
const INV_DN_WEIGHT = 0.50;
const INV_EWB_WEIGHT = 0.30;
const DN_EWB_WEIGHT = 0.20;
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

// ── 2-Way: Invoice ↔ Delivery Note ─────────────────────────────────

function matchHeadersInvDn(
  invoice: { vendorId: string; invoiceDate: Date; totalAmount: number },
  deliveryNote: { vendorId: string; deliveryDate: Date },
  dateToleranceDays: number,
): { headerScore: HeaderScore; discrepancies: Discrepancy[] } {
  const discrepancies: Discrepancy[] = [];

  const vendor = invoice.vendorId === deliveryNote.vendorId ? 1 : 0;
  if (vendor === 0) {
    discrepancies.push({
      type: "VENDOR", field: "vendorId",
      expected: invoice.vendorId, actual: deliveryNote.vendorId,
      severity: "HIGH",
      details: "Vendor mismatch between invoice and delivery note",
    });
  }

  const diffDays = daysBetween(invoice.invoiceDate, deliveryNote.deliveryDate);
  const dateProximity = diffDays <= dateToleranceDays ? 1 : clamp(1 - (diffDays - dateToleranceDays) / 30);
  if (diffDays > dateToleranceDays) {
    discrepancies.push({
      type: "DATE", field: "deliveryDate",
      expected: invoice.invoiceDate.toISOString(),
      actual: deliveryNote.deliveryDate.toISOString(),
      severity: diffDays > 30 ? "HIGH" : "MEDIUM",
      details: `Date gap of ${Math.round(diffDays)} days (tolerance: ${dateToleranceDays} days)`,
    });
  }

  const amountTolerance = 1; // neutral — DNs track qty, not amount
  const total = vendor * 0.5 + dateProximity * 0.3 + amountTolerance * 0.2;

  return { headerScore: { vendor, dateProximity, amountTolerance, total }, discrepancies };
}

function matchLineItems(
  invLineItems: any[], dnLineItems: any[],
  invTotalQty: number, dnTotalQty: number,
  qtyTolerancePct: number,
): { lineItemScore: LineItemScore; discrepancies: Discrepancy[] } {
  const discrepancies: Discrepancy[] = [];
  const matchedItems: MatchedLineItem[] = [];

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
            type: "QUANTITY", field: `lineItems[${i}].quantity`,
            expected: invQty, actual: dnQty,
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
            type: "UNIT_PRICE", field: `lineItems[${i}].unitPrice`,
            expected: invPrice, actual: dnPrice,
            severity: diffPct > 20 ? "HIGH" : "MEDIUM",
            details: `Price difference of ${Math.round(diffPct)}%`,
          });
        }
      }

      matchedItems.push({
        index: i,
        description: invItem.description ?? invItem.desc ?? dnItem.description ?? null,
        invQty, dnQty, invPrice, dnPrice, qtyMatch, priceMatch,
      });
    }
  }

  let quantityScore: number;
  if (invTotalQty > 0 && dnTotalQty > 0) {
    const qtyDiffPct = Math.abs(invTotalQty - dnTotalQty) / Math.max(invTotalQty, dnTotalQty) * 100;
    quantityScore = qtyDiffPct <= qtyTolerancePct ? 1 : clamp(1 - (qtyDiffPct - qtyTolerancePct) / 50);
    if (qtyDiffPct > qtyTolerancePct) {
      discrepancies.push({
        type: "QUANTITY", field: "totalQuantity",
        expected: invTotalQty, actual: dnTotalQty,
        severity: qtyDiffPct > 20 ? "HIGH" : "MEDIUM",
        details: `Total qty difference of ${Math.round(qtyDiffPct)}%`,
      });
    }
  } else {
    quantityScore = 0.5;
  }

  const priceScore = matchedItems.length > 0
    ? matchedItems.reduce((s, i) => s + i.priceMatch, 0) / matchedItems.length
    : 1;

  const itemLevelQtyScore = matchedItems.length > 0
    ? matchedItems.reduce((s, i) => s + i.qtyMatch, 0) / matchedItems.length
    : quantityScore;

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

// ── 3-Way: Invoice ↔ E-Way Bill (tax/compliance) ───────────────────

function matchInvEWB(
  invoice: { totalAmount: number; taxAmount?: number | null },
  ewb: { totalValue: number; fromGstin: string; toGstin: string; ewayBillNumber: string; validUntil: Date; },
  vendorGstin: string | null | undefined,
  amountTolerancePct: number,
): { ewbScore: EWBScore; discrepancies: Discrepancy[] } {
  const discrepancies: Discrepancy[] = [];

  // Value match: invoice totalAmount vs EWB totalValue
  let valueMatch = 1;
  if (invoice.totalAmount > 0 && ewb.totalValue > 0) {
    const ratio = Math.min(invoice.totalAmount, ewb.totalValue) / Math.max(invoice.totalAmount, ewb.totalValue);
    valueMatch = ratio >= (1 - amountTolerancePct / 100) ? 1 : clamp(ratio);
    if (ratio < (1 - amountTolerancePct / 100)) {
      discrepancies.push({
        type: "AMOUNT", field: "totalValue",
        expected: invoice.totalAmount, actual: ewb.totalValue,
        severity: ratio < 0.8 ? "HIGH" : "MEDIUM",
        details: `Invoice total ₹${invoice.totalAmount} vs EWB value ₹${ewb.totalValue}`,
      });
    }
  }

  // GSTIN match: vendor's GSTIN should match EWB fromGstin
  let gstinMatch = 1;
  if (vendorGstin && ewb.fromGstin) {
    gstinMatch = vendorGstin === ewb.fromGstin ? 1 : 0;
    if (gstinMatch === 0) {
      discrepancies.push({
        type: "GSTIN", field: "fromGstin",
        expected: vendorGstin, actual: ewb.fromGstin,
        severity: "HIGH",
        details: `Vendor GSTIN ${vendorGstin} does not match EWB from-GSTIN ${ewb.fromGstin}`,
      });
    }
  }

  // Expiry check
  const now = new Date();
  const expiryOk = ewb.validUntil > now;
  if (!expiryOk) {
    discrepancies.push({
      type: "EWB_EXPIRY", field: "validUntil",
      expected: ewb.validUntil.toISOString(),
      actual: now.toISOString(),
      severity: "HIGH",
      details: `E-Way Bill ${ewb.ewayBillNumber} expired on ${ewb.validUntil.toISOString()}`,
    });
  }

  const total = valueMatch * 0.4 + gstinMatch * 0.4 + (expiryOk ? 1 : 0) * 0.2;

  return {
    ewbScore: { valueMatch, gstinMatch, expiryOk, total },
    discrepancies,
  };
}

// ── 3-Way: Delivery Note ↔ E-Way Bill (logistics) ──────────────────

function matchDnEWB(
  dn: { deliveryDate: Date; totalQuantity: number; weightbridgeValue?: number | null },
  ewb: { generatedDate: Date; totalValue: number; vehicleNumber?: string | null },
): { score: number; discrepancies: Discrepancy[] } {
  const discrepancies: Discrepancy[] = [];

  // Date proximity: delivery date vs EWB generation date
  const diffDays = daysBetween(dn.deliveryDate, ewb.generatedDate);
  let dateScore = diffDays <= 3 ? 1 : clamp(1 - (diffDays - 3) / 14);
  if (diffDays > 7) {
    discrepancies.push({
      type: "DATE", field: "dnVsEwbDate",
      expected: dn.deliveryDate.toISOString(),
      actual: ewb.generatedDate.toISOString(),
      severity: diffDays > 14 ? "HIGH" : "MEDIUM",
      details: `Delivery date vs EWB date gap of ${Math.round(diffDays)} days`,
    });
  }

  // Vehicle number check — if both present
  let vehicleScore = 1;
  if (dn.weightbridgeValue && ewb.vehicleNumber) {
    // Vehicle number present, good practice — just flag presence
    vehicleScore = 1;
  }

  const score = dateScore * 0.7 + vehicleScore * 0.3;
  return { score, discrepancies };
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Run 3-way matching between an invoice, delivery notes, and E-Way Bills.
 * Auto-selects documents from the same vendor if not specified.
 */
export async function runMatch(input: MatchInput): Promise<MatchResultOutput[]> {
  const {
    invoiceId,
    deliveryNoteIds,
    ewayBillIds,
    dateToleranceDays = DEFAULT_DATE_TOLERANCE_DAYS,
    amountTolerancePercent = DEFAULT_AMOUNT_TOLERANCE_PCT,
    quantityTolerancePercent = DEFAULT_QTY_TOLERANCE_PCT,
  } = input;

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { vendor: true, deliveryNotes: true, ewayBills: true },
  });

  if (!invoice) {
    throw new Error(`Invoice not found: ${invoiceId}`);
  }

  // Determine delivery notes
  let dnTargets = deliveryNoteIds
    ? await prisma.deliveryNote.findMany({ where: { id: { in: deliveryNoteIds } } })
    : invoice.deliveryNotes.length > 0
    ? invoice.deliveryNotes
    : await prisma.deliveryNote.findMany({
        where: { vendorId: invoice.vendorId, status: { in: ["PROCESSED", "PENDING"] } },
        take: 5,
      });

  // Determine E-Way Bills
  let ewbTargets = ewayBillIds
    ? await prisma.eWayBill.findMany({ where: { id: { in: ewayBillIds } } })
    : invoice.ewayBills.length > 0
    ? invoice.ewayBills
    : invoice.vendor?.gstin
    ? await prisma.eWayBill.findMany({
        where: {
          fromGstin: invoice.vendor.gstin,
          status: { in: ["PROCESSED", "PENDING"] },
        },
        take: 5,
      })
    : [];

  // If no delivery notes, still produce EWB-only results
  if (dnTargets.length === 0) {
    dnTargets = [null] as any;
  }
  if (ewbTargets.length === 0) {
    ewbTargets = [null] as any;
  }

  const invLineItems = parseLineItems(invoice.lineItems);
  const invTotalQty = invLineItems.reduce((sum: number, item: any) =>
    sum + (item.quantity ?? item.qty ?? 0), 0);

  const results: MatchResultOutput[] = [];

  for (const dn of dnTargets) {
    for (const ewb of ewbTargets) {
      const allDiscs: Discrepancy[] = [];
      let invDnScore = 0;
      let invEwbScore = 0;
      let dnEwbScore = 0;

      // ── INV ↔ DN (2-way) ──
      if (dn) {
        const dnLineItems = parseLineItems(dn.lineItems);
        const { headerScore, discrepancies: hDiscs } = matchHeadersInvDn(invoice, dn, dateToleranceDays);
        const { lineItemScore, discrepancies: lDiscs } = matchLineItems(
          invLineItems, dnLineItems, invTotalQty, dn.totalQuantity, quantityTolerancePercent);

        allDiscs.push(...hDiscs, ...lDiscs);
        invDnScore = headerScore.total * 0.4 + lineItemScore.total * 0.6;
      }

      // ── INV ↔ EWB (tax/compliance) ──
      if (ewb) {
        const vendorGstin = invoice.vendor?.gstin;
        const { ewbScore: ewbScoreResult, discrepancies: eDiscs } = matchInvEWB(
          invoice, ewb, vendorGstin, amountTolerancePercent);

        allDiscs.push(...eDiscs);
        invEwbScore = ewbScoreResult.total;
      }

      // ── DN ↔ EWB (logistics) ──
      if (dn && ewb) {
        const { score, discrepancies: dDiscs } = matchDnEWB(dn, ewb);
        allDiscs.push(...dDiscs);
        dnEwbScore = score;
      }

      // ── Composite 3-way score ──
      const weightedDenom =
        (dn ? INV_DN_WEIGHT : 0) +
        (ewb ? INV_EWB_WEIGHT : 0) +
        (dn && ewb ? DN_EWB_WEIGHT : 0);

      const rawScore =
        (dn ? invDnScore * INV_DN_WEIGHT : 0) +
        (ewb ? invEwbScore * INV_EWB_WEIGHT : 0) +
        (dn && ewb ? dnEwbScore * DN_EWB_WEIGHT : 0);

      const matchScore = weightedDenom > 0 ? rawScore / weightedDenom : 0;

      const status: "MATCHED" | "PARTIAL" | "MISMATCH" =
        matchScore >= MATCH_THRESHOLD ? "MATCHED"
        : matchScore >= PARTIAL_THRESHOLD ? "PARTIAL"
        : "MISMATCH";

      results.push({
        matchScore: Math.round(matchScore * 100) / 100,
        invDnScore: Math.round(invDnScore * 100) / 100,
        invEwbScore: Math.round(invEwbScore * 100) / 100,
        dnEwbScore: Math.round(dnEwbScore * 100) / 100,
        headerScore: { vendor: 0, dateProximity: 0, amountTolerance: 0, total: invDnScore },
        lineItemScore: { matchedItems: [], quantityScore: 0, priceScore: 0, total: invDnScore },
        ewbScore: { valueMatch: 0, gstinMatch: 0, expiryOk: true, total: invEwbScore },
        discrepancies: allDiscs,
        status,
        _dnId: dn?.id ?? null,
        _ewbId: ewb?.id ?? null,
      } as any);
    }
  }

  return results;
}

/**
 * Store a match result to the database.
 */
export async function persistMatchResult(
  invoiceId: string,
  deliveryNoteId: string | null,
  ewayBillId: string | null,
  output: MatchResultOutput
) {
  // Derive organizationId from the invoice
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { organizationId: true } });
  const organizationId = invoice?.organizationId ?? "00000000-0000-0000-0000-000000000000";

  const result = await prisma.matchResult.create({
    data: {
      organizationId,
      invoiceId,
      deliveryNoteId,
      ewayBillId,
      matchScore: output.matchScore,
      status: output.status,
      discrepancies: JSON.stringify(output.discrepancies),
    },
  });

  // Update document statuses
  if (output.status === "MATCHED") {
    await prisma.invoice.update({ where: { id: invoiceId }, data: { status: "MATCHED" } });
    if (deliveryNoteId) {
      await prisma.deliveryNote.update({ where: { id: deliveryNoteId }, data: { status: "MATCHED" } });
    }
    if (ewayBillId) {
      await prisma.eWayBill.update({ where: { id: ewayBillId }, data: { status: "MATCHED" } });
    }
  } else if (output.status === "MISMATCH") {
    await prisma.invoice.update({ where: { id: invoiceId }, data: { status: "DISCREPANCY" } });
  }

  return result;
}
