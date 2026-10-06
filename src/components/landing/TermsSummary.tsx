import { CreditCard, FileCheck, RefreshCw, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import { Reveal } from "../Reveal";

// This replaced a "Quick questions" FAQ. Every answer in it was written
// before launch and said so -- "we're designing this part right now",
// "placeholders for now", "we'll confirm real numbers before launch". A
// visitor deciding whether to pay was being told the prices were not real.
//
// What belongs in that space is the small number of terms that actually
// change someone's decision, stated plainly, with the full policies one
// click away. The revision counts here are the catalog's own
// (_shared/catalog.ts): websites 2, designed documents and brand-kit
// pieces 1, images and video 0.
const TERMS = [
  {
    icon: RefreshCw,
    title: "Revisions",
    body: "Websites include 2. Brochures, decks, documents and brand-kit pieces include 1. Images and video include none — they come back as several options instead, and choosing between them is the revision.",
  },
  {
    icon: FileCheck,
    title: "What you get",
    body: "The real files — HTML, PDF, PNG, MP4 — generated for your brief, not a template with your name dropped into it. They're yours to use commercially, with no credit to us required.",
  },
  {
    icon: Wallet,
    title: "Paying",
    body: "You top up a wallet, then spend it a service at a time. Top-ups are USDT on BNB Smart Chain. Nothing is charged until you submit an order, and the price is shown before you do.",
  },
  {
    icon: CreditCard,
    title: "Getting money back",
    body: "Unused wallet balance is yours on request, no reason needed. An order that fails to produce anything is refunded to your wallet automatically.",
  },
];

export function TermsSummary() {
  return (
    <section id="terms" className="mx-auto max-w-3xl px-6 py-20 md:py-28">
      <h2 className="text-center font-display text-4xl font-semibold tracking-tight text-fg sm:text-5xl">
        Before you order
      </h2>
      <p className="mx-auto mt-4 max-w-xl text-center text-fg-muted">
        The short version. The full{" "}
        <Link to="/terms" className="text-yellow-400 hover:underline">terms</Link> and{" "}
        <Link to="/refunds" className="text-yellow-400 hover:underline">refund policy</Link> are
        there when you want them.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {TERMS.map((term, i) => (
          <Reveal key={term.title} delay={i * 60}>
            <div className="h-full rounded-2xl border border-border bg-surface p-5">
              <div className="flex items-center gap-2.5">
                <term.icon className="h-4 w-4 shrink-0 text-yellow-400" strokeWidth={2.25} />
                <h3 className="font-display text-lg font-medium text-fg">{term.title}</h3>
              </div>
              <p className="mt-2.5 text-sm leading-relaxed text-fg-muted">{term.body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
