import { ArrowRight, MousePointerClick, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { services } from "../../data/services";

export function Hero() {
  const { user } = useAuth();

  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="animate-blob pointer-events-none absolute -top-24 -right-24 h-96 w-96 rounded-full bg-yellow-400/10 blur-3xl"
      />
      <div
        aria-hidden
        className="animate-blob pointer-events-none absolute top-40 -left-32 h-80 w-80 rounded-full bg-yellow-400/10 blur-3xl"
        style={{ animationDelay: "-5s" }}
      />
      <div
        aria-hidden
        className="bg-noise pointer-events-none absolute inset-0 opacity-[0.03]"
      />

      <div className="relative mx-auto max-w-6xl px-6 pt-16 pb-24 md:pt-24 md:pb-32">
        <div className="animate-fade-up mx-auto max-w-3xl text-center">
          <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-1.5 text-sm font-medium text-fg-muted">
            <MousePointerClick className="h-4 w-4 text-yellow-400" />
            Pick a service. Get it back fast.
          </span>

          <h1 className="font-display text-5xl leading-[1.05] font-semibold tracking-tight text-fg sm:text-6xl md:text-7xl">
            Start a business in{" "}
            <span className="text-yellow-400">20 minutes</span> for{" "}
            <span className="text-yellow-400">$20</span>.
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-lg text-fg-muted md:text-xl">
            Website, documents, social media, video, brand kit — the whole
            starter kit. Tell us what you need, one service at a time. We
            hand back the real thing, not a template.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              to={user ? "/dashboard" : "/signup"}
              className="group inline-flex items-center gap-2 rounded-full bg-yellow-400 px-7 py-3.5 text-base font-semibold text-void shadow-glow-yellow transition-transform hover:-translate-y-0.5 active:translate-y-0"
            >
              {user ? "Open your dashboard" : "Start your business"}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href="#services"
              className="inline-flex items-center gap-2 rounded-full border-2 border-border px-7 py-3.5 text-base font-semibold text-fg transition-colors hover:border-yellow-400/60"
            >
              See all 7 services
            </a>
          </div>

          <p className="mt-4 text-xs text-fg-faint">
            $20 is our Full Business Setup package — every other service keeps its own price, from $8.
          </p>
        </div>

        <BrowserPreview />
      </div>
    </section>
  );
}

function BrowserPreview() {
  return (
    <div
      className="animate-fade-up mx-auto mt-16 max-w-3xl rounded-2xl border border-border bg-surface p-2 shadow-glow transition-transform duration-300 md:mt-20"
      style={{ animationDelay: "150ms" }}
    >
      <div className="flex items-center gap-1.5 px-2 pb-2">
        <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-fg-faint/40" />
        <span className="h-2.5 w-2.5 rounded-full bg-fg-faint/40" />
        <span className="ml-3 flex-1 truncate rounded-full bg-void px-3 py-1 text-center text-xs text-fg-faint">
          agenticcore.click/dashboard
        </span>
      </div>
      {/* Mirrors the real dashboard: a grid of services, not a side rail. */}
      <div className="overflow-hidden rounded-xl border border-border bg-void p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <p className="font-display text-base font-medium text-fg sm:text-lg">
            Welcome back — what are we building?
          </p>
          <span className="hidden rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-fg-muted sm:inline">
            Wallet $30.00
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {services.slice(0, 4).map((service, i) => (
            <div
              key={service.id}
              className={`flex flex-col gap-2 rounded-lg border p-2.5 ${
                i === 0 ? "border-yellow-400/60 bg-yellow-400/10" : "border-border bg-surface"
              }`}
            >
              <div className="flex items-center justify-between gap-1.5">
                <service.icon className="h-4 w-4 text-yellow-400" strokeWidth={2.25} />
                <span className="text-[10px] font-semibold text-yellow-400">{service.price}</span>
              </div>
              <span className="truncate text-[11px] font-semibold text-fg">{service.label}</span>
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-2 rounded-lg border border-dashed border-yellow-400/30 bg-surface px-3 py-2.5">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-yellow-400" />
          <span className="truncate text-xs text-fg-faint">
            A one-page site for my dog-walking business, warm and friendly...
          </span>
        </div>
      </div>
    </div>
  );
}
