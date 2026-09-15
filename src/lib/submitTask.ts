import { functionErrorMessage } from "./functionError";
import { supabase } from "./supabase";

export type SubmitTaskResult =
  | { ok: true; publicId: string; priceUsd: number }
  | { ok: false; error: string };

// Shared by every service page's submit button -- calls the real
// submit-task function (price computed and wallet debited server-side,
// never trusted from the client) instead of the old local-only "submitted"
// mock state.
export async function submitTask(
  type: string,
  payload: Record<string, unknown>,
  subtype?: string,
): Promise<SubmitTaskResult> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    return { ok: false, error: "Your session expired — please log in again." };
  }

  const { data, error } = await supabase.functions.invoke<{
    publicId?: string;
    priceUsd?: number;
    error?: string;
  }>("submit-task", {
    body: { type, payload, subtype },
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (error || !data) {
    console.error("submit-task failed:", error);
    // The function's own message (insufficient balance, unpriceable
    // options) lives on the error's Response, not in `data`.
    return {
      ok: false,
      error: await functionErrorMessage(error, "Could not submit this request. Please try again."),
    };
  }
  if (data.error) {
    return { ok: false, error: data.error };
  }
  if (!data.publicId || typeof data.priceUsd !== "number") {
    return { ok: false, error: "Unexpected response from the server." };
  }

  return { ok: true, publicId: data.publicId, priceUsd: data.priceUsd };
}
