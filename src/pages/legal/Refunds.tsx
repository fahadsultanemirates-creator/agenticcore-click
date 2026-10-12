import { LegalLayout, List, Section } from "./LegalLayout";

export function Refunds() {
  return (
    <LegalLayout
      title="Refund Policy"
      intro="When you get your money back, when you get a revision instead, and how to ask."
    >
      <Section heading="Unused wallet balance">
        {/* OWNER TO CONFIRM -- see the PR. This page described refunds
            going back to "the method you paid with" and a Chargebacks
            section about disputing with "your bank or card issuer". There
            is no bank and no card: top-ups are USDT on BNB Smart Chain.
            The wording below is what the payment method actually permits,
            but the operational detail (which address we send to) is the
            owner's call, not an assumption to ship. */}
        <p>
          Money sitting in your wallet that you haven't spent is yours. Ask and we'll send it back
          as USDT on BNB Smart Chain (BEP-20), to a BEP-20 address you confirm with us. No time
          limit and no reason needed.
        </p>
        <p className="text-sm text-fg-faint">
          We'll ask you to confirm the destination address before sending. A blockchain transfer
          cannot be undone once it leaves, so we would rather ask twice than send to the wrong
          place. Network fees for the return transfer come out of the amount sent.
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
          Refunds go back to your wallet balance by default, which is instant and has no network
          fee. Ask if you'd rather have it sent out as USDT instead; that is an on-chain transfer
          to a BEP-20 address you confirm with us, and the network fee comes out of the amount.
        </p>
      </Section>

      <Section heading="If you think something has gone wrong">
        <p>
          Talk to us first, and talk to us early. A USDT payment on BNB Smart Chain is final once
          it is confirmed — there is no bank, card issuer or payment provider who can reverse it,
          so we are the only route to getting money back. Almost everything anyone would want to
          dispute is something we would have refunded on request.
        </p>
      </Section>
    </LegalLayout>
  );
}
