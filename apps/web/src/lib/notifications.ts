import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useEffect, useRef } from "react";
import { api, unwrap } from "./api";

type NotificationsResponse = InferResponseType<typeof api.api.notifications.$get, 200>;
export type NotificationItem = NotificationsResponse["items"][number];

export interface NotificationsState {
  items: NotificationItem[];
  unreadCount: number;
  /** Opaque cursor of the newest item we have; sent as `since` on incremental polls. */
  cursor: string | null;
}

export const notificationsQueryKey = ["notifications"] as const;

export const POLL_INTERVAL_MS = 5_000;
export const MAX_POLL_INTERVAL_MS = 60_000;

/**
 * How many items a full fetch asks for and how many the cache keeps. It is the server's default
 * page size (and below its maximum), so the cache never holds more than a full fetch returns.
 */
export const NOTIFICATIONS_PAGE_SIZE = 20;

/** Delay before the next poll: 5s while healthy, then 10s, 20s, 40s, capped at 60s per failure. */
export function pollIntervalAfterFailures(consecutiveFailures: number): number {
  if (consecutiveFailures <= 0) return POLL_INTERVAL_MS;
  return Math.min(POLL_INTERVAL_MS * 2 ** consecutiveFailures, MAX_POLL_INTERVAL_MS);
}

/**
 * Folds a response into the cached state. Without `since` the response replaces the list (full
 * resync); with `since` the new items go on top, deduped by id (the server wins).
 */
export function mergeNotifications(
  previous: NotificationsState | undefined,
  response: NotificationsResponse,
  since: string | null,
): NotificationsState {
  const items =
    since !== null && previous
      ? [
          ...response.items,
          ...previous.items.filter((old) => !response.items.some((fresh) => fresh.id === old.id)),
        ]
      : response.items;
  return {
    items: items.slice(0, NOTIFICATIONS_PAGE_SIZE),
    unreadCount: response.unreadCount,
    cursor: response.cursor ?? previous?.cursor ?? null,
  };
}

/** `full` ignores the cursor and replaces the list (focus, after marking read). */
export async function fetchNotifications(
  previous: NotificationsState | undefined,
  full: boolean,
): Promise<NotificationsState> {
  const since = !full && previous?.cursor ? previous.cursor : null;
  const limit = String(NOTIFICATIONS_PAGE_SIZE);
  const body = await unwrap(
    api.api.notifications.$get({ query: since ? { since, limit } : { limit } }),
  );
  return mergeNotifications(previous, body as NotificationsResponse, since);
}

export function useNotifications(enabled: boolean) {
  const queryClient = useQueryClient();
  // Set when the next fetch must be a full resync (window focus, after marking read).
  const needsFullResync = useRef(false);

  const query = useQuery({
    queryKey: notificationsQueryKey,
    enabled,
    retry: false,
    refetchOnWindowFocus: false, // handled below so the refetch can be a full resync
    refetchIntervalInBackground: false,
    refetchInterval: (q) => pollIntervalAfterFailures(q.state.fetchFailureCount),
    queryFn: () => {
      const full = needsFullResync.current;
      needsFullResync.current = false;
      return fetchNotifications(
        queryClient.getQueryData<NotificationsState>(notificationsQueryKey),
        full,
      );
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
    onSettled: () => {
      needsFullResync.current = true;
      void queryClient.invalidateQueries({ queryKey: notificationsQueryKey });
    },
  });

  return { query, markRead: markRead.mutate };
}
