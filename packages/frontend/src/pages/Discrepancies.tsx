import { useEffect, useState, useCallback } from "react";
import {
  getMatchResults,
  getMatchResult,
  resolveMatchResult,
  MatchResultSummary,
  MatchResultDetail,
  Discrepancy,
} from "../hooks/useApi";

const STATUS_COLORS: Record<string, string> = {
  MATCHED: "bg-emerald-dim text-emerald",
  PARTIAL: "bg-amber/10 text-amber",
  MISMATCH: "bg-red/10 text-red",
};

const SEVERITY_COLORS: Record<string, string> = {
  LOW: "bg-surface text-muted",
  MEDIUM: "bg-amber/10 text-amber",
  HIGH: "bg-red/10 text-red",
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

  const handleResolve = async (accept: boolean) => {
    if (!selectedId || !detail) return;
    setResolving(true);
    setActionMsg(null);
    try {
      await resolveMatchResult(selectedId, accept ? "accept" : "reject");
      setActionMsg(
        accept ? "Match accepted ✓" : "Match rejected — document status preserved"
      );
      // Refresh list
      fetchResults();
      // Refresh detail
      const res = await getMatchResult(selectedId);
      setDetail(res.data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Action failed";
      if (msg.includes("already")) {
        setActionMsg("Already reviewed — no changes made");
      } else {
        setActionMsg(`Error: ${msg}`);
      }
    } finally {
      setResolving(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-white">Discrepancies</h1>
      <p className="mt-1 text-sm text-muted">
        Review and resolve matching discrepancies
      </p>

      {/* Action feedback */}
      {actionMsg && (
        <div className="mt-4 rounded-lg border border-emerald/30 bg-emerald-dim p-3 text-sm text-emerald">
          {actionMsg}
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-red/30 bg-red/10 p-3 text-sm text-red">
          {error}
        </div>
      )}

      {/* Filter bar */}
      <div className="mt-6 flex items-center gap-3">
        <label className="font-mono text-xs uppercase tracking-wider text-faint">
          Status:
        </label>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-[var(--color-border-dim)] bg-panel px-3 py-1.5 text-sm text-white focus:border-emerald focus:outline-none"
        >
          <option value="">All</option>
          <option value="MATCHED">Matched</option>
          <option value="PARTIAL">Partial</option>
          <option value="MISMATCH">Mismatched</option>
        </select>

        {totalPages > 1 && (
          <span className="ml-auto text-xs text-faint">
            Page {page} of {totalPages}
          </span>
        )}
      </div>

      {/* Table */}
      <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--color-border-dim)]">
        <table className="w-full text-left text-sm">
          {results.length > 0 && (
          <thead>
            <tr className="border-b border-[var(--color-border-dim)] bg-surface">
              <th className="px-4 py-3 font-mono text-xs font-medium uppercase tracking-wider text-faint">
                Score
              </th>
              <th className="px-4 py-3 font-mono text-xs font-medium uppercase tracking-wider text-faint">
                Status
              </th>
              <th className="px-4 py-3 font-mono text-xs font-medium uppercase tracking-wider text-faint">
                Invoice
              </th>
              <th className="px-4 py-3 font-mono text-xs font-medium uppercase tracking-wider text-faint">
                DN
              </th>
              <th className="px-4 py-3 font-mono text-xs font-medium uppercase tracking-wider text-faint">
                EWB
              </th>
            </tr>
          </thead>
          )}
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-muted">
                  Loading...
                </td>
              </tr>
            )}
            {!loading && results.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6">
                  {/* Showcase split-pane — displayed when no real data exists */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Left: Mismatch flags */}
                    <div className="space-y-2">
                      <p className="font-mono text-xs font-medium uppercase tracking-wider text-faint mb-3 px-1">
                        Simulated Mismatch Flags
                      </p>
                      {[
                        { id: "DISC-0042", type: "GSTIN Mismatch", severity: "HIGH", detail: "Vendor GSTIN 27AAACA1234A1Z1 ≠ EWB fromGstin 27AAACA5678A1Z1" },
                        { id: "DISC-0045", type: "Quantity Delta > 5%", severity: "MEDIUM", detail: "Invoice qty: 100 units | DN qty: 94 units | Δ: 6%" },
                        { id: "DISC-0047", type: "Unit Price Variance", severity: "LOW", detail: "INR 850.00/unit (invoice) vs INR 832.00/unit (DN)" },
                        { id: "DISC-0051", type: "EWB Expired", severity: "HIGH", detail: "E-Way Bill 8214-5678-9012 expired 3 days before delivery" },
                        { id: "DISC-0053", type: "Total Amount Variance", severity: "MEDIUM", detail: "Invoice total: INR 125,000 | Expected: INR 121,500 | Δ: 2.8%" },
                        { id: "DISC-0056", type: "Duplicate Invoice", severity: "HIGH", detail: "INV-2026-001 submitted twice within 48 hours" },
                      ].map((flag) => (
                        <div key={flag.id} className="flex items-start gap-3 rounded-lg border border-[var(--color-border-dim)] bg-surface p-3 hover:bg-panel transition-colors">
                          <div className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                            flag.severity === "HIGH" ? "bg-red" : flag.severity === "MEDIUM" ? "bg-amber" : "bg-cyan"
                          }`} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs text-faint">{flag.id}</span>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                flag.severity === "HIGH" ? "bg-red/10 text-red" : flag.severity === "MEDIUM" ? "bg-amber/10 text-amber" : "bg-cyan/10 text-cyan"
                              }`}>{flag.severity}</span>
                            </div>
                            <p className="text-sm font-medium text-white mt-0.5">{flag.type}</p>
                            <p className="text-xs text-muted mt-0.5 font-mono">{flag.detail}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Right: Action panel */}
                    <div className="space-y-4">
                      <p className="font-mono text-xs font-medium uppercase tracking-wider text-faint px-1">
                        Resolution Actions
                      </p>

                      {/* Accept Tolerance */}
                      <div className="rounded-lg border border-[var(--color-border-dim)] bg-surface p-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-dim">
                            <span className="text-emerald text-sm">✓</span>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-white">Accept Tolerance</p>
                            <p className="text-xs text-muted">Auto-resolve if variance is within configured thresholds</p>
                          </div>
                        </div>
                        <button className="mt-3 w-full rounded-lg bg-emerald px-3 py-2 text-xs font-bold text-white hover:bg-emerald/80 shadow-[0_0_12px_rgba(16,185,129,0.3)] transition-all">
                          Apply to Selected
                        </button>
                      </div>

                      {/* Flag for Review */}
                      <div className="rounded-lg border border-[var(--color-border-dim)] bg-surface p-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber/10">
                            <span className="text-amber text-sm">!</span>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-white">Flag for Review</p>
                            <p className="text-xs text-muted">Escalate to supervisor with notes for manual verification</p>
                          </div>
                        </div>
                        <button className="mt-3 w-full rounded-lg bg-amber px-3 py-2 text-xs font-bold text-void hover:bg-amber/80 shadow-[0_0_12px_rgba(245,158,11,0.3)] transition-all">
                          Escalate Flagged Items
                        </button>
                      </div>

                      {/* Generate Dispute Notice */}
                      <div className="rounded-lg border border-[var(--color-border-dim)] bg-surface p-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red/10">
                            <span className="text-red text-sm">⚠</span>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-white">Generate Dispute Notice</p>
                            <p className="text-xs text-muted">Create a formal dispute document for the supplier</p>
                          </div>
                        </div>
                        <button className="mt-3 w-full rounded-lg bg-red px-3 py-2 text-xs font-bold text-white hover:bg-red/80 shadow-[0_0_12px_rgba(239,68,68,0.3)] transition-all">
                          Draft Notice
                        </button>
                      </div>

                      {/* Summary */}
                      <div className="rounded-lg border border-[var(--color-border-dim)] bg-surface p-4">
                        <h4 className="font-mono text-xs font-medium uppercase tracking-wider text-faint mb-2">Resolution Summary</h4>
                        <div className="space-y-1.5 text-xs">
                          <div className="flex justify-between">
                            <span className="text-muted">Auto-resolved (within tolerance)</span>
                            <span className="text-emerald font-mono">3/6</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted">Pending supervisor review</span>
                            <span className="text-amber font-mono">2/6</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted">Awaiting supplier response</span>
                            <span className="text-red font-mono">1/6</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            )}
            {!loading &&
              results.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  className={`cursor-pointer border-b border-[var(--color-border-dim)] transition-colors last:border-0 hover:bg-panel ${
                    selectedId === r.id ? "bg-emerald-dim" : ""
                  }`}
                >
                  <td className="px-4 py-3 font-mono text-white">
                    {r.matchScore.toFixed(2)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        STATUS_COLORS[r.status] ?? ""
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {r.invoice?.invoiceNumber || "—"}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {r.deliveryNote?.deliveryNoteNumber || "—"}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {r.ewayBill?.ewayBillNumber || "—"}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-lg border border-[var(--color-border-dim)] bg-surface px-3 py-1.5 text-sm text-muted hover:bg-panel disabled:opacity-30"
          >
            Previous
          </button>
          <span className="text-xs text-faint">
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-[var(--color-border-dim)] bg-surface px-3 py-1.5 text-sm text-muted hover:bg-panel disabled:opacity-30"
          >
            Next
          </button>
        </div>
      )}

      {/* Detail Panel */}
      {selectedId && (
        <div className="glass-card mt-6 overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--color-border-dim)] p-4">
            <h3 className="font-mono text-xs font-medium uppercase tracking-wider text-faint">
              Match Detail
            </h3>
            <button
              onClick={() => setSelectedId(null)}
              className="text-xs text-muted hover:text-white transition-colors"
            >
              Close
            </button>
          </div>

          {detailLoading && (
            <div className="p-8 text-center text-muted">Loading...</div>
          )}

          {detail && !detailLoading && (
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-4">
                <span className="text-3xl font-bold text-white font-display">
                  {detail.matchScore.toFixed(2)}
                </span>
                <span
                  className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${
                    STATUS_COLORS[detail.status] ?? ""
                  }`}
                >
                  {detail.status}
                </span>
              </div>

              <div className="flex flex-wrap gap-6">
                <div>
                  <p className="font-mono text-xs uppercase tracking-wider text-faint">
                    Invoice
                  </p>
                  <p className="text-sm text-white">{detail.invoice?.invoiceNumber}</p>
                </div>
                <div>
                  <p className="font-mono text-xs uppercase tracking-wider text-faint">
                    Delivery Note
                  </p>
                  <p className="text-sm text-white">
                    {detail.deliveryNote?.deliveryNoteNumber || "—"}
                  </p>
                </div>
                <div>
                  <p className="font-mono text-xs uppercase tracking-wider text-faint">
                    E-Way Bill
                  </p>
                  <p className="text-sm text-white">
                    {detail.ewayBill?.ewayBillNumber || "—"}
                  </p>
                </div>
                {detail.reviewedBy && (
                  <div>
                    <p className="font-mono text-xs uppercase tracking-wider text-faint">
                      Reviewed by
                    </p>
                    <p className="text-sm text-white">{detail.reviewedBy}</p>
                  </div>
                )}
              </div>

              {/* Discrepancies */}
              {detail.discrepancies.length > 0 && (
                <div>
                  <p className="mb-2 font-mono text-xs font-medium uppercase tracking-wider text-faint">
                    Discrepancies ({detail.discrepancies.length})
                  </p>
                  <div className="space-y-2">
                    {detail.discrepancies.map((d: Discrepancy, i: number) => (
                      <div
                        key={i}
                        className="rounded-lg border border-[var(--color-border-dim)] bg-surface p-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-white">
                            {d.field}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              SEVERITY_COLORS[d.severity] ?? ""
                            }`}
                          >
                            {d.severity}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted">{d.details || d.field}</p>
                        <p className="mt-1 font-mono text-xs text-faint">
                          expected: {d.expected} &rarr; actual: {d.actual}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detail.discrepancies.length === 0 && (
                <div className="rounded-lg border border-emerald/30 bg-emerald-dim p-3 text-sm text-emerald">
                  No discrepancies — all fields verified
                </div>
              )}

              {/* Actions */}
              {detail.reviewedAt ? (
                <div className="rounded-lg bg-surface p-3 text-sm text-muted">
                  Reviewed at {new Date(detail.reviewedAt).toLocaleString()}
                </div>
              ) : (
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => handleResolve(true)}
                    disabled={resolving}
                    className="rounded-lg bg-emerald px-4 py-2 text-sm font-bold text-void hover:bg-emerald/80 disabled:opacity-50 transition-all"
                  >
                    {resolving ? "Processing..." : "Accept Match"}
                  </button>
                  <button
                    onClick={() => handleResolve(false)}
                    disabled={resolving}
                    className="rounded-lg border border-[var(--color-border-dim)] bg-surface px-4 py-2 text-sm text-muted hover:bg-panel hover:text-white disabled:opacity-50 transition-all"
                  >
                    {resolving ? "Processing..." : "Reject"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
