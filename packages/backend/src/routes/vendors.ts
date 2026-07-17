import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../index";
import { validate } from "../middleware/validate";

const router = Router();

// --- Schemas ---
const createVendorSchema = z.object({
  name: z.string().min(1, "Vendor name is required"),
  gstin: z.string().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$/, "Invalid GSTIN format").optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  address: z.string().optional().or(z.literal("")),
  contractRef: z.string().optional().or(z.literal("")),
});

const updateVendorSchema = createVendorSchema.partial();

// --- Routes ---

/**
 * GET /api/vendors — List vendors with pagination + search
 */
router.get("/", async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const perPage = Math.min(100, Math.max(1, parseInt(req.query.perPage as string) || 20));
  const search = (req.query.search as string) || "";

  const where = search
    ? {
        OR: [
          { name: { contains: search } },
          { gstin: { contains: search } },
          { email: { contains: search } },
        ],
      }
    : {};

  const [data, total] = await Promise.all([
    prisma.vendor.findMany({
      where,
      skip: (page - 1) * perPage,
      take: perPage,
      orderBy: { name: "asc" },
    }),
    prisma.vendor.count({ where }),
  ]);

  res.json({
    data,
    meta: { page, perPage, total, totalPages: Math.ceil(total / perPage) },
  });
});

/**
 * POST /api/vendors — Create vendor
 */
router.post("/", validate(createVendorSchema), async (req: Request, res: Response) => {
  const data = await prisma.vendor.create({ data: req.body });
  res.status(201).json({ data });
});

/**
 * GET /api/vendors/:id — Get vendor detail
 */
router.get("/:id", async (req: Request, res: Response) => {
  const vendor = await prisma.vendor.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { invoices: true, deliveryNotes: true } } },
  });
  if (!vendor) {
    res.status(404).json({ error: "Vendor not found", code: "NOT_FOUND" });
    return;
  }
  res.json({ data: vendor });
});

/**
 * PUT /api/vendors/:id — Update vendor
 */
router.put("/:id", validate(updateVendorSchema), async (req: Request, res: Response) => {
  try {
    const vendor = await prisma.vendor.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json({ data: vendor });
  } catch (err: any) {
    if (err?.code === "P2025") {
      res.status(404).json({ error: "Vendor not found", code: "NOT_FOUND" });
      return;
    }
    throw err;
  }
});

/**
 * DELETE /api/vendors/:id — Soft delete vendor
 */
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    // Soft delete by clearing identifiable fields
    await prisma.vendor.update({
      where: { id: req.params.id },
      data: {
        name: `[deleted_${req.params.id.slice(0, 8)}]`,
        gstin: null,
        email: null,
        phone: null,
      },
    });
    res.status(204).send();
  } catch (err: any) {
    if (err?.code === "P2025") {
      res.status(404).json({ error: "Vendor not found", code: "NOT_FOUND" });
      return;
    }
    throw err;
  }
});

export default router;
