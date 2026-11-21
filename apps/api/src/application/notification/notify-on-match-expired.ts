import type { MatchExpired } from "../../domain/shared/events";
import { type NotificationRecorder, outcomeFor } from "./notify";

/**
 * Tells both Players that the Match expired and how it was decided. Without a winner (nobody had
 * answered yet) the outcome is NO_WINNER, not a draw.
 */
export const notifyOnMatchExpired =
  (recorder: NotificationRecorder) =>
  async (event: MatchExpired): Promise<void> => {
    for (const recipientId of event.playerIds) {
      await recorder.record({
        recipientId,
        type: "MATCH_EXPIRED",
        eventId: event.eventId,
        matchId: event.matchId,
        data: {
          outcome: outcomeFor(recipientId, event.winnerId, "NO_WINNER"),
          winnerId: event.winnerId,
          missedByPlayerId: event.missedByPlayerId,
        },
      });
    }
  };
