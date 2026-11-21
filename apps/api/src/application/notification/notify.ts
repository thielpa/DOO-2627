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
 * Shared by the event handlers: creates the Notification and its PENDING Deliveries. A repeated
 * (event, recipient) pair is ignored by the database (idempotent consumer), so a redelivered event
 * never fails the transaction of the match it came from. Runs inside the caller's transaction.
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
    await this.notifications.addIfAbsent(
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

/** How a match ended from one player's point of view. */
export type Outcome = "WON" | "LOST" | "DRAW" | "NO_WINNER";

export function outcomeFor(playerId: string, winnerId: string | null, noWinner: Outcome): Outcome {
  if (winnerId === null) return noWinner;
  return winnerId === playerId ? "WON" : "LOST";
}
