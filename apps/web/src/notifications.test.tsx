import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { notificationText, relativeTime } from "./components/notifications/notification-text";
import {
  fetchNotifications,
  mergeNotifications,
  NOTIFICATIONS_PAGE_SIZE,
  type NotificationItem,
  type NotificationsState,
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
    data: { roundNumber: 2, fromPlayerId: "p2", deadline: "2026-11-18T10:00:00.000Z" },
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
    );
    expect(merged.items.map((i) => i.id)).toEqual(["c", "b", "a"]);
    expect(merged.items[1]?.readAt).not.toBeNull();
    expect(merged).toMatchObject({ unreadCount: 1, cursor: "cc" });
  });

  it("keeps the cursor when nothing is new and replaces the list on a full resync", () => {
    expect(
      mergeNotifications(previous, { items: [], unreadCount: 2, cursor: null }, "cb").cursor,
    ).toBe("cb");
    const full = mergeNotifications(
      previous,
      { items: [item("z")], unreadCount: 1, cursor: "cz" },
      null,
    );
    expect(full.items.map((i) => i.id)).toEqual(["z"]);
  });
});

describe("fetchNotifications", () => {
  const cached: NotificationsState = { items: [item("a")], unreadCount: 1, cursor: "ca" };

  function stubFetch(body: {
    items: NotificationItem[];
    unreadCount: number;
    cursor: string | null;
  }) {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        urls.push(input instanceof Request ? input.url : String(input));
        return Response.json(body);
      }),
    );
    return urls;
  }

  it("polls with the cursor and merges the new items on top", async () => {
    const urls = stubFetch({ items: [item("b")], unreadCount: 2, cursor: "cb" });
    const state = await fetchNotifications(cached, false);
    const url = new URL(urls[0] as string, "http://localhost");
    expect(url.searchParams.get("since")).toBe("ca");
    expect(url.searchParams.get("limit")).toBe(String(NOTIFICATIONS_PAGE_SIZE));
    expect(state.items.map((i) => i.id)).toEqual(["b", "a"]);
    expect(state).toMatchObject({ unreadCount: 2, cursor: "cb" });
  });

  it("a full resync sends no cursor and replaces the list", async () => {
    const urls = stubFetch({ items: [item("z")], unreadCount: 1, cursor: "cz" });
    const state = await fetchNotifications(cached, true);
    expect(new URL(urls[0] as string, "http://localhost").searchParams.has("since")).toBe(false);
    expect(state.items.map((i) => i.id)).toEqual(["z"]);
  });

  it("fails on an error response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 500 })),
    );
    await expect(fetchNotifications(cached, false)).rejects.toThrow();
  });
});

describe("notification cache size", () => {
  it("keeps only the newest NOTIFICATIONS_PAGE_SIZE items after merging", () => {
    const previous: NotificationsState = {
      items: Array.from({ length: NOTIFICATIONS_PAGE_SIZE }, (_, i) => item(`old${i}`)),
      unreadCount: NOTIFICATIONS_PAGE_SIZE,
      cursor: "c",
    };
    const merged = mergeNotifications(
      previous,
      { items: [item("n1"), item("n2")], unreadCount: 22, cursor: "c2" },
      "c",
    );
    expect(merged.items).toHaveLength(NOTIFICATIONS_PAGE_SIZE);
    expect(merged.items.slice(0, 2).map((i) => i.id)).toEqual(["n1", "n2"]);
    expect(merged.items.at(-1)?.id).toBe(`old${NOTIFICATIONS_PAGE_SIZE - 3}`);
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
      { outcome: "NO_WINNER", winnerId: null, missedByPlayerId: "me" },
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

function renderBell(items: NotificationItem[], unreadCount: number) {
  localStorage.setItem(
    "languageduel.player",
    JSON.stringify({ id: "player-1", username: "alice" }),
  );
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), "http://localhost").pathname;
    const method = init?.method ?? "GET";
    if (path === "/api/notifications" && method === "GET") {
      return Response.json({ items, unreadCount, cursor: items[0]?.id ?? null });
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
    expect(await screen.findByText("Loading match…")).toBeInTheDocument();
  });

  it("shows an empty state", async () => {
    renderBell([], 0);
    fireEvent.click(await screen.findByRole("button", { name: "Notifications" }));
    expect(await screen.findByText("No notifications yet")).toBeInTheDocument();
  });
});
