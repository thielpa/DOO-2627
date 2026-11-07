import { Button } from "primereact/button";
import { Card } from "primereact/card";
import type { AnswerResult, QuestionView } from "../../lib/api";

export interface Feedback extends AnswerResult {
  question: QuestionView;
  chosenOptionId: string | null;
}

function optionStyle(optionId: string, correctId: string, chosenId: string | null): string {
  if (optionId === correctId) return "border-green-600 bg-green-50";
  if (optionId === chosenId) return "border-red-600 bg-red-50";
  return "border-gray-200";
}

function headlineOf(isCorrect: boolean, chosenOptionId: string | null): string {
  if (isCorrect) return "Correct!";
  return chosenOptionId ? "Wrong" : "Time is up";
}

/** Shows right away whether the answer was correct and reveals the correct option. */
export function AnswerFeedback({ feedback, onNext }: { feedback: Feedback; onNext: () => void }) {
  const { question, chosenOptionId, isCorrect, correctOptionId } = feedback;
  const headline = headlineOf(isCorrect, chosenOptionId);

  return (
    <Card title={question.text}>
      <p className={`mb-4 text-lg font-semibold ${isCorrect ? "text-green-700" : "text-red-700"}`}>
        {headline}
      </p>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {question.options.map((option) => (
          <li
            key={option.id}
            className={`rounded border-2 p-2 text-center ${optionStyle(option.id, correctOptionId, chosenOptionId)}`}
          >
            {option.text}
          </li>
        ))}
      </ul>
      <Button
        label="Next"
        icon="pi pi-arrow-right"
        iconPos="right"
        className="mt-4"
        onClick={onNext}
      />
    </Card>
  );
}
