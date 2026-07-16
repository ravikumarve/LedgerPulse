# LedgerPulse — Product Roadmap

**Status:** Active
**Author:** Project Manager Agent
**Date:** 2026-07-16
**Version:** 2.0

---

## 1. North Star Metric

**₹ of leakage prevented per month.**

This single number captures whether LedgerPulse delivers value. Every feature — from OCR accuracy to matching precision to workflow speed — exists to increase this number. If a customer's ₹ of leakage prevented is not growing month-over-month, the platform is failing regardless of uptime, feature count, or UI polish.

**Supporting proxy metrics (leading indicators):**
- Auto-match rate (% of invoices achieving 3-way match without human intervention) — *target ≥92%*
- Days to discrepancy detection — *target ≤1 hour from ingestion*
- Discrepancy detection rate (% of line-item mismatches flagged) — *target ≥98%*
- Time saved per AP team per week — *target ≤4 hrs (from 40 hrs baseline)*

---

## 2. Phase Roadmap

### Phase 0 — Monorepo Scaffold (Done ✅)

| Deliverable | Status |
|---|---|
| Monorepo structure with npm workspaces (packages/backend + packages/frontend) | ✅ Complete |
| Prisma schema (Vendor, Invoice, DeliveryNote, EWayBill, MatchResult) | ✅ Complete |
| SQLite dev database with seed script (~10 sample vendors, 30 invoices + DNs + EWBs) | ✅ Complete |
| Express server with TypeScript, health endpoint (GET /api/health) | ✅ Complete |
| Frontend scaffold (React + TypeScript + Tailwind + Vite) with Dashboard + Invoices pages | ✅ Complete |
| Backend integration test (health check) + Frontend smoke test | ✅ Complete |
| ESLint + Prettier config, shared tsconfig | ✅ Complete |
| `.env.example`, `AGENTS.md`, `docs/` scaffolding | ✅ Complete |

**Files committed:** ~30
**Build status:** Backend ✅ 1/1 test | Frontend ✅ 1/1 test

---

### Phase 1 — Document Ingestion & OCR (Current — Weeks 1-3)

**Goal:** Documents enter the system. Data gets extracted.

#### Deliverables

| # | Item | Priority | Effort |
|---|---|---|---|
| 1.1 | Email ingestion service — IMAP listener per tenant with attachment extraction (.pdf, .jpg, .png, .heic) | P0 | 4 days |
| 1.2 | File upload API — drag-and-drop, batch upload (up to 20 files), multipart handling | P0 | 3 days |
| 1.3 | OCR pipeline — Tesseract.js integration for image/PDF text extraction | P0 | 5 days |
| 1.4 | Structured data extraction — header fields (vendor, date, total) + line items with confidence scoring | P0 | 5 days |
| 1.5 | Processing queue — document status tracking (pending/processing/done/failed) with progress indicator | P0 | 3 days |
| 1.6 | Manual entry fallback — inline correction UI for low-confidence OCR fields | P1 | 4 days |
| 1.7 | Duplicate detection — same vendor + invoice number within 30 days flagged for review | P1 | 2 days |
| 1.8 | Malformed file handling — clear user-facing errors for corrupt PDFs, unsupported formats | P1 | 1 day |

**Total estimated effort:** 22-24 person-days (3 weeks with 1-2 devs)
**Exit criteria:** 50 test invoices processed end-to-end with OCR accuracy ≥85% on header fields
**Risk:** OCR accuracy on handwritten quantities may be lower than expected — manual entry fallback is critical

---

### Phase 2 — 2-Way Matching Engine (Weeks 4-6)

**Goal:** Invoices talk to delivery notes. Discrepancies get caught.

#### Deliverables

| # | Item | Priority | Effort |
|---|---|---|---|
| 2.1 | Header-level matching — vendor name, date range (±7 days), total amount (±10% tolerance) | P0 | 3 days |
| 2.2 | Line-item matching — item code, quantity, unit price comparison with configurable tolerance | P0 | 5 days |
| 2.3 | Match scoring engine — 0.0-1.0 composite score with breakdown (INV↔DN, INV↔EWB, overall) | P0 | 4 days |
| 2.4 | Match result storage — full discrepancy JSON for audit trail, outcome classification (MATCHED/PARTIAL/MISMATCH) | P0 | 2 days |
| 2.5 | Discrepancy flagging — specific field conflicts surfaced with expected vs. actual values | P0 | 3 days |
| 2.6 | Auto-link suggestions — system proposes document groupings based on vendor, dates, amounts | P1 | 3 days |
| 2.7 | Basic discrepancy dashboard — list view of all exceptions with filters and sorting | P0 | 4 days |
| 2.8 | Re-trigger matching on document update (e.g., corrected OCR data) | P1 | 2 days |

**Total estimated effort:** 24-26 person-days (3 weeks with 1-2 devs)
**Exit criteria:** 100 invoices batch-matched in ≤60 seconds; auto-match rate ≥80% on clean documents
**Dependencies:** Phase 1 complete (documents must be in the system to match)

---

### Phase 3 — E-Way Bill / Tax Log Integration (Weeks 7-9)

**Goal:** Government tax data enters the picture. 3-way matching goes live.

#### Deliverables

| # | Item | Priority | Effort |
|---|---|---|---|
| 3.1 | NIC E-Way Bill API integration — sandbox + production with rate-limit awareness | P0 | 5 days |
| 3.2 | E-Way Bill auto-fetch — by EWB number, bulk by date range, auto-link to invoice | P0 | 3 days |
| 3.3 | 3-way matching engine — INV + DN + EWB full reconciliation at header and line-item level | P0 | 5 days |
| 3.4 | E-Way Bill expiry tracking — alerts for bills expiring within 24 hours for in-transit shipments | P1 | 2 days |
| 3.5 | Compliance alerts — tax value mismatch, GSTIN mismatch, zero-tax-on-taxable-value flags | P0 | 3 days |
| 3.6 | Tax mismatch detection — ITC-blocking mismatches flagged with severity rating (high/medium/low) | P0 | 3 days |
| 3.7 | E-Way Bill data caching — raw JSON stored in EWayBill.rawData for full audit trail | P1 | 1 day |

**Total estimated effort:** 20-22 person-days (3 weeks with 1-2 devs)
**Exit criteria:** 3-way auto-match rate ≥75%; tax mismatch detection with zero false negatives on test data
**Risk:** NIC E-Way Bill API sandbox access may require GSTIN registration — build API mock as fallback

---

### Phase 4 — Discrepancy Dashboard & Approval Workflow (Weeks 10-12)

**Goal:** Users manage exceptions. Approvals happen fast. Disputes get drafted.

#### Deliverables

| # | Item | Priority | Effort |
|---|---|---|---|
| 4.1 | Full discrepancy management UI — ranked by severity + financial impact, drill-down side-by-side comparison | P0 | 5 days |
| 4.2 | Multi-level approval workflow — auto-approve (≥0.95), manager review (0.70-0.94), hold & dispute (<0.70) | P0 | 4 days |
| 4.3 | Configurable approval thresholds — per-tenant ₹ limits for each role tier | P1 | 2 days |
| 4.4 | Bulk actions — select-and-approve, select-and-flag, batch routing | P0 | 2 days |
| 4.5 | Dispute draft generator — one-click PDF with line-item conflicts, company branding | P1 | 4 days |
| 4.6 | Email notifications — discrepancy alerts, approval requests, held-invoice vendor notifications | P0 | 3 days |
| 4.7 | Audit log viewer — timestamped, user-stamped action trail for every invoice | P0 | 2 days |
| 4.8 | Export discrepancy report — CSV + PDF with one click | P1 | 2 days |
| 4.9 | Monthly leakage report — auto-generated on 1st, MoM/QoQ trend analysis | P1 | 3 days |

**Total estimated effort:** 25-27 person-days (3 weeks with 1-2 devs)
**Exit criteria:** AP team can review 50 discrepancies in <30 minutes; dispute letter generated in 1 click
**Dependencies:** Phase 2 + Phase 3 (matching must be operational)

---

### Phase 5 — Auth, Multi-Tenant & Billing (Weeks 13-16)

**Goal:** Secure, isolated, monetizable.

#### Deliverables

| # | Item | Priority | Effort |
|---|---|---|---|
| 5.1 | JWT authentication — login, signup, password reset, refresh tokens | P0 | 4 days |
| 5.2 | Multi-tenant data isolation — shared database with tenant_id column (row-level security) | P0 | 4 days |
| 5.3 | Role-based access — Admin, Viewer, Approver roles with per-route authorization middleware | P0 | 3 days |
| 5.4 | Tenant onboarding flow — signup wizard, email verification, initial configuration | P1 | 3 days |
| 5.5 | Gumroad/LemonSqueezy integration — subscription management, webhook handling | P0 | 5 days |
| 5.6 | Usage-based pricing — tiered plans (Starter/Pro/Enterprise) based on monthly invoice volume | P0 | 3 days |
| 5.7 | Billing portal — plan selection, invoice history, payment method management | P1 | 4 days |
| 5.8 | Tenant settings — configurable match tolerance, approval thresholds, email templates | P1 | 3 days |

**Total estimated effort:** 27-29 person-days (4 weeks with 1-2 devs)
**Exit criteria:** 3 tenants with isolated data; subscription flow from signup to paid plan complete
**Risk:** Multi-tenant migration requires careful data seeding — design isolation from Phase 0 to avoid painful backfill

---

### Phase 6 — Production Readiness & Launch (Weeks 17-20)

**Goal:** Ship it. Keep it running. Sell it.

#### Deliverables

| # | Item | Priority | Effort |
|---|---|---|---|
| 6.1 | Docker Compose — backend, frontend, PostgreSQL, Redis services | P0 | 3 days |
| 6.2 | CI/CD pipeline — GitHub Actions: lint → test → build → deploy | P0 | 3 days |
| 6.3 | Railway/Fly.io deployment guide — step-by-step with IaC templates | P0 | 3 days |
| 6.4 | Performance optimization — query tuning, indexing strategy, N+1 elimination | P0 | 5 days |
| 6.5 | Documentation — user guide, API reference (OpenAPI), deployment guide, troubleshooting | P0 | 4 days |
| 6.6 | Security audit — dependency scan, auth penetration test, secrets review | P1 | 3 days |
| 6.7 | Monitoring & alerting — uptime monitoring, error tracking, OCR failure alerts | P1 | 3 days |
| 6.8 | Public launch — landing page, changelog, pricing page, waitlist → GA conversion | P0 | 4 days |

**Total estimated effort:** 26-28 person-days (4 weeks with 1-2 devs)
**Exit criteria:** 5 paid customers in month 1, 20 by month 3; platform uptime ≥99.5%

---

## 3. Feature Prioritization

| Now (Phase 1-2) | Next (Phase 3-4) | Later (Phase 5-6 + Post-GA) |
|---|---|---|
| Email ingestion (IMAP) | E-Way Bill API integration | WhatsApp bridge for delivery photos |
| File upload API (drag & drop) | 3-way matching engine | Public API + webhooks |
| OCR pipeline (Tesseract.js) | Compliance & tax mismatch alerts | Advanced analytics / leakage trends |
| Structured data extraction | Full discrepancy dashboard | Mobile-native PWA enhancements |
| Manual OCR correction | Multi-level approval workflow | AI anomaly detection beyond matching |
| 2-way matching (INV↔DN) | Dispute draft generator | Enterprise SSO (SAML/SCIM) |
| Match scoring & discrepancy flagging | Email notifications | Multi-language OCR (Tamil, Telugu, etc.) |
| Basic discrepancy list view | Audit log viewer | Contract lifecycle management integration |
| JWT auth | Multi-tenant isolation | Automated E-Way Bill extension filing |
| Role-based access (3 roles) | Gumroad/LemonSqueezy billing | Supplier self-service portal |
| — | Docker Compose + CI/CD | Mobile native apps (iOS/Android) |

---

## 4. What We're NOT Building

| Feature | Reason for Exclusion | Future Possibility |
|---|---|---|
| **Payment execution** (bank transfers, cheques, payment gateways) | LedgerPulse produces an approved payables list. Actual payment execution lives in the customer's ERP/banking system. Mixing reconciliation with payment creates regulatory complexity (PCI compliance, banking licenses). | Read-only integration to show "paid" status from bank feeds |
| **Procurement / PO management** | Purchase orders, RFQs, vendor negotiation, and contract lifecycle are upstream processes. LedgerPulse reads contract baseline prices but does not manage procurement. | Bidirectional ERP sync (read POs, write match results) |
| **Full ERP replacement** | General ledger, inventory management, fixed assets, payroll — all out of scope. LedgerPulse is a reconciliation layer, not an ERP. | Pre-built connectors for Zoho Books, QuickBooks, Tally |
| **Blockchain / distributed ledger** | Zero customer demand. Adds complexity without proportional value for a matching engine. All reconciliation is server-side deterministic. | Revisit if enterprise compliance mandates immutable audit trails |
| **Mobile native apps** | v1 is responsive web with phone-camera upload via browser. Native apps add 2x dev cost for marginal UX gain at this stage. | Post-GA if user research shows strong mobile-first usage |
| **AI fraud detection beyond matching** | Anomaly detection, vendor collusion rings, and ML fraud models are powerful but require large datasets and dedicated ML infra. Premature for v1. | Phase 7+ after 6+ months of production match data |
| **Self-service SSO (SAML/SCIM)** | Enterprise SSO is critical for top-down sales but adds significant implementation complexity. Email+password + magic-link is sufficient for initial 10-50 tenants. | Phase 7 or when first enterprise customer requires it |
| **Public developer API** | v1 exposes internal APIs for the frontend only. Public API requires rate limiting, documentation, SDKs, and support burden. | Phase 7 — unlocks third-party integrations and embedded reselling |

---

## 5. Open Questions & Risks

### Open Questions

| # | Question | Decision Needed By | Recommended Direction |
|---|---|---|---|
| 1 | **OCR approach:** Self-hosted (Tesseract.js + custom layout model) vs. API-based (Google Document AI, Azure Form Recognizer)? | End of Week 1, Phase 1 | Start with Tesseract.js for cost control; migrate to API service if accuracy <85% after tuning |
| 2 | **Email architecture:** Dedicated inbox per tenant vs. shared inbox with subject-line parsing? | End of Week 1, Phase 1 | Dedicated inboxes (sendgrid inbound parsing + per-tenant email routing) — cleaner isolation, better UX |
| 3 | **E-Way Bill API access:** Do we have sandbox credentials? Build API mock? | Start of Phase 3 | Build a lightweight API mock immediately for dev; real integration once sandbox access confirmed |
| 4 | **Matching tolerances:** Default quantity (±2%), unit price (±5%), total (±1%)? Configurable per supplier? | Start of Phase 2 | Start with conservative defaults; expose per-tenant configuration in Phase 5 |
| 5 | **Multi-tenant isolation:** Database-per-tenant vs. shared database with tenant_id column? | Before Phase 5 development starts | Shared database with tenant_id — simpler ops, sufficient for 10-50 tenants |
| 6 | **WhatsApp bridge priority:** Launch blocker (P0) or post-launch enhancement (P1)? | During Phase 1 alpha testing | Current Phase 4 placement assumes P1 — confirm with alpha testers |
| 7 | **Pricing model:** Per-document, flat monthly, or tiered? | Before Phase 5 billing development | Tiered volume-based (₹X/month for N invoices) — aligns with value delivered |
| 8 | **Contract baseline source:** How do contracted unit prices enter the system? | Start of Phase 2 | v1: manual spreadsheet upload + CSV parse. v2: ERP sync. |
| 9 | **GSTIN validation:** Include regex validation on vendor creation? | Phase 1 vendor model work | Yes — lightweight regex has high compliance ROI for minimal effort |
| 10 | **Audit export format:** CSV, PDF, XLSX? | Phase 4 | Minimum: CSV (data) + PDF (audit submission). XLSX as stretch goal. |

### Key Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **OCR accuracy on handwritten documents <70%** | High | High | Invest in preprocessing (deskew, contrast, binarization) before OCR. Manual entry fallback is not optional — build it early (Phase 1.6). |
| **NIC E-Way Bill API unreliable or rate-limited** | Medium | High | Build API mock for dev + CI. Implement exponential backoff, queue retries, and health monitoring. Surface API status on dashboard. |
| **Multi-tenant data isolation breach** | Low | Critical | tenant_id on every query via middleware. Enforce in Prisma middleware or repository layer. Penetration test before launch. |
| **Low auto-match rate in production (<70%)** | Medium | High | Configurable tolerances, manual override paths, and continuous feedback loop from corrected matches to tune algorithm. |
| **GST compliance complexity — edge cases surface post-launch** | Medium | Medium | Partner with a CA/tax consultant for beta testing. Build flexible rule engine rather than hardcoded logic. |
| **Single dev bottleneck (Ravi is solo)** | High | High | Prioritize ruthlessly. Use Phase 0 scaffold quality to reduce rework. Consider no-code tools for landing page/docs. |
| **Customer acquisition — enterprises move slowly** | Medium | High | Target 5-10 alpha/beta testers during Phase 1-3 to shorten sales cycle. Land-and-expand: start with one plant, sell the group. |

---

## 6. Timeline Summary

```
Phase 0 ── (Done) ─────────────────────────────────────────────── ✅
Phase 1 ── (Now)  Weeks 1-3   ●━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ○
Phase 2 ──         Weeks 4-6   ○━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ○
Phase 3 ──         Weeks 7-9   ○━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ○
Phase 4 ──         Weeks 10-12 ○━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ○
Phase 5 ──         Weeks 13-16 ○━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ○
Phase 6 ──         Weeks 17-20 ○━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ●
                    Launch ──── Week 20 🚀
```

**Estimated total time to GA:** 20 weeks (~5 months)
**Estimated total engineering effort:** ~145 person-days (solo dev = 29 weeks with buffer)
**Buffer built in:** Phase 5-6 have 4 weeks each for 3 weeks of work — accounts for bug fixes, feedback loops, and the unpredictability of billing + production operations.

---

*Last updated: 2026-07-16*
*Next review: End of Phase 1 or when significant new information changes scope*
