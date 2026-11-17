import { Migration } from "@mikro-orm/migrations";

export class Migration20261117114143_Notification extends Migration {
  override name = "Migration20261117114143_Notification";

  override up(): void | Promise<void> {
    this.addSql(
      `create table "notification" ("id" uuid not null, "recipient_id" uuid not null, "type" varchar(255) not null, "event_id" uuid not null, "match_id" uuid not null, "data" jsonb not null, "created_at" timestamptz not null, "read_at" timestamptz null, "updated_at" timestamptz not null, primary key ("id"));`,
    );
    this.addSql(
      `create index "notification_recipient_created_index" on "notification" ("recipient_id", "created_at" desc);`,
    );
    this.addSql(
      `alter table "notification" add constraint "notification_event_recipient_unique" unique ("event_id", "recipient_id");`,
    );

    this.addSql(
      `create table "notification_delivery" ("id" uuid not null, "notification_id" uuid not null, "channel" varchar(255) not null, "status" varchar(255) not null default 'PENDING', "attempts" int not null default 0, "last_error" text null, "last_attempt_at" timestamptz null, "sent_at" timestamptz null, primary key ("id"));`,
    );
    this.addSql(
      `create index "notification_delivery_notification_channel_status_index" on "notification_delivery" ("notification_id", "channel", "status");`,
    );
    this.addSql(
      `create index "notification_delivery_pending_index" on "notification_delivery" ("last_attempt_at" asc nulls first, "id") where "status" = 'PENDING';`,
    );

    this.addSql(
      `alter table "notification_delivery" add constraint "notification_delivery_notification_id_foreign" foreign key ("notification_id") references "notification" ("id") on delete cascade;`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(
      `alter table "notification_delivery" drop constraint "notification_delivery_notification_id_foreign";`,
    );

    this.addSql(`drop table if exists "notification" cascade;`);
    this.addSql(`drop table if exists "notification_delivery" cascade;`);
  }
}
