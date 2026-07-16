# LedgerPulse — Supply Chain Reconciliation & Tax Engine

## Project Overview
Automated 3-way matching engine for industrial manufacturers & distributors. Ingests invoices, delivery notes, and government tax logs (E-Way Bill), cross-references line items, flags mismatches, and prevents overpayments. Sells as a complete E2E-tested SaaS boilerplate.

## Tech Stack
- **Backend:** Node.js + TypeScript + Express/Fastify
- **Frontend:** React + TypeScript + Tailwind CSS + Vite
- **Database:** SQLite (dev/test) → PostgreSQL (production) via Prisma ORM
- **Testing:** Vitest (frontend) + Supertest + Jest (backend API)
- **Auth:** JWT / session-based (TBD)
- **Deployment:** Docker / self-host or cloud (Railway/Fly.io)

## Architecture (Monorepo)
```
LedgerPulse/
├── packages/
│   ├── backend/        # Node.js API server
│   │   ├── src/
│   │   │   ├── routes/       # Express route handlers
│   │   │   ├── services/     # Business logic
│   │   │   ├── middleware/   # Auth, validation, error handling
│   │   │   └── tests/        # Integration + unit tests
│   │   ├── prisma/           # Schema + migrations
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── frontend/       # React SPA
│       ├── src/
│       │   ├── components/   # Reusable UI components
│       │   ├── pages/        # Route pages
│       │   ├── hooks/        # Custom React hooks
│       │   └── tests/        # Vitest tests
│       ├── package.json
│       └── vite.config.ts
├── docs/               # Architecture, API spec, deployment
├── scripts/            # Build, seed, CI helpers
├── AGENTS.md           # This file
├── README.md           # Public-facing project readme
└── LICENSE
```

## Development Conventions
- **Commits:** Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`)
- **Branches:** GitHub Flow — feature branches off `main`, PRs to merge
- **Testing:** Every feature must have tests before merging. Backend: integration tests hitting real SQLite. Frontend: component + smoke tests.
- **Secrets:** `.env` files never committed. Use `.env.example` for documentation.
- **Linting:** ESLint + Prettier (back + front consistent)

## Milestones (Tentative)
- [ ] **Phase 0:** Monorepo scaffold + CI + SQLite dev DB + basic health endpoint
- [ ] **Phase 1:** Document ingestion API (email + upload) + OCR pipeline
- [ ] **Phase 2:** 2-way matching engine (invoice ↔ delivery note)
- [ ] **Phase 3:** E-Way Bill / tax log ingestion + 3-way matching
- [ ] **Phase 4:** Discrepancy dashboard + approval workflow UI
- [ ] **Phase 5:** Auth, multi-tenant, billing (Gumroad/LemonSqueezy)
- [ ] **Phase 6:** Production deployment guide + Docker Compose

## Session Memory
<!-- Agent: append session state here before terminating for context7 recall -->

### [2026-07-16 21:30] — Full Documentation Architecture Suite
- **State:** Success — 9 documents, 8,644 lines, 340KB
- **MCP Data Used:** glob (file discovery), skill (project-bootstrap), websearch (market research for PRD)
- **Agency Agents Deployed:** @product-manager, @software-architect, @backend-architect, @frontend-developer, @database-optimizer, @security-engineer, @devops-automator, @reality-checker, @technical-writer (via agency roster at /home/matrix/agency-agents/)
- **Architectural Decision:** Created comprehensive docs/ directory with README.md index; documents follow agency agent templates (PM PRD, SW Architect ADRs, Security STRIDE)
- **Key Outputs:** PRD.md (298), ARCHITECTURE.md (1,251), API-SPEC.md (1,736), DATABASE.md (1,439), FRONTEND.md (925), SECURITY.md (531), ERROR-HANDLING.md (656), DEPLOYMENT.md (1,543), ROADMAP.md (265)
- **Build Status:** No code changes — pure documentation phase
- **Next Turn Directive:** Proceed to Phase 1 implementation — Document Ingestion API (email + upload) + OCR pipeline

### [2026-07-16] - Phase 0: Monorepo Scaffold Complete
- **State:** Success
- **MCP Data Used:** glob (file discovery), skill (project-bootstrap), websearch (market validation)
- **Agents Deployed:** Orchestrator (direct execution)
- **Decisions:** Backend Node.js+TypeScript+Express (Go not available on system); SQLite via Prisma for dev; React+Tailwind+Vite for frontend; Conventional Commits + GitHub Flow
- **Key Deliverables:** 30 files committed, monorepo with npm workspaces, Prisma schema (Vendor, Invoice, DeliveryNote, EWayBill, MatchResult), health endpoint + tests, Dashboard/Invoices pages + smoke test, seed script with sample data
- **Build Status:** Backend ✅ 1/1 test | Frontend ✅ 1/1 test
- **Next Turn Directive:** Begin Phase 1 — Document ingestion API (email + upload) + OCR pipeline
