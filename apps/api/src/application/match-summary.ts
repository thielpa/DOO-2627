import type { Match } from "../domain";

/** NO_WINNER: the match expired before anyone answered a question. */
export type MatchResult = "WON" | "LOST" | "DRAW" | "NO_WINNER";

export interface MatchSummary {
  id: string;
  status: Match["status"];
  startedAt: string | null;
  isYourTurn: boolean;
  /** Until when the player whose turn it is has to play; null once the match is over. */
  turnDeadline: string | null;
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
    turnDeadline: match.turnDeadline?.toISOString() ?? null,
    yourScore: match.scoreOf(viewerId),
    opponentScore: match.visibleOpponentScore(viewerId),
    result: resultFor(match, viewerId),
  };
}

function resultFor(match: Match, viewerId: string): MatchResult | null {
  if (!match.isOver()) return null;
  const winner = match.winner();
  if (winner === null) return match.status === "EXPIRED" ? "NO_WINNER" : "DRAW";
  return winner === viewerId ? "WON" : "LOST";
}
