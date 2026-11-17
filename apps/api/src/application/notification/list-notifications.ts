import { createHash } from "node:crypto";
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
  /** Value of the client's If-None-Match header. */
  ifNoneMatch?: string | null;
}

export type ListNotificationsResult =
  | { notModified: true; etag: string }
  | {
      notModified: false;
      etag: string;
      items: NotificationView[];
      unreadCount: number;
      cursor: string | null;
    };

/**
 * Polling read model. The ETag is derived from the recipient's polling state (visible count,
 * latest updatedAt, unread count) plus the request's since/limit, so an unchanged state answers
 * 304 before any item is loaded. The cursor is the position of the newest visible item.
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

    const state = await this.notifications.pollingState(input.playerId);
    const etag = etagOf([
      state.visibleCount,
      state.unreadCount,
      state.lastUpdatedAt?.toISOString() ?? "",
      input.since ?? "",
      limit,
    ]);
    if (input.ifNoneMatch && matches(input.ifNoneMatch, etag)) return { notModified: true, etag };

    const found = await this.notifications.listForRecipient(input.playerId, { after, limit });
    const newest = found[0];
    const newestVisibleAt = newest?.visibleAt();
    const cursor =
      newest && newestVisibleAt
        ? encodeCursor({ visibleAt: newestVisibleAt, id: newest.id })
        : (input.since ?? null);
    return {
      notModified: false,
      etag,
      items: found.map(notificationView),
      unreadCount: state.unreadCount,
      cursor,
    };
  }
}

function etagOf(parts: readonly (string | number)[]): string {
  return `W/"${createHash("sha1").update(parts.join("|")).digest("base64url")}"`;
}

function matches(header: string, etag: string): boolean {
  const strip = (tag: string) => tag.trim().replace(/^W\//, "");
  return header
    .split(",")
    .some((candidate) => candidate.trim() === "*" || strip(candidate) === strip(etag));
}
