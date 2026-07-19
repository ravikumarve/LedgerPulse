import request from "supertest";
import app from "../src/index";
import { prisma } from "../src/index";

describe("Invoices API", () => {
  let vendorId: string;
  let invoiceId: string;
  let orgId: string;

  beforeAll(async () => {
    // Clean tables in FK order
    await prisma.matchResult.deleteMany();
    await prisma.eWayBill.deleteMany();
    await prisma.deliveryNote.deleteMany();
    await prisma.invoice.deleteMany();
    await prisma.vendor.deleteMany();

    const org = await prisma.organization.create({
      data: { name: "Invoice Test Org", slug: `test-inv-${Date.now()}` },
    });
    orgId = org.id;

    const vendor = await prisma.vendor.create({
      data: { organizationId: orgId, name: "Invoice Test Vendor", gstin: "27AAACA5678A1Z1" },
    });
    vendorId = vendor.id;
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
  });

  it("POST /api/invoices — creates an invoice manually", async () => {
    const res = await request(app).post("/api/invoices").send({
      organizationId: orgId,
      vendorId,
      invoiceNumber: "INV-TEST-001",
      invoiceDate: "2026-07-15",
      totalAmount: 50000,
      taxAmount: 9000,
    });

    expect(res.status).toBe(201);
    expect(res.body.data.invoiceNumber).toBe("INV-TEST-001");
    invoiceId = res.body.data.id;
  });

  it("GET /api/invoices — lists invoices", async () => {
    const res = await request(app).get("/api/invoices");

    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
  });

  it("GET /api/invoices/:id — returns invoice detail", async () => {
    const res = await request(app).get(`/api/invoices/${invoiceId}`);

    expect(res.status).toBe(200);
    expect(res.body.data.invoiceNumber).toBe("INV-TEST-001");
    expect(res.body.data.vendor).toBeDefined();
  });

  it("PUT /api/invoices/:id/status — updates status", async () => {
    const res = await request(app)
      .put(`/api/invoices/${invoiceId}/status`)
      .send({ status: "PROCESSED" });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("PROCESSED");
  });

  it("POST /api/invoices — validates required fields", async () => {
    const res = await request(app).post("/api/invoices").send({
      vendorId: "not-a-uuid",
    });

    expect(res.status).toBe(422);
  });

  it("GET /api/invoices/:id — returns 404 for invalid id", async () => {
    const res = await request(app).get(
      "/api/invoices/00000000-0000-0000-0000-000000000000"
    );
    expect(res.status).toBe(404);
  });

  it("POST /api/invoices/upload — rejects request without file", async () => {
    const res = await request(app).post("/api/invoices/upload");

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });
});
