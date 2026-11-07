import { Tag } from "primereact/tag";
import type { MatchSummary } from "../../lib/api";

const resultTag = {
  WON: { value: "Won", severity: "success" },
  LOST: { value: "Lost", severity: "danger" },
  DRAW: { value: "Draw", severity: "secondary" },
} as const;

export function MatchStatusTag({ match }: { match: Pick<MatchSummary, "result" | "isYourTurn"> }) {
  if (match.result) return <Tag {...resultTag[match.result]} />;
  return match.isYourTurn ? (
    <Tag value="Your turn" severity="warning" />
  ) : (
    <Tag value="Waiting for opponent" severity="info" />
  );
}
