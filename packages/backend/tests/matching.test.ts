import request from "supertest";
import app, { prisma } from "../src/index";

/**
 * Matching Engine Integration Tests
 *
 * Tests 2-way matching (invoice ↔ delivery note) via the matching API.
 * Covers: header matching, line-item matching, scoring, discrepancy detection.
 */

// ── Test Data ───────────────────────────────────────────────────────

let vendorId: string;
let otherVendorId: string;
let invoiceId: string;
let goodDnId: string;
let badDnId: string;

const VENDOR_NAME = "Match Test Vendor";
const GSTIN = "27AAAMATCH1234A1Z1";
const OTHER_VENDOR = "Other Vendor";
const OTHER_GSTIN = "27AAAMATCH9999A1Z1";

beforeAll(async () => {
  // Clean tables in FK order
  await prisma.matchResult.deleteMany();
  await prisma.eWayBill.deleteMany();
  await prisma.deliveryNote.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.vendor.deleteMany();

  // Create vendor
  const vendor = await prisma.vendor.create({
    data: { name: VENDOR_NAME, gstin: GSTIN },
  });
  vendorId = vendor.id;

  // Create invoice (well-structured)
  const invoice = await prisma.invoice.create({
    data: {
      vendorId,
      invoiceNumber: "MATCH-INV-001",
      invoiceDate: new Date("2026-07-01"),
      totalAmount: 50000,
      taxAmount: 9000,
      lineItems: JSON.stringify([
        { description: "Steel Rods 12mm", quantity: 100, unitPrice: 250, amount: 25000 },
        { description: "Cement Bags 50kg", quantity: 50, unitPrice: 500, amount: 25000 },
      ]),
      status: "PROCESSED",
      processedAt: new Date(),
    },
  });
  invoiceId = invoice.id;

  // Create a delivery note that matches well (same vendor, close date, matching qty)
  const goodDn = await prisma.deliveryNote.create({
    data: {
      vendorId,
      deliveryNoteNumber: "MATCH-DN-001",
      deliveryDate: new Date("2026-07-03"),
      totalQuantity: 150,
      lineItems: JSON.stringify([
        { description: "Steel Rods 12mm", quantity: 100, unitPrice: 250 },
        { description: "Cement Bags 50kg", quantity: 50, unitPrice: 500 },
      ]),
      status: "PROCESSED",
      processedAt: new Date(),
    },
  });
  goodDnId = goodDn.id;

  // Create a second vendor for mismatch tests
  const otherVendor = await prisma.vendor.create({
    data: { name: OTHER_VENDOR, gstin: OTHER_GSTIN },
  });
  otherVendorId = otherVendor.id;

  // Create a delivery note that DOES NOT match (different vendor, far date, wrong qty)
  const badDn = await prisma.deliveryNote.create({
    data: {
      vendorId: otherVendorId,
      deliveryNoteNumber: "MATCH-DN-002",
      deliveryDate: new Date("2026-04-01"),
      totalQuantity: 10,
      lineItems: JSON.stringify([
        { description: "Nails Box", quantity: 5, unitPrice: 100 },
      ]),
      status: "PROCESSED",
      processedAt: new Date(),
    },
  });
  badDnId = badDn.id;
});

afterAll(async () => {
  await prisma.matchResult.deleteMany();
  await prisma.deliveryNote.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.vendor.deleteMany();
  await prisma.$disconnect();
}, 15000);

// ── Tests ───────────────────────────────────────────────────────────

describe("Matching Engine API", () => {
  // ── POST /api/matching/run ────────────────────────────────────

  it("POST /api/matching/run — matches a good delivery note", async () => {
    const res = await request(app)
      .post("/api/matching/run")
      .send({
        invoiceId,
        deliveryNoteIds: [goodDnId],
        autoPersist: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);

    const match = res.body.data[0];
    expect(match.status).toBe("MATCHED");
    expect(match.matchScore).toBeGreaterThanOrEqual(0.85);
    expect(match.discrepancies).toHaveLength(0);
    expect(match.id).toBeTruthy(); // persisted
  });

  it("POST /api/matching/run — flags a mismatched delivery note", async () => {
    const res = await request(app)
      .post("/api/matching/run")
      .send({
        invoiceId,
        deliveryNoteIds: [badDnId],
        autoPersist: false,
      });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);

    const match = res.body.data[0];
    expect(match.status).toBe("MISMATCH");
    expect(match.matchScore).toBeLessThan(0.5);
    expect(match.discrepancies.length).toBeGreaterThan(0);

    // Should flag date and quantity discrepancies
    const types = match.discrepancies.map((d: any) => d.type);
    expect(types).toContain("DATE");
    expect(types).toContain("QUANTITY");
  });

  it("POST /api/matching/run — auto-selects delivery notes from same vendor", async () => {
    const res = await request(app)
      .post("/api/matching/run")
      .send({ invoiceId });

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it("POST /api/matching/run — returns 404 for missing invoice", async () => {
    const res = await request(app)
      .post("/api/matching/run")
      .send({
        invoiceId: "00000000-0000-0000-0000-000000000000",
      });

    expect(res.status).toBe(404);
  });

  // ── GET /api/matching/results ─────────────────────────────────

  it("GET /api/matching/results — lists match results", async () => {
    const res = await request(app)
      .get("/api/matching/results")
      .query({ invoiceId });

    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.meta).toBeDefined();
  });

  it("GET /api/matching/results — filters by status", async () => {
    // First create a persisted match
    await request(app)
      .post("/api/matching/run")
      .send({ invoiceId, deliveryNoteIds: [goodDnId], autoPersist: true });

    const res = await request(app)
      .get("/api/matching/results")
      .query({ status: "MATCHED" });

    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
  });

  // ── GET /api/matching/results/:id ──────────────────────────────

  it("GET /api/matching/results/:id — returns match detail with discrepancies", async () => {
    // Create a match and capture its ID
    const matchRes = await request(app)
      .post("/api/matching/run")
      .send({ invoiceId, deliveryNoteIds: [goodDnId], autoPersist: true });

    const matchId = matchRes.body.data[0].id;
    expect(matchId).toBeTruthy();

    const res = await request(app)
      .get(`/api/matching/results/${matchId}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(matchId);
    expect(res.body.data.invoice).toBeDefined();
    expect(Array.isArray(res.body.data.discrepancies)).toBe(true);
  });

  it("GET /api/matching/results/:id — returns 404 for invalid id", async () => {
    const res = await request(app)
      .get("/api/matching/results/00000000-0000-0000-0000-000000000000");

    expect(res.status).toBe(404);
  });
});
