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
      <h2 className="text-center font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
        Quick questions
      </h2>

      <div className="mt-10 flex flex-col gap-3">
        {faqs.map((item) => (
          <details
            key={item.q}
            className="group rounded-2xl border-2 border-ink bg-white p-5 open:shadow-pop-sm"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between font-display text-lg font-medium text-ink marker:content-none">
              {item.q}
              <span className="ml-4 shrink-0 rounded-full bg-cream-dim px-2.5 py-1 text-sm text-ink-faint transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="mt-3 text-ink-soft">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
