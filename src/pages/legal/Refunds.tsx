import { LegalLayout, List, Section } from "./LegalLayout";

export function Refunds() {
  return (
    <LegalLayout
      title="Refund Policy"
      intro="When you get your money back, when you get a revision instead, and how to ask."
    >
      <Section heading="Unused wallet balance">
        <p>
          Money sitting in your wallet that you haven't spent is yours. Ask and we'll return it to
          the method you paid with. No time limit and no reason needed.
        </p>
      </Section>

      <Section heading="Orders that failed">
        <p>
          If an order can't be produced — a provider outage, a fault on our side, anything that
          means you don't get the thing you bought — the charge goes back to your wallet
          automatically. You don't need to ask. If you see a failed order that wasn't refunded,
          tell us and we'll fix it.
        </p>
      </Section>

      <Section heading="Orders that were delivered">
        <p>
          Delivered work is generated for you on demand, so it can't be returned the way a physical
          product can. That's why revisions exist: if a deliverable misses the brief, use an
          included revision and it gets rebuilt.
        </p>
        <p>We will refund a delivered order anyway when:</p>
        <List
          items={[
            "it isn't what the product page said it would be",
            "it's unusable — corrupted, empty, or in the wrong format",
            "it ignores the brief entirely, rather than interpreting it differently from how you hoped",
            "a revision was used and the result still has the same problem",
          ]}
        />
        <p>
          We won't refund an order simply because you changed your mind after seeing it, or because
          you'd prefer a different style that the brief didn't ask for. For products that return
          several options, picking the option you like least is not grounds for a refund — the
          others are there for that reason.
        </p>
      </Section>

      <Section heading="Products with no revisions">
        <p>
          Images and video come back as options to choose from rather than with revisions, because
          they're regenerated rather than edited. They're also the most expensive things we
          produce. If one comes back genuinely broken, that's a refund under the rules above — but
          a regenerated version that you like less is not.
        </p>
      </Section>

      <Section heading="How to ask">
        <p>
          Email{" "}
          <a className="text-yellow-400 hover:underline" href="mailto:hello@agenticcore.click">
            hello@agenticcore.click
          </a>{" "}
          with the order reference — it looks like AC-1007-03 and is on the order in your
          dashboard. Tell us what's wrong. We aim to answer within two working days.
        </p>
        <p>
          Refunds go back to your wallet by default, which is instant. Ask if you'd rather have it
          returned to your original payment method; that takes longer and depends on the provider.
        </p>
      </Section>

      <Section heading="Chargebacks">
        <p>
          Please talk to us before raising a dispute with your bank or card issuer. A chargeback
          costs us a fee and freezes the account while it's investigated, and almost everything
          people dispute is something we'd have refunded on request.
        </p>
      </Section>
    </LegalLayout>
  );
}
