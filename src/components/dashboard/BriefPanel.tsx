import { Sparkles } from "lucide-react";
import type { Service } from "../../data/services";

type Props = {
  service: Service;
  brief: string;
  onBriefChange: (value: string) => void;
  onGenerate: () => void;
  status: "idle" | "generating" | "done";
};

export function BriefPanel({ service, brief, onBriefChange, onGenerate, status }: Props) {
  return (
    <div className="flex h-full flex-col justify-center px-8 py-10 sm:px-12 lg:px-16">
      <div className="mx-auto w-full max-w-xl">
        <div className="mb-6 flex items-center gap-2 text-sm font-semibold text-pink-600">
          <Sparkles className="h-4 w-4" />
          {service.eta} &middot; {service.price}
        </div>

        <h2 className="font-display text-3xl leading-tight font-semibold text-ink sm:text-4xl">
          {service.prompt}
        </h2>

        <textarea
          value={brief}
          onChange={(e) => onBriefChange(e.target.value)}
          placeholder={service.placeholder}
          rows={5}
          className="mt-6 w-full resize-none rounded-2xl border-2 border-ink/15 bg-white p-4 text-ink placeholder:text-ink-faint focus:border-ink/40 focus:outline-none"
        />

        <div className="mt-4 flex flex-wrap gap-2">
          {service.chips.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => onBriefChange(chip)}
              className="rounded-full border border-ink/15 bg-white px-3.5 py-1.5 text-sm font-medium text-ink-soft transition-colors hover:border-pink-400 hover:text-ink"
            >
              {chip}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onGenerate}
          disabled={status === "generating" || brief.trim().length === 0}
          className="mt-8 inline-flex items-center gap-2 rounded-full bg-ink px-7 py-3.5 text-base font-semibold text-cream shadow-pop-sm transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
        >
          {status === "generating" ? "Generating..." : "Generate"}
          {status !== "generating" && <Sparkles className="h-4 w-4" />}
        </button>

        <p className="mt-3 text-xs text-ink-faint">
          Mockup only — this simulates the flow, no request is actually sent anywhere.
        </p>
      </div>
    </div>
  );
}
