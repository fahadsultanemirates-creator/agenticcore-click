import { ArrowRight, Mail, MessageCircle, Phone, Send } from "lucide-react";
import { Link } from "react-router-dom";
import { LegalLayout } from "./legal/LegalLayout";
import { SUPPORT_EMAIL, TELEGRAM_HANDLE, TELEGRAM_URL, whatsAppLabel, whatsAppUrl } from "../data/contact";

/**
 * There was no contact page on this site at all.
 *
 * Everything was reachable only from inside the dashboard or buried in the
 * footer, which is a problem for a site asking strangers to send USDT to a
 * wallet. Built on LegalLayout because it already has the right frame --
 * header, back link, footer -- and this is a short page, not a new shell.
 */
export function Contact() {
  const whatsapp = whatsAppUrl();

  return (
    <LegalLayout
      title="Contact us"
      intro="No account needed. If you want to ask something before you top up, any of these reaches us."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Channel
          icon={<Send className="h-5 w-5" aria-hidden />}
          title="Telegram"
          detail={`@${TELEGRAM_HANDLE}`}
          body="The fastest way to reach a person."
          href={TELEGRAM_URL}
          external
        />
        <Channel
          icon={<Mail className="h-5 w-5" aria-hidden />}
          title="Email"
          detail={SUPPORT_EMAIL}
          body="Best for anything with attachments, or if you want a written record."
          href={`mailto:${SUPPORT_EMAIL}`}
          external
        />
        {/* Hidden until the owner supplies a number. A placeholder on a
            contact page is worse than no button, because somebody will
            dial it. Set WHATSAPP_NUMBER in src/data/contact.ts. */}
        {whatsapp ? (
          <Channel
            icon={<Phone className="h-5 w-5" aria-hidden />}
            title="WhatsApp"
            detail={whatsAppLabel() as string}
            body="Same team as Telegram, if WhatsApp is easier for you."
            href={whatsapp}
            external
          />
        ) : null}
        <Channel
          icon={<MessageCircle className="h-5 w-5" aria-hidden />}
          title="Ask Maya"
          detail="In your dashboard"
          body="Describe what you want in your own words and Maya places the order for you."
          href="/dashboard/maya"
        />
        <Channel
          icon={<ArrowRight className="h-5 w-5" aria-hidden />}
          title="Refunds"
          detail="How they work"
          body="Unspent balance is yours, and a failed order is refunded without you asking."
          href="/refunds"
        />
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-display text-lg font-semibold text-fg">Two things worth knowing</h2>
        <ul className="mt-3 flex flex-col gap-3 text-sm leading-relaxed text-fg-muted">
          <li className="flex items-start gap-2">
            <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-yellow-400" />
            <span>
              We will never ask you for a password or a login code. If someone does, in our name,
              it is not us.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-yellow-400" />
            <span>
              Top-ups are USDT on BNB Smart Chain and cannot be reversed by a bank, so if something
              looks wrong, talk to us before anything else — we are the only route to putting it
              right.
            </span>
          </li>
        </ul>
      </div>
    </LegalLayout>
  );
}

function Channel({
  icon,
  title,
  detail,
  body,
  href,
  external = false,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  body: string;
  href: string;
  external?: boolean;
}) {
  const inner = (
    <>
      <span className="flex items-center gap-2 text-yellow-400">
        {icon}
        <span className="font-display text-base font-semibold text-fg">{title}</span>
      </span>
      <span className="mt-1 block text-sm font-medium text-yellow-400">{detail}</span>
      <span className="mt-2 block text-sm leading-relaxed text-fg-muted">{body}</span>
    </>
  );
  const className =
    "block rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-yellow-400/40";

  return external ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {inner}
    </a>
  ) : (
    <Link to={href} className={className}>
      {inner}
    </Link>
  );
}
