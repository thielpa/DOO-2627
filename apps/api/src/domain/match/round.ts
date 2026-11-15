import type { PlayerAnswer } from "./player-answer";

export type RoundStatus = "UPCOMING" | "STARTED" | "COMPLETED";

/**
 * Part of the Match aggregate. Only Match calls the mutating methods, so the round rules are
 * always checked in one place. Match hands rounds out as `ReadonlyRound`, which enforces this.
 */
export class Round {
  constructor(
    readonly number: number,
    readonly chooserId: string,
    private _status: RoundStatus = "UPCOMING",
    private _categoryId: string | null = null,
    private _questionIds: string[] = [],
    /** When the player whose turn it is was shown their next question; null until shown. */
    private _shownAt: Date | null = null,
    private readonly _answers: PlayerAnswer[] = [],
  ) {}

  get status(): RoundStatus {
    return this._status;
  }

  get categoryId(): string | null {
    return this._categoryId;
  }

  get questionIds(): readonly string[] {
    return this._questionIds;
  }

  get answers(): readonly PlayerAnswer[] {
    return this._answers;
  }

  /**
   * When the current question was shown. Questions are shown one at a time to the player whose
   * turn it is, so one timestamp is enough; it is cleared when the answer is recorded.
   */
  get shownAt(): Date | null {
    return this._shownAt;
  }

  hasCategory(): boolean {
    return this._categoryId !== null;
  }

  hasAnswered(playerId: string, questionId: string): boolean {
    return this._answers.some((a) => a.playerId === playerId && a.questionId === questionId);
  }

  hasAnsweredAll(playerId: string): boolean {
    return (
      this.hasCategory() &&
      this._questionIds.every((questionId) => this.hasAnswered(playerId, questionId))
    );
  }

  /**
   * Whether the opponent's results of this round may be shown to the player: only once the
   * player has answered all questions themselves, so they can't learn anything beforehand.
   */
  isRevealedTo(playerId: string): boolean {
    return this.hasAnsweredAll(playerId);
  }

  nextQuestionIdFor(playerId: string): string | null {
    return this._questionIds.find((questionId) => !this.hasAnswered(playerId, questionId)) ?? null;
  }

  correctCount(playerId: string): number {
    return this._answers.filter((a) => a.playerId === playerId && a.isCorrect).length;
  }

  /** The opponent's correct answers as the viewer may see them; null while not revealed. */
  visibleCorrectCountOf(opponentId: string, viewerId: string): number | null {
    return this.isRevealedTo(viewerId) ? this.correctCount(opponentId) : null;
  }

  start(): void {
    this._status = "STARTED";
  }

  assignCategory(categoryId: string, questionIds: string[]): void {
    this._categoryId = categoryId;
    this._questionIds = [...questionIds];
  }

  markShown(now: Date): void {
    this._shownAt = now;
  }

  record(answer: PlayerAnswer): void {
    this._answers.push(answer);
    this._shownAt = null;
  }

  complete(): void {
    this._status = "COMPLETED";
  }
}

/** A Round without its mutating methods. */
export type ReadonlyRound = Omit<
  Round,
  "start" | "assignCategory" | "markShown" | "record" | "complete"
>;
