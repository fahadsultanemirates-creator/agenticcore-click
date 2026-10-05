// Looks for the payment an invoice is waiting on, and credits it.
//
// Two callers, one path. The client's billing page polls it for a single
// invoice while somebody watches; pg_cron calls it with no body to sweep
// everything still pending, so a payment that lands after the client has
// closed the tab still credits.
//
// Crediting is an atomic RPC, not an update followed by a credit: a crash
// between those two leaves either money against an unpaid invoice or --
// the one a client reports -- a paid invoice whose money never arrived.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { jsonResponse, CORS_HEADERS } from '../_shared/cors.ts';
import { matchPayment } from '../_shared/usdtAmount.ts';
import {
  chainConfigured,
  MIN_CONFIRMATIONS,
  RECEIVING_ADDRESS,
  recentTransfers,
  verifyContract
} from '../_shared/usdtChain.ts';
import { notifyOwner } from '../_shared/telegram.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface InvoiceRow {
  id: string;
  user_id: string;
  amount: string;
  base_usd: number;
  status: string;
  /** Chain height when the invoice was opened; null for older rows. */
  from_block: string | null;
}

async function resolveCaller(authHeader: string): Promise<{ id: string } | null> {
  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } }
  });
  const { data, error } = await callerClient.auth.getUser();
  if (error || !data?.user) return null;
  return { id: data.user.id };
}

/**
 * Checks one invoice against a list of transfers already fetched.
 *
 * The transfer list is passed in rather than fetched per invoice so a sweep
 * of twenty pending invoices costs one call to the explorer instead of
 * twenty -- which also keeps us inside its rate limit.
 */
async function settle(
  invoice: InvoiceRow,
  transfers: Awaited<ReturnType<typeof recentTransfers>>,
  decimals: number,
  creditedHashes: string[]
): Promise<{ status: string; confirmations?: number; received?: string; txHash?: string }> {
  const result = matchPayment(transfers, {
    expected: invoice.amount,
    decimals,
    receivingAddress: RECEIVING_ADDRESS,
    minConfirmations: MIN_CONFIRMATIONS,
    alreadyCredited: creditedHashes,
    minBlock: invoice.from_block == null ? null : BigInt(invoice.from_block)
  });

  if (result.status === 'paid') {
    const { data: credited, error } = await supabaseAdmin.rpc('credit_usdt_invoice', {
      p_invoice_id: invoice.id,
      p_tx_hash: result.txHash
    });

    if (error) {
      console.error(`usdt-check: crediting ${invoice.id} failed`, error);
      return { status: 'pending' };
    }
    if (!credited) {
      // Somebody already credited it, or the hash belongs to another
      // invoice. Both mean "not ours to credit", and neither is an error.
      console.log(`usdt-check: ${invoice.id} was already settled`);
      return { status: 'paid', txHash: result.txHash };
    }

    // Who paid, for support. Separate from the credit on purpose: it is
    // an audit note, so a failure here must not undo money that is
    // already correctly credited.
    await supabaseAdmin
      .from('usdt_invoices')
      .update({ paid_from: result.from })
      .eq('id', invoice.id)
      .then(({ error }) => error && console.error('usdt-check: could not record the payer', error));

    await notifyOwner(
      `Wallet top-up confirmed — $${invoice.base_usd} credited.\n\n` +
        `Paid ${invoice.amount} USDT from ${result.from}, tx ${result.txHash}`
    ).catch(() => {});
    return { status: 'paid', txHash: result.txHash };
  }

  if (result.status === 'wrong_amount') {
    // Reported, never credited: the amount is the only thing identifying
    // the invoice, so money that arrived for a different one cannot be
    // attributed without a human looking at it.
    console.warn(`usdt-check: ${invoice.amount} expected, ${result.received} arrived (tx ${result.txHash})`);
    await notifyOwner(
      `A USDT payment arrived for the wrong amount and has NOT been credited.\n\n` +
        `Expected ${invoice.amount}, received ${result.received}.\n` +
        `From ${result.from}\nTransaction: ${result.txHash}`
    ).catch(() => {});
    return { status: 'wrong_amount', received: result.received };
  }

  if (result.status === 'confirming') {
    return { status: 'confirming', confirmations: result.confirmations };
  }

  return { status: 'pending' };
}

/** Hashes already attached to an invoice, so none is ever credited twice. */
async function creditedHashes(): Promise<string[]> {
  const { data } = await supabaseAdmin.from('usdt_invoices').select('tx_hash').not('tx_hash', 'is', null);
  return (data ?? []).map((row) => row.tx_hash as string);
}

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  if (!chainConfigured()) return jsonResponse({ error: 'Crypto payment is not configured.' }, 503);

  let body: { invoiceId?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // No body: the cron sweep.
  }
  const invoiceId = typeof body?.invoiceId === 'string' ? body.invoiceId : null;

  // Expire first, so an abandoned invoice gives its amount back and the
  // sweep below has less to do.
  await supabaseAdmin.rpc('expire_usdt_invoices').then(
    ({ error }) => error && console.error('usdt-check: expiry sweep failed', error)
  );

  let decimals: number;
  try {
    ({ decimals } = await verifyContract());
  } catch (err) {
    // The reason goes in the response, not only the log.
    //
    // "Could not verify the payment token" on its own sent us hunting
    // through log tables that this project does not expose, for a fault
    // that names itself in one line. Nothing here is sensitive: it
    // describes a public contract and a public API, and callApi is
    // careful never to put the request URL in an error, because the key
    // rides in its query string.
    const detail = err instanceof Error ? err.message : String(err);
    console.error('usdt-check: contract verification failed', detail);
    return jsonResponse({ error: 'Could not verify the payment token.', detail }, 503);
  }

  // ---- one invoice, for the client watching the page ------------------
  if (invoiceId) {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'Missing Authorization header' }, 401);
    const caller = await resolveCaller(authHeader);
    if (!caller) return jsonResponse({ error: 'Not authenticated' }, 401);

    const { data: invoice } = await supabaseAdmin
      .from('usdt_invoices')
      .select('id, user_id, amount, base_usd, status, from_block')
      .eq('id', invoiceId)
      .maybeSingle<InvoiceRow>();

    // Checked rather than relied on: this runs as the service role, which
    // bypasses RLS, so somebody else's invoice id would otherwise resolve.
    if (!invoice || invoice.user_id !== caller.id) {
      return jsonResponse({ error: 'No such invoice.' }, 404);
    }
    if (invoice.status !== 'pending') return jsonResponse({ status: invoice.status });

    let transfers;
    try {
      transfers = await recentTransfers();
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error('usdt-check: could not list transfers', detail);
      return jsonResponse({ error: 'Could not read the chain right now.', detail }, 503);
    }

    const outcome = await settle(invoice, transfers, decimals, await creditedHashes());
    return jsonResponse(outcome);
  }

  // ---- the sweep ------------------------------------------------------
  //
  // Unauthenticated on purpose. pg_cron calls it with the anon key, and
  // adding an internal-caller check here is exactly what took the four
  // cron jobs down once already. It is safe to leave open because it
  // cannot be made to do anything untrue: every credit is decided by what
  // is on the chain and guarded by the unique tx_hash, so the worst an
  // outsider can do by calling it is make us check sooner than we meant
  // to. The cost is explorer quota, which the `where exists` on the cron
  // schedule already keeps near zero when nothing is pending.
  const { data: pending } = await supabaseAdmin
    .from('usdt_invoices')
    .select('id, user_id, amount, base_usd, status, from_block')
    .eq('status', 'pending')
    .limit(50);

  if (!pending || pending.length === 0) return jsonResponse({ ok: true, checked: 0, paid: 0 });

  // One call to the explorer for the whole sweep.
  //
  // Wrapped, because an unhandled throw here is a bare 500 with the reason
  // only in a log this project does not expose -- which is exactly how the
  // contract read cost two round trips to diagnose.
  let transfers;
  try {
    transfers = await recentTransfers();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error('usdt-check: could not list transfers', detail);
    return jsonResponse({ error: 'Could not read the chain right now.', detail }, 503);
  }

  const credited = await creditedHashes();

  let paid = 0;
  for (const invoice of pending as InvoiceRow[]) {
    try {
      const outcome = await settle(invoice, transfers, decimals, credited);
      if (outcome.status === 'paid') {
        paid++;
        // Only the hash that settled THIS invoice. Adding every hash in
        // the batch -- which is what this did first -- would block every
        // later invoice in the same sweep from matching anything, so a
        // sweep could credit at most one payment per run.
        if (outcome.txHash) credited.push(outcome.txHash);
      }
    } catch (err) {
      console.error(`usdt-check: ${invoice.id} failed`, err);
    }
  }

  return jsonResponse({ ok: true, checked: pending.length, paid });
}

Deno.serve(handleRequest);
