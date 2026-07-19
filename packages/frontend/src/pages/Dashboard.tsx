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
      <h1 className="text-2xl font-bold text-white">Dashboard</h1>
      <p className="mt-1 text-sm text-muted">
        Real-time reconciliation overview
      </p>

      {loading && (
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-xl bg-panel"
            />
          ))}
        </div>
      )}

      {error && (
        <div className="mt-8 rounded-lg border border-red/30 bg-red/10 p-4 text-sm text-red">
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
              accent="cyan"
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
              color="var(--color-emerald)"
            />
            <MiniStat
              label="Partial"
              value={stats.partial}
              total={stats.totalMatches}
              color="var(--color-amber)"
            />
            <MiniStat
              label="Mismatched"
              value={stats.mismatched}
              total={stats.totalMatches}
              color="var(--color-red)"
            />
          </div>
        </>
      )}

      {stats && stats.totalMatches === 0 && !loading && (
        <div className="mt-12 rounded-xl border border-dashed border-[var(--color-border-dim)] bg-surface p-12 text-center">
          <p className="text-lg font-medium text-muted">
            No reconciliation data yet
          </p>
          <p className="mt-1 text-sm text-faint">
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
  accent: "emerald" | "cyan" | "amber";
}) {
  const accentColors: Record<string, string> = {
    emerald: "var(--color-emerald)",
    cyan: "var(--color-cyan)",
    amber: "var(--color-amber)",
  };

  return (
    <div className="glass-card overflow-hidden hover-card">
      <div
        className="h-1"
        style={{ background: accentColors[accent] }}
      />
      <div className="p-5">
        <h3 className="font-mono text-xs font-medium uppercase tracking-wider text-faint">
          {title}
        </h3>
        <p className="mt-1 text-3xl font-semibold text-white">{value}</p>
        <p className="mt-1 text-xs text-muted">{description}</p>
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
    <div className="glass-card rounded-lg p-4 hover-card">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted">{label}</span>
        <span className="text-lg font-semibold text-white">{value}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-void">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <p className="mt-1 text-right text-xs text-faint">{pct}%</p>
    </div>
  );
}
