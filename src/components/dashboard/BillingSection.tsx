import { Check, Copy, CreditCard, Loader2, QrCode, Sparkles, Wallet } from "lucide-react";
import { useState } from "react";
import { flagshipPackage, walletPackages } from "../../data/packages";
import { supabase } from "../../lib/supabase";
import { UsdtIcon } from "../icons/UsdtIcon";

type Method = "card" | "usdt" | "payram";

const DUMMY_ADDRESS = "TQrY8...mock...9fZk (TRC20)";

export function BillingSection() {
  const [selectedWallet, setSelectedWallet] = useState("wallet-10");
  const [method, setMethod] = useState<Method>("card");
  const [copied, setCopied] = useState(false);
  const [payramLoading, setPayramLoading] = useState(false);
  const [payramError, setPayramError] = useState("");

  const handlePayramContinue = async () => {
    setPayramError("");
    setPayramLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke<{ url: string }>("payram-create-payment", {
        body: { tier: selectedWallet },
      });
      if (error || !data?.url) {
        setPayramError("Could not start the payment. Please try again.");
        return;
      }
      window.location.href = data.url;
    } catch {
      setPayramError("Could not reach the payment provider. Please try again.");
    } finally {
      setPayramLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(DUMMY_ADDRESS);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard not available — non-critical in this mockup
    }
  };

  return (
    <section className="border-t border-border px-6 py-10 sm:px-10 lg:px-16">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6">
          <h2 className="font-display text-2xl font-semibold text-fg">Billing</h2>
          <p className="mt-1 text-sm text-fg-muted">
            No credit system — every service keeps its own real price. Wallet tiers just add a
            discount on top. Placeholder numbers until launch.
          </p>
        </div>

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
          <p className="font-display text-lg font-semibold text-fg">Payment method</p>
          <p className="mt-1 text-sm text-fg-muted">
            PayRam is live. Card and USDT are still preview-only for now.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setMethod("card")}
              className={`flex items-center gap-2 rounded-full border-2 px-4 py-2 text-sm font-semibold transition-colors ${
                method === "card" ? "border-yellow-400 text-fg" : "border-border text-fg-muted hover:border-yellow-400/40"
              }`}
            >
              <CreditCard className="h-4 w-4" /> Card
            </button>
            <button
              type="button"
              onClick={() => setMethod("usdt")}
              className={`flex items-center gap-2 rounded-full border-2 px-4 py-2 text-sm font-semibold transition-colors ${
                method === "usdt" ? "border-yellow-400 text-fg" : "border-border text-fg-muted hover:border-yellow-400/40"
              }`}
            >
              <UsdtIcon className="h-4 w-4" /> USDT
            </button>
            <button
              type="button"
              onClick={() => setMethod("payram")}
              className={`flex items-center gap-2 rounded-full border-2 px-4 py-2 text-sm font-semibold transition-colors ${
                method === "payram" ? "border-yellow-400 text-fg" : "border-border text-fg-muted hover:border-yellow-400/40"
              }`}
            >
              <Wallet className="h-4 w-4" /> PayRam
            </button>
          </div>

          {method === "card" && (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <input
                disabled
                placeholder="Card number"
                className="rounded-xl border-2 border-border bg-void px-3.5 py-2.5 text-sm text-fg-faint placeholder:text-fg-faint"
              />
              <input
                disabled
                placeholder="MM/YY · CVC"
                className="rounded-xl border-2 border-border bg-void px-3.5 py-2.5 text-sm text-fg-faint placeholder:text-fg-faint"
              />
            </div>
          )}

          {method === "usdt" && (
            <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-yellow-400/30 bg-void">
                <QrCode className="h-10 w-10 text-fg-faint" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold tracking-wide text-fg-muted uppercase">
                  Send USDT (TRC20) to
                </p>
                <div className="mt-1.5 flex items-center gap-2">
                  <code className="truncate rounded-lg bg-void px-3 py-2 text-sm text-fg">{DUMMY_ADDRESS}</code>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-2 border-border text-fg-muted transition-colors hover:border-yellow-400/50 hover:text-fg"
                    aria-label="Copy address"
                  >
                    {copied ? <Check className="h-4 w-4 text-yellow-400" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
                <button
                  type="button"
                  className="mt-3 rounded-full bg-yellow-400 px-4 py-2 text-sm font-semibold text-void transition-transform hover:-translate-y-0.5"
                >
                  I've sent payment
                </button>
              </div>
            </div>
          )}

          {method === "payram" && (
            <div className="mt-5 rounded-xl border border-dashed border-yellow-400/30 bg-void p-5">
              <p className="text-sm text-fg-muted">
                You'll be redirected to PayRam to add{" "}
                <span className="font-semibold text-fg">
                  {walletPackages.find((p) => p.id === selectedWallet)?.price}
                </span>{" "}
                to your wallet.
              </p>
              {payramError && <p className="mt-2 text-sm text-yellow-400">{payramError}</p>}
              <button
                type="button"
                onClick={handlePayramContinue}
                disabled={payramLoading}
                className="mt-3 flex items-center gap-2 rounded-full bg-yellow-400 px-4 py-2 text-sm font-semibold text-void transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {payramLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                {payramLoading ? "Starting payment..." : "Continue to PayRam"}
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
