import { Migration } from "@mikro-orm/migrations";

export class Migration20261115190702_FriendChallenge extends Migration {
  override name = "Migration20261115190702_FriendChallenge";

  override up(): void | Promise<void> {
    this.addSql(
      `create table "friend_challenge" ("id" uuid not null, "challenger_player_id" uuid not null, "challenged_player_id" uuid not null, "status" varchar(255) not null, "created_at" timestamptz not null, "responded_at" timestamptz null, primary key ("id"));`,
    );
    this.addSql(
      `create index "friend_challenge_incoming_status_index" on "friend_challenge" ("challenged_player_id", "status");`,
    );
    this.addSql(
      `create index "friend_challenge_outgoing_created_index" on "friend_challenge" ("challenger_player_id", "created_at");`,
    );
    this.addSql(
      `create unique index "friend_challenge_pending_pair_unique" on "friend_challenge" ("challenger_player_id", "challenged_player_id") where "status" = 'PENDING';`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table "friend_challenge";`);
  }
}
