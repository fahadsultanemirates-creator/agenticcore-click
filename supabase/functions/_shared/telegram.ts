const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
const OWNER_TELEGRAM_ID = Deno.env.get('OWNER_TELEGRAM_ID') || undefined;

// Best-effort owner ping for things a worker can't resolve on its own
// (no-avatar video needing manual production, a hard failure worth a
// heads-up). Never throws -- a missing/invalid Telegram config shouldn't
// take down the worker that's trying to report something.
export async function notifyOwner(text: string): Promise<void> {
  if (!OWNER_TELEGRAM_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: OWNER_TELEGRAM_ID, text })
    });
  } catch (err) {
    console.error('notifyOwner failed', err);
  }
}
