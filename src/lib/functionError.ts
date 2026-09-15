import { FunctionsHttpError } from "@supabase/supabase-js";

// supabase-js turns ANY non-2xx Edge Function response into a
// FunctionsHttpError and sets `data` to null, so the function's own
// `{ error: "..." }` body never reached the caller -- every failure showed
// the generic fallback instead. That hid exactly the messages a client most
// needs to see: "Insufficient wallet balance. This costs $18.", "Could not
// price this request -- check the selected options.", "File is too large
// (15MB max)." The real Response is on error.context, so read the body back
// off it and use the server's own wording when there is one.
export async function functionErrorMessage(error: unknown, fallback: string): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      if (body && typeof body.error === "string" && body.error.trim()) {
        return body.error;
      }
    } catch {
      // Not a JSON body (a gateway timeout, an HTML error page) -- fall
      // through to the caller's fallback rather than surfacing raw markup.
    }
  }
  return fallback;
}
