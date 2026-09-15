import { Check, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { flagshipPackage, walletPackages } from "../../data/packages";
import { Reveal } from "../Reveal";

export function PackagesSection() {
  return (
    <section id="packages" className="mx-auto max-w-6xl px-6 py-20 md:py-28">
      <div className="mx-auto mb-14 max-w-2xl text-center">
        <h2 className="font-display text-4xl font-semibold tracking-tight text-fg sm:text-5xl">
          Pick your setup
        </h2>
        <p className="mt-4 text-lg text-fg-muted">
          No credit system — every service keeps a real price. Wallet tiers add a discount on top.
        </p>
      </div>

      <Reveal>
        <div className="relative overflow-hidden rounded-3xl border-2 border-yellow-400 bg-surface p-8 sm:p-10">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-16 -right-16 h-64 w-64 rounded-full bg-yellow-400/10 blur-3xl"
          />
          <span className="relative mb-4 inline-flex items-center gap-1.5 rounded-full bg-yellow-400 px-3 py-1 text-xs font-semibold tracking-wide text-void uppercase">
            <Sparkles className="h-3.5 w-3.5" /> Our flagship
          </span>
          <div className="relative flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
            <div>
              <h3 className="font-display text-3xl font-semibold text-fg sm:text-4xl">
                {flagshipPackage.name}
              </h3>
              <p className="mt-2 max-w-md text-fg-muted">{flagshipPackage.tagline}</p>
            </div>
            <p className="font-display text-5xl font-semibold text-yellow-400">{flagshipPackage.price}</p>
          </div>
          <ul className="relative mt-6 grid gap-2.5 sm:grid-cols-2">
            {flagshipPackage.contents.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm text-fg-muted">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-yellow-400" />
                {item}
              </li>
            ))}
          </ul>
          <Link
            to="/dashboard"
            className="relative mt-7 inline-flex w-fit items-center gap-2 rounded-full bg-yellow-400 px-7 py-3.5 text-base font-semibold text-void shadow-glow-yellow transition-transform hover:-translate-y-0.5"
          >
            Get the Full Business Setup
          </Link>
        </div>
      </Reveal>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {walletPackages.map((pkg, i) => (
          <Reveal key={pkg.id} delay={i * 80}>
            <div className="flex h-full flex-col rounded-2xl border border-border bg-surface p-5">
              <p className="font-display text-2xl font-semibold text-fg">{pkg.price}</p>
              <p className="mt-1 text-sm text-fg-muted">to your wallet</p>
              <ul className="mt-3 flex flex-col gap-1.5">
                <li className="text-sm text-fg-muted">
                  <span className="font-semibold text-yellow-400">{pkg.firstTimeDiscount}% off</span> first order
                </li>
                <li className="text-sm text-fg-muted">
                  <span className="font-semibold text-yellow-400">{pkg.routineDiscount}% off</span> every order after
                </li>
              </ul>
              {pkg.note && <p className="mt-3 text-xs text-fg-faint">{pkg.note}</p>}
            </div>
          </Reveal>
        ))}
      </div>

      <p className="mt-6 text-center text-sm text-fg-faint">
        All prices and discounts shown are placeholders while we finish building.
      </p>
    </section>
  );
}
