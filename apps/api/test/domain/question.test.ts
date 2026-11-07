import { describe, expect, it } from "bun:test";
import { ANSWER_GRACE_MS, AnswerOption, DomainError, Question } from "../../src/domain";

const question = new Question("q1", "food", "das Brot", "EASY", 20_000, [
  new AnswerOption("a", "bread", true),
  new AnswerOption("b", "butter", false),
  new AnswerOption("c", "cheese", false),
  new AnswerOption("d", "milk", false),
]);

describe("Question", () => {
  it("computes the remaining time from when it was shown, never below zero", () => {
    const shownAt = new Date("2026-01-01T00:00:00Z");
    const after = (ms: number) => new Date(shownAt.getTime() + ms);

    expect(question.remainingMs(shownAt, after(5_000))).toBe(15_000);
    expect(question.remainingMs(shownAt, after(30_000))).toBe(0);
  });

  it("accepts the correct option within the time limit", () => {
    expect(question.isCorrectAnswer("a", 5_000)).toBe(true);
  });

  it("rejects a wrong option", () => {
    expect(question.isCorrectAnswer("b", 5_000)).toBe(false);
  });

  it("still accepts a correct option within the grace period after the time limit", () => {
    expect(question.isCorrectAnswer("a", 20_000 + ANSWER_GRACE_MS)).toBe(true);
  });

  it("counts a correct option after the time limit and grace period as wrong", () => {
    expect(question.isCorrectAnswer("a", 20_001 + ANSWER_GRACE_MS)).toBe(false);
  });

  it("counts a timeout without an option as wrong", () => {
    expect(question.isCorrectAnswer(null, 20_000)).toBe(false);
  });

  it("rejects an option of another question", () => {
    expect(() => question.isCorrectAnswer("x", 1)).toThrow(DomainError);
  });

  it("needs exactly one correct option", () => {
    expect(
      () =>
        new Question("q2", "food", "?", "EASY", 1, [
          new AnswerOption("a", "1", true),
          new AnswerOption("b", "2", true),
          new AnswerOption("c", "3", false),
          new AnswerOption("d", "4", false),
        ]),
    ).toThrow(DomainError);
  });

  it("needs exactly four options", () => {
    expect(
      () =>
        new Question("q2", "food", "?", "EASY", 1, [
          new AnswerOption("a", "1", true),
          new AnswerOption("b", "2", false),
        ]),
    ).toThrow(DomainError);
  });
});
