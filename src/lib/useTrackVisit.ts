import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

// Tells the server a page was viewed. That is the whole contract.
//
// It sends the path and the referrer and nothing else -- no id, no
// cookie, nothing read from storage. Who the visitor is gets worked out
// server-side from the request's own headers, because a browser that
// could name its own visitor id could name a thousand of them.
//
// Deliberately not awaited and deliberately silent. This is a side
// effect of looking at a page: if it fails, the person looking at the
// page must never find out.

const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/track-visit`;

function send(path: string): void {
  const body = JSON.stringify({ path, referrer: document.referrer });
  try {
    // keepalive so the request survives the navigation that triggered it.
    // sendBeacon would too, but it cannot set Content-Type, and the
    // function parses JSON.
    void fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // An ad blocker refusing the request, or no network. Neither is ours
    // to report: the count is approximate by nature and the page works.
  }
}

/**
 * Counts one view per route, once.
 *
 * The guard matters more than it looks: React runs effects twice in
 * StrictMode during development, and a dashboard that re-renders on a
 * wallet refresh must not count itself again.
 */
export function useTrackVisit(): void {
  const { pathname } = useLocation();
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    if (!import.meta.env.VITE_SUPABASE_URL) return;
    if (lastSent.current === pathname) return;
    lastSent.current = pathname;
    send(pathname);
  }, [pathname]);
}
