import { ArrowLeft, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { AccountMenu } from "../AccountMenu";
import { Logo } from "../Logo";

type Props = {
  /** Current page name, or null on the dashboard root (nothing to drill back through). */
  crumb: string | null;
  backTo: string;
  backLabel: string;
};

export function DashboardHeader({ crumb, backTo, backLabel }: Props) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-void/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-2 px-4 py-3 sm:gap-3 sm:px-6">
        <Link
          to={backTo}
          aria-label={`Back to ${backLabel}`}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border px-2.5 text-sm font-semibold text-fg-muted transition-colors hover:border-yellow-400/50 hover:text-fg sm:px-3.5"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">{backLabel}</span>
        </Link>

        <Link to="/dashboard" aria-label="Dashboard" className="min-w-0 shrink-0">
          <Logo compact className="sm:hidden" />
          <Logo className="hidden sm:flex" />
        </Link>

        {crumb && (
          <span className="hidden min-w-0 items-center gap-2 text-sm text-fg-faint md:flex">
            <span aria-hidden>/</span>
            <span className="truncate font-medium text-fg-muted">{crumb}</span>
          </span>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Link
            to="/dashboard/forge"
            title="Talk to Forge"
            className="flex h-9 items-center gap-1.5 rounded-full border border-yellow-400/40 bg-yellow-400/10 px-2.5 text-sm font-semibold text-yellow-400 transition-colors hover:bg-yellow-400/20 sm:px-3.5"
          >
            <Sparkles className="h-4 w-4" />
            <span className="hidden sm:inline">Forge</span>
          </Link>
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}
