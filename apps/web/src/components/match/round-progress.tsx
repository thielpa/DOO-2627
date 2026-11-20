/** Where the player is within the round: which question of how many. */
export interface RoundPosition {
  roundNumber: number;
  /** 1-based number of the question being answered (or just answered). */
  questionNumber: number;
  questionCount: number;
}

interface Props {
  position: RoundPosition;
  /** Whether the current question is already answered, so it counts as done. */
  isAnswered: boolean;
}

export function RoundProgress({ position, isAnswered }: Props) {
  const { roundNumber, questionNumber, questionCount } = position;
  const doneCount = isAnswered ? questionNumber : questionNumber - 1;

  return (
    <div className="mb-3 flex items-center justify-between gap-2 text-sm text-gray-600">
      <span>
        Round {roundNumber} · Question {questionNumber} of {questionCount}
      </span>
      <ol aria-hidden="true" className="flex gap-1">
        {Array.from({ length: questionCount }, (_, i) => (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: the steps are fixed positions
            key={i}
            className={`h-2 w-6 rounded ${
              i < doneCount ? "bg-indigo-600" : i === doneCount ? "bg-indigo-300" : "bg-gray-200"
            }`}
          />
        ))}
      </ol>
    </div>
  );
}
