import type { Difficulty } from "../catalog/difficulty";
import type { Question } from "../catalog/question";
import type { GameMode } from "../matchmaking/game-mode";
import { DomainError } from "../shared/domain-error";
import { PlayerAnswer } from "./player-answer";
import { type ReadonlyRound, Round } from "./round";

// EXPIRED is part of the domain model, but match expiry is not implemented yet.
export type MatchStatus = "UPCOMING" | "STARTED" | "COMPLETED" | "EXPIRED";

export const QUESTIONS_PER_ROUND = 1;
const DEFAULT_ROUND_COUNT = 3;

/**
 * Aggregate of the Match context. Players play asynchronously: per round the chooser picks
 * a category and answers first, then the opponent answers the same questions.
 */
export class Match {
  // Constructor is used by the factory and by persistence to rebuild a match.
  constructor(
    private readonly _id: string,
    private readonly _mode: GameMode,
    private readonly _difficulty: Difficulty,
    private _status: MatchStatus,
    private readonly _players: string[],
    private readonly _rounds: Round[],
    private _startedAt: Date | null,
  ) {}

  /** Creates an UPCOMING match; nobody can play until it is started. */
  static create(
    id: string,
    players: [string, string],
    mode: GameMode,
    difficulty: Difficulty,
    roundCount = DEFAULT_ROUND_COUNT,
  ): Match {
    if (players[0] === players[1]) {
      throw new DomainError("CONFLICT", "A player cannot play against themselves");
    }
    if (!Number.isInteger(roundCount) || roundCount < 1) {
      throw new DomainError("CONFLICT", "A match needs at least one round");
    }
    // The chooser alternates, starting with the first player.
    const rounds = Array.from(
      { length: roundCount },
      (_, i) => new Round(i + 1, players[i % 2] as string),
    );
    return new Match(id, mode, difficulty, "UPCOMING", [...players], rounds, null);
  }

  get id(): string {
    return this._id;
  }

  get mode(): GameMode {
    return this._mode;
  }

  get difficulty(): Difficulty {
    return this._difficulty;
  }

  get status(): MatchStatus {
    return this._status;
  }

  get players(): readonly string[] {
    return this._players;
  }

  /** Read-only, so rounds can only be changed through the match's own methods. */
  get rounds(): readonly ReadonlyRound[] {
    return this._rounds;
  }

  get startedAt(): Date | null {
    return this._startedAt;
  }

  isParticipant(playerId: string): boolean {
    return this._players.includes(playerId);
  }

  opponentOf(playerId: string): string {
    this.assertParticipant(playerId);
    return this._players.find((p) => p !== playerId) as string;
  }

  currentRound(): ReadonlyRound | undefined {
    return this.activeRound();
  }

  /** The player who has to act next, or null when the match is over. */
  whoseTurn(): string | null {
    const round = this.currentRound();
    if (!round) return null;
    if (!round.hasAnsweredAll(round.chooserId)) return round.chooserId;
    return this.opponentOf(round.chooserId);
  }

  /** Ids of all questions already used in this match; a question is never asked twice. */
  usedQuestionIds(): string[] {
    return this._rounds.flatMap((round) => [...round.questionIds]);
  }

  start(now: Date): void {
    if (this._status !== "UPCOMING") {
      throw new DomainError("CONFLICT", "Only an upcoming match can be started");
    }
    this._status = "STARTED";
    this._startedAt = now;
    this._rounds[0]?.start();
  }

  /** Checks everything `chooseCategory` checks except the questions themselves. */
  assertCanChooseCategory(playerId: string): void {
    this.assertParticipant(playerId);
    const round = this.requireCurrentRound();
    if (round.chooserId !== playerId) {
      throw new DomainError("CONFLICT", "Only the chooser of this round can pick the category");
    }
    if (round.hasCategory()) {
      throw new DomainError("CONFLICT", "The category of this round is already chosen");
    }
  }

  chooseCategory(playerId: string, categoryId: string, questionIds: string[]): void {
    this.assertCanChooseCategory(playerId);
    if (
      questionIds.length !== QUESTIONS_PER_ROUND ||
      new Set(questionIds).size !== questionIds.length
    ) {
      throw new DomainError("CONFLICT", `A round needs exactly ${QUESTIONS_PER_ROUND} question(s)`);
    }
    const used = new Set(this.usedQuestionIds());
    if (questionIds.some((id) => used.has(id))) {
      throw new DomainError("CONFLICT", "A question cannot be asked twice in a match");
    }
    this.requireCurrentRound().assignCategory(categoryId, questionIds);
  }

  /**
   * Shows the player their next question and starts its clock. Showing it again (e.g. after a
   * reload) returns the same question without restarting the clock.
   */
  showQuestion(playerId: string, now: Date): { questionId: string; shownAt: Date } {
    const round = this.requireTurnWithCategory(playerId);
    const questionId = round.nextQuestionIdFor(playerId);
    if (!questionId) throw new DomainError("CONFLICT", "No question left to show");

    if (round.shownAt) return { questionId, shownAt: round.shownAt };
    round.markShown(now);
    return { questionId, shownAt: now };
  }

  /**
   * Records the answer to a shown question. The time needed is measured from when the question
   * was shown, and the Question decides whether the option is correct.
   */
  answer(playerId: string, question: Question, optionId: string | null, now: Date): PlayerAnswer {
    const round = this.requireTurnWithCategory(playerId);
    // Only the question that was shown can be answered: the player's next unanswered one.
    const shownAt = round.shownAt;
    if (!shownAt || round.nextQuestionIdFor(playerId) !== question.id) {
      throw new DomainError("CONFLICT", "This question has not been shown to you");
    }

    const timeNeededMs = Math.max(0, now.getTime() - shownAt.getTime());
    const answer = new PlayerAnswer(
      playerId,
      question.id,
      optionId,
      timeNeededMs,
      question.isCorrectAnswer(optionId, timeNeededMs),
    );
    round.record(answer);

    if (this._players.every((p) => round.hasAnsweredAll(p))) {
      this.completeRound(round);
    }
    return answer;
  }

  scoreOf(playerId: string): number {
    this.assertParticipant(playerId);
    return this._rounds.reduce((sum, round) => sum + round.correctCount(playerId), 0);
  }

  /** The opponent's score as the viewer may see it: only rounds revealed to the viewer count. */
  visibleOpponentScore(viewerId: string): number {
    const opponentId = this.opponentOf(viewerId);
    return this._rounds.reduce(
      (sum, round) => sum + (round.visibleCorrectCountOf(opponentId, viewerId) ?? 0),
      0,
    );
  }

  /** The winning player, or null while the match runs or when it ended in a draw. */
  winner(): string | null {
    if (this._status !== "COMPLETED") return null;
    const [first, second] = this._players as [string, string];
    const firstScore = this.scoreOf(first);
    const secondScore = this.scoreOf(second);
    if (firstScore === secondScore) return null;
    return firstScore > secondScore ? first : second;
  }

  private completeRound(round: Round): void {
    round.complete();
    const nextRound = this._rounds.find((r) => r.number === round.number + 1);
    if (nextRound) {
      nextRound.start();
    } else {
      this._status = "COMPLETED";
    }
  }

  private activeRound(): Round | undefined {
    if (this._status !== "STARTED") return undefined;
    return this._rounds.find((round) => round.status === "STARTED");
  }

  private requireTurnWithCategory(playerId: string): Round {
    this.assertParticipant(playerId);
    const round = this.requireCurrentRound();
    if (!round.hasCategory()) {
      throw new DomainError("CONFLICT", "The category of this round is not chosen yet");
    }
    if (this.whoseTurn() !== playerId) {
      throw new DomainError("CONFLICT", "It is not your turn");
    }
    return round;
  }

  private requireCurrentRound(): Round {
    const round = this.activeRound();
    if (!round) throw new DomainError("CONFLICT", "The match is not running");
    return round;
  }

  assertParticipant(playerId: string): void {
    if (!this.isParticipant(playerId)) {
      throw new DomainError("NOT_ALLOWED", "Player is not part of this match");
    }
  }
}
