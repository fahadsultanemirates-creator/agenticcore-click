import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

export function CtaBanner() {
  return (
    <section className="relative mx-auto max-w-6xl overflow-hidden px-6 pb-20 md:pb-28">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-pink-500 to-orange-500 px-6 py-16 text-center shadow-pop sm:px-12">
        <div
          aria-hidden
          className="bg-noise absolute inset-0 opacity-[0.06]"
        />
        <h2 className="relative font-display text-4xl font-semibold tracking-tight text-white sm:text-5xl">
          Ready to see what it looks like?
        </h2>
        <p className="relative mx-auto mt-4 max-w-xl text-lg text-white/90">
          The dashboard mockup below is a design preview — no sign-up, no
          real generation yet. Just the look and feel, for now.
        </p>
        <Link
          to="/dashboard"
          className="relative mt-8 inline-flex items-center gap-2 rounded-full bg-ink px-7 py-3.5 text-base font-semibold text-cream transition-transform hover:-translate-y-0.5"
        >
          Preview the dashboard
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}
