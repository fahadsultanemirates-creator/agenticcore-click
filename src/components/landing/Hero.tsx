import { ArrowRight, Layers, MousePointerClick, Sparkles } from "lucide-react";
import dashboardPreview from "../../assets/dashboard-preview.webp";
import { TelegramIcon } from "../icons/TelegramIcon";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

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

          {/* Forge, named and explained above the fold. The floating button
              was the only thing pointing at it, and a circle in the corner
              does not tell anyone that they can simply describe the job and
              have it ordered for them. */}
          <p className="mx-auto mt-5 max-w-xl text-base text-fg-muted">
            Or skip the forms —{" "}
            <Link
              to={user ? "/dashboard/forge" : "/signup"}
              className="font-semibold text-yellow-400 underline decoration-yellow-400/40 underline-offset-4 transition-colors hover:decoration-yellow-400"
            >
              talk to Forge
            </Link>
            , our assistant. Describe what you want in your own words and it
            places the order for you.
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
            {/* Forge and the projects page were both reachable only from
                inside the dashboard, which is behind a login. Both are
                reasons to sign up, so both say so here. */}
            <Link
              to={user ? "/dashboard/forge" : "/signup"}
              className="inline-flex items-center gap-2 rounded-full border-2 border-border px-7 py-3.5 text-base font-semibold text-fg transition-colors hover:border-yellow-400/60"
            >
              <Sparkles className="h-4 w-4 text-yellow-400" />
              Talk to Forge
            </Link>
            <Link
              to={user ? "/projects" : "/signup"}
              className="inline-flex items-center gap-2 rounded-full border-2 border-border px-7 py-3.5 text-base font-semibold text-fg transition-colors hover:border-yellow-400/60"
            >
              <Layers className="h-4 w-4 text-yellow-400" />
              {user ? "Your projects" : "How projects work"}
            </Link>
          </div>

          <p className="mt-4 text-xs text-fg-faint">
            $20 is our Full Business Setup package — every other service keeps its own price, from $1.
          </p>
        </div>

        <DashboardPreview />
        <TelegramCallout />
      </div>
    </section>
  );
}

// The whole service also runs inside Telegram, and nothing on the page said
// so. Placed directly under the preview, where someone who has just looked at
// the dashboard learns they never have to open it.
function TelegramCallout() {
  return (
    <div className="animate-fade-up mx-auto mt-8 max-w-3xl" style={{ animationDelay: "250ms" }}>
      <a
        href="https://t.me/AgenticcoreClickManagerbot"
        target="_blank"
        rel="noopener noreferrer"
        className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface px-6 py-5 text-center transition-colors hover:border-yellow-400/50 active:border-yellow-400 sm:flex-row sm:text-left"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-yellow-400 text-void">
          <TelegramIcon className="h-6 w-6" />
        </span>
        <span className="flex-1">
          <span className="block font-display text-base font-semibold text-fg">
            Prefer Telegram? The whole thing works there too.
          </span>
          <span className="mt-1 block text-sm text-fg-muted">
            Create your project in a chat, get the finished files sent straight
            back to you, and open an account from Telegram without ever touching
            the website.
          </span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-yellow-400 px-4 py-2 text-sm font-semibold text-void transition-transform hover:-translate-y-0.5 active:translate-y-0">
          Open the bot
          <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </a>
    </div>
  );
}

/**
 * The dashboard, as a picture.
 *
 * This was a hand-built mock of the real dashboard in markup: a fake
 * browser chrome, four service cards read from the live catalogue, a
 * sample brief. It looked like the product because it WAS the product's
 * components, which is also why it had to be maintained like the product
 * -- the service list changed under it, the wallet figure was invented,
 * and the "preview" slowly stopped matching what anybody actually sees.
 *
 * An illustration makes no claim to be a screenshot, so it cannot go
 * stale. It is also 78KB of webp against a few hundred lines of markup
 * that re-rendered on every catalogue change.
 */
function DashboardPreview() {
  return (
    <div className="animate-fade-up mx-auto mt-16 max-w-3xl md:mt-20" style={{ animationDelay: "150ms" }}>
      <img
        src={dashboardPreview}
        alt=""
        aria-hidden
        width={1100}
        height={867}
        className="h-auto w-full"
      />
    </div>
  );
}
