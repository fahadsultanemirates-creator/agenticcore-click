import { Check, Copy, CreditCard, QrCode, Wallet } from "lucide-react";
import { useState } from "react";
import { plans } from "../../data/plans";
import { UsdtIcon } from "../icons/UsdtIcon";

type Method = "card" | "usdt" | "payram";

const DUMMY_ADDRESS = "TQrY8...mock...9fZk (TRC20)";

export function BillingSection() {
  const [selectedPlan, setSelectedPlan] = useState("starter");
  const [method, setMethod] = useState<Method>("card");
  const [copied, setCopied] = useState(false);

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
            Placeholder plans and payment options — nothing here charges anything yet.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan) => {
            const active = plan.id === selectedPlan;
            return (
              <div
                key={plan.id}
                className={`flex flex-col rounded-2xl border p-5 transition-colors ${
                  active ? "border-yellow-400 bg-surface" : "border-border bg-surface"
                }`}
              >
                {plan.highlighted && (
                  <span className="mb-3 w-fit rounded-full bg-yellow-400/10 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-yellow-400 uppercase">
                    Most popular
                  </span>
                )}
                <p className="font-display text-lg font-semibold text-fg">{plan.name}</p>
                <p className="mt-1 flex items-baseline gap-1">
                  <span className="font-display text-3xl font-semibold text-fg">{plan.price}</span>
                  <span className="text-sm text-fg-faint">{plan.cadence}</span>
                </p>
                <p className="mt-2 text-sm text-fg-muted">{plan.blurb}</p>
                <ul className="mt-4 flex flex-col gap-2">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-fg-muted">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-yellow-400" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => setSelectedPlan(plan.id)}
                  className={`mt-5 rounded-full px-4 py-2.5 text-sm font-semibold transition-transform hover:-translate-y-0.5 ${
                    active ? "bg-yellow-400 text-void" : "border-2 border-border text-fg-muted hover:border-yellow-400/50"
                  }`}
                >
                  {active ? "Current selection" : "Choose plan"}
                </button>
              </div>
            );
          })}
        </div>

        <div className="mt-8 rounded-2xl border border-border bg-surface p-6">
          <p className="font-display text-lg font-semibold text-fg">Payment method</p>
          <p className="mt-1 text-sm text-fg-muted">
            UI preview only — no payment provider is connected yet.
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
                You'll be redirected to PayRam to complete this payment securely.
              </p>
              <button
                type="button"
                className="mt-3 flex items-center gap-2 rounded-full bg-yellow-400 px-4 py-2 text-sm font-semibold text-void transition-transform hover:-translate-y-0.5"
              >
                <Wallet className="h-4 w-4" /> Continue to PayRam
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
