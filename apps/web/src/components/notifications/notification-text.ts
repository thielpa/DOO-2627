import type { NotificationItem } from "../../lib/notifications";

type Outcome = "WON" | "LOST" | "DRAW" | "NO_WINNER";

/** Builds the human text from the notification's type and data (the API only sends facts). */
export function notificationText(item: Pick<NotificationItem, "type" | "data">): string {
  const data = item.data as Record<string, unknown>;
  switch (item.type) {
    case "TURN_PASSED":
      return typeof data.roundNumber === "number"
        ? `It's your turn (round ${data.roundNumber})`
        : "It's your turn";
    case "MATCH_COMPLETED":
      return completedText(data.outcome as Outcome);
    case "MATCH_EXPIRED":
      return `Match expired – ${expiredSuffix(data.outcome as Outcome)}`;
  }
}

function completedText(outcome: Outcome): string {
  if (outcome === "WON") return "You won the match";
  if (outcome === "LOST") return "You lost the match";
  return "Match ended in a draw";
}

function expiredSuffix(outcome: Outcome): string {
  if (outcome === "WON") return "you won";
  if (outcome === "LOST") return "you lost";
  return "no winner";
}

export function relativeTime(iso: string, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}
