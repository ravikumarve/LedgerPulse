# LedgerPulse

**Automated Supply Chain Reconciliation & Tax Engine**

3-way matching for industrial manufacturers. Ingests invoices, delivery notes, and government E-Way Bill logs, cross-references line items, flags mismatches, and prevents overpayments.

> 🚧 **Early Development** — Phase 0 scaffold in progress.

## Tech Stack

| Layer     | Technology                              |
| --------- | --------------------------------------- |
| Backend   | Node.js + TypeScript + Express          |
| Frontend  | React + TypeScript + Tailwind CSS + Vite |
| Database  | SQLite (dev) → PostgreSQL (prod) via Prisma |
| Testing   | Jest + Supertest (backend), Vitest (frontend) |

## Quick Start

```bash
# Install dependencies
npm install

# Set up database (SQLite)
cp .env.example .env
npm run db:migrate
npm run db:seed

# Start development servers
npm run dev
```

- **API:** http://localhost:3001
- **Frontend:** http://localhost:5173

## Project Structure

```
LedgerPulse/
├── packages/
│   ├── backend/     # Express API server
│   └── frontend/    # React SPA
├── docs/            # Architecture & deployment guides
├── scripts/         # Build & CI helpers
├── AGENTS.md        # Project context (dev use)
└── README.md
```

## License

MIT — see [LICENSE](LICENSE).
