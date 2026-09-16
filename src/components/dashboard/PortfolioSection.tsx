import { services } from "../../data/services";
import type { Order } from "../../lib/useOrders";

// Task statuses as the client should read them. The pipeline has more states
// than this (queued/claimed/in_progress all mean "we're on it"), and a client
// has no use for the distinction.
const statusStyles: Record<string, string> = {
  delivered: "bg-yellow-400/10 text-yellow-400",
  failed: "bg-red-400/10 text-red-400",
  needs_info: "bg-orange-400/10 text-orange-400"
};
const DEFAULT_STATUS_STYLE = "bg-fg-muted/10 text-fg-muted";

const statusLabels: Record<string, string> = {
  queued: "Queued",
  claimed: "In progress",
  in_progress: "In progress",
  delivered: "Delivered",
  failed: "Failed",
  needs_info: "Needs info"
};

function statusLabel(status: string): string {
  return statusLabels[status] ?? status.replace(/_/g, " ");
}

// Shown next to a delivered order so the client can see what they're still
// entitled to without asking. Products that can only be regenerated (images,
// video, QR codes) include none, and say so rather than showing "0 left".
function revisionNote(order: Order): string | null {
  if (order.status !== "delivered") return null;
  if (order.revisionsAllowed === 0) return "No revisions included";
  const left = Math.max(0, order.revisionsAllowed - order.revisionsUsed);
  return `${left} of ${order.revisionsAllowed} revision${order.revisionsAllowed === 1 ? "" : "s"} left`;
}

type Props = {
  orders: Order[];
  loading: boolean;
  failed: boolean;
};

export function PortfolioSection({ orders, loading, failed }: Props) {
  return (
    <section className="border-t border-border py-10">
      <div className="mb-5">
        <h2 className="font-display text-xl font-semibold text-fg sm:text-2xl">Request history</h2>
        <p className="mt-1 text-sm text-fg-muted">Every service you've ordered, past and current.</p>
      </div>

      {loading ? (
        <p className="rounded-2xl border border-dashed border-border bg-surface p-6 text-sm text-fg-faint">
          Loading your requests…
        </p>
      ) : failed ? (
        <p className="rounded-2xl border border-dashed border-red-400/40 bg-surface p-6 text-sm text-fg-muted">
          Couldn't load your requests just now. Refresh the page — nothing has been lost.
        </p>
      ) : orders.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-surface p-6 text-sm text-fg-faint">
          You haven't ordered anything yet. Pick a service above to get started.
        </p>
      ) : (
        <>
          {/* Phone: one card per request -- a 5-column table can only scroll
              sideways at this width, which is what made the old dashboard feel
              cramped. Tablet and up gets the full table. */}
          <ul className="flex flex-col gap-3 sm:hidden">
            {orders.map((order) => {
              const service = services.find((s) => s.id === order.serviceId);
              const note = revisionNote(order);
              return (
                <li
                  key={order.id}
                  className="flex flex-col gap-2.5 rounded-2xl border border-border bg-surface p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-yellow-400/10">
                        {service ? (
                          <service.icon className="h-4 w-4 text-yellow-400" strokeWidth={2.25} />
                        ) : null}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-fg">{order.product}</p>
                        <p className="font-mono text-[11px] text-fg-faint">{order.publicId}</p>
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusStyles[order.status] ?? DEFAULT_STATUS_STYLE}`}
                    >
                      {statusLabel(order.status)}
                    </span>
                  </div>
                  <p className="text-sm text-fg-muted">{order.summary}</p>
                  <p className="text-[11px] text-fg-faint">
                    Requested {order.requestedAt}
                    {note ? ` · ${note}` : ""}
                  </p>
                </li>
              );
            })}
          </ul>

          <div className="hidden overflow-hidden rounded-2xl border border-border bg-surface sm:block">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs font-semibold tracking-wide text-fg-faint uppercase">
                    <th className="px-5 py-3">Order</th>
                    <th className="px-5 py-3">Product</th>
                    <th className="px-5 py-3">Summary</th>
                    <th className="px-5 py-3">Requested</th>
                    <th className="px-5 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => {
                    const service = services.find((s) => s.id === order.serviceId);
                    const note = revisionNote(order);
                    return (
                      <tr key={order.id} className="border-b border-border last:border-0">
                        <td className="px-5 py-3.5 font-mono text-xs whitespace-nowrap text-fg-faint">
                          {order.publicId}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-yellow-400/10">
                              {service ? (
                                <service.icon className="h-3.5 w-3.5 text-yellow-400" strokeWidth={2.25} />
                              ) : null}
                            </span>
                            <span className="font-medium whitespace-nowrap text-fg">{order.product}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-fg-muted">{order.summary}</td>
                        <td className="px-5 py-3.5 whitespace-nowrap text-fg-faint">
                          {order.requestedAt}
                          {note ? <span className="block text-[11px]">{note}</span> : null}
                        </td>
                        <td className="px-5 py-3.5">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${statusStyles[order.status] ?? DEFAULT_STATUS_STYLE}`}
                          >
                            {statusLabel(order.status)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
