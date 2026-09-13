import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { services } from "../../data/services";

export function NewRequestSection() {
  return (
    <section className="px-6 py-10 sm:px-10 lg:px-16">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6">
          <h2 className="font-display text-2xl font-semibold text-fg">New request</h2>
          <p className="mt-1 text-sm text-fg-muted">Pick a service — each one opens its own page to scope properly.</p>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {services.map((service) => (
            <Link
              key={service.id}
              to={service.route}
              className="group flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 transition-all duration-200 hover:-translate-y-1 hover:border-yellow-400/40"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-yellow-400/10 transition-colors duration-200 group-hover:bg-yellow-400/20">
                <service.icon className="h-5 w-5 text-yellow-400" strokeWidth={2.25} />
              </div>
              <div>
                <p className="font-display text-base font-semibold text-fg">{service.label}</p>
                <p className="mt-0.5 text-sm text-fg-muted">{service.tagline}</p>
              </div>
              <span className="mt-auto flex items-center gap-1 text-xs font-semibold text-yellow-400 opacity-0 transition-opacity group-hover:opacity-100">
                Start <ArrowRight className="h-3 w-3" />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
