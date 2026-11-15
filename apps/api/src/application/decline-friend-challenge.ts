import { DomainError, type FriendChallengeRepository, type PlayerRepository } from "../domain";
import type { Transaction } from "./transaction";
import { friendChallengeView, type FriendChallengeView } from "./friend-challenge-view";

export class DeclineFriendChallenge {
  constructor(
    private readonly challenges: FriendChallengeRepository,
    private readonly players: PlayerRepository,
    private readonly transaction: Transaction,
    private readonly now: () => Date,
  ) {}

  execute(challengeId: string, playerId: string): Promise<FriendChallengeView> {
    return this.transaction.run(async () => {
      const challenge = await this.challenges.byIdForUpdate(challengeId);
      if (!challenge) throw new DomainError("NOT_FOUND", "Challenge not found");
      if (challenge.status !== "PENDING") {
        throw new DomainError("CONFLICT", "Challenge has already been resolved");
      }
      if (challenge.challengedPlayerId !== playerId) {
        throw new DomainError("NOT_ALLOWED", "Only the invited Player may decline this challenge");
      }

      challenge.decline(this.now());
      await this.challenges.save(challenge);
      return friendChallengeView(challenge, this.players);
    });
  }
}
