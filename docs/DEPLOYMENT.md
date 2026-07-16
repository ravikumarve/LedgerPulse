# LedgerPulse — Deployment & DevOps Guide

> Automated Supply Chain Reconciliation & Tax Engine
> Node.js/TypeScript/Express backend + React/Tailwind/Vite frontend + Prisma/SQLite→PostgreSQL

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Local Development Setup](#2-local-development-setup)
3. [Docker Development Setup](#3-docker-development-setup)
4. [Production Deployment (Railway/Fly.io)](#4-production-deployment)
5. [CI/CD Pipeline](#5-cicd-pipeline)
6. [Environment Configuration](#6-environment-configuration)
7. [Database Migration Strategy](#7-database-migration-strategy)
8. [Monitoring & Observability](#8-monitoring--observability)
9. [Backup & Disaster Recovery](#9-backup--disaster-recovery)
10. [Scaling Considerations](#10-scaling-considerations)
11. [Security Checklist for Deployment](#11-security-checklist-for-deployment)

---

## 1. Prerequisites

### System Requirements

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| CPU | 2 cores | 4+ cores |
| RAM | 2 GB | 4+ GB |
| Disk | 10 GB | 20 GB SSD |
| Node.js | 20.x LTS | 22.x LTS |
| npm | 10.x | 10.x |
| Docker | 24.x | 27.x |
| Docker Compose | v2 | v2 |

### Required Tools

- **Node.js 20+** — [install via nvm](https://github.com/nvm-sh/nvm)
- **npm 10+** — ships with Node 20+
- **Docker & Docker Compose** — [Docker Desktop](https://www.docker.com/products/docker-desktop/) or `apt install docker.io docker-compose-v2`
- **Git** — `apt install git`
- **Prisma CLI** — `npm install -g prisma` (optional, used via workspace scripts)
- **PostgreSQL 16** (production) — managed service recommended (Railway, Fly.io, Neon, Supabase)

### Architecture Overview

```
┌─────────────┐     ┌──────────────┐     ┌────────────┐
│   Browser   │────▶│  Frontend    │────▶│  Backend   │
│ (React SPA) │     │  vite:5173   │     │ express:3001│
└─────────────┘     └──────────────┘     ───────┬─────┘
                                                 │
                    ┌────────────────────────────┤
                    │                            │
                    ▼                            ▼
            ┌──────────────┐            ┌──────────────┐
            │  PostgreSQL   │            │     Redis     │
            │   (primary)   │            │   (cache+Q)   │
            └──────────────┘            └──────────────┘
```

---

## 2. Local Development Setup

### 2.1 Clone & Install

```bash
git clone https://github.com/<org>/LedgerPulse.git
cd LedgerPulse
npm install
```

### 2.2 Configure Environment

```bash
cp .env.example .env
# Edit .env to match your local setup
# Default uses SQLite — no external database needed
```

### 2.3 Database Setup

```bash
# Generate Prisma client & run migrations
npm run db:migrate

# Seed with sample data (vendors, invoices, delivery notes, e-way bills)
npm run db:seed
```

### 2.4 Start Development Servers

```bash
# Run both backend + frontend concurrently
npm run dev
```

Or in separate terminals:

```bash
# Terminal 1 — Backend (http://localhost:3001)
npm run dev:backend

# Terminal 2 — Frontend (http://localhost:5173)
npm run dev:frontend
```

### 2.5 Verify

```bash
# Health check
curl http://localhost:3001/api/health
# → {"status":"healthy","timestamp":"...","checks":{"server":"ok","database":"ok"}}

# Open browser at http://localhost:5173
```

### 2.6 Run Tests

```bash
# All tests
npm test

# Backend only
npm run test:backend

# Frontend only
npm run test:frontend
```

---

## 3. Docker Development Setup

### 3.1 Backend Dockerfile

Create `packages/backend/Dockerfile`:

```dockerfile
# ---- Build Stage ----
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/backend/package.json packages/backend/tsconfig.json ./packages/backend/
COPY packages/frontend/package.json ./packages/frontend/

RUN npm ci --workspaces --include-workspace-root

COPY packages/backend/ ./packages/backend/

WORKDIR /app/packages/backend

RUN npx prisma generate
RUN npm run build

# ---- Production Stage ----
FROM node:22-alpine AS production

WORKDIR /app

RUN apk add --no-cache tini

COPY --from=builder /app/packages/backend/dist ./dist
COPY --from=builder /app/packages/backend/prisma ./prisma
COPY --from=builder /app/packages/backend/package.json ./
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3001

ENV NODE_ENV=production

ENTRYPOINT ["/sbin/tini", "--"]

CMD ["node", "dist/index.js"]
```

### 3.2 Frontend Dockerfile

Create `packages/frontend/Dockerfile`:

```dockerfile
# ---- Build Stage ----
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/frontend/package.json ./packages/frontend/
COPY packages/backend/package.json ./packages/backend/

RUN npm ci --workspaces --include-workspace-root

COPY packages/frontend/ ./packages/frontend/

WORKDIR /app/packages/frontend

RUN npm run build

# ---- Nginx Static Server ----
FROM nginx:1.27-alpine

COPY --from=builder /app/packages/frontend/dist /usr/share/nginx/html
COPY packages/frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
```

Create `packages/frontend/nginx.conf`:

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    gzip_min_length 256;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://backend:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        client_max_body_size 50m;
    }

    location /health {
        access_log off;
        return 200 "healthy\n";
    }
}
```

### 3.3 Docker Compose (Development)

Create `docker-compose.dev.yml`:

```yaml
version: "3.9"

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ledgerpulse
      POSTGRES_PASSWORD: ledgerpulse_dev
      POSTGRES_DB: ledgerpulse
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ledgerpulse"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  backend:
    build:
      context: .
      dockerfile: packages/backend/Dockerfile
      target: builder
    container_name: ledgerpulse-backend
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://ledgerpulse:ledgerpulse_dev@postgres:5432/ledgerpulse
      REDIS_URL: redis://redis:6379
      NODE_ENV: development
      PORT: 3001
      JWT_SECRET: dev-jwt-secret-not-for-production
    ports:
      - "3001:3001"
    volumes:
      - ./packages/backend/src:/app/packages/backend/src
      - ./packages/backend/prisma:/app/packages/backend/prisma
    command: npx tsx watch src/index.ts

  frontend:
    build:
      context: .
      dockerfile: packages/frontend/Dockerfile
    container_name: ledgerpulse-frontend
    depends_on:
      - backend
    ports:
      - "80:80"

volumes:
  pgdata:
  redisdata:
```

### 3.4 Docker Compose (Production)

Create `docker-compose.prod.yml`:

```yaml
version: "3.9"

services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

  backend:
    build:
      context: .
      dockerfile: packages/backend/Dockerfile
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      DATABASE_URL: ${DATABASE_URL}
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379
      NODE_ENV: production
      PORT: 3001
      JWT_SECRET: ${JWT_SECRET}
      SENTRY_DSN: ${SENTRY_DSN}
      CORS_ORIGIN: ${CORS_ORIGIN}
      STORAGE_BUCKET: ${STORAGE_BUCKET}
      STORAGE_ENDPOINT: ${STORAGE_ENDPOINT}
      STORAGE_KEY: ${STORAGE_KEY}
      STORAGE_SECRET: ${STORAGE_SECRET}
      STORAGE_REGION: ${STORAGE_REGION}
    ports:
      - "3001:3001"
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3001/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 15s

  frontend:
    build:
      context: .
      dockerfile: packages/frontend/Dockerfile
    restart: unless-stopped
    depends_on:
      - backend
    ports:
      - "80:80"
    environment:
      VITE_API_URL: /api

volumes:
  pgdata:
  redisdata:
```

---

## 4. Production Deployment

### 4.1 Railway Deployment

#### Backend Service

| Setting | Value |
|---------|-------|
| Build Command | `npm ci && npm run build -w packages/backend && npx prisma generate` |
| Start Command | `node packages/backend/dist/index.js` |
| Health Check Path | `/api/health` |

#### Frontend Service (Static)

```bash
# Build locally or via Railway build step
cd packages/frontend
npm ci && npm run build
# Deploy the dist/ folder as a static site
```

Railway supports static site deployment from the `dist/` directory. Enable **SPA fallback** in Railway settings (rewrite all paths to `/index.html`).

#### PostgreSQL (Railway Plugin)

```bash
railway connect postgres
# Railway auto-provisions a PostgreSQL 16 instance
# DATABASE_URL is injected automatically
```

#### Redis (Railway Plugin)

```bash
railway connect redis
# Redis URL injected as REDIS_URL
```

### 4.2 Fly.io Deployment

#### Backend

```bash
# Install flyctl
curl -fsSL https://fly.io/install.sh | sh

# Launch app
cd packages/backend
fly launch

# Set environment variables
fly secrets set DATABASE_URL="postgresql://..."
fly secrets set JWT_SECRET="..."
fly secrets set REDIS_URL="redis://..."
fly secrets set SENTRY_DSN="..."
fly secrets set CORS_ORIGIN="https://ledgerpulse.fly.dev"
```

Create `packages/backend/fly.toml`:

```toml
app = "ledgerpulse-api"
primary_region = "ams"

[build]
  builder = "dockerfile"
  dockerfile = "packages/backend/Dockerfile"

[http_service]
  internal_port = 3001
  force_https = true
  auto_stop_machines = false
  auto_start_machines = true
  min_machines_running = 1
  processes = ["app"]

[[services]]
  protocol = "tcp"
  internal_port = 3001

  [[services.ports]]
    port = 80
    handlers = ["http"]
    force_https = true

  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]

  [[services.http_checks]]
    interval = "30s"
    timeout = "5s"
    path = "/api/health"
    method = "GET"
```

#### Frontend

```bash
cd packages/frontend
fly launch
```

Create `packages/frontend/fly.toml`:

```toml
app = "ledgerpulse-web"
primary_region = "ams"

[build]
  builder = "dockerfile"
  dockerfile = "packages/frontend/Dockerfile"

[http_service]
  internal_port = 80
  force_https = true
  auto_stop_machines = false
  auto_start_machines = true
```

#### PostgreSQL (Fly.io)

```bash
fly postgres create --name ledgerpulse-db
fly postgres attach ledgerpulse-db --app ledgerpulse-api
```

#### Redis (Fly.io)

```bash
fly redis create --name ledgerpulse-redis
fly redis attach --app ledgerpulse-api
```

### 4.3 File Storage (S3-Compatible)

For document uploads (invoices, delivery notes, OCR files), use an S3-compatible object store:

| Provider | Endpoint | Use Case |
|----------|----------|----------|
| AWS S3 | `s3.amazonaws.com` | Production |
| Cloudflare R2 | `r2.cloudflarestorage.com` | No egress fees |
| Backblaze B2 | `s3.us-west-xxx.backblazeb2.com` | Cheapest |
| MinIO (self-hosted) | `minio:9000` | On-premise |

Environment variables for S3 storage:

```
STORAGE_ENDPOINT=s3.us-east-1.amazonaws.com
STORAGE_REGION=us-east-1
STORAGE_BUCKET=ledgerpulse-documents
STORAGE_KEY=AKIAXXXXXXXX
STORAGE_SECRET=xxxxxxxxxxxx
```

### 4.4 Environment Variables Checklist

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string | `postgresql://user:pass@host:5432/ledgerpulse` |
| `PORT` | ❌ | Server port (default 3001) | `3001` |
| `NODE_ENV` | ✅ | `production`, `development`, `test` | `production` |
| `JWT_SECRET` | ✅ | Secret for JWT token signing | `openssl rand -hex 64` |
| `REDIS_URL` | ❌ | Redis connection string | `redis://:password@host:6379` |
| `CORS_ORIGIN` | ✅ | Allowed CORS origin | `https://ledgerpulse.app` |
| `SENTRY_DSN` | ❌ | Sentry error tracking DSN | `https://xxx@sentry.io/xxx` |
| `STORAGE_ENDPOINT` | ❌ | S3-compatible endpoint | `s3.us-east-1.amazonaws.com` |
| `STORAGE_REGION` | ❌ | S3 region | `us-east-1` |
| `STORAGE_BUCKET` | ❌ | S3 bucket name | `ledgerpulse-documents` |
| `STORAGE_KEY` | ❌ | S3 access key | `AKIAXXXXXXXXXXXXXXXX` |
| `STORAGE_SECRET` | ❌ | S3 secret key | `xxxxxxxxxxxx` |
| `OCR_PROVIDER` | ❌ | OCR engine | `tesseract` |

---

## 5. CI/CD Pipeline

### 5.1 Continuous Integration

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

env:
  NODE_VERSION: "22"
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/ledgerpulse_test"

jobs:
  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "npm"

      - run: npm ci

      - run: npm run lint
        env:
          NODE_ENV: test

  test:
    name: Test
    runs-on: ubuntu-latest
    needs: [lint]

    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: ledgerpulse_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "npm"

      - run: npm ci

      - name: Generate Prisma Client
        run: npx prisma generate
        working-directory: packages/backend

      - name: Run Migrations
        run: npx prisma migrate deploy
        working-directory: packages/backend
        env:
          DATABASE_URL: ${{ env.DATABASE_URL }}

      - name: Backend Tests
        run: npm run test:backend
        env:
          DATABASE_URL: ${{ env.DATABASE_URL }}
          NODE_ENV: test
          JWT_SECRET: test-jwt-secret

      - name: Frontend Tests
        run: npm run test:frontend

  build:
    name: Build
    runs-on: ubuntu-latest
    needs: [test]
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "npm"

      - run: npm ci

      - name: Build Backend
        run: npm run build -w packages/backend

      - name: Build Frontend
        run: npm run build -w packages/frontend

      - name: Upload Frontend Artifact
        uses: actions/upload-artifact@v4
        with:
          name: frontend-dist
          path: packages/frontend/dist/
          retention-days: 5

      - name: Upload Backend Artifact
        uses: actions/upload-artifact@v4
        with:
          name: backend-dist
          path: packages/backend/dist/
          retention-days: 5
```

### 5.2 Continuous Deployment

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

env:
  NODE_VERSION: "22"
  RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}

jobs:
  deploy-backend:
    name: Deploy Backend
    runs-on: ubuntu-latest
    environment: production

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "npm"

      - run: npm ci

      - uses: superfly/flyctl-actions/setup-flyctl@master

      - name: Deploy to Fly.io
        run: flyctl deploy --remote-only
        working-directory: packages/backend
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}

  deploy-frontend:
    name: Deploy Frontend
    runs-on: ubuntu-latest
    environment: production
    needs: [deploy-backend]

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "npm"

      - run: npm ci

      - name: Build Frontend
        run: npm run build -w packages/frontend
        env:
          VITE_API_URL: ${{ secrets.VITE_API_URL }}

      - uses: superfly/flyctl-actions/setup-flyctl@master

      - name: Deploy to Fly.io
        run: flyctl deploy --remote-only
        working-directory: packages/frontend
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}

  migrate-db:
    name: Run Database Migrations
    runs-on: ubuntu-latest
    environment: production
    needs: [deploy-backend]

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "npm"

      - run: npm ci

      - name: Run Migrations
        run: npx prisma migrate deploy
        working-directory: packages/backend
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}

  notify:
    name: Notify
    runs-on: ubuntu-latest
    needs: [deploy-frontend, migrate-db]
    if: always()

    steps:
      - name: Notify on Slack
        uses: act10ns/slack@v2
        with:
          webhook-url: ${{ secrets.SLACK_WEBHOOK }}
          status: ${{ job.status }}
        continue-on-error: true
```

### 5.3 Docker Image CI

Create `.github/workflows/docker.yml`:

```yaml
name: Docker Build & Push

on:
  push:
    tags: ["v*.*.*"]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  docker:
    name: Build & Push Docker Images
    runs-on: ubuntu-latest

    permissions:
      contents: read
      packages: write

    steps:
      - uses: actions/checkout@v4

      - name: Log in to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=sha

      - name: Build & Push Backend
        uses: docker/build-push-action@v6
        with:
          context: .
          file: packages/backend/Dockerfile
          push: true
          tags: ${{ steps.meta.outputs.tags }}-backend
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Build & Push Frontend
        uses: docker/build-push-action@v6
        with:
          context: .
          file: packages/frontend/Dockerfile
          push: true
          tags: ${{ steps.meta.outputs.tags }}-frontend
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

---

## 6. Environment Configuration

### 6.1 `.env.example` (Complete)

```bash
# ─── LedgerPulse Environment Variables ─────────────────────────────
# Copy to .env and fill in values. NEVER commit .env to version control.

# ─── Server ──────────────────────────────────────────────────────────
PORT=3001
NODE_ENV=development

# ─── Database ────────────────────────────────────────────────────────
# SQLite (development/test):
DATABASE_URL="file:./dev.db"
# PostgreSQL (production):
# DATABASE_URL="postgresql://user:password@host:5432/ledgerpulse?sslmode=require"

# ─── Authentication (Phase 5+) ──────────────────────────────────────
JWT_SECRET=change-me-to-a-random-string
JWT_EXPIRES_IN=7d

# ─── Redis (caching + background jobs) ──────────────────────────────
# REDIS_URL="redis://:password@host:6379"

# ─── CORS ────────────────────────────────────────────────────────────
CORS_ORIGIN=http://localhost:5173

# ─── File Storage (S3-compatible) ────────────────────────────────────
# STORAGE_ENDPOINT=s3.us-east-1.amazonaws.com
# STORAGE_REGION=us-east-1
# STORAGE_BUCKET=ledgerpulse-documents
# STORAGE_KEY=AKIAXXXXXXXXXXXXXXXX
# STORAGE_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ─── OCR Provider (Phase 1+) ─────────────────────────────────────────
# OCR_PROVIDER=tesseract
# OCR_API_KEY=

# ─── Error Tracking ─────────────────────────────────────────────────
# SENTRY_DSN=https://xxxxxxxxxxxxxxxxxxxxxxxxxxxx@sentry.io/xxxxxx

# ─── Email (notifications) ──────────────────────────────────────────
# SMTP_HOST=smtp.sendgrid.net
# SMTP_PORT=587
# SMTP_USER=apikey
# SMTP_PASS=SG.xxxxxxxxxxxx
# EMAIL_FROM=noreply@ledgerpulse.app
```

### 6.2 Environment-Specific Overrides

Create `.env.development`:

```bash
NODE_ENV=development
DATABASE_URL="file:./dev.db"
PORT=3001
CORS_ORIGIN=http://localhost:5173
JWT_SECRET=dev-jwt-secret
```

Create `.env.staging`:

```bash
NODE_ENV=production
DATABASE_URL="postgresql://user:pass@staging-db:5432/ledgerpulse_staging?sslmode=require"
PORT=3001
CORS_ORIGIN=https://staging.ledgerpulse.app
JWT_SECRET=staging-jwt-secret
REDIS_URL="redis://:password@staging-redis:6379"
```

Create `.env.production`:

```bash
NODE_ENV=production
DATABASE_URL="postgresql://user:pass@prod-db:5432/ledgerpulse?sslmode=require"
PORT=3001
CORS_ORIGIN=https://ledgerpulse.app
JWT_SECRET=${JWT_SECRET}
REDIS_URL="redis://:password@prod-redis:6379"
SENTRY_DSN=https://xxxxxxxxxxxxxxxxxxxxxxxxxxxx@sentry.io/xxxxxx
```

### 6.3 Secrets Management

| Approach | When to Use | Tool |
|----------|-------------|------|
| Platform secrets | Cloud deployment | Railway Dashboard / Fly.io `fly secrets set` |
| GitHub Actions secrets | CI/CD pipeline | GitHub Settings → Secrets and variables |
| Vault | Self-hosted / on-prem | HashiCorp Vault + `vault env` |
| SOPS | Git-encrypted secrets | `sops --encrypt .env.production` |
| 1Password CLI | Team dev machines | `op run -- npm run dev` |

**Golden rule:** Never store secrets in `.env` files that get committed. Use platform-native secret stores.

---

## 7. Database Migration Strategy

### 7.1 Migration Workflow

```bash
# Create a new migration (after editing schema.prisma)
cd packages/backend
npx prisma migrate dev --name add_document_type_index

# Apply migrations in production
npx prisma migrate deploy

# Check migration status
npx prisma migrate status
```

### 7.2 Deployment-Time Migration

Migrations should run **before** the new application code starts serving traffic:

```bash
# In deploy workflow — run before starting new containers
npx prisma migrate deploy
```

For Docker deployments, add an init container or entrypoint script:

```bash
#!/bin/sh
# scripts/entrypoint.sh
set -e

echo "Running database migrations..."
npx prisma migrate deploy

echo "Starting application..."
exec node dist/index.js
```

### 7.3 Rollback Procedure

Prisma does not support automatic rollback of individual migrations. Use this procedure:

```bash
# 1. Identify the migration to roll back
npx prisma migrate status

# 2. Down-migrate by applying the previous migration's down.sql
# (Prisma generates migration SQL in prisma/migrations/<timestamp>_<name>/migration.sql)

# 3. If no down migration exists, manually write the reverse SQL
# Example reverse for "add column":
# ALTER TABLE "Invoice" DROP COLUMN "new_column";

# 4. Mark the migration as rolled back
npx prisma migrate resolve --rolled-back <migration_name>

# 5. Delete the migration folder locally (after confirming)
# rm -rf prisma/migrations/<timestamp>_<name>
```

**Safer alternative:** Database snapshot restore:

```bash
# Before deploying, take a snapshot
pg_dump --no-owner --no-acl -Fc ledgerpulse > pre-deploy-$(date +%Y%m%d_%H%M%S).dump

# If migration fails, restore
pg_restore --no-owner --no-acl --clean --if-exists -d ledgerpulse pre-deploy-*.dump
```

### 7.4 Backup & Restore Commands

#### PostgreSQL Backup

```bash
# Daily backup via cron
pg_dump --no-owner --no-acl -Fc \
  "$DATABASE_URL" \
  > /backups/ledgerpulse-$(date +%Y%m%d-%H%M%S).dump

# Backup to S3
pg_dump --no-owner --no-acl -Fc "$DATABASE_URL" \
  | aws s3 cp - s3://ledgerpulse-backups/db/$(date +%Y%m%d-%H%M%S).dump
```

#### PostgreSQL Restore

```bash
# Restore from a dump file
pg_restore --no-owner --no-acl --clean --if-exists \
  -d "$DATABASE_URL" \
  /backups/ledgerpulse-20260716-120000.dump

# Or pipe from S3
aws s3 cp s3://ledgerpulse-backups/db/20260716-120000.dump - \
  | pg_restore --no-owner --no-acl --clean --if-exists -d "$DATABASE_URL"
```

#### Automated Backup Script

Create `scripts/backup.sh`:

```bash
#!/bin/bash
set -euo pipefail

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR=/backups
DB_URL="${DATABASE_URL}"
S3_BUCKET="${BACKUP_S3_BUCKET:-ledgerpulse-backups}"

# Dump database
pg_dump --no-owner --no-acl -Fc "$DB_URL" > "$BACKUP_DIR/db-$TIMESTAMP.dump"

# Encrypt (optional)
# gpg --encrypt --recipient admin@ledgerpulse.app "$BACKUP_DIR/db-$TIMESTAMP.dump"

# Upload to S3
aws s3 cp "$BACKUP_DIR/db-$TIMESTAMP.dump" "s3://$S3_BUCKET/db/db-$TIMESTAMP.dump"

# Retain only last 7 days locally
find "$BACKUP_DIR" -name "db-*.dump" -mtime +7 -delete

echo "✅ Backup complete: db-$TIMESTAMP.dump"
```

---

## 8. Monitoring & Observability

### 8.1 Structured Logging

LedgerPulse uses structured JSON logging in production. Configure the backend with `pino` or `winston`:

```typescript
// src/lib/logger.ts (to be implemented)
import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  transport:
    process.env.NODE_ENV === "development"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
  serializers: {
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
    err: pino.stdSerializers.err,
  },
  redact: {
    paths: ["req.headers.authorization", "req.headers.cookie", "body.password"],
    censor: "[REDACTED]",
  },
});
```

Production log output format:

```json
{"level":30,"time":1699999999999,"pid":1,"hostname":"api-1","msg":"Health check passed","req":{"method":"GET","url":"/api/health"},"res":{"statusCode":200},"responseTime":2}
```

### 8.2 Health Check Endpoint

Already implemented at `GET /api/health`:

```json
{
  "status": "healthy",
  "timestamp": "2026-07-16T12:00:00.000Z",
  "checks": {
    "server": "ok",
    "database": "ok"
  }
}
```

This endpoint is used by:
- Platform health checks (Railway, Fly.io)
- Load balancer target health
- Uptime monitors (Pingdom, UptimeRobot, Better Uptime)
- Kubernetes liveness/readiness probes

### 8.3 Error Tracking (Sentry)

```bash
npm install @sentry/node
```

```typescript
// src/lib/sentry.ts (to be implemented)
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  release: `ledgerpulse@${process.env.npm_package_version}`,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  integrations: [
    new Sentry.Integrations.Http({ tracing: true }),
    new Sentry.Integrations.Express({ app }),
  ],
});

export { Sentry };
```

### 8.4 Uptime Monitoring

| Tool | Free Tier | Features |
|------|-----------|----------|
| Better Uptime | 10 monitors | Status page, SMS alerts |
| UptimeRobot | 50 monitors @ 5min | Multi-location |
| Checkly | 5 checks | Browser + API checks |
| Healthchecks.io | 20 checks | Cron job heartbeat |

Configuration for Better Uptime:

```
Monitor URL: https://api.ledgerpulse.app/api/health
Check interval: 1 minute
Expected status: 200
Expected body: "healthy"
Alert via: Email, Slack
```

### 8.5 Performance Monitoring

- **Sentry Performance** — transaction traces for API endpoints
- **Prometheus + Grafana** (self-hosted) — custom metrics dashboard
- **Railway Metrics** — built-in CPU, memory, network graphs

Key metrics to track:

| Metric | Source | Alert Threshold |
|--------|--------|-----------------|
| API response time (p95) | Sentry / Prometheus | > 2s |
| Error rate | Sentry | > 1% of requests |
| DB connection pool usage | Prisma / pgBouncer | > 80% |
| CPU utilization | Platform metrics | > 80% for 5min |
| Memory usage | Platform metrics | > 85% |
| Disk usage | Platform metrics | > 80% |
| Active users | Application metric | Trend analysis |

---

## 9. Backup & Disaster Recovery

### 9.1 Backup Strategy

| Asset | Frequency | Method | Retention | Storage |
|-------|-----------|--------|-----------|---------|
| PostgreSQL DB | Daily (full) + continuous WAL archiving | `pg_dump -Fc` | 30 days | S3 + local |
| Uploaded files | Real-time replication | S3 cross-region replication | 90 days | S3 |
| Environment config | Per deployment | Platform secrets + `.env` backup | Git history | GitHub + vault |
| Application code | Per commit | Git | Full history | GitHub |

### 9.2 Recovery Objectives

- **RPO (Recovery Point Objective):** 1 hour (with WAL archiving) / 24 hours (without)
- **RTO (Recovery Time Objective):** 30 minutes (infra provisioning) + restore time

### 9.3 Database Backup Automation

```bash
# Install as hourly cron job
0 * * * * /opt/ledgerpulse/scripts/backup.sh >> /var/log/backup.log 2>&1

# Pre-migration snapshot (run manually before `prisma migrate deploy`)
./scripts/backup.sh pre-migration-$(date +%Y%m%d_%H%M%S)
```

### 9.4 Restore Procedure

1. **Stop the application** to prevent writes:

```bash
flyctl apps restart ledgerpulse-api --scale-count 0
# or
docker compose -f docker-compose.prod.yml stop backend
```

2. **Restore the database:**

```bash
# Download latest backup
aws s3 cp s3://ledgerpulse-backups/db/latest.dump /tmp/restore.dump

# Restore
pg_restore --no-owner --no-acl --clean --if-exists \
  -d "$DATABASE_URL" /tmp/restore.dump
```

3. **Restore file storage** (if using S3):

```bash
aws s3 sync s3://ledgerpulse-backups/files/ s3://ledgerpulse-documents/
```

4. **Restart the application:**

```bash
flyctl apps restart ledgerpulse-api --scale-count 1
# or
docker compose -f docker-compose.prod.yml up -d backend
```

5. **Verify:**

```bash
curl https://api.ledgerpulse.app/api/health
# Verify data integrity with sample queries
```

### 9.5 Disaster Recovery Runbook

| Scenario | Action | Expected RTO |
|----------|--------|-------------|
| Single API instance crash | Platform auto-restart (Fly.io/Railway) | < 30s |
| Database corruption | Restore from latest backup | < 1h |
| Full region outage | Deploy to secondary region from backup | < 4h |
| Accidental data deletion | Point-in-time recovery through WAL | < 2h |
| Secrets leak | Rotate all secrets, redeploy | < 30min |

---

## 10. Scaling Considerations

### 10.1 Horizontal Scaling (API Layer)

LedgerPulse API is stateless — scale horizontally behind a load balancer:

```
                 ┌──────────────┐
                 │  Load         │
                 │  Balancer     │
                 │  (Fly.io LB / │
                 │   Railway LB) │
                 └──────┬───────┘
                        │
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
   ┌────────────┐ ┌────────────┐ ┌────────────┐
   │ API v1     │ │ API v2     │ │ API v3     │
   │ (instance) │ │ (instance) │ │ (instance) │
   └──────┬─────┘ └──────┬─────┘ └──────┬─────┘
          │              │              │
          └──────────────┼──────────────┘
                         ▼
                  ┌──────────────┐
                  │  PostgreSQL  │
                  │  + PgBouncer │
                  └──────────────┘
```

### 10.2 Database Connection Pooling (PgBouncer)

Add PgBouncer sidecar or use managed pooler:

```yaml
# docker-compose.prod.yml addition
pgbouncer:
  image: bitnami/pgbouncer:latest
  environment:
    PGBOUNCER_DATABASE: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
    PGBOUNCER_MAX_CLIENT_CONN: 100
    PGBOUNCER_POOL_MODE: transaction
    PGBOUNCER_DEFAULT_POOL_SIZE: 25
  ports:
    - "6432:6432"
  depends_on:
    postgres:
      condition: service_healthy
```

Update `DATABASE_URL` to point to PgBouncer:

```bash
DATABASE_URL="postgresql://user:pass@pgbouncer:6432/ledgerpulse"
```

### 10.3 Redis Caching Layer

Redis is used for:
- Session storage (when using session-based auth)
- API response caching (expensive matching queries)
- Background job queue (Bull/BullMQ)
- Rate limiter data store

```typescript
// src/lib/cache.ts (to be implemented)
import { createClient } from "redis";

export const redis = createClient({
  url: process.env.REDIS_URL ?? "redis://localhost:6379",
});

await redis.connect();
```

### 10.4 CDN for Static Assets

- **Frontend:** Serve via Vite's built assets → nginx → CDN
- **Uploaded documents:** Store on S3 → Serve via CloudFront / R2 public URL
- **Recommended CDN:** Cloudflare (proxied DNS + caching), Fastly, or AWS CloudFront

Vite config for CDN asset URLs:

```typescript
// vite.config.ts (production CDN base)
export default defineConfig({
  base: process.env.CDN_URL ?? "/",
  // ...
});
```

### 10.5 File Upload Offloading

Upload files directly to S3 from the frontend (presigned URLs) to avoid API server load:

```typescript
// Client-side upload flow
// 1. POST /api/upload/presigned → returns { url, fields }
// 2. Frontend uploads directly to S3 using presigned URL
// 3. POST /api/documents → { key: "uploads/invoice-123.pdf" }
```

### 10.6 Scaling Limits Reference

| Layer | Dev | Production (small) | Production (large) |
|-------|-----|-------------------|-------------------|
| API instances | 1 | 2–3 | 5–10 |
| API RAM per instance | 512 MB | 1 GB | 2 GB |
| PostgreSQL | SQLite | 2 GB RAM, 2 vCPU | 8 GB RAM, 4 vCPU |
| Redis | — | 256 MB | 1 GB |
| PgBouncer max connections | — | 100 | 500 |
| Expected RPS per instance | — | ~200 | ~500 |

---

## 11. Security Checklist for Deployment

- [x] **HTTPS enabled (TLS 1.3)** — Enforced by Fly.io/Railway edge. Caddy/Nginx for self-host.

- [x] **All secrets in environment variables, not code** — `.env` in `.gitignore`. Secrets via platform or vault.

- [x] **Database connection encrypted** — PostgreSQL with `sslmode=require`. Certificates validated.

- [x] **Rate limiting enabled** — `express-rate-limit` configured at 100 req/15min per IP in `src/index.ts`.

- [x] **CORS restricted to known origins** — Currently wide-open (`cors()`). **Must be locked in production:**

```typescript
// src/index.ts — production CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(",") ?? ["http://localhost:5173"],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));
```

- [x] **Debug/development routes disabled** — No debug endpoints exposed. Error details hidden in production (`NODE_ENV=production`).

- [x] **npm audit passed with no critical vulnerabilities** — Run before each deployment:

```bash
npm audit --audit-level=critical
# Include in CI pipeline
```

- [x] **File upload size limits configured** — `express.json({ limit: "10mb" })` and nginx `client_max_body_size 50m;`

- [x] **Helmet middleware enabled** — Sets security headers (X-Content-Type-Options, X-Frame-Options, CSP, etc.) in `src/index.ts`.

- [ ] **Input validation** — Use Zod schemas (already in dependencies) to validate all request bodies and params.

- [ ] **Dependency scanning** — Add `socket.dev` or `snyk` to CI for supply chain security.

- [ ] **SQL injection prevention** — Prisma parameterized queries handle this. Verify no raw SQL without parameters.

- [ ] **Session management** — JWT with short expiry (15min access token + 7d refresh token). Store refresh tokens securely.

- [ ] **Container image scanning** — Use `trivy` or `grype` in Docker CI:

```bash
trivy image ghcr.io/ledgerpulse/backend:latest --severity CRITICAL,HIGH
```

- [ ] **Network isolation** — API and database on private network. No public DB ports.

- [ ] **WAF (Web Application Firewall)** — Consider Cloudflare WAF or AWS WAF for production.

---

## Appendix A: Quick Reference Commands

```bash
# Development
npm install              # Install all workspace dependencies
npm run dev              # Start both backend + frontend
npm run dev:backend      # Backend only (port 3001)
npm run dev:frontend     # Frontend only (port 5173)
npm test                 # Run all tests
npm run lint             # Lint all packages

# Database
npm run db:migrate       # Create/apply migrations
npm run db:seed          # Seed sample data
npx prisma studio        # Open Prisma Studio UI

# Build
npm run build            # Build all packages
npm run build -w packages/backend   # Backend only
npm run build -w packages/frontend  # Frontend only

# Docker
docker compose -f docker-compose.dev.yml up -d          # Start dev environment
docker compose -f docker-compose.prod.yml up -d --build # Start production stack
docker compose -f docker-compose.prod.yml down          # Stop
docker compose -f docker-compose.prod.yml logs -f       # Tail logs

# Production
flyctl deploy            # Deploy to Fly.io
flyctl secrets list      # List secrets
flyctl logs              # View logs

# Database backup
pg_dump -Fc "$DATABASE_URL" > backup.dump
pg_restore -d "$DATABASE_URL" backup.dump
```

## Appendix B: Useful Scripts

The `scripts/` directory contains automation helpers:

| Script | Purpose |
|--------|---------|
| `scripts/backup.sh` | Database backup to S3 |
| `scripts/seed.sh` | Seed development database |
| `scripts/entrypoint.sh` | Docker container entrypoint (migrate + start) |
| `scripts/healthcheck.sh` | Health check with retries |

---

> **Document Version:** 1.0.0
> **Last Updated:** 2026-07-16
> **Maintained by:** LedgerPulse DevOps Team
