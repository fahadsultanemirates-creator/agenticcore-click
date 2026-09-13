import { Mail, Share2 } from "lucide-react";
import type { ReactNode } from "react";
import { Logo } from "../Logo";
import { TelegramIcon } from "../icons/TelegramIcon";

function IconLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      aria-label={label}
      title={label}
      className="flex h-9 w-9 items-center justify-center rounded-full bg-yellow-400 text-void transition-transform hover:-translate-y-0.5"
    >
      {children}
    </a>
  );
}

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
          <div className="flex items-center gap-2">
            <IconLink href="mailto:hello@agenticcore.click" label="Email us (address coming soon)">
              <Mail className="h-4 w-4" />
            </IconLink>
            <IconLink href="#" label="Follow us on social (link coming soon)">
              <Share2 className="h-4 w-4" />
            </IconLink>
            <IconLink href="#" label="Join us on Telegram (link coming soon)">
              <TelegramIcon className="h-4.5 w-4.5" />
            </IconLink>
          </div>
        </div>
      </div>
    </footer>
  );
}
