import { ArrowRight, Clock } from "lucide-react";
import { Link } from "react-router-dom";
import { services } from "../../data/services";

// This grid *is* the service navigation now. It replaces the old fixed left
// rail: two columns on a phone, up to four on a desktop, and each card opens
// its own full-width page (which carries a back button home to here).
export function ServicesSection() {
  return (
    <section id="services" className="py-8 sm:py-10">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-xl font-semibold text-fg sm:text-2xl">Services</h2>
          <p className="mt-1 text-sm text-fg-muted">
            Pick one and it opens its own page to scope properly.
          </p>
        </div>
        <Link
          to="/dashboard/forge"
          className="text-sm font-semibold text-yellow-400 transition-colors hover:text-yellow-300"
        >
          Not sure? Ask Forge →
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
        {services.map((service) => (
          <Link
            key={service.id}
            to={service.route}
            className="group flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 transition-all duration-200 hover:-translate-y-1 hover:border-yellow-400/40 hover:bg-surface-2 sm:p-5"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-yellow-400/10 transition-colors duration-200 group-hover:bg-yellow-400/20 sm:h-11 sm:w-11">
                <service.icon className="h-5 w-5 text-yellow-400" strokeWidth={2.25} />
              </span>
              <span className="font-display text-sm font-semibold whitespace-nowrap text-yellow-400">
                {service.price}
              </span>
            </div>

            <div className="min-w-0">
              <p className="font-display text-base font-semibold text-fg">{service.label}</p>
              <p className="mt-1 text-xs leading-relaxed text-fg-muted sm:text-sm">{service.detail}</p>
            </div>

            <div className="mt-auto flex items-center justify-between gap-2 pt-1">
              <span className="flex items-center gap-1 text-[11px] font-medium text-fg-faint">
                <Clock className="h-3 w-3" /> {service.eta}
              </span>
              <span className="flex items-center gap-1 text-xs font-semibold text-fg-muted transition-colors group-hover:text-yellow-400">
                Start <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
