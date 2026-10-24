import { Mail } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { SOCIAL_LINKS, SUPPORT_EMAIL, TELEGRAM_URL, whatsAppUrl, type SocialKey } from "../../data/contact";
import { Link } from "react-router-dom";
import { Logo } from "../Logo";
import { TelegramIcon } from "../icons/TelegramIcon";
import { WhatsAppIcon } from "../icons/WhatsAppIcon";
import { FacebookIcon, InstagramIcon, TikTokIcon, XIcon, YouTubeIcon } from "../icons/SocialIcons";

// Two rows, deliberately not one. The social accounts are where we post;
// the support channels are where someone with a problem goes. Mixing them
// into a single strip of circles means a client with a broken deliverable
// has to guess which of seven identical buttons reaches a human.
// The accounts themselves live in data/contact.ts, shared with .agency
// and .biz so the three footers cannot drift apart. Only the drawing of
// them is local.
//
// Record<SocialKey, ...> rather than a loose lookup: adding an account to
// that list without giving it an icon here fails the build instead of
// rendering a hole.
const ICONS: Record<SocialKey, ComponentType<{ className?: string }>> = {
  x: XIcon,
  facebook: FacebookIcon,
  instagram: InstagramIcon,
  youtube: YouTubeIcon,
  tiktok: TikTokIcon,
  "telegram-channel": TelegramIcon,
};

// The sister brands. .click was the only one of the three with no way
// back out to the other two, which left it a dead end for anyone who
// landed here wanting custom work or back-office support.
const ELSEWHERE = [
  { href: "https://agenticcore.group/services.html", label: "agenticcore.group — managed offices and framework builds" },
  { href: "https://agenticcore.agency", label: "agenticcore.agency — websites, applications and design" },
  { href: "https://agenticcore.biz", label: "agenticcore.biz — business plans, documents and setup" },
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
              <Link to="/contact" className="transition-colors hover:text-fg">Contact</Link>
            </nav>
          </div>

          <div className="flex flex-col items-center gap-5 sm:items-end">
            <div className="flex flex-col items-center gap-2 sm:items-end">
              <span className="text-xs font-semibold tracking-wide text-fg-faint uppercase">
                Need help?
              </span>
              <div className="flex items-center gap-2">
                <IconLink href={`mailto:${SUPPORT_EMAIL}`} label={`Email ${SUPPORT_EMAIL}`} filled>
                  <Mail className="h-4 w-4" />
                </IconLink>
                <IconLink href={TELEGRAM_URL} label="Support on Telegram" filled>
                  <TelegramIcon className="h-4 w-4" />
                </IconLink>
                {/* Support only. The order/project bot is linked from the
                    hero and is a different destination on purpose. */}
                {whatsAppUrl() ? (
                  <IconLink href={whatsAppUrl() as string} label="Support on WhatsApp" filled>
                    <WhatsAppIcon className="h-4 w-4" />
                  </IconLink>
                ) : null}
              </div>
            </div>

            <div className="flex flex-col items-center gap-2 sm:items-end">
              <span className="text-xs font-semibold tracking-wide text-fg-faint uppercase">
                Follow us
              </span>
              <div className="flex items-center gap-2">
                {SOCIAL_LINKS.map((social) => {
                  const Icon = ICONS[social.key];
                  return (
                    <IconLink key={social.key} href={social.href} label={social.label}>
                      <Icon className="h-4 w-4" />
                    </IconLink>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center gap-1.5 text-xs text-fg-faint">
          {ELSEWHERE.map((site) => (
            <a key={site.href} href={site.href} className="transition-colors hover:text-fg-muted">
              {site.label}
            </a>
          ))}
        </div>

        <p className="text-sm text-fg-faint">
          &copy; {new Date().getFullYear()} agenticcore.click
        </p>
      </div>
    </footer>
  );
}
