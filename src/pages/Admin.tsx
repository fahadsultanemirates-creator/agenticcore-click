import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { AccountMenu } from "../components/AccountMenu";
import { Logo } from "../components/Logo";
import { useAuth } from "../context/AuthContext";
import { orders, type OrderStatus } from "../data/orders";
import { getService } from "../data/services";

const statusStyles: Record<OrderStatus, string> = {
  delivered: "bg-yellow-400/10 text-yellow-400",
  in_progress: "bg-fg-muted/10 text-fg-muted",
  draft: "bg-fg-faint/10 text-fg-faint",
};

const dummyBilling = [
  { user: "jordan@rivera.co", amount: "$20", type: "Full Business Setup", status: "Paid" },
  { user: "sam@northbay.studio", amount: "$30", type: "Wallet top-up", status: "Paid" },
  { user: "priya@lumen.co", amount: "$10", type: "Wallet top-up", status: "Pending" },
];

export function Admin() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-void">
      <header className="sticky top-0 z-40 border-b border-border bg-void/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-2 px-4 py-3 sm:gap-3 sm:px-6">
          <Link
            to="/dashboard"
            aria-label="Back to dashboard"
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border px-2.5 text-sm font-semibold text-fg-muted transition-colors hover:border-yellow-400/50 hover:text-fg sm:px-3.5"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </Link>
          <Link to="/" className="min-w-0 shrink-0">
            <Logo compact className="sm:hidden" />
            <Logo className="hidden sm:flex" />
          </Link>
          <span className="hidden min-w-0 items-center gap-2 text-sm text-fg-faint md:flex">
            <span aria-hidden>/</span>
            <span className="truncate font-medium text-fg-muted">Admin</span>
          </span>
          <div className="ml-auto">
            <AccountMenu />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <h1 className="font-display text-3xl font-semibold text-fg">Admin</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Internal only. Signed in as {user?.email ?? "—"}. Sample rows for now — this view
          reads live task data once it's wired to the queue.
        </p>

        <section className="mt-8">
          <h2 className="font-display text-xl font-semibold text-fg">All requests</h2>
          <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-surface">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
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
                  {orders.map((order) => {
                    const service = getService(order.serviceId);
                    return (
                      <tr key={order.id} className="border-b border-border last:border-0">
                        <td className="px-5 py-3.5 font-mono text-xs text-fg-faint">{order.publicId}</td>
                        <td className="px-5 py-3.5 font-medium text-fg">{service.label}</td>
                        <td className="px-5 py-3.5 text-fg-muted">{order.summary}</td>
                        <td className="px-5 py-3.5 text-fg-faint">{order.requestedAt}</td>
                        <td className="px-5 py-3.5">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles[order.status]}`}>
                            {order.status.replace("_", " ")}
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

        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold text-fg">All deliverables</h2>
          <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-surface">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs font-semibold tracking-wide text-fg-faint uppercase">
                    <th className="px-5 py-3">Task ID</th>
                    <th className="px-5 py-3">Service</th>
                    <th className="px-5 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orders
                    .filter((o) => o.status === "delivered")
                    .map((order) => {
                      const service = getService(order.serviceId);
                      return (
                        <tr key={order.id} className="border-b border-border last:border-0">
                          <td className="px-5 py-3.5 font-mono text-xs text-fg-faint">{order.publicId}</td>
                          <td className="px-5 py-3.5 font-medium text-fg">{service.label}</td>
                          <td className="px-5 py-3.5">
                            <span className="rounded-full bg-yellow-400/10 px-2.5 py-1 text-xs font-semibold text-yellow-400">
                              Delivered
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

        <section className="mt-10 mb-16">
          <h2 className="font-display text-xl font-semibold text-fg">All billing</h2>
          <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-surface">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs font-semibold tracking-wide text-fg-faint uppercase">
                    <th className="px-5 py-3">User</th>
                    <th className="px-5 py-3">Amount</th>
                    <th className="px-5 py-3">Type</th>
                    <th className="px-5 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {dummyBilling.map((row) => (
                    <tr key={row.user + row.type} className="border-b border-border last:border-0">
                      <td className="px-5 py-3.5 text-fg">{row.user}</td>
                      <td className="px-5 py-3.5 font-semibold text-fg">{row.amount}</td>
                      <td className="px-5 py-3.5 text-fg-muted">{row.type}</td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            row.status === "Paid" ? "bg-yellow-400/10 text-yellow-400" : "bg-fg-faint/10 text-fg-faint"
                          }`}
                        >
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
