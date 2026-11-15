import { DomainError, type FriendChallenge, type PlayerRepository } from "../domain";

export interface FriendChallengeView {
  id: string;
  challengerPlayerId: string;
  challengerUsername: string;
  challengedPlayerId: string;
  challengedUsername: string;
  status: FriendChallenge["status"];
  createdAt: string;
  respondedAt: string | null;
}

export async function friendChallengeView(
  challenge: FriendChallenge,
  players: PlayerRepository,
): Promise<FriendChallengeView> {
  const [challenger, challenged] = await Promise.all([
    players.byId(challenge.challengerPlayerId),
    players.byId(challenge.challengedPlayerId),
  ]);
  if (!challenger || !challenged) {
    throw new DomainError("NOT_FOUND", "Challenge Player not found");
  }

  return {
    id: challenge.id,
    challengerPlayerId: challenger.id,
    challengerUsername: challenger.username,
    challengedPlayerId: challenged.id,
    challengedUsername: challenged.username,
    status: challenge.status,
    createdAt: challenge.createdAt.toISOString(),
    respondedAt: challenge.respondedAt?.toISOString() ?? null,
  };
}
