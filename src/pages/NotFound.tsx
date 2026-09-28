// Anything that isn't a route.
//
// Netlify sends every path to index.html so the SPA can route it, which
// means a typo used to render nothing at all -- a white screen with no way
// back. A wrong URL should still look like the site.

import { ArrowRight, Home } from "lucide-react";
import { Link } from "react-router-dom";
import { Logo } from "../components/Logo";

export function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-void px-6 py-16">
      <div className="w-full max-w-md text-center">
        <Link to="/" className="mb-8 flex justify-center">
          <Logo />
        </Link>

        <p className="font-display text-6xl font-semibold text-yellow-400">404</p>
        <h1 className="mt-3 font-display text-2xl font-semibold text-fg">
          That page isn't here
        </h1>
        <p className="mt-2 text-sm text-fg-muted">
          The link may be old, or slightly mistyped. Nothing is broken on your side.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-full bg-yellow-400 px-5 py-3 text-sm font-semibold text-void shadow-glow-yellow transition-transform hover:-translate-y-0.5"
          >
            <Home className="h-4 w-4" />
            Home
          </Link>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 rounded-full border-2 border-border px-5 py-3 text-sm font-semibold text-fg-muted transition-colors hover:border-yellow-400/50 hover:text-fg"
          >
            Your dashboard
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
