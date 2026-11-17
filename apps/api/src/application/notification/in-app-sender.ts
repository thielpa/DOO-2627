import type { DeliverySender } from "../../domain/notification";

/**
 * IN_APP "delivery" is just making the Notification visible: the relay marks the Delivery SENT
 * and the bell's polling endpoint then lists it. Nothing external to call, so it always succeeds.
 */
export class InAppSender implements DeliverySender {
  readonly channel = "IN_APP" as const;

  async send(): Promise<void> {}
}
