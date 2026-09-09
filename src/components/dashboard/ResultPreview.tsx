import { Download, RefreshCw } from "lucide-react";
import type { Service } from "../../data/services";

type Props = {
  service: Service;
  status: "idle" | "generating" | "done";
};

export function ResultPreview({ service, status }: Props) {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-cream-dim px-8 py-10">
      {status === "idle" && (
        <div className="text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-dashed border-ink/20 text-ink-faint">
            <service.icon className="h-7 w-7" strokeWidth={1.75} />
          </div>
          <p className="font-display text-lg font-medium text-ink">
            Your {service.label.toLowerCase()} will show up here
          </p>
          <p className="mt-1.5 max-w-xs text-sm text-ink-faint">
            Write a brief and hit generate to see how the result view looks.
          </p>
        </div>
      )}

      {status === "generating" && (
        <div className="w-full max-w-sm animate-pulse">
          <div className="aspect-square w-full rounded-2xl bg-ink/10" />
          <div className="mt-4 h-3 w-3/4 rounded-full bg-ink/10" />
          <div className="mt-2 h-3 w-1/2 rounded-full bg-ink/10" />
        </div>
      )}

      {status === "done" && (
        <div className="w-full max-w-sm">
          <div className="flex aspect-square w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-ink bg-white shadow-pop-sm">
            <service.icon className="h-10 w-10 text-pink-500" strokeWidth={1.75} />
            <p className="px-6 text-center text-sm font-medium text-ink-faint">
              Placeholder result — real {service.label.toLowerCase()} generation isn't wired up yet
            </p>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled
              className="flex flex-1 cursor-not-allowed items-center justify-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-cream opacity-60"
            >
              <Download className="h-4 w-4" /> Download
            </button>
            <button
              type="button"
              disabled
              className="flex flex-1 cursor-not-allowed items-center justify-center gap-2 rounded-full border-2 border-ink/15 px-4 py-2.5 text-sm font-semibold text-ink-soft opacity-60"
            >
              <RefreshCw className="h-4 w-4" /> Regenerate
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
