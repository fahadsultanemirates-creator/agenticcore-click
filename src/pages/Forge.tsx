import { ArrowLeft, Paperclip, Send, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { Logo } from "../components/Logo";

const conversation = [
  {
    from: "forge" as const,
    text: "Hi, I'm Forge 👋 I help turn what's in your head into tasks on your dashboard — briefs, revisions, reminders, whatever needs doing next.",
  },
  {
    from: "user" as const,
    text: "I need a logo brief ready by tomorrow and a reminder to review the website draft.",
  },
  {
    from: "forge" as const,
    text: "Got it. Once I'm wired up, I'll create both of those as tasks and drop them into your Portfolio & history so nothing slips. For now this is a preview of how that conversation will feel.",
  },
];

const suggestions = [
  "Turn this brief into a task",
  "Remind me about a revision",
  "What's still in progress?",
  "Help me plan next week's orders",
];

export function Forge() {
  return (
    <div className="flex h-screen flex-col bg-void">
      <header className="flex items-center justify-between border-b border-border px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <Link
            to="/dashboard"
            aria-label="Back to dashboard"
            className="flex h-9 w-9 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-yellow-400 text-void">
              <Sparkles className="h-4.5 w-4.5" />
            </span>
            <div>
              <p className="font-display text-base font-semibold text-fg">Forge</p>
              <p className="text-xs text-fg-faint">Your task assistant</p>
            </div>
          </div>
        </div>
        <Link to="/" className="hidden sm:block">
          <Logo compact />
        </Link>
      </header>

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden px-4 sm:px-6">
        <div className="flex-1 overflow-y-auto py-8">
          <div className="flex flex-col gap-5">
            {conversation.map((message, i) => (
              <div
                key={i}
                className={`flex items-end gap-3 ${message.from === "user" ? "flex-row-reverse" : ""}`}
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    message.from === "forge" ? "bg-yellow-400 text-void" : "bg-surface-2 text-fg"
                  }`}
                >
                  {message.from === "forge" ? <Sparkles className="h-4 w-4" /> : "Y"}
                </span>
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm ${
                    message.from === "forge"
                      ? "rounded-bl-sm bg-surface text-fg"
                      : "rounded-br-sm bg-yellow-400 text-void"
                  }`}
                >
                  {message.text}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-border py-4">
          <div className="mb-3 flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <span
                key={s}
                className="rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs font-medium text-fg-muted"
              >
                {s}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-2 rounded-full border-2 border-yellow-400/30 bg-surface px-2 py-2 pl-4">
            <input
              disabled
              placeholder="Ask Forge anything..."
              className="flex-1 bg-transparent text-sm text-fg-faint placeholder:text-fg-faint focus:outline-none"
            />
            <button
              type="button"
              disabled
              aria-label="Attach a file"
              className="flex h-9 w-9 shrink-0 cursor-not-allowed items-center justify-center rounded-full text-fg-faint"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled
              aria-label="Send"
              className="flex h-9 w-9 shrink-0 cursor-not-allowed items-center justify-center rounded-full bg-yellow-400 text-void opacity-50"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-2 text-center text-xs text-fg-faint">
            Forge is a preview — replies shown above are mocked, and sending isn't wired up yet.
          </p>
        </div>
      </div>
    </div>
  );
}
