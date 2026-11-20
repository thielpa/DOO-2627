import type { Difficulty } from "../catalog/difficulty";
import { ANSWER_GRACE_MS, type Question } from "../catalog/question";
import type { GameMode } from "../matchmaking/game-mode";
import { DomainError } from "../shared/domain-error";
import type { MatchEvent, NewEvent } from "../shared/events";
import { OverdueMatch } from "./overdue-match";
import { PlayerAnswer } from "./player-answer";
import { type ReadonlyRound, Round } from "./round";

export type MatchStatus = "UPCOMING" | "STARTED" | "COMPLETED" | "EXPIRED";

export const QUESTIONS_PER_ROUND = 3;
const DEFAULT_ROUND_COUNT = 3;
export const DEFAULT_TURN_TIMEOUT_MS = 24 * 60 * 60 * 1000;

export interface MatchOptions {
  roundCount?: number;
  /** How long a player has for their turn before they lose the match. */
  turnTimeoutMs?: number;
}

/**
 * Aggregate of the Match context. Players play asynchronously: per round the chooser picks
 * a category and answers first, then the opponent answers the same questions.
 */
export class Match {
  private _events?: MatchEvent[];
  // TODO: Check if State pattern would apply here
  private _status: MatchStatus = "UPCOMING";
  private _startedAt: Date | null = null;
  private _turnDeadline: Date | null = null;
  private _expiredBy: string | null = null;

  private constructor(
    private readonly _id: string,
    private readonly _mode: GameMode,
    private readonly _difficulty: Difficulty,
    private readonly _players: string[],
    private readonly _rounds: Round[],
    private readonly _turnTimeoutMs: number,
  ) {}

  /** Creates an UPCOMING match; nobody can play until it is started. */
  static create(
    id: string,
    players: [string, string],
    mode: GameMode,
    difficulty: Difficulty,
    {
      roundCount = DEFAULT_ROUND_COUNT,
      turnTimeoutMs = DEFAULT_TURN_TIMEOUT_MS,
    }: MatchOptions = {},
  ): Match {
    if (players[0] === players[1]) {
      throw new DomainError("CONFLICT", "A player cannot play against themselves");
    }
    if (!Number.isInteger(roundCount) || roundCount < 1) {
      throw new DomainError("CONFLICT", "A match needs at least one round");
    }
    if (!Number.isInteger(turnTimeoutMs) || turnTimeoutMs < 1) {
      throw new DomainError("CONFLICT", "A turn needs a positive time limit");
    }
    // The chooser alternates, starting with the first player.
    const rounds = Array.from(
      { length: roundCount },
      (_, i) => new Round(i + 1, players[i % 2] as string),
    );
    return new Match(id, mode, difficulty, [...players], rounds, turnTimeoutMs);
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

  get turnDeadline(): Date | null {
    return this._turnDeadline;
  }

  get expiredBy(): string | null {
    return this._expiredBy;
  }

  isParticipant(playerId: string): boolean {
    return this._players.includes(playerId);
  }

  opponentOf(playerId: string): string {
    this.assertParticipant(playerId);
    return this._players.find((p) => p !== playerId) as string;
  }

  isOver(): boolean {
    return this._status === "COMPLETED" || this._status === "EXPIRED";
  }

  isOverdue(now: Date): boolean {
    return new OverdueMatch(now).isSatisfiedBy(this);
  }

  currentRound(): ReadonlyRound | undefined {
    return this.activeRound();
  }

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
    this._turnDeadline = this.deadlineFrom(now);
    this._rounds[0]?.start();
  }

  /** Checks everything `chooseCategory` checks except the questions themselves. */
  assertCanChooseCategory(playerId: string, now: Date): void {
    this.assertParticipant(playerId);
    const round = this.requirePlayableRound(now);
    if (round.chooserId !== playerId) {
      throw new DomainError("CONFLICT", "Only the chooser of this round can pick the category");
    }
    if (round.hasCategory()) {
      throw new DomainError("CONFLICT", "The category of this round is already chosen");
    }
  }

  chooseCategory(playerId: string, categoryId: string, questionIds: string[], now: Date): void {
    this.assertCanChooseCategory(playerId, now);
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
    this.requirePlayableRound(now).assignCategory(categoryId, questionIds);
  }

  /** Id of the question the player has to be shown next; checks it is their turn to answer. */
  questionToShow(playerId: string, now: Date): string {
    const round = this.requireTurnWithCategory(playerId, now);
    const questionId = round.nextQuestionIdFor(playerId);
    if (!questionId) throw new DomainError("CONFLICT", "No question left to show");
    return questionId;
  }

  /**
   * Shows the player their next question (see `questionToShow`) and starts its clock; returns
   * when it was shown. Showing it again (e.g. after a reload) does not restart the clock.
   */
  showQuestion(playerId: string, question: Question, now: Date): Date {
    if (this.questionToShow(playerId, now) !== question.id) {
      throw new DomainError("CONFLICT", "This is not your next question");
    }
    const round = this.requireCurrentRound();
    if (round.shownAt) return round.shownAt;

    round.markShown(now);
    // A question shown before the deadline can still be answered within its time limit.
    const answerableUntil = now.getTime() + question.timeLimitMs + ANSWER_GRACE_MS;
    if (this._turnDeadline && this._turnDeadline.getTime() < answerableUntil) {
      this._turnDeadline = new Date(answerableUntil);
    }
    return now;
  }

  /**
   * Records the answer to a shown question. The time needed is measured from when the question
   * was shown, and the Question decides whether the option is correct.
   */
  answer(playerId: string, question: Question, optionId: string | null, now: Date): PlayerAnswer {
    const round = this.requireTurnWithCategory(playerId, now);
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
      this.completeRound(round, now);
    }
    // The chooser of the next round answered last in this one, so the turn may stay with them;
    // the new round still reset their deadline.
    const nextPlayerId = this.whoseTurn();
    if (nextPlayerId !== null && nextPlayerId !== playerId) {
      this.passTurn(playerId, nextPlayerId, now);
    }
    return answer;
  }

  expireIfOverdue(now: Date): boolean {
    if (!this.isOverdue(now)) return false;
    const missedByPlayerId = this.whoseTurn() as string;
    this._status = "EXPIRED";
    this._expiredBy = missedByPlayerId;
    this._turnDeadline = null;
    this.recordEvent({
      type: "MatchExpired",
      version: 1,
      occurredAt: now,
      matchId: this._id,
      playerIds: [...this._players],
      scores: this.scores(),
      missedByPlayerId,
      winnerId: this.winner(),
    });
    return true;
  }

  /** Correct answers of the player; in an expired match, the answers given until then. */
  scoreOf(playerId: string): number {
    this.assertParticipant(playerId);
    return this._rounds.reduce((sum, round) => sum + round.correctCount(playerId), 0);
  }

  /**
   * The opponent's correct answers in a round as the viewer may see them: only once the viewer
   * has finished the round themselves, or the match is over. Null while hidden.
   */
  visibleOpponentCorrectCount(round: ReadonlyRound, viewerId: string): number | null {
    const opponentId = this.opponentOf(viewerId);
    return this.isOver() || round.isRevealedTo(viewerId) ? round.correctCount(opponentId) : null;
  }

  /** The opponent's score as the viewer may see it: only revealed rounds count. */
  visibleOpponentScore(viewerId: string): number {
    return this._rounds.reduce(
      (sum, round) => sum + (this.visibleOpponentCorrectCount(round, viewerId) ?? 0),
      0,
    );
  }

  /**
   * The winning player, or null while the match runs or when nobody won. A completed match is
   * won by the higher score (null on a draw); an expired one by the player who did not miss the
   * deadline, unless it expired before anyone answered a question.
   */
  winner(): string | null {
    if (this._status === "EXPIRED") {
      const hasAnyoneAnswered = this._rounds.some((round) => round.answers.length > 0);
      return hasAnyoneAnswered ? this.opponentOf(this._expiredBy as string) : null;
    }
    if (this._status !== "COMPLETED") return null;
    const [first, second] = this._players as [string, string];
    const firstScore = this.scoreOf(first);
    const secondScore = this.scoreOf(second);
    if (firstScore === secondScore) return null;
    return firstScore > secondScore ? first : second;
  }

  pullEvents(): MatchEvent[] {
    const events = this._events ?? [];
    this._events = [];
    return events;
  }

  private completeRound(round: Round, now: Date): void {
    round.complete();
    const nextRound = this._rounds.find((r) => r.number === round.number + 1);
    if (nextRound) {
      nextRound.start();
      this._turnDeadline = this.deadlineFrom(now);
      return;
    }
    this._status = "COMPLETED";
    this._turnDeadline = null;
    this.recordEvent({
      type: "MatchCompleted",
      version: 1,
      occurredAt: now,
      matchId: this._id,
      playerIds: [...this._players],
      scores: this.scores(),
      winnerId: this.winner(),
    });
  }

  private passTurn(fromPlayerId: string, toPlayerId: string, now: Date): void {
    const deadline = this.deadlineFrom(now);
    this._turnDeadline = deadline;
    this.recordEvent({
      type: "TurnPassed",
      version: 1,
      occurredAt: now,
      matchId: this._id,
      fromPlayerId,
      toPlayerId,
      roundNumber: this.requireCurrentRound().number,
      deadline,
    });
  }

  private deadlineFrom(now: Date): Date {
    return new Date(now.getTime() + this._turnTimeoutMs);
  }

  private scores(): Record<string, number> {
    return Object.fromEntries(this._players.map((p) => [p, this.scoreOf(p)]));
  }

  private recordEvent(event: NewEvent<MatchEvent>): void {
    this._events ??= [];
    this._events.push({ ...event, eventId: crypto.randomUUID() });
  }

  private activeRound(): Round | undefined {
    if (this._status !== "STARTED") return undefined;
    return this._rounds.find((round) => round.status === "STARTED");
  }

  private requireTurnWithCategory(playerId: string, now: Date): Round {
    this.assertParticipant(playerId);
    const round = this.requirePlayableRound(now);
    if (!round.hasCategory()) {
      throw new DomainError("CONFLICT", "The category of this round is not chosen yet");
    }
    if (this.whoseTurn() !== playerId) {
      throw new DomainError("CONFLICT", "It is not your turn");
    }
    return round;
  }

  private requirePlayableRound(now: Date): Round {
    const round = this.requireCurrentRound();
    // The expiry job ends the match shortly after; until then, nobody may play on.
    if (this.isOverdue(now)) {
      throw new DomainError("CONFLICT", "The turn deadline has passed");
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
