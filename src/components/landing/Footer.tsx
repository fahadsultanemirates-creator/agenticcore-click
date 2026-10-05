import { Mail } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { Link } from "react-router-dom";
import { Logo } from "../Logo";
import { TelegramIcon } from "../icons/TelegramIcon";
import { FacebookIcon, InstagramIcon, TikTokIcon, XIcon, YouTubeIcon } from "../icons/SocialIcons";

// Two rows, deliberately not one. The social accounts are where we post;
// the support channels are where someone with a problem goes. Mixing them
// into a single strip of circles means a client with a broken deliverable
// has to guess which of seven identical buttons reaches a human.
const SOCIALS: { href: string; label: string; Icon: ComponentType<{ className?: string }> }[] = [
  { href: "https://x.com/AgenticCoreHQ", label: "X", Icon: XIcon },
  { href: "https://www.facebook.com/share/19vitDyQWB/", label: "Facebook", Icon: FacebookIcon },
  { href: "https://instagram.com/agenticcore.agency", label: "Instagram", Icon: InstagramIcon },
  { href: "https://youtube.com/@AgenticcoreAgency", label: "YouTube", Icon: YouTubeIcon },
  { href: "https://tiktok.com/@agenticcore.agency", label: "TikTok", Icon: TikTokIcon },
];

function IconLink({
  href,
  label,
  filled = false,
  children,
}: {
  href: string;
  label: string;
  filled?: boolean;
  children: ReactNode;
}) {
  const external = href.startsWith("http");
  return (
    <a
      href={href}
      aria-label={label}
      title={label}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={`flex h-9 w-9 items-center justify-center rounded-full transition-transform hover:-translate-y-0.5 active:translate-y-0 active:scale-95 ${
        filled
          ? "bg-yellow-400 text-void"
          : "border border-border text-fg-muted hover:border-yellow-400/60 hover:text-fg"
      }`}
    >
      {children}
    </a>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-border px-6 py-12">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-10">
        <div className="flex w-full flex-col items-center justify-between gap-6 sm:flex-row sm:items-start">
          <div className="flex flex-col items-center gap-2 sm:items-start">
            <Logo />
            <p className="text-sm text-fg-faint">
              Part of the AgenticCore family — the fast, self-serve one.
            </p>
            <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-fg-faint">
              <Link to="/terms" className="transition-colors hover:text-fg">Terms</Link>
              <Link to="/privacy" className="transition-colors hover:text-fg">Privacy</Link>
              <Link to="/refunds" className="transition-colors hover:text-fg">Refunds</Link>
            </nav>
          </div>

          <div className="flex flex-col items-center gap-5 sm:items-end">
            <div className="flex flex-col items-center gap-2 sm:items-end">
              <span className="text-xs font-semibold tracking-wide text-fg-faint uppercase">
                Need help?
              </span>
              <div className="flex items-center gap-2">
                <IconLink href="mailto:hello@agenticcore.click" label="Email hello@agenticcore.click" filled>
                  <Mail className="h-4 w-4" />
                </IconLink>
                <IconLink href="https://t.me/AgenticCoreAgency" label="Support on Telegram" filled>
                  <TelegramIcon className="h-4 w-4" />
                </IconLink>
              </div>
            </div>

            <div className="flex flex-col items-center gap-2 sm:items-end">
              <span className="text-xs font-semibold tracking-wide text-fg-faint uppercase">
                Follow us
              </span>
              <div className="flex items-center gap-2">
                {SOCIALS.map(({ href, label, Icon }) => (
                  <IconLink key={label} href={href} label={label}>
                    <Icon className="h-4 w-4" />
                  </IconLink>
                ))}
              </div>
            </div>
          </div>
        </div>

        <p className="text-sm text-fg-faint">
          &copy; {new Date().getFullYear()} agenticcore.click
        </p>
      </div>
    </footer>
  );
}
