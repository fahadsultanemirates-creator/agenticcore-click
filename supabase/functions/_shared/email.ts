import type { Email } from './emailTemplates.ts';
import { supabaseAdmin } from './storage.ts';

// Transactional email via Brevo's v3 API (POST /v3/smtp/email, api-key
// header) -- HTTP, not SMTP, because an edge function has no business
// holding an SMTP connection open and Deno has no SMTP client worth
// depending on.
//
// Supabase's built-in mailer is not used for these: it is rate-limited to
// a handful an hour and sends from a shared domain that lands in spam,
// which for a delivery notification means the client never learns their
// files are ready.
//
// A missing key is a no-op, logged, never a throw. These calls sit at the
// end of flows that have already taken a payment or produced a
// deliverable: an order must not fail because a mail server did. Same
// reasoning for swallowing a non-2xx -- the email is a courtesy on top of
// the dashboard and the Telegram message, not the delivery itself.
const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY') ?? '';
const BREVO_API = 'https://api.brevo.com/v3/smtp/email';

const SENDER = { name: 'AgenticCore Click', email: 'hello@agenticcore.click' };

export async function sendEmail(to: string, email: Email): Promise<boolean> {
  if (!BREVO_API_KEY) {
    console.log(`email skipped (BREVO_API_KEY not set): "${email.subject}" -> ${to}`);
    return false;
  }
  if (!to.includes('@')) {
    console.error(`email skipped (not an address): ${to}`);
    return false;
  }

  try {
    const resp = await fetch(BREVO_API, {
      method: 'POST',
      headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        sender: SENDER,
        to: [{ email: to }],
        subject: email.subject,
        htmlContent: email.html,
        textContent: email.text
      })
    });
    if (!resp.ok) {
      // The body, not just the status. A 400 from Brevo names the field it
      // rejected; without it every failure looks the same and the next
      // person debugging this starts from nothing.
      console.error(`Brevo send failed (${resp.status}) for "${email.subject}":`, await resp.text().catch(() => ''));
      return false;
    }
    return true;
  } catch (err) {
    console.error(`Brevo send threw for "${email.subject}":`, err);
    return false;
  }
}

// The address Supabase Auth holds for a user. Workers run as the service
// role and only ever have a user_id, so every email path needs this. The
// address deliberately lives in auth.users and nowhere else -- a second
// copy on a profile row is a second thing to keep in step with a change
// of email, and the one that goes stale is always the copy.
export async function emailForUser(userId: string): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (error || !data?.user?.email) return null;
    return data.user.email;
  } catch (err) {
    console.error(`emailForUser failed for ${userId}:`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Queueing. Call sites use these, never sendEmail directly.
//
// An insert is cheap, cannot fail the flow it is part of, and is retried by
// the sweep if Brevo is down -- none of which is true of a fetch() at the
// end of a worker. See migration 0028 for the rest of the reasoning.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

export type EmailKind = 'welcome' | 'order_placed' | 'order_delivered' | 'topup';

/**
 * Queues an email and nudges the sweep.
 *
 * Never throws and never returns a failure the caller has to handle: an
 * order is not less complete because its receipt did not queue, and a
 * worker that has just produced a deliverable must not fail after the fact.
 * A dropped row is visible in the logs and in email_outbox; a thrown error
 * here would be visible as a broken order.
 */
export async function queueEmail(
  toEmail: string,
  kind: EmailKind,
  payload: Record<string, unknown> = {}
): Promise<void> {
  if (!toEmail || !toEmail.includes('@')) {
    console.error(`queueEmail(${kind}) skipped -- no usable address`);
    return;
  }
  const { error } = await supabaseAdmin.from('email_outbox').insert({ to_email: toEmail, kind, payload });
  if (error) {
    console.error(`queueEmail(${kind}) failed for ${toEmail}:`, error);
    return;
  }
  nudgeEmailSweep();
}

/** Same, for the common case where the caller has a user id and no address. */
export async function queueEmailForUser(
  userId: string,
  kind: EmailKind,
  payload: Record<string, unknown> = {}
): Promise<void> {
  const address = await emailForUser(userId);
  if (!address) {
    console.error(`queueEmail(${kind}) skipped -- no address on record for ${userId}`);
    return;
  }
  await queueEmail(address, kind, payload);
}

// Fire-and-forget, exactly like triggerDispatch: the cron sweep runs every
// minute regardless, so this only decides whether a client hears about
// their delivery now or shortly. Never awaited.
export function nudgeEmailSweep(): void {
  fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' }
  }).catch((err) => console.error('nudgeEmailSweep failed', err));
}
