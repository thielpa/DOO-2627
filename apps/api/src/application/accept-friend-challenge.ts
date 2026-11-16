import {
  DomainError,
  type FriendChallengeRepository,
  type MatchRepository,
  type PlayerRepository,
} from "../domain";
import { type FriendChallengeView, friendChallengeView } from "./friend-challenge-view";
import { createStartedMatch } from "./start-match";
import type { Transaction } from "./transaction";

export interface AcceptedFriendChallenge {
  challenge: FriendChallengeView;
  matchId: string;
}

export class AcceptFriendChallenge {
  constructor(
    private readonly challenges: FriendChallengeRepository,
    private readonly players: PlayerRepository,
    private readonly matches: MatchRepository,
    private readonly transaction: Transaction,
    private readonly now: () => Date,
  ) {}

  execute(challengeId: string, playerId: string): Promise<AcceptedFriendChallenge> {
    return this.transaction.run(async () => {
      const challenge = await this.challenges.byIdForUpdate(challengeId);
      if (!challenge) throw new DomainError("NOT_FOUND", "Challenge not found");
      if (challenge.status !== "PENDING") {
        throw new DomainError("CONFLICT", "Challenge has already been resolved");
      }
      if (challenge.challengedPlayerId !== playerId) {
        throw new DomainError("NOT_ALLOWED", "Only the invited Player may accept this challenge");
      }

      const respondedAt = this.now();
      challenge.accept(respondedAt);
      const match = await createStartedMatch(
        this.matches,
        [challenge.challengerPlayerId, challenge.challengedPlayerId],
        "SOLO_FRIEND",
        respondedAt,
      );
      await this.challenges.save(challenge);
      return { challenge: await friendChallengeView(challenge, this.players), matchId: match.id };
    });
  }
}
