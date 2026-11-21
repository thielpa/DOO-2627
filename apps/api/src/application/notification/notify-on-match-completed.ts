import type { MatchCompleted } from "../../domain/shared/events";
import { type NotificationRecorder, outcomeFor } from "./notify";

/** Tells both Players how the Match ended, from their own point of view. */
export const notifyOnMatchCompleted =
  (recorder: NotificationRecorder) =>
  async (event: MatchCompleted): Promise<void> => {
    for (const recipientId of event.playerIds) {
      await recorder.record({
        recipientId,
        type: "MATCH_COMPLETED",
        eventId: event.eventId,
        matchId: event.matchId,
        data: {
          outcome: outcomeFor(recipientId, event.winnerId, "DRAW"),
          winnerId: event.winnerId,
        },
      });
    }
  };
