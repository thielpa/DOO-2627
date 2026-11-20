import type { MatchView, QuestionView } from "../../lib/api";
import { AnswerFeedback, type Feedback } from "./answer-feedback";
import { CategoryPicker } from "./category-picker";
import { MatchResult } from "./match-result";
import { QuestionCard } from "./question-card";
import type { RoundPosition } from "./round-progress";

interface Props {
  view: MatchView;
  feedback: Feedback | null;
  question: QuestionView | undefined;
  isBusy: boolean;
  onNext: () => void;
  onChooseCategory: (categoryId: string) => void;
  onAnswer: (question: QuestionView, optionId: string | null, position: RoundPosition) => void;
}

/** The main area of the match page: whatever the player has to do or see right now. */
export function MatchStage({
  view,
  feedback,
  question,
  isBusy,
  onNext,
  onChooseCategory,
  onAnswer,
}: Props) {
  if (feedback) return <AnswerFeedback feedback={feedback} onNext={onNext} />;
  if (view.result) return <MatchResult status={view.status} result={view.result} />;

  const current = view.current;
  if (current?.categories) {
    return (
      <CategoryPicker
        roundNumber={current.roundNumber}
        categories={current.categories}
        disabled={isBusy}
        onChoose={onChooseCategory}
      />
    );
  }
  if (current?.hasQuestionToAnswer) {
    if (!question) {
      return (
        <p className="text-center text-gray-600">
          <i className="pi pi-spin pi-spinner mr-2" />
          Loading question…
        </p>
      );
    }
    const position = {
      roundNumber: current.roundNumber,
      questionNumber: current.answeredCount + 1,
      questionCount: current.questionCount,
    };
    return (
      <QuestionCard
        key={question.id}
        question={question}
        position={position}
        disabled={isBusy}
        onAnswer={(optionId) => onAnswer(question, optionId, position)}
      />
    );
  }

  return (
    <p className="text-center text-gray-600">
      <i className="pi pi-clock mr-2" />
      Waiting for your opponent…
    </p>
  );
}
