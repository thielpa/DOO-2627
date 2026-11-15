import { Migration } from "@mikro-orm/migrations";

export class Migration20261105220737 extends Migration {
  override name = "Migration20261105220737";

  override up(): void | Promise<void> {
    // Existing lobbies get the migration time as creation time.
    this.addSql(`alter table "lobby" add "created_at" timestamptz not null default now();`);
    this.addSql(`alter table "lobby" alter column "created_at" drop default;`);

    this.addSql(`alter table "match" alter column "started_at" drop not null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "lobby" drop column "created_at";`);

    this.addSql(`alter table "match" alter column "started_at" set not null;`);
  }
}
