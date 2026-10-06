// Opening a USDT invoice, independent of who asked for one.
//
// Extracted from the usdt-invoice function so the Telegram bot can open
// one directly. A client who signed up in the chat has no website
// password yet, so "go to the dashboard and top up" is a dead end for
// exactly the people most likely to be ordering from the chat.
//
// The nonce logic, the chain-height bound and the contract check are
// subtle enough that a second copy of them in the bot would be a second
// place for a payment to go unattributed.
import { allocateNonce, invoiceAmount, MAX_NONCE } from './usdtAmount.ts';
import { currentBlock, RECEIVING_ADDRESS, USDT_CONTRACT, verifyContract } from './usdtChain.ts';
import { supabaseAdmin } from './storage.ts';

// Mirrors src/data/packages.ts, kept in sync by hand since the frontend is
// a static SPA with no shared build step with these functions. The dollars
// credited, not a credit system with a bonus.
export const WALLET_TIERS: Record<string, number> = {
  'wallet-10': 10,
  'wallet-30': 30,
  'wallet-100': 100,
  'wallet-200': 200
};

/** "30" or 30 -> "wallet-30". Null for anything we do not sell. */
export function tierForAmount(amountUsd: number): string | null {
  const key = `wallet-${Math.round(amountUsd)}`;
  return key in WALLET_TIERS ? key : null;
}

/**
 * How long an invoice stays payable.
 *
 * Long enough to open a wallet, find the address and send; short enough
 * that an abandoned invoice gives its amount back rather than holding a
 * nonce forever. An expired invoice is not a lost payment -- money that
 * arrives late still appears in the sweep and is reported.
 */
export const INVOICE_MINUTES = 60;

export interface OpenInvoice {
  invoiceId: string;
  amount: string;
  address: string;
  contract: string;
  network: string;
  decimals: number;
  creditUsd: number;
  expiresAt: string;
}

export type InvoiceResult =
  | { ok: true; invoice: OpenInvoice }
  | { ok: false; status: number; error: string; detail?: string };

export async function createUsdtInvoice(userId: string, tier: string): Promise<InvoiceResult> {
  const baseUsd = WALLET_TIERS[tier];
  if (baseUsd === undefined) {
    return { ok: false, status: 400, error: 'Unknown top-up amount.' };
  }

  // Before anything is quoted, confirm the contract we will watch really is
  // USDT. Watching a lookalike would credit somebody who paid in a
  // worthless token -- the one failure in this scheme that is not
  // fail-safe. Cheap, and it fails the request rather than the payment.
  let decimals: number;
  try {
    ({ decimals } = await verifyContract());
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error('createUsdtInvoice: contract verification failed', detail);
    return {
      ok: false,
      status: 503,
      error: 'Could not verify the payment token right now. Please try again shortly.',
      detail
    };
  }

  // The chain height now, so a payment mined before this invoice existed
  // can never settle it. Amounts are reused once an invoice closes, and
  // without this bound a slow payment for an expired invoice credits
  // whoever holds that amount next.
  let fromBlock: string;
  try {
    fromBlock = (await currentBlock()).toString();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error('createUsdtInvoice: could not read the chain height', detail);
    return { ok: false, status: 503, error: 'Could not reach the chain right now. Please try again shortly.', detail };
  }

  const expiresAt = new Date(Date.now() + INVOICE_MINUTES * 60_000).toISOString();

  // Nonce allocation reads the open invoices and then writes, so two
  // requests can read the same gap. The partial unique index on (amount)
  // where status = 'pending' is what actually prevents a collision; this
  // loop is how the loser of that race recovers.
  for (let attempt = 1; attempt <= 5; attempt++) {
    const { data: open, error: readError } = await supabaseAdmin
      .from('usdt_invoices')
      .select('nonce')
      .eq('status', 'pending')
      .eq('base_usd', baseUsd);

    if (readError) {
      console.error('createUsdtInvoice: could not read open invoices', readError);
      return { ok: false, status: 500, error: 'Could not open an invoice. Please try again.' };
    }

    let nonce: number;
    try {
      nonce = allocateNonce((open ?? []).map((row) => row.nonce as number));
    } catch {
      console.error(`createUsdtInvoice: all ${MAX_NONCE} nonces are in use at $${baseUsd}`);
      return { ok: false, status: 503, error: 'Too many payments in progress. Please try again in a few minutes.' };
    }

    const amount = invoiceAmount(baseUsd, nonce);

    const { data: invoice, error: insertError } = await supabaseAdmin
      .from('usdt_invoices')
      .insert({
        user_id: userId,
        base_usd: baseUsd,
        tier,
        amount,
        nonce,
        expires_at: expiresAt,
        from_block: fromBlock
      })
      .select('id, amount, expires_at')
      .single<{ id: string; amount: string; expires_at: string }>();

    if (!insertError && invoice) {
      return {
        ok: true,
        invoice: {
          invoiceId: invoice.id,
          // Everything the client needs to pay, and nothing they have to
          // work out: the exact amount matters more than the address, since
          // a near-miss on the amount is what cannot be attributed.
          amount: invoice.amount,
          address: RECEIVING_ADDRESS,
          contract: USDT_CONTRACT,
          network: 'BNB Smart Chain (BEP-20)',
          decimals,
          creditUsd: baseUsd,
          expiresAt: invoice.expires_at
        }
      };
    }

    // 23505 is unique_violation: somebody took this amount between the read
    // and the write. Try the next free nonce.
    if ((insertError as { code?: string } | null)?.code !== '23505') {
      console.error('createUsdtInvoice: insert failed', insertError);
      return { ok: false, status: 500, error: 'Could not open an invoice. Please try again.' };
    }
  }

  console.error('createUsdtInvoice: lost the nonce race five times running');
  return { ok: false, status: 503, error: 'Could not open an invoice. Please try again.' };
}
