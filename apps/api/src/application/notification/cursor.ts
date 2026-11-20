import type { NotificationCursor } from "../../domain/notification";

/** Opaque cursor: base64url("<visibleAt ISO>|<notification id>") of the newest item returned. */
export function encodeCursor(cursor: NotificationCursor): string {
  return Buffer.from(`${cursor.visibleAt.toISOString()}|${cursor.id}`).toString("base64url");
}

/** Returns null for anything that is not a cursor this module produced. */
export function decodeCursor(value: string): NotificationCursor | null {
  const decoded = Buffer.from(value, "base64url").toString("utf8");
  const separator = decoded.indexOf("|");
  if (separator < 0) return null;
  const visibleAt = new Date(decoded.slice(0, separator));
  const id = decoded.slice(separator + 1);
  if (!Number.isFinite(visibleAt.getTime()) || id.length === 0) return null;
  return { visibleAt, id };
}
