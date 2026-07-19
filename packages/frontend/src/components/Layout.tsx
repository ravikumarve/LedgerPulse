import { useState } from "react";
import { NavLink, Outlet, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

const navItems = [
  { to: "/app/dashboard", label: "Dashboard", icon: "◈" },
  { to: "/app/invoices", label: "Invoices", icon: "📄" },
  { to: "/app/discrepancies", label: "Discrepancies", icon: "⚠" },
  { to: "/app/settings", label: "Settings", icon: "⚙" },
];

export default function Layout() {
  const { user, organization, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex min-h-screen bg-void">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? "w-64" : "w-0 -ml-64"
        } shrink-0 border-r border-[var(--color-border-dim)] bg-surface transition-all duration-300`}
      >
        <div className="flex h-14 items-center gap-2 border-b border-[var(--color-border-dim)] px-5">
          <Link to="/" className="flex items-center gap-2 no-underline">
            <div
              style={{
                width: "20px",
                height: "20px",
                border: "2px solid var(--color-emerald)",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  width: "5px",
                  height: "5px",
                  background: "var(--color-emerald)",
                  boxShadow: "0 0 10px var(--color-emerald)",
                }}
              />
            </div>
            <span className="font-display text-sm font-bold tracking-widest text-white">
              LEDGERPULSE
            </span>
          </Link>
        </div>
        <nav className="p-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-emerald-dim text-emerald"
                    : "text-muted hover:bg-panel hover:text-white"
                }`
              }
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Org info */}
        <div className="border-t border-[var(--color-border-dim)] p-4">
          <p className="font-mono text-xs font-medium text-faint uppercase tracking-wider">
            ORGANIZATION
          </p>
          <p className="mt-1 truncate text-sm font-medium text-white">
            {organization?.name ?? "—"}
          </p>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <header className="flex h-14 items-center justify-between border-b border-[var(--color-border-dim)] bg-surface px-6">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="rounded-lg p-1.5 text-muted hover:bg-panel hover:text-white transition-colors"
            title="Toggle sidebar"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12h18M3 6h18M3 18h18" />
            </svg>
          </button>

          {/* User menu */}
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-panel hover:text-white transition-colors"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-dim text-xs font-semibold text-emerald">
                {user?.name?.charAt(0)?.toUpperCase() ?? "?"}
              </span>
              <span className="hidden sm:inline">{user?.name ?? "User"}</span>
            </button>

            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-[var(--color-border-dim)] bg-panel py-1 shadow-lg">
                  <div className="border-b border-[var(--color-border-dim)] px-4 py-2">
                    <p className="text-sm font-medium text-white">
                      {user?.name}
                    </p>
                    <p className="text-xs text-faint">{user?.email}</p>
                  </div>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      logout();
                    }}
                    className="flex w-full items-center px-4 py-2 text-sm text-muted hover:bg-surface hover:text-white transition-colors"
                  >
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </header>

        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
