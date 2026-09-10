import { Download, Eye } from "lucide-react";
import { orders } from "../../data/orders";
import { services } from "../../data/services";

export function DeliverablesSection() {
  const delivered = orders.filter((o) => o.status === "delivered");

  return (
    <section className="border-t border-border px-6 py-10 sm:px-10 lg:px-16">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6">
          <h2 className="font-display text-2xl font-semibold text-fg">Deliverables</h2>
          <p className="mt-1 text-sm text-fg-muted">
            What's actually landed for you so far. (Dummy entries for this preview.)
          </p>
        </div>

        {delivered.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-surface p-6 text-sm text-fg-faint">
            Nothing delivered yet — once a service is generated, it'll show up here.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {delivered.map((order) => {
              const service = services.find((s) => s.id === order.serviceId);
              if (!service) return null;
              return (
                <div
                  key={order.id}
                  className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-yellow-400/10">
                      <service.icon className="h-5 w-5 text-yellow-400" strokeWidth={2.25} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-display text-base font-semibold text-fg">
                        {service.label}
                      </p>
                      <p className="text-xs text-fg-faint">{order.requestedAt}</p>
                    </div>
                  </div>
                  <p className="text-sm text-fg-muted">{order.summary}</p>
                  <div className="mt-auto flex gap-2 pt-1">
                    <button
                      type="button"
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-yellow-400 px-3 py-2 text-xs font-semibold text-void transition-transform hover:-translate-y-0.5"
                    >
                      <Download className="h-3.5 w-3.5" /> Download
                    </button>
                    <button
                      type="button"
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-full border-2 border-border px-3 py-2 text-xs font-semibold text-fg-muted transition-colors hover:border-yellow-400/50 hover:text-fg"
                    >
                      <Eye className="h-3.5 w-3.5" /> View
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
