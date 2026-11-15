import { describe, expect, it } from "bun:test";
import { DomainError, Lobby } from "../../src/domain";

const now = new Date("2026-01-01");

describe("Lobby", () => {
  it("opens searching with the first player", () => {
    const lobby = Lobby.open("l1", "SOLO_RANDOM", "alice", now);

    expect(lobby.status).toBe("SEARCHING");
    expect(lobby.players).toEqual(["alice"]);
    expect(lobby.createdAt).toEqual(now);
  });

  it("cannot be opened for game modes that are not supported yet", () => {
    expect(() => Lobby.open("l1", "TEAMS", "alice", now)).toThrow(DomainError);
  });

  it("becomes ready when a second player joins", () => {
    const lobby = Lobby.open("l1", "SOLO_RANDOM", "alice", now);
    lobby.join("bob");

    expect(lobby.status).toBe("READY");
    expect(lobby.players).toEqual(["alice", "bob"]);
  });

  it("does not let a player join their own lobby", () => {
    const lobby = Lobby.open("l1", "SOLO_RANDOM", "alice", now);

    expect(() => lobby.join("alice")).toThrow(DomainError);
  });

  it("does not let a third player join", () => {
    const lobby = Lobby.open("l1", "SOLO_RANDOM", "alice", now);
    lobby.join("bob");

    expect(() => lobby.join("carol")).toThrow(DomainError);
  });

  it("starts a match only once and only when ready", () => {
    const lobby = Lobby.open("l1", "SOLO_RANDOM", "alice", now);
    expect(() => lobby.start("m1")).toThrow(DomainError);

    lobby.join("bob");
    lobby.start("m1");

    expect(lobby.status).toBe("STARTED");
    expect(lobby.matchId).toBe("m1");
    expect(() => lobby.start("m2")).toThrow(DomainError);
  });
});
