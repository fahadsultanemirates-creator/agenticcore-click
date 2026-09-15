import { supabase } from "./supabase";

export interface CatalogOption {
  id: string;
  kind: "avatar" | "voice";
  provider_id: string;
  name: string;
  gender: string | null;
  language: string | null;
  preview_url: string | null;
}

export interface ClientAvatar {
  id: string;
  kind: "avatar" | "voice";
  name: string;
  status: "pending" | "ready" | "failed";
  provider_id: string | null;
  preview_url: string | null;
  failure_reason: string | null;
}

export async function fetchCatalog(kind: "avatar" | "voice"): Promise<CatalogOption[]> {
  const { data, error } = await supabase
    .from("catalog_options")
    .select("*")
    .eq("kind", kind)
    .eq("active", true)
    .order("sort_order", { ascending: true });
  if (error) {
    console.error("fetchCatalog failed:", error);
    return [];
  }
  return data ?? [];
}

export async function fetchMyAvatars(kind: "avatar" | "voice"): Promise<ClientAvatar[]> {
  const { data, error } = await supabase
    .from("client_avatars")
    .select("*")
    .eq("kind", kind)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("fetchMyAvatars failed:", error);
    return [];
  }
  return data ?? [];
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Your session expired — please log in again.");
  return { Authorization: `Bearer ${token}` };
}

export async function createCustomAvatar(
  file: File,
  name: string,
): Promise<{ ok: true; id: string; providerId: string } | { ok: false; error: string }> {
  try {
    const headers = await authHeader();
    const form = new FormData();
    form.set("photo", file);
    form.set("name", name);
    const { data, error } = await supabase.functions.invoke<{ error?: string; id?: string; providerId?: string }>(
      "create-custom-avatar",
      { body: form, headers },
    );
    if (error) return { ok: false, error: "Could not create the avatar. Please try again." };
    if (data?.error) return { ok: false, error: data.error };
    if (!data?.id || !data?.providerId) return { ok: false, error: "Unexpected response from the server." };
    return { ok: true, id: data.id, providerId: data.providerId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not create the avatar." };
  }
}

export async function createCustomVoice(
  file: File,
  name: string,
  consent: boolean,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const headers = await authHeader();
    const form = new FormData();
    form.set("audio", file);
    form.set("name", name);
    form.set("consent", consent ? "true" : "false");
    const { data, error } = await supabase.functions.invoke<{ error?: string; id?: string }>("create-custom-voice", {
      body: form,
      headers,
    });
    if (error) return { ok: false, error: "Could not start voice cloning. Please try again." };
    if (data?.error) return { ok: false, error: data.error };
    if (!data?.id) return { ok: false, error: "Unexpected response from the server." };
    return { ok: true, id: data.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not start voice cloning." };
  }
}
