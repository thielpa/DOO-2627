import { Tag } from "primereact/tag";
import type { MatchSummary } from "../../lib/api";
import { formatTimeLeft, URGENT_MS, useTimeLeft } from "../../lib/time-left";

type TagSeverity = "success" | "danger" | "secondary";

const resultTag: Record<NonNullable<MatchSummary["result"]>, [string, TagSeverity]> = {
  WON: ["Won", "success"],
  LOST: ["Lost", "danger"],
  DRAW: ["Draw", "secondary"],
  NO_WINNER: ["Expired", "secondary"],
};

type Props = { match: Pick<MatchSummary, "status" | "result" | "isYourTurn"> };

export function MatchStatusTag({ match }: Props) {
  if (match.result) {
    const [value, severity] = resultTag[match.result];
    // A match won or lost because someone missed their deadline is marked as such.
    const isTimeout = match.status === "EXPIRED" && match.result !== "NO_WINNER";
    return (
      <Tag
        value={isTimeout ? `${value} (timeout)` : value}
        severity={severity}
        icon={match.status === "EXPIRED" ? "pi pi-hourglass" : undefined}
      />
    );
  }
  return match.isYourTurn ? (
    <Tag value="Your turn" severity="warning" />
  ) : (
    <Tag value="Waiting for opponent" severity="info" />
  );
}

/** How long the player whose turn it is has left, e.g. "23 h left". */
export function TurnTimeLeft({ match }: { match: Pick<MatchSummary, "turnDeadline"> }) {
  const remainingMs = useTimeLeft(match.turnDeadline);
  if (remainingMs === null) return null;
  const isUrgent = remainingMs < URGENT_MS;
  return (
    <span
      className={`whitespace-nowrap text-sm ${isUrgent ? "font-semibold text-red-700" : "text-gray-500"}`}
    >
      <i className="pi pi-hourglass mr-1 text-xs" />
      {formatTimeLeft(remainingMs)}
    </span>
  );
}
