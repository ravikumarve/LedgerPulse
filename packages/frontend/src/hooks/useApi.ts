const BASE_URL = "/api";

export interface ApiResponse<T> {
  data: T;
  meta?: Record<string, unknown>;
}

async function fetchApi<T>(
  path: string,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  const body = await res.json();

  if (!res.ok) {
    throw new ApiError(body.error ?? "Request failed", res.status, body.code);
  }

  return body;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ── Typed API ─────────────────────────────────────────────────────

export interface MatchStats {
  totalMatches: number;
  matched: number;
  partial: number;
  mismatched: number;
  matchRate: number;
  pendingReview: number;
  resolved: number;
  documents: {
    invoices: number;
    deliveryNotes: number;
    ewayBills: number;
  };
}

export interface MatchResultSummary {
  id: string;
  invoiceId: string;
  deliveryNoteId: string | null;
  ewayBillId: string | null;
  matchScore: number;
  status: "MATCHED" | "PARTIAL" | "MISMATCH";
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  invoice: {
    id: string;
    invoiceNumber: string;
    totalAmount: number;
  };
  deliveryNote: { id: string; deliveryNoteNumber: string } | null;
  ewayBill: { id: string; ewayBillNumber: string; totalValue: number } | null;
}

export interface MatchResultDetail extends MatchResultSummary {
  discrepancies: Discrepancy[];
  invoice: MatchResultSummary["invoice"] & {
    vendor: { id: string; name: string; gstin: string };
  };
  deliveryNote: (MatchResultSummary["deliveryNote"] & {
    vendor: { id: string; name: string };
  }) | null;
  ewayBill: {
    id: string;
    ewayBillNumber: string;
    totalValue: number;
    fromGstin: string;
    toGstin: string;
    generatedDate: string;
    validUntil: string;
  } | null;
}

export interface Discrepancy {
  type: string;
  field: string;
  expected: string | number;
  actual: string | number;
  severity: "LOW" | "MEDIUM" | "HIGH";
  details?: string;
}

// ── API Functions ─────────────────────────────────────────────────

export function getStats(): Promise<ApiResponse<MatchStats>> {
  return fetchApi("/matching/stats");
}

export function getMatchResults(params: {
  page?: number;
  perPage?: number;
  status?: string;
  invoiceId?: string;
}): Promise<ApiResponse<MatchResultSummary[]>> {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.perPage) qs.set("perPage", String(params.perPage));
  if (params.status) qs.set("status", params.status);
  if (params.invoiceId) qs.set("invoiceId", params.invoiceId);
  return fetchApi(`/matching/results?${qs.toString()}`);
}

export function getMatchResult(
  id: string
): Promise<ApiResponse<MatchResultDetail>> {
  return fetchApi(`/matching/results/${id}`);
}

export function resolveMatchResult(
  id: string,
  action: "accept" | "reject",
  reviewedBy?: string,
  notes?: string
): Promise<ApiResponse<MatchResultDetail>> {
  return fetchApi(`/matching/results/${id}/resolve`, {
    method: "PUT",
    body: JSON.stringify({ action, reviewedBy: reviewedBy ?? "system", notes }),
  });
}
