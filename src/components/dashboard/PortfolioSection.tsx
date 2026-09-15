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

// Sample rows for now (src/data/orders.ts) -- swapping in live `tasks` rows
// is a change to that one module, not to this layout.
export function PortfolioSection() {
  const sorted = [...orders].sort((a, b) => (a.requestedAt < b.requestedAt ? 1 : -1));

  return (
    <section className="border-t border-border py-10">
      <div className="mb-5">
        <h2 className="font-display text-xl font-semibold text-fg sm:text-2xl">Request history</h2>
        <p className="mt-1 text-sm text-fg-muted">Every service you've ordered, past and current.</p>
      </div>

      {/* Phone: one card per request -- a 5-column table can only scroll
          sideways at this width, which is what made the old dashboard feel
          cramped. Tablet and up gets the full table. */}
      <ul className="flex flex-col gap-3 sm:hidden">
        {sorted.map((order) => {
          const service = services.find((s) => s.id === order.serviceId);
          if (!service) return null;
          return (
            <li
              key={order.id}
              className="flex flex-col gap-2.5 rounded-2xl border border-border bg-surface p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-yellow-400/10">
                    <service.icon className="h-4 w-4 text-yellow-400" strokeWidth={2.25} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-fg">{service.label}</p>
                    <p className="font-mono text-[11px] text-fg-faint">{order.publicId}</p>
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusStyles[order.status]}`}
                >
                  {statusLabels[order.status]}
                </span>
              </div>
              <p className="text-sm text-fg-muted">{order.summary}</p>
              <p className="text-[11px] text-fg-faint">Requested {order.requestedAt}</p>
            </li>
          );
        })}
      </ul>

      <div className="hidden overflow-hidden rounded-2xl border border-border bg-surface sm:block">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs font-semibold tracking-wide text-fg-faint uppercase">
                <th className="px-5 py-3">Task ID</th>
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
                    <td className="px-5 py-3.5 font-mono text-xs text-fg-faint">{order.publicId}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-yellow-400/10">
                          <service.icon className="h-3.5 w-3.5 text-yellow-400" strokeWidth={2.25} />
                        </span>
                        <span className="font-medium whitespace-nowrap text-fg">{service.label}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-fg-muted">{order.summary}</td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-fg-faint">{order.requestedAt}</td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${statusStyles[order.status]}`}
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
    </section>
  );
}
