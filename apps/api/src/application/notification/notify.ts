import {
  type DeliveryChannel,
  Notification,
  type NotificationData,
  type NotificationRepository,
  type NotificationType,
} from "../../domain/notification";

/** Channels a new Notification is delivered over. EMAIL is not created yet. */
export const DEFAULT_CHANNELS: readonly DeliveryChannel[] = ["IN_APP"];

/**
 * Shared by the event handlers: creates the Notification and its PENDING Deliveries unless this
 * (event, recipient) pair was already handled (idempotent consumer; the unique constraint is the
 * backstop). Runs inside the caller's transaction.
 */
export class NotificationRecorder {
  constructor(
    private readonly notifications: NotificationRepository,
    private readonly now: () => Date,
  ) {}

  async record(input: {
    recipientId: string;
    type: NotificationType;
    eventId: string;
    matchId: string;
    data: NotificationData;
  }): Promise<void> {
    if (await this.notifications.existsForEvent(input.eventId, input.recipientId)) return;
    await this.notifications.save(
      Notification.create(
        crypto.randomUUID(),
        {
          ...input,
          channels: DEFAULT_CHANNELS,
          deliveryIds: DEFAULT_CHANNELS.map(() => crypto.randomUUID()),
        },
        this.now(),
      ),
    );
  }
}
