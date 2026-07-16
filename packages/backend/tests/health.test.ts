import request from "supertest";
import app from "../src/index";

describe("GET /api/health", () => {
  it("returns 200 with healthy status when DB is connected", async () => {
    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("status", "healthy");
    expect(res.body).toHaveProperty("checks");
    expect(res.body.checks).toHaveProperty("server", "ok");
    expect(res.body.checks).toHaveProperty("database");
  });
});
