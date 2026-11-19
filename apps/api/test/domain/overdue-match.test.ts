import { describe, expect, it } from "bun:test";
import { Match, OverdueMatch } from "../../src/domain";

const TURN_TIMEOUT_MS = 60 * 60 * 1000;
const start = new Date("2026-01-01T00:00:00Z");
const at = (ms: number) => new Date(start.getTime() + ms);

function newMatch() {
  return Match.create("m1", ["alice", "bob"], "SOLO_RANDOM", "EASY", {
    turnTimeoutMs: TURN_TIMEOUT_MS,
  });
}

function startedMatch() {
  const match = newMatch();
  match.start(start);
  return match;
}

describe("OverdueMatch", () => {
  it("is not satisfied before the deadline", () => {
    expect(new OverdueMatch(at(TURN_TIMEOUT_MS - 1)).isSatisfiedBy(startedMatch())).toBe(false);
  });

  it("is satisfied exactly at the deadline", () => {
    expect(new OverdueMatch(at(TURN_TIMEOUT_MS)).isSatisfiedBy(startedMatch())).toBe(true);
  });

  it("is satisfied after the deadline", () => {
    expect(new OverdueMatch(at(10 * TURN_TIMEOUT_MS)).isSatisfiedBy(startedMatch())).toBe(true);
  });

  it("is not satisfied by a match that has not started (no deadline yet)", () => {
    expect(new OverdueMatch(at(10 * TURN_TIMEOUT_MS)).isSatisfiedBy(newMatch())).toBe(false);
  });

  it("is not satisfied by a match that already expired", () => {
    const match = startedMatch();
    match.expireIfOverdue(at(TURN_TIMEOUT_MS));

    expect(match.status).toBe("EXPIRED");
    expect(new OverdueMatch(at(10 * TURN_TIMEOUT_MS)).isSatisfiedBy(match)).toBe(false);
  });

  it("is the rule the match uses itself", () => {
    const match = startedMatch();

    expect(match.isOverdue(at(TURN_TIMEOUT_MS))).toBe(true);
    expect(match.isOverdue(at(TURN_TIMEOUT_MS - 1))).toBe(false);
  });
});
