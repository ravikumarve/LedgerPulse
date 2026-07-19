import { useEffect, useState, useCallback } from "react";

interface Invoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  totalAmount: number;
  taxAmount: number | null;
  lineItems: string | null;
  status: string;
  vendor: { id: string; name: string; gstin: string | null };
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-amber/10 text-amber",
  PROCESSED: "bg-cyan/10 text-cyan",
  MATCHED: "bg-emerald-dim text-emerald",
  DISCREPANCY: "bg-red/10 text-red",
  RESOLVED: "bg-emerald-dim text-emerald",
};

export default function Invoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ page: String(page), perPage: "15" });
      if (statusFilter) qs.set("status", statusFilter);
      const res = await fetch(`/api/invoices?${qs}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load");
      setInvoices(body.data);
      setTotalPages(body.meta?.totalPages ?? 1);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load invoices");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const file = fd.get("file") as File;
    if (!file || file.size === 0) return;

    setUploading(true);
    setUploadResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/invoices/upload", { method: "POST", body: fd });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Upload failed");
      setUploadResult(`✅ ${body.data?.invoiceNumber ?? "Invoice"} processed — score: ${(body.data?.confidence * 100).toFixed(0) ?? "?"}%`);
      fetchInvoices();
    } catch (e: unknown) {
      setUploadResult(`❌ ${e instanceof Error ? e.message : "Upload failed"}`);
    } finally {
      setUploading(false);
    }
  };

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Invoices</h1>
          <p className="mt-1 text-sm text-muted">
            Ingestion, OCR processing, and reconciliation status
          </p>
        </div>
        <button
          onClick={() => setShowUpload(!showUpload)}
          className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-void hover:bg-emerald hover:shadow-[0_0_30px_rgba(16,185,129,0.4)] transition-all font-mono uppercase tracking-wider"
        >
          + Upload Invoice
        </button>
      </div>

      {/* Upload Panel */}
      {showUpload && (
        <div className="glass-card mt-4 p-6">
          <h3 className="font-mono text-xs font-medium uppercase tracking-wider text-faint mb-4">
            Upload Invoice for OCR
          </h3>
          <form onSubmit={handleUpload} className="space-y-4">
            <input
              type="file"
              name="file"
              accept=".pdf,.png,.jpg,.jpeg"
              className="w-full rounded-lg border border-[var(--color-border-dim)] bg-panel px-3 py-2 text-sm text-muted file:mr-3 file:rounded file:border-0 file:bg-emerald file:px-3 file:py-1 file:text-xs file:font-bold file:text-void"
            />
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={uploading}
                className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-void hover:bg-emerald disabled:opacity-50 transition-all font-mono uppercase tracking-wider"
              >
                {uploading ? "Processing..." : "Upload & OCR"}
              </button>
              <button
                type="button"
                onClick={() => setShowUpload(false)}
                className="rounded-lg border border-[var(--color-border-dim)] bg-surface px-4 py-2 text-sm text-muted hover:text-white transition-all"
              >
                Cancel
              </button>
            </div>
          </form>
          {uploadResult && (
            <p className="mt-3 text-sm text-emerald">{uploadResult}</p>
          )}
        </div>
      )}

      {/* Filter Bar */}
      <div className="mt-6 flex items-center gap-3">
        <label className="font-mono text-xs uppercase tracking-wider text-faint">
          Status:
        </label>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-[var(--color-border-dim)] bg-panel px-3 py-1.5 text-sm text-white focus:border-emerald focus:outline-none"
        >
          <option value="">All</option>
          <option value="PENDING">Pending</option>
          <option value="PROCESSED">Processed</option>
          <option value="MATCHED">Matched</option>
          <option value="DISCREPANCY">Discrepancy</option>
          <option value="RESOLVED">Resolved</option>
        </select>
        {totalPages > 1 && (
          <span className="ml-auto text-xs text-faint">Page {page} of {totalPages}</span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mt-4 rounded-lg border border-red/30 bg-red/10 p-3 text-sm text-red">{error}</div>
      )}

      {/* Table */}
      <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--color-border-dim)]">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border-dim)] bg-surface">
              <th className="px-4 py-3 font-mono text-xs font-medium uppercase tracking-wider text-faint">Invoice</th>
              <th className="px-4 py-3 font-mono text-xs font-medium uppercase tracking-wider text-faint">Vendor</th>
              <th className="px-4 py-3 font-mono text-xs font-medium uppercase tracking-wider text-faint">Date</th>
              <th className="px-4 py-3 font-mono text-xs font-medium uppercase tracking-wider text-faint">Amount</th>
              <th className="px-4 py-3 font-mono text-xs font-medium uppercase tracking-wider text-faint">Items</th>
              <th className="px-4 py-3 font-mono text-xs font-medium uppercase tracking-wider text-faint">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-muted">Loading...</td></tr>
            )}
            {!loading && invoices.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-16 text-center">
                  <p className="text-muted text-lg mb-2">No invoices yet</p>
                  <p className="text-faint text-sm">Upload a PDF or image to see parsed invoice data here</p>
                </td>
              </tr>
            )}
            {!loading && invoices.map((inv) => {
              const items = inv.lineItems ? JSON.parse(inv.lineItems) as Array<{ sku?: string; description?: string; qty?: number }> : [];
              const qty = items.reduce((s, i) => s + (i.qty ?? 0), 0);
              return (
                <tr key={inv.id} className="border-b border-[var(--color-border-dim)] last:border-0 hover:bg-panel transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-mono text-white">{inv.invoiceNumber}</span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-white">{inv.vendor.name}</p>
                    {inv.vendor.gstin && <p className="text-faint text-xs font-mono">{inv.vendor.gstin}</p>}
                  </td>
                  <td className="px-4 py-3 text-muted">{new Date(inv.invoiceDate).toLocaleDateString()}</td>
                  <td className="px-4 py-3 font-mono text-white">{formatCurrency(inv.totalAmount)}</td>
                  <td className="px-4 py-3 text-muted">{qty > 0 ? `${qty} units` : "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[inv.status] ?? "bg-surface text-muted"}`}>
                      {inv.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <button
            disabled={page <= 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            className="rounded-lg border border-[var(--color-border-dim)] bg-surface px-3 py-1.5 text-sm text-muted hover:bg-panel disabled:opacity-30 transition-all"
          >Previous</button>
          <span className="text-xs text-faint">{page} / {totalPages}</span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
            className="rounded-lg border border-[var(--color-border-dim)] bg-surface px-3 py-1.5 text-sm text-muted hover:bg-panel disabled:opacity-30 transition-all"
          >Next</button>
        </div>
      )}
    </div>
  );
}
