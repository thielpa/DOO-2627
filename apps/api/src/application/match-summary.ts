import type { Match } from "../domain";

export type MatchResult = "WON" | "LOST" | "DRAW";

export interface MatchSummary {
  id: string;
  status: Match["status"];
  startedAt: string | null;
  isYourTurn: boolean;
  yourScore: number;
  opponentScore: number;
  result: MatchResult | null;
}

/** What a player may see of a match; the match decides which opponent results are revealed. */
export function summarize(match: Match, viewerId: string): MatchSummary {
  return {
    id: match.id,
    status: match.status,
    startedAt: match.startedAt?.toISOString() ?? null,
    isYourTurn: match.whoseTurn() === viewerId,
    yourScore: match.scoreOf(viewerId),
    opponentScore: match.visibleOpponentScore(viewerId),
    result: resultFor(match, viewerId),
  };
}

function resultFor(match: Match, viewerId: string): MatchResult | null {
  if (match.status !== "COMPLETED") return null;
  const winner = match.winner();
  if (winner === null) return "DRAW";
  return winner === viewerId ? "WON" : "LOST";
}
