# LedgerPulse API Specification & Event Schema

> **Version:** 1.0.0  
> **Status:** Draft  
> **Last Updated:** 2026-07-16  
> **Applies to:** Backend — Node.js / Express / TypeScript / Prisma (SQLite → PostgreSQL)

---

## Table of Contents

1. [API Overview](#1-api-overview)
2. [Standard Response Envelope](#2-standard-response-envelope)
3. [Route Specifications](#3-route-specifications)
   - [A. Health & System](#a-health--system)
   - [B. Vendors](#b-vendors)
   - [C. Invoices](#c-invoices)
   - [D. Delivery Notes](#d-delivery-notes)
   - [E. E-Way Bills](#e-e-way-bills)
   - [F. Matching Engine](#f-matching-engine)
   - [G. Discrepancies & Approvals](#g-discrepancies--approvals)
4. [Event Specifications](#4-event-specifications)
5. [Webhook Specifications](#5-webhook-specifications)
6. [Error Codes Reference](#6-error-codes-reference)

---

## 1. API Overview

### Base URL

| Environment | URL |
|-------------|-----|
| **Development** | `http://localhost:3001` |
| **Staging** | `https://staging-api.ledgerpulse.app` |
| **Production** | `https://api.ledgerpulse.app` |

All API paths are prefixed with `/api/v1` (see versioning below).

### Versioning Strategy

- **Header-based versioning** via `Accept-Version` header.
- Current version: `v1`.
- All routes in this spec live under `/api/v1/`.
- Breaking changes increment the major version. Backward-compatible additions are released within the current version.
- Deprecated versions are announced via the `Deprecation` and `Sunset` response headers with a minimum 90-day migration window.

```
Accept-Version: v1
```

### Authentication

- **Method:** Bearer JWT token in the `Authorization` header.
- **Format:** `Authorization: Bearer <token>`
- **Token expiry:** 24 hours for access tokens, 30 days for refresh tokens.
- **Multi-tenant scope:** Each token encodes a `tenantId` claim. All queries are scoped to the authenticated tenant.
- **Unprotected routes:** `GET /api/v1/health` is public. All other routes require authentication.

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

### Content Type

| Direction | Content-Type |
|-----------|-------------|
| Request (JSON) | `application/json` |
| Request (multipart) | `multipart/form-data` |
| Response | `application/json` |

All endpoints accept and return JSON unless otherwise noted.

### Pagination & Filtering Conventions

- **Pagination:** Query params `page` (default 1) and `perPage` (default 20, max 100).
- **Sorting:** Query params `sortBy` and `sortOrder` (`asc` / `desc`).
- **Search:** Query param `q` for full-text search across relevant fields.
- **Date filters:** `from` and `to` in ISO 8601 format (e.g., `2026-01-01T00:00:00Z`).
- **Status filters:** `status` enum matching the relevant model's `DocumentStatus`.

### Rate Limiting

| Tier | Limit | Window |
|------|-------|--------|
| **Standard** | 100 requests | 15 minutes |
| **Bulk/Sync** | 20 requests | 15 minutes (on sync endpoints) |

Exceeded limits return `429 Too Many Requests` with a `Retry-After` header.

### Error Response Format

All errors follow a consistent structure:

```json
{
  "data": null,
  "meta": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable description",
    "details": [
      {
        "field": "invoiceNumber",
        "message": "Invoice number is required"
      }
    ]
  }
}
```

---

## 2. Standard Response Envelope

Every response (success or error) uses this envelope:

```typescript
interface ApiResponse<T> {
  data: T | null;
  meta: PaginationMeta | null;
  error: ApiError | null;
}

interface PaginationMeta {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

interface ApiError {
  code: string;
  message: string;
  details?: FieldError[];
}

interface FieldError {
  field: string;
  message: string;
}
```

### Success Example (List)

```json
{
  "data": [ ... ],
  "meta": { "page": 1, "perPage": 20, "total": 42, "totalPages": 3 },
  "error": null
}
```

### Success Example (Single Resource)

```json
{
  "data": { ... },
  "meta": null,
  "error": null
}
```

### Error Example

```json
{
  "data": null,
  "meta": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      { "field": "email", "message": "Invalid email format" }
    ]
  }
}
```

---

## 3. Route Specifications

---

### A. Health & System

#### `GET /api/v1/health`

Returns server and database connectivity status. Unauthenticated.

**Response `200 OK`**

```json
{
  "data": {
    "status": "healthy",
    "timestamp": "2026-07-16T10:00:00.000Z",
    "checks": {
      "server": "ok",
      "database": "ok"
    }
  },
  "meta": null,
  "error": null
}
```

**Response `503 Service Unavailable`**

```json
{
  "data": {
    "status": "degraded",
    "timestamp": "2026-07-16T10:00:00.000Z",
    "checks": {
      "server": "ok",
      "database": "error"
    }
  },
  "meta": null,
  "error": null
}
```

| Status | Description |
|--------|-------------|
| `200` | All checks pass |
| `503` | One or more dependencies are unhealthy |

---

### B. Vendors

#### `GET /api/v1/vendors`

List all vendors with pagination and search.

**Query Parameters**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | number | 1 | Page number |
| `perPage` | number | 20 | Items per page |
| `q` | string | — | Search by name, GSTIN, or email |
| `sortBy` | string | `createdAt` | Field to sort by |
| `sortOrder` | `asc` / `desc` | `desc` | Sort direction |

**Response `200 OK`**

```typescript
interface VendorSummary {
  id: string;
  name: string;
  gstin: string | null;
  contractRef: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  createdAt: string;
  updatedAt: string;
  _count: {
    invoices: number;
    deliveryNotes: number;
  };
}
```

```json
{
  "data": [
    {
      "id": "a1b2c3d4-...",
      "name": "Acme Corp",
      "gstin": "27AAACA1234A1Z5",
      "contractRef": "CNT-2024-001",
      "email": "billing@acme.com",
      "phone": "+91-9876543210",
      "address": "Mumbai, Maharashtra",
      "createdAt": "2026-01-15T08:00:00.000Z",
      "updatedAt": "2026-06-20T14:30:00.000Z",
      "_count": { "invoices": 12, "deliveryNotes": 8 }
    }
  ],
  "meta": { "page": 1, "perPage": 20, "total": 5, "totalPages": 1 },
  "error": null
}
```

| Status | Description |
|--------|-------------|
| `200` | List of vendors |
| `401` | Missing or invalid token |
| `429` | Rate limited |

---

#### `POST /api/v1/vendors`

Create a new vendor.

**Request Body**

```typescript
interface CreateVendorRequest {
  name: string;
  gstin?: string;
  contractRef?: string;
  email?: string;
  phone?: string;
  address?: string;
}
```

```json
{
  "name": "Acme Corp",
  "gstin": "27AAACA1234A1Z5",
  "contractRef": "CNT-2024-001",
  "email": "billing@acme.com",
  "phone": "+91-9876543210",
  "address": "Mumbai, Maharashtra"
}
```

**Response `201 Created`**

```typescript
interface VendorDetail {
  id: string;
  name: string;
  gstin: string | null;
  contractRef: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  createdAt: string;
  updatedAt: string;
}
```

```json
{
  "data": {
    "id": "a1b2c3d4-...",
    "name": "Acme Corp",
    "gstin": "27AAACA1234A1Z5",
    "contractRef": "CNT-2024-001",
    "email": "billing@acme.com",
    "phone": "+91-9876543210",
    "address": "Mumbai, Maharashtra",
    "createdAt": "2026-07-16T10:00:00.000Z",
    "updatedAt": "2026-07-16T10:00:00.000Z"
  },
  "meta": null,
  "error": null
}
```

| Status | Description |
|--------|-------------|
| `201` | Vendor created |
| `400` | Malformed request body |
| `422` | Validation error (missing name, duplicate GSTIN) |
| `409` | Duplicate GSTIN detected |

---

#### `GET /api/v1/vendors/:id`

Get vendor detail with recent invoices and delivery notes.

**Response `200 OK`**

```typescript
interface VendorDetail {
  id: string;
  name: string;
  gstin: string | null;
  contractRef: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  createdAt: string;
  updatedAt: string;
  invoices: InvoiceSummary[];
  deliveryNotes: DeliveryNoteSummary[];
}
```

```json
{
  "data": {
    "id": "a1b2c3d4-...",
    "name": "Acme Corp",
    "gstin": "27AAACA1234A1Z5",
    "contractRef": "CNT-2024-001",
    "email": "billing@acme.com",
    "phone": "+91-9876543210",
    "address": "Mumbai, Maharashtra",
    "createdAt": "2026-01-15T08:00:00.000Z",
    "updatedAt": "2026-06-20T14:30:00.000Z",
    "invoices": [
      {
        "id": "inv-001",
        "invoiceNumber": "INV-2026-001",
        "totalAmount": 150000.00,
        "status": "MATCHED",
        "invoiceDate": "2026-06-01T00:00:00.000Z"
      }
    ],
    "deliveryNotes": []
  },
  "meta": null,
  "error": null
}
```

| Status | Description |
|--------|-------------|
| `200` | Vendor detail |
| `404` | Vendor not found |

---

#### `PUT /api/vendors/:id`

Update vendor fields. Partial updates supported.

**Request Body**

```typescript
interface UpdateVendorRequest {
  name?: string;
  gstin?: string;
  contractRef?: string;
  email?: string;
  phone?: string;
  address?: string;
}
```

```json
{
  "email": "accounts@acme.com",
  "phone": "+91-9988776655"
}
```

**Response `200 OK`**

Returns the full updated vendor object (same shape as `POST /api/vendors` response).

| Status | Description |
|--------|-------------|
| `200` | Vendor updated |
| `404` | Vendor not found |
| `422` | Validation error |
| `409` | Duplicate GSTIN |

---

#### `DELETE /api/vendors/:id`

Soft-delete a vendor. Sets a `deletedAt` timestamp. Related records are preserved but the vendor is excluded from list queries by default.

**Response `200 OK`**

```json
{
  "data": { "id": "a1b2c3d4-...", "deletedAt": "2026-07-16T10:05:00.000Z" },
  "meta": null,
  "error": null
}
```

| Status | Description |
|--------|-------------|
| `200` | Vendor soft-deleted |
| `404` | Vendor not found |
| `409` | Vendor has active unmatched invoices (configurable) |

---

### C. Invoices

#### `GET /api/v1/invoices`

List invoices with filtering and pagination.

**Query Parameters**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | number | 1 | Page number |
| `perPage` | number | 20 | Items per page |
| `status` | DocumentStatus | — | Filter by status |
| `vendorId` | string | — | Filter by vendor |
| `from` | ISO 8601 | — | Invoice date start |
| `to` | ISO 8601 | — | Invoice date end |
| `q` | string | — | Search by invoice number |
| `sortBy` | string | `createdAt` | Sort field |
| `sortOrder` | `asc` / `desc` | `desc` | Sort direction |

**Response `200 OK`**

```typescript
interface InvoiceSummary {
  id: string;
  vendorId: string;
  vendorName: string;
  invoiceNumber: string;
  invoiceDate: string;
  totalAmount: number;
  taxAmount: number | null;
  status: DocumentStatus;
  ingestedAt: string;
  processedAt: string | null;
  matchCount: number;
}
```

```json
{
  "data": [
    {
      "id": "inv-a1b2c3d4",
      "vendorId": "vnd-xyz",
      "vendorName": "Acme Corp",
      "invoiceNumber": "INV-2026-001",
      "invoiceDate": "2026-06-01T00:00:00.000Z",
      "totalAmount": 150000.00,
      "taxAmount": 27000.00,
      "status": "MATCHED",
      "ingestedAt": "2026-06-02T10:00:00.000Z",
      "processedAt": "2026-06-02T10:05:00.000Z",
      "matchCount": 2
    }
  ],
  "meta": { "page": 1, "perPage": 20, "total": 34, "totalPages": 2 },
  "error": null
}
```

| Status | Description |
|--------|-------------|
| `200` | List of invoices |

---

#### `POST /api/v1/invoices/upload`

Upload an invoice file for OCR processing. Accepts PDF, JPEG, PNG.

**Request** — `multipart/form-data`

| Field | Type | Description |
|-------|------|-------------|
| `file` | File | Invoice document (PDF, JPG, PNG) |
| `vendorId` | string | Vendor ID |
| `invoiceNumber` | string | Optional — override extracted number |

**Response `201 Accepted`**

```typescript
interface UploadResponse {
  id: string;
  invoiceNumber: string | null;
  status: "PENDING";
  filePath: string;
  ingestedAt: string;
  message: string;
}
```

```json
{
  "data": {
    "id": "inv-a1b2c3d4",
    "invoiceNumber": null,
    "status": "PENDING",
    "filePath": "/uploads/invoices/inv-a1b2c3d4.pdf",
    "ingestedAt": "2026-07-16T10:00:00.000Z",
    "message": "File received. OCR processing initiated."
  },
  "meta": null,
  "error": null
}
```

| Status | Description |
|--------|-------------|
| `201` | File accepted for processing |
| `400` | No file attached or unsupported format |
| `422` | OCR processing failed |
| `404` | Vendor not found |

---

#### `POST /api/v1/invoices`

Create an invoice manually (without file upload).

**Request Body**

```typescript
interface CreateInvoiceRequest {
  vendorId: string;
  invoiceNumber: string;
  invoiceDate: string;       // ISO 8601
  totalAmount: number;
  taxAmount?: number;
  lineItems?: LineItemInput[];
}

interface LineItemInput {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  hsnCode?: string;
}
```

```json
{
  "vendorId": "vnd-xyz",
  "invoiceNumber": "INV-2026-042",
  "invoiceDate": "2026-07-15T00:00:00.000Z",
  "totalAmount": 250000.00,
  "taxAmount": 45000.00,
  "lineItems": [
    {
      "description": "Steel rods 12mm",
      "quantity": 100,
      "unitPrice": 2500.00,
      "amount": 250000.00,
      "hsnCode": "7214"
    }
  ]
}
```

**Response `201 Created`**

```typescript
interface InvoiceDetail {
  id: string;
  vendorId: string;
  invoiceNumber: string;
  invoiceDate: string;
  totalAmount: number;
  taxAmount: number | null;
  lineItems: LineItem[];
  status: DocumentStatus;
  ingestedAt: string;
  processedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
```

```json
{
  "data": {
    "id": "inv-a1b2c3d4",
    "vendorId": "vnd-xyz",
    "invoiceNumber": "INV-2026-042",
    "invoiceDate": "2026-07-15T00:00:00.000Z",
    "totalAmount": 250000.00,
    "taxAmount": 45000.00,
    "lineItems": [
      {
        "description": "Steel rods 12mm",
        "quantity": 100,
        "unitPrice": 2500.00,
        "amount": 250000.00,
        "hsnCode": "7214"
      }
    ],
    "status": "PROCESSED",
    "ingestedAt": "2026-07-16T10:00:00.000Z",
    "processedAt": "2026-07-16T10:00:00.000Z",
    "createdAt": "2026-07-16T10:00:00.000Z",
    "updatedAt": "2026-07-16T10:00:00.000Z"
  },
  "meta": null,
  "error": null
}
```

| Status | Description |
|--------|-------------|
| `201` | Invoice created |
| `422` | Validation error (duplicate invoice number per vendor, missing fields) |
| `404` | Vendor not found |

---

#### `GET /api/v1/invoices/:id`

Get full invoice detail including line items, linked delivery notes, E-Way Bills, and match results.

**Response `200 OK`**

```typescript
interface InvoiceDetail {
  id: string;
  vendorId: string;
  vendor: VendorSummary;
  invoiceNumber: string;
  invoiceDate: string;
  totalAmount: number;
  taxAmount: number | null;
  lineItems: LineItem[];
  filePath: string | null;
  rawText: string | null;
  status: DocumentStatus;
  ingestedAt: string;
  processedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deliveryNotes: DeliveryNoteSummary[];
  ewayBills: EWayBillSummary[];
  matchResults: MatchResultSummary[];
}
```

| Status | Description |
|--------|-------------|
| `200` | Invoice detail |
| `404` | Invoice not found |

---

#### `PUT /api/v1/invoices/:id/status`

Update the status of an invoice.

**Request Body**

```typescript
interface UpdateInvoiceStatusRequest {
  status: DocumentStatus; // PENDING | PROCESSED | MATCHED | DISCREPANCY | RESOLVED
}
```

```json
{
  "status": "RESOLVED"
}
```

**Response `200 OK`**

Returns the updated invoice object.

| Status | Description |
|--------|-------------|
| `200` | Status updated |
| `404` | Invoice not found |
| `422` | Invalid status transition |

---

#### `POST /api/v1/invoices/:id/reprocess`

Re-run OCR processing on an existing invoice file.

**Response `200 OK`**

```json
{
  "data": {
    "id": "inv-a1b2c3d4",
    "status": "PENDING",
    "message": "Reprocessing initiated."
  },
  "meta": null,
  "error": null
}
```

| Status | Description |
|--------|-------------|
| `200` | Reprocessing queued |
| `404` | Invoice not found |
| `422` | No file to reprocess (manual invoice) |

---

### D. Delivery Notes

#### `GET /api/v1/delivery-notes`

List delivery notes with filters.

**Query Parameters**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | number | 1 | Page number |
| `perPage` | number | 20 | Items per page |
| `status` | DocumentStatus | — | Filter by status |
| `vendorId` | string | — | Filter by vendor |
| `invoiceId` | string | — | Filter by linked invoice |
| `from` | ISO 8601 | — | Delivery date start |
| `to` | ISO 8601 | — | Delivery date end |
| `q` | string | — | Search by delivery note number |

**Response `200 OK`**

```typescript
interface DeliveryNoteSummary {
  id: string;
  vendorId: string;
  vendorName: string;
  deliveryNoteNumber: string;
  deliveryDate: string;
  totalQuantity: number;
  status: DocumentStatus;
  ingestedAt: string;
  processedAt: string | null;
  invoiceId: string | null;
}
```

---

#### `POST /api/v1/delivery-notes/upload`

Upload a delivery note file for OCR processing. Same multipart conventions as invoice upload.

**Request** — `multipart/form-data`

| Field | Type | Description |
|-------|------|-------------|
| `file` | File | Delivery note document (PDF, JPG, PNG) |
| `vendorId` | string | Vendor ID |

**Response `201 Accepted`**

Same pattern as `POST /api/v1/invoices/upload`.

| Status | Description |
|--------|-------------|
| `201` | File accepted |
| `400` | No file / unsupported format |
| `404` | Vendor not found |

---

#### `POST /api/v1/delivery-notes`

Create a delivery note manually.

**Request Body**

```typescript
interface CreateDeliveryNoteRequest {
  vendorId: string;
  deliveryNoteNumber: string;
  deliveryDate: string;
  totalQuantity: number;
  invoiceId?: string;
  lineItems?: LineItemInput[];
  weightbridgeValue?: number;
}
```

**Response `201 Created`**

Same response shape as invoice creation but for the `DeliveryNote` model.

---

#### `GET /api/v1/delivery-notes/:id`

Get full delivery note detail including line items, linked invoice, and match results.

---

#### `PUT /api/v1/delivery-notes/:id/status`

Update delivery note status.

| Status | Description |
|--------|-------------|
| `200` | Status updated |
| `404` | Not found |
| `422` | Invalid transition |

---

### E. E-Way Bills

#### `GET /api/v1/eway-bills`

List E-Way Bills with filters.

**Query Parameters**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | number | 1 | |
| `perPage` | number | 20 | |
| `status` | DocumentStatus | — | |
| `invoiceId` | string | — | |
| `from` | ISO 8601 | — | Generated date start |
| `to` | ISO 8601 | — | Generated date end |
| `q` | string | — | Search by EWB number |

**Response `200 OK`**

```typescript
interface EWayBillSummary {
  id: string;
  ewayBillNumber: string;
  invoiceId: string | null;
  generatedDate: string;
  validUntil: string;
  fromGstin: string;
  toGstin: string;
  totalValue: number;
  transportMode: string | null;
  vehicleNumber: string | null;
  status: DocumentStatus;
  ingestedAt: string;
}
```

---

#### `POST /api/v1/eway-bills/sync`

Trigger a sync from the GST portal. Fetches recent E-Way Bills for the tenant.

**Request Body**

```typescript
interface SyncEWayBillsRequest {
  fromDate: string;   // ISO 8601
  toDate?: string;    // ISO 8601 — defaults to today
  limit?: number;     // Max records to pull (default 50)
}
```

```json
{
  "fromDate": "2026-07-01T00:00:00.000Z",
  "toDate": "2026-07-16T00:00:00.000Z",
  "limit": 100
}
```

**Response `202 Accepted`**

```json
{
  "data": {
    "syncId": "sync-abc123",
    "status": "IN_PROGRESS",
    "requestedFrom": "2026-07-01T00:00:00.000Z",
    "requestedTo": "2026-07-16T00:00:00.000Z",
    "message": "Sync initiated. Results will be available shortly."
  },
  "meta": null,
  "error": null
}
```

| Status | Description |
|--------|-------------|
| `202` | Sync initiated |
| `422` | Invalid date range (exceeds 30-day window) |
| `429` | Rate limited — sync already in progress |

---

#### `GET /api/v1/eway-bills/:id`

Get full E-Way Bill detail including raw data and linked invoice.

---

#### `POST /api/v1/eway-bills`

Create an E-Way Bill manually.

**Request Body**

```typescript
interface CreateEWayBillRequest {
  ewayBillNumber: string;
  invoiceId?: string;
  generatedDate: string;
  validUntil: string;
  fromGstin: string;
  toGstin: string;
  totalValue: number;
  transportMode?: string;
  vehicleNumber?: string;
}
```

**Response `201 Created`**

| Status | Description |
|--------|-------------|
| `201` | E-Way Bill created |
| `409` | Duplicate EWB number |

---

### F. Matching Engine

#### `POST /api/v1/matching/run`

Trigger the 3-way matching algorithm for a specific invoice.

**Request Body**

```typescript
interface RunMatchRequest {
  invoiceId: string;
  deliveryNoteIds?: string[];  // Optional — narrow which DNs to match
  ewayBillIds?: string[];      // Optional — narrow which EWBs to match
}
```

```json
{
  "invoiceId": "inv-a1b2c3d4",
  "deliveryNoteIds": ["dn-001", "dn-002"],
  "ewayBillIds": ["ewb-001"]
}
```

**Response `200 OK`**

```typescript
interface MatchResultSummary {
  id: string;
  invoiceId: string;
  deliveryNoteId: string | null;
  ewayBillId: string | null;
  matchScore: number;
  status: "MATCHED" | "PARTIAL" | "MISMATCH";
  discrepancyCount: number;
  createdAt: string;
}
```

```json
{
  "data": {
    "id": "mr-a1b2c3d4",
    "invoiceId": "inv-a1b2c3d4",
    "deliveryNoteId": "dn-001",
    "ewayBillId": "ewb-001",
    "matchScore": 0.95,
    "status": "PARTIAL",
    "discrepancyCount": 2,
    "createdAt": "2026-07-16T10:05:00.000Z"
  },
  "meta": null,
  "error": null
}
```

| Status | Description |
|--------|-------------|
| `200` | Match completed |
| `404` | Invoice not found |
| `409` | Match conflict — see `MATCH_FAILED` error code |

---

#### `GET /api/v1/matching/results`

List match results with filters.

**Query Parameters**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | number | 1 | |
| `perPage` | number | 20 | |
| `status` | `MATCHED` / `PARTIAL` / `MISMATCH` | — | |
| `invoiceId` | string | — | |
| `startDate` | ISO 8601 | — | |

**Response `200 OK`**

```json
{
  "data": [
    {
      "id": "mr-a1b2c3d4",
      "invoiceId": "inv-a1b2c3d4",
      "invoiceNumber": "INV-2026-001",
      "deliveryNoteId": "dn-001",
      "deliveryNoteNumber": "DN-2026-001",
      "ewayBillId": "ewb-001",
      "ewayBillNumber": "EWB-123456789",
      "matchScore": 0.95,
      "status": "PARTIAL",
      "discrepancyCount": 2,
      "createdAt": "2026-07-16T10:05:00.000Z"
    }
  ],
  "meta": { "page": 1, "perPage": 20, "total": 8, "totalPages": 1 },
  "error": null
}
```

---

#### `GET /api/v1/matching/results/:id`

Get match result detail with full discrepancy list.

**Response `200 OK`**

```typescript
interface MatchResultDetail {
  id: string;
  invoice: InvoiceDetail;
  deliveryNote: DeliveryNoteDetail | null;
  ewayBill: EWayBillDetail | null;
  matchScore: number;
  status: "MATCHED" | "PARTIAL" | "MISMATCH";
  discrepancies: Discrepancy[];
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

interface Discrepancy {
  type: "QUANTITY" | "AMOUNT" | "TAX" | "HSN_CODE" | "MISSING_DOCUMENT";
  field: string;
  expected: string | number;
  actual: string | number;
  severity: "LOW" | "MEDIUM" | "HIGH";
  details?: string;
}
```

```json
{
  "data": {
    "id": "mr-a1b2c3d4",
    "invoice": { ... },
    "deliveryNote": { ... },
    "ewayBill": { ... },
    "matchScore": 0.72,
    "status": "MISMATCH",
    "discrepancies": [
      {
        "type": "QUANTITY",
        "field": "lineItems[0].quantity",
        "expected": 100,
        "actual": 95,
        "severity": "MEDIUM",
        "details": "Invoiced qty 100 vs delivered qty 95"
      },
      {
        "type": "AMOUNT",
        "field": "totalAmount",
        "expected": 250000.00,
        "actual": 237500.00,
        "severity": "HIGH",
        "details": "Invoice total ₹2,50,000 vs EWB value ₹2,37,500"
      }
    ],
    "reviewedBy": null,
    "reviewedAt": null,
    "createdAt": "2026-07-16T10:05:00.000Z"
  },
  "meta": null,
  "error": null
}
```

---

### G. Discrepancies & Approvals

#### `GET /api/v1/discrepancies`

List all flagged discrepancies across match results.

**Query Parameters**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | number | 1 | |
| `perPage` | number | 20 | |
| `severity` | `LOW` / `MEDIUM` / `HIGH` | — | |
| `type` | DiscrepancyType | — | |
| `resolved` | boolean | — | Filter by resolution status |
| `invoiceId` | string | — | |

**Response `200 OK`**

```typescript
interface DiscrepancyItem {
  id: string;
  matchResultId: string;
  invoiceNumber: string;
  vendorName: string;
  type: DiscrepancyType;
  field: string;
  expected: string | number;
  actual: string | number;
  severity: "LOW" | "MEDIUM" | "HIGH";
  resolved: boolean;
  resolvedAt: string | null;
  resolvedBy: string | null;
  createdAt: string;
}
```

---

#### `PUT /api/v1/discrepancies/:id/resolve`

Mark a discrepancy as resolved with notes.

**Request Body**

```typescript
interface ResolveDiscrepancyRequest {
  resolution: string;       // Explanation of resolution
  acceptedValue?: number;   // Optional — the agreed-upon corrected value
}
```

```json
{
  "resolution": "Vendor confirmed qty shortfall — credit note issued.",
  "acceptedValue": 95
}
```

**Response `200 OK`**

```json
{
  "data": {
    "id": "disc-001",
    "resolved": true,
    "resolvedAt": "2026-07-16T11:00:00.000Z",
    "resolvedBy": "user-abc",
    "resolution": "Vendor confirmed qty shortfall — credit note issued."
  },
  "meta": null,
  "error": null
}
```

| Status | Description |
|--------|-------------|
| `200` | Discrepancy resolved |
| `404` | Discrepancy not found |
| `422` | Missing resolution text |

---

#### `POST /api/v1/discrepancies/:id/dispute`

Generate a dispute document draft based on the discrepancy. Returns a formatted dispute (email or PDF content) to be reviewed before sending.

**Response `200 OK`**

```typescript
interface DisputeDraft {
  discrepancyId: string;
  disputeNumber: string;
  generatedAt: string;
  subject: string;
  body: string;          // Plain text or HTML content
  attachments: string[]; // Reference file paths or URLs
}
```

```json
{
  "data": {
    "discrepancyId": "disc-001",
    "disputeNumber": "DSP-2026-001",
    "generatedAt": "2026-07-16T11:05:00.000Z",
    "subject": "Dispute: Quantity Mismatch — INV-2026-001",
    "body": "Dear Vendor,\n\nAs per our records, the delivered quantity ...",
    "attachments": [
      "/reports/dispute-disc-001.pdf"
    ]
  },
  "meta": null,
  "error": null
}
```

| Status | Description |
|--------|-------------|
| `200` | Dispute draft generated |
| `404` | Discrepancy not found |

---

#### `GET /api/v1/discrepancies/stats`

Dashboard statistics for discrepancies.

**Response `200 OK`**

```typescript
interface DiscrepancyStats {
  totalOpen: number;
  totalResolved: number;
  bySeverity: {
    LOW: number;
    MEDIUM: number;
    HIGH: number;
  };
  byType: Record<string, number>;
  averageResolutionTimeHours: number;
  topVendorsByDiscrepancies: Array<{
    vendorId: string;
    vendorName: string;
    count: number;
  }>;
}
```

```json
{
  "data": {
    "totalOpen": 12,
    "totalResolved": 8,
    "bySeverity": { "LOW": 5, "MEDIUM": 10, "HIGH": 5 },
    "byType": { "QUANTITY": 8, "AMOUNT": 6, "TAX": 3, "MISSING_DOCUMENT": 3 },
    "averageResolutionTimeHours": 48.5,
    "topVendorsByDiscrepancies": [
      { "vendorId": "vnd-xyz", "vendorName": "Acme Corp", "count": 4 }
    ]
  },
  "meta": null,
  "error": null
}
```

---

## 4. Event Specifications

The system emits events via an internal event bus (in-process with optional forward to external message broker for Phase 5+).

### Event Envelope

```typescript
interface EventEnvelope<T = unknown> {
  id: string;              // UUID v4
  name: string;            // Event name (dot-notation)
  version: number;         // Schema version
  producer: string;        // Service/module name
  timestamp: string;       // ISO 8601
  tenantId: string;        // Multi-tenant scope
  correlationId: string;   // Trace across event chain
  data: T;
}
```

### Invoice Events

#### `invoice.uploaded`

| Field | Value |
|-------|-------|
| **Producer** | Invoice Service |
| **Version** | 1 |
| **When** | File upload accepted, before OCR |
| **Consumers** | OcrService, AuditLogger |

```typescript
interface InvoiceUploadedPayload {
  invoiceId: string;
  vendorId: string;
  filePath: string;
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  ingestedAt: string;
}
```

#### `invoice.processed`

| Field | Value |
|-------|-------|
| **Producer** | OcrService |
| **Version** | 1 |
| **When** | OCR processing completes |
| **Consumers** | MatchingEngine, NotificationService |

```typescript
interface InvoiceProcessedPayload {
  invoiceId: string;
  invoiceNumber: string;
  vendorId: string;
  totalAmount: number;
  lineItemCount: number;
  status: DocumentStatus;
  processedAt: string;
  rawTextLength: number;
}
```

#### `invoice.matched`

| Field | Value |
|-------|-------|
| **Producer** | MatchingEngine |
| **Version** | 1 |
| **When** | Invoice is fully matched (score >= threshold) |
| **Consumers** | NotificationService, AuditLogger |

```typescript
interface InvoiceMatchedPayload {
  invoiceId: string;
  invoiceNumber: string;
  matchResultId: string;
  matchScore: number;
  matchedDeliveryNotes: string[];
  matchedEWayBills: string[];
  matchedAt: string;
}
```

### Delivery Note Events

#### `delivery-note.uploaded`

| Field | Value |
|-------|-------|
| **Producer** | DeliveryNote Service |
| **Version** | 1 |
| **When** | Delivery note file accepted |
| **Consumers** | OcrService |

```typescript
interface DeliveryNoteUploadedPayload {
  deliveryNoteId: string;
  vendorId: string;
  filePath: string;
  fileName: string;
  ingestedAt: string;
}
```

#### `delivery-note.processed`

| Field | Value |
|-------|-------|
| **Producer** | OcrService |
| **Version** | 1 |
| **When** | OCR processing completes |
| **Consumers** | MatchingEngine |

```typescript
interface DeliveryNoteProcessedPayload {
  deliveryNoteId: string;
  deliveryNoteNumber: string;
  vendorId: string;
  totalQuantity: number;
  status: DocumentStatus;
  processedAt: string;
}
```

### E-Way Bill Events

#### `eway-bill.synced`

| Field | Value |
|-------|-------|
| **Producer** | EWayBill Service |
| **Version** | 1 |
| **When** | GST portal sync completes |
| **Consumers** | MatchingEngine, AuditLogger |

```typescript
interface EWayBillSyncedPayload {
  syncId: string;
  ewayBillCount: number;
  fromDate: string;
  toDate: string;
  newRecords: number;
  duplicates: number;
  failed: number;
  syncedAt: string;
}
```

#### `eway-bill.matched`

| Field | Value |
|-------|-------|
| **Producer** | MatchingEngine |
| **Version** | 1 |
| **When** | E-Way Bill is linked in a match result |
| **Consumers** | AuditLogger |

```typescript
interface EWayBillMatchedPayload {
  ewayBillId: string;
  ewayBillNumber: string;
  invoiceId: string;
  matchResultId: string;
}
```

### Match Events

#### `match.completed`

| Field | Value |
|-------|-------|
| **Producer** | MatchingEngine |
| **Version** | 1 |
| **When** | 3-way match algorithm finishes |
| **Consumers** | NotificationService, DiscrepancyService, AuditLogger |

```typescript
interface MatchCompletedPayload {
  matchResultId: string;
  invoiceId: string;
  invoiceNumber: string;
  matchScore: number;
  status: "MATCHED" | "PARTIAL" | "MISMATCH";
  discrepancyCount: number;
  completedAt: string;
}
```

#### `match.failed`

| Field | Value |
|-------|-------|
| **Producer** | MatchingEngine |
| **Version** | 1 |
| **When** | Matching algorithm encounters an unrecoverable error |
| **Consumers** | NotificationService, AuditLogger |

```typescript
interface MatchFailedPayload {
  invoiceId: string;
  invoiceNumber: string;
  reason: string;
  failedAt: string;
}
```

### Discrepancy Events

#### `discrepancy.flagged`

| Field | Value |
|-------|-------|
| **Producer** | MatchingEngine |
| **Version** | 1 |
| **When** | A discrepancy is detected during matching |
| **Consumers** | NotificationService, DiscrepancyService |

```typescript
interface DiscrepancyFlaggedPayload {
  discrepancyId: string;
  matchResultId: string;
  invoiceId: string;
  invoiceNumber: string;
  type: string;
  field: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  flaggedAt: string;
}
```

#### `discrepancy.resolved`

| Field | Value |
|-------|-------|
| **Producer** | DiscrepancyService |
| **Version** | 1 |
| **When** | User marks a discrepancy as resolved |
| **Consumers** | AuditLogger, NotificationService |

```typescript
interface DiscrepancyResolvedPayload {
  discrepancyId: string;
  matchResultId: string;
  resolvedBy: string;
  resolution: string;
  resolvedAt: string;
}
```

---

## 5. Webhook Specifications

> **Planned for Phase 5+. Not implemented in Phase 0–1.**

### Webhook Registration

Endpoints will be managed via a `Webhook` model (future) with fields:

```typescript
interface WebhookRegistration {
  id: string;
  url: string;              // HTTPS only
  events: string[];         // Subscribed event names
  secret: string;           // Shared signing secret
  retryCount: number;       // Max retries (default 3)
  timeoutMs: number;        // Request timeout (default 5000)
  enabled: boolean;
  lastTriggeredAt: string | null;
  createdAt: string;
}
```

### Payload Format

```json
{
  "event": "match.completed",
  "version": 1,
  "id": "evt-abc123",
  "timestamp": "2026-07-16T10:05:00.000Z",
  "tenantId": "tenant-001",
  "correlationId": "corr-xyz",
  "data": { ... }
}
```

### Retry Policy

| Attempt | Delay | Total Backoff |
|---------|-------|---------------|
| 1st | Immediate | 0s |
| 2nd | 10s | 10s |
| 3rd | 60s | 70s |
| 4th (final) | 300s | 370s (~6 min) |

After 4 failed attempts, the webhook is automatically disabled and an admin alert is sent.

### Signature Verification

Each webhook payload is signed using **HMAC-SHA256**.

```
X-Webhook-Signature: sha256=<hex-encoded-hmac>
X-Webhook-Timestamp: <unix-timestamp-ms>
```

**Verification pseudocode:**

```typescript
import { createHmac, timingSafeEqual } from "crypto";

function verifyWebhookSignature(
  rawBody: Buffer,
  signature: string,
  timestamp: string,
  secret: string
): boolean {
  const payload = `${timestamp}.${rawBody.toString("utf8")}`;
  const expected = createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  return timingSafeEqual(
    Buffer.from(signature.replace("sha256=", "")),
    Buffer.from(expected)
  );
}
```

---

## 6. Error Codes Reference

| Code | HTTP Status | Description | When it occurs |
|------|-------------|-------------|----------------|
| `VALIDATION_ERROR` | 422 | Request body or query params failed validation | Missing required fields, invalid enum values, malformed dates, exceeding field length limits |
| `NOT_FOUND` | 404 | Requested resource does not exist | Vendor, invoice, delivery note, E-Way Bill, or match result ID not found |
| `MATCH_FAILED` | 409 | Matching algorithm could not complete | No delivery notes or E-Way Bills found for the invoice; insufficient data to produce a match |
| `OCR_FAILED` | 422 | OCR engine could not extract text from file | Unreadable scan, corrupted PDF, unsupported language, image resolution too low |
| `DUPLICATE_DETECTED` | 409 | A resource with the same unique key exists | Duplicate invoice number per vendor, duplicate GSTIN, duplicate E-Way Bill number |
| `RATE_LIMITED` | 429 | Request quota exceeded for the current window | Too many requests within the 15-minute window; too many sync operations |
| `UNAUTHORIZED` | 401 | Missing or invalid authentication token | Expired JWT, malformed Authorization header, invalid signature |
| `FORBIDDEN` | 403 | Authenticated but insufficient permissions | Cross-tenant access attempt, role lacks required scope |
| `INVALID_STATUS_TRANSITION` | 422 | Status change not allowed from current state | Attempting to set `MATCHED` on a `PENDING` invoice without running match |
| `FILE_TOO_LARGE` | 413 | Uploaded file exceeds size limit | File > 10MB (configurable via `express.json` limit) |
| `UNSUPPORTED_FILE_TYPE` | 400 | Uploaded file MIME type is not accepted | Uploading a `.exe` or `.zip` instead of PDF/JPG/PNG |
| `SYNC_IN_PROGRESS` | 429 | A sync operation is already running for this tenant | Concurrent `POST /api/v1/eway-bills/sync` requests |
| `INTERNAL_ERROR` | 500 | Unexpected server error | Database connection failure, unhandled exception, infrastructure issue |
| `DISCREPANCY_ALREADY_RESOLVED` | 409 | Attempt to resolve an already-resolved discrepancy | Double-submit on resolution form |
| `EXTERNAL_SERVICE_DOWN` | 502 | Dependent service (OCR, GST portal) unreachable | OCR engine timeout, GST API returns 5xx |
| `GATEWAY_TIMEOUT` | 504 | Upstream service took too long to respond | OCR processing > 30s, GST portal slow response |

### Error Code Hierarchy

```
Root
├── 4xx (Client Error)
│   ├── 400 — UNSUPPORTED_FILE_TYPE
│   ├── 401 — UNAUTHORIZED
│   ├── 403 — FORBIDDEN
│   ├── 404 — NOT_FOUND
│   ├── 409 — MATCH_FAILED, DUPLICATE_DETECTED, DISCREPANCY_ALREADY_RESOLVED
│   ├── 413 — FILE_TOO_LARGE
│   ├── 422 — VALIDATION_ERROR, OCR_FAILED, INVALID_STATUS_TRANSITION
│   └── 429 — RATE_LIMITED, SYNC_IN_PROGRESS
└── 5xx (Server Error)
    ├── 500 — INTERNAL_ERROR
    ├── 502 — EXTERNAL_SERVICE_DOWN
    └── 504 — GATEWAY_TIMEOUT
```

---

> **Document Version:** 1.0.0  
> **Change History:**
> | Date | Author | Changes |
> |------|--------|---------|
> | 2026-07-16 | Backend Architect | Initial draft — all route groups, events, webhooks, error codes |
