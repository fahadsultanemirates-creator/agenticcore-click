import { Logo } from "../Logo";
import { TelegramIcon } from "../icons/TelegramIcon";

export function Footer() {
  return (
    <footer className="border-t border-border px-6 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 sm:flex-row">
        <Logo />
        <p className="text-sm text-fg-faint">
          Part of the AgenticCore family — the fast, self-serve one.
        </p>
        <div className="flex items-center gap-4">
          <p className="text-sm text-fg-faint">
            &copy; {new Date().getFullYear()} agenticcore.click
          </p>
          <a
            href="#"
            aria-label="Join us on Telegram (link coming soon)"
            title="Telegram — link coming soon"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-yellow-400 text-void transition-transform hover:-translate-y-0.5"
          >
            <TelegramIcon className="h-4.5 w-4.5" />
          </a>
        </div>
      </div>
    </footer>
  );
}
