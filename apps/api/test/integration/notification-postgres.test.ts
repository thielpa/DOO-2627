import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { MikroORM } from "@mikro-orm/postgresql";
import { createNotificationUseCases } from "../../src/application/notification";
import { encodeCursor } from "../../src/application/notification/cursor";
import { type DeliverySender, DomainError, Notification } from "../../src/domain";
import config from "../../src/infrastructure/persistence/mikro-orm.config";
import { MikroOrmTransaction } from "../../src/infrastructure/persistence/mikro-orm-transaction";
import { MikroOrmNotificationRepository } from "../../src/infrastructure/persistence/repositories/mikro-orm-notification.repository";
import { requireNotificationTestDatabaseUrl } from "./notification-test-database";

const testDatabaseUrl = requireNotificationTestDatabaseUrl(
  process.env.NOTIFICATION_TEST_DATABASE_URL,
);

describe("Notification PostgreSQL integration", () => {
  let orm: MikroORM;

  beforeAll(async () => {
    orm = await MikroORM.init({
      ...config,
      clientUrl: testDatabaseUrl,
      // Keep the committed snapshot untouched: this is a throwaway database.
      migrations: { ...config.migrations, snapshot: false },
    });
    // Dedicated database (see the guard): start from an empty schema and apply the real migrations.
    const connection = orm.em.getConnection();
    await connection.execute("drop schema public cascade");
    await connection.execute("create schema public");
    await orm.migrator.up();
  });

  afterAll(async () => {
    if (orm) await orm.close(true);
  });

  // Match the production request-scoped EM: repositories resolve the transactional fork.
  const requestEm = () => orm.em.fork({ useContext: true });

  function useCasesWith(
    now: () => Date,
    options: { senders?: DeliverySender[]; maxAttempts?: number } = {},
  ) {
    const em = requestEm();
    return createNotificationUseCases(
      new MikroOrmNotificationRepository(em),
      new MikroOrmTransaction(em),
      now,
      options,
    );
  }

  function newNotification(overrides: { recipientId?: string; eventId?: string } = {}) {
    return Notification.create(
      crypto.randomUUID(),
      {
        recipientId: overrides.recipientId ?? crypto.randomUUID(),
        type: "MATCH_COMPLETED",
        eventId: overrides.eventId ?? crypto.randomUUID(),
        matchId: crypto.randomUUID(),
        data: { outcome: "WON", winnerId: null },
        channels: ["IN_APP"],
        deliveryIds: [crypto.randomUUID()],
      },
      new Date("2026-11-17T10:00:00Z"),
    );
  }

  /** Deliveries left PENDING by earlier tests would be claimed by later ones; settle them. */
  async function drainPending() {
    while ((await useCasesWith(() => new Date()).relayPendingDeliveries.execute()).claimed > 0);
  }

  it("persists a Notification with its deliveries and reads it back", async () => {
    const notification = newNotification();
    await new MikroOrmNotificationRepository(requestEm()).save(notification);

    const loaded = await new MikroOrmNotificationRepository(requestEm()).byIdForRecipient(
      notification.id,
      notification.recipientId,
    );
    expect(loaded?.eventId).toBe(notification.eventId);
    expect(loaded?.data).toEqual({ outcome: "WON", winnerId: null });
    expect(loaded?.readAt).toBeNull();
    expect(loaded?.deliveries).toHaveLength(1);
    expect(loaded?.deliveries[0]).toMatchObject({
      id: notification.deliveries[0]?.id,
      channel: "IN_APP",
      status: "PENDING",
      attempts: 0,
    });
    expect(
      await new MikroOrmNotificationRepository(requestEm()).byIdForRecipient(
        notification.id,
        crypto.randomUUID(),
      ),
    ).toBeNull();
  });

  it("enforces UNIQUE (event_id, recipient_id) and reports existsForEvent", async () => {
    const first = newNotification();
    await new MikroOrmNotificationRepository(requestEm()).save(first);
    expect(
      await new MikroOrmNotificationRepository(requestEm()).existsForEvent(
        first.eventId,
        first.recipientId,
      ),
    ).toBe(true);
    expect(
      await new MikroOrmNotificationRepository(requestEm()).existsForEvent(
        first.eventId,
        crypto.randomUUID(),
      ),
    ).toBe(false);

    const duplicate = newNotification({ eventId: first.eventId, recipientId: first.recipientId });
    await expect(
      new MikroOrmNotificationRepository(requestEm()).save(duplicate),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      new MikroOrmNotificationRepository(requestEm()).save(
        newNotification({ eventId: first.eventId, recipientId: first.recipientId }),
      ),
    ).rejects.toBeInstanceOf(DomainError);

    // Same event for another recipient is fine (MatchCompleted notifies both players).
    await new MikroOrmNotificationRepository(requestEm()).save(
      newNotification({ eventId: first.eventId }),
    );
  });

  it("relays deliveries, lists with cursor/ETag state, and marks read", async () => {
    await drainPending();
    const recipientId = crypto.randomUUID();
    let clock = new Date("2026-11-17T12:00:00Z");
    const tick = () => {
      clock = new Date(clock.getTime() + 1000);
      return clock;
    };
    for (let i = 0; i < 3; i++) {
      await new MikroOrmNotificationRepository(requestEm()).save(newNotification({ recipientId }));
    }

    const before = await useCasesWith(tick).listNotifications.execute({ playerId: recipientId });
    expect(before).toMatchObject({ notModified: false, items: [], unreadCount: 0, cursor: null });

    const relayed = await useCasesWith(tick).relayPendingDeliveries.execute();
    expect(relayed).toEqual({ claimed: 3, sent: 3, failed: 0 });

    const page = await useCasesWith(tick).listNotifications.execute({
      playerId: recipientId,
      limit: 2,
    });
    if (page.notModified) throw new Error("unexpected 304");
    expect(page.items).toHaveLength(2);
    expect(page.unreadCount).toBe(3);
    const cursor = page.cursor ?? "";

    const unchanged = await useCasesWith(tick).listNotifications.execute({
      playerId: recipientId,
      limit: 2,
      ifNoneMatch: page.etag,
    });
    expect(unchanged).toEqual({ notModified: true, etag: page.etag });

    const nothingNewer = await useCasesWith(tick).listNotifications.execute({
      playerId: recipientId,
      since: cursor,
    });
    if (nothingNewer.notModified) throw new Error("unexpected 304");
    expect(nothingNewer.items).toEqual([]);
    expect(nothingNewer.cursor).toBe(cursor);

    const firstId = page.items[0]?.id ?? "";
    await useCasesWith(tick).markNotificationRead.execute(firstId, recipientId);
    await useCasesWith(tick).markNotificationRead.execute(firstId, recipientId);
    const afterRead = await useCasesWith(tick).listNotifications.execute({
      playerId: recipientId,
      limit: 2,
      ifNoneMatch: page.etag,
    });
    if (afterRead.notModified) throw new Error("ETag should change after a read");
    expect(afterRead.unreadCount).toBe(2);
    expect(afterRead.items.find((item) => item.id === firstId)?.readAt).not.toBeNull();
    await expect(
      useCasesWith(tick).markNotificationRead.execute(firstId, crypto.randomUUID()),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("delivers a backlog larger than limit across successive polls, ties broken by id", async () => {
    await drainPending();
    const recipientId = crypto.randomUUID();
    const clock = new Date("2026-11-17T13:00:00Z"); // fixed: every item shares one sentAt
    for (let i = 0; i < 5; i++) {
      await new MikroOrmNotificationRepository(requestEm()).save(newNotification({ recipientId }));
    }
    await useCasesWith(() => clock).relayPendingDeliveries.execute();

    const seen: string[] = [];
    let cursor: string | undefined = encodeCursor({
      visibleAt: new Date("2000-01-01T00:00:00Z"),
      id: "00000000-0000-0000-0000-000000000000",
    });
    const sizes: number[] = [];
    for (let poll = 0; poll < 6; poll++) {
      const page = await useCasesWith(() => clock).listNotifications.execute({
        playerId: recipientId,
        since: cursor,
        limit: 2,
      });
      if (page.notModified) throw new Error("unexpected 304");
      if (page.items.length === 0) break;
      sizes.push(page.items.length);
      const ids = page.items.map((item) => item.id);
      expect(ids).toEqual([...ids].sort().reverse()); // newest first within a page
      seen.push(...[...ids].reverse()); // oldest first across pages
      cursor = page.cursor ?? undefined;
    }
    expect(sizes).toEqual([2, 2, 1]);
    expect(new Set(seen).size).toBe(5);
    // Ties on sentAt are broken by id, so successive pages walk the ids in ascending order.
    expect(seen).toEqual([...seen].sort());
  });

  it("persists attempts and ends FAILED after max attempts", async () => {
    await drainPending();
    const notification = newNotification();
    await new MikroOrmNotificationRepository(requestEm()).save(notification);
    const failing: DeliverySender = {
      channel: "IN_APP",
      send: async () => {
        throw new Error("sender down");
      },
    };
    const now = () => new Date("2026-11-17T13:00:00Z");

    await useCasesWith(now, {
      senders: [failing],
      maxAttempts: 2,
    }).relayPendingDeliveries.execute();
    const afterOne = await new MikroOrmNotificationRepository(requestEm()).byIdForRecipient(
      notification.id,
      notification.recipientId,
    );
    expect(afterOne?.deliveries[0]).toMatchObject({
      status: "PENDING",
      attempts: 1,
      lastError: "sender down",
    });

    await useCasesWith(now, {
      senders: [failing],
      maxAttempts: 2,
    }).relayPendingDeliveries.execute();
    const afterTwo = await new MikroOrmNotificationRepository(requestEm()).byIdForRecipient(
      notification.id,
      notification.recipientId,
    );
    expect(afterTwo?.deliveries[0]).toMatchObject({ status: "FAILED", attempts: 2 });
    expect(
      await useCasesWith(now, { senders: [failing] }).relayPendingDeliveries.execute(),
    ).toMatchObject({ claimed: 0 });
  });

  it("claims with FOR UPDATE SKIP LOCKED so concurrent relays never share a delivery", async () => {
    await drainPending();
    for (let i = 0; i < 4; i++) {
      await new MikroOrmNotificationRepository(requestEm()).save(newNotification());
    }

    let releaseA: () => void = () => {};
    const aHoldsLock = new Promise<void>((resolve) => {
      releaseA = resolve;
    });
    let signalAClaimed: () => void = () => {};
    const aClaimed = new Promise<void>((resolve) => {
      signalAClaimed = resolve;
    });

    const emA = requestEm();
    const relayA = new MikroOrmTransaction(emA).run(async () => {
      const claimed = await new MikroOrmNotificationRepository(emA).claimPendingDeliveries(2);
      signalAClaimed();
      await aHoldsLock; // keep the row locks while B runs
      return claimed.map(({ delivery }) => delivery.id);
    });
    await aClaimed;

    const emB = requestEm();
    const idsB = await new MikroOrmTransaction(emB).run(async () =>
      (await new MikroOrmNotificationRepository(emB).claimPendingDeliveries(10)).map(
        ({ delivery }) => delivery.id,
      ),
    );
    releaseA();
    const idsA = await relayA;

    expect(idsA).toHaveLength(2);
    expect(idsB).toHaveLength(2); // B skipped A's locked rows instead of waiting or duplicating
    expect(idsA.filter((id) => idsB.includes(id))).toEqual([]);
  });
});
