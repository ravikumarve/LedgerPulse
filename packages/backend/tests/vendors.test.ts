import request from "supertest";
import app from "../src/index";
import { prisma } from "../src/index";

describe("Vendors API", () => {
  let vendorId: string;
  let orgId: string;

  beforeAll(async () => {
    // Ensure a test org exists
    const org = await prisma.organization.create({
      data: { name: "Test Org", slug: `test-vendors-${Date.now()}` },
    });
    orgId = org.id;
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

  it("POST /api/vendors — creates a vendor", async () => {
    const res = await request(app).post("/api/vendors").send({
      organizationId: orgId,
      name: "Test Vendor",
      gstin: "27AAACA1234A1Z1",
      email: "vendor@test.com",
    });

    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty("id");
    expect(res.body.data.name).toBe("Test Vendor");
    expect(res.body.data.organizationId).toBe(orgId);
    vendorId = res.body.data.id;
  });

  it("GET /api/vendors — lists vendors", async () => {
    const res = await request(app).get("/api/vendors");

    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
  });

  it("GET /api/vendors/:id — returns vendor detail", async () => {
    const res = await request(app).get(`/api/vendors/${vendorId}`);

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe("Test Vendor");
    expect(res.body.data).toHaveProperty("_count");
  });

  it("PUT /api/vendors/:id — updates vendor", async () => {
    const res = await request(app).put(`/api/vendors/${vendorId}`).send({
      email: "updated@test.com",
    });

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe("updated@test.com");
  });

  it("DELETE /api/vendors/:id — soft deletes vendor", async () => {
    const res = await request(app).delete(`/api/vendors/${vendorId}`);

    expect(res.status).toBe(204);
  });

  it("GET /api/vendors/:id — returns 404 for deleted vendor (searched by deleted name)", async () => {
    const res = await request(app).get(`/api/vendors/${vendorId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.name).toMatch(/^\[deleted_/);
  });
});
