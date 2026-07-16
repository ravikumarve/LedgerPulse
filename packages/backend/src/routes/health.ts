import { Router, Request, Response } from "express";
import { prisma } from "../index";

const router = Router();

/**
 * GET /api/health
 * Health check endpoint — returns server status and DB connectivity
 */
router.get("/", async (_req: Request, res: Response) => {
  const checks: Record<string, string> = {
    server: "ok",
  };

  try {
    // Quick DB connectivity check
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch {
    checks.database = "error";
  }

  const allOk = Object.values(checks).every((v) => v === "ok");

  res.status(allOk ? 200 : 503).json({
    status: allOk ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    checks,
  });
});

export default router;
