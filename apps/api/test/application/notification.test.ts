import { describe, expect, it } from "bun:test";
import { createNotificationUseCases } from "../../src/application/notification";
import { decodeCursor } from "../../src/application/notification/cursor";
import {
  type DeliverySender,
  Match,
  type MatchCompleted,
  type MatchExpired,
  type TurnPassed,
} from "../../src/domain";
import {
  InMemoryNotificationRepository,
  inMemoryUseCases,
} from "../support/in-memory-repositories";

const alice = "00000000-0000-4000-8000-0000000000a1";
const bob = "00000000-0000-4000-8000-0000000000b2";
const match = "00000000-0000-4000-8000-0000000000c3";

function setup(options: { senders?: DeliverySender[]; maxAttempts?: number } = {}) {
  let now = new Date("2026-11-17T10:00:00Z");
  const repository = new InMemoryNotificationRepository();
  const useCases = createNotificationUseCases(
    repository,
    { run: (work) => work() },
    () => now,
    options,
  );
  const tick = (seconds = 1) => {
    now = new Date(now.getTime() + seconds * 1000);
  };
  const notificationsOf = (playerId: string, since?: string) =>
    useCases.listNotifications.execute({ playerId, since });
  return {
    repository,
    useCases,
    tick,
    notificationsOf,
    handlers: useCases.notificationEventHandlers,
  };
}

const deadline = new Date("2026-11-18T10:00:00Z");

const turnPassed = (eventId = crypto.randomUUID()): TurnPassed => ({
  eventId,
  type: "TurnPassed",
  version: 1,
  occurredAt: new Date("2026-11-17T10:00:00Z"),
  matchId: match,
  fromPlayerId: alice,
  toPlayerId: bob,
  roundNumber: 2,
  deadline,
});

const completed = (winnerId: string | null): MatchCompleted => ({
  eventId: crypto.randomUUID(),
  type: "MatchCompleted",
  version: 1,
  occurredAt: new Date("2026-11-17T10:00:00Z"),
  matchId: match,
  playerIds: [alice, bob],
  winnerId,
  scores: { [alice]: 3, [bob]: 1 },
});

const expired = (winnerId: string | null, missedByPlayerId: string): MatchExpired => ({
  eventId: crypto.randomUUID(),
  type: "MatchExpired",
  version: 1,
  occurredAt: new Date("2026-11-17T10:00:00Z"),
  matchId: match,
  playerIds: [alice, bob],
  scores: { [alice]: 2, [bob]: 1 },
  missedByPlayerId,
  winnerId,
});

const visibleFor = (s: ReturnType<typeof setup>, playerId: string) => s.notificationsOf(playerId);

describe("notification event handlers", () => {
  it("TurnPassed notifies only the player whose turn it is", async () => {
    const s = setup();
    await s.handlers.TurnPassed(turnPassed());
    await s.useCases.relayPendingDeliveries.execute();

    expect((await visibleFor(s, alice)).items).toHaveLength(0);
    const [item] = (await visibleFor(s, bob)).items;
    expect(item).toMatchObject({
      type: "TURN_PASSED",
      matchId: match,
      data: { roundNumber: 2, fromPlayerId: alice, deadline: deadline.toISOString() },
      readAt: null,
    });
  });

  it("MatchCompleted notifies both players with their own outcome", async () => {
    const s = setup();
    await s.handlers.MatchCompleted(completed(alice));
    await s.handlers.MatchCompleted(completed(null));
    await s.useCases.relayPendingDeliveries.execute();

    const aliceData = (await visibleFor(s, alice)).items.map((i) => i.data);
    const bobData = (await visibleFor(s, bob)).items.map((i) => i.data);
    expect(aliceData).toContainEqual({ outcome: "WON", winnerId: alice });
    expect(aliceData).toContainEqual({ outcome: "DRAW", winnerId: null });
    expect(bobData).toContainEqual({ outcome: "LOST", winnerId: alice });
    expect(bobData).toContainEqual({ outcome: "DRAW", winnerId: null });
  });

  it("MatchExpired notifies both players with outcome and who missed the turn", async () => {
    const s = setup();
    await s.handlers.MatchExpired(expired(alice, bob));
    await s.useCases.relayPendingDeliveries.execute();

    expect((await visibleFor(s, alice)).items[0]?.data).toEqual({
      outcome: "WON",
      winnerId: alice,
      missedByPlayerId: bob,
    });
    expect((await visibleFor(s, bob)).items[0]).toMatchObject({
      type: "MATCH_EXPIRED",
      data: { outcome: "LOST" },
    });
  });

  it("MatchExpired without a winner (nobody answered) is NO_WINNER, not a draw", async () => {
    const s = setup();
    await s.handlers.MatchExpired(expired(null, alice));
    await s.useCases.relayPendingDeliveries.execute();

    for (const player of [alice, bob]) {
      expect((await visibleFor(s, player)).items[0]?.data).toEqual({
        outcome: "NO_WINNER",
        winnerId: null,
        missedByPlayerId: alice,
      });
    }
  });

  it("ignores a duplicate event (idempotent consumer)", async () => {
    const s = setup();
    const event = completed(alice);
    await s.handlers.MatchCompleted(event);
    await s.handlers.MatchCompleted(event);
    await s.useCases.relayPendingDeliveries.execute();

    expect((await visibleFor(s, alice)).items).toHaveLength(1);
    expect((await visibleFor(s, bob)).items).toHaveLength(1);
  });

  it("creates the notification PENDING and invisible until the relay runs", async () => {
    const s = setup();
    await s.handlers.TurnPassed(turnPassed());
    expect((await visibleFor(s, bob)).items).toHaveLength(0);
    expect((await s.repository.claimPendingDeliveries(10)).length).toBe(1);
  });
});

describe("subscription on the event dispatcher", () => {
  it("an expired match dispatched by the Match use case notifies both players", async () => {
    const started = new Date("2026-01-01T00:00:00Z");
    const { useCases, matches } = inMemoryUseCases([], [], {
      now: () => new Date("2026-01-03T00:00:00Z"),
    });
    const overdue = Match.create("m1", [alice, bob], "SOLO_RANDOM", "EASY");
    overdue.start(started);
    await matches.save(overdue);

    await useCases.expireOverdueMatches.execute();
    await useCases.relayPendingDeliveries.execute();

    for (const playerId of [alice, bob]) {
      const { items } = await useCases.listNotifications.execute({ playerId });
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        type: "MATCH_EXPIRED",
        matchId: "m1",
        data: { outcome: "NO_WINNER", winnerId: null },
      });
    }
  });
});

describe("RelayPendingDeliveries", () => {
  it("sends IN_APP deliveries and passes the delivery ID as idempotency key", async () => {
    const sent: { key: string; notificationId: string }[] = [];
    const sender: DeliverySender = {
      channel: "IN_APP",
      send: async ({ idempotencyKey, notification }) => {
        sent.push({ key: idempotencyKey, notificationId: notification.id });
      },
    };
    const s = setup({ senders: [sender] });
    await s.handlers.TurnPassed(turnPassed());

    const result = await s.useCases.relayPendingDeliveries.execute();
    expect(result).toEqual({ claimed: 1, sent: 1, failed: 0 });
    const [item] = (await visibleFor(s, bob)).items;
    expect(sent).toHaveLength(1);
    expect(sent[0]?.notificationId).toBe(item?.id);

    // Nothing left to claim: a second cycle does not send again.
    expect(await s.useCases.relayPendingDeliveries.execute()).toEqual({
      claimed: 0,
      sent: 0,
      failed: 0,
    });
    expect(sent).toHaveLength(1);
  });

  it("retries once per cycle and marks the delivery FAILED after max attempts", async () => {
    let calls = 0;
    const failing: DeliverySender = {
      channel: "IN_APP",
      send: async () => {
        calls += 1;
        throw new Error("boom");
      },
    };
    const s = setup({ senders: [failing], maxAttempts: 3 });
    await s.handlers.TurnPassed(turnPassed());

    for (let cycle = 1; cycle <= 3; cycle++) {
      expect(await s.useCases.relayPendingDeliveries.execute()).toMatchObject({ failed: 1 });
      expect(calls).toBe(cycle);
    }
    // FAILED is terminal: no longer claimed.
    expect(await s.repository.claimPendingDeliveries(10)).toEqual([]);
    expect(await s.useCases.relayPendingDeliveries.execute()).toMatchObject({ claimed: 0 });
    expect(calls).toBe(3);
    expect((await visibleFor(s, bob)).items).toHaveLength(0);
  });

  it("succeeds on a later cycle after a failure and records the attempts", async () => {
    let fail = true;
    const flaky: DeliverySender = {
      channel: "IN_APP",
      send: async () => {
        if (fail) throw new Error("temporary");
      },
    };
    const s = setup({ senders: [flaky] });
    await s.handlers.TurnPassed(turnPassed());

    await s.useCases.relayPendingDeliveries.execute();
    fail = false;
    expect(await s.useCases.relayPendingDeliveries.execute()).toMatchObject({ sent: 1 });
    expect((await visibleFor(s, bob)).items).toHaveLength(1);
  });

  it("counts a missing sender for the channel as a failed attempt", async () => {
    const s = setup({ senders: [], maxAttempts: 1 });
    await s.handlers.TurnPassed(turnPassed());
    expect(await s.useCases.relayPendingDeliveries.execute()).toMatchObject({ failed: 1 });
    expect(await s.useCases.relayPendingDeliveries.execute()).toMatchObject({ claimed: 0 });
  });
});

describe("RelayPendingDeliveries mixed batch", () => {
  it("only the failing delivery stays PENDING (attempts++); the others are SENT in the same cycle", async () => {
    const carol = "00000000-0000-4000-8000-0000000000d4";
    const failFor = new Set<string>();
    const sender: DeliverySender = {
      channel: "IN_APP",
      send: async ({ notification }) => {
        if (failFor.has(notification.recipientId)) throw new Error("boom");
      },
    };
    const s = setup({ senders: [sender], maxAttempts: 5 });
    const event = (toPlayerId: string): TurnPassed => ({
      ...turnPassed(),
      toPlayerId,
      roundNumber: 1,
    });
    await s.handlers.TurnPassed(event(bob));
    await s.handlers.TurnPassed(event(carol));
    await s.handlers.TurnPassed(event(alice));
    failFor.add(carol);

    expect(await s.useCases.relayPendingDeliveries.execute()).toEqual({
      claimed: 3,
      sent: 2,
      failed: 1,
    });
    expect((await visibleFor(s, bob)).items).toHaveLength(1);
    expect((await visibleFor(s, alice)).items).toHaveLength(1);
    expect((await visibleFor(s, carol)).items).toHaveLength(0);

    const pending = await s.repository.claimPendingDeliveries(10);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.notification.recipientId).toBe(carol);
    expect(pending[0]?.delivery.status).toBe("PENDING");
    expect(pending[0]?.delivery.attempts).toBe(1);
  });
});

describe("ListNotifications", () => {
  async function publishTurns(s: ReturnType<typeof setup>, count: number) {
    for (let i = 0; i < count; i++) {
      s.tick();
      await s.handlers.TurnPassed(turnPassed());
      await s.useCases.relayPendingDeliveries.execute();
    }
  }

  it("returns the latest items newest first, limited, with unread count and cursor", async () => {
    const s = setup();
    await publishTurns(s, 3);
    const result = await s.useCases.listNotifications.execute({ playerId: bob, limit: 2 });
    expect(result.items).toHaveLength(2);
    expect(result.unreadCount).toBe(3);
    expect(result.cursor).not.toBeNull();
    expect(result.items[0]?.createdAt.getTime()).toBeGreaterThan(
      result.items[1]?.createdAt.getTime() ?? 0,
    );
    const newest = result.items[0];
    expect(decodeCursor(result.cursor ?? "")?.id).toBe(newest?.id);
  });

  it("returns only items newer than the cursor and keeps the cursor when nothing is new", async () => {
    const s = setup();
    await publishTurns(s, 2);
    const first = await visibleFor(s, bob);

    const unchanged = await s.useCases.listNotifications.execute({
      playerId: bob,
      since: first.cursor ?? undefined,
    });
    expect(unchanged.items).toEqual([]);
    expect(unchanged.cursor).toBe(first.cursor);

    await publishTurns(s, 1);
    const next = await s.useCases.listNotifications.execute({
      playerId: bob,
      since: first.cursor ?? undefined,
    });
    expect(next.items).toHaveLength(1);
    expect(next.cursor).not.toBe(first.cursor);
  });

  it("delivers a backlog larger than limit across successive polls without skipping items", async () => {
    const s = setup();
    await publishTurns(s, 1);
    const first = await visibleFor(s, bob);
    let cursor = first.cursor ?? "";
    const seen = new Set(first.items.map((item) => item.id));

    // 5 new items become visible in ONE relay cycle (same sentAt), more than the limit of 2.
    for (let i = 0; i < 5; i++) await s.handlers.TurnPassed(turnPassed());
    s.tick();
    await s.useCases.relayPendingDeliveries.execute();

    const pageSizes: number[] = [];
    for (let poll = 0; poll < 6; poll++) {
      const page = await s.useCases.listNotifications.execute({
        playerId: bob,
        since: cursor,
        limit: 2,
      });
      if (page.items.length === 0) break;
      pageSizes.push(page.items.length);
      for (const item of page.items) {
        expect(seen.has(item.id)).toBe(false);
        seen.add(item.id);
      }
      // Newest first within the page; the cursor is the newest item RETURNED.
      if (page.items.length > 1) {
        expect((page.items[0]?.id ?? "") > (page.items.at(-1)?.id ?? "~")).toBe(true);
      }
      expect(decodeCursor(page.cursor ?? "")?.id).toBe(page.items[0]?.id);
      cursor = page.cursor ?? "";
    }
    expect(pageSizes).toEqual([2, 2, 1]);
    expect(seen.size).toBe(6);
    expect(seen).toEqual(
      new Set(
        (
          (await s.useCases.listNotifications.execute({ playerId: bob, limit: 50 })) as {
            items: { id: string }[];
          }
        ).items.map((i) => i.id),
      ),
    );
  });

  it("breaks equal sentAt ties by id (ascending across polls, newest-first per page)", async () => {
    const s = setup();
    for (let i = 0; i < 4; i++) await s.handlers.TurnPassed(turnPassed());
    await s.useCases.relayPendingDeliveries.execute(); // identical sentAt for all four
    const all = await visibleFor(s, bob);
    const idsDescending = all.items.map((item) => item.id);
    expect(idsDescending).toEqual([...idsDescending].sort().reverse());

    const oldestTwo = await s.repository.listForRecipient(bob, {
      after: { visibleAt: new Date("2000-01-01T00:00:00Z"), id: "" },
      limit: 2,
    });
    expect(oldestTwo.map((n) => n.id)).toEqual(idsDescending.slice(-2));
  });

  it("rejects an invalid cursor and limit", async () => {
    const s = setup();
    await expect(
      s.useCases.listNotifications.execute({ playerId: bob, since: "garbage" }),
    ).rejects.toThrow("Invalid cursor");
    await expect(
      s.useCases.listNotifications.execute({ playerId: bob, limit: 0 }),
    ).rejects.toThrow();
    await expect(
      s.useCases.listNotifications.execute({ playerId: bob, limit: 51 }),
    ).rejects.toThrow();
  });
});

describe("MarkNotificationRead", () => {
  it("marking a not-yet-visible (PENDING) notification is allowed: ownership only, not visibility", async () => {
    const s = setup();
    await s.handlers.TurnPassed(turnPassed());
    const pending = await s.repository.claimPendingDeliveries(1);
    const id = pending[0]?.notification.id ?? "";

    s.tick();
    await s.useCases.markNotificationRead.execute(id, bob);
    await expect(s.useCases.markNotificationRead.execute(id, alice)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    // Still invisible, and it never counted as unread; once sent it appears already read.
    expect((await visibleFor(s, bob)).items).toHaveLength(0);
    await s.useCases.relayPendingDeliveries.execute();
    const after = await visibleFor(s, bob);
    expect(after.items[0]?.readAt).not.toBeNull();
    expect(after.unreadCount).toBe(0);
  });

  it("marks read idempotently and refuses someone else's notification", async () => {
    const s = setup();
    await s.handlers.TurnPassed(turnPassed());
    await s.useCases.relayPendingDeliveries.execute();
    const id = (await visibleFor(s, bob)).items[0]?.id ?? "";

    await expect(s.useCases.markNotificationRead.execute(id, alice)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      s.useCases.markNotificationRead.execute(crypto.randomUUID(), bob),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    s.tick();
    await s.useCases.markNotificationRead.execute(id, bob);
    const firstReadAt = (await visibleFor(s, bob)).items[0]?.readAt;
    s.tick(60);
    await s.useCases.markNotificationRead.execute(id, bob);
    const after = await visibleFor(s, bob);
    expect(after.items[0]?.readAt).toEqual(firstReadAt ?? new Date(0));
    expect(after.unreadCount).toBe(0);
  });
});

describe("decodeCursor", () => {
  const encode = (raw: string) => Buffer.from(raw).toString("base64url");

  it("rejects a cursor whose id is not a UUID", () => {
    expect(decodeCursor(encode("2026-11-21T20:10:25.502Z|notauuid"))).toBeNull();
    expect(decodeCursor(encode("2026-11-21T20:10:25.502Z|0c1d2e3f-1234"))).toBeNull();
  });

  it("accepts a cursor with a valid date and UUID", () => {
    const id = "0c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f";
    expect(decodeCursor(encode(`2026-11-21T20:10:25.502Z|${id}`))?.id).toBe(id);
  });
});
