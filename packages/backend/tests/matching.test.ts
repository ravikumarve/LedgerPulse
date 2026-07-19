import request from "supertest";
import app, { prisma } from "../src/index";

/**
 * 3-Way Matching Engine Integration Tests
 *
 * Tests 2-way (INV↔DN) and 3-way (INV↔DN↔EWB) matching.
 * Covers: header matching, line-item matching, scoring,
 * E-Way Bill tax/GSTIN checks, and discrepancy detection.
 */

// ── Test Data ───────────────────────────────────────────────────────

let orgId: string;
let vendorId: string;
let otherVendorId: string;
let invoiceId: string;
let goodDnId: string;
let badDnId: string;
let goodEwbId: string;
let mismatchedEwbId: string;

const VENDOR_NAME = "3Way Test Vendor";
const GSTIN = "27AAA3WAY1234A1Z1";
const OTHER_VENDOR = "Other Vendor";
const OTHER_GSTIN = "27AAAOTHER999A1Z1";

beforeAll(async () => {
  // Clean tables in FK order
  await prisma.matchResult.deleteMany();
  await prisma.eWayBill.deleteMany();
  await prisma.deliveryNote.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.vendor.deleteMany();
  await prisma.organizationMember.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  // Create test org
  const org = await prisma.organization.create({
    data: { name: "Matching Test Org", slug: `test-match-${Date.now()}` },
  });
  orgId = org.id;

  // Create vendors
  const vendor = await prisma.vendor.create({
    data: { organizationId: orgId, name: VENDOR_NAME, gstin: GSTIN },
  });
  vendorId = vendor.id;

  const otherVendor = await prisma.vendor.create({
    data: { organizationId: orgId, name: OTHER_VENDOR, gstin: OTHER_GSTIN },
  });
  otherVendorId = otherVendor.id;

  // Create invoice (well-structured)
  const invoice = await prisma.invoice.create({
    data: {
      organizationId: orgId,
      vendorId,
      invoiceNumber: "3WAY-INV-001",
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

  // Create a delivery note that matches well
  const goodDn = await prisma.deliveryNote.create({
    data: {
      organizationId: orgId,
      vendorId,
      deliveryNoteNumber: "3WAY-DN-001",
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

  // Create a delivery note that does NOT match
  const badDn = await prisma.deliveryNote.create({
    data: {
      organizationId: orgId,
      vendorId: otherVendorId,
      deliveryNoteNumber: "3WAY-DN-002",
      deliveryDate: new Date("2026-04-01"),
      totalQuantity: 10,
      lineItems: JSON.stringify([{ description: "Nails Box", quantity: 5, unitPrice: 100 }]),
      status: "PROCESSED",
      processedAt: new Date(),
    },
  });
  badDnId = badDn.id;

  // Create an E-Way Bill that matches (correct vendor GSTIN, matching value)
  const goodEwb = await prisma.eWayBill.create({
    data: {
      organizationId: orgId,
      ewayBillNumber: "EWB-GOOD-001",
      generatedDate: new Date("2026-07-02"),
      validUntil: new Date("2026-08-01"),
      fromGstin: GSTIN,
      toGstin: "27AAARECEIVER1A1Z1",
      totalValue: 50000,
      transportMode: "Road",
      vehicleNumber: "MH-01-AB-1234",
      status: "PROCESSED",
    },
  });
  goodEwbId = goodEwb.id;

  // Create an E-Way Bill that does NOT match (wrong GSTIN, wrong value, expired)
  const badEwb = await prisma.eWayBill.create({
    data: {
      organizationId: orgId,
      ewayBillNumber: "EWB-BAD-001",
      generatedDate: new Date("2026-01-01"),
      validUntil: new Date("2026-02-01"), // expired
      fromGstin: "27WRONG1234A1Z1",
      toGstin: "27AAARECEIVER1A1Z1",
      totalValue: 10000,
      transportMode: "Rail",
      status: "PROCESSED",
    },
  });
  mismatchedEwbId = badEwb.id;
});

afterAll(async () => {
  await prisma.matchResult.deleteMany();
  await prisma.eWayBill.deleteMany();
  await prisma.deliveryNote.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.vendor.deleteMany();
  await prisma.organizationMember.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.$disconnect();
}, 15000);

// ── Tests ───────────────────────────────────────────────────────────

describe("3-Way Matching Engine API", () => {

  // ── 2-Way: Invoice ↔ Delivery Note ────────────────────────────

  describe("2-Way: INV ↔ DN", () => {
    it("matches a good delivery note (MATCHED)", async () => {
      const res = await request(app)
        .post("/api/matching/run")
        .send({ invoiceId, deliveryNoteIds: [goodDnId], autoPersist: true });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      const match = res.body.data[0];
      expect(match.status).toBe("MATCHED");
      expect(match.matchScore).toBeGreaterThanOrEqual(0.85);
      expect(match.discrepancies).toHaveLength(0);
      expect(match.id).toBeTruthy();
    });

    it("flags a mismatched delivery note (MISMATCH)", async () => {
      const res = await request(app)
        .post("/api/matching/run")
        .send({ invoiceId, deliveryNoteIds: [badDnId], autoPersist: false });

      expect(res.status).toBe(200);
      const match = res.body.data[0];
      expect(match.status).toBe("MISMATCH");
      expect(match.matchScore).toBeLessThan(0.5);
      expect(match.discrepancies.length).toBeGreaterThan(0);

      const types = match.discrepancies.map((d: any) => d.type);
      expect(types).toContain("VENDOR");
      expect(types).toContain("DATE");
    });

    it("auto-selects delivery notes from same vendor", async () => {
      const res = await request(app)
        .post("/api/matching/run")
        .send({ invoiceId });

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── 3-Way: Invoice ↔ DN ↔ EWB ─────────────────────────────────

  describe("3-Way: INV ↔ DN ↔ EWB", () => {
    it("produces clean 3-way match with good DN + good EWB", async () => {
      const res = await request(app)
        .post("/api/matching/run")
        .send({
          invoiceId,
          deliveryNoteIds: [goodDnId],
          ewayBillIds: [goodEwbId],
          autoPersist: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);

      const match = res.body.data[0];
      expect(match.status).toBe("MATCHED");
      expect(match.matchScore).toBeGreaterThanOrEqual(0.85);
      expect(match.invDnScore).toBeGreaterThanOrEqual(0.8);
      expect(match.invEwbScore).toBeGreaterThanOrEqual(0.8);
      expect(match.discrepancies).toHaveLength(0);
    });

    it("detects EWB tax/GSTIN mismatches", async () => {
      const res = await request(app)
        .post("/api/matching/run")
        .send({
          invoiceId,
          deliveryNoteIds: [goodDnId],
          ewayBillIds: [mismatchedEwbId],
          autoPersist: false,
        });

      expect(res.status).toBe(200);
      const match = res.body.data[0];

      expect(match.invEwbScore).toBeLessThan(0.5);
    });

    it("returns 404 for missing invoice", async () => {
      const res = await request(app)
        .post("/api/matching/run")
        .send({ invoiceId: "00000000-0000-0000-0000-000000000000" });
      expect(res.status).toBe(404);
    });
  });

  // ── GET /api/matching/results ──────────────────────────────────

  describe("GET results", () => {
    it("lists match results", async () => {
      const res = await request(app)
        .get("/api/matching/results")
        .query({ invoiceId });

      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.meta).toBeDefined();
    });

    it("returns match detail with discrepancies", async () => {
      const matchRes = await request(app)
        .post("/api/matching/run")
        .send({ invoiceId, deliveryNoteIds: [goodDnId], autoPersist: true });

      const matchId = matchRes.body.data[0]?.id;
      if (!matchId) return;

      const res = await request(app).get(`/api/matching/results/${matchId}`);
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(matchId);
      expect(res.body.data.invoice).toBeDefined();
      expect(Array.isArray(res.body.data.discrepancies)).toBe(true);
    });

    it("returns 404 for invalid match result id", async () => {
      const res = await request(app)
        .get("/api/matching/results/00000000-0000-0000-0000-000000000000");
      expect(res.status).toBe(404);
    });
  });

  // ── E-Way Bill API ─────────────────────────────────────────────

  describe("E-Way Bill API", () => {
    it("POST /api/eway-bills — creates an E-Way Bill", async () => {
      const res = await request(app)
        .post("/api/eway-bills")
        .send({
          organizationId: orgId,
          ewayBillNumber: `EWB-TEST-${Date.now()}`,
          generatedDate: "2026-07-15T00:00:00.000Z",
          validUntil: "2026-08-15T00:00:00.000Z",
          fromGstin: "27AAACA1234A1Z1",
          toGstin: "27AAACA5678A1Z1",
          totalValue: 75000,
          transportMode: "Road",
          vehicleNumber: "MH-02-CD-5678",
        });

      expect(res.status).toBe(201);
      expect(res.body.data.ewayBillNumber).toBeTruthy();
    });

    it("POST /api/eway-bills — rejects duplicate EWB number", async () => {
      const ewbNumber = `EWB-DUP-${Date.now()}`;
      await request(app).post("/api/eway-bills").send({
        organizationId: orgId,
        ewayBillNumber: ewbNumber,
        generatedDate: "2026-07-15",
        validUntil: "2026-08-15",
        fromGstin: "27AAACA1234A1Z1",
        toGstin: "27AAACA5678A1Z1",
        totalValue: 100,
      });

      const res = await request(app).post("/api/eway-bills").send({
        organizationId: orgId,
        ewayBillNumber: ewbNumber,
        generatedDate: "2026-07-15",
        validUntil: "2026-08-15",
        fromGstin: "27AAACA1234A1Z1",
        toGstin: "27AAACA5678A1Z1",
        totalValue: 100,
      });

      expect(res.status).toBe(409);
    });

    it("GET /api/eway-bills — lists E-Way Bills", async () => {
      const res = await request(app).get("/api/eway-bills");
      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.meta).toBeDefined();
    });

    it("GET /api/eway-bills/:id — returns E-Way Bill detail", async () => {
      const res = await request(app).get(`/api/eway-bills/${goodEwbId}`);
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(goodEwbId);
    });

    it("GET /api/eway-bills/:id — returns 404 for invalid id", async () => {
      const res = await request(app)
        .get("/api/eway-bills/00000000-0000-0000-0000-000000000000");
      expect(res.status).toBe(404);
    });

    it("POST /api/eway-bills/sync — syncs mock E-Way Bills", async () => {
      const res = await request(app)
        .post("/api/eway-bills/sync")
        .send({
          organizationId: orgId,
          fromDate: "2026-07-01T00:00:00.000Z",
          toDate: "2026-07-15T00:00:00.000Z",
          limit: 5,
        });

      expect(res.status).toBe(202);
      expect(res.body.data.status).toBe("COMPLETED");
    });

    it("POST /api/eway-bills/sync — rejects >30 day range", async () => {
      const res = await request(app)
        .post("/api/eway-bills/sync")
        .send({
          fromDate: "2026-01-01T00:00:00.000Z",
          toDate: "2026-07-15T00:00:00.000Z",
        });

      expect(res.status).toBe(422);
    });
  });

  // ── Stats & Resolution ──────────────────────────────────────────

  describe("Stats & Resolution", () => {
    it("GET /api/matching/stats — returns aggregate statistics", async () => {
      const res = await request(app).get("/api/matching/stats");
      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(typeof res.body.data.totalMatches).toBe("number");
      expect(typeof res.body.data.matchRate).toBe("number");
      expect(typeof res.body.data.matched).toBe("number");
      expect(typeof res.body.data.pendingReview).toBe("number");
      expect(res.body.data.documents).toBeDefined();
      expect(typeof res.body.data.documents.invoices).toBe("number");
      expect(typeof res.body.data.documents.deliveryNotes).toBe("number");
      expect(typeof res.body.data.documents.ewayBills).toBe("number");
    });

    it("PUT /api/matching/results/:id/resolve — accepts a match result", async () => {
      const matchRes = await request(app)
        .post("/api/matching/run")
        .send({ invoiceId, deliveryNoteIds: [goodDnId], autoPersist: true });

      const matchId = matchRes.body.data[0]?.id;
      if (!matchId) return;

      const res = await request(app)
        .put(`/api/matching/results/${matchId}/resolve`)
        .send({ action: "accept", reviewedBy: "test-user", notes: "All good" });

      expect(res.status).toBe(200);
      expect(res.body.data.reviewedBy).toBe("test-user");
      expect(res.body.data.reviewedAt).toBeTruthy();
      expect(res.body.meta.resolved).toBe(true);

      // Verify invoice status updated to RESOLVED
      const invRes = await request(app).get(`/api/invoices/${invoiceId}`);
      expect(invRes.body.data.status).toBe("RESOLVED");
    });

    it("PUT /api/matching/results/:id/resolve — rejects already reviewed", async () => {
      const matchRes = await request(app)
        .post("/api/matching/run")
        .send({ invoiceId, deliveryNoteIds: [goodDnId], autoPersist: true });

      const matchId = matchRes.body.data[0]?.id;
      if (!matchId) return;

      await request(app)
        .put(`/api/matching/results/${matchId}/resolve`)
        .send({ action: "accept", reviewedBy: "user-1" });

      const res = await request(app)
        .put(`/api/matching/results/${matchId}/resolve`)
        .send({ action: "accept", reviewedBy: "user-2" });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe("ALREADY_REVIEWED");
    });

    it("PUT /api/matching/results/:id/resolve — returns 404 for invalid id", async () => {
      const res = await request(app)
        .put("/api/matching/results/00000000-0000-0000-0000-000000000000/resolve")
        .send({ action: "accept", reviewedBy: "test-user" });

      expect(res.status).toBe(404);
    });

    it("PUT /api/matching/results/:id/resolve — validates request body", async () => {
      const res = await request(app)
        .put(`/api/matching/results/${goodEwbId}/resolve`)
        .send({ action: "invalid", reviewedBy: "test-user" });

      expect(res.status).toBe(422);
    });

    it("GET /api/matching/results — filters by status", async () => {
      const res = await request(app)
        .get("/api/matching/results")
        .query({ status: "MATCHED" });

      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
    });
  });
});
