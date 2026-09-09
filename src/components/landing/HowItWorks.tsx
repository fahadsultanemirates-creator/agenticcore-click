import { ListChecks, MessageSquareText, PackageCheck } from "lucide-react";

const steps = [
  {
    icon: ListChecks,
    title: "Pick a service",
    body: "Website, logo, video, brochure — whatever your business needs first. One click, no forms.",
    color: "from-pink-500 to-pink-400",
  },
  {
    icon: MessageSquareText,
    title: "Give a quick brief",
    body: "A sentence or two about your business and the vibe you're going for. That's genuinely it.",
    color: "from-pink-500 to-orange-500",
  },
  {
    icon: PackageCheck,
    title: "Get it back, fast",
    body: "A real, usable result lands in your dashboard — ready to download, tweak, or ship.",
    color: "from-orange-500 to-orange-400",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="mx-auto max-w-6xl px-6 py-20 md:py-28">
      <div className="mx-auto mb-14 max-w-2xl text-center">
        <h2 className="font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
          Three steps. No meetings.
        </h2>
        <p className="mt-4 text-lg text-ink-soft">
          We skipped the onboarding calls, the revisions-by-email, and the
          25-tab briefing doc. Here's the whole process.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {steps.map((step, i) => (
          <div
            key={step.title}
            className="relative rounded-2xl border-2 border-ink bg-white p-7 shadow-pop-sm"
          >
            <span className="absolute -top-4 -left-3 flex h-9 w-9 items-center justify-center rounded-full border-2 border-ink bg-cream font-display text-sm font-semibold text-ink">
              {i + 1}
            </span>
            <div
              className={`mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${step.color}`}
            >
              <step.icon className="h-6 w-6 text-white" strokeWidth={2.25} />
            </div>
            <h3 className="font-display text-xl font-semibold text-ink">
              {step.title}
            </h3>
            <p className="mt-2 text-ink-soft">{step.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
