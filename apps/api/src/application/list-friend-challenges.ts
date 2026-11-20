import type { FriendChallengeRepository, PlayerRepository } from "../domain";
import { type FriendChallengeView, friendChallengeView } from "./friend-challenge-view";

export interface FriendChallengeLists {
  incoming: FriendChallengeView[];
  outgoing: FriendChallengeView[];
}

export class ListFriendChallenges {
  constructor(
    private readonly challenges: FriendChallengeRepository,
    private readonly players: PlayerRepository,
  ) {}

  async execute(playerId: string): Promise<FriendChallengeLists> {
    const [incoming, outgoing] = await Promise.all([
      this.challenges
        .pendingForChallenged(playerId)
        .then((challenges) =>
          Promise.all(challenges.map((challenge) => friendChallengeView(challenge, this.players))),
        ),
      this.challenges
        .forChallenger(playerId)
        .then((challenges) =>
          Promise.all(challenges.map((challenge) => friendChallengeView(challenge, this.players))),
        ),
    ]);
    return { incoming, outgoing };
  }
}
