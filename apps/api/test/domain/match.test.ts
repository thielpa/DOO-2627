import { describe, expect, it } from "bun:test";
import {
  AnswerOption,
  DomainError,
  Match,
  type MatchEvent,
  QUESTIONS_PER_ROUND,
  Question,
} from "../../src/domain";

const TIME_LIMIT_MS = 20_000;
const TURN_TIMEOUT_MS = 60 * 60 * 1000;

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
  const match = Match.create("m1", ["alice", "bob"], "SOLO_RANDOM", "EASY", {
    turnTimeoutMs: TURN_TIMEOUT_MS,
  });
  match.start(start);
  return match;
}

/** Shows the next question to the player at `now` and answers it `afterMs` later. */
function showAndAnswer(match: Match, player: string, isCorrect: boolean, now = start, afterMs = 1) {
  const shownQuestion = question(match.questionToShow(player, now));
  const shownAt = match.showQuestion(player, shownQuestion, now);
  return match.answer(
    player,
    shownQuestion,
    isCorrect ? "ok" : "no",
    new Date(shownAt.getTime() + afterMs),
  );
}

/** Answers all of the player's remaining questions of the current round at `now`. */
function answerAll(match: Match, player: string, isCorrect: boolean, now = start) {
  while (match.whoseTurn() === player && match.currentRound()?.nextQuestionIdFor(player)) {
    showAndAnswer(match, player, isCorrect, now);
  }
}

/** Plays one round: chooser picks a category and both answer; `isCorrectByPlayer` decides per player. */
function playRound(match: Match, isCorrectByPlayer: Record<string, boolean>, now = start) {
  const round = match.currentRound();
  if (!round) throw new Error("no current round");
  const chooser = round.chooserId;
  const opponent = match.opponentOf(chooser);
  match.chooseCategory(chooser, "food", questionsOf(round.number), now);
  answerAll(match, chooser, isCorrectByPlayer[chooser] ?? false, now);
  answerAll(match, opponent, isCorrectByPlayer[opponent] ?? false, now);
}

const typesOf = (events: MatchEvent[]) => events.map((e) => e.type);

describe("Match", () => {
  it("is upcoming until it is started", () => {
    const match = Match.create("m1", ["alice", "bob"], "SOLO_RANDOM", "EASY");

    expect(match.status).toBe("UPCOMING");
    expect(match.startedAt).toBeNull();
    expect(match.turnDeadline).toBeNull();
    expect(match.whoseTurn()).toBeNull();
    expect(() => match.chooseCategory("alice", "food", questionsOf(1), start)).toThrow(DomainError);
  });

  it("needs at least one round and a positive turn time limit", () => {
    const create = (roundCount: number, turnTimeoutMs?: number) => () =>
      Match.create("m1", ["alice", "bob"], "SOLO_RANDOM", "EASY", { roundCount, turnTimeoutMs });

    expect(create(0)).toThrow(DomainError);
    expect(create(3, 0)).toThrow(DomainError);
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

  it("keeps the turn with the chooser until they answered all questions of the round", () => {
    const match = newMatch();
    match.chooseCategory("alice", "food", questionsOf(1), start);
    for (let i = 1; i < QUESTIONS_PER_ROUND; i++) {
      showAndAnswer(match, "alice", true);
      expect(match.whoseTurn()).toBe("alice");
    }

    showAndAnswer(match, "alice", true);
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
    expect(match.turnDeadline).toBeNull();
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

    expect(() => match.assertCanChooseCategory("bob", start)).toThrow(DomainError);
    expect(() => match.chooseCategory("bob", "food", questionsOf(1), start)).toThrow(DomainError);
    match.chooseCategory("alice", "food", questionsOf(1), start);
    expect(() => match.chooseCategory("alice", "food", questionsOf(1), start)).toThrow(DomainError);
  });

  it(`needs exactly ${QUESTIONS_PER_ROUND} different questions per round`, () => {
    const match = newMatch();
    const choose = (ids: string[]) => () => match.chooseCategory("alice", "food", ids, start);

    expect(choose([])).toThrow(DomainError);
    expect(choose(questionsOf(1).slice(1))).toThrow(DomainError);
    expect(choose([...questionsOf(1), "extra"])).toThrow(DomainError);
    expect(choose(["q1", "q1", "q2"])).toThrow(DomainError);
  });

  it("never asks a question twice in a match", () => {
    const match = newMatch();
    playRound(match, { alice: true, bob: true });

    expect(match.usedQuestionIds()).toEqual(questionsOf(1));
    expect(() => match.chooseCategory("bob", "food", questionsOf(1), start)).toThrow(DomainError);
  });

  it("does not let the opponent see or answer before the chooser finished", () => {
    const match = newMatch();
    match.chooseCategory("alice", "food", questionsOf(1), start);

    expect(() => match.showQuestion("bob", question("r1q1"), start)).toThrow(DomainError);
    expect(() => match.answer("bob", question("r1q1"), "ok", start)).toThrow(DomainError);
  });

  it("only reveals the opponent's results of rounds the viewer has finished", () => {
    const match = newMatch();
    match.chooseCategory("alice", "food", questionsOf(1), start);
    answerAll(match, "alice", true);
    const round = match.rounds[0];
    if (!round) throw new Error("no round");

    expect(match.visibleOpponentCorrectCount(round, "bob")).toBeNull();
    expect(match.visibleOpponentScore("bob")).toBe(0);

    // Halfway through the round, alice's results stay hidden from bob.
    showAndAnswer(match, "bob", false);
    expect(match.visibleOpponentCorrectCount(round, "bob")).toBeNull();

    answerAll(match, "bob", false);
    expect(match.visibleOpponentCorrectCount(round, "bob")).toBe(QUESTIONS_PER_ROUND);
    expect(match.visibleOpponentScore("bob")).toBe(QUESTIONS_PER_ROUND);
  });

  it("does not allow answering before the category is chosen", () => {
    expect(() => newMatch().answer("alice", question("r1q1"), "ok", start)).toThrow(DomainError);
  });

  it("shows the questions of a round one after another", () => {
    const match = newMatch();
    match.chooseCategory("alice", "food", questionsOf(1), start);

    const shownIds = Array.from(
      { length: QUESTIONS_PER_ROUND },
      () => showAndAnswer(match, "alice", true).questionId,
    );

    expect(shownIds).toEqual(questionsOf(1));
  });

  it("does not allow answering a question before it was shown", () => {
    const match = newMatch();
    match.chooseCategory("alice", "food", questionsOf(1), start);

    expect(() => match.answer("alice", question("r1q1"), "ok", start)).toThrow(DomainError);
  });

  it("does not allow answering a question twice or one outside the round", () => {
    const match = newMatch();
    match.chooseCategory("alice", "food", questionsOf(1), start);
    match.showQuestion("alice", question("r1q1"), start);
    match.answer("alice", question("r1q1"), "ok", at(1_000));
    match.showQuestion("alice", question("r1q2"), at(2_000));

    expect(() => match.answer("alice", question("r1q1"), "ok", at(3_000))).toThrow(DomainError);
    expect(() => match.answer("alice", question("other"), "ok", at(3_000))).toThrow(DomainError);
  });

  it("measures the time needed itself, from when the question was shown", () => {
    const match = newMatch();
    match.chooseCategory("alice", "food", questionsOf(1), start);
    match.showQuestion("alice", question("r1q1"), at(5_000));
    // Showing it again (e.g. after a reload) does not restart the clock.
    expect(match.showQuestion("alice", question("r1q1"), at(9_000))).toEqual(at(5_000));

    const answer = match.answer("alice", question("r1q1"), "ok", at(12_000));

    expect(answer.timeNeededMs).toBe(7_000);
    expect(answer.isCorrect).toBe(true);
  });

  it("counts a correct option given after the time limit as wrong", () => {
    const match = newMatch();
    match.chooseCategory("alice", "food", questionsOf(1), start);

    const answer = showAndAnswer(match, "alice", true, start, TIME_LIMIT_MS + 60_000);

    expect(answer.isCorrect).toBe(false);
  });

  it("rejects players who are not part of the match", () => {
    const match = newMatch();

    expect(() => match.chooseCategory("carol", "food", questionsOf(1), start)).toThrow(
      expect.objectContaining({ code: "NOT_ALLOWED" }),
    );
  });

  it("cannot be played after completion", () => {
    const match = newMatch();
    for (let i = 0; i < 3; i++) playRound(match, {});

    expect(() => match.chooseCategory("alice", "food", questionsOf(4), start)).toThrow(DomainError);
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

describe("Match turn deadline", () => {
  it("gives the first player the turn time limit from the start", () => {
    expect(newMatch().turnDeadline).toEqual(at(TURN_TIMEOUT_MS));
  });

  it("resets the deadline when the turn goes to the other player", () => {
    const match = newMatch();
    const passedAt = at(TURN_TIMEOUT_MS - 1_000);
    match.chooseCategory("alice", "food", questionsOf(1), passedAt);
    answerAll(match, "alice", true, passedAt);

    expect(match.whoseTurn()).toBe("bob");
    expect(match.turnDeadline?.getTime()).toBeGreaterThan(passedAt.getTime() + TURN_TIMEOUT_MS);
  });

  it("does not reset the deadline while a player is still in their turn", () => {
    const match = newMatch();
    match.chooseCategory("alice", "food", questionsOf(1), at(1_000));
    showAndAnswer(match, "alice", true, at(2_000));

    expect(match.turnDeadline).toEqual(at(TURN_TIMEOUT_MS));
  });

  it("resets the deadline when the same player goes on with the next round", () => {
    const match = newMatch();
    match.chooseCategory("alice", "food", questionsOf(1), start);
    answerAll(match, "alice", true, start);

    // Bob finishes round 1 shortly before his deadline and chooses round 2 himself.
    const finishedAt = at(TURN_TIMEOUT_MS - 60_000);
    answerAll(match, "bob", true, finishedAt);

    expect(match.currentRound()?.number).toBe(2);
    expect(match.whoseTurn()).toBe("bob");
    // Reset from bob's last answer, not left at the deadline he got when the turn passed to him.
    expect(match.turnDeadline?.getTime()).toBeGreaterThan(finishedAt.getTime() + TURN_TIMEOUT_MS);
  });

  it("extends the deadline so a question shown just before it can still be answered", () => {
    const match = newMatch();
    match.chooseCategory("alice", "food", questionsOf(1), start);
    const shownAt = at(TURN_TIMEOUT_MS - 5_000);
    match.showQuestion("alice", question("r1q1"), shownAt);

    // The time limit runs out after the original deadline; the timeout answer still counts.
    const answeredAt = new Date(shownAt.getTime() + TIME_LIMIT_MS);
    expect(match.isOverdue(answeredAt)).toBe(false);
    expect(match.answer("alice", question("r1q1"), null, answeredAt).isCorrect).toBe(false);
  });

  it("does not shorten the deadline when showing a question", () => {
    const match = newMatch();
    match.chooseCategory("alice", "food", questionsOf(1), start);
    match.showQuestion("alice", question("r1q1"), start);

    expect(match.turnDeadline).toEqual(at(TURN_TIMEOUT_MS));
  });

  it("only shows the player's next question", () => {
    const match = newMatch();
    match.chooseCategory("alice", "food", questionsOf(1), start);

    expect(() => match.showQuestion("alice", question("r1q2"), start)).toThrow(
      "This is not your next question",
    );
  });

  it("rejects every move once the deadline has passed", () => {
    const match = newMatch();
    match.chooseCategory("alice", "food", questionsOf(1), start);
    const late = at(TURN_TIMEOUT_MS);

    expect(match.isOverdue(late)).toBe(true);
    expect(() => match.showQuestion("alice", question("r1q1"), late)).toThrow(
      "The turn deadline has passed",
    );
    expect(() => match.answer("alice", question("r1q1"), "ok", late)).toThrow(DomainError);
    expect(() => newMatch().chooseCategory("alice", "food", questionsOf(1), late)).toThrow(
      "The turn deadline has passed",
    );
  });
});

describe("Match expiry", () => {
  const late = at(TURN_TIMEOUT_MS);

  it("does not expire before the deadline", () => {
    const match = newMatch();

    expect(match.expireIfOverdue(at(TURN_TIMEOUT_MS - 1))).toBe(false);
    expect(match.status).toBe("STARTED");
    expect(match.pullEvents()).toEqual([]);
  });

  it("has no winner when it expires before anyone answered", () => {
    const match = newMatch();
    // Choosing a category alone does not count as playing.
    match.chooseCategory("alice", "food", questionsOf(1), start);

    expect(match.expireIfOverdue(late)).toBe(true);

    expect(match.status).toBe("EXPIRED");
    expect(match.isOver()).toBe(true);
    expect(match.expiredBy).toBe("alice");
    expect(match.winner()).toBeNull();
    expect(match.turnDeadline).toBeNull();
    expect(match.whoseTurn()).toBeNull();
  });

  it("is lost by the player who missed the deadline mid-round, even when ahead", () => {
    const match = newMatch();
    playRound(match, { alice: false, bob: true });
    // Bob chose round 2 and answered one question, then stopped playing.
    match.chooseCategory("bob", "food", questionsOf(2), start);
    showAndAnswer(match, "bob", true);

    expect(match.expireIfOverdue(at(2 * TURN_TIMEOUT_MS))).toBe(true);

    expect(match.expiredBy).toBe("bob");
    expect(match.winner()).toBe("alice");
    // The scores count the answers given until then; the winner does not depend on them.
    expect(match.scoreOf("bob")).toBe(QUESTIONS_PER_ROUND + 1);
    expect(match.scoreOf("alice")).toBe(0);
  });

  it("is lost by the opponent who missed the deadline after the chooser's last answer", () => {
    const match = newMatch();
    match.chooseCategory("alice", "food", questionsOf(1), start);
    answerAll(match, "alice", false, start);

    // The deadline was reset with alice's last answer, so the original one does not count.
    expect(match.expireIfOverdue(late)).toBe(false);
    expect(match.expireIfOverdue(at(2 * TURN_TIMEOUT_MS))).toBe(true);

    expect(match.expiredBy).toBe("bob");
    expect(match.winner()).toBe("alice");
  });

  it("reveals all results once it expired", () => {
    const match = newMatch();
    match.chooseCategory("alice", "food", questionsOf(1), start);
    answerAll(match, "alice", true, start);
    const round = match.rounds[0];
    if (!round) throw new Error("no round");
    expect(match.visibleOpponentCorrectCount(round, "bob")).toBeNull();

    match.expireIfOverdue(at(2 * TURN_TIMEOUT_MS));

    expect(match.visibleOpponentCorrectCount(round, "bob")).toBe(QUESTIONS_PER_ROUND);
    expect(match.visibleOpponentScore("bob")).toBe(QUESTIONS_PER_ROUND);
  });

  it("only expires once", () => {
    const match = newMatch();
    match.expireIfOverdue(late);
    match.pullEvents();

    expect(match.expireIfOverdue(at(2 * TURN_TIMEOUT_MS))).toBe(false);
    expect(match.status).toBe("EXPIRED");
    expect(match.pullEvents()).toEqual([]);
  });

  it("never expires once completed", () => {
    const match = newMatch();
    for (let i = 0; i < 3; i++) playRound(match, { alice: true });

    expect(match.expireIfOverdue(at(10 * TURN_TIMEOUT_MS))).toBe(false);
    expect(match.status).toBe("COMPLETED");
    expect(match.winner()).toBe("alice");
  });

  it("cannot be played after expiry", () => {
    const match = newMatch();
    match.expireIfOverdue(late);

    expect(() => match.chooseCategory("alice", "food", questionsOf(1), late)).toThrow(
      "The match is not running",
    );
  });
});

describe("Match events", () => {
  it("records TurnPassed only when the turn goes to the other player", () => {
    const match = newMatch();
    match.chooseCategory("alice", "food", questionsOf(1), start);
    showAndAnswer(match, "alice", true, at(1_000));
    expect(match.pullEvents()).toEqual([]);

    answerAll(match, "alice", true, at(2_000));
    const events = match.pullEvents();

    expect(events).toEqual([
      {
        eventId: expect.any(String),
        type: "TurnPassed",
        version: 1,
        occurredAt: at(2_001),
        matchId: "m1",
        fromPlayerId: "alice",
        toPlayerId: "bob",
        roundNumber: 1,
        deadline: at(2_001 + TURN_TIMEOUT_MS),
      },
    ]);
    // Bob finishes round 1 and goes on choosing round 2: no turn change.
    answerAll(match, "bob", true, at(3_000));
    expect(match.pullEvents()).toEqual([]);
  });

  it("records MatchCompleted with the scores and the winner", () => {
    const match = newMatch();
    playRound(match, { alice: true, bob: false });
    playRound(match, { alice: true, bob: false });
    match.pullEvents();
    playRound(match, { alice: false, bob: false }, at(5_000));

    const events = match.pullEvents();

    expect(typesOf(events)).toEqual(["TurnPassed", "MatchCompleted"]);
    expect(events[1]).toEqual({
      eventId: expect.any(String),
      type: "MatchCompleted",
      version: 1,
      occurredAt: at(5_001),
      matchId: "m1",
      playerIds: ["alice", "bob"],
      scores: { alice: 2 * QUESTIONS_PER_ROUND, bob: 0 },
      winnerId: "alice",
    });
  });

  it("records MatchExpired with who missed the deadline", () => {
    const match = newMatch();
    match.chooseCategory("alice", "food", questionsOf(1), start);
    answerAll(match, "alice", true, start);
    match.pullEvents();
    const late = at(2 * TURN_TIMEOUT_MS);

    match.expireIfOverdue(late);

    expect(match.pullEvents()).toEqual([
      {
        eventId: expect.any(String),
        type: "MatchExpired",
        version: 1,
        occurredAt: late,
        matchId: "m1",
        playerIds: ["alice", "bob"],
        scores: { alice: QUESTIONS_PER_ROUND, bob: 0 },
        missedByPlayerId: "bob",
        winnerId: "alice",
      },
    ]);
  });

  it("gives every event its own id", () => {
    const match = newMatch();
    playRound(match, { alice: true, bob: true });
    playRound(match, { alice: true, bob: true });
    playRound(match, { alice: true, bob: true });

    const ids = match.pullEvents().map((e) => e.eventId);

    expect(ids.length).toBeGreaterThan(1);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("hands out each event only once", () => {
    const match = newMatch();
    match.expireIfOverdue(at(TURN_TIMEOUT_MS));

    expect(typesOf(match.pullEvents())).toEqual(["MatchExpired"]);
    expect(match.pullEvents()).toEqual([]);
  });
});
