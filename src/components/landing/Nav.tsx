import { Link } from "react-router-dom";
import { Logo } from "../Logo";

export function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-ink/10 bg-cream/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <Link to="/" aria-label="agenticcore.click home" className="shrink-0">
          <Logo compact className="sm:hidden" />
          <Logo className="hidden sm:flex" />
        </Link>

        <nav className="hidden items-center gap-8 font-medium text-ink-soft md:flex">
          <a href="#how-it-works" className="transition-colors hover:text-ink">
            How it works
          </a>
          <a href="#services" className="transition-colors hover:text-ink">
            Services
          </a>
          <a href="#faq" className="transition-colors hover:text-ink">
            FAQ
          </a>
        </nav>

        <Link
          to="/dashboard"
          className="shrink-0 rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-cream shadow-pop-sm transition-transform hover:-translate-y-0.5 active:translate-y-0 active:shadow-none sm:px-5"
        >
          <span className="sm:hidden">Preview</span>
          <span className="hidden sm:inline">Preview the dashboard</span>
        </Link>
      </div>
    </header>
  );
}
