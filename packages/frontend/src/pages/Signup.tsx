import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function Signup() {
  const { register, token, loading: authLoading } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-void">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-faint border-t-emerald" />
      </div>
    );
  }

  if (token) {
    return <Navigate to="/app/dashboard" replace />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await register(email, password, name, organizationName);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-void px-4">
      <div className="w-full max-w-sm">
        <div className="glass-card p-8">
          <div className="mb-6 text-center">
            <div className="mb-3 flex justify-center">
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  border: "2px solid var(--color-emerald)",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    width: "8px",
                    height: "8px",
                    background: "var(--color-emerald)",
                    boxShadow: "0 0 10px var(--color-emerald)",
                  }}
                />
              </div>
            </div>
            <h1 className="font-display text-lg font-bold tracking-widest text-white">
              LEDGERPULSE
            </h1>
            <p className="mt-1 text-sm text-muted">Create your organization</p>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-red/30 bg-red/10 p-3 text-sm text-red">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="orgName"
                className="block text-sm font-medium text-muted"
              >
                Organization name
              </label>
              <input
                id="orgName"
                type="text"
                required
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-[var(--color-border-dim)] bg-panel px-3 py-2 text-sm text-white shadow-sm placeholder:text-faint focus:border-emerald focus:outline-none focus:ring-1 focus:ring-emerald"
                placeholder="Acme Corp"
              />
            </div>

            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-muted"
              >
                Your name
              </label>
              <input
                id="name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-[var(--color-border-dim)] bg-panel px-3 py-2 text-sm text-white shadow-sm placeholder:text-faint focus:border-emerald focus:outline-none focus:ring-1 focus:ring-emerald"
                placeholder="Ravi"
              />
            </div>

            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-muted"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-[var(--color-border-dim)] bg-panel px-3 py-2 text-sm text-white shadow-sm placeholder:text-faint focus:border-emerald focus:outline-none focus:ring-1 focus:ring-emerald"
                placeholder="you@company.com"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-muted"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-[var(--color-border-dim)] bg-panel px-3 py-2 text-sm text-white shadow-sm placeholder:text-faint focus:border-emerald focus:outline-none focus:ring-1 focus:ring-emerald"
                placeholder="At least 8 characters"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-void hover:bg-emerald hover:shadow-[0_0_30px_rgba(16,185,129,0.4)] disabled:opacity-50 transition-all uppercase tracking-wider font-mono"
            >
              {submitting ? "Creating account..." : "Create account"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted">
            Already have an account?{" "}
            <Link
              to="/login"
              className="font-medium text-emerald hover:text-emerald/80 transition-colors"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
