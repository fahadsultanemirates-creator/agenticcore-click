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

/**
 * The public fallbacks. A fallback, not a foundation.
 *
 * BNB Chain's own documentation says eth_getLogs is DISABLED on the
 * public mainnet dataseeds -- not rate-limited, not served, and
 * "-32005 limit exceeded" is how they say no. .agency learned this the
 * expensive way: a client paid, three dataseeds refused the read, and the
 * payment sat on-chain unnoticed while they watched a spinner.
 *
 * So the order matters. The hosts that actually serve eth_getLogs come
 * first; the dataseeds stay behind them because they are perfectly good
 * for the cheap calls -- eth_blockNumber, and the two eth_calls that
 * verify the contract -- and cost nothing to try.
 *
 * The durable answer is a provider endpoint in BSC_RPC_URL.
 */
const PUBLIC_HOSTS = [
  // Serve eth_getLogs.
  'https://binance.llamarpc.com',
  'https://bsc.drpc.org',
  'https://bsc.publicnode.com',
  // Do not serve eth_getLogs, but answer everything else.
  'https://bsc-dataseed.bnbchain.org',
  'https://bsc-dataseed1.bnbchain.org',
  'https://bsc-dataseed.binance.org',
  'https://bsc-dataseed1.defibit.io',
  'https://bsc-dataseed1.ninicoin.io'
];

/** Cheap shape check, so a bare API key never becomes the only host. */
export function looksLikeHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Where every on-chain read goes, best first.
 *
 * Read when used rather than at module scope: an env read at import time
 * makes the whole module unloadable outside Deno, so the pure decoders
 * below -- the part most worth testing -- could not be tested at all.
 *
 * BSC_RPC_URL is comma-separated, so a provider endpoint can lead and the
 * public nodes still back it up. The public list is ALWAYS appended
 * rather than replaced: on .agency, returning only what was configured
 * meant a bare API key pasted into that field became the only host, every
 * call failed, and payments went off entirely. One dashboard typo should
 * degrade us, not stop us.
 */
function rpcHosts(): string[] {
  const configured = Deno.env.get('BSC_RPC_URL');
  if (configured) {
    const entries = configured.split(',').map((h) => h.trim()).filter(Boolean);
    const usable = entries.filter(looksLikeHttpUrl);
    if (usable.length > 0) return [...usable, ...PUBLIC_HOSTS];

    console.error(
      `BSC_RPC_URL is set but holds no usable http(s) URL (${entries.length} value(s)). ` +
        'Falling back to public nodes, which do NOT serve eth_getLogs. ' +
        'It must be the full endpoint URL from your provider, not the bare API key.'
    );
  }
  return PUBLIC_HOSTS;
}

/**
 * A host, safe to put in an error message.
 *
 * A provider endpoint carries its API key in the path, and every failure
 * in this file names the host it came from -- which is what makes these
 * errors worth reading, and also what publishes the credential. usdt-check
 * puts this detail in an HTTP response and needs no JWT to be called, so
 * an unredacted host is a key served to anyone who asks. Found on .agency
 * the first time a key was configured.
 */
export function safeHost(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return '<malformed BSC_RPC_URL>';
  }
}

/**
 * The last word before an error leaves this file.
 *
 * safeHost covers what we interpolate. It does not cover what the runtime
 * says: fetch throws "Invalid URL: '<the whole value>'", quoted straight
 * into the problem list. Two guards that fail independently, because a
 * single miss here is a published credential.
 */
function scrubSecrets(message: string): string {
  let out = message;
  for (const host of rpcHosts()) {
    if (!host) continue;
    out = out.split(host).join(safeHost(host));
  }
  return out;
}

/** One eth_call against the first node that answers. */
async function ethCall(to: string, data: string): Promise<string> {
  const problems: string[] = [];

  for (const host of rpcHosts()) {
    try {
      const resp = await fetch(host, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_call',
          params: [{ to, data }, 'latest']
        }),
        signal: AbortSignal.timeout(10_000)
      });
      if (!resp.ok) {
        problems.push(`${safeHost(host)} returned ${resp.status}`);
        continue;
      }
      const body = await resp.json();
      const result = (body as { result?: unknown })?.result;
      if (typeof result === 'string' && result.startsWith('0x')) return result;

      // Whatever it is, say what it is. "Could not read decimals()" on its
      // own cost a round trip because it named the field and not the
      // answer.
      problems.push(`${safeHost(host)} answered ${JSON.stringify(body).slice(0, 160)}`);
    } catch (err) {
      problems.push(`${safeHost(host)} did not answer (${err instanceof Error ? err.message : String(err)})`);
    }
  }

  // Every host, not just the last. Keeping only the most recent failure
  // hid the real reason behind whichever host happened to be tried last,
  // which is how a dead fallback masked the live one.
  throw new Error(scrubSecrets(problems.join(' | ')) || 'No BNB Smart Chain node answered');
}

/** One JSON-RPC call against the first node that answers. */
async function rpc(method: string, params: unknown[]): Promise<unknown> {
  const problems: string[] = [];

  for (const host of rpcHosts()) {
    try {
      const resp = await fetch(host, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: AbortSignal.timeout(10_000)
      });
      if (!resp.ok) {
        problems.push(`${safeHost(host)} returned ${resp.status}`);
        continue;
      }
      const body = await resp.json() as { result?: unknown; error?: unknown };
      if (body?.error) {
        problems.push(`${safeHost(host)}: ${JSON.stringify(body.error).slice(0, 160)}`);
        continue;
      }
      if (body?.result !== undefined) return body.result;
      problems.push(`${safeHost(host)} answered ${JSON.stringify(body).slice(0, 160)}`);
    } catch (err) {
      problems.push(`${safeHost(host)} did not answer (${err instanceof Error ? err.message : String(err)})`);
    }
  }

  throw new Error(scrubSecrets(problems.join(' | ')) || `No node answered ${method}`);
}

/**
 * Nothing left to configure.
 *
 * This checked for a block explorer API key. There is no explorer any
 * more: the contract read and the transfer list are both plain RPC calls
 * against public nodes. Kept as a function because the callers read better
 * for asking, and because BSC_RPC_URL may one day point somewhere that
 * does need a credential.
 */
export function chainConfigured(): boolean {
  return rpcHosts().length > 0;
}

/**
 * Confirms the contract is the token we think it is.
 *
 * Returns its decimals, which the caller needs anyway -- USDT is 6 decimals
 * on Ethereum and Tron and 18 here, and reading it rather than assuming is
 * the difference between matching every payment and matching none.
 */
let verifiedContract: { decimals: number; symbol: string } | null = null;

export async function verifyContract(): Promise<{ decimals: number; symbol: string }> {
  // Cached for the life of the function instance.
  //
  // symbol() and decimals() are immutable on a deployed contract, so
  // re-reading them every minute is two RPC calls spent re-confirming
  // something that cannot have changed. On .agency those two were a third
  // of the budget that got every public node to refuse us, which is how a
  // paid invoice went undetected. A cold start still checks, which is the
  // whole point of the check: never match payments against a lookalike.
  if (verifiedContract) return verifiedContract;

  // eth_call selectors: decimals() and symbol().
  const [decimalsHex, symbolHex] = await Promise.all([
    ethCall(USDT_CONTRACT, '0x313ce567'),
    ethCall(USDT_CONTRACT, '0x95d89b41')
  ]);

  const decimals = Number(BigInt(decimalsHex));
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    throw new Error(`USDT contract reported an implausible decimals value: ${decimals}`);
  }

  const symbol = decodeStringResult(symbolHex);
  if (!EXPECTED_SYMBOLS.includes(symbol.toUpperCase())) {
    throw new Error(
      `Contract ${USDT_CONTRACT} reports symbol "${symbol}", which is not USDT. Refusing to match payments against it.`
    );
  }

  verifiedContract = { decimals, symbol };
  return verifiedContract;
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

/**
 * Transfer events are logs, and logs are a standard RPC read.
 *
 * This went through a block explorer first, on the reasoning that listing
 * every transfer to an address needs an indexer. It does -- for all time.
 * It does not for the last hour, which is all this ever needs: an invoice
 * expires in sixty minutes, so a payment older than that belongs to no
 * open invoice and reading further back only costs time.
 *
 * Narrowing the question that way removes the explorer, its API key, and
 * everything that went with it -- a v2 proxy module that would not serve
 * eth_call, a BscScan host that now answers HTML, and a key whose refusal
 * arrived as HTTP 200.
 */

/** keccak256("Transfer(address,address,uint256)"). */
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

/**
 * How long an invoice stays payable.
 *
 * Long enough to open a wallet, find the address and send; short enough
 * that an abandoned invoice gives its amount back rather than holding a
 * nonce forever. An expired invoice is not a lost payment -- money that
 * arrives late still appears in the sweep and is reported.
 *
 * It lives HERE, in the module with no network imports, rather than in
 * usdtInvoice where it was: the scan window below is derived from it, and
 * two copies of the same number in two files is how the window came to be
 * sized for an invoice length that no longer applied. usdtInvoice imports
 * it from here now, so there is one of it.
 */
export const INVOICE_MINUTES = 60;

/**
 * The fastest BNB has ever mined, in seconds.
 *
 * Deliberately the FASTEST rather than the typical: this number only ever
 * divides into a block count, so guessing high gives a window that is too
 * short, which is the failure that loses payments. Guessing low gives one
 * that is merely wider than it needs to be.
 */
const FASTEST_BLOCK_SECONDS = 0.5;

/**
 * How far back a scan reaches when it has nothing better to go on.
 *
 * This was 1500 blocks, described as "~75 minutes at BNB's three-second
 * blocks" and "comfortably past the sixty-minute invoice window". Both
 * halves of that stopped being true: since the Lorentz upgrade BNB mines
 * at roughly 0.75 seconds, so 1500 blocks is under twenty minutes. An
 * invoice payable for an hour was being matched against a twenty-minute
 * window, and a payment that landed later than that was never looked at
 * -- not reported, not refunded, invisible until the client complained.
 *
 * Derived now rather than asserted, so it cannot silently rot again the
 * next time the chain speeds up: the invoice window divided by the
 * fastest block time it could ever be mined at.
 */
const LOOKBACK_BLOCKS = Math.ceil((INVOICE_MINUTES * 60) / FASTEST_BLOCK_SECONDS);

/** Exported for the test that holds the derivation honest. */
export function lookbackBlocks(): number {
  return LOOKBACK_BLOCKS;
}

/**
 * Blocks per eth_getLogs call. Public nodes refuse wide ranges and do not
 * agree on where the limit is; 1000 is inside all of their defaults.
 */
export const MAX_RANGE_BLOCKS = 1000;

/**
 * The ranges one scan will ask the node for.
 *
 * Pure, and exported for its own tests: an off-by-one here either rescans
 * a block forever or skips one, and a skipped block is a payment nobody
 * sees.
 */
export function chunkRanges(fromBlock: bigint, head: bigint, rangeSize = MAX_RANGE_BLOCKS): Array<{ from: bigint; to: bigint }> {
  if (fromBlock > head) return [];
  const ranges: Array<{ from: bigint; to: bigint }> = [];
  let cursor = fromBlock < 0n ? 0n : fromBlock;
  while (cursor <= head) {
    const to = cursor + BigInt(rangeSize) - 1n;
    ranges.push({ from: cursor, to: to > head ? head : to });
    cursor = to + 1n;
  }
  return ranges;
}

/**
 * Where a scan should start.
 *
 * Bounded at BOTH ends, and the asymmetry matters. There is no cursor
 * here -- unlike .agency, every sweep re-reads the whole window -- so the
 * scan must always run right up to the head or new payments are never
 * seen. That means the ceiling has to clamp the START of the window, not
 * the number of chunks: stopping early would leave the head unscanned.
 *
 * The floor is the oldest invoice still waiting for money, because every
 * invoice is bounded by its own from_block and the matcher ignores
 * anything earlier. Scanning before it is work that cannot settle
 * anything, which is precisely what stalled .agency's first real order.
 */
export function scanStart(opts: {
  /** Opening height of the oldest unpaid invoice, if any has one. */
  oldestPendingBlock: bigint | null;
  head: bigint;
}): bigint {
  const floor = opts.head > BigInt(LOOKBACK_BLOCKS) ? opts.head - BigInt(LOOKBACK_BLOCKS) : 0n;
  if (opts.oldestPendingBlock === null) return floor;
  // The invoice wins while it is inside the window. Past that it has
  // expired anyway, and honouring it would mean an unbounded scan.
  return opts.oldestPendingBlock > floor ? opts.oldestPendingBlock : floor;
}

/** An address as a 32-byte log topic. */
function addressTopic(address: string): string {
  return '0x' + address.toLowerCase().replace(/^0x/, '').padStart(64, '0');
}

/** A 32-byte topic back to an address. */
function topicAddress(topic: string): string {
  return '0x' + topic.replace(/^0x/, '').slice(-40);
}

/** The current chain height, recorded on an invoice when it is opened. */
export async function currentBlock(): Promise<bigint> {
  const headHex = await rpc('eth_blockNumber', []);
  if (typeof headHex !== 'string') throw new Error(`eth_blockNumber returned ${JSON.stringify(headHex)}`);
  return BigInt(headHex);
}

/**
 * The USDT transfers into our receiving address that could still settle
 * an open invoice.
 *
 * `oldestPendingBlock` is the opening height of the oldest invoice still
 * waiting to be paid. Passing it narrows the scan to exactly the window
 * those invoices need -- usually a minute or two of blocks rather than
 * the whole lookback -- which is most of why this stays inside what a
 * free node will serve. Omitting it falls back to the full window.
 *
 * Chunked, because public nodes cap the range of a single eth_getLogs and
 * the window is now wide enough to exceed that cap.
 */
export async function recentTransfers(oldestPendingBlock: bigint | null = null): Promise<Transfer[]> {
  const head = await currentBlock();
  const from = scanStart({ oldestPendingBlock, head });

  const transfers: Transfer[] = [];

  for (const range of chunkRanges(from, head)) {
    const logs = await rpc('eth_getLogs', [
      {
        address: USDT_CONTRACT,
        fromBlock: '0x' + range.from.toString(16),
        toBlock: '0x' + range.to.toString(16),
        // [event, from (any), to (us)]. Filtering on the recipient at the
        // node means it returns our transfers rather than every USDT
        // movement on the chain.
        topics: [TRANSFER_TOPIC, null, addressTopic(RECEIVING_ADDRESS)]
      }
    ]);

    if (!Array.isArray(logs)) throw new Error(`eth_getLogs returned ${JSON.stringify(logs).slice(0, 200)}`);

    for (const raw of logs) {
      const transfer = toLogTransfer(raw as Record<string, unknown>, head);
      if (transfer) transfers.push(transfer);
    }
  }

  return transfers;
}

/**
 * One log row into the shape the matcher wants.
 *
 * Exported for its own tests: confirmations are derived here, and a
 * transfer credited one block deep is the difference between a payment and
 * a reorg.
 */
export function toLogTransfer(log: Record<string, unknown>, head: bigint): Transfer | null {
  const txHash = typeof log.transactionHash === 'string' ? log.transactionHash : null;
  const data = typeof log.data === 'string' ? log.data : null;
  const topics = Array.isArray(log.topics) ? (log.topics as string[]) : null;
  const blockHex = typeof log.blockNumber === 'string' ? log.blockNumber : null;
  if (!txHash || !data || !topics || topics.length < 3 || !blockHex) return null;

  let valueRaw: string;
  let confirmations: number;
  try {
    valueRaw = BigInt(data).toString();
    const block = BigInt(blockHex);
    // A pending log, or a head that has not caught up, counts as zero
    // rather than as plenty.
    confirmations = head >= block ? Number(head - block) + 1 : 0;
  } catch {
    return null;
  }

  return {
    txHash,
    from: topicAddress(topics[1]),
    to: topicAddress(topics[2]),
    valueRaw,
    confirmations,
    blockNumber: BigInt(blockHex)
  };
}
