import { ArrowRight, MousePointerClick } from "lucide-react";
import { Link } from "react-router-dom";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="animate-blob pointer-events-none absolute -top-24 -right-24 h-96 w-96 rounded-full bg-orange-300/50 blur-3xl"
      />
      <div
        aria-hidden
        className="animate-blob pointer-events-none absolute top-40 -left-32 h-80 w-80 rounded-full bg-pink-300/50 blur-3xl"
        style={{ animationDelay: "-5s" }}
      />

      <div className="relative mx-auto max-w-6xl px-6 pt-16 pb-24 md:pt-24 md:pb-32">
        <div className="animate-fade-up mx-auto max-w-3xl text-center">
          <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white/70 px-4 py-1.5 text-sm font-medium text-ink-soft">
            <MousePointerClick className="h-4 w-4 text-pink-600" />
            Pick a service. Get it back fast.
          </span>

          <h1 className="font-display text-5xl leading-[1.05] font-semibold tracking-tight text-ink sm:text-6xl md:text-7xl">
            Start a business in{" "}
            <span className="text-gradient">20 minutes</span> for{" "}
            <span className="text-gradient">$20</span>.
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-lg text-ink-soft md:text-xl">
            Website, logo, brochure, business card — the whole starter kit.
            Tell us what you need in a sentence or two. We hand back the
            real thing, not a template.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              to="/dashboard"
              className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-orange-500 px-7 py-3.5 text-base font-semibold text-cream shadow-pop transition-transform hover:-translate-y-0.5 active:translate-y-1 active:shadow-none"
            >
              Preview the dashboard
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex items-center gap-2 rounded-full border-2 border-orange-300 px-7 py-3.5 text-base font-semibold text-ink transition-colors hover:border-orange-500"
            >
              How it works
            </a>
          </div>

          <p className="mt-4 text-xs text-ink-faint">
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
      className="animate-fade-up mx-auto mt-16 max-w-3xl rotate-[-1deg] rounded-2xl border-2 border-ink bg-white p-2 shadow-pop transition-transform duration-300 hover:rotate-0 md:mt-20"
      style={{ animationDelay: "150ms" }}
    >
      <div className="flex items-center gap-1.5 px-2 pb-2">
        <span className="h-2.5 w-2.5 rounded-full bg-pink-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-orange-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-ink/15" />
        <span className="ml-3 flex-1 truncate rounded-full bg-cream-dim px-3 py-1 text-center text-xs text-ink-faint">
          agenticcore.click/dashboard
        </span>
      </div>
      <div className="grid grid-cols-[auto_1fr] gap-2 overflow-hidden rounded-xl border border-ink/10 bg-cream">
        <div className="hidden w-36 flex-col gap-1.5 border-r border-ink/10 bg-white/60 p-3 sm:flex">
          {["Website", "Logo", "Image", "Video"].map((label, i) => (
            <div
              key={label}
              className={`rounded-lg px-2.5 py-2 text-left text-xs font-medium ${
                i === 0
                  ? "bg-gradient-to-r from-pink-500 to-orange-500 text-cream"
                  : "text-ink-soft"
              }`}
            >
              {label}
            </div>
          ))}
        </div>
        <div className="flex flex-col justify-center gap-3 p-6 sm:p-8">
          <p className="font-display text-lg font-medium text-ink sm:text-xl">
            What kind of website do you need?
          </p>
          <div className="h-16 rounded-lg border border-dashed border-pink-200 bg-white/70 px-3 py-2 text-xs text-ink-faint">
            A one-page site for my dog-walking business, warm and friendly...
          </div>
          <div className="inline-flex w-fit items-center gap-1.5 rounded-full bg-gradient-to-r from-pink-500 to-orange-500 px-4 py-2 text-xs font-semibold text-cream">
            Generate <ArrowRight className="h-3 w-3" />
          </div>
        </div>
      </div>
    </div>
  );
}
