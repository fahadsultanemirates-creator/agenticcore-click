import { AlertTriangle, Check, Copy, Loader2, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { flagshipPackage, walletPackages } from "../../data/packages";
import { supabase } from "../../lib/supabase";

// Topping up in USDT on BNB Smart Chain.
//
// PayRam is gone: three test payments never arrived, and it charged about
// $15 of gas on each incoming transfer against a flagship package of $20.
//
// The scheme here is one receiving address and a per-invoice amount -- the
// last four decimal places carry a nonce, so 20.000007 identifies one
// invoice and nothing else. That makes the EXACT AMOUNT the thing that
// matters, more than the address, which is why it is the biggest thing on
// the panel and has its own copy button.

type Invoice = {
  invoiceId: string;
  amount: string;
  address: string;
  network: string;
  creditUsd: number;
  expiresAt: string;
};

type CheckResult = { status?: string; confirmations?: number; received?: string; error?: string };

const POLL_INTERVAL_MS = 5000;

export function BillingSection() {
  const [selectedWallet, setSelectedWallet] = useState("wallet-10");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [confirmations, setConfirmations] = useState<number | null>(null);
  const [wrongAmount, setWrongAmount] = useState("");
  const [confirmedMessage, setConfirmedMessage] = useState("");
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [copied, setCopied] = useState<"amount" | "address" | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const refreshBalance = useCallback(async () => {
    const { data } = await supabase.from("wallets").select("balance_usd").maybeSingle();
    if (data) setWalletBalance(Number(data.balance_usd));
  }, []);

  const getAccessToken = async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  };

  const copy = async (text: string, which: "amount" | "address") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      // Some app views refuse the clipboard. Both values are selectable
      // text on the page, so there is still a way to copy them by hand.
    }
  };

  // Polls this invoice until it settles. The cron sweep credits it anyway
  // if the tab is closed -- this exists so somebody watching the screen
  // sees it happen rather than having to reload.
  // Polls this invoice until it settles. The cron sweep credits it anyway
  // if the tab is closed -- this exists so somebody watching the screen
  // sees it happen rather than having to reload.
  //
  // The recursion is a hoisted function declaration rather than the
  // useCallback referring to itself: a const cannot be read while it is
  // still being initialised, and relying on it only working because the
  // timeout fires later is the kind of thing that holds until somebody
  // calls it one tick earlier.
  const poll = useCallback(
    (invoiceId: string, creditUsd: number) => {
      async function tick(): Promise<void> {
        const accessToken = await getAccessToken();
        if (!accessToken) return;

        const { data } = await supabase.functions.invoke<CheckResult>("usdt-check", {
          body: { invoiceId },
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (data?.status === "paid") {
          setInvoice(null);
          setConfirmations(null);
          setConfirmedMessage(`$${creditUsd} added to your wallet.`);
          await refreshBalance();
          return;
        }
        if (data?.status === "wrong_amount") {
          setWrongAmount(data.received ?? "");
        }
        if (data?.status === "confirming" && typeof data.confirmations === "number") {
          setConfirmations(data.confirmations);
        }
        if (data?.status === "expired" || data?.status === "cancelled") {
          setInvoice(null);
          setError("That invoice expired. Start a new one and the amount will change.");
          return;
        }

        pollRef.current = setTimeout(() => void tick(), POLL_INTERVAL_MS);
      }

      pollRef.current = setTimeout(() => void tick(), POLL_INTERVAL_MS);
    },
    [refreshBalance],
  );

  useEffect(() => {
    void refreshBalance();
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [refreshBalance]);

  const startTopUp = async () => {
    setError("");
    setWrongAmount("");
    setConfirmedMessage("");
    setConfirmations(null);
    setCreating(true);

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        setError("Your session expired — please log in again.");
        return;
      }

      const { data, error: invokeError } = await supabase.functions.invoke<Invoice & { error?: string }>(
        "usdt-invoice",
        { body: { tier: selectedWallet }, headers: { Authorization: `Bearer ${accessToken}` } },
      );

      if (invokeError || !data?.amount) {
        setError(data?.error || "Could not start the payment. Please try again.");
        return;
      }

      setInvoice(data);
      if (pollRef.current) clearTimeout(pollRef.current);
      poll(data.invoiceId, data.creditUsd);
    } catch (err) {
      console.error("usdt-invoice threw:", err);
      setError("Could not reach the payment service. Please try again.");
    } finally {
      setCreating(false);
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
          <p className="font-display text-lg font-semibold text-fg">Pay with USDT</p>
          <p className="mt-1 text-sm text-fg-muted">
            BNB Smart Chain (BEP-20). Confirmation usually takes under a minute.
          </p>

          {!invoice ? (
            <>
              <p className="mt-4 text-sm text-fg-muted">
                You'll get an address and an exact amount to send for{" "}
                <span className="font-semibold text-fg">
                  {walletPackages.find((p) => p.id === selectedWallet)?.price}
                </span>
                .
              </p>
              {error && <p className="mt-2 text-sm text-yellow-400">{error}</p>}
              <button
                type="button"
                onClick={startTopUp}
                disabled={creating}
                className="mt-4 flex items-center gap-2 rounded-full bg-yellow-400 px-5 py-2.5 text-sm font-semibold text-void transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                {creating ? "Opening..." : "Get payment details"}
              </button>
            </>
          ) : (
            <div className="mt-5 flex flex-col gap-4">
              {/* The amount is the biggest thing here on purpose. The
                  address is shared by every invoice; the amount is the
                  only thing that says which one this is, so sending a
                  rounded figure means the payment cannot be matched. */}
              <div className="rounded-xl border-2 border-yellow-400 bg-yellow-400/5 p-4">
                <p className="text-xs font-semibold tracking-wide text-fg-muted uppercase">
                  Send exactly this amount
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-3">
                  <p className="font-display text-3xl font-semibold text-fg tabular-nums">
                    {invoice.amount}
                  </p>
                  <span className="text-sm font-semibold text-fg-muted">USDT</span>
                  <button
                    type="button"
                    onClick={() => copy(invoice.amount, "amount")}
                    className="ml-auto flex items-center gap-1.5 rounded-full border-2 border-border px-3 py-1.5 text-xs font-semibold text-fg-muted transition-colors hover:border-yellow-400/50 hover:text-fg"
                  >
                    {copied === "amount" ? <Check className="h-3.5 w-3.5 text-yellow-400" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied === "amount" ? "Copied" : "Copy"}
                  </button>
                </div>
                <p className="mt-2 text-xs text-fg-faint">
                  The last digits identify your payment. Rounding the amount means we can't match
                  it to your account.
                </p>
              </div>

              <div>
                <p className="text-xs font-semibold tracking-wide text-fg-muted uppercase">
                  To this address — {invoice.network}
                </p>
                <div className="mt-1.5 flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-lg bg-void px-3 py-2 font-mono text-sm text-fg">
                    {invoice.address}
                  </code>
                  <button
                    type="button"
                    onClick={() => copy(invoice.address, "address")}
                    aria-label="Copy address"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-2 border-border text-fg-muted transition-colors hover:border-yellow-400/50 hover:text-fg"
                  >
                    {copied === "address" ? <Check className="h-4 w-4 text-yellow-400" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-start gap-2 rounded-xl border border-orange-400/30 bg-orange-400/5 px-3 py-2.5 text-xs text-fg-muted">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-400" />
                <span>
                  Only send USDT on BNB Smart Chain to this address. Another coin, or USDT on
                  another network, cannot be recovered.
                </span>
              </div>

              {wrongAmount && (
                <p className="text-sm text-yellow-400">
                  {wrongAmount} USDT arrived, but this invoice is for {invoice.amount}. It hasn't
                  been credited automatically — we've been notified and will sort it out.
                </p>
              )}

              <p className="flex items-center gap-1.5 text-sm text-fg-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {confirmations === null
                  ? "Waiting for your payment..."
                  : `Payment seen — ${confirmations} confirmations, crediting shortly...`}
              </p>
              <p className="text-xs text-fg-faint">
                You can close this page. It still credits once the payment confirms.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
