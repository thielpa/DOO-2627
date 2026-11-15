import { type GameMode, type Match, type MatchRepository, Match as MatchAggregate } from "../domain";

/** Shared Match creation policy used by random matchmaking and accepted friend challenges. */
export async function createStartedMatch(
  matches: MatchRepository,
  players: [string, string],
  mode: GameMode,
  startedAt: Date,
): Promise<Match> {
  const match = MatchAggregate.create(crypto.randomUUID(), players, mode, "EASY");
  match.start(startedAt);
  await matches.save(match);
  return match;
}
