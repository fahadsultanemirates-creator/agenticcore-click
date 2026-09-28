// Shared chrome for the three policy pages.
//
// These exist because the site takes money and had no terms, no privacy
// policy and no refund policy at all -- which most payment providers
// require, and which a customer reasonably looks for before paying.
//
// THE WORDING IS A STARTING DRAFT, NOT LEGAL ADVICE. It describes what the
// system actually does, which is the part only this codebase knows, and it
// is written to be reviewed by somebody qualified in the jurisdiction the
// business operates from rather than shipped as final.

import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Footer } from "../../components/landing/Footer";
import { Logo } from "../../components/Logo";

export const LAST_UPDATED = "29 September 2026";

export function LegalLayout({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-void">
      <header className="border-b border-border px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <Link to="/">
            <Logo />
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-fg-muted transition-colors hover:text-fg"
          >
            <ArrowLeft className="h-4 w-4" />
            Home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="font-display text-3xl font-semibold text-fg sm:text-4xl">{title}</h1>
        <p className="mt-3 text-fg-muted">{intro}</p>
        <p className="mt-2 text-sm text-fg-faint">Last updated {LAST_UPDATED}</p>

        <div className="mt-10 flex flex-col gap-8">{children}</div>
      </main>

      <Footer />
    </div>
  );
}

export function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-xl font-semibold text-fg">{heading}</h2>
      <div className="flex flex-col gap-3 text-sm leading-relaxed text-fg-muted">{children}</div>
    </section>
  );
}

export function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="flex list-disc flex-col gap-1.5 pl-5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}
