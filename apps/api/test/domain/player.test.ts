import { describe, expect, it } from "bun:test";
import { DomainError, Player } from "../../src/domain";

describe("Player", () => {
  it("creates a player with an ID, username, and password hash", () => {
    const player = Player.create("player-1", "alice", "argon-hash");

    expect(player.id).toBe("player-1");
    expect(player.username).toBe("alice");
    expect(player.passwordHash).toBe("argon-hash");
  });

  it("rejects an empty ID", () => {
    expect(() => Player.create("", "alice", "argon-hash")).toThrow(DomainError);
  });

  it("rejects an empty username", () => {
    expect(() => Player.create("player-1", "", "argon-hash")).toThrow(DomainError);
  });

  it("rejects an empty password hash", () => {
    expect(() => Player.create("player-1", "alice", "")).toThrow(DomainError);
  });

  it("serializes only the public player fields", () => {
    const player = Player.create("player-1", "alice", "private-argon-hash");

    expect(JSON.stringify(player)).toBe('{"id":"player-1","username":"alice"}');
    expect(JSON.stringify(player)).not.toContain("private-argon-hash");
  });
});
