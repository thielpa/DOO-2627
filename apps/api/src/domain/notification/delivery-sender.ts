import type { DeliveryChannel } from "./delivery";
import type { Notification } from "./notification";

export interface DeliveryRequest {
  /** The Delivery ID: senders must treat a repeated key as the same delivery (at-least-once). */
  idempotencyKey: string;
  notification: Notification;
}

/** Port implemented per channel (IN_APP now; EMAIL is only declared, not implemented). */
export interface DeliverySender {
  readonly channel: DeliveryChannel;
  send(request: DeliveryRequest): Promise<void>;
}
