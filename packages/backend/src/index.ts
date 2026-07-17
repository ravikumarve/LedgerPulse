import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { PrismaClient } from "@prisma/client";
import healthRouter from "./routes/health";
import vendorsRouter from "./routes/vendors";
import invoicesRouter from "./routes/invoices";
import deliveryNotesRouter from "./routes/delivery-notes";
import matchingRouter from "./routes/matching";
import ewayBillsRouter from "./routes/eway-bills";

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
app.use("/api/vendors", vendorsRouter);
app.use("/api/invoices", invoicesRouter);
app.use("/api/delivery-notes", deliveryNotesRouter);
app.use("/api/matching", matchingRouter);
app.use("/api/eway-bills", ewayBillsRouter);

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
      code: "INTERNAL_ERROR",
      message:
        process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
);

// Start server (only when not testing)
if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`🚀 LedgerPulse API running on http://localhost:${PORT}`);
    console.log(`📋 Routes:`);
    console.log(`   GET  /api/health`);
    console.log(`   GET  /api/vendors`);
    console.log(`   POST /api/vendors`);
    console.log(`   GET  /api/vendors/:id`);
    console.log(`   PUT  /api/vendors/:id`);
    console.log(`   DEL  /api/vendors/:id`);
    console.log(`   GET  /api/invoices`);
    console.log(`   POST /api/invoices/upload`);
    console.log(`   POST /api/invoices`);
    console.log(`   GET  /api/invoices/:id`);
    console.log(`   PUT  /api/invoices/:id/status`);
    console.log(`   POST /api/invoices/:id/reprocess`);
    console.log(`   GET  /api/delivery-notes`);
    console.log(`   POST /api/delivery-notes/upload`);
    console.log(`   POST /api/delivery-notes`);
    console.log(`   GET  /api/delivery-notes/:id`);
    console.log(`   PUT  /api/delivery-notes/:id/status`);
    console.log(`   POST /api/matching/run`);
    console.log(`   GET  /api/matching/results`);
    console.log(`   GET  /api/matching/results/:id`);
    console.log(`   GET  /api/eway-bills`);
    console.log(`   POST /api/eway-bills`);
    console.log(`   POST /api/eway-bills/sync`);
    console.log(`   GET  /api/eway-bills/:id`);
  });
}

export default app;
