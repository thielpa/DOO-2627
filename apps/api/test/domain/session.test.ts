import { describe, expect, it } from "bun:test";
import { DomainError, Session } from "../../src/domain";

const expiresAt = new Date("2026-11-22T12:00:00Z");

describe("Session", () => {
  it("creates an active session and omits its digest from JSON", () => {
    const session = Session.create("session-1", "player-1", "a".repeat(64), expiresAt);

    expect(session.isValidAt(new Date("2026-11-15T12:00:00Z"))).toBe(true);
    expect(JSON.stringify(session)).not.toContain("a".repeat(64));
    expect(JSON.stringify(session)).not.toContain("tokenDigest");
  });

  it("rejects invalid session fields", () => {
    expect(() => Session.create("", "player-1", "a".repeat(64), expiresAt)).toThrow(DomainError);
    expect(() => Session.create("session-1", "", "a".repeat(64), expiresAt)).toThrow(DomainError);
    expect(() => Session.create("session-1", "player-1", "not-a-digest", expiresAt)).toThrow(
      DomainError,
    );
    expect(() => Session.create("session-1", "player-1", "a".repeat(64), new Date(NaN))).toThrow(
      DomainError,
    );
  });

  it("expires at its deadline and becomes invalid after logout", () => {
    const session = Session.create("session-1", "player-1", "a".repeat(64), expiresAt);

    expect(session.isValidAt(expiresAt)).toBe(false);
    session.invalidate(new Date("2026-11-16T12:00:00Z"));
    expect(session.isValidAt(new Date("2026-11-17T12:00:00Z"))).toBe(false);
    expect(session.invalidatedAt).toEqual(new Date("2026-11-16T12:00:00Z"));
    expect(() => session.invalidate(new Date())).toThrow(DomainError);
  });
});
