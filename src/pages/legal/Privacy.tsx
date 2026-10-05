import { LegalLayout, List, Section } from "./LegalLayout";

export function Privacy() {
  return (
    <LegalLayout
      title="Privacy Policy"
      intro="What we collect, why, who else sees it, and how to get it removed."
    >
      <Section heading="What we collect">
        <List
          items={[
            "Account details — your email address, and a name if you give one.",
            "Order content — the brief you write, and any files you upload: logos, photos, reference documents, audio.",
            "Deliverables — the work produced for you, stored so your dashboard can serve it.",
            "Payment records — the amount, time and status of wallet top-ups, and the public blockchain transaction that paid each one. Top-ups are made in USDT on BNB Smart Chain, which means we never see a card number or hold any payment credential.",
            "Basic technical data — the requests your browser makes, kept in server logs for security and debugging.",
          ]}
        />
        <p>
          We don't run advertising trackers, and we don't sell or rent personal data to anyone.
        </p>
      </Section>

      <Section heading="Why we hold it">
        <p>
          To produce what you ordered, to show it back to you, to charge the right amount, to
          answer you when something goes wrong, and to keep the service secure. That's the whole
          list.
        </p>
      </Section>

      <Section heading="Who else sees it">
        <p>
          Producing an order means sending parts of it to the providers that do the work. Each
          receives only what its part needs:
        </p>
        <List
          items={[
            "Supabase — database, authentication and file storage. Holds your account, orders and files.",
            "Netlify — serves the website itself.",
            "Anthropic (Claude) — writing and reasoning.",
            "xAI (Grok) — image generation, speech and some video.",
            "PDFShift — turning documents into PDFs.",
          ]}
        />
        <p>
          Where an order is handed to an external agent, they receive only the job reference, the
          product and the brief — not your name, your email or your account.
        </p>
      </Section>

      <Section heading="How long we keep it">
        <p>
          Orders and deliverables stay in your dashboard until you ask for them to be removed, so
          you can come back to work you paid for. Payment records are kept as long as needed for
          accounting. Server logs are short-lived.
        </p>
      </Section>

      <Section heading="Your choices">
        <p>You can ask us to:</p>
        <List
          items={[
            "send you a copy of what we hold about you",
            "correct anything that's wrong",
            "delete your account and its contents",
            "stop processing your data, which in practice means closing the account",
          ]}
        />
        <p>
          Email{" "}
          <a className="text-yellow-400 hover:underline" href="mailto:hello@agenticcore.click">
            hello@agenticcore.click
          </a>{" "}
          and we'll action it. Deleting an account removes its orders and files; that can't be
          undone, so download anything you want to keep first.
        </p>
      </Section>

      <Section heading="Security">
        <p>
          Accounts are protected by password and each account can only read its own rows, enforced
          at the database rather than only in the interface. Deliverable files are served from
          unguessable URLs. Nothing is perfectly secure, and we won't claim otherwise — but we
          don't store payment card details anywhere, which removes the worst of the risk.
        </p>
      </Section>

      <Section heading="Changes and contact">
        <p>
          We'll update this page if what we do changes, and the date at the top reflects the
          current version.
        </p>
        <p>
          Questions: <a className="text-yellow-400 hover:underline" href="mailto:hello@agenticcore.click">hello@agenticcore.click</a>
        </p>
      </Section>
    </LegalLayout>
  );
}
