# LedgerPulse — Product Requirements Document

**Status:** Draft v1.0
**Author:** Product Manager Agent
**Date:** 2026-07-16
**Version:** 1.0

---

## 1. Problem Statement

Supply chain finance teams at mid-to-large industrial manufacturers and regional distributors operate in a state of chronic information asymmetry. Every procurement cycle produces three independent records of the same transaction: a vendor invoice, a physical delivery/weighbridge note, and a government E-Way Bill tax log. These three documents arrive through different channels (email, physical copies, government API portals), at different times, and in different formats. There is no native system that cross-references them.

The operational cost of this fragmentation is severe:

- **Financial leakage:** Suppliers over-invoice by inflating quantities or unit prices, knowing manual checks miss 30–40% of line-item discrepancies. A mid-size manufacturer processing ₹5Cr/month in payables loses ₹50K–₹2L+ monthly to undetected overpayments.
- **Tax credit leakage:** Mismatches between E-Way Bill values and invoice values block input tax credit (ITC) claims under GST. Finance teams discover this months later during audit, at which point the credit window may have lapsed.
- **Wasted labour:** Accounts payable teams spend 30–40 hours per week manually matching invoices to delivery notes and tax logs — photocopying, spreadsheeting, emailing suppliers for clarification. This is soul-crushing, error-prone busywork.
- **Vendor relationship strain:** Discrepancies are discovered weeks late, leading to retroactive disputes, delayed payments, and trust erosion with suppliers.
- **Audit exposure:** Without a unified reconciliation trail, companies fail GST audits, incurring penalties, interest, and reputational damage.

**The core insight:** The three sources of truth already exist. The problem is not missing data — it's that no system bridges the physical-to-digital gap and cross-references them automatically before payment is released.

---

## 2. Target Market & User Personas

### Primary Market
Mid-to-large industrial manufacturers and regional distributors in India (and other GST/EWay-Bill-enabled jurisdictions), processing 500–5,000 invoices/month, with annual turnover ₹50Cr–₹500Cr.

### Personas

#### Persona 1: Rajesh — Operations Manager, Mid-Size Manufacturing Plant

- **Age:** 38
- **Background:** BE Mechanical, 12 years in plant operations. Manages goods receipt, weighbridge, and logistics coordination.
- **Daily pain:** He receives 30–50 delivery notes daily — photocopies from the weighbridge, handwritten annotations, blurred phone photos from the gate. He spends 2+ hours per day manually logging these into a shared spreadsheet. He has no way to know if the delivery matches what was invoiced until Accounts calls him 2 weeks later.
- **What success looks like:** Snap a photo of a delivery note from his phone, have it OCR'd and matched to the invoice + E-Way Bill automatically. Get a green/red indicator instantly. No more spreadsheet drudgery.
- **Quote:** *"I spend more time typing numbers into Excel than managing the actual floor. If this can save me even one hour a day, I'll champion it myself."*

#### Persona 2: Priya — Accounts Payable Lead, Regional Distribution Company

- **Age:** 32
- **Background:** CA Inter, 8 years in AP. Manages a team of 4 processing ~800 invoices/month.
- **Daily pain:** Every Monday, her desk is stacked with 200+ invoices, delivery notes, and E-Way Bill printouts. Her team manually matches line items three times — once against the PO, once against the goods receipt note, once against the tax log. They catch obvious mismatches but routinely miss partial over-billing (e.g., invoiced qty 100, delivered 97, billed for 100). She knows ₹50K–₹1L leaks monthly but cannot prove it without a full audit.
- **What success looks like:** A dashboard that shows match status per invoice: green (3-way match passed), yellow (partial match, needs review), red (mismatch, hold payment). She can review discrepancies in 15 minutes instead of 15 hours. She can generate dispute letters for suppliers with one click.
- **Quote:** *"I know we're bleeding money somewhere. I just can't prove it without digging through 800 invoices manually. Give me a heat map of where the leaks are."*

#### Persona 3: Vikram — CFO / Finance Controller, Industrial Conglomerate

- **Age:** 48
- **Background:** CA, MBA (Finance), 20+ years. Oversees finance for a group of 3 manufacturing units.
- **Pain point:** He sees the P&L bleed — gross margins are 2% lower than expected, and he suspects supplier leakage is a primary driver. But his AP team cannot give him a data-driven answer. He needs quantified leakage reports to negotiate better contracts and to pass GST audits without penalties. He also needs multi-tenant visibility across his 3 plants from a single dashboard.
- **What success looks like:** A monthly leakage report: ₹X recovered, ₹Y prevented, Z discrepancies caught, top-10 problematic suppliers ranked by mismatch rate. Automated dashboards for each plant. Audit-ready reconciliation trails for every invoice paid.
- **Quote:** *"I don't need more software. I need less financial leakage. Show me the money we saved, not the features you built."*

---

## 3. Goals & Success Metrics (KPIs)

| Goal | Metric | Baseline | Target | Measurement Window |
|---|---|---|---|---|
| Match accuracy | % of invoices achieving 3-way match (INV ↔ DN ↔ EWB) without human intervention | 0% (fully manual) | ≥92% auto-match rate | 90 days post-GA |
| Processing time reduction | Hours/week spent on reconciliation per AP team of 4 | 40 hrs/week | ≤4 hrs/week | 60 days post-GA |
| Overpayment prevention | ₹ value of discrepancies caught before payment | ₹0 (undetected) | ₹2,00,000+ / month recovered | 30 days post-GA |
| Discrepancy detection rate | % of line-item mismatches flagged by system vs. manual audit | ~60% estimated (manual) | ≥98% | 90 days post-GA |
| Time to discrepancy detection | Avg. hours between invoice ingestion and mismatch flag | ~120 hrs (2 weeks manual) | ≤1 hr | 60 days post-GA |
| Tax credit leakage prevented | ₹ of blocked ITC reclaimed via E-Way Bill matching | ₹0 | ₹75,000+ / quarter | 90 days post-GA |
| User adoption | % of invited users completing onboarding & processing ≥1 document | N/A | ≥80% within 7 days of invite | 30 days post-launch |
| Dispute resolution cycle | Avg. days from discrepancy flag to supplier resolution | ~21 days | ≤5 days | 90 days post-GA |
| System uptime | Platform availability for reconciliation operations | N/A | ≥99.5% (excluding planned maintenance) | Monthly |
| Audit readiness | % of months with complete, exportable reconciliation audit trail | 0% (manual/partial) | 100% | 90 days post-GA |

---

## 4. Functional Requirements & User Stories

### FR-1: Invoice Ingestion (Email + Upload)

| Story | Priority |
|---|---|
| **As a vendor**, I want to email invoices to a dedicated LedgerPulse inbox so that they are automatically ingested without manual forwarding. | P0 |
| **As Priya**, I want to upload invoice PDFs/images via a web dashboard so that I can batch-process invoices received via WhatsApp or physical delivery. | P0 |
| **As Rajesh**, I want to upload photos of delivery weighbridge slips from my phone so that they enter the matching pipeline instantly. | P0 |

**Acceptance Criteria:**
- System generates a unique email address per tenant (e.g., invoices@tenant.ledgerpulse.com)
- Email attachments (.pdf, .jpg, .png, .heic) are extracted and queued for OCR within 60 seconds
- Web upload supports drag-and-drop with batch upload (up to 20 files at once)
- Uploaded files are stored with original filename, timestamp, and source tag (email/upload/WhatsApp-bridge)
- Duplicate detection: same invoice number + vendor combination within 30 days is flagged and queued for review, not auto-processed
- Malformed files (corrupt PDF, unsupported format) return a clear error with user-facing message
- Status is visible in a processing queue with progress indicator

### FR-2: Delivery Note OCR Processing

| Story | Priority |
|---|---|
| **As Rajesh**, I want to take a photo of a delivery note and have its handwritten quantities and item codes OCR'd automatically so that I don't need to type them. | P0 |
| **As Priya**, I want the system to extract line-item-level data (item code, quantity, unit) from scanned delivery notes so that they can be matched against invoices. | P0 |

**Acceptance Criteria:**
- OCR pipeline extracts: delivery note number, date, vendor name, line items (item code, description, quantity, unit), weighbridge gross/net weight, vehicle number
- Handwriting recognition for quantity fields with ≥85% accuracy (target ≥92% with retraining)
- Confidence score per extracted field; fields below threshold (70%) are highlighted for manual review
- User can view OCR-extracted text side-by-side with the original image and correct errors inline
- Corrected data retrains the model (feedback loop)
- Processing time: ≤30 seconds per document for standard quality images

### FR-3: E-Way Bill API Integration

| Story | Priority |
|---|---|
| **As Priya**, I want to automatically fetch E-Way Bill data by entering the EWB number or by matching it to an invoice automatically. | P0 |
| **As Vikram**, I want the system to flag any mismatch between E-Way Bill value and invoice value so that we do not lose input tax credit. | P0 |

**Acceptance Criteria:**
- Integration with NIC E-Way Bill API (production and sandbox)
- Auto-fetch by EWB number, or bulk fetch by date range for scheduled reconciliation
- Fields extracted: EWB number, generated date, valid-until date, from-GSTIN, to-GSTIN, total value, transport mode, vehicle number, HSN codes
- E-Way Bill expiry tracking: alerts generated when a bill is expiring within 24 hours for in-transit shipments
- Cached API responses stored as raw JSON in `EWayBill.rawData` for audit trail
- API rate-limit awareness with exponential backoff (NIC API limit: ~10 req/min)

### FR-4: 3-Way Matching Engine

| Story | Priority |
|---|---|
| **As Priya**, I want the system to automatically match invoices, delivery notes, and E-Way Bills so that I only review exceptions. | P0 |
| **As Vikram**, I want a match score per invoice so that I can trust the automation and audit its decisions. | P0 |

**Acceptance Criteria:**
- Matching algorithm operates at both header level (total amount, tax, date) and line-item level (item code, quantity, unit price)
- Match scoring: 0.0–1.0 composite score with breakdown (invoice↔DN score, invoice↔EWB score, overall)
- Match outcomes: `MATCHED` (≥0.95), `PARTIAL` (0.70–0.94), `MISMATCH` (<0.70)
- Partial matches surface specific conflicting fields (e.g., "Invoice qty: 100, DN qty: 97, Difference: 3 units")
- Matching is re-triggered when any linked document is updated (e.g., corrected OCR data)
- Auto-link: system suggests which invoices, DNs, and EWBs belong together based on vendor, date range (±7 days), and amounts (±10% tolerance)
- Match results stored in `MatchResult` model with full discrepancy JSON for audit trail
- Matching engine processes a batch of 100 invoices in ≤60 seconds

### FR-5: Discrepancy Dashboard

| Story | Priority |
|---|---|
| **As Priya**, I want a single dashboard showing all discrepancies ranked by severity and financial impact so that I can prioritise my review. | P0 |
| **As Vikram**, I want a monthly leakage report with trend charts so that I can track improvements and hold suppliers accountable. | P1 |

**Acceptance Criteria:**
- Dashboard shows: total processed (24h/7d/30d), matched %, discrepancy count, ₹ at risk, top-5 problematic suppliers
- List view of all discrepancies with filters: status (open/resolved), type (qty/price/tax/EWB), severity (high/medium/low), supplier, date range
- High-severity = mismatch with ₹ impact > ₹50K flagged with red indicator
- Drill-down: click any discrepancy to see side-by-side comparison of invoice, DN, and EWB data
- Export discrepancy report as CSV/PDF with one click
- Monthly leakage report auto-generated on the 1st of each month with trend analysis (MoM, QoQ)

### FR-6: Approval Workflow

| Story | Priority |
|---|---|
| **As Priya**, I want to approve matched invoices in bulk and flag mismatched ones for hold so that my team can process payments efficiently. | P0 |
| **As Vikram**, I want configurable approval thresholds (e.g., mismatches > ₹1L require CFO approval) so that risk is appropriately escalated. | P1 |

**Acceptance Criteria:**
- Configurable approval tiers: auto-approve (match ≥0.95), manager review (0.70–0.94), hold & dispute (<0.70)
- Bulk actions: select multiple matched invoices → approve, flag, or route for review
- Per-invoice action: approve, hold, request re-matching, mark as reviewed
- Role-based access: AP clerk (can review and flag), AP lead (can approve up to ₹1L discrepancies), CFO (no limit)
- All actions logged with timestamp and user ID for audit trail
- Email notification sent to vendor when an invoice is held due to discrepancy

### FR-7: Dispute Draft Generator

| Story | Priority |
|---|---|
| **As Priya**, I want to generate a formal dispute letter with one click so that I can send it to the supplier immediately. | P1 |
| **As Rajesh**, I want the dispute letter to reference specific line-item mismatches so that the supplier can investigate without back-and-forth. | P1 |

**Acceptance Criteria:**
- One-click generation of dispute PDF pre-populated with: supplier name, invoice number(s), date, line items in conflict, expected vs. actual values, supporting document references
- Template configurable by tenant (company logo, terms, language)
- Dispute letter can be emailed directly from the platform with PDF attachment
- Supplier response tracked: opened, responded, resolved — with date stamps
- Dispute history maintained per invoice for audit trail

---

## 5. Non-Goals (v1 Explicit Out-of-Scope)

- **Payment execution:** LedgerPulse will not initiate bank transfers, issue cheques, or integrate with payment gateways. It produces an approved payables list; actual payment remains in the existing ERP/banking system.
- **Procurement / PO management:** Purchase order creation, vendor negotiation, RFQ, and contract lifecycle management are out of scope. LedgerPulse reads contract baseline prices (from a config field) but does not manage the procurement process.
- **Full ERP replacement:** This is a reconciliation layer, not an ERP. General ledger, inventory management, fixed assets, and payroll are explicitly out of scope.
- **Multi-language invoice OCR:** v1 supports English + Hindi numeric extraction. Full support for other Indian languages (Tamil, Telugu, Kannada, etc.) is deferred.
- **Mobile native app:** v1 is a responsive web app. No iOS/Android native applications. Phone camera upload works through the browser.
- **Blockchain / distributed ledger:** No blockchain-based reconciliation or smart contract enforcement in v1. All matching is server-side deterministic.
- **AI-powered fraud detection beyond matching:** Anomaly detection on payment patterns, vendor collusion rings, and advanced ML fraud models are post-v1.
- **Tenant self-service onboarding (SSO, SAML, SCIM):** v1 uses email+password or magic-link auth. Enterprise SSO, directory sync, and role provisioning are v2.
- **Public API for third-party integration:** v1 exposes internal APIs for the frontend only. A public developer API with rate limits and webhooks is v2.

---

## 6. Solution Overview

LedgerPulse is a purpose-built SaaS reconciliation layer that sits between a company's document influx (email, WhatsApp, uploads) and its accounts payable workflow. It replaces the manual 3-way matching process — a task that currently consumes 30–40 hours of AP team labor per week — with an automated pipeline that ingests, extracts, cross-references, and flags documents in under an hour, often in minutes.

The ingestion layer accepts invoices and delivery notes via multiple channels: a dedicated tenant email inbox (for emailed PDFs), a web upload portal (for scanned copies and photos), and a planned WhatsApp bridge (for phone photos from the warehouse floor). Each document passes through an OCR extraction pipeline that parses header metadata and line-item detail with field-level confidence scores. For government tax data, the system connects directly to the NIC E-Way Bill API to fetch official records by EWB number or bulk date-range query.

The matching engine then performs a deterministic 3-way reconciliation: it compares invoice line items against delivery note quantities and E-Way Bill values. Matches are scored from 0.0 to 1.0 with granular breakdown — a perfect 3-way match auto-approves; a partial match surfaces the specific conflicting fields (e.g., "quantity billed: 100, quantity delivered: 97"); a full mismatch triggers a payment hold and routes to the discrepancy dashboard. The dashboard provides ranked, filterable views of all exceptions with drill-down into side-by-side document comparison, enabling AP teams to review 50 discrepancies in the time they previously reviewed one.

Once discrepancies are resolved (or auto-approved), the system generates an approved payables ledger that feeds into the company's existing payment process. For disputed items, a one-click dispute draft generator produces a formal reconciliation statement referencing specific line-item conflicts — eliminating the typical 3–4 email back-and-forth with suppliers. All actions are logged with timestamps and user IDs, producing a GST-audit-ready trail for every invoice processed.

---

## 7. Launch Plan

### Phase 0: Foundation (Current — Complete)
- Monorepo scaffold (npm workspaces, TypeScript, shared configs)
- Prisma schema (Vendor, Invoice, DeliveryNote, EWayBill, MatchResult — all 5 models)
- SQLite dev database, seed script
- Basic health endpoint + integration test
- Frontend scaffold (React + Tailwind + Vite), Dashboard + Invoices pages, smoke test

### Phase 1: Alpha (Weeks 1–4) — Document Ingestion + OCR
- Email ingestion service (imap/pop3 listener per tenant)
- Web upload API with multer/multipart handling
- OCR pipeline integration (Tesseract.js or external OCR API)
- Processing queue with status tracking
- Manual OCR correction UI
- **Alpha test:** 5 friendly manufacturers, each processing 50 invoices manually first, then 50 via LedgerPulse. Measure processing time and discrepancy detection rate.

### Phase 2: Beta (Weeks 5–8) — 2-Way + 3-Way Matching
- 2-way matching engine (invoice ↔ delivery note) at header and line-item level
- E-Way Bill API integration + automatic fetch
- 3-way matching engine (inv + DN + EWB full reconciliation)
- Match scoring and discrepancy categorization
- Approval workflow engine (configurable thresholds, role-based)
- **Beta test:** 15 companies (mix of manufacturing and distribution), each running their full monthly reconciliation cycle. Measure auto-match rate, false-positive rate, user satisfaction.

### Phase 3: GA Launch (Weeks 9–12) — Dashboard + Dispute + Polish
- Discrepancy dashboard with drill-down, filters, severity ranking
- Dispute draft generator with email dispatch
- Monthly leakage report auto-generation
- Auth system (JWT, tenant isolation, role-based access)
- Performance optimization: 100 invoices in ≤60 seconds matching
- Documentation: user guide, API reference, deployment guide
- **GA launch:** Public availability. Target: 5 paid customers in month 1, 20 by month 3.

### Phase 4: Post-GA (Month 3+)
- WhatsApp bridge for delivery note photos
- Email notification system (discrepancy alerts, approval notifications)
- Public API + webhooks
- Advanced analytics: leakage trends, supplier scorecards, forecasting
- Mobile-responsive PWA enhancements

---

## 8. Edge Cases & Error Handling

| # | Edge Case | Mitigation Strategy |
|---|---|---|
| 1 | **Vendor sends same invoice number twice (unintentional duplicate)** | Dedup logic: same vendor + invoice number + amount within 30 days → flag as potential duplicate, queue for manual review. Do NOT auto-match. |
| 2 | **Weighbridge slip photo is too blurry for OCR** | OCR confidence threshold (70%). If below threshold, route to manual entry queue with original image displayed. User can re-upload or type values. Retry limit: 3 attempts with different preprocessing pipelines. |
| 3 | **Delivery note arrives 14 days after invoice (crosses date-range matching window)** | Default match window is ±7 days from invoice date. Extendable to ±30 days via tenant setting. DNs outside this window appear in an "unmatched documents" queue for manual linking. |
| 4 | **E-Way Bill has expired before reconciliation (validUntil < today)** | Flag as informational, not a match failure. EWB expiry does not block payment approval but generates a compliance advisory note. Log to audit trail with recommendation to obtain extension. |
| 5 | **NIC E-Way Bill API is down or rate-limited** | Queue failed EWB fetches with exponential backoff (30s, 2min, 5min, 15min). Store partial match results. Surface API health status on dashboard. Admin alert after 3 consecutive failures. |
| 6 | **Partial goods delivery (single invoice fulfilled over 3 shipments)** | Allow multiple DNs to link to one invoice. Match engine aggregates delivery quantities across all linked DNs and compares to invoice total. Flag if sum ≠ invoiced amount. |
| 7 | **Invoice has zero tax but E-Way Bill shows taxable value** | This is a compliance-critical edge case. Auto-flag as high-severity discrepancy. Route to CFO review. Do not auto-approve. Generate dispute draft automatically. |
| 8 | **OCR extracts wrong quantity (e.g., "1O" vs "10")** | Field-level confidence scoring catches character-level ambiguity. Flag low-confidence fields for manual verification. Use edit-distance similarity for numeric fields — if 2 values differ by <5% of the expected range, flag as "needs review" not "mismatch". |
| 9 | **Same delivery note linked to 2 different invoices by different users** | Locking mechanism: once a DN is linked to an invoice in "reviewed" or "approved" state, it cannot be re-linked without admin override. Any re-linking request triggers a confirmation dialog showing current linkage. |
| 10 | **Vendor GSTIN does not match E-Way Bill from-GSTIN** | Flag as compliance mismatch. Do not block processing but surface prominently. Generate a compliance alert for the finance team. This may indicate a tax invoice from a different entity — requires manual validation. |
| 11 | **Invoice total differs from sum of line items (rounding or error)** | Normalize: compare both invoice total vs. sum(line-items). If difference is >1% of total, flag as data integrity issue. Allow user to select which value to use as ground truth for matching. |
| 12 | **User uploads a PDF that is password-protected** | OCR pipeline detects encryption. Return clear error: "Password-protected PDF detected. Please remove password protection and re-upload." Do not crash pipeline. Log attempted file hash for dedup. |
| 13 | **Concurrent matching request for the same set of documents** | Use optimistic locking: `MatchResult.updatedAt` timestamp check before writing. If another process has modified the match since the read, retry. Queue-based processing prevents concurrent writes to the same invoice match. |
| 14 | **Holiday/grace period for E-Way Bill validity (government-declared extension)** | Maintain a configurable calendar of government-declared EWB extensions. When matching, check if the EWB expired during an extension period and adjust validUntil accordingly. Fallback: admin can manually extend EWB validity on a per-bill basis. |

---

## 9. Open Questions (Resolve Before Dev Starts)

1. **OCR approach:** Should we use a self-hosted model (Tesseract.js + custom layout model) or an API-based service (Google Document AI, Azure Form Recognizer) for production? Self-hosted = lower cost per document, higher upfront complexity. API-based = faster time-to-accuracy, recurring API cost. Decision needed by end of Week 1 of Phase 1.

2. **Email ingestion architecture:** Dedicated inbox per tenant (requires email infrastructure — SendGrid, custom SMTP) or a shared inbox with automated parsing of "Re:" subject lines? Dedicated is cleaner for isolation. Shared is cheaper. What is the expected tenant count at launch?

3. **E-Way Bill API access:** Do we have sandbox credentials for the NIC E-Way Bill API (ewaybillgst.gov.in)? Production access requires GSTIN-based registration. Should we build an API mock for development until sandbox access is obtained?

4. **Matching tolerance thresholds:** What are the default tolerance percentages for quantity (±2%?), unit price (±5%?), total amount (±1%?) before a match is downgraded from MATCHED to PARTIAL? Should tolerance be configurable per supplier?

5. **Multi-tenant isolation model:** Database-per-tenant (strong isolation, higher ops cost) or row-level tenant_id column (shared database, lower cost, needs careful indexing)? For v1 with 10–50 tenants, shared with tenant_id column is recommended. Confirm.

6. **WhatsApp bridge priority:** Is WhatsApp ingestion for delivery note photos a launch-blocking requirement (P0) or a post-launch enhancement (P1)? Current Phase 4 placement assumes P1. Confirm with early alpha testers.

7. **Pricing model:** Per-document (₹X/invoice), per-tenant flat fee (₹Y/month), or tiered based on volume (₹Z/month for up to N invoices)? Decision affects tenant onboarding and billing code in Phase 5.

8. **Contract baseline storage:** The system needs a "contracted unit price" per item per vendor to detect over-invoicing beyond delivery note matching. Where is this data sourced? Upload spreadsheet? Manual entry? ERP sync? v1 approach needed.

9. **GSTIN validation:** Should the system validate GSTIN format (15-character PAN-based) on vendor creation and flag invalid GSTINs? This is a simple regex check but adds compliance value. Decision: include in v1 as a lightweight validation.

10. **Audit export format:** What format(s) for the audit-ready reconciliation export? PDF (visual), CSV (data), XLSX (formatted)? Minimum: CSV for data portability + PDF for audit submission. Confirm.
