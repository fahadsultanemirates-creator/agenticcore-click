import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { getSku, resolveSku } from "../../supabase/functions/_shared/catalog.ts";

// The client's real order book, replacing the sample rows the dashboard used
// to show. Until now a paying client saw invented history here while their
// actual deliverable went to the owner's Telegram and nowhere else.
//
// The product catalog is imported straight from the edge functions rather than
// mirrored into src/. It is plain data with no server dependency, and a second
// copy would drift: the dashboard would start calling something a "Brand kit"
// while Forge and the worker called it a "Letterhead". One list, three readers.

export type OrderFile = {
  url: string;
  fileType: string;
  optionIndex: number;
  version: number;
};

export type Order = {
  id: string;
  publicId: string;
  /** The task type, which is also the dashboard's service id. */
  serviceId: string;
  /** The catalog product name -- "Letterhead", not "brand-kit". */
  product: string;
  summary: string;
  status: string;
  requestedAt: string;
  revisionsUsed: number;
  revisionsAllowed: number;
  /** Delivered, and the client has not opened it yet. */
  isNew: boolean;
  /** Why it stalled, for needs_info and failed. Null for every other status. */
  statusReason: string | null;
  previewUrl: string | null;
  files: OrderFile[];
};

type TaskRow = {
  id: string;
  public_id: string;
  type: string;
  sku: number | null;
  status: string;
  payload: Record<string, unknown> | null;
  created_at: string;
  revisions_used: number | null;
  revisions_allowed: number | null;
  client_seen_at: string | null;
  preview_url: string | null;
  task_files: { url: string; file_type: string; option_index: number; version: number }[] | null;
  task_events: { event_type: string; detail: Record<string, unknown> | null; created_at: string }[] | null;
};

// Statuses that will not change on their own. Anything else means something
// is still running, which is what decides whether to keep polling.
const SETTLED = new Set(["delivered", "failed", "cancelled", "needs_info"]);

// The brief, shortened to one line for a card. Falls back through the field
// names the different intake forms use before giving up on a description.
function summarize(payload: Record<string, unknown> | null): string {
  const raw = payload ?? {};
  const text = [raw.description, raw.brief, raw.businessName, raw.item, raw.docType]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .find((value) => value.length > 0);
  if (!text) return "No brief given.";
  return text.length > 120 ? `${text.slice(0, 117)}…` : text;
}

// "Needs info" and "Failed" used to be a badge and nothing else. The worker
// writes why to task_events, the client can read their own events (migration
// 0017), and nobody was asking -- so an order stalled with no way to find out
// what it was waiting for.
function statusReasonOf(row: TaskRow): string | null {
  if (row.status !== "needs_info" && row.status !== "failed") return null;
  const events = (row.task_events ?? []).filter((event) => event.event_type === row.status);
  if (events.length === 0) return null;
  // Newest, because a task can go needs_info, get answered, and stall again.
  const latest = events.reduce((a, b) => (a.created_at >= b.created_at ? a : b));
  const reason = latest.detail?.reason;
  return typeof reason === "string" && reason.trim().length > 0 ? reason.trim() : null;
}

function toOrder(row: TaskRow): Order {
  const product = (row.sku != null ? getSku(row.sku) : null) ?? resolveSku(row.type, row.payload ?? {});
  const revisionsAllowed = row.revisions_allowed ?? product?.revisions ?? 0;

  return {
    id: row.id,
    publicId: row.public_id,
    serviceId: product?.service ?? row.type,
    product: product?.name ?? row.type,
    summary: summarize(row.payload),
    status: row.status,
    requestedAt: row.created_at.slice(0, 10),
    revisionsUsed: row.revisions_used ?? 0,
    revisionsAllowed,
    isNew: row.status === "delivered" && row.client_seen_at === null,
    statusReason: statusReasonOf(row),
    previewUrl: row.preview_url,
    files: (row.task_files ?? []).map((file) => ({
      url: file.url,
      fileType: file.file_type,
      optionIndex: file.option_index,
      version: file.version
    }))
  };
}

// Row level security limits `tasks` to the caller's own rows (migration 0017),
// which is why there's no user_id filter here.
async function readOrders(): Promise<Order[] | null> {
  const { data, error } = await supabase
    .from("tasks")
    .select(
      "id, public_id, type, sku, status, payload, created_at, revisions_used, revisions_allowed, client_seen_at, preview_url, task_files(url, file_type, option_index, version), task_events(event_type, detail, created_at)"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("useOrders: could not load orders", error);
    return null;
  }
  return ((data ?? []) as TaskRow[]).map(toOrder);
}

export function useOrders() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const rows = await readOrders();
    setOrders(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // Orders used to load once and never again, so a client watching their
    // dashboard saw "In progress" indefinitely -- through the entire one-to-
    // four minutes the work actually takes, which is the whole promise of
    // the product. Poll while anything is still moving and stop when it
    // isn't, so a settled dashboard costs nothing.
    const tick = async () => {
      const rows = await readOrders();
      if (!active) return;
      setOrders(rows);
      setLoading(false);

      const working = (rows ?? []).some((order) => !SETTLED.has(order.status));
      if (working) timer = setTimeout(tick, 6000);
    };

    void tick();

    // Coming back to the tab should be instant rather than up to six seconds
    // stale, and a backgrounded tab stops getting timers anyway.
    const onFocus = () => {
      if (timer) clearTimeout(timer);
      void tick();
    };
    window.addEventListener("focus", onFocus);

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  // Clears the "new" badge once the client has actually looked at the work.
  // Goes through a security-definer function rather than an UPDATE, so the
  // client never holds write access to their own briefs or revision counts.
  const markSeen = useCallback(async (taskId: string) => {
    setOrders((current) =>
      current ? current.map((order) => (order.id === taskId ? { ...order, isNew: false } : order)) : current
    );
    const { error } = await supabase.rpc("mark_task_seen", { p_task_id: taskId });
    if (error) console.error("useOrders: could not mark order seen", error);
  }, []);

  return {
    orders: orders ?? [],
    /** Distinguishes "no orders yet" from "the query failed". */
    failed: !loading && orders === null,
    loading,
    unseenCount: (orders ?? []).filter((order) => order.isNew).length,
    refresh,
    markSeen
  };
}
