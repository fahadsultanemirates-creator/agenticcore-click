import { Check, Loader2, Sparkles, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { flagshipPackage, walletPackages } from "../../data/packages";
import { supabase } from "../../lib/supabase";

type CheckStatus = { status: "pending" | "confirmed" | "cancelled" } | { error: string };

const POLL_INTERVAL_MS = 4000;
const POLL_MAX_ATTEMPTS = 45; // ~3 minutes

export function BillingSection() {
  const [selectedWallet, setSelectedWallet] = useState("wallet-10");
  const [payramLoading, setPayramLoading] = useState(false);
  const [payramError, setPayramError] = useState("");
  const [pollingInvoiceId, setPollingInvoiceId] = useState<string | null>(null);
  const [confirmedMessage, setConfirmedMessage] = useState("");
  const [walletBalance, setWalletBalance] = useState<number | null>(null);

  const refreshBalance = async () => {
    const { data } = await supabase.from("wallets").select("balance_usd").maybeSingle();
    if (data) setWalletBalance(Number(data.balance_usd));
  };

  const getAccessToken = async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  };

  // Checks PayRam directly for this invoice's status, using .click's own
  // API key -- no dependency on .agency's webhook relay, which proved too
  // fragile (a separate project, separate account, its own deploy step
  // that's easy to forget) for something this time-sensitive.
  const checkInvoiceOnce = async (invoiceId: string, accessToken: string): Promise<CheckStatus> => {
    const { data, error } = await supabase.functions.invoke<{ status?: string; error?: string }>(
      "payram-check-status",
      { body: { invoiceId }, headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (error || !data) return { error: "Could not check payment status." };
    if (data.error) return { error: data.error };
    if (data.status === "confirmed" || data.status === "cancelled" || data.status === "pending") {
      return { status: data.status };
    }
    return { error: "Unexpected response from status check." };
  };

  const pollInvoice = async (invoiceId: string, amountUsd?: number) => {
    setPollingInvoiceId(invoiceId);
    const accessToken = await getAccessToken();
    if (!accessToken) {
      setPollingInvoiceId(null);
      return;
    }

    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
      const result = await checkInvoiceOnce(invoiceId, accessToken);
      if ("status" in result) {
        if (result.status === "confirmed") {
          setPollingInvoiceId(null);
          setConfirmedMessage(amountUsd ? `$${amountUsd} added to your wallet.` : "Wallet top-up confirmed.");
          await refreshBalance();
          return;
        }
        if (result.status === "cancelled") {
          setPollingInvoiceId(null);
          setPayramError("That payment was cancelled or expired.");
          return;
        }
        // still pending -- keep polling
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    setPollingInvoiceId(null);
    setPayramError("Still waiting on that payment — check back shortly, or contact support if it doesn't confirm.");
  };

  // Picks up any top-up left pending from an earlier visit (including one
  // completed in a previous session that never got confirmed here) without
  // requiring a fresh payment to trigger a check.
  useEffect(() => {
    refreshBalance();

    (async () => {
      const { data: pendingTopups } = await supabase
        .from("wallet_topups")
        .select("invoice_id, amount_usd")
        .eq("status", "pending")
        .not("reference_id", "is", null);

      if (!pendingTopups || pendingTopups.length === 0) return;

      const accessToken = await getAccessToken();
      if (!accessToken) return;

      for (const topup of pendingTopups) {
        const result = await checkInvoiceOnce(topup.invoice_id, accessToken);
        if ("status" in result && result.status === "confirmed") {
          setConfirmedMessage(`$${topup.amount_usd} added to your wallet.`);
          await refreshBalance();
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePayramContinue = async () => {
    setPayramError("");
    setConfirmedMessage("");
    setPayramLoading(true);

    // Opened synchronously (before any await) so browsers still treat this
    // as a direct user-gesture window.open and don't block it as a popup --
    // its location gets set once the real PayRam URL comes back.
    const paymentWindow = window.open("", "_blank");

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        paymentWindow?.close();
        setPayramError("Your session expired — please log in again.");
        return;
      }

      const { data, error } = await supabase.functions.invoke<{ url: string; invoiceId: string; amountUsd: number }>(
        "payram-create-payment",
        { body: { tier: selectedWallet }, headers: { Authorization: `Bearer ${accessToken}` } },
      );

      if (error || !data?.url) {
        console.error("payram-create-payment failed:", error);
        paymentWindow?.close();
        setPayramError("Could not start the payment. Please try again.");
        return;
      }

      if (paymentWindow) {
        paymentWindow.location.href = data.url;
      } else {
        // Popup was blocked anyway -- fall back to navigating this tab.
        window.location.href = data.url;
      }

      pollInvoice(data.invoiceId, data.amountUsd);
    } catch (err) {
      console.error("payram-create-payment threw:", err);
      paymentWindow?.close();
      setPayramError("Could not reach the payment provider. Please try again.");
    } finally {
      setPayramLoading(false);
    }
  };

  return (
    <section className="border-t border-border py-10">
      <div>
        <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <h2 className="font-display text-2xl font-semibold text-fg">Billing</h2>
            <p className="mt-1 text-sm text-fg-muted">
              No credit system — every service keeps its own real price. Wallet tiers just add a
              discount on top.
            </p>
          </div>
          {walletBalance !== null && (
            <div className="rounded-xl border border-border bg-surface px-4 py-2.5 text-right">
              <p className="text-xs font-semibold tracking-wide text-fg-faint uppercase">Wallet balance</p>
              <p className="font-display text-xl font-semibold text-yellow-400">${walletBalance.toFixed(2)}</p>
            </div>
          )}
        </div>

        {confirmedMessage && (
          <div className="mb-6 flex items-center gap-2 rounded-xl border border-yellow-400/40 bg-yellow-400/10 px-4 py-3 text-sm font-semibold text-yellow-400">
            <Check className="h-4 w-4 shrink-0" /> {confirmedMessage}
          </div>
        )}

        <div className="mb-8 overflow-hidden rounded-2xl border-2 border-yellow-400 bg-gradient-to-br from-yellow-400/10 to-transparent p-6">
          <span className="mb-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-yellow-400 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-void uppercase">
            <Sparkles className="h-3 w-3" /> Most popular
          </span>
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="font-display text-2xl font-semibold text-fg">{flagshipPackage.name}</p>
              <p className="mt-1 text-sm text-fg-muted">{flagshipPackage.tagline}</p>
            </div>
            <p className="font-display text-4xl font-semibold text-fg">{flagshipPackage.price}</p>
          </div>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {flagshipPackage.contents.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm text-fg-muted">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-yellow-400" />
                {item}
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="mt-5 rounded-full bg-yellow-400 px-6 py-3 text-sm font-semibold text-void shadow-glow-yellow transition-transform hover:-translate-y-0.5"
          >
            Get the Full Business Setup
          </button>
        </div>

        <p className="mb-3 text-sm font-semibold text-fg">Wallet top-up tiers</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {walletPackages.map((pkg) => {
            const active = pkg.id === selectedWallet;
            return (
              <div
                key={pkg.id}
                className={`flex flex-col rounded-2xl border p-5 transition-colors ${
                  active ? "border-yellow-400 bg-surface" : "border-border bg-surface"
                }`}
              >
                <p className="font-display text-3xl font-semibold text-fg">{pkg.price}</p>
                <p className="mt-1 text-sm text-fg-muted">to your wallet</p>
                <ul className="mt-4 flex flex-col gap-2">
                  <li className="flex items-start gap-2 text-sm text-fg-muted">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-yellow-400" />
                    {pkg.firstTimeDiscount}% off, first order
                  </li>
                  <li className="flex items-start gap-2 text-sm text-fg-muted">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-yellow-400" />
                    {pkg.routineDiscount}% off, every order after
                  </li>
                </ul>
                {pkg.note && <p className="mt-3 text-xs text-fg-faint">{pkg.note}</p>}
                <button
                  type="button"
                  onClick={() => setSelectedWallet(pkg.id)}
                  className={`mt-5 rounded-full px-4 py-2.5 text-sm font-semibold transition-transform hover:-translate-y-0.5 ${
                    active ? "bg-yellow-400 text-void" : "border-2 border-border text-fg-muted hover:border-yellow-400/50"
                  }`}
                >
                  {active ? "Selected" : "Add to wallet"}
                </button>
              </div>
            );
          })}
        </div>

        <div className="mt-8 rounded-2xl border border-border bg-surface p-6">
          <p className="font-display text-lg font-semibold text-fg">Payment</p>
          <p className="mt-1 text-sm text-fg-muted">
            Card and USDT are coming. For now top-ups go through PayRam, which takes card and
            crypto both.
          </p>

          <div className="mt-5 rounded-xl border border-dashed border-yellow-400/30 bg-void p-5">
            <p className="text-sm text-fg-muted">
              A new tab will open to add{" "}
              <span className="font-semibold text-fg">
                {walletPackages.find((p) => p.id === selectedWallet)?.price}
              </span>{" "}
              to your wallet — this page will confirm it automatically once it lands.
            </p>
            {payramError && <p className="mt-2 text-sm text-yellow-400">{payramError}</p>}
            {pollingInvoiceId && (
              <p className="mt-2 flex items-center gap-1.5 text-sm text-fg-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Waiting for payment confirmation...
              </p>
            )}
            <button
              type="button"
              onClick={handlePayramContinue}
              disabled={payramLoading || !!pollingInvoiceId}
              className="mt-3 flex items-center gap-2 rounded-full bg-yellow-400 px-4 py-2 text-sm font-semibold text-void transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {payramLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
              {payramLoading ? "Starting payment..." : "Continue to PayRam"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
