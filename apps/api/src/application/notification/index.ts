import type { DeliverySender, NotificationRepository } from "../../domain/notification";
import type {
  DomainEventHandler,
  MatchCompleted,
  MatchExpired,
  TurnPassed,
} from "../../domain/shared/events";
import type { Transaction } from "../transaction";
import { NotifyOnMatchCompleted, NotifyOnMatchExpired, NotifyOnTurnPassed } from "./event-handlers";
import { InAppSender } from "./in-app-sender";
import { ListNotifications } from "./list-notifications";
import { MarkNotificationRead } from "./mark-notification-read";
import { NotificationRecorder } from "./notify";
import { DEFAULT_MAX_ATTEMPTS, RelayPendingDeliveries } from "./relay-pending-deliveries";

export { NotifyOnMatchCompleted, NotifyOnMatchExpired, NotifyOnTurnPassed } from "./event-handlers";
export { InAppSender } from "./in-app-sender";
export type { ListNotificationsResult } from "./list-notifications";
export { InvalidNotificationQuery, MAX_LIMIT } from "./list-notifications";
export type { NotificationView } from "./notification-view";
export type { RelayResult } from "./relay-pending-deliveries";

/** Handlers the Match context's in-process dispatcher registers, by event name. */
export interface NotificationEventHandlers {
  TurnPassed: DomainEventHandler<TurnPassed>;
  MatchCompleted: DomainEventHandler<MatchCompleted>;
  MatchExpired: DomainEventHandler<MatchExpired>;
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
    TurnPassed: new NotifyOnTurnPassed(recorder),
    MatchCompleted: new NotifyOnMatchCompleted(recorder),
    MatchExpired: new NotifyOnMatchExpired(recorder),
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
