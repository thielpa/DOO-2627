import { Delivery } from "../../../domain/notification/delivery";
import { Notification } from "../../../domain/notification/notification";
import { privateStateSchema } from "./private-state";

export const NOTIFICATION_EVENT_RECIPIENT_UNIQUE = "notification_event_recipient_unique";

export const NotificationSchema = privateStateSchema(Notification, {
  tableName: "notification",
  properties: {
    _id: { type: "uuid", primary: true, fieldName: "id" },
    _recipientId: { type: "uuid", fieldName: "recipient_id" },
    _type: { type: "string", fieldName: "type" },
    _eventId: { type: "uuid", fieldName: "event_id" },
    _matchId: { type: "uuid", fieldName: "match_id" },
    _data: { type: "json", fieldName: "data" },
    _createdAt: { type: "datetime", fieldName: "created_at" },
    _readAt: { type: "datetime", fieldName: "read_at", nullable: true },
    _updatedAt: { type: "datetime", fieldName: "updated_at" },
    _deliveries: {
      kind: "1:m",
      entity: () => Delivery,
      // The typed form is a property accessor, but the property is private state; the name works.
      mappedBy: "_notification" as never,
      orphanRemoval: true,
    },
  },
  indexes: [
    {
      name: "notification_recipient_created_index",
      expression:
        'create index "notification_recipient_created_index" on "notification" ("recipient_id", "created_at" desc);',
    },
  ],
  uniques: [
    {
      name: NOTIFICATION_EVENT_RECIPIENT_UNIQUE,
      properties: ["_eventId", "_recipientId"],
    },
  ],
});

export const DeliverySchema = privateStateSchema(Delivery, {
  tableName: "notification_delivery",
  properties: {
    _id: { type: "uuid", primary: true, fieldName: "id" },
    _notification: {
      kind: "m:1",
      entity: () => Notification,
      fieldName: "notification_id",
      deleteRule: "cascade",
    },
    _channel: { type: "string", fieldName: "channel" },
    _status: { type: "string", fieldName: "status" },
    _attempts: { type: "integer", fieldName: "attempts" },
    _lastError: { type: "text", fieldName: "last_error", nullable: true },
    _lastAttemptAt: { type: "datetime", fieldName: "last_attempt_at", nullable: true },
    _sentAt: { type: "datetime", fieldName: "sent_at", nullable: true },
  },
  indexes: [
    // Visibility lookups (list / unread count / ETag state): per notification, IN_APP + SENT.
    // Its leading column also serves the foreign key.
    {
      name: "notification_delivery_notification_channel_status_index",
      properties: ["_notification", "_channel", "_status"],
    },
    // Relay claim: only PENDING rows, in claim order (never tried first, then least recent).
    {
      name: "notification_delivery_pending_index",
      expression:
        'create index "notification_delivery_pending_index" on "notification_delivery" ("last_attempt_at" asc nulls first, "id") where "status" = \'PENDING\';',
    },
  ],
});
