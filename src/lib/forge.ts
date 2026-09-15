import { functionErrorMessage } from "./functionError";
import { supabase } from "./supabase";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

export interface ForgeTaskDraft {
  type: string;
  subtype?: string | null;
  payload: Record<string, unknown>;
  priceUsd: number | null;
}

export interface ForgeChatResult {
  conversationId: string;
  reply: string;
  action: "ask" | "submit_tasks" | "submit_bundle";
  tasks: ForgeTaskDraft[];
  totalUsd: number | null;
  isBundle: boolean;
  walletBalanceUsd: number;
}

export interface ForgeMessageRow {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments: { url: string }[];
  created_at: string;
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Your session expired — please log in again.");
  return { Authorization: `Bearer ${token}` };
}

// Resumes the client's most recent open conversation, if any, along with
// its history -- so reloading Forge doesn't lose the thread.
export async function fetchActiveConversation(): Promise<{ conversationId: string; messages: ForgeMessageRow[] } | null> {
  const { data: convo } = await supabase
    .from("forge_conversations")
    .select("id")
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!convo) return null;

  const { data: messages } = await supabase
    .from("forge_messages")
    .select("id, role, content, attachments, created_at")
    .eq("conversation_id", convo.id)
    .order("created_at", { ascending: true });

  return { conversationId: convo.id, messages: messages ?? [] };
}

export async function sendForgeMessage(
  conversationId: string | null,
  message: string,
  attachmentUrls: string[],
): Promise<ForgeChatResult> {
  const headers = await authHeader();
  const { data, error } = await supabase.functions.invoke<ForgeChatResult & { error?: string }>("forge-chat", {
    body: { conversationId, message, attachmentUrls },
    headers,
  });
  if (error || !data) throw new Error(await functionErrorMessage(error, "Could not reach Forge. Please try again."));
  if (data.error) throw new Error(data.error);
  return data;
}

export async function uploadForgeFile(conversationId: string, file: File): Promise<{ url: string; mimeType: string }> {
  const headers = await authHeader();
  const form = new FormData();
  form.set("conversationId", conversationId);
  form.set("file", file);
  const { data, error } = await supabase.functions.invoke<{ url?: string; mimeType?: string; error?: string }>("forge-upload", {
    body: form,
    headers,
  });
  if (error || !data) throw new Error(await functionErrorMessage(error, "Could not upload that file."));
  if (data.error) throw new Error(data.error);
  if (!data.url) throw new Error("Unexpected response from the server.");
  return { url: data.url, mimeType: data.mimeType ?? "" };
}

export async function submitForgeTasks(
  conversationId: string,
  tasks: { type: string; subtype?: string | null; payload: Record<string, unknown> }[],
  bundle: boolean,
): Promise<{ publicIds: string[]; totalCharged: number }> {
  const headers = await authHeader();
  const { data, error } = await supabase.functions.invoke<{ publicIds?: string[]; totalCharged?: number; error?: string }>(
    "forge-submit",
    { body: { conversationId, tasks, bundle }, headers },
  );
  if (error || !data) throw new Error(await functionErrorMessage(error, "Could not submit. Please try again."));
  if (data.error) throw new Error(data.error);
  if (!data.publicIds) throw new Error("Unexpected response from the server.");
  return { publicIds: data.publicIds, totalCharged: data.totalCharged ?? 0 };
}

export async function transcribeForgeVoice(blob: Blob): Promise<string> {
  const headers = await authHeader();
  const form = new FormData();
  form.set("audio", blob, "voice.webm");
  const { data, error } = await supabase.functions.invoke<{ text?: string; error?: string }>("forge-transcribe", {
    body: form,
    headers,
  });
  if (error || !data) throw new Error(await functionErrorMessage(error, "Could not transcribe that."));
  if (data.error) throw new Error(data.error);
  if (typeof data.text !== "string") throw new Error("Unexpected response from the server.");
  return data.text;
}

// Raw fetch, not functions.invoke -- this endpoint returns binary mp3
// bytes, not JSON, so it needs a blob response type directly.
export async function speakForgeText(text: string): Promise<string> {
  const headers = await authHeader();
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/forge-speak`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!resp.ok) throw new Error("Could not synthesize speech.");
  const blob = await resp.blob();
  return URL.createObjectURL(blob);
}

export async function fetchWalletBalance(): Promise<number> {
  const { data } = await supabase.from("wallets").select("balance_usd").maybeSingle();
  return data ? Number(data.balance_usd) : 0;
}
