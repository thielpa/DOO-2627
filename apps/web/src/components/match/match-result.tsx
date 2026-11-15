import { Link } from "@tanstack/react-router";
import type { MatchSummary } from "../../lib/api";

const resultText = { WON: "You won! 🎉", LOST: "You lost.", DRAW: "It's a draw." } as const;

export function MatchResult({ result }: { result: NonNullable<MatchSummary["result"]> }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-2xl font-bold">{resultText[result]}</p>
      <Link to="/" className="text-indigo-600 underline">
        Play again
      </Link>
    </div>
  );
}
