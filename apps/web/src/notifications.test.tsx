import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MatchStatusTag } from "./components/match/match-status-tag";
import { notificationText, relativeTime } from "./components/notifications/notification-text";
import {
  FULL_RESYNC_EVERY_N_POLLS,
  fetchNotifications,
  MAX_CACHED_ITEMS,
  mergeNotifications,
  type NotificationItem,
  type NotificationsState,
  needsResyncAfterMerge,
  planPoll,
  pollIntervalAfterFailures,
} from "./lib/notifications";
import { createAppRouter } from "./router";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const item = (id: string, over: Partial<NotificationItem> = {}): NotificationItem =>
  ({
    id,
    type: "TURN_PASSED",
    matchId: "m1",
    data: { roundNumber: 2, fromPlayerId: "p2" },
    createdAt: new Date().toISOString(),
    readAt: null,
    ...over,
  }) as NotificationItem;

describe("pollIntervalAfterFailures", () => {
  it("backs off 5s, 10s, 20s, 40s and caps at 60s, returning to 5s after success", () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(pollIntervalAfterFailures)).toEqual([
      5000, 10000, 20000, 40000, 60000, 60000, 60000,
    ]);
  });
});

describe("mergeNotifications", () => {
  const previous: NotificationsState = {
    items: [item("b"), item("a")],
    unreadCount: 2,
    cursor: "cb",
    etag: 'W/"1"',
    etagSince: null,
  };

  it("puts new items on top, dedupes by id and takes the unread count from the response", () => {
    const merged = mergeNotifications(
      previous,
      {
        items: [item("c"), item("b", { readAt: "2026-11-17T10:00:00Z" })],
        unreadCount: 1,
        cursor: "cc",
      },
      "cb",
      'W/"2"',
    );
    expect(merged.items.map((i) => i.id)).toEqual(["c", "b", "a"]);
    expect(merged.items[1]?.readAt).not.toBeNull();
    expect(merged).toMatchObject({ unreadCount: 1, cursor: "cc", etag: 'W/"2"', etagSince: "cb" });
  });

  it("keeps the cursor when nothing is new and replaces the list on a full resync", () => {
    expect(
      mergeNotifications(previous, { items: [], unreadCount: 2, cursor: null }, "cb", null).cursor,
    ).toBe("cb");
    const full = mergeNotifications(
      previous,
      { items: [item("z")], unreadCount: 1, cursor: "cz" },
      null,
      null,
    );
    expect(full.items.map((i) => i.id)).toEqual(["z"]);
  });
});

describe("periodic full resync", () => {
  it("is every 12th poll, resets on any full resync, and honours forced resyncs", () => {
    expect(FULL_RESYNC_EVERY_N_POLLS).toBe(12);
    let count = 0;
    const fulls: number[] = [];
    for (let poll = 1; poll <= 25; poll++) {
      const plan = planPoll(count, false);
      count = plan.pollsSinceFull;
      if (plan.full) fulls.push(poll);
    }
    expect(fulls).toEqual([12, 24]);

    expect(planPoll(3, true)).toEqual({ full: true, pollsSinceFull: 0 });
    expect(planPoll(3, false)).toEqual({ full: false, pollsSinceFull: 4 });
    expect(planPoll(1, false, 2)).toEqual({ full: true, pollsSinceFull: 0 });
  });
});

describe("needsResyncAfterMerge", () => {
  const state = (unreadCount: number, readAts: (string | null)[]): NotificationsState => ({
    items: readAts.map((readAt, i) => item(`i${i}`, { readAt })),
    unreadCount,
    cursor: "c",
    etag: null,
    etagSince: null,
  });

  it("schedules a resync when the server unread count differs from the unread items held", () => {
    expect(needsResyncAfterMerge(state(2, [null, null]), false)).toBe(false);
    // Another device marked one read: server says 1, we still hold 2 unread.
    expect(needsResyncAfterMerge(state(1, [null, null]), false)).toBe(true);
    // We missed an item: server says 3, we hold 2.
    expect(needsResyncAfterMerge(state(3, [null, null]), false)).toBe(true);
  });

  it("does not while a mark-read mutation is pending", () => {
    expect(needsResyncAfterMerge(state(1, [null, null]), true)).toBe(false);
  });
});

describe("fetchNotifications", () => {
  const cached = (over: Partial<NotificationsState> = {}): NotificationsState => ({
    items: [item("a")],
    unreadCount: 1,
    cursor: "ca",
    etag: 'W/"1"',
    etagSince: "ca",
    ...over,
  });

  function stubFetch(responder: () => Response) {
    const calls: { url: string; headers: Headers }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : null;
        calls.push({
          url: request ? request.url : String(input),
          headers: new Headers(init?.headers ?? request?.headers),
        });
        return responder();
      }),
    );
    return calls;
  }

  it("on 304 returns the cache as it is NOW, keeping an optimistic mark-read", async () => {
    let current: NotificationsState | undefined = cached();
    const calls = stubFetch(() => {
      // The user marks it read while the request is in flight.
      current = cached({ items: [item("a", { readAt: "2026-11-17T10:00:00Z" })], unreadCount: 0 });
      return new Response(null, { status: 304 });
    });
    const result = await fetchNotifications(() => current, false);
    expect(calls[0]?.headers.get("If-None-Match")).toBe('W/"1"');
    expect(result.state).toBe(current);
    expect(result.state.items[0]?.readAt).not.toBeNull();
    expect(result.mergedIncrementally).toBe(false);
  });

  it("sends If-None-Match only when the ETag belongs to the same since shape", async () => {
    const ok = () =>
      new Response(JSON.stringify({ items: [], unreadCount: 1, cursor: null }), {
        status: 200,
        headers: { "Content-Type": "application/json", ETag: 'W/"2"' },
      });
    let calls = stubFetch(ok);
    await fetchNotifications(() => cached({ etagSince: "ca" }), false);
    expect(calls[0]?.headers.get("If-None-Match")).toBe('W/"1"');

    // ETag was for another cursor: do not send it.
    calls = stubFetch(ok);
    await fetchNotifications(() => cached({ etagSince: "older" }), false);
    expect(calls[0]?.headers.has("If-None-Match")).toBe(false);

    // Full resync (no since) vs an ETag recorded for an incremental request.
    calls = stubFetch(ok);
    await fetchNotifications(() => cached({ etagSince: "ca" }), true);
    expect(calls[0]?.headers.has("If-None-Match")).toBe(false);

    // Full resync with an ETag recorded for a full response.
    calls = stubFetch(ok);
    await fetchNotifications(() => cached({ etagSince: null }), true);
    expect(calls[0]?.headers.get("If-None-Match")).toBe('W/"1"');
  });
});

describe("notification cache cap", () => {
  it("keeps only the newest MAX_CACHED_ITEMS after merging", () => {
    const previous: NotificationsState = {
      items: Array.from({ length: MAX_CACHED_ITEMS }, (_, i) => item(`old${i}`)),
      unreadCount: MAX_CACHED_ITEMS,
      cursor: "c",
      etag: null,
      etagSince: null,
    };
    const merged = mergeNotifications(
      previous,
      { items: [item("n1"), item("n2")], unreadCount: 52, cursor: "c2" },
      "c",
      null,
    );
    expect(merged.items).toHaveLength(MAX_CACHED_ITEMS);
    expect(merged.items.slice(0, 2).map((i) => i.id)).toEqual(["n1", "n2"]);
    expect(merged.items.at(-1)?.id).toBe(`old${MAX_CACHED_ITEMS - 3}`);
  });
});

describe("notification text", () => {
  it.each([
    ["TURN_PASSED", { roundNumber: 3, fromPlayerId: "x" }, "It's your turn (round 3)"],
    ["MATCH_COMPLETED", { outcome: "WON", winnerId: "me" }, "You won the match"],
    ["MATCH_COMPLETED", { outcome: "LOST", winnerId: "x" }, "You lost the match"],
    ["MATCH_COMPLETED", { outcome: "DRAW", winnerId: null }, "Match ended in a draw"],
    [
      "MATCH_EXPIRED",
      { outcome: "WON", winnerId: "me", missedByPlayerId: "x" },
      "Match expired – you won",
    ],
    [
      "MATCH_EXPIRED",
      { outcome: "LOST", winnerId: "x", missedByPlayerId: "me" },
      "Match expired – you lost",
    ],
    [
      "MATCH_EXPIRED",
      { outcome: "DRAW", winnerId: null, missedByPlayerId: null },
      "Match expired – no winner",
    ],
  ] as const)("%s %j", (type, data, text) => {
    expect(notificationText({ type, data } as never)).toBe(text);
  });

  it("formats relative time", () => {
    const now = Date.parse("2026-11-17T12:00:00Z");
    expect(relativeTime("2026-11-17T11:59:50Z", now)).toBe("just now");
    expect(relativeTime("2026-11-17T11:55:00Z", now)).toBe("5 min ago");
    expect(relativeTime("2026-11-17T09:00:00Z", now)).toBe("3 h ago");
  });
});

describe("MatchStatusTag", () => {
  it("shows Expired for expired matches", () => {
    render(<MatchStatusTag match={{ status: "EXPIRED", result: null, isYourTurn: false }} />);
    expect(screen.getByText("Expired")).toBeInTheDocument();
  });
});

function renderBell(items: NotificationItem[], unreadCount: number) {
  localStorage.setItem(
    "languageduel.player",
    JSON.stringify({ id: "player-1", username: "alice" }),
  );
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), "http://localhost").pathname;
    const method = init?.method ?? "GET";
    if (path === "/api/notifications" && method === "GET") {
      return Response.json(
        { items, unreadCount, cursor: items[0]?.id ?? null },
        { headers: { ETag: 'W/"1"' } },
      );
    }
    if (path.endsWith("/read") && method === "POST") return new Response(null, { status: 204 });
    if (path === "/auth/me") return Response.json({ id: "player-1", username: "alice" });
    if (path === "/api/matches") return Response.json([]);
    if (path === "/api/friend-challenges") return Response.json({ incoming: [], outgoing: [] });
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal("fetch", fetch);
  const router = createAppRouter({ history: createMemoryHistory({ initialEntries: ["/"] }) });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return fetch;
}

describe("NotificationBell", () => {
  it("shows the unread count in the badge and label", async () => {
    renderBell([item("a")], 3);
    expect(
      await screen.findByRole("button", { name: "Notifications, 3 unread" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("notification-badge")).toHaveTextContent("3");
  });

  it("shows 9+ over nine and hides the badge at zero", async () => {
    renderBell([item("a")], 12);
    expect(await screen.findByText("9+")).toBeInTheDocument();
    cleanup();
    renderBell([item("a", { readAt: "2026-11-17T10:00:00Z" })], 0);
    expect(await screen.findByRole("button", { name: "Notifications" })).toBeInTheDocument();
    expect(screen.queryByTestId("notification-badge")).not.toBeInTheDocument();
  });

  it("lists notifications and marks one read on click", async () => {
    const fetch = renderBell(
      [item("a", { type: "MATCH_COMPLETED", data: { outcome: "WON", winnerId: "player-1" } })],
      1,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Notifications, 1 unread" }));
    const entry = await screen.findByText("You won the match");
    fireEvent.click(entry);

    await vi.waitFor(() => {
      const post = fetch.mock.calls.find(([, init]) => init?.method === "POST");
      expect(String(post?.[0])).toContain("/api/notifications/a/read");
    });
    // Navigated to the match page.
    expect(await screen.findByText("Loading…")).toBeInTheDocument();
  });

  it("shows an empty state", async () => {
    renderBell([], 0);
    fireEvent.click(await screen.findByRole("button", { name: "Notifications" }));
    expect(await screen.findByText("No notifications yet")).toBeInTheDocument();
  });
});
