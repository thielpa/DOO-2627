import type {
  DomainEventHandler,
  MatchCompleted,
  MatchExpired,
  TurnPassed,
} from "../../domain/shared/events";
import type { NotificationRecorder } from "./notify";

type Outcome = "WON" | "LOST" | "DRAW";

function outcomeFor(playerId: string, winnerId: string | null): Outcome {
  if (winnerId === null) return "DRAW";
  return winnerId === playerId ? "WON" : "LOST";
}

/** Tells the Player who now has the turn. */
export class NotifyOnTurnPassed implements DomainEventHandler<TurnPassed> {
  constructor(private readonly recorder: NotificationRecorder) {}

  async handle(event: TurnPassed): Promise<void> {
    const { matchId, toPlayerId, fromPlayerId, roundNumber } = event.payload;
    await this.recorder.record({
      recipientId: toPlayerId,
      type: "TURN_PASSED",
      eventId: event.eventId,
      matchId,
      data: { roundNumber, fromPlayerId },
    });
  }
}

/** Tells both Players how the Match ended, from their own point of view. */
export class NotifyOnMatchCompleted implements DomainEventHandler<MatchCompleted> {
  constructor(private readonly recorder: NotificationRecorder) {}

  async handle(event: MatchCompleted): Promise<void> {
    const { matchId, playerIds, winnerId } = event.payload;
    for (const recipientId of playerIds) {
      await this.recorder.record({
        recipientId,
        type: "MATCH_COMPLETED",
        eventId: event.eventId,
        matchId,
        data: { outcome: outcomeFor(recipientId, winnerId), winnerId },
      });
    }
  }
}

/** Tells both Players that the Match expired and how it was decided. */
export class NotifyOnMatchExpired implements DomainEventHandler<MatchExpired> {
  constructor(private readonly recorder: NotificationRecorder) {}

  async handle(event: MatchExpired): Promise<void> {
    const { matchId, playerIds, winnerId, missedByPlayerId } = event.payload;
    for (const recipientId of playerIds) {
      await this.recorder.record({
        recipientId,
        type: "MATCH_EXPIRED",
        eventId: event.eventId,
        matchId,
        data: { outcome: outcomeFor(recipientId, winnerId), winnerId, missedByPlayerId },
      });
    }
  }
}
