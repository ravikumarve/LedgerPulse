import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../index";

const JWT_SECRET = process.env.JWT_SECRET ?? "ledgerpulse-dev-secret-change-in-prod";

export interface AuthPayload {
  userId: string;
  email: string;
  organizationId: string;
  role: string;
}

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

/**
 * Generate a JWT token for a user in a specific organization context.
 */
export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

/**
 * Require authentication — extracts and verifies JWT from Authorization header.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required", code: "UNAUTHORIZED" });
    return;
  }

  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, JWT_SECRET) as AuthPayload;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token", code: "UNAUTHORIZED" });
  }
}

/**
 * Optional authentication — sets req.user if token present, continues regardless.
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    try {
      const token = header.slice(7);
      req.user = jwt.verify(token, JWT_SECRET) as AuthPayload;
    } catch {
      // token invalid, proceed without user
    }
  }
  next();
}

/**
 * Require a specific role or higher.
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required", code: "UNAUTHORIZED" });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        error: `Requires one of roles: ${roles.join(", ")}`,
        code: "FORBIDDEN",
      });
      return;
    }
    next();
  };
}

/**
 * Fetch organization membership to verify user belongs to the org.
 */
export async function getMembership(userId: string, organizationId: string) {
  return prisma.organizationMember.findUnique({
    where: {
      userId_organizationId: { userId, organizationId },
    },
  });
}
