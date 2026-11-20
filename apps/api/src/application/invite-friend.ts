import {
  DomainError,
  FriendChallenge,
  type FriendChallengeRepository,
  type PlayerRepository,
} from "../domain";
import { type FriendChallengeView, friendChallengeView } from "./friend-challenge-view";
import type { Transaction } from "./transaction";

export class InviteFriend {
  constructor(
    private readonly players: PlayerRepository,
    private readonly challenges: FriendChallengeRepository,
    private readonly transaction: Transaction,
    private readonly now: () => Date,
  ) {}

  execute(challengerPlayerId: string, username: string): Promise<FriendChallengeView> {
    return this.transaction.run(async () => {
      const [challenger, challenged] = await Promise.all([
        this.players.byId(challengerPlayerId),
        this.players.byUsername(username),
      ]);
      if (!challenged) throw new DomainError("NOT_FOUND", "Player not found");
      if (!challenger) throw new DomainError("NOT_FOUND", "Player not found");
      if (challenger.id === challenged.id) {
        throw new DomainError("CONFLICT", "A Player cannot challenge themselves");
      }
      if (await this.challenges.pendingBetween(challenger.id, challenged.id)) {
        throw new DomainError("CONFLICT", "A pending challenge already exists");
      }

      const challenge = FriendChallenge.create(
        crypto.randomUUID(),
        challenger.id,
        challenged.id,
        this.now(),
      );
      await this.challenges.save(challenge);
      return friendChallengeView(challenge, this.players);
    });
  }
}
