import { Link } from "react-router-dom";
import type { Service } from "../../data/services";

export function TopBar({ service }: { service: Service }) {
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
        <Link to="/" className="text-sm font-semibold whitespace-nowrap text-fg-muted hover:text-fg">
          <span className="sm:hidden">Exit</span>
          <span className="hidden sm:inline">Exit preview</span>
        </Link>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-yellow-400 text-sm font-semibold text-void">
          Y
        </span>
      </div>
    </header>
  );
}
