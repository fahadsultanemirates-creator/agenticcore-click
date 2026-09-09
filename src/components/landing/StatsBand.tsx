import { Reveal } from "../Reveal";

const stats = [
  { value: "20 min", label: "average turnaround*" },
  { value: "$20", label: "starting price*" },
  { value: "8", label: "services (and counting)" },
  { value: "0", label: "meetings required" },
];

export function StatsBand() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-16">
      <Reveal>
        <div className="relative overflow-hidden rounded-3xl border-2 border-ink bg-ink px-6 py-12 shadow-pop sm:px-12">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-16 -right-16 h-64 w-64 rounded-full bg-pink-500/20 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-16 -left-16 h-64 w-64 rounded-full bg-orange-500/20 blur-3xl"
          />
          <div className="relative grid grid-cols-2 gap-8 md:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="font-display text-4xl font-semibold text-gradient sm:text-5xl">
                  {stat.value}
                </p>
                <p className="mt-2 text-sm text-cream/70">{stat.label}</p>
              </div>
            ))}
          </div>
          <p className="relative mt-10 text-center text-xs text-cream/40">
            *Placeholder targets while we're building — real numbers coming at launch.
          </p>
        </div>
      </Reveal>
    </section>
  );
}
