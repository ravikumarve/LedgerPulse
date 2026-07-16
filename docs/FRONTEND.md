# LedgerPulse Frontend Architecture

> **Version:** 1.0.0  
> **Status:** Draft  
> **Last Updated:** 2026-07-16  
> **Tech Stack:** React 19 + TypeScript 5.6 + Tailwind CSS 4 + Vite 6

---

## Table of Contents

1. [Tech Stack Rationale](#1-tech-stack-rationale)
2. [Project Structure](#2-project-structure)
3. [Component Architecture](#3-component-architecture)
4. [State Management Strategy](#4-state-management-strategy)
5. [Page Specifications](#5-page-specifications)
6. [API Integration Layer](#6-api-integration-layer)
7. [Routing & Navigation](#7-routing--navigation)
8. [UI/UX Patterns](#8-uiux-patterns)
9. [Testing Strategy](#9-testing-strategy)
10. [Performance Optimization](#10-performance-optimization)

---

## 1. Tech Stack Rationale

### React 19 + TypeScript 5.6

**Why:** React 19 provides the latest concurrent features, improved server component support, and a mature ecosystem. TypeScript adds type safety across the entire component tree, catching API contract violations at compile time — critical for a financial reconciliation tool where type errors in numeric fields (amounts, tax, quantities) could cause costly miscalculations.

**Trade-offs considered:**
- **Solid.js** — Smaller bundle, finer-grained reactivity. Rejected due to smaller ecosystem, fewer UI libraries, and harder hiring.
- **Vue 3** — Simpler reactivity model. Rejected to maintain consistency with the Node/TypeScript monorepo and avoid splitting developer context.
- **Svelte 5** — Best DX for small apps. Rejected because the anticipated component complexity (data tables, wizards, matching charts) benefits from React's battle-tested patterns and library ecosystem.

### Tailwind CSS 4

**Why:** Utility-first CSS enables rapid UI iteration without context-switching to stylesheets. Tailwind v4's CSS-based configuration (`@import "tailwindcss"`) removes the PostCSS config overhead, simplifies builds, and provides first-class dark mode via `@variant dark`. The design system is enforced at the utility level rather than scattered across orphan CSS files.

**Trade-offs considered:**
- **CSS Modules** — Good scoping but no design system enforcement. Rejected for team velocity.
- **Styled Components** — Runtime CSS-in-JS cost. Rejected due to bundle size impact and React 19 concurrent mode compatibility concerns.
- **Panda CSS** — Zero-runtime, great DX. Rejected because Tailwind v4's CSS-first approach aligns better with Vite's native CSS handling.

### Vite 6

**Why:** Sub-second HMR, native TypeScript support (esbuild transpilation), and optimized production builds via Rollup. The single-file configuration (`vite.config.ts`) keeps the dev toolchain minimal.

**Trade-offs considered:**
- **Webpack** — Overly complex configuration. Rejected for developer velocity.
- **Turbopack** — Still maturing. Rejected for stability concerns in a production SaaS product.
- **Rsbuild** — Promising but unproven in the team's workflow.

---

## 2. Project Structure

```
packages/frontend/src/
├── components/
│   ├── ui/                    # Atomic design primitives
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Badge.tsx
│   │   ├── Input.tsx
│   │   ├── Select.tsx
│   │   ├── Modal.tsx
│   │   ├── Spinner.tsx
│   │   ├── Skeleton.tsx
│   │   ├── Toast.tsx
│   │   └── Tooltip.tsx
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   ├── Header.tsx
│   │   ├── PageLayout.tsx
│   │   └── Breadcrumbs.tsx
│   └── shared/
│       ├── DataTable.tsx
│       ├── FileUpload.tsx
│       ├── StatusBadge.tsx
│       ├── MetricCard.tsx
│       ├── EmptyState.tsx
│       ├── ErrorState.tsx
│       ├── ConfirmDialog.tsx
│       └── SearchInput.tsx
├── pages/
│   ├── Dashboard.tsx
│   ├── Invoices.tsx
│   ├── InvoiceDetail.tsx
│   ├── DeliveryNotes.tsx
│   ├── DeliveryNoteDetail.tsx
│   ├── EWayBills.tsx
│   ├── EWayBillDetail.tsx
│   ├── MatchingConsole.tsx
│   ├── MatchResultDetail.tsx
│   ├── DiscrepancyReview.tsx
│   └── Settings.tsx
├── hooks/
│   ├── useApi.ts
│   ├── useAuth.ts
│   ├── useDebounce.ts
│   ├── usePagination.ts
│   ├── useFilters.ts
│   ├── useWebSocket.ts
│   └── useToast.ts
├── services/
│   ├── apiClient.ts           # Axios/fetch instance with interceptors
│   ├── invoices.ts
│   ├── deliveryNotes.ts
│   ├── ewayBills.ts
│   ├── vendors.ts
│   ├── matching.ts
│   └── discrepancies.ts
├── store/
│   ├── AuthContext.tsx
│   ├── ThemeContext.tsx
│   ├── ToastStore.ts
│   └── FilterStore.ts
├── types/
│   ├── api.ts                 # ApiResponse<T>, PaginationMeta, ApiError
│   ├── invoice.ts
│   ├── deliveryNote.ts
│   ├── ewayBill.ts
│   ├── vendor.ts
│   ├── matching.ts
│   ├── discrepancy.ts
│   └── common.ts              # DocumentStatus, enums
├── utils/
│   ├── formatCurrency.ts
│   ├── formatDate.ts
│   ├── validators.ts
│   ├── cn.ts                  # clsx + tailwind-merge helper
│   └── constants.ts
├── tests/
│   ├── setup.ts
│   ├── components/
│   ├── pages/
│   ├── hooks/
│   └── fixtures/              # Test data factories
├── App.tsx
├── main.tsx
├── index.css
└── vite-env.d.ts
```

### Directory Responsibilities

| Directory | Purpose |
|-----------|---------|
| `components/ui/` | Leaf-level primitives — no business logic, no API calls. Accept only presentational props. |
| `components/layout/` | Page shell components — sidebar, header, responsive wrappers. |
| `components/shared/` | Composed domain components — DataTable, FileUpload, StatusBadge. May consume context but never call services directly. |
| `pages/` | Route-level components. Compose layouts + shared components. Handle data fetching and orchestration. |
| `hooks/` | Custom React hooks encapsulating stateful logic — API calls, pagination, form state, debouncing. |
| `services/` | Thin wrappers around the API client. Each module exports typed async functions for its domain. |
| `store/` | Client-side state — React Context for auth/theme, Zustand for UI state like toasts and active filters. |
| `types/` | Shared TypeScript interfaces mirroring the API response shapes. One file per domain entity. |
| `utils/` | Pure functions with zero React dependencies. Date formatting, currency formatting, CSS class merging. |

---

## 3. Component Architecture

### Atomic Design Principles

```
atoms (ui/) → molecules (shared/) → organisms (pages/) → templates (layout/) → pages
```

| Level | Examples | Dependencies |
|-------|----------|-------------|
| **Atoms** | Button, Input, Badge, Spinner, Skeleton | None (pure HTML/CSS) |
| **Molecules** | SearchInput (Input + Button), StatusBadge (Badge + icon), MetricCard (Card + typography) | Atoms only |
| **Organisms** | DataTable, FileUpload, ConfirmDialog | Molecules + services/hooks |
| **Templates** | PageLayout, Sidebar + Header composition | Layout components |
| **Pages** | Dashboard, InvoiceDetail | All of the above + data fetching |

### Component Hierarchy — Key Pages

```
Dashboard
├── PageLayout
│   ├── Header (user info, notifications)
│   └── Sidebar (nav links)
├── MetricCard (×3: Invoices, Match Rate, Discrepancies)
├── DataTable (Recent Discrepancies)
│   ├── StatusBadge (per row)
│   └── Badge (severity)
└── Chart (Match Rate over time — Recharts or Tremor)

InvoiceDetail
├── PageLayout
├── Card (Invoice metadata — vendor, number, date, amount)
├── DataTable (Line Items)
│   └── Badge (HSN code)
├── DataTable (Linked Delivery Notes)
│   └── StatusBadge
├── DataTable (Linked E-Way Bills)
│   └── StatusBadge
├── DataTable (Match Results)
│   ├── StatusBadge (MATCHED/PARTIAL/MISMATCH)
│   └── Button (View Details)
└── Button (Re-process OCR / Run Match)
```

### Props Interface Conventions

Every component props interface follows these rules:

1. **Named export for the type**, `ComponentNameProps` convention.
2. **`children` always `ReactNode`** when the component acts as a wrapper.
3. **`className` always optional `string`** for composition via `cn()` utility.
4. **Boolean props default to `false`** and are never made required.

```typescript
// Good
interface ButtonProps {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}

// Bad — avoid
interface ButtonProps {
  children: ReactNode;
  variant: ButtonVariant;        // required — no default
  onClick: () => void;           // required — breaks storybook/integration
}
```

### Composition Patterns

- **Slot pattern** for flexible layouts (e.g., `PageLayout` accepts `sidebar`, `header`, `children` slots).
- **Render props** avoided in favor of compound components (e.g., `DataTable.Column`).
- **Wrapper components** never modify their children's props — use context or render props if needed.
- **`cn()` utility** merges Tailwind classes without conflicts:

```typescript
// utils/cn.ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

---

## 4. State Management Strategy

### Three Layers of State

| State Type | Technology | Scope | Examples |
|------------|-----------|-------|----------|
| **Server state** | TanStack Query (React Query v5) | API cache, background refetch, optimistic updates | Invoice list, match results, vendor list |
| **Client/UI state** | Zustand | Cross-component transient state | Toast queue, sidebar open/closed, active filters |
| **Form state** | React Hook Form | Form input values, validation | Manual invoice creation, vendor edit, settings |
| **Auth state** | React Context | Global auth token, user object | JWT token, tenant ID, permissions |

### TanStack Query Usage

- All `GET` requests go through `useQuery` with stale times:
  - **Reference data** (vendors, status enums): `staleTime: 5 * 60 * 1000` (5 min)
  - **List data** (invoices, DNs, EWBs): `staleTime: 30_000` (30 sec)
  - **Detail data** (single invoice with matches): `staleTime: 10_000` (10 sec)
- Mutations use `useMutation` with `onSuccess` invalidating the relevant list queries.
- Paginated queries use `keepPreviousData: true` to avoid layout shifts.
- Query keys follow `[domain, action, params]` convention:

```typescript
["invoices", "list", { page, perPage, status, vendorId }]
["invoices", "detail", invoiceId]
["matching", "results", { status, page }]
```

### Zustand Store Patterns

- Separate stores by domain — `useToastStore`, `useFilterStore`, `useSidebarStore`.
- Actions are colocated with state.
- No nested selectors — prefer flat state shapes.

```typescript
interface ToastStore {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
}
```

### React Context

- Only for truly global, rarely-changing state: auth, theme.
- Context value is memoized — never create new objects on every render.
- Auth context provides `user`, `token`, `login()`, `logout()`, `isAuthenticated`.

### Form State Rules

- React Hook Form with Zod validation schemas shared with backend types.
- Forms never store data directly in Zustand or Context — submit via mutations.
- File uploads tracked via `useFileUpload` hook wrapping `FormData` creation.

---

## 5. Page Specifications

### Dashboard

| Property | Description |
|----------|-------------|
| **Route** | `/` |
| **Purpose** | High-level overview — total documents ingested, match rate, recent discrepancies |
| **Components** | `PageLayout`, `MetricCard` (×3), `DataTable` (Recent Discrepancies), Chart (match rate trend) |
| **API endpoints** | `GET /api/v1/discrepancies/stats`, `GET /api/v1/discrepancies?perPage=5&resolved=false` |
| **States** | |
| Loading | 3 skeleton MetricCards + skeleton table rows |
| Empty | MetricCards show zero values, empty state: "No discrepancies — all documents matched" |
| Error | MetricCards show "—", error banner with retry button |
| Success | Live data with Chart showing 7/30-day match rate trend |

### Invoices List

| Property | Description |
|----------|-------------|
| **Route** | `/invoices` |
| **Purpose** | Browse, filter, and search ingested invoices |
| **Components** | `PageLayout`, `DataTable`, `SearchInput`, `Select` (status filter), `Select` (vendor filter), `Badge` (count), `Button` (Upload) |
| **API endpoints** | `GET /api/v1/invoices?page=&perPage=&status=&vendorId=&q=&from=&to=` |
| **Route params** | — |
| **Query params** | `page`, `perPage`, `status`, `vendorId`, `q`, `from`, `to`, `sortBy`, `sortOrder` |
| **States** | |
| Loading | `Skeleton` rows in DataTable |
| Empty | `EmptyState` illustration: "Upload your first invoice to get started" + Upload button |
| Error | `ErrorState` banner with retry |
| Success | Paginated table with status badges, sortable columns |

### Invoice Detail

| Property | Description |
|----------|-------------|
| **Route** | `/invoices/:id` |
| **Purpose** | Full invoice view with line items, linked documents, and match results |
| **Components** | `PageLayout`, `Card` (metadata header), `DataTable` (Line Items), `DataTable` (Linked DNs), `DataTable` (Linked EWBs), `DataTable` (Match Results), `Button` (Re-process, Run Match) |
| **API endpoints** | `GET /api/v1/invoices/:id` |
| **Route params** | `id` — invoice UUID |
| **Query params** | — |
| **States** | |
| Loading | `Skeleton` for metadata card + 3 skeleton tables |
| Empty | N/A — invoice always exists at this point (404 handled separately) |
| Error | 404 → "Invoice not found" with back link; 500 → error banner with retry |
| Success | Full detail with expandable line items, linked documents section, match result summary |

### Delivery Notes List

| Property | Description |
|----------|-------------|
| **Route** | `/delivery-notes` |
| **Purpose** | Browse, filter, and search delivery notes |
| **Components** | `PageLayout`, `DataTable`, `SearchInput`, `Select` (status, vendor filters), `Button` (Upload) |
| **API endpoints** | `GET /api/v1/delivery-notes?page=&perPage=&status=&vendorId=&invoiceId=` |
| **States** | Loading skeleton rows → Empty state → Paginated table (same pattern as Invoices List) |

### Delivery Note Detail

| Property | Description |
|----------|-------------|
| **Route** | `/delivery-notes/:id` |
| **Purpose** | Full delivery note view — line items, weightbridge data, linked invoice |
| **Components** | `PageLayout`, `Card` (metadata), `DataTable` (Line Items), `Card` (Weightbridge info), `Card` (Linked Invoice) |
| **API endpoints** | `GET /api/v1/delivery-notes/:id` |
| **Route params** | `id` — DN UUID |
| **Notable** | Weightbridge data shown as key-value pairs in a `Card`; `totalQuantity` displayed prominently |

### E-Way Bills List

| Property | Description |
|----------|-------------|
| **Route** | `/eway-bills` |
| **Purpose** | Browse synced E-Way Bills from GST portal; trigger manual sync |
| **Components** | `PageLayout`, `DataTable`, `SearchInput`, `Button` (Sync Now), `Badge` (validity status) |
| **API endpoints** | `GET /api/v1/eway-bills?page=&status=&invoiceId=`, `POST /api/v1/eway-bills/sync` |
| **States** | |
| Loading | Skeleton rows |
| Empty | "No E-Way Bills found. Sync from GST portal." + Sync button |
| Syncing | Sync button shows spinner, progress indicator, "Sync in progress..." |
| Error | Sync failure toast; list fetch error banner |
| Success | Table with validity badges (valid/expiring soon/expired), sync date column |

### E-Way Bill Detail

| Property | Description |
|----------|-------------|
| **Route** | `/eway-bills/:id` |
| **Purpose** | Full E-Way Bill detail with raw data and linked invoice |
| **Components** | `PageLayout`, `Card` (EWB metadata), `Card` (transport details), `Card` (Linked Invoice) |
| **API endpoints** | `GET /api/v1/eway-bills/:id` |
| **Route params** | `id` — EWB UUID |

### Matching Console

| Property | Description |
|----------|-------------|
| **Route** | `/matching` |
| **Purpose** | Trigger 3-way matching runs, view match results |
| **Components** | `PageLayout`, `Card` (Run Match form — select invoice, optional DNs/EWBs), `DataTable` (Match Results), `Button` (Run Match), `StatusBadge` |
| **API endpoints** | `POST /api/v1/matching/run`, `GET /api/v1/matching/results?page=&status=` |
| **States** | |
| Loading | Form skeleton + table skeleton |
| Empty (results) | "No match results yet. Run a match to begin." |
| Matching | Form disabled, "Running 3-way matching..." spinner |
| Error | Match failure toast with error details |
| Success | Match result rows with score bars, status badges, discrepancy count |

### Match Result Detail

| Property | Description |
|----------|-------------|
| **Route** | `/matching/results/:id` |
| **Purpose** | Deep dive into a single match — side-by-side comparison, full discrepancy list |
| **Components** | `PageLayout`, `Card` (match score gauge), `DataTable` (Discrepancies), `Card` (Invoice vs DN vs EWB comparison panel) |
| **API endpoints** | `GET /api/v1/matching/results/:id` |
| **Notable** | Side-by-side comparison renders Invoice + DN + EWB details in a 3-column grid; each discrepancy row has `resolve` action |

### Discrepancy Review

| Property | Description |
|----------|-------------|
| **Route** | `/discrepancies` |
| **Purpose** | Review, resolve, and dispute flagged discrepancies |
| **Components** | `PageLayout`, `DataTable` (filterable by severity/type/resolved), `Modal` (resolve form), `ConfirmDialog` (dispute generation) |
| **API endpoints** | `GET /api/v1/discrepancies?page=&severity=&type=&resolved=`, `PUT /api/v1/discrepancies/:id/resolve`, `POST /api/v1/discrepancies/:id/dispute` |
| **States** | |
| Loading | Skeleton rows |
| Empty | "No discrepancies — all documents matched cleanly." |
| Error | Error banner with retry |
| Resolving | Optimistic UI — row grays out, spinner on resolve button |
| Success | Filterable table, inline severity badges, resolve modal with resolution textarea |

### Settings

| Property | Description |
|----------|-------------|
| **Route** | `/settings` |
| **Purpose** | API keys, vendor management, user preferences, tenant configuration |
| **Components** | `PageLayout`, `Tabs` (API Keys / Vendors / Preferences), `DataTable` (vendors), `Modal` (add/edit vendor), `Input`, `Select` |
| **API endpoints** | `GET /api/v1/vendors`, `POST /api/v1/vendors`, `PUT /api/v1/vendors/:id`, `DELETE /api/v1/vendors/:id` |
| **States** | |
| Loading | Tab content skeleton |
| Empty (vendors) | "No vendors configured. Add your first vendor." |
| Error | Inline error per tab section |
| Success | Tab-based settings with CRUD for vendors, API key display, theme toggle, notification prefs |

---

## 6. API Integration Layer

### Axios Client Setup

```typescript
// services/apiClient.ts
import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";

const apiClient = axios.create({
  baseURL: "/api/v1",
  headers: { "Content-Type": "application/json" },
  timeout: 15_000,
});

// Request interceptor — attach auth token
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAuthToken(); // from Zustand or localStorage
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  config.headers["Accept-Version"] = "v1";
  return config;
});

// Response interceptor — unwrap envelope, handle errors
apiClient.interceptors.response.use(
  (response) => response.data, // unwrap ApiResponse<T>
  (error: AxiosError<ApiResponse<null>>) => {
    if (error.response?.status === 401) {
      logout(); // redirect to login
    }
    return Promise.reject(normalizeError(error));
  }
);
```

### Error Handling Pattern

```typescript
// Normalize API errors into a typed structure
interface NormalizedError {
  code: string;
  message: string;
  details?: FieldError[];
  status: number;
}

function normalizeError(error: AxiosError<ApiResponse<null>>): NormalizedError {
  const data = error.response?.data;
  return {
    code: data?.error?.code ?? "UNKNOWN_ERROR",
    message: data?.error?.message ?? error.message,
    details: data?.error?.details,
    status: error.response?.status ?? 0,
  };
}
```

### Service Module Pattern (example: invoices)

```typescript
// services/invoices.ts
import apiClient from "./apiClient";
import type { InvoiceSummary, InvoiceDetail } from "../types/invoice";
import type { PaginationParams, ApiResponse } from "../types/api";

interface InvoiceListParams extends PaginationParams {
  status?: DocumentStatus;
  vendorId?: string;
  q?: string;
  from?: string;
  to?: string;
}

export async function fetchInvoices(params: InvoiceListParams) {
  const response = await apiClient.get<ApiResponse<InvoiceSummary[]>>(
    "/invoices",
    { params }
  );
  return response.data;
}

export async function fetchInvoice(id: string) {
  const response = await apiClient.get<ApiResponse<InvoiceDetail>>(
    `/invoices/${id}`
  );
  return response.data;
}

export async function uploadInvoice(formData: FormData) {
  const response = await apiClient.post<ApiResponse<UploadResponse>>(
    "/invoices/upload",
    formData,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  return response.data;
}
```

### Authentication Token Management

- Token stored in Zustand `useAuthStore` (persisted to `localStorage` via Zustand middleware).
- On 401 response interceptor: clear token, redirect to `/login`.
- Login flow: `POST /api/v1/auth/login` → store token + user → redirect to `/`.
- Refresh token flow: `POST /api/v1/auth/refresh` with retry queue to avoid race conditions.

### Request/Response Type Contracts

Every service function returns the unwrapped `data` field from the `ApiResponse<T>` envelope. Mutations return the full response object. All types mirror the API spec exactly, located in `types/`:

```typescript
// types/api.ts — shared envelope
interface ApiResponse<T> {
  data: T | null;
  meta: PaginationMeta | null;
  error: ApiError | null;
}

interface PaginationMeta {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}
```

---

## 7. Routing & Navigation

### Route Configuration

```typescript
// App.tsx
import { Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "./components/layout/ProtectedRoute";
import { PageLayout } from "./components/layout/PageLayout";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Invoices = lazy(() => import("./pages/Invoices"));
const InvoiceDetail = lazy(() => import("./pages/InvoiceDetail"));
const DeliveryNotes = lazy(() => import("./pages/DeliveryNotes"));
const DeliveryNoteDetail = lazy(() => import("./pages/DeliveryNoteDetail"));
const EWayBills = lazy(() => import("./pages/EWayBills"));
const EWayBillDetail = lazy(() => import("./pages/EWayBillDetail"));
const MatchingConsole = lazy(() => import("./pages/MatchingConsole"));
const MatchResultDetail = lazy(() => import("./pages/MatchResultDetail"));
const DiscrepancyReview = lazy(() => import("./pages/DiscrepancyReview"));
const Settings = lazy(() => import("./pages/Settings"));
const Login = lazy(() => import("./pages/Login"));

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<PageLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/invoices" element={<Invoices />} />
          <Route path="/invoices/:id" element={<InvoiceDetail />} />
          <Route path="/delivery-notes" element={<DeliveryNotes />} />
          <Route path="/delivery-notes/:id" element={<DeliveryNoteDetail />} />
          <Route path="/eway-bills" element={<EWayBills />} />
          <Route path="/eway-bills/:id" element={<EWayBillDetail />} />
          <Route path="/matching" element={<MatchingConsole />} />
          <Route path="/matching/results/:id" element={<MatchResultDetail />} />
          <Route path="/discrepancies" element={<DiscrepancyReview />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
```

### Protected Route Component

```typescript
function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <FullPageSpinner />;
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />;
  return <Outlet />;
}
```

### Navigation Sidebar Structure

```
LedgerPulse
├── Dashboard          → /
├── Invoices           → /invoices
├── Delivery Notes     → /delivery-notes
├── E-Way Bills        → /eway-bills
├── Matching Console   → /matching
├── Discrepancies      → /discrepancies
└── Settings           → /settings
```

The sidebar highlights the active route using `useLocation()`. A collapsible section for "Documents" groups Invoices, Delivery Notes, and E-Way Bills. "Operations" groups Matching Console and Discrepancies.

---

## 8. UI/UX Patterns

### Tailwind CSS Theme Configuration (via CSS, Tailwind v4)

```css
/* index.css — Tailwind v4 CSS-first config */
@import "tailwindcss";

@theme {
  --color-primary-50: #eff6ff;
  --color-primary-100: #dbeafe;
  --color-primary-200: #bfdbfe;
  --color-primary-300: #93c5fd;
  --color-primary-400: #60a5fa;
  --color-primary-500: #3b82f6;
  --color-primary-600: #2563eb;
  --color-primary-700: #1d4ed8;
  --color-primary-800: #1e40af;
  --color-primary-900: #1e3a8a;

  --color-success: #16a34a;
  --color-warning: #d97706;
  --color-danger: #dc2626;
  --color-neutral: #6b7280;

  --color-status-matched: #16a34a;
  --color-status-partial: #d97706;
  --color-status-mismatch: #dc2626;
  --color-status-pending: #6b7280;
  --color-status-processed: #3b82f6;

  --font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-mono: "JetBrains Mono", "Fira Code", monospace;
}
```

### Dark Mode Strategy

- Tailwind v4 dark mode via `@variant dark` in CSS.
- Toggle stored in `useThemeStore` (Zustand, persisted to localStorage).
- Default: system preference via `prefers-color-scheme: dark` media query.
- Apply `dark` class to `<html>` element via `useEffect`:

```typescript
// ThemeProvider component
useEffect(() => {
  document.documentElement.classList.toggle("dark", isDark);
}, [isDark]);
```

### Responsive Layout

- **Mobile** (<768px): Sidebar hidden behind hamburger menu; layout is single-column stack.
- **Tablet** (768-1024px): Sidebar collapses to icon-only; 2-column grids.
- **Desktop** (>1024px): Full sidebar with labels; 3-column grids for dashboards.

```tsx
// PageLayout responsive structure
<div className="flex h-screen">
  <Sidebar className="hidden lg:flex lg:w-64" />
  <MobileSidebar className="lg:hidden" />  {/* hamburger drawer */}
  <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
    <Header />
    {children}
  </main>
</div>
```

### Loading Skeletons

- `Skeleton` atom: animated pulse placeholder with configurable dimensions.
- Every page defines a skeleton variant matching its layout shape.
- DataTable skeleton: 5 rows of pulsing columns proportional to real column widths.
- MetricCard skeleton: 3 rectangular blocks matching card dimensions.

```typescript
// Skeleton component
interface SkeletonProps {
  className?: string;
  variant?: "text" | "circle" | "rect";
}
```

### Toast Notifications

- Global toast container rendered in `PageLayout`.
- Auto-dismiss after 5 seconds (configurable per toast).
- Types: `success` (green), `error` (red), `warning` (amber), `info` (blue).
- Stacked vertically in top-right corner with enter/exit animations.

```typescript
// Usage in mutations
const mutation = useMutation({
  mutationFn: () => resolveDiscrepancy(id, payload),
  onSuccess: () => {
    addToast({ type: "success", message: "Discrepancy resolved" });
    queryClient.invalidateQueries({ queryKey: ["discrepancies"] });
  },
  onError: (error) => addToast({ type: "error", message: error.message }),
});
```

---

## 9. Testing Strategy

### Testing Stack

| Tool | Purpose |
|------|---------|
| **Vitest** | Test runner (native Vite integration) |
| **React Testing Library** | Component rendering and interaction |
| **jest-dom** | DOM-specific matchers (`toBeInTheDocument`, `toHaveClass`) |
| **jsdom** | Browser-like environment |
| **MSW** (planned) | API mock server for integration tests |
| **axe-core** (planned) | Automated accessibility audits |

### Component Testing

```typescript
// tests/components/StatusBadge.test.tsx
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "../../components/shared/StatusBadge";

describe("StatusBadge", () => {
  it("renders matched status with green styling", () => {
    render(<StatusBadge status="MATCHED" />);
    const badge = screen.getByText("Matched");
    expect(badge).toHaveClass("text-green-700", "bg-green-50");
  });

  it("renders mismatch status with red styling", () => {
    render(<StatusBadge status="MISMATCH" />);
    const badge = screen.getByText("Mismatch");
    expect(badge).toHaveClass("text-red-700", "bg-red-50");
  });
});
```

### Integration Testing (key flows)

1. **Dashboard loads and displays stats**: Mock `/discrepancies/stats` → verify MetricCards render with correct values.
2. **Invoice list filtering**: Navigate to `/invoices`, click status filter, verify API called with correct params.
3. **Match run and result display**: Select invoice, click "Run Match", verify loading state, verify result table appears.
4. **Discrepancy resolution flow**: Click resolve, fill form, submit, verify toast, verify row updated.

### Page Smoke Tests

```typescript
// tests/pages/Dashboard.test.tsx
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import Dashboard from "../../pages/Dashboard";

describe("Dashboard", () => {
  it("renders stat cards", () => {
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    expect(screen.getByText("Invoices")).toBeInTheDocument();
    expect(screen.getByText("Match Rate")).toBeInTheDocument();
    expect(screen.getByText("Discrepancies")).toBeInTheDocument();
  });
});
```

### Coverage Targets

| Metric | Target |
|--------|--------|
| **Component coverage** | 80% of `components/ui/` and `components/shared/` |
| **Page smoke tests** | 100% of pages render without crashing |
| **Integration flows** | 5 core flows: Dashboard load, Invoice list filter, Detail view, Match run, Discrepancy resolve |
| **Accessibility** | No axe-core violations on any page |
| **Global line coverage** | >70% |

---

## 10. Performance Optimization

### Code Splitting

Every page is lazily loaded via `React.lazy()` + `Suspense` with a `Spinner` fallback:

```typescript
const Dashboard = lazy(() => import("./pages/Dashboard"));
const InvoiceDetail = lazy(() => import("./pages/InvoiceDetail"));
```

Route-level chunks are generated automatically by Vite Rollup with content hashing for long-term caching. No manual chunking configuration needed.

### Bundle Size Budget

| Asset | Budget | Current |
|-------|--------|---------|
| **Initial JS (gzip)** | <80 KB | — |
| **Initial CSS (gzip)** | <15 KB | — |
| **Lazy chunk (max)** | <50 KB | — |
| **Total JS (all routes)** | <250 KB | — |

Enforced via `vite.config.ts` with `rollupOptions.output.chunkFileNames` and a CI check using `bundlesize` or `size-limit`.

### Image/Asset Optimization

- SVGs for icons and illustrations (inline or as React components via `vite-plugin-svgr`).
- PDF thumbnails generated server-side — never render PDFs in the browser.
- No heavy image dependencies — all icons via `lucide-react` (tree-shakeable) or inline SVG components.
- Fonts: Inter (variable) self-hosted via `@fontsource/inter` or WOFF2 in `public/fonts/`.

### Memoization Strategy

| Pattern | When to Use |
|---------|-------------|
| **`React.memo()`** | Pure presentational components rendered in lists (DataTable rows, MetricCards) |
| **`useMemo()`** | Expensive derived data — filtered/sorted arrays, formatted currency/date arrays |
| **`useCallback()`** | Callback props passed to memoized children, especially in table row renderers |
| **Never memoize** | Components with `children` prop, components that consume context directly |

### DataTable Virtualization

For lists exceeding 100 rows, the `DataTable` component switches to virtualized rendering (via `@tanstack/react-virtual`) to keep DOM nodes minimal. This is configurable via a `virtualize` prop:

```typescript
<DataTable data={invoices} virtualize={invoices.length > 100} />
```

### Network Optimization

- **Request batching**: TanStack Query's `gcTime` and `staleTime` prevent redundant fetches.
- **Pagination**: Server-side pagination with `keepPreviousData` avoids full re-fetches.
- **Prefetching**: Hovering sidebar links prefetches the lazy chunk and query data.
- **Debounced search**: `useDebounce` hook (300ms) before firing search queries.

---

## Appendix: Dependency Map

```
Package                     Purpose
─────────────────────────────────────────────────
react                       UI library
react-dom                   DOM renderer
react-router-dom            Client-side routing
tailwindcss                 Utility-first CSS
@vitejs/plugin-react        Vite React transform
typescript                  Type checking

--- To be added in Phase 1 ---
@tanstack/react-query       Server state management (v5)
zustand                     Client state management (v5)
axios                       HTTP client
react-hook-form             Form state management
zod                         Schema validation (shared with backend)
clsx + tailwind-merge       CSS class merging
lucide-react                Icons
recharts or tremor          Charts
@tanstack/react-virtual     Virtualized tables
msw (dev)                   API mocking for tests
vitest                      Test runner
@testing-library/react      Component testing
@testing-library/jest-dom   DOM matchers
axe-core (dev)              Accessibility audits
```
