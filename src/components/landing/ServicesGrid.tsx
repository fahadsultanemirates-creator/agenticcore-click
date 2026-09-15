import { ArrowRight, Clock } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { services } from "../../data/services";
import { Reveal } from "../Reveal";

export function ServicesGrid() {
  const { user } = useAuth();

  return (
    <section id="services" className="bg-surface/40 py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <h2 className="font-display text-4xl font-semibold tracking-tight text-fg sm:text-5xl">
            Everything a new business needs first
          </h2>
          <p className="mt-4 text-lg text-fg-muted">
            Seven services. Each one gets its own page to scope properly — not a one-line prompt box.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {services.map((service, i) => (
            <Reveal key={service.id} delay={(i % 4) * 80} className="h-full">
              <Link
                to={service.route}
                className="group relative flex h-full flex-col gap-3 rounded-2xl border border-border bg-surface p-5 transition-all duration-200 hover:-translate-y-1 hover:border-yellow-400/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-yellow-400/10 transition-colors duration-200 group-hover:bg-yellow-400/20">
                    <service.icon className="h-5 w-5 text-yellow-400" strokeWidth={2.25} />
                  </span>
                  <span className="font-display text-sm font-semibold whitespace-nowrap text-yellow-400">
                    {service.price}
                  </span>
                </div>
                <div>
                  <p className="font-display text-base font-semibold text-fg">{service.label}</p>
                  <p className="mt-0.5 text-sm text-fg-muted">{service.tagline}</p>
                </div>
                <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                  <span className="flex items-center gap-1 text-[11px] font-medium text-fg-faint">
                    <Clock className="h-3 w-3" /> {service.eta}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-fg-faint transition-all group-hover:translate-x-0.5 group-hover:text-yellow-400" />
                </div>
              </Link>
            </Reveal>
          ))}
        </div>

        <div className="mt-10 flex justify-center">
          <Link
            to={user ? "/dashboard" : "/signup"}
            className="inline-flex items-center gap-2 rounded-full bg-yellow-400 px-6 py-3 text-sm font-semibold text-void shadow-glow-yellow transition-transform hover:-translate-y-0.5"
          >
            {user ? "Go to your dashboard" : "Create an account to start"}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
