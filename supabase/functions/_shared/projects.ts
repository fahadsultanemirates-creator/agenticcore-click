// Finding or making the project an order belongs to.
//
// Called from placeOrder, which means it runs after the wallet has been
// debited. Nothing here may throw and nothing here may fail the order:
// every path returns a project id or null, and null simply means the task
// is created unattached. A client would rather have their logo in a loose
// row than not have it.
import { supabaseAdmin } from './storage.ts';
import { projectNameFrom } from './projectName.ts';

/**
 * The project this order joins.
 *
 * `requestedId` is checked against the caller's own user id before it is
 * trusted. It arrives from a browser, and a project id is the one handle
 * that could otherwise file somebody's paid order into a stranger's
 * workspace -- or, read back, show them its contents.
 */
export async function resolveProjectId(opts: {
  userId: string;
  requestedId?: string | null;
  productName: string;
  payload: Record<string, unknown>;
}): Promise<string | null> {
  const { userId, requestedId, productName, payload } = opts;

  if (requestedId) {
    const { data, error } = await supabaseAdmin
      .from('projects')
      .select('id')
      .eq('id', requestedId)
      .eq('user_id', userId)
      .maybeSingle<{ id: string }>();

    if (error) console.error('resolveProjectId: lookup failed', error);
    if (data?.id) {
      // Touched so the list sorts by real activity rather than by when
      // somebody happened to create the folder.
      await supabaseAdmin
        .from('projects')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', data.id)
        .then(({ error: touchError }) => {
          if (touchError) console.error('resolveProjectId: touch failed', touchError);
        });
      return data.id;
    }
    // A requested project that is not theirs is not a reason to refuse the
    // order; it is a reason to give the order its own project.
    console.error(`resolveProjectId: ${userId} asked for project ${requestedId}, which is not theirs`);
  }

  const { data, error } = await supabaseAdmin
    .from('projects')
    .insert({ user_id: userId, name: projectNameFrom(productName, payload) })
    .select('id')
    .single<{ id: string }>();

  if (error || !data) {
    console.error('resolveProjectId: could not create a project', error);
    return null;
  }
  return data.id;
}
