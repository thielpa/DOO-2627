import { Migration } from "@mikro-orm/migrations";

export class Migration20261118152418 extends Migration {
  override name = "Migration20261118152418";

  override up(): void | Promise<void> {
    this.addSql(
      `create unique index "friend_challenge_pending_unordered_pair_unique" on "friend_challenge" (least("challenger_player_id", "challenged_player_id"), greatest("challenger_player_id", "challenged_player_id")) where "status" = 'PENDING';`,
    );
    this.addSql(
      `create unique index "player_username_lower_unique" on "player" (lower("username"));`,
    );
    this.addSql(`drop index "friend_challenge_pending_pair_unique";`);
    this.addSql(`drop index "player_username_unique";`);
  }

  override down(): void | Promise<void> {
    this.addSql(`create unique index "player_username_unique" on "player" ("username");`);
    this.addSql(
      `create unique index "friend_challenge_pending_pair_unique" on "friend_challenge" ("challenger_player_id", "challenged_player_id") where "status" = 'PENDING';`,
    );
    this.addSql(`drop index "player_username_lower_unique";`);
    this.addSql(`drop index "friend_challenge_pending_unordered_pair_unique";`);
  }
}
