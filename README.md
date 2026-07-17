<picture>
  <source media="(prefers-color-scheme: dark)" srcset="">
  <img alt="LedgerPulse" src="">
</picture>

<h1 align="center">LedgerPulse</h1>

<p align="center">
  <strong>Automated Supply Chain Reconciliation & Tax Engine</strong><br>
  3-way matching SaaS boilerplate — Invoices × Delivery Notes × E-Way Bill logs
</p>

<p align="center">
  <img src="https://img.shields.io/badge/status-beta-green" alt="Status">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="License">
  <img src="https://img.shields.io/badge/node-20%2B-brightgreen" alt="Node">
  <img src="https://img.shields.io/badge/TypeScript-5.6-blue" alt="TypeScript">
  <img src="https://img.shields.io/badge/tests-35%2F35-green" alt="Tests">
  <img src="https://img.shields.io/badge/3--way_matching-live-brightgreen" alt="3-Way">
</p>

---

## 🚀 What is LedgerPulse?

LedgerPulse is a **complete, end-to-end tested SaaS boilerplate** for supply chain financial reconciliation. It automates the painful manual process of matching invoices against physical delivery notes and government tax logs — preventing overpayments, catching discrepancies, and keeping compliance in check.

**Built for:** Manufacturers, distributors, and logistics hubs operating across complex invoice/tax environments (Indian GST ecosystem ready).

**Current status:** Phases 0–3 complete. Core ingestion → OCR → 3-way matching pipeline functional and tested. Ready for frontend dashboard + approval workflow (Phase 4).

---

## ✨ Features

### Core Engine

| Feature | Description |
|---------|-------------|
| **Multi-Format Ingestion** | Accept invoices via email (IMAP), file upload (PDF/images), or manual entry |
| **OCR Extraction** | Parse unstructured documents using Tesseract.js — extracts line items, tax components, totals |
| **3-Way Matching** | Automatically cross-references Invoices × Delivery Notes × E-Way Bill logs with configurable tolerances |
| **Field-Level Discrepancy Detection** | Flags price inflation, quantity mismatches, duplicate invoices, GSTIN mismatches, expired E-Way Bills |
| **E-Way Bill Sync** | Stub integration with Indian GST portal for automatic tax log ingestion (+ manual CRUD) |
| **Match Scoring Engine** | Composite 0.0–1.0 score across three dimensions: INV↔DN (50%), INV↔EWB tax/GSTIN (30%), DN↔EWB logistics (20%) |
| **Tax Compliance Checks** | GSTIN mismatch detection, total value tolerance, EWB expiry alerts, vehicle cross-reference |

### Technical

| Feature | Description |
|---------|-------------|
| **RESTful API** | Fully documented API with pagination, filtering, and standard error envelopes |
| **TypeScript Everywhere** | End-to-end type safety from database to frontend — 0 TS errors |
| **SQLite → PostgreSQL** | Zero-config SQLite for development, production-ready PostgreSQL via Prisma |
| **E2E Tested** | 35 backend integration tests covering all routes, matching engine, and edge cases |
| **Express + Helmet + Rate Limit** | Security-hardened API with CORS, Helmet headers, and rate limiting |
| **Zod Validation** | Request validation on all mutation endpoints with structured error responses |

---

## 🏗 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Node.js + TypeScript + Express |
| **Frontend** | React + TypeScript + Tailwind CSS + Vite |
| **Database** | SQLite (dev) → PostgreSQL (prod) via Prisma ORM |
| **OCR** | Tesseract.js / EasyOCR |
| **Auth** | JWT with refresh tokens |
| **Testing** | Jest + Supertest (backend) · Vitest + RTL (frontend) |
| **Deploy** | Docker · Railway · Fly.io |

---

## 📦 Quick Start

```bash
# Clone & install
git clone https://github.com/your-org/ledgerpulse.git
cd ledgerpulse
npm install

# Database setup (SQLite)
cp .env.example .env
npm run db:migrate
npm run db:seed

# Start development
npm run dev
```

- **API Server:** http://localhost:3001
- **Frontend:** http://localhost:5173
- **API Health:** http://localhost:3001/api/health

---

## 🌐 API Endpoints

All endpoints are available at `http://localhost:3001/api/`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/vendors` | List vendors |
| `POST` | `/vendors` | Create vendor |
| `GET` | `/vendors/:id` | Vendor detail |
| `PUT` | `/vendors/:id` | Update vendor |
| `DELETE` | `/vendors/:id` | Soft-delete vendor |
| `GET` | `/invoices` | List invoices (filterable) |
| `POST` | `/invoices` | Create invoice manually |
| `POST` | `/invoices/upload` | Upload invoice + OCR |
| `GET` | `/invoices/:id` | Invoice detail with linked docs |
| `PUT` | `/invoices/:id/status` | Update status |
| `POST` | `/invoices/:id/reprocess` | Re-run OCR |
| `GET` | `/delivery-notes` | List delivery notes |
| `POST` | `/delivery-notes` | Create delivery note |
| `POST` | `/delivery-notes/upload` | Upload DN + OCR |
| `GET` | `/delivery-notes/:id` | DN detail |
| `PUT` | `/delivery-notes/:id/status` | Update status |
| `GET` | `/eway-bills` | List E-Way Bills |
| `POST` | `/eway-bills` | Create E-Way Bill |
| `POST` | `/eway-bills/sync` | Sync from GST portal (mock) |
| `GET` | `/eway-bills/:id` | EWB detail |
| `POST` | `/matching/run` | Run 2-way or 3-way matching |
| `GET` | `/matching/results` | List match results |
| `GET` | `/matching/results/:id` | Match result detail |

## 📁 Project Structure

```
ledgerpulse/
├── packages/
│   ├── backend/            # Express API server
│   │   ├── src/
│   │   │   ├── routes/     # Route handlers (vendors, invoices, DNs, EWBs, matching)
│   │   │   ├── services/   # Business logic (OCR, extraction, email, matching)
│   │   │   ├── middleware/  # Upload, validation, error handling
│   │   │   └── types/      # Type declarations (multer, express-augment)
│   │   ├── prisma/         # Schema + migrations + seed
│   │   └── tests/          # Integration tests
│   └── frontend/           # React SPA
│       ├── src/
│       │   ├── components/ # Reusable UI components
│       │   ├── pages/      # Route pages (Dashboard, Invoices, etc.)
│       │   └── hooks/      # Custom React hooks
│       └── tests/          # Component tests
├── docs/                   # Full documentation suite
└── scripts/                # Build & CI helpers
```

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [PRD](docs/PRD.md) | Product requirements, user personas, success metrics, launch plan |
| [Architecture](docs/ARCHITECTURE.md) | C4 context, service decomposition, architectural decisions (ADRs) |
| [API Spec](docs/API-SPEC.md) | All 29 routes, request/response schemas, event specifications, error codes |
| [Database](docs/DATABASE.md) | ERD, indexing strategy, query patterns, migration workflow |
| [Frontend](docs/FRONTEND.md) | Component architecture, state management, page specifications |
| [Security](docs/SECURITY.md) | Threat model (STRIDE), OWASP mitigations, incident response plan |
| [Error Handling](docs/ERROR-HANDLING.md) | 30+ edge cases, retry policies, audit logging, alerting |
| [Deployment](docs/DEPLOYMENT.md) | Docker Compose, CI/CD, Railway/Fly.io, scaling, monitoring |
| [Roadmap](docs/ROADMAP.md) | 6-phase development plan with prioritization |

---

## 🛠 Development

```bash
# Run both backend + frontend with hot reload
npm run dev

# Run all tests
npm run test

# Backend only
npm run dev:backend

# Frontend only
npm run dev:frontend

# Database operations
npm run db:migrate   # Apply migrations
npm run db:seed      # Seed sample data
npm run db:push      # Push schema changes (dev)
```

---

## 🧪 Testing Philosophy

Every feature ships with tests. No exceptions.

- **Backend:** 35 integration tests hitting real SQLite via Supertest — covers all routes + matching engine edge cases
- **Frontend:** Component tests with Vitest + React Testing Library *(coming in Phase 4)*
- **Coverage target:** 80%+ for business logic, 100% for critical paths

```bash
# Run the full suite (~10s)
npm run test
```

---

## 🐳 Deployment

Production deployment is designed for simplicity and reliability:

```bash
# Build Docker images
docker compose build

# Start services
docker compose up -d
```

**Supported platforms:**
- Railway (recommended — easiest setup)
- Fly.io (best for global regions)
- Any VPS with Docker (most control)

See [Deployment Guide](docs/DEPLOYMENT.md) for detailed instructions.

---

## 📊 Use Cases

<details>
<summary><strong>🏭 Manufacturing Plant</strong></summary>
<br>
A mid-size steel manufacturer receives 500+ invoices monthly from 200+ vendors. 
Their AP team manually matches paper delivery slips against PDF invoices and GST 
portals — taking 40+ hours per week. LedgerPulse automates this in under 2 hours.
</details>

<details>
<summary><strong>📦 Distribution Hub</strong></summary>
<br>
A regional FMCG distributor deals with weighbridge slips, delivery notes from 
multiple warehouses, and E-Way Bill compliance. LedgerPulse catches weight 
discrepancies, duplicate invoices, and generates dispute notices automatically.
</details>

<details>
<summary><strong>💰 Financial Controller</strong></summary>
<br>
A CFO needs visibility into payment leakages across 3 plants. LedgerPulse's 
dashboard gives real-time match rates, discrepancy trends, and overpayment 
recovery tracking — turning reconciliation from a cost center into savings.
</details>

---

## 🔒 Security

- JWT-based authentication with refresh token rotation
- Rate limiting (100 req/15 min per IP)
- Helmet security headers
- Input validation via Zod schemas
- Encrypted at rest (DB) and in transit (TLS 1.3)
- No secrets in code — all via `.env`

See [Security Architecture](docs/SECURITY.md) for the full threat model.

---

## 📋 Roadmap

| Phase | Focus | Status |
|-------|-------|--------|
| **0** | Monorepo scaffold, Prisma schema, health endpoint | ✅ Done |
| **1** | Document ingestion API + OCR pipeline | ✅ Done |
| **2** | 2-way matching (Invoice ↔ Delivery Note) | ✅ Done |
| **3** | E-Way Bill integration + 3-way matching | ✅ Done |
| **4** | Discrepancy dashboard + approval workflow | 🔜 Next |
| **5** | Auth, multi-tenant, billing (Gumroad) | 🔜 |
| **6** | Production deployment + documentation polish | 🔜 |

---

## 📄 License

MIT — see [LICENSE](LICENSE)

---

<p align="center">
  <sub>Built by <a href="#">Ravi</a> · Sold as a complete SaaS boilerplate · Ready to deploy</sub>
</p>
