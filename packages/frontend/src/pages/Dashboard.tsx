import { useEffect, useState } from "react";
import { getStats, MatchStats } from "../hooks/useApi";

export default function Dashboard() {
  const [stats, setStats] = useState<MatchStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getStats()
      .then((res) => setStats(res.data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
      <p className="mt-1 text-sm text-gray-500">
        Real-time reconciliation overview
      </p>

      {loading && (
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-xl bg-gray-100"
            />
          ))}
        </div>
      )}

      {error && (
        <div className="mt-8 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Failed to load stats: {error}
        </div>
      )}

      {stats && (
        <>
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Match Rate"
              value={`${stats.matchRate}%`}
              description={`${stats.matched} of ${stats.totalMatches} matched`}
              accent="emerald"
            />
            <StatCard
              title="Total Documents"
              value={String(
                stats.documents.invoices +
                  stats.documents.deliveryNotes +
                  stats.documents.ewayBills
              )}
              description={`${stats.documents.invoices} invoices · ${stats.documents.deliveryNotes} DNs · ${stats.documents.ewayBills} EWBs`}
              accent="blue"
            />
            <StatCard
              title="Pending Review"
              value={String(stats.pendingReview)}
              description={`${stats.partial} partial · ${stats.mismatched} mismatched`}
              accent="amber"
            />
            <StatCard
              title="Resolved"
              value={String(stats.resolved)}
              description={`${stats.matched} accepted matches`}
              accent="emerald"
            />
          </div>

          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
            <MiniStat
              label="Matched"
              value={stats.matched}
              total={stats.totalMatches}
              color="bg-emerald-500"
            />
            <MiniStat
              label="Partial"
              value={stats.partial}
              total={stats.totalMatches}
              color="bg-amber-400"
            />
            <MiniStat
              label="Mismatched"
              value={stats.mismatched}
              total={stats.totalMatches}
              color="bg-red-400"
            />
          </div>
        </>
      )}

      {stats && stats.totalMatches === 0 && !loading && (
        <div className="mt-12 rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center">
          <p className="text-lg font-medium text-gray-500">
            No reconciliation data yet
          </p>
          <p className="mt-1 text-sm text-gray-400">
            Upload invoices and run matching to see results here
          </p>
        </div>
      )}
    </div>
  );
}

function StatCard({
  title,
  value,
  description,
  accent,
}: {
  title: string;
  value: string;
  description: string;
  accent: "emerald" | "blue" | "amber";
}) {
  const accentColors = {
    emerald: "bg-emerald-500",
    blue: "bg-blue-500",
    amber: "bg-amber-500",
  };

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className={`h-1 ${accentColors[accent]}`} />
      <div className="p-5">
        <h3 className="text-xs font-medium uppercase tracking-wider text-gray-500">
          {title}
        </h3>
        <p className="mt-1 text-3xl font-semibold text-gray-900">{value}</p>
        <p className="mt-1 text-xs text-gray-400">{description}</p>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-600">{label}</span>
        <span className="text-lg font-semibold text-gray-900">{value}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1 text-right text-xs text-gray-400">{pct}%</p>
    </div>
  );
}
