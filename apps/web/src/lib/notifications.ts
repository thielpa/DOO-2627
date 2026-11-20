import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useEffect, useRef } from "react";
import { api, unwrap } from "./api";

type NotificationsResponse = InferResponseType<typeof api.api.notifications.$get, 200>;
export type NotificationItem = NotificationsResponse["items"][number];

/** What we keep in the React Query cache: the merged list plus the polling bookkeeping. */
export interface NotificationsState {
  items: NotificationItem[];
  unreadCount: number;
  /** Opaque cursor of the newest item we have; sent as `since` on incremental polls. */
  cursor: string | null;
  /** ETag of the last 200 response, valid only for requests with the same `since`. */
  etag: string | null;
  etagSince: string | null;
}

export const notificationsQueryKey = ["notifications"] as const;

export const POLL_INTERVAL_MS = 5_000;
export const MAX_POLL_INTERVAL_MS = 60_000;

/**
 * Every Nth poll is a full resync (no `since`), on top of the focus resync. With 2+ relays a late
 * item can have a sentAt behind our cursor; this bounds how late it can show up (12 x 5s ~ 60s).
 * See docs/design.md, D11.
 */
export const FULL_RESYNC_EVERY_N_POLLS = 12;

/** The cache keeps only the newest items; older ones are not shown in the bell anyway. */
export const MAX_CACHED_ITEMS = 50;

/**
 * Decides whether the poll about to run is a full resync and returns the updated counter
 * (polls since the last full resync). `forced` = focus / after mark-read / mismatch detected.
 */
export function planPoll(
  pollsSinceFull: number,
  forced: boolean,
  every: number = FULL_RESYNC_EVERY_N_POLLS,
): { full: boolean; pollsSinceFull: number } {
  const full = forced || pollsSinceFull + 1 >= every;
  return { full, pollsSinceFull: full ? 0 : pollsSinceFull + 1 };
}

/**
 * After an incremental merge, the server's unread count should equal the unread items we hold.
 * If not (another device marked something read, or we missed an item) the list is stale: resync.
 * Not while a mark-read is in flight: the optimistic update makes the counts differ on purpose.
 */
export function needsResyncAfterMerge(
  state: NotificationsState,
  markReadPending: boolean,
): boolean {
  if (markReadPending) return false;
  return state.unreadCount !== state.items.filter((i) => i.readAt === null).length;
}

/** Delay before the next poll: 5s while healthy, then 10s, 20s, 40s, capped at 60s per failure. */
export function pollIntervalAfterFailures(consecutiveFailures: number): number {
  if (consecutiveFailures <= 0) return POLL_INTERVAL_MS;
  return Math.min(POLL_INTERVAL_MS * 2 ** consecutiveFailures, MAX_POLL_INTERVAL_MS);
}

/**
 * Folds a 200 response into the cached state. Without `since` the response replaces the list
 * (full resync); with `since` the new items go on top, deduped by id (the server wins).
 */
export function mergeNotifications(
  previous: NotificationsState | undefined,
  response: NotificationsResponse,
  since: string | null,
  etag: string | null,
): NotificationsState {
  const incremental = since !== null && previous !== undefined;
  const items = incremental
    ? [
        ...response.items,
        ...previous.items.filter((old) => !response.items.some((fresh) => fresh.id === old.id)),
      ]
    : response.items;
  return {
    items: items.slice(0, MAX_CACHED_ITEMS),
    unreadCount: response.unreadCount,
    cursor: response.cursor ?? previous?.cursor ?? null,
    etag,
    etagSince: since,
  };
}

/** Optimistic mark-as-read; the next poll reconciles with the server. */
export function markReadInState(state: NotificationsState, id: string, at: string) {
  const target = state.items.find((item) => item.id === id);
  if (!target || target.readAt) return state;
  return {
    ...state,
    items: state.items.map((item) => (item.id === id ? { ...item, readAt: at } : item)),
    unreadCount: Math.max(0, state.unreadCount - 1),
  };
}

export interface FetchResult {
  state: NotificationsState;
  /** True when a 200 was merged into the existing list (as opposed to replacing it or a 304). */
  mergedIncrementally: boolean;
}

/**
 * `getCurrent` reads the cache at response time: a 304 must return what is in the cache NOW,
 * not what it was before the request, or an optimistic mark-read made meanwhile would be lost.
 */
export async function fetchNotifications(
  getCurrent: () => NotificationsState | undefined,
  full: boolean,
): Promise<FetchResult> {
  const previous = getCurrent();
  const since = !full && previous?.cursor ? previous.cursor : null;
  const canRevalidate = previous?.etag && previous.etagSince === since;
  // no-store: the browser must not answer conditional requests itself, so we see real 304s.
  const response = await api.api.notifications.$get(
    { query: since ? { since } : {} },
    {
      headers: canRevalidate && previous.etag ? { "If-None-Match": previous.etag } : {},
      init: { cache: "no-store" },
    },
  );
  if (response.status === 304) {
    const current = getCurrent();
    if (!current) throw new Error("Unexpected 304 without cached notifications");
    return { state: current, mergedIncrementally: false };
  }
  if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
  const body = (await response.json()) as NotificationsResponse;
  // Merge into the cache as it is now (an optimistic mark-read may have happened meanwhile).
  const base = getCurrent() ?? previous;
  return {
    state: mergeNotifications(base, body, since, response.headers.get("ETag")),
    mergedIncrementally: since !== null && base !== undefined,
  };
}

export function useNotifications(enabled: boolean) {
  const queryClient = useQueryClient();
  // Set when the next fetch must be a full resync (window focus, after marking read).
  const needsFullResync = useRef(false);
  const pollsSinceFull = useRef(0);
  const pendingMarkReads = useRef(0);

  const query = useQuery({
    queryKey: notificationsQueryKey,
    enabled,
    retry: false,
    refetchOnWindowFocus: false, // handled below so the refetch can be a full resync
    refetchIntervalInBackground: false,
    refetchInterval: (q) => pollIntervalAfterFailures(q.state.fetchFailureCount),
    queryFn: async () => {
      const plan = planPoll(pollsSinceFull.current, needsFullResync.current);
      pollsSinceFull.current = plan.pollsSinceFull;
      needsFullResync.current = false;
      const { state, mergedIncrementally } = await fetchNotifications(
        () => queryClient.getQueryData<NotificationsState>(notificationsQueryKey),
        plan.full,
      );
      if (mergedIncrementally && needsResyncAfterMerge(state, pendingMarkReads.current > 0)) {
        needsFullResync.current = true; // stale readAt / missed item: resync on the next poll
      }
      return state;
    },
  });

  const { refetch } = query;
  useEffect(() => {
    if (!enabled) return;
    const resync = () => {
      if (document.visibilityState === "hidden") return;
      needsFullResync.current = true;
      void refetch();
    };
    window.addEventListener("focus", resync);
    document.addEventListener("visibilitychange", resync);
    return () => {
      window.removeEventListener("focus", resync);
      document.removeEventListener("visibilitychange", resync);
    };
  }, [enabled, refetch]);

  const markRead = useMutation({
    mutationFn: (id: string) => unwrap(api.api.notifications[":id"].read.$post({ param: { id } })),
    onMutate: (id) => {
      pendingMarkReads.current += 1;
      queryClient.setQueryData<NotificationsState>(notificationsQueryKey, (state) =>
        state ? markReadInState(state, id, new Date().toISOString()) : state,
      );
    },
    onSettled: () => {
      pendingMarkReads.current -= 1;
      needsFullResync.current = true;
      void queryClient.invalidateQueries({ queryKey: notificationsQueryKey });
    },
  });

  return { query, markRead: markRead.mutate };
}
