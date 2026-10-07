import { ArrowRight, Layers } from "lucide-react";
import { Link } from "react-router-dom";

// The way out of the dashboard to the finished work, which no longer
// lives on this page. Positioned where the Deliverables grid used to be,
// so the habit of scrolling here still lands somewhere useful.
export function ProjectsCallout({ projectCount, unseenCount }: { projectCount: number; unseenCount: number }) {
  return (
    <section className="border-t border-border py-10">
      <Link
        to="/projects"
        className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-yellow-400/50 sm:p-6"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-yellow-400/10">
          <Layers className="h-5 w-5 text-yellow-400" strokeWidth={2.25} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-display text-lg font-semibold text-fg">Your projects</span>
            {unseenCount > 0 ? (
              <span className="rounded-full bg-yellow-400 px-2 py-0.5 text-[10px] font-bold text-void">
                {unseenCount} NEW
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 block text-sm text-fg-muted">
            {projectCount === 0
              ? "Finished work, and everything you have ordered, kept together."
              : `${projectCount} ${projectCount === 1 ? "project" : "projects"} — downloads, briefs, and the next thing built on the last.`}
          </span>
        </span>
        <ArrowRight className="h-5 w-5 shrink-0 text-yellow-400" />
      </Link>
    </section>
  );
}
