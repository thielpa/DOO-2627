import type { FriendChallengeRepository, PlayerRepository } from "../domain";
import { friendChallengeView, type FriendChallengeView } from "./friend-challenge-view";

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
      this.challenges.pendingForChallenged(playerId),
      this.challenges.forChallenger(playerId),
    ]);
    return {
      incoming: await Promise.all(incoming.map((challenge) => friendChallengeView(challenge, this.players))),
      outgoing: await Promise.all(outgoing.map((challenge) => friendChallengeView(challenge, this.players))),
    };
  }
}
