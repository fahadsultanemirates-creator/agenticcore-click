import { walletPackages } from "../data/packages";

/**
 * The two wallet discounts, as a table.
 *
 * They were one run-on sentence -- "your first order takes 15% on $10, 30%
 * on $30, 50% on $100, 65% on $200 off" -- which does not make clear
 * whether the percentage follows the amount you TOPPED UP or the size of
 * the ORDER. It is the top-up: applyDiscount() in
 * supabase/functions/_shared/discount.ts looks up the package that last
 * funded the wallet and takes its percentage off the order's list price.
 *
 * Two columns because there are genuinely two offers, and prose kept
 * making them look like one that stacks. They never stack -- the same
 * function picks one or the other, never both.
 *
 * Numbers come from walletPackages, which discount.test.ts cross-checks
 * against the server's own table. The cards and the charge cannot drift.
 */
export function DiscountTable({ className = "" }: { className?: string }) {
  return (
    <div className={className}>
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">
          Wallet top-up discounts: the percentage is set by how much you top up.
        </caption>
        <thead>
          <tr className="border-b border-border text-xs tracking-wide text-fg-faint uppercase">
            <th scope="col" className="py-2 pr-3 font-medium">
              You top up
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Your first order
            </th>
            <th scope="col" className="py-2 font-medium">
              Every order after
            </th>
          </tr>
        </thead>
        <tbody>
          {walletPackages.map((pkg) => (
            <tr key={pkg.id} className="border-b border-border/60 last:border-0">
              <th scope="row" className="py-2.5 pr-3 font-semibold text-fg">
                {pkg.price}
              </th>
              <td className="py-2.5 pr-3 text-yellow-400">{pkg.firstTimeDiscount}% off</td>
              <td className="py-2.5 text-fg-muted">
                {pkg.routineDiscount > 0 ? `${pkg.routineDiscount}% off` : "no standing discount"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-fg-faint">
        The percentage is set by the top-up that last funded your wallet, not by the size of the
        order. The two columns are separate offers and never combine: your first order uses the
        first-order rate, every order after it uses the standing rate. Both apply to every service,
        including the {" "}
        <span className="text-fg-muted">$20 Full Business Setup</span>.
      </p>
    </div>
  );
}
