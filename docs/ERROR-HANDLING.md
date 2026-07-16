# LedgerPulse Error Handling & Edge Cases

> **Version:** 1.0.0  
> **Status:** Draft  
> **Last Updated:** 2026-07-16  
> **Applies to:** Backend — Node.js / Express / TypeScript / Prisma  
> **Domain:** Supply Chain Reconciliation & Tax Engine — financial document processing

---

## Table of Contents

1. [Error Handling Philosophy](#1-error-handling-philosophy)
2. [Error Response Format](#2-error-response-format)
3. [Edge Cases by Domain](#3-edge-cases-by-domain)
   - [A. Document Ingestion](#a-document-ingestion-upload--email)
   - [B. 3-Way Matching Engine](#b-3-way-matching-engine)
   - [C. E-Way Bill / Tax Integration](#c-e-way-bill--tax-integration)
   - [D. Authentication & Multi-Tenant](#d-authentication--multi-tenant)
   - [E. Approval Workflow](#e-approval-workflow)
4. [Exception Handling Strategy](#4-exception-handling-strategy)
5. [Error Classification Table](#5-error-classification-table)
6. [Recovery & Retry Policies](#6-recovery--retry-policies)
7. [Audit Logging Requirements](#7-audit-logging-requirements)
8. [Monitoring & Alerting](#8-monitoring--alerting)

---

## 1. Error Handling Philosophy

### Fail Fast vs Graceful Degradation

| Layer | Strategy | Rationale |
|-------|----------|-----------|
| API input validation | **Fail fast** | Reject malformed requests immediately before touching DB or external services. No partial processing. |
| Document ingestion | **Fail fast with retry** | A corrupted PDF must never reach the matching engine. Reject at the boundary, let the user resubmit. |
| 3-Way matching | **Graceful degradation** | If one data source is missing (e.g., no E-Way Bill yet), produce a "pending" match result — don't crash. |
| External API calls (GST) | **Graceful degradation** | If GST portal is down, queue the request, continue processing other documents, alert admin. |
| OCR pipeline | **Graceful degradation** | Low-confidence OCR → flag for human review — don't reject the document outright. |

### User-Facing vs Internal Errors

- **User-facing errors** (4xx): Clear, actionable messages. Tell the user *what* is wrong, *why* it happened, and *what to do* next.
- **Internal errors** (5xx): Never leak stack traces, DB queries, or internal paths in production responses. Log full details server-side, return a generic message with a `traceId` for support.
- **System-level alerts**: Errors that require operator intervention (disk full, DB connection pool exhausted, rate limit breached on GST API) are never user-facing.

### Log Levels

| Level | When to Use |
|-------|-------------|
| `ERROR` | Unrecoverable failures: DB connection lost, external API unreachable after retries, unhandled exceptions |
| `WARN` | Recoverable anomalies: OCR confidence below threshold, duplicate detection triggered, rate limit approaching |
| `INFO` | State transitions: document ingested, match completed, approval granted |
| `DEBUG` | Detailed flow tracing: request/response payloads, timing, retry attempts (never in production by default) |
| `TRACE` | Deep debugging: raw OCR text, intermediate match scores (local dev only) |

---

## 2. Error Response Format

All errors use the standard envelope defined in the API spec:

```json
{
  "data": null,
  "meta": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable description suited for display",
    "details": [
      {
        "field": "invoiceNumber",
        "message": "Invoice number is required"
      }
    ],
    "traceId": "lp-abc123def456"
  }
}
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | `string` | always | Machine-readable error code (SCREAMING_SNAKE_CASE). See [Error Classification Table](#5-error-classification-table). |
| `message` | `string` | always | Human-readable summary. Suitable for toast notifications or alert banners. |
| `details` | `FieldError[]` | optional | Array of field-level validation errors. Present for 422 responses. Each entry: `{ field: string, message: string }`. |
| `traceId` | `string` | always | Correlation ID generated per request. Enables support-to-log cross-reference. Format: `lp-{nanoid(12)}`. |

### HTTP Status Code Rules

| Condition | Status |
|-----------|--------|
| Request body fails Zod schema validation | `422 Unprocessable Entity` |
| Authentication missing or invalid | `401 Unauthorized` |
| Authenticated but not authorized for resource | `403 Forbidden` |
| Resource not found | `404 Not Found` |
| Business rule violation (e.g., duplicate match) | `409 Conflict` |
| External service unavailable | `502 Bad Gateway` |
| Rate limit exceeded | `429 Too Many Requests` |
| Unhandled exception | `500 Internal Server Error` |

---

## 3. Edge Cases by Domain

### A. Document Ingestion (Upload + Email)

| # | Edge Case | Detection | Response | Severity |
|---|-----------|-----------|----------|----------|
| 1 | **Corrupted/malformed PDF** | PDF header magic bytes check fails; PDF parser throws on structure | Reject with `INVALID_DOCUMENT` (422). Message: "File could not be read. It may be corrupted. Please re-save and re-upload." | Medium |
| 2 | **Wrong file type** | MIME type not in allowed list (`application/pdf`, `image/png`, `image/jpeg`, `image/tiff`) | Reject with `INVALID_FILE_TYPE` (422). Acceptable types enumerated in message. | Low |
| 3 | **Empty file** | `file.size === 0` after multer | Reject with `EMPTY_FILE` (422). | Low |
| 4 | **Duplicate invoice number (same vendor)** | Prisma unique constraint `@@unique([vendorId, invoiceNumber])` on insert | Catch `Prisma.PrismaClientKnownRequestError` with code `P2002`. Return `DUPLICATE_INVOICE` (409). Message: "Invoice #{number} from {vendor} already exists. Upload a correction or void the existing invoice." Never overwrite. | Medium |
| 5 | **File exceeds size limit** | `multer` `limits.fileSize` (10MB) | Multer `LIMIT_FILE_SIZE` → `FILE_TOO_LARGE` (413). Message: "File exceeds maximum size of 10MB." | Low |
| 6 | **Email attachment missing** | Email ingestion: no attachment detected after successful email parse | Return `MISSING_ATTACHMENT` (422). Queue a notification email back to sender: "Your email to LedgerPulse did not contain an attachment. Please reply with the invoice or delivery note PDF." | Medium |
| 7 | **OCR on low-quality photo** | OCR confidence score (from vision model) < 0.7 | Document is ingested with status `DISCREPANCY`. Flagged for human review. Admin dashboard shows "Low OCR confidence — verify manually." Never auto-match low-confidence OCR. | High |
| 8 | **Password-protected PDF** | PDF metadata flags `encrypted` | Reject with `PROTECTED_DOCUMENT` (422). Message: "This PDF is password-protected. Please remove protection and re-upload." | Medium |
| 9 | **Very high-resolution image (100MB)** | Image dimensions exceed threshold (e.g., > 4000px on longest side) | Auto-downscale to 2000px longest side before OCR pipeline. Log original dimensions. If downscale fails, reject with `IMAGE_PROCESSING_ERROR` (422). | Low |

### B. 3-Way Matching Engine

| # | Edge Case | Detection | Response | Severity |
|---|-----------|-----------|----------|----------|
| 1 | **Invoice exists but no delivery note** | Match requested; `invoice.deliveryNotes` is empty | Create `MatchResult` with `status: "PARTIAL"`, `matchScore: 0.0`. Discrepancy: `DELIVERY_NOTE_MISSING`. Message: "Invoice processed. Waiting for delivery note to complete 2-way match." Set status `PENDING`. | Medium |
| 2 | **Quantity mismatch (delivered 48, invoiced 50)** | Line-item comparison: delivered qty ≠ invoiced qty | Create `MatchResult` with `status: "MISMATCH"`. Discrepancy: `{ "type": "QUANTITY_MISMATCH", "lineItem": "...", "invoiced": 50, "delivered": 48, "difference": -2 }`. | High |
| 3 | **Price inflation (invoiced ₹850/unit, contract says ₹800)** | Invoice unit price > `Vendor.contractRef` baseline. Contract baseline stored as metadata on Vendor. | Flag as `PRICE_INFLATION` discrepancy. Difference: ₹50/unit. Escalate to approval workflow. Never auto-approve over-baseline pricing. | Critical |
| 4 | **Tax code mismatch (GST 18% vs 12%)** | Invoice `taxAmount` percentage ≠ expected rate for product HSN code | `TAX_CODE_MISMATCH` discrepancy. High-severity flag — potential tax credit loss or penalty. Must reach human reviewer. | Critical |
| 5 | **Duplicate invoice submitted twice** | Checksum (SHA-256 of raw file) matches an existing document for the same vendor | Return `DUPLICATE_DOCUMENT` (409). Do NOT process. Log detection. If amounts differ, flag as potential fraud. | Critical |
| 6 | **Missing line items on delivery note** | Delivery note has fewer line items than invoice | `PARTIAL` match. Discrepancy lists which invoice line items are unmatched to delivery. | Medium |
| 7 | **E-Way Bill expired before delivery** | `EWayBill.validUntil` < `DeliveryNote.deliveryDate` | Compliance alert: `EWB_EXPIRED` discrepancy. Generates report for tax penalty assessment. | Critical |
| 8 | **Goods received but no E-Way Bill** | Delivery note ingested but linked `invoice.ewayBills` is empty | `EWB_MISSING` alert. Set status to `PENDING` on E-Way Bill dimension. Do not finalize match. | High |
| 9 | **Weighbridge value significantly different from delivery note** | `DeliveryNote.weightbridgeValue` deviates > 5% from expected weight based on line-items × unit weight | `WEIGHT_DISCREPANCY` flag. Investigation required — potential theft or recording error. | High |
| 10 | **Currency conversion errors** | Lock all transactions to INR (`₹`) v1. If a foreign-currency invoice is uploaded, reject with `UNSUPPORTED_CURRENCY` (422). Do NOT implement auto-conversion in v1. | Low |

### C. E-Way Bill / Tax Integration

| # | Edge Case | Detection | Response | Severity |
|---|-----------|-----------|----------|----------|
| 1 | **GST API timeout** | HTTP request to GST portal exceeds 10s | Retry with exponential backoff (3 attempts: 1s, 4s, 15s). All attempts fail → return `GST_API_TIMEOUT` (502). | Medium |
| 2 | **GST API returns error** | Non-2xx HTTP response from GST portal | Log the full response body, status, headers to structured log. Return `GST_API_ERROR` (502). Alert admin. Do NOT cache partial responses. | Medium |
| 3 | **E-Way Bill number already exists** | Prisma unique constraint `@@unique([ewayBillNumber])` on insert | Check existence before insert. If exists, return `DUPLICATE_EWB` (409). Message: "E-Way Bill {number} already exists in the system. Verify you are not creating a duplicate entry." | Medium |
| 4 | **Invalid GSTIN format** | GSTIN fails regex: `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$` | Reject locally before any API call. Return `INVALID_GSTIN` (422). Message with expected format. | Low |
| 5 | **E-Way Bill expired en route** | `EWayBill.validUntil` < current date while `DeliveryNote.status` is still PENDING | Auto-generate extension request via GST API. If extension fails, flag as `EWB_EXPIRED` (high severity). | High |
| 6 | **GST API rate limits** | HTTP 429 from GST portal | Implement request queue with delay. Parse `Retry-After` header if present. Fall back to 60s default. Store failed requests in dead-letter queue after 3 retries. | Medium |
| 7 | **Network failure during sync** | TCP connection refused / DNS resolution failure during batch sync | Resume from last successful batch item (store checkpoint offset). Do not re-process successful items. Log network error and alert. | Medium |
| 8 | **GSTIN not found in government database** | GST API returns "GSTIN not found" response | Flag for manual verification: `GSTIN_NOT_FOUND`. Do not ingest E-Way Bill until vendor GSTIN is validated. | High |

### D. Authentication & Multi-Tenant

| # | Edge Case | Detection | Response | Severity |
|---|-----------|-----------|----------|----------|
| 1 | **Session token expired** | JWT `exp` claim < `Date.now() / 1000` | Return `TOKEN_EXPIRED` (401). Frontend redirects to login. Refresh token flow if available. | High |
| 2 | **User accesses another tenant's data** | Requested resource `tenantId` ≠ JWT `tenantId` claim | Return `FORBIDDEN` (403). Log the attempt including requesting user, target tenant, and resource. | Critical |
| 3 | **Concurrent login from different IP** | Same user JWT used from a new IP within same token lifetime while previous session still active | Trigger security alert. Notify user via email. Flag for admin review. Do NOT auto-invalidate (could be legitimate multi-device). | High |
| 4 | **Rate limit exceeded** | Request count > 100 per 15-minute window (standard) or > 20 per 15-minute window (sync endpoints) | Return `RATE_LIMIT_EXCEEDED` (429) with `Retry-After` header. Do not leak remaining limit in response body. | Low |

### E. Approval Workflow

| # | Edge Case | Detection | Response | Severity |
|---|-----------|-----------|----------|----------|
| 1 | **Approver is unavailable** | No action on a pending approval for > 48 hours | Auto-escalate to next-tier approver. Send notification. Log escalation. | Medium |
| 2 | **Dispute rejected by vendor** | Vendor responds to dispute with rejection | Move discrepancy to `ESCALATED_REVIEW` status. Assign to senior reconciler. No auto-resolution. | Medium |
| 3 | **Approval chain broken (approver left company)** | Approval step assigned to a user whose account is deactivated | Admin dashboard alert: "Broken approval chain for discrepancy #{id}. Reassign manually." System pauses approval until reassigned. | High |

---

## 4. Exception Handling Strategy

### Global Error Handler Middleware

The global handler in `src/index.ts` must be extended from the current bare catch-all to a robust, multi-tier middleware:

```typescript
// src/middleware/errorHandler.ts
import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { AppError } from "../types/errors";
import { logger } from "../services/logger";

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const traceId = `lp-${nanoid(12)}`;

  // Zod validation errors → 422
  if (err instanceof ZodError) {
    res.status(422).json({
      data: null,
      meta: null,
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: err.errors.map((e) => ({
          field: e.path.join("."),
          message: e.message,
        })),
        traceId,
      },
    });
    return;
  }

  // Prisma known request errors (unique constraint, not found, etc.)
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    handlePrismaError(err, res, traceId);
    return;
  }

  // Custom application errors
  if (err instanceof AppError) {
    res.status(err.httpStatus).json({
      data: null,
      meta: null,
      error: {
        code: err.code,
        message: err.message,
        details: err.details ?? undefined,
        traceId,
      },
    });
    return;
  }

  // Multer errors (file upload)
  if (err.name === "MulterError") {
    handleMulterError(err, res, traceId);
    return;
  }

  // Unhandled errors → 500
  logger.error({ traceId, err: err.message, stack: err.stack });
  res.status(500).json({
    data: null,
    meta: null,
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
      traceId,
    },
  });
}
```

### Domain-Specific Error Classes

```typescript
// src/types/errors.ts
export class AppError extends Error {
  constructor(
    public code: string,
    public message: string,
    public httpStatus: number = 500,
    public details?: { field: string; message: string }[]
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ValidationError extends AppError {
  constructor(details: { field: string; message: string }[]) {
    super("VALIDATION_ERROR", "Request validation failed", 422, details);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super("NOT_FOUND", `${resource} with id '${id}' not found`, 404);
  }
}

export class DuplicateError extends AppError {
  constructor(resource: string, identifier: string) {
    super("DUPLICATE_RESOURCE", `${resource} '${identifier}' already exists`, 409);
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, details?: string) {
    super(
      "EXTERNAL_SERVICE_ERROR",
      `${service} returned an error${details ? `: ${details}` : ""}`,
      502
    );
  }
}

export class AuthError extends AppError {
  constructor(message: string, code = "UNAUTHORIZED") {
    super(code, message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Access denied") {
    super("FORBIDDEN", message, 403);
  }
}
```

### Validation Error Aggregation

Always use Zod schemas at route boundaries. Collect ALL validation errors before responding — never fail on the first error:

```typescript
// Preferred pattern
const schema = z.object({
  invoiceNumber: z.string().min(1, "Invoice number is required"),
  totalAmount: z.number().positive("Amount must be positive"),
  taxAmount: z.number().optional(),
});

// In route handler:
const result = schema.safeParse(req.body);
if (!result.success) {
  throw new ValidationError(
    result.error.errors.map((e) => ({
      field: e.path.join("."),
      message: e.message,
    }))
  );
}
```

### Async Error Handling

Express 4 does not catch promise rejections in async route handlers. Use one of:

**Option A** – `express-async-errors` (minimal, recommended for v1):
```typescript
// Add at top of index.ts
import "express-async-errors";
```
This patches Express to forward unhandled promise rejections to the error middleware.

**Option B** – Explicit wrapper:
```typescript
const asyncHandler = (fn: Function) =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res, next)).catch(next);
```

Both patterns are acceptable. Option A reduces boilerplate.

---

## 5. Error Classification Table

| Category | Code | HTTP | Severity | Example |
|----------|------|------|----------|---------|
| Validation | `VALIDATION_ERROR` | 422 | Low | Missing invoice number, invalid date format |
| Validation | `INVALID_FILE_TYPE` | 422 | Low | Uploaded `.exe` instead of PDF |
| Validation | `EMPTY_FILE` | 422 | Low | Zero-byte file uploaded |
| Validation | `FILE_TOO_LARGE` | 413 | Low | File exceeds 10MB limit |
| Validation | `PROTECTED_DOCUMENT` | 422 | Low | Password-protected PDF |
| Validation | `INVALID_GSTIN` | 422 | Low | GSTIN fails format validation |
| Validation | `UNSUPPORTED_CURRENCY` | 422 | Low | Non-INR invoice uploaded |
| Auth | `UNAUTHORIZED` | 401 | High | No `Authorization` header |
| Auth | `TOKEN_EXPIRED` | 401 | High | JWT expired |
| Auth | `TOKEN_INVALID` | 401 | High | JWT signature invalid |
| Auth | `FORBIDDEN` | 403 | Critical | Cross-tenant resource access |
| Business | `DUPLICATE_INVOICE` | 409 | Medium | Same invoice number from same vendor |
| Business | `DUPLICATE_DOCUMENT` | 409 | Medium | Same file checksum already ingested |
| Business | `DUPLICATE_EWB` | 409 | Medium | E-Way Bill number already on file |
| Business | `DELIVERY_NOTE_MISSING` | 200* | Medium | Invoice ingested, no delivery note yet |
| Business | `MATCH_FAILED` | 409 | Medium | 3-way mismatch detected |
| Business | `PRICE_INFLATION` | 409 | Critical | Unit price exceeds contract baseline |
| Business | `TAX_CODE_MISMATCH` | 409 | Critical | GST rate on invoice ≠ expected rate |
| Business | `EWB_EXPIRED` | 200* | Critical | E-Way Bill expired before delivery |
| Business | `EWB_MISSING` | 200* | High | Goods delivered without E-Way Bill |
| Business | `WEIGHT_DISCREPANCY` | 409 | High | Weighbridge vs. delivery note mismatch |
| Business | `GSTIN_NOT_FOUND` | 409 | High | GSTIN not in government database |
| Business | `NOT_FOUND` | 404 | Low | Resource by ID does not exist |
| Business | `APPROVAL_ESCALATED` | 200* | Medium | Approval auto-escalated after 48h |
| System | `INTERNAL_ERROR` | 500 | Critical | Unhandled exception, DB connection pool exhausted |
| System | `DB_CONNECTION_ERROR` | 500 | Critical | Cannot connect to PostgreSQL |
| System | `DB_MIGRATION_PENDING` | 503 | Critical | Schema out of date |
| System | `OCR_FAILED` | 500 | High | OCR model threw exception |
| System | `IMAGE_PROCESSING_ERROR` | 422 | Low | Image downscale or rotate failed |
| External | `GST_API_TIMEOUT` | 502 | Medium | GST portal timeout after retries |
| External | `GST_API_ERROR` | 502 | Medium | GST portal returned error response |
| External | `GST_RATE_LIMITED` | 502 | Medium | GST portal rate-limited the request |
| External | `EMAIL_SEND_FAILED` | 500 | Low | SMTP server unreachable |
| Rate Limit | `RATE_LIMIT_EXCEEDED` | 429 | Low | Too many requests from IP |

> **Note:** Codes marked with `200*` are informational states returned as part of a successful match response — they are not HTTP errors but business-logic flags in the response body.

---

## 6. Recovery & Retry Policies

### Idempotency Keys for Invoice Upload

```http
POST /api/v1/invoices
Idempotency-Key: lp-550e8400-e29b-41d4-a716-446655440000
```

- Client generates an idempotency key (UUID v4) and sends it in the header.
- Server caches the key with the response for 24 hours.
- If the same key is received again (network retry), return the cached response — do NOT re-process.
- Return `409 Conflict` with code `IDEMPOTENCY_REPLAY` if key is reused for a different request body.
- Idempotency keys are tenant-scoped.

### Retry Policies

| Operation | Max Retries | Backoff | Notes |
|-----------|-------------|---------|-------|
| GST API (E-Way Bill fetch) | 3 | 1s → 4s → 15s (exponential + jitter ±20%) | Only for transient errors (timeout, 503, 429). Permanent errors (400, 404) are NOT retried. |
| OCR processing | 2 | 5s → 20s | If OCR model OOM or times out. Low-quality images are NOT retried — they go to human review. |
| Email ingestion (IMAP fetch) | 2 | 10s → 30s | Network-level failures only. |
| Email notification send | 3 | 1s → 5s → 15s | SMTP temporary failures. Invalid addresses are NOT retried. |
| Database connection | 5 | 0.5s → 1s → 2s → 4s → 8s | Prisma connection retries. Circuit-breaker after 5 consecutive failures — shut down health endpoint. |

### Dead Letter Queue (DLQ)

```
All retry-exhausted operations go to a DLQ table or Redis list:
- OCR jobs that failed 3 times
- GST API requests that failed 3 times
- Email sends that failed 3 times

DLQ entries are visible in the admin dashboard.
Manual replay or discard is required.
DLQ retention: 30 days, then auto-purge with log archival.
```

### Circuit Breaker for External API Calls

```typescript
interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number | null;
  state: "CLOSED" | "OPEN" | "HALF_OPEN";
}

// Thresholds:
// OPEN after 5 consecutive failures within 60s window
// HALF_OPEN after 30s cooldown
// CLOSED after 2 successful probe requests
```

Apply to:
- GST API (primary external dependency)
- OCR model service (if running as separate process)
- SMTP relay

When a circuit is OPEN, return `503 Service Unavailable` immediately with message: "Service temporarily unavailable. Please try again later."

---

## 7. Audit Logging Requirements

### What to Log

Every state change on financial data and all security-sensitive operations:

| Event | Log Level | Fields |
|-------|-----------|--------|
| Document uploaded | INFO | `event`, `documentId`, `vendorId`, `fileType`, `fileSize`, `tenantId`, `userId` |
| Document status change | INFO | `event`, `documentId`, `fromStatus`, `toStatus`, `userId` |
| Match result created | INFO | `event`, `matchId`, `invoiceId`, `deliveryNoteId`, `ewayBillId`, `matchScore`, `status` |
| Match discrepancy detected | WARN | `event`, `matchId`, `discrepancyType`, `severity`, `details` |
| Approval granted/rejected | INFO | `event`, `approvalId`, `userId`, `decision`, `comment` |
| Approval auto-escalated | WARN | `event`, `approvalId`, `reason`, `previousApprover`, `newApprover` |
| Login success | INFO | `event`, `userId`, `ip`, `userAgent` |
| Login failure | WARN | `event`, `userId` (if known), `ip`, `reason` |
| Cross-tenant access attempt | ERROR | `event`, `userId`, `tenantId`, `targetTenantId`, `resource`, `ip` |
| GST API call | INFO | `event`, `requestUrl`, `httpStatus`, `latencyMs`, `retryCount` |
| GST API failure | ERROR | `event`, `requestUrl`, `responseBody`, `errorCode`, `retryCount` |
| OCR result | INFO | `event`, `documentId`, `confidence`, `pages`, `wordCount` |
| OCR low confidence | WARN | `event`, `documentId`, `confidence`, `suggestion` |
| DLQ entry created | ERROR | `event`, `queueName`, `payload`, `reason`, `retryCount` |
| Circuit breaker state change | ERROR | `event`, `circuitName`, `fromState`, `toState`, `failureCount` |

### Log Format (Structured JSON)

All logs must be written as newline-delimited JSON (NDJSON) to stdout. Log aggregator (e.g., Loki, CloudWatch) parses and indexes.

```json
{
  "timestamp": "2026-07-16T14:30:00.123Z",
  "level": "INFO",
  "event": "document.uploaded",
  "traceId": "lp-abc123def456",
  "tenantId": "tnt_01j5...",
  "userId": "usr_01j5...",
  "requestId": "req_...",
  "data": {
    "documentId": "inv_01j5...",
    "vendorId": "ven_01j5...",
    "fileType": "application/pdf",
    "fileSize": 245678
  },
  "duration": 342
}
```

### Retention Period

| Log Type | Retention | Storage |
|----------|-----------|---------|
| Application logs (INFO) | 90 days | CloudWatch / Loki |
| Application logs (ERROR) | 1 year | CloudWatch / Loki + cold storage (S3) |
| Audit events (state changes) | 3 years | Dedicated `AuditLog` table in PostgreSQL |
| Security events (auth, cross-tenant) | 3 years | Dedicated `AuditLog` table (retention locked) |
| DLQ payloads | 30 days | Redis/PostgreSQL, then purged |

### Sensitive Data Masking

The following fields must NEVER appear raw in logs:

| Field | Masking Strategy |
|-------|------------------|
| JWT tokens | Replace with `[REDACTED TOKEN]` |
| Passwords | Never logged; if accidentally present, replace entire field with `[REDACTED]` |
| GSTIN / PAN | Last 4 characters only: `XXXXXX1234` |
| Email addresses | Local part masked: `j***@example.com` |
| Phone numbers | Last 4 digits only: `+91XXXXXXXX56` |
| Bank account / IFSC | Never logged in application code |
| Raw file contents | Never logged; only metadata |
| API keys / secrets | `[REDACTED API KEY]` |

Implementation: Use a structured logger with a serialization filter:

```typescript
const sensitiveFields = new Set(["password", "token", "authorization", "apiKey"]);
const maskValue = (key: string, value: unknown): unknown => {
  if (sensitiveFields.has(key.toLowerCase())) return "[REDACTED]";
  if (typeof value === "string" && /^[A-Z]{5}[0-9]{4}[A-Z]/.test(value)) {
    return value.slice(-4).padStart(value.length, "*");
  }
  return value;
};
```

---

## 8. Monitoring & Alerting

### Key Metrics to Track

| Metric | Source | Why |
|--------|--------|-----|
| **Error rate by HTTP status** (4xx, 5xx) | Express middleware counter | Trend: sustained 5xx > 1% indicates systemic issue |
| **Error rate by error code** | Application-level metric | Track specific failures (e.g., `GST_API_ERROR` spiking) |
| **Request latency P50 / P95 / P99** | Express middleware timer | Matching engine endpoints should be < 2s P95 |
| **OCR success rate** | Document ingestion pipeline | Success = document passed OCR with confidence > 0.7 |
| **OCR average confidence** | Per-document metric | Drop below 0.75 → quality issue with scanner/model |
| **3-way match rate** | MatchResult created per period | % of MATCHED vs PARTIAL vs MISMATCH |
| **Match throughput** | Matches per hour | Detect backlog if dropping while ingestion is steady |
| **GST API latency** | External call timer | Latency spike → upstream issue |
| **GST API error rate** | External call counter | > 10% → investigate or open support ticket |
| **Duplicate detection rate** | Unique constraint catch counts | Spike may indicate invoice re-submission campaign |
| **Approval SLA breach rate** | Escalations per month | > 5% → review staffing |
| **DLQ depth** | Count of items in dead letter queue | Non-zero → operator attention needed |
| **Active users / sessions** | Auth middleware | Security baseline — unexpected spikes may indicate attack |
| **Rate limit hits** | Rate limiter counter | Legitimate clients hitting limit → review throttling |

### Alert Thresholds

| Alert | Condition | Severity | Action |
|-------|-----------|----------|--------|
| **High error rate** | 5xx rate > 1% over 5 minutes | Pager (P1) | Engineer investigates immediately |
| **GST API degraded** | GST API error rate > 10% over 15 minutes | Pager (P2) | Check GST portal status; consider circuit breaker |
| **OCR pipeline stalled** | No OCR output for 30 minutes during business hours | Pager (P2) | Check OCR worker; may need restart |
| **Match rate drop** | Match rate < 60% of ingestion rate over 1 hour | Alert (P3) | Investigate matching engine for regression |
| **DLQ not draining** | DLQ depth > 100 for > 1 hour | Alert (P3) | Manual review of queued items |
| **DB connection pool** | Pool utilization > 80% | Alert (P3) | Scale up or optimize queries |
| **Circuit breaker open** | Any circuit breaker flips to OPEN | Pager (P2) | External dependency down; assess impact |
| **Duplicate spike** | Duplicate detection rate > 5x daily average | Alert (P3) | Possible invoice re-submission campaign or bug |
| **Approval SLA breach** | Any escalation triggered | Alert (P3) | Check approver availability |
| **Rate limit threshold** | Any tenant hitting rate limit > 10 times per hour | Alert (P3) | May be misconfigured integration; reach out to tenant |

### Dashboard Recommendations

**Operations Dashboard** (primary — ops team, daily view):
- Error rate (5xx) — time series, last 24h
- Request latency (P50 / P95) — time series, by endpoint group
- Documents ingested per hour — stacked by source (email, upload)
- Match throughput + match rate — time series
- OCR average confidence — scatter plot per document
- OCR success rate — gauge (target > 90%)
- Active documents in DISCREPANCY status — current count

**External Integrations Dashboard** (GST API health):
- GST API latency — time series, last 24h
- GST API error rate — time series, last 24h
- GST API rate limit remaining — gauge
- Circuit breaker state — indicator per service
- DLQ depth — current count per queue

**Security Dashboard** (admin/auditor view):
- Failed login attempts — time series, by IP
- Cross-tenant access attempts — event list
- Token expiration rate — time series
- Rate limit hits by tenant — table sorted by count
- Active sessions — current count

**Business Dashboard** (CXO / manager view):
- Monthly matched vs unmatched invoices — stacked bar
- Estimated leakage prevented (₹) — cumulative against contract baselines
- Average time from ingestion to match — trend
- Discrepancy resolution time (P50 / P95) — trend
- Vendor dispute rate — by vendor, sorted

---

## Appendix: Error Code Index

| Code | Category | HTTP |
|------|----------|------|
| `APPROVAL_ESCALATED` | Business | 200 |
| `DB_CONNECTION_ERROR` | System | 500 |
| `DB_MIGRATION_PENDING` | System | 503 |
| `DELIVERY_NOTE_MISSING` | Business | 200 |
| `DUPLICATE_DOCUMENT` | Business | 409 |
| `DUPLICATE_INVOICE` | Business | 409 |
| `DUPLICATE_EWB` | Business | 409 |
| `DUPLICATE_RESOURCE` | Business | 409 |
| `EMAIL_SEND_FAILED` | External | 500 |
| `EMPTY_FILE` | Validation | 422 |
| `EWB_EXPIRED` | Business | 200 |
| `EWB_MISSING` | Business | 200 |
| `EXTERNAL_SERVICE_ERROR` | External | 502 |
| `FILE_TOO_LARGE` | Validation | 413 |
| `FORBIDDEN` | Auth | 403 |
| `GSTIN_NOT_FOUND` | Business | 409 |
| `GST_API_ERROR` | External | 502 |
| `GST_API_TIMEOUT` | External | 502 |
| `GST_RATE_LIMITED` | External | 502 |
| `IDEMPOTENCY_REPLAY` | Business | 409 |
| `IMAGE_PROCESSING_ERROR` | Validation | 422 |
| `INTERNAL_ERROR` | System | 500 |
| `INVALID_DOCUMENT` | Validation | 422 |
| `INVALID_FILE_TYPE` | Validation | 422 |
| `INVALID_GSTIN` | Validation | 422 |
| `MATCH_FAILED` | Business | 409 |
| `MISSING_ATTACHMENT` | Validation | 422 |
| `NOT_FOUND` | Business | 404 |
| `OCR_FAILED` | System | 500 |
| `PRICE_INFLATION` | Business | 409 |
| `PROTECTED_DOCUMENT` | Validation | 422 |
| `RATE_LIMIT_EXCEEDED` | Rate Limit | 429 |
| `TAX_CODE_MISMATCH` | Business | 409 |
| `TOKEN_EXPIRED` | Auth | 401 |
| `TOKEN_INVALID` | Auth | 401 |
| `UNAUTHORIZED` | Auth | 401 |
| `UNSUPPORTED_CURRENCY` | Validation | 422 |
| `VALIDATION_ERROR` | Validation | 422 |
| `WEIGHT_DISCREPANCY` | Business | 409 |
