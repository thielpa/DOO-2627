import type { DomainEvent } from "./domain-event";

/** PROPOSAL v1 - to be validated by the Match context owner (see docs/events.md). */
export type TurnPassed = DomainEvent<
  "TurnPassed",
  {
    matchId: string;
    fromPlayerId: string;
    toPlayerId: string;
    roundNumber: number;
  }
>;

export type MatchCompleted = DomainEvent<
  "MatchCompleted",
  {
    matchId: string;
    playerIds: [string, string];
    /** null means a draw. */
    winnerId: string | null;
    /** Score per player ID. */
    scores: Record<string, number>;
  }
>;

export type MatchExpired = DomainEvent<
  "MatchExpired",
  {
    matchId: string;
    playerIds: [string, string];
    winnerId: string | null;
    /** The Player whose missed turn caused the expiry, if any. */
    missedByPlayerId: string | null;
  }
>;

export type MatchEvent = TurnPassed | MatchCompleted | MatchExpired;
