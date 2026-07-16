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
