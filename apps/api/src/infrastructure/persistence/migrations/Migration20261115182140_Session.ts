import { Migration } from "@mikro-orm/migrations";

export class Migration20261115182140_Session extends Migration {
  override name = "Migration20261115182140_Session";

  override up(): void | Promise<void> {
    this.addSql(
      `create table "session" ("id" uuid not null, "player_id" uuid not null, "token_digest" varchar(64) not null, "expires_at" timestamptz not null, "invalidated_at" timestamptz null, constraint "session_pkey" primary key ("id"));`,
    );
    this.addSql(`create index "session_player_id_index" on "session" ("player_id");`);
    this.addSql(
      `alter table "session" add constraint "session_token_digest_unique" unique ("token_digest");`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table "session";`);
  }
}
