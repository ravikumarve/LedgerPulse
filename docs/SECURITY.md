# LedgerPulse — Security Architecture Document

> **Classification:** Internal — Security Engineering
> **Version:** 1.0.0
> **Author:** Security Engineer Agent 🔒
> **Last Updated:** 2026-07-16

---

## Table of Contents

1. [Threat Model (STRIDE)](#1-threat-model-stride)
2. [Authentication & Authorization](#2-authentication--authorization)
3. [OWASP Top 10 Mitigations](#3-owasp-top-10-mitigations)
4. [API Security](#4-api-security)
5. [Data Security](#5-data-security)
6. [Secure Development Practices](#6-secure-development-practices)
7. [Incident Response Plan](#7-incident-response-plan)
8. [Compliance Considerations](#8-compliance-considerations)
9. [Secrets & Configuration Security](#9-secrets--configuration-security)
10. [Security Checklist](#10-security-checklist)

---

## 1. Threat Model (STRIDE)

| Threat | Component Affected | Risk | Mitigation |
|---|---|---|---|
| **Spoofing** | Auth system (JWT tokens, API keys) | **High** | JWT with RS256 signing, MFA for admin accounts, API key rotation policy |
| **Tampering** | API requests / Document uploads | **High** | HTTPS enforced (TLS 1.3), request body signing for webhooks, Zod input validation, multer file-type checks |
| **Repudiation** | Match actions / Approval workflow | **Medium** | Immutable audit log for all Create/Update/Delete on MatchResult, Invoice status changes; reviewedBy + reviewedAt fields on MatchResult |
| **Information Disclosure** | User data / Financial documents | **High** | Encryption at rest (AES-256 via SQLite encryption extension or Postgres TDE); encryption in transit (TLS 1.3); PII fields stripped from API responses where unnecessary |
| **Denial of Service** | API endpoints | **Medium** | Rate limiting (100 req/15min per IP), payload size limits (10mb), Prisma connection pooling |
| **Elevation of Privilege** | Multi-tenant data access | **High** | Tenant-scoped queries via `tenantId` filter in every Prisma query; RBAC middleware that validates user role before any mutation |

### STRIDE Per-Actor

| Actor | Primary Threats |
|---|---|
| **Unauthenticated User** | Spoofing, DoS, Tampering |
| **Viewer (read-only)** | Information Disclosure (horizontal privilege escalation to other tenants) |
| **Approver** | Elevation of Privilege, Repudiation (false approvals) |
| **Admin** | Repudiation, Information Disclosure (insider threat) |
| **External Integrator (API key)** | Spoofing, Tampering (replay attacks) |

---

## 2. Authentication & Authorization

### 2.1 JWT-Based Auth Flow

```
┌─────────┐         ┌──────────────┐         ┌──────────┐
│ Client  │ ──POST──▶  /auth/login  │ ──verify──▶  DB      │
│         │ ◀──JWT───  (email+pass)  │           (bcrypt)  │
└─────────┘         └──────────────┘         └──────────┘
     │                                            │
     │  ┌──────────────────────────────────────────┘
     │  ▼
     │  Access Token (RS256, 15min TTL)
     │  Refresh Token (HTTP-only cookie, 7d TTL)
     ▼
┌──────────────┐
│  /api/*      │ ──▶ auth middleware validates JWT
└──────────────┘
```

- **Token Type:** RS256 (asymmetric) — private key signs, public key verifies
- **Access Token TTL:** 15 minutes
- **Refresh Token TTL:** 7 days, stored as HttpOnly + Secure + SameSite=Strict cookie
- **Rotation Policy:** Refresh token rotated on every use; old refresh token invalidated (prevents replay)
- **Issuer:** `ledgerpulse-api`
- **Audience:** `ledgerpulse-app`

### 2.2 Token Validation Middleware (proposed)

```typescript
// middleware/auth.ts
interface JwtPayload {
  sub: string;          // userId
  tenantId: string;
  role: 'admin' | 'approver' | 'viewer';
  iat: number;
  exp: number;
}
```

Every route except `/auth/login`, `/auth/register`, `/api/health`, and `/webhooks/*` requires a valid JWT.

### 2.3 Password Hashing

- **Algorithm:** bcrypt
- **Cost Factor:** 12 (≈250ms per hash on modern hardware)
- **Password Minimum Length:** 8 characters
- **Rate Limiting on Login:** 5 attempts per email per 15 minutes (mitigates brute force)

### 2.4 Multi-Tenant Data Isolation

- **Strategy:** Shared database, row-level isolation via `tenantId` column on every data model
- **Enforcement:** Prisma middleware that **always** appends `where: { tenantId: currentTenant }` to every query
- **Audit:** Any query missing a `tenantId` filter is logged and rejected in production

### 2.5 Role-Based Access Control (RBAC)

| Role | Permissions |
|---|---|
| **Admin** | Full CRUD on all resources, user management, system configuration |
| **Approver** | Read all documents, approve/reject match results, add review comments |
| **Viewer** | Read-only access to dashboards, documents, and match results |

Implementation: Express middleware that reads `req.user.role` and checks against a route-level permission map:

```typescript
const permit = (...roles: string[]) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: "Insufficient permissions" });
  }
  next();
};

// Usage
router.delete("/invoices/:id", permit("admin"), deleteInvoice);
```

### 2.6 API Key Authentication (Webhooks/Integrations)

- **Key Format:** `lp_` prefix + 32 bytes of cryptographically random data, hex-encoded (total 66 chars)
- **Storage:** SHA-256 hash stored in DB; raw key shown once at creation
- **Scoping:** API keys are tied to a tenant and an optional role subset
- **Rotation:** Keys expired every 90 days; max 5 active keys per tenant

---

## 3. OWASP Top 10 Mitigations

| # | Risk | LedgerPulse Mitigation |
|---|---|---|
| **A01** | **Broken Access Control** | RBAC middleware on every protected route; tenant-scoped Prisma queries; no IDOR — all resource IDs checked against `req.user.tenantId` |
| **A02** | **Cryptographic Failures** | TLS 1.3 enforced in production; bcrypt(12) for passwords; JWT signed with RS256; no homegrown crypto |
| **A03** | **Injection** | All SQL queries go through Prisma (parameterized queries); no raw SQL in application code; file uploads validated by `mime-type` + magic bytes |
| **A04** | **Insecure Design** | Threat model baked into sprint planning; rate limiting by design; secure defaults (Helmet, strict CORS); no debug endpoints in prod |
| **A05** | **Security Misconfiguration** | Centralized config via `config.ts` (not scattered `process.env` calls); schema validation of env vars at startup (zod); CORS whitelist must be explicit |
| **A06** | **Vulnerable Components** | `npm audit` in CI pipeline; Dependabot auto-PR for critical vulnerabilities; `engines` field in package.json enforces Node LTS |
| **A07** | **Authentication Failures** | Account lockout after 5 failed attempts; MFA ready for admin tier; refresh token rotation prevents session fixation |
| **A08** | **Data Integrity Failures** | MatchResult has `reviewedBy` + `reviewedAt` for non-repudiation; document status transitions are enumerated (state machine); webhook payloads signed with HMAC |
| **A09** | **Logging & Monitoring Failures** | All financial mutations logged (who, what, when); structured JSON logging with correlation IDs; alerts on PII access patterns |
| **A10** | **SSRF** | Outbound HTTP requests restricted to allowlist (e.g., E-Way Bill API); URL validation rejects private IP ranges (127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16) |

---

## 4. API Security

### 4.1 Input Validation

- **Library:** Zod
- **Enforcement:** Every request body/query/params validated at the route handler boundary
- **Pattern:**
  ```typescript
  const createInvoiceSchema = z.object({
    vendorId: z.string().uuid(),
    invoiceNumber: z.string().min(1).max(50),
    totalAmount: z.number().positive(),
    taxAmount: z.number().nonnegative().optional(),
  });
  ```
- **Rejection:** Invalid requests return `400` with structured error messages (no stack traces)

### 4.2 Rate Limiting

```typescript
// Configured in index.ts
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 100,                   // 100 requests per window
  standardHeaders: true,      // Return RateLimit-* headers
  legacyHeaders: false,
}));
```

Stricter limits for auth endpoints:
- `/api/auth/login`: 5 req/15min per IP
- `/api/auth/register`: 3 req/60min per IP

### 4.3 CORS Policy

```typescript
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(",") ?? ["http://localhost:5173"],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  maxAge: 600,  // Preflight cache: 10 min
}));
```

- Production origins must be an explicit allowlist (no wildcards)
- Disabled on `/webhooks/*` (called by external services without browser context)

### 4.4 Security Headers (Helmet.js)

```typescript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],  // Tailwind requires inline styles
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'", process.env.API_URL],
    },
  },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
}));
```

### 4.5 Request Size Limits

```typescript
// JSON bodies
app.use(express.json({ limit: "10mb" }));

// File uploads (multer)
export const upload = multer({
  storage: diskStorage,
  limits: { fileSize: 10 * 1024 * 1024 },  // 10 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ["application/pdf", "image/jpeg", "image/png"];
    cb(null, allowed.includes(file.mimetype));
  },
});
```

### 4.6 SQL Injection Prevention

All database queries go through **Prisma ORM**, which uses parameterized queries. Raw SQL is **never** used in application code (the single `$queryRaw\`SELECT 1\`` in `health.ts` is a safe literal with no user input, but should be replaced with `prisma.$queryRawUnsafe` only after input sanitization). Prisma's query engine automatically escapes all interpolated values.

---

## 5. Data Security

### 5.1 Encryption at Rest

| Data Store | Encryption Method |
|---|---|
| **SQLite (dev)** | SQLite Encryption Extension (SEE) or `sqlcipher` — AES-256 |
| **PostgreSQL (prod)** | Transparent Data Encryption (TDE) at storage layer + `pgcrypto` column-level encryption for PII |
| **Uploaded Documents** | AES-256-GCM before writing to disk/object storage; keys stored in env vars or cloud KMS |
| **Backups** | GPG-encrypted with a separate backup key |

### 5.2 Encryption in Transit

- **TLS Version:** 1.3 minimum (TLS 1.2 fallback rejected)
- **Certificate:** Let's Encrypt or commercial CA, auto-renewed
- **Cipher Suites:** `TLS_AES_256_GCM_SHA384` and `TLS_CHACHA20_POLY1305_SHA256` only
- **HSTS:** `max-age=31536000; includeSubDomains; preload`

### 5.3 Secrets Management

- **Never in code:** Secrets live in `.env` (local), environment variables (production), or a cloud secrets manager (AWS Secrets Manager / HashiCorp Vault)
- **`.env` is in `.gitignore`** — confirmed by project conventions
- **Validation:** All required env vars are validated at startup with a Zod schema:

```typescript
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  CORS_ORIGIN: z.string().optional(),
});
```

### 5.4 PII Data Handling

| Field | Classification | Handling |
|---|---|---|
| Vendor GSTIN | Sensitive | Encrypted at rest; masked in logs (`XX1234XX5678`) |
| Vendor Email | Personal | Encrypted at rest; not exposed in list APIs unless admin |
| Vendor Phone | Personal | Encrypted at rest; masked in UI (`+91-XXXX-XX-7890`) |
| Invoice Line Items | Business Confidential | Encrypted at rest; access logged |
| E-Way Bill Data | Regulatory | Immutable after ingestion; audited trail |
| File Paths | Internal | Stored as relative paths; full paths never exposed to client |

### 5.5 Document/File Storage Security

- **Storage Backend:** Local filesystem (dev) → S3-compatible object storage (prod) with server-side encryption
- **Access Control:** Files served through the API only (no direct URL access); auth middleware validates permissions before streaming
- **Virus Scanning:** Uploaded files scanned with ClamAV before OCR processing (Phase 1+)
- **Retention Policy:** Documents retained per GST compliance (8 years for India); automated archival after 2 years of inactivity

---

## 6. Secure Development Practices

### 6.1 Dependency Scanning

- **Command:** `npm audit` runs in CI pipeline; builds fail on critical/high severities
- **Frequency:** On every push to `main` and before every release
- **Tooling:** Dependabot enabled on GitHub (auto-PR for patch updates); `npm audit` in CI gate
- **Policy:** Zero critical vulnerabilities allowed in production; high vulnerabilities must have documented exceptions

### 6.2 Static Application Security Testing (SAST)

| Tool | Scope | Trigger |
|---|---|---|
| **ESLint** (`eslint-plugin-security`) | Detect unsafe patterns (`eval`, `innerHTML`, RegExp DoS) | `npm run lint` in CI |
| **TypeScript strict mode** | Prevent type confusion, null dereferences | Compilation step |
| **gitleaks** / `git-secrets` | Prevent secrets from being committed | Pre-commit hook + CI scan |

### 6.3 Code Review Requirements

- **Security-sensitive changes require a separate security review:**
  - Auth/authorization logic
  - Any route handling financial data or PII
  - Multi-tenant data isolation changes
  - File upload/download handling
  - Any use of `eval()`, `exec()`, or dynamic imports
- **Review checklist** includes: "Does this change introduce a new data flow? Does it touch tenant isolation? Does it log PII?"

### 6.4 Security Testing Gates

| Gate | Requirement |
|---|---|
| **Unit Tests** | All auth middleware tested (valid token, expired token, wrong role, missing token) |
| **Integration Tests** | Tenant isolation tested: Tenant A cannot access Tenant B's data |
| **Pre-Release** | Full `npm audit` pass; dependency diff reviewed; SAST scan clean |
| **Penetration Testing** | Annual third-party pentest (or bug bounty program for high-signal projects) |

---

## 7. Incident Response Plan

### 7.1 Process Flow

```
Detection ──▶ Containment ──▶ Eradication ──▶ Recovery ──▶ Post-mortem
    │              │               │               │              │
    ▼              ▼               ▼               ▼              ▼
 Alert         Isolate          Remove         Restore        RCA doc
 escalate      block IP        patch vuln     rotate keys    update playbook
```

### 7.2 Severity Definitions

| Severity | Definition | Response Time | Escalation |
|---|---|---|---|
| **Critical** | Data breach, auth bypass, tenant isolation broken | <15 min | Founder + Security Lead |
| **High** | DoS, XSS, CSRF, data integrity issue | <1 hour | Engineering Lead |
| **Medium** | Rate limiting bypass, info leakage (non-PII) | <1 day | Team lead |
| **Low** | Missing security header, verbose error messages | <1 week | Backlog |

### 7.3 Escalation Tree

```
Incident Reporter
       │
       ▼
On-Call Engineer (primary: +XX-XXXX-XXXXXX)
       │
       ▼
Security Lead (secondary: +XX-XXXX-XXXXXX)
       │
       ▼
Founder / CTO (tertiary)
```

> **Note:** Contact details are maintained in a private incident response runbook (not in this repository).

### 7.4 Data Breach Notification Procedure

1. **Verify** — Confirm the breach is real (not a false alarm from monitoring)
2. **Contain** — Revoke compromised tokens, rotate secrets, block affected IPs
3. **Assess** — Determine scope: What data? How many users? Which tenants?
4. **Notify** — Affected users within 72 hours (GDPR mandate); include what happened, what data was involved, and steps taken
5. **Regulatory** — Report to relevant authority (ICO for UK, DPA for EU, CERT-In for India) per applicable law
6. **Document** — Full post-mortem within 5 business days; update playbook

---

## 8. Compliance Considerations

### 8.1 GDPR (EU Customers)

- **Data Processing Agreement (DPA):** Required before any EU customer data is stored
- **Right to Erasure:** API endpoint to delete a user and all associated data (with exception for tax-relevant documents that must be retained per local law — these are anonymized instead)
- **Data Portability:** Export endpoint returns all user data in JSON format
- **Consent Records:** User consent for data processing stored alongside user record
- **Data Classification:** PII fields identified and tagged in Prisma schema comments

### 8.2 Indian IT Act / GST Compliance

- **E-Way Bill Data Retention:** 8 years from the financial year end (mandated by GST Council)
- **Data Localization:** GST data must reside on servers within India. If deploying on cloud, select India-region data centers (ap-south-1 for AWS, asia-south1 for GCP)
- **Audit Trail:** Every match result and document status change must have an immutable audit log with timestamps
- **Cryptography:** Use only government-approved cryptographic algorithms (AES-256, SHA-256 are compliant)
- **Reported Breaches:** Under Indian IT Act Section 43A, any breach of "sensitive personal data" must be reported to CERT-In within 6 hours

### 8.3 SOC 2 Considerations

- **Control Categories:** Security, Availability, Processing Integrity
- **CCF (Common Criteria Framework) mappings:**
  - CC6.1: Logical and physical access controls
  - CC7.1: Monitoring and detection
  - CC7.2: Incident response
  - CC7.3: Risk mitigation
- **Required for Enterprise Tier:** Independent auditor SOC 2 Type II report; annual re-certification
- **Current State:** LedgerPulse architecture is designed to align with SOC 2 principles but has not been formally audited

---

## 9. Secrets & Configuration Security

### 9.1 `.env` File Management

- **Never committed:** `.env` is in `.gitignore` (confirmed in project conventions)
- **Template:** `.env.example` documents all required variables with safe defaults
- **Production:** Environment variables injected via deployment platform (Railway/Fly.io UI, Docker secrets, or cloud KMS)

### 9.2 Pre-Commit Secret Scanning

```bash
# Install gitleaks locally
# Run before every commit
gitleaks detect --source . --verbose
```

- **CI Integration:** GitHub Action that runs gitleaks on every push
- **Blocked Patterns:** AWS keys, GitHub tokens, JWT secrets, database URLs with passwords, private SSH keys
- **Custom Rules:** `.gitleaks.toml` defines LedgerPulse-specific patterns (e.g., `lp_` API keys, `lp_` prefix tokens)

### 9.3 Environment Variable Validation

All env vars are validated at server startup via a Zod schema. The server **refuses to start** if any required variable is missing or invalid:

```typescript
// src/config.ts
import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_REFRESH_SECRET: z.string().min(32).optional(),
  CORS_ORIGIN: z.string().optional(),
  OCR_PROVIDER: z.enum(["tesseract", "easyocr", "cloud"]).optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
```

---

## 10. Security Checklist

> Pre-deployment checklist — all items MUST be verified before production launch.

### Critical (Blocking)

- [ ] **Disable debug endpoints** — Remove `/api/debug/*`; ensure `NODE_ENV=production` disables verbose error messages (already implemented in `index.ts:43`)
- [ ] **Enable rate limiting on all routes** — Already implemented (100 req/15min); verify auth endpoints have stricter limits (5 req/15min for login)
- [ ] **Set secure cookie flags** — Refresh tokens: `HttpOnly`, `Secure`, `SameSite=Strict`; no cookies sent over HTTP
- [ ] **Run `npm audit`** — Resolve all critical and high vulnerabilities before deployment
- [ ] **Enable audit logging** — All financial operations (match approvals, document status changes, invoice deletions) logged with `actor`, `action`, `resourceId`, `timestamp`
- [ ] **Validate CORS origins** — No wildcard origins in production; must be explicit allowlist
- [ ] **Rotate default secrets** — `JWT_SECRET=change-me-to-a-random-string` must be replaced (min 32 chars, cryptographically random)
- [ ] **Set HSTS preload** — Submit domain to [hstspreload.org](https://hstspreload.org) after TLS verification

### High Priority

- [ ] **Run SAST scan** — ESLint + `eslint-plugin-security` pass with zero errors
- [ ] **Run gitleaks scan** — No secrets leaked in repository history
- [ ] **Verify tenant isolation** — Integration test: Tenant A API key cannot access Tenant B data
- [ ] **Test rate limiting** — Send 101 requests in 15 minutes; verify 429 response on 101st
- [ ] **Test file upload limits** — Verify 10mb limit enforced; verify non-PDF/JPEG/PNG rejected
- [ ] **Verify Prisma parameterized queries** — No `$queryRawUnsafe` with user input in codebase
- [ ] **Enable helmet CSP** — Test all frontend routes with production CSP; adjust if necessary for Tailwind inline styles

### Medium Priority

- [ ] **Set up Dependabot** — Enable for `packages/backend` and `packages/frontend`
- [ ] **Add `engines` field** — `package.json` should specify `"node": ">=20.0.0"`
- [ ] **Configure structured logging** — Replace `console.log` with pino/winston; add correlation IDs
- [ ] **Set up backup encryption** — Backups encrypted with GPG before leaving the server
- [ ] **Document incident response contacts** — Populate the escalation tree with real phone numbers
- [ ] **Add `security.md`** — GitHub `SECURITY.md` for vulnerability disclosure policy

### Pre-Launch Verification

- [ ] All API routes tested for: missing auth → 401, wrong role → 403, expired token → 401
- [ ] No sensitive data in API responses (passwords, token hashes, database URLs)
- [ ] File upload path traversal tested (e.g., `../../etc/passwd` in filename)
- [ ] Refresh token rotation verified (using old refresh token returns error)
- [ ] Account lockout after 5 failed login attempts verified
- [ ] Database connection string does not contain credentials in logs

---

## Appendix A: Security-Related Code References

| File | Purpose |
|---|---|
| `packages/backend/src/index.ts` | Helmet, CORS, rate limiting, JSON size limit |
| `packages/backend/src/middleware/auth.ts` | JWT verification + RBAC (Phase 5) |
| `packages/backend/src/config.ts` | Env var validation |
| `packages/backend/src/routes/health.ts` | Safe `$queryRaw` usage |
| `packages/backend/prisma/schema.prisma` | Data model with tenant isolation fields |
| `.env.example` | Documented env vars |

## Appendix B: Security Dependencies

| Package | Version | Purpose |
|---|---|---|
| `helmet` | ^8.0.0 | Security headers |
| `cors` | ^2.8.5 | Cross-origin control |
| `express-rate-limit` | ^7.4.0 | Rate limiting |
| `zod` | ^3.23.0 | Input validation |
| `multer` | ^1.4.5-lts.1 | File upload handling |
| `bcrypt` | (to add) | Password hashing |
| `jsonwebtoken` | (to add) | JWT signing/verification |
