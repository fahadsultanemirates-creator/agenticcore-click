import { ListChecks, MessageSquareText, PackageCheck } from "lucide-react";
import { Reveal } from "../Reveal";

const steps = [
  {
    icon: ListChecks,
    title: "Pick a service",
    body: "Website, logo, video, brochure — whatever your business needs first. One click, no forms.",
  },
  {
    icon: MessageSquareText,
    title: "Give a quick brief",
    body: "A sentence or two about your business and the vibe you're going for. That's genuinely it.",
  },
  {
    icon: PackageCheck,
    title: "Get it back, fast",
    body: "A real, usable result lands in your dashboard — ready to download, tweak, or ship.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="mx-auto max-w-6xl px-6 py-20 md:py-28">
      <div className="mx-auto mb-14 max-w-2xl text-center">
        <h2 className="font-display text-4xl font-semibold tracking-tight text-fg sm:text-5xl">
          Three steps. No meetings.
        </h2>
        <p className="mt-4 text-lg text-fg-muted">
          We skipped the onboarding calls, the revisions-by-email, and the
          25-tab briefing doc. Here's the whole process.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {steps.map((step, i) => (
          <Reveal key={step.title} delay={i * 100}>
            <div className="group relative h-full rounded-2xl border border-border bg-surface p-7 transition-all duration-200 hover:-translate-y-1 hover:border-yellow-400/40">
              <span className="absolute -top-4 -left-3 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-void font-display text-sm font-semibold text-fg">
                {i + 1}
              </span>
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-yellow-400/10 transition-colors duration-200 group-hover:bg-yellow-400/20">
                <step.icon className="h-6 w-6 text-yellow-400" strokeWidth={2.25} />
              </div>
              <h3 className="font-display text-xl font-semibold text-fg">
                {step.title}
              </h3>
              <p className="mt-2 text-fg-muted">{step.body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
