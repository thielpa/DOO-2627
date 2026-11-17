import type { Delivery } from "./delivery";
import type { Notification } from "./notification";

export interface ListOptions {
  /** Opaque cursor from a previous page: only newer items are returned. */
  after?: NotificationCursor;
  limit: number;
}

/** Position of an item in the visible stream: when it became visible, then its ID. */
export interface NotificationCursor {
  visibleAt: Date;
  id: string;
}

export interface PollingState {
  visibleCount: number;
  unreadCount: number;
  lastUpdatedAt: Date | null;
}

export interface ClaimedDelivery {
  notification: Notification;
  delivery: Delivery;
}

export interface NotificationRepository {
  save(notification: Notification): Promise<void>;
  byIdForRecipient(id: string, recipientId: string): Promise<Notification | null>;
  existsForEvent(eventId: string, recipientId: string): Promise<boolean>;
  /**
   * Visible (IN_APP SENT) notifications, always returned newest first (ordered by sentAt, id).
   * Without `after`: the newest `limit`. With `after`: the OLDEST `limit` items newer than the
   * cursor, so the caller advances to the newest returned item and never skips a backlog.
   */
  listForRecipient(recipientId: string, options: ListOptions): Promise<Notification[]>;
  unreadCount(recipientId: string): Promise<number>;
  /** Cheap aggregate over visible notifications; the basis of the polling ETag. */
  pollingState(recipientId: string): Promise<PollingState>;
  /**
   * Locks up to `limit` PENDING deliveries with FOR UPDATE SKIP LOCKED so concurrent relays
   * never take the same row. Call inside Transaction.run: locks last until it ends.
   */
  claimPendingDeliveries(limit: number): Promise<ClaimedDelivery[]>;
}
