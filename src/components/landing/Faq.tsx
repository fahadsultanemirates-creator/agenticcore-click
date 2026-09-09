import { Reveal } from "../Reveal";

const faqs = [
  {
    q: "Is this actually AI-generated, or a template?",
    a: "Real generation, tailored to your brief — not a form you fill in on top of a fixed template.",
  },
  {
    q: "What if I don't like the result?",
    a: "You'll be able to tweak the brief and regenerate. We're designing this part right now — details soon.",
  },
  {
    q: "Is $20 / 20 minutes final?",
    a: "Nope — placeholders for now. We're building toward something close to that, and we'll confirm real numbers before launch.",
  },
  {
    q: "Is agenticcore.click related to AgenticCore.agency / .biz?",
    a: "Yes — same family, different job. This one's the fast, self-serve sibling; the others are full-service.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="mx-auto max-w-3xl px-6 py-20 md:py-28">
      <h2 className="text-center font-display text-4xl font-semibold tracking-tight text-fg sm:text-5xl">
        Quick questions
      </h2>

      <div className="mt-10 flex flex-col gap-3">
        {faqs.map((item, i) => (
          <Reveal key={item.q} delay={i * 60}>
            <details className="group w-full rounded-2xl border border-border bg-surface p-5 transition-colors open:border-yellow-400/40">
              <summary className="flex cursor-pointer list-none items-center justify-between font-display text-lg font-medium text-fg marker:content-none">
                {item.q}
                <span className="ml-4 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-yellow-400 text-sm font-semibold text-void transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-fg-muted">{item.a}</p>
            </details>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
