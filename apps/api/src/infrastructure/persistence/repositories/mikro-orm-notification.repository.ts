import { LockMode, QueryOrder } from "@mikro-orm/core";
import type { EntityManager } from "@mikro-orm/postgresql";
import { Delivery } from "../../../domain/notification/delivery";
import { Notification } from "../../../domain/notification/notification";
import type {
  ClaimedDelivery,
  ListOptions,
  NotificationRepository,
} from "../../../domain/notification/repositories";

// Visible = the IN_APP delivery has been SENT by the relay.
const VISIBLE = { _channel: "IN_APP", _status: "SENT" } as const;
const WITH_DELIVERIES = ["_deliveries"] as never;
const WITH_NOTIFICATION = ["_notification", "_notification._deliveries"] as never;

export class MikroOrmNotificationRepository implements NotificationRepository {
  constructor(private readonly em: EntityManager) {}

  async save(notification: Notification): Promise<void> {
    await this.em.persist(notification).flush();
  }

  /**
   * Plain SQL instead of the Unit of Work: `ON CONFLICT DO NOTHING` is the only way to ignore a
   * duplicate without aborting the surrounding PostgreSQL transaction. The deliveries are inserted
   * only when the notification row was.
   */
  async addIfAbsent(notification: Notification): Promise<boolean> {
    const inserted = await this.em.execute<{ id: string }[]>(
      `insert into notification (id, recipient_id, type, event_id, match_id, data, created_at, read_at, updated_at)
       values (?, ?, ?, ?, ?, ?::jsonb, ?, null, ?)
       on conflict (event_id, recipient_id) do nothing
       returning id`,
      [
        notification.id,
        notification.recipientId,
        notification.type,
        notification.eventId,
        notification.matchId,
        JSON.stringify(notification.data),
        notification.createdAt,
        notification.updatedAt,
      ],
    );
    if (inserted.length === 0) return false;
    for (const delivery of notification.deliveries) {
      await this.em.execute(
        `insert into notification_delivery (id, notification_id, channel, status, attempts)
         values (?, ?, ?, ?, ?)`,
        [delivery.id, notification.id, delivery.channel, delivery.status, delivery.attempts],
      );
    }
    return true;
  }

  byIdForRecipient(id: string, recipientId: string): Promise<Notification | null> {
    return this.em.findOne(Notification, { _id: id, _recipientId: recipientId } as object, {
      populate: WITH_DELIVERIES,
    });
  }

  async listForRecipient(recipientId: string, options: ListOptions): Promise<Notification[]> {
    const { after, limit } = options;
    const newerThanCursor = after
      ? {
          $or: [
            { _sentAt: { $gt: after.visibleAt } },
            { _sentAt: after.visibleAt, _notification: { _id: { $gt: after.id } } },
          ],
        }
      : {};
    const deliveries = await this.em.find(
      Delivery,
      { ...VISIBLE, _notification: { _recipientId: recipientId }, ...newerThanCursor } as object,
      {
        // Incremental page: the OLDEST `limit` items after the cursor, so a backlog larger than
        // `limit` is delivered over successive polls without skipping any. Returned newest-first.
        orderBy: (after
          ? { _sentAt: QueryOrder.ASC, _notification: { _id: QueryOrder.ASC } }
          : { _sentAt: QueryOrder.DESC, _notification: { _id: QueryOrder.DESC } }) as object,
        limit,
        populate: WITH_NOTIFICATION,
      },
    );
    const notifications = deliveries.map((delivery) => delivery.notification);
    return after ? notifications.reverse() : notifications;
  }

  unreadCount(recipientId: string): Promise<number> {
    return this.em.count(Delivery, {
      ...VISIBLE,
      _notification: { _recipientId: recipientId, _readAt: null },
    } as object);
  }

  /**
   * `select ... for update skip locked` via MikroORM's PESSIMISTIC_PARTIAL_WRITE lock mode.
   * Locks only the delivery rows (select-in strategy avoids joins on a locked query); never-tried
   * deliveries go first, then the least recently attempted.
   */
  async claimPendingDeliveries(limit: number): Promise<ClaimedDelivery[]> {
    const deliveries = await this.em.find(Delivery, { _status: "PENDING" } as object, {
      orderBy: { _lastAttemptAt: QueryOrder.ASC_NULLS_FIRST, _id: QueryOrder.ASC } as object,
      limit,
      lockMode: LockMode.PESSIMISTIC_PARTIAL_WRITE,
      strategy: "select-in",
      populate: WITH_NOTIFICATION,
    });
    return deliveries.map((delivery) => ({ notification: delivery.notification, delivery }));
  }
}
