import { describe, expect, it } from "bun:test";
import { AnswerOption, DomainError, Match, QUESTIONS_PER_ROUND, Question } from "../../src/domain";

const TIME_LIMIT_MS = 20_000;

/** A question whose option "ok" is correct and "no" is wrong. */
const question = (id: string) =>
  new Question(id, "food", id, "EASY", TIME_LIMIT_MS, [
    new AnswerOption("ok", "right", true),
    new AnswerOption("no", "wrong", false),
    new AnswerOption("x", "wrong", false),
    new AnswerOption("y", "wrong", false),
  ]);

const questionsOf = (round: number) =>
  Array.from({ length: QUESTIONS_PER_ROUND }, (_, i) => `r${round}q${i + 1}`);

const start = new Date("2026-01-01T00:00:00Z");
const at = (ms: number) => new Date(start.getTime() + ms);

function newMatch() {
  const match = Match.create("m1", ["alice", "bob"], "SOLO_RANDOM", "EASY");
  match.start(start);
  return match;
}

/** Shows the question to the player and answers it `afterMs` later. */
function showAndAnswer(match: Match, player: string, isCorrect: boolean, afterMs = 1_000) {
  const shown = match.showQuestion(player, start);
  return match.answer(
    player,
    question(shown.questionId),
    isCorrect ? "ok" : "no",
    at(shown.shownAt.getTime() - start.getTime() + afterMs),
  );
}

/** Plays one round: chooser picks a category and both answer; `isCorrectByPlayer` decides per player. */
function playRound(match: Match, isCorrectByPlayer: Record<string, boolean>) {
  const round = match.currentRound();
  if (!round) throw new Error("no current round");
  const chooser = round.chooserId;
  const opponent = match.opponentOf(chooser);
  match.chooseCategory(chooser, "food", questionsOf(round.number));
  for (const player of [chooser, opponent]) {
    for (let i = 0; i < QUESTIONS_PER_ROUND; i++) {
      showAndAnswer(match, player, isCorrectByPlayer[player] ?? false);
    }
  }
}

describe("Match", () => {
  it("is upcoming until it is started", () => {
    const match = Match.create("m1", ["alice", "bob"], "SOLO_RANDOM", "EASY");

    expect(match.status).toBe("UPCOMING");
    expect(match.startedAt).toBeNull();
    expect(match.whoseTurn()).toBeNull();
    expect(() => match.chooseCategory("alice", "food", questionsOf(1))).toThrow(DomainError);
  });

  it("needs at least one round", () => {
    expect(() => Match.create("m1", ["alice", "bob"], "SOLO_RANDOM", "EASY", 0)).toThrow(
      DomainError,
    );
  });

  it("can only be started once", () => {
    const match = newMatch();

    expect(match.startedAt).toEqual(start);
    expect(() => match.start(start)).toThrow(DomainError);
  });

  it("starts with round 1 and the first player as chooser", () => {
    const match = newMatch();

    expect(match.status).toBe("STARTED");
    expect(match.rounds).toHaveLength(3);
    expect(match.rounds.map((r) => r.status)).toEqual(["STARTED", "UPCOMING", "UPCOMING"]);
    expect(match.currentRound()?.number).toBe(1);
    expect(match.whoseTurn()).toBe("alice");
  });

  it("alternates the chooser between rounds", () => {
    expect(newMatch().rounds.map((r) => r.chooserId)).toEqual(["alice", "bob", "alice"]);
  });

  it("gives the turn to the opponent once the chooser answered all questions", () => {
    const match = newMatch();
    match.chooseCategory("alice", "food", questionsOf(1));
    for (let i = 0; i < QUESTIONS_PER_ROUND; i++) showAndAnswer(match, "alice", true);

    expect(match.whoseTurn()).toBe("bob");
  });

  it("moves to the next round when both players answered", () => {
    const match = newMatch();
    playRound(match, { alice: true, bob: false });

    expect(match.rounds[0]?.status).toBe("COMPLETED");
    expect(match.currentRound()?.number).toBe(2);
    expect(match.whoseTurn()).toBe("bob");
  });

  it("completes after the last round and determines the winner", () => {
    const match = newMatch();
    playRound(match, { alice: true, bob: false });
    playRound(match, { alice: true, bob: true });
    playRound(match, { alice: false, bob: false });

    expect(match.status).toBe("COMPLETED");
    expect(match.whoseTurn()).toBeNull();
    expect(match.scoreOf("alice")).toBe(2 * QUESTIONS_PER_ROUND);
    expect(match.scoreOf("bob")).toBe(QUESTIONS_PER_ROUND);
    expect(match.winner()).toBe("alice");
  });

  it("has no winner on a draw", () => {
    const match = newMatch();
    for (let i = 0; i < 3; i++) playRound(match, { alice: true, bob: true });

    expect(match.status).toBe("COMPLETED");
    expect(match.winner()).toBeNull();
  });

  it("only lets the chooser pick the category, once", () => {
    const match = newMatch();

    expect(() => match.assertCanChooseCategory("bob")).toThrow(DomainError);
    expect(() => match.chooseCategory("bob", "food", questionsOf(1))).toThrow(DomainError);
    match.chooseCategory("alice", "food", questionsOf(1));
    expect(() => match.chooseCategory("alice", "food", questionsOf(1))).toThrow(DomainError);
  });

  it("needs exactly one question per round", () => {
    const match = newMatch();

    expect(() => match.chooseCategory("alice", "food", [])).toThrow(DomainError);
    expect(() => match.chooseCategory("alice", "food", ["q1", "q2"])).toThrow(DomainError);
  });

  it("never asks a question twice in a match", () => {
    const match = newMatch();
    playRound(match, { alice: true, bob: true });

    expect(match.usedQuestionIds()).toEqual(questionsOf(1));
    expect(() => match.chooseCategory("bob", "food", questionsOf(1))).toThrow(DomainError);
  });

  it("does not let the opponent see or answer before the chooser finished", () => {
    const match = newMatch();
    match.chooseCategory("alice", "food", questionsOf(1));

    expect(() => match.showQuestion("bob", start)).toThrow(DomainError);
    expect(() => match.answer("bob", question("r1q1"), "ok", start)).toThrow(DomainError);
  });

  it("only reveals the opponent's results of rounds the viewer has finished", () => {
    const match = newMatch();
    match.chooseCategory("alice", "food", questionsOf(1));
    showAndAnswer(match, "alice", true);

    const round = match.rounds[0];
    expect(round?.visibleCorrectCountOf("alice", "bob")).toBeNull();
    expect(match.visibleOpponentScore("bob")).toBe(0);

    showAndAnswer(match, "bob", false);
    expect(round?.visibleCorrectCountOf("alice", "bob")).toBe(1);
    expect(match.visibleOpponentScore("bob")).toBe(1);
  });

  it("does not allow answering before the category is chosen", () => {
    expect(() => newMatch().answer("alice", question("r1q1"), "ok", start)).toThrow(DomainError);
  });

  it("does not allow answering a question before it was shown", () => {
    const match = newMatch();
    match.chooseCategory("alice", "food", questionsOf(1));

    expect(() => match.answer("alice", question("r1q1"), "ok", start)).toThrow(DomainError);
  });

  it("does not allow answering a question twice or one outside the round", () => {
    const match = newMatch();
    match.chooseCategory("alice", "food", questionsOf(1));
    match.showQuestion("alice", start);
    match.answer("alice", question("r1q1"), "ok", at(1_000));

    expect(() => match.answer("alice", question("r1q1"), "ok", at(2_000))).toThrow(DomainError);
    expect(() => match.answer("alice", question("other"), "ok", at(2_000))).toThrow(DomainError);
  });

  it("measures the time needed itself, from when the question was shown", () => {
    const match = newMatch();
    match.chooseCategory("alice", "food", questionsOf(1));
    match.showQuestion("alice", at(5_000));
    // Showing it again (e.g. after a reload) does not restart the clock.
    expect(match.showQuestion("alice", at(9_000)).shownAt).toEqual(at(5_000));

    const answer = match.answer("alice", question("r1q1"), "ok", at(12_000));

    expect(answer.timeNeededMs).toBe(7_000);
    expect(answer.isCorrect).toBe(true);
  });

  it("counts a correct option given after the time limit as wrong", () => {
    const match = newMatch();
    match.chooseCategory("alice", "food", questionsOf(1));

    const answer = showAndAnswer(match, "alice", true, TIME_LIMIT_MS + 60_000);

    expect(answer.isCorrect).toBe(false);
  });

  it("rejects players who are not part of the match", () => {
    const match = newMatch();

    expect(() => match.chooseCategory("carol", "food", questionsOf(1))).toThrow(
      expect.objectContaining({ code: "NOT_ALLOWED" }),
    );
  });

  it("cannot be played after completion", () => {
    const match = newMatch();
    for (let i = 0; i < 3; i++) playRound(match, {});

    expect(() => match.chooseCategory("alice", "food", questionsOf(4))).toThrow(DomainError);
  });

  it("hands out rounds without their mutating methods", () => {
    const match = newMatch();
    // Checked by the type checker: code outside Match cannot change a round.
    // @ts-expect-error `assignCategory` is not part of ReadonlyRound
    const tryToChange = () => match.rounds[0]?.assignCategory("food", ["sneaky"]);

    expect(tryToChange).toBeFunction();
    expect(match.rounds[0]?.hasCategory()).toBe(false);
  });
});
