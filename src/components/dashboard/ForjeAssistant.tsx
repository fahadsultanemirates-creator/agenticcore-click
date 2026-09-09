import { Sparkles, X } from "lucide-react";
import { useState } from "react";

export function ForjeAssistant() {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed right-5 bottom-5 z-50 sm:right-8 sm:bottom-8">
      {open && (
        <div className="animate-fade-up mb-4 w-80 overflow-hidden rounded-2xl border border-border bg-surface shadow-glow sm:w-96">
          <div className="flex items-center justify-between border-b border-border bg-void px-4 py-3.5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-yellow-400 text-void">
                <Sparkles className="h-4 w-4" />
              </span>
              <div>
                <p className="font-display text-sm font-semibold text-fg">Forje</p>
                <p className="text-xs text-fg-faint">Your task assistant</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close Forje"
              className="flex h-7 w-7 items-center justify-center rounded-full text-fg-faint transition-colors hover:bg-surface-2 hover:text-fg"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-col gap-3 px-4 py-4">
            <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-surface-2 px-3.5 py-2.5 text-sm text-fg">
              Hi, I'm Forje 👋 Once this is wired up, tell me what needs doing and
              I'll turn it into tasks on your dashboard.
            </div>
            <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-yellow-400 px-3.5 py-2.5 text-sm text-void">
              e.g. "Get the logo brief ready and remind me tomorrow"
            </div>
          </div>

          <div className="border-t border-border p-3">
            <div className="flex items-center gap-2 rounded-full border border-border bg-void px-3.5 py-2">
              <input
                disabled
                placeholder="Ask Forje to create a task..."
                className="flex-1 bg-transparent text-sm text-fg-faint placeholder:text-fg-faint focus:outline-none"
              />
              <span className="rounded-full bg-fg-faint/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-fg-faint uppercase">
                Soon
              </span>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close Forje assistant" : "Open Forje assistant"}
        className={`ml-auto flex h-14 w-14 items-center justify-center rounded-full bg-yellow-400 text-void shadow-glow-yellow transition-transform hover:-translate-y-0.5 ${
          open ? "" : "animate-pulse-ring"
        }`}
      >
        {open ? <X className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
      </button>
    </div>
  );
}
