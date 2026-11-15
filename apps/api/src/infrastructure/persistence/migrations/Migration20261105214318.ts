import { Migration } from "@mikro-orm/migrations";

export class Migration20261105214318 extends Migration {
  override name = "Migration20261105214318";

  override up(): void | Promise<void> {
    this.addSql(
      `create table "category" ("id" varchar(255) not null, "name" varchar(255) not null, primary key ("id"));`,
    );

    this.addSql(
      `create table "lobby" ("id" uuid not null, "mode" varchar(255) not null, "status" varchar(255) not null, "players" text[] not null, "match_id" uuid null, primary key ("id"));`,
    );
    this.addSql(`create index "lobby_status_index" on "lobby" ("status");`);

    this.addSql(
      `create table "match" ("id" uuid not null, "mode" varchar(255) not null, "difficulty" varchar(255) not null, "status" varchar(255) not null, "players" text[] not null, "rounds" jsonb not null, "started_at" timestamptz not null, primary key ("id"));`,
    );

    this.addSql(
      `create table "question" ("id" varchar(255) not null, "category_id" varchar(255) not null, "text" varchar(255) not null, "difficulty" varchar(255) not null, "time_limit_ms" int not null, "options" jsonb not null, primary key ("id"));`,
    );
    this.addSql(`create index "question_category_id_index" on "question" ("category_id");`);
  }
}
