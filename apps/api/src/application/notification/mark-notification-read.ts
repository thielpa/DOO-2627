import type { NotificationRepository } from "../../domain/notification";
import { DomainError } from "../../domain/shared/domain-error";
import type { Transaction } from "../transaction";

export class MarkNotificationRead {
  constructor(
    private readonly notifications: NotificationRepository,
    private readonly transaction: Transaction,
    private readonly now: () => Date,
  ) {}

  /** Idempotent. A notification that is not the caller's looks like it does not exist. */
  execute(notificationId: string, playerId: string): Promise<void> {
    return this.transaction.run(async () => {
      const notification = await this.notifications.byIdForRecipient(notificationId, playerId);
      if (!notification) throw new DomainError("NOT_FOUND", "Notification not found");
      if (notification.readAt) return;
      notification.markRead(this.now());
      await this.notifications.save(notification);
    });
  }
}
