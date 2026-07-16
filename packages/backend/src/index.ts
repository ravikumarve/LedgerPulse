import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { PrismaClient } from "@prisma/client";
import healthRouter from "./routes/health";

export const prisma = new PrismaClient();

const app = express();
const PORT = process.env.PORT ?? 3001;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Rate limiting
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Routes
app.use("/api/health", healthRouter);

// Global error handler
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("Unhandled error:", err);
    res.status(500).json({
      error: "Internal server error",
      message:
        process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
);

// Start server (only when not testing)
if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`🚀 LedgerPulse API running on http://localhost:${PORT}`);
  });
}

export default app;
