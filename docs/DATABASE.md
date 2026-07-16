# LedgerPulse — Database Architecture & Schema Guide

> **Project:** Automated Supply Chain Reconciliation & Tax Engine
> **Version:** 0.1.0
> **Stack:** Prisma ORM + SQLite (Dev) / PostgreSQL (Prod)
> **Document Owner:** Database Optimizer Agent 🗄️

---

## Table of Contents

1. [Database Philosophy & Decisions](#1-database-philosophy--decisions)
2. [Entity Relationship Diagram](#2-entity-relationship-diagram)
3. [Detailed Schema Documentation](#3-detailed-schema-documentation)
4. [Indexing Strategy](#4-indexing-strategy)
5. [Query Patterns & Optimization](#5-query-patterns--optimization)
6. [Migration Strategy](#6-migration-strategy)
7. [Data Lifecycle](#7-data-lifecycle)
8. [Performance Considerations](#8-performance-considerations)

---

## 1. Database Philosophy & Decisions

### 1.1 Why Prisma ORM

Prisma provides three critical capabilities that align with LedgerPulse's requirements:

| Capability | How Prisma Delivers It | Why It Matters |
|---|---|---|
| **Type-safe queries** | Auto-generated TypeScript types from the Prisma schema | Prevents runtime errors from misspelled field names or wrong types; catches mismatches at compile time. With 5 models and 8+ filtered list endpoints, type safety prevents an entire class of bugs. |
| **Declarative migrations** | `prisma migrate dev` generates SQL from schema changes | Team (even a solo dev) can reason about schema changes as Prisma schema diffs rather than raw SQL. Migrations are reproducible, version-controlled, and reversible via `prisma migrate diff`. |
| **Multi-provider abstraction** | Single schema → SQLite or PostgreSQL with `provider` swap | Enables SQLite for zero-config local dev and fast CI, PostgreSQL for production — without maintaining two schema files. Prisma handles 95%+ of dialect differences automatically (enums, datetime, floats). |

### 1.2 SQLite for Dev, PostgreSQL for Prod — Migration Strategy

**The workflow:**

```
Local dev:     SQLite via `prisma db push` (schema drift allowed)
CI pipeline:   SQLite in-memory via `prisma db push` (fast, no service dependency)
Staging:       PostgreSQL via `prisma migrate deploy` (migration-controlled)
Production:    PostgreSQL via `prisma migrate deploy` (same migration files)
```

**Provider switching at deploy time:**

```bash
# schema.prisma datasource:
#   provider = env("DATABASE_PROVIDER")  → "sqlite" locally, "postgresql" in prod
#   url      = env("DATABASE_URL")

# Dev
DATABASE_PROVIDER=sqlite DATABASE_URL="file:./dev.db" npx prisma migrate dev

# Prod deploy script (switch-db.sh):
sed -i 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma
DATABASE_PROVIDER=postgresql DATABASE_URL="$PG_URL" npx prisma migrate deploy
```

**Known dialect differences managed by Prisma:**

| Dimension | SQLite | PostgreSQL | Prisma Handling |
|---|---|---|---|
| Enums | Text strings | Native `CREATE TYPE` | Transparent — generated as enums in PG, text check in SQLite |
| DateTime | No timezone | `TIMESTAMPTZ` | Prisma returns `Date` objects; store UTC everywhere |
| Float precision | REAL (4-byte) | `DOUBLE PRECISION` | Prisma `Float` maps to REAL in SQLite, DOUBLE in PG |
| Unique constraint on nullable | `NULL ≠ NULL` (applies) | `NULL ≠ NULL` (applies) | Same — multiple NULLs allowed by both |
| Generated columns | Not supported | `GENERATED ALWAYS` | Avoid in schema; compute in application layer |
| Full-text search | FTS5 extension | `tsvector`/GIN | Abstract behind service layer (see §4.4) |

### 1.3 Connection Pooling Approach

**Architecture decision tree:**

```
Tier 1 (Phase 0–2 — SQLite):
  No pooling needed. SQLite is single-writer; Prisma opens one connection.
  WARNING: SQLite does NOT support concurrent writes.
  Serialise all write operations via Bull queue.

Tier 2 (Phase 3–4 — PostgreSQL, single instance):
  Prisma's built-in connection pool (default: connections = 10).
  PgBouncer in transaction mode between Prisma and PostgreSQL.
  Pool sizing:  connections = (max_expected_concurrent_requests × 0.3) + 2

Tier 3 (Phase 5+ — PostgreSQL, multiple API replicas):
  PgBouncer in transaction pooling mode.
  Read replicas for dashboard & reporting queries.
  Write master for ingestion & matching writes.
```

**Prisma pool configuration:**

```typescript
// packages/backend/src/lib/db.ts
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  // Connection pool settings (PostgreSQL only — ignored for SQLite)
  ...(process.env.DATABASE_PROVIDER === 'postgresql' && {
    connectionLimit: parseInt(process.env.DB_POOL_SIZE || '10'),
    poolTimeout: 30, // seconds to wait for a connection from pool
  }),
});
```

**PgBouncer config (production `pgbouncer.ini`):**

```ini
[databases]
ledgerpulse = host=localhost port=5432 dbname=ledgerpulse

[pgbouncer]
listen_addr = 0.0.0.0
listen_port = 6432
pool_mode = transaction
default_pool_size = 25
max_client_conn = 100
```

---

## 2. Entity Relationship Diagram

### 2.1 Core Domain Model

```
  ┌──────────┐
  │  Vendor  │
  └────┬─────┘
       │
       │ 1
       │
       ├───────────────────┐
       │                   │
       ▼ N                 ▼ N
  ┌──────────┐      ┌──────────────┐
  │ Invoice  │      │ DeliveryNote │
  └────┬─────┘      └──────┬───────┘
       │                    │
       │ 1                0│1
       │                    │
       ├──────────┐        │
       │          │        │
       ▼ N        ▼ N     ▼ N
  ┌──────────┐ ┌──────────────┐
  │ EWayBill │ │ MatchResult  │
  └──────────┘ └──────────────┘
```

### 2.2 Full Attribute Diagram

```
Vendor
├── id: UUID (PK)
├── name: String
├── gstin: String? (UK)
├── contractRef: String?
├── email: String?
├── phone: String?
├── address: String?
├── createdAt: DateTime
├── updatedAt: DateTime
│
├── 1:N — Invoice
└── 1:N — DeliveryNote

Invoice
├── id: UUID (PK)
├── vendorId: UUID (FK → Vendor)
├── invoiceNumber: String
├── invoiceDate: DateTime
├── totalAmount: Float
├── taxAmount: Float?
├── lineItems: String? (JSON)
├── filePath: String?
├── rawText: String? (OCR)
├── status: DocumentStatus
├── ingestedAt: DateTime
├── processedAt: DateTime?
├── createdAt: DateTime
├── updatedAt: DateTime
│
├── UK: (vendorId, invoiceNumber)
├── INDEX: [status]
│
├── N:1 — Vendor
├── 1:N — DeliveryNote
├── 1:N — EWayBill
└── 1:N — MatchResult

DeliveryNote
├── id: UUID (PK)
├── vendorId: UUID (FK → Vendor)
├── deliveryNoteNumber: String
├── deliveryDate: DateTime
├── invoiceId: UUID? (FK → Invoice)
├── totalQuantity: Float
├── lineItems: String? (JSON)
├── filePath: String?
├── rawText: String? (OCR)
├── weightbridgeValue: Float?
├── status: DocumentStatus
├── ingestedAt: DateTime
├── processedAt: DateTime?
├── createdAt: DateTime
├── updatedAt: DateTime
│
├── UK: (vendorId, deliveryNoteNumber)
├── INDEX: [status]
│
├── N:1 — Vendor
└── N:1 — Invoice (optional)

EWayBill
├── id: UUID (PK)
├── ewayBillNumber: String (UK)
├── invoiceId: UUID? (FK → Invoice)
├── generatedDate: DateTime
├── validUntil: DateTime
├── fromGstin: String
├── toGstin: String
├── totalValue: Float
├── transportMode: String?
├── vehicleNumber: String?
├── status: DocumentStatus
├── rawData: String? (JSON)
├── ingestedAt: DateTime
├── createdAt: DateTime
├── updatedAt: DateTime
│
├── INDEX: [ewayBillNumber]
├── INDEX: [status]
│
└── N:1 — Invoice (optional)

MatchResult
├── id: UUID (PK)
├── invoiceId: UUID (FK → Invoice)
├── deliveryNoteId: UUID? (FK → DeliveryNote)
├── ewayBillId: UUID? (FK → EWayBill)
├── matchScore: Float
├── status: String
├── discrepancies: String? (JSON)
├── reviewedBy: String?
├── reviewedAt: DateTime?
├── createdAt: DateTime
├── updatedAt: DateTime
│
├── INDEX: [status]
│
└── N:1 — Invoice
```

### 2.3 Relationship Summary

| Relationship | Type | Foreign Key | Cardinality |
|---|---|---|---|
| Vendor → Invoice | One-to-Many | `Invoice.vendorId` | 1 vendor : N invoices |
| Vendor → DeliveryNote | One-to-Many | `DeliveryNote.vendorId` | 1 vendor : N delivery notes |
| Invoice → DeliveryNote | One-to-Many (optional) | `DeliveryNote.invoiceId` | 1 invoice : 0..N delivery notes |
| Invoice → EWayBill | One-to-Many (optional) | `EWayBill.invoiceId` | 1 invoice : 0..N e-way bills |
| Invoice → MatchResult | One-to-Many | `MatchResult.invoiceId` | 1 invoice : 0..N match results |
| MatchResult → DeliveryNote | Many-to-One (optional) | `MatchResult.deliveryNoteId` | 0..1 delivery note : N match results |
| MatchResult → EWayBill | Many-to-One (optional) | `MatchResult.ewayBillId` | 0..1 e-way bill : N match results |

---

## 3. Detailed Schema Documentation

### 3.1 `Vendor`

**Purpose:** Suppliers who send invoices and delivery notes. The central entity for tenant data partitioning.

| Column | Type | Constraints | Default | Description |
|---|---|---|---|---|
| `id` | `String` (UUID) | `@id @default(uuid())` | Auto-generated | Primary key — UUIDv4 to avoid sequential ID leaks |
| `name` | `String` | Required | — | Legal business name of the vendor |
| `gstin` | `String?` | `@unique` | `null` | GST Identification Number (15 chars, PAN-based). Unique across all vendors for dedup |
| `contractRef` | `String?` | None | `null` | Internal contract/PO reference number for baseline price lookups |
| `email` | `String?` | None | `null` | Primary contact email for dispute communications |
| `phone` | `String?` | None | `null` | Contact phone number |
| `address` | `String?` | None | `null` | Registered address |
| `createdAt` | `DateTime` | `@default(now())` | Current timestamp | Row creation timestamp |
| `updatedAt` | `DateTime` | `@updatedAt` | Auto-updated | Row last-updated timestamp |

**Relationships:**
- `invoices` → `Invoice[]`: All invoices from this vendor
- `deliveryNotes` → `DeliveryNote[]`: All delivery notes from this vendor

**Indexes:**
- `PRIMARY KEY` (`id`) — implicit from `@id`
- `UNIQUE` (`gstin`) — unique constraint for vendor dedup via tax ID

---

### 3.2 `DocumentStatus` (Enum)

Reused across `Invoice`, `DeliveryNote`, and `EWayBill` to maintain a consistent state machine.

| Value | Meaning |
|---|---|
| `PENDING` | Document ingested but not yet processed (queued for OCR) |
| `PROCESSED` | OCR/extraction complete, structured data available |
| `MATCHED` | Document successfully matched (2-way or 3-way) — no discrepancies |
| `DISCREPANCY` | Match found but with discrepancies (PARTIAL or MISMATCH) |
| `RESOLVED` | Discrepancies reviewed and resolved by user |

**State transitions:**

```
PENDING ──→ PROCESSED ──→ MATCHED ──→ RESOLVED
                │              │
                └──→ DISCREPANCY ──→ RESOLVED
```

---

### 3.3 `Invoice`

**Purpose:** The central document — an invoice received from a vendor. All matching revolves around the invoice as the "ground truth" record.

| Column | Type | Constraints | Default | Description |
|---|---|---|---|---|
| `id` | `String` (UUID) | `@id @default(uuid())` | Auto | Primary key |
| `vendorId` | `String` (UUID) | `@relation(fields: [vendorId])` | — | Foreign key to `Vendor` |
| `invoiceNumber` | `String` | `@@unique([vendorId, invoiceNumber])` | — | Vendor's invoice reference number |
| `invoiceDate` | `DateTime` | Required | — | Date on the invoice |
| `totalAmount` | `Float` | Required | — | Invoice total in INR (or relevant currency) |
| `taxAmount` | `Float?` | None | `null` | Total tax (CGST+SGST/IGST) amount |
| `lineItems` | `String?` | None (JSON) | `null` | Parsed line items as JSON array. Each item: `{code, description, quantity, unitPrice, amount}` |
| `filePath` | `String?` | None | `null` | Path to original uploaded file on disk or S3 |
| `rawText` | `String?` | None | `null` | Full raw OCR-extracted text. Preserved for re-extraction without re-running OCR |
| `status` | `DocumentStatus` | `@default(PENDING)` | `PENDING` | Current processing state |
| `ingestedAt` | `DateTime` | `@default(now())` | Now | When the document was received (via email/upload) |
| `processedAt` | `DateTime?` | None | `null` | When OCR/extraction completed |
| `createdAt` | `DateTime` | `@default(now())` | Now | Row creation |
| `updatedAt` | `DateTime` | `@updatedAt` | Auto | Row last update |

**Indexes:**
- `PRIMARY KEY` (`id`)
- `UNIQUE` (`vendorId`, `invoiceNumber`) — prevents duplicate ingestion
- `INDEX` (`status`) — dashboard filtering by status

**Relationships:**
- `vendor` → `Vendor` (N:1)
- `deliveryNotes` → `DeliveryNote[]` (1:N) — delivery notes linked to this invoice
- `ewayBills` → `EWayBill[]` (1:N) — e-way bills linked to this invoice
- `matchResults` → `MatchResult[]` (1:N) — match attempts for this invoice

**Design notes:**
- `lineItems` is JSON instead of a normalised `InvoiceLineItem` table because line item schemas vary significantly between vendors. Zod validation at the application layer enforces structure. If line-item-level querying becomes a bottleneck in Phase 3+, extract into a separate table.
- `rawText` stores the full OCR output so that if extraction heuristics improve (e.g., a better regex pattern), re-processing does not require re-running OCR — only re-parsing `rawText`.

---

### 3.4 `DeliveryNote`

**Purpose:** A delivery / goods receipt note — often a weighbridge slip or physical delivery challan. Represents the "goods received" side of reconciliation.

| Column | Type | Constraints | Default | Description |
|---|---|---|---|---|
| `id` | `String` (UUID) | `@id @default(uuid())` | Auto | Primary key |
| `vendorId` | `String` (UUID) | `@relation(fields: [vendorId])` | — | Foreign key to `Vendor` |
| `deliveryNoteNumber` | `String` | `@@unique([vendorId, deliveryNoteNumber])` | — | Vendor's delivery note reference |
| `deliveryDate` | `DateTime` | Required | — | Date of physical delivery / goods receipt |
| `invoiceId` | `String?` (UUID) | `@relation(fields: [invoiceId])` | `null` | Optional foreign key to `Invoice` — set during matching |
| `totalQuantity` | `Float` | Required | — | Total delivered quantity (sum of line items) |
| `lineItems` | `String?` | None (JSON) | `null` | Parsed line items as JSON array: `{code, description, quantity, unit}` |
| `filePath` | `String?` | None | `null` | Path to uploaded photo/scan of physical note |
| `rawText` | `String?` | None | `null` | OCR-extracted text |
| `weightbridgeValue` | `Float?` | None | `null` | Weighbridge gross weight (kg) — key field for weight-based discrepancy detection |
| `status` | `DocumentStatus` | `@default(PENDING)` | `PENDING` | Processing state |
| `ingestedAt` | `DateTime` | `@default(now())` | Now | Ingestion timestamp |
| `processedAt` | `DateTime?` | None | `null` | OCR completion timestamp |
| `createdAt` | `DateTime` | `@default(now())` | Now | Row creation |
| `updatedAt` | `DateTime` | `@updatedAt` | Auto | Row last update |

**Indexes:**
- `PRIMARY KEY` (`id`)
- `UNIQUE` (`vendorId`, `deliveryNoteNumber`) — prevents duplicate delivery note ingestion
- `INDEX` (`status`) — dashboard filtering

**Relationships:**
- `vendor` → `Vendor` (N:1)
- `invoice` → `Invoice` (N:1, optional) — once linked during matching

---

### 3.5 `EWayBill`

**Purpose:** Government E-Way Bill tax log — fetched from the NIC (National Informatics Centre) E-Way Bill API. Represents the "tax compliance" side of reconciliation.

| Column | Type | Constraints | Default | Description |
|---|---|---|---|---|
| `id` | `String` (UUID) | `@id @default(uuid())` | Auto | Primary key |
| `ewayBillNumber` | `String` | `@unique` | — | Government-issued E-Way Bill number (unique across all records) |
| `invoiceId` | `String?` (UUID) | `@relation(fields: [invoiceId])` | `null` | Optional foreign key to linked invoice |
| `generatedDate` | `DateTime` | Required | — | Date E-Way Bill was generated on the portal |
| `validUntil` | `DateTime` | Required | — | E-Way Bill expiry date (typically 30 days from generatedDate) |
| `fromGstin` | `String` | Required | — | Consignor GSTIN (should match Vendor.gstin) |
| `toGstin` | `String` | Required | — | Consignee GSTIN (the buyer) |
| `totalValue` | `Float` | Required | — | Declared invoice value on the E-Way Bill |
| `transportMode` | `String?` | None | `null` | Mode of transport (Road, Rail, Air, Ship) |
| `vehicleNumber` | `String?` | None | `null` | Vehicle registration number for road transport |
| `status` | `DocumentStatus` | `@default(PENDING)` | `PENDING` | Processing state |
| `rawData` | `String?` | None (JSON) | `null` | Full raw JSON response from the E-Way Bill API. Preserved for audit trail and re-processing |
| `ingestedAt` | `DateTime` | `@default(now())` | Now | When the EWB record was created in the system |
| `createdAt` | `DateTime` | `@default(now())` | Now | Row creation |
| `updatedAt` | `DateTime` | `@updatedAt` | Auto | Row last update |

**Indexes:**
- `PRIMARY KEY` (`id`)
- `UNIQUE` (`ewayBillNumber`) — dedup on government-issued ID
- `INDEX` (`ewayBillNumber`) — extra index for EWB-number-based lookups (though `@unique` already provides one)
- `INDEX` (`status`) — filtering

**Relationships:**
- `invoice` → `Invoice` (N:1, optional)

**Design notes:**
- `rawData` stores the complete API response JSON for audit purposes. The NIC E-Way Bill API returns rich data (item-level HSN codes, transporter details, distance). Storing the full response means re-processing does not require re-fetching from the (rate-limited) API.
- `ewayBillNumber` is globally unique — government-issued — so it has a standalone `@unique` constraint rather than a composite with `vendorId`.

---

### 3.6 `MatchResult`

**Purpose:** Stores the outcome of each matching attempt — score, status, and itemised discrepancies. This is the audit trail for every reconciliation decision.

| Column | Type | Constraints | Default | Description |
|---|---|---|---|---|
| `id` | `String` (UUID) | `@id @default(uuid())` | Auto | Primary key |
| `invoiceId` | `String` (UUID) | `@relation(fields: [invoiceId])` | — | Foreign key to the invoice being matched |
| `deliveryNoteId` | `String?` (UUID) | None | `null` | Foreign key to the delivery note in this match (null for preliminary match) |
| `ewayBillId` | `String?` (UUID) | None | `null` | Foreign key to the e-way bill in this match (null for 2-way match only) |
| `matchScore` | `Float` | Required | — | Composite score 0.0–1.0. Calculated as weighted average of all comparison fields |
| `status` | `String` | Required | — | Match outcome: `MATCHED`, `PARTIAL`, `MISMATCH` |
| `discrepancies` | `String?` | None (JSON) | `null` | Array of discrepancy objects: `{field, expected, actual, severity, message}` |
| `reviewedBy` | `String?` | None | `null` | User ID who reviewed this match result |
| `reviewedAt` | `DateTime?` | None | `null` | When the review occurred |
| `createdAt` | `DateTime` | `@default(now())` | Now | Row creation |
| `updatedAt` | `DateTime` | `@updatedAt` | Auto | Row last update |

**Indexes:**
- `PRIMARY KEY` (`id`)
- `INDEX` (`status`) — dashboard filtering by match outcome

**Relationships:**
- `invoice` → `Invoice` (N:1)

**Design notes:**
- `matchScore` is stored as a raw float rather than being derived from `status` because the numeric score enables percentile-based reporting ("top 10% of partial matches by score") and configurable threshold changes without migration.
- `deliveryNoteId` and `ewayBillId` are nullable because matching is incremental: step 1 produces a 2-way match (Invoice ↔ DN), step 2 upgrades it to 3-way (+ EWB). A match result may be created before all three documents exist.
- `discrepancies` is a JSON string of `{field, expected, actual, severity}[]` objects. This structure is intentionally flexible — different vendor rules produce different discrepancy types (quantity short, price mismatch, tax miscalculation, weight variance).
- `status` is a plain `String` rather than an enum because match outcome categories may evolve (e.g., splitting `PARTIAL` into `QTY_PARTIAL` and `PRICE_PARTIAL`).

---

## 4. Indexing Strategy

### 4.1 Current Indexes (Phase 0 Schema)

| Table | Index | Type | Columns | Purpose |
|---|---|---|---|---|
| Vendor | `PRIMARY KEY` | B-tree (PK) | `id` | Row lookup |
| Vendor | `gstin` | Unique B-tree | `gstin` | Vendor dedup by tax ID |
| Invoice | `PRIMARY KEY` | B-tree (PK) | `id` | Row lookup |
| Invoice | `Invoice_vendorId_invoiceNumber_key` | Unique composite B-tree | `(vendorId, invoiceNumber)` | Dedup; primary lookup pattern in matching engine |
| Invoice | `Invoice_status_idx` | B-tree | `status` | Dashboard filter by status |
| DeliveryNote | `PRIMARY KEY` | B-tree (PK) | `id` | Row lookup |
| DeliveryNote | `DeliveryNote_vendorId_deliveryNoteNumber_key` | Unique composite B-tree | `(vendorId, deliveryNoteNumber)` | Dedup; primary lookup |
| DeliveryNote | `DeliveryNote_status_idx` | B-tree | `status` | Dashboard filter |
| EWayBill | `PRIMARY KEY` | B-tree (PK) | `id` | Row lookup |
| EWayBill | `EWayBill_ewayBillNumber_key` | Unique B-tree | `ewayBillNumber` | Dedup on govt ID |
| EWayBill | `EWayBill_ewayBillNumber_idx` | B-tree | `ewayBillNumber` | Lookup by EWB number (unique index also serves this) |
| EWayBill | `EWayBill_status_idx` | B-tree | `status` | Dashboard filter |
| MatchResult | `PRIMARY KEY` | B-tree (PK) | `id` | Row lookup |
| MatchResult | `MatchResult_status_idx` | B-tree | `status` | Filter by match outcome |

### 4.2 Recommended Additional Indexes (Phase 1+)

These indexes address the most common query patterns identified in the API design:

```prisma
// In Invoice model
@@index([invoiceDate])                    // Date-range filtering on dashboard
@@index([vendorId, status])               // "Show all open invoices for vendor X"
@@index([vendorId, invoiceDate])          // "Show invoices for vendor X in date range Y-Z"

// In DeliveryNote model
@@index([deliveryDate])                   // Date-range filtering
@@index([vendorId, status])               // "Show pending DNs for vendor X"
@@index([invoiceId])                      // Lookup DNs linked to an invoice
@@index([vendorId, deliveryDate])         // Date-range by vendor
@@index([status, deliveryDate])           // "Oldest pending DNs first"

// In EWayBill model
@@index([invoiceId])                      // Lookup EWBs linked to an invoice
@@index([fromGstin, generatedDate])       // "Find EWBs for this vendor in date range"
@@index([validUntil])                     // EWB expiry tracking alerts
@@index([status, validUntil])             // "Expiring active EWBs"

// In MatchResult model
@@index([invoiceId, status])              // "Latest match status for this invoice"
@@index([matchScore])                     // Score-range queries, percentile reports
@@index([createdAt])                      // Time-based dashboard queries
@@index([invoiceId, createdAt])           // Match history for a specific invoice
@@index([status, matchScore])             // "Partial matches sorted by closeness"
```

**SQL migration equivalent (PostgreSQL):**

```sql
CREATE INDEX IF NOT EXISTS idx_invoice_date ON "Invoice"("invoiceDate");
CREATE INDEX IF NOT EXISTS idx_invoice_vendor_status ON "Invoice"("vendorId", "status");
CREATE INDEX IF NOT EXISTS idx_dn_vendor_status ON "DeliveryNote"("vendorId", "status");
CREATE INDEX IF NOT EXISTS idx_dn_invoice_id ON "DeliveryNote"("invoiceId");
CREATE INDEX IF NOT EXISTS idx_ewb_invoice_id ON "EWayBill"("invoiceId");
CREATE INDEX IF NOT EXISTS idx_ewb_valid_until ON "EWayBill"("validUntil");
CREATE INDEX IF NOT EXISTS idx_match_invoice_status ON "MatchResult"("invoiceId", "status");
CREATE INDEX IF NOT EXISTS idx_match_created ON "MatchResult"("createdAt");
CREATE INDEX IF NOT EXISTS idx_match_score ON "MatchResult"("matchScore");
```

### 4.3 Composite Index Justifications

| Composite Index | Justification | Expected Query |
|---|---|---|
| `Invoice(vendorId, status)` | Dashboard: "Show all MATCHED/DISCREPANCY invoices for vendor X" — covers the WHERE clause of the most common list view | `WHERE vendorId = ? AND status = ?` |
| `Invoice(vendorId, invoiceDate)` | Matching engine: "Find invoices for vendor X in date range ±7 days" | `WHERE vendorId = ? AND invoiceDate BETWEEN ? AND ?` |
| `DeliveryNote(vendorId, status)` | Same pattern as Invoice — list view filter | `WHERE vendorId = ? AND status = ?` |
| `DeliveryNote(vendorId, deliveryDate)` | Matching engine: "Find DNs for vendor X in date range" | `WHERE vendorId = ? AND deliveryDate BETWEEN ? AND ?` |
| `MatchResult(invoiceId, status)` | Invoice detail page: "Show all match results for this invoice" | `WHERE invoiceId = ? ORDER BY createdAt DESC` |
| `MatchResult(invoiceId, createdAt)` | Match history timeline view | `WHERE invoiceId = ? ORDER BY createdAt DESC` |

### 4.4 Partial Indexes (PostgreSQL Only)

For PostgreSQL production, partial indexes improve query performance on filtered subsets:

```sql
-- Only index unmatched/PENDING invoices (the ones that need attention)
CREATE INDEX IF NOT EXISTS idx_invoice_pending
  ON "Invoice"("vendorId", "invoiceDate")
  WHERE "status" IN ('PENDING', 'PROCESSED', 'DISCREPANCY');

-- Only index active (non-expired) E-Way Bills for expiry monitoring
CREATE INDEX IF NOT EXISTS idx_ewb_active
  ON "EWayBill"("validUntil")
  WHERE "status" != 'RESOLVED' AND "validUntil" > NOW();

-- Only index unresolved matches
CREATE INDEX IF NOT EXISTS idx_match_unresolved
  ON "MatchResult"("invoiceId", "matchScore")
  WHERE "status" IN ('PARTIAL', 'MISMATCH');
```

Prisma does not natively support partial indexes, so these must be managed via raw SQL in a custom migration or `prisma.$executeRaw` in a seed/server-start script.

### 4.5 Full-Text Search Considerations

In Phase 1, search is handled via basic `LIKE` / `CONTAINS` queries on `Invoice.rawText` and `DeliveryNote.rawText`. For Phase 2+, consider:

**PostgreSQL `tsvector` + GIN index approach:**

```sql
-- Add generated tsvector columns
ALTER TABLE "Invoice"
  ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce("rawText", '') || ' ' || coalesce("invoiceNumber", ''))
  ) STORED;

CREATE INDEX idx_invoice_search ON "Invoice" USING GIN("search_vector");
```

**Query:**

```sql
SELECT * FROM "Invoice"
WHERE search_vector @@ plainto_tsquery('english', 'INV-2024-123');
```

**SQLite fallback (dev):** SQLite's FTS5 via virtual table. Maintain a separate FTS5 table synced via triggers:

```sql
CREATE VIRTUAL TABLE invoice_fts USING fts5(rawText, invoiceNumber, content='Invoice', content_rowid='id');
```

For Phase 0–1, **do not implement FTS.** Use Prisma `contains` filter on `invoiceNumber` and `vendor.name` for search:

```typescript
const invoices = await prisma.invoice.findMany({
  where: {
    OR: [
      { invoiceNumber: { contains: searchTerm } },
      { vendor: { name: { contains: searchTerm } } },
    ],
  },
});
```

This is sufficient for 10K invoices. If search latency exceeds 200ms, add the GIN/FTS5 indexes.

---

## 5. Query Patterns & Optimization

### 5.1 Common Query Patterns

#### Q1: List invoices by vendor + status + date (Dashboard)

```typescript
// packages/backend/src/services/invoice.service.ts
async function listInvoices(params: {
  vendorId?: string;
  status?: DocumentStatus;
  dateFrom?: Date;
  dateTo?: Date;
  page: number;
  pageSize: number;
}) {
  const where: Prisma.InvoiceWhereInput = {};

  if (params.vendorId) where.vendorId = params.vendorId;
  if (params.status) where.status = params.status;
  if (params.dateFrom || params.dateTo) {
    where.invoiceDate = {};
    if (params.dateFrom) where.invoiceDate.gte = params.dateFrom;
    if (params.dateTo) where.invoiceDate.lte = params.dateTo;
  }

  const [data, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: { invoiceDate: 'desc' },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      select: {
        id: true,
        invoiceNumber: true,
        invoiceDate: true,
        totalAmount: true,
        status: true,
        vendorId: true,
        vendor: { select: { name: true } },
      },
    }),
    prisma.invoice.count({ where }),
  ]);

  return { data, total, page: params.page, pageSize: params.pageSize };
}
```

**Optimisation:** Composite index `(vendorId, status, invoiceDate DESC)` covers the WHERE + ORDER BY. The `select` clause avoids loading `lineItems` and `rawText` (large JSON/string fields) on list queries.

#### Q2: Get invoice detail with linked documents

```typescript
async function getInvoiceDetail(invoiceId: string) {
  return prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      vendor: true,
      deliveryNotes: {
        select: { id: true, deliveryNoteNumber: true, deliveryDate: true,
                 totalQuantity: true, status: true },
      },
      ewayBills: {
        select: { id: true, ewayBillNumber: true, totalValue: true, status: true },
      },
      matchResults: {
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
    },
  });
}
```

**N+1 prevention:** Using `include` in a single query instead of a loop of `findMany` calls. Prisma generates a single SQL query with JOINs for SQLite (or batched queries for PostgreSQL).

#### Q3: Dashboard aggregate stats

```typescript
async function getDashboardStats(tenantId: string) {
  const [totalInvoices, matchedCount, discrepancyCount, totalAtRisk] =
    await Promise.all([
      prisma.invoice.count({ where: { vendor: { /* tenant scope */ } } }),
      prisma.invoice.count({ where: { status: 'MATCHED' } }),
      prisma.invoice.count({ where: { status: 'DISCREPANCY' } }),
      prisma.matchResult.aggregate({
        where: { status: { in: ['PARTIAL', 'MISMATCH'] },
                 invoice: { /* tenant scope */ } },
        _sum: { /* need a join to invoice.totalAmount for ₹ at risk */ },
      }),
    ]);

  return { totalInvoices, matchedCount, discrepancyCount, totalAtRisk };
}
```

**Optimisation:** In Phase 3+, pre-compute dashboard stats into a `DashboardSnapshot` table refreshed hourly or on matching events. This avoids scanning thousands of rows every time a user loads the dashboard.

#### Q4: Matching engine candidate search

```typescript
async function findMatchCandidates(vendorId: string, invoiceDate: Date) {
  const windowStart = new Date(invoiceDate.getTime() - 7 * 24 * 60 * 60 * 1000);
  const windowEnd = new Date(invoiceDate.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [dns, ewbs] = await Promise.all([
    prisma.deliveryNote.findMany({
      where: {
        vendorId,
        deliveryDate: { gte: windowStart, lte: windowEnd },
        status: 'PROCESSED',
        invoiceId: null, // Not yet linked
      },
    }),
    prisma.eWayBill.findMany({
      where: {
        fromGstin: { /* resolve from vendor.gstin */ },
        generatedDate: { gte: windowStart, lte: windowEnd },
        status: 'PROCESSED',
        invoiceId: null,
      },
    }),
  ]);

  return { deliveryNotes: dns, ewayBills: ewbs };
}
```

**Optimisation:** Composite indexes `DeliveryNote(vendorId, deliveryDate)` and a matching index for EWayBill + `fromGstin` are essential here. The `status = 'PROCESSED'` filter also benefits from partial indexes (see §4.4).

---

### 5.2 N+1 Prevention Strategies

**Anti-pattern (N+1):**

```typescript
// ❌ Bad: 1 query for invoices + N queries for each vendor
const invoices = await prisma.invoice.findMany({ take: 20 });
for (const inv of invoices) {
  const vendor = await prisma.vendor.findUnique({ where: { id: inv.vendorId } });
  // ...
}
```

**Pattern 1: `include` (eager loading)**

```typescript
// ✅ Single query with JOIN
const invoices = await prisma.invoice.findMany({
  take: 20,
  include: { vendor: true },
});
```

**Pattern 2: `select` + batch loading**

```typescript
// ✅ Fetch only the fields you need — avoids transferring rawText/lineItems
const invoices = await prisma.invoice.findMany({
  take: 20,
  select: {
    id: true,
    invoiceNumber: true,
    totalAmount: true,
    status: true,
    vendor: { select: { id: true, name: true, gstin: true } },
  },
});
```

**Pattern 3: Batch loading with Prisma `findMany`**

```typescript
// ✅ When you need related data for many IDs
const invoiceIds = results.map(r => r.invoiceId);
const matchResults = await prisma.matchResult.findMany({
  where: { invoiceId: { in: invoiceIds } },
});
```

---

### 5.3 Pagination Approach

**Phase 0–2: Offset pagination**

```typescript
const invoices = await prisma.invoice.findMany({
  skip: (page - 1) * pageSize,
  take: pageSize,
  orderBy: { invoiceDate: 'desc' },
});

const total = await prisma.invoice.count();
```

**Characteristics:**
- Simple to implement and understand
- Stable ordering required (tiebreaker on `id` if dates collide)
- Performance degrades on large offsets (`OFFSET 10000 LIMIT 20` still reads 10020 rows)
- Acceptable for < 50K rows

**Phase 3+: Cursor-based pagination**

```typescript
// Cursor = last invoice's composite key: { invoiceDate, id }
const invoices = await prisma.invoice.findMany({
  take: pageSize + 1, // Fetch one extra to check if next page exists
  orderBy: [
    { invoiceDate: 'desc' },
    { id: 'asc' }, // Tiebreaker for identical dates
  ],
  ...(cursor && {
    cursor: { id: cursor },
    skip: 1, // Skip the cursor itself
  }),
});

const hasNextPage = invoices.length > pageSize;
const nextCursor = hasNextPage ? invoices[pageSize - 1].id : null;
if (hasNextPage) invoices.pop();
```

**Switch trigger:** Move from offset to cursor pagination when the invoices table exceeds 50K rows or when any list query with offset > 1000 exceeds 200ms.

---

### 5.4 Aggregation Queries (Dashboard)

**Real-time stats (Phase 0–2):**

```typescript
async function getDashboardStats(vendorFilter?: string) {
  const where = vendorFilter ? { vendorId: vendorFilter } : {};

  const [statusCounts, recentMatches, topDiscrepancies] = await Promise.all([
    // Group by status
    prisma.invoice.groupBy({
      by: ['status'],
      _count: true,
      where,
    }),
    // Latest 10 match results
    prisma.matchResult.findMany({
      where: vendorFilter ? { invoice: { vendorId: vendorFilter } } : {},
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        invoice: { select: { invoiceNumber: true, totalAmount: true } },
      },
    }),
    // Top vendors by discrepancy count
    prisma.invoice.groupBy({
      by: ['vendorId'],
      where: { status: 'DISCREPANCY' },
      _count: true,
      orderBy: { _count: { vendorId: 'desc' } },
      take: 5,
    }),
  ]);

  return { statusCounts, recentMatches, topDiscrepancies };
}
```

**Phase 3+ optimisation:** Pre-computed materialised view:

```sql
-- PostgreSQL
CREATE MATERIALIZED VIEW dashboard_daily_stats AS
SELECT
  DATE(i.createdAt) as date,
  i.status,
  COUNT(*) as count,
  SUM(i.totalAmount) as total_value
FROM "Invoice" i
GROUP BY DATE(i.createdAt), i.status
WITH DATA;

REFRESH MATERIALIZED VIEW dashboard_daily_stats; -- Run via cron every 15 min
```

```sql
-- SQLite (no materialized views — use a table + cron refresh)
CREATE TABLE dashboard_daily_stats (
  date TEXT NOT NULL,
  status TEXT NOT NULL,
  count INTEGER NOT NULL,
  total_value REAL NOT NULL,
  PRIMARY KEY (date, status)
);

-- Refresh via script or trigger
INSERT OR REPLACE INTO dashboard_daily_stats (date, status, count, total_value)
SELECT DATE(createdAt), status, COUNT(*), SUM(totalAmount)
FROM "Invoice" GROUP BY DATE(createdAt), status;
```

---

## 6. Migration Strategy

### 6.1 SQLite Dev → PostgreSQL Prod Workflow

```
            ┌──────────────────┐
            │  schema.prisma   │  ← Single source of truth
            └────────┬─────────┘
                     │
          ┌──────────┴──────────┐
          ▼                     ▼
  ┌─────────────────┐  ┌─────────────────┐
  │  SQLite (Dev)   │  │  PostgreSQL      │
  │                  │  │  (Prod/Staging) │
  │ prisma migrate   │  │ prisma migrate   │
  │ dev              │  │ deploy           │
  │                  │  │                  │
  │ Generates SQLite-│  │ Generates PG-   │
  │ specific SQL     │  │ specific SQL    │
  │ in migrations/   │  │ in migrations/  │
  └─────────────────┘  └─────────────────┘
```

### 6.2 Prisma Migration Commands

| Command | When | What It Does |
|---|---|---|
| `npx prisma migrate dev --name <name>` | During development | Creates a new migration from schema changes, applies it to the dev DB (SQLite), generates the migration file |
| `npx prisma migrate dev --create-only` | Before switching provider | Generates the migration SQL without applying it — useful when switching between SQLite and PG |
| `npx prisma migrate deploy` | CI/CD / production | Applies all pending migrations to the target database (PostgreSQL). Fails if there are unapplied migrations that conflict |
| `npx prisma migrate resolve` | After manual SQL fix | Marks a migration as applied or rolled back without running it |
| `npx prisma db push` | Quick dev iterations | Syncs the schema to the database without generating migration files. Use for rapid prototyping in SQLite only |
| `npx prisma db seed` | After migrate | Runs `prisma/seed.ts` to populate the database with sample data |

### 6.3 Migration Workflow

**Adding a new column (e.g., `Invoice.currency`):**

```bash
# 1. Edit schema.prisma — add: currency String @default("INR")

# 2. Generate migration
npx prisma migrate dev --name add_invoice_currency

# 3. Review the generated SQL in prisma/migrations/<timestamp>_add_invoice_currency/
#    For PostgreSQL:
#      ALTER TABLE "Invoice" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'INR';
#    For SQLite:
#      ALTER TABLE "Invoice" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'INR';

# 4. Test: Seed script still runs, API still works

# 5. Commit migration files to version control

# 6. Deploy: CI/CD runs `prisma migrate deploy` on PostgreSQL
```

**Caution — SQLite limitations:**
- SQLite does not support `ALTER TABLE ... DROP COLUMN` (before 3.35.0) or `ALTER TABLE ... ALTER COLUMN`
- For destructive changes, use `prisma db push` in dev and create a migration for PG only
- Alternative: create the PG migration manually and skip SQLite migration for that change

### 6.4 Seed Data Management

**Seed script** (`packages/backend/prisma/seed.ts`):

```typescript
import { PrismaClient, DocumentStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Create a test vendor
  const vendor = await prisma.vendor.create({
    data: {
      name: 'Acme Steel Works',
      gstin: '27AABCU9603R1ZV',
      email: 'billing@acmesteel.in',
      phone: '+91-9876543210',
      contractRef: 'PO-2024-001',
    },
  });

  // Create sample invoices with different statuses
  const invoices = await Promise.all([
    prisma.invoice.create({
      data: {
        vendorId: vendor.id,
        invoiceNumber: 'INV-2024-001',
        invoiceDate: new Date('2024-01-15'),
        totalAmount: 1250000,
        taxAmount: 225000,
        lineItems: JSON.stringify([
          { code: 'MS-001', description: 'Mild Steel Rods 12mm', quantity: 100, unitPrice: 12500, amount: 1250000 },
        ]),
        status: 'MATCHED',
      },
    }),
    prisma.invoice.create({
      data: {
        vendorId: vendor.id,
        invoiceNumber: 'INV-2024-002',
        invoiceDate: new Date('2024-01-20'),
        totalAmount: 850000,
        taxAmount: 153000,
        status: 'DISCREPANCY',
      },
    }),
  ]);

  // Create delivery notes
  await prisma.deliveryNote.create({
    data: {
      vendorId: vendor.id,
      deliveryNoteNumber: 'DN-2024-001',
      deliveryDate: new Date('2024-01-16'),
      invoiceId: invoices[0].id,
      totalQuantity: 97, // 3 units short — will create a discrepancy
      lineItems: JSON.stringify([
        { code: 'MS-001', description: 'Mild Steel Rods 12mm', quantity: 97, unitPrice: 12500 },
      ]),
      weightbridgeValue: 48500, // kg
      status: 'MATCHED',
    },
  });

  // Create match results
  await prisma.matchResult.create({
    data: {
      invoiceId: invoices[0].id,
      deliveryNoteId: (await prisma.deliveryNote.findFirst())!.id,
      matchScore: 0.82, // Partial — qty mismatch pulled score down
      status: 'PARTIAL',
      discrepancies: JSON.stringify([
        { field: 'quantity', expected: 100, actual: 97, severity: 'medium',
          message: 'Delivered quantity (97) is less than invoiced quantity (100)' },
      ]),
    },
  });

  console.log('✅ Seed data created');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
```

**Seed execution:**
```bash
# Local
npx prisma db seed

# Production (manual, or as part of first deploy)
DATABASE_URL="postgresql://..." npx prisma db seed

# Note: Seed should be IDEMPOTENT — check for existing records before inserting.
# In production, seed only reference data (vendors, config), not test data.
```

### 6.5 Rollback Strategy

```bash
# Dry run (see what would happen)
npx prisma migrate diff --from-migrations --to-schema-datamodel

# Rollback to a specific migration
npx prisma migrate resolve --rolled-back "<migration_name>"

# Fully reset database (dev only — DESTRUCTIVE)
npx prisma migrate reset

# Manual rollback via SQL (production — last resort)
# 1. Revert the schema change manually
# 2. Run: npx prisma migrate resolve --rolled-back "<rollback_migration_name>"
# 3. Deploy the revert commit with prisma migrate deploy
```

**Production rollback policy:**
- Always create a "revert migration" rather than rolling back in-place
- A revert migration simply reverses the schema change (e.g., `ALTER TABLE ... DROP COLUMN`)
- Test the revert migration on staging before applying to production
- Never use `prisma migrate reset` in production

### 6.6 Zero-Downtime Migration Considerations

Prisma Migrate acquires a lock on the migration table during `prisma migrate deploy`. For PostgreSQL, follow these practices for zero-downtime:

**Safe migrations (no downtime required):**
- Adding columns with `NOT NULL DEFAULT`: PostgreSQL adds the column instantly; default is applied to existing rows without a full table rewrite
- Adding indexes with `CONCURRENTLY`: `CREATE INDEX CONCURRENTLY` does not block writes
- Adding tables: no locking issue

**Dangerous migrations (require careful handling):**
- Dropping columns: `ALTER TABLE ... DROP COLUMN` acquires `ACCESS EXCLUSIVE` lock — schedules during maintenance window
- Renaming columns: Prisma does not support this natively; requires a multi-step migration
- Changing column types: May require table rewrite — use `USING` clause to make it instant
- Adding `NOT NULL` to an existing column: Must ensure no NULLs exist first — separate `UPDATE` + `ALTER` steps

**Multi-step migration pattern (for breaking changes):**

```prisma
// Step 1: Add new column as nullable
model Invoice {
  // ... existing fields
  newStatus String?  // Will replace old status field
}

// Step 2: Backfill in application code (deploy the app to backfill data)
// Step 3: Remove old column, make new column required
model Invoice {
  // ... existing fields (minus old status)
  newStatus String @default('PENDING')  // Now required
}
```

---

## 7. Data Lifecycle

### 7.1 Document Retention Policy

| Document Type | Active Period | Retention Period | Legal Basis |
|---|---|---|---|
| Invoice | Until payment approved + 30 days | 8 years from invoice date | Indian Income Tax Act — 8-year record retention for books of accounts |
| Delivery Note | Until match resolved | 8 years from delivery date | Linked to invoice — same retention period |
| E-Way Bill | Until expiry + 30 days | 8 years from generation date | GST Act — E-Way Bill data required for audit |
| Match Result | Until final resolution | 8 years from match date | Audit trail for tax reconciliation |
| OCR raw text | Until re-processed | 8 years | Needed for re-extraction and audit verification |
| Dispute letters | Until dispute resolved | 8 years | Legal correspondence retention |

**Implementation:**
- No automatic deletion in Phase 0–2
- Phase 3+: background cron job that archives records older than 8 years to cold storage (S3 Glacier / Deep Archive)
- Archival removes the row from the active table and writes a compressed JSON dump to cloud storage

### 7.2 Archival Strategy

**Phase 3+ approach — separate `_archive` schema:**

```sql
-- PostgreSQL: Move old records to archive schema
CREATE SCHEMA IF NOT EXISTS archive;

CREATE TABLE archive.invoices (LIKE "Invoice" INCLUDING ALL);
CREATE TABLE archive.delivery_notes (LIKE "DeliveryNote" INCLUDING ALL);
-- ... etc.

-- Archival job (runs monthly):
INSERT INTO archive.invoices
SELECT * FROM "Invoice"
WHERE invoiceDate < NOW() - INTERVAL '8 years'
  AND status = 'RESOLVED';

DELETE FROM "Invoice"
WHERE id IN (SELECT id FROM archive.invoices);
```

**SQLite alternative:** Separate archival database file.

```bash
# Detach another SQLite database
sqlite3 dev.db
> ATTACH DATABASE 'archive.db' AS archive;
> INSERT INTO archive.invoices SELECT * FROM main."Invoice" WHERE ...;
> DELETE FROM main."Invoice" WHERE ...;
```

### 7.3 Soft Delete vs Hard Delete

**Decision: Hard delete only for archival. No soft delete column.**

| Scenario | Approach | Rationale |
|---|---|---|
| User deletes a mistakenly uploaded document | Hard delete | Immediate removal. The matching engine has not yet run, so no audit trail is affected. |
| User removes a vendor relationship | Hard delete + cascade | CASCADE deletes all documents for that vendor. Prevents orphaned records. ONLY available if no matches exist. |
| Archival (records > 8 years) | Hard delete to `_archive` schema | Removes from active table, preserves in archive schema. |
| Compliance purge (e.g., vendor requests GDPR deletion) | Hard delete + anonymised log | Delete personally identifiable information (PII) from `Vendor` and `Invoice.rawText`. Keep aggregate match statistics (anonymised). |

**Why not soft delete:**
- Every query must filter `WHERE deletedAt IS NULL` — easy to forget and causes subtle bugs
- Table bloat — soft-deleted rows still consume space and degrade index performance
- Prisma does not natively support soft-delete middleware (must be implemented manually)

**If soft delete becomes necessary (multi-tenant Phase 5+):**

```prisma
model Vendor {
  // ...
  deletedAt DateTime?
  @@index([deletedAt])
}
```

Add a Prisma middleware to filter by default:

```typescript
prisma.$use(async (params, next) => {
  if (params.model === 'Vendor' && params.action === 'findMany') {
    params.args.where = { ...params.args.where, deletedAt: null };
  }
  return next(params);
});
```

---

## 8. Performance Considerations

### 8.1 Expected Data Volumes

| Entity | Monthly Volume | Year 1 Total | Year 3 Total (Projected) |
|---|---|---|---|
| Vendors | 5–10 | 100–200 | 500–1,000 |
| Invoices | 500–5,000 | 6,000–60,000 | 18,000–180,000 |
| Delivery Notes | 500–5,000 | 6,000–60,000 | 18,000–180,000 |
| E-Way Bills | 300–3,000 | 3,600–36,000 | 10,800–108,000 |
| Match Results | 500–5,000 | 6,000–60,000 | 18,000–180,000 |

**Per-tenant baseline (mid-size manufacturer):**
- 800 invoices/month
- 900 delivery notes/month (some invoices have multiple partial deliveries)
- 600 E-Way Bills/month
- 40,000–50,000 total documents after 3 years across 20 tenants

### 8.2 Query Performance Targets

| Query Type | Target (P95) | Notes |
|---|---|---|
| Single record by ID | < 5ms | Primary key lookup — should be instant |
| List invoices (paginated, filtered) | < 50ms | With indexes from §4.2 |
| Invoice detail with includes | < 30ms | Eager loading via Prisma `include` |
| Dashboard aggregate stats | < 100ms | Group by queries; pre-compute in Phase 3+ |
| Matching engine candidate search | < 100ms | Composite index on vendor + date range |
| Match result creation/update | < 20ms | Single row insert/update |
| OCR raw text update | < 20ms | Single row update (large text field) |
| Full-text search (Phase 2+) | < 200ms | GIN index on `tsvector` |

### 8.3 Caching Strategy

**Redis cache layers:**

```
┌─────────────────────────────────────────────────────────────────┐
│                        Redis Cache                               │
│                                                                  │
│  ┌──────────────────────┐  ┌─────────────────────────────┐      │
│  │ Hot Data (5 min TTL) │  │ Session Store               │      │
│  │                      │  │                             │      │
│  │ - Vendor lookup      │  │ - JWT refresh tokens        │      │
│  │ - Dashboard stats    │  │ - Rate limit counters       │      │
│  │ - User permissions   │  │ - Job locks (Bull)          │      │
│  │ - Match thresholds   │  │                             │      │
│  └──────────────────────┘  └─────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────┘
```

**Cache implementation:**

```typescript
// packages/backend/src/lib/cache.ts
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

const DEFAULT_TTL = 300; // 5 minutes

export async function getCachedOrFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = DEFAULT_TTL
): Promise<T> {
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  const data = await fetcher();
  await redis.setex(key, ttl, JSON.stringify(data));
  return data;
}

// Usage:
// const vendor = await getCachedOrFetch(`vendor:${id}`, () =>
//   prisma.vendor.findUnique({ where: { id } })
// );
```

**Cache invalidation strategy:**

| Event | Cache Key(s) to Invalidate |
|---|---|
| New invoice ingested | `dashboard:stats:{vendorId}`, `vendor:{vendorId}:invoice-count` |
| Match result created | `invoice:{id}:match-result`, `dashboard:stats:{vendorId}` |
| Vendor updated | `vendor:{id}` |
| E-Way Bill synced | `ewaybill:{number}` |
| OCR re-processed | `invoice:{id}` |

**What NOT to cache:**
- Individual invoice line items (too large, changes require complex invalidation)
- Raw OCR text (large, infrequently accessed)
- Match result discrepancies (always read the latest)

### 8.4 Read Replica Considerations (Phase 5+)

**When to add read replicas:**
- Dashboard query latency exceeds 200ms (P95)
- Write volume exceeds 500 writes/second on the primary
- Reporting queries (monthly leakage report) cause CPU spikes on the primary

**Read replica architecture:**

```
                     ┌──────────────────┐
                     │  API Replica 1    │
                     │  (Read + Write)   │
                     └────────┬─────────┘
                              │ writes
                              ▼
                     ┌──────────────────┐
                     │  PostgreSQL       │
                     │  Primary          │──→ Replica 1 (Read)
                     │  (Read/Write)     │──→ Replica 2 (Read)
                     └──────────────────┘
                              ▲
                     ┌────────┴─────────┐
                     │  API Replica 2    │
                     │  (Read Only)      │
                     └──────────────────┘
```

**Prisma read replica configuration:**

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL, // Primary — all writes go here
    },
  },
});

// Read replica client
const prismaRead = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_READ_REPLICA_URL, // Read-only
    },
  },
});

// Usage:
// await prisma.invoice.create(...)  → Primary
// await prismaRead.invoice.findMany(...) → Read replica
```

**Limitations:**
- Prisma does not natively support read/write splitting — must maintain two client instances
- Replication lag: read replicas may be 1–2 seconds behind the primary. Acceptable for dashboard queries but NOT for matching engine writes
- SQLite has NO read replica support — this is PostgreSQL-only

### 8.5 Monitoring & Alerting

| Metric | Threshold | Action |
|---|---|---|
| Query latency (P95) | > 200ms | Review query plan, add missing index |
| Connection pool usage | > 80% | Increase pool size or add PgBouncer |
| Disk I/O wait time | > 10ms | Consider faster storage (SSD) or read replicas |
| Migration time | > 60 seconds | Optimise migration SQL; batch large data migrations |
| Deadlocks | > 0 per hour | Review transaction isolation; add retry logic |
| DB connection count | > 50 | Add PgBouncer or scale down pool size |

**Query plan analysis (production):**

```sql
-- Identify slow queries
SELECT query, calls, total_exec_time, mean_exec_time, rows
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Check index usage
SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read
FROM pg_stat_user_indexes
WHERE idx_scan = 0 -- Unused indexes — consider dropping
ORDER BY idx_scan;
```

---

## Appendix A: SQLite ↔ PostgreSQL Type Mapping

| Prisma Type | SQLite | PostgreSQL | Notes |
|---|---|---|---|
| `String` | `TEXT` | `TEXT` | Identical |
| `String` with `@id @default(uuid())` | `TEXT` | `TEXT` (UUID stored as string) or `UUID` native type | Prisma stores as TEXT in both |
| `Int` | `INTEGER` | `INTEGER` | Identical |
| `Float` | `REAL` | `DOUBLE PRECISION` | SQLite REAL is 4-byte; PG DOUBLE is 8-byte |
| `Boolean` | `INTEGER` (0/1) | `BOOLEAN` | Prisma handles the conversion |
| `DateTime` | `TEXT` (ISO 8601) | `TIMESTAMP(3)` or `TIMESTAMPTZ(3)` | Always store UTC; Prisma returns `Date` objects |
| `Json` (future) | `TEXT` | `JSONB` | In Phase 0, use String with JSON. For Phase 3+, consider Prisma `Json` type |
| Enums | `TEXT` with CHECK constraint | Native `CREATE TYPE ... AS ENUM` | Prisma generates appropriate DDL per provider |
| `@default(now())` | `DEFAULT CURRENT_TIMESTAMP` | `DEFAULT NOW()` or `DEFAULT CURRENT_TIMESTAMP` | Compatible |

## Appendix B: Prisma Schema for Production (PostgreSQL)

When switching to PostgreSQL production, update `datasource` block:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
  // PostgreSQL-specific: enable preview features as needed
  // previewFeatures = ["fullTextSearch", "postgresqlExtensions"]
}
```

**Recommended PostgreSQL extensions:**
- `pgcrypto` — for `gen_random_uuid()` if using native UUID type
- `citext` — case-insensitive text comparisons for `invoiceNumber` lookups
- `pg_stat_statements` — query performance monitoring

---

> **Maintainer:** This document should be updated whenever schema changes are made. Keep the index list in §4 in sync with actual Prisma migrations. For Phase 1+ adoption of materialised views and caching, update §5.4 and §8.3 accordingly.
