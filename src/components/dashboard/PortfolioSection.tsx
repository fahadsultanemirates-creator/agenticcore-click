import { orders, type OrderStatus } from "../../data/orders";
import { services } from "../../data/services";

const statusStyles: Record<OrderStatus, string> = {
  delivered: "bg-yellow-400/10 text-yellow-400",
  in_progress: "bg-fg-muted/10 text-fg-muted",
  draft: "bg-fg-faint/10 text-fg-faint",
};

const statusLabels: Record<OrderStatus, string> = {
  delivered: "Delivered",
  in_progress: "In progress",
  draft: "Draft",
};

export function PortfolioSection() {
  const sorted = [...orders].sort((a, b) => (a.requestedAt < b.requestedAt ? 1 : -1));

  return (
    <section className="border-t border-border px-6 py-10 sm:px-10 lg:px-16">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6">
          <h2 className="font-display text-2xl font-semibold text-fg">Portfolio &amp; history</h2>
          <p className="mt-1 text-sm text-fg-muted">
            Every service you've ordered, past and current.
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs font-semibold tracking-wide text-fg-faint uppercase">
                  <th className="px-5 py-3">Service</th>
                  <th className="px-5 py-3">Summary</th>
                  <th className="px-5 py-3">Requested</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((order) => {
                  const service = services.find((s) => s.id === order.serviceId);
                  if (!service) return null;
                  return (
                    <tr key={order.id} className="border-b border-border last:border-0">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-yellow-400/10">
                            <service.icon className="h-3.5 w-3.5 text-yellow-400" strokeWidth={2.25} />
                          </span>
                          <span className="font-medium text-fg">{service.label}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-fg-muted">{order.summary}</td>
                      <td className="px-5 py-3.5 text-fg-faint">{order.requestedAt}</td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles[order.status]}`}
                        >
                          {statusLabels[order.status]}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
