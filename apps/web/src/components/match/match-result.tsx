import { Link } from "@tanstack/react-router";
import type { MatchSummary } from "../../lib/api";

type Result = NonNullable<MatchSummary["result"]>;

const resultText: Record<Result, string> = {
  WON: "You won! 🎉",
  LOST: "You lost.",
  DRAW: "It's a draw.",
  NO_WINNER: "The match expired.",
};

/** Why an expired match ended as it did. */
const expiryReason: Partial<Record<Result, string>> = {
  WON: "Your opponent did not play in time.",
  LOST: "You did not play in time.",
  NO_WINNER: "Nobody answered a question before the deadline, so there is no winner.",
};

interface Props {
  status: MatchSummary["status"];
  result: Result;
}

export function MatchResult({ status, result }: Props) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <p className="text-2xl font-bold">{resultText[result]}</p>
      {status === "EXPIRED" && (
        <p className="text-gray-600">
          <i className="pi pi-hourglass mr-2" />
          {expiryReason[result]}
        </p>
      )}
      <Link to="/" className="text-indigo-600 underline">
        Play again
      </Link>
    </div>
  );
}
