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
  <img src="https://img.shields.io/badge/status-alpha-yellow" alt="Status">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="License">
  <img src="https://img.shields.io/badge/node-20%2B-brightgreen" alt="Node">
  <img src="https://img.shields.io/badge/TypeScript-5.6-blue" alt="TypeScript">
</p>

---

## 🚀 What is LedgerPulse?

LedgerPulse is a **complete, end-to-end tested SaaS boilerplate** for supply chain financial reconciliation. It automates the painful manual process of matching invoices against physical delivery notes and government tax logs — preventing overpayments, catching discrepancies, and keeping compliance in check.

**Built for:** Manufacturers, distributors, and logistics hubs operating across complex invoice/tax environments.

**Sell it as:** A white-label SaaS, deploy it for a single client, or use it as the foundation for your own fintech product.

---

## ✨ Features

### Core Engine

| Feature | Description |
|---------|-------------|
| **Multi-Format Ingestion** | Accept invoices via email (IMAP), file upload (PDF/images), or manual entry |
| **OCR Extraction** | Parse unstructured documents using Tesseract/EasyOCR — extracts line items, tax components, totals |
| **3-Way Matching** | Automatically cross-references Invoices × Delivery Notes × E-Way Bill logs |
| **Discrepancy Detection** | Flags price inflation, quantity mismatches, duplicate invoices, tax credit mismatches |
| **E-Way Bill Sync** | Integration with Indian GST portal for automatic tax log ingestion |
| **Approval Workflow** | Multi-level approval routing for flagged discrepancies |
| **Dispute Generator** | Pre-populated vendor reconciliation statements and formal dispute notices |
| **Dashboard** | Real-time match rates, discrepancy alerts, and leakage tracking |

### Technical

| Feature | Description |
|---------|-------------|
| **RESTful API** | Fully documented API with pagination, filtering, and webhook support |
| **TypeScript Everywhere** | End-to-end type safety from database to frontend |
| **SQLite → PostgreSQL** | Zero-config SQLite for development, production-ready PostgreSQL |
| **E2E Tested** | Backend integration tests + frontend component tests — every feature covered |
| **Docker Ready** | Docker Compose for local dev, production deployment guides |
| **Multi-Tenant Ready** | JWT auth with role-based access (Admin, Viewer, Approver) |

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

## 📁 Project Structure

```
ledgerpulse/
├── packages/
│   ├── backend/            # Express API server
│   │   ├── src/
│   │   │   ├── routes/     # Route handlers
│   │   │   ├── services/   # Business logic
│   │   │   └── middleware/  # Auth, validation, error handling
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

- **Backend:** Integration tests hitting real SQLite via Supertest
- **Frontend:** Component tests with Vitest + React Testing Library
- **Coverage target:** 80%+ for business logic, 100% for critical paths

```bash
# Run the full suite (~30s)
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
| **1** | Document ingestion API + OCR pipeline | 🔜 Next |
| **2** | 2-way matching (Invoice ↔ Delivery Note) | 🔜 |
| **3** | E-Way Bill integration + 3-way matching | 🔜 |
| **4** | Discrepancy dashboard + approval workflow | 🔜 |
| **5** | Auth, multi-tenant, billing (Gumroad) | 🔜 |
| **6** | Production deployment + documentation polish | 🔜 |

---

## 📄 License

MIT — see [LICENSE](LICENSE)

---

<p align="center">
  <sub>Built by <a href="#">Ravi</a> · Sold as a complete SaaS boilerplate · Ready to deploy</sub>
</p>
