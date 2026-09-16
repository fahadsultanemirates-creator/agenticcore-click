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
};

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
      "id, public_id, type, sku, status, payload, created_at, revisions_used, revisions_allowed, client_seen_at, preview_url, task_files(url, file_type, option_index, version)"
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
    void (async () => {
      const rows = await readOrders();
      if (!active) return;
      setOrders(rows);
      setLoading(false);
    })();
    return () => {
      active = false;
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
