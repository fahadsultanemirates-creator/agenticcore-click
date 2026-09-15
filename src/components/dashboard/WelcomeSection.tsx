import { ArrowRight, Plus, Sparkles, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useWallet } from "../../lib/useWallet";

// Top of the dashboard: who you are, what's in the wallet, and the two ways
// to start something (talk to Forge, or pick a service below).
export function WelcomeSection() {
  const { user } = useAuth();
  const { balance, loading } = useWallet();
  const firstName = user?.name?.trim()?.split(" ")[0] ?? "there";
  const lowBalance = !loading && (balance ?? 0) < 10;

  return (
    <section className="pt-8 sm:pt-10">
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
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
              Describe what your business needs and Forge scopes it for you — or pick a service
              below and fill in the brief yourself.
            </p>

            <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
              <Link
                to="/dashboard/forge"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-yellow-400 px-5 py-3 text-sm font-semibold text-void shadow-glow-yellow transition-transform hover:-translate-y-0.5 active:translate-y-0"
              >
                <Sparkles className="h-4 w-4" /> Talk to Forge
              </Link>
              <a
                href="#services"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-border px-5 py-3 text-sm font-semibold text-fg-muted transition-colors hover:border-yellow-400/50 hover:text-fg"
              >
                <Plus className="h-4 w-4" /> Pick a service
              </a>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-1 flex-col justify-between gap-4 rounded-2xl border border-border bg-surface p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-fg-faint uppercase">
                  <Wallet className="h-3.5 w-3.5 text-yellow-400" /> Wallet balance
                </p>
                <p className="mt-1.5 font-display text-3xl font-semibold text-fg">
                  {loading ? "—" : `$${(balance ?? 0).toFixed(2)}`}
                </p>
              </div>
            </div>

            <div>
              <p className="text-xs text-fg-muted">
                {lowBalance
                  ? "You need at least $10 in the wallet to start a service."
                  : "Ready to spend on any service below."}
              </p>
              <a
                href="#billing"
                className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-yellow-400/40 bg-yellow-400/10 px-4 py-2.5 text-sm font-semibold text-yellow-400 transition-colors hover:bg-yellow-400/20"
              >
                Top up <ArrowRight className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>

          <a
            href="#billing"
            className="group flex items-center justify-between gap-3 rounded-2xl border-2 border-yellow-400 bg-gradient-to-br from-yellow-400/10 to-transparent p-5"
          >
            <div>
              <p className="font-display text-base font-semibold text-fg">Full Business Setup</p>
              <p className="mt-0.5 text-xs text-fg-muted">Everything at once, for $20.</p>
            </div>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-yellow-400 text-void transition-transform group-hover:translate-x-0.5">
              <ArrowRight className="h-4 w-4" />
            </span>
          </a>
        </div>
      </div>
    </section>
  );
}
