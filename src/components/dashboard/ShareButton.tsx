import { Check, Copy, Share2 } from "lucide-react";
import { useState } from "react";
import { shareOrCopy } from "../../lib/share";

// One button, two behaviours, because the phone and the laptop do not
// agree on what sharing is. On a phone it is the native sheet -- WhatsApp,
// Telegram, mail, whatever is installed. On a desktop there is usually no
// sheet, so the links go to the clipboard and the button says so for a
// moment rather than appearing to do nothing.
export function ShareButton({
  title,
  urls,
  className = "",
  label = "Share",
  /** Icon only, for sitting inside a per-option pill. */
  compact = false,
}: {
  title: string;
  urls: string[];
  className?: string;
  label?: string;
  compact?: boolean;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  if (urls.length === 0) return null;

  const handle = async () => {
    const result = await shareOrCopy({ title, urls });
    if (result === "shared" || result === "cancelled") return;
    setState(result === "copied" ? "copied" : "failed");
    window.setTimeout(() => setState("idle"), 2500);
  };

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => void handle()}
        aria-label={state === "copied" ? "Link copied" : `Share ${title}`}
        title={state === "copied" ? "Link copied" : `Share ${title}`}
        className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-yellow-400/10 hover:text-fg ${className}`}
      >
        {state === "copied" ? <Check className="h-3 w-3 text-yellow-400" /> : <Share2 className="h-3 w-3" />}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void handle()}
      className={`inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-fg-muted transition-colors hover:border-yellow-400/50 hover:text-fg ${className}`}
    >
      {state === "copied" ? (
        <>
          <Check className="h-3 w-3 text-yellow-400" /> Link{urls.length > 1 ? "s" : ""} copied
        </>
      ) : state === "failed" ? (
        <>
          <Copy className="h-3 w-3" /> Could not copy
        </>
      ) : (
        <>
          <Share2 className="h-3 w-3" /> {label}
        </>
      )}
    </button>
  );
}
