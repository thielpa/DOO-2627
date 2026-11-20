import { Migration } from "@mikro-orm/migrations";

export class Migration20261115173029 extends Migration {
  override name = "Migration20261115173029";

  override up(): void | Promise<void> {
    this.addSql(
      `create table "player" ("id" uuid not null, "username" varchar(255) not null, "password_hash" varchar(255) not null, constraint "player_pkey" primary key ("id"));`,
    );
    this.addSql(`create unique index "player_username_unique" on "player" ("username");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table "player";`);
  }
}
