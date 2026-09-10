import { LogOut } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import type { Service } from "../../data/services";

export function TopBar({ service }: { service: Service }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const initial = user?.name?.trim()?.[0]?.toUpperCase() ?? "Y";

  return (
    <header className="flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-4 sm:px-6">
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-fg-faint">Dashboard / {service.label}</p>
        <h1 className="truncate font-display text-lg font-semibold text-fg">{service.tagline}</h1>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <span className="hidden rounded-full bg-void px-3 py-1.5 text-xs font-semibold text-fg-muted sm:inline-block">
          Starter plan
        </span>
        <Link to="/" className="hidden text-sm font-semibold whitespace-nowrap text-fg-muted hover:text-fg sm:inline">
          Exit preview
        </Link>
        <button
          type="button"
          onClick={handleLogout}
          title="Log out"
          aria-label="Log out"
          className="flex h-9 w-9 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg sm:hidden"
        >
          <LogOut className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleLogout}
          className="hidden items-center gap-1.5 text-sm font-semibold whitespace-nowrap text-fg-muted hover:text-fg sm:flex"
        >
          <LogOut className="h-3.5 w-3.5" /> Log out
        </button>
        <span
          title={user?.email}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-yellow-400 text-sm font-semibold text-void"
        >
          {initial}
        </span>
      </div>
    </header>
  );
}
