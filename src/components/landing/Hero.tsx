import { ArrowRight, MousePointerClick } from "lucide-react";
import { Link } from "react-router-dom";

export function Hero() {
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
            Website, logo, brochure, business card — the whole starter kit.
            Tell us what you need in a sentence or two. We hand back the
            real thing, not a template.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              to="/dashboard"
              className="group inline-flex items-center gap-2 rounded-full bg-yellow-400 px-7 py-3.5 text-base font-semibold text-void shadow-glow-yellow transition-transform hover:-translate-y-0.5 active:translate-y-0"
            >
              Preview the dashboard
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex items-center gap-2 rounded-full border-2 border-border px-7 py-3.5 text-base font-semibold text-fg transition-colors hover:border-yellow-400/60"
            >
              How it works
            </a>
          </div>

          <p className="mt-4 text-xs text-fg-faint">
            $20 / 20&nbsp;min is the pitch we're building toward — final pricing &amp; timing coming soon.
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
      <div className="grid grid-cols-[auto_1fr] gap-2 overflow-hidden rounded-xl border border-border bg-void">
        <div className="hidden w-36 flex-col gap-1.5 border-r border-border p-3 sm:flex">
          {["Website", "Logo", "Image", "Video"].map((label, i) => (
            <div
              key={label}
              className={`rounded-lg px-2.5 py-2 text-left text-xs font-medium ${
                i === 0 ? "bg-yellow-400 text-void" : "text-fg-muted"
              }`}
            >
              {label}
            </div>
          ))}
        </div>
        <div className="flex flex-col justify-center gap-3 p-6 sm:p-8">
          <p className="font-display text-lg font-medium text-fg sm:text-xl">
            What kind of website do you need?
          </p>
          <div className="h-16 rounded-lg border border-dashed border-yellow-400/30 bg-surface px-3 py-2 text-xs text-fg-faint">
            A one-page site for my dog-walking business, warm and friendly...
          </div>
          <div className="inline-flex w-fit items-center gap-1.5 rounded-full bg-yellow-400 px-4 py-2 text-xs font-semibold text-void">
            Generate <ArrowRight className="h-3 w-3" />
          </div>
        </div>
      </div>
    </div>
  );
}
