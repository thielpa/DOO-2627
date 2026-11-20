import { Migration } from "@mikro-orm/migrations";

export class Migration20261116230032_MatchExpiry extends Migration {
  override name = "Migration20261116230032_MatchExpiry";

  override up(): void | Promise<void> {
    // Existing matches get the default turn time limit of 24 hours.
    this.addSql(
      `alter table "match" add "turn_timeout_ms" int not null default 86400000, add "turn_deadline" timestamptz null, add "expired_by" varchar(255) null;`,
    );
    this.addSql(`alter table "match" alter column "turn_timeout_ms" drop default;`);
    // Running matches get a fresh deadline; without one they could never expire.
    this.addSql(
      `update "match" set "turn_deadline" = now() + interval '24 hours' where "status" = 'STARTED';`,
    );
    this.addSql(
      `create index "match_status_turn_deadline_index" on "match" ("status", "turn_deadline");`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(`drop index "match_status_turn_deadline_index";`);
    this.addSql(
      `alter table "match" drop column "turn_timeout_ms", drop column "turn_deadline", drop column "expired_by";`,
    );
  }
}
