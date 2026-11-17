import type { NotificationRepository } from "../../domain/notification";
import { decodeCursor, encodeCursor } from "./cursor";
import { type NotificationView, notificationView } from "./notification-view";

/** The caller sent a malformed `since` cursor or an out-of-range `limit`. */
export class InvalidNotificationQuery extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidNotificationQuery";
  }
}

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;

export interface ListNotificationsInput {
  playerId: string;
  /** Cursor returned by a previous call; only newer items are returned. */
  since?: string;
  limit?: number;
}

export interface ListNotificationsResult {
  items: NotificationView[];
  unreadCount: number;
  cursor: string | null;
}

/**
 * Polling read model. With a cursor (`since`) only items that became visible after it are
 * returned; the cursor in the result is the position of the newest visible item.
 */
export class ListNotifications {
  constructor(private readonly notifications: NotificationRepository) {}

  async execute(input: ListNotificationsInput): Promise<ListNotificationsResult> {
    const limit = input.limit ?? DEFAULT_LIMIT;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      throw new InvalidNotificationQuery(`limit must be between 1 and ${MAX_LIMIT}`);
    }
    const after = input.since === undefined ? undefined : decodeCursor(input.since);
    if (after === null) throw new InvalidNotificationQuery("Invalid cursor");

    const found = await this.notifications.listForRecipient(input.playerId, { after, limit });
    const newest = found[0];
    const newestVisibleAt = newest?.visibleAt();
    const cursor =
      newest && newestVisibleAt
        ? encodeCursor({ visibleAt: newestVisibleAt, id: newest.id })
        : (input.since ?? null);
    return {
      items: found.map(notificationView),
      unreadCount: await this.notifications.unreadCount(input.playerId),
      cursor,
    };
  }
}
