import { Link } from "react-router-dom";
import { services } from "../../data/services";

export function ServicesGrid() {
  return (
    <section id="services" className="bg-cream-dim py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <h2 className="font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
            Everything a new business needs first
          </h2>
          <p className="mt-4 text-lg text-ink-soft">
            Starting small on purpose — more services land every few weeks.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {services.map((service) => (
            <div
              key={service.id}
              className={`group relative flex flex-col gap-3 rounded-2xl border-2 p-5 transition-all ${
                service.comingSoon
                  ? "border-dashed border-ink/20 bg-white/40"
                  : "border-ink bg-white hover:-translate-y-1 hover:shadow-pop-sm"
              }`}
            >
              <div
                className={`flex h-11 w-11 items-center justify-center rounded-xl ${
                  service.comingSoon
                    ? "bg-ink/10"
                    : "bg-gradient-to-br from-pink-500 to-orange-500"
                }`}
              >
                <service.icon
                  className={`h-5 w-5 ${service.comingSoon ? "text-ink-faint" : "text-white"}`}
                  strokeWidth={2.25}
                />
              </div>
              <div>
                <p className="font-display text-base font-semibold text-ink">
                  {service.label}
                </p>
                <p className="mt-0.5 text-sm text-ink-soft">{service.tagline}</p>
              </div>
              {!service.comingSoon && (
                <p className="mt-auto text-xs font-medium text-ink-faint">
                  {service.eta} &middot; {service.price}
                </p>
              )}
              {service.comingSoon && (
                <span className="mt-auto w-fit rounded-full bg-ink/10 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-ink-faint uppercase">
                  Soon
                </span>
              )}
            </div>
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-ink-faint">
          Prices and turnaround times shown are placeholders while we finish building.
        </p>

        <div className="mt-10 flex justify-center">
          <Link
            to="/dashboard"
            className="rounded-full bg-ink px-6 py-3 text-sm font-semibold text-cream shadow-pop-sm transition-transform hover:-translate-y-0.5"
          >
            Explore the dashboard mockup
          </Link>
        </div>
      </div>
    </section>
  );
}
