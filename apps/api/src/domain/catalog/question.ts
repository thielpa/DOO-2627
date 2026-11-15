import { DomainError } from "../shared/domain-error";
import type { AnswerOption } from "./answer-option";
import type { Difficulty } from "./difficulty";

export const OPTIONS_PER_QUESTION = 4;
/** Answers arriving slightly after the time limit still count, to absorb network latency. */
export const ANSWER_GRACE_MS = 1_000;

export class Question {
  constructor(
    readonly id: string,
    readonly categoryId: string,
    readonly text: string,
    readonly difficulty: Difficulty,
    readonly timeLimitMs: number,
    readonly options: AnswerOption[],
  ) {
    if (options.length !== OPTIONS_PER_QUESTION) {
      throw new DomainError("CONFLICT", `Question ${id} needs ${OPTIONS_PER_QUESTION} options`);
    }
    if (options.filter((option) => option.isCorrect).length !== 1) {
      throw new DomainError("CONFLICT", `Question ${id} needs exactly one correct option`);
    }
  }

  correctOptionId(): string {
    // The constructor guarantees exactly one correct option.
    return this.options.find((option) => option.isCorrect)?.id as string;
  }

  /** Time left to answer when the question was shown at `shownAt`; never negative. */
  remainingMs(shownAt: Date, now: Date): number {
    const elapsedMs = now.getTime() - shownAt.getTime();
    return Math.max(0, this.timeLimitMs - elapsedMs);
  }

  /**
   * An answer only counts if it is the correct option and given within the time limit
   * (plus a small grace period).
   * `null` means the time ran out before an option was chosen.
   */
  isCorrectAnswer(optionId: string | null, timeNeededMs: number): boolean {
    if (optionId === null) return false;
    if (!this.options.some((option) => option.id === optionId)) {
      throw new DomainError(
        "CONFLICT",
        `Option ${optionId} does not belong to question ${this.id}`,
      );
    }
    return (
      optionId === this.correctOptionId() && timeNeededMs <= this.timeLimitMs + ANSWER_GRACE_MS
    );
  }
}
