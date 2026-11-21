import type { DeliverySender, NotificationRepository } from "../../domain/notification";
import type { Transaction } from "../transaction";

export const DEFAULT_RELAY_BATCH_SIZE = 50;
export const DEFAULT_MAX_ATTEMPTS = 5;

export interface RelayResult {
  claimed: number;
  sent: number;
  failed: number;
}

/**
 * Polling publisher: one relay cycle. Claims a batch of PENDING deliveries (SKIP LOCKED), makes
 * one attempt each through the sender of its channel, records the outcome and saves, all in one
 * transaction. A failed attempt stays PENDING for the next cycle until maxAttempts, then FAILED.
 */
export class RelayPendingDeliveries {
  constructor(
    private readonly notifications: NotificationRepository,
    private readonly senders: readonly DeliverySender[],
    private readonly transaction: Transaction,
    private readonly now: () => Date,
    private readonly maxAttempts: number = DEFAULT_MAX_ATTEMPTS,
    private readonly batchSize: number = DEFAULT_RELAY_BATCH_SIZE,
  ) {}

  execute(): Promise<RelayResult> {
    return this.transaction.run(async () => {
      const claimed = await this.notifications.claimPendingDeliveries(this.batchSize);
      const result: RelayResult = { claimed: claimed.length, sent: 0, failed: 0 };

      for (const { notification, delivery } of claimed) {
        const sender = this.senders.find((candidate) => candidate.channel === delivery.channel);
        try {
          if (!sender) throw new Error(`No sender for channel ${delivery.channel}`);
          await sender.send({ idempotencyKey: delivery.id, notification });
          notification.recordDeliverySuccess(delivery.id, this.now());
          result.sent += 1;
        } catch (error) {
          notification.recordDeliveryFailure(
            delivery.id,
            error instanceof Error ? error.message : String(error),
            this.now(),
            this.maxAttempts,
          );
          result.failed += 1;
        }
        await this.notifications.save(notification);
      }
      return result;
    });
  }
}
