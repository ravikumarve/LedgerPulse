import { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";

interface OrgSettings {
  defaultCurrency?: string;
  timezone?: string;
  matchingTolerances?: {
    quantityPercent?: number;
    unitPricePercent?: number;
    totalAmountPercent?: number;
  };
  matchWeights?: {
    invDn?: number;  // Invoice ↔ Delivery Note weight
    invEwb?: number; // Invoice ↔ E-Way Bill weight
    dnEwb?: number;  // Delivery Note ↔ E-Way Bill weight
  };
}

export default function Settings() {
  const { user, organization } = useAuth();
  const [activeTab, setActiveTab] = useState<"profile" | "matching" | "team">("profile");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // ── Org Profile ──
  const [orgName, setOrgName] = useState(organization?.name ?? "");
  const [settings, setSettings] = useState<OrgSettings>({});
  const [members, setMembers] = useState<
    { id: string; name: string; email: string; role: string }[]
  >([]);

  useEffect(() => {
    if (organization?.name) setOrgName(organization.name);
    fetchSettings();
    fetchMembers();
  }, [organization]);

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/organization");
      const body = await res.json();
      if (body.data?.settings) {
        const parsed =
          typeof body.data.settings === "string"
            ? JSON.parse(body.data.settings)
            : body.data.settings;
        setSettings(parsed);
        setOrgName(body.data.name);
      }
    } catch {
      // ignore
    }
  };

  const fetchMembers = async () => {
    try {
      const res = await fetch("/api/organization/members");
      const body = await res.json();
      if (body.data) setMembers(body.data);
    } catch {
      // ignore
    }
  };

  const saveProfile = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/organization", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: orgName }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setMessage("Organization saved ✓");
    } catch {
      setMessage("Error saving organization");
    } finally {
      setSaving(false);
    }
  };

  const saveMatchingRules = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/organization", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setMessage("Matching rules saved ✓");
    } catch {
      setMessage("Error saving matching rules");
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: "profile" as const, label: "Organization" },
    { id: "matching" as const, label: "Matching Rules" },
    { id: "team" as const, label: "Team" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-white">Settings</h1>
      <p className="mt-1 text-sm text-muted">
        Manage your organization and configuration
      </p>

      {/* Tabs */}
      <div className="mt-6 flex gap-1 rounded-lg border border-[var(--color-border-dim)] bg-surface p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "bg-emerald text-void"
                : "text-muted hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {message && (
        <div className="mt-4 rounded-lg border border-emerald/30 bg-emerald-dim p-3 text-sm text-emerald">
          {message}
        </div>
      )}

      {/* ── Tab: Profile ── */}
      {activeTab === "profile" && (
        <div className="glass-card mt-6 p-6 space-y-6">
          <h3 className="font-mono text-xs font-medium uppercase tracking-wider text-faint">
            Organization Profile
          </h3>

          <div>
            <label className="block text-sm font-medium text-muted mb-1">
              Organization Name
            </label>
            <input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              className="w-full max-w-md rounded-lg border border-[var(--color-border-dim)] bg-panel px-3 py-2 text-sm text-white placeholder:text-faint focus:border-emerald focus:outline-none focus:ring-1 focus:ring-emerald"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-muted mb-1">
              Slug
            </label>
            <input
              type="text"
              value={organization?.slug ?? ""}
              disabled
              className="w-full max-w-md rounded-lg border border-[var(--color-border-dim)] bg-void px-3 py-2 text-sm text-faint cursor-not-allowed"
            />
            <p className="mt-1 text-xs text-faint">Slug cannot be changed</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-muted mb-1">
              Timezone
            </label>
            <select
              value={settings.timezone ?? "Asia/Kolkata"}
              onChange={(e) =>
                setSettings({ ...settings, timezone: e.target.value })
              }
              className="w-full max-w-md rounded-lg border border-[var(--color-border-dim)] bg-panel px-3 py-2 text-sm text-white focus:border-emerald focus:outline-none"
            >
              <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
              <option value="UTC">UTC</option>
              <option value="America/New_York">America/New_York (EST)</option>
              <option value="Europe/London">Europe/London (GMT)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-muted mb-1">
              Default Currency
            </label>
            <select
              value={settings.defaultCurrency ?? "INR"}
              onChange={(e) =>
                setSettings({ ...settings, defaultCurrency: e.target.value })
              }
              className="w-full max-w-md rounded-lg border border-[var(--color-border-dim)] bg-panel px-3 py-2 text-sm text-white focus:border-emerald focus:outline-none"
            >
              <option value="INR">INR (₹)</option>
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
            </select>
          </div>

          <button
            onClick={saveProfile}
            disabled={saving}
            className="rounded-lg bg-white px-6 py-2 text-sm font-bold text-void hover:bg-emerald hover:shadow-[0_0_30px_rgba(16,185,129,0.4)] disabled:opacity-50 transition-all font-mono uppercase tracking-wider"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      )}

      {/* ── Tab: Matching Rules ── */}
      {activeTab === "matching" && (
        <div className="glass-card mt-6 p-6 space-y-8">
          <div>
            <h3 className="font-mono text-xs font-medium uppercase tracking-wider text-faint">
              Match Weight Distribution
            </h3>
            <p className="text-sm text-muted mt-1">
              Control how the composite score is weighted across the three
              document dimensions. Total must equal 100%.
            </p>

            {/* Weight sliders */}
            {(["invDn", "invEwb", "dnEwb"] as const).map((key) => {
              const labels: Record<string, string> = {
                invDn: "Invoice ↔ Delivery Note",
                invEwb: "Invoice ↔ E-Way Bill",
                dnEwb: "DN ↔ E-Way Bill",
              };
              const defaults: Record<string, number> = { invDn: 50, invEwb: 30, dnEwb: 20 };
              const val = settings.matchWeights?.[key] ?? defaults[key];
              const colors: Record<string, string> = {
                invDn: "var(--color-emerald)",
                invEwb: "var(--color-cyan)",
                dnEwb: "var(--color-amber)",
              };
              return (
                <div key={key} className="mt-4">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm text-muted">{labels[key]}</label>
                    <span className="font-mono text-sm text-white">{val}%</span>
                  </div>
                  <div className="relative h-2 rounded-full bg-void">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${val}%`,
                        background: colors[key],
                        boxShadow: `0 0 8px ${colors[key]}`,
                      }}
                    />
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={val}
                    onChange={(e) => {
                      const newVal = Number(e.target.value);
                      // Adjust other weights proportionally to keep total 100
                      const current = { ...settings.matchWeights, [key]: newVal };
                      const total = (current.invDn ?? 50) + (current.invEwb ?? 30) + (current.dnEwb ?? 20);
                      if (total > 100) {
                        // Scale down the other two
                        const others = ["invDn", "invEwb", "dnEwb"].filter((k) => k !== key);
                        const otherTotal = total - newVal;
                        if (otherTotal > 0) {
                          for (const ok of others) {
                            const okKey = ok as keyof NonNullable<OrgSettings["matchWeights"]>;
                            const cur = current[okKey] ?? (ok === "invDn" ? 50 : ok === "invEwb" ? 30 : 20);
                            current[okKey] = Math.round((cur / otherTotal) * (100 - newVal));
                          }
                        }
                      }
                      setSettings({ ...settings, matchWeights: current });
                    }}
                    className="mt-1 w-full cursor-pointer accent-emerald opacity-0 absolute inset-0 h-8"
                  />
                </div>
              );
            })}
            <p className="mt-4 text-xs text-faint flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald" />
              INV↔DN determines line-item accuracy
              <span className="inline-block h-2 w-2 rounded-full bg-cyan ml-3" />
              INV↔EWB validates tax/GSTIN compliance
              <span className="inline-block h-2 w-2 rounded-full bg-amber ml-3" />
              DN↔EWB confirms logistics alignment
            </p>
          </div>

          <div className="border-t border-[var(--color-border-dim)] pt-6">
            <h3 className="font-mono text-xs font-medium uppercase tracking-wider text-faint mb-4">
              Tolerance Thresholds
            </h3>
            <p className="text-sm text-muted mb-4">
              Set percentage thresholds for auto-accepting discrepancies.
              Variances within these limits bypass manual review.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-muted mb-1">
                  Quantity Tolerance
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={settings.matchingTolerances?.quantityPercent ?? 2}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        matchingTolerances: {
                          ...settings.matchingTolerances,
                          quantityPercent: Number(e.target.value),
                        },
                      })
                    }
                    className="w-full rounded-lg border border-[var(--color-border-dim)] bg-panel px-3 py-2 text-sm text-white focus:border-emerald focus:outline-none"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-faint text-xs">%</span>
                </div>
                <p className="mt-1 text-xs text-faint">Default: 2%</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">
                  Unit Price Tolerance
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={settings.matchingTolerances?.unitPricePercent ?? 5}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        matchingTolerances: {
                          ...settings.matchingTolerances,
                          unitPricePercent: Number(e.target.value),
                        },
                      })
                    }
                    className="w-full rounded-lg border border-[var(--color-border-dim)] bg-panel px-3 py-2 text-sm text-white focus:border-emerald focus:outline-none"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-faint text-xs">%</span>
                </div>
                <p className="mt-1 text-xs text-faint">Default: 5%</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">
                  Total Amount Tolerance
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={settings.matchingTolerances?.totalAmountPercent ?? 1}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        matchingTolerances: {
                          ...settings.matchingTolerances,
                          totalAmountPercent: Number(e.target.value),
                        },
                      })
                    }
                    className="w-full rounded-lg border border-[var(--color-border-dim)] bg-panel px-3 py-2 text-sm text-white focus:border-emerald focus:outline-none"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-faint text-xs">%</span>
                </div>
                <p className="mt-1 text-xs text-faint">Default: 1%</p>
              </div>
            </div>
          </div>

          <button
            onClick={saveMatchingRules}
            disabled={saving}
            className="rounded-lg bg-white px-6 py-2 text-sm font-bold text-void hover:bg-emerald hover:shadow-[0_0_30px_rgba(16,185,129,0.4)] disabled:opacity-50 transition-all font-mono uppercase tracking-wider"
          >
            {saving ? "Saving..." : "Save Rules"}
          </button>
        </div>
      )}

      {/* ── Tab: Team ── */}
      {activeTab === "team" && (
        <div className="glass-card mt-6 p-6 space-y-6">
          <h3 className="font-mono text-xs font-medium uppercase tracking-wider text-faint">
            Team Members
          </h3>

          <div className="overflow-x-auto rounded-lg border border-[var(--color-border-dim)]">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border-dim)] bg-surface">
                  <th className="px-4 py-3 font-mono text-xs font-medium uppercase tracking-wider text-faint">
                    Name
                  </th>
                  <th className="px-4 py-3 font-mono text-xs font-medium uppercase tracking-wider text-faint">
                    Email
                  </th>
                  <th className="px-4 py-3 font-mono text-xs font-medium uppercase tracking-wider text-faint">
                    Role
                  </th>
                </tr>
              </thead>
              <tbody>
                {members.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-faint">
                      {user
                        ? "Loading team members..."
                        : "No team members found"}
                    </td>
                  </tr>
                )}
                {members.map((m) => (
                  <tr
                    key={m.id}
                    className="border-b border-[var(--color-border-dim)] last:border-0"
                  >
                    <td className="px-4 py-3 text-white">{m.name}</td>
                    <td className="px-4 py-3 text-muted">{m.email}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-emerald-dim px-2.5 py-0.5 text-xs font-medium text-emerald">
                        {m.role}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
