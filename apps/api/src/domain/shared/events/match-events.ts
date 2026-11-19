import type { DomainEvent } from "./domain-event";

export interface TurnPassed extends DomainEvent {
  readonly type: "TurnPassed";
  readonly version: 1;
  readonly matchId: string;
  readonly fromPlayerId: string;
  readonly toPlayerId: string;
  /** The round the new turn belongs to. */
  readonly roundNumber: number;
  readonly deadline: Date;
}

export interface MatchCompleted extends DomainEvent {
  readonly type: "MatchCompleted";
  readonly version: 1;
  readonly matchId: string;
  readonly playerIds: readonly string[];
  readonly scores: Readonly<Record<string, number>>;
  readonly winnerId: string | null;
}

export interface MatchExpired extends DomainEvent {
  readonly type: "MatchExpired";
  readonly version: 1;
  readonly matchId: string;
  readonly playerIds: readonly string[];
  readonly scores: Readonly<Record<string, number>>;
  readonly missedByPlayerId: string;
  readonly winnerId: string | null;
}

export type MatchEvent = TurnPassed | MatchCompleted | MatchExpired;

/** An event as the aggregate describes it, before it is given its `eventId`. */
export type NewEvent<E extends DomainEvent> = E extends DomainEvent ? Omit<E, "eventId"> : never;
