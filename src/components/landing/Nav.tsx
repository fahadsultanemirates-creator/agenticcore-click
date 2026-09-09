import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Logo } from "../Logo";

export function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 border-b bg-cream/80 backdrop-blur transition-shadow duration-300 ${
        scrolled ? "border-ink/10 shadow-sm" : "border-transparent"
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <Link to="/" aria-label="agenticcore.click home" className="shrink-0">
          <Logo compact className="sm:hidden" />
          <Logo className="hidden sm:flex" />
        </Link>

        <nav className="hidden items-center gap-8 font-medium text-ink-soft md:flex">
          <a href="#how-it-works" className="group relative transition-colors hover:text-ink">
            How it works
            <span className="absolute -bottom-1 left-0 h-0.5 w-0 bg-gradient-to-r from-pink-500 to-orange-500 transition-all duration-200 group-hover:w-full" />
          </a>
          <a href="#services" className="group relative transition-colors hover:text-ink">
            Services
            <span className="absolute -bottom-1 left-0 h-0.5 w-0 bg-gradient-to-r from-pink-500 to-orange-500 transition-all duration-200 group-hover:w-full" />
          </a>
          <a href="#faq" className="group relative transition-colors hover:text-ink">
            FAQ
            <span className="absolute -bottom-1 left-0 h-0.5 w-0 bg-gradient-to-r from-pink-500 to-orange-500 transition-all duration-200 group-hover:w-full" />
          </a>
        </nav>

        <Link
          to="/dashboard"
          className="shrink-0 rounded-full bg-gradient-to-r from-pink-500 to-orange-500 px-4 py-2.5 text-sm font-semibold text-cream shadow-pop-pink-sm transition-transform hover:-translate-y-0.5 active:translate-y-0 active:shadow-none sm:px-5"
        >
          <span className="sm:hidden">Preview</span>
          <span className="hidden sm:inline">Preview the dashboard</span>
        </Link>
      </div>
    </header>
  );
}
