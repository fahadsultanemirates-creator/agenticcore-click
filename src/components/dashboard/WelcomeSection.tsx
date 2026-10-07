import { ArrowRight, Layers, PackageCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

type Props = {
  /** Delivered orders the client hasn't opened yet. */
  unseenCount: number;
};

// Top of the dashboard: who you are, and the one button worth putting
// first.
//
// It used to carry four more things, every one of them a second copy of
// something already on the page: a wallet card above the billing section
// that states the same balance, a Full Business Setup tile above the
// package that sells it, a "Talk to Forge" button above the Forge bubble
// that floats on every screen, and "Pick a service" above the service
// grid itself. A dashboard that says everything twice is how the thing
// you came back for ends up below the fold.
export function WelcomeSection({ unseenCount }: Props) {
  const { user } = useAuth();
  const firstName = user?.name?.trim()?.split(" ")[0] ?? "there";

  return (
    <section className="pt-8 sm:pt-10">
      <div className="animate-fade-up relative overflow-hidden rounded-2xl border border-border bg-surface p-5 sm:p-7">
        <div
          aria-hidden
          className="animate-blob pointer-events-none absolute -top-20 -right-16 h-56 w-56 rounded-full bg-yellow-400/10 blur-3xl"
        />
        <div className="relative">
          <p className="text-xs font-semibold tracking-wide text-fg-faint uppercase">Your workspace</p>
          <h1 className="mt-1.5 font-display text-2xl font-semibold text-fg sm:text-3xl">
            Welcome back, {firstName}.
          </h1>
          <p className="mt-2 max-w-md text-sm text-fg-muted sm:text-base">
            Pick a service below to start something new — everything finished is kept in your projects.
          </p>

          {/* Finished work used to land in the owner's Telegram and nowhere
              else, so a paying client had no way to know it was ready.
              This is that notice, and it now points where the work lives. */}
          {unseenCount > 0 ? (
            <Link
              to="/projects"
              className="mt-4 inline-flex items-center gap-2 rounded-full border border-yellow-400/40 bg-yellow-400/10 px-4 py-2 text-sm font-semibold text-yellow-400 transition-colors hover:bg-yellow-400/20"
            >
              <PackageCheck className="h-4 w-4" />
              {unseenCount === 1 ? "1 new item is ready" : `${unseenCount} new items are ready`}
            </Link>
          ) : null}

          <div className="mt-5">
            <Link
              to="/projects"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-yellow-400 px-5 py-3 text-sm font-semibold text-void shadow-glow-yellow transition-transform hover:-translate-y-0.5 active:translate-y-0"
            >
              <Layers className="h-4 w-4" /> Your projects
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
