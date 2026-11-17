import type { TurnPassed } from "../../domain/shared/events";
import type { NotificationRecorder } from "./notify";

/** Tells the Player who now has the turn, and until when. */
export const notifyOnTurnPassed =
  (recorder: NotificationRecorder) =>
  async (event: TurnPassed): Promise<void> => {
    await recorder.record({
      recipientId: event.toPlayerId,
      type: "TURN_PASSED",
      eventId: event.eventId,
      matchId: event.matchId,
      data: {
        roundNumber: event.roundNumber,
        fromPlayerId: event.fromPlayerId,
        deadline: event.deadline.toISOString(),
      },
    });
  };
