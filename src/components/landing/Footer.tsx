import { Mail } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Logo } from "../Logo";

function IconLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      aria-label={label}
      title={label}
      className="flex h-9 w-9 items-center justify-center rounded-full bg-yellow-400 text-void transition-transform hover:-translate-y-0.5"
    >
      {children}
    </a>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-border px-6 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 sm:flex-row">
        <Logo />
        <div className="flex flex-col items-center gap-2 sm:items-start">
          <p className="text-sm text-fg-faint">
            Part of the AgenticCore family — the fast, self-serve one.
          </p>
          <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-fg-faint">
            <Link to="/terms" className="transition-colors hover:text-fg">Terms</Link>
            <Link to="/privacy" className="transition-colors hover:text-fg">Privacy</Link>
            <Link to="/refunds" className="transition-colors hover:text-fg">Refunds</Link>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <p className="text-sm text-fg-faint">
            &copy; {new Date().getFullYear()} agenticcore.click
          </p>
          <div className="flex items-center gap-2">
            <IconLink href="mailto:hello@agenticcore.click" label="Email us">
              <Mail className="h-4 w-4" />
            </IconLink>
          </div>
        </div>
      </div>
    </footer>
  );
}
