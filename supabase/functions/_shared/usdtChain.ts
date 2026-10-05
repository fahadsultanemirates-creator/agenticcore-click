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
 * Plain BNB Smart Chain nodes. Everything on-chain goes through these.
 *
 * Read when used rather than at module scope: an env read at import time
 * makes the whole module unloadable outside Deno, so the pure decoders
 * below -- the part most worth testing -- could not be tested at all.
 *
 * decimals() and symbol() are an ordinary eth_call, which every node
 * serves for free. Going through the block explorer's proxy module meant
 * the read inherited that API's key handling and its multichain routing,
 * and the first live check failed there -- the explorer answered, it was
 * not refusing the key, and what came back still was not hex.
 *
 * The explorer is still used for the transfer list, because listing every
 * token transfer to an address genuinely needs an indexer. Reading a
 * constant off a contract does not.
 */
function rpcHosts(): string[] {
  const configured = Deno.env.get('BSC_RPC_URL');
  if (configured) return [configured];
  return [
    'https://bsc-dataseed.binance.org',
    'https://bsc-dataseed1.defibit.io',
    'https://bsc-rpc.publicnode.com'
  ];
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
        problems.push(`${host} returned ${resp.status}`);
        continue;
      }
      const body = await resp.json();
      const result = (body as { result?: unknown })?.result;
      if (typeof result === 'string' && result.startsWith('0x')) return result;

      // Whatever it is, say what it is. "Could not read decimals()" on its
      // own cost a round trip because it named the field and not the
      // answer.
      problems.push(`${host} answered ${JSON.stringify(body).slice(0, 160)}`);
    } catch (err) {
      problems.push(`${host} did not answer (${err instanceof Error ? err.message : String(err)})`);
    }
  }

  // Every host, not just the last. Keeping only the most recent failure
  // hid the real reason behind whichever host happened to be tried last,
  // which is how a dead fallback masked the live one.
  throw new Error(problems.join(' | ') || 'No BNB Smart Chain node answered');
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
        problems.push(`${host} returned ${resp.status}`);
        continue;
      }
      const body = await resp.json() as { result?: unknown; error?: unknown };
      if (body?.error) {
        problems.push(`${host}: ${JSON.stringify(body.error).slice(0, 160)}`);
        continue;
      }
      if (body?.result !== undefined) return body.result;
      problems.push(`${host} answered ${JSON.stringify(body).slice(0, 160)}`);
    } catch (err) {
      problems.push(`${host} did not answer (${err instanceof Error ? err.message : String(err)})`);
    }
  }

  throw new Error(problems.join(' | ') || `No node answered ${method}`);
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
export async function verifyContract(): Promise<{ decimals: number; symbol: string }> {
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
 * How far back to look: ~75 minutes at BNB's three-second blocks.
 *
 * Comfortably past the sixty-minute invoice window, and small enough that
 * public nodes -- which cap eth_getLogs ranges -- will serve it.
 */
const LOOKBACK_BLOCKS = 1500;

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

/** The recent USDT transfers into our receiving address. */
export async function recentTransfers(): Promise<Transfer[]> {
  const headHex = await rpc('eth_blockNumber', []);
  if (typeof headHex !== 'string') throw new Error(`eth_blockNumber returned ${JSON.stringify(headHex)}`);
  const head = BigInt(headHex);
  const from = head > BigInt(LOOKBACK_BLOCKS) ? head - BigInt(LOOKBACK_BLOCKS) : 0n;

  const logs = await rpc('eth_getLogs', [
    {
      address: USDT_CONTRACT,
      fromBlock: '0x' + from.toString(16),
      toBlock: 'latest',
      // [event, from (any), to (us)]. Filtering on the recipient at the
      // node means it returns our transfers rather than every USDT
      // movement on the chain.
      topics: [TRANSFER_TOPIC, null, addressTopic(RECEIVING_ADDRESS)]
    }
  ]);

  if (!Array.isArray(logs)) throw new Error(`eth_getLogs returned ${JSON.stringify(logs).slice(0, 200)}`);

  return logs
    .map((raw) => toLogTransfer(raw as Record<string, unknown>, head))
    .filter((t): t is Transfer => t !== null);
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
