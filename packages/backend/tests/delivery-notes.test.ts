import request from "supertest";
import app from "../src/index";
import { prisma } from "../src/index";

describe("Delivery Notes API", () => {
  let vendorId: string;
  let dnId: string;

  beforeAll(async () => {
    await prisma.matchResult.deleteMany();
    await prisma.eWayBill.deleteMany();
    await prisma.deliveryNote.deleteMany();
    await prisma.invoice.deleteMany();
    await prisma.vendor.deleteMany();
    const vendor = await prisma.vendor.create({
      data: { name: "DN Test Vendor", gstin: "27AAACA9012A1Z1" },
    });
    vendorId = vendor.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("POST /api/delivery-notes — creates a delivery note manually", async () => {
    const res = await request(app).post("/api/delivery-notes").send({
      vendorId,
      deliveryNoteNumber: "DN-TEST-001",
      deliveryDate: "2026-07-16",
      totalQuantity: 100,
    });

    expect(res.status).toBe(201);
    expect(res.body.data.deliveryNoteNumber).toBe("DN-TEST-001");
    dnId = res.body.data.id;
  });

  it("GET /api/delivery-notes — lists delivery notes", async () => {
    const res = await request(app).get("/api/delivery-notes");

    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
  });

  it("GET /api/delivery-notes/:id — returns detail", async () => {
    const res = await request(app).get(`/api/delivery-notes/${dnId}`);

    expect(res.status).toBe(200);
    expect(res.body.data.deliveryNoteNumber).toBe("DN-TEST-001");
  });

  it("PUT /api/delivery-notes/:id/status — updates status", async () => {
    const res = await request(app)
      .put(`/api/delivery-notes/${dnId}/status`)
      .send({ status: "PROCESSED" });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("PROCESSED");
  });

  it("POST /api/delivery-notes/upload — rejects without file", async () => {
    const res = await request(app).post("/api/delivery-notes/upload");
    expect(res.status).toBe(400);
  });
});
