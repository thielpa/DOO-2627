import type { DeliverySender, NotificationRepository } from "../../domain/notification";
import type { MatchCompleted, MatchExpired, TurnPassed } from "../../domain/shared/events";
import type { Transaction } from "../transaction";
import { InAppSender } from "./in-app-sender";
import { ListNotifications } from "./list-notifications";
import { MarkNotificationRead } from "./mark-notification-read";
import { NotificationRecorder } from "./notify";
import { notifyOnMatchCompleted } from "./notify-on-match-completed";
import { notifyOnMatchExpired } from "./notify-on-match-expired";
import { notifyOnTurnPassed } from "./notify-on-turn-passed";
import { DEFAULT_MAX_ATTEMPTS, RelayPendingDeliveries } from "./relay-pending-deliveries";

export { InAppSender } from "./in-app-sender";
export type { ListNotificationsResult } from "./list-notifications";
export { InvalidNotificationQuery, MAX_LIMIT } from "./list-notifications";
export type { NotificationView } from "./notification-view";
export type { RelayResult } from "./relay-pending-deliveries";

/**
 * Handlers for the events of the Match context, by event type, to subscribe on the event
 * dispatcher (see main.ts). They run in the transaction that dispatched the event.
 */
export interface NotificationEventHandlers {
  TurnPassed: (event: TurnPassed) => Promise<void>;
  MatchCompleted: (event: MatchCompleted) => Promise<void>;
  MatchExpired: (event: MatchExpired) => Promise<void>;
}

export interface NotificationOptions {
  /** Senders by channel; defaults to the IN_APP sender only. */
  senders?: readonly DeliverySender[];
  maxAttempts?: number;
}

export function createNotificationUseCases(
  notifications: NotificationRepository,
  transaction: Transaction,
  now: () => Date,
  options: NotificationOptions = {},
) {
  const recorder = new NotificationRecorder(notifications, now);
  const notificationEventHandlers: NotificationEventHandlers = {
    TurnPassed: notifyOnTurnPassed(recorder),
    MatchCompleted: notifyOnMatchCompleted(recorder),
    MatchExpired: notifyOnMatchExpired(recorder),
  };
  return {
    notificationEventHandlers,
    listNotifications: new ListNotifications(notifications),
    markNotificationRead: new MarkNotificationRead(notifications, transaction, now),
    relayPendingDeliveries: new RelayPendingDeliveries(
      notifications,
      options.senders ?? [new InAppSender()],
      transaction,
      now,
      options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    ),
  };
}
