import type { Notification, NotificationData, NotificationType } from "../../domain/notification";

export interface NotificationView {
  id: string;
  type: NotificationType;
  matchId: string;
  data: NotificationData;
  createdAt: Date;
  readAt: Date | null;
}

export function notificationView(notification: Notification): NotificationView {
  return {
    id: notification.id,
    type: notification.type,
    matchId: notification.matchId,
    data: notification.data,
    createdAt: notification.createdAt,
    readAt: notification.readAt,
  };
}
