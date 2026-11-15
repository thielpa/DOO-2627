import type { MatchView } from "../../lib/api";

const dash = (value: number | null) => (value === null ? "–" : value);

export function RoundOverview({ rounds }: { rounds: MatchView["rounds"] }) {
  return (
    <table className="w-full text-center">
      <thead className="text-sm text-gray-500">
        <tr>
          <th className="p-2">Round</th>
          <th className="p-2">Category</th>
          <th className="p-2">You</th>
          <th className="p-2">Opponent</th>
        </tr>
      </thead>
      <tbody>
        {rounds.map((round) => (
          <tr key={round.number} className="border-t border-gray-200">
            <td className="p-2">{round.number}</td>
            <td className="p-2">{round.categoryName ?? "–"}</td>
            <td className="p-2">{dash(round.yourCorrectCount)}</td>
            <td className="p-2">{dash(round.opponentCorrectCount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
