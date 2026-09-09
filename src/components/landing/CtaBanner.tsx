import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Reveal } from "../Reveal";

export function CtaBanner() {
  return (
    <section className="relative mx-auto max-w-6xl overflow-hidden px-6 pb-20 md:pb-28">
      <Reveal>
        <div className="relative overflow-hidden rounded-3xl bg-yellow-400 px-6 py-16 text-center sm:px-12">
          <div
            aria-hidden
            className="bg-noise absolute inset-0 opacity-[0.05]"
          />
          <h2 className="relative font-display text-4xl font-semibold tracking-tight text-void sm:text-5xl">
            Ready to see what it looks like?
          </h2>
          <p className="relative mx-auto mt-4 max-w-xl text-lg text-void/80">
            The dashboard mockup below is a design preview — no sign-up, no
            real generation yet. Just the look and feel, for now.
          </p>
          <Link
            to="/dashboard"
            className="relative mt-8 inline-flex items-center gap-2 rounded-full bg-void px-7 py-3.5 text-base font-semibold text-fg transition-transform hover:-translate-y-0.5"
          >
            Preview the dashboard
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </Reveal>
    </section>
  );
}
