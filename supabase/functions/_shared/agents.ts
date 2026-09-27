// Reading and writing which agent handles what.
//
// The decision itself is in agentRouting.ts, which has no imports so it can
// be tested; this half is the database it reads from.

import { supabaseAdmin } from './storage.ts';

export { chooseAgent, GROKBOT_AGENT, type RoutingInputs, type RoutingChoice } from './agentRouting.ts';

export function externalEnabled(): boolean {
  return (Deno.env.get('GROKBOT_ENABLED') ?? '').trim().toLowerCase() === 'true';
}

/** The route the owner set for a product, if any. */
export async function routeForSku(sku: number | null | undefined): Promise<string | null> {
  if (sku == null) return null;
  const { data, error } = await supabaseAdmin.from('agent_routes').select('agent').eq('sku', sku).maybeSingle();
  if (error) {
    // A routing table we cannot read must not send work outside by accident,
    // and must not stop work either: fall through to the built-in worker.
    console.error('agents: could not read agent_routes', error);
    return null;
  }
  return data?.agent ?? null;
}

export async function setRoute(sku: number, agent: string, setBy: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('agent_routes')
    .upsert({ sku, agent, set_by: setBy, created_at: new Date().toISOString() });
  if (error) throw new Error(`Could not assign product ${sku}: ${error.message}`);
}

export async function clearRoute(sku: number): Promise<boolean> {
  const { error, count } = await supabaseAdmin
    .from('agent_routes')
    .delete({ count: 'exact' })
    .eq('sku', sku);
  if (error) throw new Error(`Could not unassign product ${sku}: ${error.message}`);
  return (count ?? 0) > 0;
}

export async function listRoutes(): Promise<{ sku: number; agent: string }[]> {
  const { data } = await supabaseAdmin.from('agent_routes').select('sku, agent').order('sku');
  return (data as { sku: number; agent: string }[] | null) ?? [];
}
