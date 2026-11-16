import { describe, expect, it } from "bun:test";
import { DomainError, FriendChallenge } from "../../src/domain";

const createdAt = new Date("2026-11-15T12:00:00Z");

describe("FriendChallenge", () => {
  it("creates a pending challenge with no response timestamp", () => {
    const challenge = FriendChallenge.create("challenge-1", "player-a", "player-b", createdAt);

    expect(challenge.status).toBe("PENDING");
    expect(challenge.createdAt).toBe(createdAt);
    expect(challenge.respondedAt).toBeNull();
  });

  it("rejects invalid IDs, players, self-challenges, and creation dates", () => {
    expect(() => FriendChallenge.create("", "player-a", "player-b", createdAt)).toThrow(
      DomainError,
    );
    expect(() => FriendChallenge.create("c1", "", "player-b", createdAt)).toThrow(DomainError);
    expect(() => FriendChallenge.create("c1", "player-a", "", createdAt)).toThrow(DomainError);
    expect(() => FriendChallenge.create("c1", "player-a", "player-a", createdAt)).toThrow(
      DomainError,
    );
    expect(() => FriendChallenge.create("c1", "player-a", "player-b", new Date(NaN))).toThrow(
      DomainError,
    );
  });

  it("allows a pending challenge to be accepted once", () => {
    const challenge = FriendChallenge.create("c1", "player-a", "player-b", createdAt);
    const respondedAt = new Date("2026-11-15T12:05:00Z");

    challenge.accept(respondedAt);

    expect(challenge.status).toBe("ACCEPTED");
    expect(challenge.respondedAt).toBe(respondedAt);
    expect(() => challenge.decline(respondedAt)).toThrow(DomainError);
  });

  it("allows a pending challenge to be declined once and rejects earlier response times", () => {
    const challenge = FriendChallenge.create("c1", "player-a", "player-b", createdAt);

    expect(() => challenge.decline(new Date(createdAt.getTime() - 1))).toThrow(DomainError);
    challenge.decline(new Date("2026-11-15T12:05:00Z"));

    expect(challenge.status).toBe("DECLINED");
    expect(challenge.respondedAt).not.toBeNull();
    expect(() => challenge.decline(new Date("2026-11-15T12:06:00Z"))).toThrow(DomainError);
  });
});
