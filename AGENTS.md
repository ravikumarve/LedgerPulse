# LedgerPulse — Supply Chain Reconciliation & Tax Engine

## Project Overview
Automated 3-way matching engine for industrial manufacturers & distributors. Ingests invoices, delivery notes, and government tax logs (E-Way Bill), cross-references line items, flags mismatches, and prevents overpayments. Sells as a complete E2E-tested SaaS boilerplate.

## Tech Stack
- **Backend:** Node.js + TypeScript + Express/Fastify
- **Frontend:** React + TypeScript + Tailwind CSS + Vite
- **Database:** SQLite (dev/test) → PostgreSQL (production) via Prisma ORM
- **Auth:** JWT (jsonwebtoken + bcryptjs) with multi-tenant organization isolation
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

### [2026-07-17 18:10] — Auth & Multi-Tenant Foundation
- **State:** Success
- **MCP Data Used:** code_tree (AST analysis), websearch (multi-tenant RBAC research)
- **Agents Deployed:** Orchestrator (direct execution)
- **Architectural Decision:**
  1. **Prisma schema**: Added User, Organization, OrganizationMember (with ADMIN/REVIEWER/VIEWER roles). Added `organizationId` to all 5 business models (Vendor, Invoice, DeliveryNote, EWayBill, MatchResult) for tenant isolation.
  2. **Backend auth**: JWT-based auth with bcrypt. `POST /api/auth/register` (creates org + user + admin membership), `POST /api/auth/login`, `GET /api/auth/me`. JWT middleware (`requireAuth`, `optionalAuth`, `requireRole`). Token expires in 7 days.
  3. **Data isolation**: Every business route now requires `organizationId` on create. Matching service derives orgId from invoice. Sync endpoint auto-resolves org or accepts explicit ID.
  4. **Frontend auth**: `AuthProvider` context with token persistence in localStorage. ProtectedRoute redirects to `/login`. Login page with demo credentials display. Signup page creates org + account. Layout shows user avatar dropdown + org name in sidebar + logout.
- **Key Outputs:** Prisma schema (7 models), auth routes, JWT middleware, AuthProvider, Login/Signup pages, ProtectedRoute, Layout user menu
- **Build Status:** Backend `npx tsc --noEmit` ✅ | Backend 41/41 tests ✅ | Frontend `npx tsc --noEmit` ✅ | Frontend 2/2 tests ✅
- **Next Turn Directive:** Continue with additional auth features (password reset, invite flow), or start Settings & Configuration pages (matching rules, notification preferences)

### [2026-07-17 19:00] — Landing Page Integration + Dark Theme + Settings Page
- **State:** Success
- **MCP Data Used:** code_tree (structure analysis), direct file reads
- **Agents Deployed:** Orchestrator (direct execution)
- **Architectural Decision:**
  1. **Route restructure**: `/` → Landing page (public marketing), `/login` + `/signup` → public auth, `/app/dashboard` → protected dashboard, `/app/invoices`, `/app/discrepancies`, `/app/settings` → protected pages.
  2. **Dark Obsidian/emerald theme**: Applied Tailwind v4 `@theme` with custom colors (`bg-void`, `bg-surface`, `bg-panel`, `text-emerald`, `text-muted`, etc.). All pages (login, signup, dashboard, discrepancies, settings) now use the dark glass aesthetic matching the landing page.
  3. **Landing page conversion**: Standalone `LedgerPulse.html` → React `Landing.tsx` component with WebGL Data Loom canvas, custom cursor, Match HUD, bento grid, metric grid, and responsive hamburger nav.
  4. **Settings page**: 3-tab layout (Organization profile, Matching tolerances, Team members). Org name/timezone/currency editable. Matching tolerances (qty%, price%, total%) configurable. Team member list with roles.
  5. **Backend**: Added `GET/PUT /api/organization` and `GET /api/organization/members` routes for org settings management.
  6. **Post-launch fixes** (Gemini review): Replaced Invoices placeholder "coming in Phase 1" with live data grid wired to `GET /api/invoices` + OCR upload modal. Added split-pane discrepancy showcase with 6 simulated mismatch flags (GSTIN, qty delta, price variance, EWB expiry, amount variance, duplicate) + 3 action panels (Accept Tolerance, Flag for Review, Generate Dispute Notice). Enhanced Matching Rules tab with weight distribution sliders (INV↔DN 50%, INV↔EWB 30%, DN↔EWB 20%) that auto-balance to 100%.
- **Key Outputs:** Landing.tsx + Landing.css (React port of landing page), Settings.tsx (3-tab settings with weights/tolerances), organization.ts (backend settings routes), Invoices.tsx (live data grid + upload modal), Discrepancies.tsx (showcase split-pane), dark theme in index.css
- **Build Status:** Backend `npx tsc --noEmit` ✅ | Backend 41/41 tests ✅ | Frontend `npx tsc --noEmit` ✅ | Frontend build ✅ | Frontend 2/2 tests ✅
- **Next Turn Directive:** Continue with billing integration (Gumroad/LemonSqueezy), password reset flow, or Docker Compose production setup

### [2026-07-17 17:45] — Phase 4: Discrepancy Dashboard + Approval Workflow
- **State:** Success
- **MCP Data Used:** code_tree (AST analysis for frontend structure), direct file reads (existing matching routes/services)
- **Agents Deployed:** Orchestrator (direct execution)
- **Architectural Decision:**
  1. **Backend additions**: `GET /api/matching/stats` (aggregate stats — matchRate, pendingReview, document counts), `PUT /api/matching/results/:id/resolve` (approval workflow with accept/reject, idempotency check via ALREADY_REVIEWED 409).
  2. **Frontend SPA upgrade**: Added Layout component with sidebar navigation (Dashboard, Invoices, Discrepancies), `useApi` hook for typed API calls (getStats, getMatchResults, getMatchResult, resolveMatchResult).
  3. **Dashboard**: Live stats from `/api/matching/stats` with 4 stat cards + 3 mini progress bars (matched/partial/mismatched). Skeleton loading + empty state.
  4. **Discrepancies page**: Filterable table (status: All/MATCHED/PARTIAL/MISMATCH), pagination, click-to-select row opens detail panel below. Detail panel shows document refs, score badges, full discrepancy list with severity coloring, and Accept/Reject buttons with confirmation feedback.
  5. **Resolve flow**: Accept → marks match as reviewed, updates documents to RESOLVED. Reject → registers review without changing documents. 409 on double-review.
- **Key Outputs:**
  - `packages/backend/src/routes/matching.ts` — added `/stats` and `results/:id/resolve` routes
  - `packages/backend/tests/matching.test.ts` — 6 new tests (stats, resolve accept, resolve duplicate, resolve 404, resolve validation, status filter)
  - `packages/frontend/src/hooks/useApi.ts` — typed API client with interfaces
  - `packages/frontend/src/components/Layout.tsx` — sidebar navigation shell
  - `packages/frontend/src/pages/Dashboard.tsx` — live stats dashboard
  - `packages/frontend/src/pages/Discrepancies.tsx` — full discrepancy table + detail + approval UI
  - `packages/frontend/src/App.tsx` — updated routes with Layout
- **Build Status:** Backend `npx tsc --noEmit` ✅ | Backend 41/41 tests ✅ | Frontend `npx tsc --noEmit` ✅ | Frontend 1/1 tests ✅
- **Next Turn Directive:** Continue with additional auth features (password reset, invite flow), or start Settings & Configuration pages (matching rules, notification preferences)

### [2026-07-17 12:30] — Phase 3: E-Way Bill Ingestion + 3-Way Matching
- **State:** Success
- **MCP Data Used:** grep_app (schema design), direct file reads (existing routes/services)
- **Agents Deployed:** Orchestrator (direct execution)
- **Architectural Decision:**
  1. **3-way scoring**: INV↔DN (50%) + INV↔EWB tax/GSTIN (30%) + DN↔EWB logistics (20%). Composite weighted by available document pairs.
  2. **EWB auto-scope**: Scoped by vendor GSTIN (fromGstin) when not explicitly specified — prevents matching against unrelated EWBs.
  3. **Tax checks**: GSTIN match (vendor vs fromGstin), total value tolerance (amountTolerancePercent), EWB expiry detection.
  4. **Sync stub**: POST /api/eway-bills/sync with 30-day range limit, generates sample EWBs for dev/testing.
- **Key Outputs:** `src/routes/eway-bills.ts` (5 endpoints), `src/services/matching.ts` (upgraded to 3-way), 16 new/updated tests
- **Build Status:** `npx tsc --noEmit` ✅ | Tests 35/35 ✅ | Pushed to `main`
- **Next Turn Directive:** Begin Phase 4 — Discrepancy dashboard + approval workflow UI

### [2026-07-16 23:00] — Phase 2: 2-Way Matching Engine (Invoice ↔ Delivery Note)
- **State:** Success
- **MCP Data Used:** grep_app (schema pattern research), direct file reads (existing routes/docs)
- **Agents Deployed:** Orchestrator (direct execution)
- **Architectural Decision:**
  1. **Matching algorithm**: Two-phase scoring — header match (vendor, date, amount) at 40% weight, line-item match (qty, price) at 60% weight. Composite score classified as MATCHED ≥0.85, PARTIAL ≥0.50, MISMATCH <0.50. Computes invoice total qty from line items (not totalAmount) for fair comparison.
  2. **Schema**: Added `DeliveryNote.matchResults` back-ref and `MatchResult.deliveryNote` relation to Prisma schema.
  3. **API**: `POST /api/matching/run` with optional `autoPersist` flag, `GET /api/matching/results` with filters, `GET /api/matching/results/:id` with full discrepancy detail.
  4. **Auto-link**: When no deliveryNoteIds provided, service auto-selects from same vendor with PROCESSED/PENDING status.
- **Key Outputs:** `src/services/matching.ts` (matching engine), `src/routes/matching.ts` (3 endpoints), `tests/matching.test.ts` (8 integration tests)
- **Build Status:** `npx tsc --noEmit` ✅ | Tests 27/27 ✅ | Pushed to `main`
- **Next Turn Directive:** Begin Phase 3 — E-Way Bill / tax log ingestion + 3-way matching

### [2026-07-16 22:30] — Phase 1 Stabilization: Test Isolation + TS Clean Build
- **State:** Success
- **MCP Data Used:** code_tree (AST analysis for type conflict debugging), grep_app (pattern research for local multer types)
- **Agents Deployed:** Orchestrator (direct execution)
- **Architectural Decision:**
  1. **Test isolation**: Each test suite now cleans tables in FK order (`matchResult → eWayBill → deliveryNote → invoice → vendor`) before seeding fresh data — eliminates shared SQLite state collisions
  2. **Express v4/v5 type conflict fixed**: Removed `@types/multer` (pulled in `@types/express@5.0.6` as transitive dep). Created local `src/types/multer.d.ts` with `declare function + declare namespace` pattern and `src/types/express-augment.d.ts` for `Express.Request.file` augmentation. Root `node_modules/@types/express` now correctly resolves to v4.17.25
  3. **Removed tsconfig `declaration: true`** — backend is a server, not a library; avoids MulterInstance naming issues in emitted .d.ts
- **Key Fixes:** FK cascade on test cleanup → 19/19 tests pass. 11 TS errors → 0 TS errors (both `node` and `NodeNext` moduleResolution)
- **Build Status:** `npx tsc --noEmit` ✅ | Tests 19/19 ✅ | Seed script ✅
- **Next Turn Directive:** Begin Phase 2 — 2-way matching engine (invoice ↔ delivery note), or start E-Way Bill / tax log ingestion for 3-way matching

### [2026-07-16] - Phase 0: Monorepo Scaffold Complete
- **State:** Success
- **MCP Data Used:** glob (file discovery), skill (project-bootstrap), websearch (market validation)
- **Agents Deployed:** Orchestrator (direct execution)
- **Decisions:** Backend Node.js+TypeScript+Express (Go not available on system); SQLite via Prisma for dev; React+Tailwind+Vite for frontend; Conventional Commits + GitHub Flow
- **Key Deliverables:** 30 files committed, monorepo with npm workspaces, Prisma schema (Vendor, Invoice, DeliveryNote, EWayBill, MatchResult), health endpoint + tests, Dashboard/Invoices pages + smoke test, seed script with sample data
- **Build Status:** Backend ✅ 1/1 test | Frontend ✅ 1/1 test
- **Next Turn Directive:** Begin Phase 1 — Document ingestion API (email + upload) + OCR pipeline
