import { LockMode, QueryOrder, UniqueConstraintViolationException } from "@mikro-orm/core";
import type { EntityManager } from "@mikro-orm/postgresql";
import { Delivery } from "../../../domain/notification/delivery";
import { Notification } from "../../../domain/notification/notification";
import type {
  ClaimedDelivery,
  ListOptions,
  NotificationRepository,
  PollingState,
} from "../../../domain/notification/repositories";
import { DomainError } from "../../../domain/shared/domain-error";
import { NOTIFICATION_EVENT_RECIPIENT_UNIQUE } from "../schemas/notification.schema";

// Visible = the IN_APP delivery has been SENT by the relay.
const VISIBLE = { _channel: "IN_APP", _status: "SENT" } as const;
const WITH_DELIVERIES = ["_deliveries"] as never;
const WITH_NOTIFICATION = ["_notification", "_notification._deliveries"] as never;

export class MikroOrmNotificationRepository implements NotificationRepository {
  constructor(private readonly em: EntityManager) {}

  async save(notification: Notification): Promise<void> {
    try {
      await this.em.persist(notification).flush();
    } catch (error) {
      if (
        error instanceof UniqueConstraintViolationException &&
        (error as UniqueConstraintViolationException & { constraint?: unknown }).constraint ===
          NOTIFICATION_EVENT_RECIPIENT_UNIQUE
      ) {
        throw new DomainError("CONFLICT", "Notification already exists for this event");
      }
      throw error;
    }
  }

  byIdForRecipient(id: string, recipientId: string): Promise<Notification | null> {
    return this.em.findOne(Notification, { _id: id, _recipientId: recipientId } as object, {
      populate: WITH_DELIVERIES,
    });
  }

  async existsForEvent(eventId: string, recipientId: string): Promise<boolean> {
    const count = await this.em.count(Notification, {
      _eventId: eventId,
      _recipientId: recipientId,
    } as object);
    return count > 0;
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

  async pollingState(recipientId: string): Promise<PollingState> {
    const rows = await this.em.execute<
      { visible_count: number; unread_count: number; last_updated_at: Date | string | null }[]
    >(
      `select count(*)::int as visible_count,
              (count(*) filter (where n.read_at is null))::int as unread_count,
              max(n.updated_at) as last_updated_at
         from notification n
         join notification_delivery d on d.notification_id = n.id
        where n.recipient_id = ? and d.channel = 'IN_APP' and d.status = 'SENT'`,
      [recipientId],
    );
    const row = rows[0];
    return {
      visibleCount: Number(row?.visible_count ?? 0),
      unreadCount: Number(row?.unread_count ?? 0),
      lastUpdatedAt: row?.last_updated_at ? new Date(row.last_updated_at) : null,
    };
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
