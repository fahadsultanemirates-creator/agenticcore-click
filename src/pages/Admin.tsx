import { LogOut } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
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
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-void">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-6">
        <Link to="/" className="shrink-0">
          <Logo compact className="sm:hidden" />
          <Logo className="hidden sm:flex" />
        </Link>
        <div className="flex shrink-0 items-center gap-3 sm:gap-4">
          <Link to="/dashboard" className="text-sm font-semibold whitespace-nowrap text-fg-muted hover:text-fg">
            Dashboard
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap text-fg-muted hover:text-fg"
          >
            <LogOut className="h-3.5 w-3.5" /> Log out
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-10 sm:px-10">
        <h1 className="font-display text-3xl font-semibold text-fg">Admin</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Internal only. Signed in as {user?.email ?? "—"}. Dummy data for this preview — the real
          version is fed by the Telegram manager bot as tasks move.
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
