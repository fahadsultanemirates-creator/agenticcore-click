// Reading BNB Smart Chain, through Etherscan's API rather than our own node.
//
// Two jobs: list the USDT transfers that arrived at our address, and prove
// the contract we are watching is actually USDT before we trust a single
// one of them.
//
// The second is not paranoia. Watching the wrong contract is the only
// failure here that is not fail-safe: a wrong address usually means no
// payments are ever seen, which is loud, but a LOOKALIKE token means
// somebody pays in a worthless coin and gets credited real work. So the
// contract's own symbol() and decimals() are read from the chain and
// checked before any invoice is matched against it.

import { type Transfer } from './usdtAmount.ts';

/**
 * Where the money goes. In code, not in a secret, on purpose.
 *
 * This address is public by nature -- it is printed on every invoice and
 * visible on-chain -- so there is no confidentiality to protect. What
 * matters is integrity, and that argues the other way: a dashboard secret
 * can be changed silently by anyone with access, and the receiving address
 * is exactly what an attacker would change. Here, redirecting the money
 * takes a commit with somebody's name on it.
 */
export const RECEIVING_ADDRESS = '0x62Ad7D55fbc8A8591109D72b67Ec63aa1EE196bC';

/**
 * USDT (BSC-USD) on BNB Smart Chain.
 *
 * Verified at runtime by verifyContract() rather than trusted from here --
 * see the note at the top of the file.
 */
export const USDT_CONTRACT = '0x55d398326f99059fF775485246999027B3197955';

/** What verifyContract() insists on before any payment is matched. */
const EXPECTED_SYMBOLS = ['USDT', 'BSC-USD', 'BSC-USDT'];

/**
 * Blocks to wait before crediting. BNB blocks are about three seconds, so
 * fifteen is roughly 45 seconds -- the "takes seconds, not minutes" the
 * whole scheme is for, with enough depth that a reorg of this size would
 * be a chain-wide event rather than an attack on one invoice.
 */
export const MIN_CONFIRMATIONS = 15;

// Read when used, not when imported.
//
// At module scope these ran the moment anything imported this file, which
// made the whole module unloadable outside Deno -- so the decoders below,
// which are pure and are the part most worth testing, could not be tested
// at all. It also meant a missing key failed at import time, taking the
// function down before it could say what was wrong.
function apiKey(): string {
  return Deno.env.get('BSCSCAN_API_KEY') ?? '';
}

/**
 * Where to ask. Tried in order until one gives a usable answer.
 *
 * Etherscan folded BscScan into a multichain V2 endpoint, but a key issued
 * by bscscan.com before that is not necessarily accepted there -- and an
 * unaccepted key does not come back as an auth error, it comes back as
 * {"result":"Invalid API Key"} in the same shape as a real answer. That is
 * what the first live check hit.
 *
 * Rather than make somebody guess which host their key belongs to, both
 * are tried and the one that works is logged. BSCSCAN_API_URL still pins
 * it to a single host when you want that.
 */
function apiHosts(): string[] {
  const configured = Deno.env.get('BSCSCAN_API_URL');
  if (configured) return [configured];
  return ['https://api.etherscan.io/v2/api', 'https://api.bscscan.com/api'];
}

const CHAIN_ID = '56';

export function chainConfigured(): boolean {
  return apiKey().length > 0;
}

/** A reply that is the explorer refusing us rather than answering. */
export function refusalReason(data: unknown): string | null {
  const result = (data as { result?: unknown })?.result;
  const message = (data as { message?: unknown })?.message;
  const text = `${typeof result === 'string' ? result : ''} ${typeof message === 'string' ? message : ''}`;
  if (/invalid api key|missing\/invalid api key|rate limit|max .* rate/i.test(text)) return text.trim();
  return null;
}

async function callApi(params: Record<string, string>): Promise<unknown> {
  let lastProblem = '';

  for (const host of apiHosts()) {
    const url = new URL(host);
    url.searchParams.set('chainid', CHAIN_ID);
    url.searchParams.set('apikey', apiKey());
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

    try {
      // Ten seconds. An explorer that accepts the connection and then goes
      // quiet would otherwise hold a worker open until the platform kills
      // the whole invocation.
      const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!resp.ok) {
        lastProblem = `${host} returned ${resp.status}`;
        continue;
      }
      const data = await resp.json();
      const refused = refusalReason(data);
      if (refused) {
        // Never the URL: it carries the API key in a query parameter.
        lastProblem = `${host} refused the key (${refused})`;
        continue;
      }
      return data;
    } catch (err) {
      lastProblem = `${host} did not answer (${err instanceof Error ? err.message : String(err)})`;
    }
  }

  throw new Error(lastProblem || 'No block explorer host answered');
}

/**
 * Confirms the contract is the token we think it is.
 *
 * Returns its decimals, which the caller needs anyway -- USDT is 6 decimals
 * on Ethereum and Tron and 18 here, and reading it rather than assuming is
 * the difference between matching every payment and matching none.
 */
export async function verifyContract(): Promise<{ decimals: number; symbol: string }> {
  // eth_call selectors: decimals() and symbol(), through the explorer's
  // proxy so this needs no second credential or RPC host.
  const [decimalsRes, symbolRes] = await Promise.all([
    callApi({ module: 'proxy', action: 'eth_call', to: USDT_CONTRACT, data: '0x313ce567', tag: 'latest' }),
    callApi({ module: 'proxy', action: 'eth_call', to: USDT_CONTRACT, data: '0x95d89b41', tag: 'latest' })
  ]);

  const decimalsHex = (decimalsRes as { result?: string })?.result;
  if (typeof decimalsHex !== 'string' || !decimalsHex.startsWith('0x')) {
    throw new Error('Could not read decimals() from the USDT contract');
  }
  const decimals = Number(BigInt(decimalsHex));
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    throw new Error(`USDT contract reported an implausible decimals value: ${decimals}`);
  }

  const symbol = decodeStringResult((symbolRes as { result?: string })?.result ?? '');
  if (!EXPECTED_SYMBOLS.includes(symbol.toUpperCase())) {
    throw new Error(
      `Contract ${USDT_CONTRACT} reports symbol "${symbol}", which is not USDT. Refusing to match payments against it.`
    );
  }

  return { decimals, symbol };
}

/**
 * An ABI-encoded string return value.
 *
 * Exported for its own tests: the layout (offset, length, then the bytes,
 * right-padded to a 32-byte boundary) is easy to get subtly wrong, and the
 * symbol check is only worth having if this is right.
 */
export function decodeStringResult(hex: string): string {
  const body = hex.replace(/^0x/, '');
  if (body.length < 128) return '';
  const length = Number(BigInt('0x' + body.slice(64, 128)));
  if (!Number.isInteger(length) || length <= 0 || length > 256) return '';
  const bytes = body.slice(128, 128 + length * 2);
  if (bytes.length < length * 2) return '';
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i++) out[i] = parseInt(bytes.slice(i * 2, i * 2 + 2), 16);
  return new TextDecoder().decode(out).replace(/\0+$/, '');
}

/** Parses one explorer row into the shape the matcher wants. */
export function toTransfer(row: Record<string, unknown>): Transfer | null {
  const txHash = typeof row.hash === 'string' ? row.hash : null;
  const to = typeof row.to === 'string' ? row.to : null;
  const valueRaw = typeof row.value === 'string' ? row.value : null;
  if (!txHash || !to || !valueRaw) return null;

  // Absent or unparseable confirmations read as zero rather than as "plenty".
  // Defaulting the other way would credit a transfer that is one block deep.
  const confirmations = Number(row.confirmations);
  return {
    txHash,
    to,
    valueRaw,
    confirmations: Number.isFinite(confirmations) && confirmations > 0 ? Math.floor(confirmations) : 0
  };
}

/** The most recent USDT transfers into our receiving address. */
export async function recentTransfers(limit = 100): Promise<Transfer[]> {
  const data = await callApi({
    module: 'account',
    action: 'tokentx',
    contractaddress: USDT_CONTRACT,
    address: RECEIVING_ADDRESS,
    page: '1',
    offset: String(limit),
    sort: 'desc'
  });

  const result = (data as { status?: string; message?: string; result?: unknown })?.result;

  // "No transactions found" comes back as status "0" with a string result,
  // which is a legitimate empty answer rather than a failure. Treating it as
  // an error would make a quiet day look like an outage.
  if (!Array.isArray(result)) {
    const message = (data as { message?: string })?.message ?? '';
    if (/no transactions found/i.test(message)) return [];
    throw new Error(`Block explorer did not return a transfer list: ${message || JSON.stringify(data).slice(0, 200)}`);
  }

  return result
    .map((row) => toTransfer(row as Record<string, unknown>))
    .filter((t): t is Transfer => t !== null);
}
