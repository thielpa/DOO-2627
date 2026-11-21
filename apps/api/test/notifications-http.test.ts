import { describe, expect, it } from "bun:test";
import type { TurnPassed } from "../src/domain";
import { createApp } from "../src/http/app";
import { inMemoryUseCases } from "./support/in-memory-repositories";

function cookieFrom(response: Response): string {
  const value = response.headers.get("set-cookie")?.split(";")[0];
  if (!value) throw new Error("Expected a session cookie");
  return value;
}

async function setup() {
  const { useCases } = inMemoryUseCases();
  const app = createApp({ useCases });
  const login = async (username: string) => {
    const response = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost" },
      body: JSON.stringify({ username, password: "secret" }),
    });
    return { cookie: cookieFrom(response), id: ((await response.json()) as { id: string }).id };
  };
  const alice = await login("alice");
  const bob = await login("bob");

  const turnFor = async (toPlayerId: string) => {
    const event: TurnPassed = {
      eventId: crypto.randomUUID(),
      type: "TurnPassed",
      version: 1,
      occurredAt: new Date(),
      matchId: crypto.randomUUID(),
      fromPlayerId: alice.id,
      toPlayerId,
      roundNumber: 1,
      deadline: new Date(Date.now() + 60_000),
    };
    await useCases.notificationEventHandlers.TurnPassed(event);
    await useCases.relayPendingDeliveries.execute();
    return event;
  };
  const get = (cookie: string, query = "") =>
    app.request(`/api/notifications${query}`, { headers: { Cookie: cookie } });
  return { app, alice, bob, turnFor, get };
}

describe("notification HTTP routes", () => {
  it("requires a session", async () => {
    const { app } = await setup();
    expect((await app.request("/api/notifications")).status).toBe(401);
    const post = await app.request(`/api/notifications/${crypto.randomUUID()}/read`, {
      method: "POST",
      headers: { Origin: "http://localhost" },
    });
    expect(post.status).toBe(401);
  });

  it("lists only the caller's visible notifications", async () => {
    const { bob, alice, turnFor, get } = await setup();
    await turnFor(bob.id);

    const response = await get(bob.cookie);
    expect(response.status).toBe(200);
    expect(response.headers.has("etag")).toBe(false);
    const body = (await response.json()) as {
      items: Record<string, unknown>[];
      unreadCount: number;
      cursor: string;
    };
    expect(body.unreadCount).toBe(1);
    expect(body.cursor).toBeTruthy();
    expect(Object.keys(body.items[0] ?? {}).sort()).toEqual(
      ["createdAt", "data", "id", "matchId", "readAt", "type"].sort(),
    );
    expect(body.items[0]).toMatchObject({ type: "TURN_PASSED", readAt: null });

    const other = (await (await get(alice.cookie)).json()) as { items: unknown[] };
    expect(other.items).toEqual([]);
  });

  it("returns only newer items for `since` and validates query parameters", async () => {
    const { bob, turnFor, get } = await setup();
    await turnFor(bob.id);
    const first = (await (await get(bob.cookie)).json()) as { cursor: string };

    const none = (await (await get(bob.cookie, `?since=${first.cursor}`)).json()) as {
      items: unknown[];
      cursor: string;
    };
    expect(none.items).toEqual([]);
    expect(none.cursor).toBe(first.cursor);

    await new Promise((resolve) => setTimeout(resolve, 5));
    await turnFor(bob.id);
    const newer = (await (await get(bob.cookie, `?since=${first.cursor}`)).json()) as {
      items: unknown[];
    };
    expect(newer.items).toHaveLength(1);

    expect((await get(bob.cookie, "?since=garbage")).status).toBe(400);
    expect((await get(bob.cookie, "?limit=0")).status).toBe(400);
    expect((await get(bob.cookie, "?limit=51")).status).toBe(400);
    expect((await get(bob.cookie, "?limit=abc")).status).toBe(400);
    expect((await get(bob.cookie, "?limit=1")).status).toBe(200);
  });

  it("marks a notification read (204, idempotent) and 404s for someone else's", async () => {
    const { app, bob, alice, turnFor, get } = await setup();
    await turnFor(bob.id);
    const list = (await (await get(bob.cookie)).json()) as { items: { id: string }[] };
    const id = list.items[0]?.id;

    const read = (cookie: string, notificationId = id) =>
      app.request(`/api/notifications/${notificationId}/read`, {
        method: "POST",
        headers: { Origin: "http://localhost", Cookie: cookie },
      });

    expect((await read(alice.cookie)).status).toBe(404);
    expect((await read(bob.cookie)).status).toBe(204);
    expect((await read(bob.cookie)).status).toBe(204);
    expect((await read(bob.cookie, crypto.randomUUID())).status).toBe(404);
    expect((await read(bob.cookie, "not-a-uuid")).status).toBe(400);

    const after = (await (await get(bob.cookie)).json()) as {
      items: { readAt: string | null }[];
      unreadCount: number;
    };
    expect(after.unreadCount).toBe(0);
    expect(after.items[0]?.readAt).toBeTruthy();
  });
});
