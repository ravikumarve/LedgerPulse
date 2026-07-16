export default function Dashboard() {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold text-gray-800">
        LedgerPulse
      </h1>
      <p className="mt-2 text-gray-600">
        Supply Chain Reconciliation & Tax Engine
      </p>

      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Invoices"
          value="—"
          description="Total documents ingested"
        />
        <StatCard
          title="Match Rate"
          value="—"
          description="3-way reconciliation accuracy"
        />
        <StatCard
          title="Discrepancies"
          value="—"
          description="Flagged items requiring review"
        />
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  description,
}: {
  title: string;
  value: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-medium text-gray-500">{title}</h2>
      <p className="mt-1 text-3xl font-semibold text-gray-900">{value}</p>
      <p className="mt-1 text-xs text-gray-400">{description}</p>
    </div>
  );
}
