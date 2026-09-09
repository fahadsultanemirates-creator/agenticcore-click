import { Link } from "react-router-dom";
import { services } from "../../data/services";
import { Reveal } from "../Reveal";

export function ServicesGrid() {
  return (
    <section id="services" className="bg-surface/40 py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <h2 className="font-display text-4xl font-semibold tracking-tight text-fg sm:text-5xl">
            Everything a new business needs first
          </h2>
          <p className="mt-4 text-lg text-fg-muted">
            Starting small on purpose — more services land every few weeks.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {services.map((service, i) => (
            <Reveal key={service.id} delay={(i % 4) * 80} className="h-full">
              <div
                className={`group relative flex h-full flex-col gap-3 rounded-2xl border p-5 transition-all duration-200 ${
                  service.comingSoon
                    ? "border-dashed border-border bg-transparent"
                    : "border-border bg-surface hover:-translate-y-1 hover:border-yellow-400/40"
                }`}
              >
                <div
                  className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors duration-200 ${
                    service.comingSoon
                      ? "bg-fg-faint/10"
                      : "bg-yellow-400/10 group-hover:bg-yellow-400/20"
                  }`}
                >
                  <service.icon
                    className={`h-5 w-5 ${service.comingSoon ? "text-fg-faint" : "text-yellow-400"}`}
                    strokeWidth={2.25}
                  />
                </div>
                <div>
                  <p className="font-display text-base font-semibold text-fg">
                    {service.label}
                  </p>
                  <p className="mt-0.5 text-sm text-fg-muted">{service.tagline}</p>
                </div>
                {!service.comingSoon && (
                  <p className="mt-auto text-xs font-medium text-fg-faint">
                    {service.eta} &middot; {service.price}
                  </p>
                )}
                {service.comingSoon && (
                  <span className="mt-auto w-fit rounded-full bg-fg-faint/10 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-fg-faint uppercase">
                    Soon
                  </span>
                )}
              </div>
            </Reveal>
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-fg-faint">
          Prices and turnaround times shown are placeholders while we finish building.
        </p>

        <div className="mt-10 flex justify-center">
          <Link
            to="/dashboard"
            className="rounded-full bg-yellow-400 px-6 py-3 text-sm font-semibold text-void shadow-glow-yellow transition-transform hover:-translate-y-0.5"
          >
            Explore the dashboard mockup
          </Link>
        </div>
      </div>
    </section>
  );
}
