import { Router, Request, Response } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../index";
import { validate } from "../middleware/validate";
import { signToken, requireAuth } from "../middleware/auth";

const router = Router();

// ── Schemas ─────────────────────────────────────────────────────────

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1, "Name is required"),
  organizationName: z.string().min(1, "Organization name is required"),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// ── Routes ──────────────────────────────────────────────────────────

/**
 * POST /api/auth/register — Create account + organization
 */
router.post("/register", validate(registerSchema), async (req: Request, res: Response) => {
  const { email, password, name, organizationName } = req.body;

  // Check if email already exists
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: "Email already registered", code: "EMAIL_EXISTS" });
    return;
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, 10);

  // Determine a unique slug
  const slug = organizationName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    + "-" + Date.now().toString(36);

  const org = await prisma.organization.create({
    data: { name: organizationName, slug },
  });

  const user = await prisma.user.create({
    data: { email, passwordHash, name },
  });

  await prisma.organizationMember.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      role: "ADMIN",
    },
  });

  const result = { user, org };

  const token = signToken({
    userId: result.user.id,
    email: result.user.email,
    organizationId: result.org.id,
    role: "ADMIN",
  });

  res.status(201).json({
    data: {
      token,
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
      },
      organization: {
        id: result.org.id,
        name: result.org.name,
        slug: result.org.slug,
      },
    },
  });
});

/**
 * POST /api/auth/login — Authenticate and return JWT + org context
 */
router.post("/login", validate(loginSchema), async (req: Request, res: Response) => {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    res.status(401).json({ error: "Invalid email or password", code: "INVALID_CREDENTIALS" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password", code: "INVALID_CREDENTIALS" });
    return;
  }

  // Get the user's first organization membership
  const membership = await prisma.organizationMember.findFirst({
    where: { userId: user.id },
    include: { organization: true },
    orderBy: { createdAt: "asc" },
  });

  if (!membership) {
    res.status(403).json({ error: "No organization access", code: "NO_ORG" });
    return;
  }

  const token = signToken({
    userId: user.id,
    email: user.email,
    organizationId: membership.organizationId,
    role: membership.role,
  });

  res.json({
    data: {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      organization: {
        id: membership.organization.id,
        name: membership.organization.name,
        slug: membership.organization.slug,
      },
    },
  });
});

/**
 * GET /api/auth/me — Get current user profile + org context
 */
router.get("/me", requireAuth, async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { id: true, email: true, name: true, createdAt: true },
  });

  if (!user) {
    res.status(404).json({ error: "User not found", code: "NOT_FOUND" });
    return;
  }

  const membership = await prisma.organizationMember.findFirst({
    where: { userId: user.id },
    include: { organization: true },
  });

  res.json({
    data: {
      user,
      organization: membership
        ? { id: membership.organization.id, name: membership.organization.name, slug: membership.organization.slug, role: membership.role }
        : null,
    },
  });
});

export default router;
