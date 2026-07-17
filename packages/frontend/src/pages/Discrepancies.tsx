import { useEffect, useState, useCallback } from "react";
import {
  getMatchResults,
  getMatchResult,
  resolveMatchResult,
  MatchResultSummary,
  MatchResultDetail,
  Discrepancy,
} from "../hooks/useApi";

const STATUS_OPTIONS = ["", "MATCHED", "PARTIAL", "MISMATCH"] as const;

const STATUS_COLORS: Record<string, string> = {
  MATCHED: "bg-emerald-100 text-emerald-700",
  PARTIAL: "bg-amber-100 text-amber-700",
  MISMATCH: "bg-red-100 text-red-700",
};

const SEVERITY_COLORS: Record<string, string> = {
  LOW: "bg-gray-100 text-gray-600",
  MEDIUM: "bg-amber-100 text-amber-700",
  HIGH: "bg-red-100 text-red-700",
};

export default function Discrepancies() {
  const [results, setResults] = useState<MatchResultSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MatchResultDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const fetchResults = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getMatchResults({
        page,
        perPage: 15,
        status: statusFilter || undefined,
      });
      setResults(res.data);
      setTotalPages(res.meta?.totalPages as number);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load results");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  // Fetch detail when a row is selected
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    getMatchResult(selectedId)
      .then((res) => setDetail(res.data))
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false));
  }, [selectedId]);

  const handleResolve = async (action: "accept" | "reject") => {
    if (!selectedId) return;
    setResolving(true);
    setActionMsg(null);
    try {
      await resolveMatchResult(selectedId, action, "admin", "Reviewed via dashboard");
      setActionMsg(
        action === "accept"
          ? "Match accepted and documents marked as resolved"
          : "Match rejected"
      );
      setDetail((prev) =>
        prev ? { ...prev, reviewedBy: "admin", reviewedAt: new Date().toISOString() } : prev
      );
      // Refresh the list
      fetchResults();
    } catch (e: unknown) {
      setActionMsg(
        `Error: ${e instanceof Error ? e.message : "Request failed"}`
      );
    } finally {
      setResolving(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Discrepancies</h1>
          <p className="mt-1 text-sm text-gray-500">
            Review and resolve reconciliation mismatches
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-6 flex items-center gap-3">
        <span className="text-sm font-medium text-gray-600">Status:</span>
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => {
              setStatusFilter(s);
              setPage(1);
            }}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              statusFilter === s
                ? "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {s || "All"}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading && (
          <div className="space-y-3 p-6">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-gray-100" />
            ))}
          </div>
        )}

        {error && (
          <div className="p-6 text-center text-sm text-red-600">{error}</div>
        )}

        {!loading && !error && results.length === 0 && (
          <div className="p-12 text-center text-sm text-gray-400">
            No match results found
            {statusFilter && ` with status "${statusFilter}"`}
          </div>
        )}

        {!loading && !error && results.length > 0 && (
          <>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="px-4 py-3 font-medium text-gray-500">Status</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Invoice</th>
                  <th className="px-4 py-3 font-medium text-gray-500">DN</th>
                  <th className="px-4 py-3 font-medium text-gray-500">EWB</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Score</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Reviewed</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {results.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    className={`cursor-pointer transition-colors hover:bg-gray-50 ${
                      selectedId === r.id ? "bg-emerald-50/50" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          STATUS_COLORS[r.status]
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {r.invoice.invoiceNumber}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {r.deliveryNote?.deliveryNoteNumber ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {r.ewayBill?.ewayBillNumber ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`font-mono text-sm font-medium ${
                          r.matchScore >= 0.85
                            ? "text-emerald-600"
                            : r.matchScore >= 0.5
                              ? "text-amber-600"
                              : "text-red-600"
                        }`}
                      >
                        {(r.matchScore * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {r.reviewedBy ? (
                        <span className="flex items-center gap-1 text-emerald-600">
                          ✓ {r.reviewedBy}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
                <span className="text-xs text-gray-400">
                  Page {page} of {totalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="rounded px-3 py-1 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-30"
                  >
                    ← Prev
                  </button>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="rounded px-3 py-1 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-30"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail Panel */}
      {selectedId && (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <h2 className="text-base font-semibold text-gray-900">
              Match Detail
            </h2>
            <button
              onClick={() => setSelectedId(null)}
              className="rounded-lg px-2 py-1 text-xs text-gray-400 hover:text-gray-600"
            >
              Close
            </button>
          </div>

          {detailLoading && (
            <div className="space-y-3 p-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-6 animate-pulse rounded bg-gray-100" />
              ))}
            </div>
          )}

          {detail && !detailLoading && (
            <div className="p-5">
              {/* Document references */}
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs font-medium text-gray-500">Invoice</p>
                  <p className="mt-1 text-sm font-semibold text-gray-900">
                    {detail.invoice.invoiceNumber}
                  </p>
                  <p className="text-xs text-gray-400">
                    ₹{detail.invoice.totalAmount.toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-400">
                    {detail.invoice.vendor.name}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs font-medium text-gray-500">
                    Delivery Note
                  </p>
                  <p className="mt-1 text-sm font-semibold text-gray-900">
                    {detail.deliveryNote?.deliveryNoteNumber ?? "—"}
                  </p>
                  <p className="text-xs text-gray-400">
                    {detail.deliveryNote?.vendor.name ?? ""}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs font-medium text-gray-500">E-Way Bill</p>
                  <p className="mt-1 text-sm font-semibold text-gray-900">
                    {detail.ewayBill?.ewayBillNumber ?? "—"}
                  </p>
                  <p className="text-xs text-gray-400">
                    {detail.ewayBill
                      ? `₹${detail.ewayBill.totalValue.toLocaleString()}`
                      : ""}
                  </p>
                </div>
              </div>

              {/* Match scores */}
              <div className="mt-4 grid grid-cols-4 gap-3">
                <ScoreBadge label="Overall" value={detail.matchScore} />
                <ScoreBadge label="INV↔DN" value={0} />
                <ScoreBadge label="INV↔EWB" value={0} />
                <ScoreBadge label="DN↔EWB" value={0} />
              </div>

              {/* Discrepancies */}
              <div className="mt-5">
                <h3 className="text-sm font-semibold text-gray-900">
                  Discrepancies
                  {detail.discrepancies.length > 0 && (
                    <span className="ml-2 text-xs font-normal text-gray-400">
                      ({detail.discrepancies.length} items)
                    </span>
                  )}
                </h3>

                {detail.discrepancies.length === 0 && (
                  <p className="mt-2 text-sm text-emerald-600">
                    ✓ No discrepancies — clean match
                  </p>
                )}

                {detail.discrepancies.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {detail.discrepancies.map((d, i) => (
                      <DiscrepancyRow key={i} discrepancy={d} />
                    ))}
                  </div>
                )}
              </div>

              {/* Review status & actions */}
              <div className="mt-6 border-t border-gray-100 pt-4">
                {detail.reviewedBy ? (
                  <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    <span>✓</span>
                    <span>
                      Reviewed by <strong>{detail.reviewedBy}</strong> on{" "}
                      {detail.reviewedAt
                        ? new Date(detail.reviewedAt).toLocaleString()
                        : "—"}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleResolve("accept")}
                      disabled={resolving}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {resolving ? "Processing..." : "✓ Accept Match"}
                    </button>
                    <button
                      onClick={() => handleResolve("reject")}
                      disabled={resolving}
                      className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                )}

                {actionMsg && (
                  <p
                    className={`mt-2 text-sm ${
                      actionMsg.startsWith("Error")
                        ? "text-red-600"
                        : "text-emerald-600"
                    }`}
                  >
                    {actionMsg}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ScoreBadge({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 85 ? "text-emerald-600" : pct >= 50 ? "text-amber-600" : "text-red-600";
  return (
    <div className="rounded-lg border border-gray-100 bg-white p-3 text-center">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-lg font-bold ${color}`}>{pct}%</p>
    </div>
  );
}

function DiscrepancyRow({ discrepancy }: { discrepancy: Discrepancy }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/50 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${
              SEVERITY_COLORS[discrepancy.severity]
            }`}
          >
            {discrepancy.severity}
          </span>
          <span className="text-xs font-medium text-gray-900">
            {discrepancy.type}
          </span>
        </div>
        <span className="text-xs text-gray-400">{discrepancy.field}</span>
      </div>
      {discrepancy.details && (
        <p className="mt-1 text-xs text-gray-600">{discrepancy.details}</p>
      )}
      <div className="mt-1 grid grid-cols-2 gap-4 text-xs">
        <div>
          <span className="text-gray-400">Expected: </span>
          <span className="font-mono text-gray-700">
            {String(discrepancy.expected)}
          </span>
        </div>
        <div>
          <span className="text-gray-400">Actual: </span>
          <span className="font-mono text-gray-700">
            {String(discrepancy.actual)}
          </span>
        </div>
      </div>
    </div>
  );
}
