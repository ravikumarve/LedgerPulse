import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../index";
import { validate } from "../middleware/validate";
import { requireAuth } from "../middleware/auth";

const router = Router();

// ── Schemas ──

const updateOrgSchema = z.object({
  name: z.string().min(1).optional(),
  settings: z.record(z.unknown()).optional(),
});

// ── Middleware — resolve orgId from JWT ──

function getOrgId(req: Request): string {
  return req.user!.organizationId;
}

// ── Routes ──

/**
 * GET /api/organization — Get current org profile
 */
router.get("/", requireAuth, async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) {
    res.status(404).json({ error: "Organization not found" });
    return;
  }
  res.json({ data: org });
});

/**
 * PUT /api/organization — Update org name or settings
 */
router.put("/", requireAuth, validate(updateOrgSchema), async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  const { name, settings } = req.body;

  const updateData: Record<string, unknown> = {};
  if (name) updateData.name = name;
  if (settings) {
    // Merge with existing settings
    const existing = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { settings: true },
    });
    const current = existing?.settings ? JSON.parse(existing.settings) : {};
    updateData.settings = JSON.stringify({ ...current, ...settings });
  }

  if (Object.keys(updateData).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const org = await prisma.organization.update({
    where: { id: orgId },
    data: updateData,
  });

  res.json({ data: org });
});

/**
 * GET /api/organization/members — List team members
 */
router.get("/members", requireAuth, async (req: Request, res: Response) => {
  const orgId = getOrgId(req);

  const members = await prisma.organizationMember.findMany({
    where: { organizationId: orgId },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const data: { id: string; name: string; email: string; role: string }[] = [];
  for (const m of members) {
    data.push({ id: m.id, name: m.user.name, email: m.user.email, role: m.role });
  }
  res.json({ data });
});

export default router;
